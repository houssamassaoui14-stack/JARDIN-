import type { CalibrationPoint, Config, Scenario } from './types.ts'

export const ZONE = 'Africa/Casablanca'
export const MINUTE = 60000
const localFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(valid(n) ? n : low, high))
export const round = (n: number) => Math.round(n * 1e8) / 1e8

export function localParts(at: number) {
  const parts = Object.fromEntries(localFormat.formatToParts(at).map(p => [p.type, p.value]))
  const { year, month, day, hour, minute, second } = parts
  const date = year + '-' + month + '-' + day
  return { date, time: hour + ':' + minute, hour: +hour, minute: +minute, second: +second,
    weekday: new Date(date + 'T12:00:00Z').getUTCDay() }
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
}
// Casablanca currently uses either UTC+0 or UTC+1. Derive offsets on both
// sides of the date so the first occurrence wins at a seasonal clock change.
export function fromLocal(date: string, time: string): number | null {
  const target = Date.parse(date + 'T' + time + ':00Z')
  if (!Number.isFinite(target)) return null
  const offsets = new Set<number>()
  for (const delta of [-86400000, 86400000]) {
    const instant = target + delta
    const p = localParts(instant)
    offsets.add(Date.parse(p.date + 'T' + p.time + ':00Z') - instant)
  }
  for (const instant of [...offsets].map(v => target - v).sort((a,b) => a-b)) {
    const p = localParts(instant)
    if (p.date === date && p.time === time) return instant
  }
  return null
}
export function hydraulics(config: Pick<Config,'capacityL'|'reservePct'|'flowLmin'|'measuredFlowLmin'>, currentL: number, minutes = 10) {
  const capacity = Math.max(0, valid(config.capacityL) ? config.capacityL : 0)
  const volumeL = clamp(currentL, 0, capacity)
  const reserveL = capacity * clamp(config.reservePct,0,100) / 100
  const usableL = Math.max(0, volumeL - reserveL)
  const flowLmin = valid(config.measuredFlowLmin) && config.measuredFlowLmin > 0
    ? config.measuredFlowLmin : Math.max(0, valid(config.flowLmin) ? config.flowLmin : 0)
  const cycleL = flowLmin * Math.max(0, valid(minutes) ? minutes : 0)
  return { volumeL, volumeM3: volumeL / 1000, percent: capacity ? volumeL / capacity * 100 : 0,
    reserveL, usableL, flowLmin, cycleL, autonomyMin: flowLmin ? usableL / flowLmin : 0,
    cycles10: flowLmin ? Math.floor(usableL / (flowLmin * 10)) : 0,
    cycles: cycleL ? Math.floor(usableL / cycleL) : 0, finalL: Math.max(0,volumeL-cycleL) }
}
export function areaEstimate(volumeL: number, doseLPerM2: number, efficiencyPct: number) {
  return valid(volumeL) && valid(doseLPerM2) && doseLPerM2 > 0
    ? Math.max(0, volumeL) * clamp(efficiencyPct,0,100) / 100 / doseLPerM2 : 0
}
export function pvEstimate(panelWp: number, irradiance: number, factor: number, tempCoeff: number | null = null, tempC: number | null = null) {
  const correction = valid(tempCoeff) && valid(tempC) ? Math.max(0, 1 + tempCoeff / 100 * (tempC - 25)) : 1
  return round(Math.max(0,panelWp) * Math.max(0,irradiance) * clamp(factor,0,1) / 1000 * correction) || 0
}
export function measuredPower(volts: number | null, amps: number | null) {
  return valid(volts) && valid(amps) && volts >= 0 && amps >= 0 ? volts * amps : null
}
export function validateCalibration(points: CalibrationPoint[], height: number, capacity: number) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 1000) return false
  let h = -1, v = -1
  for (const point of points) {
    if (!point || !valid(point.heightCm) || !valid(point.volumeL) || point.heightCm <= h || point.volumeL <= v) return false
    h = point.heightCm; v = point.volumeL
  }
  return points[0].heightCm === 0 && points[0].volumeL === 0 && h === height && v === capacity
}
export function calibratedVolume(config: Pick<Config,'sensor'|'shape'|'heightCm'|'capacityL'|'calibration'>, waterHeightCm: number) {
  if (config.sensor === 'minimum' || config.sensor === 'float' || !valid(waterHeightCm) || config.heightCm <= 0 || config.capacityL <= 0) return null
  const h = clamp(waterHeightCm,0,config.heightCm), fraction = h / config.heightCm
  if (config.shape === 'vertical') return config.capacityL * fraction
  if (config.shape === 'horizontal') {
    const x = 1 - 2 * fraction
    return config.capacityL * (Math.acos(x) - x * Math.sqrt(Math.max(0,1 - x*x))) / Math.PI
  }
  if (!validateCalibration(config.calibration,config.heightCm,config.capacityL)) return null
  const i = config.calibration.findIndex(p=>p.heightCm >= h)
  if (i === 0) return 0
  const lower = config.calibration[i-1], upper = config.calibration[i]
  return lower.volumeL + (upper.volumeL-lower.volumeL) * (h-lower.heightCm)/(upper.heightCm-lower.heightCm)
}
export function environment(config: Config, at: number, scenario: Scenario) {
  const p = localParts(at), hour = p.hour + p.minute / 60 + p.second / 3600
  // Illustrative diurnal curve in local time. Geographical forecasts are supplied separately.
  const sunlight = scenario === 'night' ? 0 : Math.max(0, Math.sin((hour - 7) / 12 * Math.PI))
  const cloudy = scenario === 'rain'
  const irradiance = Math.round(920 * sunlight * (cloudy ? .30 : 1))
  const expectedW = pvEstimate(config.panelWp, irradiance, config.lossFactor,config.tempCoeff,config.panelTempC)
  const ratio = scenario === 'shade' ? .45 : scenario === 'dust' ? .67 : 1
  const pvW = round(expectedW * ratio)
  const solarStatus = irradiance === 0 ? 'Nuit' : irradiance < 300 ? 'Ensoleillement faible' : irradiance < 650 ? 'Ensoleillement modéré' : 'Ensoleillement fort'
  const rainChance = cloudy ? 85 : 5, rainMm = cloudy ? 8 : 0, rainStartsInH = 3
  const significantRain = rainMm > 0 && rainMm >= config.rainThresholdMm && rainChance >= config.rainThresholdPct && rainStartsInH <= config.rainHorizonH
  return { irradiance, expectedW, pvW, ratio: expectedW > 0 ? ratio : null, rainMm, rainChance,
    temperatureC: Math.round(17 + 9*sunlight - (cloudy ? 3 : 0)), rainStartsInH, significantRain,
    solarStatus, pumpDemandW: config.pumpW ?? measuredPower(24,config.pumpA) }
}
