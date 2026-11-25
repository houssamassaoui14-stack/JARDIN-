import {useEffect,useState} from 'react'
import {ExternalLink,FileText,Sun,Upload} from 'lucide-react'
import {useSystem} from './store'
import {parseMonthly,referenceUrl,tangierStudy} from './services/studies'
import type {Study} from './services/studies'

type Kind='pvgis'|'pvsyst'|'measured'
const labels={pvgis:'PVGIS',pvsyst:'PVsyst',measured:'Mesures importées'}
const months=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('fr-FR',{month:'short',timeZone:'UTC'}).format(Date.UTC(2026,i,1)).replace('.',''))
const number=(v:number)=>v.toLocaleString('fr-FR',{maximumFractionDigits:2})
function readStudy(kind:Kind):Study|null {
  try{
    const entry=JSON.parse(localStorage.getItem('floreol.study.'+kind)||'null')
    if(entry && typeof entry.text==='string' && typeof entry.name==='string')return parseMonthly(entry.text,kind,entry.name)
  }catch{/* Import local incompatible ou indisponible. */}
  return kind==='pvgis'?tangierStudy:null
}
export default function Studies(){
  const {config:c}=useSystem()
  const [series,setSeries]=useState<Record<Kind,Study|null>>(()=>({pvgis:readStudy('pvgis'),pvsyst:readStudy('pvsyst'),measured:readStudy('measured')}))
  const [params,setParams]=useState(()=>({lat:String(c.latitude),lon:String(c.longitude),wp:String(c.panelWp),tilt:String(c.tilt),aspect:String(c.azimuth),loss:String(Math.round((1-c.lossFactor)*100))}))
  const [message,setMessage]=useState(''),[pdf,setPdf]=useState<{url:string,name:string}|null>(null)
  const [active,setActive]=useState(6)
  useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf.url)},[pdf])
  const url=Object.values(params).every(x=>x.trim()!=='')?referenceUrl(+params.lat,+params.lon,+params.wp,+params.tilt,+params.aspect,+params.loss):null
  async function load(file:File|undefined,kind:Kind|'pdf'){
    if(!file)return
    try{
      if(file.size>(kind==='pdf'?15_000_000:3_000_000))throw new Error(kind==='pdf'?'Le PDF dépasse la limite de 15 Mo.':'Le fichier dépasse la limite de 3 Mo.')
      if(kind==='pdf'){
        if(!(await file.slice(0,5).text()).startsWith('%PDF-'))throw new Error('Le document sélectionné ne possède pas un en-tête PDF valide.')
        setPdf({url:URL.createObjectURL(new Blob([file],{type:'application/pdf'})),name:file.name})
      }else{
        const text=await file.text(),study=parseMonthly(text,kind,file.name)
        setSeries(prev=>({...prev,[kind]:study}))
        try{localStorage.setItem('floreol.study.'+kind,JSON.stringify({name:file.name,text}))}catch{setMessage('Import affiché pour cette session. Stockage local indisponible.');return}
      }
      setMessage('Import réussi · '+file.name)
    }catch(e){setMessage(e instanceof Error?e.message:'Import impossible.')}
  }
  const keys=(Object.keys(labels) as Kind[]).filter(k=>series[k]),reference=series.pvgis||tangierStudy
  const ymax=Math.max(1,...keys.flatMap(k=>series[k]!.rows.map(m=>m.kWh)))
  const year=reference.annual??reference.rows.reduce((a,r)=>a+r.kWh,0)
  const irradiation=reference.rows.every(r=>r.irradiation!==null)?reference.rows.reduce((a,r)=>a+(r.irradiation??0),0):null
  return <div className="research-content"><div className="research-feature study-feature"><div><div className="research-kicker"><Sun size={16}/>Potentiel photovoltaïque annuel</div><div className="research-big">{number(year)} <em>kWh/an</em></div><p>Production estimée par PVGIS</p><small>{reference.note}</small></div></div>
    <div className="research-panel"><h3>Production au fil des saisons</h3><p>Énergie mensuelle en kWh. Sélectionnez un mois pour lire les valeurs.</p>
      <div className="research-bars" aria-label="Comparaison des productions mensuelles">{months.map((mo,i)=><button key={mo} aria-label={mo+' '+keys.map(k=>labels[k]+' '+number(series[k]!.rows[i].kWh)+' kWh').join(', ')} aria-pressed={active===i} onClick={()=>setActive(i)}><span className="bars-frame">{keys.map(k=><i key={k} className={'bar-'+k} style={{height:100*series[k]!.rows[i].kWh/ymax+'%'}}/>)}</span><small>{mo}</small></button>)}</div>
      <div className="research-legend">{keys.map(k=><span key={k}><b className={'bar-'+k}/>{labels[k]} · {number(series[k]!.rows[active].kWh)} kWh</span>)}</div>
      <p className="research-foot">Irradiation sur le plan incliné · {months[active]} {reference.rows[active].irradiation===null?'indisponible':number(reference.rows[active].irradiation!)+' kWh/m²'}{irradiation!==null?' · année '+number(irradiation)+' kWh/m²':''}</p>
    </div>
    <div className="research-panel"><h3>Calculer une référence PVGIS</h3><p>Choisissez l’installation, téléchargez le JSON auprès du JRC puis importez-le pour actualiser la courbe.</p><div className="research-form">{([['lat','Latitude (°)'],['lon','Longitude (°)'],['wp','Puissance (Wc)'],['tilt','Inclinaison (°)'],['aspect','Azimut (° sud = 0)'],['loss','Pertes (%)']] as const).map(([k,label])=><label key={k}>{label}<input type="number" step="any" value={params[k]} onChange={e=>setParams(p=>({...p,[k]:e.target.value}))}/></label>)}</div>
    {url?<a className="research-button" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Télécharger le calcul officiel</a>:<p role="status">Vérifiez les coordonnées et les paramètres de calcul.</p>}</div>
    <div className="research-panel"><h3>Importer un jeu de résultats</h3><p>PVGIS accepte le JSON ou CSV de PVcalc. Pour PVsyst, choisissez un CSV mensuel avec Date ou Month, une énergie E_Grid, EArray ou E_User et son unité. Un relevé mensuel accepte Mois et Energie_kWh.</p>
    <div className="research-imports">{(['pvgis','pvsyst','measured','pdf'] as const).map(k=><label className="research-upload" key={k}><Upload size={16}/>{k==='pdf'?'Rapport PDF':labels[k]}<input type="file" aria-label={'Importer '+(k==='pdf'?'un rapport PDF':labels[k])} accept={k==='pdf'?'.pdf':k==='pvgis'?'.json,.csv,.tsv':'.csv,.tsv'} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void load(file,k)}}/></label>)}</div>
    {keys.map(k=><p className="research-foot" key={k}>{labels[k]} · {series[k]!.name}{k!=='pvgis'?' · '+series[k]!.note:''}</p>)}
    {message&&<p role="status" className="research-notice">{message}</p>}
    {pdf&&<div className="research-pdf"><p><FileText size={16}/><a href={pdf.url} target="_blank" rel="noreferrer">{pdf.name}</a></p><object title={pdf.name} data={pdf.url} type="application/pdf"><p>Ouvrez le rapport avec le lien ci-dessus.</p></object></div>}</div>
    <p className="research-foot">Ces résultats climatiques et les simulations importées décrivent un potentiel de production. <a href="https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en" target="_blank" rel="noreferrer">Documentation JRC</a> · <a href="https://www.pvsyst.com/help/project-design/simulation/create-a-csv-file-of-hourly-daily-values.html" target="_blank" rel="noreferrer">Export PVsyst</a></p>
  </div>
}
