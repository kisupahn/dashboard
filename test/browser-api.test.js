import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup(extra = {}) {
  const ctx = vm.createContext({ URL, AbortController, console, ...extra });
  for (const file of ['route-catalog.js', 'browser-api.js', 'news-player.js']) vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), ctx);
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
  for (const id of ['clock', 'settings', 'settingsBtn', 'relayUrl', 'relayToken', 'station', 'arsId', 'interval', 'saveStatus', 'closeSettingsBtn', 'arrivalPanels', 'emptyState', 'refreshBtn', 'refreshStatus', 'refreshHint', 'settingsForm', 'clearBtn', 'presetBtn', 'stopEditor', 'addStopBtn', 'fullscreenBtn', 'renewNotice', 'date', 'textScale', 'textScaleValue', 'editTokenBtn', 'newsEnabled', 'newsUrl', 'newsPanel', 'newsPlayer', 'newsLink', 'transitHeader', 'transitScreen', 'menuScreen', 'transitScreenBtn', 'menuScreenBtn', 'trotScreenBtn', 'trotScreen']) ids[id] = element();
  ids.settings.hidden = true; ids.renewNotice.hidden = true;
  let stored;
  const events = {}, timers = [];
  let fullscreenCalls = 0;
  const ctx = setup({
    document: { hidden: false, body: element(), documentElement: { style: { setProperty(key, value) { this[key] = value; } }, requestFullscreen: async () => { fullscreenCalls++; } }, getElementById: id => ids[id], createElement: element, addEventListener(type, fn) { events[type] = fn; }, head: { appendChild(script) { const u = new URL(script.src); Promise.resolve().then(() => ctx[u.searchParams.get('callback')](u.searchParams.get('type') === 'subway' ? { ok: false, error: { code: 'NETWORK', message: 'offline' } } : { ok: true, data: busBody })); } } },
    localStorage: { getItem: () => JSON.stringify({ ...settings, relayUrl: 'https://script.google.com/macros/s/test/exec', relayToken: 'test-token-123456789', interval: 30 }), setItem(k, v) { stored = JSON.parse(v); } },
    setTimeout: (fn, ms) => { const task = { fn, ms, cleared: false }; timers.push(task); return task; }, clearTimeout(task) { if (task) task.cleared = true; }, setInterval: () => 0,
    fetch: async url => { if (url.includes('swopenapi')) throw new Error('offline'); return reply({ ok: true, data: busBody }); },
  });
  vm.runInContext(readFileSync(new URL('../script.js', import.meta.url), 'utf8'), ctx);
  for (const card of ids.arrivalPanels.children) {
    assert.equal(card.children[1].textContent, '(로딩중)');
    assert.equal(card.children[1].hidden, false);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ids.relayToken.value, ''); assert.equal(ids.relayToken.disabled, true);
  assert.equal(ids.relayToken.placeholder, '저장됨');
  let newsFrame = ids.newsPlayer.children[0];
  assert.match(newsFrame.src, /youtube.com\/embed\/aZyD6EPl6KU/);
  assert.equal(ids.newsEnabled.checked, true); assert.equal(ids.newsPanel.hidden, false);
  const cards = ids.arrivalPanels.children;
  assert.equal(cards.length, 3);
  assert.equal(cards[0].children[0].children[1].textContent, '20276');
  assert.equal(cards[1].children[0].children[1].textContent, '노들역');
  assert.equal(cards[2].children[0].children[1].textContent, '노들역');
  assert.equal(cards[2].children[2].children[0].children[3].className, 'error route-error');
  assert.equal(cards[1].children[2].children[0].children[0].textContent, '360');
  assert.equal(cards[1].children[2].children[0].children[0].className, 'route-name trunk');
  assert.equal(cards[1].children[1].hidden, true);
  assert.equal(cards[0].className, 'transit-card bus');
  assert.equal(cards[2].className, 'transit-card subway');
  assert.equal(cards[2].children[3], undefined);
  assert.equal(ids.refreshHint.hidden, false);
  assert.equal(cards[0].children[3], undefined);
  for (const card of cards) assert.equal(card.children[2].children.length, 1);
  assert.equal(cards[0].children[2].children[0].children[1].children[0].textContent, '');
  assert.equal(cards[1].children[2].children[0].children[1].children[0].textContent, '3분 0초');
  assert.equal(cards[1].children[2].children[0].children[2].children[0].textContent, '10분 0초');
  assert.equal(cards[1].children[2].children[0].children.length, 3);
  // Ninety scheduled automatic cycles retain the current card until the fresh response arrives.
  const oldRow = cards[1].children[2].children[0];
  for (let i = 0; i < 90; i++) {
    const timer = timers.findLast(t => !t.cleared && t.fn.name === 'autoRefresh');
    assert(timer); assert(timer.ms > 59000 && timer.ms <= 60000); timer.cleared = true; timer.fn();
    if (i === 0) assert.equal(cards[1].children[2].children[0], oldRow);
    await new Promise(resolve => setImmediate(resolve));
    if (i < 89) assert.equal(ids.renewNotice.hidden, true);
  }
  assert.equal(ids.newsPlayer.children[0], newsFrame); assert.equal(ids.newsPanel.hidden, false);
  assert.equal(ids.arrivalPanels.hidden, true);
  assert.equal(ids.renewNotice.hidden, false);
  assert.equal(timers.some(t => !t.cleared && t.fn.name === 'autoRefresh'), false);
  events.click({ target: { closest: () => true } });
  assert.equal(ids.refreshBtn.disabled, false);
  events.click({ target: { closest: () => null } });
  assert.equal(ids.refreshBtn.disabled, true);
  assert.equal(ids.arrivalPanels.hidden, false);
  assert.equal(ids.renewNotice.hidden, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ids.settings.hidden, true);
  ids.menuScreenBtn.onclick();
  assert.equal(ids.menuScreen.hidden, false); assert.equal(ids.transitHeader.hidden, true); assert.equal(ids.transitScreen.hidden, true);
  assert.equal(ids.newsPlayer.children.length, 0);
  assert.equal(timers.some(t => !t.cleared && t.fn.name === 'autoRefresh'), false);
  events.visibilitychange();
  assert.equal(timers.some(t => !t.cleared && t.fn.name === 'autoRefresh'), false);
  ids.trotScreenBtn.onclick();
  assert.equal(ids.trotScreen.hidden, false); assert.equal(ids.menuScreen.hidden, true); assert.equal(ids.transitHeader.hidden, true);
  assert.equal(ids.newsPlayer.children.length, 0);
  assert.equal(timers.some(t => !t.cleared && t.fn.name === 'autoRefresh'), false);
  ids.transitScreenBtn.onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ids.menuScreen.hidden, true); assert.equal(ids.trotScreen.hidden, true); assert.equal(ids.transitHeader.hidden, false);
  assert.equal(ids.newsPlayer.children.length, 1);
  newsFrame = ids.newsPlayer.children[0];
  stored = undefined;
  ids.settingsBtn.onclick(); assert.equal(ids.settings.hidden, false);
  assert.equal(ids.textScale.value, 135);
  assert.equal(ids.stopEditor.children[0].children[2].children.length, 3);
  assert.equal(ids.stopEditor.children[0].children[2].children[0].textContent, '버스');
  ids.stopEditor.children[0].children[2].children[0].onclick();
  assert.equal(ids.stopEditor.children[0].children[2].children[0].textContent, '지하철');
  ids.stopEditor.children[0].children[2].children[0].onclick();
  assert.equal(ids.stopEditor.children[0].children[2].children[0].textContent, '버스');
  ids.closeSettingsBtn.onclick(); ids.settingsBtn.onclick();
  ids.editTokenBtn.onclick();
  assert.equal(ids.relayToken.value, ''); assert.equal(ids.relayToken.disabled, false);
  ids.relayToken.value = 'discard-this';
  ids.textScale.value = '170'; ids.textScale.oninput();
  assert.equal(ctx.document.documentElement.style['--text-scale'], '1.7');
  ids.closeSettingsBtn.onclick();
  assert.equal(ctx.document.documentElement.style['--text-scale'], '1.35');
  assert.equal(ids.relayToken.value, ''); assert.equal(ids.relayToken.disabled, true);
  ids.settingsBtn.onclick();
  ids.editTokenBtn.onclick();
  assert.equal(ids.relayToken.value, '');
  ids.settingsForm.onsubmit({ preventDefault() {} });
  assert.equal(ids.settings.hidden, false); assert.equal(stored, undefined);
  ids.editTokenBtn.onclick(); // Cancel blank replacement and keep the saved code.
  ids.textScale.value = '160'; ids.textScale.oninput();
  ids.stopEditor.children[0].children[1].children[1].onclick();
  await ids.fullscreenBtn.onclick(); assert.equal(fullscreenCalls, 1);
  ids.settingsForm.onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stored.relayToken, 'test-token-123456789'); assert.equal(stored.subwayKey, undefined); assert.equal(stored.interval, 60); assert.equal(stored.refreshPolicy, '60s-90'); assert.equal(stored.textScale, 160);
  assert.equal(ctx.document.documentElement.style['--text-scale'], '1.6');
  assert.equal(stored.stops[0].location, '20014');
  assert.equal(stored.stops[1].location, '20276');
  assert.equal(stored.station, undefined);
  assert.equal(stored.newsEnabled, true); assert.equal(ids.newsPlayer.children[0], newsFrame);
  ids.settingsBtn.onclick(); ids.editTokenBtn.onclick();
  ids.relayToken.value = 'new-code'; ids.newsUrl.value = 'https://youtu.be/abcdefghijk';
  ids.settingsForm.onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stored.relayToken, 'new-code'); assert.equal(ids.relayToken.value, '');
  assert.equal(ids.relayToken.disabled, true); assert.equal(stored.newsUrl, 'https://youtu.be/abcdefghijk');
  assert.notEqual(ids.newsPlayer.children[0], newsFrame);
  assert.match(ids.newsPlayer.children[0].src, /embed\/abcdefghijk/);
  ids.settingsBtn.onclick(); ids.newsUrl.value = 'https://example.com/not-youtube';
  ids.settingsForm.onsubmit({ preventDefault() {} });
  assert.equal(ids.settings.hidden, false); assert.equal(stored.newsUrl, 'https://youtu.be/abcdefghijk');
  ids.newsEnabled.checked = false;
  ids.settingsForm.onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stored.newsEnabled, false); assert.equal(ids.newsPanel.hidden, true);
  assert.equal(ids.newsPlayer.children.length, 0);
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
test('manual relay query requests cache bypass and detects an old deployed relay', async () => {
  const t = api.targets(settings)[2];
  let requested;
  const client = api.createClient(async url => { requested = new URL(url); return reply({ ok: true, data: busBody }); });
  const rows = await client.load(t, { ...connection, forceRefresh: true });
  assert.equal(requested.searchParams.get('refresh'), '1');
  assert.equal(rows.relayInfo.cacheBypass, false);
  const upgraded = api.createClient(async () => reply({ ok: true, data: busBody, capabilities: { forceRefresh: true }, cacheBypass: true }));
  assert.equal((await upgraded.load(t, { ...connection, forceRefresh: true })).relayInfo.cacheBypass, true);
});
test('diagnostic exposes conflicting source estimates without changing either input', () => {
  const [item] = api.normalize('subway', { realtimeArrivalList: [{ btrainNo: '9012', trainLineNm: '개화행 - 노량진방면', arvlMsg2: '8분 35초 후 (구반포)', barvlDt: '335', recptnDt: '2026-11-03 21:13:30', arvlCd: '99' }] });
  const text = api.diagnostic(item, Date.parse('2026-11-03T21:15:14+09:00'));
  assert(text.includes('열차번호: 9012'));
  assert(text.includes('원본 시간값(barvlDt): 335초'));
  assert(text.includes('현재 화면 계산: 약 3분 51초 후'));
  assert(text.includes('원본 안내문으로 계산: 약 6분 51초 후'));
  assert.equal(item.message, '8분 35초 후 (구반포)');
});
test('access code has no minimum length but must be nonempty', () => {
  assert.equal(new URL(api.relayURL(api.targets(settings)[2], { ...connection, relayToken: 'a' })).searchParams.get('token'), 'a');
  assert.throws(() => api.relayURL(api.targets(settings)[2], { ...connection, relayToken: '' }), { code: 'CONFIG' });
});
test('two arrival slots use actual bus vehicles only and leave missing slots blank', () => {
  const rows = api.normalize('bus', busBody);
  const slots = api.arrivalSlots('bus', rows);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].message, '3분 후');
  assert.equal(slots[1].message, '10분 후');
  const absent = api.arrivalSlots('bus', [{ message: '운행종료', secondMessage: '' }]);
  assert.equal(absent[0], null); assert.equal(absent[1], null);
  assert.equal(api.label({ type: 'bus', value: '20726', route: '동작08' }), '신동아정문');
});
test('subway groups each destination into its own two-arrival row', () => {
  const items = [1, 2, 3].map(n => ({ line: '1009', title: '개화행 - 노량진방면', direction: '상행', via: '노량진', message: n + '분 후', trainId: String(n) }));
  items.push({ ...items[0], title: '김포공항행 - 노량진방면', trainId: '4' });
  const rows = api.routeRows([{ target: api.targets(settings)[0], items }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, '9호선개화행');
  assert.equal(rows[0].lineName, '9호선'); assert.equal(rows[0].destination, '개화행');
  assert.equal(rows[0].slots.length, 2);
  assert.equal(rows[0].slots[1].message, '2분 후');
  assert.equal(rows[1].name, '9호선김포공항행');
  assert.equal(rows[1].slots[1], null);
});
test('bus stop distances are separated from arrival times for both upcoming vehicles', () => {
  const [first, second, third] = api.arrivalSlots('bus', [{ message: '3분20초후[2번째 전]', secondMessage: '8분후 (5번째전)' }]);
  assert.equal(first.message, '3분20초후');
  assert.equal(first.label, '2번째 전');
  assert.equal(second.message, '8분후');
  assert.equal(second.label, '5번째 전');
  assert.equal(third, undefined);
  const [soon] = api.arrivalSlots('bus', [{ message: '곧 도착[1번째전]', secondMessage: '' }]);
  assert.equal(soon.message, '곧 도착'); assert.equal(soon.label, '1번째 전');
  assert.equal(api.arrivalSlots('bus', [{ message: '4분 후' }])[0].label, '');
});
test('same stop combines multiple routes while different stop IDs and transport types remain separate', () => {
  const targets = api.targets({ station: '노들/9/공항방향', arsId: '20726/동작08, 20014/360, 20014/동작08' });
  const groups = api.groupTargets(targets);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].value, '20726');
  assert.equal(groups[1].targets.length, 2);
  assert.equal(groups[2].type, 'subway');
  const rows = api.routeRows(groups[1].targets.map(target => ({ target, items: [], pending: true, error: '' })));
  assert.equal(rows.length, 2); assert.equal(rows[0].name, '360'); assert.equal(rows[1].name, '동작08');
  assert.equal(rows[0].slots.length, 2); assert.equal(rows[0].slots[0], null);
});
test('bus countdown advances every second while stop distance remains unchanged', () => {
  const reference = Date.parse('2026-11-03T21:00:00+09:00');
  const slots = api.arrivalSlots('bus', [{ message: '3분20초후[2번째전]', secondMessage: '8분후[5번째전]', referenceAt: reference }]);
  assert.equal(api.presentation(slots[0].item, reference + 15000).message, '약 3분 5초 후');
  assert.equal(api.presentation(slots[0].item, reference + 16000).message, '약 3분 4초 후');
  assert.equal(api.presentation(slots[1].item, reference + 15000).message, '약 7분 45초 후');
  assert.equal(slots[0].label, '2번째 전');
  assert.equal(slots[1].label, '5번째 전');
  assert.equal(api.presentation(slots[0].item, reference + 300000).message, '예정 시각 경과 · 새 정보 대기');
});
test('bus source timestamp and relay cache age are accounted for without rebasing each tick', async () => {
  const reference = Date.parse('2026-11-03T21:00:00+09:00');
  const response = { ok: true, fetchedAt: new Date(reference).toISOString(), data: busBody };
  const client = api.createClient(async () => reply(response));
  const items = await client.load(api.targets(settings)[2], connection);
  const slot = api.arrivalSlots('bus', items)[0];
  assert.equal(api.presentation(slot.item, reference + 20000).message, '약 2분 40초 후');
  const stamped = { ...slot.item, sourceTime: '20261103205930' };
  assert.equal(api.presentation(stamped, reference).message, '약 2분 30초 후');
  const state = { ...slot.item, message: '곧 도착' };
  assert.equal(api.presentation(state, reference + 20000).message, '곧 도착');
});
test('legacy locations migrate into editable stop entries without losing conditions', () => {
  const migrated = api.migrateStops(settings);
  assert.equal(migrated[0].type, 'bus');
  assert.equal(migrated[0].location, '20276');
  assert.equal(migrated[2].condition, '9호선 공항방향');
  const ordered = [migrated[2], migrated[1], migrated[0]];
  const targets = api.targets({ stops: ordered });
  const groups = api.groupTargets(targets, true);
  assert.equal(groups[0].type, 'subway');
  assert.equal(groups[1].value, '20014');
  assert.equal(targets[0].via, '노량진');
  assert.equal(api.targets({ stops: [{ type: 'bus', location: '신동아정문', condition: '동작08' }] })[0].value, '20726');
  assert.equal(api.targets({ stops: [{ type: 'bus', location: '20014', condition: '360,동작08' }] }).length, 2);
  assert.throws(() => api.targets({ stops: [{ type: 'bus', location: '20014', condition: '' }] }));
});


test('news accepts shared video and live URLs and rejects non-YouTube or malformed sources', () => {
  const news = setup().TransitNews;
  for (const url of [
    'https://www.youtube.com/watch?v=abcdefghijk&extra=ignored',
    'https://youtu.be/abcdefghijk?si=ignored',
    'https://m.youtube.com/live/abcdefghijk',
    'https://www.youtube.com/embed/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
  ]) {
    const source = news.source(url);
    assert.equal(source.watchURL, 'https://www.youtube.com/watch?v=abcdefghijk');
    const embed = new URL(source.embedURL);
    assert.equal(embed.origin, 'https://www.youtube.com');
    assert.equal(embed.searchParams.get('mute'), '0');
    assert.equal(embed.searchParams.get('autoplay'), '1');
  }
  for (const url of ['', 'javascript:alert(1)', 'http://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://www.youtube.com/@ytnnews/live',
    'https://youtube.com/watch?v=short', 'https://user:pass@youtube.com/watch?v=abcdefghijk']) {
    assert.throws(() => news.source(url));
  }
});
