import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ApiError, createTransit } from './transit.js';

export function createServer({ env = process.env, transit = createTransit({ env }) } = {}) {
  // 프로젝트 루트를 통째로 공개하지 않습니다. .env, 소스, Git 파일은 접근 불가합니다.
  const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
    ['/browser-api.js', ['browser-api.js', 'text/javascript; charset=utf-8']],
  ]);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    function json(status, body) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    }
    try {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 지원합니다.' } });
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') {
        return json(200, { status: 'ok', configured: { subway: Boolean(env.SEOUL_SUBWAY_API_KEY), bus: Boolean(env.SEOUL_BUS_API_KEY) } });
      }
      if (url.pathname === '/api/subway/arrivals') return json(200, await transit.subway(url.searchParams.get('station')));
      if (url.pathname === '/api/bus/arrivals') return json(200, await transit.bus(url.searchParams.get('arsId')));
      const asset = staticFiles.get(url.pathname);
      if (!asset) return json(404, { error: { code: 'NOT_FOUND', message: '요청한 경로가 없습니다.' } });
      const content = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch (error) {
      json(error instanceof ApiError ? error.status : 500, {
        error: { code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : '서버 오류가 발생했습니다.' },
      });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 범위의 정수여야 합니다.');
  const server = createServer();
  server.listen(port, host, () => console.log(`Dashboard: http://${host}:${port}`));
  const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
