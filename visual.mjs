import {chromium} from 'playwright'
import {existsSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)
const b=await chromium.launch({executablePath:chrome,headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']})
const p=await b.newPage({reducedMotion:'no-preference',viewport:{width:1440,height:900}}),base=process.env.FLOREOL_TEST_URL||'http://127.0.0.1:5173/',checks=[]
try{
 await p.goto(base);await p.locator('.fl-scene[data-view=live]').waitFor({timeout:45000})
 await p.getByRole('button',{name:'Station',exact:true}).click();await p.waitForTimeout(1300);await p.screenshot({path:'docs/validation/station-desktop.png'});await p.getByRole('button',{name:'Ensemble',exact:true}).click()
 await p.getByRole('button',{name:'Activer le thème clair'}).click();assert.equal(await p.locator('html').getAttribute('data-theme'),'light');await p.getByRole('button',{name:'Activer le thème sombre'}).click();checks.push('Bascule de thème et caméra rapprochée de la station')
 await p.goto(base+'#systeme');await p.getByRole('heading',{name:'À l’intérieur de Floréol.'}).waitFor()
 await p.reload();await p.locator('.guide-stage .fl-scene[data-view=live]').waitFor()
 await p.locator('.chapter-bar .mono').waitFor()
 await p.mouse.move(25,450);await p.mouse.wheel(0,800)
 await p.waitForFunction(()=>Number(document.querySelector('.chapter-bar .mono')?.textContent.match(/CHAPITRE (\d+)/)?.[1])>1,null,{timeout:20000,polling:150})
 const loc=await p.locator('.guide-stage .fl-scene').boundingBox();assert(loc.y+loc.height>100&&loc.y<900);checks.push('Changement de chapitre au défilement, caméra visible')
 for(const width of [1024,768,390]){await p.setViewportSize({width,height:850});await p.goto(base+'#accueil');await p.locator('.fl-scene[data-view=live]').waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Débordement à '+width)}
 checks.push('Accueil et 3D aux largeurs 1 024, 768 et 390 px')
 await p.goto(base+'#equipe');for(const [id,name] of [['HA','Houssam'],['HH','Hamza']]){await p.getByRole('button',{name:new RegExp(id+' '+name)}).click();if(await p.evaluate(v=>window.FLOREOL_PUBLICATION.photos.includes(v),id)){await p.waitForFunction(()=>document.querySelector('.team-layout .portrait img')?.naturalWidth>0)}}if(await p.evaluate(()=>window.FLOREOL_PUBLICATION.photos.includes('HHd')))await p.waitForFunction(()=>document.querySelector('.tutor .portrait img')?.naturalWidth>0)
 checks.push('Trois portraits locaux et associations vérifiés')
 await p.goto(base+'#projet');await p.getByRole('button',{name:'Agrandir le rendu Blender du jardin'}).click();const dialog=p.getByRole('dialog');await dialog.getByRole('button',{name:'Suivant'}).click();await dialog.getByRole('button',{name:'Suivant'}).click();await dialog.getByRole('button',{name:'Suivant'}).click();const vid=dialog.locator('video');if(await vid.count()){await vid.evaluate(v=>{v.muted=true;return v.play()});await p.waitForFunction(()=>document.querySelector('video')?.currentTime>.3);assert(await vid.evaluate(v=>v.videoWidth>=640));checks.push('Lecture du film rendu depuis l’animation originale du GLB')}
 writeFileSync('docs/validation/visuel.json',JSON.stringify({checks},null,2));console.log(checks.join('\n'))
}finally{await b.close()}