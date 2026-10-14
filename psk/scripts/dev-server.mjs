// Local stand-in for Vercel: serves public/ and maps /api/<name> to api/<name>.js handlers.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {vercelResponse} from './dev-shim.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));const pub=path.join(root,'public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg'};
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname.startsWith('/api/')){
    const name=url.pathname.slice(5).replace(/[^a-z]/g,'');const file=path.join(root,'api',name+'.js');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    let body='';for await(const c of req)body+=c;
    const vres=vercelResponse(res);
    const {default:h}=await import(file);
    return h({method:req.method,headers:req.headers,query:Object.fromEntries(url.searchParams),body:body?(()=>{try{return JSON.parse(body)}catch{return body}})():undefined},vres);
  }
  let p=path.join(pub,decodeURIComponent(url.pathname));
  // Mirror Vercel: directories serve index.html, and cleanUrls maps /about to about.html.
  if(fs.existsSync(p)&&fs.statSync(p).isDirectory()){if(!url.pathname.endsWith('/')){res.writeHead(308,{Location:url.pathname+'/'+url.search});return res.end();}p=path.join(p,'index.html');}
  else if(!fs.existsSync(p)&&fs.existsSync(p+'.html'))p+='.html';
  if(!p.startsWith(pub)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);
}).listen(port,()=>console.log('http://localhost:'+port));
