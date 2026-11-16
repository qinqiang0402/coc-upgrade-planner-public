import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only merge the reviewed preview rows; the legacy widget has its own older catalog.
export function syncTh19Preview(html, preview, adjustments = { rows: [] }) {
  const matches = [...html.matchAll(/atob\('([^']+)'\)/g)];
  if (matches.length !== 1) throw new Error('Expected one embedded legacy catalog.');
  const [token, encoded] = matches[0];
  const items = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (!Array.isArray(items)) throw new Error('Invalid embedded catalog.');
  const byId = new Map(items.map(item => [item.i, item]));
  if (byId.size !== items.length) throw new Error('Duplicate legacy IDs.');
  for (const adjustment of adjustments.rows) {
    const item = byId.get(adjustment.itemId);
    const row = item?.l.find(candidate => candidate[0] === adjustment.level);
    if (item?.m !== 'to' || !row) throw new Error(`Missing adjustment level: ${adjustment.itemId}`);
    const current = [row[1], row[2]];
    if (JSON.stringify(current) !== JSON.stringify(adjustment.old) &&
        JSON.stringify(current) !== JSON.stringify(adjustment.new)) {
      throw new Error(`Conflicting adjustment: ${adjustment.itemId} ${adjustment.level}`);
    }
    [row[1], row[2]] = adjustment.new;
    item.previewTargetLevels = [...new Set([...(item.previewTargetLevels || []), adjustment.level])];
  }
  for (const addition of preview.appendLevels) {
    const item = byId.get(addition.itemId);
    if (!item || !['to', 'from'].includes(item.m)) throw new Error(`Unsupported preview item: ${addition.itemId}`);
    for (const row of addition.rows) {
      const existing = item.l.find(candidate => candidate[0] === row[0]);
      if (existing) {
        if (item.m === 'to' && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error(`Conflicting preview level: ${addition.itemId} ${row[0]}`);
        if (item.m === 'from') {
          const previous = item.l.find(candidate => candidate[0] === row[0] - 1);
          if (!previous || previous[1] !== row[1] || previous[2] !== row[2] || existing[3] !== row[3]) {
            throw new Error(`Conflicting preview level: ${addition.itemId} ${row[0]}`);
          }
        }
      } else {
        if (row[0] !== item.l.at(-1)[0] + 1) throw new Error(`Missing prior level: ${addition.itemId}`);
        if (item.m === 'to') item.l.push(row);
        else {
          const tail = item.l.at(-1);
          if (tail[1] !== 0 || tail[2] !== 0) throw new Error(`Expected terminal row: ${addition.itemId}`);
          tail[1] = row[1];
          tail[2] = row[2];
          item.l.push([row[0], 0, 0, row[3]]);
        }
      }
    }
    item.previewTargetLevels = [...new Set([...(item.previewTargetLevels || []), ...addition.rows.map(row => row[0])])];
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
  const adjustments = JSON.parse(await readFile(new URL('../data/nov-2026-adjustments.json', import.meta.url), 'utf8'));
  const result = syncTh19Preview(await readFile(widgetPath, 'utf8'), preview, adjustments);
  await writeFile(widgetPath, result.html);
  console.log(`Legacy widget contains ${result.count} items.`);
}
