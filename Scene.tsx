import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Box, CircleHelp, Maximize2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import type { AnimationMixer, Object3D, WebGLRenderer } from 'three'
import './scene.css'

const MEDIA = import.meta.env.BASE_URL + 'media/'
type Vec = [number, number, number]
type Part = 'solar' | 'tank' | 'pump' | 'sprinkler' | 'control' | 'pipe'
type Inspection = { name: string, node: string, anchor: Vec, position: Vec, width: number }
const PARTS: Record<Part, Inspection> = {
  solar: { name: 'Panneau photovoltaïque', node: 'Module photovoltaïque', anchor: [1.38,.37,-1.81], position: [2.15,1.04,-.92], width: .95 },
  tank: { name: 'Réservoir', node: 'Réservoir', anchor: [.67,.45,-1.71], position: [.04,.84,-.78], width: .97 },
  pump: { name: 'Pompe DC', node: 'Pompe électrique', anchor: [1.08,.20,-1.52], position: [1.38,.41,-1.01], width: .51 },
  sprinkler: { name: 'Arroseur sphérique', node: 'Arroseur sphérique', anchor: [0,1.17,0], position: [1.18,1.46,1.48], width: 1.39 },
  control: { name: 'Boîtier de commande', node: 'Commande et protection DC', anchor: [1.02,.23,-1.8], position: [1.41,.58,-1.16], width: .71 },
  pipe: { name: 'Conduites et raccords', node: 'Conduites et raccords', anchor: [.66,.09,-.32], position: [4.54,2.95,1.84], width: 4.9 },
}
const MARKERS: Part[] = ['sprinkler', 'solar', 'tank', 'pump']
const CHAPTERS: Part[] = ['solar','control','tank','pump','pipe','sprinkler']
type Engine = { focus: (part?: Part) => void, zoom: (factor: number) => void, rotate: (angle: number) => void, dispose: () => void }
type Props = { running?: boolean, chapter?: number, compact?: boolean, level?: number, panelWatts?: number, capacity?: number }
const number = (v: number) => v.toLocaleString('fr-FR',{maximumFractionDigits:1})

export default function Scene({ running = false, chapter, compact = false, level = 100, panelWatts = 50, capacity = 500 }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const engine = useRef<Engine | null>(null)
  const pins = useRef<Partial<Record<Part, HTMLButtonElement | null>>>({})
  const [status, setStatus] = useState<'loading'|'live'|'poster'>('loading')
  const [selected, setSelected] = useState<Part>()
  const [stationView,setStationView]=useState(false)
  const stationRef=useRef(false)
  const [preview, setPreview] = useState(false)
  const [help, setHelp] = useState(false)
  const [visible, setVisible] = useState(false)
  const statusId = useId()
  const selectedRef = useRef<Part | undefined>(undefined)
  selectedRef.current = selected
  const props = useRef({ running, chapter, preview, compact })
  props.current = { running, chapter, preview, compact }

  const captions: Record<Part,string> = {
    solar: `${number(panelWatts)} Wc de puissance nominale configurée. Les cellules transforment la lumière en courant continu.`,
    tank: `${number(capacity)} L de capacité configurée. Le niveau numérique est de ${number(level)} %.`,
    pump: 'Le moteur 545 fonctionne en 24 V DC. La pompe aspire l’eau de la réserve et la refoule dans la conduite.',
    sprinkler: 'Les arceaux perforés répartissent l’eau autour de la tête sphérique.',
    control: 'Le coffret regroupe les liaisons de commande et de protection du circuit électrique.',
    pipe: 'Le circuit hydraulique relie la réserve à la pompe, puis à la tête de distribution.',
  }

  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin:'140px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const seen = useRef(false)
  if (visible) seen.current = true
  const initialize = seen.current
  const isVisible = useRef(visible)
  isVisible.current = visible

  useEffect(() => {
    const host = viewport.current
    if (!host || !initialize) return
    let closed = false
    let clean: (() => void) | undefined
    let activeRenderer: WebGLRenderer | undefined
    const start = async () => {
      const [T, { OrbitControls }, { GLTFLoader }, { RoundedBoxGeometry }] = await Promise.all([
        import('three'), import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
      ])
      if (closed) return
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      activeRenderer = renderer
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.6))
      renderer.setClearColor(0,0)
      renderer.outputColorSpace = T.SRGBColorSpace
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.04
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = T.PCFSoftShadowMap
      renderer.shadowMap.autoUpdate = false
      renderer.domElement.setAttribute('aria-hidden', 'true')
      host.prepend(renderer.domElement)
      const scene = new T.Scene()
      const camera = new T.OrthographicCamera(-1,1,1,-1,.015,65)
      const orbit = new OrbitControls(camera, renderer.domElement)
      orbit.enableDamping = true
      orbit.enablePan = false
      orbit.minPolarAngle = .18
      orbit.maxPolarAngle = Math.PI / 2.08
      orbit.minZoom = .65
      orbit.maxZoom = 10
      orbit.rotateSpeed = .62
      // Keep the document scrollable on wheel. The two buttons and pinch gesture zoom the viewer.
      orbit.enableZoom = false
      let lastPinch = 0
      const touches = new Map<number, {x:number,y:number}>()
      const down = (event: PointerEvent) => {
        if (event.pointerType === 'touch') touches.set(event.pointerId,{x:event.clientX,y:event.clientY})
        if (touches.size < 2) lastPinch = 0
      }
      const move = (event: PointerEvent) => {
        if (!touches.has(event.pointerId)) return
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY})
        if (touches.size !== 2) return
        const [a,b] = [...touches.values()]
        const distance = Math.hypot(b.x-a.x,b.y-a.y)
        if (lastPinch > 0) zoom(distance/lastPinch)
        lastPinch = distance
      }
      const up = (event: PointerEvent) => { touches.delete(event.pointerId); lastPinch = 0 }
      host.addEventListener('pointerdown',down)
      host.addEventListener('pointermove',move)
      host.addEventListener('pointerup',up)
      host.addEventListener('pointercancel',up)
      const ambient = new T.HemisphereLight(0xdfeeff,0x94a5a7,2.3)
      const main = new T.DirectionalLight(0xffefdc,3.6)
      main.position.set(3.5,6,2.8)
      main.castShadow = true
      main.shadow.mapSize.set(1024,1024)
      main.shadow.camera.left = -4
      main.shadow.camera.right = 4
      main.shadow.camera.top = 4
      main.shadow.camera.bottom = -4
      main.shadow.normalBias=.002
      main.shadow.bias=-.0006
      const rim = new T.DirectionalLight(0xa5e6fa,2.5)
      rim.position.set(-2.6,3,-4)
      scene.add(ambient,main,rim)
      // A neutral, locally generated environment gives the source metals readable reflections.
      const envCanvas = document.createElement('canvas')
      envCanvas.width = 256
      envCanvas.height = 128
      const ctx = envCanvas.getContext('2d')
      let environment: ReturnType<typeof makeEnvironment> | undefined
      function makeEnvironment(context: CanvasRenderingContext2D) {
        const gradient = context.createLinearGradient(0,0,0,128)
        gradient.addColorStop(0,'#f0f4ff'); gradient.addColorStop(.44,'#8aa6b6')
        gradient.addColorStop(.54,'#29373e'); gradient.addColorStop(1,'#6f7877')
        context.fillStyle=gradient;context.fillRect(0,0,256,128)
        context.fillStyle='#ffffff';context.fillRect(17,18,43,39);context.fillRect(170,26,20,37)
        const texture = new T.CanvasTexture(envCanvas)
        texture.mapping=T.EquirectangularReflectionMapping
        texture.colorSpace=T.SRGBColorSpace
        return texture
      }
      if(ctx) {environment = makeEnvironment(ctx); scene.environment = environment;scene.environmentIntensity=.85}
      function plate(width:number, length:number, depth:number, y:number, color:number) {
        const geometry = new RoundedBoxGeometry(width,depth,length,3,Math.min(depth*.43,.052))
        const mesh = new T.Mesh(geometry,new T.MeshStandardMaterial({color,metalness:.28,roughness:.42}))
        mesh.position.set(.69,y,.09)
        mesh.receiveShadow=true
        scene.add(mesh)
      }
      plate(2.22,4.52,.16,-.128,0x293f49)
      plate(2.12,4.43,.052,-.219,0x1e333c)
      const homeTarget = new T.Vector3(.62,.47,.02)
      const homeEye = new T.Vector3(6.35,3.45,2.82)
      orbit.target.copy(homeTarget)
      camera.position.copy(homeEye)
      const endTarget = homeTarget.clone()
      const endEye = homeEye.clone()
      let endZoom=1,transition=false,waiting=true,width=1,height=1,frame=0,previous=0,dirty=true
      let effectPhase: number | undefined
      let mixer: AnimationMixer | undefined, effects: Object3D | undefined, duration=16, playing=false
      let focused: Part | undefined
      const reduced = matchMedia('(prefers-reduced-motion: reduce)')
      function resize(){
        const rect=host!.getBoundingClientRect()
        dirty=true
        width=Math.max(1,rect.width);height=Math.max(1,rect.height)
        const aspect=width/height
        const size=Math.max(5.45,2.78*aspect)
        camera.left=-size/2;camera.right=size/2;camera.top=size/(2*aspect);camera.bottom=-camera.top
        camera.updateProjectionMatrix()
        renderer.setSize(width,height,false)
        if(focused) focus(focused,true)
      }
      function focus(part?:Part,immediate=false){
        focused=part
        dirty=true
        if(part) {
          endTarget.fromArray(PARTS[part].anchor);endEye.fromArray(PARTS[part].position)
          endZoom=Math.min(9,(camera.right-camera.left)/(PARTS[part].width*Math.max(1,width/height/1.55)))
        } else if(stationRef.current){endTarget.set(1.02,.25,-1.72);endEye.set(2.35,1.14,-.32);endZoom=Math.min(4.8,(camera.right-camera.left)/1.7)} else {endTarget.copy(homeTarget);endEye.copy(homeEye);endZoom=1}
        transition=true
        if(immediate||reduced.matches) {
          camera.position.copy(endEye);orbit.target.copy(endTarget);camera.zoom=endZoom;camera.updateProjectionMatrix();orbit.update();transition=false
        }
      }
      function zoom(factor:number){
        if(!Number.isFinite(factor)) return
        transition=false
        dirty=true
        camera.zoom=T.MathUtils.clamp(camera.zoom*factor,orbit.minZoom,orbit.maxZoom)
        camera.updateProjectionMatrix()
      }
      function rotate(angle:number){
        transition=false
        const anglePosition=camera.position.clone().sub(orbit.target).applyAxisAngle(new T.Vector3(0,1,0),angle)
        camera.position.copy(orbit.target).add(anglePosition)
        orbit.update()
      }
      orbit.addEventListener('start',()=>{transition=false})
      orbit.addEventListener('change',()=>{dirty=true})
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      const point=new T.Vector3()
      function tick(now:number){
        frame=requestAnimationFrame(tick)
        const dt=previous?Math.min(.1,(now-previous)/1000):0
        previous=now
        if(!isVisible.current || document.hidden || waiting) return
        const phase = props.current.chapter
        const chapterFlow = phase !== undefined && phase!==2
        const drawFlow = props.current.running || props.current.preview || chapterFlow
        const phaseChanged=phase!==effectPhase
        const change=playing!==drawFlow || phaseChanged
        const windowStarts=[.6,3.4,0,7.3,8.3,12]
        const windowEnds=[3.3,6.6,0,10.9,12.3,15.85]
        const inChapter=chapterFlow && !props.current.preview && !props.current.running
        const beginning=inChapter ? windowStarts[phase!] : props.current.running ? Math.min(12,duration*.77) : 0
        const end=inChapter ? windowEnds[phase!] : duration
        if(effects) effects.visible=drawFlow
        if(mixer && drawFlow) {
          if(!playing || phaseChanged) mixer.setTime(beginning)
          if(!reduced.matches || props.current.preview) {
            mixer.update(dt)
            if(mixer.time>=end-.02) mixer.setTime(beginning)
          } else if(change) mixer.setTime(Math.max(beginning,end-.15))
        }
        playing=drawFlow
        effectPhase=phase
        if(change) dirty=true
        if(transition) {
          const frac=1-Math.exp(-dt*7)
          camera.position.lerp(endEye,frac);orbit.target.lerp(endTarget,frac)
          camera.zoom+= (endZoom-camera.zoom)*frac
          camera.updateProjectionMatrix()
          if(camera.position.distanceToSquared(endEye)<.00002 && Math.abs(camera.zoom-endZoom)<.002) transition=false
        }
        orbit.update()
        if(!dirty && !transition && (!drawFlow || reduced.matches && !props.current.preview)) return
        dirty=false
        if(!focused && !props.current.compact) {
          for(const part of MARKERS) {
            const button=pins.current[part]
            if(!button) continue
            point.fromArray(PARTS[part].anchor).project(camera)
            button.style.left=((point.x+1)*width*.5)+'px'
            button.style.top=((1-point.y)*height*.5)+'px'
            button.style.visibility=Math.abs(point.x)>.96||Math.abs(point.y)>.94?'hidden':'visible'
          }
        }
        renderer.render(scene,camera)
      }
      const dispose=()=>{
        cancelAnimationFrame(frame);resizeObserver.disconnect();orbit.dispose();mixer?.stopAllAction()
        host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move)
        host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up)
        const materials = new Set<import('three').Material>()
        scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of ([] as import('three').Material[]).concat(o.material)) materials.add(m)}})
        materials.forEach(m=>m.dispose())
        main.shadow.dispose();environment?.dispose();renderer.dispose();renderer.domElement.remove()
      }
      clean=dispose
      engine.current={focus,zoom,rotate,dispose}
      const model=await new GLTFLoader().loadAsync(MEDIA+'installation.glb')
      if(closed) {model.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of ([] as import('three').Material[]).concat(o.material)) m.dispose()}});return}
      model.scene.traverse(o=>{
        if(o.userData.name?.startsWith('Démonstration') || o.name.startsWith('Démonstration')) effects=o
        if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true}
      })
      if(effects) effects.visible=false
      const clip=model.animations.find(a=>a.name==='Cycle d’arrosage')
      if(clip) {mixer=new T.AnimationMixer(model.scene);mixer.clipAction(clip).play();duration=clip.duration}
      // Use the original physical group names, retained by GLTFLoader in userData.name.
      const partNodes=new Map<Object3D,Part>()
      model.scene.traverse(o=>{
        for(const [key,spec] of Object.entries(PARTS)) {
          if(o.userData.name===spec.node || o.name===spec.node || o.userData.part===key) partNodes.set(o,key as Part)
        }
      })
      let pointerStart: {x:number,y:number} | undefined
      const pickStart=(e:PointerEvent)=>{pointerStart={x:e.clientX,y:e.clientY}}
      const pickEnd=(e:PointerEvent)=>{
        const start=pointerStart;pointerStart=undefined
        if(!start || props.current.compact || props.current.chapter!==undefined || Math.hypot(e.clientX-start.x,e.clientY-start.y)>4) return
        const box=host.getBoundingClientRect()
        const ray=new T.Raycaster()
        ray.setFromCamera(new T.Vector2((e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2),camera)
        for(const hit of ray.intersectObjects([...partNodes.keys()],true)) {
          let obj:Object3D|null=hit.object
          while(obj) {
            const part=partNodes.get(obj)
            if(part){inspect(part);return}
            obj=obj.parent
          }
        }
      }
      host.addEventListener('pointerdown',pickStart);host.addEventListener('pointerup',pickEnd)
      const onLoss=(e:Event)=>{e.preventDefault();if(!closed){setStatus('poster');cancelAnimationFrame(frame)}}
      renderer.domElement.addEventListener('webglcontextlost',onLoss)
      const initialCleanup=clean
      clean=()=>{host.removeEventListener('pointerdown',pickStart);host.removeEventListener('pointerup',pickEnd);renderer.domElement.removeEventListener('webglcontextlost',onLoss);initialCleanup?.()}
      renderer.shadowMap.needsUpdate=true
      scene.add(model.scene);resize();waiting=false
      focus(props.current.chapter === undefined ? selectedRef.current : CHAPTERS[props.current.chapter],true)
      if(!reduced.matches && !focused){camera.position.applyAxisAngle(new T.Vector3(0,1,0),.035);transition=true}
      setStatus('live')
      frame=requestAnimationFrame(tick)
    }
    start().catch(()=>{if(!closed){clean?.();clean=undefined;engine.current=null;activeRenderer?.domElement.remove();setStatus('poster')}})
    return ()=>{closed=true;clean?.();engine.current=null}
  },[initialize])

  useEffect(()=>{
    setSelected(undefined)
    if(chapter===undefined || (chapter>=0 && chapter<CHAPTERS.length)) engine.current?.focus(chapter===undefined?undefined:CHAPTERS[chapter])
  },[chapter])

  function inspect(part:Part){
    setHelp(false);setSelected(part);engine.current?.focus(part)
  }
  function reset(){
    setSelected(undefined);setHelp(false)
    engine.current?.focus(chapter===undefined?undefined:CHAPTERS[chapter])
  }
  function keys(event:KeyboardEvent<HTMLDivElement>){
    if(event.target!==viewport.current) return
    const actions: Record<string,()=>void> = {ArrowLeft:()=>engine.current?.rotate(-.15),ArrowRight:()=>engine.current?.rotate(.15),'+':()=>engine.current?.zoom(1.15),'-':()=>engine.current?.zoom(1/1.15),Home:reset,Escape:reset}
    if(actions[event.key]) {event.preventDefault();actions[event.key]()}
  }
  const full = () => {
    if(document.fullscreenElement) void document.exitFullscreen().catch(()=>{})
    else void root.current?.requestFullscreen?.().catch(()=>setHelp(true))
  }
  const showPins = !compact && chapter===undefined && !selected
  return <div className={'fl-scene'+(compact?' fl-scene--compact':'')} ref={root} data-view={status}>
    <div className="fl-scene-grid" aria-hidden="true" />
    <img className="fl-scene-poster" src={MEDIA+'installation.webp'} alt="Maquette Floréol avec son arroseur sphérique, son réservoir et sa station photovoltaïque." />
    <div className="fl-scene-viewport" ref={viewport} tabIndex={status==='live'?0:-1} role="group" aria-label="Maquette interactive du système d’arrosage solaire" aria-describedby={statusId} onKeyDown={keys}/>
    <div className="fl-scene-heading">{chapter===undefined&&!compact?<div className="fl-view-tabs">{['Ensemble','Station'].map((label,i)=><button key={label} type="button" aria-pressed={stationView===Boolean(i)} disabled={status!=='live'} onClick={()=>{stationRef.current=Boolean(i);setStationView(Boolean(i));setSelected(undefined);engine.current?.focus()}}>{label}</button>)}</div>:<><Box size={15} aria-hidden="true"/><span>Prototype 3D</span></>}</div>
    <div className="fl-scene-corner" aria-hidden="true"><i/> X<span>Y</span>Z</div>
    {showPins && <div className="fl-pins">{MARKERS.map(part=>
      <button type="button" key={part} ref={el=>{pins.current[part]=el}} onClick={()=>inspect(part)} aria-label={'Explorer : '+PARTS[part].name} className={'fl-pin fl-pin--'+part}>
        <span className="fl-pin-dot" aria-hidden="true"/><span className="fl-pin-label">{PARTS[part].name}</span>
      </button>)}</div>}
    {compact && <div className="fl-level" aria-label={'Réservoir rempli à '+number(level)+' %'}><span>Réservoir</span><b>{number(level)} %</b><i><em style={{width:Math.min(100,Math.max(0,level))+'%'}} /></i></div>}
    {selected && <div className="fl-detail" aria-live="polite">
      <div><strong>{PARTS[selected].name}</strong><button type="button" aria-label="Fermer la fiche du composant" onClick={reset}><X size={15}/></button></div>
      <p>{captions[selected]}</p>
    </div>}
    {help && <p className="fl-help">Faites glisser la maquette pour tourner et pincez pour zoomer. Au clavier, utilisez les flèches gauche et droite, + et −, puis la touche Début pour réinitialiser.</p>}
    <span id={statusId} className="fl-scene-sr">{status==='live'?'Rotation par glissement ou flèches gauche et droite. Zoom avec les boutons ou les touches + et −.':'Aperçu du véritable modèle Blender.'}</span>
    <div className="fl-scene-toolbar">
      {status==='poster' ? <a className="fl-scene-chip" href={MEDIA+'circuit.html'} target="_blank" rel="noreferrer">Ouvrir le schéma animé</a> :
      <button type="button" className="fl-scene-chip" disabled={status!=='live' || running} aria-pressed={preview || running} onClick={()=>setPreview(v=>!v)}>
        {preview || running ? <Pause size={12}/> : <Play size={12}/>}
        <span>{running?'Cycle en cours':preview?'Suspendre l’animation':'Animer le cycle'}</span>
      </button>}
      <div className="fl-camera-tools">
        {!compact && <button type="button" aria-label="Aide à la navigation 3D" title="Aide" aria-expanded={help} onClick={()=>setHelp(v=>!v)}><CircleHelp size={16}/></button>}
        <button type="button" aria-label="Éloigner la caméra" title="Zoom arrière" disabled={status!=='live'} onClick={()=>engine.current?.zoom(1/1.22)}><Minus size={15}/></button>
        <button type="button" aria-label="Rapprocher la caméra" title="Zoom avant" disabled={status!=='live'} onClick={()=>engine.current?.zoom(1.22)}><Plus size={15}/></button>
        <button type="button" aria-label="Réinitialiser la caméra" title="Réinitialiser" disabled={status!=='live'} onClick={reset}><RotateCcw size={14}/></button>
        {typeof document!=='undefined' && document.fullscreenEnabled && <button type="button" aria-label="Afficher ou quitter le plein écran" title="Plein écran" onClick={full}><Maximize2 size={14}/></button>}
      </div>
    </div>
  </div>
}
