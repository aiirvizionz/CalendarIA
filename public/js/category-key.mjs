export function keyFromName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isValidKey(value) {
  const key = String(value || '');
  return key.length > 0
    && key.length <= 80
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key);
}

export function allocateUniqueKey(baseValue, usedKeys) {
  const base = keyFromName(baseValue);
  if (!base) return '';

  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys || []);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const ending = `-${suffix}`;
    const stem = base.slice(0, Math.max(1, 80 - ending.length)).replace(/-+$/g, '');
    const candidate = `${stem}${ending}`;
    if (!used.has(candidate)) return candidate;
  }

  return '';
}
