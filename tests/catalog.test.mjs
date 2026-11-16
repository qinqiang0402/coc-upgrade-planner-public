import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { syncLegacyWidget } from '../scripts/sync-legacy-widget.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(join(root, path), 'utf8');
const source = JSON.parse(await read('data/upgrades.json'));
const corrections = JSON.parse(await read('data/corrections.json'));
const unlockHallOverrides = JSON.parse(await read('data/unlock-hall-overrides.json'));
const th19Preview = JSON.parse(await read('data/th19-preview.json'));
const runtime = {};
runInNewContext(await read('data/upgrades.js'), { window: runtime });
const core = {};
runInNewContext(await read('core.js'), core);
const catalog = runtime.COC_CATALOG;

test('catalog covers the recorded item count without duplicate IDs', () => {
  assert.equal(catalog.items.length, source.meta.itemCount + th19Preview.newItems.length);
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
  for (const addition of th19Preview.appendLevels) {
    const item = expected.items.find(candidate => candidate.i === addition.itemId);
    item.l.push(...addition.rows);
    item.previewTargetLevels = addition.rows.map(row => row[0]);
  }
  for (const item of th19Preview.newItems) {
    const copy = structuredClone(item);
    copy.previewTargetLevels = item.l.filter((_, index) => item.m !== 'from' || index < item.l.length - 1)
      .map(row => item.m === 'from' ? row[0] + 1 : row[0]);
    expected.items.push(copy);
  }
  expected.meta.itemCount = expected.items.length;
  expected.meta.version = '0.1.2-preview';
  expected.meta.knownGaps = ['19本多数建筑、英雄、兵种、小队及其他新等级尚未收录', '2026年11月旧等级费用与时间调整尚未全面复核', ...expected.meta.knownGaps];
  expected.meta.th19Preview = { checkedAt: th19Preview.checkedAt, status: th19Preview.status, source: th19Preview.source, note: th19Preview.note };
  expected.meta.corrections = corrections;
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), expected);
});

test('TH19 preview steps are selectable and labeled without inventing missing levels', () => {
  const hall = catalog.items.find(item => item.e === 'Town Hall');
  assert.deepEqual(Array.from(hall.l.find(row => row[0] === 19)), [19, 13 * 86400, 27_000_000, 18]);
  assert.deepEqual({ ...core.COC_CORE.stageUpgradeBounds(hall, 19) }, { current: 18, target: 19 });
  assert.ok(hall.previewTargetLevels.includes(19));
  const spiky = catalog.items.find(item => item.e === 'Spiky Tower');
  assert.deepEqual(Array.from(spiky.l, row => Array.from(row)), [[1, 15 * 86400, 500_000, 19], [2, 15.5 * 86400, 510_000, 19]]);
  const spell = catalog.items.find(item => item.e === 'Heroic Spell');
  assert.deepEqual(Array.from(core.COC_CORE.stageUpgradeRows(spell, 19), row => row[0]), [3]);
  assert.deepEqual({ ...core.COC_CORE.stageUpgradeBounds(spell, 19) }, { current: 3, target: 4 });
  const result = core.COC_CORE.calculateSelection(spell, 3, 4, 1, { boost: 20, extraBoost: 'none' });
  assert.equal(result.costs.Elixir, 25_600_000);
  assert.equal(result.time, 12 * 86400 + 9 * 3600);
  assert.equal(catalog.meta.th19Preview.status, 'pre_release_reference_not_verified_in_game');
});

test('Battle Machine 5→6 matches the user screenshot under Gold Pass 20%', () => {
  const machine = catalog.items.find(item => item.e === 'Battle Machine');
  assert.equal(machine.m, 'from');
  const result = core.COC_CORE.calculateSelection(machine, 5, 6, 1, { boost: 20, extraBoost: 'none' });
  assert.equal(result.time, 14 * 3600 + 20 * 60);
  assert.equal(result.costs['Builder Elixir'], 1_200_000);
});

test('Town Hall 16→17 is present and TH17 stage points to the correct step', () => {
  const townHall = catalog.items.find(item => item.e === 'Town Hall');
  assert.deepEqual(Array.from(townHall.l.find(row => row[0] === 17)), [17, 10 * 86400, 16_000_000, 16]);
  assert.deepEqual({ ...core.COC_CORE.stageUpgradeBounds(townHall, 17) }, { current: 16, target: 17 });
  assert.deepEqual(Array.from(core.COC_CORE.stageUpgradeRows(townHall, 17), row => row[0]), [17]);
  assert.deepEqual(Array.from(core.COC_CORE.stageUpgradeRows(townHall, 18), row => row[0]), [18]);
  const result = core.COC_CORE.calculateSelection(townHall, 16, 17, 1, { boost: 20, extraBoost: 'none' });
  assert.equal(result.time, 8 * 86400);
  assert.equal(result.costs.Gold, 12_800_000);
});

test('Inferno Artillery 1→5 matches the user-provided TH17 reference table', () => {
  const artillery = catalog.items.find(item => item.e === 'Inferno Artillery');
  assert.ok(artillery);
  assert.equal(artillery.i, 'u250');
  assert.equal(artillery.m, 'from');
  assert.equal(artillery.maxCopies, 1);
  assert.equal(artillery.provenance.status, 'user_reference_screenshot');
  assert.deepEqual(Array.from(artillery.l, row => Array.from(row)), [
    [1, 6 * 86400, 10_000_000, 17],
    [2, 7 * 86400, 12_000_000, 17],
    [3, 8 * 86400, 14_000_000, 17],
    [4, 10 * 86400, 18_000_000, 17],
    [5, 0, 0, 17]
  ]);
  assert.deepEqual(Array.from(core.COC_CORE.stageUpgradeRows(artillery, 17), row => row[0]), [1, 2, 3, 4]);
  assert.deepEqual({ ...core.COC_CORE.stageUpgradeBounds(artillery, 17) }, { current: 1, target: 5 });
  assert.equal(core.COC_CORE.stageUpgradeRows(artillery, 16).length, 0);
  const full = core.COC_CORE.calculateSelection(artillery, 1, 5, 1, { boost: 0, extraBoost: 'none' });
  assert.equal(full.time, 31 * 86400);
  assert.equal(full.costs.Gold, 54_000_000);
  const goldPass = core.COC_CORE.calculateSelection(artillery, 1, 2, 1, { boost: 20, extraBoost: 'none' });
  assert.equal(goldPass.time, 4 * 86400 + 19 * 3600);
  assert.equal(goldPass.costs.Gold, 8_000_000);
});

test('legacy widget catalog insertion preserves older items', () => {
  const older = [{ i: 'u1', e: 'Town Hall' }, { i: 'u32', e: 'Inferno Tower' }];
  const html = `before atob('${Buffer.from(JSON.stringify(older)).toString('base64')}') after`;
  const artillery = source.items.find(item => item.e === 'Inferno Artillery');
  const result = syncLegacyWidget(html, artillery);
  assert.equal(result.originalCount, 2);
  assert.equal(result.updatedCount, 3);
  const encoded = result.html.match(/atob\('([^']+)'\)/)[1];
  const updated = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assert.deepEqual([updated[0], updated[2]], older);
  assert.deepEqual(updated[1], artillery);
  assert.throws(() => syncLegacyWidget(result.html, artillery), /already present/);
});

test('TH17 stage exposes upgradeable items, not TH18-only steps', () => {
  const items = catalog.items.filter(item => item.v === 'home' && core.COC_CORE.stageUpgradeRows(item, 17).length);
  assert.ok(items.length >= 80);
  assert.ok(items.some(item => item.e === 'Town Hall'));
  assert.ok(items.some(item => item.e === 'Firespitter'));
  const townHall = items.find(item => item.e === 'Town Hall');
  assert.ok(core.COC_CORE.stageUpgradeRows(townHall, 17).every(row => row[0] === 17));
  const grandWarden = items.find(item => item.e === 'Grand Warden');
  assert.ok(core.COC_CORE.stageUpgradeRows(grandWarden, 17).some(row => row[0] === 70));
  assert.ok(!core.COC_CORE.stageUpgradeRows(grandWarden, 16).some(row => row[0] === 70));
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
