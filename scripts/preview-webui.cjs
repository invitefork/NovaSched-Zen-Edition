/* Local development preview. The fixture never ships in webroot. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../module-template/webroot');
const fixture=require('./webui-fixture.cjs');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'};
http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1:8765');
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
  try{
    let data=fs.readFileSync(file);
    /* Windows 路径分隔符是反斜杠，endsWith('/index.html') 在 Windows 上永远为假，
     * fixture 从不注入 → 预览永远"离线"。改用与分隔符无关的判断。 */
    if(file.replace(/\\/g,'/').endsWith('/index.html'))data=Buffer.from(data.toString().replace('<script src="./assets/liquid-glass.js">',`<script>(${fixture.toString()})({presence:'absent'});</script><script src="./assets/liquid-glass.js">`));
    response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(data);
  }catch{response.writeHead(404).end();}
}).listen(8765,'0.0.0.0',()=>console.log('Local WebUI preview: http://127.0.0.1:8765/ (synthetic service)'));
