import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'

test('Passerelle : autorisations serveur, télémétrie, commande unique et acquittement en mémoire',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'floreol-contract-'))
 const settings={DATA_DIR:dir,DEVICE_ID:'test-banc',ALLOWED_ORIGIN:'https://localhost',TLS_CERT:'unused',TLS_KEY:'unused'}
 for(const role of ['DEVICE','VIEWER','OPERATOR','ADMIN'])settings[role+'_TOKEN']=randomUUID()
 const old=new Map(Object.keys(settings).map(key=>[key,process.env[key]]))
 Object.assign(process.env,settings)
 try{
  const {handleRequest}=await import('../backend/server.mjs')
  async function request(path,token,data){
   const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[])
   Object.assign(req,{url:path,method:data?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token}})
   let payload
   const res={statusCode:0,setHeader(){},end(body){payload=JSON.parse(body)}}
   await handleRequest(req,res)
   return {status:res.statusCode,payload}
  }
  const {DEVICE_TOKEN:device,VIEWER_TOKEN:viewer,OPERATOR_TOKEN:operator}=settings
  assert.equal((await request('/api/status','invalid')).status,401)
  const cmd={deviceId:settings.DEVICE_ID,id:randomUUID(),action:'start',minutes:10,confirmed:true}
  assert.equal((await request('/api/commands',viewer,cmd)).status,403)
  assert.equal((await request('/api/commands',operator,cmd)).status,409)
  const reading={deviceId:settings.DEVICE_ID,at:Date.now(),capacityL:500,volumeL:420,flowLmin:0,panelV:24,panelA:1.1,ready:true,pumpOn:false,interlocksOk:true}
  assert.equal((await request('/api/device/telemetry',device,{...reading,at:Date.now()-20000})).status,422)
  assert.equal((await request('/api/device/telemetry',device,reading)).status,200)
  assert.equal((await request('/api/commands',operator,{...cmd,confirmed:false})).status,422)
  assert.equal((await request('/api/commands',operator,cmd)).status,202)
  assert.equal((await request('/api/commands',operator,cmd)).status,200)
  assert.equal((await request('/api/device/next',device)).payload.command.id,cmd.id)
  assert.equal((await request('/api/device/ack',device,{id:cmd.id,status:'applied'})).status,200)
  assert.equal((await request('/api/commands/'+cmd.id,operator)).payload.status,'applied')
 }finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;await rm(dir,{force:true,recursive:true})}
})
