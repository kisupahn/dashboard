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
