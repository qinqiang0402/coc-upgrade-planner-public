(function (global) {
  function normalizeExtraBoost(value) {
    if (value === 'returning50' || Number(value) === 50) return 'returning50';
    if (value === 'hammerJam50') return 'hammerJam50';
    return 'none';
  }

  function isHammerJamEligible(item) {
    return item.v === 'home' && item.s !== 'instant' && item.c !== 'supercharge' && item.c !== 'crafted';
  }

  function gameRoundedTime(seconds, hasReduction) {
    seconds = Math.max(0, seconds || 0);
    if (!hasReduction || !seconds) return Math.ceil(seconds);
    if (seconds > 86400) return Math.floor(seconds / 3600) * 3600;
    if (seconds > 3600) return Math.floor(seconds / 600) * 600;
    if (seconds > 60) return Math.floor(seconds / 60) * 60;
    return Math.ceil(seconds);
  }

  function stageUpgradeRows(item, stage) {
    const max = Math.max(...item.l.map(row => row[0]));
    const valid = item.l.filter(row => item.m !== 'from' || row[0] < max);
    if (!stage) return valid;
    const isHall = (item.v === 'home' && item.e === 'Town Hall') ||
      (item.v === 'builderBase' && item.e === 'Builder Hall');
    return valid.filter(row => {
      if (isHall) return row[0] === stage;
      if (item.m === 'to') return row[3] === stage;
      const targetRow = item.l.find(candidate => candidate[0] === row[0] + 1);
      return (targetRow?.[3] ?? row[3]) === stage;
    });
  }

  function stageUpgradeBounds(item, stage) {
    const rows = stageUpgradeRows(item, stage);
    if (!rows.length) return null;
    return {
      current: item.m === 'to' ? rows[0][0] - 1 : rows[0][0],
      target: item.m === 'to' ? rows[rows.length - 1][0] : rows[rows.length - 1][0] + 1
    };
  }

  function calculateSelection(item, current, target, quantity, settings) {
    const rows = item.m === 'to'
      ? item.l.filter(row => row[0] > current && row[0] <= target)
      : item.l.filter(row => row[0] >= current && row[0] < target);
    quantity = Math.max(1, Math.round(quantity || 1));
    const boost = Number(settings?.boost) || 0;
    const extraBoost = normalizeExtraBoost(settings?.extraBoost ?? settings?.returnBoost);
    const hammerFactor = extraBoost === 'hammerJam50' && isHammerJamEligible(item) ? 0.5 : 1;
    const costFactor = item.s === 'instant' ? 1 : (1 - boost / 100) * hammerFactor;
    const timeFactor = item.s === 'instant' ? 1 : costFactor * (extraBoost === 'returning50' ? 0.5 : 1);
    const costs = {};
    let baseTime = 0;
    let time = 0;
    for (const row of rows) {
      const stepTime = row[1] || 0;
      baseTime += stepTime * quantity;
      time += gameRoundedTime(stepTime * timeFactor, timeFactor < 1) * quantity;
      const stepCosts = typeof row[2] === 'number' ? { [item.r]: row[2] } : (row[2] || {});
      for (const [key, value] of Object.entries(stepCosts)) {
        if (value) costs[key] = (costs[key] || 0) + Math.ceil(value * costFactor) * quantity;
      }
    }
    return { item, current, target, quantity, baseTime, time, costs };
  }

  global.COC_CORE = { gameRoundedTime, calculateSelection, normalizeExtraBoost, isHammerJamEligible, stageUpgradeRows, stageUpgradeBounds };
})(globalThis);
