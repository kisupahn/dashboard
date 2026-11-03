import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { configSource } from '../scripts/setup-relay.mjs';
test('generated configuration round-trips quoted secrets as data', () => {
  const config = { SEOUL_SUBWAY_API_KEY: 'key";throw new Error("bad")//', SEOUL_BUS_API_KEY: 'key+/=', DASHBOARD_TOKEN: 'a-long-random-test-token' };
  const ctx = vm.createContext({});
  vm.runInContext(configSource(config), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.AUTOMATED_RELAY_CONFIG)), config);
});
