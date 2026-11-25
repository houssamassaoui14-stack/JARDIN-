import { fromLocal, localParts, MINUTE, shiftDate } from './math.ts'
import type { Program, ProgramInput } from './types.ts'
import { finiteRange } from './config.ts'

function applies(p: ProgramInput, date: string) {
  if (date < p.date) return false
  if (!p.days.length) return date === p.date
  return p.days.includes(new Date(date + 'T12:00:00Z').getUTCDay())
}
export function programTime(p: Program, from: number) {
  if (!p.enabled) return null
  if (p.deferUntil && p.deferUntil >= from) return p.deferUntil
  const first = localParts(from).date, begin = p.date > first ? p.date : first
  for(let day=0;day<=8;day++){
    const date = shiftDate(begin,day)
    if (applies(p,date) && p.lastLocal !== date+' '+p.time) {
      const at = fromLocal(date,p.time)
      if(at!==null && at>=from) return at
    }
  }
  return null
}
export function nextProgram(programs: Program[], at: number) {
  let next: (Program & { at: number }) | null = null
  for(const program of programs) {
    const start=programTime(program,at)
    if(start!==null && (!next || start<next.at || (start===next.at && program.priority>next.priority))) next={...program,at:start}
  }
  return next
}
export function scheduledFor(p: Program, at: number) {
  if (!p.enabled) return false
  const t=localParts(at)
  return (p.deferUntil && p.deferUntil<=at) || (applies(p,t.date) && p.time===t.time && p.lastLocal!==t.date+' '+t.time)
}
export function validProgram(p: ProgramInput) {
  if(!p||typeof p!=='object'||typeof p.name!=='string'||p.name.trim().length<1||p.name.length>120||
     typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||p.date<'2000-01-01'||p.date>'2100-12-31'||
     typeof p.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)||
     !Array.isArray(p.days)||p.days.length>7||p.days.some(d=>!Number.isInteger(d)||d<0||d>6)||
     !finiteRange(p.durationMin,1/60,1440)||!finiteRange(p.priority,0,100)||typeof p.enabled!=='boolean'||
     typeof p.weatherAware!=='boolean'||typeof p.autoDefer!=='boolean') return false
  const t=Date.parse(p.date+'T12:00:00Z')
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(p.date)
}
export function conflict(a: ProgramInput, b: ProgramInput) {
  if(!a.enabled||!b.enabled||a.id===b.id) return false
  // Weekly rules repeat. Check a complete common week, including overnight overlaps.
  const anchor=a.date>b.date?a.date:b.date
  for(let day=-1;day<=7;day++) {
    const date=shiftDate(anchor,day)
    if(!applies(a,date)) continue
    const aStart=fromLocal(date,a.time)
    if(aStart===null) continue
    for(const offset of [-1,0,1]){
      const bd=shiftDate(date,offset)
      if(!applies(b,bd)) continue
      const bStart=fromLocal(bd,b.time)
      if(bStart!==null && aStart<bStart+b.durationMin*MINUTE && bStart<aStart+a.durationMin*MINUTE) return true
    }
  }
  return false
}
