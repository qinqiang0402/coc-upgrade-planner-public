(() => {
  const root = document.getElementById('coc-upgrade-calculator');
  if (!root || root.dataset.cocInitialized === 'true') return;
  root.dataset.cocInitialized = 'true';
  const catalog = window.COC_CATALOG;
  if (!catalog?.items?.length) {
    root.textContent = '升级数据加载失败，请检查 data/upgrades.js 是否存在。';
    return;
  }
  const DATA = catalog.items;
  const CATALOG_META = catalog.meta;
  const { calculateSelection, normalizeExtraBoost } = window.COC_CORE;
  const correctionsByStep = new Map((CATALOG_META.corrections || []).map(correction => [`${correction.itemId}:${correction.fromLevel}:${correction.toLevel}`, correction]));
  const byId = new Map(DATA.map(item => [item.i, item]));
  const plan = [];
  const STORAGE_KEY = 'coc-upgrade-calculator-plans-v1';
  let savedPlans = [];
  let activePlanId = null;
  let currentPlanDirty = false;
  let currentSummary = null;

  const $ = id => root.querySelector(`#${id}`);
  const els = {
    village: $('coc-village'), category: $('coc-category'), search: $('coc-search'), item: $('coc-item'),
    current: $('coc-current'), target: $('coc-target'), quantity: $('coc-quantity'), quantityLabel: $('coc-quantity-label'),
    boost: $('coc-boost'), extraBoost: $('coc-extra-boost'), builderHelper: $('coc-builder-helper'), labHelper: $('coc-lab-helper'),
    homeBuilders: $('coc-home-builders'), bbBuilders: $('coc-bb-builders'), add: $('coc-add'),
    selectedName: $('coc-selected-name'), selectedMeta: $('coc-selected-meta'), selectedBadge: $('coc-selected-badge'), preview: $('coc-preview'),
    totalWork: $('coc-total-work'), baseWork: $('coc-base-work'), calendarTime: $('coc-calendar-time'), finish: $('coc-finish'), finishContext: $('coc-finish-context'),
    lanes: $('coc-lanes'), queueCount: $('coc-queue-count'), costSummary: $('coc-cost-summary'), body: $('coc-plan-body'), dataCount: $('coc-data-count'),
    levelBody: $('coc-level-body'), levelBoostNote: $('coc-level-boost-note'),
    planName: $('coc-plan-name'), savedPlanSelect: $('coc-saved-plan-select'), savePlan: $('coc-save-plan'), newPlan: $('coc-new-plan'),
    exportPlans: $('coc-export-plans'), importPlans: $('coc-import-plans'), importFile: $('coc-import-file'),
    planStatus: $('coc-plan-status'), savedPlanBody: $('coc-saved-plan-body'), savedPlanCount: $('coc-saved-plan-count')
  };

  const categoryLabels = {
    all: '全部类型', building: '建筑', trap: '陷阱', wall: '城墙', troop: '兵种与攻城机器', spell: '法术', hero: '英雄',
    pet: '战宠', equipment: '英雄装备', guardian: '大本营守卫', helper: '助手', supercharge: '超级充能', crafted: '组合防御模块', gearup: '建筑改装'
  };
  const streamLabels = {
    home_builder: '家乡建筑工人', bb_builder: '建筑大师基地工人', home_lab: '家乡实验室', bb_lab: '星空实验室', pet: '战宠小屋', instant: '即时升级'
  };
  const resourceLabels = {
    Gold: '金币', Elixir: '圣水', 'Dark Elixir': '暗黑重油', 'Builder Gold': '建筑大师金币', 'Builder Elixir': '建筑大师圣水',
    Gems: '宝石', Ores: '矿石', shiny_ore: '闪亮矿石', glowy_ore: '闪耀矿石', starry_ore: '星辉矿石',
    'Gold / Elixir': '金币 / 圣水', 'Builder Gold / Builder Elixir': '建筑大师金币 / 圣水'
  };

  const num = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.round(value || 0));
  const duration = seconds => {
    seconds = Math.max(0, Math.round(seconds || 0));
    if (!seconds) return '0秒';
    const d = Math.floor(seconds / 86400); seconds %= 86400;
    const h = Math.floor(seconds / 3600); seconds %= 3600;
    const m = Math.floor(seconds / 60); const s = seconds % 60;
    const parts = [];
    if (d) parts.push(`${d}天`);
    if (h) parts.push(`${h}小时`);
    if (m && parts.length < 2) parts.push(`${m}分`);
    if (s && parts.length < 2) parts.push(`${s}秒`);
    return parts.join('');
  };
  const resName = key => resourceLabels[key] || key.replaceAll('_', ' ');
  const hallLabel = item => `${item.v === 'builderBase' ? 'BH' : 'TH'}${item.h}`;
  const maxLevel = item => Math.max(...item.l.map(row => row[0]));
  const minLevel = item => item.m === 'to' ? 0 : Math.min(...item.l.map(row => row[0]));
  const pluralAllowed = item => ['building', 'trap', 'wall', 'supercharge', 'crafted'].includes(item.c);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const captureSettings = () => ({
    boost: Number(els.boost.value) || 0,
    extraBoost: els.extraBoost.value,
    builderHelper: Number(els.builderHelper.value) || 0,
    labHelper: Number(els.labHelper.value) || 0,
    homeBuilders: Number(els.homeBuilders.value) || 1,
    bbBuilders: Number(els.bbBuilders.value) || 1
  });
  const normalizedSettings = settings => ({
    boost: [0, 10, 15, 20].includes(Number(settings?.boost)) ? Number(settings.boost) : 0,
    extraBoost: normalizeExtraBoost(settings?.extraBoost ?? settings?.returnBoost),
    builderHelper: Math.max(0, Math.min(8, Math.round(Number(settings?.builderHelper) || 0))),
    labHelper: Math.max(0, Math.min(12, Math.round(Number(settings?.labHelper) || 0))),
    homeBuilders: Math.max(1, Math.min(6, Math.round(Number(settings?.homeBuilders) || 6))),
    bbBuilders: Math.max(1, Math.min(3, Math.round(Number(settings?.bbBuilders) || 3)))
  });
  const applySettings = settings => {
    const safe = normalizedSettings(settings);
    els.boost.value = String(safe.boost);
    els.extraBoost.value = safe.extraBoost;
    els.builderHelper.value = String(safe.builderHelper);
    els.labHelper.value = String(safe.labHelper);
    els.homeBuilders.value = String(safe.homeBuilders);
    els.bbBuilders.value = String(safe.bbBuilders);
  };
  const cloneEntries = entries => (entries || []).map(entry => ({ id: entry.id, current: entry.current, target: entry.target, quantity: entry.quantity }));
  const normalizeEntries = entries => (entries || []).flatMap(entry => {
    const values = Array.isArray(entry)
      ? { id: entry[0], current: entry[1], target: entry[2], quantity: entry[3] }
      : entry;
    const item = byId.get(String(values?.id || ''));
    if (!item) return [];
    const lower = minLevel(item);
    const upper = maxLevel(item);
    const current = Math.max(lower, Math.min(upper - 1, Math.round(Number(values.current))));
    const target = Math.max(current + 1, Math.min(upper, Math.round(Number(values.target))));
    const quantity = pluralAllowed(item) ? Math.max(1, Math.min(500, Math.round(Number(values.quantity) || 1))) : 1;
    if (!Number.isFinite(current) || !Number.isFinite(target) || target <= current) return [];
    return [{ id: item.i, current, target, quantity }];
  });
  const packState = () => ({
    v: 2,
    a: activePlanId,
    p: savedPlans.map(saved => ({
      i: saved.id,
      n: saved.name,
      e: saved.entries.map(entry => [entry.id, entry.current, entry.target, entry.quantity]),
      s: [saved.settings.boost, saved.settings.extraBoost, saved.settings.builderHelper, saved.settings.labHelper, saved.settings.homeBuilders, saved.settings.bbBuilders],
      u: saved.updatedAt
    }))
  });
  const unpackState = raw => {
    const source = raw?.privateContent || raw;
    if (!source || ![1, 2].includes(source.v) || !Array.isArray(source.p)) return null;
    const plans = source.p.flatMap(saved => {
      const name = String(saved?.n || '').trim().slice(0, 40);
      const id = String(saved?.i || '').slice(0, 80);
      const entries = normalizeEntries(saved?.e);
      if (!name || !id) return [];
      const settingsArray = Array.isArray(saved?.s) ? saved.s : [];
      return [{
        id,
        name,
        entries,
        settings: normalizedSettings({ boost: settingsArray[0], extraBoost: settingsArray[1], builderHelper: settingsArray[2], labHelper: settingsArray[3], homeBuilders: settingsArray[4], bbBuilders: settingsArray[5] }),
        updatedAt: Number(saved?.u) || Date.now()
      }];
    });
    return { plans, activePlanId: plans.some(saved => saved.id === source.a) ? source.a : null };
  };
  const readStoredState = () => {
    try {
      return unpackState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (_) {
      return null;
    }
  };
  const persistSavedPlans = () => {
    const packed = packState();
    const serialized = JSON.stringify(packed);
    let localSaved = false;
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      localSaved = true;
    } catch (_) {}
    return { localSaved };
  };
  const settingsLabel = settings => {
    const safe = normalizedSettings(settings);
    const parts = [];
    if (safe.boost) parts.push(`令牌${safe.boost}%`);
    if (safe.extraBoost === 'returning50') parts.push('回归50%');
    if (safe.extraBoost === 'hammerJam50') parts.push('夯木节50%');
    if (safe.builderHelper) parts.push(`建筑助手${safe.builderHelper}级`);
    if (safe.labHelper) parts.push(`实验室助手${safe.labHelper}级`);
    parts.push(`工人 ${safe.homeBuilders}/${safe.bbBuilders}`);
    return parts.join(' · ');
  };

  const helperLevelForItem = (item, settings = captureSettings()) => {
    if (item?.s === 'home_builder') return settings.builderHelper || 0;
    if (item?.s === 'home_lab') return settings.labHelper || 0;
    return 0;
  };

  const helperAdjustedDuration = (seconds, level) => {
    let remaining = Math.max(0, seconds || 0);
    level = Math.max(0, Math.round(level || 0));
    if (!remaining || !level) return remaining;
    let elapsed = 0;
    const boostedHourWork = (level + 1) * 3600;
    const cooldownWork = 22 * 3600;
    while (remaining > 0) {
      if (remaining <= boostedHourWork) return elapsed + remaining / (level + 1);
      remaining -= boostedHourWork;
      elapsed += 3600;
      if (remaining <= cooldownWork) return elapsed + remaining;
      remaining -= cooldownWork;
      elapsed += cooldownWork;
    }
    return elapsed;
  };

  const scheduleLoads = (tasks, workers) => {
    if (!tasks?.length) return [];
    const loads = Array.from({ length: Math.max(1, workers) }, () => 0);
    for (const task of [...tasks].sort((a, b) => b - a)) {
      let slot = 0;
      for (let index = 1; index < loads.length; index++) if (loads[index] < loads[slot]) slot = index;
      loads[slot] += task;
    }
    return loads;
  };

  const makespan = (tasks, workers) => Math.max(0, ...scheduleLoads(tasks, workers));

  const builderMakespanWithHelper = (tasks, workers, level) => {
    const loads = scheduleLoads(tasks, workers);
    level = Math.max(0, Math.round(level || 0));
    if (!loads.length || !level) return Math.max(0, ...loads);
    let elapsed = 0;
    while (Math.max(...loads) > 0) {
      let boosted = 0;
      for (let index = 1; index < loads.length; index++) if (loads[index] > loads[boosted]) boosted = index;
      const boostSpeeds = loads.map((_, index) => index === boosted ? level + 1 : 1);
      const finishWithinBoost = Math.max(...loads.map((load, index) => load / boostSpeeds[index]));
      if (finishWithinBoost <= 3600) return elapsed + finishWithinBoost;
      for (let index = 0; index < loads.length; index++) loads[index] = Math.max(0, loads[index] - boostSpeeds[index] * 3600);
      elapsed += 3600;
      const remainingMax = Math.max(...loads);
      if (remainingMax <= 22 * 3600) return elapsed + remainingMax;
      for (let index = 0; index < loads.length; index++) loads[index] = Math.max(0, loads[index] - 22 * 3600);
      elapsed += 22 * 3600;
    }
    return elapsed;
  };

  const reductionNote = (item, settings = captureSettings()) => {
    const notes = [];
    const { boost, extraBoost, builderHelper, labHelper } = normalizedSettings(settings);
    if (boost) notes.push(`${boost}% 黄金令牌`);
    if (extraBoost === 'returning50') notes.push('50% 回归加速（仅时间）');
    if (extraBoost === 'hammerJam50') notes.push(!item ? '50% 夯木节（仅适用项目）' : window.COC_CORE.isHammerJamEligible(item) ? '50% 夯木节（时间与费用）' : '夯木节不适用于此项目');
    if (builderHelper && (!item || item.s === 'home_builder')) notes.push(`建筑助手${builderHelper}级`);
    if (labHelper && (!item || item.s === 'home_lab')) notes.push(`实验室助手${labHelper}级`);
    return notes.length ? `已应用 ${notes.join(' · ')}` : '原始数据';
  };

  function addCost(bucket, key, value) {
    if (!value) return;
    bucket[key] = (bucket[key] || 0) + value;
  }

  function selection(item, current, target, quantity = 1, settings = captureSettings()) {
    return calculateSelection(item, current, target, quantity, normalizedSettings(settings));
  }

  function costText(costs) {
    const entries = Object.entries(costs).filter(([, value]) => value);
    if (!entries.length) return '无需资源';
    return entries.map(([key, value]) => `${escapeHtml(resName(key))} ${num(value)}`).join(' · ');
  }

  function renderLevelTable() {
    const item = byId.get(els.item.value);
    els.levelBoostNote.textContent = reductionNote(item);
    if (!item) {
      els.levelBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">没有可显示的升级等级</td></tr>';
      return;
    }
    const itemMax = maxLevel(item);
    const steps = item.l.flatMap(row => {
      const current = item.m === 'to' ? row[0] - 1 : row[0];
      const target = current + 1;
      if (item.m === 'from' && current >= itemMax) return [];
      const result = selection(item, current, target, 1);
      const targetRow = item.l.find(candidate => candidate[0] === target);
      const hall = item.m === 'to' ? row[3] : (targetRow?.[3] ?? row[3]);
      return [{ current, target, result, hall, correction: correctionsByStep.get(`${item.i}:${current}:${target}`) }];
    });
    if (!steps.length) {
      els.levelBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">该项目没有可用的升级步骤</td></tr>';
      return;
    }
    const helperLevel = helperLevelForItem(item);
    els.levelBody.innerHTML = steps.map(({ current, target, result, hall, correction }) => {
      const helperTime = helperAdjustedDuration(result.time, helperLevel);
      const helperContext = helperLevel && helperTime < result.time ? `<div class="text-small text-muted">原计时 ${duration(result.time)}</div>` : '';
      return `
      <tr>
        <td class="text-nowrap">${current === 0 ? '未解锁' : `${current}级`} → ${target}级</td>
        <td class="text-nowrap">${item.v === 'builderBase' ? 'BH' : 'TH'}${hall}</td>
        <td class="text-end text-nowrap">${result.time ? duration(helperTime) : '即时完成'}${helperContext}${correction ? '<div class="data-tag" title="来自游戏内截图；无加成基础时间仍需单独确认">截图校正 · 基础值推定</div>' : ''}</td>
        <td class="text-end"><span class="coc-resource-list">${costText(result.costs)}</span></td>
      </tr>`;
    }).join('');
  }

  function populateCategories() {
    const present = [...new Set(DATA.map(item => item.c))];
    els.category.innerHTML = ['all', ...Object.keys(categoryLabels).filter(key => key !== 'all' && present.includes(key))]
      .map(key => `<option value="${key}">${categoryLabels[key]}${key === 'all' ? `（${DATA.length}）` : `（${DATA.filter(item => item.c === key).length}）`}</option>`).join('');
  }

  function filteredItems() {
    const query = els.search.value.trim().toLocaleLowerCase('zh-CN');
    return DATA.filter(item =>
      (els.village.value === 'all' || item.v === els.village.value) &&
      (els.category.value === 'all' || item.c === els.category.value) &&
      (!query || `${item.n} ${item.e} ${item.o}`.toLocaleLowerCase('zh-CN').includes(query))
    );
  }

  function populateItems(keepId = els.item.value) {
    const items = filteredItems();
    if (!items.length) {
      els.item.innerHTML = '<option value="">没有匹配项目</option>';
      updateSelection();
      return;
    }
    els.item.innerHTML = items.map(item => `<option value="${escapeHtml(item.i)}">${escapeHtml(item.n)}${item.n !== item.e ? ` · ${escapeHtml(item.e)}` : ''}</option>`).join('');
    if (items.some(item => item.i === keepId)) els.item.value = keepId;
    updateSelection();
  }

  function populateLevels(item) {
    const min = minLevel(item);
    const max = maxLevel(item);
    const currentOptions = [];
    for (let level = min; level < max; level++) currentOptions.push(`<option value="${level}">${level === 0 ? '未建造 / 未解锁' : `${level}级`}</option>`);
    els.current.innerHTML = currentOptions.join('');
    const current = Number(els.current.value || min);
    const targetOptions = [];
    for (let level = current + 1; level <= max; level++) targetOptions.push(`<option value="${level}"${level === max ? ' selected' : ''}>${level}级</option>`);
    els.target.innerHTML = targetOptions.join('');
  }

  function refreshTargets() {
    const item = byId.get(els.item.value);
    if (!item) return;
    const current = Number(els.current.value);
    const max = maxLevel(item);
    const previous = Number(els.target.value);
    els.target.innerHTML = Array.from({ length: max - current }, (_, index) => current + index + 1)
      .map(level => `<option value="${level}"${level === previous || (!previous && level === max) ? ' selected' : ''}>${level}级</option>`).join('');
    if (Number(els.target.value) <= current) els.target.value = String(max);
    updatePreview();
  }

  function updateSelection() {
    const item = byId.get(els.item.value);
    if (!item) {
      els.selectedName.textContent = '没有匹配项目';
      els.selectedMeta.textContent = '请调整村庄、类型或搜索条件';
      els.selectedBadge.textContent = '—';
      els.current.innerHTML = '';
      els.target.innerHTML = '';
      els.add.disabled = true;
      els.preview.textContent = '—';
      renderLevelTable();
      return;
    }
    els.add.disabled = false;
    els.selectedName.textContent = item.n;
    els.selectedMeta.textContent = [item.n !== item.e ? item.e : '', item.o].filter(Boolean).join(' · ') || '升级数据';
    els.selectedBadge.textContent = `${categoryLabels[item.c]} · ${hallLabel(item)} · 最高${maxLevel(item)}级`;
    els.quantityLabel.hidden = !pluralAllowed(item);
    els.quantity.value = '1';
    populateLevels(item);
    updatePreview();
    renderLevelTable();
  }

  function updatePreview() {
    const item = byId.get(els.item.value);
    if (!item || !els.target.value) return;
    const result = selection(item, Number(els.current.value), Number(els.target.value), Number(els.quantity.value));
    const helperLevel = helperLevelForItem(item);
    const helperTime = result.quantity === 1 ? helperAdjustedDuration(result.time, helperLevel) : result.time;
    const timeText = result.time ? duration(helperTime) : '即时完成';
    const comparison = [];
    if (helperLevel && helperTime < result.time) comparison.push(`助手前 ${duration(result.time)}`);
    if (result.baseTime !== result.time) comparison.push(`原始 ${duration(result.baseTime)}`);
    const base = comparison.length ? `（${comparison.join(' · ')}）` : '';
    els.preview.textContent = `${result.current}级 → ${result.target}级：${timeText}${base}；${costText(result.costs)}`;
  }

  function summarizePlan(entries, settings) {
    const safeSettings = normalizedSettings(settings);
    const safeEntries = normalizeEntries(entries);
    const results = safeEntries.map(entry => selection(byId.get(entry.id), entry.current, entry.target, entry.quantity, safeSettings));
    const streams = {};
    const streamTasks = {};
    const totalCosts = {};
    let totalTime = 0;
    let baseTime = 0;
    for (const result of results) {
      totalTime += result.time;
      baseTime += result.baseTime;
      streams[result.item.s] = (streams[result.item.s] || 0) + result.time;
      if (result.time > 0) {
        streamTasks[result.item.s] ||= [];
        const chainTime = result.time / result.quantity;
        for (let copy = 0; copy < result.quantity; copy++) streamTasks[result.item.s].push(chainTime);
      }
      for (const [key, value] of Object.entries(result.costs)) addCost(totalCosts, key, value);
    }
    const parallel = {
      home_builder: builderMakespanWithHelper(streamTasks.home_builder, safeSettings.homeBuilders, safeSettings.builderHelper),
      bb_builder: makespan(streamTasks.bb_builder, safeSettings.bbBuilders),
      home_lab: helperAdjustedDuration(makespan(streamTasks.home_lab, 1), safeSettings.labHelper),
      bb_lab: makespan(streamTasks.bb_lab, 1),
      pet: makespan(streamTasks.pet, 1),
      instant: 0
    };
    return {
      entries: safeEntries,
      settings: safeSettings,
      results,
      streams,
      totalCosts,
      totalTime,
      baseTime,
      parallel,
      calendar: Math.max(0, ...Object.values(parallel))
    };
  }

  function renderPlan() {
    const settings = captureSettings();
    const { boost, extraBoost, builderHelper, labHelper } = settings;
    const summary = summarizePlan(plan, settings);
    currentSummary = summary;
    const { results, streams, totalCosts, totalTime, baseTime, calendar } = summary;
    els.totalWork.textContent = totalTime ? duration(totalTime) : '0秒';
    els.baseWork.textContent = plan.length ? ((boost || extraBoost !== 'none' || builderHelper || labHelper) ? `原始 ${duration(baseTime)} · ${reductionNote()}` : '未使用任何减免') : '尚未加入项目';
    els.calendarTime.textContent = calendar ? duration(calendar) : '0秒';
    if (calendar) {
      const finishDate = new Date(Date.now() + calendar * 1000);
      els.finish.textContent = finishDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
      els.finishContext.textContent = finishDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else {
      els.finish.textContent = plan.length ? '即时完成' : '—';
      els.finishContext.textContent = plan.length ? '方案中没有计时升级' : '加入项目后计算';
    }
    els.queueCount.textContent = `${plan.length} 个项目`;
    els.costSummary.textContent = `费用：${plan.length ? costText(totalCosts) : '—'}`;

    const activeStreams = Object.entries(streams).filter(([, seconds]) => seconds > 0);
    if (!activeStreams.length) {
      els.lanes.innerHTML = `<div class="text-muted text-center">${plan.length ? '方案中的项目均为即时升级' : '加入项目后显示各升级队列的负载'}</div>`;
      els.lanes.setAttribute('aria-label', plan.length ? '方案中的项目均为即时升级' : '暂无升级队列数据');
    } else {
      const maxSeconds = Math.max(...activeStreams.map(([, seconds]) => seconds));
      els.lanes.innerHTML = activeStreams.sort((a, b) => b[1] - a[1]).map(([stream, seconds]) => `
        <div class="coc-lane">
          <span>${streamLabels[stream]}</span>
          <div class="coc-lane-track" aria-hidden="true"><div class="coc-lane-fill" style="width:${Math.max(2, seconds / maxSeconds * 100)}%"></div></div>
          <span class="coc-lane-value">${duration(seconds)}</span>
        </div>`).join('');
      els.lanes.setAttribute('aria-label', activeStreams.map(([stream, seconds]) => `${streamLabels[stream]} ${duration(seconds)}`).join('；'));
    }

    if (!results.length) {
      els.body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">从上方选择升级项目并加入方案</td></tr>';
    } else {
      els.body.innerHTML = results.map((result, index) => `
        <tr>
          <td class="coc-plan-name">${escapeHtml(result.item.n)}<span class="text-small text-muted">${categoryLabels[result.item.c]} · ${streamLabels[result.item.s]}</span></td>
          <td class="text-nowrap">${result.current} → ${result.target}</td>
          <td class="text-end">${result.quantity}</td>
          <td class="text-end text-nowrap">${result.time ? duration(result.time) : '即时'}</td>
          <td class="text-end"><span class="coc-resource-list">${costText(result.costs)}</span></td>
          <td><button class="btn btn-ghost coc-remove" type="button" data-remove="${index}" aria-label="移除${escapeHtml(result.item.n)}"><i data-lucide="trash-2" aria-hidden="true"></i>移除</button></td>
        </tr>`).join('');
      els.body.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
        plan.splice(Number(button.dataset.remove), 1);
        markPlanDirty();
        renderPlan();
      }));
      if (window.lucide) window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
    }
    renderSavedPlans();
    updatePlanStatus();
  }

  function updatePlanStatus(message = '') {
    if (message) {
      els.planStatus.textContent = message;
      return;
    }
    const active = savedPlans.find(saved => saved.id === activePlanId);
    if (active) {
      els.planStatus.textContent = currentPlanDirty ? `“${active.name}”有未保存修改` : `当前：${active.name}`;
    } else if (plan.length || els.planName.value.trim()) {
      els.planStatus.textContent = '当前方案尚未保存';
    } else {
      els.planStatus.textContent = '新建空白方案';
    }
  }

  function markPlanDirty() {
    currentPlanDirty = true;
    updatePlanStatus();
  }

  function persistenceSuffix(result) {
    if (result.localSaved) return '（已保存在当前浏览器）';
    return '（存储不可用，请导出备份）';
  }

  function renderSavedPlans() {
    els.savedPlanCount.textContent = `${savedPlans.length} 个方案`;
    els.savedPlanSelect.innerHTML = '<option value="">选择方案…</option>' + savedPlans.map(saved =>
      `<option value="${escapeHtml(saved.id)}">${escapeHtml(saved.name)}</option>`
    ).join('');
    els.savedPlanSelect.value = savedPlans.some(saved => saved.id === activePlanId) ? activePlanId : '';
    if (!savedPlans.length) {
      els.savedPlanBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">还没有保存方案。为当前方案命名后点击“保存当前方案”。</td></tr>';
      return;
    }
    els.savedPlanBody.innerHTML = savedPlans.map(saved => {
      const summary = summarizePlan(saved.entries, saved.settings);
      const isCurrent = saved.id === activePlanId;
      const copies = summary.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      const currentBadge = isCurrent ? `<span class="viz-badge">${currentPlanDirty ? '当前 · 有修改' : '当前'}</span>` : '';
      return `
        <tr class="${isCurrent ? 'coc-saved-current' : ''}">
          <td class="coc-saved-name"><strong>${escapeHtml(saved.name)}</strong> ${currentBadge}<span class="text-small text-muted">${escapeHtml(settingsLabel(saved.settings))}</span></td>
          <td class="text-nowrap">${summary.entries.length} 项 · ${copies} 个</td>
          <td class="text-nowrap">${summary.totalTime ? duration(summary.totalTime) : '即时'}</td>
          <td class="text-nowrap">${summary.calendar ? duration(summary.calendar) : '即时'}</td>
          <td><span class="coc-resource-list">${costText(summary.totalCosts)}</span></td>
          <td><div class="coc-saved-actions"><button class="btn btn-ghost" type="button" data-load-plan="${escapeHtml(saved.id)}">载入</button><button class="btn btn-ghost" type="button" data-delete-plan="${escapeHtml(saved.id)}">删除</button></div></td>
        </tr>`;
    }).join('');
  }

  function saveCurrentPlan() {
    const name = els.planName.value.trim().slice(0, 40);
    if (!name) {
      updatePlanStatus('请先输入方案名称');
      els.planName.focus();
      return;
    }
    if (!plan.length) {
      updatePlanStatus('请先加入至少一个升级项目');
      return;
    }
    let saved = savedPlans.find(candidate => candidate.id === activePlanId);
    if (!saved) {
      const duplicate = savedPlans.find(candidate => candidate.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'));
      if (duplicate) {
        updatePlanStatus('该名称已存在，请先载入该方案或换一个名称');
        return;
      }
      saved = { id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
      savedPlans.push(saved);
    }
    saved.name = name;
    saved.entries = cloneEntries(plan);
    saved.settings = captureSettings();
    saved.updatedAt = Date.now();
    activePlanId = saved.id;
    currentPlanDirty = false;
    const persisted = persistSavedPlans();
    renderPlan();
    updatePlanStatus(`已保存“${name}”${persistenceSuffix(persisted)}`);
  }

  function loadSavedPlan(id, askBeforeSwitch = true) {
    const saved = savedPlans.find(candidate => candidate.id === id);
    if (!saved) return;
    if (askBeforeSwitch && currentPlanDirty && !window.confirm('当前修改尚未保存，仍要切换方案吗？')) return;
    plan.splice(0, plan.length, ...cloneEntries(saved.entries));
    applySettings(saved.settings);
    els.planName.value = saved.name;
    activePlanId = saved.id;
    currentPlanDirty = false;
    updatePreview();
    renderLevelTable();
    renderPlan();
    const persisted = persistSavedPlans();
    updatePlanStatus(`已载入“${saved.name}”${persistenceSuffix(persisted)}`);
  }

  function startNewPlan() {
    if (currentPlanDirty && !window.confirm('当前修改尚未保存，仍要新建空白方案吗？')) return;
    plan.splice(0, plan.length);
    els.planName.value = '';
    activePlanId = null;
    currentPlanDirty = false;
    renderPlan();
    const persisted = persistSavedPlans();
    updatePlanStatus(`已新建空白方案${persistenceSuffix(persisted)}`);
  }

  function deleteSavedPlan(id) {
    const index = savedPlans.findIndex(candidate => candidate.id === id);
    if (index < 0) return;
    const saved = savedPlans[index];
    if (!window.confirm(`确定删除已保存方案“${saved.name}”吗？当前升级项目不会被删除。`)) return;
    savedPlans.splice(index, 1);
    if (activePlanId === id) {
      activePlanId = null;
      currentPlanDirty = plan.length > 0;
    }
    const persisted = persistSavedPlans();
    renderSavedPlans();
    updatePlanStatus(`已删除“${saved.name}”；当前内容仍保留${persistenceSuffix(persisted)}`);
  }

  function exportSavedPlans() {
    if (!savedPlans.length) {
      updatePlanStatus('没有可导出的方案，请先保存至少一个方案');
      return;
    }
    const blob = new Blob([JSON.stringify(packState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `部落冲突升级方案-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    updatePlanStatus(`已导出 ${savedPlans.length} 个已保存方案`);
  }

  async function importSavedPlans(file) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('文件超过 2 MB，请检查是否为方案备份');
      const raw = JSON.parse(await file.text());
      const imported = unpackState(raw);
      if (!imported || !imported.plans.length) throw new Error('没有找到有效方案');
      for (const incoming of imported.plans) {
        let name = incoming.name;
        let suffix = 2;
        while (savedPlans.some(existing => existing.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
          name = `${incoming.name.slice(0, 32)}（导入${suffix++}）`;
        }
        savedPlans.push({ ...incoming, id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`, name });
      }
      const persisted = persistSavedPlans();
      renderSavedPlans();
      updatePlanStatus(`已导入 ${imported.plans.length} 个方案；原方案未覆盖${persistenceSuffix(persisted)}`);
    } catch (error) {
      updatePlanStatus(`导入失败：${error.message || '文件格式错误'}`);
    } finally {
      els.importFile.value = '';
    }
  }

  function applyStoredState(stored) {
    if (!stored) return false;
    savedPlans = stored.plans;
    activePlanId = stored.activePlanId;
    const active = savedPlans.find(saved => saved.id === activePlanId);
    plan.splice(0, plan.length, ...cloneEntries(active?.entries || []));
    if (active) {
      applySettings(active.settings);
      els.planName.value = active.name;
    } else {
      els.planName.value = '';
    }
    currentPlanDirty = false;
    updatePreview();
    renderLevelTable();
    renderPlan();
    return true;
  }

  els.village.addEventListener('change', () => populateItems());
  els.category.addEventListener('change', () => populateItems());
  els.search.addEventListener('input', () => populateItems());
  els.item.addEventListener('change', updateSelection);
  els.current.addEventListener('change', refreshTargets);
  els.target.addEventListener('change', updatePreview);
  els.quantity.addEventListener('input', updatePreview);
  els.boost.addEventListener('change', () => { markPlanDirty(); updatePreview(); renderLevelTable(); renderPlan(); });
  els.extraBoost.addEventListener('change', () => { markPlanDirty(); updatePreview(); renderLevelTable(); renderPlan(); });
  els.builderHelper.addEventListener('change', () => { markPlanDirty(); updatePreview(); renderLevelTable(); renderPlan(); });
  els.labHelper.addEventListener('change', () => { markPlanDirty(); updatePreview(); renderLevelTable(); renderPlan(); });
  els.homeBuilders.addEventListener('change', () => { markPlanDirty(); renderPlan(); });
  els.bbBuilders.addEventListener('change', () => { markPlanDirty(); renderPlan(); });
  els.add.addEventListener('click', () => {
    const item = byId.get(els.item.value);
    if (!item || !els.target.value) return;
    const quantity = pluralAllowed(item) ? Math.max(1, Math.round(Number(els.quantity.value) || 1)) : 1;
    const current = Number(els.current.value);
    const target = Number(els.target.value);
    const existing = plan.find(entry => entry.id === item.i && entry.current === current && entry.target === target);
    if (existing) existing.quantity += quantity;
    else plan.push({ id: item.i, current, target, quantity });
    markPlanDirty();
    renderPlan();
  });
  els.planName.addEventListener('input', () => {
    currentPlanDirty = true;
    renderSavedPlans();
    updatePlanStatus();
  });
  els.savePlan.addEventListener('click', saveCurrentPlan);
  els.newPlan.addEventListener('click', startNewPlan);
  els.exportPlans.addEventListener('click', exportSavedPlans);
  els.importPlans.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => importSavedPlans(els.importFile.files[0]));
  els.savedPlanSelect.addEventListener('change', () => {
    if (els.savedPlanSelect.value) loadSavedPlan(els.savedPlanSelect.value);
    else renderSavedPlans();
  });
  els.savedPlanBody.addEventListener('click', event => {
    const loadButton = event.target.closest('[data-load-plan]');
    const deleteButton = event.target.closest('[data-delete-plan]');
    if (loadButton) loadSavedPlan(loadButton.dataset.loadPlan);
    if (deleteButton) deleteSavedPlan(deleteButton.dataset.deletePlan);
  });
  populateCategories();
  els.dataCount.textContent = num(DATA.length);
  root.querySelector('#coc-data-version').textContent = CATALOG_META.version || '未标记';
  document.getElementById('catalog-date').textContent = CATALOG_META.baselineCheckedAt || '未知';
  document.getElementById('catalog-gaps').textContent = CATALOG_META.knownGaps?.join('、') || '暂无已记录缺项';
  populateItems();
  if (!applyStoredState(readStoredState())) renderPlan();
})();
