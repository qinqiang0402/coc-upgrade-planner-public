import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { syncTh19Preview } from '../scripts/sync-th19-legacy.mjs';

const source = JSON.parse(await readFile(new URL('../data/upgrades.json', import.meta.url)));
const preview = JSON.parse(await readFile(new URL('../data/th19-preview.json', import.meta.url)));
const adjustments = JSON.parse(await readFile(new URL('../data/nov-2026-adjustments.json', import.meta.url)));

test('legacy preview merge preserves existing rows and is safe to repeat', () => {
  const oldItems = structuredClone(source.items);
  const html = `<script>atob('${Buffer.from(JSON.stringify(oldItems)).toString('base64')}')</script>`;
  const result = syncTh19Preview(html, preview);
  assert.equal(result.count, oldItems.length + preview.newItems.length);
  const encoded = result.html.match(/atob\('([^']+)'\)/)[1];
  const newItems = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  for (const old of oldItems) {
    const current = newItems.find(item => item.i === old.i);
    const addition = preview.appendLevels.find(entry => entry.itemId === old.i);
    const unchangedLength = addition && old.m === 'from' ? old.l.length - 1 : old.l.length;
    assert.deepEqual(current.l.slice(0, unchangedLength), old.l.slice(0, unchangedLength), old.e);
    assert.equal(current.n, old.n, old.e);
  }
  assert.equal(syncTh19Preview(result.html, preview).html, result.html);
});

test('legacy town hall reductions update once without changing other rows', () => {
  const html = `atob('${Buffer.from(JSON.stringify(source.items)).toString('base64')}')`;
  const first = syncTh19Preview(html, preview, adjustments).html;
  assert.equal(syncTh19Preview(first, preview, adjustments).html, first);
  const items = JSON.parse(Buffer.from(first.match(/atob\('([^']+)'\)/)[1], 'base64').toString());
  assert.deepEqual(items.find(item => item.i === 'u2').l.find(row => row[0] === 18), [18, 864000, 20000000, 17]);
});

test('legacy TH19 shortcut shows the correct stage and keeps saved notes', { skip: !process.env.COC_LEGACY_WIDGET }, async () => {
  const html = await readFile(process.env.COC_LEGACY_WIDGET, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  class Element {
    constructor(id) { this.id = id; this.value = ''; this.dataset = {}; this.listeners = new Map(); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    emit(type) { this.listeners.get(type)?.({ target: this }); }
    set innerHTML(value) {
      this._html = value;
      if (['coc-village', 'coc-category', 'coc-item', 'coc-current', 'coc-target', 'coc-saved-plan-select'].includes(this.id)) {
        const options = [...value.matchAll(/<option value="([^"]*)"([^>]*)>/g)];
        this.value = options.find(option => option[2].includes('selected'))?.[1] ?? options[0]?.[1] ?? '';
      }
    }
    get innerHTML() { return this._html || ''; }
    querySelectorAll() { return []; }
    setAttribute() {}
    focus() {}
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const root = new Element('root');
  root.querySelector = selector => get(selector.slice(1));
  get('coc-village').value = 'home';
  get('coc-boost').value = '0';
  get('coc-return-boost').value = '0';
  get('coc-home-builders').value = '6';
  get('coc-bb-builders').value = '2';
  const oldState = { v: 1, a: 'plan', p: [{ i: 'plan', n: '原有方案', m: '原有备注', e: [['u250', 1, 2, 1]], s: [0, 0, 0, 0, 6, 2], u: 1 }] };
  const window = { openai: { widgetState: oldState }, addEventListener() {} };
  const context = { window, document: { getElementById: () => root }, localStorage: { getItem: () => null, setItem() {} }, atob, TextDecoder, Uint8Array, TextEncoder };
  runInNewContext(script, context);
  assert.equal(get('coc-plan-note').value, '原有备注');
  get('coc-th19-shortcut').emit('click');
  assert.equal(get('coc-item').value, 'u2');
  assert.equal(get('coc-current').value, '18');
  assert.equal(get('coc-target').value, '19');
  assert.match(get('coc-level-body').innerHTML, /第三方资料 · 待核对/);
  assert.match(get('coc-level-body').innerHTML, /13天/);
  get('coc-all-stages').emit('click');
  assert.equal(get('coc-plan-note').value, '原有备注');
});
