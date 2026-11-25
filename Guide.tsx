import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {gsap} from 'gsap'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {Box,Play,Pause,ChevronRight,ChevronLeft,Orbit,Waypoints} from 'lucide-react'
import Scene from './Scene'
import {derive} from './engine'
import {useSystem} from './store'
import {media,num} from './ui'
gsap.registerPlugin(ScrollTrigger)
const chapters=[
 ['Captation solaire','Les cellules du panneau photovoltaïque transforment la lumière reçue en électricité continue.','Panneau photovoltaïque'],
 ['Alimentation électrique','Le câblage amène l’énergie au boîtier de commande et au moteur. La tension, le courant de démarrage et le contrôleur restent à valider ensemble.','Commande électrique'],
 ['Stockage de l’eau','Le réservoir alimente le circuit. Le simulateur conserve une réserve configurable et calcule le volume réellement utilisable.','Réservoir'],
 ['Mise en pression','La pompe à moteur 545 fournit le débit qui met l’eau en mouvement dans le réseau. Le débit annoncé de 2 L/min doit être vérifié sur le prototype.','Pompe 24 V DC'],
 ['Distribution hydraulique','Les conduites transportent l’eau depuis le circuit de pompage vers la tête de distribution.','Conduites et raccords'],
 ['Arrosage du jardin','L’arroseur sphérique distribue l’eau. Le futur ESP32 reliera niveau, débit et protections à la supervision numérique.','Arroseur sphérique']]
export default function Guide({initial}:{initial:number}){
 const s=useSystem(),d=derive(s),[step,setStep]=useState(initial),[auto,setAuto]=useState(false),[diagram,setDiagram]=useState(false);const track=useRef<HTMLDivElement>(null), sticky=useRef<HTMLDivElement>(null)
 useEffect(()=>{setStep(initial)},[initial])
 useEffect(()=>{const fn=(e:Event)=>setStep((e as CustomEvent<number>).detail);window.addEventListener('floreol-chapter',fn);return()=>window.removeEventListener('floreol-chapter',fn)},[])
 useEffect(()=>{if(!auto)return;const t=setInterval(()=>setStep(v=>(v+1)%6),4600);return()=>clearInterval(t)},[auto])
 useLayoutEffect(()=>{
  const element=track.current
  if(!element||auto)return
  const wide=matchMedia('(min-width:850px) and (prefers-reduced-motion:no-preference)')
  const update=()=>{
   if(!wide.matches)return
   const top=element.getBoundingClientRect().top
   const distance=Math.max(1,element.offsetHeight-window.innerHeight+80)
   const progress=Math.min(1,Math.max(0,(80-top)/distance))
   setStep(Math.min(5,Math.floor(progress*6)))
  }
  window.addEventListener('scroll',update,{passive:true})
  const trigger=ScrollTrigger.create({trigger:element,start:'top 80px',end:'bottom 90%',onRefresh:()=>{if(element.getBoundingClientRect().top<80)update()}})
  return ()=>{window.removeEventListener('scroll',update);trigger.kill()}
 },[auto])
 function chooseChapter(index:number){
  setAuto(false);setStep(index)
  if(!track.current)return
  const box=track.current.getBoundingClientRect()
  const distance=Math.max(1,track.current.offsetHeight-window.innerHeight+80)
  const wide=matchMedia('(min-width:850px) and (prefers-reduced-motion:no-preference)').matches
  window.scrollTo({top:Math.max(0,window.scrollY+box.top-80+(wide?(index+.25)/6*distance:0)),behavior:'instant'})
 }
 return <section className="pagewrap guide"><div className="section-key"><Box size={16}/> Système interactif</div><h1>À l’intérieur de Floréol.</h1><p className="page-lead">Du rayon de soleil au jet d’eau, explorez les six étapes du prototype.</p><div ref={track} className="story-track"><div ref={sticky} className="story-sticky"><div className="guide-stage"><div className="model-cap"><span><Orbit size={15}/> Vue technique</span><button onClick={()=>setDiagram(!diagram)}><Waypoints size={15}/>{diagram?'Afficher la 3D':'Schéma des flux'}</button></div>{diagram?<iframe title="Schéma électrique et hydraulique interactif" src={media('circuit.html')}/>:<Scene chapter={step} running={!!s.active} capacity={s.config.capacityL} panelWatts={s.config.panelWp} level={d.percent}/>}</div>
 <div className="chapter-bar"><div><span className="mono">CHAPITRE {String(step+1).padStart(2,'0')} / 06</span><h2>{chapters[step][0]}</h2><p>{chapters[step][1]}</p></div><div className="button-row"><button className="iconbutton" aria-label="Chapitre précédent" onClick={()=>{setAuto(false);setStep((step+5)%6)}}><ChevronLeft/></button><button className="button outline" onClick={()=>setAuto(!auto)}>{auto?<Pause size={15}/>:<Play size={15}/>} {auto?'Pause':'Lecture auto'}</button><button className="iconbutton" aria-label="Chapitre suivant" onClick={()=>{setAuto(false);setStep((step+1)%6)}}><ChevronRight/></button></div></div>
 </div></div><nav className="chapter-list" aria-label="Chapitres du fonctionnement">{chapters.map(([title,,part],i)=><button key={title} aria-pressed={i===step} onClick={()=>chooseChapter(i)}><span className="mono">0{i+1}</span><strong>{title}</strong><small>{part}</small></button>)}</nav><a className="button solid" href="#dashboard">Superviser l’installation</a></section>
}