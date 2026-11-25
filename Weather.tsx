import {useEffect,useRef,useState} from 'react'
import {CloudRain,Sun,MapPin,RefreshCw,Wind,CloudSun} from 'lucide-react'
import {useSystem} from './store'
import {derive,engine} from './engine'
import {cachedForecast,demoForecast,getForecast,rainWindow} from './services/weather'
import type {Forecast} from './services/weather'

const fmt=(v:number,n=0)=>v.toLocaleString('fr-FR',{maximumFractionDigits:n})
const clock=(at:number,tz:string)=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:tz}).format(at)
export default function Weather() {
  const s=useSystem(), v=derive(s), c=s.config
  const [source,setSource]=useState<'demo'|'live'>('demo')
  const [forecast,setForecast]=useState<Forecast|null>(null), [message,setMessage]=useState(''), [busy,setBusy]=useState(false)
  const [version,setVersion]=useState(0)
  const [ruleMessage,setRuleMessage]=useState('')
  const stamp=useRef(0)
  useEffect(()=>{
    if(source!=='live')return
    const abort=new AbortController(), key=++stamp.current
    const cache=cachedForecast(c.latitude,c.longitude)
    setForecast(cache);setBusy(true);setMessage('')
    getForecast(c.latitude,c.longitude,abort.signal).then(data=>{if(key===stamp.current)setForecast(data)}).catch(()=>{
      if(key===stamp.current)setMessage(cache?'Service indisponible. Dernière prévision conservée, datée ci-dessous.':'Prévisions Open-Meteo indisponibles pour ce lieu. La démonstration reste accessible.')
    }).finally(()=>{if(key===stamp.current)setBusy(false)})
    return ()=>{stamp.current++;abort.abort()}
  },[source,c.latitude,c.longitude,version])
  const data=source==='demo'?demoForecast(s.now,c.latitude,c.longitude,v.temperatureC,v.irradiance,v.rainMm,v.rainChance):forecast
  const reference=source==='demo'?s.now:Date.now(), nowHour=Math.floor(reference/3600000)*3600000
  const upcoming=data?.hours.filter(h=>h.at>=nowHour)??[]
  const current=upcoming[0], timezone=data?.timezone||'Africa/Casablanca'
  const cachedExpired=!!data&&!current
  const rain=source==='demo'?{mm:v.rainMm,probability:v.rainChance,hours:Math.min(3,c.rainHorizonH)}:rainWindow(data?.hours??[],nowHour,c.rainHorizonH)
  const significant=rain.hours>0 && rain.mm>=c.rainThresholdMm&&rain.probability>=c.rainThresholdPct
  function changeRule(form:HTMLFormElement){
    const value=new FormData(form)
    const err=engine.configure({rainGuard:value.has('guard'),rainHorizonH:Number(value.get('hours')),rainThresholdMm:Number(value.get('mm')),rainThresholdPct:Number(value.get('chance'))})
    setRuleMessage(err||'Règle de démonstration enregistrée.')
  }
  const weatherIcon=source==='demo'&&s.scenario==='night'?<CloudSun/>:current&&current.chance>=50?<CloudRain/>:<Sun/>
  return <div className="research-content">
    <div className="research-toolbar"><div className="research-segment" aria-label="Source météo">{(['demo','live'] as const).map(key=><button key={key} type="button" aria-pressed={source===key} onClick={()=>setSource(key)}>{key==='demo'?'Scénario local':'Open-Meteo'}</button>)}</div>
      {source==='live'&&<button className="research-button" disabled={busy} onClick={()=>setVersion(x=>x+1)}><RefreshCw size={16}/>{busy?'Actualisation…':'Actualiser'}</button>}</div>
    {message&&<p role="status" className="research-notice">{message}</p>}
    {busy&&!data&&<p role="status">Chargement des prévisions météo…</p>}
    {data&&<><div className="research-feature weather-feature">
      <div><div className="research-kicker"><MapPin size={16}/>{c.city} · {source==='demo'?'Météo simulée':'Prévisions Open-Meteo'}</div><div className="research-big">{current?fmt(current.temp)+'°':'—'}</div>
      <p>{current ? (current.chance>=50?'Passage pluvieux prévu':current.clouds>=55?'Ciel couvert':'Ciel peu nuageux') : 'Horizon de prévision dépassé'}</p>
      <small>{source==='demo'?'Horloge du simulateur':'Prévision récupérée le'} {new Date(data.fetched).toLocaleString('fr-FR',{timeZone:timezone})} · {timezone}</small></div>
      <div aria-hidden="true" className="weather-symbol">{weatherIcon}</div></div>
      {current&&<><div className="research-measures">{[['Humidité',fmt(current.humidity)+' %'],['Vent',fmt(current.wind,1)+' km/h'],['Nébulosité',fmt(current.clouds)+' %'],['Rayonnement horizontal',fmt(current.sun)+' W/m²']].map(([k,value])=><div key={k}><small>{k}</small><strong>{value}</strong></div>)}</div>
      <div className="research-panel"><h3>Les prochaines heures</h3><div className="research-hours">{upcoming.slice(0,8).map(h=><div key={h.at}><small>{clock(h.at,timezone)}</small>{h.chance>=50?<CloudRain aria-hidden/>:<CloudSun aria-hidden/>}<strong>{fmt(h.temp)}°</strong><span>{fmt(h.rain,1)} mm</span></div>)}</div></div></>}
      <div className="research-panel"><h3>Sur cinq jours</h3><div className="research-scroll"><table><thead><tr>{['Jour','Min. / max.','Pluie','Probabilité','Lever / coucher'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.days.map(d=><tr key={d.at}><th>{new Date(d.at).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:timezone})}</th><td>{fmt(d.min)}° / {fmt(d.max)}°</td><td>{fmt(d.rain,1)} mm</td><td>{fmt(d.chance)} %</td><td>{clock(d.sunrise,timezone)} / {clock(d.sunset,timezone)}</td></tr>)}</tbody></table></div></div>
      {!cachedExpired&&<div className={'research-panel '+(significant?'rain-alert':'')}><div className="research-kicker"><CloudRain size={16}/>Protection pluie</div><h3>{significant?'Report d’arrosage conseillé':'Prévision sous les seuils de report'}</h3><p>{fmt(rain.mm,1)} mm prévus, probabilité maximale {fmt(rain.probability)} % dans les {c.rainHorizonH} prochaines heures. {source==='live'?'Cette consultation météo est indépendante du scénario de la soutenance.':'La règle automatique utilise les prévisions du scénario actif.'}</p></div>}
    </>}
    <details className="research-panel"><summary>Localisation de l’installation</summary><form key={c.city+','+c.latitude+','+c.longitude} className="research-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setRuleMessage(engine.configure({city:String(f.get('city')).trim(),latitude:Number(f.get('lat')),longitude:Number(f.get('lon'))})||'Localisation enregistrée.')}}><label>Lieu<input name="city" defaultValue={c.city} maxLength={80} required/></label><label>Latitude (°)<input type="number" name="lat" defaultValue={c.latitude} min="-90" max="90" step="any" required/></label><label>Longitude (°)<input type="number" name="lon" defaultValue={c.longitude} min="-180" max="180" step="any" required/></label><button className="research-button">Enregistrer le lieu</button></form></details>
    <details className="research-panel"><summary>Configurer la protection pluie du simulateur</summary><form className="research-form" onSubmit={e=>{e.preventDefault();changeRule(e.currentTarget)}}><label>Cumul minimum (mm)<input name="mm" defaultValue={c.rainThresholdMm} type="number" min=".1" max="200" step=".1" required/></label><label>Probabilité minimum (%)<input name="chance" defaultValue={c.rainThresholdPct} type="number" min="1" max="100" required/></label><label>Horizon (h)<input name="hours" defaultValue={c.rainHorizonH} type="number" min="1" max="48" required/></label><label className="research-check"><input type="checkbox" defaultChecked={c.rainGuard} name="guard"/>Report automatique</label><button className="research-button">Enregistrer la règle</button></form></details>
    {ruleMessage&&<p role="status">{ruleMessage}</p>}
    <p className="research-foot"><Wind size={15}/>Données de prévision issues des modèles météo. <a href="https://open-meteo.com/" rel="noreferrer" target="_blank">Open-Meteo · CC BY 4.0</a></p>
  </div>
}
