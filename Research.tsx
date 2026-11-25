import Weather from './Weather'
import Studies from './Studies'
import Reports from './Reports'
import './research.css'

export default function Research({tab}:{tab:'weather'|'studies'|'reports'}){
  if(tab==='weather')return <Weather/>
  if(tab==='studies')return <Studies/>
  return <Reports/>
}
