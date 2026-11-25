import { validateCalibration } from './math.ts'
import type { Config } from './types.ts'

export const defaults: Config = {
  capacityL:500, reservePct:5, flowLmin:2, measuredFlowLmin:null,
  gardenM2:50,doseLPerM2:4,efficiencyPct:100,radiusM:null,
  shape:'vertical',heightCm:100,sensor:'ultrasonic',calibration:[],
  panelWp:50,lossFactor:.85,technology:'',panelV:null,vmp:null,voc:null,imp:null,isc:null,
  tilt:30,azimuth:0,tempCoeff:null,panelTempC:null,
  city:'Tanger',latitude:35.76,longitude:-5.83,
  pumpW:null,pumpA:null,startCurrentA:null,controllerVerified:false,
  rainGuard:true,rainThresholdMm:3,rainThresholdPct:60,rainHorizonH:12,
  cleaningDays:30,ratioThreshold:.75,minIrradiance:300,diagnosisMin:5,maxRunMin:120,
}
type NumKey = { [K in keyof Config]: Config[K] extends number | null ? K : never }[keyof Config]
const ranges: Record<NumKey,[number,number]> = {
  capacityL:[.01,1e8],reservePct:[0,100],flowLmin:[.001,1e5],measuredFlowLmin:[.001,1e5],
  gardenM2:[.01,1e8],doseLPerM2:[.001,1e5],efficiencyPct:[.01,100],radiusM:[.001,1e4],
  heightCm:[.001,1e5],panelWp:[.01,1e7],lossFactor:[.001,1],panelV:[.01,1e4],vmp:[.01,1e4],
  voc:[.01,1e4],imp:[.001,1e4],isc:[.001,1e4],tilt:[0,90],azimuth:[-180,180],
  tempCoeff:[-2,0],panelTempC:[-80,150],latitude:[-90,90],longitude:[-180,180],pumpW:[.001,1e7],
  pumpA:[.001,1e5],startCurrentA:[.001,1e5],rainThresholdMm:[0,500],rainThresholdPct:[0,100],
  rainHorizonH:[.1,168],cleaningDays:[1,730],ratioThreshold:[.01,1],minIrradiance:[1,1600],
  diagnosisMin:[.1,1440],maxRunMin:[.016,1440],
}
export const finiteRange = (n: unknown, low: number, high: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high
export function validConfig(c: Config): boolean {
  if (!c || typeof c !== 'object' || Object.keys(c).some(k=>!Object.hasOwn(defaults,k))) return false
  for (const [key, limit] of Object.entries(ranges)) {
    const k = key as NumKey
    if (c[k] === null && defaults[k] === null) continue
    if (!finiteRange(c[k],limit[0],limit[1])) return false
  }
  return ['vertical','horizontal','irregular'].includes(c.shape) &&
    ['ultrasonic','pressure','float','minimum'].includes(c.sensor) &&
    Array.isArray(c.calibration) && (c.calibration.length===0 || validateCalibration(c.calibration,c.heightCm,c.capacityL)) &&
    typeof c.rainGuard==='boolean' && typeof c.controllerVerified === 'boolean' &&
    typeof c.technology === 'string' && c.technology.length <= 100 &&
    typeof c.city === 'string' && c.city.trim().length > 0 && c.city.length<=100
}
