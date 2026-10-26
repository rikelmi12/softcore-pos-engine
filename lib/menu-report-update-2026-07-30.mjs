const SIZE_META = Object.freeze({
  P: { suffix: '(P 6P)', size: 'Pequena (6 Pedaços)', price: 55 },
  M: { suffix: '(M 8P)', size: 'Media (8 Pedaços)', price: 70 },
  G: { suffix: '(G 10P)', size: 'Grande (10 Pedaços)', price: 85 },
});

const SAVORY_CORRECTIONS = Object.freeze([
  {
    aliases: ['calabresa'],
    name: 'Calabresa',
    prices: { P: 55, M: 70, G: 85 },
  },
  {
    aliases: ['margherita', 'marguerita'],
    name: 'Marguerita',
    ingredients: 'M.M.O., tomate e manjericão.',
  },
  {
    aliases: ['mussarela'],
    name: 'Mussarela',
    ingredients: 'M.M.O., tomate e azeitona.',
  },
  {
    aliases: ['rucula'],
    name: 'Rúcula',
    ingredients: 'M.M.O., rúcula, bacon, tomate seco e catupiry.',
  },
  {
    aliases: ['poro'],
    name: 'Poró',
    ingredients: 'M.M.O., champignon, palmito, alho-poró, tomate cereja e catupiry.',
  },
  {
    aliases: ['strogonoff bovino'],
    name: 'Strogonoff Bovino',
    ingredients: 'M.M.O., strogonoff de carne, batata palha, champignon e azeitona.',
  },
  {
    aliases: ['nordestina', 'nordestina com banana da terra'],
    name: 'Nordestina com Banana-da-Terra',
    ingredients: 'M.M.O., carne de sol, cebola, catupiry, banana-da-terra, azeitona e pimenta-biquinho.',
  },
  {
    aliases: ['morada'],
    name: 'Morada',
    ingredients: 'M.M.O., presunto, calabresa, ovo, bacon, azeitona, milho, ervilha, cebola, pimentão, tomate e mussarela.',
  },
  {
    aliases: ['strogonoff de frango'],
    name: 'Strogonoff de Frango',
    ingredients: 'M.M.O., strogonoff de frango, batata palha, champignon e azeitona.',
  },
  {
    aliases: ['lombinho especial'],
    name: 'Lombinho Especial',
    ingredients: 'M.M.O., lombo canadense, bacon, tomate cereja, cebola, tomate seco, champignon, creme de leite e catupiry.',
  },
]);

const NEW_SAVORY_FLAVORS = Object.freeze([
  {
    id: 'pizza-calabresa-suprema',
    name: 'Calabresa Suprema',
    ingredients: 'M.M.O., calabresa, milho, ovo e catupiry.',
  },
  {
    id: 'pizza-tres-queijos',
    name: 'Três Queijos',
    ingredients: 'M.M.O., mussarela, provolone e catupiry.',
  },
]);

const SWEET_FLAVORS = Object.freeze([
  {
    id: 'pizza-banana-chocolate',
    aliases: ['banana com chocolate'],
    name: 'Banana com Chocolate',
    ingredients: 'leite condensado, creme de leite, mussarela, banana em rodelas e chocolate ao leite.',
  },
  {
    id: 'pizza-banana-canela',
    aliases: ['banana com canela'],
    name: 'Banana com Canela',
    ingredients: 'creme de leite, leite condensado, mussarela, banana em rodelas e canela com açúcar.',
  },
  {
    id: 'pizza-uva-trufada',
    aliases: ['uva trufada'],
    name: 'Uva Trufada',
    ingredients: 'creme de Ninho, uva e creme de avelã.',
  },
  {
    id: 'pizza-nutella',
    aliases: ['nutella'],
    name: 'Nutella',
    ingredients: "Nutella, M&M's e uva ou morango.",
  },
]);

const BEVERAGE_CORRECTIONS = Object.freeze([
  {
    aliases: ['coca cola 1 lt', 'coca cola 1 l pet'],
    name: 'Coca-Cola 1 L PET',
    price: 10,
  },
  {
    aliases: ['coca cola ls 1 lt', 'coca cola 1 l ls'],
    name: 'Coca-Cola 1 L LS',
    price: 12,
  },
  {
    aliases: ['coca cola lata 310 ml', 'coca cola lata'],
    name: 'Coca-Cola Lata',
    price: 6,
  },
  {
    aliases: ['guarana 1 lt', 'guarana 1 l'],
    name: 'Guaraná 1 L',
    price: 10,
  },
  {
    aliases: ['suco de caixinha de 1 lt uva', 'suco caixa 1 l'],
    name: 'Suco Caixa 1 L',
    price: 12,
  },
  {
    aliases: ['agua sem gas', 'agua mineral 500 ml'],
    name: 'Água Mineral 500 ml',
    price: 3,
  },
  {
    aliases: ['agua com gas', 'agua com gas 500 ml'],
    name: 'Água com Gás 500 ml',
    price: 4,
  },
]);

const NEW_BEVERAGES = Object.freeze([
  {
    id: 'bebida-h2o-limoneto',
    name: 'H2O Limoneto',
    price: 7,
  },
  {
    id: 'bebida-suco-lata',
    name: 'Suco Lata',
    price: 7,
  },
]);

const TARGET_BORDERS = Object.freeze([
  {
    id: 'mussarela',
    label: 'Mussarela',
    group: 'Tradicionais',
    prices: { P: 10, M: 15, G: 20 },
    active: true,
  },
  {
    id: 'catupiry',
    label: 'Catupiry',
    group: 'Tradicionais',
    prices: { P: 10, M: 15, G: 20 },
    active: true,
  },
  {
    id: 'calabresa-e-mussarela',
    label: 'Calabresa e Mussarela',
    group: 'Especiais',
    prices: { P: 20, M: 25, G: 30 },
    active: true,
  },
  {
    id: 'frango-e-catupiry',
    label: 'Frango e Catupiry',
    group: 'Especiais',
    prices: { P: 20, M: 25, G: 30 },
    active: true,
  },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function baseProductName(product) {
  return normalizeText(
    String(product?.name || '').replace(/\s*\([PMG]\s+\d+P\)\s*$/i, ''),
  );
}

function sizeKey(product) {
  const nameMatch = String(product?.name || '').match(/\(([PMG])\s+\d+P\)\s*$/i);
  if (nameMatch) return nameMatch[1].toUpperCase();
  const normalizedSize = normalizeText(product?.size);
  if (normalizedSize.startsWith('pequen')) return 'P';
  if (normalizedSize.startsWith('medi')) return 'M';
  if (normalizedSize.startsWith('grand')) return 'G';
  return '';
}

function matchesAliases(product, aliases) {
  const base = baseProductName(product);
  return aliases.some((alias) => base === normalizeText(alias));
}

function categoryIdByName(state, name) {
  const target = normalizeText(name);
  const category = (Array.isArray(state?.categories) ? state.categories : [])
    .find((entry) => normalizeText(entry?.name) === target);
  if (!category?.id) throw new Error(`Categoria obrigatoria nao encontrada: ${name}`);
  return String(category.id);
}

function newProduct({
  id,
  name,
  category,
  emoji,
  price,
  ingredients = '',
  size = '',
}) {
  return {
    id,
    name,
    category,
    emoji,
    price,
    oldPrice: 0,
    description: '',
    ingredients,
    size,
    observations: '',
    badge: '',
    featured: false,
    active: true,
    image: '',
  };
}

function upsertFlavorVariants(products, flavor, {
  category,
  emoji,
  requireExisting = false,
}) {
  const aliases = flavor.aliases || [flavor.name];
  const matches = products.filter((product) => matchesAliases(product, aliases));
  if (requireExisting && matches.length !== 3) {
    throw new Error(`${flavor.name}: esperadas 3 variantes existentes; encontradas ${matches.length}.`);
  }
  if (!requireExisting && ![0, 3].includes(matches.length)) {
    throw new Error(`${flavor.name}: cadastro parcial inesperado (${matches.length} variantes).`);
  }

  for (const size of Object.keys(SIZE_META)) {
    const meta = SIZE_META[size];
    let product = matches.find((entry) => sizeKey(entry) === size);
    if (!product) {
      product = newProduct({
        id: `${flavor.id}-${size.toLowerCase()}`,
        name: `${flavor.name} ${meta.suffix}`,
        category,
        emoji,
        price: flavor.prices?.[size] ?? meta.price,
        ingredients: flavor.ingredients || '',
        size: meta.size,
      });
      products.push(product);
    }

    product.name = `${flavor.name} ${meta.suffix}`;
    product.category = category;
    product.emoji = emoji;
    product.size = meta.size;
    product.active = true;
    if (flavor.prices) product.price = flavor.prices[size];
    if (flavor.ingredients) {
      product.ingredients = flavor.ingredients;
      if (String(product.description || '').trim()) product.description = flavor.ingredients;
    }
  }
}

function updateExistingSavoryProducts(products) {
  for (const correction of SAVORY_CORRECTIONS) {
    const matches = products.filter((product) => matchesAliases(product, correction.aliases));
    if (matches.length !== 3) {
      throw new Error(`${correction.name}: esperadas 3 variantes; encontradas ${matches.length}.`);
    }
    const seenSizes = new Set();
    for (const product of matches) {
      const size = sizeKey(product);
      if (!SIZE_META[size] || seenSizes.has(size)) {
        throw new Error(`${correction.name}: tamanhos duplicados ou invalidos.`);
      }
      seenSizes.add(size);
      product.name = `${correction.name} ${SIZE_META[size].suffix}`;
      product.size = SIZE_META[size].size;
      if (correction.prices) product.price = correction.prices[size];
      if (correction.ingredients) {
        product.ingredients = correction.ingredients;
        if (String(product.description || '').trim()) {
          product.description = correction.ingredients;
        }
      }
    }
  }
}

function updateBeverages(products, beverageCategory, waterCategory) {
  for (const correction of BEVERAGE_CORRECTIONS) {
    const matches = products.filter((product) => matchesAliases(product, correction.aliases));
    if (matches.length !== 1) {
      throw new Error(`${correction.name}: esperado 1 cadastro; encontrados ${matches.length}.`);
    }
    const product = matches[0];
    product.name = correction.name;
    product.price = correction.price;
    product.active = true;
  }

  const zeroAliases = ['coca cola zero lata 310ml', 'coca cola zero lata 310 ml'];
  const activeZeroMatches = products.filter(
    (product) => matchesAliases(product, zeroAliases) && product?.active !== false,
  );
  if (activeZeroMatches.length > 1) {
    throw new Error(`Coca-Cola Zero: encontrados ${activeZeroMatches.length} cadastros ativos.`);
  }
  for (let index = products.length - 1; index >= 0; index -= 1) {
    if (matchesAliases(products[index], zeroAliases) && products[index]?.active !== false) {
      products.splice(index, 1);
    }
  }

  for (const beverage of NEW_BEVERAGES) {
    const aliases = [beverage.name];
    const matches = products.filter((product) => matchesAliases(product, aliases));
    if (matches.length > 1) {
      throw new Error(`${beverage.name}: encontrados ${matches.length} cadastros.`);
    }
    let product = matches[0];
    if (!product) {
      product = newProduct({
        id: beverage.id,
        name: beverage.name,
        category: beverageCategory,
        emoji: '🥤',
        price: beverage.price,
      });
      products.push(product);
    }
    product.name = beverage.name;
    product.category = beverageCategory;
    product.price = beverage.price;
    product.active = true;
  }

  const waterNames = new Set(['Água Mineral 500 ml', 'Água com Gás 500 ml']);
  for (const product of products) {
    if (waterNames.has(product.name)) product.category = waterCategory;
  }
}

function updateBorders(originalBorders) {
  const targetIds = new Set(TARGET_BORDERS.map((border) => border.id));
  const preservedInactive = (Array.isArray(originalBorders) ? originalBorders : [])
    .filter((border) => border?.active === false && !targetIds.has(String(border?.id || '')));
  return [...TARGET_BORDERS.map(clone), ...preservedInactive.map(clone)];
}

function variantGroup(products, aliases) {
  return products.filter((product) => matchesAliases(product, aliases));
}

function assertVariantGroup(products, flavor, expectedIngredients = null, expectedPrices = null) {
  const aliases = flavor.aliases || [flavor.name];
  const matches = variantGroup(products, aliases);
  if (matches.length !== 3 || matches.some((product) => product.active !== true)) {
    throw new Error(`${flavor.name}: conjunto P/M/G ativo invalido.`);
  }
  const sizes = new Set(matches.map(sizeKey));
  if (sizes.size !== 3 || !['P', 'M', 'G'].every((size) => sizes.has(size))) {
    throw new Error(`${flavor.name}: tamanhos P/M/G invalidos.`);
  }
  for (const product of matches) {
    const size = sizeKey(product);
    if (product.name !== `${flavor.name} ${SIZE_META[size].suffix}`) {
      throw new Error(`${flavor.name}: nome fora do padrao no tamanho ${size}.`);
    }
    if (expectedIngredients && product.ingredients !== expectedIngredients) {
      throw new Error(`${flavor.name}: ingredientes incorretos no tamanho ${size}.`);
    }
    const expectedPrice = expectedPrices?.[size]?.price ?? expectedPrices?.[size];
    if (expectedPrices && Number(product.price) !== Number(expectedPrice)) {
      throw new Error(`${flavor.name}: preco incorreto no tamanho ${size}.`);
    }
  }
}

export function validateMenuReportState(state) {
  const products = Array.isArray(state?.products) ? state.products : [];
  const categories = Array.isArray(state?.categories) ? state.categories : [];
  const pizzaCategoryIds = new Set(
    categories
      .filter((category) => normalizeText(category?.name).includes('pizza'))
      .map((category) => String(category.id)),
  );
  const activePizzas = products.filter(
    (product) => product?.active === true && pizzaCategoryIds.has(String(product?.category)),
  );
  if (activePizzas.length !== 66) {
    throw new Error(`Esperadas 66 variantes de pizza ativas; encontradas ${activePizzas.length}.`);
  }

  for (const correction of SAVORY_CORRECTIONS) {
    assertVariantGroup(
      products,
      correction,
      correction.ingredients || null,
      correction.prices || null,
    );
  }
  for (const flavor of NEW_SAVORY_FLAVORS) {
    assertVariantGroup(products, flavor, flavor.ingredients, SIZE_META);
  }
  for (const flavor of SWEET_FLAVORS) {
    assertVariantGroup(products, flavor, flavor.ingredients, SIZE_META);
  }

  const inactiveTwoLoves = variantGroup(products, ['chocolate 2 amores']);
  if (inactiveTwoLoves.length !== 3 || inactiveTwoLoves.some((product) => product.active !== false)) {
    throw new Error('Chocolate 2 Amores deve permanecer com 3 variantes desativadas.');
  }

  const beverageNames = new Map([
    ['Coca-Cola 1 L PET', 10],
    ['Coca-Cola 1 L LS', 12],
    ['Coca-Cola Lata', 6],
    ['Guaraná 1 L', 10],
    ['H2O Limoneto', 7],
    ['Suco Caixa 1 L', 12],
    ['Suco Lata', 7],
    ['Água Mineral 500 ml', 3],
    ['Água com Gás 500 ml', 4],
  ]);
  const beverageCategoryIds = new Set(
    categories
      .filter((category) => {
        const name = normalizeText(category?.name);
        return name.includes('refrigerante') || name.includes('agua mineral');
      })
      .map((category) => String(category.id)),
  );
  const activeBeverages = products.filter(
    (product) => product?.active === true && beverageCategoryIds.has(String(product?.category)),
  );
  if (activeBeverages.length !== 9) {
    throw new Error(`Esperadas 9 bebidas ativas; encontradas ${activeBeverages.length}.`);
  }
  for (const [name, price] of beverageNames) {
    const matches = products.filter((product) => product?.name === name && product?.active === true);
    if (matches.length !== 1 || Number(matches[0].price) !== price) {
      throw new Error(`${name}: cadastro ou preco invalido.`);
    }
  }
  if (products.some(
    (product) => product?.active !== false && normalizeText(product?.name).includes('coca cola zero'),
  )) {
    throw new Error('Coca-Cola Zero ainda consta como produto ativo.');
  }

  const activeBorders = (Array.isArray(state?.borders) ? state.borders : [])
    .filter((border) => border?.active !== false);
  if (JSON.stringify(activeBorders) !== JSON.stringify(TARGET_BORDERS)) {
    throw new Error('Catalogo ativo de bordas nao corresponde aos quatro recheios aprovados.');
  }

  if (state?.config?.phone !== '+55 (XX) XXXXX-XXXX') {
    throw new Error('Telefone visivel incorreto.');
  }
  if (state?.config?.whatsapp !== '+55 (XX) XXXXX-XXXX' || state?.orders?.whatsapp !== '+55 (XX) XXXXX-XXXX') {
    throw new Error('Destino do WhatsApp incorreto.');
  }
  if (state?.visual?.heroFloatingName !== 'Pizza Marguerita') {
    throw new Error('Destaque inicial da Marguerita incorreto.');
  }

  return {
    activePizzaVariants: activePizzas.length,
    activeBeverages: activeBeverages.length,
    activeBorders: activeBorders.length,
    totalProducts: products.length,
  };
}

export function applyMenuReportUpdate(inputState) {
  const state = clone(inputState);
  const products = Array.isArray(state.products) ? state.products : [];
  state.products = products;

  const savoryCategory = categoryIdByName(state, 'Pizzas');
  const sweetCategory = categoryIdByName(state, 'Pizzas Doces');
  const beverageCategory = categoryIdByName(state, 'Refrigerante e suco');
  const waterCategory = categoryIdByName(state, 'Agua mineral');

  updateExistingSavoryProducts(products);
  for (const flavor of NEW_SAVORY_FLAVORS) {
    upsertFlavorVariants(products, flavor, {
      category: savoryCategory,
      emoji: '🍕',
      requireExisting: false,
    });
  }
  for (const flavor of SWEET_FLAVORS) {
    upsertFlavorVariants(products, flavor, {
      category: sweetCategory,
      emoji: '🍫',
      requireExisting: flavor.name !== 'Nutella',
    });
  }

  updateBeverages(products, beverageCategory, waterCategory);
  state.borders = updateBorders(state.borders);
  state.config = {
    ...(state.config || {}),
    phone: '+55 (XX) XXXXX-XXXX',
    whatsapp: '+55 (XX) XXXXX-XXXX',
  };
  state.orders = {
    ...(state.orders || {}),
    whatsapp: '+55 (XX) XXXXX-XXXX',
  };
  state.visual = {
    ...(state.visual || {}),
    heroFloatingName: 'Pizza Marguerita',
  };

  const summary = validateMenuReportState(state);
  const changedSections = ['products', 'borders', 'config', 'orders', 'visual']
    .filter((section) => JSON.stringify(inputState?.[section]) !== JSON.stringify(state[section]));

  return {
    state,
    changedSections,
    summary,
  };
}

export const MENU_REPORT_TARGETS = Object.freeze({
  targetBorders: TARGET_BORDERS.map(clone),
  savoryCorrections: SAVORY_CORRECTIONS.map(clone),
  newSavoryFlavors: NEW_SAVORY_FLAVORS.map(clone),
  sweetFlavors: SWEET_FLAVORS.map(clone),
});
