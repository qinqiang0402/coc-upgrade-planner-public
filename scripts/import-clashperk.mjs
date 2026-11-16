import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

// Run against a deliberately saved, reviewed snapshot, not a live URL.
const [inputPath, outputPath, baselinePath, retrievedAt] = process.argv.slice(2);
if (!inputPath || !outputPath || !baselinePath || !/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt || '')) {
  throw new Error('Usage: node scripts/import-clashperk.mjs RAW_JSON OUTPUT_JSON BASELINE_JS YYYY-MM-DD');
}
const bytes = await readFile(resolve(inputPath));
const raw = JSON.parse(bytes);
if (!raw.fingerprint || !Array.isArray(raw.buildings)) throw new Error('Unexpected source schema.');
const sandbox = { window: {} };
runInNewContext(await readFile(resolve(baselinePath), 'utf8'), sandbox);
const catalog = sandbox.window.COC_CATALOG;
const kinds = { building: 'buildings', wall: 'buildings', trap: 'traps', troop: 'troops',
  spell: 'spells', hero: 'heroes', pet: 'pets', guardian: 'guardians' };
const entries = [];
const skipped = [];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
for (const item of catalog.items) {
  const group = kinds[item.c];
  if (!group || !['home', 'builderBase'].includes(item.v)) continue;
  const candidates = raw[group].filter(source => source.name === item.e && !source.is_seasonal &&
    (!source.village_type || source.village_type === (item.v === 'home' ? 'home' : 'builder_base')));
  if (candidates.length !== 1) { skipped.push({ itemId: item.i, reason: 'ambiguous_or_missing', matches: candidates.length }); continue; }
  const source = candidates[0];
  if (item.c !== 'wall' && item.r !== source.upgrade_resource) {
    skipped.push({ itemId: item.i, reason: 'resource_mismatch' }); continue;
  }
  const sourceLevels = source.levels;
  if (!sourceLevels?.length || sourceLevels[0].level !== item.l[0][0] || sourceLevels.at(-1).level < item.l.at(-1)[0]) {
    skipped.push({ itemId: item.i, reason: 'incompatible_level_range' }); continue;
  }
  let invalid = false;
  const rows = sourceLevels.map((level, index) => {
    const old = item.l.find(row => row[0] === level.level);
    const hall = Number.isInteger(level.required_townhall) && level.required_townhall > 0
      ? level.required_townhall : old?.[3];
    const next = sourceLevels[index + 1];
    const time = item.m === 'to' ? level.build_time : (next?.upgrade_time ?? 0);
    const cost = item.m === 'to' ? level.build_cost : (next?.upgrade_cost ?? 0);
    if (!Number.isInteger(hall) || hall < 1 || !Number.isFinite(time) || time < 0 ||
        !Number.isFinite(cost) || cost < 0 || (index && level.level !== sourceLevels[index - 1].level + 1)) invalid = true;
    return [level.level, time, cost, hall];
  });
  if (invalid) { skipped.push({ itemId: item.i, reason: 'invalid_or_missing_fields' }); continue; }
  // Preserve the user's explicit screenshot-based Battle Machine correction.
  if (item.i === 'u182') {
    const old = item.l.find(row => row[0] === 5);
    const row = rows.find(row => row[0] === 5);
    if (!old || !row) throw new Error('Missing Battle Machine screenshot correction.');
    row[1] = old[1];
    row[2] = old[2];
  }
  const changedTargets = [];
  for (const row of rows) {
    const old = item.l.find(entry => entry[0] === row[0]);
    if (!old || JSON.stringify(old) !== JSON.stringify(row)) {
      if (item.m === 'to') changedTargets.push(row[0]);
      else if (row[0] < rows.at(-1)[0]) changedTargets.push(row[0] + 1);
    }
  }
  if (changedTargets.length) entries.push({ itemId: item.i, sourceId: source.id,
    previousRowsSha256: digest(item.l), rows, changedTargets });
}
const output = { source: 'https://assets.clashperk.com/raw.json',
  sourceFingerprint: raw.fingerprint, sha256: createHash('sha256').update(bytes).digest('hex'),
  retrievedAt, status: 'community_game_data_not_verified_in_game',
  exclusions: ['Inferno Artillery: user-provided historical reference retained',
    'Battle Machine 5→6: screenshot-derived time retained',
    'Missing required hall values: retain the existing hall value when available'],
  entries, skipped };
await writeFile(resolve(outputPath), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ entries: entries.length, skipped, changedTargets: entries.reduce((n, e) => n + e.changedTargets.length, 0) }, null, 2));
