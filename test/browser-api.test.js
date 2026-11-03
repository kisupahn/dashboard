import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ URL });
vm.runInContext(readFileSync(new URL('../browser-api.js', import.meta.url), 'utf8'), context);
const api = context.TransitAPI;
test('browser URL encoding and leading-zero stop ID', () => {
  const subway = api.buildURL('subway', { subwayKey: 'key/+', station: '서울' });
  assert(subway.startsWith('https://'));
  assert(subway.includes('key%2F%2B'));
  assert(decodeURIComponent(subway).endsWith('/서울'));
  const bus = new URL(api.buildURL('bus', { busKey: 'key+/=', arsId: '01001' }));
  assert.equal(bus.searchParams.get('serviceKey'), 'key+/=');
  assert.equal(bus.searchParams.get('arsId'), '01001');
  assert.throws(() => api.buildURL('bus', { busKey: 'key', arsId: '1001' }));
});
test('browser normalization, no data, auth errors', () => {
  assert.equal(api.normalize('subway', { errorMessage: { code: 'INFO-200' } }).length, 0);
  assert.equal(api.normalize('bus', { msgHeader: { headerCd: '4' } }).length, 0);
  assert.throws(() => api.normalize('subway', { errorMessage: { code: 'ERROR-301' } }));
  assert.throws(() => api.normalize('bus', { msgHeader: { headerCd: '7' } }));
  const rows = api.normalize('bus', { msgHeader: { headerCd: '0' }, msgBody: { itemList: { rtNm: '101', arrmsg1: '곧 도착', arrmsg2: '10분 후' } } });
  assert.equal(rows[0].message, '곧 도착');
  assert.equal(rows[0].detail, '10분 후');
});
test('multiple locations, deduplication, existing single-location settings', () => {
  const targets = api.targets({ subwayKey: 's', station: '강남, 서울, 강남', busKey: 'b', arsId: '01001, 01002' });
  assert.equal(targets.length, 4);
  assert.equal(targets[0].value, '강남');
  assert.equal(targets[1].value, '서울');
  assert.equal(targets[2].value, '01001');
  assert.equal(api.targets({ subwayKey: 's', station: '강남', arsId: '' }).length, 1);
  assert.equal(api.targets({ subwayKey: '', station: '강남', arsId: '' }).length, 0);
  assert.throws(() => api.targets({ busKey: 'b', arsId: '01001, 123' }));
  assert.throws(() => api.targets({ subwayKey: 's', station: Array.from({ length: 11 }, (_, i) => '역' + i).join(',') }));
});

test('multiple cards survive one failed request; settings start collapsed', async () => {
  function element() {
    return { children: [], hidden: false, value: '', className: '', textContent: '', appendChild(child) { this.children.push(child); }, setAttribute() {}, focus() {} };
  }
  const ids = {};
  for (const id of ['clock', 'testBtn', 'memo', 'settings', 'settingsBtn', 'subwayKey', 'busKey', 'station', 'arsId', 'interval', 'saveStatus', 'closeSettingsBtn', 'arrivalPanels', 'emptyState', 'refreshBtn', 'refreshStatus', 'settingsForm', 'clearBtn']) ids[id] = element();
  ids.settings.hidden = true;
  const sandbox = vm.createContext({
    URL, AbortController, console,
    document: { hidden: false, getElementById: id => ids[id], createElement: element, addEventListener() {} },
    localStorage: { getItem: () => JSON.stringify({ subwayKey: 's', station: '강남, 서울', busKey: 'b', arsId: '01001', interval: 60 }) },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: async url => {
      if (url.includes('script.googleusercontent')) return { json: async () => ({ memo: 'memo' }) };
      if (decodeURIComponent(url).endsWith('/강남')) throw new Error('network');
      if (url.includes('swopenapi')) return { ok: true, json: async () => ({ realtimeArrivalList: [{ trainLineNm: '서울행', arvlMsg2: '곧 도착' }] }) };
      return { ok: true, json: async () => ({ msgHeader: { headerCd: '4' } }) };
    },
  });
  vm.runInContext(readFileSync(new URL('../browser-api.js', import.meta.url), 'utf8'), sandbox);
  vm.runInContext(readFileSync(new URL('../script.js', import.meta.url), 'utf8'), sandbox);
  await new Promise(resolve => setImmediate(resolve));
  const cards = ids.arrivalPanels.children;
  assert.equal(cards.length, 3);
  assert.equal(cards[0].children[1].className, 'error');
  assert.equal(cards[1].children[2].children.length, 1);
  assert(cards[2].children[1].textContent.includes('도착정보 없음'));
  assert.equal(ids.settings.hidden, true);
  assert.equal(ids.refreshBtn.disabled, false);
});
