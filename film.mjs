// Run with Vite serving on localhost. Re-record the model's own 16 s animation.
import {chromium} from 'playwright'
import {existsSync,writeFileSync} from 'node:fs'
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling']})
try{
 const page=await browser.newPage();await page.goto((process.env.FLOREOL_TEST_URL||'http://127.0.0.1:5173/')+'#projet')
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
  const model=await new GLTFLoader().loadAsync('./media/installation.glb'),scene=new T.Scene(),r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}),camera=new T.PerspectiveCamera(36,1.6,.01,70)
  scene.background=new T.Color(0x112b37);scene.add(model.scene);scene.add(new T.HemisphereLight(0xf2f7ff,0xa1b3b4,2))
  const key=new T.DirectionalLight(0xfff2db,3.1);key.position.set(3,5,4);scene.add(key)
  r.setSize(800,500);r.toneMapping=T.ACESFilmicToneMapping;const floor=new T.Mesh(new T.BoxGeometry(2.2,.1,4.4),new T.MeshStandardMaterial({color:0x2e4855}));floor.position.set(.69,-.12,.09);scene.add(floor)
  const clip=model.animations.find(a=>a.name==='Cycle d’arrosage');if(!clip)throw Error('Animation introuvable')
  const mixer=new T.AnimationMixer(model.scene);mixer.clipAction(clip).play()
  const screen=document.createElement('canvas');screen.width=800;screen.height=500;const ctx=screen.getContext('2d')
  const shots=[
   {at:0,eye:[2.15,1.10,-.57],target:[1.02,.25,-1.70],title:'Captation et commande'},
   {at:5.7,eye:[1.65,.64,-.68],target:[1.01,.21,-1.62],title:'Mise en mouvement de l’eau'},
   {at:9.0,eye:[4.48,2.95,2.25],target:[.65,.40,-.08],title:'Distribution hydraulique'},
   {at:12,eye:[1.55,1.85,1.92],target:[0,.94,0],title:'Arrosage du jardin'}]
  const draw=t=>{const shot=shots.filter(x=>x.at<=t).at(-1);camera.position.fromArray(shot.eye);camera.position.x+=(t-shot.at)*.008;camera.lookAt(...shot.target);mixer.setTime(t);r.render(scene,camera);ctx.drawImage(r.domElement,0,0);ctx.fillStyle='#0b1a25';ctx.fillRect(0,452,800,48);ctx.font='17px sans-serif';ctx.fillStyle='#dcf5ec';ctx.fillText(shot.title,22,483);ctx.textAlign='right';ctx.font='13px monospace';ctx.fillText('FLORÉOL  /  ANIMATION 3D',778,482);ctx.textAlign='left'}
  const frames=[], fps=15
  let failure
  const encoder=new VideoEncoder({output:chunk=>{
    const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes)
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
    frames.push({time:Math.round(chunk.timestamp/1000),key:chunk.type==='key',bytes:btoa(binary)})
  },error:e=>{failure=e.message}})
  encoder.configure({codec:'vp8',width:800,height:500,bitrate:1100000,framerate:fps,latencyMode:'realtime'})
  for(let i=0;i<Math.ceil(clip.duration*fps);i++){
    draw(i/fps);const frame=new VideoFrame(screen,{timestamp:Math.round(i*1000000/fps),duration:Math.round(1000000/fps)})
    encoder.encode(frame,{keyFrame:i%30===0});frame.close()
    if(encoder.encodeQueueSize>8)await encoder.flush()
  }
  await encoder.flush();encoder.close();r.dispose();if(failure)throw Error(failure)
  return {duration:clip.duration,frames}
 })
 // EBML/WebM, one 16-second cluster of timestamped VP8 frames.
 const bin=(hex)=>Buffer.from(hex,'hex'),bytes=(n)=>{let hex=n.toString(16);return bin(hex.length%2?'0'+hex:hex)}
 const vint=n=>{let len=1;while(n>=2**(7*len)-1)len++;const b=Buffer.alloc(len);b.writeUIntBE(n,0,len);b[0]|=1<<(8-len);return b}
 const elem=(id,value)=>Buffer.concat([bin(id),vint(value.length),value])
 const group=(id,...values)=>elem(id,Buffer.concat(values)),int=(id,n)=>elem(id,bytes(n)),str=(id,s)=>elem(id,Buffer.from(s))
 const header=group('1a45dfa3',int('4286',1),int('42f7',1),int('42f2',4),int('42f3',8),str('4282','webm'),int('4287',2),int('4285',2))
 const dur=Buffer.alloc(8);dur.writeDoubleBE(result.duration*1000)
 const info=group('1549a966',int('2ad7b1',1000000),str('4d80','Floreol'),str('5741','Floréol'),elem('4489',dur))
 const tracks=group('1654ae6b',group('ae',int('d7',1),int('73c5',1),int('83',1),str('86','V_VP8'),group('e0',int('b0',800),int('ba',500))))
 const blocks=result.frames.map(f=>{const b=Buffer.alloc(4);b[0]=0x81;b.writeInt16BE(f.time,1);b[3]=f.key?128:0;return elem('a3',Buffer.concat([b,Buffer.from(f.bytes,'base64')]))})
 if(blocks.length<200)throw Error('Séquence incomplète')
 const video=Buffer.concat([header,group('18538067',info,tracks,group('1f43b675',int('e7',0),...blocks))])
 writeFileSync('public/media/cycle.webm',video);console.log(blocks.length+' images · '+video.length+' octets')
}finally{await browser.close()}