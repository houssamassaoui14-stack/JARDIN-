import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {initialState,begin,advance} from '../src/engine/model.ts'
import {referenceUrl,tangierStudy,parseMonthly} from '../src/services/studies.ts'
import {parseForecast,rainWindow,weatherUrl,demoForecast} from '../src/services/weather.ts'
import {createWorkbook,csvReport,groupedCycles} from '../src/services/reports.ts'

test('La référence JRC de Tanger conserve les 12 mois et la puissance exprimée en kWc',()=>{
  assert.equal(tangierStudy.rows.length,12)
  const url=new URL(referenceUrl(35.76,-5.83,70,30,0,15)!)
  assert.equal(url.searchParams.get('peakpower'),'0.07')
  assert.equal(url.pathname,'/api/v5_3/PVcalc')
  assert.equal(referenceUrl(100,0,50,20,0,15),null)
  const payload={outputs:{monthly:{fixed:tangierStudy.rows.map(v=>({month:v.month,E_m:v.kWh,'H(i)_m':v.irradiation}))}}}
  assert.deepEqual(parseMonthly(JSON.stringify(payload),'pvgis','Tanger').rows,tangierStudy.rows)
  assert.throws(()=>parseMonthly('{"outputs":{}}','pvgis','invalide'))
})
test('Import PVsyst mensuel avec unité et virgule décimale ; rejette mois manquant, répété ou unité inconnue',()=>{
  const lines=Array.from({length:12},(_,i)=>String(i+1)+';3500,5')
  const csv='PVsyst 8\nMonth;E_Grid\n;Wh\n'+lines.join('\n')
  assert.equal(parseMonthly(csv,'pvsyst','essai').rows[4].kWh,3.5005)
  assert.throws(()=>parseMonthly(csv.replace(';Wh',';W'),'pvsyst','unité'))
  assert.throws(()=>parseMonthly(csv+'\n12;42','pvsyst','doublon'))
  assert.throws(()=>parseMonthly(csv.slice(0,csv.lastIndexOf('\n')),'pvsyst','incomplet'))
  const meter='Mois;Energie_kWh\n'+lines.join('\n')
  assert.equal(parseMonthly(meter,'measured','compteur').rows[8].kWh,3500.5)
})
test('Prévision distante valide, rejet des champs absents et cumul de pluie sur la fenêtre choisie',()=>{
  const ts=1795604400
  const hourly={time:[ts,ts+3600,ts+7200],temperature_2m:[18,19,20],relative_humidity_2m:[61,65,67],precipitation:[0,2,1],precipitation_probability:[5,85,55],shortwave_radiation:[100,180,99],wind_speed_10m:[10,9,9],cloud_cover:[30,49,63]}
  const daily={time:[ts],temperature_2m_min:[15],temperature_2m_max:[20],precipitation_sum:[3],precipitation_probability_max:[85],sunrise:[ts],sunset:[ts+36000]}
  const data=parseForecast({hourly,daily,timezone:'Africa/Casablanca'},35,-5,Date.now())
  assert.deepEqual(rainWindow(data.hours,ts*1000,2),{mm:3,probability:85,hours:2})
  assert.throws(()=>parseForecast({hourly:{...hourly,temperature_2m:[null]},daily,timezone:'UTC'},35,-5,ts))
  assert.throws(()=>weatherUrl(100,0))
  assert.equal(demoForecast(ts*1000,35,-5,20,400,8,85).days.length,5)
})
test('Un vrai XLSX de sept feuilles conserve les durées, volumes, dates et inconnues de deux cycles',async()=>{
  let state=initialState(Date.UTC(2026,10,25,12))
  for(const minutes of [10,5]){
    const [next,error]=begin(state,minutes)
    assert.equal(error,null)
    state=advance(next,minutes*60000)
  }
  assert.equal(state.volumeL,470)
  const totals=groupedCycles(state.history,'week')
  assert.equal(totals.length,1)
  assert.equal(totals[0].liters,30)
  const csv=csvReport(state.history)
  assert.ok(csv.charCodeAt(0)===0xfeff && csv.includes('Simulation'))
  const book=await createWorkbook(state)
  const bytes=await book.xlsx.writeBuffer()
  assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK')
  const read=new ExcelJS.Workbook()
  await read.xlsx.load(bytes)
  assert.equal(read.worksheets.length,7)
  const ws=read.getWorksheet('Historique des arrosages')!
  assert.equal(ws.rowCount,3)
  assert.equal(ws.getCell('I2').value,10)
  assert.equal(ws.getCell('I3').value,20)
  assert.equal(ws.getCell('H2').value,470)
  assert.equal(ws.getCell('N3').value,null)
  assert.ok(ws.getCell('B3').value instanceof Date)
})
