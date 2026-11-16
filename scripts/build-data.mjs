import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(join(projectRoot, 'data/upgrades.json'), 'utf8'));
const corrections = JSON.parse(await readFile(join(projectRoot, 'data/corrections.json'), 'utf8'));
const unlockHallOverrides = JSON.parse(await readFile(join(projectRoot, 'data/unlock-hall-overrides.json'), 'utf8'));
const th19Preview = JSON.parse(await readFile(join(projectRoot, 'data/th19-preview.json'), 'utf8'));
const novemberAdjustments = JSON.parse(await readFile(join(projectRoot, 'data/nov-2026-adjustments.json'), 'utf8'));

if (!Array.isArray(catalog.items) || catalog.items.length !== catalog.meta.itemCount) {
  throw new Error('Catalog item count does not match metadata.');
}
const byId = new Map(catalog.items.map(item => [item.i, item]));
if (byId.size !== catalog.items.length) throw new Error('Duplicate item IDs in catalog.');

const matchedOverrides = new Set();
for (const item of catalog.items) {
  const key = `${item.v}:${item.e}`;
  if (Object.hasOwn(unlockHallOverrides, key)) {
    item.h = unlockHallOverrides[key];
    matchedOverrides.add(key);
  }
}
for (const key of Object.keys(unlockHallOverrides)) {
  if (!matchedOverrides.has(key)) throw new Error(`Unlock override item not found: ${key}`);
}

for (const correction of corrections) {
  const item = byId.get(correction.itemId);
  if (!item) throw new Error(`Correction item not found: ${correction.itemId}`);
  if (!Number.isFinite(correction.newValue) || correction.newValue < 0 || !correction.evidence || !correction.status) {
    throw new Error(`Invalid correction metadata: ${correction.itemId}`);
  }
  if (item.m !== 'from' || correction.toLevel !== correction.fromLevel + 1) {
    throw new Error(`Unsupported correction step: ${correction.itemId}`);
  }
  const row = item.l.find(entry => entry[0] === correction.fromLevel);
  if (!row || row[1] !== correction.oldValue || correction.field !== 'timeSeconds') {
    throw new Error(`Correction source value changed: ${correction.itemId} ${correction.fromLevel}→${correction.toLevel}`);
  }
  row[1] = correction.newValue;
}

for (const adjustment of novemberAdjustments.rows) {
  const item = byId.get(adjustment.itemId);
  const row = item?.l.find(candidate => candidate[0] === adjustment.level);
  if (item?.m !== 'to' || !row || row[1] !== adjustment.old[0] || row[2] !== adjustment.old[1]) {
    throw new Error(`November adjustment source changed: ${adjustment.itemId} ${adjustment.level}`);
  }
  [row[1], row[2]] = adjustment.new;
  item.previewTargetLevels ??= [];
  item.previewTargetLevels.push(adjustment.level);
}

for (const addition of th19Preview.appendLevels) {
  const item = byId.get(addition.itemId);
  if (!item || !['to', 'from'].includes(item.m)) throw new Error(`Unsupported TH19 preview item: ${addition.itemId}`);
  let previous = item.l[item.l.length - 1][0];
  for (const row of addition.rows) {
    if (row[0] !== ++previous) throw new Error(`Nonconsecutive TH19 preview level: ${addition.itemId}`);
    if (item.m === 'to') item.l.push(row);
    else {
      const tail = item.l.at(-1);
      if (tail[1] !== 0 || tail[2] !== 0) throw new Error(`Expected terminal row: ${addition.itemId}`);
      tail[1] = row[1];
      tail[2] = row[2];
      item.l.push([row[0], 0, 0, row[3]]);
    }
  }
  item.previewTargetLevels = [...(item.previewTargetLevels || []), ...addition.rows.map(row => row[0])];
}
for (const item of th19Preview.newItems) {
  if (byId.has(item.i) || catalog.items.some(existing => existing.v === item.v && existing.e === item.e)) {
    throw new Error(`Duplicate TH19 preview item: ${item.i}`);
  }
  item.previewTargetLevels = item.l.filter((_, index) => item.m !== 'from' || index < item.l.length - 1)
    .map(row => item.m === 'from' ? row[0] + 1 : row[0]);
  catalog.items.push(item);
  byId.set(item.i, item);
}
catalog.meta.itemCount = catalog.items.length;
catalog.meta.version = '0.1.3-partial';
catalog.meta.knownGaps = [
  '19本部分兵种、建筑、陷阱和守护者等级仍缺少可核实的时间与费用',
  '2026年11月旧等级费用与时间调整尚未全面复核',
  '部分已移除的旧超级充能仍显示，请勿用于当前升级规划',
  ...catalog.meta.knownGaps
];
catalog.meta.th19Preview = { checkedAt: th19Preview.checkedAt, status: th19Preview.status, source: th19Preview.source, note: th19Preview.note };
catalog.meta.corrections = corrections;
const output = `// Generated from upgrades.json, unlock-hall-overrides.json, corrections.json, nov-2026-adjustments.json and th19-preview.json. Run: npm run build:data\nwindow.COC_CATALOG = ${JSON.stringify(catalog)};\n`;
await writeFile(join(projectRoot, 'data/upgrades.js'), output);
console.log(`Built catalog: ${catalog.items.length} items, ${corrections.length} correction(s).`);
