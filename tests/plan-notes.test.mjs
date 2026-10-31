import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');
const appScript = await read('app.js');
const catalogWindow = {};
runInNewContext(await read('data/upgrades.js'), { window: catalogWindow });
const core = {};
runInNewContext(await read('core.js'), core);

class FakeElement {
  constructor() {
    this.value = '';
    this.dataset = {};
    this.files = [];
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type) { return this.listeners.get(type)?.({ target: this }); }
  querySelectorAll() { return []; }
  setAttribute() {}
  focus() {}
  click() {}
  remove() {}
}

function mountApp(initialState) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const rootElement = new FakeElement();
  rootElement.querySelector = selector => get(selector.slice(1));
  get('coc-village').value = 'all';
  get('coc-category').value = 'all';
  get('coc-boost').value = '0';
  get('coc-extra-boost').value = 'none';
  get('coc-home-builders').value = '6';
  get('coc-bb-builders').value = '2';
  const store = new Map([['coc-upgrade-calculator-plans-v1', JSON.stringify(initialState)]]);
  const localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value)
  };
  let exportedBlob;
  const document = {
    getElementById: id => id === 'coc-upgrade-calculator' ? rootElement : get(id),
    createElement: () => new FakeElement(),
    body: { append() {} }
  };
  let allowDiscard = true;
  const window = { COC_CATALOG: catalogWindow.COC_CATALOG, COC_CORE: core.COC_CORE, confirm: () => allowDiscard };
  runInNewContext(appScript, {
    document, window, localStorage,
    URL: { createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    Blob, setTimeout() {}
  });
  return { get, store, exported: () => exportedBlob, allowDiscard: value => { allowDiscard = value; } };
}

test('plan notes save, reload, switch, export and import without breaking older plans', async () => {
  const oldPlan = {
    i: 'old-plan', n: '旧方案', e: [['u250', 1, 2, 1]], s: [0, 'none', 0, 0, 6, 2], u: 1
  };
  const ui = mountApp({ v: 2, a: 'old-plan', p: [oldPlan] });
  const note = ui.get('coc-plan-note');
  assert.equal(note.value, '', 'older plan without a note opens with an empty note');

  note.value = '先升地狱火炮\n再升级防御';
  ui.get('coc-plan-note').emit('input');
  assert.match(ui.get('coc-plan-status').textContent, /未保存修改/);
  ui.get('coc-save-plan').emit('click');
  const saved = JSON.parse(ui.store.get('coc-upgrade-calculator-plans-v1'));
  assert.equal(saved.p[0].m, note.value);

  ui.get('coc-new-plan').emit('click');
  assert.equal(note.value, '');
  ui.get('coc-saved-plan-select').value = 'old-plan';
  ui.get('coc-saved-plan-select').emit('change');
  assert.equal(note.value, '先升地狱火炮\n再升级防御');

  note.value = '未保存的临时修改';
  note.emit('input');
  ui.allowDiscard(false);
  ui.get('coc-new-plan').emit('click');
  assert.equal(note.value, '未保存的临时修改', 'canceling the warning keeps the draft note');
  ui.allowDiscard(true);
  ui.get('coc-saved-plan-select').value = 'old-plan';
  ui.get('coc-saved-plan-select').emit('change');
  assert.equal(note.value, '先升地狱火炮\n再升级防御');

  ui.get('coc-export-plans').emit('click');
  const backup = JSON.parse(await ui.exported().text());
  assert.equal(backup.p[0].m, note.value);

  ui.get('coc-import-file').files = [{
    size: 400,
    text: async () => JSON.stringify({ v: 2, a: null, p: [{ ...oldPlan, i: 'imported', n: '导入方案', m: '导入的备注' }] })
  }];
  await ui.get('coc-import-file').emit('change');
  const afterImport = JSON.parse(ui.store.get('coc-upgrade-calculator-plans-v1'));
  const imported = afterImport.p.find(plan => plan.n === '导入方案');
  assert.equal(imported.m, '导入的备注');
  ui.get('coc-saved-plan-select').value = imported.i;
  ui.get('coc-saved-plan-select').emit('change');
  assert.equal(note.value, '导入的备注');
});

test('goblin workers add separate home queues and survive plan save and reload', async () => {
  const plan = (entries) => ({ v: 2, a: 'plan', p: [{
    i: 'plan', n: '测试', e: entries, s: [0, 'none', 0, 0, 1, 1], u: 1
  }] });
  const builders = mountApp(plan([['u35', 0, 1, 1], ['u31', 0, 1, 1]]));
  assert.equal(builders.get('coc-calendar-time').textContent, '14小时');
  builders.get('coc-goblin-builder').value = '1';
  builders.get('coc-goblin-builder').emit('change');
  assert.equal(builders.get('coc-calendar-time').textContent, '8小时');
  builders.get('coc-save-plan').emit('click');
  const saved = JSON.parse(builders.store.get('coc-upgrade-calculator-plans-v1'));
  assert.equal(saved.p[0].s[6], 1);
  assert.equal(saved.p[0].s[7], 0);
  assert.equal(mountApp(saved).get('coc-goblin-builder').value, '1');
  builders.get('coc-export-plans').emit('click');
  assert.equal(JSON.parse(await builders.exported().text()).p[0].s[6], 1);

  const lab = mountApp(plan([['u171', 1, 2, 1], ['u165', 1, 2, 1]]));
  assert.equal(lab.get('coc-calendar-time').textContent, '1天18小时');
  lab.get('coc-goblin-researcher').value = '1';
  lab.get('coc-goblin-researcher').emit('change');
  assert.equal(lab.get('coc-calendar-time').textContent, '1天');
  lab.get('coc-save-plan').emit('click');
  const labSaved = JSON.parse(lab.store.get('coc-upgrade-calculator-plans-v1'));
  assert.equal(labSaved.p[0].s[7], 1);
  assert.equal(mountApp(labSaved).get('coc-goblin-researcher').value, '1');
});
