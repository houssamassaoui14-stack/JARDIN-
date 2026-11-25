import {useId,useState} from 'react'
import {num,time} from './ui'
import {useSystem} from './store'
import {environment} from './engine/math'
export function SolarChart(){
 const s=useSystem(), id=useId().replace(/:/g,''),[period,setPeriod]=useState(24),[hover,setHover]=useState<number|null>(null)
 const start=s.now-period*3600000
 const bins=Array.from({length:49},(_,i)=>{const at=start+(s.now-start)*i/48
 const sample=s.samples.filter(x=>x.at<=at&&at-x.at<=900000).at(-1)
 return {at,observed:sample?.pvW??null,reference:sample?.expectedW??environment(s.config,at,'clear').expectedW}})
 bins[bins.length-1]={at:s.now,observed:environment(s.config,s.now,s.scenario).pvW,reference:environment(s.config,s.now,s.scenario).expectedW}
 const W=660,H=150,max=Math.max(1,...bins.flatMap(v=>[v.reference,v.observed||0]))*1.12
 const x=(i:number)=>i*W/48,y=(v:number)=>H-4-v/max*(H-12)
 const line=(key:'observed'|'reference')=>{let pen=false;return bins.map((b,i)=>{const v=b[key];if(v===null){pen=false;return ''}const cmd=pen?'L':'M';pen=true;return cmd+x(i).toFixed(1)+' '+y(v).toFixed(1)}).join(' ')}
 const series=line('observed'),first=bins.findIndex(v=>v.observed!==null),picked=hover===null?null:bins[hover]
 return <div className="chart-box"><div className="panel-title"><div><span className="section-key">Énergie photovoltaïque</span><h3>Courbe de production</h3></div><select aria-label="Période de production" value={period} onChange={e=>{setPeriod(+e.target.value);setHover(null)}}><option value="6">6 heures</option><option value="12">12 heures</option><option value="24">24 heures</option></select></div><div className="chart-legend"><span><i/>Production simulée</span><span><i/>Référence estimée</span><b>W</b></div>
 <svg viewBox={'0 0 '+W+' '+H} role="img" tabIndex={0} aria-label="Production solaire simulée et référence en watts, flèches pour parcourir" onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setHover(Math.max(0,Math.min(48,(hover??0)+(e.key==='ArrowRight'?1:-1))))}}} onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(48,Math.round((e.clientX-box.left)/box.width*48))))}} onPointerLeave={()=>setHover(null)}>
 <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#52ddc8" stopOpacity=".30"/><stop offset="1" stopColor="#52ddc8" stopOpacity=".015"/></linearGradient></defs>{[0,1,2,3].map(i=><line key={i} x1="0" y1={8+i*(H-12)/3} x2={W} y2={8+i*(H-12)/3} stroke="var(--line)" strokeDasharray="3 5"/>)}{first>=0&&<path d={series+' L'+W+' '+H+' L'+x(first)+' '+H+' Z'} fill={'url(#'+id+')'}/>}<path d={line('reference')} fill="none" stroke="#eac37b" strokeWidth="2" strokeDasharray="4 4"/><path d={series} fill="none" stroke="var(--aqua)" strokeWidth="3" strokeLinejoin="round"/>{hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="currentColor" strokeDasharray="2 4"/>}</svg>
 <div className="chart-axis">{[0,12,24,36,48].map(i=><span key={i}>{time(bins[i].at)}</span>)}</div><p className="chart-read">{picked?time(picked.at)+' · Référence '+num(picked.reference)+' W · Simulation '+num(picked.observed)+' W':'La trace simulée commence au premier échantillon disponible.'}</p></div>
}