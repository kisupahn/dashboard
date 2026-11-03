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
test('requested bus service and encoding: no stationinfo dependency', () => {
  const url = new URL(api.buildURL('bus', { routeId: '100100057', busKey: 'key+/=' }));
  assert.equal(url.pathname, '/api/rest/arrive/getArrInfoByRouteAll');
  assert.equal(url.searchParams.get('busRouteId'), '100100057');
  assert.equal(url.searchParams.get('serviceKey'), 'key+/=');
  assert.equal(url.searchParams.get('resultType'), 'json');
  assert.equal(url.searchParams.has('arsId'), false);
  assert(api.buildURL('subway', { station: '노들', subwayKey: 'key/+' }).endsWith(encodeURIComponent('노들')));
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
  const client = api.createClient(async () => { calls++; return reply(busBody); });
  const ts = api.targets({ arsId: '20014/360, 20013/360' });
  const [a, b] = await Promise.all(ts.map(t => client.load(t, 'key')));
  assert.equal(calls, 1); assert.equal(a[0].arsId, '20014'); assert.equal(b[0].arsId, '20013');
  client.clear(); await client.load(ts[0], 'key'); assert.equal(calls, 2);
});
test('network, HTTP, and invalid JSON failures are sanitized and not cached', async () => {
  const target = api.targets(settings)[2]; let calls = 0;
  const client = api.createClient(async () => { calls++; throw new Error('https://secret-key/'); });
  for (let i = 0; i < 2; i++) await assert.rejects(client.load(target, 'secret-key'), e => e.code === 'NETWORK' && !e.message.includes('secret-key'));
  assert.equal(calls, 2);
  await assert.rejects(api.createClient(async () => ({ ok: false, status: 503 })).load(target, 'key'), { code: 'HTTP' });
  await assert.rejects(api.createClient(async () => ({ ok: true, json: async () => { throw new Error('xml'); } })).load(target, 'key'), { code: 'FORMAT' });
});
test('UI creates three independent cards, preserves keys, closes settings on save', async () => {
  function element() {
    let text = '';
    return { children: [], hidden: false, value: '', className: '', set textContent(v) { text = v; this.children = []; }, get textContent() { return text; }, appendChild(c) { this.children.push(c); }, setAttribute() {}, focus() {} };
  }
  const ids = {};
  for (const id of ['clock', 'settings', 'settingsBtn', 'subwayKey', 'busKey', 'station', 'arsId', 'interval', 'saveStatus', 'closeSettingsBtn', 'arrivalPanels', 'emptyState', 'refreshBtn', 'refreshStatus', 'settingsForm', 'clearBtn', 'presetBtn']) ids[id] = element();
  ids.settings.hidden = true;
  let stored;
  const ctx = setup({
    document: { hidden: false, getElementById: id => ids[id], createElement: element, addEventListener() {} },
    localStorage: { getItem: () => JSON.stringify({ ...settings, subwayKey: 's', busKey: 'b', interval: 60 }), setItem(k, v) { stored = JSON.parse(v); } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    fetch: async url => { if (url.includes('swopenapi')) throw new Error('offline'); return reply(busBody); },
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
  assert.equal(stored.subwayKey, 's'); assert.equal(stored.busKey, 'b'); assert.equal(stored.interval, 180);
  assert.equal(ids.settings.hidden, true); assert.equal(ids.refreshBtn.disabled, false);
});
