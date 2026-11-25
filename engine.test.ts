import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, areaEstimate, calibratedVolume, createEngine, defaults, derive, fromLocal,
  hydraulics, initialState, localParts, measuredPower, pvEstimate, type ProgramInput } from '../src/engine.ts'
import { connectedService, validTelemetry, type Telemetry } from '../src/iot.ts'

const at = (date:string,time:string) => fromLocal(date,time)!
const seed = () => initialState(at('2026-06-25','12:00'))
const run = () => createEngine(seed())
const program:ProgramInput = {name:'Jardin',date:'2026-06-25',time:'12:01',durationMin:10,days:[],enabled:true,priority:1,weatherAware:true,autoDefer:false}

test('500 L, 2 L/min, 10 minutes, avec et sans réserve',()=>{
  const s=run(),water=derive(s.getSnapshot())
  assert.equal(water.reserveL,25);assert.equal(water.volumeM3,.5);assert.equal(water.usableL,475)
  assert.equal(water.autonomyMin,237.5);assert.equal(water.cycles10,23)
  const full=hydraulics({...defaults,reservePct:0},500)
  assert.equal(full.cycles10,25);assert.equal(full.autonomyMin,250)
  assert.equal(s.start(10),null)
  s.step(600000)
  assert.equal(s.getSnapshot().active,null)
  assert.equal(s.getSnapshot().volumeL,480)
  const c=s.getSnapshot().history[0]
  assert.deepEqual([c.status,c.usedL,c.actualMin,c.areaM2,c.energyWh],['completed',20,10,5,null])
  assert.equal(derive(s.getSnapshot()).usedTodayL,20)
})
test('changement de capacité exige un volume de départ explicite et conserve les anciennes configurations',()=>{
  const s=run()
  s.start(10);s.step(600000)
  assert.ok(s.configure({capacityL:1000}))
  assert.ok(s.configure({capacityL:1000},1200))
  assert.equal(s.configure({capacityL:1000},640),null)
  assert.equal(derive(s.getSnapshot()).percent,64)
  assert.equal(derive(s.getSnapshot()).usableL,590)
  assert.equal(s.getSnapshot().history[0].config.capacityL,500)
  assert.equal(s.refill(40),null)
  assert.equal(s.getSnapshot().refills[0].afterL,680)
})
test('puissance estimée proportionnelle au passage de 50 à 70 Wc et mesure U × I',()=>{
  const s=run(),before=derive(s.getSnapshot())
  assert.equal(s.configure({panelWp:70}),null)
  const after=derive(s.getSnapshot())
  assert.ok(Math.abs(after.expectedW-before.expectedW*1.4)<1e-6)
  assert.equal(measuredPower(24,.5),12);assert.equal(measuredPower(null,.5),null)
  assert.equal(pvEstimate(50,1000,.85,-.4,50),38.25)
  assert.ok(s.configure({panelWp:-5}))
})
test('niveau critique, protection réserve et arrêt manuel',()=>{
  const s=run()
  s.configure({},25)
  assert.ok(s.start(1));assert.equal(s.getSnapshot().active,null)
  s.configure({},45)
  assert.ok(s.start(10.1))
  assert.equal(s.start(10),null);s.step(120000)
  assert.equal(s.stop(),null)
  assert.equal(s.getSnapshot().history[0].usedL,4)
  assert.equal(derive(s.getSnapshot()).usedTodayL,4)
  assert.equal(s.start(8),null);s.step(8*60000)
  assert.equal(s.getSnapshot().volumeL,25);assert.equal(s.getSnapshot().history[0].status,'completed')
})
test('pluie significative dans la fenêtre, règle désactivable et défaut de débit',()=>{
  const s=run()
  s.setScenario('rain')
  assert.ok(s.start(10))
  assert.ok(derive(s.getSnapshot()).alerts.some(a=>a.id==='rain'))
  s.configure({rainHorizonH:1});assert.equal(s.start(10),null)
  s.step(60000);s.setScenario('no-flow')
  assert.equal(s.getSnapshot().active,null);assert.match(s.getSnapshot().history[0].reason,/débit/)
})
test('horaires automatiques, priorité, conflit, suppression et exécution d’un programme unique',()=>{
  const s=run()
  assert.equal(s.saveProgram(program),null)
  assert.ok(s.saveProgram({...program,name:'Même vanne',time:'12:09'}))
  s.step(60000);assert.equal(s.getSnapshot().active?.programName,'Jardin')
  s.step(600000);assert.equal(s.getSnapshot().history[0].source,'program')
  assert.equal(s.getSnapshot().programs[0].enabled,false)
  assert.equal(s.deleteProgram(s.getSnapshot().programs[0].id),null)
})
test('horaire nocturne reporté à midi lorsque la production est insuffisante',()=>{
  const st=seed();st.now=at('2026-06-25','21:59')
  const s=createEngine(st)
  s.saveProgram({...program,time:'22:00',autoDefer:true})
  s.step(60000)
  assert.equal(s.getSnapshot().active,null)
  assert.equal(s.getSnapshot().history[0].status,'blocked')
  assert.equal(s.getSnapshot().programs[0].deferUntil,at('2026-06-26','12:00'))
  s.step(14*3600000);assert.equal(s.getSnapshot().active?.programName,'Jardin')
})
test('dates Africa/Casablanca, heure saisonnière absente, intervalle récurrent franchissant minuit',()=>{
  assert.equal(fromLocal('2025-04-06','02:30'),null)
  assert.equal(localParts(at('2025-02-23','02:30')).time,'02:30')
  assert.notEqual(new Date(at('2025-03-10','12:00')).getUTCHours(),new Date(at('2025-06-10','12:00')).getUTCHours())
  const s=run()
  assert.equal(s.saveProgram({...program,time:'23:55',days:[4]}),null)
  assert.ok(s.saveProgram({...program,date:'2026-06-26',time:'00:03',days:[5]}))
})
test('diagnostic de baisse prolongée conditionné à l’irradiance et suivi du nettoyage',()=>{
  const s=run()
  s.setScenario('dust')
  assert.ok(!derive(s.getSnapshot()).alerts.some(a=>a.id==='ratio'))
  s.step(6*60000);assert.ok(derive(s.getSnapshot()).alerts.some(a=>a.id==='ratio'))
  s.cleanPanel()
  assert.equal(s.getSnapshot().scenario,'clear')
  assert.equal(s.getSnapshot().maintenance[0].beforeRatio,.67)
  s.setScenario('night')
  assert.equal(derive(s.getSnapshot()).ratio,null)
})
test('énergie intégrée, source de débit et agronomie',()=>{
  const s=run(),before=derive(s.getSnapshot()).energyTodayWh
  s.configure({measuredFlowLmin:3,pumpW:10})
  s.start(2);s.step(120000)
  const after=derive(s.getSnapshot())
  assert.ok(after.energyTodayWh>before)
  assert.equal(s.getSnapshot().history[0].energyWh,1/3)
  assert.equal(s.getSnapshot().history[0].usedL,6)
  assert.equal(areaEstimate(20,4,80),4)
})
test('calibration verticale, cylindre horizontal, courbe irrégulière et contacts tout ou rien',()=>{
  assert.equal(calibratedVolume(defaults,50),250)
  assert.ok(calibratedVolume({...defaults,shape:'horizontal'},25)!<125)
  assert.ok(Math.abs(calibratedVolume({...defaults,shape:'horizontal'},50)!-250)<1e-9)
  assert.equal(calibratedVolume({...defaults,shape:'irregular'},50),null)
  assert.equal(calibratedVolume({...defaults,shape:'irregular',calibration:[{heightCm:0,volumeL:0},{heightCm:50,volumeL:100},{heightCm:100,volumeL:500}]},75),300)
  assert.equal(calibratedVolume({...defaults,sensor:'float'},50),null)
  assert.equal(hydraulics({...defaults,flowLmin:0,capacityL:0},Infinity).autonomyMin,0)
})
test('restauration atomique, archivage de plusieurs cycles et reprise en position arrêtée',()=>{
  const s=run()
  for(let i=0;i<3;i++){s.start(2);s.step(120000)}
  s.start(10);s.step(60000)
  const other=run();assert.equal(other.restore(s.backup()),null)
  assert.equal(other.getSnapshot().active,null)
  assert.equal(other.getSnapshot().history.length,4)
  assert.ok(other.restore('{"version":1,"history":[null]}'))
  assert.equal(other.getSnapshot().history.length,4)
})
test('démarrage sans connexion authentifiée interdit et télémétrie périmée rejetée',async()=>{
  const t:Telemetry={deviceId:'floreol',at:Date.now()-20000,volumeL:50,capacityL:100,pumpOn:false,ready:true,interlocksOk:true,flowLmin:0,panelV:12,panelA:.5}
  assert.ok(!validTelemetry(t,'floreol'))
  assert.throws(()=>connectedService('http://localhost','token','floreol'))
  const original=globalThis.fetch
  try{
    let requests=0
    globalThis.fetch=async()=>{requests++;return new Response('{}',{status:401})}
    const svc=connectedService('https://localhost','token','floreol')
    assert.equal((await svc.read()).controlsAvailable,false)
    await assert.rejects(svc.command('start',10,true))
    assert.equal(requests,2)
  }finally{globalThis.fetch=original}
})
