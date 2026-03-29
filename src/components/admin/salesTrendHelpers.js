// ─── Data helpers for SalesTrendChart (pure JS, no JSX) ─────────────────────

export function dominantCurrency(payments) {
  const counts = {};
  for (const p of payments) {
    if (p.status !== "succeeded") continue;
    const cur = (p.currency || "sek").toUpperCase();
    counts[cur] = (counts[cur] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [cur, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = cur;
      bestCount = count;
    }
  }
  return best;
}

export function aggregateDailyRevenue(payments, currency, days) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - days);
  startDate.setUTCHours(0, 0, 0, 0);
  const startMs = startDate.getTime();

  const dayMap = new Map();
  const DAY_MS = 86400000;
  for (let ms = startMs; ms <= now.getTime(); ms += DAY_MS) {
    const key = new Date(ms).toISOString().slice(0, 10);
    dayMap.set(key, 0);
  }

  const cur = (currency || "").toUpperCase();
  for (const p of payments) {
    if (p.status !== "succeeded") continue;
    if ((p.currency || "sek").toUpperCase() !== cur) continue;
    if (p.created < startMs) continue;
    const key = new Date(p.created).toISOString().slice(0, 10);
    if (dayMap.has(key)) {
      dayMap.set(key, dayMap.get(key) + p.amount);
    }
  }

  const result = [];
  for (const [date, amount] of dayMap) {
    result.push({ date, amount });
  }
  return result;
}

export function computeSMA(values, period) {
  const result = new Array(values.length).fill(null);
  if (period > values.length) return result;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

export function computeRSI(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}
