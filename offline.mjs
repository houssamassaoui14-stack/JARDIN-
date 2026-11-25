import {readdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
const dir=path.resolve('dist')
async function walk(folder){const files=[];for(const ent of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,ent.name);if(ent.isDirectory())files.push(...await walk(file));else if(ent.name!=='sw.js')files.push(file)}return files}
const repo=process.env.GITHUB_REPOSITORY?.split('/')[1]
const siteHome=repo&&!repo.endsWith('.github.io')?'/'+encodeURIComponent(repo)+'/':'/'
await writeFile(path.join(dir,'404.html'),`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page introuvable · Floréol</title><style>html{background:#091621;color:#f0f6f7;font:18px system-ui}main{max-width:40rem;margin:20vh auto;padding:2rem}a{color:#80e6d1}</style><main><h1>Page introuvable</h1><p>Cette adresse ne correspond à aucun module de Floréol.</p><a href="${siteHome}#accueil">Retour à l’accueil Floréol</a></main></html>`)
const files=(await walk(dir)).sort(), hash=createHash('sha256')
for(const f of files)hash.update(await readFile(f))
const urls=files.map(f=>'./'+path.relative(dir,f).replaceAll('\\','/'))
const name='floreol-'+hash.digest('hex').slice(0,14)
await writeFile(path.join(dir,'sw.js'),`const prefix='floreol@'+self.registration.scope+'/', cache=prefix+${JSON.stringify(name)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(cache);await c.addAll(${JSON.stringify(urls)});await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(prefix)&&k!==cache)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;event.respondWith((async()=>{const c=await caches.open(cache);if(event.request.mode==='navigate')return await c.match(new URL('./index.html',self.registration.scope).href)||fetch(event.request);return await c.match(event.request)||fetch(event.request)})())});`);console.log('Cache hors ligne : '+urls.length+' ressources.')