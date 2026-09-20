import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surcharge, coopUnitValue, phaseOn } from './tax.js';

const ON = '2026-09-19';

test('phase one condo brackets, flat on the whole value, statute boundaries', () => {
  assert.equal(surcharge(999_999, { on: ON }).applies, false);
  assert.equal(surcharge(999_999, { on: ON }).tax, 0);
  assert.deepEqual(pick(surcharge(1_000_000, { on: ON })), { applies: true, rate: 0.04, tax: 40_000 });
  assert.deepEqual(pick(surcharge(1_390_768, { on: ON })), { applies: true, rate: 0.04, tax: 55_631 });
  assert.deepEqual(pick(surcharge(3_000_000, { on: ON })), { applies: true, rate: 0.04, tax: 120_000 });
  assert.deepEqual(pick(surcharge(3_000_001, { on: ON })), { applies: true, rate: 0.0525, tax: 157_500 });
  assert.deepEqual(pick(surcharge(5_000_000, { on: ON })), { applies: true, rate: 0.0525, tax: 262_500 });
  assert.deepEqual(pick(surcharge(5_000_001, { on: ON })), { applies: true, rate: 0.065, tax: 325_000 });
  assert.equal(surcharge(1_000_000, { on: ON }).threshold, 1e6);
});

test('class one schedule', () => {
  assert.equal(surcharge(4_999_999, { kind: 'class1', on: ON }).applies, false);
  assert.deepEqual(pick(surcharge(5_000_000, { kind: 'class1', on: ON })), { applies: true, rate: 0.008, tax: 40_000 });
  assert.deepEqual(pick(surcharge(20_000_000, { kind: 'class1', on: ON })), { applies: true, rate: 0.0105, tax: 210_000 });
  assert.deepEqual(pick(surcharge(30_000_000, { kind: 'class1', on: ON })), { applies: true, rate: 0.013, tax: 390_000 });
});

test('phase two moves condos to the class-one schedule; nothing outside the window', () => {
  assert.equal(phaseOn('2026-06-30'), null);
  assert.equal(phaseOn('2031-07-01'), null);
  assert.equal(phaseOn('2028-07-01').name, 'Phase two');
  assert.equal(surcharge(2_000_000, { on: '2028-07-01' }).applies, false);
  assert.deepEqual(pick(surcharge(6_000_000, { on: '2028-07-01' })), { applies: true, rate: 0.008, tax: 48_000 });
  assert.equal(surcharge(2_000_000, { on: '2026-06-01' }).applies, false);
});

test('co-op imputed unit value', () => {
  assert.equal(coopUnitValue(13_795_000, 210, 12_000), 241_413);
  assert.equal(coopUnitValue(13_795_000, 0, 12_000), null);
  assert.equal(coopUnitValue(13_795_000, 13_000, 12_000), null);
  assert.equal(coopUnitValue(null, 1, 2), null);
});

function pick(r) { return { applies: r.applies, rate: r.rate, tax: r.tax }; }
