import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function syncLegacyWidget(html, item) {
  const matches = [...html.matchAll(/atob\('([^']+)'\)/g)];
  if (matches.length !== 1) throw new Error(`Expected one embedded catalog, found ${matches.length}.`);
  const [matched, encoded] = matches[0];
  const items = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (!Array.isArray(items) || !items.length) throw new Error('Embedded catalog is empty or invalid.');
  if (items.some(existing => existing.i === item.i || existing.e === item.e)) {
    throw new Error(`Item already present in embedded catalog: ${item.e}`);
  }
  const originalCount = items.length;
  const insertAt = items.findIndex(existing => existing.e === 'Inferno Tower');
  if (insertAt < 0) throw new Error('Inferno Tower anchor not found in embedded catalog.');
  items.splice(insertAt, 0, item);
  const nextEncoded = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  const updated = html.replace(matched, `atob('${nextEncoded}')`);
  return { html: updated, originalCount, updatedCount: items.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [widgetPath, itemId] = process.argv.slice(2);
  if (!widgetPath || !itemId) throw new Error('Usage: node scripts/sync-legacy-widget.mjs WIDGET_PATH ITEM_ID');
  const source = JSON.parse(await readFile(new URL('../data/upgrades.json', import.meta.url), 'utf8'));
  const item = source.items.find(entry => entry.i === itemId);
  if (!item) throw new Error(`Source item not found: ${itemId}`);
  const result = syncLegacyWidget(await readFile(widgetPath, 'utf8'), item);
  await writeFile(widgetPath, result.html);
  console.log(`Updated legacy widget catalog: ${result.originalCount} → ${result.updatedCount} items.`);
}
