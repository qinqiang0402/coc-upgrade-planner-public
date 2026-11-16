import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function syncCommunitySnapshot(html, overlay) {
  const matches = [...html.matchAll(/atob\('([^']+)'\)/g)];
  if (matches.length !== 1) throw new Error('Expected one embedded legacy catalog.');
  const [token, encoded] = matches[0];
  const items = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const byId = new Map(items.map(item => [item.i, item]));
  if (byId.size !== items.length) throw new Error('Duplicate legacy IDs.');
  for (const entry of overlay.entries) {
    const item = byId.get(entry.itemId);
    const hash = item && createHash('sha256').update(JSON.stringify(item.l)).digest('hex');
    if (!item || (hash !== entry.previousRowsSha256 && JSON.stringify(item.l) !== JSON.stringify(entry.rows))) {
      throw new Error(`Legacy source rows differ: ${entry.itemId}`);
    }
    item.l = entry.rows;
    item.previewTargetLevels = [...new Set([...(item.previewTargetLevels || []), ...entry.changedTargets])];
  }
  const artillery = byId.get('u250');
  if (!artillery) throw new Error('Missing historical reference.');
  artillery.n = '地狱火炮（历史参考）';
  artillery.o = '历史参考：官方本次更新称17本武器已合并为单一等级；以下为用户提供的旧版逐级数据，不代表当前可升级。';
  artillery.obsolete = true;
  for (const id of ['u17', 'u24', 'u27', 'u78', 'u74', 'u80', 'u22', 'u7', 'u4', 'u29']) {
    const item = byId.get(id);
    if (!item) continue;
    if (!item.n.endsWith('（已移除 · 历史参考）')) item.n += '（已移除 · 历史参考）';
    item.o = '官方更新说明称此超级充能已移除；旧等级仅保留用于查看历史方案，不可作为当前升级规划。';
    item.obsolete = true;
  }
  const updated = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  return { html: html.replace(token, `atob('${updated}')`), count: items.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const widgetPath = process.argv[2];
  if (!widgetPath) throw new Error('Usage: node scripts/sync-community-legacy.mjs WIDGET_PATH');
  const overlay = JSON.parse(await readFile(new URL('../data/clashperk-2026-11-16.json', import.meta.url), 'utf8'));
  const result = syncCommunitySnapshot(await readFile(widgetPath, 'utf8'), overlay);
  await writeFile(widgetPath, result.html);
  console.log(`Updated legacy widget: ${result.count} items.`);
}
