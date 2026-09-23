import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(join(root, path), 'utf8');
const source = JSON.parse(await read('data/upgrades.json'));
const corrections = JSON.parse(await read('data/corrections.json'));
const unlockHallOverrides = JSON.parse(await read('data/unlock-hall-overrides.json'));
const runtime = {};
runInNewContext(await read('data/upgrades.js'), { window: runtime });
const core = {};
runInNewContext(await read('core.js'), core);
const catalog = runtime.COC_CATALOG;

test('catalog covers the recorded item count without duplicate IDs', () => {
  assert.equal(catalog.items.length, source.meta.itemCount);
  assert.equal(new Set(catalog.items.map(item => item.i)).size, catalog.items.length);
});

test('every item has consecutive levels and nonnegative values', () => {
  for (const item of catalog.items) {
    assert.ok(item.l.length >= 1, `${item.e}: no levels`);
    for (let i = 0; i < item.l.length; i++) {
      const [level, seconds, cost, hall] = item.l[i];
      assert.ok(Number.isInteger(level) && level > 0, `${item.e}: invalid level`);
      if (i) assert.equal(level, item.l[i - 1][0] + 1, `${item.e}: level gap`);
      assert.ok(Number.isFinite(seconds) && seconds >= 0, `${item.e}: invalid time`);
      assert.ok(Number.isInteger(hall) && hall > 0, `${item.e}: invalid hall`);
      if (typeof cost === 'number') assert.ok(Number.isFinite(cost) && cost >= 0, `${item.e}: invalid cost`);
      else for (const value of Object.values(cost)) assert.ok(Number.isFinite(value) && value >= 0, `${item.e}: invalid resource cost`);
    }
  }
});

test('corrections retain their original evidence and are applied once', () => {
  for (const correction of corrections) {
    const original = source.items.find(item => item.i === correction.itemId);
    const current = catalog.items.find(item => item.i === correction.itemId);
    assert.ok(original && current);
    assert.equal(original.l.find(row => row[0] === correction.fromLevel)[1], correction.oldValue);
    assert.equal(current.l.find(row => row[0] === correction.fromLevel)[1], correction.newValue);
    assert.ok(correction.evidence && correction.status);
  }
});

test('generated data is in sync with the editable source files', () => {
  const expected = structuredClone(source);
  for (const item of expected.items) item.h = unlockHallOverrides[`${item.v}:${item.e}`] ?? item.h;
  for (const correction of corrections) {
    expected.items.find(item => item.i === correction.itemId).l.find(row => row[0] === correction.fromLevel)[1] = correction.newValue;
  }
  expected.meta.corrections = corrections;
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), expected);
});

test('Battle Machine 5→6 matches the user screenshot under Gold Pass 20%', () => {
  const machine = catalog.items.find(item => item.e === 'Battle Machine');
  assert.equal(machine.m, 'from');
  const result = core.COC_CORE.calculateSelection(machine, 5, 6, 1, { boost: 20, extraBoost: 'none' });
  assert.equal(result.time, 14 * 3600 + 20 * 60);
  assert.equal(result.costs['Builder Elixir'], 1_200_000);
});

test('Hammer Jam halves eligible Home Village time and cost', () => {
  const building = catalog.items.find(item => item.e === 'Dark Spell Factory');
  const regular = core.COC_CORE.calculateSelection(building, 0, 1, 1, { boost: 0, extraBoost: 'none' });
  const hammer = core.COC_CORE.calculateSelection(building, 0, 1, 1, { boost: 0, extraBoost: 'hammerJam50' });
  assert.equal(hammer.time, regular.time / 2);
  assert.equal(hammer.costs.Elixir, regular.costs.Elixir / 2);
});

test('Hammer Jam and Gold Pass are estimated multiplicatively', () => {
  const building = catalog.items.find(item => item.e === 'Dark Spell Factory');
  const result = core.COC_CORE.calculateSelection(building, 0, 1, 1, { boost: 20, extraBoost: 'hammerJam50' });
  assert.equal(result.time, 2 * 3600 + 20 * 60);
  assert.equal(result.costs.Elixir, 52_000);
});

test('Hammer Jam excludes Supercharges, Crafted Defenses and Builder Base', () => {
  const excluded = [
    catalog.items.find(item => item.c === 'supercharge'),
    catalog.items.find(item => item.c === 'crafted'),
    catalog.items.find(item => item.v === 'builderBase' && item.c === 'building')
  ];
  for (const item of excluded) {
    assert.equal(core.COC_CORE.isHammerJamEligible(item), false, item.e);
    const current = item.m === 'to' ? 0 : item.l[0][0];
    const normal = core.COC_CORE.calculateSelection(item, current, current + 1, 1, { boost: 0, extraBoost: 'none' });
    const hammer = core.COC_CORE.calculateSelection(item, current, current + 1, 1, { boost: 0, extraBoost: 'hammerJam50' });
    assert.equal(hammer.time, normal.time, item.e);
    assert.deepEqual({ ...hammer.costs }, { ...normal.costs }, item.e);
  }
});

test('returning boost remains time-only and old saved value remains readable', () => {
  assert.equal(core.COC_CORE.normalizeExtraBoost(50), 'returning50');
  assert.equal(core.COC_CORE.normalizeExtraBoost('hammerJam50'), 'hammerJam50');
  const building = catalog.items.find(item => item.e === 'Dark Spell Factory');
  const regular = core.COC_CORE.calculateSelection(building, 0, 1, 1, { boost: 0, extraBoost: 'none' });
  const returning = core.COC_CORE.calculateSelection(building, 0, 1, 1, { boost: 0, extraBoost: 'returning50' });
  assert.equal(returning.time, regular.time / 2);
  assert.deepEqual({ ...returning.costs }, { ...regular.costs });
});

test('the standalone page includes every app control and local asset', async () => {
  const html = await read('index.html');
  const app = await read('app.js');
  const requiredIds = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  for (const id of requiredIds) assert.ok(html.includes(`id="${id}"`), `missing control ${id}`);
  for (const asset of ['styles.css', 'data/upgrades.js', 'core.js', 'app.js', 'pwa.js', 'service-worker.js', 'sources.html', 'icon.svg']) {
    await assert.doesNotReject(read(asset), `missing asset ${asset}`);
  }
});
