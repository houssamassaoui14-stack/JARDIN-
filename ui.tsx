import { useEffect,useRef,type ReactNode } from 'react'
import { X } from 'lucide-react'
export const num=(value:number|null|undefined,places=1)=>value==null||!Number.isFinite(value)?'—':value.toLocaleString('fr-FR',{maximumFractionDigits:places})
export const time=(ms:number,options:Intl.DateTimeFormatOptions={hour:'2-digit',minute:'2-digit'})=>new Intl.DateTimeFormat('fr-FR',{...options,timeZone:'Africa/Casablanca'}).format(new Date(ms))
export const media=(name:string)=>import.meta.env.BASE_URL+'media/'+name
export const goto=(page:string)=>{if(location.hash.slice(1)===page)window.scrollTo(0,0);else location.hash=page}
export function Dialog({title,children,close,side=false}:{title:string,children:ReactNode,close:()=>void,side?:boolean}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const d=ref.current!,old=document.activeElement as HTMLElement;d.showModal();return()=>{d.close();old?.focus()}},[])
 return <dialog className={side?'side-dialog':'modal'} ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===ref.current){const r=ref.current!.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}}><div className="dialog-head"><h2>{title}</h2><button type="button" className="iconbutton" onClick={close} aria-label="Fermer"><X size={19}/></button></div>{children}</dialog>
}
export function Rows({items}:{items:[string,ReactNode][]}){return <dl className="data-rows">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
export function Metric({label,value,unit,sub}:{label:string,value:ReactNode,unit?:string,sub?:string}){return <div className="metric"><span>{label}</span><strong>{value} <small>{unit}</small></strong>{sub&&<p>{sub}</p>}</div>}