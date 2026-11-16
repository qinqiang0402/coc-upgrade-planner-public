import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(join(projectRoot, 'data/upgrades.json'), 'utf8'));
const corrections = JSON.parse(await readFile(join(projectRoot, 'data/corrections.json'), 'utf8'));
const unlockHallOverrides = JSON.parse(await readFile(join(projectRoot, 'data/unlock-hall-overrides.json'), 'utf8'));
const th19Preview = JSON.parse(await readFile(join(projectRoot, 'data/th19-preview.json'), 'utf8'));

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

for (const addition of th19Preview.appendLevels) {
  const item = byId.get(addition.itemId);
  if (!item || item.m !== 'to') throw new Error(`Unsupported TH19 preview item: ${addition.itemId}`);
  let previous = item.l[item.l.length - 1][0];
  for (const row of addition.rows) {
    if (row[0] !== ++previous) throw new Error(`Nonconsecutive TH19 preview level: ${addition.itemId}`);
    item.l.push(row);
  }
  item.previewTargetLevels = addition.rows.map(row => row[0]);
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
catalog.meta.version = '0.1.2-preview';
catalog.meta.knownGaps = [
  '19本多数建筑、英雄、兵种、小队及其他新等级尚未收录',
  '2026年11月旧等级费用与时间调整尚未全面复核',
  ...catalog.meta.knownGaps
];
catalog.meta.th19Preview = { checkedAt: th19Preview.checkedAt, status: th19Preview.status, source: th19Preview.source, note: th19Preview.note };
catalog.meta.corrections = corrections;
const output = `// Generated from upgrades.json, unlock-hall-overrides.json, corrections.json and th19-preview.json. Run: npm run build:data\nwindow.COC_CATALOG = ${JSON.stringify(catalog)};\n`;
await writeFile(join(projectRoot, 'data/upgrades.js'), output);
console.log(`Built catalog: ${catalog.items.length} items, ${corrections.length} correction(s).`);
