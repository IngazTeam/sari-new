import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { previewPolicy } from './preview-policy.mjs';
import './build-brand.mjs';
const root = resolve(import.meta.dirname, 'site');
const port = Number(process.env.PORT || 4329);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.png':'image/png','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
http.createServer(async (req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname, url;
  try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end(); }
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep) || pathname.includes('\0')) {res.writeHead(404);return res.end();}
  try {
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':previewPolicy(pathname,url.searchParams)});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port, '127.0.0.1', () => console.log(`Sari tenant dashboard concept: http://127.0.0.1:${port}/`));
