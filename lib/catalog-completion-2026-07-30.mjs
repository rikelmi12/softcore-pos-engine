const IMAGE_PATHS = Object.freeze({
  calabresaSuprema: '/assets/catalog/a5dcc29665aae95a0c22d12355c8921b48f571ce8caaeb90a56a9fdc1a5097f3.png',
  tresQueijos: '/assets/catalog/112171135bc378fd654fb6b27ce21c65186c0886d7571+55 (XX) XXXXX-XXXX30df6b455b.png',
  nutella: '/assets/catalog/21a9221035a1539558268c7f6b2d898a4ace8e80e0a65f859ada13f7f538454c.png',
  h2oLimoneto: '/assets/catalog/828c505579f517b825c120db706682c943901d11270edfa00519f87f32bdc5c2.png',
  sucoLata: '/assets/catalog/ba9dec5870667027dd433a51f68efac49ba93b1888a609c244b5c8f868390ef2.png',
});

const PIZZA_FISCAL_PROFILE = Object.freeze({
  ncm: '21069090',
  cest: '',
  cfop: '5102',
  csosn: '102',
  cst: '',
  origin: '0',
  unit: 'UN',
  tributaryUnit: 'UN',
  tributaryFactor: 1,
  aliquotaIcms: 0,
  pisCst: '07',
  pisAliquota: null,
  cofinsCst: '07',
  cofinsAliquota: null,
  fiscalReviewRequired: false,
  fiscalEmissionBlocked: false,
  fiscalProfileSource: 'XML NFC-e autorizado nNF 780, serie 1, emitido em 30/05/2026',
  fiscalProfileNote: 'Perfil copiado do XML de producao autorizado pelo sistema anterior em 30/05/2026. Mantido o mesmo enquadramento operacional por continuidade do cadastro fiscal.',
});

const REFRIGERANTE_FISCAL_PROFILE = Object.freeze({
  ncm: '22021000',
  cest: '',
  cfop: '5405',
  csosn: '500',
  cst: '',
  origin: '0',
  unit: 'UN',
  tributaryUnit: 'UN',
  tributaryFactor: 1,
  aliquotaIcms: 0,
  pisCst: '07',
  pisAliquota: null,
  cofinsCst: '07',
  cofinsAliquota: null,
  fiscalReviewRequired: false,
  fiscalEmissionBlocked: false,
  fiscalProfileSource: 'NFC-e autorizada nNF 5, serie 1, emitida em 16/03/2025',
  fiscalProfileNote: 'Perfil operacional de bebida em Goias. Refrigerantes seguem a NFC-e autorizada nNF 5 do proprio estabelecimento; agua e suco seguem o enquadramento pelo tipo cadastrado.',
});

const SUCO_FISCAL_PROFILE = Object.freeze({
  ...REFRIGERANTE_FISCAL_PROFILE,
  ncm: '22029900',
  fiscalProfileSource: 'Padrao GO para bebida nao alcoolica em caixa',
});

const PRODUCT_DEFAULTS = Object.freeze({
  trackStock: false,
  minimumStock: 0,
  stockUnit: 'UN',
  fiscalCode: '',
  barcode: '',
  fiscalName: '',
  benefitCode: '',
});

const TARGET_GROUPS = Object.freeze([
  {
    key: 'calabresa-suprema',
    ids: [
      'pizza-calabresa-suprema-p',
      'pizza-calabresa-suprema-m',
      'pizza-calabresa-suprema-g',
    ],
    image: IMAGE_PATHS.calabresaSuprema,
    profile: PIZZA_FISCAL_PROFILE,
  },
  {
    key: 'tres-queijos',
    ids: [
      'pizza-tres-queijos-p',
      'pizza-tres-queijos-m',
      'pizza-tres-queijos-g',
    ],
    image: IMAGE_PATHS.tresQueijos,
    profile: PIZZA_FISCAL_PROFILE,
  },
  {
    key: 'nutella',
    ids: [
      'pizza-nutella-p',
      'pizza-nutella-m',
      'pizza-nutella-g',
    ],
    image: IMAGE_PATHS.nutella,
    profile: PIZZA_FISCAL_PROFILE,
  },
  {
    key: 'h2o-limoneto',
    ids: ['bebida-h2o-limoneto'],
    image: IMAGE_PATHS.h2oLimoneto,
    profile: REFRIGERANTE_FISCAL_PROFILE,
  },
  {
    key: 'suco-lata',
    ids: ['bebida-suco-lata'],
    image: IMAGE_PATHS.sucoLata,
    profile: SUCO_FISCAL_PROFILE,
  },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assignExpected(product, key, expected) {
  const current = product[key];
  if (!isBlank(current) && !valuesEqual(current, expected)) {
    throw new Error(
      `${product.id}: ${key} ja possui valor divergente (${JSON.stringify(current)}).`,
    );
  }
  product[key] = expected;
}

function applyProductDefaults(product) {
  for (const [key, defaultValue] of Object.entries(PRODUCT_DEFAULTS)) {
    if (product[key] === undefined || product[key] === null) {
      product[key] = defaultValue;
    }
  }
}

function targetProducts(state) {
  if (!Array.isArray(state?.products)) {
    throw new Error('Secao products ausente ou invalida.');
  }
  const byId = new Map();
  for (const product of state.products) {
    const id = String(product?.id || '');
    if (!id) continue;
    if (byId.has(id)) throw new Error(`ID de produto duplicado: ${id}`);
    byId.set(id, product);
  }

  const result = [];
  for (const group of TARGET_GROUPS) {
    for (const id of group.ids) {
      const product = byId.get(id);
      if (!product) throw new Error(`Produto obrigatorio nao encontrado: ${id}`);
      result.push({ product, group });
    }
  }
  return result;
}

function assertProductComplete(product, group) {
  if (product.image !== group.image) {
    throw new Error(`${product.id}: imagem do catalogo nao foi aplicada.`);
  }
  for (const [key, expected] of Object.entries(group.profile)) {
    if (!valuesEqual(product[key], expected)) {
      throw new Error(`${product.id}: campo fiscal ${key} divergente.`);
    }
  }
  if (product.trackStock !== false || product.minimumStock !== 0 || product.stockUnit !== 'UN') {
    throw new Error(`${product.id}: configuracao padrao de estoque divergente.`);
  }
  for (const key of ['fiscalCode', 'barcode', 'fiscalName', 'benefitCode']) {
    if (!(key in product)) {
      throw new Error(`${product.id}: campo ${key} ausente.`);
    }
  }
}

export function validateCatalogCompletionState(state) {
  const targets = targetProducts(state);
  for (const { product, group } of targets) assertProductComplete(product, group);

  return {
    completedProducts: targets.length,
    completedPizzaVariants: targets.filter(({ group }) => (
      group.profile === PIZZA_FISCAL_PROFILE
    )).length,
    completedBeverages: targets.filter(({ group }) => (
      group.profile !== PIZZA_FISCAL_PROFILE
    )).length,
    uniqueImages: new Set(targets.map(({ product }) => product.image)).size,
    missingImages: targets.filter(({ product }) => !String(product.image || '').trim()).length,
  };
}

export function applyCatalogCompletion(inputState) {
  const state = clone(inputState);
  const targets = targetProducts(state);

  for (const { product, group } of targets) {
    assignExpected(product, 'image', group.image);
    applyProductDefaults(product);
    for (const [key, expected] of Object.entries(group.profile)) {
      assignExpected(product, key, expected);
    }
  }

  const summary = validateCatalogCompletionState(state);
  const changedSections = JSON.stringify(inputState?.products) === JSON.stringify(state.products)
    ? []
    : ['products'];

  return {
    state,
    changedSections,
    summary,
  };
}

export const CATALOG_COMPLETION_TARGETS = Object.freeze({
  images: clone(IMAGE_PATHS),
  groups: TARGET_GROUPS.map((group) => ({
    key: group.key,
    ids: [...group.ids],
    image: group.image,
    profile: clone(group.profile),
  })),
});
