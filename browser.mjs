import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import ExcelJS from 'exceljs'
const base=process.env.FLOREOL_TEST_URL||'http://127.0.0.1:5173/'
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']})
const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true})
const p=await ctx.newPage(),errors=[],checks=[]
p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(14000)
const dest='docs/validation';await mkdir(dest,{recursive:true})
const check=(title)=>{checks.push(title);console.log('OK · '+title)}
const go=async name=>{await p.goto(base+'#'+name);await p.waitForFunction(()=>!document.querySelector('.loading'));await p.waitForTimeout(200)}
const click=async (label,exact=true)=>p.getByRole('button',{name:label,exact}).click()
const shot=async file=>p.screenshot({path:dest+'/'+file,animations:'disabled',timeout:30000})
try{
 await go('accueil');await p.locator('.fl-scene[data-view="live"]').waitFor({timeout:45000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(450)
 assert(await p.locator('.brand img').evaluate(el=>el.naturalWidth>0));assert.equal(await (await p.request.get(base+'media/installation.glb')).body().then(b=>b.toString('ascii',0,4)),'glTF')
 await shot('accueil-desktop.png');check('Accueil, logo et vrai GLB sous WebGL')
 if(process.env.FLOREOL_SHOTS_ONLY){await p.setViewportSize({width:390,height:844});await p.waitForTimeout(450);await shot('accueil-mobile.png');check('Capture mobile');}
 else{
 await p.locator('.fl-pin:visible').first().evaluate(el=>el.click());await p.locator('.fl-detail').waitFor();await click('Fermer la fiche du composant')
 await go('systeme');await click('Chapitre suivant');await p.getByRole('heading',{name:'Alimentation électrique'}).waitFor();await click('Schéma des flux');await p.locator('iframe').waitFor();check('Navigation des chapitres, composant et schéma')
 await go('dashboard');await p.locator('.fl-scene[data-view=live]').waitFor();await shot('supervision-desktop.png')
 await go('irrigation');await click('×60');await click('Démarrer l’arrosage');await p.getByRole('button',{name:'Arrêter l’arrosage'}).waitFor();await p.getByRole('button',{name:'Démarrer l’arrosage'}).waitFor({timeout:18000})
 await go('water');await p.getByRole('heading',{name:'480 L',exact:true}).waitFor();check('10 minutes à 2 L/min · 500 → 480 L')
 await go('irrigation');await click('Démarrer l’arrosage');await p.waitForTimeout(450);await click('Arrêter l’arrosage');check('Arrêt manuel')
 await go('settings');await p.locator('[name=capacityL]').fill('1000');await p.locator('[name=initialVolume]').fill('720');await p.getByText('Panneau photovoltaïque',{exact:true}).click();await p.locator('[name=panelWp]').fill('70');await click('Enregistrer les paramètres');await p.getByRole('status').filter({hasText:'enregistrée'}).waitFor();await go('water');await p.getByRole('heading',{name:'720 L',exact:true}).waitFor()
 await go('solar');await p.getByText(/70 Wc installés/).first().waitFor();check('Réservoir 1 000 L initialisé à 720 L et panneau à 70 Wc')
 await go('settings');await p.locator('[name=initialVolume]').fill('15');await click('Enregistrer les paramètres');await go('irrigation');await click('Démarrer l’arrosage');await p.getByRole('status').filter({hasText:/réserve/i}).waitFor();check('Réserve critique · démarrage bloqué')
 await go('settings');await p.locator('[name=initialVolume]').fill('720');await click('Enregistrer les paramètres')
 await go('alerts');await p.getByLabel('Scénario de démonstration').selectOption('rain');await p.getByText(/Pluie significative prévue/).first().waitFor();await go('irrigation');await click('Démarrer l’arrosage');await p.getByRole('status').filter({hasText:/pluie/i}).waitFor();check('Alerte pluie et protection')
 await go('alerts');await p.getByLabel('Scénario de démonstration').selectOption('clear')
 await go('schedule');await click('Nouveau programme');await p.getByLabel('Nom du programme').fill('Jardin du jury');await p.getByLabel('Date de début').fill('2030-06-01');await p.getByLabel('Heure de début').fill('12:30');await click('Enregistrer le programme');await p.locator('.schedule-row').filter({hasText:'Jardin du jury'}).waitFor();check('Création du programme et calendrier')
 await go('iot');assert(await p.getByRole('button',{name:'Commande physique indisponible',exact:true}).isDisabled());check('ESP32 déconnecté')
 await go('reports');const dlPromise=p.waitForEvent('download');await p.getByRole('button',{name:/excel|xlsx/i}).first().click();const dl=await dlPromise;const book=new ExcelJS.Workbook();await book.xlsx.readFile(await dl.path());assert.equal(book.worksheets.length,7);assert(book.worksheets[1].rowCount>=3);check('XLSX relu, sept feuilles et cycles inscrits')
 await click('Ouvrir Floréol AI');await click('Combien de cycles de 10 minutes ?');await p.getByText(/Cela permet 33 cycles/).waitFor();await click('Fermer');check('Assistant contextualisé')
 await go('equipe');await p.getByRole('button',{name:/MAT Mohamed/}).click();await p.getByText('MAT',{exact:true}).last().waitFor();await p.getByRole('button',{name:/WM Wissal/}).click();await p.getByText('WM',{exact:true}).last().waitFor();await p.getByRole('button',{name:/HA Houssam/}).click();const auth=await p.evaluate(()=>window.FLOREOL_PUBLICATION?.photos??[]);if(auth.includes('HA')){await p.locator('.team-layout .portrait img').waitFor();assert(await p.locator('.team-layout .portrait img').evaluate(el=>el.naturalWidth>0))}check('Équipe, portraits selon les autorisations et initiales')
 await click('Mode jury');await click('Étape suivante');await p.getByRole('region',{name:'Visite guidée du jury'}).getByText('Le prototype',{exact:true}).waitFor();await p.keyboard.press('ArrowRight');await p.getByRole('region',{name:'Visite guidée du jury'}).getByText('L’énergie solaire',{exact:true}).waitFor();await click('Quitter la visite');check('Mode jury et commande clavier')
 await p.setViewportSize({width:390,height:844});await go('accueil');await p.locator('.fl-scene[data-view=live]').waitFor();await shot('accueil-mobile.png');await click('Menu principal');await p.getByRole('link',{name:'Control Center',exact:true}).first().click();await p.locator('.module-select select').selectOption('water');await shot('reservoir-mobile.png')
 for(const page of ['accueil','systeme','dashboard','water','irrigation','solar','settings','schedule','weather','studies','reports','equipe','projet']){await go(page);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Débordement mobile · '+page)}
 check('Navigation mobile et largeur de 13 écrans')
 await go('weather');check('Module météo accessible')
 assert.deepEqual(errors,[]);check('Aucune exception JavaScript')
 }
 await writeFile(dest+'/parcours.json',JSON.stringify({url:base,checks,errors},null,2))
}catch(e){console.error('PAGE',p.url(),(await p.locator('body').innerText()).slice(-1800));throw e}finally{await browser.close()}