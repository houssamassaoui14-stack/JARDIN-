export interface HourForecast {at:number; temp:number; rain:number; chance:number; sun:number; wind:number; clouds:number; humidity:number}
export interface DayForecast {at:number; min:number; max:number; rain:number; chance:number; sunrise:number; sunset:number}
export interface Forecast {lat:number; lon:number; timezone:string; fetched:number; hours:HourForecast[]; days:DayForecast[]}
const finite=(v:unknown):v is number=>typeof v==='number' && Number.isFinite(v)
const epoch=(v:unknown)=>finite(v) && v>0 ? v*1000 : NaN
function value(xs:unknown,i:number) {
  if(!Array.isArray(xs) || !finite(xs[i])) throw new Error('La prévision reçue est incomplète.')
  return xs[i] as number
}
export function parseForecast(raw:Record<string,any>,lat:number,lon:number,fetched:number):Forecast {
  const h=raw.hourly, d=raw.daily
  if(!h?.time?.length || !d?.time?.length || h.time.length>400 || d.time.length>16 || !raw.timezone) throw new Error('Le service a renvoyé une prévision incomplète.')
  new Intl.DateTimeFormat('fr',{timeZone:raw.timezone})
  const hours:HourForecast[]=h.time.map((t:number,i:number)=>({
    at:epoch(t), temp:value(h.temperature_2m,i),rain:value(h.precipitation,i),chance:value(h.precipitation_probability,i),sun:value(h.shortwave_radiation,i),
    wind:value(h.wind_speed_10m,i),clouds:value(h.cloud_cover,i),humidity:value(h.relative_humidity_2m,i)
  }))
  const days:DayForecast[]=d.time.map((t:number,i:number)=>({at:epoch(t),min:value(d.temperature_2m_min,i),max:value(d.temperature_2m_max,i),rain:value(d.precipitation_sum,i),chance:value(d.precipitation_probability_max,i),sunrise:epoch(value(d.sunrise,i)),sunset:epoch(value(d.sunset,i))}))
  if(hours.some(x=>!finite(x.at)||x.chance<0||x.chance>100||x.rain<0||x.sun<0)||days.some(x=>!finite(x.at)||!finite(x.sunrise)||!finite(x.sunset))) throw new Error('La série météo contient des valeurs invalides.')
  return {lat,lon,timezone:raw.timezone,fetched,hours,days}
}
export function weatherUrl(lat:number,lon:number) {
  if(!finite(lat)||!finite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw new Error('Coordonnées hors plage.')
  const url=new URL('https://api.open-meteo.com/v1/forecast')
  const p={latitude:lat,longitude:lon,timezone:'auto',forecast_days:5,timeformat:'unixtime',hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,cloud_cover,shortwave_radiation',daily:'temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,sunrise,sunset'}
  Object.entries(p).forEach(([k,v])=>url.searchParams.set(k,String(v)))
  return url
}
const cacheKey=(lat:number,lon:number)=>'floreol.weather.'+lat.toFixed(4)+','+lon.toFixed(4)
export function cachedForecast(lat:number,lon:number):Forecast|null {
  try {
    const saved=JSON.parse(localStorage.getItem(cacheKey(lat,lon))||'null')
    if(!saved || !finite(saved.fetched)) return null
    return parseForecast(saved.raw,lat,lon,saved.fetched)
  } catch{return null}
}
export async function getForecast(lat:number,lon:number,signal?:AbortSignal) {
  const response=await fetch(weatherUrl(lat,lon),{signal:signal?AbortSignal.any([AbortSignal.timeout(9000),signal]):AbortSignal.timeout(9000)})
  if(!response.ok) throw new Error('Open-Meteo a renvoyé le statut '+response.status+'.')
  const raw=await response.json(), fetched=Date.now()
  const forecast=parseForecast(raw,lat,lon,fetched)
  try{localStorage.setItem(cacheKey(lat,lon),JSON.stringify({raw,fetched}))}catch{/* La prévision reste disponible dans cet onglet. */}
  return forecast
}
export function demoForecast(now:number,lat:number,lon:number,temperature:number,irradiance:number,rain:number,chance:number):Forecast {
  const h=3_600_000, origin=Math.floor(now/h)*h
  const tz='Africa/Casablanca', fmt=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',hourCycle:'h23'})
  const hourOf=(at:number)=>Number(fmt.format(at))
  const local=hourOf(origin), day=origin-local*h
  const daylight=(hour:number)=>Math.max(0,Math.sin((hour-6)*Math.PI/12))
  const hours=Array.from({length:5*24},(_,i)=>{
    const at=origin+i*h, hour=hourOf(at), phase=daylight(hour)
    return {at,temp:i===0?temperature:Math.round(temperature-6*(1-phase)),rain:i<3?rain/3:0,chance:i<3?chance:0,sun:i===0?irradiance:Math.round(phase*(rain>0?420:850)),wind:9+Math.round(4*phase),clouds:rain>0&&i<3?82:18,humidity:Math.round(76-phase*16)}
  })
  const days=Array.from({length:5},(_,i)=>({at:day+i*24*h,min:temperature-6,max:temperature+1,rain:i===0?rain:0,chance:i===0?chance:0,sunrise:day+(i*24+6)*h,sunset:day+(i*24+18)*h}))
  return {lat,lon,timezone:tz,fetched:now,hours,days}
}
export function rainWindow(hours:HourForecast[],at:number,horizon:number) {
  // Open-Meteo donne le cumul de l'heure qui précède l'horodatage.
  const rows=hours.filter(h=>h.at>at && h.at<=at+horizon*3_600_000)
  return {mm:rows.reduce((sum,h)=>sum+h.rain,0),probability:Math.max(0,...rows.map(h=>h.chance)),hours:rows.length}
}
