import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/artistoo-playground.html', import.meta.url));
const host=process.argv.find(x=>x.startsWith('--host='))?.slice(7)||'127.0.0.1';
const port=Number(process.argv.find(x=>x.startsWith('--port='))?.slice(7)||4175);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
const demos=new Set(['01-specific-recognition','02-reversible-hiding','03-heritable-escape','03-control-kill-off','04-clonal-replacement']);
http.createServer(async (req,res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const name=req.url?.match(/^\/experiments\/([a-z0-9-]+)\.json$/)?.[1];
  if(name&&demos.has(name)){
    try{const data=await readFile(new URL('../experiments/immune-genetics/'+name+'.json',import.meta.url));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'.json"','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Demo not found');}return;
  }
  if (req.url !== '/' && req.url !== '/index.html' && req.url !== '/artistoo-playground.html') { res.writeHead(404); res.end('Not found'); return; }
  try { const content = await readFile(file); res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); res.end(content); }
  catch { res.writeHead(500); res.end('Run npm run build first.'); }
}).listen(port, host, () => console.log('Cell-Arena preview: http://'+host+':'+port));
