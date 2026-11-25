import {useEffect,useState,lazy,Suspense} from 'react'
import {Activity,Box,Sun,Moon,Presentation,Menu,X,MapPin,ChevronRight,Waves,Layers3,Maximize2,Pause,Play,ChevronLeft,RotateCcw,AudioLines} from 'lucide-react'
import {engine} from './engine'
import {goto,media,Dialog} from './ui'
import Landing from './Landing'
const Controls=lazy(()=>import('./Controls'))
const Project=lazy(()=>import('./Project'))
const Guide=lazy(()=>import('./Guide'))
const Assistant=lazy(()=>import('./Assistant'))
const researchPages=['weather','studies','reports']
const controls=['dashboard','water','solar','irrigation','schedule','alerts','iot','settings',...researchPages]
const jurySteps=[
 ['Floréol','accueil','Découvrez le prototype d’arrosage solaire de l’IFMEREE Tanger.'],
 ['Le prototype','systeme','Faites pivoter la maquette et sélectionnez un composant.'],
 ['L’énergie solaire','solar','L’irradiance et la puissance nominale déterminent la production estimée.'],
 ['Le circuit hydraulique','systeme','Suivez le trajet de l’eau du réservoir jusqu’à l’arroseur.'],
 ['Les réserves d’eau','water','La réserve de sécurité réduit le volume utilisable pour les cycles.'],
 ['Un cycle de dix minutes','irrigation','Observez le débit, le compte à rebours et la diminution du volume à vitesse ×60.'],
 ['La protection pluie','weather','Une prévision de pluie significative peut reporter un arrosage.'],
 ['Un panneau ombragé','solar','Comparez la référence et la production simulée sous ombrage.'],
 ['Les rapports','reports','Retrouvez le cycle enregistré et exportez les feuilles Excel.'],
 ['Floréol AI','dashboard','Interrogez l’assistant sur l’autonomie de l’installation.'],
 ['L’équipe','equipe','Quatre étudiants et leur encadrante portent le projet à Tanger.'],
 ['La suite du prototype','iot','La télémétrie et les commandes physiques attendent l’intégration matérielle.']]
function getPage(){return decodeURI(location.hash.slice(1).split('?')[0]||'accueil')}
export default function App(){
 const [page,setPage]=useState(getPage),[menu,setMenu]=useState(false),[assistant,setAssistant]=useState(false),[jury,setJury]=useState(-1),[auto,setAuto]=useState(false),[reset,setReset]=useState(false),[juryNote,setJuryNote]=useState(''),[theme,setTheme]=useState(()=>localStorage.getItem('floreol-theme')||'dark')
 useEffect(()=>engine.mount(),[])
 useEffect(()=>{const fn=()=>{setPage(getPage());setMenu(false);window.scrollTo({top:0,behavior:'instant'})};window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[])
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('floreol-theme',theme)},[theme])
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(jury<0||document.querySelector('dialog[open]')||(e.target instanceof HTMLElement&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)))return;if(e.key==='ArrowRight')setJury(Math.min(11,jury+1));if(e.key==='ArrowLeft')setJury(Math.max(0,jury-1));if(e.key==='Escape'){setJury(-1);setAuto(false)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[jury])
 useEffect(()=>{if(jury<0)return;goto(jurySteps[jury][1]);setJuryNote('');setAssistant(jury===9)
 if(jury===3)window.dispatchEvent(new CustomEvent('floreol-chapter',{detail:4}))
 if(jury===5){engine.setScenario('clear');engine.setSpeed(60);if(!engine.getSnapshot().active){const err=engine.start(10);if(err)setJuryNote(err)}}
 if(jury===6)engine.setScenario('rain');if(jury===7)engine.setScenario('shade');if(jury===8)engine.setScenario('clear')
 if(jury===11)setAuto(false)
 },[jury])
 useEffect(()=>{if(!auto||jury<0)return;const t=setTimeout(()=>setJury(Math.min(11,jury+1)),jury===5?12500:10500);return()=>clearTimeout(t)},[auto,jury])
 const inControl=controls.includes(page)
 const nav=[['accueil','Accueil'],['systeme','Le système'],['dashboard','Control Center'],['projet','Le projet'],['equipe','Équipe']]
 function finish(){setJury(-1);setAuto(false);setAssistant(false);if(document.fullscreenElement)void document.exitFullscreen()}
 return <><a className="skip" href="#contenu" onClick={e=>{e.preventDefault();document.getElementById('contenu')?.focus()}}>Accéder au contenu</a>
 <header className="mast"><div className="mast-inner"><a className="brand" href="#accueil" aria-label="Floréol, accueil"><img src={media('logo.webp')} alt="Floréol"/></a>
 <nav aria-label="Navigation principale" className={menu?'primary opened':'primary'}>{nav.map(([p,label])=><a key={p} href={'#'+p} onClick={()=>setMenu(false)} aria-current={(p===page||(p==='dashboard'&&inControl))?'page':undefined}>{label}</a>)}</nav>
 <div className="mast-actions"><button aria-label={theme==='dark'?'Activer le thème clair':'Activer le thème sombre'} className="theme-switch iconbutton" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button><button className="jury-btn" onClick={()=>{setMenu(false);setJury(0)}}><Presentation size={16}/> Mode jury</button><button className="menu-btn iconbutton" onClick={()=>setMenu(!menu)} aria-label="Menu principal" aria-expanded={menu}>{menu?<X/>:<Menu/>}</button></div></div></header>
 <main id="contenu" tabIndex={-1} className={jury>=0?'with-jury':''}><Suspense fallback={<div className="loading">Chargement de la vue…</div>}>{page==='accueil'?<Landing/>:page==='systeme'?<Guide initial={jury===3?4:0}/>:inControl?<Controls page={page}/>:page==='projet'||page==='equipe'?<Project team={page==='equipe'}/>:<section className="pagewrap"><h1>Page introuvable</h1><a className="button solid" href="#accueil">Retour à l’accueil</a></section>}</Suspense></main>
 <footer><div className="footer-inner"><a href="#accueil"><img src={media('logo.webp')} alt="Floréol"/></a><span>Projet académique · IFMEREE Tanger</span><a href="#projet">À propos du projet</a><a href="#equipe">Équipe et contact</a></div></footer>
 {jury<0&&<button className="assistant-launch" onClick={()=>setAssistant(true)} aria-label="Ouvrir Floréol AI"><AudioLines size={20}/><span>Floréol AI</span></button>}
 {assistant&&<Suspense fallback={null}><Assistant close={()=>setAssistant(false)}/></Suspense>}
 {jury>=0&&<div className="jury-bar" role="region" aria-label="Visite guidée du jury"><div className="jury-txt"><span className="mono">JURY EXPERIENCE · {jury+1} / 12</span><strong>{jurySteps[jury][0]}</strong><p>{juryNote||jurySteps[jury][2]}</p></div><div className="jury-controls"><button className="iconbutton" title="Étape précédente" aria-label="Étape précédente" disabled={jury===0} onClick={()=>setJury(jury-1)}><ChevronLeft/></button><button className="iconbutton" aria-label={auto?'Pause':'Lecture automatique'} title="Lecture automatique" onClick={()=>setAuto(!auto)}>{auto?<Pause/>:<Play/>}</button><button className="iconbutton" title="Étape suivante" aria-label="Étape suivante" disabled={jury===11} onClick={()=>setJury(jury+1)}><ChevronRight/></button><button className="iconbutton" title="Plein écran" aria-label="Plein écran" onClick={()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>setJuryNote('Plein écran indisponible dans cette fenêtre.'));else void document.exitFullscreen()}}><Maximize2/></button><button className="iconbutton" title="Réinitialiser la démonstration" aria-label="Réinitialiser la démonstration" onClick={()=>setReset(true)}><RotateCcw/></button><button className="iconbutton" title="Quitter la visite" aria-label="Quitter la visite" onClick={finish}><X/></button></div><progress max="12" value={jury+1}/></div>}
 {reset&&<Dialog title="Réinitialiser la démonstration ?" close={()=>setReset(false)}><p>Les cycles, programmes, réglages et mesures simulés de ce navigateur seront effacés. Une sauvegarde est disponible dans Rapports.</p><button className="button solid" onClick={()=>{engine.reset();setJury(0);setReset(false)}}>Réinitialiser les données fictives</button></Dialog>}</>
}
export {Activity,Box,MapPin,Waves,Layers3}