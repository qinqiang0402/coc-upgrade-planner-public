import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only merge the reviewed preview rows; the legacy widget has its own older catalog.
export function syncTh19Preview(html, preview) {
  const matches = [...html.matchAll(/atob\('([^']+)'\)/g)];
  if (matches.length !== 1) throw new Error('Expected one embedded legacy catalog.');
  const [token, encoded] = matches[0];
  const items = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (!Array.isArray(items)) throw new Error('Invalid embedded catalog.');
  const byId = new Map(items.map(item => [item.i, item]));
  if (byId.size !== items.length) throw new Error('Duplicate legacy IDs.');
  for (const addition of preview.appendLevels) {
    const item = byId.get(addition.itemId);
    if (!item || item.m !== 'to') throw new Error(`Unsupported preview item: ${addition.itemId}`);
    for (const row of addition.rows) {
      const existing = item.l.find(candidate => candidate[0] === row[0]);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(row)) throw new Error(`Conflicting preview level: ${addition.itemId} ${row[0]}`);
      } else {
        if (row[0] !== item.l.at(-1)[0] + 1) throw new Error(`Missing prior level: ${addition.itemId}`);
        item.l.push(row);
      }
    }
    item.previewTargetLevels = addition.rows.map(row => row[0]);
  }
  for (const source of preview.newItems) {
    const existing = byId.get(source.i);
    if (existing) {
      if (existing.e !== source.e || JSON.stringify(existing.l) !== JSON.stringify(source.l)) throw new Error(`Conflicting preview item: ${source.i}`);
      continue;
    }
    if (items.some(item => item.e === source.e)) throw new Error(`Duplicate preview name: ${source.e}`);
    const item = structuredClone(source);
    item.previewTargetLevels = item.l.filter((_, index) => item.m !== 'from' || index < item.l.length - 1)
      .map(row => item.m === 'from' ? row[0] + 1 : row[0]);
    items.push(item);
    byId.set(item.i, item);
  }
  const updated = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  return { html: html.replace(token, `atob('${updated}')`), count: items.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const widgetPath = process.argv[2];
  if (!widgetPath) throw new Error('Usage: node scripts/sync-th19-legacy.mjs WIDGET_PATH');
  const preview = JSON.parse(await readFile(new URL('../data/th19-preview.json', import.meta.url), 'utf8'));
  const result = syncTh19Preview(await readFile(widgetPath, 'utf8'), preview);
  await writeFile(widgetPath, result.html);
  console.log(`Legacy widget contains ${result.count} items.`);
}
