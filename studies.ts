export interface MonthValue {
  month: number
  kWh: number
  irradiation: number | null
}

export interface Study {
  name: string
  rows: MonthValue[]
  note: string
  annual?: number
}

export const tangierStudy: Study = {
  name: 'PVGIS · Tanger',
  note: 'Référence locale PVGIS 5.3 · SARAH3, 2005–2023 · Tanger, 35,76° N / 5,83° O · 50 Wc · sud, 30° · pertes de 15 %.',
  annual: 82.01,
  rows: [[5.43,133.59],[5.50,136.48],[6.79,171.14],[7.27,187.47],[7.96,208.24],[7.97,212.34],[8.50,230.34],[8.29,224.29],[7.35,193.90],[6.57,169.91],[5.24,131.38],[5.14,126.74]]
    .map(([kWh,irradiation],i) => ({month:i+1,kWh,irradiation})),
}

const validNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const photovoltaicApi = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc'
export function referenceUrl(lat: number, lon: number, wp: number, angle: number, aspect: number, loss: number) {
  const params = [lat,lon,wp,angle,aspect,loss]
  if (!params.every(Number.isFinite) || Math.abs(lat)>90 || Math.abs(lon)>180 || wp<=0 || angle<0 || angle>90 || Math.abs(aspect)>180 || loss<0 || loss>=100) return null
  const url = new URL(photovoltaicApi)
  const values = {lat, lon, peakpower: wp/1000, angle, aspect, loss, outputformat:'json', browser:1}
  Object.entries(values).forEach(([k,v])=>url.searchParams.set(k,String(v)))
  return url.toString()
}

function verified(rows: MonthValue[]) {
  if (rows.length!==12 || new Set(rows.map(r=>r.month)).size!==12 || rows.some(r=>!Number.isInteger(r.month) || r.month<1 || r.month>12 || !validNumber(r.kWh) || r.irradiation!==null && !validNumber(r.irradiation))) {
    throw new Error('Le fichier doit contenir douze mois distincts et des énergies positives ou nulles.')
  }
  return rows.sort((a,b)=>a.month-b.month)
}

function normalized(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
}
function cells(line: string, separator: string) {
  const out: string[]=[]
  let quoted=false, field=''
  for (let i=0;i<line.length;i++) {
    const c=line[i]
    if(c==='"' && quoted && line[i+1]==='"') { field+='"'; i++ }
    else if(c==='"') quoted=!quoted
    else if(c===separator && !quoted) { out.push(field.trim()); field='' }
    else field+=c
  }
  if(quoted) throw new Error('Guillemets CSV non fermés.')
  return [...out, field.trim()]
}
const fr=['jan','fev','mar','avr','mai','juin','juil','aou','sep','oct','nov','dec']
const en=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
function monthOf(value: string) {
  const s=normalized(value).replace(/\./g,'')
  if (/^\d{1,2}$/.test(s)) return Number(s)
  const iso=s.match(/^\d{4}[-/](\d\d?)(?:[-/]\d\d?)?(?:\s|$)/)
  const dmy=s.match(/^\d\d?\/(\d\d?)\/(\d{2,4})(?:\s|$)/)
  const my=s.match(/^(\d{1,2})[/-]\d{4}$/)
  if(iso || dmy || my) return Number((iso || dmy || my)![1])
  const idx=fr.findIndex((v,i)=>s.startsWith(v) || s.startsWith(en[i]))
  return idx<0 ? null : idx+1
}
function numeric(s: string | undefined) {
  if(s===undefined || !s.trim()) return NaN
  return Number(s.replace(',','.'))
}

export function parseMonthly(text: string, kind: 'pvgis'|'pvsyst'|'measured', name: string): Study {
  if(text.length>3_000_000) throw new Error('Limite de 3 Mo pour un relevé mensuel.')
  const clean=text.replace(/^\uFEFF/,'').trim()
  if(kind==='pvgis' && clean.startsWith('{')) {
    const data=JSON.parse(clean)
    const fixed=data?.outputs?.monthly?.fixed
    if(!Array.isArray(fixed)) throw new Error('Le fichier PVGIS doit provenir de PVcalc avec une inclinaison fixe.')
    const series=verified(fixed.map(row=>({month:row.month,kWh:row.E_m,irradiation:row['H(i)_m'] ?? null})))
    const loc=data.inputs?.location, module=data.inputs?.pv_module
    const details=[data.inputs?.meteo_data?.radiation_db, loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) ? loc.latitude+'°, '+loc.longitude+'°' : '', module && Number.isFinite(module.peak_power) ? module.peak_power*1000+' Wc' : ''].filter(Boolean)
    return {name, note:['Import PVGIS',...details].join(' · '),rows:series,annual:validNumber(data.outputs?.totals?.fixed?.E_y)?data.outputs.totals.fixed.E_y:undefined}
  }
  const lines=clean.split(/\r?\n/).filter(s=>s.trim())
  const headerIndex=lines.findIndex(line=>/(^|[;,\t"])(?:month|mois|date)\s*(?:[";,\t]|$)/i.test(line))
  if(headerIndex<0) throw new Error('En-tête introuvable. Utilisez une colonne Month, Mois ou Date.')
  const header=lines[headerIndex]
  const sep=header.includes(';')?';':header.includes('\t')?'\t':','
  const columns=cells(header,sep).map(normalized)
  const monthIndex=columns.findIndex(c=>['month','mois','date'].includes(c))
  const preferred=kind==='pvgis'?['e_m']:kind==='pvsyst'?['e_grid','eavail','e_user','earray','e_array','energie_kwh']:['energie_kwh','energy_kwh']
  const base=(c:string)=>c.split(/\s*[(\[]|\s+/)[0]
  const energyIndex=preferred.map(key=>columns.findIndex(c=>base(c)===key)).find(i=>i>=0)
  if(energyIndex===undefined) throw new Error('Colonne d’énergie attendue : '+preferred.join(', ')+'.')
  const irrIndex=columns.findIndex(c=>c==='h(i)_m' || c==='globinc')
  const first=cells(lines[headerIndex+1]||'',sep)
  const unitLabel=columns[energyIndex]+' '+(monthOf(first[monthIndex]||'')===null ? first[energyIndex]||'' : '')
  const unit=unitLabel.match(/\b(mwh|kwh|wh)\b/i)?.[1].toLowerCase()
  if(kind==='pvsyst' && !unit && columns[energyIndex]!=='energie_kwh') throw new Error('Indiquez l’unité Wh, kWh ou MWh dans l’en-tête ou la ligne d’unités PVsyst.')
  const scale=unit==='mwh'?1000:unit==='wh'?0.001:1
  const rows: MonthValue[]=[]
  for(const line of lines.slice(headerIndex+1)) {
    const parts=cells(line,sep), month=monthOf(parts[monthIndex]??'')
    if(month===null) continue
    const irradiation=irrIndex>=0?numeric(parts[irrIndex]):null
    rows.push({month,kWh:numeric(parts[energyIndex])*scale,irradiation:kind==='pvgis'?irradiation:null})
  }
  return {name,rows:verified(rows),note:kind==='pvgis'?'Référence climatologique importée de PVGIS.':kind==='pvsyst'?'Simulation mensuelle importée de PVsyst · '+columns[energyIndex]+'.':'Relevé mensuel déclaré par l’utilisateur. La provenance reste à vérifier.'}
}
