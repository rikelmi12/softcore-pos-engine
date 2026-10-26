export const DEFAULT_WAITER_BORDER_CATALOG = Object.freeze([
  { id: 'tradicional', label: 'Borda Tradicional', group: 'Tradicional', prices: { P: 10, M: 15, G: 20 }, active: true },
  { id: 'calabresa-e-mussarela', label: 'Calabresa e Mussarela', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
  { id: 'frango-catupiry', label: 'Frango Catupiry', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
]);

export const DEFAULT_WAITER_THEME_CONFIG = Object.freeze({
  colorPrimary: '#C0392B',
  colorSecondary: '#E67E22',
  colorBg: '#FDF6EC',
  colorText: '#1A1A1A',
  colorSurface: '#FFFFFF',
  colorSurfaceDark: '#4B1912',
  colorOnDark: '#FFFFFF',
  colorWhatsapp: '#25D366',
});

export function normalizeWaiterThemeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;

  if (full.test(trimmed)) return trimmed.toUpperCase();
  if (short.test(trimmed)) {
    const hex = trimmed.slice(1);
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
  }
  return fallback;
}

function waiterThemeHexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function waiterThemeRgbToHex(r, g, b) {
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function mixWaiterThemeHex(baseHex, targetHex, weight = 0.5) {
  const base = waiterThemeHexToRgb(baseHex);
  const target = waiterThemeHexToRgb(targetHex);
  const ratio = Math.max(0, Math.min(1, weight));
  const blend = (from, to) => from + ((to - from) * ratio);
  return waiterThemeRgbToHex(
    blend(base.r, target.r),
    blend(base.g, target.g),
    blend(base.b, target.b),
  );
}

export function getWaiterThemeHexLuminance(hex) {
  const { r, g, b } = waiterThemeHexToRgb(hex);
  const toLinear = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * toLinear(r)) + (0.7152 * toLinear(g)) + (0.0722 * toLinear(b));
}

export function pickWaiterThemeReadableText(backgroundHex, light = '#FFFFFF', dark = '#1A1A1A') {
  return getWaiterThemeHexLuminance(backgroundHex) > 0.56 ? dark : light;
}

export function getWaiterThemeContrastRatio(firstHex, secondHex) {
  const first = getWaiterThemeHexLuminance(firstHex);
  const second = getWaiterThemeHexLuminance(secondHex);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function shadeWaiterThemeHex(hex, percent) {
  const { r, g, b } = waiterThemeHexToRgb(hex);
  const factor = percent / 100;
  const target = factor >= 0 ? 255 : 0;
  const blend = (value) => value + ((target - value) * Math.abs(factor));
  return waiterThemeRgbToHex(blend(r), blend(g), blend(b));
}

export function ensureWaiterThemeForegroundContrast(
  foregroundHex,
  backgroundHexes,
  minimumRatio = 4.5,
) {
  const backgrounds = (Array.isArray(backgroundHexes) ? backgroundHexes : [backgroundHexes])
    .filter((color) => /^#[0-9A-F]{6}$/i.test(String(color || '')));
  if (!backgrounds.length) return foregroundHex;

  const averageBackgroundLuminance = backgrounds.reduce(
    (sum, color) => sum + getWaiterThemeHexLuminance(color),
    0,
  ) / backgrounds.length;
  const shadeSteps = Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
  const directionalCandidates = averageBackgroundLuminance >= 0.5
    ? shadeSteps.map((step) => shadeWaiterThemeHex(foregroundHex, -step))
    : shadeSteps.map((step) => shadeWaiterThemeHex(foregroundHex, step));
  const oppositeCandidates = averageBackgroundLuminance >= 0.5
    ? shadeSteps.map((step) => shadeWaiterThemeHex(foregroundHex, step))
    : shadeSteps.map((step) => shadeWaiterThemeHex(foregroundHex, -step));
  const candidates = [
    foregroundHex,
    ...directionalCandidates,
    ...oppositeCandidates,
    '#1A1A1A',
    '#000000',
    '#FFFFFF',
  ];
  const score = (candidate) => Math.min(
    ...backgrounds.map((background) => getWaiterThemeContrastRatio(candidate, background)),
  );
  const passing = candidates.find((candidate) => score(candidate) >= minimumRatio);
  if (passing) return passing;
  return candidates.reduce(
    (best, candidate) => (score(candidate) > score(best) ? candidate : best),
    candidates[0],
  );
}

export function pickWaiterThemeAccessibleText(
  backgroundHex,
  preferredHex = '',
  minimumRatio = 4.5,
  fallbackHexes = [],
) {
  const preferred = normalizeWaiterThemeHexColor(preferredHex, '');
  if (preferred && getWaiterThemeContrastRatio(preferred, backgroundHex) >= minimumRatio) {
    return preferred;
  }
  const configuredFallbacks = (Array.isArray(fallbackHexes) ? fallbackHexes : [fallbackHexes])
    .map((color) => normalizeWaiterThemeHexColor(color, ''))
    .filter(Boolean);
  const candidates = [...configuredFallbacks, '#1A1A1A', '#000000', '#FFFFFF'];
  const configuredMatch = candidates.find(
    (candidate) => getWaiterThemeContrastRatio(candidate, backgroundHex) >= minimumRatio,
  );
  if (configuredMatch) return configuredMatch;
  return candidates.reduce((best, candidate) => (
    getWaiterThemeContrastRatio(candidate, backgroundHex)
      > getWaiterThemeContrastRatio(best, backgroundHex)
      ? candidate
      : best
  ), candidates[0]);
}

function waiterThemeRgba(hex, alpha = 1) {
  const { r, g, b } = waiterThemeHexToRgb(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function buildWaiterTheme(config = {}) {
  const primary = normalizeWaiterThemeHexColor(
    config.colorPrimary,
    DEFAULT_WAITER_THEME_CONFIG.colorPrimary,
  );
  const secondary = normalizeWaiterThemeHexColor(
    config.colorSecondary,
    DEFAULT_WAITER_THEME_CONFIG.colorSecondary,
  );
  const bg = normalizeWaiterThemeHexColor(config.colorBg, DEFAULT_WAITER_THEME_CONFIG.colorBg);
  const text = normalizeWaiterThemeHexColor(config.colorText, DEFAULT_WAITER_THEME_CONFIG.colorText);
  const isBgLight = getWaiterThemeHexLuminance(bg) >= 0.58;
  const textLuminance = getWaiterThemeHexLuminance(text);
  const surface = normalizeWaiterThemeHexColor(
    config.colorSurface,
    isBgLight ? shadeWaiterThemeHex(bg, 6) : shadeWaiterThemeHex(bg, -10),
  );
  const surfaceDark = normalizeWaiterThemeHexColor(
    config.colorSurfaceDark,
    shadeWaiterThemeHex(primary, -54),
  );
  const onSurfaceDark = normalizeWaiterThemeHexColor(
    config.colorOnDark,
    pickWaiterThemeReadableText(surfaceDark),
  );
  const whatsapp = normalizeWaiterThemeHexColor(
    config.colorWhatsapp,
    DEFAULT_WAITER_THEME_CONFIG.colorWhatsapp,
  );
  const primaryRgb = waiterThemeHexToRgb(primary);
  const secondaryRgb = waiterThemeHexToRgb(secondary);
  const bgRgb = waiterThemeHexToRgb(bg);
  const surfaceRgb = waiterThemeHexToRgb(surface);
  const textRgb = waiterThemeHexToRgb(text);
  const onSurfaceDarkRgb = waiterThemeHexToRgb(onSurfaceDark);
  const actionBackground = mixWaiterThemeHex(primary, secondary, 0.35);
  const wineSoft = mixWaiterThemeHex(bg, primary, isBgLight ? 0.12 : 0.26);
  const amberSoft = mixWaiterThemeHex(bg, secondary, isBgLight ? 0.13 : 0.28);
  const mutedBase = mixWaiterThemeHex(text, bg, isBgLight ? 0.42 : 0.32);
  const onSurfaceDarkSafe = pickWaiterThemeAccessibleText(surfaceDark, onSurfaceDark, 4.5, [text]);
  const onSurfaceDarkSafeRgb = waiterThemeHexToRgb(onSurfaceDarkSafe);
  const wineInk = ensureWaiterThemeForegroundContrast(primary, [surface, bg, wineSoft]);
  const secondaryInk = ensureWaiterThemeForegroundContrast(secondary, [surface, bg, amberSoft]);
  const muted = ensureWaiterThemeForegroundContrast(mutedBase, [surface, bg]);
  const onAction = ensureWaiterThemeForegroundContrast(
    pickWaiterThemeReadableText(actionBackground),
    [primary, secondary],
  );
  const actionPrimary = ensureWaiterThemeForegroundContrast(primary, [onAction]);
  const actionSecondary = ensureWaiterThemeForegroundContrast(secondary, [onAction]);

  return {
    colors: {
      primary,
      secondary,
      bg,
      text,
      surface,
      surfaceDark,
      onSurfaceDark,
      whatsapp,
    },
    cssVariables: {
      '--wine': primary,
      '--wine-rgb': `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`,
      '--wine-dark': shadeWaiterThemeHex(primary, -20),
      '--wine-light': shadeWaiterThemeHex(primary, 16),
      '--wine-soft': wineSoft,
      '--wine-ink': wineInk,
      '--orange': secondary,
      '--orange-rgb': `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`,
      '--secondary-ink': secondaryInk,
      '--cream': bg,
      '--cream-rgb': `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`,
      '--cream-dark': mixWaiterThemeHex(bg, text, isBgLight ? 0.08 : 0.16),
      '--paper': surface,
      '--paper-rgb': `${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}`,
      '--ink': text,
      '--ink-rgb': `${textRgb.r}, ${textRgb.g}, ${textRgb.b}`,
      '--muted': muted,
      '--line': mixWaiterThemeHex(bg, text, isBgLight ? 0.14 : 0.22),
      '--surface-dark': surfaceDark,
      '--surface-dark-2': shadeWaiterThemeHex(surfaceDark, 16),
      '--surface-dark-accent': shadeWaiterThemeHex(surfaceDark, -18),
      '--on-surface-dark': onSurfaceDark,
      '--on-surface-dark-rgb': `${onSurfaceDarkRgb.r}, ${onSurfaceDarkRgb.g}, ${onSurfaceDarkRgb.b}`,
      '--on-surface-dark-muted': waiterThemeRgba(onSurfaceDark, 0.78),
      '--on-surface-dark-soft': waiterThemeRgba(onSurfaceDark, 0.62),
      '--on-surface-dark-safe': onSurfaceDarkSafe,
      '--on-surface-dark-safe-rgb': `${onSurfaceDarkSafeRgb.r}, ${onSurfaceDarkSafeRgb.g}, ${onSurfaceDarkSafeRgb.b}`,
      '--on-primary': pickWaiterThemeAccessibleText(primary, pickWaiterThemeReadableText(primary), 4.5, [text]),
      '--on-secondary': pickWaiterThemeAccessibleText(secondary, pickWaiterThemeReadableText(secondary), 4.5, [text]),
      '--action-primary': actionPrimary,
      '--action-secondary': actionSecondary,
      '--on-action': onAction,
      '--amber': secondary,
      '--amber-soft': amberSoft,
      '--whatsapp': whatsapp,
      '--focus-ring': waiterThemeRgba(secondary, 0.45),
      '--shadow-primary': `0 8px 20px ${waiterThemeRgba(primary, 0.28)}`,
      '--shadow': `0 18px 50px ${waiterThemeRgba(text, 0.12)}`,
    },
  };
}

export function normalizeWaiterPizzaText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

export function isWaiterPizzaProduct(product, categories = []) {
  if (!product || typeof product !== 'object') return false;
  if (normalizeWaiterPizzaText(product.category).includes('pizza')) return true;
  const category = (Array.isArray(categories) ? categories : []).find(
    (entry) => String(entry?.id || '') === String(product.category || ''),
  );
  return normalizeWaiterPizzaText(category?.name || category?.label).includes('pizza');
}

export function normalizeWaiterPizzaSizeKey(value, allowFallback = false) {
  const text = normalizeWaiterPizzaText(value);
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  if (/^(p|pp|peq|pequena|pequeno|brotinho|broto|s|small)$/.test(compact)) return 'pequena';
  if (/^(m|med|media|medio|medium)$/.test(compact)) return 'media';
  if (/^(g|gg|gr|grande|gigante|familia|family|big|l|large)$/.test(compact)) return 'grande';
  if (/\b(pequena|pequeno|brotinho|broto|small)\b/.test(text)) return 'pequena';
  if (/\b(media|medio|medium)\b/.test(text)) return 'media';
  if (/\b(grande|gigante|familia|family|big|large)\b/.test(text)) return 'grande';
  return allowFallback ? text : '';
}

export function getWaiterPizzaSizeKey(product) {
  if (!product || typeof product !== 'object') return '';
  return normalizeWaiterPizzaSizeKey(product.size, true)
    || normalizeWaiterPizzaSizeKey(product.name)
    || normalizeWaiterPizzaSizeKey(product.description);
}

export function getWaiterPizzaBorderSizeCode(product) {
  const size = getWaiterPizzaSizeKey(product);
  if (size === 'pequena') return 'P';
  if (size === 'media') return 'M';
  if (size === 'grande') return 'G';
  return 'M';
}

export function isSameWaiterPizzaSize(firstProduct, secondProduct) {
  const first = getWaiterPizzaSizeKey(firstProduct);
  const second = getWaiterPizzaSizeKey(secondProduct);
  if (first && second) return first === second;
  return !first && !second;
}

export function normalizeWaiterBorderCatalog(catalog = []) {
  const source = Array.isArray(catalog) && catalog.length ? catalog : DEFAULT_WAITER_BORDER_CATALOG;
  return source.map((entry, index) => ({
    id: String(entry?.id || `borda-${index + 1}`).trim().toLowerCase(),
    label: String(entry?.label || entry?.name || `Borda ${index + 1}`).trim(),
    group: String(entry?.group || entry?.category || 'Especiais').trim() || 'Especiais',
    prices: {
      P: Number(entry?.prices?.P ?? entry?.prices?.p ?? entry?.price ?? 0),
      M: Number(entry?.prices?.M ?? entry?.prices?.m ?? entry?.price ?? 0),
      G: Number(entry?.prices?.G ?? entry?.prices?.g ?? entry?.price ?? 0),
    },
    active: entry?.active !== false,
  })).filter((entry) => entry.id && entry.active);
}

export function resolveWaiterPizzaBorder(product, borderId, catalog = []) {
  const id = String(borderId || '').trim().toLowerCase();
  if (!id) return null;
  const option = normalizeWaiterBorderCatalog(catalog).find((entry) => entry.id === id);
  if (!option) return null;
  const size = getWaiterPizzaBorderSizeCode(product);
  const price = Number(option.prices?.[size] ?? option.prices?.M ?? 0);
  return {
    id: option.id,
    label: option.label,
    group: option.group,
    size,
    price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
  };
}

export function cleanWaiterPizzaFlavorName(value) {
  let text = String(value || 'Pizza').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\s*\((?=[^)]*(?:cm|peda[cç]os?|\d{1,2}\s*p\b|broto|brotinho|pequena|m[eé]dia|media|grande))[^)]*\)\s*$/i,
    /\s*[-–]\s*(?:broto|brotinho|pequena|m[eé]dia|media|grande)\b.*$/i,
    /\s+(?:g|m|p)\s+\d+p\s*$/i,
    /\s+\d{1,2}\s*(?:p|p\.|pedacos?|peda[cç]os?)\b\s*$/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of patterns) {
      const next = text.replace(pattern, '').trim();
      if (next && next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  return text || 'Pizza';
}

export function buildWaiterPizzaCartItem({
  firstProduct,
  secondProduct = null,
  borderId = '',
  borders = [],
  categories = [],
} = {}) {
  if (!isWaiterPizzaProduct(firstProduct, categories)) throw new Error('O primeiro sabor não é uma pizza válida.');
  const isHalfPizza = Boolean(secondProduct);
  if (isHalfPizza) {
    if (!isWaiterPizzaProduct(secondProduct, categories)) throw new Error('O segundo sabor não é uma pizza válida.');
    if (!isSameWaiterPizzaSize(firstProduct, secondProduct)) throw new Error('Meio a meio somente com pizzas do mesmo tamanho.');
  }

  const firstId = String(firstProduct.id || '');
  const secondId = isHalfPizza ? String(secondProduct.id || '') : '';
  const orderedIds = isHalfPizza ? [firstId, secondId].sort() : [firstId];
  const size = String(firstProduct.size || secondProduct?.size || '').trim();
  const sizeKey = getWaiterPizzaSizeKey(firstProduct) || getWaiterPizzaSizeKey(secondProduct);
  const border = resolveWaiterPizzaBorder(firstProduct, borderId, borders);
  const firstPrice = Number(firstProduct.price || 0);
  const secondPrice = Number(secondProduct?.price || 0);
  const basePrice = isHalfPizza ? Math.max(firstPrice, secondPrice) : firstPrice;
  const price = Number((basePrice + Number(border?.price || 0)).toFixed(2));
  const safeBorderId = border?.id ? `-border-${border.id.replace(/[^a-z0-9_-]+/g, '_')}` : '';
  const safeSizeKey = String(sizeKey || 'sem_tamanho').replace(/[^a-z0-9_-]+/g, '_');
  const firstName = cleanWaiterPizzaFlavorName(firstProduct.name);
  const secondName = isHalfPizza ? cleanWaiterPizzaFlavorName(secondProduct.name) : '';
  const name = isHalfPizza
    ? `Pizza Meio a Meio: ${firstName} / ${secondName}${size ? ` (${size})` : ''}`
    : String(firstProduct.name || 'Pizza');

  return {
    id: isHalfPizza
      ? `item-half-${safeSizeKey}-${orderedIds.join('-')}${safeBorderId}`
      : `item-${firstId}${safeBorderId}`,
    productId: isHalfPizza ? `half-${orderedIds.join('|')}` : firstId,
    name,
    price,
    emoji: firstProduct.emoji || secondProduct?.emoji || '🍕',
    isCombo: false,
    isHalfPizza,
    halfPizzaFirstId: isHalfPizza ? firstId : '',
    halfPizzaSecondId: isHalfPizza ? secondId : '',
    size,
    sizeKey,
    borderSelection: border,
    borderLabel: border?.label || '',
    borderPrice: Number(border?.price || 0),
  };
}
