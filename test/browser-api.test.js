import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup(extra = {}) {
  const ctx = vm.createContext({ URL, AbortController, console, ...extra });
  for (const file of ['route-catalog.js', 'browser-api.js']) vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), ctx);
  return ctx;
}
const api = setup().TransitAPI;
const settings = { station: '노들/9/공항방향', arsId: '20276/동작08, 20014/360' };
const busBody = { msgHeader: { headerCd: '0' }, msgBody: { itemList: [
  { busRouteId: '100100057', arsId: '20014', stNm: '노들역', rtNm: '360', arrmsg1: '3분 후', arrmsg2: '10분 후' },
  { busRouteId: '100100057', arsId: '20013', stNm: '노들역', rtNm: '360', arrmsg1: '반대편' },
] } };
const reply = data => ({ ok: true, json: async () => data });
const connection = { relayUrl: 'https://script.google.com/macros/s/test/exec', relayToken: 'test-token-123456789' };
test('official static IDs; user stop preserved instead of guessing a correction', () => {
  const ts = api.targets(settings);
  assert.equal(ts[0].via, '노량진');
  assert.equal(ts[0].direction, undefined);
  assert.equal(ts[1].routeId, '119900009');
  assert.equal(ts[1].value, '20276');
  assert.equal(ts[2].routeId, '100100057');
  assert.equal(api.targets({ arsId: '01001/100100057' })[0].value, '01001');
  assert.throws(() => api.targets({ arsId: '20014' }));
  assert.throws(() => api.targets({ arsId: '20014/없는노선' }));
  assert.equal(api.targets({ station: '노들/9/상행,노들/9/하행,노들/9/상행' }).length, 2);
});
test('airport direction uses next station, independent of assumed up/down code', () => {
  const rows = api.normalize('subway', { realtimeArrivalList: [
    { statnNm: '노들', subwayId: '1009', updnLine: '하행', trainLineNm: '개화행 - 노량진방면', ordkey: '02', recptnDt: '2026-11-03 09:00:00' },
    { statnNm: '노들', subwayId: '1009', updnLine: '상행', trainLineNm: '중앙보훈병원행 - 흑석방면', ordkey: '01' },
    { statnNm: '노들', subwayId: '1009', trainLineNm: '염창행 - 노량진방면', ordkey: '01' },
    { statnNm: '다른역', subwayId: '1009', trainLineNm: '개화행 - 노량진방면' },
  ] });
  const selected = api.filter('subway', rows, api.targets(settings)[0]);
  assert.equal(selected.length, 2);
  assert(selected[0].title.startsWith('염창'));
  assert.equal(selected[1].sourceTime, '2026-11-03 09:00:00');
  const unknown = api.normalize('subway', { realtimeArrivalList: [{ statnNm: '노들', subwayId: '1009', trainLineNm: '개화행' }] });
  assert.throws(() => api.filter('subway', unknown, api.targets(settings)[0]), { code: 'DIRECTION_UNKNOWN' });
});
test('bus filters by both route ID and ARS; unresolved stop is not silently substituted', () => {
  const rows = api.normalize('bus', busBody);
  assert.equal(api.filter('bus', rows, api.targets(settings)[2]).length, 1);
  assert.equal(api.filter('bus', rows, api.targets(settings)[1]).length, 0);
  assert.equal(rows[0].detail, '다음 차량 · 10분 후');
});
test('provider errors are distinct from a successful empty response', () => {
  for (const code of ['1', '2', '3', '4', '5', '6', '7']) assert.throws(() => api.normalize('bus', { msgHeader: { headerCd: code } }), { code: 'PROVIDER' });
  assert.throws(() => api.normalize('bus', { msgHeader: { headerCd: '8' } }), { code: 'SERVICE_ENDED' });
  assert.equal(api.normalize('bus', { msgHeader: { headerCd: '0' }, msgBody: { itemList: null } }).length, 0);
  assert.equal(api.normalize('subway', { errorMessage: { code: 'INFO-200' } }).length, 0);
  assert.throws(() => api.normalize('subway', { errorMessage: { code: 'INFO-100', message: 'secret' } }), e => !e.message.includes('secret'));
});
test('same route shares an upstream request while applying different stop filters', async () => {
  let calls = 0;
  const client = api.createClient(async () => { calls++; return reply({ ok: true, data: busBody }); });
  const ts = api.targets({ arsId: '20014/360, 20013/360' });
  const [a, b] = await Promise.all(ts.map(t => client.load(t, connection)));
  assert.equal(calls, 1); assert.equal(a[0].arsId, '20014'); assert.equal(b[0].arsId, '20013');
  client.clear(); await client.load(ts[0], connection); assert.equal(calls, 2);
});
test('network, HTTP, and invalid JSON failures are sanitized and not cached', async () => {
  const target = api.targets(settings)[2]; let calls = 0;
  const client = api.createClient(async () => { calls++; throw new Error('https://secret-key/'); });
  for (let i = 0; i < 2; i++) await assert.rejects(client.load(target, connection), e => e.code === 'NETWORK' && !e.message.includes('secret-key'));
  assert.equal(calls, 2);
  await assert.rejects(api.createClient(async () => ({ ok: false, status: 503 })).load(target, connection), { code: 'HTTP' });
  await assert.rejects(api.createClient(async () => ({ ok: true, json: async () => { throw new Error('xml'); } })).load(target, connection), { code: 'FORMAT' });
});
test('UI creates three independent cards, preserves keys, closes settings on save', async () => {
  function element() {
    let text = '';
    return { children: [], hidden: false, value: '', className: '', set textContent(v) { text = v; this.children = []; }, get textContent() { return text; }, remove() {}, appendChild(c) { this.children.push(c); }, setAttribute() {}, focus() {} };
  }
  const ids = {};
  for (const id of ['clock', 'settings', 'settingsBtn', 'relayUrl', 'relayToken', 'station', 'arsId', 'interval', 'saveStatus', 'closeSettingsBtn', 'arrivalPanels', 'emptyState', 'refreshBtn', 'refreshStatus', 'settingsForm', 'clearBtn', 'presetBtn']) ids[id] = element();
  ids.settings.hidden = true;
  let stored;
  const ctx = setup({
    document: { hidden: false, getElementById: id => ids[id], createElement: element, addEventListener() {}, head: { appendChild(script) { const u = new URL(script.src); Promise.resolve().then(() => ctx[u.searchParams.get('callback')](u.searchParams.get('type') === 'subway' ? { ok: false, error: { code: 'NETWORK', message: 'offline' } } : { ok: true, data: busBody })); } } },
    localStorage: { getItem: () => JSON.stringify({ ...settings, relayUrl: 'https://script.google.com/macros/s/test/exec', relayToken: 'test-token-123456789', interval: 60 }), setItem(k, v) { stored = JSON.parse(v); } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    fetch: async url => { if (url.includes('swopenapi')) throw new Error('offline'); return reply({ ok: true, data: busBody }); },
  });
  vm.runInContext(readFileSync(new URL('../script.js', import.meta.url), 'utf8'), ctx);
  await new Promise(resolve => setImmediate(resolve));
  const cards = ids.arrivalPanels.children;
  assert.equal(cards.length, 3); assert.equal(cards[0].children[1].className, 'error');
  assert.equal(cards[1].children[2].children.length, 0);
  assert.equal(cards[2].children[2].children.length, 1);
  assert.equal(ids.settings.hidden, true);
  ids.settingsBtn.onclick(); assert.equal(ids.settings.hidden, false);
  ids.settingsForm.onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stored.relayToken, 'test-token-123456789'); assert.equal(stored.subwayKey, undefined); assert.equal(stored.interval, 180);
  assert.equal(ids.settings.hidden, true); assert.equal(ids.refreshBtn.disabled, false);
});
test('relay URL contains no provider keys and rejects non-deployment addresses', () => {
  const connection = { relayUrl: 'https://script.google.com/macros/s/test/exec', relayToken: 'test-token-123456789' };
  const url = new URL(api.relayURL(api.targets(settings)[2], connection));
  assert.equal(url.searchParams.get('routeId'), '100100057');
  assert.equal(url.searchParams.has('serviceKey'), false);
  assert.equal(url.searchParams.get('token'), connection.relayToken);
  assert.throws(() => api.relayURL({}, { ...connection, relayUrl: 'https://evil.example/exec' }));
  assert.throws(() => api.relayURL({}, { ...connection, relayUrl: 'https://script.google.com/macros/s/test/dev' }));
});
test('relay envelope handles authentication and passes arrival data through filters', async () => {
  const connection = { relayUrl: 'https://script.google.com/macros/s/test/exec', relayToken: 'test-token-123456789' };
  const target = api.targets(settings)[2];
  const ok = api.createClient(async () => reply({ ok: true, data: busBody }));
  assert.equal((await ok.load(target, connection))[0].arsId, '20014');
  const auth = api.createClient(async () => reply({ ok: false, error: { code: 'AUTH', message: '접속 코드 불일치' } }));
  await assert.rejects(auth.load(target, connection), { code: 'AUTH' });
});
test('screenshot: 8m35 at 21:13:30 KST becomes 6m51 at 21:15:14', () => {
  const [item] = api.normalize('subway', { realtimeArrivalList: [{ trainLineNm: '개화행 - 노량진방면', arvlMsg2: '8분 35초 후 (구반포)', recptnDt: '2026-11-03 21:13:30', barvlDt: '0' }] });
  const atRefresh = Date.parse('2026-11-03T21:15:14+09:00');
  assert.equal(api.presentation(item, atRefresh).message, '약 6분 51초 후');
  assert.equal(api.presentation(item, atRefresh + 1000).message, '약 6분 50초 후');
  assert.equal(api.presentation(item, atRefresh + 600000).message, '예정 시각 경과 · 새 정보 대기');
});
test('arrival states remain states, missing/future source timestamps do not invent a countdown', () => {
  const [item] = api.normalize('subway', { realtimeArrivalList: [{ arvlMsg2: '노들 도착', barvlDt: '100', recptnDt: '2026-11-03 21:13:30' }] });
  const now = Date.parse('2026-11-03T21:15:14+09:00');
  assert.equal(api.presentation(item, now).message, '노들 도착');
  assert.equal(api.presentation({ ...item, sourceTime: '', message: '8분 후' }, now).message, '8분 후');
  assert.equal(api.presentation({ ...item, message: '8분 후' }, now - 600000).message, '8분 후');
});
test('already departed trains cannot occupy the two next-arrival positions', () => {
  const target = api.targets(settings)[0];
  const rows = api.normalize('subway', { realtimeArrivalList: [
    { statnNm: '노들', subwayId: '1009', trainLineNm: '개화행 - 노량진방면', arvlCd: '2' },
    { statnNm: '노들', subwayId: '1009', trainLineNm: '개화행 - 노량진방면', arvlCd: '3' },
  ] });
  assert.equal(api.filter('subway', rows, target).length, 1);
  assert.equal(api.filter('subway', rows, target)[0].arrivalCode, '3');
});
