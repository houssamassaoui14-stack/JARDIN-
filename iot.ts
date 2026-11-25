import { engine, derive } from './engine.ts'

export interface Telemetry {
  deviceId:string
  at:number
  volumeL:number
  capacityL:number
  pumpOn:boolean
  ready:boolean
  interlocksOk:boolean
  flowLmin:number
  panelV:number
  panelA:number
}
export interface Reading {
  mode:'demo'|'connected'|'offline'
  label:string
  at:number|null
  volumeL:number|null
  pvW:number|null
  pumpOn:boolean|null
  controlsAvailable:boolean
}
export interface InstallationService {
  read():Promise<Reading>
  command(action:'start'|'stop',minutes:number,confirmed:boolean):Promise<string>
}
export const disconnected:Reading={mode:'offline',label:'ESP32 non connecté',at:null,
  volumeL:null,pvW:null,pumpOn:null,controlsAvailable:false}
export const demonstration:InstallationService={
  async read(){
    const s=engine.getSnapshot(),d=derive(s)
    return {mode:'demo',label:'Mode démonstration — données simulées',at:s.now,
      volumeL:s.volumeL,pvW:d.pvW,pumpOn:!!s.active,controlsAvailable:true}
  },
  async command(action,minutes,confirmed){
    if(!confirmed) throw Error('Confirmer la commande.')
    const error=action==='start'?engine.start(minutes):engine.stop()
    if(error) throw Error(error)
    return 'Commande exécutée dans la démonstration.'
  },
}
const num=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0
export function validTelemetry(t:Telemetry,deviceId:string,now=Date.now()) {
  return t && t.deviceId===deviceId && num(t.at) && now-t.at>=-1000 && now-t.at<=15000 &&
    num(t.capacityL)&&t.capacityL>0&&num(t.volumeL)&&t.volumeL<=t.capacityL&&
    num(t.flowLmin)&&num(t.panelV)&&num(t.panelA)&&typeof t.pumpOn==='boolean'&&
    typeof t.ready==='boolean'&&typeof t.interlocksOk==='boolean'
}
// The credential belongs to the current operator session; retain it only in memory.
export function connectedService(origin:string,token:string,deviceId:string):InstallationService {
  let url:URL
  try {url=new URL(origin)}catch {throw Error('Adresse HTTPS du backend requise.')}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!token||!deviceId) throw Error('Configuration sécurisée incomplète.')
  const api=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(new URL(path,url.origin),{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
      signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined})
    if(!response.ok) throw Error('Service indisponible ou accès refusé.')
    return await response.json()
  }
  const read=async():Promise<Reading>=>{
    try{
      const data=await api('/api/status'),t=data.telemetry as Telemetry
      if(!['viewer','operator','admin'].includes(data.role)||!validTelemetry(t,deviceId))return {...disconnected}
      return {mode:'connected',label:'Télémétrie ESP32 authentifiée',at:t.at,volumeL:t.volumeL,pvW:t.panelV*t.panelA,pumpOn:t.pumpOn,
        controlsAvailable:data.role!=='viewer'&&t.ready&&t.interlocksOk}
    }catch{return {...disconnected}}
  }
  return {
    read,
    async command(action,minutes,confirmed){
      if(!confirmed) throw Error('Confirmation explicite requise.')
      const reading=await read()
      if(reading.mode!=='connected'||(action==='start'&&!reading.controlsAvailable)) throw Error('Commande physique indisponible.')
      const reply=await api('/api/commands','POST',{id:crypto.randomUUID(),deviceId,action,minutes,confirmed:true})
      if(!reply.id) throw Error('Réponse de commande invalide.')
      for(let i=0;i<10;i++) {
        await new Promise(resolve=>setTimeout(resolve,750))
        const result=await api('/api/commands/'+encodeURIComponent(reply.id))
        if(result.status==='applied') return 'Commande acquittée par l’ESP32.'
        if(result.status==='refused'||result.status==='expired') throw Error('Commande refusée ou expirée.')
      }
      throw Error('Acquittement absent. Vérifier l’état de la pompe avant toute nouvelle commande.')
    },
  }
}
