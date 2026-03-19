export function maxOf(arr, key) {
  if (!Array.isArray(arr) || arr.length === 0) return 1;
  const values = arr.map((item) => Number(item?.[key]) || 0);
  return Math.max(1, ...values);
}

export function barHeight(value, max) {
  if (max <= 0) return 0;
  return (Number(value) / max) * 100;
}

export function formatHour(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getHours()}:00`;
}
