import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve('dist'),prefix='/projets/floreol/',types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'}
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith(prefix)){res.writeHead(404).end();return}const file=path.resolve(root,pathname.slice(prefix.length)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync)
const b=await chromium.launch({executablePath:chrome,headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']})
const context=await b.newContext(),p=await context.newPage(),base='http://127.0.0.1:'+server.address().port+prefix,errors=[]
p.on('pageerror',e=>errors.push(e.message));const checks=[]
try{
 await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);checks.push('Installation du cache de production sous un sous-chemin de dépôt')
 assert.equal(await p.evaluate(()=>Object.keys(window.FLOREOL_PUBLICATION.contacts).length),0)
 await context.setOffline(true);await p.reload();await p.locator('.fl-scene[data-view=live]').waitFor({timeout:60000});await p.getByRole('button',{name:'Animer le cycle'}).click();await p.getByRole('button',{name:'Suspendre l’animation'}).waitFor();checks.push('Recharge sans réseau, vrai GLB et animation')
 await p.goto(base+'#weather');await p.getByRole('button',{name:'Open-Meteo',exact:true}).click();await p.getByText(/Prévisions Open-Meteo indisponibles/).waitFor();await p.getByRole('button',{name:'Scénario local'}).click();await p.getByText('Les prochaines heures',{exact:true}).waitFor();checks.push('API en panne, message explicite et retour à la prévision simulée')
 await p.goto(base+'#reports');const dl=p.waitForEvent('download');await p.getByRole('button',{name:/Excel|XLSX/i}).first().click();assert((await dl).suggestedFilename().endsWith('.xlsx'));checks.push('Génération du classeur Excel hors ligne')
 await p.getByRole('button',{name:'Ouvrir Floréol AI'}).click();await p.getByRole('button',{name:'Combien de cycles de 10 minutes ?'}).click();await p.getByText(/23 cycles complets/).waitFor();checks.push('Assistant local hors ligne, autonomie calculée')
 await context.setOffline(false);const fallback=await b.newContext();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind.includes('webgl'))return null;return original.call(this,kind,...args)}});const alt=await fallback.newPage();await alt.goto(base);await alt.locator('.fl-scene[data-view=poster]').waitFor();assert(await alt.locator('.fl-scene-poster').evaluate(im=>im.naturalWidth>0));await alt.getByRole('link',{name:'Ouvrir le schéma animé'}).waitFor();checks.push('Poster et schéma accessibles en cas d’absence de WebGL')
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/validation/hors-ligne.json',JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'))
}finally{await b.close();await new Promise(r=>server.close(r))}