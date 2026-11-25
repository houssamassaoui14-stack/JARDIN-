// Optional single-device HTTPS gateway. Start after supplying private host-side settings.
import {generateExplanation} from './assistant.mjs'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:https'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, appendFileSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
const env=process.env
const names=['TLS_CERT','TLS_KEY','ALLOWED_ORIGIN','DEVICE_ID','DEVICE_TOKEN','OPERATOR_TOKEN','ADMIN_TOKEN','VIEWER_TOKEN','DATA_DIR']
for (const name of names) if(!env[name]) throw Error('Paramètre privé manquant · '+name)
const roles=['viewer','operator','admin','device']
const secrets=roles.map(role=>env[role.toUpperCase()+'_TOKEN'])
if(new Set(secrets).size!==4||secrets.some(v=>v.length<32)) throw Error('Quatre identifiants privés distincts d’au moins 32 caractères sont requis.')
const origin=new URL(env.ALLOWED_ORIGIN).origin
if(!origin.startsWith('https://')) throw Error('Origine HTTPS requise.')
const digest=t=>createHash('sha256').update(t).digest()
const hashes=secrets.map(digest),dir=resolve(env.DATA_DIR)
mkdirSync(dir,{recursive:true,mode:0o700})
const history=join(dir,'events.ndjson'),commandsFile=join(dir,'commands.json')
let commands=existsSync(commandsFile)?JSON.parse(readFileSync(commandsFile,'utf8')):[]
let telemetry=null, lastExplanation=0
function save(){
  writeFileSync(commandsFile+'.tmp',JSON.stringify(commands),{mode:0o600})
  renameSync(commandsFile+'.tmp',commandsFile)
}
// A restart cannot revive a pending remote start.
for (const cmd of commands) if(cmd.status==='pending') cmd.status='expired'
save()
function log(kind,data){appendFileSync(history,JSON.stringify({at:Date.now(),kind,data})+'\n',{mode:0o600})}
const safe=(v)=>Number.isFinite(v)&&v>=0
function valid(t){
  return t && t.deviceId===env.DEVICE_ID && safe(t.at) && Date.now()-t.at<=15000 && t.at-Date.now()<=1000 &&
    safe(t.capacityL)&&t.capacityL>0&&safe(t.volumeL)&&t.volumeL<=t.capacityL&&safe(t.flowLmin)&&safe(t.panelV)&&safe(t.panelA)&&
    ['ready','interlocksOk','pumpOn'].every(k=>typeof t[k]==='boolean')
}
function reject(code){throw Object.assign(new Error(),{code})}
export async function handleRequest(req,res){
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('Vary','Origin')
  const send=(code,value)=>{res.statusCode=code;res.end(JSON.stringify(value))}
  try{
    if(req.headers.origin&&req.headers.origin!==origin) reject(403)
    if(req.headers.origin===origin) {
      res.setHeader('Access-Control-Allow-Origin',origin)
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
    }
    if(req.method==='OPTIONS')return send(200,{})
    const header=req.headers.authorization||''
    const token=header.startsWith('Bearer ')?header.slice(7):''
    const hash=digest(token),role=roles[hashes.findIndex(v=>timingSafeEqual(v,hash))]
    if(!role)reject(401)
    const path=req.url.split('?')[0],method=req.method
    let body=null
    if(method==='POST'){
      if(!(req.headers['content-type']||'').startsWith('application/json'))reject(415)
      let size=0,parts=[]
      for await(const chunk of req){size+=chunk.length;if(size>8192)reject(413);parts.push(chunk)}
      try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{reject(400)}
      if(!body || typeof body!=='object')reject(400)
    }
    const stale=commands.filter(c=>c.status==='pending'&&c.expiresAt<=Date.now())
    if(stale.length){for(const c of stale)c.status='expired';save()}
    if(path==='/api/device/telemetry'&&method==='POST'){
      if(role!=='device')reject(403)
      if(!valid(body)||(telemetry&&body.at<=telemetry.at))reject(422)
      telemetry=Object.fromEntries(['deviceId','at','capacityL','volumeL','flowLmin','panelV','panelA','ready','interlocksOk','pumpOn'].map(k=>[k,body[k]]))
      log('telemetry',telemetry)
      return send(200,{received:true})
    }
    if(path==='/api/device/next'&&method==='GET'){
      if(role!=='device')reject(403)
      return send(200,{command:commands.find(c=>c.status==='pending')||null})
    }
    if(path==='/api/device/ack'&&method==='POST'){
      if(role!=='device')reject(403)
      const cmd=commands.find(c=>c.id===body.id)
      if(!cmd||!['applied','refused'].includes(body.status))reject(422)
      if(cmd.status==='pending'){cmd.status=body.status;save();log('ack',{id:cmd.id,status:cmd.status})}
      return send(200,{status:cmd.status})
    }
    if(role==='device')reject(403)
    if(path==='/api/assistant'&&method==='POST'){
      if(!['admin','operator'].includes(role))reject(403)
      if(!env.LLM_API_KEY||!env.LLM_MODEL||!env.LLM_URL)reject(503)
      if(Date.now()-lastExplanation<5000)reject(429)
      lastExplanation=Date.now()
      const answer=await generateExplanation(body.question,body.context)
      return send(200,{answer})
    }
    if(path==='/api/status'&&method==='GET')return send(200,{role,telemetry:valid(telemetry)?telemetry:null})
    if(path==='/api/commands'&&method==='POST'){
      if(!['admin','operator'].includes(role))reject(403)
      if(body.confirmed!==true||body.deviceId!==env.DEVICE_ID||typeof body.id!=='string'||
        !/^[a-f\d-]{36}$/i.test(body.id)||!['start','stop'].includes(body.action)||
        (body.action==='start'&&(!safe(body.minutes)||body.minutes<=0||body.minutes>120)))reject(422)
      const existing=commands.find(c=>c.id===body.id)
      if(existing)return send(200,{id:existing.id,status:existing.status})
      if(!valid(telemetry)||(body.action==='start'&&(!telemetry.ready||!telemetry.interlocksOk||telemetry.pumpOn)))reject(409)
      if(body.action==='start'&&commands.some(c=>c.status==='pending'))reject(409)
      if(body.action==='stop') for(const c of commands)if(c.status==='pending'&&c.action==='start')c.status='refused'
      const cmd={id:body.id,deviceId:env.DEVICE_ID,action:body.action,minutes:body.action==='stop'?0:body.minutes,
        issuedAt:Date.now(),expiresAt:Date.now()+10000,status:'pending'}
      commands.push(cmd);commands=commands.slice(-5000);save();log('command',cmd)
      return send(202,{id:cmd.id,status:cmd.status})
    }
    if(path.startsWith('/api/commands/')&&method==='GET'){
      const cmd=commands.find(c=>c.id===path.slice('/api/commands/'.length))
      if(!cmd)reject(404)
      return send(200,{id:cmd.id,status:cmd.status})
    }
    reject(404)
  }catch(error){send(Number.isInteger(error.code)?error.code:500,{error:'Requête non aboutie.'})}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const server=createServer({cert:readFileSync(env.TLS_CERT),key:readFileSync(env.TLS_KEY),minVersion:'TLSv1.2'},handleRequest)
server.requestTimeout=10000
server.headersTimeout=10000
server.listen(Number(env.PORT||8443),env.BIND_HOST||'127.0.0.1',()=>console.log('Passerelle HTTPS Floréol prête.'))
}
