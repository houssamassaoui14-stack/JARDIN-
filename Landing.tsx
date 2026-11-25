import {lazy,Suspense,useLayoutEffect,useRef,useState} from 'react'
import {gsap} from 'gsap'
import {Box,Layers3,PanelsTopLeft,MapPin,Droplets,Sun,Activity,Cpu,ChevronDown,Orbit,ArrowUpRight,BookOpen,Wind} from 'lucide-react'
import {derive} from './engine'
import {useSystem} from './store'
import {media,num} from './ui'
const Scene=lazy(()=>import('./Scene'))
export default function Landing(){
 const state=useSystem(),d=derive(state),ref=useRef<HTMLDivElement>(null),[intro,setIntro]=useState(()=>!sessionStorage.getItem('floreol-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
 useLayoutEffect(()=>{if(!intro)return;sessionStorage.setItem('floreol-intro','1');const done=window.setTimeout(()=>setIntro(false),1150);const ctx=gsap.context(()=>{gsap.from('.hero-in',{y:17,stagger:.07,opacity:0,duration:.65,ease:'power2.out',onComplete:()=>setIntro(false)})},ref);return()=>{clearTimeout(done);ctx.revert()}},[intro])
 return <div ref={ref}><section className="landing" aria-labelledby="herotitle">
 <div className="hero-shell"><div className="hero-grid"><div className="hero-copy"><div className="hero-kicker hero-in"><i/> LABORATOIRE D’ARROSAGE SOLAIRE</div>
 <h1 id="herotitle" className="hero-in">L’eau intelligente.<br/><em>L’énergie naturelle.</em></h1>
 <p className="hero-in hero-lead">Explorez notre prototype d’arrosage solaire en 3D et pilotez l’eau et l’énergie depuis une seule plateforme.</p>
 <div className="hero-actions hero-in"><a className="button solid" href="#systeme"><Box size={17}/> Explorer le système</a><a className="button outline" aria-label="Accéder au Control Center" href="#dashboard"><PanelsTopLeft size={17}/> Control Center</a></div>
 <div className="hero-location hero-in"><MapPin size={15}/><span>IFMEREE Tanger</span><b/>Projet académique</div></div>
 <div className="model-wrap"><div className="model-cap"><span><i className="crossmark"/> JUMEAU NUMÉRIQUE</span><span><Box size={13}/> GLB</span></div><Suspense fallback={<img className="scene-poster" src={media('installation.webp')} alt="Maquette du système Floréol"/>}><Scene level={d.percent} panelWatts={state.config.panelWp} capacity={state.config.capacityL} running={!!state.active}/></Suspense></div>
 </div><div className="instrument"><div className="instrument-heading"><div><Activity size={15}/> Télémétrie du système</div><span><i className="status-dot"/> Mode démonstration <span className="emdash">—</span> données simulées</span></div>
 <div className="instruments">{[
 {p:'water',icon:<Droplets/>,label:'Volume du réservoir',value:num(state.volumeL),unit:'L',sub:'sur '+num(state.config.capacityL)+' L',c:'water'},
 {p:'solar',icon:<Sun/>,label:'Production solaire',value:num(d.pvW),unit:'W',sub:'estimation instantanée',c:'solar'},
 {p:'irrigation',icon:<Activity/>,label:'Pompe d’arrosage',value:state.active?'En marche':'En veille',unit:'',sub:'moteur 545 · 24 V DC',c:'pump'},
 {p:'iot',icon:<Cpu/>,label:'Connexion ESP32',value:'Hors ligne',unit:'',sub:'extension prévue',c:'iot'}].map(x=><a className={'station '+x.c} key={x.p} href={'#'+x.p}><div className="station-label">{x.icon}<span>{x.label}</span></div><strong>{x.value} <small>{x.unit}</small></strong><span className="station-sub">{x.sub}</span></a>)}</div></div>
 <div className="hero-bottom"><a href="#systeme"><ChevronDown size={15}/> Découvrir le fonctionnement</a><span>Floréol <span className="slash">/</span> IFMEREE Tanger</span></div>
 </div>{intro&&<button className="skip-intro" onClick={()=>setIntro(false)}>Passer l’introduction</button>}</section>
 <section className="home-project pagewrap"><div><div className="section-key"><BookOpen size={16}/> Le projet Floréol</div><h2>Du jardin au<br/>prototype solaire.</h2><p>À Tanger, quatre étudiants réunissent l’énergie photovoltaïque, l’hydraulique et la supervision numérique dans un même projet de formation.</p><a href="#projet" className="text-link">Découvrir le projet <ArrowUpRight size={16}/></a></div><a href="#projet" className="garden-frame"><img src={media('jardin.webp')} loading="lazy" alt="Vue de la conception du jardin réalisée dans Blender"/></a></section></div>
}