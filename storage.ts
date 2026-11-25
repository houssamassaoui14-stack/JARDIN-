import type { ActiveCycle, Cycle, State } from './types.ts'
import { finiteRange, validConfig } from './config.ts'
import { scenarios, finish } from './model.ts'
import { validProgram } from './scheduling.ts'

export const STORAGE_KEY='floreol.simulation.v1'
const timestamp=(v:unknown)=>finiteRange(v,Date.UTC(1999,0),Date.UTC(2200,0))
const text=(v:unknown,limit=600)=>typeof v==='string'&&v.length<=limit
const nonnegative=(v:unknown)=>finiteRange(v,0,1e12)
const nullable=(v:unknown)=>v===null||nonnegative(v)
function validActive(c:ActiveCycle) {
  return c && text(c.id,100) && timestamp(c.start) && validConfig(c.config) && finiteRange(c.initialL,0,c.config.capacityL) &&
    finiteRange(c.durationMin,1/60,1440) && finiteRange(c.flowLmin,.001,1e5) && ['manual','program'].includes(c.source) &&
    text(c.programName,120) && scenarios.includes(c.scenario) && nonnegative(c.irradiance) && nonnegative(c.pvW)
}
function validCycle(c:Cycle) {
  return validActive(c) && timestamp(c.end) && c.end>=c.start && nonnegative(c.actualMin) &&
    finiteRange(c.finalL,0,c.config.capacityL) && nonnegative(c.usedL) && nonnegative(c.areaM2) && nullable(c.energyWh) &&
    Math.abs(c.initialL-c.finalL-c.usedL)<.001 && c.mode==='demo' && ['completed','stopped','blocked'].includes(c.status) && text(c.reason)
}
const list=<T>(v:T[],fn:(item:T)=>unknown,limit=50000)=>Array.isArray(v)&&v.length<=limit&&v.every(fn)
export function decodeSnapshot(raw:string):State {
  if(typeof raw!=='string' || raw.length>20_000_000) throw Error('Taille de sauvegarde invalide.')
  const s=JSON.parse(raw) as State
  const valid=s && s.version===1 && validConfig(s.config) && timestamp(s.now) && finiteRange(s.volumeL,0,s.config.capacityL) &&
    [1,10,60].includes(s.speed) && scenarios.includes(s.scenario) &&
    (s.anomalySince===null || (timestamp(s.anomalySince) && s.anomalySince<=s.now)) &&
    (s.active===null || (validActive(s.active) && s.active.start<=s.now && s.active.initialL>=s.volumeL &&
      s.now<=s.active.start+s.active.durationMin*60000+.01)) &&
    list(s.history,validCycle) && list(s.programs,p=>validProgram(p)&&text(p.id,100)&&
      (p.deferUntil===undefined||timestamp(p.deferUntil))&&(p.lastLocal===undefined||text(p.lastLocal,32)),1000) &&
    new Set(s.programs.map(p=>p.id)).size===s.programs.length &&
    list(s.events,p=>p&&text(p.id,100)&&timestamp(p.at)&&['info','warning','critical'].includes(p.level)&&text(p.message),2000) &&
    list(s.samples,p=>p&&timestamp(p.at)&&nonnegative(p.volumeL)&&nonnegative(p.pvW)&&nonnegative(p.energyWh)&&nonnegative(p.expectedW)&&nonnegative(p.irradiance),10000) &&
    list(s.maintenance,p=>p&&timestamp(p.at)&&text(p.note)&&nullable(p.beforeRatio)&&nullable(p.afterRatio)) &&
    list(s.configHistory,p=>p&&timestamp(p.at)&&validConfig(p.config)) &&
    list(s.refills,p=>p&&timestamp(p.at)&&nonnegative(p.beforeL)&&nonnegative(p.afterL)&&p.afterL>=p.beforeL)
  if(!valid) throw Error('Sauvegarde Floréol invalide ou version incompatible.')
  return s
}
export function safeResume(s:State) {
  return s.active?finish(s,'Cycle interrompu à la fermeture ou à la restauration de la simulation.'):s
}
