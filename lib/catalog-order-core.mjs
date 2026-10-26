const MONEY_SCALE = 100;

const DEFAULT_CATALOG_PIZZA_BORDERS = Object.freeze([
  { id: 'tradicional', label: 'Borda Tradicional', group: 'Tradicional', prices: { P: 10, M: 15, G: 20 }, active: true },
  { id: 'calabresa-e-mussarela', label: 'Calabresa e Mussarela', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
  { id: 'frango-catupiry', label: 'Frango Catupiry', group: 'Especiais', prices: { P: 20, M: 25, G: 30 }, active: true },
]);

export const FISCAL_TAX_COMPATIBILITY_FIELDS = Object.freeze([
  'ncm',
  'cest',
  'benefitCode',
  'cfop',
  'csosn',
  'cst',
  'origin',
  'unit',
  'tributaryUnit',
  'tributaryFactor',
  'aliquotaIcms',
  'vBCSTRet',
  'pST',
  'vICMSSubstituto',
  'vICMSSTRet',
  'vBCFCPSTRet',
  'pFCPSTRet',
  'vFCPSTRet',
  'pRedBCEfet',
  'vBCEfet',
  'pICMSEfet',
  'vICMSEfet',
  'pisCst',
  'pisAliquota',
  'cofinsCst',
  'cofinsAliquota',
  'fiscalReviewRequired',
  'fiscalEmissionBlocked',
]);

const FISCAL_CATALOG_SNAPSHOT_FIELDS = Object.freeze([
  'id',
  'name',
  'fiscalName',
  'fiscalCode',
  'sku',
  'barcode',
  'gtin',
  'ean',
  'ncm',
  'cest',
  'benefitCode',
  'cBenef',
  'cfop',
  'csosn',
  'cst',
  'origin',
  'unit',
  'tributaryUnit',
  'tribUnit',
  'tributaryFactor',
  'tribFactor',
  'aliquotaIcms',
  'vBCSTRet',
  'pST',
  'vICMSSubstituto',
  'vICMSSTRet',
  'vBCFCPSTRet',
  'pFCPSTRet',
  'vFCPSTRet',
  'pRedBCEfet',
  'vBCEfet',
  'pICMSEfet',
  'vICMSEfet',
  'pisCst',
  'pisAliquota',
  'cofinsCst',
  'cofinsAliquota',
  'fiscalReviewRequired',
  'fiscalEmissionBlocked',
  'fiscalProfileSource',
  'fiscalProfileNote',
]);

function trimText(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.round((parsed + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function sameMoney(left, right) {
  const leftValue = roundMoney(left);
  const rightValue = roundMoney(right);
  if (leftValue === null || rightValue === null) return false;
  return Math.round(leftValue * MONEY_SCALE) === Math.round(rightValue * MONEY_SCALE);
}

function normalizeTextForComparison(value) {
  const raw = trimText(value);
  if (!raw) return '';
  const normalized = typeof raw.normalize === 'function'
    ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : raw;
  return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeCatalogPizzaSizeKey(rawValue, allowRawFallback = false) {
  const text = normalizeTextForComparison(rawValue);
  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  if (/^(p|pp|peq|pequena|pequeno|brotinho|broto|s|small)$/.test(compact)) return 'pequena';
  if (/^(m|med|media|medio|medium)$/.test(compact)) return 'media';
  if (/^(g|gg|gr|grande|gigante|familia|family|big|l|large)$/.test(compact)) return 'grande';

  if (/\b(pequena|pequeno|brotinho|broto|small)\b/.test(text)) return 'pequena';
  if (/\b(media|medio)\b/.test(text)) return 'media';
  if (/\b(grande|gigante|familia|family|big|large)\b/.test(text)) return 'grande';
  return allowRawFallback ? text : '';
}

export function getCatalogPizzaSizeKey(product) {
  if (!product || typeof product !== 'object') return '';
  const explicit = normalizeCatalogPizzaSizeKey(product.size, true);
  if (explicit) return explicit;
  const fromName = normalizeCatalogPizzaSizeKey(product.name);
  if (fromName) return fromName;
  return normalizeCatalogPizzaSizeKey(product.description);
}

function getPizzaSizeLabel(product) {
  const explicit = trimText(product?.size, 160);
  if (explicit) return explicit;
  const sizeKey = getCatalogPizzaSizeKey(product);
  if (sizeKey === 'pequena') return 'Pequena';
  if (sizeKey === 'media') return 'Media';
  if (sizeKey === 'grande') return 'Grande';
  return '';
}

function getPizzaBorderSizeCode(product) {
  const sizeKey = getCatalogPizzaSizeKey(product);
  if (sizeKey === 'pequena') return 'P';
  if (sizeKey === 'media') return 'M';
  if (sizeKey === 'grande') return 'G';
  return '';
}

function isSamePizzaSize(firstProduct, secondProduct) {
  const firstSize = getCatalogPizzaSizeKey(firstProduct);
  const secondSize = getCatalogPizzaSizeKey(secondProduct);
  if (firstSize && secondSize) return firstSize === secondSize;
  if (firstSize || secondSize) return false;
  return true;
}

export function isCatalogPizzaProduct(product, state = {}) {
  if (!product || typeof product !== 'object') return false;
  const categoryToken = normalizeTextForComparison(product.category);
  if (categoryToken.includes('pizza')) return true;

  const categories = Array.isArray(state?.categories) ? state.categories : [];
  const category = categories.find((entry) => String(entry?.id || '') === String(product.category || ''));
  return normalizeTextForComparison(category?.name).includes('pizza');
}

function cleanHalfPizzaFlavorName(value) {
  let text = trimText(value, 160).replace(/\s+/g, ' ');
  if (!text) return 'Pizza';

  const trailingPatterns = [
    /\s*\((?=[^)]*(?:cm|pedacos?|peda[cç]os?|(?:^|\s)\d{1,2}\s*p\b|broto|brotinho|pequena|media|m[eé]dia|grande))[^)]*\)\s*$/i,
    /\s*[-–]\s*(?:(?:broto|brotinho|pequena|media|m[eé]dia|grande)\b.*)$/i,
    /\s+(?:broto|brotinho|pequena|media|m[eé]dia|grande)\b$/i,
    /\s+\d{1,2}\s*(?:p|p\.|pedacos?|peda[cç]os?)\b$/i,
    /\s+\d{1,2}\s*cm\b$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of trailingPatterns) {
      const next = text.replace(pattern, '').trim();
      if (next && next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  return text || 'Pizza';
}

export function buildCanonicalHalfPizzaName(firstProduct, secondProduct) {
  const firstName = cleanHalfPizzaFlavorName(firstProduct?.name || 'Pizza');
  const secondName = cleanHalfPizzaFlavorName(secondProduct?.name || 'Pizza');
  const sizeLabel = getPizzaSizeLabel(firstProduct) || getPizzaSizeLabel(secondProduct);
  const sizeSuffix = sizeLabel
    ? (/[()]/.test(sizeLabel) ? ` ${sizeLabel}` : ` (${sizeLabel})`)
    : '';

  if (firstName === secondName) {
    return sizeLabel
      ? `Pizza Meio a Meio (${firstName}) - ${sizeLabel}`
      : `Pizza Meio a Meio (${firstName})`;
  }
  return `Pizza Meio a Meio: ${firstName} / ${secondName}${sizeSuffix}`;
}

function getActiveProducts(state = {}) {
  return (Array.isArray(state?.products) ? state.products : [])
    .filter((product) => product && typeof product === 'object' && product.active !== false);
}

function buildFiscalCatalogSnapshot(kind, productId, products) {
  const safeProducts = (Array.isArray(products) ? products : [])
    .filter((product) => product && typeof product === 'object' && !Array.isArray(product))
    .map((product) => Object.fromEntries(
      FISCAL_CATALOG_SNAPSHOT_FIELDS
        .filter((field) => Object.hasOwn(product, field))
        .map((field) => [field, product[field]]),
    ));
  return {
    version: 1,
    kind,
    productId: String(productId || ''),
    capturedAt: new Date().toISOString(),
    products: safeProducts,
  };
}

function resolveFiscalCatalogSnapshot(item) {
  const snapshot = item?.fiscalCatalogSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if (Number(snapshot.version) !== 1) return null;
  const kind = ['product', 'half', 'combo'].includes(String(snapshot.kind || ''))
    ? String(snapshot.kind)
    : '';
  const products = Array.isArray(snapshot.products)
    ? snapshot.products.filter((product) => (
      product && typeof product === 'object' && !Array.isArray(product)
    ))
    : [];
  if (!kind || products.length === 0 || (kind === 'half' && products.length !== 2)) return null;
  const productId = trimText(snapshot.productId || getRawCatalogId(item), 260);
  if (!productId) return null;
  if (kind === 'half') {
    return {
      kind,
      productId,
      products,
      firstProduct: products[0],
      secondProduct: products[1],
      fromSnapshot: true,
    };
  }
  return {
    kind,
    productId,
    products,
    product: products[0],
    fromSnapshot: true,
  };
}

function findActiveById(entries, id) {
  const normalizedId = String(id ?? '');
  return entries.find((entry) => String(entry?.id ?? '') === normalizedId) || null;
}

function getRawCatalogId(rawItem) {
  const productId = trimText(rawItem?.productId, 120);
  if (productId) return productId;
  return trimText(rawItem?.id, 120);
}

function parseHalfProductId(productId) {
  const raw = trimText(productId, 260);
  if (!raw.startsWith('half-')) return null;
  const parts = raw.slice(5).split('|');
  if (parts.length !== 2 || parts.some((part) => !part)) return null;
  return parts;
}

function sameIdPair(firstPair, secondPair) {
  if (!Array.isArray(firstPair) || !Array.isArray(secondPair)) return false;
  return [...firstPair].map(String).sort().join('\u0000') === [...secondPair].map(String).sort().join('\u0000');
}

export function resolveHalfPizzaCatalogProducts(rawItem, state = {}) {
  const productId = getRawCatalogId(rawItem);
  const idsFromProductId = parseHalfProductId(productId);
  if (!idsFromProductId) {
    return { error: 'Identificador da pizza meio a meio invalido.' };
  }

  const explicitFirstId = trimText(rawItem?.halfPizzaFirstId, 120);
  const explicitSecondId = trimText(rawItem?.halfPizzaSecondId, 120);
  if (Boolean(explicitFirstId) !== Boolean(explicitSecondId)) {
    return { error: 'Informe os dois sabores da pizza meio a meio.' };
  }
  const selectedIds = explicitFirstId && explicitSecondId
    ? [explicitFirstId, explicitSecondId]
    : idsFromProductId;
  if (!sameIdPair(idsFromProductId, selectedIds)) {
    return { error: 'Os sabores informados nao conferem com o identificador da pizza meio a meio.' };
  }

  const products = getActiveProducts(state);
  const firstProduct = findActiveById(products, selectedIds[0]);
  const secondProduct = findActiveById(products, selectedIds[1]);
  if (!firstProduct || !secondProduct) {
    return { error: 'Um dos sabores da pizza meio a meio nao esta disponivel no cardapio.' };
  }
  if (!isCatalogPizzaProduct(firstProduct, state) || !isCatalogPizzaProduct(secondProduct, state)) {
    return { error: 'Pizza meio a meio so pode conter produtos cadastrados como pizza.' };
  }
  if (!isSamePizzaSize(firstProduct, secondProduct)) {
    return { error: 'Pizza meio a meio exige sabores do mesmo tamanho.' };
  }

  const sizeKey = getCatalogPizzaSizeKey(firstProduct) || getCatalogPizzaSizeKey(secondProduct);
  const suppliedSizeKey = trimText(rawItem?.sizeKey, 80);
  if (suppliedSizeKey && normalizeCatalogPizzaSizeKey(suppliedSizeKey, true) !== sizeKey) {
    return { error: 'O tamanho informado nao confere com os sabores da pizza meio a meio.' };
  }
  const suppliedSize = trimText(rawItem?.size, 160);
  if (suppliedSize && normalizeCatalogPizzaSizeKey(suppliedSize, true) !== sizeKey) {
    return { error: 'O tamanho informado nao confere com os sabores da pizza meio a meio.' };
  }

  const orderedIds = selectedIds.map(String).sort();
  return {
    firstProduct,
    secondProduct,
    firstId: String(selectedIds[0]),
    secondId: String(selectedIds[1]),
    productId: `half-${orderedIds.join('|')}`,
    size: getPizzaSizeLabel(firstProduct) || getPizzaSizeLabel(secondProduct),
    sizeKey,
  };
}

function resolveCanonicalBorder(rawItem, state, pizzaProduct) {
  const rawSelection = rawItem?.borderSelection && typeof rawItem.borderSelection === 'object'
    && !Array.isArray(rawItem.borderSelection)
    ? rawItem.borderSelection
    : {};
  const borderId = trimText(rawSelection.id || rawItem?.borderId, 120).toLowerCase();
  if (!borderId) return { borderSelection: null, borderPrice: 0 };
  if (!pizzaProduct || !isCatalogPizzaProduct(pizzaProduct, state)) {
    return { error: 'Borda personalizada so pode ser usada em pizzas cadastradas.' };
  }

  // O cardapio do cliente usa estas bordas padrao quando o cadastro remoto esta vazio.
  // A validacao do servidor precisa usar a mesma regra para nao rejeitar o pedido exibido na UI.
  const configuredBorders = Array.isArray(state?.borders) ? state.borders : [];
  const borders = configuredBorders.length ? configuredBorders : DEFAULT_CATALOG_PIZZA_BORDERS;
  const border = borders.find((entry) => (
    trimText(entry?.id, 120).toLowerCase() === borderId
    && entry?.active !== false
  ));
  if (!border) return { error: 'Borda personalizada indisponivel.' };

  // Espelha o front-end: quando o tamanho nao e reconhecido, a tabela M e usada.
  const size = getPizzaBorderSizeCode(pizzaProduct) || 'M';
  const prices = border?.prices && typeof border.prices === 'object' && !Array.isArray(border.prices)
    ? border.prices
    : {};
  const borderPrice = roundMoney(prices[size] ?? prices[size.toLowerCase()] ?? border?.price);
  if (borderPrice === null || borderPrice < 0) {
    return { error: 'Preco da borda personalizada invalido no cardapio.' };
  }

  return {
    borderSelection: {
      id: borderId,
      label: trimText(border?.label || border?.name || 'Borda personalizada', 100),
      group: trimText(border?.group, 80),
      size,
      price: borderPrice,
    },
    borderPrice,
  };
}

function flattenAllowedOptions(entry) {
  const roots = Array.isArray(entry?.options)
    ? entry.options
    : (Array.isArray(entry?.allowedOptions) ? entry.allowedOptions : []);
  const flattened = [];
  for (const candidate of roots) {
    if (!candidate || typeof candidate !== 'object' || candidate.active === false) continue;
    const children = Array.isArray(candidate.options) ? candidate.options : null;
    if (children) {
      for (const child of children) {
        if (!child || typeof child !== 'object' || child.active === false) continue;
        flattened.push({ ...child, groupId: trimText(candidate.id, 120) });
      }
    } else {
      flattened.push(candidate);
    }
  }
  return flattened;
}

function canonicalizeAllowedOptions(rawItem, catalogEntry) {
  const hasOptions = Object.hasOwn(rawItem, 'options') || Object.hasOwn(rawItem, 'selectedOptions');
  if (!hasOptions) return { options: [] };
  const rawOptions = Object.hasOwn(rawItem, 'selectedOptions')
    ? rawItem.selectedOptions
    : rawItem.options;
  if (!Array.isArray(rawOptions)) return { error: 'Opcoes do item invalidas.' };
  if (rawOptions.length === 0) return { options: [] };

  const allowedOptions = flattenAllowedOptions(catalogEntry);
  if (allowedOptions.length === 0) {
    return { error: 'Este item nao possui opcoes personalizaveis cadastradas.' };
  }

  const selectedIds = new Set();
  const options = [];
  for (const rawOption of rawOptions) {
    const optionId = trimText(
      typeof rawOption === 'object' && rawOption !== null
        ? (rawOption.id || rawOption.optionId)
        : rawOption,
      120,
    );
    if (!optionId || selectedIds.has(optionId)) return { error: 'Opcao do item invalida ou repetida.' };
    const allowed = findActiveById(allowedOptions, optionId);
    if (!allowed) return { error: `Opcao "${optionId}" nao permitida para este item.` };

    // O cardapio atual nao calcula adicionais genericos no navegador. Impedir
    // opcoes com preco evita criar uma segunda regra financeira no servidor.
    const optionPrice = roundMoney(allowed.price ?? allowed.additionalPrice ?? 0);
    if (optionPrice === null || optionPrice !== 0) {
      return { error: `Opcao "${optionId}" possui preco e nao pode ser validada por este fluxo.` };
    }

    const canonical = {
      id: optionId,
      label: trimText(allowed.label || allowed.name || optionId, 120),
    };
    const rawValue = typeof rawOption === 'object' && rawOption !== null
      ? trimText(rawOption.value ?? rawOption.valueId, 160)
      : '';
    if (rawValue) {
      const allowedValues = Array.isArray(allowed.values) ? allowed.values : [];
      const allowedValue = allowedValues.find((value) => (
        String(typeof value === 'object' ? (value?.id ?? value?.value) : value) === rawValue
        && (typeof value !== 'object' || value?.active !== false)
      ));
      if (!allowedValue) return { error: `Valor nao permitido para a opcao "${optionId}".` };
      canonical.value = String(
        typeof allowedValue === 'object'
          ? (allowedValue?.id ?? allowedValue?.value)
          : allowedValue,
      );
      canonical.valueLabel = trimText(
        typeof allowedValue === 'object'
          ? (allowedValue?.label || allowedValue?.name || canonical.value)
          : allowedValue,
        160,
      );
    }
    selectedIds.add(optionId);
    options.push(canonical);
  }
  return { options };
}

function getPreservedObservation(rawItem) {
  return trimText(
    rawItem?.observation
    ?? rawItem?.observations
    ?? rawItem?.note
    ?? rawItem?.notes,
    900,
  );
}

function validateSuppliedMoney(rawItem, canonicalUnitPrice, quantity, label) {
  if (Object.hasOwn(rawItem, 'unitPrice') || Object.hasOwn(rawItem, 'price')) {
    const suppliedUnitPrice = finiteNumber(rawItem.unitPrice ?? rawItem.price);
    if (suppliedUnitPrice === null || suppliedUnitPrice < 0 || !sameMoney(suppliedUnitPrice, canonicalUnitPrice)) {
      return { error: `Preco do item "${label}" nao confere com o cardapio.` };
    }
  }
  const subtotal = roundMoney(canonicalUnitPrice * quantity);
  if (Object.hasOwn(rawItem, 'subtotal')) {
    const suppliedSubtotal = finiteNumber(rawItem.subtotal);
    if (suppliedSubtotal === null || suppliedSubtotal < 0 || !sameMoney(suppliedSubtotal, subtotal)) {
      return { error: `Subtotal do item "${label}" nao confere com o cardapio.` };
    }
  }
  return { subtotal };
}

function getCanonicalItemId(productId, borderSelection, rawId) {
  const suppliedId = trimText(rawId, 120);
  if (suppliedId) return suppliedId;
  const borderSuffix = borderSelection?.id ? `-border-${borderSelection.id}` : '';
  return `item-${productId}${borderSuffix}`.slice(0, 120);
}

function normalizeCanonicalStockComponent(component) {
  const isObject = component && typeof component === 'object' && !Array.isArray(component);
  if (!isObject) return null;
  const productId = trimText(component.productId ?? component.id, 120);
  const quantity = Number(component.quantity ?? component.qty);
  if (!productId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999) return null;
  return { productId, quantity };
}

function buildCanonicalStockComponents(rawComponents = []) {
  const quantities = new Map();
  for (const component of Array.isArray(rawComponents) ? rawComponents : []) {
    const normalized = normalizeCanonicalStockComponent(component);
    if (!normalized) continue;
    quantities.set(
      normalized.productId,
      Number(((quantities.get(normalized.productId) || 0) + normalized.quantity).toFixed(6)),
    );
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function canonicalizeCatalogOrderItem(rawItem, state = {}) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return { error: 'Item do pedido invalido.' };
  }

  const quantity = Number(rawItem.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return { error: 'Quantidade invalida para item do pedido.' };
  }
  const rawProductId = getRawCatalogId(rawItem);
  if (rawItem.isCombo && (rawItem.isHalfPizza || rawProductId.startsWith('half-'))) {
    return { error: 'Item nao pode ser combo e pizza meio a meio ao mesmo tempo.' };
  }

  const isHalfPizza = Boolean(rawItem.isHalfPizza) || rawProductId.startsWith('half-');
  if (isHalfPizza) {
    if (!rawProductId.startsWith('half-')) {
      return { error: 'Identificador da pizza meio a meio invalido.' };
    }
    const half = resolveHalfPizzaCatalogProducts(rawItem, state);
    if (half.error) return half;
    const border = resolveCanonicalBorder(rawItem, state, half.firstProduct);
    if (border.error) return border;
    const firstPrice = roundMoney(half.firstProduct?.price);
    const secondPrice = roundMoney(half.secondProduct?.price);
    if (firstPrice === null || firstPrice < 0 || secondPrice === null || secondPrice < 0) {
      return { error: 'Preco de um dos sabores da pizza meio a meio e invalido no cardapio.' };
    }
    const unitPrice = roundMoney(Math.max(firstPrice, secondPrice) + border.borderPrice);
    const name = buildCanonicalHalfPizzaName(half.firstProduct, half.secondProduct);
    const financial = validateSuppliedMoney(rawItem, unitPrice, quantity, name);
    if (financial.error) return financial;
    const options = canonicalizeAllowedOptions(rawItem, half.firstProduct);
    if (options.error) return options;
    const secondFlavorOptions = canonicalizeAllowedOptions(rawItem, half.secondProduct);
    if (secondFlavorOptions.error) {
      return {
        error: `Opcao nao permitida para os dois sabores da pizza meio a meio: ${secondFlavorOptions.error}`,
      };
    }
    if (JSON.stringify(options.options) !== JSON.stringify(secondFlavorOptions.options)) {
      return { error: 'As opcoes da pizza meio a meio precisam ser permitidas nos dois sabores.' };
    }
    const observation = getPreservedObservation(rawItem);

    return {
      item: {
        id: getCanonicalItemId(half.productId, border.borderSelection, rawItem.id),
        productId: half.productId,
        name,
        quantity,
        unitPrice,
        subtotal: financial.subtotal,
        isCombo: false,
        isHalfPizza: true,
        halfPizzaFirstId: half.firstId,
        halfPizzaSecondId: half.secondId,
        size: half.size,
        sizeKey: half.sizeKey,
        emoji: trimText(half.firstProduct?.emoji || half.secondProduct?.emoji, 24),
        borderSelection: border.borderSelection,
        borderLabel: border.borderSelection?.label || '',
        borderPrice: border.borderPrice,
        observation,
        observations: observation,
        options: options.options,
        selectedOptions: options.options,
        stockComponents: buildCanonicalStockComponents([
          { productId: half.firstId, quantity: 0.5 },
          { productId: half.secondId, quantity: 0.5 },
        ]),
        fiscalCatalogSnapshot: buildFiscalCatalogSnapshot(
          'half',
          half.productId,
          [half.firstProduct, half.secondProduct],
        ),
      },
    };
  }

  if (rawItem.isCombo) {
    const combos = (Array.isArray(state?.combos) ? state.combos : [])
      .filter((combo) => combo && typeof combo === 'object' && combo.active !== false);
    const combo = findActiveById(combos, rawProductId);
    if (!combo) return { error: 'Combo indisponivel ou desconhecido no cardapio.' };
    const comboItems = Array.isArray(combo.items) ? combo.items : [];
    const stockComponents = buildCanonicalStockComponents(comboItems);
    const activeProductIds = new Set(getActiveProducts(state).map((product) => String(product.id)));
    const hasInvalidComponent = comboItems.some((component) => {
      const normalized = normalizeCanonicalStockComponent(component);
      return !normalized
        || !Number.isInteger(normalized.quantity)
        || normalized.quantity < 1
        || normalized.quantity > 20;
    });
    if (comboItems.length === 0
      || hasInvalidComponent
      || stockComponents.length === 0
      || stockComponents.some((component) => !activeProductIds.has(component.productId))) {
      return { error: 'Combo sem produtos vinculados nao pode ser vendido.' };
    }
    const comboPrice = roundMoney(combo.price);
    if (comboPrice === null || comboPrice < 0) return { error: 'Preco do combo invalido no cardapio.' };
    const comboName = `Combo ${trimText(combo.name, 130) || rawProductId}`;
    const financial = validateSuppliedMoney(rawItem, comboPrice, quantity, comboName);
    if (financial.error) return financial;
    const options = canonicalizeAllowedOptions(rawItem, combo);
    if (options.error) return options;
    const observation = getPreservedObservation(rawItem);

    return {
      item: {
        id: getCanonicalItemId(rawProductId, null, rawItem.id || `combo-${rawProductId}`),
        productId: rawProductId,
        name: comboName,
        quantity,
        unitPrice: comboPrice,
        subtotal: financial.subtotal,
        isCombo: true,
        isHalfPizza: false,
        halfPizzaFirstId: '',
        halfPizzaSecondId: '',
        size: trimText(combo.size, 160),
        sizeKey: '',
        emoji: trimText(combo.emoji, 24),
        borderSelection: null,
        borderLabel: '',
        borderPrice: 0,
        observation,
        observations: observation,
        options: options.options,
        selectedOptions: options.options,
        stockComponents,
        fiscalCatalogSnapshot: buildFiscalCatalogSnapshot('combo', rawProductId, [combo]),
      },
    };
  }

  const product = findActiveById(getActiveProducts(state), rawProductId);
  if (!product) return { error: 'Produto indisponivel ou desconhecido no cardapio.' };
  const productPrice = roundMoney(product.price);
  if (productPrice === null || productPrice < 0) return { error: 'Preco do produto invalido no cardapio.' };
  const border = resolveCanonicalBorder(
    rawItem,
    state,
    isCatalogPizzaProduct(product, state) ? product : null,
  );
  if (border.error) return border;
  const unitPrice = roundMoney(productPrice + border.borderPrice);
  const name = trimText(product.name, 140) || rawProductId;
  const financial = validateSuppliedMoney(rawItem, unitPrice, quantity, name);
  if (financial.error) return financial;
  const options = canonicalizeAllowedOptions(rawItem, product);
  if (options.error) return options;
  const observation = getPreservedObservation(rawItem);

  return {
    item: {
      id: getCanonicalItemId(rawProductId, border.borderSelection, rawItem.id),
      productId: String(product.id),
      name,
      quantity,
      unitPrice,
      subtotal: financial.subtotal,
      isCombo: false,
      isHalfPizza: false,
      halfPizzaFirstId: '',
      halfPizzaSecondId: '',
      size: trimText(product.size, 160),
      sizeKey: isCatalogPizzaProduct(product, state) ? getCatalogPizzaSizeKey(product) : '',
      emoji: trimText(product.emoji, 24),
      borderSelection: border.borderSelection,
      borderLabel: border.borderSelection?.label || '',
      borderPrice: border.borderPrice,
      observation,
      observations: observation,
      options: options.options,
      selectedOptions: options.options,
      stockComponents: [{ productId: String(product.id), quantity: 1 }],
      fiscalCatalogSnapshot: buildFiscalCatalogSnapshot('product', String(product.id), [product]),
    },
  };
}

export function resolveFiscalCatalogSource(item, state = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { error: 'Item fiscal invalido.' };
  }
  const snapshot = resolveFiscalCatalogSnapshot(item);

  const productId = getRawCatalogId(item);
  if (Boolean(item.isHalfPizza) || productId.startsWith('half-')) {
    const half = resolveHalfPizzaCatalogProducts(item, state);
    if (half.error) return snapshot || { error: half.error };
    return {
      kind: 'half',
      productId: half.productId,
      products: [half.firstProduct, half.secondProduct],
      firstProduct: half.firstProduct,
      secondProduct: half.secondProduct,
    };
  }
  if (item.isCombo) {
    const combos = (Array.isArray(state?.combos) ? state.combos : [])
      .filter((combo) => combo && typeof combo === 'object');
    const combo = findActiveById(combos, productId);
    if (!combo) return snapshot || { error: 'Combo do pedido nao existe mais no catalogo atual.' };
    return { kind: 'combo', productId: String(combo.id), products: [combo], product: combo };
  }

  const product = findActiveById(
    (Array.isArray(state?.products) ? state.products : [])
      .filter((entry) => entry && typeof entry === 'object'),
    productId,
  );
  if (!product) return snapshot || { error: 'Produto do pedido nao existe mais no catalogo atual.' };
  return { kind: 'product', productId: String(product.id), products: [product], product };
}

function normalizeComparableFiscalValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NaN';
    return String(Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return trimText(value, 200).toUpperCase();
}

export function compareFiscalTaxProfiles(profiles, fields = FISCAL_TAX_COMPATIBILITY_FIELDS) {
  if (!Array.isArray(profiles) || profiles.length < 2) {
    return { compatible: true, incompatibleFields: [] };
  }
  const relevantFields = Array.isArray(fields) && fields.length
    ? fields
    : FISCAL_TAX_COMPATIBILITY_FIELDS;
  const reference = profiles[0] || {};
  const incompatibleFields = relevantFields.filter((field) => {
    const expected = normalizeComparableFiscalValue(reference[field]);
    return profiles.slice(1).some((profile) => (
      normalizeComparableFiscalValue(profile?.[field]) !== expected
    ));
  });
  return {
    compatible: incompatibleFields.length === 0,
    incompatibleFields,
  };
}
