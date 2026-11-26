/** Kisbetűsít és eltávolítja az ékezeteket: "Költős" -> "koltos" */
export function normalize(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalize(str = '') {
  const s = String(str).trim();
  return s ? s.charAt(0).toLocaleUpperCase('hu-HU') + s.slice(1) : s;
}
