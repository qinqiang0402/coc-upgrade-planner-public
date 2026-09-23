(function (global) {
  function gameRoundedTime(seconds, hasReduction) {
    seconds = Math.max(0, seconds || 0);
    if (!hasReduction || !seconds) return Math.ceil(seconds);
    if (seconds > 86400) return Math.floor(seconds / 3600) * 3600;
    if (seconds > 3600) return Math.floor(seconds / 600) * 600;
    if (seconds > 60) return Math.floor(seconds / 60) * 60;
    return Math.ceil(seconds);
  }

  function calculateSelection(item, current, target, quantity, settings) {
    const rows = item.m === 'to'
      ? item.l.filter(row => row[0] > current && row[0] <= target)
      : item.l.filter(row => row[0] >= current && row[0] < target);
    quantity = Math.max(1, Math.round(quantity || 1));
    const boost = Number(settings?.boost) || 0;
    const returnBoost = Number(settings?.returnBoost) || 0;
    const costFactor = item.s === 'instant' ? 1 : (1 - boost / 100);
    const timeFactor = item.s === 'instant' ? 1 : costFactor * (1 - returnBoost / 100);
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

  global.COC_CORE = { gameRoundedTime, calculateSelection };
})(globalThis);
