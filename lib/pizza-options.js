const DEFAULT_BORDER_CATALOG = [
  { id: 'mussarela', label: 'Mussarela', group: 'Tradicionais', prices: { P: 10, M: 15, G: 20 }, active: true },
  { id: 'catupiry', label: 'Catupiry', group: 'Tradicionais', prices: { P: 10, M: 15, G: 20 }, active: true },
  { id: 'calabresa-e-mussarela', label: 'Calabresa e Mussarela', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
  { id: 'frango-e-catupiry', label: 'Frango e Catupiry', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
];

let borderCatalog = cloneBorderCatalog(DEFAULT_BORDER_CATALOG);

function cloneBorderCatalog(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).map((entry) => ({
    ...entry,
    prices: { ...(entry?.prices || {}) },
  }));
}

function normalizeBorderCatalog(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).map((entry, index) => ({
    id: String(entry?.id || `borda-${index + 1}`).trim().toLowerCase(),
    label: String(entry?.label || '').trim() || `Borda ${index + 1}`,
    group: String(entry?.group || entry?.category || '').trim() || 'Especiais',
    prices: {
      P: Number(entry?.prices?.P ?? entry?.prices?.p ?? entry?.price ?? 0),
      M: Number(entry?.prices?.M ?? entry?.prices?.m ?? entry?.price ?? 0),
      G: Number(entry?.prices?.G ?? entry?.prices?.g ?? entry?.price ?? 0),
    },
    active: entry?.active !== false,
  })).filter((entry) => entry.id);
}

function setPizzaBorderCatalog(catalog, { fallbackToDefault = true } = {}) {
  const normalized = normalizeBorderCatalog(catalog);
  borderCatalog = normalized.length > 0 || !fallbackToDefault
    ? normalized
    : cloneBorderCatalog(DEFAULT_BORDER_CATALOG);
  return getPizzaBorderCatalog();
}

function resetPizzaBorderCatalog() {
  return setPizzaBorderCatalog(DEFAULT_BORDER_CATALOG, { fallbackToDefault: false });
}

function normalizePizzaBorderOption(option = {}) {
  const id = String(option?.id || '').trim().toLowerCase();
  const size = String(option?.size || '').trim().toUpperCase();
  if (!id) {
    return { id: '', label: '', size, price: 0 };
  }

  const catalogOption = borderCatalog.find((entry) => entry.id === id);

  if (!catalogOption) {
    return {
      id,
      label: String(option?.label || '').trim() || id.replace(/-/g, ' '),
      size,
      price: Number(option?.price || 0),
    };
  }

  return {
    id: catalogOption.id,
    label: catalogOption.label,
    size: size || 'M',
    price: getPizzaBorderPrice(catalogOption.id, size || 'M'),
  };
}

function getPizzaBorderCatalog() {
  return borderCatalog
    .filter((entry) => entry.active !== false)
    .map((entry) => ({ ...entry, prices: { ...entry.prices } }));
}

function getPizzaBorderPrice(id, size) {
  const normalizedId = String(id || '').trim().toLowerCase();
  const normalizedSize = String(size || '').trim().toUpperCase();
  const option = borderCatalog.find((entry) => entry.id === normalizedId);
  if (!option) return 0;
  return Number(option.prices?.[normalizedSize] ?? option.prices?.M ?? 0);
}

function getPizzaBorderLabel(option) {
  const normalized = normalizePizzaBorderOption(option);
  return normalized.label || '';
}

function resolvePizzaBorderSelection(option = {}) {
  const normalized = normalizePizzaBorderOption(option);
  return {
    ...normalized,
    label: getPizzaBorderLabel(normalized),
  };
}

const api = {
  DEFAULT_BORDER_CATALOG: cloneBorderCatalog(DEFAULT_BORDER_CATALOG),
  getPizzaBorderCatalog,
  getPizzaBorderPrice,
  getPizzaBorderLabel,
  normalizePizzaBorderOption,
  resolvePizzaBorderSelection,
  setPizzaBorderCatalog,
  resetPizzaBorderCatalog,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof globalThis !== 'undefined') {
  globalThis.PizzaBorderUtils = api;
}
