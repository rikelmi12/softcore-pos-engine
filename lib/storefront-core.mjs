const PUBLIC_CONFIG_FIELDS = Object.freeze([
  'storeName',
  'slogan',
  'description',
  'street',
  'number',
  'neighborhood',
  'city',
  'state',
  'cep',
  'phone',
  'whatsapp',
  'email',
  'instagram',
  'facebook',
  'footerText',
  'logo',
  'banner',
  'colorPrimary',
  'colorSecondary',
  'colorBg',
  'colorText',
  'colorSurface',
  'colorSurfaceDark',
  'colorOnDark',
  'colorWhatsapp',
  'schedule',
]);

const PUBLIC_VISUAL_FIELDS = Object.freeze([
  'heroTitle1',
  'heroTitle2',
  'heroSubtitle',
  'heroBadge',
  'heroCta',
  'heroFloatingImage',
  'heroFloatingName',
  'heroFloatingPrice',
  'promoBannerText',
  'promoBannerActive',
  'deliveryTime',
  'rating',
  'freeDelivery',
  'secPromoBanner',
  'secHero',
  'secCombos',
  'secPizzas',
  'secHamb',
  'secPorcoes',
  'secBebidas',
  'secSobremesas',
]);

const PUBLIC_ORDER_FIELDS = Object.freeze([
  'whatsapp',
  'pixKey',
  'greeting',
  'msgTemplate',
  'deliveryFee',
  'freeDeliveryAt',
  'minValue',
  'deliveryTime',
  'storeOpen',
  'closedMsg',
  'openTime',
  'closeTime',
  'neighborhoods',
]);

const PUBLIC_CATEGORY_FIELDS = Object.freeze([
  'id',
  'name',
  'description',
  'icon',
  'color',
  'order',
  'active',
]);

const PUBLIC_PRODUCT_FIELDS = Object.freeze([
  'id',
  'name',
  'category',
  'emoji',
  'price',
  'oldPrice',
  'description',
  'ingredients',
  'size',
  'observations',
  'badge',
  'featured',
  'active',
  'image',
]);

const PUBLIC_COMBO_FIELDS = Object.freeze([
  'id',
  'name',
  'description',
  'emoji',
  'price',
  'oldPrice',
  'badge',
  'active',
  'image',
  'items',
]);

const PUBLIC_ANNOUNCEMENT_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'image',
  'buttonLabel',
  'buttonUrl',
  'active',
  'order',
]);

const PUBLIC_PROMOTION_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'code',
  'badge',
  'image',
  'active',
  'order',
]);

const PUBLIC_BORDER_FIELDS = Object.freeze([
  'id',
  'label',
  'group',
  'prices',
  'price',
  'active',
  'order',
]);

function clone(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function pick(source, fields) {
  const output = {};
  const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  for (const field of fields) {
    if (Object.hasOwn(input, field)) output[field] = clone(input[field]);
  }
  return output;
}

function pickList(value, fields) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => pick(entry, fields));
}

function numericOrder(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedProductName(value) {
  const raw = String(value || '').trim();
  const normalized = typeof raw.normalize === 'function'
    ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : raw;
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compareStorefrontProductsAlphabetically(a, b) {
  const flavorA = normalizedProductName(a?.name)
    .replace(/^pizzas?\s+/, '')
    .replace(/\s+(?:g|m|p)\s+\d+p$/, '')
    .replace(/\s+(?:grande|media|pequena)(?:\s+\d+cm)?$/, '')
    .trim();
  const flavorB = normalizedProductName(b?.name)
    .replace(/^pizzas?\s+/, '')
    .replace(/\s+(?:g|m|p)\s+\d+p$/, '')
    .replace(/\s+(?:grande|media|pequena)(?:\s+\d+cm)?$/, '')
    .trim();
  const byFlavor = flavorA.localeCompare(flavorB, 'pt-BR', { sensitivity: 'base', numeric: true });
  if (byFlavor !== 0) return byFlavor;
  return normalizedProductName(a?.name).localeCompare(
    normalizedProductName(b?.name),
    'pt-BR',
    { sensitivity: 'base', numeric: true },
  );
}

function isPizzaCategory(category) {
  return normalizedProductName(`${category?.id || ''} ${category?.name || ''}`).includes('pizza');
}

function comboHasSellableItems(combo, activeProductIds) {
  if (!Array.isArray(combo?.items) || combo.items.length === 0) return false;
  return combo.items.every((item) => {
    const isObject = item && typeof item === 'object' && !Array.isArray(item);
    if (!isObject) return false;
    const productId = String(item.productId ?? item.id ?? '').trim();
    const quantity = Number(item.quantity ?? item.qty);
    return Boolean(productId)
      && Number.isInteger(quantity)
      && quantity >= 1
      && quantity <= 20
      && activeProductIds.has(productId);
  });
}

export function buildStorefrontState(rawState, { activeOnly = true } = {}) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const categories = pickList(state.categories, PUBLIC_CATEGORY_FIELDS)
    .filter((category) => !activeOnly || category.active !== false)
    .sort((a, b) => numericOrder(a.order, Number.MAX_SAFE_INTEGER)
      - numericOrder(b.order, Number.MAX_SAFE_INTEGER));
  const categoryIds = new Set(categories.map((category) => String(category.id || '')).filter(Boolean));

  const allActiveProducts = pickList(state.products, PUBLIC_PRODUCT_FIELDS)
    .filter((product) => !activeOnly || product.active !== false);
  const products = allActiveProducts
    .filter((product) => (
      !activeOnly || categoryIds.has(String(product.category || ''))
    ));
  const activeProductIds = new Set(allActiveProducts.map((product) => String(product.id || '')).filter(Boolean));
  const combos = pickList(state.combos, PUBLIC_COMBO_FIELDS)
    .filter((combo) => (
      (!activeOnly || combo.active !== false)
      && (!activeOnly || comboHasSellableItems(combo, activeProductIds))
    ));
  const promotions = pickList(state.promotions, PUBLIC_PROMOTION_FIELDS)
    .filter((promotion) => !activeOnly || promotion.active !== false);
  const announcements = pickList(state.announcements, PUBLIC_ANNOUNCEMENT_FIELDS)
    .filter((announcement) => !activeOnly || announcement.active !== false)
    .sort((a, b) => numericOrder(a.order, Number.MAX_SAFE_INTEGER)
      - numericOrder(b.order, Number.MAX_SAFE_INTEGER));
  const borders = pickList(state.borders, PUBLIC_BORDER_FIELDS)
    .filter((border) => !activeOnly || border.active !== false);

  return {
    config: pick(state.config, PUBLIC_CONFIG_FIELDS),
    visual: pick(state.visual, PUBLIC_VISUAL_FIELDS),
    orders: pick(state.orders, PUBLIC_ORDER_FIELDS),
    categories,
    products,
    combos,
    promotions,
    announcements,
    borders,
  };
}

function replaceText(value, replacements) {
  let output = String(value ?? '');
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function applyFieldCorrection(product, field, replacements, changes) {
  if (typeof product?.[field] !== 'string') return;
  const before = product[field];
  const after = replaceText(before, replacements);
  if (after === before) return;
  product[field] = after;
  changes.push({
    section: 'products',
    id: String(product.id || ''),
    product: String(product.name || ''),
    field,
    before,
    after,
  });
}

function setProductField(product, field, after, changes) {
  const before = product?.[field];
  if (before === after) return;
  product[field] = after;
  changes.push({
    section: 'products',
    id: String(product.id || ''),
    product: String(product.name || ''),
    field,
    before,
    after,
  });
}

function exactProductName(product, expected) {
  return String(product?.name || '').trim().toLocaleLowerCase('pt-BR')
    === String(expected || '').trim().toLocaleLowerCase('pt-BR');
}

export function applySoftcoreCorrections(rawState) {
  const state = clone(rawState && typeof rawState === 'object' ? rawState : {});
  const changes = [];
  const config = state.config && typeof state.config === 'object' && !Array.isArray(state.config)
    ? state.config
    : {};
  const products = Array.isArray(state.products) ? state.products : [];

  if (config.slogan === 'Imagens merantemente ilustrativas.') {
    const before = config.slogan;
    config.slogan = 'Imagens meramente ilustrativas.';
    changes.push({
      section: 'config',
      field: 'slogan',
      before,
      after: config.slogan,
    });
  }
  state.config = config;

  for (const product of products) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) continue;
    const originalName = String(product.name || '');

    if (originalName === 'Calabresa  (P 6P)') {
      setProductField(product, 'name', 'Calabresa Especial (P 6P)', changes);
    }

    if (
      exactProductName(product, 'Frango catupiry (M 8P)')
      || exactProductName(product, 'Frango catupiry (P 6P)')
    ) {
      setProductField(
        product,
        'ingredients',
        'M.M.O frango desfiado, catupiry e azeitona.',
        changes,
      );
    }

    if (
      exactProductName(product, 'Mussarela (M 8P)')
      || exactProductName(product, 'Mussarela (P 6P)')
    ) {
      setProductField(product, 'ingredients', 'M.M.O tomate e azeitona.', changes);
    }

    if (/^Poro \((?:G 10P|M 8P|P 6P)\)$/i.test(originalName)) {
      for (const field of ['description', 'ingredients']) {
        applyFieldCorrection(product, field, [
          [/\bchampion\b/gi, 'champignon'],
          [/\balho poro\b/gi, 'alho-poró'],
        ], changes);
      }
    }

    if (/^Margherita \((?:G 10P|M 8P|P 6P)\)$/i.test(originalName)) {
      for (const field of ['description', 'ingredients']) {
        applyFieldCorrection(product, field, [
          [/\bmanjericao\b/gi, 'manjericão'],
          [/\bparmessao\b/gi, 'parmesão'],
        ], changes);
      }
    }

    if (/^Morada \((?:G 10P|M 8P|P 6P)\)$/i.test(originalName)) {
      for (const field of ['description', 'ingredients']) {
        applyFieldCorrection(product, field, [
          [/\bpimentao\b/gi, 'pimentão'],
        ], changes);
      }
    }

    if (exactProductName(product, 'Strognoff bovino (M 8P)')) {
      setProductField(product, 'name', 'Strogonoff Bovino (M 8P)', changes);
    }

    applyFieldCorrection(product, 'description', [
      [
        /Produto disponivel apenas para consumo local\./gi,
        'Produto disponível apenas para consumo local.',
      ],
    ], changes);
  }

  state.products = products;
  return { state, changes };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/assets\/catalog\/[a-f0-9]{64}\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(raw)) {
    return raw;
  }
  if (/^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

function inlineJsString(value) {
  const safe = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\x22')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C');
  return `'${safe}'`;
}

function formatCurrency(value) {
  const numeric = Number(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function replacePattern(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function renderProductCard(product, index) {
  const image = safeImageUrl(product.image);
  const name = escapeHtml(product.name || '');
  const description = escapeHtml(product.description || '');
  const ingredients = escapeHtml(product.ingredients || '');
  const hasIngredients = ingredients.trim().length > 0;
  const emoji = escapeHtml(product.emoji || '🍕');
  const badge = escapeHtml(product.badge || '');
  const category = escapeHtml(product.category || '');
  const id = escapeHtml(product.id || '');
  const panelId = `ssr-ing-${String(product.id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const hasDiscount = Number(product.oldPrice) > Number(product.price);

  return `
    <div class="product-card" data-category="${category}" data-id="${id}" data-name="${escapeHtml(String(product.name || '').toLowerCase())}" style="animation-delay:${index * 0.06}s">
      <div class="product-img ${image ? 'has-photo' : ''}">
        ${image ? `<img src="${escapeHtml(image)}" class="product-photo" alt="${name}" loading="lazy" decoding="async" />` : ''}
        <span class="emoji">${emoji}</span>
        ${badge ? `<span class="product-badge">${badge}</span>` : ''}
      </div>
      <div class="product-body">
        <div class="product-name">${name}</div>
        <div class="product-desc">${description}</div>
        ${hasIngredients ? `
          <button class="btn-ingredients" onclick="toggleIngredients(this, '${escapeHtml(panelId)}')">
            <span>🧂 Ver ingredientes</span><span class="arrow">▾</span>
          </button>
          <div class="ingredients-panel" id="${escapeHtml(panelId)}">${ingredients}</div>` : ''}
      </div>
      <div class="product-footer">
        <div class="product-price">
          ${hasDiscount ? `<span class="product-old-price">${formatCurrency(product.oldPrice)}</span>` : ''}
          <span class="product-new-price">${formatCurrency(product.price)}</span>
        </div>
        <button class="btn-add" onclick="addToCart(${inlineJsString(product.id)})">
          <span class="plus">+</span> Adicionar
        </button>
      </div>
    </div>`;
}

function renderMenu(state) {
  const parts = [
    `<div class="search-result-info" id="searchResultInfo" style="display:none;">
      <span id="searchResultText"></span>
      <button onclick="clearSearch()">Limpar busca</button>
    </div>`,
  ];
  for (const category of state.categories) {
    const categoryId = String(category.id || '');
    const safeGridId = categoryId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const products = state.products.filter((product) => String(product.category || '') === categoryId);
    if (isPizzaCategory(category)) products.sort(compareStorefrontProductsAlphabetically);
    parts.push(`
      <section class="menu-section" data-section="${escapeHtml(categoryId)}" data-enabled="true">
        <div class="section-header">
          <h2 class="section-title">${escapeHtml(category.icon || '🍽️')} ${escapeHtml(category.name || categoryId)}</h2>
          <p class="section-sub">${escapeHtml(category.description || 'Confira nossos produtos dessa categoria')}</p>
        </div>
        <div class="products-grid" id="grid-${escapeHtml(safeGridId)}">
          ${products.map((product, index) => renderProductCard(product, index)).join('')}
        </div>
      </section>`);
  }
  return parts.join('');
}

function renderCategories(state) {
  const buttons = [
    '<button class="cat-btn active" data-category="all">🍽️ Todos</button>',
  ];
  for (const category of state.categories) {
    buttons.push(
      `<button class="cat-btn" data-category="${escapeHtml(category.id || '')}">${escapeHtml(category.icon || '🍽️')} ${escapeHtml(category.name || '')}</button>`,
    );
  }
  if (state.combos.length > 0) {
    buttons.push('<button class="cat-btn" data-category="combos">⭐ Combos</button>');
  }
  return buttons.join('');
}

function renderCombos(state) {
  return state.combos.map((combo, index) => {
    const image = safeImageUrl(combo.image);
    const hasOldPrice = Number(combo.oldPrice) > Number(combo.price);
    return `
      <div class="combo-card" style="animation-delay:${index * 0.08}s">
        ${combo.badge ? `<span class="combo-tag">${escapeHtml(combo.badge)}</span>` : ''}
        ${image ? `<img src="${escapeHtml(image)}" class="combo-image" alt="${escapeHtml(combo.name || 'Combo')}" loading="lazy" />` : `<span class="combo-emoji">${escapeHtml(combo.emoji || '⭐')}</span>`}
        <div class="combo-name">${escapeHtml(combo.name || '')}</div>
        <div class="combo-desc">${escapeHtml(combo.description || '')}</div>
        <div class="combo-price-wrap">
          <div class="combo-prices">
            ${hasOldPrice ? `<span class="combo-old-price">${formatCurrency(combo.oldPrice)}</span>` : ''}
            <span class="combo-new-price">${formatCurrency(combo.price)}</span>
          </div>
          <button class="combo-add-btn" onclick="addComboToCart(${inlineJsString(combo.id)})">+ Pedir</button>
        </div>
      </div>`;
  }).join('');
}

function renderFooter(state) {
  const config = state.config;
  const storeName = escapeHtml(config.storeName || 'Sua Empresa');
  const subtitle = escapeHtml(config.description || 'Pizzaria & Lanchonete');
  const slogan = escapeHtml(config.slogan || '');
  const addressLine = [config.street, config.number].filter(Boolean).join(', ');
  const cityLine = [
    config.neighborhood,
    [config.city, config.state].filter(Boolean).join('/'),
  ].filter(Boolean).join(' – ');
  const email = escapeHtml(config.email || 'contato@empresa.com');
  const schedule = Array.isArray(config.schedule)
    ? config.schedule.filter((entry) => entry && entry.active !== false)
    : [];
  const scheduleHtml = schedule.length > 0
    ? schedule.map((entry) => `<p>${escapeHtml(entry.day || '')}: ${escapeHtml(entry.open || '')} às ${escapeHtml(entry.close || '')}</p>`).join('')
    : '<p>Consulte o estabelecimento.</p>';
  const instagram = String(config.instagram || '').trim();
  const facebook = String(config.facebook || '').trim();
  const socialLinks = [
    instagram ? `<a href="${escapeHtml(instagram.startsWith('http') ? instagram : `https://instagram.com/${instagram.replace(/^@/, '')}`)}" title="Instagram" rel="noopener noreferrer">📸</a>` : '',
    facebook ? `<a href="${escapeHtml(facebook.startsWith('http') ? facebook : `https://${facebook}`)}" title="Facebook" rel="noopener noreferrer">📘</a>` : '',
  ].join('');
  const copyright = escapeHtml(
    config.footerText || `© ${new Date().getFullYear()} ${config.storeName || 'Sua Empresa'}. Todos os direitos reservados.`,
  );

  return `<footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="footer-logo">🍕</div>
        <h3 id="footerStoreName">${storeName}</h3>
        <p>${subtitle}</p>
        <p class="footer-slogan">${slogan ? `"${slogan}"` : ''}</p>
      </div>
      <div class="footer-info">
        <h4>📍 Onde estamos</h4>
        <p>${escapeHtml(addressLine)}<br/>${escapeHtml(cityLine)}<br/>CEP ${escapeHtml(config.cep || '')}</p>
      </div>
      <div class="footer-info">
        <h4>📞 Contato</h4>
        <p>${escapeHtml(config.phone || '')}</p>
        <p>${email}</p>
        <a class="footer-whatsapp" href="#" id="whatsappFooter" target="_blank">💬 Pedir pelo WhatsApp</a>
      </div>
      <div class="footer-info">
        <h4>⏰ Funcionamento</h4>
        ${scheduleHtml}
        <div class="footer-socials">${socialLinks}</div>
      </div>
    </div>
    <div class="footer-bottom"><p id="footerCopyright">${copyright}</p></div>
  </footer>`;
}

export function renderStorefrontHtml(template, rawState) {
  const state = buildStorefrontState(rawState, { activeOnly: true });
  const config = state.config;
  const visual = state.visual;
  const storeName = String(config.storeName || 'Sua Empresa').trim() || 'Sua Empresa';
  const metaDescription = String(config.description || `${storeName} - Cardápio online`).trim();
  const logo = safeImageUrl(config.logo);
  const banner = safeImageUrl(config.banner);
  let html = String(template || '');

  html = replacePattern(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(storeName)} - Cardápio</title>`,
  );
  html = replacePattern(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(metaDescription)}" />`,
  );
  html = replacePattern(
    html,
    /<h1 id="brandStoreName">[\s\S]*?<\/h1>/i,
    `<h1 id="brandStoreName">${escapeHtml(storeName)}</h1>`,
  );
  html = replacePattern(
    html,
    /(<div class="brand-text">\s*<h1 id="brandStoreName">[\s\S]*?<\/h1>\s*)<span>[\s\S]*?<\/span>/i,
    `$1<span>${escapeHtml(config.description || 'Pizzaria & Lanchonete')}</span>`,
  );
  if (logo) {
    html = replacePattern(
      html,
      /(<a\s+class="brand-logo"[\s\S]*?>)[\s\S]*?(<\/a>)/i,
      `$1<img src="${escapeHtml(logo)}" class="brand-logo-image" alt="Logo ${escapeHtml(storeName)}" />$2`,
    );
  }
  html = replacePattern(
    html,
    /(<div class="categories-scroll">)[\s\S]*?(<\/div>\s*<\/nav>)/i,
    `$1${renderCategories(state)}$2`,
  );
  html = replacePattern(
    html,
    /(<main class="menu-main" id="menuMain">)[\s\S]*?(<\/main>)/i,
    `$1${renderMenu(state)}$2`,
  );
  html = replacePattern(
    html,
    /(<div class="combos-grid" id="combosGrid">)[\s\S]*?(<\/div>\s*<\/section>)/i,
    `$1${renderCombos(state)}$2`,
  );
  html = replacePattern(html, /<footer class="footer">[\s\S]*?<\/footer>/i, renderFooter(state));

  html = replacePattern(
    html,
    /(<div class="promo-banner" id="promoBanner")(\s*>)[\s\S]*?(<\/div>)/i,
    `$1${visual.promoBannerActive === false ? ' style="display:none;"' : ''}$2<span>${escapeHtml(visual.promoBannerText || '')}</span><button class="promo-close" onclick="document.getElementById('promoBanner').style.display='none'">✕</button>$3`,
  );
  html = replacePattern(
    html,
    /<div class="hero-badge">[\s\S]*?<\/div>/i,
    `<div class="hero-badge">${escapeHtml(visual.heroBadge || '')}</div>`,
  );
  html = replacePattern(
    html,
    /<h2 class="hero-title">[\s\S]*?<\/h2>/i,
    `<h2 class="hero-title">${escapeHtml(visual.heroTitle1 || '')}<br/><em>${escapeHtml(visual.heroTitle2 || '')}</em></h2>`,
  );
  html = replacePattern(
    html,
    /<p class="hero-sub">[\s\S]*?<\/p>/i,
    `<p class="hero-sub">${escapeHtml(visual.heroSubtitle || metaDescription)}</p>`,
  );
  html = replacePattern(
    html,
    /<button class="btn-primary" onclick="scrollToMenu\(\)">[\s\S]*?<\/button>/i,
    `<button class="btn-primary" onclick="scrollToMenu()">${escapeHtml(visual.heroCta || 'Ver Cardápio')}</button>`,
  );
  html = replacePattern(
    html,
    /<div class="hero-info">[\s\S]*?<\/div>/i,
    `<div class="hero-info"><span>⏱ ${escapeHtml(visual.deliveryTime || '')}</span><span>⭐ ${escapeHtml(visual.rating || '')}</span><span>🛵 ${escapeHtml(visual.freeDelivery || '')}</span></div>`,
  );
  html = replacePattern(
    html,
    /<div class="float-tag tag-1">[\s\S]*?<\/div>/i,
    `<div class="float-tag tag-1">${escapeHtml(visual.heroFloatingName || '')}<br/><strong>${escapeHtml(visual.heroFloatingPrice || '')}</strong></div>`,
  );
  const floatingImage = safeImageUrl(visual.heroFloatingImage);
  if (floatingImage) {
    html = replacePattern(
      html,
      /<div class="hero-pizza">[\s\S]*?<\/div>/i,
      `<div class="hero-pizza has-image"><img src="${escapeHtml(floatingImage)}" class="hero-pizza-image" alt="${escapeHtml(visual.heroFloatingName || 'Produto em destaque')}" /></div>`,
    );
  }
  if (banner) {
    html = replacePattern(
      html,
      /<section class="hero-section"(?:\s+style="[^"]*")?>/i,
      `<section class="hero-section" style="background-image:linear-gradient(rgba(15,8,5,.78),rgba(15,8,5,.78)),url('${escapeHtml(banner)}');background-size:cover;background-position:center;">`,
    );
  }

  return { html, state };
}
