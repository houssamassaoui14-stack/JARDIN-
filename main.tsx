import {createRoot} from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './style.css'
import './console.css'
import './responsive.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<App/>)
if(import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))