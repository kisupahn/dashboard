import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransit } from '../transit.js';
import { createServer } from '../server.js';
const env = { SEOUL_SUBWAY_API_KEY: 'secret-subway', SEOUL_BUS_API_KEY: 'secret+bus/key=' };
const reply = data => ({ ok: true, json: async () => data });
test('subway normalization, concurrent deduplication, cache expiry', async () => {
  let calls = 0, time = 0;
  const transit = createTransit({ env, now: () => time, fetchImpl: async url => {
    calls++;
    assert(decodeURIComponent(url.pathname).endsWith('/강남'));
    return reply({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ statnNm: '강남', barvlDt: '120', arvlMsg2: '2분 후' }] });
  } });
  const [a, b] = await Promise.all([transit.subway('강남'), transit.subway('강남')]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  assert.equal(a.arrivals[0].secondsUntilArrival, 120);
  assert.equal((await transit.subway('강남')).cached, true);
  time = 16000; await transit.subway('강남'); assert.equal(calls, 2);
});
test('bus key encoding and singleton result', async () => {
  const transit = createTransit({ env, fetchImpl: async url => {
    assert.equal(url.searchParams.get('serviceKey'), env.SEOUL_BUS_API_KEY);
    assert.equal(url.searchParams.get('arsId'), '01001');
    assert.equal(url.searchParams.get('resultType'), 'json');
    return reply({ msgHeader: { headerCd: '0' }, msgBody: { itemList: { stNm: '종로2가', rtNm: '101', arrmsg1: '3분 후', arrmsg2: '8분 후' } } });
  } });
  const data = await transit.bus('01001');
  assert.equal(data.stopName, '종로2가'); assert.equal(data.arrivals[0].second.message, '8분 후');
});
test('input and missing configuration', () => {
  const transit = createTransit({ env: {} });
  assert.throws(() => transit.subway('../secret'), { status: 400 });
  assert.throws(() => transit.bus('1001'), { status: 400 });
  assert.throws(() => transit.subway('서울'), { status: 503 });
  assert.throws(() => transit.bus('01001'), { status: 503 });
});
test('empty result versus provider errors', async () => {
  const empty = createTransit({ env, fetchImpl: async () => reply({ errorMessage: { code: 'INFO-200' } }) });
  assert.deepEqual((await empty.subway('서울')).arrivals, []);
  const bus = createTransit({ env, fetchImpl: async () => reply({ msgHeader: { headerCd: '4' } }) });
  assert.deepEqual((await bus.bus('01001')).arrivals, []);
  const failed = createTransit({ env, fetchImpl: async () => reply({ errorMessage: { code: 'ERROR-301' } }) });
  await assert.rejects(failed.subway('서울'), { status: 502 });
});
test('secret redaction, failures not cached, timeout', async () => {
  let calls = 0;
  const transit = createTransit({ env, fetchImpl: async () => { calls++; throw new Error('URL secret-subway'); } });
  for (let i = 0; i < 2; i++) await assert.rejects(transit.subway('서울'), e => e.status === 502 && !e.message.includes('secret-subway'));
  assert.equal(calls, 2);
  const timeout = createTransit({ env, fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  await assert.rejects(timeout.bus('01001'), { status: 504 });
});
test('HTTP routes, private file protection, method restriction', async t => {
  const server = createServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await (await fetch(base + '/api/health')).json()).configured, { subway: false, bus: false });
  for (const path of ['/.env', '/server.js', '/.git/config', '/unknown']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/api/subway/arrivals')).status, 400);
  assert.equal((await fetch(base + '/api/bus/arrivals?arsId=01001')).status, 503);
  assert.equal((await fetch(base + '/api/health', { method: 'POST' })).status, 405);
});
