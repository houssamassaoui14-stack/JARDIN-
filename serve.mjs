import http from 'node:http'
import path from 'node:path'
import {createReadStream,existsSync,statSync} from 'node:fs'
const root=path.resolve('dist'), port=Number(process.env.PORT||4173)
if(!existsSync(path.join(root,'index.html')))throw new Error('Le dossier dist doit accompagner ce lanceur.')
const types={'.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.glb':'model/gltf-binary','.webp':'image/webp','.webm':'video/webm','.png':'image/png','.woff2':'font/woff2','.json':'application/json'}
http.createServer((req,res)=>{let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{res.writeHead(400).end();return}
if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
if(file===root)file=path.join(root,'index.html')
if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});createReadStream(path.join(root,'404.html')).pipe(res);return}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');createReadStream(file).pipe(res)}).listen(port,'127.0.0.1',()=>console.log('Floréol : http://127.0.0.1:'+port+'/ · Ctrl+C pour quitter.'))