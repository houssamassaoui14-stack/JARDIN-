import type {Cycle,State} from '../engine/types.ts'
import {localParts,shiftDate} from '../engine/math.ts'

export const statusLabel={completed:'Terminé',stopped:'Interrompu',blocked:'Bloqué'}
export const scenarioLabel={clear:'Ciel dégagé',rain:'Pluie',shade:'Ombrage',dust:'Encrassement',night:'Nuit','no-flow':'Débit absent'}
export const cycleHeaders=['Identifiant','Début (Casablanca)','Fin (Casablanca)','Prévu (min)','Effectif (min)','Capacité (L)','Initial (L)','Final (L)','Consommé (L)','Débit (L/min)','Surface estimée (m²)','Panneau (Wc)','Production simulée (W)','Énergie pompe estimée (Wh)','Irradiance simulée (W/m²)','Conditions simulées','Déclenchement','Programme','Origine','Résultat','Motif / alerte']
function localExcelDate(at:number) {
  const p=localParts(at)
  return new Date(p.date+'T'+p.time+':'+p.second.toString().padStart(2,'0')+'Z')
}
export function cycleCells(c:Cycle){
  return [c.id,localExcelDate(c.start),localExcelDate(c.end),c.durationMin,c.actualMin,c.config.capacityL,c.initialL,c.finalL,c.usedL,c.flowLmin,c.areaM2,c.config.panelWp,c.pvW,c.energyWh,c.irradiance,scenarioLabel[c.scenario],c.source==='manual'?'Manuel':'Programmé',c.programName,'Simulation',statusLabel[c.status],c.reason]
}
function csvText(cell:unknown) {
  if(cell==null)return ''
  if(cell instanceof Date)return cell.toISOString().slice(0,19).replace('T',' ')
  if(typeof cell==='number')return String(cell).replace('.',',')
  let str=String(cell)
  if(/^\s*[=+@\-\t\r]/.test(str))str="'"+str
  return '"'+str.replaceAll('"','""')+'"'
}
export function csvReport(rows:Cycle[]){
  return '\uFEFF'+[cycleHeaders,...rows.map(cycleCells)].map(row=>row.map(csvText).join(';')).join('\r\n')
}
export type Bucket='day'|'week'|'month'
export function periodKey(at:number,group:Bucket) {
  const {date,weekday}=localParts(at)
  return group==='month'?date.slice(0,7):group==='week'?shiftDate(date,-((weekday+6)%7)):date
}
export function groupedCycles(rows:Cycle[],group:Bucket){
  const counts=new Map<string,{label:string,liters:number,count:number,minutes:number,pumpWh:number|null,rainBlocks:number,rainVolume:number}>()
  for(const row of rows){
    const key=periodKey(row.end,group)
    const r=counts.get(key)??{label:key,liters:0,count:0,minutes:0,pumpWh:null,rainBlocks:0,rainVolume:0}
    r.liters+=row.usedL;r.minutes+=row.actualMin
    if(row.status!=='blocked')r.count++
    if(row.energyWh!==null)r.pumpWh=(r.pumpWh??0)+row.energyWh
    if(row.status==='blocked' && /pluie|précipitation/i.test(row.reason)){r.rainBlocks++;r.rainVolume+=row.durationMin*row.flowLmin}
    counts.set(key,r)
  }
  return [...counts.values()].sort((a,b)=>a.label.localeCompare(b.label))
}
export async function createWorkbook(s:State,rows:Cycle[]=s.history){
  const ExcelJS=(await import('exceljs')).default
  const book=new ExcelJS.Workbook()
  book.creator='Floréol · IFMEREE Tanger';book.subject='Rapport de simulation pédagogique'
  type Value=string|number|boolean|Date|null
  function sheet(name:string,headers:string[],values:Value[][]) {
    const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]})
    ws.addRow(headers)
    values.forEach(row=>ws.addRow(row))
    ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:headers.length}}
    ws.columns.forEach((column,i)=>{column.width=Math.min(64,Math.max(16,headers[i].length+3,...values.slice(0,50).map(row=>row[i] instanceof Date?23:String(row[i]??'').length+2)))})
    ws.eachRow((row,i)=>row.eachCell(cell=>{
      if(i===1){cell.font={color:{argb:'FFFFFFFF'},bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF105B67'}};row.height=26}
      if(cell.value instanceof Date)cell.numFmt='dd/mm/yyyy hh:mm:ss'
      else if(typeof cell.value==='number')cell.numFmt='0.##'
    }))
    return ws
  }
  const all=groupedCycles(rows,'day'),sum=(key:'liters'|'minutes'|'count'|'rainBlocks'|'rainVolume')=>all.reduce((acc,row)=>acc+row[key],0)
  sheet('Tableau de bord',['Indicateur','Valeur','Unité / origine'],[
    ['Origine','Mode démonstration','Simulation locale'],['Horloge',localExcelDate(s.now),'Africa/Casablanca'],['Cycles exportés',rows.length,'Lignes filtrées'],
    ['Capacité actuelle',s.config.capacityL,'L'],['Volume restant',s.volumeL,'L simulés'],['Total distribué',sum('liters'),'L simulés'],['Durée totale',sum('minutes'),'min'],
    ['Blocages pluie',sum('rainBlocks'),'Tentatives'],['Volume des tentatives bloquées pour pluie',sum('rainVolume'),'L théoriques, hors reprises ultérieures'],
    ['Production conservée',s.samples.reduce((a,r)=>a+r.energyWh,0),'Wh simulés dans les échantillons enregistrés'],['Station ESP32','Déconnectée','Aucune mesure matérielle']])
  sheet('Historique des arrosages',cycleHeaders,rows.map(cycleCells))
  sheet("Consommation d’eau",['Jour / remplissage','Type','Volume distribué (L)','Durée (min)','Cycles exécutés','Volume avant (L)','Volume après (L)','Origine'],[
    ...all.map(r=>[r.label,'Arrosages',r.liters,r.minutes,r.count,null,null,'Simulation']),
    ...s.refills.map(r=>[localExcelDate(r.at),'Remplissage',null,null,null,r.beforeL,r.afterL,'Simulation'])])
  sheet('Production photovoltaïque',['Horodatage (Casablanca)','Production simulée (W)','Attendu (W)','Irradiance simulée (W/m²)','Énergie intervalle (Wh)','Niveau (L)','Origine'],s.samples.map(r=>[localExcelDate(r.at),r.pvW,r.expectedW,r.irradiance,r.energyWh,r.volumeL,'Simulation']))
  sheet('État des capteurs',['Équipement','Valeur','Unité','Origine'],[
    ['ESP32','Non connecté','','Matériel futur'],['Niveau',s.volumeL,'L','Simulation'],['Débit nominal',s.config.flowLmin,'L/min','Configuration'],['Débit de référence saisi',s.config.measuredFlowLmin,'L/min','Configuration'],['Panneau',s.config.panelWp,'Wc','Configuration'],['Tension et courant',null,'V et A','Aucune mesure matérielle']])
  sheet('Alertes et maintenance',['Date (Casablanca)','Type','Description','Ratio avant','Ratio après','Origine'],[
    ...s.events.map(r=>[localExcelDate(r.at),r.level,r.message,null,null,'Simulation']),
    ...s.maintenance.map(r=>[localExcelDate(r.at),'Entretien',r.note,r.beforeRatio,r.afterRatio,'Simulation'])
  ])
  const configRows:Value[][]=[]
  for(const snapshot of [...s.configHistory,{at:s.now,config:s.config}]){
    for(const [k,v] of Object.entries(snapshot.config))configRows.push([localExcelDate(snapshot.at),k,typeof v==='object'&&v!==null?JSON.stringify(v):v,'Configuration du simulateur'])
  }
  sheet('Configuration du système',['Date de configuration','Paramètre (unités dans le nom)','Valeur','Origine'],configRows)
  return book
}
export function saveFile(data:BlobPart,file:string,type:string){
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a')
  a.href=url;a.download=file;document.body.append(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),10000)
}
