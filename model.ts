import { defaults } from './config.ts'
import { areaEstimate, environment, fromLocal, hydraulics, localParts, MINUTE, round, shiftDate } from './math.ts'
import { nextProgram, scheduledFor } from './scheduling.ts'
import type { ActiveCycle, Alert, Config, Cycle, EventLevel, Sample, Scenario, State } from './types.ts'

const DAY=86400000
const BUCKET=15*MINUTE
export const scenarios: Scenario[]=['clear','rain','shade','dust','night','no-flow']
export const uid=()=>globalThis.crypto.randomUUID()
export function log(s:State,message:string,level:EventLevel='info'): State {
  return {...s,events:[{id:uid(),at:s.now,level,message},...s.events].slice(0,2000)}
}
export function initialState(date=Date.now()):State {
  const config=structuredClone(defaults), day=localParts(date).date
  const now=fromLocal(day,'12:00')!, sunrise=fromLocal(day,'07:00')!
  const samples:Sample[]=[]
  // Morning PV trace is computed with the same model as the live integration.
  for(let at=sunrise;at<now;at+=BUCKET) {
    const env=environment(config,at+BUCKET/2,'clear')
    samples.push({at,volumeL:config.capacityL,pvW:env.pvW,expectedW:env.expectedW,
      irradiance:env.irradiance,energyWh:env.pvW/4})
  }
  return {version:1,now,config,volumeL:config.capacityL,speed:1,scenario:'clear',active:null,
    programs:[],history:[],events:[{id:uid(),at:now,level:'info',message:'Simulation initialisée à midi, heure de Casablanca.'}],
    configHistory:[{at:now,config}],samples,refills:[],maintenance:[],anomalySince:null}
}
export function beginBlock(s:State,minutes:number,autoWeather=true) {
  if(s.active) return 'Un arrosage est déjà en cours.'
  if(!Number.isFinite(minutes)||minutes<1/60||minutes>s.config.maxRunMin) return 'Durée invalide ou supérieure à la durée maximale autorisée.'
  const water=hydraulics(s.config,s.volumeL,minutes)
  if(water.flowLmin<=0 || water.cycleL>water.usableL+1e-8) return 'Volume utilisable insuffisant. La réserve de sécurité doit être préservée.'
  const env=environment(s.config,s.now,s.scenario)
  if(autoWeather && s.config.rainGuard && env.significantRain) return 'Pluie significative prévue. Reporter l’arrosage.'
  if(env.pvW<=0 || (env.pumpDemandW!==null && env.pvW < env.pumpDemandW)) return 'Énergie solaire insuffisante sans batterie. Reporter à une plage ensoleillée.'
  if(s.scenario==='no-flow') return 'Absence de débit simulée. Vérifier le circuit avant tout démarrage.'
  return null
}
function activeRecord(s:State,minutes:number,programName=''):ActiveCycle {
  const env=environment(s.config,s.now,s.scenario)
  return {id:uid(),start:s.now,durationMin:minutes,initialL:s.volumeL,flowLmin:hydraulics(s.config,s.volumeL).flowLmin,
    config:s.config,source:programName?'program':'manual',programName,scenario:s.scenario,irradiance:env.irradiance,pvW:env.pvW}
}
export function begin(s:State,minutes:number,programName='',weatherAware=true):[State,string|null] {
  const reason=beginBlock(s,minutes,weatherAware)
  if(reason){
    if(!programName) return [log(s,reason,'warning'),reason]
    const base=activeRecord(s,minutes,programName)
    const record:Cycle={...base,mode:'demo',end:s.now,actualMin:0,finalL:s.volumeL,usedL:0,areaM2:0,energyWh:0,status:'blocked',reason}
    return [log({...s,history:[record,...s.history]},programName+' · '+reason,'warning'),reason]
  }
  return [log({...s,active:activeRecord(s,minutes,programName)},'Arrosage simulé démarré'+(programName?' · '+programName:'.')),null]
}
export function finish(s:State,reason='',status:'completed'|'stopped'='stopped'):State {
  const active=s.active
  if(!active) return s
  const usedL=round(Math.max(0,active.initialL-s.volumeL))
  const actualMin=round((s.now-active.start)/MINUTE)
  const cfg=active.config
  const demand=cfg.pumpW ?? (cfg.pumpA!==null?24*cfg.pumpA:null)
  const record:Cycle={...active,end:s.now,actualMin,finalL:s.volumeL,usedL,
    areaM2:areaEstimate(usedL,cfg.doseLPerM2,cfg.efficiencyPct),energyWh:demand===null?null:demand*actualMin/60,
    mode:'demo',status,reason}
  return log({...s,active:null,history:[record,...s.history]},reason||'Cycle simulé terminé.',status==='completed'?'info':'warning')
}
export function supervise(s:State):State {
  const env=environment(s.config,s.now,s.scenario)
  const low=env.ratio!==null && env.irradiance>=s.config.minIrradiance && env.ratio<s.config.ratioThreshold
  const anomalySince=low?s.anomalySince??s.now:null
  if(s.anomalySince!==anomalySince) s={...s,anomalySince}
  if(!s.active) return s
  if(s.scenario==='no-flow') return finish(s,'Arrêt de sécurité · absence de débit simulée.')
  if(s.volumeL<=s.config.capacityL*s.config.reservePct/100) return finish(s,'Arrêt de sécurité · réserve atteinte.')
  if(env.pvW<=0 || (env.pumpDemandW!==null && env.pvW<env.pumpDemandW)) return finish(s,'Arrêt de sécurité · énergie solaire insuffisante.')
  return s
}
function addSample(s:State,previous:number,at:number):State {
  const env=environment(s.config,(previous+at)/2,s.scenario)
  const bucket=Math.floor(previous/BUCKET)*BUCKET
  const energyWh=env.pvW*(at-previous)/3600000
  const samples=s.samples.slice()
  const last=samples.at(-1)
  const existing=last?.at===bucket
  const sample:Sample={at:bucket,energyWh:energyWh+(existing?last.energyWh:0),pvW:env.pvW,
    irradiance:env.irradiance,expectedW:env.expectedW,volumeL:s.volumeL}
  if(existing) samples[samples.length-1]=sample
  else samples.push(sample)
  if(samples.length>96*93) samples.splice(0,samples.length-96*93)
  return {...s,samples}
}
function runPrograms(s:State):State {
  const due=s.programs.filter(p=>scheduledFor(p,s.now)).sort((a,b)=>b.priority-a.priority)
  for(const program of due){
    const local=localParts(s.now)
    const [result,error]=begin(s,program.durationMin,program.name,program.weatherAware)
    s=result
    let deferUntil:number|undefined
    if(error && program.autoDefer) {
      const todayNoon=fromLocal(local.date,'12:00')!
      deferUntil=todayNoon>s.now?todayNoon:fromLocal(shiftDate(local.date,1),'12:00')!
      s=log(s,program.name+' · passage reporté à midi (heure de Casablanca).','warning')
    }
    s={...s,programs:s.programs.map(p=>p.id===program.id?{...p,
      enabled:Boolean(deferUntil)||p.days.length>0,lastLocal:local.date+' '+program.time,deferUntil}:p)}
  }
  return s
}
export function advance(s:State,elapsedMs:number):State {
  if(!Number.isFinite(elapsedMs)||elapsedMs<=0) return s
  const end=s.now+elapsedMs
  while(s.now<end){
    s=supervise(s)
    const old=s.now, boundary=(Math.floor(old/MINUTE)+1)*MINUTE
    const finishAt=s.active?s.active.start+s.active.durationMin*MINUTE:Infinity
    const at=Math.min(end,boundary,finishAt)
    if(at<old || !Number.isFinite(at)) return finish(s,'Cycle incohérent interrompu.')
    const active=s.active
    let volumeL=s.volumeL
    if(active){
      volumeL=round(Math.max(s.config.capacityL*s.config.reservePct/100,
        active.initialL-active.flowLmin*(at-active.start)/MINUTE))
    }
    s=addSample({...s,now:at,volumeL},old,at)
    if(active && at>=finishAt) s=finish(s,'','completed')
    s=supervise(s)
    if(at===boundary) s=runPrograms(s)
  }
  return s
}
export function currentAlerts(s:State):Alert[] {
  const w=hydraulics(s.config,s.volumeL), env=environment(s.config,s.now,s.scenario)
  const alerts:Alert[]=[]
  if(w.usableL<=0) alerts.push({id:'reserve',level:'critical',message:'Niveau critique · démarrage bloqué.'})
  else if(w.percent<=Math.max(15,s.config.reservePct+5)) alerts.push({id:'level',level:'warning',message:'Niveau d’eau bas · prévoir un remplissage.'})
  if(env.significantRain) alerts.push({id:'rain',level:'warning',message:'Pluie significative prévue dans les trois prochaines heures.'})
  if(s.anomalySince!==null && s.now-s.anomalySince>=s.config.diagnosisMin*MINUTE) alerts.push({id:'ratio',level:'warning',message:'Production inférieure à la référence. Vérifier ombrage, propreté et charge du panneau.'})
  if(env.pvW<=0 || (env.pumpDemandW!==null && env.pvW<env.pumpDemandW)) alerts.push({id:'solar',level:'warning',message:'Production solaire insuffisante pour démarrer.'})
  if(s.scenario==='no-flow') alerts.push({id:'flow',level:'critical',message:'Aucune circulation détectée dans le scénario simulé.'})
  const lastCleaning=s.maintenance[0]?.at??s.configHistory[s.configHistory.length-1]?.at??s.now
  if(s.now-lastCleaning>=s.config.cleaningDays*DAY) alerts.push({id:'clean',level:'info',message:'Échéance d’inspection et de nettoyage du panneau.'})
  return alerts
}
export function derive(s:State) {
  const water=hydraulics(s.config,s.volumeL), env=environment(s.config,s.now,s.scenario)
  const local=localParts(s.now), date=local.date
  const today=fromLocal(date,'00:00')!, week=fromLocal(shiftDate(date,-((local.weekday+6)%7)),'00:00')!
  const month=fromLocal(date.slice(0,8)+'01','00:00')!
  const elapsedSec=s.active?(s.now-s.active.start)/1000:0
  const usedCycleL=s.active?round(s.active.initialL-s.volumeL):0
  const since=(start:number)=>{
    const use=(a:number,b:number,v:number)=> b<=start||!v?0:v*Math.min(1,(b-start)/(b-a||1))
    return s.history.reduce((total,c)=>total+use(c.start,c.end,c.usedL),0)
      +(s.active?use(s.active.start,s.now,usedCycleL):0)
  }
  const energy=(start:number)=>s.samples.reduce((v,p)=>v+(p.at>=start?p.energyWh:0),0)
  return {...water,...env,elapsedSec,usedCycleL,remainingSec:s.active?Math.max(0,s.active.durationMin*60-elapsedSec):0,
    usedTodayL:since(today),usedWeekL:since(week),usedMonthL:since(month),
    energyTodayWh:energy(today),energyWeekWh:energy(week),energyMonthWh:energy(month),
    alerts:currentAlerts(s),nextProgram:nextProgram(s.programs,s.now)}
}
