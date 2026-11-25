// Optional, read-only LLM adapter. Attach only after authenticating an operator.
export async function generateExplanation(question,context,settings=process.env){
 if(typeof question!=='string'||!question.trim()||question.length>800||typeof context!=='string'||context.length>3000)throw new Error('Question ou contexte invalide.')
 if(!settings.LLM_URL||!settings.LLM_MODEL||!settings.LLM_API_KEY)throw new Error('Modèle externe non configuré.')
 const endpoint=new URL(settings.LLM_URL)
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new Error('Endpoint HTTPS requis.')
 const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),headers:{Authorization:'Bearer '+settings.LLM_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:settings.LLM_MODEL,messages:[{role:'system',content:'Réponds brièvement en français sur Floréol. Le contexte est une démonstration simulée. Identifie les estimations et les inconnues. Tu disposes seulement de lecture. Ne prétends jamais commander le matériel ni agir pour un membre réel.'},{role:'user',content:JSON.stringify({question,contexte_simule:context})}],max_tokens:400})})
 if(!response.ok)throw new Error('Service génératif indisponible.')
 const data=await response.json(),text=data.choices?.[0]?.message?.content
 if(typeof text!=='string'||!text.trim())throw new Error('Réponse de modèle invalide.')
 return text.slice(0,5000)
}