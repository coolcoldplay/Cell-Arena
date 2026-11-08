import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../dist/artistoo-playground.html', import.meta.url));
http.createServer(async (req,res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url !== '/' && req.url !== '/index.html' && req.url !== '/artistoo-playground.html') { res.writeHead(404); res.end('Not found'); return; }
  try { const content = await readFile(file); res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); res.end(content); }
  catch { res.writeHead(500); res.end('Run npm run build first.'); }
}).listen(4175, '127.0.0.1', () => console.log('Cell-Arena: http://127.0.0.1:4175'));
