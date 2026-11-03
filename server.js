// 로컬 개발 미리보기 전용. 실제 화면은 정적 호스팅에서 서버 없이 실행합니다.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': 'index.html', '/index.html': 'index.html', '/script.js': 'script.js', '/news-player.js': 'news-player.js', '/browser-api.js': 'browser-api.js', '/route-catalog.js': 'route-catalog.js' };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const name = files[new URL(req.url, 'http://localhost').pathname];
  if (req.method !== 'GET' || !name) { res.writeHead(404); res.end(); return; }
  try {
    const body = await readFile(new URL(name, import.meta.url));
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch (_) { res.writeHead(500); res.end('Preview error'); }
}).listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + port));
