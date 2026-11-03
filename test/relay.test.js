import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function relay({ props = {}, body = {}, status = 200 } = {}) {
  let calls = [];
  const cache = new Map();
  const ctx = vm.createContext({
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js', TEXT: 'text' }, createTextOutput(text) { return { text, setMimeType(type) { this.type = type; return this; } }; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: () => [1], base64EncodeWebSafe: () => 'digest' },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    UrlFetchApp: { fetch(url) { calls.push(url); return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) }; } },
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  return { get: parameter => ctx.doGet({ parameter }), calls };
}
const props = { SEOUL_SUBWAY_API_KEY: 'subway-secret', SEOUL_BUS_API_KEY: 'bus+/=', DASHBOARD_TOKEN: 'test-token-123456789' };
const params = { token: props.DASHBOARD_TOKEN, callback: '__seoulRelay_test' };
function decode(output) { return JSON.parse(output.text.slice(output.text.indexOf('(') + 1, -2)); }
test('authentication and callback validation happen before API fetch', () => {
  const app = relay({ props });
  assert.equal(decode(app.get({ ...params, token: 'wrong', type: 'bus', routeId: '100100057' })).error.code, 'AUTH');
  assert.equal(app.get({ ...params, callback: 'alert(1)//' }).type, 'text');
  assert.equal(app.calls.length, 0);
});
test('relay is fixed-host HTTP arrival service and encodes Decoding key once', () => {
  const app = relay({ props, body: { msgHeader: { headerCd: '0' }, msgBody: { itemList: [] } } });
  const p = { ...params, type: 'bus', routeId: '100100057' };
  assert.equal(decode(app.get(p)).ok, true);
  const url = new URL(app.calls[0]);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.pathname, '/api/rest/arrive/getArrInfoByRouteAll');
  assert.equal(url.searchParams.get('serviceKey'), 'bus+/=');
  app.get(p); assert.equal(app.calls.length, 1);
});
test('unknown targets rejected; health response exposes no keys', () => {
  const app = relay({ props });
  assert.equal(decode(app.get({ ...params, type: 'bus', routeId: 'https://evil.example' })).error.code, 'INPUT');
  const health = app.get({ ...params, type: 'health' });
  assert.equal(decode(health).configured.subway, true);
  assert(!health.text.includes('subway-secret'));
  assert.equal(app.calls.length, 0);
});
test('provider errors are sanitized; not cached; service end remains distinct', () => {
  const app = relay({ props, body: { msgHeader: { headerCd: '4', headerMsg: 'bus+/=' } } });
  const p = { ...params, type: 'bus', routeId: '100100057' };
  const output = app.get(p); assert.equal(decode(output).error.code, 'PROVIDER');
  assert(!output.text.includes('bus+/='));
  app.get(p); assert.equal(app.calls.length, 2);
  const ended = relay({ props, body: { msgHeader: { headerCd: '8' } } });
  assert.equal(decode(ended.get(p)).error.code, 'SERVICE_ENDED');
});
