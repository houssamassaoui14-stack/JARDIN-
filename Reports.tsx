import {useState} from 'react'
import {Archive,Download,FileSpreadsheet,Search,Upload} from 'lucide-react'
import {useSystem} from './store'
import {engine} from './engine'
import type {Cycle} from './engine/types'
import {localParts,shiftDate} from './engine/math'
import {createWorkbook,csvReport,groupedCycles,saveFile,statusLabel} from './services/reports'
import type {Bucket} from './services/reports'

const fmt=(v:number,n=1)=>v.toLocaleString('fr-FR',{maximumFractionDigits:n})
const stamp=(t:number)=>new Date(t).toLocaleString('fr-FR',{timeZone:'Africa/Casablanca',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
const columns=[
  ['start','Début', (r:Cycle)=>stamp(r.start)],['status','Résultat',(r:Cycle)=>statusLabel[r.status]],['usedL','Eau',(r:Cycle)=>fmt(r.usedL,2)+' L'],
  ['actualMin','Durée',(r:Cycle)=>fmt(r.actualMin)+' min'],['finalL','Niveau final',(r:Cycle)=>fmt(r.finalL)+' L'],['areaM2','Surface',(r:Cycle)=>fmt(r.areaM2)+' m²'],
  ['pvW','Production',(r:Cycle)=>fmt(r.pvW)+' W'],['source','Commande',(r:Cycle)=>r.source==='manual'?'Manuelle':'Programmée'],['reason','Motif',(r:Cycle)=>r.reason||'—'],
] as const
type Metric={label:string,value:number}
function Trend({values,unit}:{values:Metric[],unit:string}){
  if(!values.length)return <p className="research-empty">Les premières valeurs apparaîtront après un relevé ou un cycle de démonstration.</p>
  const max=Math.max(.001,...values.map(x=>x.value)),shown=values.slice(-32)
  const line=shown.map((v,i)=>[shown.length===1?50:i*100/(shown.length-1),96-v.value/max*90])
  return <div className="research-trend"><svg role="img" aria-label={'Tendance en '+unit+' de '+shown[0].label+' à '+shown.at(-1)!.label} viewBox="0 0 100 100" preserveAspectRatio="none"><path d={'M'+line[0][0]+' 100 L'+line.map(p=>p.join(' ')).join(' L')+' L'+line.at(-1)![0]+' 100 Z'} fill="currentColor" opacity=".13"/><polyline points={line.map(p=>p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>{shown.length===1&&<circle cx={line[0][0]} cy={line[0][1]} r="2" fill="currentColor"/>}</svg><div><span>{shown[0].label}</span><strong>{fmt(shown.at(-1)!.value,2)} {unit}</strong><span>{shown.at(-1)!.label}</span></div><details><summary>Valeurs du graphique</summary><div className="research-scroll"><table><thead><tr><th>Période</th><th>{unit}</th></tr></thead><tbody>{shown.map((v,i)=><tr key={i}><td>{v.label}</td><td>{fmt(v.value,3)}</td></tr>)}</tbody></table></div></details></div>
}
export default function Reports(){
  const s=useSystem()
  const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[period,setPeriod]=useState('all'),[sort,setSort]=useState('new'),[page,setPage]=useState(0)
  const [visible,setVisible]=useState<Set<string>>(()=>new Set(columns.slice(0,5).map(c=>c[0])))
  const [group,setGroup]=useState<Bucket>('day'),[metric,setMetric]=useState('liters')
  const [feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<{text:string,name:string}|null>(null)
  const date=localParts(s.now).date, start=period==='all'?'':shiftDate(date,1-Number(period))
  const rows=s.history.filter(r=>localParts(r.start).date>=start&&(!status||r.status===status)&&(!query||[r.id,r.programName,r.reason,statusLabel[r.status],localParts(r.start).date].join(' ').toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))))
    .sort((a,b)=>sort==='water'?b.usedL-a.usedL:sort==='old'?a.start-b.start:b.start-a.start)
  const last=Math.max(0,Math.ceil(rows.length/8)-1),current=Math.min(page,last),list=rows.slice(8*current,8*current+8)
  const totals=groupedCycles(rows,group),water=rows.reduce((a,r)=>a+r.usedL,0),minutes=rows.reduce((a,r)=>a+r.actualMin,0)
  const samples=s.samples.filter(r=>localParts(r.at).date>=start)
  const dailyEnergy=new Map<string,number>()
  for(const r of samples){const k=localParts(r.at).date;dailyEnergy.set(k,(dailyEnergy.get(k)??0)+r.energyWh)}
  const fields:Record<string,{unit:string,label:string,values:Metric[]}>={
    liters:{unit:'L',label:'Eau distribuée',values:totals.map(r=>({label:r.label,value:r.liters}))},
    minutes:{unit:'min',label:'Durée cumulée',values:totals.map(r=>({label:r.label,value:r.minutes}))},
    count:{unit:'cycles',label:'Cycles exécutés',values:totals.map(r=>({label:r.label,value:r.count}))},
    rainBlocks:{unit:'blocages',label:'Tentatives reportées pour pluie',values:totals.map(r=>({label:r.label,value:r.rainBlocks}))},
    rainVolume:{unit:'L',label:'Volume théoriquement évité par blocage pluie',values:totals.map(r=>({label:r.label,value:r.rainVolume}))},
    level:{unit:'L',label:'Évolution du réservoir',values:samples.map(r=>({label:stamp(r.at),value:r.volumeL}))},
    fill:{unit:'L',label:'Volume par remplissage',values:s.refills.filter(r=>localParts(r.at).date>=start).map(r=>({label:stamp(r.at),value:r.afterL-r.beforeL}))},
    energy:{unit:'Wh',label:'Production journalière simulée',values:[...dailyEnergy].sort().map(([label,value])=>({label,value}))},
    pump:{unit:'Wh',label:'Énergie consommée estimée',values:totals.filter(r=>r.pumpWh!==null).map(r=>({label:r.label,value:r.pumpWh!}))},
  }
  async function excel(){
    setBusy(true)
    try{const book=await createWorkbook(s,rows),bytes=await book.xlsx.writeBuffer();saveFile(new Uint8Array(bytes as ArrayBuffer),'Floreol-'+date+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');setFeedback('Classeur Excel généré · '+rows.length+' cycle(s), sept feuilles.')}
    catch{setFeedback('La création du classeur Excel a échoué. Les données restent disponibles dans le navigateur.')}finally{setBusy(false)}
  }
  async function inspect(file:File|undefined){
    if(!file)return
    try{
      if(file.size>15_000_000)throw new Error('La sauvegarde dépasse 15 Mo.')
      const text=await file.text();JSON.parse(text)
      setPending({text,name:file.name});setFeedback('')
    }catch{setFeedback('Sauvegarde illisible ou supérieure à 15 Mo.')}
  }
  return <div className="research-content"><div className="research-toolbar"><div className="research-kicker"><Archive size={16}/>Journal de démonstration</div><div className="research-actions"><button className="research-button" onClick={()=>{saveFile(csvReport(rows),'Floreol-'+date+'.csv','text/csv;charset=utf-8');setFeedback('CSV des cycles filtrés généré.')}}><Download size={15}/>CSV</button><button className="research-button primary" onClick={excel} disabled={busy}><FileSpreadsheet size={16}/>{busy?'Création…':'Exporter Excel'}</button></div></div>
    <div className="research-measures"><div><small>Cycles exécutés</small><strong>{rows.filter(r=>r.status!=='blocked').length}</strong></div><div><small>Eau distribuée</small><strong>{fmt(water,2)} L</strong></div><div><small>Irrigation cumulée</small><strong>{fmt(minutes)} min</strong></div><div><small>Production simulée sur la période</small><strong>{fmt(samples.reduce((a,r)=>a+r.energyWh,0),2)} Wh</strong></div></div>
    <div className="research-panel"><h3>Historique des arrosages</h3><div className="research-filters"><label><Search size={15}/>Rechercher<input type="search" placeholder="Date, identifiant, programme…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/></label>
    <label>Période<select value={period} onChange={e=>{setPeriod(e.target.value);setPage(0)}}><option value="all">Tout l’historique</option><option value="1">Aujourd’hui</option><option value="7">Sept derniers jours</option><option value="30">Trente derniers jours</option></select></label><label>Résultat<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="">Tous</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Tri<select value={sort} onChange={e=>{setSort(e.target.value);setPage(0)}}><option value="new">Plus récent</option><option value="old">Plus ancien</option><option value="water">Volume décroissant</option></select></label></div>
    <details className="research-columns"><summary>Colonnes visibles</summary><div>{columns.map(([key,name])=><label key={key}><input type="checkbox" checked={visible.has(key)} disabled={visible.size===1&&visible.has(key)} onChange={()=>setVisible(prev=>{const n=new Set(prev);if(n.has(key))n.delete(key);else n.add(key);return n})}/>{name}</label>)}</div></details>
    <div className="research-scroll"><table><thead><tr>{columns.filter(x=>visible.has(x[0])).map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{list.map(r=><tr key={r.id}>{columns.filter(c=>visible.has(c[0])).map(c=><td key={c[0]}>{c[2](r)}</td>)}</tr>)}</tbody></table></div>
    {!list.length&&<p className="research-empty">{s.history.length?'Aucun cycle ne correspond aux filtres.':'Lancez un arrosage dans le simulateur pour créer le premier rapport.'}</p>}
    <div className="research-pagination"><span>{rows.length} résultat(s) · {current+1} / {last+1}</span><button disabled={current===0} onClick={()=>setPage(current-1)}>Précédent</button><button disabled={current===last} onClick={()=>setPage(current+1)}>Suivant</button></div></div>
    <div className="research-panel"><h3>Tendances de fonctionnement</h3><div className="research-filters"><label>Indicateur<select value={metric} onChange={e=>setMetric(e.target.value)}>{Object.entries(fields).map(([k,item])=><option key={k} value={k}>{item.label}</option>)}</select></label>{!['level','fill','energy'].includes(metric)&&<label>Regrouper par<select value={group} onChange={e=>setGroup(e.target.value as Bucket)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option></select></label>}</div><Trend values={fields[metric].values} unit={fields[metric].unit}/>{metric==='rainVolume'&&<p>Chaque tentative bloquée pour pluie représente son débit de référence multiplié par sa durée prévue. Un cycle reprogrammé pourra consommer cette eau plus tard.</p>}
    {metric==='pump'&&<p>La puissance ou le courant de la pompe doit être renseigné au moment du cycle pour en estimer la consommation.</p>}</div>
    <details className="research-panel"><summary>Sauvegarde et restauration</summary><p>Le fichier JSON conserve la simulation, les programmes, les cycles et leur configuration. Les fichiers d’études externes se réimportent séparément.</p><div className="research-imports"><button className="research-button" onClick={()=>{saveFile(engine.backup(),'Floreol-sauvegarde-'+date+'.json','application/json');setFeedback('Sauvegarde de la simulation créée.')}}><Download size={15}/>Sauvegarder</button><label className="research-upload"><Upload size={15}/>Charger une sauvegarde<input type="file" accept=".json" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void inspect(f)}}/></label></div>
    {pending&&<div className="research-notice"><p>Remplacer la simulation de ce navigateur par « {pending.name} » ?</p><div className="research-actions"><button className="research-button" onClick={()=>{const error=engine.restore(pending.text);setFeedback(error||'Simulation restaurée.');setPending(null)}}>Confirmer la restauration</button><button className="research-button" onClick={()=>setPending(null)}>Annuler</button></div></div>}</details>
    {feedback&&<p className="research-notice" role="status">{feedback}</p>}
  </div>
}
