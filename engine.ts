import { finiteRange, validConfig } from './engine/config.ts'
import { advance, begin, finish, initialState, log, scenarios, supervise, uid } from './engine/model.ts'
import { conflict, programTime, validProgram } from './engine/scheduling.ts'
import { environment } from './engine/math.ts'
import { decodeSnapshot, safeResume, STORAGE_KEY } from './engine/storage.ts'
import type { Config, Program, ProgramInput, Scenario, Speed, State } from './engine/types.ts'

export * from './engine/types.ts'
export * from './engine/math.ts'
export { defaults } from './engine/config.ts'
export { derive, initialState, beginBlock, currentAlerts, advance } from './engine/model.ts'
export { programTime, nextProgram } from './engine/scheduling.ts'
export { decodeSnapshot } from './engine/storage.ts'

export function createEngine(initial:State=initialState()) {
  let state=initial
  let subscribers=new Set<()=>void>()
  let activeStorage: Storage|null=null
  let lastSaved:string|null=null
  let warnStorage=false
  let mounted=0
  let cleanup:(()=>void)|undefined
  const notify=()=>{for(const listener of subscribers) listener()}
  function refresh(){
    if(!activeStorage) return
    try {
      const raw=activeStorage.getItem(STORAGE_KEY)
      if(raw && raw!==lastSaved){
        state=decodeSnapshot(raw)
        lastSaved=raw
        notify()
      }
    } catch { /* Invalid foreign data never replaces the live simulation. */ }
  }
  function put(next:State){
    state=next
    if(activeStorage) {
      try {
        const raw=JSON.stringify(state)
        activeStorage.setItem(STORAGE_KEY,raw)
        lastSaved=raw
        warnStorage=false
      } catch {
        if(!warnStorage) {
          state=log(state,'Stockage local indisponible ou plein. Exporter la sauvegarde JSON.','warning')
          warnStorage=true
        }
      }
    }
    notify()
  }
  function saveProgram(input:ProgramInput) {
    refresh()
    if(!validProgram(input)||input.durationMin>state.config.maxRunMin) return 'Vérifier le nom, les jours, la date, l’heure et la durée du programme.'
    const previous=state.programs.find(p=>p.id===input.id)
    if(input.id && !previous) return 'Programme introuvable.'
    if(!previous && state.programs.length>=1000) return 'Nombre maximal de programmes atteint.'
    const p:Program={id:previous?.id??uid(),name:input.name.trim(),date:input.date,time:input.time,
      durationMin:input.durationMin,days:[...new Set(input.days)].sort(),enabled:input.enabled,
      priority:input.priority,weatherAware:input.weatherAware,autoDefer:input.autoDefer}
    if(p.enabled && !p.days.length && programTime(p,state.now)===null) return 'Choisir une heure future et valide à Casablanca.'
    const other=state.programs.find(q=>conflict(p,q))
    if(other) return 'Chevauchement avec le programme « '+other.name+' ».'
    put(log({...state,programs:previous?state.programs.map(q=>q.id===p.id?p:q):[...state.programs,p]},'Programme enregistré · '+p.name))
    return null
  }
  function disconnect() {
    mounted=Math.max(0,mounted-1)
    if(mounted===0){cleanup?.();cleanup=undefined}
  }
  return {
    subscribe:(listener:()=>void)=>{subscribers.add(listener);return ()=>{subscribers.delete(listener)}},
    getSnapshot:()=>state,
    mount:()=>{
      mounted++
      if(mounted>1 || typeof window==='undefined') return disconnect
      try{
        activeStorage=window.localStorage
        const raw=activeStorage.getItem(STORAGE_KEY)
        if(raw){
          state=decodeSnapshot(raw);lastSaved=raw
          const lease=JSON.parse(activeStorage.getItem(STORAGE_KEY+'.clock')||'null')
          if(state.active && (!lease || lease.until<=Date.now())) put(safeResume(state))
        }
      } catch {state=log(state,'Données précédentes indisponibles. Une nouvelle démonstration est ouverte.','warning')}
      notify()
      // The visible tab owns the clock. A lease prevents two windows from
      // advancing it twice. Closing every tab pauses simulated time.
      const owner=uid(), leaseKey=STORAGE_KEY+'.clock'
      let last=performance.now(),owns=false
      function relinquish() {
        try{
          if(activeStorage && JSON.parse(activeStorage.getItem(leaseKey)||'null')?.owner===owner) {
            if(state.active){ refresh(); if(state.active) put(finish(state,'Cycle interrompu à la fermeture de la simulation.')) }
            activeStorage.removeItem(leaseKey)
          }
        }catch { /* Browser storage may be disabled. */ }
        owns=false
      }
      function tick(){
        const now=performance.now(),delta=Math.max(0,Math.min(2000,now-last))
        last=now
        if(document.hidden && !owns)return
        let acquisition=false
        if(activeStorage) {
          try {
            const lease=JSON.parse(activeStorage.getItem(leaseKey)||'null')
            if(lease && lease.owner!==owner && lease.until>Date.now()){owns=false;return}
            acquisition=!lease || lease.until<Date.now()
            activeStorage.setItem(leaseKey,JSON.stringify({owner,until:Date.now()+3000}))
          } catch { /* Continue in memory when storage writes are unavailable. */ }
        }
        refresh()
        owns=true
        put(advance(state,delta*state.speed))
      }
      const onStorage=(e:StorageEvent)=>{if(e.key===STORAGE_KEY)refresh()}
      const onVisibility=()=>{last=performance.now()}
      const timer=window.setInterval(tick,1000)
      window.addEventListener('storage',onStorage)
      window.addEventListener('pagehide',relinquish)
      document.addEventListener('visibilitychange',onVisibility)
      cleanup=()=>{
        window.clearInterval(timer)
        window.removeEventListener('storage',onStorage)
        window.removeEventListener('pagehide',relinquish)
        document.removeEventListener('visibilitychange',onVisibility)
        relinquish()
        activeStorage=null
      }
      return disconnect
    },
    step:(milliseconds:number)=>{refresh();put(advance(state,milliseconds))},
    start:(minutes:number)=>{refresh();const [next,error]=begin(state,minutes);put(next);return error},
    stop:()=>{refresh();if(!state.active)return 'La pompe est déjà arrêtée.';put(finish(state,'Arrêt manuel de l’arrosage simulé.'));return null},
    setSpeed:(speed:Speed)=>{refresh();if(![1,10,60].includes(speed))return 'Vitesse invalide.';put({...state,speed});return null},
    setScenario:(scenario:Scenario)=>{
      refresh()
      if(!scenarios.includes(scenario))return 'Scénario inconnu.'
      const names:Record<Scenario,string>={clear:'Ciel dégagé',rain:'Pluie prévue',shade:'Ombrage',dust:'Encrassement',night:'Nuit simulée','no-flow':'Absence de débit'}
      put(log(supervise({...state,scenario}),'Scénario simulé · '+names[scenario]))
      return null
    },
    configure:(patch:Partial<Config>,initialVolumeL?:number)=>{
      refresh()
      if(state.active) return 'Arrêter le cycle avant de modifier l’installation.'
      const config={...state.config,...structuredClone(patch)}
      if(!validConfig(config))return 'Caractéristique invalide. Vérifier les plages, les unités et la calibration.'
      if(config.capacityL!==state.config.capacityL && initialVolumeL===undefined)return 'Renseigner le volume réel initial du nouveau réservoir.'
      if(initialVolumeL!==undefined && !finiteRange(initialVolumeL,0,config.capacityL))return 'Le volume doit être compris entre zéro et la capacité du réservoir.'
      put(log(supervise({...state,config,volumeL:initialVolumeL??state.volumeL,
        configHistory:[{at:state.now,config},...state.configHistory]}),'Configuration de l’installation enregistrée.'))
      return null
    },
    refill:(litresToAdd:number)=>{
      refresh()
      if(state.active) return 'Arrêter le cycle avant le remplissage.'
      if(!finiteRange(litresToAdd,.000001,state.config.capacityL-state.volumeL))return 'Le remplissage doit rester dans la capacité disponible.'
      const volumeL=state.volumeL+litresToAdd
      put(log({...state,volumeL,refills:[{at:state.now,beforeL:state.volumeL,afterL:volumeL},...state.refills]},'Remplissage simulé enregistré.'))
      return null
    },
    saveProgram,
    deleteProgram:(id:string)=>{refresh();if(!state.programs.some(p=>p.id===id))return 'Programme introuvable.';put({...state,programs:state.programs.filter(p=>p.id!==id)});return null},
    toggleProgram:(id:string)=>{refresh();const p=state.programs.find(p=>p.id===id);return p?saveProgram({...p,enabled:!p.enabled}):'Programme introuvable.'},
    cleanPanel:(note='Nettoyage du panneau enregistré en démonstration.')=>{
      refresh()
      if(typeof note!=='string'||note.length>600)return 'Note trop longue.'
      const beforeRatio=environment(state.config,state.now,state.scenario).ratio
      const scenario=state.scenario==='dust'?'clear':state.scenario
      const afterRatio=environment(state.config,state.now,scenario).ratio
      put(log(supervise({...state,scenario,maintenance:[{at:state.now,note,beforeRatio,afterRatio},...state.maintenance]}),note))
      return null
    },
    reset:()=>{put(initialState());return null},
    backup:()=>{refresh();return JSON.stringify(state,null,2)},
    restore:(raw:string)=>{try{put(safeResume(decodeSnapshot(raw)));return null}catch{return 'Sauvegarde Floréol invalide ou incompatible. Les données courantes sont conservées.'}},
  }
}
export const engine=createEngine()
