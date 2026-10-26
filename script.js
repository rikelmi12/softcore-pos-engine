let CONFIG = {
  whatsappNumber: '5511+55 (XX) XXXXX-XXXX',
  storeName: 'Sua Empresa',
  deliveryFee: 5.00,   
  freeDeliveryAt: 60.00,  
  pixKey: '',
};

let CATEGORIES = [
  { id: 'pizzas', name: 'Pizzas', description: 'Massa artesanal, forno a lenha, ingredientes frescos', icon: '🍕', active: true },
  { id: 'hamburgueres', name: 'Hambúrgueres', description: 'Blend especial da casa, pao brioche artesanal', icon: '🍔', active: true },
  { id: 'porcoes', name: 'Porções', description: 'Perfeitas para compartilhar', icon: '🍟', active: true },
  { id: 'bebidas', name: 'Bebidas', description: 'Refrigerantes, sucos naturais e muito mais', icon: '🥤', active: true },
  { id: 'sobremesas', name: 'Sobremesas', description: 'Finalize com o melhor', icon: '🍰', active: true },
];

let VISUAL_SETTINGS = {};
let PROMOTIONS = [];
let ANNOUNCEMENTS = [];
const DEFAULT_ORDER_SETTINGS = Object.freeze({
  greeting: 'Olá! Gostaria de fazer um pedido 🍕',
  msgTemplate: '',
  minValue: 0,
  storeOpen: true,
  closedMsg: 'Estamos fechados no momento. Volte em breve! 😊',
  openTime: '11:00',
  closeTime: '23:00',
  neighborhoods: [],
});
let ORDER_SETTINGS = { ...DEFAULT_ORDER_SETTINGS };
let CATEGORY_VISUAL_FLAG_BY_ID = new Map();

function applyDocumentCspNonce(element) {
  const nonce = document.querySelector('meta[name="csp-nonce"]')?.content || '';
  if (nonce) element.setAttribute('nonce', nonce);
  return element;
}

const MOJIBAKE_TEXT_FIXES = Object.freeze([
  ['Ã¡', 'á'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã©', 'é'], ['Ãª', 'ê'],
  ['Ã­', 'í'], ['Ã³', 'ó'], ['Ã´', 'ô'], ['Ãº', 'ú'], ['Ã§', 'ç'],
  ['\u00C3\u0081', 'Á'], ['Ã‰', 'É'], ['Ã“', 'Ó'], ['Ãš', 'Ú'], ['Ã‡', 'Ç'],
  ['Ã€', 'À'], ['Ã±', 'ñ'], ['Ã¼', 'ü'],
  ['–', '-'], ['—', '-'], ['‘', '\''], ['’', '\''],
  ['â€œ', '"'], ['â€', '"'], ['â€¦', '...'], ['âˆ’', '−'],
  ['Â©', '©'], ['Â', ''],
  ['âš ï¸', '⚠️'], ['âœ…', '✅'], ['ðŸ“', '📍'], ['ðŸ—‘ï¸', '🗑️'],
  ['ðŸ—‘', '🗑'], ['ðŸ›’', '🛒'], ['ðŸŽ‰', '🎉'], ['ðŸ•', '🍕'],
  ['ðŸ”', '🍔'], ['ðŸŸ', '🍟'], ['ðŸ¥¤', '🥤'], ['ðŸ°', '🍰'],
  ['ðŸ§€', '🧀'], ['ðŸ—', '🍗'], ['ðŸŒ±', '🌱'], ['ðŸŠ', '🍊'],
  ['ðŸ’§', '💧'], ['ðŸ¥›', '🥛'], ['ðŸ«', '🍫'], ['ðŸ®', '🍮'],
  ['ðŸŽ‚', '🎂'], ['ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦', '👨‍👩‍👧‍👦'],
  ['ðŸ‘«', '👫'], ['ðŸ™‹', '🙋'], ['ðŸ”', '🔍'], ['ðŸ›µ', '🛵'],
  ['ðŸ§‚', '🧂'], ['â­', '⭐'], ['â–¾', '▾'], ['â±', '⏱'],
]);

const WINDOWS_1252_UNICODE_TO_BYTE = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F],
]);

function fixMojibakeText(value) {
  let text = String(value ?? '');
  if (!text) return text;

  const looksBroken = (input) => /(?:\u00C3.|\u00C2.|\u00E2.|\u00F0\u0178|\u00EF\u00B8|\uFFFD)/.test(input);
  const brokenScore = (input) => (input.match(/[\u00C3\u00C2\u00E2\u00F0\u00EF\uFFFD]/g) || []).length;
  const decodeWin1252AsUtf8 = (input) => {
    const TextDecoderCtor = typeof globalThis !== 'undefined' && typeof globalThis.TextDecoder === 'function'
      ? globalThis.TextDecoder
      : null;
    if (!TextDecoderCtor) return input;
    try {
      const bytes = [];
      for (const ch of input) {
        const cp = ch.codePointAt(0);
        if (cp <= 0xFF) {
          bytes.push(cp);
          continue;
        }
        const mapped = WINDOWS_1252_UNICODE_TO_BYTE.get(cp);
        if (typeof mapped === 'number') {
          bytes.push(mapped);
          continue;
        }
        return input;
      }
      return new TextDecoderCtor('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
    } catch {
      return input;
    }
  };

  for (let i = 0; i < 3; i += 1) {
    if (!looksBroken(text)) break;
    const decoded = decodeWin1252AsUtf8(text);
    if (!decoded || decoded === text) break;
    if (brokenScore(decoded) <= brokenScore(text)) {
      text = decoded;
      continue;
    }
    break;
  }

  for (const [from, to] of MOJIBAKE_TEXT_FIXES) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  return text;
}

function normalizeTextDeep(value) {
  if (Array.isArray(value)) return value.map(normalizeTextDeep);
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, inner]) => {
      out[key] = normalizeTextDeep(inner);
    });
    return out;
  }
  if (typeof value === 'string') return fixMojibakeText(value);
  return value;
}

function hasEmojiGlyph(value) {
  const text = String(value || '');
  if (!text) return false;
  return /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(text);
}

function normalizeEmoji(value, fallback = '🍕') {
  const fixed = fixMojibakeText(String(value || '')).trim();
  if (!fixed) return fallback;
  if (/(?:\u00F0\u0178|\u00C3.|\u00E2.|\uFFFD)/.test(fixed)) return fallback;
  if (hasEmojiGlyph(fixed)) return fixed;
  return fallback;
}

function normalizeCatalogEncoding() {
  CONFIG = normalizeTextDeep(CONFIG);
  CATEGORIES = normalizeTextDeep(CATEGORIES).map((cat) => {
    const id = String(cat?.id || '').toLowerCase();
    let fallback = '🍽️';
    if (id.includes('pizza')) fallback = '🍕';
    else if (id.includes('hamb')) fallback = '🍔';
    else if (id.includes('porc')) fallback = '🍟';
    else if (id.includes('bebid')) fallback = '🥤';
    else if (id.includes('sobre')) fallback = '🍰';
    return {
      ...cat,
      icon: normalizeEmoji(cat?.icon, fallback),
    };
  });
  PRODUCTS = normalizeTextDeep(PRODUCTS).map((product) => ({
    ...product,
    emoji: normalizeEmoji(product?.emoji, '🍕'),
  }));
  COMBOS = normalizeTextDeep(COMBOS).map((combo) => ({
    ...combo,
    emoji: normalizeEmoji(combo?.emoji, '⭐'),
  }));
  PROMOTIONS = normalizeTextDeep(PROMOTIONS);
  ANNOUNCEMENTS = normalizeTextDeep(ANNOUNCEMENTS);
}

function normalizeMojibakeAttributes(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const attrNames = ['placeholder', 'title', 'aria-label', 'alt'];
  const nodes = [root, ...root.querySelectorAll('*')];
  nodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    attrNames.forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      const current = node.getAttribute(attr);
      const fixed = fixMojibakeText(current);
      if (fixed !== current) node.setAttribute(attr, fixed);
    });
  });
}

function normalizeMojibakeTextNodes(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const current = node.nodeValue || '';
    const fixed = fixMojibakeText(current);
    if (fixed !== current) node.nodeValue = fixed;
    node = walker.nextNode();
  }
  normalizeMojibakeAttributes(root);
}

function installMojibakeGuard() {
  if (window.__mojibakeGuardInstalled) return;
  window.__mojibakeGuardInstalled = true;

  normalizeMojibakeTextNodes(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const current = node.nodeValue || '';
          const fixed = fixMojibakeText(current);
          if (fixed !== current) node.nodeValue = fixed;
        }
        continue;
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        normalizeMojibakeAttributes(mutation.target);
      }

      mutation.addedNodes.forEach((added) => {
        if (added && added.nodeType === Node.TEXT_NODE) {
          const current = added.nodeValue || '';
          const fixed = fixMojibakeText(current);
          if (fixed !== current) added.nodeValue = fixed;
          return;
        }
        if (added && added.nodeType === Node.ELEMENT_NODE) {
          normalizeMojibakeTextNodes(added);
        }
      });
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'],
  });
}

function resolveApiOrigin() {
  const protocol = window.location.protocol;
  if (protocol !== 'file:') return '';
  const saved = localStorage.getItem('bf_api_origin');
  return saved ? String(saved).trim().replace(/\/+$/, '') : 'http://localhost:8000';
}

const API_ORIGIN = resolveApiOrigin();
const DATA_API = `${API_ORIGIN}/api/data`;
const DATA_MANIFEST_API = `${API_ORIGIN}/api/data/manifest`;
const ORDER_LOGS_API = `${API_ORIGIN}/api/order-logs`;
const ORDER_RECEIPT_API = `${API_ORIGIN}/api/order-receipts`;
const LOCAL_DEFAULT_DATA_ENDPOINTS = API_ORIGIN
  ? [`${API_ORIGIN}/api/default-data`]
  : ['/api/default-data'];
const ORDER_LOGS_QUEUE_KEY = 'bf_order_logs_queue';
const ORDER_LOGS_QUEUE_LIMIT = 120;
const AUTO_SYNC_INTERVAL_MS = 3000;
const AUTO_SYNC_HIDDEN_INTERVAL_MS = 12000;
const AUTO_SYNC_OFFLINE_INTERVAL_MS = 8000;
const MOBILE_RUNTIME_STATE_KEY = 'bf_mobile_runtime_state';
const MOBILE_RUNTIME_STATE_TTL_MS = 30 * 60 * 1000;
const REMOTE_DATA_CACHE_KEY = 'bf_remote_data_cache_v1';
const REMOTE_DATA_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const CLOSED_ANNOUNCEMENTS_KEY = 'bf_closed_announcements_v1';
const SERVER_BOOTSTRAP_DATA_KEY = '__BF_BOOTSTRAP_DATA__';
const API_BOOTSTRAP_TIMEOUT_MS = 2000;
const API_MANIFEST_TIMEOUT_MS = 2500;
const API_SYNC_TIMEOUT_MS = 6000;
const PWA_INSTALL_ACTION = '#instalar-app';
let PWA_INSTALL_PROMPT = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  PWA_INSTALL_PROMPT = event;
});

window.addEventListener('appinstalled', () => {
  PWA_INSTALL_PROMPT = null;
  closePwaInstallGuide();
  const host = document.getElementById('announcementHost');
  if (host?.dataset.dismissKey) closeAnnouncement(host.dataset.dismissKey);
  if (document.getElementById('toast')) {
    showToast('Aplicativo instalado com sucesso!', 3200);
  }
});

function isMobileClient() {
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
}

function getSessionStorageSafe() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorageSafe() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, { timeoutMs = 0, ...options } = {}) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0 || typeof AbortController !== 'function') {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeCartSnapshot(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || ''),
      productId: item.productId,
      name: String(item.name || ''),
      price: Number(item.price) || 0,
      quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
      emoji: String(item.emoji || ''),
      isCombo: Boolean(item.isCombo),
      isHalfPizza: Boolean(item.isHalfPizza),
      halfPizzaFirstId: String(item.halfPizzaFirstId || ''),
      halfPizzaSecondId: String(item.halfPizzaSecondId || ''),
      size: String(item.size || ''),
      sizeKey: String(item.sizeKey || ''),
      borderSelection: item.borderSelection && typeof item.borderSelection === 'object'
        ? {
          id: String(item.borderSelection.id || ''),
          size: String(item.borderSelection.size || ''),
          label: String(item.borderSelection.label || ''),
          price: Number(item.borderSelection.price) || 0,
        }
        : null,
      borderLabel: String(item.borderLabel || ''),
      borderPrice: Math.max(0, Number(item.borderPrice) || 0),
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);
}

function saveMobileRuntimeState() {
  const storage = getSessionStorageSafe();
  if (!storage) return;

  const payload = {
    savedAt: Date.now(),
    cart,
    orderType: ORDER_TYPE,
    customerGeo: CUSTOMER_GEO,
    customerName: document.getElementById('customerName').value || '',
    customerNote: document.getElementById('customerNote').value || '',
    deliveryAddress: document.getElementById('deliveryAddress').value || '',
    localConsumptionTime: document.getElementById('localConsumptionTime').value || '',
    paymentMethod: getSelectedPaymentMethod(),
    needsChange: Boolean(document.getElementById('needsChange').checked),
    cashGiven: document.getElementById('cashGiven').value || '',
  };

  try {
    storage.setItem(MOBILE_RUNTIME_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora falhas de quota/privacidade.
  }
}

function clearMobileRuntimeState() {
  const storage = getSessionStorageSafe();
  if (!storage) return;
  try {
    storage.removeItem(MOBILE_RUNTIME_STATE_KEY);
  } catch {
    // Ignora falhas de quota/privacidade.
  }
}

function restoreMobileRuntimeState() {
  const storage = getSessionStorageSafe();
  if (!storage) return null;

  let parsed = null;
  try {
    const raw = storage.getItem(MOBILE_RUNTIME_STATE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    clearMobileRuntimeState();
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    clearMobileRuntimeState();
    return null;
  }

  const ageMs = Date.now() - (Number(parsed.savedAt) || 0);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MOBILE_RUNTIME_STATE_TTL_MS) {
    clearMobileRuntimeState();
    return null;
  }

  cart = normalizeCartSnapshot(parsed.cart);
  if (
    parsed.orderType === 'entrega'
    || parsed.orderType === 'retirada'
    || parsed.orderType === 'consumo_local'
  ) {
    ORDER_TYPE = parsed.orderType;
  }

  if (parsed.customerGeo && typeof parsed.customerGeo === 'object') {
    CUSTOMER_GEO = {
      lat: parsed.customerGeo.lat,
      lng: parsed.customerGeo.lng,
      accuracy: parsed.customerGeo.accuracy,
    };
  } else {
    CUSTOMER_GEO = null;
  }

  return {
    customerName: String(parsed.customerName || ''),
    customerNote: String(parsed.customerNote || ''),
    deliveryAddress: String(parsed.deliveryAddress || ''),
    localConsumptionTime: String(parsed.localConsumptionTime || ''),
    paymentMethod: String(parsed.paymentMethod || ''),
    needsChange: Boolean(parsed.needsChange),
    cashGiven: String(parsed.cashGiven || ''),
  };
}

function applyRestoredCheckoutState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  const nameInput = document.getElementById('customerName');
  if (nameInput) nameInput.value = snapshot.customerName || '';

  const noteInput = document.getElementById('customerNote');
  if (noteInput) noteInput.value = snapshot.customerNote || '';

  const addressInput = document.getElementById('deliveryAddress');
  if (addressInput) addressInput.value = snapshot.deliveryAddress || '';

  const localConsumptionInput = document.getElementById('localConsumptionTime');
  if (localConsumptionInput) localConsumptionInput.value = snapshot.localConsumptionTime || '';

  if (snapshot.paymentMethod) {
    const selected = document.querySelector(`input[name="paymentMethod"][value="${snapshot.paymentMethod}"]`);
    if (selected) selected.checked = true;
  }

  applyDeliveryPaymentPolicy();
  handlePaymentMethodChange();

  const needsChange = document.getElementById('needsChange');
  if (needsChange) needsChange.checked = Boolean(snapshot.needsChange);
  handleChangeNeedToggle();

  const cashInput = document.getElementById('cashGiven');
  if (cashInput && snapshot.needsChange) cashInput.value = snapshot.cashGiven || '';
  updateChangePreview();
}

function setupRuntimeStateAutoSave() {
  if (!isMobileClient()) return;
  if (document.body.dataset.runtimeSaveBound === 'true') return;
  if (document.body) document.body.dataset.runtimeSaveBound = 'true';

  const saveNow = () => saveMobileRuntimeState();
  document.addEventListener('input', saveNow, { passive: true });
  document.addEventListener('change', saveNow, { passive: true });
}

function setupPwaSupport() {
  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isSecureLike = Boolean(window.isSecureContext) || /^https:$/.test(window.location.protocol) || isLocalhost;
  if (!isSecureLike) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/service-worker.js?v=20260812-system-audit', { scope: '/' })
      .catch((error) => console.warn('Nao foi possivel registrar o aplicativo.', error));
  }
}

/* ──────────────────────────────────────────────────────────
   DADOS DO CARDÁPIO
   ════════════════════════════════════════════════════════
   Como editar:
   - id:          identificador único (não repita)
   - category:    pizzas | hamburgueres | porcoes | bebidas | sobremesas
   - name:        nome do produto
   - description: descrição curta
   - ingredients: lista de ingredientes (string)
   - price:       preço atual (número)
   - oldPrice:    preço antigo para mostrar desconto (null = sem desconto)
   - emoji:       emoji representando o produto
   - badge:       'Mais Pedido' | 'Novo' | null
   ────────────────────────────────────────────────────────── */
let PRODUCTS = [

  /* ── PIZZAS ─────────────────────────────────────────── */
  {
    id: 1,
    category: 'pizzas',
    name: 'Pizza Margherita',
    description: 'Clássica italiana com molho de tomate San Marzano, mussarela de búfala e manjericão fresco.',
    ingredients: 'Massa artesanal, molho de tomate San Marzano, mussarela de búfala, manjericão fresco, azeite extra virgem, sal grosso.',
    price: 52.90,
    oldPrice: null,
    emoji: '🍕',
    badge: 'Mais Pedido',
  },
  {
    id: 2,
    category: 'pizzas',
    name: 'Pizza Quatro Queijos',
    description: 'Uma explosão de sabor com quatro queijos artesanais derretidos na pedra.',
    ingredients: 'Massa artesanal, molho de tomate, mussarela, parmesão, gorgonzola, catupiry, orégano.',
    price: 62.90,
    oldPrice: null,
    emoji: '🧀',
    badge: null,
  },
  {
    id: 3,
    category: 'pizzas',
    name: 'Pizza Stroganoff de Frango',
    description: 'Frango desfiado, catupiry cremoso e temperos especiais com uma base irresistível.',
    ingredients: 'Massa artesanal, molho de tomate, mussarela, frango desfiado, catupiry, cebola, temperos especiais.',
    price: 69.90,
    oldPrice: null,
    emoji: '🍗',
    badge: 'Novo',
  },
  {
    id: 4,
    category: 'pizzas',
    name: 'Pizza Frango com Bacon',
    description: 'Frango desfiado temperado, bacon crocante e catupiry. Uma combinação irresistível.',
    ingredients: 'Massa artesanal, molho de tomate, mussarela, frango desfiado temperado, bacon fatiado, catupiry, orégano.',
    price: 59.90,
    oldPrice: null,
    emoji: '🍗',
    badge: null,
  },
  {
    id: 5,
    category: 'pizzas',
    name: 'Pizza Portuguesa',
    description: 'Presunto, ovos, azeitonas e pimentão. A favorita de sempre da família.',
    ingredients: 'Massa artesanal, molho de tomate, mussarela, presunto, ovos cozidos, azeitona preta, pimentão, cebola, orégano.',
    price: 57.90,
    oldPrice: null,
    emoji: '🇵🇹',
    badge: null,
  },
  {
    id: 6,
    category: 'pizzas',
    name: 'Pizza Lombinho Especial',
    description: 'Lombinho suíno especial, cebola caramelizada e queijo derretido em uma combinação premium.',
    ingredients: 'Massa artesanal, molho de tomate, mussarela, lombinho suíno especial, cebola caramelizada, queijo, orégano.',
    price: 75.90,
    oldPrice: null,
    emoji: '🥩',
    badge: 'Novo',
  },

  /* ── HAMBÚRGUERES ──────────────────────────────────── */
  {
    id: 7,
    category: 'hamburgueres',
    name: 'Smash Burger Clássico',
    description: 'Blend 80/20 smashado na chapa, queijo americano derretido, alface, tomate e molho especial da casa.',
    ingredients: 'Pão brioche artesanal, blend bovino 80/20 (180g), queijo americano, alface americana, tomate, picles, molho especial.',
    price: 34.90,
    oldPrice: null,
    emoji: '🍔',
    badge: 'Mais Pedido',
  },
  {
    id: 8,
    category: 'hamburgueres',
    name: 'Double Smash',
    description: 'Dois blends smashados, dois queijos cheddar, bacon crocante e cebola caramelizada. O pesado!',
    ingredients: 'Pão brioche grande, 2x blend bovino 80/20 (180g cada), 2x queijo cheddar, bacon, cebola caramelizada, alface, tomate, maionese temperada.',
    price: 48.90,
    oldPrice: null,
    emoji: '🍔',
    badge: null,
  },
  {
    id: 9,
    category: 'hamburgueres',
    name: 'Burger de Frango Crocante',
    description: 'Filé de frango empanado crocante, queijo suíço, alface e maionese de limão siciliano.',
    ingredients: 'Pão brioche, filé de frango empanado (200g), queijo suíço, alface, tomate, maionese de limão siciliano, picles.',
    price: 32.90,
    oldPrice: null,
    emoji: '🍗',
    badge: null,
  },
  {
    id: 10,
    category: 'hamburgueres',
    name: 'Burger Vegano',
    description: 'Blend de grão-de-bico e ervas, queijo vegano, legumes e molho tahine.',
    ingredients: 'Pão integral artesanal, blend vegetal (grão-de-bico, quinoa, ervas 160g), queijo vegano, tomate, alface, pepino, molho tahine.',
    price: 36.90,
    oldPrice: null,
    emoji: '🌱',
    badge: 'Novo',
  },

  /* ── PORÇÕES ──────────────────────────────────────── */
  {
    id: 11,
    category: 'porcoes',
    name: 'Batata Frita Artesanal',
    description: 'Batatas frescas cortadas na hora, fritas em óleo novo e temperadas com sal grosso e páprica.',
    ingredients: 'Batata Monalisa fresca, sal grosso, páprica defumada, alho, azeite.',
    price: 24.90,
    oldPrice: null,
    emoji: '🍟',
    badge: null,
  },
  {
    id: 12,
    category: 'porcoes',
    name: 'Onion Rings',
    description: 'Anéis de cebola empanados em massa especial, dourados e crocantes.',
    ingredients: 'Cebola roxa, farinha de trigo, cerveja (massa), páprica, sal, pimenta, óleo de fritura.',
    price: 22.90,
    oldPrice: null,
    emoji: '🧅',
    badge: null,
  },
  {
    id: 13,
    category: 'porcoes',
    name: 'Frango Crocante (8 peças)',
    description: 'Pedaços de frango temperados e empanados com nossa receita secreta. Com molho barbecue.',
    ingredients: 'Filé de frango marinado, farinha temperada, ovos, óleo, molho barbecue artesanal.',
    price: 32.90,
    oldPrice: null,
    emoji: '🍗',
    badge: 'Mais Pedido',
  },
  {
    id: 14,
    category: 'porcoes',
    name: 'Mozzarella Sticks',
    description: 'Bastões de mussarela empanados, puxa-puxa e dourados. Acompanha molho marinara.',
    ingredients: 'Mussarela em bastão, farinha de rosca, ovos, temperos, molho marinara caseiro.',
    price: 26.90,
    oldPrice: null,
    emoji: '🧀',
    badge: null,
  },

  /* ── BEBIDAS ───────────────────────────────────────── */
  {
    id: 15,
    category: 'bebidas',
    name: 'Refrigerante Lata 350ml',
    description: 'Coca-Cola, Pepsi, Guaraná, Sprite, Fanta Laranja ou Fanta Uva. Gelada.',
    ingredients: 'Consulte as opções disponíveis ao fazer o pedido.',
    price: 6.90,
    oldPrice: null,
    emoji: '🥤',
    badge: null,
  },
  {
    id: 16,
    category: 'bebidas',
    name: 'Suco Natural 500ml',
    description: 'Feito na hora! Laranja, Limão, Abacaxi, Maracujá, Acerola ou da estação.',
    ingredients: 'Fruta in natura, água gelada ou leite, açúcar a gosto.',
    price: 12.90,
    oldPrice: null,
    emoji: '🍊',
    badge: null,
  },
  {
    id: 17,
    category: 'bebidas',
    name: 'Água Mineral 500ml',
    description: 'Água gelada com ou sem gás.',
    ingredients: 'Água mineral natural.',
    price: 4.00,
    oldPrice: null,
    emoji: '💧',
    badge: null,
  },
  {
    id: 18,
    category: 'bebidas',
    name: 'Milkshake 400ml',
    description: 'Cremoso e gelado! Chocolate, Baunilha, Morango ou Ovomaltine.',
    ingredients: 'Sorvete artesanal, leite integral, calda, chantilly.',
    price: 18.90,
    oldPrice: null,
    emoji: '🥛',
    badge: null,
  },

  /* ── SOBREMESAS ────────────────────────────────────── */
  {
    id: 19,
    category: 'sobremesas',
    name: 'Brownie com Sorvete',
    description: 'Brownie quente de chocolate belga, sorvete de creme, calda quente e granulado.',
    ingredients: 'Chocolate belga 70%, manteiga, ovos, açúcar, farinha, sorvete artesanal de creme, calda de chocolate.',
    price: 22.90,
    oldPrice: null,
    emoji: '🍫',
    badge: 'Mais Pedido',
  },
  {
    id: 20,
    category: 'sobremesas',
    name: 'Pudim de Leite',
    description: 'Receita da avó: cremoso, com calda dourada de caramelo. Servido gelado.',
    ingredients: 'Leite condensado, leite integral, ovos, açúcar (calda), essência de baunilha.',
    price: 14.90,
    oldPrice: null,
    emoji: '🍮',
    badge: null,
  },
  {
    id: 21,
    category: 'sobremesas',
    name: 'Pizza Doce de Chocolate',
    description: 'Massa crocante com cobertura de chocolate, morangos e creme de leite.',
    ingredients: 'Massa artesanal, chocolate derretido, creme de leite, morangos frescos, açúcar, raspas de chocolate.',
    price: 32.90,
    oldPrice: null,
    emoji: '🍫',
    badge: 'Novo',
  },
];

/* ──────────────────────────────────────────────────────────
   DADOS DOS COMBOS
   ════════════════════════════════════════════════════════ */
let COMBOS = [
  {
    id: 'c1',
    name: 'Combo Família',
    description: '2 Pizzas Grandes + 4 Refrigerantes Lata',
    emoji: '👨‍👩‍👧‍👦',
    oldPrice: null,
    price: 99.90,
    badge: 'ECONOMIZE R$25',
    // Produtos que compõem o combo (id do produto principal + descrição)
    items: [
      { productId: 1, quantity: 2, name: 'Pizza Margherita (2x)' },
      { productId: 15, quantity: 4, name: 'Refrigerante Lata (4x)' },
    ],
  },
  {
    id: 'c2',
    name: 'Combo Casal',
    description: '2 Burgers Smash + 2 Batatas Fritas + 2 Refris',
    emoji: '👫',
    oldPrice: null,
    price: 84.90,
    badge: 'ECONOMIZE R$22',
    items: [
      { productId: 7, quantity: 2, name: 'Smash Burger (2x)' },
      { productId: 11, quantity: 2, name: 'Batata Frita (2x)' },
      { productId: 15, quantity: 2, name: 'Refrigerante (2x)' },
    ],
  },
  {
    id: 'c3',
    name: 'Combo Festa',
    description: '3 Pizzas Grandes + 8 Refrigerantes + Brownie',
    emoji: '🎉',
    oldPrice: null,
    price: 169.90,
    badge: 'MAIOR DESCONTO',
    items: [
      { productId: 1, quantity: 3, name: 'Pizzas Grandes (3x)' },
      { productId: 15, quantity: 8, name: 'Refrigerante (8x)' },
      { productId: 19, quantity: 1, name: 'Brownie com Sorvete (1x)' },
    ],
  },
  {
    id: 'c4',
    name: 'Combo Solo',
    description: '1 Burger + Batata Frita + Refri',
    emoji: '🙋',
    oldPrice: null,
    price: 54.90,
    badge: 'ECONOMIZE R$11',
    items: [
      { productId: 7, quantity: 1, name: 'Smash Burger Clássico' },
      { productId: 11, quantity: 1, name: 'Batata Frita Artesanal' },
      { productId: 15, quantity: 1, name: 'Refrigerante Lata' },
    ],
  },
];

/* ════════════════════════════════════════════════════════════
   ESTADO DA APLICAO
   ════════════════════════════════════════════════════════════ */
let cart = [];           // Array de itens no carrinho
let activeCategory = 'all'; // Categoria ativa
let searchTerm = '';        // Termo de busca atual
let searchDisplayTerm = ''; // Termo original exibido ao cliente
let LAST_REMOTE_HASH = '';
let LAST_REMOTE_MANIFEST = '';
let LAST_DATA_API_SYNC_MARK = 0;
let API_SYNC_WARNED = false;
let LOCAL_DEFAULT_DATA_LOADED = false;
let AUTO_SYNC_TIMER = null;
let AUTO_SYNC_IN_FLIGHT = false;
let CATEGORY_NAV_BOUND = false;
let CLEAR_CART_CONFIRM_RESOLVER = null;
let CLEAR_CART_LAST_FOCUSED = null;
let DELIVERY_PIX_NOTICE_LAST_FOCUSED = null;
let PIZZA_COMPOSITION_RESOLVER = null;
let PIZZA_COMPOSITION_LAST_FOCUSED = null;
let PIZZA_SWAP_RESOLVER = null;
let PIZZA_SWAP_LAST_FOCUSED = null;
let ORDER_TYPE = 'retirada';
let CUSTOMER_GEO = null;
let AUTO_LOCATION_REQUESTED = false;
let ORDER_LOGS_QUEUE_FLUSHING = false;
let PIX_RECEIPT = null;
let PIX_RECEIPT_UPLOAD_CACHE = null;
let ORDER_PREVIEW_OPEN = false;
let ORDER_PREVIEW_EDITING = false;

normalizeCatalogEncoding();

function buildRemoteHash(remote) {
  return JSON.stringify({
    config: remote.config || {},
    visual: remote.visual || {},
    orders: remote.orders || {},
    categories: remote.categories || [],
    products: remote.products || [],
    combos: remote.combos || [],
    promotions: remote.promotions || [],
    announcements: remote.announcements || [],
    borders: remote.borders || [],
  });
}

function buildRemoteManifestHash(manifest) {
  const sections = manifest?.sections && typeof manifest.sections === 'object'
    ? manifest.sections
    : null;
  if (!sections) return '';

  return JSON.stringify(Object.keys(sections).sort().map((section) => {
    const item = sections[section] || {};
    return [
      section,
      String(item.updatedAt || ''),
      Number.parseInt(String(item.bytes || 0), 10) || 0,
    ];
  }));
}

function rememberRemoteManifest(manifest) {
  const hash = buildRemoteManifestHash(manifest);
  if (hash) LAST_REMOTE_MANIFEST = hash;
  return hash;
}

function normalizeRemotePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    config: raw.config || {},
    visual: raw.visual || {},
    orders: raw.orders || {},
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    products: Array.isArray(raw.products) ? raw.products : [],
    combos: Array.isArray(raw.combos) ? raw.combos : [],
    promotions: Array.isArray(raw.promotions) ? raw.promotions : [],
    announcements: Array.isArray(raw.announcements) ? raw.announcements : [],
    borders: Array.isArray(raw.borders) ? raw.borders : [],
  };
}

function saveRemoteDataCache(remote) {
  const storage = getLocalStorageSafe();
  if (!storage || !remote || typeof remote !== 'object') return;

  const payload = {
    savedAt: Date.now(),
    data: remote,
  };

  try {
    storage.setItem(REMOTE_DATA_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora erros de quota/privacidade.
  }
}

function clearRemoteDataCache() {
  const storage = getLocalStorageSafe();
  if (!storage) return;

  try {
    storage.removeItem(REMOTE_DATA_CACHE_KEY);
  } catch {
    // Ignora erros de quota/privacidade.
  }
}

function hasMeaningfulRemoteCatalog(remote) {
  if (!remote || typeof remote !== 'object') return false;

  const categories = Array.isArray(remote.categories)
    ? remote.categories.filter((category) => category && typeof category === 'object')
    : [];
  const products = Array.isArray(remote.products)
    ? remote.products.filter((product) => product && typeof product === 'object' && product.active !== false)
    : [];
  const combos = Array.isArray(remote.combos)
    ? remote.combos.filter((combo) => combo && typeof combo === 'object' && combo.active !== false)
    : [];
  const promotions = Array.isArray(remote.promotions)
    ? remote.promotions.filter((promo) => promo && typeof promo === 'object')
    : [];
  const announcements = Array.isArray(remote.announcements)
    ? remote.announcements.filter((announcement) => announcement && typeof announcement === 'object')
    : [];

  return (
    categories.length > 0
    || products.length > 0
    || combos.length > 0
    || promotions.length > 0
    || announcements.length > 0
  );
}

function loadRemoteDataCache() {
  const storage = getLocalStorageSafe();
  if (!storage) return null;

  try {
    const raw = storage.getItem(REMOTE_DATA_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const ageMs = Date.now() - Number(parsed?.savedAt || 0);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > REMOTE_DATA_CACHE_MAX_AGE_MS) {
      storage.removeItem(REMOTE_DATA_CACHE_KEY);
      return null;
    }

    return normalizeRemotePayload(parsed?.data);
  } catch {
    try {
      storage.removeItem(REMOTE_DATA_CACHE_KEY);
    } catch {
      // Ignora erros de quota/privacidade.
    }
    return null;
  }
}

function loadServerBootstrapData() {
  if (typeof window !== 'object' || !window) return null;

  let payload = null;
  const payloadElement = document.getElementById(SERVER_BOOTSTRAP_DATA_KEY);
  if (payloadElement) {
    try {
      payload = JSON.parse(payloadElement.textContent || '{}');
    } catch {
      payload = null;
    }
    payloadElement.remove();
  }
  if (!payload) payload = window[SERVER_BOOTSTRAP_DATA_KEY];
  if (!payload || typeof payload !== 'object') return null;

  const normalized = normalizeRemotePayload(payload.state);
  if (!normalized) return null;

  try {
    delete window[SERVER_BOOTSTRAP_DATA_KEY];
  } catch {
    window[SERVER_BOOTSTRAP_DATA_KEY] = null;
  }

  return {
    data: normalized,
    manifest: payload.manifest || null,
  };
}

function refreshCatalogUi() {
  setupWhatsAppLinks();
  renderAnnouncements();
  renderCombos();
  renderAllProducts();
  reconcileCartWithCatalog();
  updateCartUI();
  filterProducts();
}

async function loadLocalDefaultData({ force = false, timeoutMs = API_BOOTSTRAP_TIMEOUT_MS } = {}) {
  if (LOCAL_DEFAULT_DATA_LOADED && !force) return false;

  for (const endpoint of LOCAL_DEFAULT_DATA_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        cache: 'no-store',
        timeoutMs,
      });
      if (!response.ok) continue;

      const raw = await response.json();
      const normalized = normalizeRemotePayload(raw);
      if (!normalized) continue;

      applyRemoteData(normalized);
      LAST_REMOTE_HASH = buildRemoteHash(normalized);
      LOCAL_DEFAULT_DATA_LOADED = true;
      return true;
    } catch {
      // Tenta o proximo endpoint de fallback.
    }
  }

  return false;
}

function applyRemoteData(remote) {
  if (typeof window !== 'undefined' && window.PizzaBorderUtils?.setPizzaBorderCatalog) {
    window.PizzaBorderUtils.setPizzaBorderCatalog(remote?.borders, { fallbackToDefault: true });
  }
  if (Array.isArray(remote.categories)) {
    CATEGORIES = [...remote.categories];
  }
  if (Array.isArray(remote.products)) {
    PRODUCTS = remote.products
      .filter(p => p && p.active !== false)
      .map(p => ({
        ...p,
        image: (p.image || p.photo || p.img || '').trim(),
      }));
  }
  if (Array.isArray(remote.combos)) {
    COMBOS = remote.combos.filter(c => c && c.active !== false);
  }
  if (Array.isArray(remote.promotions)) {
    PROMOTIONS = remote.promotions.filter(p => p && typeof p === 'object');
  }
  if (Array.isArray(remote.announcements)) {
    ANNOUNCEMENTS = remote.announcements.filter(item => item && typeof item === 'object');
  }

  normalizeCatalogEncoding();
  applyStoreSettings(remote);
  applyCategoryAndSectionLabels();
  applyVisualVisibility();
  renderAnnouncements();
}

function reconcileCartWithCatalog() {
  cart = cart.filter(item => {
    if (item.isHalfPizza) {
      const firstProduct = PRODUCTS.find((product) => String(product.id) === String(item.halfPizzaFirstId || ''));
      const secondProduct = PRODUCTS.find((product) => String(product.id) === String(item.halfPizzaSecondId || ''));
      if (!firstProduct || !secondProduct) return false;
      if (!isPizzaProduct(firstProduct) || !isPizzaProduct(secondProduct)) return false;
      if (!isSamePizzaSize(firstProduct, secondProduct)) return false;

      const quantity = Number.parseInt(item.quantity, 10) || 1;
      const refreshed = buildHalfPizzaCartItem(firstProduct, secondProduct, item.borderSelection);
      Object.assign(item, refreshed, { quantity });
      return true;
    }

    if (item.isCombo) {
      const combo = COMBOS.find(c => String(c.id) === String(item.productId));
      if (!combo) return false;
      item.name = `Combo ${combo.name}`;
      item.price = combo.price;
      item.emoji = combo.emoji;
      return true;
    }

    const product = PRODUCTS.find(p => String(p.id) === String(item.productId));
    if (!product) return false;
    const border = resolvePizzaBorderForProduct(product, item.borderSelection);
    item.name = product.name;
    item.id = cartItemId(product.id, border.id);
    item.price = Number((Number(product.price || 0) + Number(border.price || 0)).toFixed(2));
    item.emoji = product.emoji;
    item.borderSelection = border.id ? border : null;
    item.borderLabel = border.label;
    item.borderPrice = Number(border.price || 0);
    return true;
  });
}

async function loadDataFromApi({ silent = false, timeoutMs = API_SYNC_TIMEOUT_MS } = {}) {
  try {
    const response = await fetchWithTimeout(DATA_API, {
      cache: 'no-store',
      timeoutMs,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    const remote = normalizeRemotePayload(raw);
    if (!remote) throw new Error('Payload de dados inválido');

    const remoteHash = buildRemoteHash(remote);
    const changed = remoteHash !== LAST_REMOTE_HASH;

    saveRemoteDataCache(remote);
    if (changed) {
      LAST_REMOTE_HASH = remoteHash;
      applyRemoteData(remote);
    }

    LOCAL_DEFAULT_DATA_LOADED = false;
    API_SYNC_WARNED = false;
    LAST_DATA_API_SYNC_MARK = Date.now();
    return changed;
  } catch (error) {
    const loadedLocalDefaults = await loadLocalDefaultData({ timeoutMs });
    if (!silent && !API_SYNC_WARNED) {
      API_SYNC_WARNED = true;
      const sourceLabel = loadedLocalDefaults
        ? '/api/default-data'
        : 'dados locais do script.js';
      console.warn(`API indisponivel. Usando fallback de ${sourceLabel}.`, error);
    }
    return loadedLocalDefaults;
  }
}

async function loadDataManifest({ timeoutMs = API_MANIFEST_TIMEOUT_MS } = {}) {
  const response = await fetchWithTimeout(DATA_MANIFEST_API, {
    cache: 'no-store',
    timeoutMs,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function syncDataIfChanged({ silent = false, timeoutMs = API_SYNC_TIMEOUT_MS } = {}) {
  let manifestHash = '';

  try {
    const manifest = await loadDataManifest({
      timeoutMs: Math.min(timeoutMs, API_MANIFEST_TIMEOUT_MS),
    });
    manifestHash = buildRemoteManifestHash(manifest);

    if (manifestHash) {
      if (LAST_REMOTE_MANIFEST && manifestHash === LAST_REMOTE_MANIFEST) return false;
    }
  } catch (error) {
    return loadDataFromApi({ silent, timeoutMs });
  }

  const beforeSyncMark = LAST_DATA_API_SYNC_MARK;
  const changed = await loadDataFromApi({ silent, timeoutMs });
  if (manifestHash && LAST_DATA_API_SYNC_MARK !== beforeSyncMark) {
    LAST_REMOTE_MANIFEST = manifestHash;
  }
  return changed;
}

function startAutoSync({ runNow = true } = {}) {
  if (AUTO_SYNC_TIMER) return;

  const getNextSyncDelay = () => {
    if (!navigator.onLine) return AUTO_SYNC_OFFLINE_INTERVAL_MS;
    if (document.hidden) return AUTO_SYNC_HIDDEN_INTERVAL_MS;
    return AUTO_SYNC_INTERVAL_MS;
  };

  const runAutoSync = async () => {
    if (AUTO_SYNC_IN_FLIGHT) return;
    AUTO_SYNC_IN_FLIGHT = true;

    try {
      const changed = await syncDataIfChanged({ silent: true, timeoutMs: API_SYNC_TIMEOUT_MS });
      if (changed) {
        refreshCatalogUi();
      }
    } finally {
      AUTO_SYNC_IN_FLIGHT = false;
    }
  };

  const scheduleNext = () => {
    const delay = getNextSyncDelay();
    AUTO_SYNC_TIMER = setTimeout(async () => {
      await runAutoSync();
      scheduleNext();
    }, delay);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    runAutoSync();
  });
  window.addEventListener('online', () => runAutoSync());

  if (runNow) runAutoSync();
  scheduleNext();
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;

  if (full.test(trimmed)) return trimmed.toUpperCase();
  if (short.test(trimmed)) {
    const h = trimmed.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function mixHex(baseHex, targetHex, weight = 0.5) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const ratio = Math.max(0, Math.min(1, weight));
  const blend = (from, to) => from + (to - from) * ratio;
  return rgbToHex(
    blend(base.r, target.r),
    blend(base.g, target.g),
    blend(base.b, target.b),
  );
}

function getHexLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? (v / 12.92) : (((v + 0.055) / 1.055) ** 2.4);
  };

  return (0.2126 * toLinear(r))
    + (0.7152 * toLinear(g))
    + (0.0722 * toLinear(b));
}

function pickReadableTextColor(backgroundHex, light = '#FFFFFF', dark = '#1A1A1A') {
  return getHexLuminance(backgroundHex) > 0.56 ? dark : light;
}

function shadeHex(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = percent / 100;
  const target = factor >= 0 ? 255 : 0;
  const blend = (v) => v + (target - v) * Math.abs(factor);
  return rgbToHex(blend(r), blend(g), blend(b));
}

function rgbaFromHex(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyThemeColors(config = {}) {
  const primary = normalizeHexColor(config.colorPrimary, '#C0392B');
  const secondary = normalizeHexColor(config.colorSecondary, '#E67E22');
  const bg = normalizeHexColor(config.colorBg, '#FDF6EC');
  const text = normalizeHexColor(config.colorText, '#1A1A1A');

  const root = document.documentElement;
  const body = document.body;
  const isBgLight = getHexLuminance(bg) >= 0.58;
  const textLum = getHexLuminance(text);
  const primaryRgb = hexToRgb(primary);
  const surface = normalizeHexColor(
    config.colorSurface,
    isBgLight ? shadeHex(bg, 6) : shadeHex(bg, -10),
  );
  const surfaceDark = normalizeHexColor(config.colorSurfaceDark, shadeHex(primary, -54));
  const onSurfaceDark = normalizeHexColor(
    config.colorOnDark,
    pickReadableTextColor(surfaceDark),
  );
  const whatsapp = normalizeHexColor(config.colorWhatsapp, '#25D366');
  const whatsappRgb = hexToRgb(whatsapp);

  root.style.setProperty('--red', primary);
  root.style.setProperty('--red-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
  root.style.setProperty('--red-dark', shadeHex(primary, -20));
  root.style.setProperty('--red-light', shadeHex(primary, 16));
  root.style.setProperty('--orange', secondary);
  root.style.setProperty('--cream', bg);
  root.style.setProperty('--cream-dark', mixHex(bg, text, isBgLight ? 0.08 : 0.16));
  root.style.setProperty('--white', surface);
  root.style.setProperty('--dark', text);
  root.style.setProperty('--dark-2', shadeHex(text, textLum > 0.55 ? -18 : 18));
  root.style.setProperty('--gray', mixHex(text, bg, isBgLight ? 0.42 : 0.32));
  root.style.setProperty('--gray-light', mixHex(bg, text, isBgLight ? 0.14 : 0.22));
  root.style.setProperty('--surface-dark', surfaceDark);
  root.style.setProperty('--surface-dark-2', shadeHex(surfaceDark, 16));
  root.style.setProperty('--surface-dark-accent', shadeHex(surfaceDark, -18));
  root.style.setProperty('--on-surface-dark', onSurfaceDark);
  root.style.setProperty('--on-surface-dark-muted', rgbaFromHex(onSurfaceDark, 0.82));
  root.style.setProperty('--on-surface-dark-soft', rgbaFromHex(onSurfaceDark, 0.62));
  root.style.setProperty('--on-surface-dark-subtle', rgbaFromHex(onSurfaceDark, 0.42));
  root.style.setProperty('--on-surface-dark-10', rgbaFromHex(onSurfaceDark, 0.1));
  root.style.setProperty('--on-surface-dark-20', rgbaFromHex(onSurfaceDark, 0.2));
  root.style.setProperty('--on-surface-dark-25', rgbaFromHex(onSurfaceDark, 0.25));
  root.style.setProperty('--whatsapp', whatsapp);
  root.style.setProperty('--whatsapp-rgb', `${whatsappRgb.r}, ${whatsappRgb.g}, ${whatsappRgb.b}`);
  root.style.setProperty('--whatsapp-dark', shadeHex(whatsapp, -12));
  root.style.setProperty('--on-whatsapp', pickReadableTextColor(whatsapp));
  root.style.setProperty('--shadow-red', `0 4px 20px ${rgbaFromHex(primary, 0.35)}`);

  if (body) {
    body.style.backgroundColor = bg;
    body.style.color = text;
  }
}

function getStoreDisplayName(storeName = CONFIG.storeName) {
  const normalized = fixMojibakeText(String(storeName || '')).trim();
  return normalized || 'Sua Empresa';
}

function buildDefaultFooterText(storeName = CONFIG.storeName) {
  return `© ${new Date().getFullYear()} ${getStoreDisplayName(storeName)}. Todos os direitos reservados.`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return fixMojibakeText(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeImageUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const safeDataImage = /^data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif);base64,[a-z0-9+/=\s]+$/i;
  if (safeDataImage.test(value)) return value;

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:') {
      return parsed.href;
    }
  } catch {
    return '';
  }

  return '';
}

function isDefaultFooterTextForStore(text, storeName = CONFIG.storeName) {
  const normalized = fixMojibakeText(String(text || '')).trim();
  if (!normalized) return false;
  const safeStoreName = escapeRegExp(getStoreDisplayName(storeName));
  const pattern = new RegExp(`^\\s*(?:©\\s*)?\\d{4}\\s+${safeStoreName}\\.\\s+Todos os direitos reservados\\.$`, 'i');
  return pattern.test(normalized);
}

function parseBooleanFlag(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'sim') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'nao') return false;
  }
  return fallback;
}

function normalizeSocialLink(value, type = 'generic') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    // Continua com fallback abaixo.
  }

  if (type === 'instagram') {
    const clean = raw.replace(/^@+/, '').replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '').replace(/^\/+/, '');
    if (!clean) return '';
    return `https://instagram.com/${clean}`;
  }

  if (type === 'facebook') {
    const clean = raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/^\/+/, '');
    if (!clean) return '';
    if (clean.toLowerCase().startsWith('facebook.com/')) return `https://${clean}`;
    return `https://facebook.com/${clean}`;
  }

  return '';
}

function findFooterInfoSection(keyword) {
  const needle = String(keyword || '').toLowerCase();
  return [...document.querySelectorAll('.footer-info')]
    .find((el) => String(el.querySelector('h4')?.textContent || '').toLowerCase().includes(needle)) || null;
}

function ensureFooterDefaultsCaptured() {
  const contactSection = findFooterInfoSection('contato');
  if (contactSection && DEFAULT_CONTACT_LINES === null) {
    DEFAULT_CONTACT_LINES = [...contactSection.querySelectorAll('p')]
      .map((line) => fixMojibakeText(String(line.textContent || '')).trim());
  }

  const addressSection = findFooterInfoSection('onde');
  if (addressSection && DEFAULT_ADDRESS_HTML === null) {
    const addressParagraph = addressSection.querySelector('p');
    DEFAULT_ADDRESS_HTML = addressParagraph ? addressParagraph.innerHTML : '';
  }

  const scheduleSection = findFooterInfoSection('funcionamento');
  if (scheduleSection && DEFAULT_SCHEDULE_LINES === null) {
    DEFAULT_SCHEDULE_LINES = [...scheduleSection.querySelectorAll('p')]
      .map((line) => fixMojibakeText(String(line.textContent || '')).trim())
      .filter(Boolean);
  }

  const footerSlogan = document.querySelector('.footer-slogan');
  if (footerSlogan && DEFAULT_FOOTER_SLOGAN_TEXT === null) {
    DEFAULT_FOOTER_SLOGAN_TEXT = String(footerSlogan.textContent || '').trim();
  }

  const promoBannerText = document.querySelector('#promoBanner span');
  if (promoBannerText && DEFAULT_PROMO_BANNER_TEXT === null) {
    DEFAULT_PROMO_BANNER_TEXT = String(promoBannerText.textContent || '').trim();
  }

  const heroBadge = document.querySelector('.hero-badge');
  if (heroBadge && DEFAULT_HERO_BADGE_TEXT === null) {
    DEFAULT_HERO_BADGE_TEXT = String(heroBadge.textContent || '').trim();
  }

  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle && (DEFAULT_HERO_TITLE_LINE1 === null || DEFAULT_HERO_TITLE_LINE2 === null)) {
    const textLines = String(heroTitle.innerText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    DEFAULT_HERO_TITLE_LINE1 = textLines[0] || 'Sabor que';
    DEFAULT_HERO_TITLE_LINE2 = textLines[1] || 'você não esquece';
  }

  const heroSub = document.querySelector('.hero-sub');
  if (heroSub && DEFAULT_HERO_SUB_TEXT === null) {
    DEFAULT_HERO_SUB_TEXT = String(heroSub.textContent || '').trim();
  }

  const heroCta = document.querySelector('.hero-cta .btn-primary');
  if (heroCta && DEFAULT_HERO_CTA_TEXT === null) {
    DEFAULT_HERO_CTA_TEXT = String(heroCta.textContent || '').trim();
  }

  const heroInfoSpans = [...document.querySelectorAll('.hero-info span')];
  if (heroInfoSpans.length >= 3 && DEFAULT_HERO_INFO_TEXTS === null) {
    const cleanLeadingIcon = (text) => String(text || '').trim().replace(/^[^\p{L}\p{N}]+/u, '').trim();
    DEFAULT_HERO_INFO_TEXTS = {
      deliveryTime: cleanLeadingIcon(heroInfoSpans[0]?.textContent || ''),
      rating: String(heroInfoSpans[1]?.textContent || '').trim(),
      freeDelivery: cleanLeadingIcon(heroInfoSpans[2]?.textContent || ''),
    };
  }

  const footerSocials = document.querySelector('.footer-socials');
  if (footerSocials && DEFAULT_FOOTER_SOCIAL_LINKS === null) {
    DEFAULT_FOOTER_SOCIAL_LINKS = [...footerSocials.querySelectorAll('a')]
      .map((link) => ({
        href: String(link.getAttribute('href') || '#'),
        title: String(link.getAttribute('title') || '').trim(),
      }));
  }
}

function renderFooterAddress(config) {
  const addressSection = findFooterInfoSection('onde');
  if (!addressSection) return;
  const addressParagraph = addressSection.querySelector('p');
  if (!addressParagraph) return;

  const street = String(config.street || '').trim();
  const number = String(config.number || '').trim();
  const neighborhood = String(config.neighborhood || '').trim();
  const city = String(config.city || '').trim();
  const state = String(config.state || '').trim();
  const cep = String(config.cep || '').trim();

  const line1 = [street, number].filter(Boolean).join(', ');
  const cityState = [city, state].filter(Boolean).join('/');
  const line2 = [neighborhood, cityState].filter(Boolean).join(' - ');
  const line3 = cep ? `CEP ${cep}` : '';
  const lines = [line1, line2, line3].filter(Boolean);

  if (lines.length === 0) {
    if (DEFAULT_ADDRESS_HTML) addressParagraph.innerHTML = DEFAULT_ADDRESS_HTML;
    return;
  }

  addressParagraph.innerHTML = lines.map((line) => escapeHtml(line)).join('<br/>');
}

function renderFooterSchedule(config) {
  const scheduleSection = findFooterInfoSection('funcionamento');
  if (!scheduleSection) return;

  const socials = scheduleSection.querySelector('.footer-socials');
  const rawSchedule = Array.isArray(config.schedule) ? config.schedule : [];
  const lines = [];

  rawSchedule.forEach((entry) => {
    const day = String(entry?.day || '').trim();
    if (!day) return;
    const open = normalizeTimeValue(entry?.open) || ORDER_SETTINGS.openTime;
    const close = normalizeTimeValue(entry?.close) || ORDER_SETTINGS.closeTime;
    if (entry?.active === false) {
      lines.push(`${day}: Fechado`);
      return;
    }
    lines.push(`${day}: ${open} as ${close}`);
  });

  if (lines.length === 0) {
    if (DEFAULT_SCHEDULE_LINES && DEFAULT_SCHEDULE_LINES.length) {
      lines.push(...DEFAULT_SCHEDULE_LINES);
    } else {
      lines.push(`Segunda a Domingo: ${ORDER_SETTINGS.openTime} as ${ORDER_SETTINGS.closeTime}`);
    }
  }

  scheduleSection.querySelectorAll('p').forEach((line) => line.remove());
  lines.forEach((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    scheduleSection.insertBefore(p, socials || null);
  });
}

function applyFooterSocialLinks(config) {
  const footerSocials = document.querySelector('.footer-socials');
  if (!footerSocials) return;

  const links = [...footerSocials.querySelectorAll('a')];
  if (links.length === 0) return;

  const instagramHref = normalizeSocialLink(config.instagram, 'instagram');
  const facebookHref = normalizeSocialLink(config.facebook, 'facebook');

  const applyLink = (link, href, fallback) => {
    if (!link) return;
    const safeHref = href || fallback || '#';
    link.setAttribute('href', safeHref);
    if (safeHref === '#') {
      link.removeAttribute('target');
      link.removeAttribute('rel');
      return;
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  };

  const fallbackInstagram = DEFAULT_FOOTER_SOCIAL_LINKS?.[0]?.href || '#';
  const fallbackFacebook = DEFAULT_FOOTER_SOCIAL_LINKS?.[1]?.href || '#';
  applyLink(links[0], instagramHref, fallbackInstagram);
  applyLink(links[1], facebookHref, fallbackFacebook);
}

function applyOrderRuntimeSettings() {
  const localConsumptionInput = document.getElementById('localConsumptionTime');
  if (localConsumptionInput) {
    localConsumptionInput.min = ORDER_SETTINGS.openTime;
    localConsumptionInput.max = ORDER_SETTINGS.closeTime;
  }

  const deliveryAddressInput = document.getElementById('deliveryAddress');
  if (deliveryAddressInput) {
    if (DEFAULT_DELIVERY_PLACEHOLDER === null) {
      DEFAULT_DELIVERY_PLACEHOLDER = String(deliveryAddressInput.getAttribute('placeholder') || '').trim()
        || 'Rua, número, bairro e referência';
    }

    const neighborhoods = Array.isArray(ORDER_SETTINGS.neighborhoods) ? ORDER_SETTINGS.neighborhoods : [];
    if (neighborhoods.length > 0) {
      const preview = neighborhoods.slice(0, 4).join(', ');
      const suffix = neighborhoods.length > 4 ? '...' : '';
      deliveryAddressInput.setAttribute(
        'placeholder',
        `${DEFAULT_DELIVERY_PLACEHOLDER} (Bairros: ${preview}${suffix})`,
      );
    } else {
      deliveryAddressInput.setAttribute('placeholder', DEFAULT_DELIVERY_PLACEHOLDER);
    }
  }

  const sendOrderButton = document.getElementById('btnSendOrder');
  if (sendOrderButton) {
    const storeOpen = ORDER_SETTINGS.storeOpen !== false;
    sendOrderButton.disabled = !storeOpen;
    sendOrderButton.classList.toggle('is-disabled', !storeOpen);
    if (storeOpen) {
      sendOrderButton.removeAttribute('title');
    } else {
      sendOrderButton.setAttribute('title', ORDER_SETTINGS.closedMsg || DEFAULT_ORDER_SETTINGS.closedMsg);
    }
  }
}

function applyStoreSettings(remote) {
  const config = normalizeTextDeep(remote.config || {});
  const orders = normalizeTextDeep(remote.orders || {});
  const visual = normalizeTextDeep(remote.visual || {});
  VISUAL_SETTINGS = visual;

  const deliveryFee = Number(orders.deliveryFee);
  const freeDeliveryAt = Number(orders.freeDeliveryAt);
  const minValue = Number(orders.minValue);

  const normalizedNeighborhoods = Array.isArray(orders.neighborhoods)
    ? orders.neighborhoods
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    : [];

  ORDER_SETTINGS = {
    ...DEFAULT_ORDER_SETTINGS,
    ...ORDER_SETTINGS,
    greeting: String(orders.greeting || '').trim() || DEFAULT_ORDER_SETTINGS.greeting,
    msgTemplate: sanitizeOrderTemplateSetting(orders.msgTemplate) || DEFAULT_ORDER_SETTINGS.msgTemplate,
    minValue: Number.isFinite(minValue) ? Math.max(0, minValue) : ORDER_SETTINGS.minValue,
    storeOpen: parseBooleanFlag(orders.storeOpen, true),
    closedMsg: String(orders.closedMsg || '').trim() || DEFAULT_ORDER_SETTINGS.closedMsg,
    openTime: normalizeTimeValue(orders.openTime) || DEFAULT_ORDER_SETTINGS.openTime,
    closeTime: normalizeTimeValue(orders.closeTime) || DEFAULT_ORDER_SETTINGS.closeTime,
    neighborhoods: normalizedNeighborhoods,
  };

  CONFIG = {
    ...CONFIG,
    storeName: String(config.storeName || '').trim() || CONFIG.storeName,
    whatsappNumber: String(orders.whatsapp || config.whatsapp || '').trim() || CONFIG.whatsappNumber,
    deliveryFee: Number.isFinite(deliveryFee) ? Math.max(0, deliveryFee) : CONFIG.deliveryFee,
    freeDeliveryAt: Number.isFinite(freeDeliveryAt) ? Math.max(0, freeDeliveryAt) : CONFIG.freeDeliveryAt,
    pixKey: String(orders.pixKey || '').trim(),
  };

  ensureFooterDefaultsCaptured();

  const storeName = getStoreDisplayName(CONFIG.storeName);
  document.title = `${storeName} - Cardapio`;

  const brandTitle = document.getElementById('brandStoreName') || document.querySelector('.brand-text h1');
  if (brandTitle) brandTitle.textContent = storeName;

  const footerStoreName = document.getElementById('footerStoreName') || document.querySelector('.footer-brand h3');
  if (footerStoreName) footerStoreName.textContent = storeName;

  const footerCopyright = document.getElementById('footerCopyright') || document.querySelector('.footer-bottom p');
  const rawFooterText = String(config.footerText || '').trim();
  const isLegacyDefaultFooter = isDefaultFooterTextForStore(rawFooterText, 'Bella Forno');
  const isDefaultForCurrentStore = isDefaultFooterTextForStore(rawFooterText, storeName);
  const isGenericDefaultFooter = /^\s*(?:©\s*)?\d{4}\s+.+\.\s+Todos os direitos reservados\.$/i.test(rawFooterText);
  const hasCurrentStoreName = new RegExp(escapeRegExp(storeName), 'i').test(rawFooterText);
  const shouldUseDefaultFooter = !rawFooterText
    || isLegacyDefaultFooter
    || isDefaultForCurrentStore
    || (isGenericDefaultFooter && !hasCurrentStoreName);
  const footerText = shouldUseDefaultFooter
    ? buildDefaultFooterText(storeName)
    : rawFooterText;
  if (footerCopyright) footerCopyright.textContent = footerText;

  const footerSlogan = document.querySelector('.footer-slogan');
  if (footerSlogan) {
    const nextSlogan = String(config.slogan || '').trim();
    footerSlogan.textContent = nextSlogan
      ? `"${nextSlogan}"`
      : (DEFAULT_FOOTER_SLOGAN_TEXT || '');
  }

  const contactSection = findFooterInfoSection('contato');
  if (contactSection) {
    const lines = [...contactSection.querySelectorAll('p')];
    const phone = String(config.phone || '').trim();
    const email = String(config.email || '').trim();
    if (lines[0]) lines[0].textContent = phone || DEFAULT_CONTACT_LINES?.[0] || '';
    if (lines[1]) lines[1].textContent = email || DEFAULT_CONTACT_LINES?.[1] || '';
  }

  renderFooterAddress(config);
  renderFooterSchedule(config);
  applyFooterSocialLinks(config);

  const promoBannerText = document.querySelector('#promoBanner span');
  if (promoBannerText) {
    promoBannerText.textContent = String(visual.promoBannerText || '').trim()
      || DEFAULT_PROMO_BANNER_TEXT
      || String(promoBannerText.textContent || '').trim();
  }

  const heroBadge = document.querySelector('.hero-badge');
  if (heroBadge) {
    heroBadge.textContent = String(visual.heroBadge || '').trim()
      || DEFAULT_HERO_BADGE_TEXT
      || String(heroBadge.textContent || '').trim();
  }

  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle) {
    const line1 = String(visual.heroTitle1 || '').trim() || DEFAULT_HERO_TITLE_LINE1 || 'Sabor que';
    const line2 = String(visual.heroTitle2 || '').trim() || DEFAULT_HERO_TITLE_LINE2 || 'você não esquece';
    heroTitle.textContent = '';
    heroTitle.appendChild(document.createTextNode(line1));
    heroTitle.appendChild(document.createElement('br'));
    const em = document.createElement('em');
    em.textContent = line2;
    heroTitle.appendChild(em);
  }

  const heroSub = document.querySelector('.hero-sub');
  if (heroSub) {
    heroSub.textContent = String(visual.heroSubtitle || '').trim()
      || DEFAULT_HERO_SUB_TEXT
      || String(heroSub.textContent || '').trim();
  }

  const heroCta = document.querySelector('.hero-cta .btn-primary');
  if (heroCta) {
    heroCta.textContent = String(visual.heroCta || '').trim()
      || DEFAULT_HERO_CTA_TEXT
      || String(heroCta.textContent || '').trim();
  }

  const heroInfoSpans = document.querySelectorAll('.hero-info span');
  if (heroInfoSpans[0]) {
    const deliveryTime = String(visual.deliveryTime || '').trim() || DEFAULT_HERO_INFO_TEXTS?.deliveryTime || '';
    heroInfoSpans[0].textContent = `⏱ ${deliveryTime}`;
  }
  if (heroInfoSpans[1]) {
    heroInfoSpans[1].textContent = String(visual.rating || '').trim()
      || DEFAULT_HERO_INFO_TEXTS?.rating
      || String(heroInfoSpans[1].textContent || '').trim();
  }
  if (heroInfoSpans[2]) {
    const freeDelivery = String(visual.freeDelivery || '').trim() || DEFAULT_HERO_INFO_TEXTS?.freeDelivery || '';
    heroInfoSpans[2].textContent = `🛵 ${freeDelivery}`;
  }
  applyHeroFloatingTag(visual);
  applyHeroFloatingMedia(visual);

  applyThemeColors(config);
  applyBrandMedia(config);
  applyOrderRuntimeSettings();
  updatePixBoxUI();
}

let DEFAULT_BRAND_LOGO_HTML = null;
let DEFAULT_FOOTER_LOGO_HTML = null;
let DEFAULT_HERO_PIZZA_HTML = null;
let DEFAULT_HERO_TAG1_NAME = null;
let DEFAULT_HERO_TAG1_PRICE = null;
let DEFAULT_CONTACT_LINES = null;
let DEFAULT_ADDRESS_HTML = null;
let DEFAULT_SCHEDULE_LINES = null;
let DEFAULT_FOOTER_SLOGAN_TEXT = null;
let DEFAULT_PROMO_BANNER_TEXT = null;
let DEFAULT_HERO_BADGE_TEXT = null;
let DEFAULT_HERO_TITLE_LINE1 = null;
let DEFAULT_HERO_TITLE_LINE2 = null;
let DEFAULT_HERO_SUB_TEXT = null;
let DEFAULT_HERO_CTA_TEXT = null;
let DEFAULT_HERO_INFO_TEXTS = null;
let DEFAULT_FOOTER_SOCIAL_LINKS = null;
let DEFAULT_DELIVERY_PLACEHOLDER = null;

function renderLogoImage(target, src, className, alt, onErrorFallback) {
  if (!target) return;
  target.innerHTML = '';
  const safeSrc = sanitizeImageUrl(src);
  if (!safeSrc) {
    onErrorFallback?.();
    return;
  }
  const img = document.createElement('img');
  img.className = className;
  img.alt = alt;
  img.loading = 'eager';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => onErrorFallback?.();
  img.src = safeSrc;
  target.appendChild(img);
}

function applyHeroFloatingTag(visual) {
  const tag1 = document.querySelector('.float-tag.tag-1');
  if (!tag1) return;

  if (DEFAULT_HERO_TAG1_NAME === null || DEFAULT_HERO_TAG1_PRICE === null) {
    const strong = tag1.querySelector('strong');
    const defaultPrice = String(strong.textContent || '').trim();
    const fullText = String(tag1.textContent || '').trim();
    const defaultName = fullText.replace(defaultPrice, '').trim();
    DEFAULT_HERO_TAG1_NAME = defaultName || 'Pizza Margherita';
    DEFAULT_HERO_TAG1_PRICE = defaultPrice || 'R$ 52,90';
  }

  const name = String(visual.heroFloatingName || '').trim() || DEFAULT_HERO_TAG1_NAME;
  const price = String(visual.heroFloatingPrice || '').trim() || DEFAULT_HERO_TAG1_PRICE;

  tag1.innerHTML = '';
  tag1.appendChild(document.createTextNode(name));
  tag1.appendChild(document.createElement('br'));
  const strong = document.createElement('strong');
  strong.textContent = price;
  tag1.appendChild(strong);
}

function applyHeroFloatingMedia(visual) {
  const heroPizza = document.querySelector('.hero-pizza');
  if (!heroPizza) return;

  if (DEFAULT_HERO_PIZZA_HTML === null) {
    DEFAULT_HERO_PIZZA_HTML = heroPizza.innerHTML;
  }

  const floatingSrc = sanitizeImageUrl(visual.heroFloatingImage || visual.heroPizzaImage || '');
  if (!floatingSrc) {
    heroPizza.classList.remove('has-image');
    if (DEFAULT_HERO_PIZZA_HTML !== null) {
      heroPizza.innerHTML = DEFAULT_HERO_PIZZA_HTML;
    }
    return;
  }

  heroPizza.classList.add('has-image');
  heroPizza.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'hero-pizza-image';
  img.alt = 'Imagem destaque do banner';
  img.loading = 'eager';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = floatingSrc;
  img.onerror = () => {
    heroPizza.classList.remove('has-image');
    if (DEFAULT_HERO_PIZZA_HTML !== null) {
      heroPizza.innerHTML = DEFAULT_HERO_PIZZA_HTML;
    }
  };
  heroPizza.appendChild(img);
}

function applyBrandMedia(config) {
  const brandLogo = document.querySelector('.brand-logo');
  const footerLogo = document.querySelector('.footer-logo');
  const heroSection = document.querySelector('.hero-section');

  if (brandLogo && DEFAULT_BRAND_LOGO_HTML === null) {
    DEFAULT_BRAND_LOGO_HTML = brandLogo.innerHTML;
  }
  if (footerLogo && DEFAULT_FOOTER_LOGO_HTML === null) {
    DEFAULT_FOOTER_LOGO_HTML = footerLogo.innerHTML;
  }

  const logoSrc = sanitizeImageUrl(config.logo || '');
  const bannerSrc = sanitizeImageUrl(config.banner || '');

  if (brandLogo) {
    if (logoSrc) {
      brandLogo.classList.add('has-image');
      renderLogoImage(
        brandLogo,
        logoSrc,
        'brand-logo-image',
        'Logo da loja',
        () => {
          brandLogo.classList.remove('has-image');
          if (DEFAULT_BRAND_LOGO_HTML !== null) brandLogo.innerHTML = DEFAULT_BRAND_LOGO_HTML;
        },
      );
    } else if (DEFAULT_BRAND_LOGO_HTML !== null) {
      brandLogo.classList.remove('has-image');
      brandLogo.innerHTML = DEFAULT_BRAND_LOGO_HTML;
    }
  }

  if (footerLogo) {
    if (logoSrc) {
      footerLogo.classList.add('has-image');
      renderLogoImage(
        footerLogo,
        logoSrc,
        'footer-logo-image',
        'Logo da loja',
        () => {
          footerLogo.classList.remove('has-image');
          if (DEFAULT_FOOTER_LOGO_HTML !== null) footerLogo.innerHTML = DEFAULT_FOOTER_LOGO_HTML;
        },
      );
    } else {
      footerLogo.classList.remove('has-image');
      if (DEFAULT_FOOTER_LOGO_HTML !== null) {
        footerLogo.innerHTML = DEFAULT_FOOTER_LOGO_HTML;
      }
    }
  }

  if (heroSection) {
    if (bannerSrc) {
      heroSection.style.backgroundImage = `linear-gradient(rgba(15, 8, 5, 0.78), rgba(15, 8, 5, 0.78)), url("${encodeURI(bannerSrc)}")`;
      heroSection.style.backgroundSize = 'cover';
      heroSection.style.backgroundPosition = 'center';
    } else {
      heroSection.style.removeProperty('background-image');
      heroSection.style.removeProperty('background-size');
      heroSection.style.removeProperty('background-position');
    }
  }
}

function getOrderedActiveCategories() {
  const activeCategories = [...CATEGORIES].filter(cat => cat && cat.active !== false);
  const normalized = activeCategories.map((cat, index) => {
    const rawOrder = Number(cat.order);
    const validOrder = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.trunc(rawOrder) : null;
    return { cat, index, order: validOrder };
  });

  const usedOrders = new Set();
  let highestOrder = 0;

  normalized.forEach(item => {
    if (item.order === null) return;
    if (usedOrders.has(item.order)) {
      item.order = null;
      return;
    }
    usedOrders.add(item.order);
    if (item.order > highestOrder) highestOrder = item.order;
  });

  normalized.forEach(item => {
    if (item.order !== null) return;
    highestOrder += 1;
    while (usedOrders.has(highestOrder)) highestOrder += 1;
    item.order = highestOrder;
    usedOrders.add(item.order);
  });

  return normalized
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(item => ({ ...item.cat, order: item.order }));
}

function normalizeCategoryIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function resolveVisualFlagForCategory(category, index = 0) {
  const searchable = `${normalizeCategoryIdentity(category?.id)} ${normalizeCategoryIdentity(category?.name)}`;
  if (searchable.includes('pizza')) return 'secPizzas';
  if (searchable.includes('hamb') || searchable.includes('burger') || searchable.includes('lanche')) return 'secHamb';
  if (searchable.includes('porcao') || searchable.includes('acomp') || searchable.includes('frita')) return 'secPorcoes';
  if (
    searchable.includes('bebida')
    || searchable.includes('drink')
    || searchable.includes('suco')
    || searchable.includes('refrigerante')
    || searchable.includes('agua')
  ) {
    return 'secBebidas';
  }
  if (searchable.includes('sobremesa') || searchable.includes('doce') || searchable.includes('dessert')) {
    return 'secSobremesas';
  }

  const fallbackByOrder = ['secPizzas', 'secHamb', 'secPorcoes', 'secBebidas', 'secSobremesas'];
  return fallbackByOrder[index] || '';
}

function buildCategoryVisualFlagMap(categories) {
  const nextMap = new Map();
  (Array.isArray(categories) ? categories : []).forEach((category, index) => {
    const key = String(category?.id || '').trim();
    if (!key) return;
    const flag = resolveVisualFlagForCategory(category, index);
    if (flag) nextMap.set(key, flag);
  });
  return nextMap;
}

function applyCategoryAndSectionLabels() {
  const menuMain = document.getElementById('menuMain');
  const categoriesScroll = document.querySelector('.categories-scroll');
  const activeCategories = getOrderedActiveCategories();
  CATEGORY_VISUAL_FLAG_BY_ID = buildCategoryVisualFlagMap(activeCategories);
  const activeCategoryIds = new Set(activeCategories.map(cat => String(cat.id)));
  const orderedSections = [];

  if (categoriesScroll) {
    const combosBtn = categoriesScroll.querySelector('.cat-btn[data-category="combos"]');

    activeCategories.forEach(cat => {
      const key = String(cat.id);
      let btn = null;
      categoriesScroll.querySelectorAll('.cat-btn').forEach((candidate) => {
        if (!btn && String(candidate.dataset.category || '') === key) {
          btn = candidate;
        }
      });
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'cat-btn';
        btn.dataset.category = key;
      }
      btn.style.display = '';
      btn.textContent = `${cat.icon || '🍽️'} ${cat.name || key}`;
      if (combosBtn) categoriesScroll.insertBefore(btn, combosBtn);
      else categoriesScroll.appendChild(btn);
    });

    categoriesScroll.querySelectorAll('.cat-btn').forEach(btn => {
      const key = btn.dataset.category;
      if (key === 'all' || key === 'combos') return;
      if (!activeCategoryIds.has(String(key))) {
        btn.style.display = 'none';
      }
    });
  }

  activeCategories.forEach(cat => {
    const key = String(cat.id);
    let section = null;
    document.querySelectorAll('.menu-section').forEach((candidate) => {
      if (!section && String(candidate.dataset.section || '') === key) {
        section = candidate;
      }
    });
    if (!section && menuMain) {
      const safeKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      section = document.createElement('section');
      section.className = 'menu-section';
      section.dataset.section = key;
      section.dataset.dynamic = 'true';
      section.innerHTML = `
        <div class="section-header">
          <h2 class="section-title"></h2>
          <p class="section-sub">Confira nossos produtos dessa categoria</p>
        </div>
        <div class="products-grid" id="grid-${safeKey}"></div>
      `;
      menuMain.appendChild(section);
    }
    if (section && menuMain) orderedSections.push(section);
    section.dataset.enabled = 'true';
    const title = section.querySelector('.section-title');
    if (title) title.textContent = `${cat.icon || '🍽️'} ${cat.name || key}`;
    const subtitle = section.querySelector('.section-sub');
    if (subtitle) {
      const currentSubtitle = fixMojibakeText(String(subtitle.textContent || '').trim());
      if (!section.dataset.defaultSubtitle && currentSubtitle) {
        section.dataset.defaultSubtitle = currentSubtitle;
      }
      const defaultSubtitle = section.dataset.defaultSubtitle || 'Confira nossos produtos dessa categoria';
      const categorySubtitle = fixMojibakeText(String(cat.description || '').trim());
      subtitle.textContent = categorySubtitle || defaultSubtitle;
    }
  });

  if (menuMain) {
    orderedSections.forEach(section => menuMain.appendChild(section));
  }

  document.querySelectorAll('.menu-section').forEach(section => {
    const key = String(section.dataset.section || '');
    if (!activeCategoryIds.has(key)) {
      section.dataset.enabled = 'false';
    }
  });

  if (activeCategory !== 'all' && activeCategory !== 'combos' && !activeCategoryIds.has(String(activeCategory))) {
    activeCategory = 'all';
  }

  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  let activeBtn = null;
  document.querySelectorAll('.cat-btn').forEach((btn) => {
    if (!activeBtn && String(btn.dataset.category || '') === String(activeCategory)) {
      activeBtn = btn;
    }
  });
  if (!activeBtn) {
    activeBtn = document.querySelector('.cat-btn[data-category="all"]');
  }
  if (activeBtn) activeBtn.classList.add('active');
}

function applyVisualVisibility() {
  const promoBanner = document.getElementById('promoBanner');
  if (promoBanner) {
    const enabled = VISUAL_SETTINGS.promoBannerActive !== false && VISUAL_SETTINGS.secPromoBanner !== false;
    promoBanner.style.display = enabled ? '' : 'none';
  }

  const heroSection = document.querySelector('.hero-section');
  if (heroSection) {
    heroSection.style.display = VISUAL_SETTINGS.secHero === false ? 'none' : '';
  }

  const combosSection = document.getElementById('combos-section');
  if (combosSection) {
    combosSection.dataset.enabled = VISUAL_SETTINGS.secCombos === false ? 'false' : 'true';
  }

  const visualSectionFlags = {
    pizzas: 'secPizzas',
    hamburgueres: 'secHamb',
    porcoes: 'secPorcoes',
    bebidas: 'secBebidas',
    sobremesas: 'secSobremesas',
  };

  document.querySelectorAll('.menu-section').forEach(section => {
    const key = String(section.dataset.section || '').trim();
    const flag = CATEGORY_VISUAL_FLAG_BY_ID.get(key) || visualSectionFlags[key];
    const isVisibleBySettings = !flag || VISUAL_SETTINGS[flag] !== false;
    const isVisibleByCategory = section.dataset.enabled !== 'false';
    section.dataset.enabled = isVisibleByCategory && isVisibleBySettings ? 'true' : 'false';
  });
}

/* ════════════════════════════════════════════════════════════
   UTILITÁRIOS
   ════════════════════════════════════════════════════════════ */

function getClosedAnnouncementKeys() {
  const storage = getLocalStorageSafe();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(CLOSED_ANNOUNCEMENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveClosedAnnouncementKeys(keys) {
  const storage = getLocalStorageSafe();
  if (!storage) return;

  try {
    storage.setItem(CLOSED_ANNOUNCEMENTS_KEY, JSON.stringify([...new Set(keys)].slice(-80)));
  } catch {
    // Ignora erros de quota/privacidade.
  }
}

function getAnnouncementDismissKey(item) {
  const raw = [
    item?.id || '',
    item?.title || '',
    item?.description || '',
    item?.image || '',
    item?.buttonLabel || '',
    item?.buttonUrl || '',
    item?.startDate || '',
    item?.endDate || '',
  ].join('|');

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `${String(item?.id || 'announcement')}:${Math.abs(hash)}`;
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAnnouncementInDateRange(item) {
  const today = getTodayIsoDate();
  const start = String(item?.startDate || '').trim();
  const end = String(item?.endDate || '').trim();
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

function sanitizeAnnouncementUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#') || raw.startsWith('/')) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isPwaInstallAction(value) {
  return String(value || '').trim().toLowerCase() === PWA_INSTALL_ACTION;
}

function isPwaInstalled() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || navigator.standalone === true
  );
}

function getPwaInstallGuideHost() {
  let host = document.getElementById('pwaInstallGuide');
  if (host) return host;

  host = document.createElement('div');
  host.id = 'pwaInstallGuide';
  host.className = 'pwa-install-guide';
  host.addEventListener('click', (event) => {
    if (event.target === host) closePwaInstallGuide();
  });
  document.body.appendChild(host);
  return host;
}

function closePwaInstallGuide() {
  const host = document.getElementById('pwaInstallGuide');
  if (!host) return;
  host.classList.remove('show');
  host.setAttribute('aria-hidden', 'true');
}

function openPwaInstallGuide() {
  const host = getPwaInstallGuideHost();
  const userAgent = String(navigator.userAgent || '');
  const isIos = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(userAgent);

  const steps = isIos
    ? [
      'Abra este cardápio no Safari.',
      'Toque em Compartilhar (o quadrado com a seta para cima).',
      'Escolha “Adicionar à Tela de Início” e confirme em “Adicionar”.',
    ]
    : isAndroid
      ? [
        'Abra o menu do navegador (os três pontos).',
        'Toque em “Instalar aplicativo” ou “Adicionar à tela inicial”.',
        'Confirme a instalação.',
      ]
      : [
        'Abra o menu do navegador.',
        'Procure “Instalar aplicativo” ou “Adicionar à tela inicial”.',
        'Confirme para criar o atalho da Morada da Pizza.',
      ];

  host.innerHTML = `
    <section class="pwa-install-guide-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallGuideTitle">
      <button class="pwa-install-guide-close" type="button" onclick="closePwaInstallGuide()" aria-label="Fechar">×</button>
      <div class="pwa-install-guide-icon">📲</div>
      <h3 id="pwaInstallGuideTitle">Instale a Morada da Pizza</h3>
      <p>Tenha o cardápio sempre à mão e faça seu pedido mais rápido.</p>
      <ol>
        ${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
      <button class="pwa-install-guide-ok" type="button" onclick="closePwaInstallGuide()">Entendi</button>
    </section>
  `;
  host.setAttribute('aria-hidden', 'false');
  host.classList.add('show');
}

async function installMoradaApp() {
  if (isPwaInstalled()) {
    showToast('O aplicativo já está instalado neste aparelho.', 3200);
    return;
  }

  const promptEvent = PWA_INSTALL_PROMPT;
  if (!promptEvent) {
    openPwaInstallGuide();
    return;
  }

  PWA_INSTALL_PROMPT = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') {
      showToast('Instalação confirmada!', 3000);
    }
  } catch (error) {
    console.warn('O instalador nativo nao ficou disponivel.', error);
    openPwaInstallGuide();
  }
}

function getAnnouncementHost() {
  let host = document.getElementById('announcementHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'announcementHost';
    host.className = 'announcement-host';
    document.body.appendChild(host);
  }

  if (host.dataset.bound !== 'true') {
    host.dataset.bound = 'true';
    host.addEventListener('click', (event) => {
      if (event.target === host && host.dataset.dismissKey) {
        closeAnnouncement(host.dataset.dismissKey);
      }
    });
  }

  return host;
}

function closeAnnouncement(dismissKey) {
  const keys = getClosedAnnouncementKeys();
  keys.push(String(dismissKey || ''));
  saveClosedAnnouncementKeys(keys);
  renderAnnouncements();
}

function renderAnnouncements() {
  const host = getAnnouncementHost();
  const closedKeys = new Set(getClosedAnnouncementKeys());
  const candidates = (Array.isArray(ANNOUNCEMENTS) ? ANNOUNCEMENTS : [])
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.active !== false)
    .filter((item) => Boolean(sanitizeImageUrl(item.image)))
    .filter(isAnnouncementInDateRange)
    .filter((item) => !(isPwaInstallAction(item.buttonUrl) && isPwaInstalled()))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const current = candidates.find((item) => !closedKeys.has(getAnnouncementDismissKey(item)));
  if (!current) {
    host.innerHTML = '';
    host.classList.remove('show');
    delete host.dataset.dismissKey;
    return;
  }

  const isOtherModalOpen = Boolean(
    document.querySelector('dialog[open], .modal.show, [role="alertdialog"], .cookie-banner, .consent-banner, #privacyModal.show, #privacyDialog[open]')
  );
  if (isOtherModalOpen) {
    setTimeout(renderAnnouncements, 1200);
    return;
  }

  const dismissKey = getAnnouncementDismissKey(current);
  host.dataset.dismissKey = dismissKey;
  const safeImage = sanitizeImageUrl(current.image);
  const title = fixMojibakeText(String(current.title || '').trim());
  const description = fixMojibakeText(String(current.description || '').trim());
  const buttonLabel = fixMojibakeText(String(current.buttonLabel || '').trim());
  const installAction = isPwaInstallAction(current.buttonUrl);
  const buttonUrl = installAction ? PWA_INSTALL_ACTION : sanitizeAnnouncementUrl(current.buttonUrl);
  const hasButton = Boolean(buttonLabel && buttonUrl);

  host.innerHTML = `
    <article class="announcement-card" role="dialog" aria-modal="true" aria-label="Anúncio">
      <button class="announcement-close" type="button" onclick="closeAnnouncement(${toInlineJsStringLiteral(dismissKey)})" aria-label="Fechar anúncio">×</button>
      <img class="announcement-image" src="${escapeHtml(safeImage)}" alt="${escapeHtml(title || 'Anúncio')}" />
      ${(title || description || hasButton) ? `
        <div class="announcement-content">
          ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${hasButton ? (
            installAction
              ? `<button type="button" class="announcement-action" onclick="installMoradaApp()">${escapeHtml(buttonLabel)}</button>`
              : `<a href="${escapeHtml(buttonUrl)}" class="announcement-action">${escapeHtml(buttonLabel)}</a>`
          ) : ''}
        </div>
      ` : ''}
    </article>
  `;
  host.classList.add('show');
}

/** Formata um número como moeda brasileira */
function formatCurrency(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeTextForComparison(value) {
  const raw = fixMojibakeText(String(value || '')).trim();
  if (!raw) return '';

  const normalized = typeof raw.normalize === 'function'
    ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : raw;

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesNormalizedSearch(searchableText, query) {
  const normalizedQuery = normalizeTextForComparison(query);
  if (!normalizedQuery) return true;

  const normalizedText = normalizeTextForComparison(searchableText);
  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every(term => normalizedText.includes(term));
}

function getProductAlphabeticalKey(product) {
  return normalizeTextForComparison(product?.name || '')
    .replace(/^pizzas?\s+/, '')
    .replace(/\s+(?:g|m|p)\s+\d+p$/, '')
    .replace(/\s+(?:grande|media|pequena)(?:\s+\d+cm)?$/, '')
    .trim();
}

function compareProductsAlphabetically(a, b) {
  const byFlavor = getProductAlphabeticalKey(a).localeCompare(
    getProductAlphabeticalKey(b),
    'pt-BR',
    { sensitivity: 'base', numeric: true },
  );
  if (byFlavor !== 0) return byFlavor;
  return normalizeTextForComparison(a?.name || '').localeCompare(
    normalizeTextForComparison(b?.name || ''),
    'pt-BR',
    { sensitivity: 'base', numeric: true },
  );
}

function isPizzaProduct(product) {
  if (!product || typeof product !== 'object') return false;

  const categoryToken = normalizeTextForComparison(product.category);
  if (categoryToken.includes('pizza')) return true;

  const category = CATEGORIES.find((item) => String(item?.id || '') === String(product.category || ''));
  const categoryNameToken = normalizeTextForComparison(category?.name || '');
  return categoryNameToken.includes('pizza');
}

function normalizePizzaSizeKey(rawValue, allowRawFallback = false) {
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

function getPizzaSizeKey(product) {
  if (!product || typeof product !== 'object') return '';
  const sizeKey = normalizePizzaSizeKey(product.size, true);
  if (sizeKey) return sizeKey;

  const nameKey = normalizePizzaSizeKey(product.name);
  if (nameKey) return nameKey;

  return normalizePizzaSizeKey(product.description);
}

function getPizzaBorderSizeCode(product) {
  const sizeKey = getPizzaSizeKey(product);
  if (sizeKey === 'pequena') return 'P';
  if (sizeKey === 'media') return 'M';
  if (sizeKey === 'grande') return 'G';
  return '';
}

function getEmptyPizzaBorderSelection() {
  return { id: '', label: '', size: '', price: 0 };
}

function resolvePizzaBorderForProduct(product, borderSelection = null) {
  if (!isPizzaProduct(product) || !borderSelection?.id) {
    return getEmptyPizzaBorderSelection();
  }

  const size = getPizzaBorderSizeCode(product) || 'M';
  return resolvePizzaBorderSelection({ ...borderSelection, size });
}

function getPizzaSizeLabel(product) {
  const explicitSize = fixMojibakeText(String(product?.size || '')).trim();
  if (explicitSize) return explicitSize;

  const sizeKey = getPizzaSizeKey(product);
  if (sizeKey === 'pequena') return 'Pequena';
  if (sizeKey === 'media') return 'Média';
  if (sizeKey === 'grande') return 'Grande';
  return '';
}

function normalizePizzaSizeLabel(value) {
  let text = fixMojibakeText(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // Remove parênteses duplicados envolvendo o texto inteiro, ex.: "(Média (8 Pedaços))".
  while (text.startsWith('(') && text.endsWith(')')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) break;
    text = inner;
  }

  // Corrige grafia comum sem acentos em tamanhos.
  text = text
    .replace(/\bmedia\b/gi, 'Média')
    .replace(/\bmedio\b/gi, 'Médio')
    .replace(/\bpedacos\b/gi, 'pedaços');

  return text;
}

function formatPizzaSizeSuffix(sizeLabel) {
  const normalized = normalizePizzaSizeLabel(sizeLabel);
  if (!normalized) return '';
  return /[()]/.test(normalized) ? ` ${normalized}` : ` (${normalized})`;
}

function isSamePizzaSize(baseProduct, candidateProduct) {
  const baseSizeKey = getPizzaSizeKey(baseProduct);
  const candidateSizeKey = getPizzaSizeKey(candidateProduct);

  if (baseSizeKey && candidateSizeKey) return baseSizeKey === candidateSizeKey;
  if (baseSizeKey || candidateSizeKey) return false;
  return true;
}

function buildHalfPizzaDisplayName(firstProduct, secondProduct) {
  const firstName = cleanHalfPizzaFlavorName(firstProduct?.name || 'Pizza');
  const secondName = cleanHalfPizzaFlavorName(secondProduct?.name || 'Pizza');
  const sizeLabel = normalizePizzaSizeLabel(
    getPizzaSizeLabel(firstProduct) || getPizzaSizeLabel(secondProduct),
  );

  if (firstName === secondName) {
    return sizeLabel
      ? `Pizza Meio a Meio (${firstName}) - ${sizeLabel}`
      : `Pizza Meio a Meio (${firstName})`;
  }

  return sizeLabel
    ? `Pizza Meio a Meio: ${firstName} / ${secondName}${formatPizzaSizeSuffix(sizeLabel)}`
    : `Pizza Meio a Meio: ${firstName} / ${secondName}`;
}

function cleanHalfPizzaFlavorName(value) {
  let text = fixMojibakeText(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 'Pizza';

  const trailingPatterns = [
    /\s*\((?=[^)]*(?:cm|peda[cç]os?|(?:^|\s)\d{1,2}\s*p\b|broto|brotinho|pequena|m[eé]dia|media|grande))[^)]*\)\s*$/i,
    /\s*[-–]\s*(?:(?:broto|brotinho|pequena|m[eé]dia|media|grande)\b.*)$/i,
    /\s+(?:broto|brotinho|pequena|m[eé]dia|media|grande)\b$/i,
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

function buildHalfPizzaCartId(firstProduct, secondProduct, borderId = '') {
  const ids = [String(firstProduct?.id || ''), String(secondProduct?.id || '')].sort();
  const rawSizeKey = getPizzaSizeKey(firstProduct) || getPizzaSizeKey(secondProduct) || 'sem_tamanho';
  const safeSizeKey = rawSizeKey.replace(/[^a-z0-9_-]+/g, '_');
  const safeBorderId = String(borderId || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return safeBorderId
    ? `item-half-${safeSizeKey}-${ids.join('-')}-border-${safeBorderId}`
    : `item-half-${safeSizeKey}-${ids.join('-')}`;
}

function buildHalfPizzaCartItem(firstProduct, secondProduct, borderSelection = null) {
  const firstId = String(firstProduct?.id || '');
  const secondId = String(secondProduct?.id || '');
  const orderedIds = [firstId, secondId].sort();
  const firstPrice = Number(firstProduct?.price || 0);
  const secondPrice = Number(secondProduct?.price || 0);
  const unitPrice = Math.max(
    Number.isFinite(firstPrice) ? firstPrice : 0,
    Number.isFinite(secondPrice) ? secondPrice : 0,
  );
  const sizeLabel = getPizzaSizeLabel(firstProduct) || getPizzaSizeLabel(secondProduct);
  const sizeKey = getPizzaSizeKey(firstProduct) || getPizzaSizeKey(secondProduct) || '';
  const border = resolvePizzaBorderForProduct(firstProduct, borderSelection);
  const borderPrice = Number(border?.price || 0);
  const finalPrice = Number((unitPrice + borderPrice).toFixed(2));

  return {
    id: buildHalfPizzaCartId(firstProduct, secondProduct, border.id),
    productId: `half-${orderedIds.join('|')}`,
    name: buildHalfPizzaDisplayName(firstProduct, secondProduct),
    price: Number.isFinite(finalPrice) ? Number(finalPrice.toFixed(2)) : 0,
    emoji: normalizeEmoji(firstProduct?.emoji || secondProduct?.emoji || '🍕', '🍕'),
    quantity: 1,
    isCombo: false,
    isHalfPizza: true,
    halfPizzaFirstId: firstId,
    halfPizzaSecondId: secondId,
    size: sizeLabel,
    sizeKey,
    borderSelection: border.id ? border : null,
    borderLabel: border.id ? border.label : '',
    borderPrice,
  };
}

function getHalfPizzaOptions(baseProduct) {
  const pizzas = PRODUCTS
    .filter((product) => product && product.active !== false && isPizzaProduct(product))
    .filter((product) => isSamePizzaSize(baseProduct, product));

  return pizzas.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR'));
}

/** Exibe um toast de notificação por `duration` ms */
function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = fixMojibakeText(message);
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

/** Gera ID único para itens do carrinho (produto + extras) */
function cartItemId(productId, borderId = '') {
  const safeBorderId = String(borderId || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return safeBorderId
    ? `item-${productId}-border-${safeBorderId}`
    : `item-${productId}`;
}

/** Configura os links de WhatsApp na página */
function toInlineJsStringLiteral(value) {
  const safe = fixMojibakeText(String(value))
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\x22')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C');

  return `'${safe}'`;
}

function setupWhatsAppLinks() {
  const sampleMessage = `Olá! Gostaria de fazer um pedido ${String.fromCodePoint(0x1F355)}`;
  const url = buildWhatsAppUrl(CONFIG.whatsappNumber, sampleMessage);
  document.getElementById('whatsappHeader').href = url;
  document.getElementById('whatsappFooter').href = url;
}

/* ════════════════════════════════════════════════════════════
   RENDERIZAÇÃO DOS COMBOS
   ════════════════════════════════════════════════════════════ */
function hasActiveCombos() {
  return COMBOS.some((combo) => combo && combo.active !== false);
}

function syncCombosAvailabilityUI() {
  const hasCombos = hasActiveCombos();
  const combosSection = document.getElementById('combos-section');
  if (combosSection) {
    combosSection.dataset.hasCombos = hasCombos ? 'true' : 'false';
  }

  const combosBtn = document.querySelector('.cat-btn[data-category="combos"]');
  if (combosBtn) {
    combosBtn.style.display = hasCombos ? '' : 'none';
  }

  if (!hasCombos && activeCategory === 'combos') {
    activeCategory = 'all';
    const allBtn = document.querySelector('.cat-btn[data-category="all"]');
    if (allBtn) {
      document.querySelectorAll('.cat-btn').forEach((btn) => btn.classList.remove('active'));
      allBtn.classList.add('active');
    }
  }
}

function renderCombos() {
  const grid = document.getElementById('combosGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const activeCombos = COMBOS.filter(combo => combo && combo.active !== false);
  syncCombosAvailabilityUI();

  activeCombos.forEach((combo, idx) => {
    const comboIdLiteral = toInlineJsStringLiteral(combo.id);
    const hasOldPrice = Number(combo.oldPrice) > Number(combo.price);
    const comboBadge = escapeHtml(fixMojibakeText(combo.badge || ''));
    const comboEmoji = escapeHtml(normalizeEmoji(combo.emoji || '', '⭐'));
    const comboName = escapeHtml(fixMojibakeText(combo.name || ''));
    const comboDescription = escapeHtml(fixMojibakeText(combo.description || ''));
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.style.animationDelay = `${idx * 0.08}s`;
    card.innerHTML = `
      ${comboBadge ? `<span class="combo-tag">${comboBadge}</span>` : ''}
      <span class="combo-emoji">${comboEmoji}</span>
      <div class="combo-name">${comboName}</div>
      <div class="combo-desc">${comboDescription}</div>
      <div class="combo-price-wrap">
        <div class="combo-prices">
          ${hasOldPrice ? `<span class="combo-old-price">${formatCurrency(combo.oldPrice)}</span>` : ''}
          <span class="combo-new-price">${formatCurrency(combo.price)}</span>
        </div>
        <button class="combo-add-btn" onclick="addComboToCart(${comboIdLiteral})">+ Pedir</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════════════
   RENDERIZAÇÃO DOS PRODUTOS
   ════════════════════════════════════════════════════════════ */

/** Cria o HTML de um card de produto */
function createProductCard(product, index) {
  const hasDiscount = Number(product.oldPrice) > Number(product.price);
  const productImageSrc = sanitizeImageUrl(typeof product.image === 'string' ? product.image.trim() : '');
  const hasProductImage = productImageSrc !== '';
  const panelId = `ing-${String(product.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const productIdLiteral = toInlineJsStringLiteral(product.id);
  const panelIdSafe = escapeHtml(panelId);
  const productNameRaw = fixMojibakeText(product.name || '');
  const productCategory = escapeHtml(product.category || '');
  const productDataId = escapeHtml(product.id || '');
  const productName = escapeHtml(productNameRaw);
  const productNameLower = escapeHtml(String(productNameRaw || '').toLowerCase());
  const productDescription = escapeHtml(fixMojibakeText(product.description || ''));
  const productIngredients = escapeHtml(fixMojibakeText(product.ingredients || ''));
  const hasIngredients = productIngredients.trim().length > 0;
  const productEmoji = escapeHtml(normalizeEmoji(product.emoji || '', '🍕'));
  const productBadge = escapeHtml(fixMojibakeText(product.badge || ''));
  const category = CATEGORIES.find(item => String(item?.id || '') === String(product.category || ''));
  const productSearchText = escapeHtml(normalizeTextForComparison([
    product.id,
    product.name,
    product.description,
    product.ingredients,
    product.size,
    product.badge,
    product.category,
    category?.name,
    category?.description
  ].filter(Boolean).join(' ')));

  return `
    <div class="product-card" 
         data-category="${productCategory}" 
         data-id="${productDataId}"
         data-name="${productNameLower}"
         data-search="${productSearchText}"
         style="animation-delay:${index * 0.06}s">
      <!-- Imagem / emoji -->
      <div class="product-img ${hasProductImage ? 'has-photo' : ''}">
        ${hasProductImage ?
      `<img src="${escapeHtml(productImageSrc)}" class="product-photo" alt="${productName}" loading="lazy" decoding="async" onerror="this.remove(); if (this.parentElement) this.parentElement.classList.remove('has-photo');" />`
      : ''}
        <span class="emoji">${productEmoji}</span>
        ${productBadge ? `<span class="product-badge ${product.badge === 'Mais Pedido' ? 'best' : product.badge === 'Novo' ? 'novo' : ''}">${productBadge}</span>` : ''}
      </div>

      <!-- Corpo -->
      <div class="product-body">
        <div class="product-name">${productName}</div>
        <div class="product-desc">${productDescription}</div>

        <!-- Botao de ingredientes -->
        ${hasIngredients ? `
          <button class="btn-ingredients" onclick="toggleIngredients(this, '${panelIdSafe}')">
            <span>🧂 Ver ingredientes</span>
            <span class="arrow">▾</span>
          </button>
          <div class="ingredients-panel" id="${panelIdSafe}">
            ${productIngredients}
          </div>` : ''}
      </div>

      <!-- Rodape: preco + adicionar -->
      <div class="product-footer">
        <div class="product-price">
          ${hasDiscount ? `<span class="product-old-price">${formatCurrency(product.oldPrice)}</span>` : ''}
          <span class="product-new-price">${formatCurrency(product.price)}</span>
        </div>
        <button class="btn-add" onclick="addToCart(${productIdLiteral})">
          <span class="plus">+</span> Adicionar
        </button>
      </div>
    </div>
  `;
}

/** Renderiza todos os produtos nas respectivas grades de categoria */
function renderAllProducts() {
  document.querySelectorAll('.menu-section').forEach(section => {
    const cat = section.dataset.section;
    const grid = section.querySelector('.products-grid');
    if (!grid) return;

    const items = PRODUCTS.filter(p => p.category === cat && p.active !== false);
    if (items.some(isPizzaProduct)) items.sort(compareProductsAlphabetically);
    grid.innerHTML = items.map((p, i) => createProductCard(p, i)).join('');
  });
}

/* ════════════════════════════════════════════════════════════
   FILTRAGEM E BUSCA
   ════════════════════════════════════════════════════════════ */

/** Filtra produtos pela categoria ativa e termo de busca */
function filterProducts() {
  const sections = document.querySelectorAll('.menu-section');
  const combosSection = document.getElementById('combos-section');
  let totalVisible = 0;

  sections.forEach(section => {
    const sectionCat = section.dataset.section;
    const cards = section.querySelectorAll('.product-card');
    let sectionVisible = 0;

    cards.forEach(card => {
      const cardCat = card.dataset.category;
      const matchesCategory = searchTerm !== '' ||
        activeCategory === 'all' ||
        activeCategory === cardCat;
      const matchesSearch = matchesNormalizedSearch(
        card.dataset.search || `${card.dataset.name || ''} ${card.textContent || ''}`,
        searchTerm
      );

      if (matchesCategory && matchesSearch) {
        card.style.display = '';
        sectionVisible++;
        totalVisible++;
      } else {
        card.style.display = 'none';
      }
    });

    // Esconde/mostra secoes completas
    const sectionEnabled = section.dataset.enabled !== 'false';
    const showSection = sectionEnabled && (
      searchTerm !== ''
        ? sectionVisible > 0
        : (activeCategory === 'all' || activeCategory === sectionCat)
    );
    section.style.display = showSection ? '' : 'none';

    // Mostra mensagem "sem resultados" dentro da grade
    const grid = section.querySelector('.products-grid');
    const existingNoResult = grid.querySelector('.no-results');

    if (searchTerm === '' && sectionVisible === 0 && showSection) {
      if (!existingNoResult) {
        grid.insertAdjacentHTML('beforeend', `
          <div class="no-results">
            <span class="no-results-icon">🔍</span>
            <p>Nenhum resultado</p>
            <span>Tente outro termo ou categoria</span>
          </div>
        `);
      }
    } else {
      if (existingNoResult) existingNoResult.remove();
    }
  });

  // Controla visibilidade da secao de combos
  if (combosSection) {
    const combosEnabled = combosSection.dataset.enabled !== 'false';
    const combosHaveItems = combosSection.dataset.hasCombos !== 'false' && hasActiveCombos();
    const showCombos = combosEnabled
      && combosHaveItems
      && (activeCategory === 'all' || activeCategory === 'combos')
      && searchTerm === '';
    combosSection.style.display = showCombos ? '' : 'none';
  }

  // Atualiza informacao de resultado de busca
  const resultInfo = document.getElementById('searchResultInfo');
  const resultText = document.getElementById('searchResultText');
  if (searchTerm !== '') {
    resultInfo.style.display = 'flex';
    resultText.textContent = `${totalVisible} resultado(s) para "${searchDisplayTerm}"`;
  } else {
    resultInfo.style.display = 'none';
  }
}

function resetSearchState() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (input) input.value = '';
  searchTerm = '';
  searchDisplayTerm = '';
  clearBtn?.classList.remove('visible');
}

/** Lida com clique nas categorias do nav */
function setupCategoryNav() {
  const container = document.querySelector('.categories-scroll');
  if (!container || CATEGORY_NAV_BOUND) return;
  CATEGORY_NAV_BOUND = true;

  container.addEventListener('click', (event) => {
    const btn = event.target.closest('.cat-btn');
    if (!btn || !container.contains(btn) || btn.style.display === 'none') return;

    // Ao escolher um filtro, a categoria passa a comandar a listagem sozinha.
    resetSearchState();
    container.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    filterProducts();

    // Scroll para o menu principal se estiver na hero
    if (activeCategory !== 'all') {
      let section = null;
      document.querySelectorAll('.menu-section').forEach((candidate) => {
        if (!section && String(candidate.dataset.section || '') === String(activeCategory)) {
          section = candidate;
        }
      });
      if (!section) {
        section = document.getElementById('combos-section');
      }
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/** Lida com o campo de busca */
function setupSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (!input || !clearBtn) return;

  input.addEventListener('input', () => {
    searchDisplayTerm = input.value.trim();
    searchTerm = normalizeTextForComparison(searchDisplayTerm);
    clearBtn.classList.toggle('visible', searchTerm !== '');
    filterProducts();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      filterProducts();
      document.getElementById('searchResultInfo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

/** Foca a pesquisa quando o cliente clica na lupa */
function focusSearchInput() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.focus();
  filterProducts();
}

/** Limpa o campo de busca */
function clearSearch() {
  resetSearchState();
  filterProducts();
}

/** Expande/colapsa o painel de ingredientes */
function toggleIngredients(btn, panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');

  btn.classList.toggle('open', !isOpen);
  panel.classList.toggle('open', !isOpen);
  btn.querySelector('span:first-child').textContent = isOpen ? '🧂 Ver ingredientes' : '🧂 Ocultar ingredientes';
}

/** Scroll suave ate o menu */
function scrollToMenu() {
  document.getElementById('menuMain').scrollIntoView({ behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   CARRINHO DE COMPRAS
   ════════════════════════════════════════════════════════════ */

/** Adiciona um produto simples ao carrinho */
function isPizzaCompositionModalOpen() {
  const overlay = document.getElementById('pizzaCompositionModal');
  return !!(overlay && overlay.classList.contains('open'));
}

function closePizzaCompositionModal(result = null) {
  const overlay = document.getElementById('pizzaCompositionModal');
  const content = document.getElementById('pizzaChoiceContent');
  if (overlay) overlay.classList.remove('open');
  if (content) content.innerHTML = '';

  const resolve = PIZZA_COMPOSITION_RESOLVER;
  PIZZA_COMPOSITION_RESOLVER = null;

  if (PIZZA_COMPOSITION_LAST_FOCUSED && typeof PIZZA_COMPOSITION_LAST_FOCUSED.focus === 'function') {
    PIZZA_COMPOSITION_LAST_FOCUSED.focus();
  }
  PIZZA_COMPOSITION_LAST_FOCUSED = null;

  if (resolve) resolve(result);
}

function renderPizzaBorderSelectionStep(baseProduct, previousSelection = null) {
  const title = document.getElementById('pizzaChoiceTitle');
  const text = document.getElementById('pizzaChoiceText');
  const content = document.getElementById('pizzaChoiceContent');
  if (!title || !text || !content) return;

  const sizeLabel = getPizzaSizeLabel(baseProduct);
  const productName = fixMojibakeText(String(baseProduct?.name || 'Pizza'));
  const borderOptions = getPizzaBorderCatalog();
  const requestedBorderId = previousSelection?.borderSelection?.id || previousSelection?.borderId || '';
  const selectedBorderId = borderOptions.some((option) => option?.id === requestedBorderId)
    ? requestedBorderId
    : '';
  const selectedSize = getPizzaBorderSizeCode(baseProduct) || 'M';

  title.textContent = 'Deseja uma borda personalizada?';
  text.textContent = sizeLabel
    ? `Escolha uma borda para ${productName} (${sizeLabel}) ou continue sem borda.`
    : `Escolha uma borda para ${productName} ou continue sem borda.`;

  const optionsByGroup = borderOptions.reduce((groups, option) => {
    const group = String(option?.group || option?.category || 'Especiais').trim() || 'Especiais';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
    return groups;
  }, new Map());

  const buildOption = (option) => {
    const optionId = escapeHtml(String(option?.id || ''));
    const optionLabel = escapeHtml(String(option?.label || ''));
    const price = formatCurrency(getPizzaBorderPrice(option?.id, selectedSize));
    const checked = selectedBorderId === option?.id ? ' checked' : '';
    return `
      <label class="pizza-border-option${checked ? ' is-selected' : ''}">
        <input type="radio" name="pizzaBorder" value="${optionId}"${checked} />
        <span class="pizza-border-main">
          <strong>${optionLabel}</strong>
          <small>${price}</small>
        </span>
      </label>
    `;
  };

  const groupedOptionsHtml = [...optionsByGroup.entries()].map(([group, options]) => `
    <fieldset class="pizza-border-group">
      <legend>${escapeHtml(group)}</legend>
      <div class="pizza-border-group-options">
        ${options.map(buildOption).join('')}
      </div>
    </fieldset>
  `).join('');

  content.innerHTML = `
    <div class="pizza-border-list">
      <label class="pizza-border-option${selectedBorderId ? '' : ' is-selected'}">
        <input type="radio" name="pizzaBorder" value=""${selectedBorderId ? '' : ' checked'} />
        <span class="pizza-border-main">
          <strong>Sem borda</strong>
          <small>R$ 0,00</small>
        </span>
      </label>
      ${groupedOptionsHtml}
    </div>
    <div class="pizza-half-toolbar">
      <button type="button" class="btn-confirm-cancel pizza-choice-btn ghost" id="pizzaBorderBackBtn">Voltar</button>
      <button type="button" class="btn-confirm-ok pizza-choice-btn" id="pizzaBorderConfirmBtn">Confirmar</button>
    </div>
  `;

  const backBtn = document.getElementById('pizzaBorderBackBtn');
  const confirmBtn = document.getElementById('pizzaBorderConfirmBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => renderPizzaCompositionChoiceStep(baseProduct));
  }
  content.querySelectorAll('input[name="pizzaBorder"]').forEach((input) => {
    input.addEventListener('change', () => {
      content.querySelectorAll('.pizza-border-option').forEach((option) => {
        option.classList.toggle('is-selected', option.contains(input) && input.checked);
      });
    });
  });
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const selectedInput = content.querySelector('input[name="pizzaBorder"]:checked');
      const borderId = selectedInput ? String(selectedInput.value || '') : '';
      const borderSelection = borderId ? { id: borderId, size: selectedSize } : null;
      closePizzaCompositionModal({
        mode: previousSelection?.mode || 'whole',
        secondProductId: previousSelection?.secondProductId || '',
        borderSelection,
      });
    });
  }
}

function renderPizzaCompositionChoiceStep(baseProduct) {
  const title = document.getElementById('pizzaChoiceTitle');
  const text = document.getElementById('pizzaChoiceText');
  const content = document.getElementById('pizzaChoiceContent');
  if (!title || !text || !content) return;

  const sizeLabel = getPizzaSizeLabel(baseProduct);
  const productName = fixMojibakeText(String(baseProduct?.name || 'Pizza'));
  title.textContent = 'Como deseja essa pizza?';
  text.textContent = sizeLabel
    ? `${productName} (${sizeLabel}).`
    : `${productName}.`;

  content.innerHTML = `
    <div class="pizza-choice-actions">
      <button type="button" class="btn-confirm-ok pizza-choice-btn" id="pizzaChoiceWholeBtn">Pizza inteira</button>
      <button type="button" class="btn-confirm-cancel pizza-choice-btn" id="pizzaChoiceHalfBtn">Meio a meio</button>
      <button type="button" class="btn-confirm-cancel pizza-choice-btn ghost" id="pizzaChoiceCancelBtn">Cancelar</button>
    </div>
  `;

  const wholeBtn = document.getElementById('pizzaChoiceWholeBtn');
  const halfBtn = document.getElementById('pizzaChoiceHalfBtn');
  const cancelBtn = document.getElementById('pizzaChoiceCancelBtn');

  if (wholeBtn) {
    wholeBtn.addEventListener('click', () => renderPizzaBorderSelectionStep(baseProduct, { mode: 'whole' }));
    wholeBtn.focus();
  }
  if (halfBtn) {
    halfBtn.addEventListener('click', () => renderPizzaHalfSelectionStep(baseProduct));
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closePizzaCompositionModal(null));
  }
}

function renderPizzaHalfSelectionStep(baseProduct) {
  const title = document.getElementById('pizzaChoiceTitle');
  const text = document.getElementById('pizzaChoiceText');
  const content = document.getElementById('pizzaChoiceContent');
  if (!title || !text || !content) return;

  const options = getHalfPizzaOptions(baseProduct);
  if (!options.length) {
    showToast('⚠️ Não há pizzas do mesmo tamanho para montar meio a meio.');
    closePizzaCompositionModal(null);
    return;
  }

  const sizeLabel = getPizzaSizeLabel(baseProduct);
  title.textContent = 'Escolha a outra metade';
  text.textContent = sizeLabel
    ? `Mostrando apenas sabores do tamanho ${sizeLabel}.`
    : 'Escolha o sabor para completar sua pizza meio a meio.';

  const optionsHtml = options.map((product) => {
    const productId = escapeHtml(String(product?.id || ''));
    const productName = escapeHtml(fixMojibakeText(String(product?.name || 'Pizza')));
    const productSize = escapeHtml(getPizzaSizeLabel(product));
    const productPrice = formatCurrency(Number(product?.price || 0));
    return `
      <button type="button" class="pizza-half-option" data-half-product-id="${productId}">
        <span class="pizza-half-main">
          <strong>${productName}</strong>
          ${productSize ? `<small>${productSize}</small>` : ''}
        </span>
        <span class="pizza-half-price">${productPrice}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="pizza-half-toolbar">
      <button type="button" class="btn-confirm-cancel pizza-choice-btn ghost" id="pizzaHalfBackBtn">Voltar</button>
    </div>
    <div class="pizza-half-list">
      ${optionsHtml}
    </div>
  `;

  const backBtn = document.getElementById('pizzaHalfBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => renderPizzaCompositionChoiceStep(baseProduct));
    backBtn.focus();
  }

  content.querySelectorAll('[data-half-product-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedId = String(button.getAttribute('data-half-product-id') || '');
      if (!selectedId) return;
      renderPizzaBorderSelectionStep(baseProduct, {
        mode: 'half',
        secondProductId: selectedId,
      });
    });
  });
}

function requestPizzaComposition(baseProduct) {
  const overlay = document.getElementById('pizzaCompositionModal');
  const content = document.getElementById('pizzaChoiceContent');
  if (!overlay || !content) {
    return Promise.resolve({ mode: 'whole' });
  }

  if (PIZZA_COMPOSITION_RESOLVER) {
    PIZZA_COMPOSITION_RESOLVER(null);
    PIZZA_COMPOSITION_RESOLVER = null;
  }

  PIZZA_COMPOSITION_LAST_FOCUSED = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  overlay.classList.add('open');
  renderPizzaCompositionChoiceStep(baseProduct);

  return new Promise((resolve) => {
    PIZZA_COMPOSITION_RESOLVER = resolve;
  });
}

function setupPizzaCompositionModal() {
  const overlay = document.getElementById('pizzaCompositionModal');
  if (!overlay || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closePizzaCompositionModal(null);
    }
  });
}

function isPizzaSwapModalOpen() {
  const overlay = document.getElementById('pizzaSwapModal');
  return !!(overlay && overlay.classList.contains('open'));
}

function closePizzaSwapModal(result = null) {
  const overlay = document.getElementById('pizzaSwapModal');
  const content = document.getElementById('pizzaSwapContent');
  if (overlay) overlay.classList.remove('open');
  if (content) content.innerHTML = '';

  const resolve = PIZZA_SWAP_RESOLVER;
  PIZZA_SWAP_RESOLVER = null;

  if (PIZZA_SWAP_LAST_FOCUSED && typeof PIZZA_SWAP_LAST_FOCUSED.focus === 'function') {
    PIZZA_SWAP_LAST_FOCUSED.focus();
  }
  PIZZA_SWAP_LAST_FOCUSED = null;

  if (resolve) resolve(result);
}

function isCartItemReplaceablePizza(item) {
  if (!item || item.isCombo) return false;
  if (item.isHalfPizza) return true;
  const product = PRODUCTS.find((candidate) => String(candidate?.id || '') === String(item.productId || ''));
  return isPizzaProduct(product);
}

function getPizzaSwapOptions() {
  return PRODUCTS
    .filter((product) => product && product.active !== false && isPizzaProduct(product))
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR'));
}

function findPizzaById(productId) {
  return PRODUCTS.find((product) => (
    product
    && product.active !== false
    && isPizzaProduct(product)
    && String(product.id) === String(productId || '')
  ));
}

function renderPizzaSwapSingleSelectionStep(cartItem) {
  const title = document.getElementById('pizzaSwapTitle');
  const text = document.getElementById('pizzaSwapText');
  const content = document.getElementById('pizzaSwapContent');
  if (!title || !text || !content) return;

  const options = getPizzaSwapOptions();
  if (!options.length) {
    showToast('⚠️ Nenhuma pizza disponível para troca.');
    closePizzaSwapModal(null);
    return;
  }

  const currentProductId = String(cartItem.productId || '');

  title.textContent = 'Trocar sabor da pizza';
  text.textContent = 'Escolha o novo sabor para substituir este item.';

  const optionsHtml = options.map((product) => {
    const productId = escapeHtml(String(product?.id || ''));
    const productName = escapeHtml(fixMojibakeText(String(product?.name || 'Pizza')));
    const productSize = escapeHtml(getPizzaSizeLabel(product));
    const productPrice = formatCurrency(Number(product?.price || 0));
    const isCurrent = String(product?.id || '') === currentProductId;
    const currentClass = isCurrent ? ' current' : '';
    const currentTag = isCurrent ? '<small class="pizza-swap-current">Sabor atual</small>' : '';
    return `
      <button type="button" class="pizza-half-option pizza-swap-option${currentClass}" data-swap-product-id="${productId}">
        <span class="pizza-half-main">
          <strong>${productName}</strong>
          ${productSize ? `<small>${productSize}</small>` : ''}
          ${currentTag}
        </span>
        <span class="pizza-half-price">${productPrice}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="pizza-half-toolbar">
      <button type="button" class="btn-confirm-cancel pizza-choice-btn ghost" id="pizzaSwapCancelBtn">Cancelar</button>
    </div>
    <div class="pizza-half-list">
      ${optionsHtml}
    </div>
  `;

  const cancelBtn = document.getElementById('pizzaSwapCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closePizzaSwapModal(null));
    cancelBtn.focus();
  }

  content.querySelectorAll('[data-swap-product-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedId = String(button.getAttribute('data-swap-product-id') || '');
      if (!selectedId) return;
      closePizzaSwapModal({
        mode: 'single',
        productId: selectedId,
      });
    });
  });
}

function renderPizzaSwapHalfSelectionStep(cartItem) {
  const title = document.getElementById('pizzaSwapTitle');
  const text = document.getElementById('pizzaSwapText');
  const content = document.getElementById('pizzaSwapContent');
  if (!title || !text || !content) return;

  const currentFirstId = String(cartItem.halfPizzaFirstId || '');
  const currentSecondId = String(cartItem.halfPizzaSecondId || '');
  const firstCurrentProduct = findPizzaById(currentFirstId);
  const secondCurrentProduct = findPizzaById(currentSecondId);
  const baseProduct = firstCurrentProduct || secondCurrentProduct;

  let options = [];
  if (baseProduct) {
    options = getHalfPizzaOptions(baseProduct);
  }
  if (!options.length) {
    options = getPizzaSwapOptions();
  }
  if (!options.length) {
    showToast('⚠️ Nenhuma pizza disponível para troca.');
    closePizzaSwapModal(null);
    return;
  }

  title.textContent = 'Trocar sabores da pizza meio a meio';
  text.textContent = 'Os dois sabores atuais já estão marcados. Você pode trocar só um e confirmar.';

  const optionsHtml = options.map((product) => {
    const productId = escapeHtml(String(product?.id || ''));
    const productName = escapeHtml(fixMojibakeText(String(product?.name || 'Pizza')));
    const productSize = escapeHtml(getPizzaSizeLabel(product));
    const productPrice = formatCurrency(Number(product?.price || 0));
    return `
      <option value="${productId}">
        ${productName}${productSize ? ` (${productSize})` : ''} - ${productPrice}
      </option>
    `;
  }).join('');

  content.innerHTML = `
    <div class="pizza-swap-half-form">
      <div class="pizza-swap-field">
        <label for="pizzaSwapFirstSelect">1ª metade</label>
        <select id="pizzaSwapFirstSelect" class="pizza-swap-select">
          ${optionsHtml}
        </select>
      </div>
      <div class="pizza-swap-field">
        <label for="pizzaSwapSecondSelect">2ª metade</label>
        <select id="pizzaSwapSecondSelect" class="pizza-swap-select">
          ${optionsHtml}
        </select>
      </div>
      <small class="pizza-swap-help">O valor final continua pela regra do maior sabor.</small>
    </div>
    <div class="confirm-actions">
      <button type="button" class="btn-confirm-cancel" id="pizzaSwapCancelBtn">Cancelar</button>
      <button type="button" class="btn-confirm-ok" id="pizzaSwapConfirmBtn">Confirmar troca</button>
    </div>
  `;

  const availableIds = new Set(options.map((product) => String(product?.id || '')));
  const fallbackId = String(options[0]?.id || '');
  const firstSelect = document.getElementById('pizzaSwapFirstSelect');
  const secondSelect = document.getElementById('pizzaSwapSecondSelect');
  if (firstSelect) {
    firstSelect.value = availableIds.has(currentFirstId) ? currentFirstId : fallbackId;
  }
  if (secondSelect) {
    secondSelect.value = availableIds.has(currentSecondId) ? currentSecondId : fallbackId;
  }

  const cancelBtn = document.getElementById('pizzaSwapCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closePizzaSwapModal(null));
  }
  if (firstSelect) firstSelect.focus();

  const confirmBtn = document.getElementById('pizzaSwapConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const firstProductId = firstSelect ? String(firstSelect.value || '') : '';
      const secondProductId = secondSelect ? String(secondSelect.value || '') : '';
      if (!firstProductId || !secondProductId) {
        showToast('⚠️ Selecione os dois sabores para confirmar.');
        return;
      }

      closePizzaSwapModal({
        mode: 'half',
        firstProductId,
        secondProductId,
      });
    });
  }
}

function renderPizzaSwapSelectionStep(cartItem) {
  if (cartItem?.isHalfPizza) {
    renderPizzaSwapHalfSelectionStep(cartItem);
    return;
  }
  renderPizzaSwapSingleSelectionStep(cartItem);
}

function requestPizzaSwapChoice(cartItem) {
  const overlay = document.getElementById('pizzaSwapModal');
  const content = document.getElementById('pizzaSwapContent');
  if (!overlay || !content) return Promise.resolve(null);

  if (PIZZA_SWAP_RESOLVER) {
    PIZZA_SWAP_RESOLVER(null);
    PIZZA_SWAP_RESOLVER = null;
  }

  PIZZA_SWAP_LAST_FOCUSED = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  overlay.classList.add('open');
  renderPizzaSwapSelectionStep(cartItem);

  return new Promise((resolve) => {
    PIZZA_SWAP_RESOLVER = resolve;
  });
}

function replaceCartPizzaItemSingle(itemId, productId) {
  const itemIndex = cart.findIndex((entry) => entry.id === itemId);
  if (itemIndex < 0) return false;

  const currentItem = cart[itemIndex];
  if (!isCartItemReplaceablePizza(currentItem)) {
    showToast('⚠️ Somente itens de pizza podem ser alterados.');
    return false;
  }

  const selectedProduct = findPizzaById(productId);
  if (!selectedProduct || !isPizzaProduct(selectedProduct)) {
    showToast('⚠️ Pizza selecionada inválida.');
    return false;
  }

  if (!currentItem.isHalfPizza && String(currentItem.productId || '') === String(selectedProduct.id || '')) {
    showToast('⚠️ Você selecionou o mesmo sabor.');
    return false;
  }

  const quantity = Number.isInteger(currentItem.quantity) && currentItem.quantity > 0
    ? currentItem.quantity
    : 1;
  const border = resolvePizzaBorderForProduct(selectedProduct, currentItem.borderSelection);
  const targetItemId = cartItemId(selectedProduct.id, border.id);
  const mergeIndex = cart.findIndex((entry, index) => (
    index !== itemIndex
    && String(entry?.id || '') === targetItemId
    && !entry.isCombo
    && !entry.isHalfPizza
  ));

  if (mergeIndex >= 0) {
    cart[mergeIndex].quantity = (Number.parseInt(cart[mergeIndex].quantity, 10) || 1) + quantity;
    cart.splice(itemIndex, 1);
  } else {
    cart[itemIndex] = {
      ...currentItem,
      id: targetItemId,
      productId: selectedProduct.id,
      name: selectedProduct.name,
      price: Number((Number(selectedProduct.price || 0) + Number(border.price || 0)).toFixed(2)),
      emoji: normalizeEmoji(selectedProduct.emoji, '🍕'),
      quantity,
      isCombo: false,
      isHalfPizza: false,
      halfPizzaFirstId: '',
      halfPizzaSecondId: '',
      size: getPizzaSizeLabel(selectedProduct),
      sizeKey: getPizzaSizeKey(selectedProduct),
      borderSelection: border.id ? border : null,
      borderLabel: border.label,
      borderPrice: Number(border.price || 0),
    };
  }

  updateCartUI();
  showToast(`✅ Pizza alterada para ${selectedProduct.name}!`);
  return true;
}

function replaceCartPizzaItemHalf(itemId, firstProductId, secondProductId) {
  const itemIndex = cart.findIndex((entry) => entry.id === itemId);
  if (itemIndex < 0) return false;

  const currentItem = cart[itemIndex];
  if (!isCartItemReplaceablePizza(currentItem)) {
    showToast('⚠️ Somente itens de pizza podem ser alterados.');
    return false;
  }

  const firstProduct = findPizzaById(firstProductId);
  const secondProduct = findPizzaById(secondProductId);
  if (!firstProduct || !secondProduct) {
    showToast('⚠️ Não foi possível aplicar a troca dos sabores.');
    return false;
  }

  if (!isSamePizzaSize(firstProduct, secondProduct)) {
    showToast('⚠️ Meio a meio somente com pizzas do mesmo tamanho.');
    return false;
  }

  const currentIdsSorted = [
    String(currentItem.halfPizzaFirstId || ''),
    String(currentItem.halfPizzaSecondId || ''),
  ].sort().join('|');
  const nextIdsSorted = [String(firstProduct.id || ''), String(secondProduct.id || '')].sort().join('|');
  if (currentItem.isHalfPizza && currentIdsSorted === nextIdsSorted) {
    showToast('⚠️ Você manteve os mesmos sabores.');
    return false;
  }

  const quantity = Number.isInteger(currentItem.quantity) && currentItem.quantity > 0
    ? currentItem.quantity
    : 1;
  const itemModel = buildHalfPizzaCartItem(firstProduct, secondProduct, currentItem.borderSelection);
  const mergeIndex = cart.findIndex((entry, index) => (
    index !== itemIndex
    && Boolean(entry?.isHalfPizza)
    && String(entry?.id || '') === String(itemModel.id || '')
  ));

  if (mergeIndex >= 0) {
    cart[mergeIndex].quantity = (Number.parseInt(cart[mergeIndex].quantity, 10) || 1) + quantity;
    cart.splice(itemIndex, 1);
  } else {
    cart[itemIndex] = {
      ...currentItem,
      ...itemModel,
      quantity,
      isCombo: false,
      isHalfPizza: true,
    };
  }

  updateCartUI();
  showToast('✅ Pizza meio a meio atualizada!');
  return true;
}

function replaceCartPizzaItem(itemId, selection) {
  if (!selection || typeof selection !== 'object') return false;

  if (selection.mode === 'half') {
    return replaceCartPizzaItemHalf(itemId, selection.firstProductId, selection.secondProductId);
  }
  if (selection.mode === 'single') {
    return replaceCartPizzaItemSingle(itemId, selection.productId);
  }
  return false;
}

async function editCartPizza(itemId) {
  const currentItem = cart.find((entry) => entry.id === itemId);
  if (!currentItem) return;
  if (!isCartItemReplaceablePizza(currentItem)) {
    showToast('⚠️ Este item não é uma pizza editável.');
    return;
  }

  const selection = await requestPizzaSwapChoice(currentItem);
  if (!selection) return;
  replaceCartPizzaItem(itemId, selection);
}

function setupPizzaSwapModal() {
  const overlay = document.getElementById('pizzaSwapModal');
  if (!overlay || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closePizzaSwapModal(null);
    }
  });
}

function addRegularProductToCart(product, borderSelection = null) {
  const productSize = getPizzaSizeLabel(product);
  const productSizeKey = isPizzaProduct(product) ? getPizzaSizeKey(product) : '';
  const border = resolvePizzaBorderForProduct(product, borderSelection);
  const productPrice = Number(product?.price || 0);
  const borderPrice = Number(border?.price || 0);
  const finalPrice = Number((productPrice + borderPrice).toFixed(2));
  const itemId = cartItemId(product.id, border.id);
  const existingItem = cart.find(item => item.id === itemId);

  if (existingItem) {
    existingItem.quantity += 1;
    existingItem.size = productSize;
    existingItem.sizeKey = productSizeKey;
    existingItem.price = finalPrice;
    existingItem.borderSelection = border.id ? border : null;
    existingItem.borderLabel = border.id ? border.label : '';
    existingItem.borderPrice = borderPrice;
  } else {
    cart.push({
      id: itemId,
      productId: product.id,
      name: product.name,
      price: finalPrice,
      emoji: product.emoji,
      quantity: 1,
      isCombo: false,
      size: productSize,
      sizeKey: productSizeKey,
      borderSelection: border.id ? border : null,
      borderLabel: border.id ? border.label : '',
      borderPrice,
    });
  }

  updateCartUI();
  animateFab();
  showToast(`✅ ${product.name} adicionado!`);
}

function addHalfPizzaToCart(firstProduct, secondProduct, borderSelection = null) {
  const itemModel = buildHalfPizzaCartItem(firstProduct, secondProduct, borderSelection);
  const existingItem = cart.find((item) => item.id === itemModel.id);

  if (existingItem) {
    existingItem.quantity += 1;
    existingItem.name = itemModel.name;
    existingItem.price = itemModel.price;
    existingItem.emoji = itemModel.emoji;
    existingItem.isHalfPizza = true;
    existingItem.halfPizzaFirstId = itemModel.halfPizzaFirstId;
    existingItem.halfPizzaSecondId = itemModel.halfPizzaSecondId;
    existingItem.size = itemModel.size;
    existingItem.sizeKey = itemModel.sizeKey;
    existingItem.borderSelection = itemModel.borderSelection;
    existingItem.borderLabel = itemModel.borderLabel;
    existingItem.borderPrice = itemModel.borderPrice;
  } else {
    cart.push(itemModel);
  }

  updateCartUI();
  animateFab();
  showToast('✅ Pizza meio a meio adicionada!');
}

async function addToCart(productId) {
  const product = PRODUCTS.find((item) => String(item.id) === String(productId));
  if (!product) return;

  if (isPizzaProduct(product)) {
    const selection = await requestPizzaComposition(product);
    if (!selection) return;

    const borderSelection = selection.borderSelection || null;

    if (selection.mode === 'half') {
      const secondProduct = PRODUCTS.find((item) => String(item.id) === String(selection.secondProductId || ''));
      if (!secondProduct || !isPizzaProduct(secondProduct)) {
        showToast('⚠️ Não foi possível selecionar a segunda metade.');
        return;
      }
      if (!isSamePizzaSize(product, secondProduct)) {
        showToast('⚠️ Meio a meio somente com pizzas do mesmo tamanho.');
        return;
      }
      addHalfPizzaToCart(product, secondProduct, borderSelection);
      return;
    }

    addRegularProductToCart(product, borderSelection);
    return;
  }

  addRegularProductToCart(product);
}

/** Adiciona um combo ao carrinho (como item único) */
function addComboToCart(comboId) {
  const combo = COMBOS.find(c => c.id === comboId);
  if (!combo) return;

  const itemId = `combo-${comboId}`;
  const existing = cart.find(item => item.id === itemId);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: itemId,
      productId: comboId,
      name: `Combo ${combo.name}`,
      price: combo.price,
      emoji: combo.emoji,
      quantity: 1,
      isCombo: true,
    });
  }

  updateCartUI();
  animateFab();
  showToast(`⭐ ${combo.name} adicionado ao pedido!`);
}

/** Remove um item completo do carrinho */
function removeFromCart(itemId) {
  cart = cart.filter(item => item.id !== itemId);
  updateCartUI();
}

/** Altera a quantidade de um item */
function changeQuantity(itemId, delta) {
  const item = cart.find(i => i.id === itemId);
  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    removeFromCart(itemId);
    return;
  }

  updateCartUI();
}

/** Limpa todo o carrinho */
async function clearCart() {
  if (cart.length === 0) return;
  const confirmed = await requestClearCartConfirmation();
  if (!confirmed) return;
  cart = [];
  updateCartUI();
  showToast('🗑️ Carrinho limpo');
}

function clearCartAfterSuccessfulOrder() {
  cart = [];
  CUSTOMER_GEO = null;
  ORDER_PREVIEW_OPEN = false;
  ORDER_PREVIEW_EDITING = false;

  clearPixReceiptSelection({ silent: true });
  updateCartUI();
  clearMobileRuntimeState();

  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/** Confirmao customizada para limpar carrinho */
function isClearCartConfirmationOpen() {
  const overlay = document.getElementById('clearCartConfirm');
  return !!(overlay && overlay.classList.contains('open'));
}

function closeClearCartConfirmation(confirmed) {
  const overlay = document.getElementById('clearCartConfirm');
  if (!overlay) return;

  overlay.classList.remove('open');

  const resolve = CLEAR_CART_CONFIRM_RESOLVER;
  CLEAR_CART_CONFIRM_RESOLVER = null;

  if (CLEAR_CART_LAST_FOCUSED && typeof CLEAR_CART_LAST_FOCUSED.focus === 'function') {
    CLEAR_CART_LAST_FOCUSED.focus();
  }
  CLEAR_CART_LAST_FOCUSED = null;

  if (resolve) resolve(Boolean(confirmed));
}

function requestClearCartConfirmation() {
  const overlay = document.getElementById('clearCartConfirm');
  const confirmBtn = document.getElementById('clearCartConfirmBtn');
  if (!overlay || !confirmBtn) {
    return Promise.resolve(confirm('Deseja realmente limpar o carrinho'));
  }

  if (CLEAR_CART_CONFIRM_RESOLVER) {
    CLEAR_CART_CONFIRM_RESOLVER(false);
    CLEAR_CART_CONFIRM_RESOLVER = null;
  }

  CLEAR_CART_LAST_FOCUSED = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  overlay.classList.add('open');
  confirmBtn.focus();

  return new Promise(resolve => {
    CLEAR_CART_CONFIRM_RESOLVER = resolve;
  });
}

function setupClearCartConfirmation() {
  const overlay = document.getElementById('clearCartConfirm');
  const cancelBtn = document.getElementById('clearCartCancelBtn');
  const confirmBtn = document.getElementById('clearCartConfirmBtn');

  if (!overlay || !cancelBtn || !confirmBtn || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';

  cancelBtn.addEventListener('click', () => closeClearCartConfirmation(false));
  confirmBtn.addEventListener('click', () => closeClearCartConfirmation(true));

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeClearCartConfirmation(false);
    }
  });
}

function isDeliveryPixNoticeOpen() {
  const overlay = document.getElementById('deliveryPixNotice');
  return !!(overlay && overlay.classList.contains('open'));
}

function closeDeliveryPixNotice() {
  const overlay = document.getElementById('deliveryPixNotice');
  if (!overlay) return;
  overlay.classList.remove('open');

  if (DELIVERY_PIX_NOTICE_LAST_FOCUSED && typeof DELIVERY_PIX_NOTICE_LAST_FOCUSED.focus === 'function') {
    DELIVERY_PIX_NOTICE_LAST_FOCUSED.focus();
  }
  DELIVERY_PIX_NOTICE_LAST_FOCUSED = null;
}

function openDeliveryPixNotice() {
  const overlay = document.getElementById('deliveryPixNotice');
  const button = document.getElementById('deliveryPixNoticeBtn');
  if (!overlay || !button) return;

  DELIVERY_PIX_NOTICE_LAST_FOCUSED = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  overlay.classList.add('open');
  button.focus();
}

function setupDeliveryPixNotice() {
  const overlay = document.getElementById('deliveryPixNotice');
  const button = document.getElementById('deliveryPixNoticeBtn');
  if (!overlay || !button || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';

  button.addEventListener('click', () => closeDeliveryPixNotice());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDeliveryPixNotice();
  });
}

function getSelectedPaymentMethod() {
  const selected = document.querySelector('input[name="paymentMethod"]:checked');
  return selected ? selected.value : 'pix';
}

function getPaymentMethodInput(method) {
  return document.querySelector(`input[name="paymentMethod"][value="${method}"]`);
}

function setSelectedPaymentMethod(method) {
  const input = getPaymentMethodInput(method);
  if (input) input.checked = true;
}

function getConfiguredPixKey() {
  return String(CONFIG.pixKey || '').trim();
}

function updatePixBoxUI() {
  const pixBox = document.getElementById('pixBox');
  const pixInput = document.getElementById('pixKeyDisplay');
  const method = getSelectedPaymentMethod();
  const pixKey = getConfiguredPixKey();
  const show = method === 'pix';

  if (pixBox) pixBox.style.display = show ? 'flex' : 'none';
  if (pixInput) pixInput.value = pixKey || '';
  if (pixInput && !pixKey) {
    pixInput.placeholder = 'Chave Pix não configurada';
  }
}

async function copyPixKeyToClipboard() {
  const pixKey = getConfiguredPixKey();
  if (!pixKey) {
    showToast('⚠️ Chave Pix não configurada pela loja.');
    return;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(pixKey);
      showToast('✅ Chave Pix copiada!');
      return;
    }
  } catch {
    // fallback abaixo
  }

  const input = document.getElementById('pixKeyDisplay');
  if (input) {
    input.removeAttribute('readonly');
    input.select();
    document.execCommand('copy');
    input.setAttribute('readonly', 'readonly');
    showToast('✅ Chave Pix copiada!');
  }
}

function clearPixReceiptSelection({ silent = false } = {}) {
  PIX_RECEIPT = null;
  PIX_RECEIPT_UPLOAD_CACHE = null;

  const input = document.getElementById('pixReceiptFile');
  if (input) input.value = '';

  const preview = document.getElementById('pixReceiptPreview');
  const previewImg = document.getElementById('pixReceiptPreviewImg');
  const fileName = document.getElementById('pixReceiptFileName');

  if (preview) preview.style.display = 'none';
  if (previewImg) previewImg.removeAttribute('src');
  if (fileName) fileName.textContent = '';
  if (!silent) showToast('Comprovante removido.');
}

function updatePixReceiptPreview() {
  const preview = document.getElementById('pixReceiptPreview');
  const previewImg = document.getElementById('pixReceiptPreviewImg');
  const fileName = document.getElementById('pixReceiptFileName');
  if (!preview || !previewImg || !fileName) return;

  if (!PIX_RECEIPT || !PIX_RECEIPT.dataUrl) {
    preview.style.display = 'none';
    previewImg.removeAttribute('src');
    fileName.textContent = '';
    return;
  }

  previewImg.src = PIX_RECEIPT.dataUrl;
  fileName.textContent = PIX_RECEIPT.name || 'Comprovante selecionado';
  preview.style.display = 'flex';
}

function handlePixReceiptFileChange(file) {
  if (!file) {
    clearPixReceiptSelection({ silent: true });
    return;
  }

  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  if (!allowedTypes.has(String(file.type || '').toLowerCase())) {
    showToast('⚠️ Envie o comprovante em PNG, JPG ou WEBP.');
    clearPixReceiptSelection({ silent: true });
    return;
  }

  const maxBytes = 4 * 1024 * 1024;
  if (Number(file.size || 0) > maxBytes) {
    showToast('⚠️ Comprovante muito grande. Limite de 4MB.');
    clearPixReceiptSelection({ silent: true });
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = String(event.target.result || '');
    if (!dataUrl.startsWith('data:image/')) {
      showToast('⚠️ Arquivo inválido para comprovante.');
      clearPixReceiptSelection({ silent: true });
      return;
    }

    PIX_RECEIPT = {
      name: String(file.name || 'comprovante'),
      type: String(file.type || 'image/jpeg'),
      size: Number(file.size || 0),
      dataUrl,
    };
    PIX_RECEIPT_UPLOAD_CACHE = null;
    updatePixReceiptPreview();
    showToast('✅ Comprovante anexado!');
  };

  reader.onerror = () => {
    showToast('⚠️ Não foi possível ler o comprovante.');
    clearPixReceiptSelection({ silent: true });
  };
  reader.readAsDataURL(file);
}

async function uploadPixReceiptIfNeeded(clientRequestId) {
  if (!PIX_RECEIPT || !PIX_RECEIPT.dataUrl) return null;
  if (
    PIX_RECEIPT_UPLOAD_CACHE
    && PIX_RECEIPT_UPLOAD_CACHE.dataUrl === PIX_RECEIPT.dataUrl
    && PIX_RECEIPT_UPLOAD_CACHE.clientRequestId === clientRequestId
  ) {
    return PIX_RECEIPT_UPLOAD_CACHE.uploaded;
  }

  const response = await fetch(ORDER_RECEIPT_API, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientRequestId,
      fileName: PIX_RECEIPT.name,
      mimeType: PIX_RECEIPT.type,
      dataUrl: PIX_RECEIPT.dataUrl,
    }),
  });

  if (!response.ok) {
    let serverMessage = '';
    try {
      const body = await response.json();
      serverMessage = String(body.error || '').trim();
    } catch {
      serverMessage = '';
    }
    const error = new Error(serverMessage || `Falha no upload do comprovante (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }

  const body = await response.json();
  const uploaded = {
    uploadId: String(body.receipt.uploadId || '').trim(),
    url: String(body.receipt.url || '').trim(),
    fileName: String(body.receipt.fileName || PIX_RECEIPT.name || ''),
  };
  if (!uploaded.uploadId || !uploaded.url) {
    throw new Error('Servidor não vinculou o comprovante ao pedido.');
  }

  PIX_RECEIPT_UPLOAD_CACHE = {
    dataUrl: PIX_RECEIPT.dataUrl,
    clientRequestId,
    uploaded,
  };
  return uploaded;
}

function toPublicOrderReceiptUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const base = API_ORIGIN || window.location.origin;
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

function getPaymentLabel(method) {
  if (method === 'cartao') return 'Cartão';
  if (method === 'dinheiro') return 'Dinheiro';
  return 'Pix';
}

function parseMoneyInput(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return NaN;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw.replace(/\s/g, '');

  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  return Number(normalized);
}

function getCashGivenAmount() {
  const cashInput = document.getElementById('cashGiven');
  return parseMoneyInput(cashInput ? cashInput.value : '');
}

function applyDeliveryPaymentPolicy({ showNotice = false } = {}) {
  const isDelivery = ORDER_TYPE === 'entrega';
  const pixInput = getPaymentMethodInput('pix');
  const cardInput = getPaymentMethodInput('cartao');
  const cashInput = getPaymentMethodInput('dinheiro');
  const lockNote = document.getElementById('deliveryPixLockNote');

  if (isDelivery && pixInput) pixInput.checked = true;

  [pixInput, cardInput, cashInput].forEach((input) => {
    if (!input) return;
    const shouldDisable = isDelivery && input.value !== 'pix';
    input.disabled = shouldDisable;
    const option = input.closest('.payment-option');
    if (option) option.classList.toggle('locked', shouldDisable);
  });

  if (lockNote) lockNote.style.display = isDelivery ? 'block' : 'none';
  if (isDelivery && showNotice) openDeliveryPixNotice();
}

function normalizeOrderType(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'entrega') return 'entrega';
  if (normalized === 'consumo_local') return 'consumo_local';
  return 'retirada';
}

function normalizeTimeValue(rawValue) {
  const raw = String(rawValue || '').trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return '';
  return `${match[1]}:${match[2]}`;
}

function getLocalConsumptionTime() {
  const input = document.getElementById('localConsumptionTime');
  return normalizeTimeValue(input ? input.value : '');
}

const codepointEmoji = (...points) => String.fromCodePoint(...points);
const MSG_EMOJI = Object.freeze({
  order: codepointEmoji(0x1F355),
  customer: codepointEmoji(0x1F464),
  pickupType: codepointEmoji(0x1F3EA),
  localType: codepointEmoji(0x1F374),
  clock: codepointEmoji(0x23F0),
  deliveryType: codepointEmoji(0x1F69A),
  address: codepointEmoji(0x1F4CD),
  compass: codepointEmoji(0x1F30D),
  payment: codepointEmoji(0x1F4B3),
  cash: codepointEmoji(0x1F4B5),
  receipt: codepointEmoji(0x1F4DD),
  items: codepointEmoji(0x1F4CB),
  subtotal: codepointEmoji(0x1F6D2),
  total: codepointEmoji(0x1F4B0),
  store: codepointEmoji(0x1F3EA),
  confetti: codepointEmoji(0x1F389),
  thanks: codepointEmoji(0x1F60A),
  defaultItem: codepointEmoji(0x1F355),
  comboItem: codepointEmoji(0x1F354),
});

const ORDER_MESSAGE_SEP = '--------------------';
const BROKEN_CHAR_GLOBAL_REGEX = /[\uFFFD]|(?:\u00C3.|\u00E2.|\u00F0\u0178)/g;
const BROKEN_CHAR_TEST_REGEX = /[\uFFFD]|(?:\u00C3.|\u00E2.|\u00F0\u0178)/;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LEGACY_SIMPLE_ORDER_TEMPLATE_KEYS = new Set([
  normalizeCategoryIdentity('Ola {nome} Seu pedido {itens} Total {total} Obrigado'),
  normalizeCategoryIdentity('Ola, {nome}! Seu pedido: {itens} Total: {total} Obrigado!'),
]);

function decodeEscapedLineBreaks(value) {
  return String(value ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

function sanitizeOrderTemplateSetting(value) {
  const normalized = decodeEscapedLineBreaks(fixMojibakeText(value)).trim();
  if (!normalized) return '';
  const templateKey = normalizeCategoryIdentity(normalized);
  if (LEGACY_SIMPLE_ORDER_TEMPLATE_KEYS.has(templateKey)) return '';
  return normalized;
}

function stripLoneSurrogates(value) {
  const input = String(value ?? '');
  if (!input) return input;

  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const isHigh = code >= 0xD800 && code <= 0xDBFF;
    const isLow = code >= 0xDC00 && code <= 0xDFFF;

    if (!isHigh && !isLow) {
      out += input[i];
      continue;
    }

    if (isHigh) {
      const next = input.charCodeAt(i + 1);
      const nextIsLow = next >= 0xDC00 && next <= 0xDFFF;
      if (nextIsLow) {
        out += input[i] + input[i + 1];
        i += 1;
      }
      continue;
    }

    // Surrogate baixo solto: ignora.
  }

  return out;
}

function ensureWellFormedString(value) {
  const input = String(value ?? '');
  if (!input) return input;
  if (typeof input.toWellFormed === 'function') return input.toWellFormed();
  return stripLoneSurrogates(input);
}

function sanitizeWhatsAppText(value) {
  let text = fixMojibakeText(value);
  text = ensureWellFormedString(text);
  return text
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHAR_REGEX, '')
    .replace(BROKEN_CHAR_GLOBAL_REGEX, '');
}

function safeOrderText(value, fallback = '') {
  const cleaned = sanitizeWhatsAppText(value).trim();
  return cleaned || fallback;
}

function getSafeOrderEmoji(value, fallback = MSG_EMOJI.defaultItem) {
  const text = safeOrderText(value);
  if (!text) return fallback;
  if (BROKEN_CHAR_TEST_REGEX.test(text)) return fallback;
  return normalizeEmoji(text, fallback);
}

function buildWhatsAppOrderMessage({
  storeName,
  customerName,
  customerNote,
  orderType,
  deliveryAddress,
  localConsumptionTime,
  paymentLabel,
  paymentMethod,
  needsChange,
  cashGiven,
  pixKey,
  pixReceiptUrl,
  subtotal,
  delivery,
  total,
  items,
  customerGeo,
}) {
  const lines = [];
  const safeStoreName = safeOrderText(storeName, 'Sua Empresa');
  const safeCustomerName = safeOrderText(customerName, 'Cliente');
  const safeCustomerNote = safeOrderText(customerNote);
  const safeDeliveryAddress = safeOrderText(deliveryAddress);
  const safeLocalConsumptionTime = safeOrderText(localConsumptionTime);
  const safePixKey = safeOrderText(pixKey);
  const safePixReceiptUrl = safeOrderText(pixReceiptUrl);

  lines.push(`${MSG_EMOJI.order} *PEDIDO - ${safeStoreName}*`);
  lines.push(ORDER_MESSAGE_SEP);
  lines.push(`${MSG_EMOJI.customer} *Cliente:* ${safeCustomerName}`);
  if (safeCustomerNote) {
    lines.push(`${MSG_EMOJI.receipt} *Observação:* ${safeCustomerNote}`);
  }

  if (orderType === 'retirada') {
    lines.push(`${MSG_EMOJI.pickupType} *Tipo:* Retirada no local`);
  } else if (orderType === 'consumo_local') {
    lines.push(`${MSG_EMOJI.localType} *Consumo local:* ${safeLocalConsumptionTime}`);
  } else {
    lines.push(`${MSG_EMOJI.deliveryType} *Tipo:* Entrega`);
  }

  if (orderType === 'entrega') {
    lines.push(`${MSG_EMOJI.address} *Endereço:* ${safeDeliveryAddress}`);
    if (customerGeo && customerGeo.lat && customerGeo.lng) {
      lines.push(`${MSG_EMOJI.compass} *Localização:* https://maps.google.com/?q=${customerGeo.lat},${customerGeo.lng}`);
    }
  }

  lines.push(`${MSG_EMOJI.payment} *Pagamento:* ${safeOrderText(paymentLabel, 'Pix')}`);
  if (paymentMethod === 'pix' && safePixKey) {
    lines.push(`${MSG_EMOJI.cash} *Chave Pix:* ${safePixKey}`);
    if (safePixReceiptUrl) {
      lines.push(`${MSG_EMOJI.receipt} *Comprovante:* ${safePixReceiptUrl}`);
    }
  }
  if (paymentMethod === 'dinheiro') {
    if (needsChange) {
      const change = Number(cashGiven) - Number(total);
      lines.push(`${MSG_EMOJI.cash} *Troco para:* ${formatCurrency(cashGiven)}`);
      lines.push(`${MSG_EMOJI.receipt} *Troco:* ${formatCurrency(change)}`);
    } else {
      lines.push(`${MSG_EMOJI.cash} *Troco:* Não precisa`);
    }
  }

  lines.push(ORDER_MESSAGE_SEP);
  lines.push('');
  lines.push(`${MSG_EMOJI.items} *ITENS DO PEDIDO:*`);

  items.forEach((item) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.price || 0);
    const itemTotal = unitPrice * qty;
    const fallbackItemEmoji = item.isCombo ? MSG_EMOJI.comboItem : MSG_EMOJI.defaultItem;
    const itemEmoji = getSafeOrderEmoji(item.emoji, fallbackItemEmoji);
    const itemName = safeOrderText(item.name, 'Item');
    const borderLabel = safeOrderText(item.borderLabel || item.borderSelection?.label || item.border?.label);
    const borderPrice = Number(item.borderPrice ?? item.borderSelection?.price ?? item.border?.price ?? 0);

    lines.push('');
    lines.push(`${itemEmoji} *${itemName}*`);
    if (borderLabel) {
      lines.push(`   Borda: ${borderLabel}${borderPrice > 0 ? ` (+${formatCurrency(borderPrice)})` : ''}`);
    }
    lines.push(`   Qtd: ${qty}x  |  Unitário: ${formatCurrency(unitPrice)}`);
    lines.push(`   Subtotal: ${formatCurrency(itemTotal)}`);
  });

  lines.push('');
  lines.push(ORDER_MESSAGE_SEP);
  lines.push(`${MSG_EMOJI.subtotal} *Subtotal:* ${formatCurrency(subtotal)}`);

  if (orderType === 'retirada') {
    lines.push(`${MSG_EMOJI.store} *Retirada:* No balcão`);
  } else if (orderType === 'consumo_local') {
    lines.push(`${MSG_EMOJI.localType} *Consumo local:* ${safeLocalConsumptionTime}`);
  } else {
    lines.push(
      delivery === 0
        ? `${MSG_EMOJI.deliveryType} *Entrega:* Grátis ${MSG_EMOJI.confetti}`
        : `${MSG_EMOJI.deliveryType} *Taxa de entrega:* ${formatCurrency(delivery)}`,
    );
  }

  lines.push(`${MSG_EMOJI.total} *TOTAL: ${formatCurrency(total)}*`);
  lines.push(ORDER_MESSAGE_SEP);
  lines.push('');
  lines.push('Por favor, confirme meu pedido!');
  lines.push(`Obrigado(a) ${MSG_EMOJI.thanks}`);

  return lines.join('\n');
}

function getOrderTypeMessageLabel(orderType) {
  if (orderType === 'entrega') return 'Entrega';
  if (orderType === 'consumo_local') return 'Consumo local';
  return 'Retirada';
}

function buildOrderItemsTemplateText(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'Sem itens';
  return items.map((item) => {
    const qty = Number(item?.quantity || 0);
    const unitPrice = Number(item?.price || 0);
    const itemTotal = unitPrice * qty;
    const fallbackItemEmoji = item?.isCombo ? MSG_EMOJI.comboItem : MSG_EMOJI.defaultItem;
    const itemEmoji = getSafeOrderEmoji(item?.emoji, fallbackItemEmoji);
    const itemName = safeOrderText(item?.name, 'Item');
    return `${itemEmoji} ${itemName} x${qty} (${formatCurrency(itemTotal)})`;
  }).join('\n');
}

function buildCustomOrderMessage({
  fallbackMessage = '',
  customerName = '',
  customerNote = '',
  orderType = 'retirada',
  deliveryAddress = '',
  localConsumptionTime = '',
  paymentLabel = '',
  subtotal = 0,
  delivery = 0,
  total = 0,
  items = [],
}) {
  const template = sanitizeOrderTemplateSetting(ORDER_SETTINGS.msgTemplate);
  const greeting = String(ORDER_SETTINGS.greeting || '').trim();
  // Mantem o layout rico (com emojis e negrito) como padrao.
  // A mensagem personalizada so entra quando houver template configurado.
  if (!template) return fallbackMessage;

  const orderTypeLabel = getOrderTypeMessageLabel(orderType);
  const itemsText = buildOrderItemsTemplateText(items);
  const replacements = {
    greeting,
    saudacao: greeting,
    nome: safeOrderText(customerName, 'Cliente'),
    cliente: safeOrderText(customerName, 'Cliente'),
    observacao: safeOrderText(customerNote, '-'),
    'observação': safeOrderText(customerNote, '-'),
    obs: safeOrderText(customerNote, '-'),
    itens: itemsText,
    subtotal: formatCurrency(subtotal),
    entrega: delivery === 0 ? 'Grátis' : formatCurrency(delivery),
    taxaEntrega: delivery === 0 ? 'Grátis' : formatCurrency(delivery),
    total: formatCurrency(total),
    pagamento: safeOrderText(paymentLabel, 'Pix'),
    tipoPedido: orderTypeLabel,
    endereco: safeOrderText(deliveryAddress, '-'),
    horarioConsumo: safeOrderText(localConsumptionTime, '-'),
  };

  let message = template;
  Object.entries(replacements).forEach(([token, value]) => {
    message = message.replace(new RegExp(`\\{${token}\\}`, 'gi'), value);
  });

  const hasGreetingPlaceholder = /\{(?:greeting|saudacao)\}/i.test(template);
  if (greeting && !hasGreetingPlaceholder) {
    message = `${greeting}\n\n${message}`;
  }

  const safeCustomerNote = safeOrderText(customerNote);
  const hasNotePlaceholder = /\{(?:observacao|observação|obs)\}/i.test(template);
  if (safeCustomerNote && !hasNotePlaceholder) {
    message = `${message}\n\nObservação: ${safeCustomerNote}`;
  }

  const normalized = sanitizeWhatsAppText(message).trim();
  return normalized || fallbackMessage;
}

function encodeWhatsAppMessage(message) {
  const sanitized = ensureWellFormedString(message)
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHAR_REGEX, '');
  try {
    return encodeURIComponent(sanitized);
  } catch {
    const withoutSurrogates = stripLoneSurrogates(sanitized);
    return encodeURIComponent(withoutSurrogates);
  }
}

function normalizeWhatsAppPhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function buildWhatsAppUrl(phoneNumber, message) {
  const phone = normalizeWhatsAppPhone(phoneNumber);
  const safeMessage = ensureWellFormedString(message)
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHAR_REGEX, '');

  try {
    const url = phone
      ? new URL(`https://wa.me/${phone}`)
      : new URL('https://api.whatsapp.com/send');
    url.searchParams.set('text', safeMessage);
    return url.toString();
  } catch {
    const encoded = encodeWhatsAppMessage(safeMessage);
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return `${base}?text=${encoded}`;
  }
}

function isSafariLikeWhatsAppClient() {
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isIOS = /iPad|iPhone|iPod/i.test(ua)
    || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const isSafari = /Safari/i.test(ua)
    && !/Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|SamsungBrowser|Android/i.test(ua);
  return isIOS || isSafari;
}

function navigateCurrentTabToExternalUrl(url) {
  try {
    window.location.assign(url);
    return true;
  } catch {
    try {
      window.location.href = url;
      return true;
    } catch {
      return false;
    }
  }
}

function openExternalUrlInNewTab(url) {
  let popup = null;
  try {
    popup = window.open(url, '_blank');
  } catch {
    popup = null;
  }

  if (!popup) return false;

  try {
    popup.opener = null;
  } catch {
    // Ignora navegadores que nao permitem alterar opener.
  }

  try {
    popup.focus();
  } catch {
    // Sem problema: a aba/app externo ja foi solicitado.
  }

  return true;
}

function openWhatsAppOrderUrl(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return false;

  if (isSafariLikeWhatsAppClient()) {
    return navigateCurrentTabToExternalUrl(targetUrl);
  }

  if (openExternalUrlInNewTab(targetUrl)) return true;
  return navigateCurrentTabToExternalUrl(targetUrl);
}

function setOrderType(type, { fromUser = false } = {}) {
  ORDER_TYPE = normalizeOrderType(type);
  updateOrderTypeUI();
  applyDeliveryPaymentPolicy({ showNotice: fromUser && ORDER_TYPE === 'entrega' });
  if (ORDER_TYPE === 'entrega') setSelectedPaymentMethod('pix');
  handlePaymentMethodChange();
  updateCartUI();
  if (ORDER_TYPE === 'entrega' || ORDER_TYPE === 'consumo_local') {
    setTimeout(() => scrollCartFooterToBottom(), 60);
  }
}

function updateOrderTypeUI() {
  document.querySelectorAll('.order-type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.orderType === ORDER_TYPE);
  });

  const deliveryBox = document.getElementById('deliveryBox');
  if (deliveryBox) {
    deliveryBox.style.display = ORDER_TYPE === 'entrega' ? 'flex' : 'none';
  }

  const localConsumptionBox = document.getElementById('localConsumptionBox');
  if (localConsumptionBox) {
    localConsumptionBox.style.display = ORDER_TYPE === 'consumo_local' ? 'flex' : 'none';
  }

  if (ORDER_TYPE === 'entrega' && !AUTO_LOCATION_REQUESTED) {
    AUTO_LOCATION_REQUESTED = true;
    captureCustomerLocation({ silent: true });
  }
}

function captureCustomerLocation({ silent = false } = {}) {
  const statusEl = document.getElementById('locationStatus');
  const button = document.getElementById('btnGetLocation');

  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = 'Geolocalização não suportada no navegador.';
    if (!silent) showToast('⚠️ Geolocalização não suportada no navegador.');
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Localizando...';
  }
  if (statusEl) statusEl.textContent = 'Buscando sua localização...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = Number(position.coords.latitude).toFixed(6);
      const lng = Number(position.coords.longitude).toFixed(6);
      const accuracy = Math.round(position.coords.accuracy || 0);

      CUSTOMER_GEO = { lat, lng, accuracy };

      if (statusEl) statusEl.textContent = `Localização capturada (${accuracy}m).`;
      if (!silent) showToast('📍 Localização capturada com sucesso!');

      if (button) {
        button.disabled = false;
        button.textContent = 'Atualizar localização';
      }
      if (isMobileClient()) saveMobileRuntimeState();
    },
    (error) => {
      let message = 'Não foi possível obter sua localização.';
      if (error && error.code === 1) message = 'Permissão de localização negada.';
      if (error && error.code === 2) message = 'Localização indisponível no momento.';
      if (error && error.code === 3) message = 'Tempo esgotado ao buscar localização.';

      if (statusEl) statusEl.textContent = message;
      if (!silent) showToast(`⚠️ ${message}`);

      if (button) {
        button.disabled = false;
        button.textContent = 'Usar minha localização';
      }
      if (isMobileClient()) saveMobileRuntimeState();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function handlePaymentMethodChange() {
  let method = getSelectedPaymentMethod();
  if (ORDER_TYPE === 'entrega' && method !== 'pix') {
    setSelectedPaymentMethod('pix');
    method = 'pix';
  }

  const cashBox = document.getElementById('cashChangeBox');
  const changeInputs = document.getElementById('changeInputs');
  const needsChange = document.getElementById('needsChange');
  const cashInput = document.getElementById('cashGiven');
  const changePreview = document.getElementById('changePreview');

  const isCash = method === 'dinheiro';
  if (cashBox) cashBox.style.display = isCash ? 'flex' : 'none';

  if (!isCash) {
    if (needsChange) needsChange.checked = false;
    if (changeInputs) changeInputs.style.display = 'none';
    if (cashInput) cashInput.value = '';
    if (changePreview) {
      changePreview.textContent = '';
      changePreview.classList.remove('ok', 'warn');
    }
  }

  updatePixBoxUI();
  updateChangePreview();
  if (isCash) {
    setTimeout(() => scrollCartFooterToBottom(), 60);
  }
}

function handleChangeNeedToggle() {
  const needsChange = document.getElementById('needsChange');
  const changeInputs = document.getElementById('changeInputs');
  const cashInput = document.getElementById('cashGiven');
  const changePreview = document.getElementById('changePreview');

  const enabled = !!(needsChange && needsChange.checked);
  if (changeInputs) changeInputs.style.display = enabled ? 'flex' : 'none';

  if (!enabled) {
    if (cashInput) cashInput.value = '';
    if (changePreview) {
      changePreview.textContent = '';
      changePreview.classList.remove('ok', 'warn');
    }
  }

  updateChangePreview();
  if (enabled) {
    setTimeout(() => scrollCartFooterToBottom(), 60);
  }
}

function scrollCartFooterToBottom() {
  const footer = document.getElementById('cartFooter');
  if (!footer || footer.style.display === 'none') return;

  const hasOverflow = (footer.scrollHeight - footer.clientHeight) > 2;
  if (hasOverflow) {
    if (typeof footer.scrollTo === 'function') {
      footer.scrollTo({ top: footer.scrollHeight, behavior: 'smooth' });
    } else {
      footer.scrollTop = footer.scrollHeight;
    }
    return;
  }

  const panel = document.querySelector('.cart-panel');
  if (!panel) return;
  if (typeof panel.scrollTo === 'function') {
    panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
  } else {
    panel.scrollTop = panel.scrollHeight;
  }
}

function updateChangePreview() {
  const preview = document.getElementById('changePreview');
  const needsChange = document.getElementById('needsChange');
  const isCash = getSelectedPaymentMethod() === 'dinheiro';

  if (!preview || !isCash || !needsChange || !needsChange.checked) {
    if (preview) {
      preview.textContent = '';
      preview.classList.remove('ok', 'warn');
    }
    return;
  }

  const amount = getCashGivenAmount();
  if (!Number.isFinite(amount) || amount <= 0) {
    preview.textContent = '';
    preview.classList.remove('ok', 'warn');
    return;
  }

  const { total } = getCartTotals();
  const change = amount - total;

  if (change < 0) {
    preview.textContent = `Faltam ${formatCurrency(Math.abs(change))}`;
    preview.classList.add('warn');
    preview.classList.remove('ok');
  } else {
    preview.textContent = `Troco: ${formatCurrency(change)}`;
    preview.classList.add('ok');
    preview.classList.remove('warn');
  }
}

function setupCheckoutOptions() {
  const typeButtons = document.getElementById('orderTypeButtons');
  if (typeButtons && typeButtons.dataset.bound !== 'true') {
    typeButtons.dataset.bound = 'true';
    typeButtons.addEventListener('click', (event) => {
      const btn = event.target.closest('.order-type-btn');
      if (!btn) return;
      setOrderType(btn.dataset.orderType, { fromUser: true });
    });
  }

  const locationBtn = document.getElementById('btnGetLocation');
  if (locationBtn && locationBtn.dataset.bound !== 'true') {
    locationBtn.dataset.bound = 'true';
    locationBtn.addEventListener('click', () => captureCustomerLocation());
  }

  const copyPixBtn = document.getElementById('btnCopyPixKey');
  if (copyPixBtn && copyPixBtn.dataset.bound !== 'true') {
    copyPixBtn.dataset.bound = 'true';
    copyPixBtn.addEventListener('click', () => copyPixKeyToClipboard());
  }

  const pixReceiptInput = document.getElementById('pixReceiptFile');
  if (pixReceiptInput && pixReceiptInput.dataset.bound !== 'true') {
    pixReceiptInput.dataset.bound = 'true';
    pixReceiptInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0] || null;
      handlePixReceiptFileChange(file);
    });
  }

  const removePixReceiptBtn = document.getElementById('btnRemovePixReceipt');
  if (removePixReceiptBtn && removePixReceiptBtn.dataset.bound !== 'true') {
    removePixReceiptBtn.dataset.bound = 'true';
    removePixReceiptBtn.addEventListener('click', () => clearPixReceiptSelection());
  }

  const localConsumptionTimeInput = document.getElementById('localConsumptionTime');
  if (localConsumptionTimeInput && localConsumptionTimeInput.dataset.bound !== 'true') {
    localConsumptionTimeInput.dataset.bound = 'true';
    localConsumptionTimeInput.addEventListener('input', () => updateCartUI());
  }

  document.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
    if (input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('change', handlePaymentMethodChange);
  });

  const needsChange = document.getElementById('needsChange');
  if (needsChange && needsChange.dataset.bound !== 'true') {
    needsChange.dataset.bound = 'true';
    needsChange.addEventListener('change', handleChangeNeedToggle);
  }

  const cashInput = document.getElementById('cashGiven');
  if (cashInput && cashInput.dataset.bound !== 'true') {
    cashInput.dataset.bound = 'true';
    cashInput.addEventListener('input', updateChangePreview);
  }

  setOrderType(ORDER_TYPE);
  updatePixBoxUI();
}

function loadPendingOrderLogsQueue() {
  try {
    const raw = localStorage.getItem(ORDER_LOGS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
  } catch {
    return [];
  }
}

function savePendingOrderLogsQueue(queue) {
  try {
    if (!Array.isArray(queue) || queue.length === 0) {
      localStorage.removeItem(ORDER_LOGS_QUEUE_KEY);
      return true;
    }

    localStorage.setItem(ORDER_LOGS_QUEUE_KEY, JSON.stringify(queue.slice(-ORDER_LOGS_QUEUE_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

function enqueuePendingOrderLog(orderPayload) {
  const queue = loadPendingOrderLogsQueue();
  queue.push(orderPayload);
  return savePendingOrderLogsQueue(queue);
}

function createOrderClientRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // Usa o identificador alternativo abaixo.
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildOrderConfirmationCode(clientRequestId) {
  const compact = String(clientRequestId || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!compact) return '';
  return `WEB-${compact.slice(-8).padStart(8, '0')}`;
}

async function postOrderLog(orderPayload) {
  let response;
  try {
    response = await fetch(ORDER_LOGS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
  } catch (error) {
    if (error && typeof error === 'object') error.retryableOrderLog = true;
    throw error;
  }
  if (response.ok) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  let serverMessage = '';
  try {
    const body = await response.json();
    serverMessage = String(body?.error || body?.message || '').trim();
  } catch {
    serverMessage = '';
  }
  const error = new Error(serverMessage || `Falha ao validar o pedido (HTTP ${response.status}).`);
  error.httpStatus = response.status;
  error.retryableOrderLog = response.status === 429 || response.status >= 500;
  throw error;
}

async function flushPendingOrderLogs() {
  if (ORDER_LOGS_QUEUE_FLUSHING) return;
  const queue = loadPendingOrderLogsQueue();
  if (!queue.length) return;

  ORDER_LOGS_QUEUE_FLUSHING = true;
  try {
    let keepFromIndex = queue.length;
    for (let i = 0; i < queue.length; i += 1) {
      try {
        await postOrderLog(queue[i]);
        keepFromIndex = i + 1;
      } catch (error) {
        if (error?.retryableOrderLog === false) {
          console.warn('Pedido pendente descartado porque o servidor o rejeitou.', error);
          keepFromIndex = i + 1;
          continue;
        }
        keepFromIndex = i;
        break;
      }
    }

    if (keepFromIndex >= queue.length) {
      savePendingOrderLogsQueue([]);
      return;
    }

    savePendingOrderLogsQueue(queue.slice(keepFromIndex));
  } finally {
    ORDER_LOGS_QUEUE_FLUSHING = false;
  }
}

async function registerOrderLog(orderPayload) {
  await flushPendingOrderLogs();

  try {
    const responseBody = await postOrderLog(orderPayload);
    return { synced: true, responseBody };
  } catch (error) {
    if (error?.retryableOrderLog === false) {
      console.warn('Pedido rejeitado pelo servidor; WhatsApp nao sera aberto.', error);
      throw error;
    }
    const queued = enqueuePendingOrderLog(orderPayload);
    console.warn('Falha ao registrar pedido no admin.', error);
    if (queued) {
      showToast('Pedido enviado no WhatsApp e será sincronizado no painel assim que a conexão voltar.', 4200);
    } else {
      showToast('Pedido enviado no WhatsApp, mas não foi registrado no painel.', 4200);
    }
    return { synced: false, responseBody: null };
  }
}

/** Calcula os totais do carrinho */
function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const delivery = ORDER_TYPE === 'entrega'
    ? (subtotal >= CONFIG.freeDeliveryAt ? 0 : CONFIG.deliveryFee)
    : 0;
  const total = subtotal + delivery;
  return { subtotal, delivery, total };
}

function ensureCartLayoutCompatibility() {
  const footer = document.getElementById('cartFooter');
  if (!footer) return;

  let viewBtn = document.getElementById('btnToggleOrderView');
  if (!viewBtn) {
    viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn-order-view';
    viewBtn.id = 'btnToggleOrderView';
    viewBtn.textContent = 'Ver meu pedido';
    footer.prepend(viewBtn);
  }
  viewBtn.onclick = () => toggleOrderDetails();

  let previewPanel = document.getElementById('orderPreviewPanel');
  if (!previewPanel) {
    previewPanel = document.createElement('div');
    previewPanel.className = 'order-preview-panel';
    previewPanel.id = 'orderPreviewPanel';
    previewPanel.style.display = 'none';
  }

  let previewHeader = previewPanel.querySelector('.order-preview-header');
  if (!previewHeader) {
    previewHeader = document.createElement('div');
    previewHeader.className = 'order-preview-header';
  }

  let previewTitle = previewHeader.querySelector('strong');
  if (!previewTitle) {
    previewTitle = document.createElement('strong');
    previewTitle.textContent = 'Itens do pedido';
    previewHeader.appendChild(previewTitle);
  }

  let editBtn = document.getElementById('btnToggleOrderEdit');
  if (!editBtn) {
    editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-order-edit';
    editBtn.id = 'btnToggleOrderEdit';
    editBtn.textContent = 'Editar meu pedido';
  }
  editBtn.onclick = () => toggleOrderEdit();

  if (!previewHeader.contains(editBtn)) {
    previewHeader.appendChild(editBtn);
  }

  if (!previewPanel.contains(previewHeader)) {
    previewPanel.insertBefore(previewHeader, previewPanel.firstChild);
  }

  let itemsContainer = document.getElementById('cartItems');
  if (!itemsContainer) {
    itemsContainer = document.createElement('div');
    itemsContainer.className = 'cart-items';
    itemsContainer.id = 'cartItems';
  }

  if (itemsContainer.parentElement !== previewPanel) {
    previewPanel.appendChild(itemsContainer);
  }

  if (previewPanel.parentElement !== footer) {
    if (viewBtn.nextSibling) {
      footer.insertBefore(previewPanel, viewBtn.nextSibling);
    } else {
      footer.appendChild(previewPanel);
    }
  } else if (viewBtn.nextSibling !== previewPanel) {
    footer.removeChild(previewPanel);
    if (viewBtn.nextSibling) {
      footer.insertBefore(previewPanel, viewBtn.nextSibling);
    } else {
      footer.appendChild(previewPanel);
    }
  }

  if (!document.getElementById('cartLayoutCompatStyle')) {
    const style = applyDocumentCspNonce(document.createElement('style'));
    style.id = 'cartLayoutCompatStyle';
    style.textContent = `
      .cart-footer { flex: 1; min-height: 0; max-height: none; overflow-y: auto; }
      .order-preview-panel .cart-items { flex: 0 1 auto; max-height: 240px; }
      @media (max-width: 900px) {
        .cart-footer { flex: 1 !important; max-height: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}

function syncOrderPreviewState({ clearItemsWhenHidden = true } = {}) {
  ensureCartLayoutCompatibility();
  const previewPanel = document.getElementById('orderPreviewPanel');
  const toggleViewBtn = document.getElementById('btnToggleOrderView');
  const toggleEditBtn = document.getElementById('btnToggleOrderEdit');
  const itemsContainer = document.getElementById('cartItems');
  const hasItems = cart.length > 0;

  if (!hasItems) {
    ORDER_PREVIEW_OPEN = false;
    ORDER_PREVIEW_EDITING = false;
  }

  const isOpen = hasItems && ORDER_PREVIEW_OPEN;
  const isEditing = isOpen && ORDER_PREVIEW_EDITING;

  if (toggleViewBtn) {
    toggleViewBtn.textContent = isOpen ? 'Ocultar meu pedido' : 'Ver meu pedido';
  }

  if (previewPanel) {
    previewPanel.style.display = isOpen ? 'flex' : 'none';
  }

  if (toggleEditBtn) {
    toggleEditBtn.textContent = isEditing ? 'Concluir edição' : 'Editar meu pedido';
  }

  if (!isOpen && clearItemsWhenHidden && itemsContainer) {
    itemsContainer.innerHTML = '';
  }
}

function toggleOrderDetails() {
  ensureCartLayoutCompatibility();
  if (cart.length === 0) {
    showToast('⚠️ Adicione itens ao carrinho primeiro!');
    return;
  }

  ORDER_PREVIEW_OPEN = !ORDER_PREVIEW_OPEN;
  if (!ORDER_PREVIEW_OPEN) {
    ORDER_PREVIEW_EDITING = false;
  }

  syncOrderPreviewState();
  if (ORDER_PREVIEW_OPEN) {
    renderCartItems();
  }
}

function toggleOrderEdit() {
  ensureCartLayoutCompatibility();
  if (cart.length === 0) return;

  if (!ORDER_PREVIEW_OPEN) {
    ORDER_PREVIEW_OPEN = true;
  }

  ORDER_PREVIEW_EDITING = !ORDER_PREVIEW_EDITING;
  syncOrderPreviewState({ clearItemsWhenHidden: false });
  renderCartItems();
}

/** Atualiza toda a UI do carrinho */
function updateCartUI() {
  ensureCartLayoutCompatibility();
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const { subtotal, delivery, total } = getCartTotals();

  // Badges (header + FAB)
  document.getElementById('cartBadgeHeader').textContent = totalItems;
  document.getElementById('fabBadge').textContent = totalItems;

  // Carrinho vazio vs preenchido
  const cartEmpty = document.getElementById('cartEmpty');
  const cartFooter = document.getElementById('cartFooter');
  const cartItems = document.getElementById('cartItems');

  if (cart.length === 0) {
    cartEmpty.style.display = 'flex';
    cartFooter.style.display = 'none';
    if (cartItems) cartItems.innerHTML = '';
    syncOrderPreviewState();
  } else {
    cartEmpty.style.display = 'none';
    cartFooter.style.display = 'flex';
    syncOrderPreviewState({ clearItemsWhenHidden: false });

    if (ORDER_PREVIEW_OPEN) {
      renderCartItems();
    } else if (cartItems) {
      cartItems.innerHTML = '';
    }
  }

  // Totais
  document.getElementById('cartSubtotal').textContent = formatCurrency(subtotal);
  const deliveryLabel = document.getElementById('cartDeliveryLabel');
  const deliveryValue = document.getElementById('cartDelivery');
  const localConsumptionTime = getLocalConsumptionTime();
  if (ORDER_TYPE === 'retirada') {
    if (deliveryLabel) deliveryLabel.textContent = 'Retirada';
    if (deliveryValue) deliveryValue.textContent = 'No balcão';
  } else if (ORDER_TYPE === 'consumo_local') {
    if (deliveryLabel) deliveryLabel.textContent = 'Consumo local';
    if (deliveryValue) deliveryValue.textContent = localConsumptionTime ? localConsumptionTime : 'Defina o horário';
  } else {
    if (deliveryLabel) deliveryLabel.textContent = 'Taxa de entrega';
    if (deliveryValue) deliveryValue.textContent = delivery === 0 ? '🎉 Grátis' : formatCurrency(delivery);
  }
  document.getElementById('cartTotal').textContent = formatCurrency(total);
  updateChangePreview();

  if (isMobileClient()) {
    saveMobileRuntimeState();
  }
}

/** Renderiza os itens dentro do painel do carrinho */
function renderCartItems() {
  const container = document.getElementById('cartItems');
  if (!container) return;

  if (!ORDER_PREVIEW_OPEN) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const isEditing = ORDER_PREVIEW_EDITING;

  cart.forEach(item => {
    const itemIdLiteral = toInlineJsStringLiteral(item.id);
    const itemName = escapeHtml(item.name || '');
    const itemEmoji = escapeHtml(item.emoji || '🛒');
    const itemTitle = escapeHtml(item.name || '');
    const canReplacePizza = isEditing && isCartItemReplaceablePizza(item);
    const replacePizzaButton = canReplacePizza
      ? `<button class="btn-edit-pizza" onclick="editCartPizza(${itemIdLiteral})" title="Trocar sabor da pizza">Trocar sabor</button>`
      : '';
    const el = document.createElement('div');
    el.className = 'cart-item';
    el.id = `cart-item-${item.id}`;
    el.innerHTML = `
      <div class="cart-item-emoji">${itemEmoji}</div>
      <div class="cart-item-info">
        <div class="cart-item-name" title="${itemTitle}">${itemName}</div>
        ${item.borderLabel ? `<div class="cart-item-border">Borda: ${escapeHtml(item.borderLabel)}${Number(item.borderPrice || 0) > 0 ? ` (+${formatCurrency(item.borderPrice)})` : ''}</div>` : ''}
        <div class="cart-item-price">${formatCurrency(item.price * item.quantity)}</div>
        ${replacePizzaButton}
      </div>
      ${isEditing
        ? `<div class="cart-item-controls">
            <button class="qty-btn minus" onclick="changeQuantity(${itemIdLiteral}, -1)" title="Diminuir">-</button>
            <span class="qty-count">${item.quantity}</span>
            <button class="qty-btn plus" onclick="changeQuantity(${itemIdLiteral}, +1)" title="Aumentar">+</button>
            <button class="btn-remove-item" onclick="removeFromCart(${itemIdLiteral})" title="Remover">🗑</button>
          </div>`
        : `<div class="cart-item-summary">Qtd: ${item.quantity}</div>`
      }
    `;
    container.appendChild(el);
  });
}

/* ════════════════════════════════════════════════════════════
   ENVIO DO PEDIDO VIA WHATSAPP
   ════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   CONTROLES DO PAINEL DO CARRINHO
   ════════════════════════════════════════════════════════════ */

/** Abre/fecha o painel lateral do carrinho */
function blurActiveFormField() {
  const activeEl = document.activeElement;
  if (!activeEl) return;

  const tag = activeEl.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    activeEl.blur();
  }
}

function toggleCart() {
  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');
  const isOpen = panel.classList.contains('open');

  if (isOpen) {
    blurActiveFormField();
  }

  panel.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

/** Anima o FAB ao adicionar item */
function animateFab() {
  const badge = document.getElementById('fabBadge');
  badge.classList.remove('bump');
  void badge.offsetWidth; // reset animation
  badge.classList.add('bump');
}

/* ════════════════════════════════════════════════════════════
   HEADER SCROLL BEHAVIOR
   ════════════════════════════════════════════════════════════ */
function setupScrollBehavior() {
  let lastScrollY = 0;
  const header = document.getElementById('mainHeader');

  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;
    // Adiciona sombra no scroll
    header.style.boxShadow = currentY > 10
      ? '0 4px 30px rgba(0,0,0,.15)'
      : '0 2px 20px rgba(0,0,0,.1)';
    lastScrollY = currentY;
  }, { passive: true });
}

/* ════════════════════════════════════════════════════════════
   INTERSECTION OBSERVER  Animação de entrada nas seções
   ════════════════════════════════════════════════════════════ */
function setActiveCategoryButton(category) {
  const allButtons = document.querySelectorAll('.cat-btn');
  let matched = false;

  allButtons.forEach((btn) => {
    const isMatch = String(btn.dataset.category || '') === String(category);
    btn.classList.toggle('active', isMatch);
    if (isMatch) matched = true;
  });

  if (!matched && String(category) !== 'all') {
    allButtons.forEach((btn) => {
      btn.classList.toggle('active', String(btn.dataset.category || '') === 'all');
    });
  }
}

function setupIntersectionObserver() {
  const options = { threshold: 0.1, rootMargin: '0px 0px -60px 0px' };
  const syncAllButtonAtTop = () => {
    if (activeCategory !== 'all') return;
    if (window.scrollY <= 16) setActiveCategoryButton('all');
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || activeCategory !== 'all') return;

      if (window.scrollY <= 16) {
        setActiveCategoryButton('all');
        return;
      }

      const sectionCat = entry.target.dataset.section;
      if (sectionCat) setActiveCategoryButton(sectionCat);
    });
  }, options);

  document.querySelectorAll('.menu-section, .combos-section').forEach(el => observer.observe(el));
  window.addEventListener('scroll', syncAllButtonAtTop, { passive: true });
  syncAllButtonAtTop();
}

/* ════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  setupPwaSupport();
  const restoredRuntimeState = restoreMobileRuntimeState();
  let catalogBootstrapped = false;

  const serverBootstrap = loadServerBootstrapData();
  if (serverBootstrap?.data) {
    applyRemoteData(serverBootstrap.data);
    LAST_REMOTE_HASH = buildRemoteHash(serverBootstrap.data);
    rememberRemoteManifest(serverBootstrap.manifest);
    saveRemoteDataCache(serverBootstrap.data);
    catalogBootstrapped = true;
  }

  if (!catalogBootstrapped) {
    const cachedRemoteData = loadRemoteDataCache();
    if (cachedRemoteData) {
      if (hasMeaningfulRemoteCatalog(cachedRemoteData)) {
        applyRemoteData(cachedRemoteData);
        LAST_REMOTE_HASH = buildRemoteHash(cachedRemoteData);
      } else {
        clearRemoteDataCache();
      }
    }
  }
  const initialRemoteSync = catalogBootstrapped
    ? Promise.resolve(false)
    : loadDataFromApi({
      silent: true,
      timeoutMs: API_BOOTSTRAP_TIMEOUT_MS,
    });

  if (window.location.protocol === 'file:') {
    console.warn('Arquivo aberto via file://. Para sincronizar dados, use http://localhost:8000.');
    showToast('Abra em http://localhost:8000 para salvar e sincronizar dados.', 4800);
  }

  // 1. Prepara labels/flags iniciais
  applyCategoryAndSectionLabels();
  applyVisualVisibility();

  // 2. Configura links e render inicial (imediato)
  setupWhatsAppLinks();
  renderAnnouncements();
  renderCombos();
  renderAllProducts();
  reconcileCartWithCatalog();

  // 4. Configura checkout (retirada/entrega e pagamento)
  setupCheckoutOptions();
  applyRestoredCheckoutState(restoredRuntimeState);
  setupRuntimeStateAutoSave();

  // 5. Atualiza UI do carrinho (estado inicial)
  updateCartUI();

  // 6. Configura navegação por categorias
  setupCategoryNav();

  // 7. Configura busca
  setupSearch();

  // 7.1 Configura confirmação customizada para limpar carrinho
  setupClearCartConfirmation();
  setupPizzaCompositionModal();
  setupPizzaSwapModal();
  setupDeliveryPixNotice();

  // 8. Comportamento no scroll
  setupScrollBehavior();

  // 9. Observer de seções visíveis
  setupIntersectionObserver();

  // 10. Aplica filtros iniciais após carregar dados/flags visuais
  filterProducts();

  // 10.1 Instala o guard de encoding em segundo plano para nao atrasar a abertura.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => installMojibakeGuard(), { timeout: 1200 });
  } else {
    setTimeout(() => installMojibakeGuard(), 0);
  }

  // 11. Sincroniza dados remotos sem bloquear a abertura do site
  initialRemoteSync
    .then((changed) => {
      if (!changed) return;
      refreshCatalogUi();
    })
    .catch(() => { });

  // 12. Mantém o cardápio sincronizado com as mudanças do admin
  startAutoSync({ runNow: false });
  flushPendingOrderLogs();

  window.addEventListener('online', () => {
    flushPendingOrderLogs();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushPendingOrderLogs();
    }
  });

  // 13. Fecha carrinho ao pressionar ESC
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    if (isPizzaCompositionModalOpen()) {
      e.preventDefault();
      closePizzaCompositionModal(null);
      return;
    }

    if (isPizzaSwapModalOpen()) {
      e.preventDefault();
      closePizzaSwapModal(null);
      return;
    }

    if (isDeliveryPixNoticeOpen()) {
      e.preventDefault();
      closeDeliveryPixNotice();
      return;
    }

    if (isClearCartConfirmationOpen()) {
      e.preventDefault();
      closeClearCartConfirmation(false);
      return;
    }

    const panel = document.getElementById('cartPanel');
    if (panel.classList.contains('open')) toggleCart();
  });

  window.addEventListener('beforeunload', () => {
    if (isMobileClient()) saveMobileRuntimeState();
  });

  console.log(`%c🍕 ${getStoreDisplayName(CONFIG.storeName)} - Cardapio carregado! ${PRODUCTS.length} produtos disponiveis.`,
    'color:#C0392B; font-weight:bold; font-size:14px;');
});

/* ── Popup de carregamento ao enviar pedido ───────────────── */
let SEND_ORDER_IN_FLIGHT = false;

function ensureSendOrderOverlayStyles() {
  if (document.getElementById('sendOrderOverlayStyles')) return;
  const style = applyDocumentCspNonce(document.createElement('style'));
  style.id = 'sendOrderOverlayStyles';
  style.textContent = `
    .send-order-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      opacity: 0;
      transition: opacity .3s ease;
    }
    .send-order-overlay.open {
      display: flex;
      opacity: 1;
    }
    .send-order-popup {
      background: var(--white, #fff);
      border-radius: 20px;
      padding: 40px 32px 36px;
      max-width: 340px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      animation: sendOrderPopupEnter .4s cubic-bezier(.22, 1, .36, 1) forwards;
    }
    @keyframes sendOrderPopupEnter {
      from { opacity: 0; transform: scale(0.85) translateY(20px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .send-order-popup .sop-icon {
      font-size: 48px;
      margin-bottom: 16px;
      display: block;
    }
    .send-order-popup .sop-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--dark, #1a1a1a);
      margin: 0 0 8px;
    }
    .send-order-popup .sop-message {
      font-size: 0.92rem;
      color: var(--gray, #666);
      margin: 0 0 24px;
      line-height: 1.5;
    }

    /* Spinner */
    .sop-spinner {
      display: inline-block;
      width: 44px;
      height: 44px;
      border: 4px solid var(--gray-light, #e0e0e0);
      border-top-color: var(--whatsapp, #25D366);
      border-radius: 50%;
      animation: sopSpin 0.8s linear infinite;
      margin-bottom: 4px;
    }
    @keyframes sopSpin {
      to { transform: rotate(360deg); }
    }

    /* Estado de sucesso */
    .sop-success-check {
      display: none;
      margin: 0 auto 4px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--whatsapp, #25D366);
      position: relative;
    }
    .sop-success-check::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 14px;
      height: 24px;
      border: solid #fff;
      border-width: 0 4px 4px 0;
      transform: translate(-50%, -58%) rotate(45deg);
      animation: sopCheckPop .35s ease forwards;
    }
    @keyframes sopCheckPop {
      from { opacity: 0; transform: translate(-50%, -58%) rotate(45deg) scale(0); }
      to   { opacity: 1; transform: translate(-50%, -58%) rotate(45deg) scale(1); }
    }
    .send-order-popup.success .sop-spinner { display: none; }
    .send-order-popup.success .sop-success-check { display: block; }
  `;
  document.head.appendChild(style);
}

function getSendOrderOverlay() {
  let overlay = document.getElementById('sendOrderOverlay');
  if (overlay) return overlay;

  ensureSendOrderOverlayStyles();

  overlay = document.createElement('div');
  overlay.id = 'sendOrderOverlay';
  overlay.className = 'send-order-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Enviando pedido');
  overlay.innerHTML = `
    <div class="send-order-popup" id="sendOrderPopup">
      <span class="sop-icon">📲</span>
      <div class="sop-spinner" id="sopSpinner"></div>
      <div class="sop-success-check" id="sopSuccessCheck"></div>
      <p class="sop-title" id="sopTitle">Preparando seu pedido...</p>
      <p class="sop-message" id="sopMessage">Aguarde, estamos montando tudo para enviar ao WhatsApp.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function showSendOrderOverlay(title, message) {
  const overlay = getSendOrderOverlay();
  const popup = document.getElementById('sendOrderPopup');
  const titleEl = document.getElementById('sopTitle');
  const msgEl = document.getElementById('sopMessage');
  const iconEl = overlay.querySelector('.sop-icon');

  if (popup) popup.classList.remove('success');
  if (iconEl) iconEl.textContent = '📲';
  if (titleEl) titleEl.textContent = title || 'Preparando seu pedido...';
  if (msgEl) msgEl.textContent = message || 'Aguarde, estamos montando tudo para enviar ao WhatsApp.';

  // Força reflow para a transição funcionar
  overlay.classList.remove('open');
  void overlay.offsetWidth;
  overlay.classList.add('open');
}

function updateSendOrderOverlay(title, message) {
  const titleEl = document.getElementById('sopTitle');
  const msgEl = document.getElementById('sopMessage');
  if (titleEl) titleEl.textContent = title || '';
  if (msgEl) msgEl.textContent = message || '';
}

function showSendOrderSuccess(title, message) {
  const popup = document.getElementById('sendOrderPopup');
  const iconEl = popup?.parentElement?.querySelector('.sop-icon') || popup?.querySelector('.sop-icon');
  const titleEl = document.getElementById('sopTitle');
  const msgEl = document.getElementById('sopMessage');

  if (popup) popup.classList.add('success');
  if (iconEl) iconEl.textContent = '✅';
  if (titleEl) titleEl.textContent = title || 'Pedido enviado!';
  if (msgEl) msgEl.textContent = message || 'Você será redirecionado ao WhatsApp.';
}

function hideSendOrderOverlay() {
  const overlay = document.getElementById('sendOrderOverlay');
  if (overlay) overlay.classList.remove('open');
}

async function sendWhatsAppOrder() {
  // ── Trava contra cliques duplos ──
  if (SEND_ORDER_IN_FLIGHT) return;

  if (cart.length === 0) {
    showToast('⚠️ Adicione itens ao carrinho primeiro!');
    return;
  }
  if (ORDER_SETTINGS.storeOpen === false) {
    showToast(ORDER_SETTINGS.closedMsg || DEFAULT_ORDER_SETTINGS.closedMsg);
    return;
  }

  const customerName = (document.getElementById('customerName').value || '').trim();
  const customerNote = (document.getElementById('customerNote').value || '').trim();
  const deliveryAddress = (document.getElementById('deliveryAddress').value || '').trim();
  const localConsumptionTime = getLocalConsumptionTime();
  const paymentMethod = getSelectedPaymentMethod();
  const paymentLabel = getPaymentLabel(paymentMethod);
  const needsChange = paymentMethod === 'dinheiro' && !!document.getElementById('needsChange').checked;
  const { subtotal, delivery, total } = getCartTotals();
  const cashGiven = needsChange ? getCashGivenAmount() : NaN;
  const pixKey = paymentMethod === 'pix' ? getConfiguredPixKey() : '';
  const minimumValue = Number(ORDER_SETTINGS.minValue || 0);
  let pixReceiptUpload = null;

  if (Number.isFinite(minimumValue) && minimumValue > 0 && subtotal < minimumValue) {
    showToast(`⚠️ Pedido mínimo: ${formatCurrency(minimumValue)}.`);
    return;
  }

  if (!customerName) {
    showToast('Informe seu nome para enviar o pedido.');
    document.getElementById('customerName').focus();
    return;
  }

  if (ORDER_TYPE === 'entrega' && !deliveryAddress) {
    showToast('⚠️ Informe o endereço para entrega.');
    document.getElementById('deliveryAddress').focus();
    return;
  }

  if (ORDER_TYPE === 'consumo_local' && !localConsumptionTime) {
    showToast('⚠️ Informe o horário para consumo local.');
    document.getElementById('localConsumptionTime').focus();
    return;
  }

  if (ORDER_TYPE === 'entrega' && paymentMethod !== 'pix') {
    setSelectedPaymentMethod('pix');
    handlePaymentMethodChange();
    openDeliveryPixNotice();
    showToast('⚠️ Para entrega, o pagamento deve ser via Pix.');
    return;
  }

  if (needsChange) {
    if (!Number.isFinite(cashGiven) || cashGiven <= 0) {
      showToast('⚠️ Informe um valor válido para troco.');
      document.getElementById('cashGiven').focus();
      return;
    }
    if (cashGiven < total) {
      showToast(`⚠️ Valor em dinheiro menor que o total (${formatCurrency(total)}).`);
      document.getElementById('cashGiven').focus();
      return;
    }
  }

  if (paymentMethod === 'pix' && !pixKey) {
    showToast('⚠️ A loja ainda não configurou a chave Pix.');
    return;
  }

  // ── Todas as validações passaram → trava e mostra popup ──
  SEND_ORDER_IN_FLIGHT = true;
  showSendOrderOverlay('Preparando seu pedido...', 'Aguarde, estamos montando tudo para enviar ao WhatsApp.');

  try {
    const clientRequestId = createOrderClientRequestId();
    const confirmationCode = buildOrderConfirmationCode(clientRequestId);
    if (paymentMethod === 'pix' && PIX_RECEIPT && PIX_RECEIPT.dataUrl) {
      try {
        updateSendOrderOverlay('Enviando comprovante...', 'Fazendo upload do comprovante Pix.');
        pixReceiptUpload = await uploadPixReceiptIfNeeded(clientRequestId);
      } catch (error) {
        const status = Number(error.status || 0);
        if (status === 404) {
          showToast('⚠️ Servidor sem rota de comprovante. Pedido será enviado sem anexo.');
          pixReceiptUpload = null;
        } else {
          showToast(`⚠️ ${String(error.message || 'Falha ao enviar comprovante Pix.')}`);
          SEND_ORDER_IN_FLIGHT = false;
          hideSendOrderOverlay();
          return;
        }
      }
    }

    updateSendOrderOverlay('Enviando para o WhatsApp...', 'Seu pedido está quase pronto!');

    const pixReceiptUrl = paymentMethod === 'pix'
      ? toPublicOrderReceiptUrl(pixReceiptUpload?.url || '')
      : '';

    const fallbackMsg = buildWhatsAppOrderMessage({
      storeName: CONFIG.storeName,
      customerName,
      customerNote,
      orderType: ORDER_TYPE,
      deliveryAddress,
      localConsumptionTime,
      paymentLabel,
      paymentMethod,
      needsChange,
      cashGiven,
      pixKey,
      pixReceiptUrl,
      subtotal,
      delivery,
      total,
      items: cart,
      customerGeo: CUSTOMER_GEO,
    });
    const customMessage = buildCustomOrderMessage({
      fallbackMessage: fallbackMsg,
      customerName,
      customerNote,
      orderType: ORDER_TYPE,
      deliveryAddress,
      localConsumptionTime,
      paymentLabel,
      subtotal,
      delivery,
      total,
      items: cart,
    });
    const preparedMessage = confirmationCode
      ? `${customMessage}\n\n*Codigo de confirmacao:* ${confirmationCode}`
      : customMessage;

    const orderPayload = {
      orderCode: `PED-${Date.now().toString().slice(-8)}`,
      clientRequestId,
      createdAt: new Date().toISOString(),
      storeName: CONFIG.storeName,
      customerName: customerName || '',
      customerNote: customerNote || '',
      orderType: ORDER_TYPE,
      deliveryAddress: ORDER_TYPE === 'entrega' ? deliveryAddress : '',
      localConsumptionTime: ORDER_TYPE === 'consumo_local' ? localConsumptionTime : '',
      location: ORDER_TYPE === 'entrega' && CUSTOMER_GEO ? { ...CUSTOMER_GEO } : null,
      payment: {
        method: paymentMethod,
        label: paymentLabel,
        needsChange: Boolean(needsChange),
        cashGiven: Number.isFinite(cashGiven) ? cashGiven : null,
        change: needsChange && Number.isFinite(cashGiven) ? Math.max(cashGiven - total, 0) : null,
        pixKey: paymentMethod === 'pix' ? pixKey : '',
        pixReceiptUrl,
        pixReceiptFileName: paymentMethod === 'pix'
          ? String(pixReceiptUpload?.fileName || PIX_RECEIPT?.name || '')
          : '',
        pixReceiptUploadId: paymentMethod === 'pix'
          ? String(pixReceiptUpload?.uploadId || '')
          : '',
      },
      totals: { subtotal, delivery, total },
      items: cart.map(item => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
        isCombo: Boolean(item.isCombo),
        emoji: item.emoji,
        size: item.size,
        sizeKey: item.sizeKey,
        isHalfPizza: Boolean(item.isHalfPizza),
        halfPizzaFirstId: item.halfPizzaFirstId || '',
        halfPizzaSecondId: item.halfPizzaSecondId || '',
        borderSelection: item.borderSelection || null,
        borderLabel: item.borderLabel || '',
        borderPrice: Number(item.borderPrice || 0),
      })),
      whatsappMessage: preparedMessage,
    };
    const registration = await registerOrderLog(orderPayload);
    const serverConfirmationCode = String(
      registration?.responseBody?.orderLog?.confirmation?.code || confirmationCode,
    ).trim();
    const confirmedMessage = serverConfirmationCode
      ? `${customMessage}\n\n*Codigo de confirmacao:* ${serverConfirmationCode}`
      : customMessage;
    const msg = registration?.synced
      ? confirmedMessage
      : `${confirmedMessage}\n\n*Modo manual:* o painel da loja pode levar alguns instantes para sincronizar este pedido.`;

    // ── Mostra sucesso e abre o WhatsApp após um breve delay ──
    showSendOrderSuccess(
      registration?.synced ? 'Pedido preparado!' : 'Pedido em modo manual',
      registration?.synced
        ? 'Confirme o codigo no WhatsApp com a loja.'
        : 'Envie a mensagem e aguarde a confirmacao da loja.',
    );

    const whatsappURL = buildWhatsAppUrl(CONFIG.whatsappNumber, msg);
    const opensInCurrentTab = isSafariLikeWhatsAppClient();

    // Delay para o cliente ver a confirmação antes do redirecionamento
    await new Promise(resolve => setTimeout(resolve, opensInCurrentTab ? 300 : 1200));

    const opened = openWhatsAppOrderUrl(whatsappURL);
    if (!opened) {
      showToast('Nao foi possivel abrir o WhatsApp automaticamente. Toque no botao novamente.');
      return;
    }

    clearCartAfterSuccessfulOrder();

    if (opensInCurrentTab) return;

    // Mantém o popup visível mais um pouco para evitar cliques acidentais
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error('Erro ao enviar pedido:', error);
    showToast(String(error?.message || 'Ocorreu um erro ao enviar o pedido. Tente novamente.'));
  } finally {
    SEND_ORDER_IN_FLIGHT = false;
    hideSendOrderOverlay();
  }
}
