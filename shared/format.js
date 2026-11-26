/** 1500 -> "1 500 Ft" (nem törhető szóközzel) */
export function formatHUF(value, { sign = false, hidden = false } = {}) {
  if (hidden) return '•••• Ft';
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let prefix = '';
  if (n < 0) prefix = '-';
  else if (sign && n > 0) prefix = '+';
  return `${prefix}${abs} Ft`;
}

export function formatNumber(value) {
  return Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
