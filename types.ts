export type Scenario = 'clear' | 'rain' | 'shade' | 'dust' | 'night' | 'no-flow'
export type Speed = 1 | 10 | 60
export type TankShape = 'vertical' | 'horizontal' | 'irregular'
export type SensorKind = 'ultrasonic' | 'pressure' | 'float' | 'minimum'
export type CalibrationPoint = { heightCm: number; volumeL: number }

export interface Config {
  capacityL: number
  reservePct: number
  flowLmin: number
  measuredFlowLmin: number | null
  gardenM2: number
  doseLPerM2: number
  efficiencyPct: number
  radiusM: number | null
  shape: TankShape
  heightCm: number
  sensor: SensorKind
  calibration: CalibrationPoint[]
  panelWp: number
  lossFactor: number
  technology: string
  panelV: number | null
  vmp: number | null
  voc: number | null
  imp: number | null
  isc: number | null
  tilt: number
  azimuth: number
  tempCoeff: number | null
  panelTempC: number | null
  city: string
  latitude: number
  longitude: number
  pumpW: number | null
  pumpA: number | null
  startCurrentA: number | null
  controllerVerified: boolean
  rainGuard: boolean
  rainThresholdMm: number
  rainThresholdPct: number
  rainHorizonH: number
  cleaningDays: number
  ratioThreshold: number
  minIrradiance: number
  diagnosisMin: number
  maxRunMin: number
}
export interface Program {
  id: string
  name: string
  date: string
  time: string
  durationMin: number
  days: number[]
  enabled: boolean
  priority: number
  weatherAware: boolean
  autoDefer: boolean
  lastLocal?: string
  deferUntil?: number
}
export type ProgramInput = Omit<Program, 'id'> & { id?: string }
export interface ActiveCycle {
  id: string
  start: number
  durationMin: number
  initialL: number
  flowLmin: number
  config: Config
  source: 'manual' | 'program'
  programName: string
  scenario: Scenario
  irradiance: number
  pvW: number
}
export interface Cycle extends ActiveCycle {
  end: number
  actualMin: number
  finalL: number
  usedL: number
  areaM2: number
  energyWh: number | null
  mode: 'demo'
  status: 'completed' | 'stopped' | 'blocked'
  reason: string
}
export type EventLevel = 'info' | 'warning' | 'critical'
export interface LogEvent { id: string; at: number; level: EventLevel; message: string }
export interface Alert { id: string; level: EventLevel; message: string }
export interface Sample {
  at: number
  volumeL: number
  pvW: number
  expectedW: number
  irradiance: number
  energyWh: number
}
export interface State {
  version: 1
  config: Config
  now: number
  volumeL: number
  speed: Speed
  scenario: Scenario
  active: ActiveCycle | null
  history: Cycle[]
  programs: Program[]
  events: LogEvent[]
  refills: { at: number; beforeL: number; afterL: number }[]
  samples: Sample[]
  maintenance: { at: number; note: string; beforeRatio: number | null; afterRatio: number | null }[]
  configHistory: { at: number; config: Config }[]
  anomalySince: number | null
}
