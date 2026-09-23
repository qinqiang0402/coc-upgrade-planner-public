import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(join(projectRoot, 'data/upgrades.json'), 'utf8'));
const corrections = JSON.parse(await readFile(join(projectRoot, 'data/corrections.json'), 'utf8'));
const unlockHallOverrides = JSON.parse(await readFile(join(projectRoot, 'data/unlock-hall-overrides.json'), 'utf8'));

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

catalog.meta.corrections = corrections;
const output = `// Generated from upgrades.json and corrections.json. Run: npm run build:data\nwindow.COC_CATALOG = ${JSON.stringify(catalog)};\n`;
await writeFile(join(projectRoot, 'data/upgrades.js'), output);
console.log(`Built catalog: ${catalog.items.length} items, ${corrections.length} correction(s).`);
