/** Exercise the production scene independently of the rest of the dashboard. */
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const temp = join(tmpdir(), 'floreol-scene-review')
mkdirSync(temp,{recursive:true})
const harness={
  name:'scene-review-harness',
  resolveId(id){if(id==='/scene-review.js') return resolve('scripts/scene/__review__.js')},
  load(id){if(id.endsWith('__review__.js')) return `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import Scene from '/src/Scene.tsx';
    function Demo(){const [chapter,setChapter]=useState(); return React.createElement(React.Fragment,null,
      React.createElement(Scene,{chapter,level:76,panelWatts:50,capacity:500}),
      React.createElement('button',{id:'chap',onClick:()=>setChapter(3)},'Pompage'))}
    createRoot(document.querySelector('#root')).render(React.createElement(Demo));`},
  configureServer(s){s.middlewares.use((req,res,next)=>{
    if(!req.url?.startsWith('/scene-review.html')) return next()
    res.setHeader('Content-Type','text/html; charset=utf-8')
    res.end('<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0c1822;margin:0;color:#eef;font:16px system-ui}#root{max-width:740px;margin:auto}</style><div id="root"></div><script type="module" src="/scene-review.js"></script></html>')
  })}
}
const server=await createServer({configFile:false,plugins:[harness],esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0},logLevel:'error'})
let browser
try {
  await server.listen()
  const defaultChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const binary=process.env.CHROME_PATH || (existsSync(defaultChrome) ? defaultChrome : undefined)
  browser=await chromium.launch({executablePath:binary,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:900,height:680}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')console.error(m.text().slice(0,320))})
  const url=server.resolvedUrls.local[0]+'scene-review.html'
  await page.goto(url)
  await page.locator('.fl-scene[data-view="live"]').waitFor({timeout:90000})
  await page.waitForTimeout(1100)
  await page.screenshot({path:join(temp,'desktop.png')})
  await page.getByRole('button',{name:'Explorer : Panneau photovoltaïque'}).click()
  assert.match(await page.locator('.fl-detail').innerText(),/50 Wc/)
  await page.waitForTimeout(900)
  await page.screenshot({path:join(temp,'panneau.png')})
  await page.getByRole('button',{name:'Fermer la fiche du composant'}).click()
  await page.getByRole('button',{name:'Animer le cycle'}).click()
  assert.ok(await page.getByRole('button',{name:'Suspendre l’animation'}).isVisible())
  await page.getByRole('button',{name:'Suspendre l’animation'}).click()
  await page.setViewportSize({width:390,height:740})
  await page.waitForTimeout(800)
  await page.screenshot({path:join(temp,'mobile.png')})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.locator('#chap').click()
  await page.waitForTimeout(800)
  await page.screenshot({path:join(temp,'pompe.png')})
  assert.equal(await page.locator('.fl-pin').count(),0)
  await page.goto(server.resolvedUrls.local[0]+'media/circuit.html')
  await page.getByRole('button',{name:'Démarrer'}).click()
  await page.waitForTimeout(1000)
  assert.equal(await page.locator('#solar').getAttribute('opacity'),'1')
  await page.getByRole('button',{name:'Arrêter'}).click()
  assert.equal(await page.locator('#solar').getAttribute('opacity'),'0')
  assert.deepEqual(errors,[])
  console.log('Scène WebGL, sélection du panneau, zoom par chapitre, cycle, mobile et schéma SVG vérifiés. Images : '+temp)
} finally {
  await browser?.close()
  await server.close()
}
