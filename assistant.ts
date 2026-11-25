export async function requestExplanation(origin:string,session:string,question:string,context:string){
 const url=new URL(origin)
 if(url.protocol!=='https:'||url.username||url.password||!session)throw new Error('Adresse HTTPS et session opérateur requises.')
 const r=await fetch(new URL('/api/assistant',url.origin),{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(22000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify({question,context})})
 if(!r.ok)throw new Error('Le service génératif est indisponible ou la session est refusée.')
 const body=await r.json();if(typeof body.answer!=='string'||!body.answer.trim())throw new Error('Réponse externe invalide.')
 return body.answer as string
}