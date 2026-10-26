/* ==========================================================
  Bella Forno – Painel Administrativo
  admin.js – Lógica completa: dados, CRUD, UI, LocalStorage
  ========================================================== */

/* ==========================================================
   CREDENCIAIS DE ACESSO
   ⚠️ Em produção, substitua por autenticação real no backend.
   ========================================================== */
/* ==========================================================
   CHAVES DO LOCALSTORAGE
   ========================================================== */
const LS = {
  config: 'bf_config',
  products: 'bf_products',
  categories: 'bf_categories',
  combos: 'bf_combos',
  promotions: 'bf_promotions',
  announcements: 'bf_announcements',
  visual: 'bf_visual',
  orders: 'bf_orders',
  fiscal: 'bf_fiscal',
  ncmCatalog: 'bf_ncm_catalog',
  borders: 'bf_pizza_borders',
};

function resolveApiOrigin() {
  if (window.location.protocol !== 'file:') return '';
  const saved = localStorage.getItem('bf_api_origin');
  return saved ? String(saved).trim().replace(/\/+$/, '') : 'http://localhost:8000';
}

const API_ORIGIN = resolveApiOrigin();
const API_BASE = `${API_ORIGIN}/api/data`;
const PRODUCTS_API_BASE = `${API_ORIGIN}/api/products`;
const ORDER_LOGS_API = `${API_ORIGIN}/api/order-logs`;
const ADMIN_API_BASE = `${API_ORIGIN}/api/admin`;
const ADMIN_DATA_API_BASE = `${ADMIN_API_BASE}/data`;
const CASHIER_API_BASE = `${API_ORIGIN}/api/cashier`;
const FISCAL_API_BASE = `${API_ORIGIN}/api/fiscal`;
const STOCK_API_BASE = `${API_ORIGIN}/api/stock`;
const PRINT_AGENT_ADMIN_API = `${ADMIN_API_BASE}/print-agent`;
const WAITER_USERS_ADMIN_API = `${ADMIN_API_BASE}/waiter-users`;
const WAITER_AUDIT_ADMIN_API = `${ADMIN_API_BASE}/waiter-audit`;
const AUTO_PRINT_STORAGE_KEY = 'bf_auto_print_settings';
const AUTO_PRINT_WINDOW_NAME = 'bf_auto_print_window';
const ORDER_LOGS_POLL_INTERVAL_MS = 8000;
const ORDER_LOGS_FOREGROUND_FETCH_LIMIT = 500;
const ORDER_LOGS_BACKGROUND_FETCH_LIMIT = 120;
const NEW_ORDER_ANNOUNCEMENT_TEXT = 'Novo pedido recebido, aguardando a confirmação!';
const NEW_ORDER_ANNOUNCEMENT_MAX_TRACKED_IDS = 1000;
const ADMIN_FETCH_TIMEOUT_MS = 12000;
const RECEIPT_TIME_ZONE = 'America/Sao_Paulo';
const DEFAULT_PRINT_PROFILE = 'thermal80';
const PRINT_LAYOUT_PROFILES = Object.freeze({
  thermal58: Object.freeze({
    id: 'thermal58',
    label: 'Termica 58mm',
    pageSize: '58mm auto',
    contentWidth: '50mm',
    previewWidthPx: 420,
    previewHeightPx: 940,
    pageMarginMm: 2,
    baseFontPx: 10.5,
    metaFontPx: 9.5,
    titleFontPx: 12,
    codeFontPx: 11,
  }),
  thermal80: Object.freeze({
    id: 'thermal80',
    label: 'Termica 80mm',
    pageSize: '80mm auto',
    contentWidth: '72mm',
    previewWidthPx: 460,
    previewHeightPx: 940,
    pageMarginMm: 2,
    baseFontPx: 11,
    metaFontPx: 10,
    titleFontPx: 13,
    codeFontPx: 12,
  }),
  a4: Object.freeze({
    id: 'a4',
    label: 'Papel A4',
    pageSize: 'A4 portrait',
    contentWidth: '185mm',
    previewWidthPx: 980,
    previewHeightPx: 900,
    pageMarginMm: 8,
    baseFontPx: 13,
    metaFontPx: 11,
    titleFontPx: 18,
    codeFontPx: 13,
  }),
});

function getDocumentCspNonceAttribute() {
  const nonce = document.querySelector('meta[name="csp-nonce"]')?.content || '';
  return nonce ? ` nonce="${nonce}"` : '';
}
let ORDER_LOGS_POLL_TIMER = null;
let ORDER_LOGS_FETCH_IN_PROGRESS = false;
let ORDER_LOGS_FETCH_PENDING = false;
let NEW_ORDER_ANNOUNCEMENT_READY = false;
let NEW_ORDER_ANNOUNCEMENT_HIGHEST_ID = 0;
let NEW_ORDER_ANNOUNCED_IDS = new Set();
let ADMIN_WAITER_USERS = [];
let ADMIN_WAITER_AUDIT = [];
let ADMIN_SESSION_PROFILE = { user: '', displayName: 'Admin', csrfToken: '' };
const LS_TO_SECTION = {
  [LS.config]: 'config',
  [LS.products]: 'products',
  [LS.categories]: 'categories',
  [LS.combos]: 'combos',
  [LS.promotions]: 'promotions',
  [LS.announcements]: 'announcements',
  [LS.visual]: 'visual',
  [LS.orders]: 'orders',
  [LS.fiscal]: 'fiscal',
  [LS.borders]: 'borders',
};
const KNOWN_SECTIONS = new Set(Object.values(LS_TO_SECTION));

const MOJIBAKE_TEXT_FIXES = Object.freeze([
  ['ÃƒÂ¡', 'á'], ['ÃƒÂ¢', 'â'], ['ÃƒÂ£', 'ã'], ['ÃƒÂ©', 'é'], ['ÃƒÂª', 'ê'],
  ['ÃƒÂ­', 'í'], ['ÃƒÂ³', 'ó'], ['ÃƒÂ´', 'ô'], ['ÃƒÂº', 'ú'], ['ÃƒÂ§', 'ç'],
  ['\u00C3\u0081', 'Á'], ['Ãƒâ€°', 'É'], ['Ãƒâ€œ', 'Ó'], ['ÃƒÅ¡', 'Ú'], ['Ãƒâ€¡', 'Ç'],
  ['Ãƒâ‚¬', 'À'], ['ÃƒÂ±', 'ñ'], ['ÃƒÂ¼', 'ü'],
  ['Ã¢â‚¬â€œ', '-'], ['Ã¢â‚¬â€', '-'], ['Ã¢â‚¬Ëœ', '\''], ['Ã¢â‚¬â„¢', '\''],
  ['Ã¢â‚¬Å“', '"'], ['Ã¢â‚¬Â', '"'], ['Ã¢â‚¬Â¦', '...'],
  ['Ã‚Â©', '©'], ['Ã‚', ''],
  ['Ã¢Å¡Â Ã¯Â¸Â', '⚠️'], ['Ã¢Å“â€¦', '✅'], ['Ã°Å¸â€œÂ', '📍'], ['Ã°Å¸â€”â€˜Ã¯Â¸Â', '🗑️'],
  ['Ã°Å¸â€”â€˜', '🗑'], ['Ã°Å¸â€ºâ€™', '🛒'], ['Ã°Å¸Å½â€°', '🎉'], ['Ã°Å¸Ââ€¢', '🍕'],
  ['Ã°Å¸Ââ€', '🍔'], ['Ã°Å¸ÂÅ¸', '🍟'], ['Ã°Å¸Â¥Â¤', '🥤'], ['Ã°Å¸ÂÂ°', '🍰'],
  ['Ã°Å¸Â§â‚¬', '🧀'], ['Ã°Å¸Ââ€”', '🍗'], ['Ã°Å¸Å’Â±', '🌱'], ['Ã°Å¸ÂÅ ', '🍊'],
  ['Ã°Å¸â€™Â§', '💧'], ['Ã°Å¸Â¥â€º', '🥛'], ['Ã°Å¸ÂÂ«', '🍫'], ['Ã°Å¸ÂÂ®', '🍮'],
  ['Ã°Å¸Å½â€š', '🎂'], ['Ã°Å¸â€˜Â¨Ã¢â‚¬ÂÃ°Å¸â€˜Â©Ã¢â‚¬ÂÃ°Å¸â€˜Â§Ã¢â‚¬ÂÃ°Å¸â€˜Â¦', '👨‍👩‍👧‍👦'],
  ['Ã°Å¸â€˜Â«', '👫'], ['Ã°Å¸â„¢â€¹', '🙋'], ['Ã°Å¸â€Â', '🔍'], ['Ã°Å¸â€ºÂµ', '🛵'],
  ['Ã°Å¸Â§â€š', '🧂'], ['Ã¢Â­Â', '⭐'],
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

  const brokenPattern = /(?:\u00C3[^\u0000-\u007F]|\u00C2[^\u0000-\u007F]|\u00E2[^\u0000-\u007F]|\u00F0\u0178|\u00EF\u00B8|\uFFFD)/g;
  const looksBroken = (input) => {
    brokenPattern.lastIndex = 0;
    return brokenPattern.test(input);
  };
  const brokenScore = (input) => {
    brokenPattern.lastIndex = 0;
    return (input.match(brokenPattern) || []).length;
  };
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

function normalizeMojibakeAttributeOnElement(element, attrNames = ['placeholder', 'title', 'aria-label', 'alt']) {
  if (!(element instanceof Element)) return;
  attrNames.forEach((attr) => {
    if (!element.hasAttribute(attr)) return;
    const current = element.getAttribute(attr);
    const fixed = fixMojibakeText(current);
    if (fixed !== current) element.setAttribute(attr, fixed);
  });
}

function normalizeMojibakeAttributes(root, attrNames = ['placeholder', 'title', 'aria-label', 'alt']) {
  if (!root) return;
  if (root instanceof Element) {
    normalizeMojibakeAttributeOnElement(root, attrNames);
  }
  if (!(root instanceof Element) || typeof root.querySelectorAll !== 'function') return;
  attrNames.forEach((attr) => {
    root.querySelectorAll(`[${attr}]`).forEach((node) => {
      normalizeMojibakeAttributeOnElement(node, [attr]);
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
  if (window.__adminMojibakeGuardInstalled) return;
  window.__adminMojibakeGuardInstalled = true;
  normalizeMojibakeTextNodes(document.body);
  let isNormalizing = false;
  const normalizeSafely = (fn) => {
    if (isNormalizing) return;
    isNormalizing = true;
    try {
      fn();
    } finally {
      isNormalizing = false;
    }
  };

  const observer = new MutationObserver((mutations) => {
    if (isNormalizing) return;
    normalizeSafely(() => {
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
          const attrName = String(mutation.attributeName || '').trim();
          if (attrName) {
            normalizeMojibakeAttributeOnElement(mutation.target, [attrName]);
          }
          continue;
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
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'],
  });
}

/* ==========================================================
   ESTADO DA APLICAÇÃO
   ========================================================== */
let STATE = {
  products: [],
  categories: [],
  combos: [],
  promotions: [],
  announcements: [],
  config: {},
  visual: {},
  orders: {},
  fiscal: {},
  ncmCatalog: [],
  orderLogs: [],
  orderLogsTotalCount: 0,
  orderLogsPendingCount: 0,
  stock: { items: [], movements: [], analytics: { summary: {}, products: [] } },
  stockPeriod: '30d',
  stockLoadSequence: 0,
  stockMovementFlow: null,
  stockXmlInvoice: null,
  borders: [],
  cashier: {
    loading: false,
    summary: null,
    fiscalStatus: null,
    sefazStatus: null,
    closedSessions: [],
    fiscalEvents: [],
    ordersDateFrom: '',
    ordersDateTo: '',
    ordersDateInitialized: false,
  },
  orderLogsFilterDate: '',
  autoPrint: {
    enabled: false,
    profile: DEFAULT_PRINT_PROFILE,
    armedAt: 0,
    printedOrderIds: [],
    skippedNoNameOrderIds: [],
    windowRef: null,
    connected: false,
    warnedDisconnected: false,
    isProcessing: false,
    consecutiveFailures: 0,
    serverSilentSupported: null,
    warnedServerFallback: false,
  },
  printAgent: {
    status: null,
    loading: false,
  },
  cashierPaymentResolve: null,
  cashierPaymentModal: {
    allowSplit: false,
    amountCents: 0,
  },
  currentPage: 'dashboard',
  editingId: null,       // ID do item sendo editado
  confirmCb: null,       // Callback do modal de confirmação
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  selectedComboProducts: [],  // Produtos selecionados no modal de combo
  selectedPromoProducts: [],  // Produtos selecionados no modal de promoção
};

/* ==========================================================
   DADOS INICIAIS DE DEMONSTRAÇÃO
   ========================================================== */
const DEMO_CONFIG = {
  storeName: 'Sua Empresa',
  slogan: 'Feito com amor desde 2015',
  description: 'A melhor pizzaria da cidade, com ingredientes frescos e muito sabor.',
  street: 'Rua das Flores',
  number: '420',
  neighborhood: 'Centro',
  city: 'Sua Cidade',
  state: 'SP',
  cep: '00000-000',
  phone: '(11) 3333-4444',
  whatsapp: '5511+55 (XX) XXXXX-XXXX',
  email: 'contato@empresa.com',
  instagram: '@suaempresa',
  facebook: 'facebook.com/suaempresa',
  footerText: '© 2026 Sua Empresa. Todos os direitos reservados.',
  logo: '',
  banner: '',
  colorPrimary: '#C0392B',
  colorSecondary: '#E67E22',
  colorBg: '#FDF6EC',
  colorText: '#1A1A1A',
  colorSurface: '#FFFFFF',
  colorSurfaceDark: '#4B1912',
  colorOnDark: '#FFFFFF',
  colorWhatsapp: '#25D366',
  schedule: [
    { day: 'Segunda', open: '11:00', close: '23:00', active: true },
    { day: 'Terça', open: '11:00', close: '23:00', active: true },
    { day: 'Quarta', open: '11:00', close: '23:00', active: true },
    { day: 'Quinta', open: '11:00', close: '23:00', active: true },
    { day: 'Sexta', open: '11:00', close: '23:00', active: true },
    { day: 'Sábado', open: '11:00', close: '00:00', active: true },
    { day: 'Domingo', open: '12:00', close: '22:00', active: true },
  ],
};

const DEMO_VISUAL = {
  heroTitle1: 'Sabor que',
  heroTitle2: 'você não esquece',
  heroSubtitle: 'Pizzas artesanais, hambúrgueres gourmet e muito mais.',
  heroBadge: '🔥 Mais Pedidos',
  heroCta: 'Ver Cardápio',
  heroFloatingImage: '',
  heroFloatingName: 'Pizza Margherita',
  heroFloatingPrice: 'R$ 52,90',
  promoBannerText: '🔥 HOJE: Compre 2 pizzas grandes e ganhe uma bebida grátis!',
  promoBannerActive: true,
  deliveryTime: '30–45 min',
  rating: '⭐ 4.9/5',
  freeDelivery: 'Entrega grátis +R$60',
  secPromoBanner: true,
  secHero: true,
  secCombos: true,
  secPizzas: true,
  secHamb: true,
  secPorcoes: true,
  secBebidas: true,
  secSobremesas: true,
};

const DEMO_ORDERS = {
  whatsapp: '5511+55 (XX) XXXXX-XXXX',
  pixKey: '',
  greeting: 'Olá! Gostaria de fazer um pedido 🍕',
  msgTemplate: '',
  deliveryFee: 5.00,
  freeDeliveryAt: 60.00,
  minValue: 20.00,
  deliveryTime: '30–45 min',
  storeOpen: true,
  closedMsg: 'Estamos fechados no momento. Volte em breve! 😊',
  openTime: '11:00',
  closeTime: '23:00',
  neighborhoods: ['Centro', 'Jardim América', 'Vila Nova', 'Bela Vista'],
};

const DEMO_FISCAL = {
  enabled: false,
  transmitEnabled: false,
  documentType: 'nfce',
  environment: 'homologacao',
  uf: 'SP',
  cnpj: '',
  ie: '',
  im: '',
  corporateName: '',
  tradeName: '',
  crt: '1',
  cityCode: '',
  cnae: '',
  addressStreet: '',
  addressNumber: '',
  addressNeighborhood: '',
  addressCity: '',
  addressUf: '',
  addressCep: '',
  addressPhone: '',
  natureOperation: 'Venda de mercadoria',
  seriesNfce: '1',
  nextNumberNfce: '1',
  seriesNfe: '1',
  nextNumberNfe: '1',
  cscId: '',
  csc: '',
  certificatePath: '',
  certificatePassword: '',
  sefazStatusUrl: '',
  offlinePreValidation: true,
  defaultCfop: '',
  defaultNcm: '',
  defaultCest: '',
  defaultCsosn: '',
  defaultOrigin: '0',
  defaultUnit: 'UN',
  defaultAliquotaIcms: 0,
  deliveryFiscal: {
    fiscalCode: 'ENTREGA',
    fiscalName: 'Taxa de entrega',
    ncm: '',
    cest: '',
    cfop: '',
    csosn: '',
    cst: '',
    origin: '',
    unit: 'UN',
    aliquotaIcms: 0,
  },
  cashierPermissions: {
    operatorLockEnabled: false,
    managerPin: '',
    requireManagerForRefund: true,
    requireManagerForFiscalConfig: true,
    requireManagerForFiscalTransmit: true,
    requireManagerForFiscalEvents: true,
    requireManagerForClose: false,
  },
  contingency: {
    enabled: false,
    mode: 'offline',
    reason: '',
    startedAt: '',
    updatedAt: '',
  },
};

const DEFAULT_NCM_CATALOG = Object.freeze([
  { code: '19059090', title: 'Pizzas, paes e produtos de padaria similares', examples: 'pizza, esfirra, pao de alho, massas assadas', category: 'Pizzas e massas' },
  { code: '21069090', title: 'Outras preparacoes alimenticias', examples: 'preparacoes prontas, combos alimenticios, itens sem NCM especifico definido', category: 'Alimentos' },
  { code: '22011000', title: 'Agua mineral ou gaseificada sem acucar', examples: 'agua mineral, agua com gas, agua sem gas', category: 'Bebidas' },
  { code: '22021000', title: 'Bebidas adoçadas ou aromatizadas', examples: 'refrigerante, agua saborizada, energetico sem alcool', category: 'Bebidas' },
  { code: '20099000', title: 'Sucos e misturas de sucos', examples: 'suco pronto, suco natural vendido como bebida', category: 'Bebidas' },
  { code: '21050010', title: 'Sorvetes', examples: 'sorvete, sobremesa com sorvete', category: 'Sobremesas' },
  { code: '18069000', title: 'Chocolate e outras preparacoes com cacau', examples: 'brownie, bolo de chocolate, sobremesa com chocolate', category: 'Sobremesas' },
  { code: '17049020', title: 'Confeitos sem cacau', examples: 'bala, caramelo, doces diversos', category: 'Sobremesas' },
  { code: '09012100', title: 'Cafe torrado nao descafeinado', examples: 'cafe espresso, cafe coado', category: 'Bebidas' },
  { code: '22030000', title: 'Cervejas de malte', examples: 'cerveja lata, long neck, chopp quando aplicavel', category: 'Bebidas alcoolicas' },
  { code: '22042100', title: 'Vinhos em recipiente de ate 2 litros', examples: 'vinho garrafa 750ml', category: 'Bebidas alcoolicas' },
  { code: '21039021', title: 'Molhos e preparacoes para molhos', examples: 'maionese temperada, molho barbecue, molho especial vendido separado', category: 'Molhos' },
  { code: '04061090', title: 'Queijos frescos e similares', examples: 'mussarela, queijo fresco vendido como item', category: 'Ingredientes vendidos' },
  { code: '16023220', title: 'Preparacoes de carne de frango', examples: 'frango empanado, porcao de frango pronta', category: 'Porcoes' },
]);

const DEMO_CATEGORIES = [
  { id: 'cat-1', name: 'Pizzas', description: 'Massa artesanal, forno a lenha, ingredientes frescos', icon: '🍕', color: '#C0392B', order: 1, active: true },
  { id: 'cat-2', name: 'Hambúrgueres', description: 'Blend especial da casa, pao brioche artesanal', icon: '🍔', color: '#E67E22', order: 2, active: true },
  { id: 'cat-3', name: 'Porções', description: 'Perfeitas para compartilhar', icon: '🍟', color: '#27AE60', order: 3, active: true },
  { id: 'cat-4', name: 'Bebidas', description: 'Refrigerantes, sucos naturais e muito mais', icon: '🥤', color: '#2980B9', order: 4, active: true },
  { id: 'cat-5', name: 'Sobremesas', description: 'Finalize com o melhor', icon: '🍰', color: '#8E44AD', order: 5, active: true },
];

const DEMO_PRODUCTS = [
  { id: 'p-1', name: 'Pizza Margherita', category: 'cat-1', emoji: '🍕', price: 52.90, oldPrice: null, description: 'Molho de tomate San Marzano, mussarela de búfala e manjericão.', ingredients: 'Massa artesanal, molho San Marzano, mussarela de búfala, manjericão, azeite.', size: 'Grande (35cm)', observations: '', badge: 'Mais Pedido', featured: true, active: true, image: '' },
  { id: 'p-2', name: 'Pizza Quatro Queijos', category: 'cat-1', emoji: '🧀', price: 62.90, oldPrice: null, description: 'Quatro queijos artesanais derretidos.', ingredients: 'Mussarela, parmesão, gorgonzola, catupiry, orégano.', size: 'Grande (35cm)', observations: '', badge: '', featured: false, active: true, image: '' },
  { id: 'p-3', name: 'Pizza Stroganoff de Frango', category: 'cat-1', emoji: '🍗', price: 69.90, oldPrice: null, description: 'Frango desfiado, catupiry cremoso e temperos especiais.', ingredients: 'Massa artesanal, molho de tomate, mussarela, frango desfiado, catupiry, cebola.', size: 'Grande (35cm)', observations: '', badge: 'Novo', featured: false, active: true, image: '' },
  { id: 'p-4', name: 'Pizza Lombinho Especial', category: 'cat-1', emoji: '🥩', price: 75.90, oldPrice: null, description: 'Lombinho suíno especial, cebola caramelizada e queijo derretido.', ingredients: 'Massa artesanal, molho de tomate, mussarela, lombinho suíno, cebola caramelizada.', size: 'Grande (35cm)', observations: '', badge: 'Novo', featured: false, active: true, image: '' },
  { id: 'p-5', name: 'Pizza Doce de Chocolate', category: 'cat-5', emoji: '🍫', price: 32.90, oldPrice: null, description: 'Massa crocante com cobertura de chocolate, morangos e creme de leite.', ingredients: 'Massa artesanal, chocolate derretido, creme de leite, morangos frescos.', size: '', observations: '', badge: 'Novo', featured: false, active: true, image: '' },
  { id: 'p-6', name: 'Smash Burger Clássico', category: 'cat-2', emoji: '🍔', price: 34.90, oldPrice: null, description: 'Blend 80/20 smashado, queijo americano, molho especial.', ingredients: 'Pão brioche, blend 180g, queijo americano, alface, tomate, picles, molho.', size: '', observations: '', badge: 'Mais Pedido', featured: true, active: true, image: '' },
  { id: 'p-7', name: 'Double Smash', category: 'cat-2', emoji: '🍔', price: 48.90, oldPrice: null, description: 'Dois blends, dois queijos cheddar, bacon crocante.', ingredients: 'Pão brioche grande, 2x blend, 2x cheddar, bacon, cebola caramelizada.', size: '', observations: '', badge: '', featured: false, active: true, image: '' },
  { id: 'p-8', name: 'Batata Frita Artesanal', category: 'cat-3', emoji: '🍟', price: 24.90, oldPrice: null, description: 'Batatas frescas cortadas na hora, sal grosso e páprica.', ingredients: 'Batata Monalisa, sal grosso, páprica, alho.', size: 'Porção 400g', observations: '', badge: '', featured: false, active: true, image: '' },
  { id: 'p-9', name: 'Frango Crocante (8pc)', category: 'cat-3', emoji: '🍗', price: 32.90, oldPrice: null, description: 'Pedaços de frango empanados com molho barbecue.', ingredients: 'Frango marinado, farinha temperada, barbecue.', size: '8 peças', observations: '', badge: 'Mais Pedido', featured: false, active: true, image: '' },
  { id: 'p-10', name: 'Refrigerante Lata', category: 'cat-4', emoji: '🥤', price: 6.90, oldPrice: null, description: 'Coca, Pepsi, Guaraná, Sprite, Fanta. Gelada.', ingredients: '', size: '350ml', observations: 'Informe o sabor ao pedir.', badge: '', featured: false, active: true, image: '' },
  { id: 'p-11', name: 'Suco Natural', category: 'cat-4', emoji: '🍊', price: 12.90, oldPrice: null, description: 'Feito na hora! Laranja, Limão, Abacaxi, Maracujá.', ingredients: 'Fruta in natura, água gelada, açúcar a gosto.', size: '500ml', observations: '', badge: '', featured: false, active: true, image: '' },
  { id: 'p-12', name: 'Brownie com Sorvete', category: 'cat-5', emoji: '🍫', price: 22.90, oldPrice: null, description: 'Brownie de chocolate belga com sorvete de creme.', ingredients: 'Chocolate belga, manteiga, ovos, sorvete de creme.', size: '', observations: '', badge: 'Mais Pedido', featured: true, active: true, image: '' },
];

const DEMO_COMBOS = [
  { id: 'cb-1', name: 'Combo Família', emoji: '👨‍👩‍👧‍👦', price: 99.90, oldPrice: null, badge: 'ECONOMIZE R$25', description: '2 Pizzas Grandes + 4 Refrigerantes Lata', items: [{ productId: 'p-1', qty: 2 }, { productId: 'p-8', qty: 4 }], active: true },
  { id: 'cb-2', name: 'Combo Casal', emoji: '👫', price: 84.90, oldPrice: null, badge: 'ECONOMIZE R$22', description: '2 Burgers + 2 Batatas Fritas + 2 Refris', items: [{ productId: 'p-4', qty: 2 }, { productId: 'p-6', qty: 2 }, { productId: 'p-8', qty: 2 }], active: true },
  { id: 'cb-3', name: 'Combo Solo', emoji: '🙋', price: 54.90, oldPrice: null, badge: 'ECONOMIZE R$11', description: '1 Burger + Batata Frita + Refri', items: [{ productId: 'p-4', qty: 1 }, { productId: 'p-6', qty: 1 }, { productId: 'p-8', qty: 1 }], active: true },
];

const DEMO_PROMOTIONS = [
  { id: 'pr-1', name: '2x Margherita!', description: 'Leve 2 Pizzas Margherita pelo preço de 1!', price: 52.90, oldPrice: 105.80, startDate: '2025-01-01', endDate: '2025-12-31', active: true, banner: true, image: '', products: ['p-1'] },
  { id: 'pr-2', name: 'Happy Hour Burger', description: 'Das 15h às 18h: Smash Burger com 20% de desconto!', price: 27.90, oldPrice: 34.90, startDate: '2025-01-01', endDate: '2025-12-31', active: true, banner: false, image: '', products: ['p-4'] },
];

/* ==========================================================
   CAMADA DE DADOS (LocalStorage)
   ========================================================== */

const REMOTE_PENDING_QUEUE = {};
let REMOTE_QUEUE_TIMER = null;
let REMOTE_QUEUE_FLUSHING = false;
let API_WARNING_SHOWN = false;
let LOCAL_CACHE_WARNING_SHOWN = false;
let LOCAL_CACHE_OVERSIZE_NOTICE_SHOWN = false;
const REMOTE_RETRY_DELAYS = [350, 1100, 2400];
const REMOTE_QUEUE_LS_KEY = 'bf_remote_sync_queue';
const LOCAL_CACHE_MAX_BYTES = 4 * 1024 * 1024;
const DEMO_ANNOUNCEMENTS = [];

function persistRemoteQueue() {
  try {
    const keys = Object.keys(REMOTE_PENDING_QUEUE);
    if (keys.length === 0) {
      localStorage.removeItem(REMOTE_QUEUE_LS_KEY);
      return;
    }
    localStorage.setItem(REMOTE_QUEUE_LS_KEY, JSON.stringify(REMOTE_PENDING_QUEUE));
  } catch (error) {
    console.warn('Não foi possível persistir fila de sincronização remota.', error);
  }
}

function loadRemoteQueue() {
  try {
    const raw = localStorage.getItem(REMOTE_QUEUE_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

    let discardedPrivateEntry = false;
    for (const [section, value] of Object.entries(parsed)) {
      if (section === 'fiscal') {
        discardedPrivateEntry = true;
        continue;
      }
      if (KNOWN_SECTIONS.has(section)) {
        REMOTE_PENDING_QUEUE[section] = value;
      }
    }
    if (discardedPrivateEntry) persistRemoteQueue();
  } catch (error) {
    console.warn('Não foi possível restaurar fila de sincronização remota.', error);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withAdminCsrf(options = {}) {
  const nextOptions = { ...options };
  const method = String(nextOptions.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const headers = new Headers(nextOptions.headers || {});
    if (!headers.has('X-Admin-CSRF')) {
      headers.set('X-Admin-CSRF', '1');
    }
    nextOptions.headers = headers;
  }
  return nextOptions;
}

function adminFetch(url, options = {}) {
  return fetch(url, withAdminCsrf(options));
}

async function fetchWithTimeout(url, { timeoutMs = ADMIN_FETCH_TIMEOUT_MS, ...options } = {}) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0 || typeof AbortController !== 'function') {
    return adminFetch(url, options);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    return await adminFetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function saveProductsLocalCache(products) {
  if (isLocalCacheTooLarge(LS.products, products, { showOversizeToast: false })) return false;

  let localSaved = true;
  try {
    localStorage.setItem(LS.products, JSON.stringify(products));
  } catch (error) {
    localSaved = false;
    if (!LOCAL_CACHE_WARNING_SHOWN) {
      LOCAL_CACHE_WARNING_SHOWN = true;
      console.warn('LocalStorage lotado/indisponível. Salvando produtos apenas na API.', error);
      showToast('⚠️ Memória local cheia. Salvando produtos apenas no servidor.', 'error', 4200);
    }
  }
  return localSaved;
}

function cloneData(data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

function redactFiscalForLocalCache(fiscal) {
  const copy = fiscal && typeof fiscal === 'object' && !Array.isArray(fiscal)
    ? cloneData(fiscal)
    : {};
  copy.csc = '';
  copy.certificatePassword = '';
  if (copy.environments && typeof copy.environments === 'object' && !Array.isArray(copy.environments)) {
    copy.environments = Object.fromEntries(
      Object.entries(copy.environments).map(([environment, config]) => [
        environment,
        config && typeof config === 'object' && !Array.isArray(config)
          ? { ...config, csc: '' }
          : config,
      ]),
    );
  }
  if (
    copy.cashierPermissions
    && typeof copy.cashierPermissions === 'object'
    && !Array.isArray(copy.cashierPermissions)
  ) {
    copy.cashierPermissions = {
      ...copy.cashierPermissions,
      managerPin: '',
    };
  }
  delete copy._managerPin;
  delete copy.managerPinForAction;
  delete copy.authorizationPin;
  return copy;
}

function clearAdminLoginPassword() {
  const input = document.getElementById('loginPass');
  if (!input) return;
  input.value = '';
  input.type = 'password';
}

function clearAdminProfilePasswords() {
  ['adminCurrentPassword', 'adminNewPassword', 'adminConfirmPassword'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
}

function clearAdminCredentialInputs() {
  clearAdminLoginPassword();
  clearAdminProfilePasswords();
}

function clearAdminSensitiveClientState() {
  try {
    localStorage.removeItem(LS.fiscal);
  } catch {
    // O navegador pode bloquear o armazenamento local.
  }

  STATE.fiscal = redactFiscalForLocalCache(STATE.fiscal);
  [
    'fiscalCsc',
    'fiscalCertificatePassword',
    'fiscalManagerPin',
    'fiscalManagerActionPin',
  ].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  clearAdminCredentialInputs();
  if (typeof ADMIN_SESSION_PROFILE !== 'undefined') ADMIN_SESSION_PROFILE.csrfToken = '';
}

function dataForLocalCache(key, data) {
  if (key === LS.fiscal) return redactFiscalForLocalCache(data);
  return data;
}

function getSerializedByteLength(serialized) {
  try {
    return new Blob([serialized]).size;
  } catch {
    return String(serialized || '').length;
  }
}

function isLocalCacheTooLarge(key, data, { showOversizeToast = true } = {}) {
  const serialized = JSON.stringify(dataForLocalCache(key, data));
  if (getSerializedByteLength(serialized) <= LOCAL_CACHE_MAX_BYTES) return false;

  try {
    localStorage.removeItem(key);
  } catch {
    // Cache local e opcional; a API segue sendo a fonte principal.
  }

  if (!LOCAL_CACHE_OVERSIZE_NOTICE_SHOWN) {
    LOCAL_CACHE_OVERSIZE_NOTICE_SHOWN = true;
    console.info('Cache local ignorado porque os dados excedem o limite seguro do navegador.');
    if (showOversizeToast) {
      showToast('Dados grandes demais para cache local. Salvando no servidor.', 'info', 3200);
    }
  }

  return true;
}

async function fetchApi(path = '', options = {}) {
  const response = await fetch(`${ADMIN_DATA_API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function pushSectionRemote(section, data, { attempts = 3, keepalive = false } = {}) {
  const payload = JSON.stringify(data);
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/${section}`, {
        method: 'PUT',
        cache: 'no-store',
        credentials: 'include',
        keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        let serverMessage = '';
        try {
          const body = await response.json();
          serverMessage = String(body?.error || '').trim();
        } catch {
          serverMessage = '';
        }
        const error = new Error(
          serverMessage ? `HTTP ${response.status}: ${serverMessage}` : `HTTP ${response.status}`,
        );
        error.status = response.status;
        error.serverMessage = serverMessage;
        throw error;
      }
      API_WARNING_SHOWN = false;
      return {
        remoteOk: true,
        error: null,
        status: response.status,
        serverMessage: '',
        retryable: false,
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = status === 0 || status >= 500 || status === 429;
      if (!retryable) {
        return {
          remoteOk: false,
          error: lastError,
          status,
          serverMessage: String(error?.serverMessage || ''),
          retryable: false,
        };
      }
      if (attempt < attempts - 1) {
        await wait(REMOTE_RETRY_DELAYS[Math.min(attempt, REMOTE_RETRY_DELAYS.length - 1)]);
      }
    }
  }

  return {
    remoteOk: false,
    error: lastError,
    status: Number(lastError?.status || 0),
    serverMessage: String(lastError?.serverMessage || ''),
    retryable: true,
  };
}

async function upsertProductRemote(product, { attempts = 3 } = {}) {
  const payload = JSON.stringify(product);
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${PRODUCTS_API_BASE}/upsert`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        let serverMessage = '';
        try {
          const body = await response.json();
          serverMessage = String(body?.error || '').trim();
        } catch {
          serverMessage = '';
        }
        const error = new Error(
          serverMessage ? `HTTP ${response.status}: ${serverMessage}` : `HTTP ${response.status}`,
        );
        error.status = response.status;
        error.serverMessage = serverMessage;
        throw error;
      }

      API_WARNING_SHOWN = false;
      return {
        remoteOk: true,
        error: null,
        status: response.status,
        serverMessage: '',
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = status === 0 || status >= 500 || status === 429;
      if (!retryable) {
        return {
          remoteOk: false,
          error: lastError,
          status,
          serverMessage: String(error?.serverMessage || ''),
        };
      }
      if (attempt < attempts - 1) {
        await wait(REMOTE_RETRY_DELAYS[Math.min(attempt, REMOTE_RETRY_DELAYS.length - 1)]);
      }
    }
  }

  return {
    remoteOk: false,
    error: lastError,
    status: Number(lastError?.status || 0),
    serverMessage: String(lastError?.serverMessage || ''),
  };
}

async function deleteProductRemote(productId, { attempts = 3 } = {}) {
  const safeId = encodeURIComponent(String(productId || '').trim());
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${PRODUCTS_API_BASE}/${safeId}`, {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        let serverMessage = '';
        try {
          const body = await response.json();
          serverMessage = String(body?.error || '').trim();
        } catch {
          serverMessage = '';
        }
        const error = new Error(
          serverMessage ? `HTTP ${response.status}: ${serverMessage}` : `HTTP ${response.status}`,
        );
        error.status = response.status;
        error.serverMessage = serverMessage;
        throw error;
      }

      API_WARNING_SHOWN = false;
      return {
        remoteOk: true,
        error: null,
        status: response.status,
        serverMessage: '',
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = status === 0 || status >= 500 || status === 429;
      if (!retryable) {
        return {
          remoteOk: false,
          error: lastError,
          status,
          serverMessage: String(error?.serverMessage || ''),
        };
      }
      if (attempt < attempts - 1) {
        await wait(REMOTE_RETRY_DELAYS[Math.min(attempt, REMOTE_RETRY_DELAYS.length - 1)]);
      }
    }
  }

  return {
    remoteOk: false,
    error: lastError,
    status: Number(lastError?.status || 0),
    serverMessage: String(lastError?.serverMessage || ''),
  };
}

function resolveProductRemoteFeedback(remoteResult, { successMessage, localSaved, allowNotFound = false }) {
  const status = Number(remoteResult?.status || 0);
  if (remoteResult?.remoteOk || (allowNotFound && status === 404)) {
    return { type: 'success', message: successMessage };
  }

  if (status === 401 || status === 403) {
    setTimeout(() => window.location.reload(), 900);
    return {
      type: 'error',
      message: '⚠️ Sessão expirada. Entre novamente para concluir o salvamento no servidor.',
    };
  }

  if (status === 413) {
    const detail = remoteResult?.serverMessage ? ` (${remoteResult.serverMessage})` : '';
    return {
      type: 'error',
      message: `⚠️ A imagem desse produto excede o limite permitido no servidor.${detail}`,
    };
  }

  if (remoteResult?.serverMessage) {
    return { type: 'error', message: `❌ ${remoteResult.serverMessage}` };
  }

  if (localSaved) {
    return {
      type: 'error',
      message: '⚠️ Salvo localmente. Não foi possível sincronizar no servidor agora.',
    };
  }

  return {
    type: 'error',
    message: '❌ Falha ao salvar no servidor e no cache local.',
  };
}

function scheduleRemoteQueueFlush(delay = 3000) {
  clearTimeout(REMOTE_QUEUE_TIMER);
  REMOTE_QUEUE_TIMER = setTimeout(() => {
    flushRemoteQueue();
  }, delay);
}

async function flushRemoteQueue() {
  if (REMOTE_QUEUE_FLUSHING) return;
  const entries = Object.entries(REMOTE_PENDING_QUEUE);
  if (!entries.length) return;

  let blockedByAuth = false;
  REMOTE_QUEUE_FLUSHING = true;
  try {
    for (const [section, data] of entries) {
      const result = await pushSectionRemote(section, data, { attempts: 2 });
      if (result.remoteOk) {
        delete REMOTE_PENDING_QUEUE[section];
        persistRemoteQueue();
        continue;
      }

      if (result.status === 401 || result.status === 403) {
        blockedByAuth = true;
        if (!API_WARNING_SHOWN) {
          API_WARNING_SHOWN = true;
          showToast('⚠️ Sessão expirada. Faça login novamente para sincronizar pendências.', 'error', 5200);
        }
        break;
      }

      if (!result.retryable) {
        console.error(`Não foi possível sincronizar a seção "${section}".`, result.error);
        delete REMOTE_PENDING_QUEUE[section];
        persistRemoteQueue();
      }
    }
  } finally {
    REMOTE_QUEUE_FLUSHING = false;
  }

  if (!blockedByAuth && Object.keys(REMOTE_PENDING_QUEUE).length > 0) {
    scheduleRemoteQueueFlush(4500);
  }
}

function queueRemoteSection(section, data) {
  if (section === 'fiscal') return false;
  REMOTE_PENDING_QUEUE[section] = cloneData(data);
  persistRemoteQueue();
  scheduleRemoteQueueFlush();
  return true;
}

function flushPendingRemoteSaves({ keepalive = false } = {}) {
  const entries = Object.entries(REMOTE_PENDING_QUEUE);
  if (!entries.length) return;

  for (const [section, data] of entries) {
    pushSectionRemote(section, data, { attempts: 1, keepalive })
      .then((result) => {
        if (result.remoteOk) {
          delete REMOTE_PENDING_QUEUE[section];
          persistRemoteQueue();
        }
      })
      .catch(() => { });
  }
}

function mergeObjectDefaults(defaultValue, value) {
  const fallback = cloneData(defaultValue);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return { ...fallback, ...value };
}

function normalizeLoadedState(raw = {}) {
  const normalized = {
    config: mergeObjectDefaults(DEMO_CONFIG, raw?.config),
    visual: mergeObjectDefaults(DEMO_VISUAL, raw?.visual),
    orders: mergeObjectDefaults(DEMO_ORDERS, raw?.orders),
    fiscal: mergeObjectDefaults(DEMO_FISCAL, raw?.fiscal),
    categories: Array.isArray(raw?.categories) ? raw.categories : cloneData(DEMO_CATEGORIES),
    products: Array.isArray(raw?.products) ? raw.products : cloneData(DEMO_PRODUCTS),
    combos: Array.isArray(raw?.combos) ? raw.combos : cloneData(DEMO_COMBOS),
    promotions: Array.isArray(raw?.promotions) ? raw.promotions : cloneData(DEMO_PROMOTIONS),
    announcements: Array.isArray(raw?.announcements) ? raw.announcements : cloneData(DEMO_ANNOUNCEMENTS),
    borders: Array.isArray(raw?.borders) ? raw.borders : [],
  };
  return normalizeTextDeep(normalized);
}

/** Carrega dados da API (SQLite) com fallback para LocalStorage/demo */
async function loadAllData() {
  loadRemoteQueue();
  await flushRemoteQueue();

  try {
    const remote = await fetchApi('');
    const normalized = normalizeLoadedState(remote || {});
    STATE.config = normalized.config;
    STATE.visual = normalized.visual;
    STATE.orders = normalized.orders;
    STATE.fiscal = normalized.fiscal;
    STATE.categories = normalized.categories;
    STATE.products = normalized.products;
    STATE.combos = normalized.combos;
    STATE.promotions = normalized.promotions;
    STATE.announcements = normalized.announcements;
    STATE.borders = Array.isArray(remote?.borders) ? remote.borders : loadFromLS(LS.borders, []);

    // Mantém cache local para uso offline/fallback.
    saveToLS(LS.config, STATE.config, true);
    saveToLS(LS.visual, STATE.visual, true);
    saveToLS(LS.orders, STATE.orders, true);
    saveToLS(LS.fiscal, STATE.fiscal, true);
    saveToLS(LS.categories, STATE.categories, true);
    saveToLS(LS.products, STATE.products, true);
    saveToLS(LS.combos, STATE.combos, true);
    saveToLS(LS.promotions, STATE.promotions, true);
    saveToLS(LS.announcements, STATE.announcements, true);
    saveToLS(LS.borders, STATE.borders, true);
  } catch (error) {
    const local = normalizeLoadedState({
      config: loadFromLS(LS.config, DEMO_CONFIG),
      visual: loadFromLS(LS.visual, DEMO_VISUAL),
      orders: loadFromLS(LS.orders, DEMO_ORDERS),
      fiscal: loadFromLS(LS.fiscal, DEMO_FISCAL),
      categories: loadFromLS(LS.categories, DEMO_CATEGORIES),
      products: loadFromLS(LS.products, DEMO_PRODUCTS),
      combos: loadFromLS(LS.combos, DEMO_COMBOS),
      promotions: loadFromLS(LS.promotions, DEMO_PROMOTIONS),
      announcements: loadFromLS(LS.announcements, DEMO_ANNOUNCEMENTS),
      borders: loadFromLS(LS.borders, []),
    });
    STATE.config = local.config;
    STATE.visual = local.visual;
    STATE.orders = local.orders;
    STATE.fiscal = local.fiscal;
    STATE.categories = local.categories;
    STATE.products = local.products;
    STATE.combos = local.combos;
    STATE.promotions = local.promotions;
    STATE.announcements = local.announcements;
    STATE.borders = local.borders;

    if (!API_WARNING_SHOWN) {
      API_WARNING_SHOWN = true;
      console.warn('API indisponível. Usando LocalStorage como fallback.', error);
      showToast('⚠️ API indisponível. Usando dados locais.', 'error');
    }
  }
}

/** Lê do LS ou retorna valor padrão */
function loadFromLS(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeTextDeep(JSON.parse(raw)) : cloneData(defaultValue);
  } catch { return cloneData(defaultValue); }
}

/** Salva no cache local e sincroniza em segundo plano com a API */
async function saveToLS(key, data, skipRemote = false) {
  const safeData = normalizeTextDeep(cloneData(data));
  const localData = dataForLocalCache(key, safeData);
  const skipLocalCache = isLocalCacheTooLarge(key, safeData, { showOversizeToast: !skipRemote });

  let localSaved = !skipLocalCache;
  if (!skipLocalCache) try {
    localStorage.setItem(key, JSON.stringify(localData));
  } catch (error) {
    localSaved = false;
    if (!LOCAL_CACHE_WARNING_SHOWN) {
      LOCAL_CACHE_WARNING_SHOWN = true;
      console.warn('LocalStorage lotado/indisponível. Salvando apenas na API.', error);
      showToast('⚠️ Memória local cheia. Salvando apenas no servidor.', 'error', 4200);
    }
  }

  const section = LS_TO_SECTION[key];
  if (section && !skipRemote) {
    const result = await syncSectionRemote(section, safeData);
    return {
      localSaved,
      remoteOk: result.remoteOk,
      error: result.error || null,
      status: result.status || 0,
      serverMessage: result.serverMessage || '',
      queued: Boolean(result.queued),
      fatal: Boolean(result.fatal),
    };
  }
  return {
    localSaved,
    remoteOk: true,
    error: null,
    status: 200,
    serverMessage: '',
    queued: false,
    fatal: false,
  };
}

async function syncSectionRemote(section, data) {
  const snapshot = cloneData(data);
  const result = await pushSectionRemote(section, snapshot, { attempts: 3 });

  if (!result.remoteOk) {
    const status = Number(result.status || 0);
    const serverMessage = String(result.serverMessage || '');

    if (status === 401 || status === 403) {
      console.error(`Sessão expirada ao salvar seção "${section}".`, result.error);
      if (!API_WARNING_SHOWN) {
        API_WARNING_SHOWN = true;
        showToast('⚠️ Sessão expirada. Faça login novamente para salvar no servidor.', 'error', 5200);
      }
      setTimeout(() => window.location.reload(), 900);
      return { ...result, queued: false, fatal: true };
    }

    if (status === 413) {
      console.error(`Payload muito grande na seção "${section}".`, result.error);
      if (!API_WARNING_SHOWN) {
        API_WARNING_SHOWN = true;
        if (section === 'products') {
          const detail = serverMessage ? ` Detalhe: ${serverMessage}` : '';
          showToast(`⚠️ O limite total dos produtos foi excedido (soma das imagens). Reduza algumas imagens e salve novamente.${detail}`, 'error', 6600);
        } else {
          const detail = serverMessage ? ` Detalhe: ${serverMessage}` : '';
          showToast(`⚠️ Arquivo muito grande para o servidor. Reduza o tamanho e salve novamente.${detail}`, 'error', 5600);
        }
      }
      return { ...result, queued: false, fatal: true };
    }

    if (status >= 400 && status < 500 && status !== 429) {
      console.error(`Requisição inválida para seção "${section}".`, result.error);
      if (!API_WARNING_SHOWN) {
        API_WARNING_SHOWN = true;
        const message = serverMessage
          ? `⚠️ Servidor recusou o salvamento: ${serverMessage}`
          : '⚠️ Servidor recusou o salvamento. Revise os dados e tente novamente.';
        showToast(message, 'error', 5600);
      }
      return { ...result, queued: false, fatal: true };
    }

    if (section === 'fiscal') {
      const safeMessage = 'Configuracoes fiscais nao foram enfileiradas por seguranca. Conecte ao servidor e salve novamente.';
      console.error(`Falha ao salvar seção "${section}" na API.`, result.error);
      if (!API_WARNING_SHOWN) {
        API_WARNING_SHOWN = true;
        showToast(`⚠️ ${safeMessage}`, 'error', 5600);
      }
      return {
        ...result,
        queued: false,
        fatal: true,
        serverMessage: result.serverMessage || safeMessage,
      };
    }

    queueRemoteSection(section, snapshot);
    console.error(`Falha ao salvar seção "${section}" na API.`, result.error);
    if (!API_WARNING_SHOWN) {
      API_WARNING_SHOWN = true;
      showToast('⚠️ Sem conexão com a API. Dados salvos localmente e na fila de sincronização.', 'error', 4600);
    }
    return { ...result, queued: true, fatal: false };
  }

  return { ...result, queued: false, fatal: false };
}

function resolveSaveFeedback(result, successMessage) {
  if (result.remoteOk) return { type: 'success', message: successMessage };
  if (result.fatal) {
    if (result.status === 401 || result.status === 403) {
      return {
        type: 'error',
        message: '⚠️ Sessão expirada. Entre novamente para concluir o salvamento no servidor.',
      };
    }
    if (result.status === 413) {
      const detail = result.serverMessage ? ` (${result.serverMessage})` : '';
      return {
        type: 'error',
        message: `⚠️ Limite de tamanho do servidor excedido. Reduza as imagens e salve novamente.${detail}`,
      };
    }
    if (result.serverMessage) {
      return {
        type: 'error',
        message: `❌ ${result.serverMessage}`,
      };
    }
    return {
      type: 'error',
      message: '❌ O servidor recusou o salvamento. Revise os dados e tente novamente.',
    };
  }
  if (result.localSaved) {
    return {
      type: 'error',
      message: '⚠️ Salvo localmente. Sem conexão com servidor, mas vamos sincronizar automaticamente.',
    };
  }
  return {
    type: 'error',
    message: '❌ Falha ao salvar. Sem conexão com servidor e sem cache local disponível. Tente novamente.',
  };
}

/** Salva tudo que está no STATE */
async function saveAll() {
  await saveToLS(LS.config, STATE.config);
  await saveToLS(LS.visual, STATE.visual);
  await saveToLS(LS.orders, STATE.orders);
  await saveToLS(LS.fiscal, STATE.fiscal);
  await saveToLS(LS.categories, STATE.categories);
  await saveToLS(LS.products, STATE.products);
  await saveToLS(LS.combos, STATE.combos);
  await saveToLS(LS.promotions, STATE.promotions);
  await saveToLS(LS.announcements, STATE.announcements);
  await saveToLS(LS.borders, STATE.borders);
}

/** Gera um ID único */
function genId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ==========================================================
   AUTENTICAÇÃO
   ========================================================== */
async function checkAuth() {
  const errEl = document.getElementById('loginError');
  try {
    const response = await fetch(`${ADMIN_API_BASE}/session`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const session = await response.json();
    if (session?.authenticated) {
      if (errEl) errEl.textContent = '';
      applyAdminSessionProfile(session);
      showApp();
      return;
    }
  } catch (error) {
    console.error('Falha ao validar sessão administrativa.', error);
  }

  showLogin();
}

function triggerLoginShake() {
  const loginCard = document.getElementById('loginCard') || document.querySelector('.login-card');
  if (!loginCard) return;
  loginCard.classList.remove('shake');
  void loginCard.offsetWidth;
  loginCard.classList.add('shake');
}

async function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  clearAdminLoginPassword();

  try {
    const response = await fetch(`${ADMIN_API_BASE}/login`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password: pass }),
    });

    if (response.status === 401) {
      if (errEl) errEl.textContent = 'Usuário ou senha incorretos.';
      triggerLoginShake();
      return;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const session = await response.json();
    applyAdminSessionProfile(session);

    if (errEl) errEl.textContent = '';
    showApp();
  } catch (error) {
    console.error('Falha ao realizar login administrativo.', error);
    if (errEl) errEl.textContent = 'Falha ao conectar com o servidor.';
    triggerLoginShake();
  }
}

function handleLogout() {
  confirmDialog('Sair do Painel', 'Deseja realmente sair do painel administrativo?', async () => {
    try {
      await fetch(`${ADMIN_API_BASE}/logout`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Falha ao encerrar sessão administrativa.', error);
    }

    document.getElementById('adminApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    stopOrderLogsPolling();
    disconnectAutoPrinter();
    clearAdminSensitiveClientState();
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';
    window.location.replace('/admin/');
  }, 'Sair');
}

function showLogin() {
  clearAdminSensitiveClientState();
  stopOrderLogsPolling();
  disconnectAutoPrinter();
  closeModal({ restoreFocus: false });
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
  requestAnimationFrame(() => document.getElementById('loginUser')?.focus());
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'flex';
  resetNewOrderAnnouncementTracking();
  initApp();
}

function togglePassword() {
  const inp = document.getElementById('loginPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function adminProfileInitial(value) {
  const firstCharacter = Array.from(String(value || '').trim())[0] || 'A';
  return firstCharacter.toLocaleUpperCase('pt-BR');
}

function applyAdminSessionProfile(session) {
  const displayName = String(session?.displayName || session?.user || 'Admin').trim() || 'Admin';
  ADMIN_SESSION_PROFILE = {
    user: String(session?.user || ADMIN_SESSION_PROFILE.user || ''),
    displayName,
    csrfToken: String(session?.csrfToken || ''),
  };
  const name = document.getElementById('adminProfileName');
  const avatar = document.getElementById('adminProfileAvatar');
  if (name) name.textContent = displayName;
  if (avatar) avatar.textContent = adminProfileInitial(displayName);
}

function openAdminProfile() {
  const displayName = document.getElementById('adminDisplayName');
  const error = document.getElementById('adminProfileError');
  clearAdminProfilePasswords();
  if (displayName) displayName.value = ADMIN_SESSION_PROFILE.displayName;
  if (error) error.textContent = '';
  openModal('adminProfileModal');
  requestAnimationFrame(() => displayName?.focus());
}

async function revalidateAdminProfileSession() {
  try {
    const response = await fetch(`${ADMIN_API_BASE}/session`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (!response.ok) return null;
    const session = await response.json().catch(() => ({}));
    if (!session?.authenticated) return null;
    applyAdminSessionProfile(session);
    return session;
  } catch (error) {
    console.error('Falha ao revalidar sessão administrativa.', error);
    return null;
  }
}

function redirectToAdminLogin() {
  clearAdminSensitiveClientState();
  stopOrderLogsPolling();
  disconnectAutoPrinter();
  closeModal({ restoreFocus: false });
  window.location.replace('/admin/');
}

async function saveAdminProfile(event) {
  event.preventDefault();
  const displayNameInput = document.getElementById('adminDisplayName');
  const currentPasswordInput = document.getElementById('adminCurrentPassword');
  const newPasswordInput = document.getElementById('adminNewPassword');
  const confirmPasswordInput = document.getElementById('adminConfirmPassword');
  const error = document.getElementById('adminProfileError');
  const button = document.getElementById('saveAdminProfileButton');
  const displayName = String(displayNameInput?.value || '').trim().replace(/\s+/g, ' ');
  const currentPassword = String(currentPasswordInput?.value || '');
  const newPassword = String(newPasswordInput?.value || '');
  const confirmation = String(confirmPasswordInput?.value || '');

  if (error) error.textContent = '';
  if (displayName.length < 2) {
    if (error) error.textContent = 'Informe um nome com pelo menos 2 caracteres.';
    displayNameInput?.focus();
    return;
  }
  if (!currentPassword) {
    if (error) error.textContent = 'Digite a senha atual para confirmar.';
    currentPasswordInput?.focus();
    return;
  }
  if (newPassword && newPassword.length < 8) {
    if (error) error.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.';
    newPasswordInput?.focus();
    return;
  }
  if (newPassword !== confirmation) {
    if (error) error.textContent = 'A confirmação da nova senha não confere.';
    confirmPasswordInput?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando...';
  }
  try {
    const response = await fetch(`${ADMIN_API_BASE}/profile`, {
      method: 'PUT',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-CSRF': ADMIN_SESSION_PROFILE.csrfToken,
      },
      body: JSON.stringify({ displayName, currentPassword, newPassword }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      clearAdminProfilePasswords();
      if (response.status === 401 || response.status === 403) {
        const activeSession = await revalidateAdminProfileSession();
        if (!activeSession) {
          redirectToAdminLogin();
          return;
        }
        if (error) {
          error.textContent = response.status === 403
            ? 'A validação de segurança foi atualizada. Digite as senhas novamente.'
            : String(result?.error || 'Senha atual incorreta.');
        }
        currentPasswordInput?.focus();
      } else if (error) {
        error.textContent = String(result?.error || 'Não foi possível salvar o perfil.');
      }
      return;
    }

    applyAdminSessionProfile(result);
    clearAdminProfilePasswords();
    closeModal();
    showToast(result.passwordChanged ? 'Nome e senha atualizados com segurança.' : 'Nome atualizado com segurança.', 'success');
  } catch (requestError) {
    console.error('Falha ao atualizar perfil administrativo.', requestError);
    clearAdminProfilePasswords();
    if (error) error.textContent = 'Falha ao conectar com o servidor.';
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }
}

/* ==========================================================
   INICIALIZAÇÃO DO APP
   ========================================================== */
async function initApp() {
  const pageAtStart = STATE.currentPage || 'dashboard';
  await loadAllData();
  loadAutoPrintPreferences();
  await loadOrderLogs(true);
  await loadPrintAgentStatus(true);
  await loadCashier(true);
  startOrderLogsPolling();
  navigate(STATE.currentPage || pageAtStart);
  populateCategorySelects();
  renderScheduleList();
  loadCompanyForm();
  loadVisualForm();
  loadOrdersForm();
  updateSidebarStoreName();
  refreshAllBadges();
}

function getStoreDisplayName(storeName = STATE.config?.storeName) {
  const normalized = fixMojibakeText(String(storeName || '')).trim();
  return normalized || 'Sua Empresa';
}

function buildDefaultFooterText(storeName = STATE.config?.storeName) {
  return `© ${new Date().getFullYear()} ${getStoreDisplayName(storeName)}. Todos os direitos reservados.`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDefaultFooterTextForStore(text, storeName = STATE.config?.storeName) {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  const safeStoreName = escapeRegExp(getStoreDisplayName(storeName));
  const pattern = new RegExp(`^©\\s*\\d{4}\\s+${safeStoreName}\\.\\s+Todos os direitos reservados\\.$`, 'i');
  return pattern.test(normalized);
}

function slugifyFileNamePart(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'empresa';
}

function toInlineJsStringLiteral(value) {
  const safe = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\x22')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C');

  return `'${safe}'`;
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

function sanitizeHexColor(value, fallback = '#C0392B') {
  const raw = String(value || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : fallback;
}

function normalizeHexColorInput(value, fallback = '#C0392B') {
  const safe = sanitizeHexColor(value, fallback).toUpperCase();
  if (!/^#[0-9A-F]{3}$/.test(safe)) return safe;
  return `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}`;
}

function sanitizeTimeValue(value, fallback = '00:00') {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function updateAdminBranding() {
  const storeName = getStoreDisplayName();
  const sidebarStoreName = document.getElementById('sbStoreName');
  if (sidebarStoreName) sidebarStoreName.textContent = storeName;

  document.title = `Painel Admin - ${storeName}`;

  const loginPanelSubtitle = document.getElementById('loginPanelSubtitle');
  if (loginPanelSubtitle) {
    loginPanelSubtitle.textContent = `${storeName} • Painel Administrativo`;
  }

  const dashboardWelcomeTitle = document.getElementById('dashboardWelcomeTitle');
  if (dashboardWelcomeTitle) {
    dashboardWelcomeTitle.textContent = `Bem-vindo ao Painel da ${storeName} 👋`;
  }

  const dashboardWelcomeSubtitle = document.getElementById('dashboardWelcomeSubtitle');
  if (dashboardWelcomeSubtitle) {
    dashboardWelcomeSubtitle.textContent = `Gerencie o cardápio e as configurações da ${storeName}.`;
  }
}

function updateSidebarStoreName() {
  updateAdminBranding();
}

function blurActiveFormField() {
  const activeEl = document.activeElement;
  if (!activeEl) return;

  const tag = activeEl.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    activeEl.blur();
  }
}

/* ==========================================================
   NAVEGAÇÃO ENTRE PÁGINAS
   ========================================================== */
function navigate(page) {
  blurActiveFormField();

  // Esconde todas as páginas
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Mostra a página alvo
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Atualiza nav items
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  let activeBtn = null;
  document.querySelectorAll('.nav-item').forEach((btn) => {
    if (!activeBtn && String(btn?.dataset?.page || '') === String(page)) {
      activeBtn = btn;
    }
  });
  if (activeBtn) activeBtn.classList.add('active');

  // Atualiza título do topbar
  const titles = {
    dashboard: 'Dashboard',
    products: 'Produtos',
    borders: 'Bordas',
    stock: 'Estoque',
    categories: 'Categorias',
    combos: 'Combos',
    promotions: 'Promoções',
    announcements: 'Anúncios',
    company: 'Empresa',
    visual: 'Visual do Site',
    orders: 'Pedidos',
    sefaz: 'SEFAZ',
    team: 'Equipe do Salão',
    cashier: 'Caixa',
    'order-logs': 'Pedidos Registrados',
  };
  document.getElementById('topbarTitle').textContent = titles[page] || page;

  // Mostra/esconde busca no topbar
  document.getElementById('topbarSearch').style.display = page === 'products' ? 'block' : 'none';

  STATE.currentPage = page;

  // Fecha sidebar mobile
  if (STATE.mobileSidebarOpen) {
    document.getElementById('sidebar').classList.remove('mobile-open');
    STATE.mobileSidebarOpen = false;
  }

  // Renderiza a página
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'products': renderProductsTable(); break;
    case 'borders': renderBorderCatalog(); break;
    case 'stock': loadStock(); break;
    case 'categories': renderCategories(); break;
    case 'combos': renderCombos(); break;
    case 'promotions': renderPromotions(); break;
    case 'announcements': renderAnnouncements(); break;
    case 'company': loadCompanyForm(); break;
    case 'visual': loadVisualForm(); break;
    case 'orders': loadOrdersForm(); break;
    case 'sefaz':
      loadSefazSettings();
      break;
    case 'team':
      loadWaiterUsersAdmin();
      loadWaiterAuditAdmin();
      break;
    case 'cashier':
      loadCashier();
      break;
    case 'order-logs':
      loadOrderLogs();
      loadPrintAgentStatus(true);
      break;
  }
}

/* ==========================================================
   SIDEBAR
   ========================================================== */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  const isMobile = window.innerWidth <= 900;

  if (isMobile) {
    STATE.mobileSidebarOpen = !STATE.mobileSidebarOpen;
    sidebar.classList.toggle('mobile-open', STATE.mobileSidebarOpen);
  } else {
    STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', STATE.sidebarCollapsed);
    main.classList.toggle('collapsed', STATE.sidebarCollapsed);
  }
}

function openSidebarFromLogo() {
  if (window.innerWidth <= 900) return;
  if (!STATE.sidebarCollapsed) return;

  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');

  STATE.sidebarCollapsed = false;
  sidebar.classList.remove('collapsed');
  main.classList.remove('collapsed');
}

/* ==========================================================
   DASHBOARD
   ========================================================== */
function renderDashboard() {
  // Cards de contagem
  const activeProducts = STATE.products.filter(p => p.active).length;
  const activeCombos = STATE.combos.filter(c => c.active).length;
  const activePromos = STATE.promotions.filter(p => p.active).length;

  setText('dcProducts', STATE.products.length);
  setText('dcCategories', STATE.categories.length);
  setText('dcCombos', activeCombos);
  setText('dcPromos', activePromos);

  // Produtos recentes (últimos 5)
  const recentEl = document.getElementById('dashRecentProducts');
  const recent = [...STATE.products].slice(-5).reverse();
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-state-sm">Nenhum produto cadastrado</div>';
  } else {
    recentEl.innerHTML = recent.map(p => {
      const cat = STATE.categories.find(c => c.id === p.category);
      const safeImage = sanitizeImageUrl(p.image);
      const safeName = escapeHtml(p.name || '');
      const safeEmoji = escapeHtml(p.emoji || '🍕');
      const safeCategory = cat
        ? `${escapeHtml(cat.icon || '')} ${escapeHtml(cat.name || '')}`
        : '—';
      const imgHtml = safeImage
        ? `<img src="${escapeHtml(safeImage)}" class="pc-img" alt="${safeName}" />`
        : `<span class="rpi-emoji">${safeEmoji}</span>`;
      return `
        <div class="recent-product-item">
          ${imgHtml}
          <div class="rpi-info">
            <div class="rpi-name">${safeName}</div>
            <div class="rpi-cat">${safeCategory}</div>
          </div>
          <div class="rpi-price">${formatCurrency(p.price)}</div>
        </div>
      `;
    }).join('');
  }

  // Status da loja
  const statusEl = document.getElementById('dashStatusList');
  const storeOpen = STATE.orders.storeOpen;
  const safeOrdersWhatsapp = escapeHtml(STATE.orders.whatsapp || '—');
  statusEl.innerHTML = `
    <div class="sl-item">
      <span class="sl-label">Status da loja</span>
      <span class="sl-value ${storeOpen ? 'ok' : 'bad'}">${storeOpen ? '🟢 Aberta' : '🔴 Fechada'}</span>
    </div>
    <div class="sl-item">
      <span class="sl-label">WhatsApp pedidos</span>
      <span class="sl-value">${safeOrdersWhatsapp}</span>
    </div>
    <div class="sl-item">
      <span class="sl-label">Taxa de entrega</span>
      <span class="sl-value">${formatCurrency(STATE.orders.deliveryFee || 0)}</span>
    </div>
    <div class="sl-item">
      <span class="sl-label">Entrega grátis acima de</span>
      <span class="sl-value">${formatCurrency(STATE.orders.freeDeliveryAt || 0)}</span>
    </div>
    <div class="sl-item">
      <span class="sl-label">Pedido mínimo</span>
      <span class="sl-value">${formatCurrency(STATE.orders.minValue || 0)}</span>
    </div>
    <div class="sl-item">
      <span class="sl-label">Produtos ativos</span>
      <span class="sl-value ok">${activeProducts} / ${STATE.products.length}</span>
    </div>
  `;

  // Promoções ativas
  const promosEl = document.getElementById('dashActivePromos');
  const activePromosArr = STATE.promotions.filter(p => p.active);
  if (activePromosArr.length === 0) {
    promosEl.innerHTML = '<div class="empty-state-sm">Nenhuma promoção ativa</div>';
  } else {
    promosEl.innerHTML = activePromosArr.map(p => `
      <div class="dash-promo-item">
        <div>
          <div class="dpi-name">${escapeHtml(p.name || '')}</div>
          <div class="dpi-validity">${escapeHtml(formatDateRange(p.startDate, p.endDate))}</div>
        </div>
        <span class="badge active">Ativa</span>
      </div>
    `).join('');
  }

  // Status indicator na sidebar
  updateStoreStatusIndicator();
}

/* ==========================================================
   PRODUTOS
   ========================================================== */

/** Renderiza a tabela de produtos com filtros */
function productDigits(value, maxLength = 32) {
  return String(value || '').replace(/\D+/g, '').slice(0, maxLength);
}

function productTaxCst(value, fallback = '49') {
  const digits = productDigits(value, 2);
  return digits ? digits.padStart(2, '0') : fallback;
}

function productFiscalCode(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);
}

function getProductFiscalSummary(product = {}) {
  const ncm = productDigits(product.ncm, 8);
  const cfop = productDigits(product.cfop, 4);
  const barcode = productDigits(product.barcode || product.gtin || product.ean, 14);
  const hasOwnNcm = productDigits(product.ncm, 8).length === 8;
  const hasOwnCfop = productDigits(product.cfop, 4).length === 4;
  const hasTaxCode = String(product.csosn || product.cst || '').trim().length > 0;
  const hasOrigin = /^[0-8]$/.test(String(product.origin || '').trim());
  const hasUnit = String(product.unit || '').trim().length > 0;
  const hasPis = productDigits(product.pisCst, 2).length === 2;
  const hasCofins = productDigits(product.cofinsCst, 2).length === 2;
  const complete = hasOwnNcm && hasOwnCfop && hasTaxCode && hasOrigin && hasUnit && hasPis && hasCofins;
  const reviewRequired = product.fiscalReviewRequired === true;

  return {
    complete: complete && !reviewRequired,
    badgeClass: complete && !reviewRequired ? 'active' : 'inactive',
    label: !complete ? 'Fiscal incompleto' : (reviewRequired ? 'Somente homologacao' : 'Fiscal ok'),
    detail: `${ncm ? `NCM ${ncm}` : 'NCM pendente'} | ${cfop ? `CFOP ${cfop}` : 'CFOP pendente'} | ${hasPis && hasCofins ? `PIS/COFINS ${productTaxCst(product.pisCst, '')}/${productTaxCst(product.cofinsCst, '')}` : 'PIS/COFINS pendente'} | ${barcode ? `GTIN ${barcode}` : 'SEM GTIN'}${reviewRequired ? ' | Aguardando contador' : ''}`,
  };
}

async function fetchStock(path = '', options = {}) {
  const response = await fetch(`${STOCK_API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha ao acessar o estoque.');
  return data;
}

const STOCK_PERIOD_LABELS = Object.freeze({
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
  '90d': 'últimos 90 dias',
  all: 'todo o histórico',
});

const STOCK_MIN_QUANTITY = 0.001;
const STOCK_MIN_UNIT_COST = 0.01;
const STOCK_MAX_QUANTITY = 1_000_000;
const STOCK_MAX_UNIT_COST = 1_000_000;

const STOCK_MOVEMENT_LABELS = Object.freeze({
  initial_count: { label: 'Contagem inicial', direction: 'in' },
  entry: { label: 'Entrada manual', direction: 'in' },
  xml_entry: { label: 'Entrada por NF-e', direction: 'in' },
  exit: { label: 'Saída manual', direction: 'out' },
  adjustment: { label: 'Ajuste de saldo', direction: 'adjustment' },
  sale: { label: 'Saída por pedido', direction: 'out' },
  sale_restore: { label: 'Restauração de pedido', direction: 'in' },
});

function stockFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stockOptionalNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatStockQuantity(value) {
  return stockFiniteNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatStockPercent(value) {
  return `${stockFiniteNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function stockMovementMeta(row = {}) {
  const type = String(row.movementType || '').trim();
  const known = STOCK_MOVEMENT_LABELS[type];
  if (!known) {
    return {
      label: type ? type.replace(/[_-]+/g, ' ') : 'Movimentação',
      direction: stockFiniteNumber(row.quantity) >= 0 ? 'in' : 'out',
    };
  }
  if (known.direction !== 'adjustment') return known;
  return { ...known, direction: stockFiniteNumber(row.quantity) >= 0 ? 'in' : 'out' };
}

function createStockClientRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `stock-movement:${uuid}`;
  return `stock-movement:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function deriveStockSummary(items, movements) {
  const entryTypes = new Set(['initial_count', 'entry', 'xml_entry']);
  const entries = movements.filter((row) => entryTypes.has(String(row.movementType)) && stockFiniteNumber(row.quantity) > 0);
  const outputs = movements.filter((row) => stockFiniteNumber(row.quantity) < 0);
  const sales = movements.filter((row) => String(row.movementType) === 'sale');
  const entryUnits = entries.reduce((sum, row) => sum + stockFiniteNumber(row.quantity), 0);
  const entryValue = entries.reduce((sum, row) => sum + Math.abs(stockFiniteNumber(row.quantity)) * stockFiniteNumber(row.unitCost), 0);
  const salesRevenue = sales.reduce((sum, row) => sum + stockFiniteNumber(row.salesRevenue ?? row.totalRevenue ?? row.revenue), 0);
  const costOfGoods = sales.reduce((sum, row) => sum + stockFiniteNumber(row.costOfGoods ?? row.totalCost ?? row.costValue), 0);
  return {
    controlledProducts: items.length,
    lowStockCount: items.filter((item) => item.lowStock).length,
    currentUnits: items.reduce((sum, item) => sum + stockFiniteNumber(item.quantity), 0),
    inventoryValue: items.reduce((sum, item) => sum + stockFiniteNumber(item.inventoryValue), 0),
    entryUnits,
    entryValue,
    outputUnits: outputs.reduce((sum, row) => sum + Math.abs(stockFiniteNumber(row.quantity)), 0),
    salesUnits: sales.reduce((sum, row) => sum + Math.abs(stockFiniteNumber(row.quantity)), 0),
    salesRevenue,
    costOfGoods,
    grossProfit: salesRevenue - costOfGoods,
    grossMarginPercent: salesRevenue > 0 ? ((salesRevenue - costOfGoods) / salesRevenue) * 100 : 0,
    potentialRevenue: items.reduce((sum, item) => sum + stockFiniteNumber(item.potentialRevenue), 0),
    potentialGrossProfit: items.reduce((sum, item) => sum + stockFiniteNumber(item.potentialGrossProfit), 0),
  };
}

function normalizedStockSummary(items, movements) {
  const fallback = deriveStockSummary(items, movements);
  const analytics = STATE.stock?.analytics || {};
  const summary = analytics.summary && typeof analytics.summary === 'object' ? analytics.summary : analytics;
  const aliases = {
    controlledProducts: [summary.controlledProducts],
    lowStockCount: [summary.lowStockCount],
    currentUnits: [summary.currentUnits],
    inventoryValue: [summary.inventoryValue],
    entryUnits: [summary.entryUnits, summary.entriesQuantity],
    entryValue: [summary.entryValue, summary.entriesValue],
    outputUnits: [summary.outputUnits],
    salesUnits: [summary.salesUnits, summary.salesQuantity],
    salesRevenue: [summary.salesRevenue],
    costOfGoods: [summary.costOfGoods, summary.cogs],
    grossProfit: [summary.grossProfit],
    grossMarginPercent: [summary.grossMarginPercent],
    potentialRevenue: [summary.potentialRevenue],
    potentialGrossProfit: [summary.potentialGrossProfit],
  };
  const normalized = Object.fromEntries(Object.keys(fallback).map((key) => [
    key,
    stockOptionalNumber(...(aliases[key] || [])) ?? fallback[key],
  ]));
  if (stockOptionalNumber(summary.outputUnits) === null) {
    const manualOutput = stockOptionalNumber(summary.manualExitQuantity) ?? 0;
    const salesOutput = stockOptionalNumber(summary.salesUnits, summary.salesQuantity) ?? 0;
    if (manualOutput || salesOutput) normalized.outputUnits = manualOutput + salesOutput;
  }
  return normalized;
}

async function loadStock({ announce = false } = {}) {
  const period = Object.hasOwn(STOCK_PERIOD_LABELS, STATE.stockPeriod) ? STATE.stockPeriod : '30d';
  const sequence = Number(STATE.stockLoadSequence || 0) + 1;
  STATE.stockLoadSequence = sequence;
  const kpiGrid = document.getElementById('stockKpiGrid');
  const stockGrid = document.getElementById('stockGrid');
  if (kpiGrid) kpiGrid.setAttribute('aria-busy', 'true');
  if (stockGrid) stockGrid.setAttribute('aria-busy', 'true');
  const periodSelect = document.getElementById('stockPeriodFilter');
  if (periodSelect) periodSelect.value = period;
  try {
    const result = await fetchStock(`?period=${encodeURIComponent(period)}`);
    if (sequence !== STATE.stockLoadSequence) return false;
    STATE.stock = {
      items: Array.isArray(result?.items) ? result.items : [],
      movements: Array.isArray(result?.movements) ? result.movements : [],
      analytics: result?.analytics && typeof result.analytics === 'object'
        ? result.analytics
        : { summary: {}, products: [] },
    };
    renderStock();
    if (announce) showToast('Dashboard de estoque atualizado.', 'success', 1800);
    return true;
  } catch (error) {
    if (sequence === STATE.stockLoadSequence) showToast(String(error?.message || error), 'error');
    return false;
  } finally {
    if (sequence === STATE.stockLoadSequence) {
      if (kpiGrid) kpiGrid.setAttribute('aria-busy', 'false');
      if (stockGrid) stockGrid.setAttribute('aria-busy', 'false');
    }
  }
}

async function changeStockPeriod(period) {
  if (!Object.hasOwn(STOCK_PERIOD_LABELS, period) || period === STATE.stockPeriod) return;
  const previousPeriod = STATE.stockPeriod;
  STATE.stockPeriod = period;
  const loaded = await loadStock();
  if (!loaded && STATE.stockPeriod === period) {
    STATE.stockPeriod = previousPeriod;
    const periodSelect = document.getElementById('stockPeriodFilter');
    if (periodSelect) periodSelect.value = previousPeriod;
  }
}

function renderStockSummary(summary) {
  setText('stockProductCount', formatStockQuantity(summary.controlledProducts));
  setText('stockLowCount', formatStockQuantity(summary.lowStockCount));
  setText('stockInventoryValue', formatCurrency(summary.inventoryValue));
  setText('stockInventoryUnits', `${formatStockQuantity(summary.currentUnits)} unidades atuais`);
  setText('stockEntryValue', formatCurrency(summary.entryValue));
  setText('stockEntryUnits', `${formatStockQuantity(summary.entryUnits)} unidades no período`);
  setText('stockOutputUnits', `${formatStockQuantity(summary.outputUnits)} unidades`);
  setText('stockSalesUnits', `${formatStockQuantity(summary.salesUnits)} por pedidos`);
  setText('stockSalesRevenue', formatCurrency(summary.salesRevenue));
  setText('stockCostOfGoods', formatCurrency(summary.costOfGoods));
  setText('stockGrossProfit', formatCurrency(summary.grossProfit));
  setText('stockGrossMargin', `Margem estimada ${formatStockPercent(summary.grossMarginPercent)}`);
  setText('stockPotentialGrossProfit', formatCurrency(summary.potentialGrossProfit));
  setText('stockPotentialRevenue', `Receita potencial ${formatCurrency(summary.potentialRevenue)}`);
  const profitCard = document.getElementById('stockGrossProfit')?.closest('.stock-kpi');
  profitCard?.classList.toggle('negative', stockFiniteNumber(summary.grossProfit) < 0);
}

function renderStockCards(items) {
  const grid = document.getElementById('stockGrid');
  if (!grid) return;
  grid.innerHTML = items.length ? items.map((item) => {
    const safeName = escapeHtml(item.name || 'Produto sem nome');
    const safeProductId = escapeHtml(item.productId || '');
    const safeUnit = escapeHtml(item.unit || 'UN');
    return `
      <article class="stock-card ${item.lowStock ? 'low' : ''}">
        <header class="stock-card-head"><div><strong>${safeName}</strong><small>${item.lowStock ? 'Estoque baixo' : 'Estoque normal'}</small></div><span class="stock-status-dot" aria-hidden="true"></span></header>
        <div class="stock-quantity">${formatStockQuantity(item.quantity)} <small>${safeUnit}</small></div>
        <div class="stock-minimum">Mínimo: ${formatStockQuantity(item.minimumQuantity)} ${safeUnit}</div>
        <dl class="stock-card-metrics">
          <div><dt>Custo médio</dt><dd>${formatCurrency(stockFiniteNumber(item.averageUnitCost))}</dd></div>
          <div><dt>Preço de venda</dt><dd>${formatCurrency(stockFiniteNumber(item.salePrice))}</dd></div>
          <div><dt>Valor em estoque</dt><dd>${formatCurrency(stockFiniteNumber(item.inventoryValue))}</dd></div>
          <div><dt>Lucro potencial</dt><dd>${formatCurrency(stockFiniteNumber(item.potentialGrossProfit))}</dd></div>
        </dl>
        <div class="stock-card-actions">
          <button class="btn-outline sm" type="button" data-stock-action="entry" data-product-id="${safeProductId}" aria-label="Dar entrada em ${safeName}">Entrada</button>
          <button class="btn-outline sm" type="button" data-stock-action="exit" data-product-id="${safeProductId}" aria-label="Registrar saída de ${safeName}">Saída</button>
          <button class="btn-outline sm" type="button" data-stock-action="adjustment" data-product-id="${safeProductId}" aria-label="Ajustar saldo de ${safeName}">Ajustar</button>
        </div>
      </article>`;
  }).join('') : '<div class="table-empty"><p>Marque “Controlar estoque” no cadastro dos produtos.</p></div>';
}

function renderStockRanking(items) {
  const target = document.getElementById('stockRanking');
  if (!target) return;
  const itemById = new Map(items.map((item) => [String(item.productId), item]));
  const analyticsProducts = Array.isArray(STATE.stock?.analytics?.products) ? STATE.stock.analytics.products : [];
  const ranking = analyticsProducts.length ? analyticsProducts : items;
  setText('stockRankingPeriodLabel', `Desempenho em ${STOCK_PERIOD_LABELS[STATE.stockPeriod] || STOCK_PERIOD_LABELS['30d']}.`);
  if (!ranking.length) {
    target.innerHTML = '<div class="empty-state-sm">Nenhum produto controlado para classificar.</div>';
    return;
  }
  target.innerHTML = `
    <table class="stock-ranking-table">
      <thead><tr><th>#</th><th>Produto</th><th>Estoque</th><th>Vendas</th><th>Receita</th><th>CMV</th><th>Lucro bruto estimado</th><th>Margem</th><th>Lucro potencial</th></tr></thead>
      <tbody>${ranking.map((row, index) => {
        const base = itemById.get(String(row.productId)) || {};
        const name = row.name || base.name || row.productId || 'Produto';
        const unit = row.unit || base.unit || 'UN';
        return `<tr>
          <td data-label="Posição"><strong>${index + 1}</strong></td>
          <td data-label="Produto"><strong>${escapeHtml(name)}</strong><small>Custo médio ${formatCurrency(stockFiniteNumber(row.averageUnitCost ?? base.averageUnitCost))}</small></td>
          <td data-label="Estoque">${formatStockQuantity(row.quantity ?? base.quantity)} ${escapeHtml(unit)}</td>
          <td data-label="Vendas">${formatStockQuantity(row.salesUnits ?? row.quantitySold)} ${escapeHtml(unit)}</td>
          <td data-label="Receita">${formatCurrency(stockFiniteNumber(row.salesRevenue))}</td>
          <td data-label="CMV">${formatCurrency(stockFiniteNumber(row.costOfGoods ?? row.cogs))}</td>
          <td data-label="Lucro bruto estimado"><strong>${formatCurrency(stockFiniteNumber(row.grossProfit))}</strong></td>
          <td data-label="Margem">${formatStockPercent(row.grossMarginPercent)}</td>
          <td data-label="Lucro potencial">${formatCurrency(stockFiniteNumber(row.potentialGrossProfit ?? base.potentialGrossProfit))}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function renderStockHistory(items, movements) {
  const history = document.getElementById('stockHistory');
  if (!history) return;
  const productNames = new Map([
    ...STATE.products.map((product) => [String(product.id), product.name]),
    ...items.map((item) => [String(item.productId), item.name]),
  ]);
  const productUnits = new Map(items.map((item) => [String(item.productId), item.unit || 'UN']));
  history.innerHTML = movements.length ? movements.map((row) => {
    const meta = stockMovementMeta(row);
    const quantity = stockFiniteNumber(row.quantity);
    const unitCost = stockOptionalNumber(row.unitCost, row.averageUnitCost);
    const explicitCost = stockOptionalNumber(row.costOfGoods, row.totalCost, row.costValue, row.movementValue);
    const totalCost = explicitCost ?? (unitCost === null ? null : Math.abs(quantity) * unitCost);
    const revenue = stockOptionalNumber(
      row.salesRevenue,
      row.totalRevenue,
      row.revenue,
      stockOptionalNumber(row.unitRevenue) === null ? null : Math.abs(quantity) * stockFiniteNumber(row.unitRevenue),
    );
    const explicitProfit = stockOptionalNumber(row.grossProfit);
    const grossProfit = explicitProfit ?? (revenue === null || totalCost === null ? null : revenue - totalCost);
    const productName = productNames.get(String(row.productId)) || row.productName || row.productId || 'Produto';
    const unit = productUnits.get(String(row.productId)) || row.unit || 'UN';
    const details = [
      row.supplier ? `<span><b>Fornecedor:</b> ${escapeHtml(row.supplier)}</span>` : '',
      row.invoiceNumber ? `<span><b>Nota:</b> ${escapeHtml(row.invoiceNumber)}</span>` : '',
      row.orderId ? `<span><b>Pedido:</b> #${escapeHtml(row.orderId)}</span>` : '',
      (row.actorName || row.actor || row.operator) ? `<span><b>Responsável:</b> ${escapeHtml(row.actorName || row.actor || row.operator)}</span>` : '',
      row.notes ? `<span class="stock-history-note"><b>Observação:</b> ${escapeHtml(row.notes)}</span>` : '',
    ].filter(Boolean).join('');
    return `
      <article class="stock-history-card">
        <div class="stock-history-head">
          <div><strong>${escapeHtml(productName)}</strong><small>${escapeHtml(meta.label)} · ${escapeHtml(formatOrderLogDate(row.createdAt))}</small></div>
          <div class="stock-history-quantity stock-${meta.direction}">${quantity >= 0 ? '+' : ''}${formatStockQuantity(quantity)} ${escapeHtml(unit)}<small>Saldo ${formatStockQuantity(row.balanceAfter)}</small></div>
        </div>
        <div class="stock-history-financials">
          <div><span>Custo / CMV</span><strong>${totalCost === null ? '—' : formatCurrency(totalCost)}</strong>${unitCost === null ? '' : `<small>${formatCurrency(unitCost)} por unidade</small>`}</div>
          <div><span>Receita</span><strong>${revenue === null ? '—' : formatCurrency(revenue)}</strong></div>
          <div><span>Lucro bruto estimado</span><strong>${grossProfit === null ? '—' : formatCurrency(grossProfit)}</strong></div>
        </div>
        ${details ? `<div class="stock-history-details">${details}</div>` : ''}
      </article>`;
  }).join('') : '<div class="empty-state-sm">Nenhuma movimentação registrada neste período.</div>';
}

function renderStock() {
  const items = Array.isArray(STATE.stock?.items) ? STATE.stock.items : [];
  const movements = Array.isArray(STATE.stock?.movements) ? STATE.stock.movements : [];
  renderStockSummary(normalizedStockSummary(items, movements));
  renderStockCards(items);
  renderStockRanking(items);
  renderStockHistory(items, movements);
}

function syncStockMovementForm() {
  const type = ['entry', 'exit', 'adjustment'].includes(getVal('stockMovementType'))
    ? getVal('stockMovementType')
    : 'entry';
  const isEntry = type === 'entry';
  const isAdjustment = type === 'adjustment';
  const title = isEntry ? 'Dar entrada no estoque' : isAdjustment ? 'Ajustar saldo do estoque' : 'Registrar saída do estoque';
  const quantityLabel = isAdjustment ? 'Novo saldo' : isEntry ? 'Quantidade de entrada' : 'Quantidade de saída';
  const notesLabel = isEntry ? 'Observação (opcional)' : isAdjustment ? 'Motivo do ajuste' : 'Motivo da saída';
  const hint = isEntry
    ? 'Informe o custo real da unidade adicionada.'
    : isAdjustment
      ? 'O novo saldo pode ser zero. Explique a divergência encontrada.'
      : 'A quantidade deve ser maior que zero. Explique o motivo da saída.';
  setText('stockMovementModalTitle', title);
  setText('stockQuantityLabel', quantityLabel);
  setText('stockNotesLabel', notesLabel);
  setText('stockMovementHint', hint);
  ['stockCostField', 'stockSupplierField', 'stockInvoiceField'].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.hidden = !isEntry;
  });
  const quantityInput = document.getElementById('stockQuantity');
  if (quantityInput) {
    quantityInput.min = isAdjustment ? '0' : String(STOCK_MIN_QUANTITY);
    quantityInput.max = String(STOCK_MAX_QUANTITY);
  }
  const costInput = document.getElementById('stockUnitCost');
  if (costInput) {
    costInput.required = isEntry;
    costInput.min = String(STOCK_MIN_UNIT_COST);
    costInput.max = String(STOCK_MAX_UNIT_COST);
  }
  const notesInput = document.getElementById('stockNotes');
  if (notesInput) notesInput.required = !isEntry;
  setText('stockMovementError', '');
}

function openStockMovement(type = 'entry', productId = '') {
  const movementType = ['entry', 'exit', 'adjustment'].includes(type) ? type : 'entry';
  const products = [...STATE.products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  const select = document.getElementById('stockProductId');
  if (!products.length) { showToast('Cadastre primeiro um produto.', 'info'); return; }
  select.innerHTML = products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}${product.trackStock ? '' : ' (ativar estoque)'}</option>`).join('');
  setVal('stockProductId', productId || products[0].id);
  setVal('stockMovementType', movementType);
  ['stockQuantity', 'stockUnitCost', 'stockSupplier', 'stockInvoiceNumber', 'stockNotes'].forEach((id) => setVal(id, ''));
  STATE.stockMovementFlow = { clientRequestId: createStockClientRequestId(), saving: false };
  const saveButton = document.getElementById('saveStockMovementButton');
  if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Salvar movimento'; }
  syncStockMovementForm();
  openModal('stockMovementModal');
  setTimeout(() => document.getElementById('stockQuantity')?.focus(), 50);
}

async function saveStockMovement() {
  const flow = STATE.stockMovementFlow;
  if (!flow || flow.saving) return;
  const movementType = getVal('stockMovementType');
  const quantityRaw = getVal('stockQuantity').trim();
  const unitCostRaw = getVal('stockUnitCost').trim();
  const quantity = Number(quantityRaw);
  const unitCost = Number(unitCostRaw);
  const notes = getVal('stockNotes').trim();
  const errorTarget = document.getElementById('stockMovementError');
  const showValidationError = (message, inputId) => {
    if (errorTarget) errorTarget.textContent = message;
    document.getElementById(inputId)?.focus();
  };
  if (!['entry', 'exit', 'adjustment'].includes(movementType)) {
    showValidationError('Selecione um tipo de movimentação válido.', 'stockMovementType');
    return;
  }
  if (!quantityRaw) {
    showValidationError('Informe a quantidade.', 'stockQuantity');
    return;
  }
  if (
    !Number.isFinite(quantity)
    || quantity > STOCK_MAX_QUANTITY
    || (movementType === 'adjustment'
      ? quantity < 0 || (quantity > 0 && quantity < STOCK_MIN_QUANTITY)
      : quantity < STOCK_MIN_QUANTITY)
  ) {
    showValidationError(
      movementType === 'adjustment'
        ? `O novo saldo deve ser zero ou estar entre ${STOCK_MIN_QUANTITY} e ${STOCK_MAX_QUANTITY.toLocaleString('pt-BR')}.`
        : `A quantidade deve estar entre ${STOCK_MIN_QUANTITY} e ${STOCK_MAX_QUANTITY.toLocaleString('pt-BR')}.`,
      'stockQuantity',
    );
    return;
  }
  if (movementType === 'entry' && (
    !unitCostRaw
    || !Number.isFinite(unitCost)
    || unitCost < STOCK_MIN_UNIT_COST
    || unitCost > STOCK_MAX_UNIT_COST
  )) {
    showValidationError(
      `Informe um custo unitário entre ${formatCurrency(STOCK_MIN_UNIT_COST)} e ${formatCurrency(STOCK_MAX_UNIT_COST)}.`,
      'stockUnitCost',
    );
    return;
  }
  if (movementType !== 'entry' && notes.length < 3) {
    showValidationError('Informe um motivo com pelo menos 3 caracteres.', 'stockNotes');
    return;
  }
  const selectedProduct = STATE.products.find((product) => String(product.id) === String(getVal('stockProductId')));
  if (!selectedProduct) {
    showValidationError('Selecione um produto válido.', 'stockProductId');
    return;
  }

  flow.saving = true;
  const saveButton = document.getElementById('saveStockMovementButton');
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Salvando…'; }
  if (errorTarget) errorTarget.textContent = '';
  try {
    if (!selectedProduct.trackStock) {
      const enabledProduct = {
        ...selectedProduct,
        trackStock: true,
        minimumStock: Math.max(0, Number(selectedProduct.minimumStock) || 0),
        stockUnit: selectedProduct.stockUnit || selectedProduct.unit || 'UN',
      };
      const remoteResult = await upsertProductRemote(enabledProduct, { attempts: 3 });
      if (!remoteResult?.remoteOk) throw new Error('Não foi possível ativar o estoque deste produto. Tente novamente.');
      Object.assign(selectedProduct, enabledProduct);
      saveProductsLocalCache(STATE.products);
    }
    const result = await fetchStock('/movements', {
      method: 'POST',
      body: JSON.stringify({
        clientRequestId: flow.clientRequestId,
        productId: getVal('stockProductId'),
        movementType,
        quantity,
        unitCost: movementType === 'entry' ? unitCost : 0,
        supplier: movementType === 'entry' ? getVal('stockSupplier').trim() : '',
        invoiceNumber: movementType === 'entry' ? getVal('stockInvoiceNumber').trim() : '',
        notes,
        reason: notes,
      }),
    });
    if (STATE.stockMovementFlow === flow) {
      STATE.stockMovementFlow = null;
      closeModal();
    }
    showToast(result?.idempotentReplay ? 'Movimento já confirmado; dashboard atualizado.' : 'Estoque atualizado.', 'success');
    await loadStock();
  } catch (error) {
    const message = String(error?.message || error);
    if (STATE.stockMovementFlow === flow && errorTarget) errorTarget.textContent = message;
    showToast(message, 'error');
  } finally {
    if (STATE.stockMovementFlow === flow) {
      flow.saving = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Salvar movimento'; }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('stockGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-stock-action][data-product-id]');
    if (!button) return;
    openStockMovement(button.dataset.stockAction, button.dataset.productId);
  });
});

async function previewStockXml(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('O XML deve ter no maximo 5 MB.');
    const xml = await file.text();
    const result = await fetchStock('/xml/preview', { method: 'POST', body: JSON.stringify({ xml }) });
    STATE.stockXmlInvoice = result.invoice;
    renderStockXmlPreview();
    openModal('stockXmlModal');
  } catch (error) { showToast(String(error?.message || error), 'error', 4500); }
  finally { input.value = ''; }
}

function renderStockXmlPreview() {
  const invoice = STATE.stockXmlInvoice;
  if (!invoice) return;
  const summary = document.getElementById('stockXmlSummary');
  if (summary) summary.innerHTML = `<strong>NF-e ${escapeHtml(invoice.invoiceNumber || '')}</strong><span>${escapeHtml(invoice.supplierName || '')} · ${escapeHtml(invoice.supplierCnpj || '')}</span><span>Total ${formatCurrency(invoice.total || 0)}</span><small>Chave: ${escapeHtml(invoice.accessKey || '')}</small>`;
  const products = STATE.products.filter((product) => product.trackStock);
  const options = (selected) => `<option value="">Nao importar</option>${products.map((product) => `<option value="${escapeHtml(product.id)}" ${String(product.id) === String(selected) ? 'selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}`;
  const container = document.getElementById('stockXmlItems');
  if (container) container.innerHTML = invoice.items.map((item, index) => `<article class="stock-xml-item" data-index="${index}"><div><strong>${escapeHtml(item.name)}</strong><small>Cod. ${escapeHtml(item.supplierCode)} · NCM ${escapeHtml(item.ncm || '-')} · ${Number(item.quantity).toLocaleString('pt-BR')} ${escapeHtml(item.unit)}</small></div><label>Produto no cardapio<select class="xml-product">${options(item.productId)}</select></label><label>Unidades por ${escapeHtml(item.unit || 'item')}<input class="xml-factor" type="number" min="0.001" step="0.001" value="${Number(item.conversionFactor || 1)}" /></label><span>Entrada: <strong class="xml-total">${Number(item.quantity * (item.conversionFactor || 1)).toLocaleString('pt-BR')}</strong></span></article>`).join('');
  container?.querySelectorAll('.xml-factor').forEach((input) => input.addEventListener('input', () => { const card = input.closest('.stock-xml-item'); const item = invoice.items[Number(card.dataset.index)]; card.querySelector('.xml-total').textContent = Number(item.quantity * (Number(input.value) || 0)).toLocaleString('pt-BR'); }));
}

async function confirmStockXmlImport() {
  const invoice = STATE.stockXmlInvoice;
  if (!invoice || STATE.stockXmlImporting) return;
  let invalidFactorInput = null;
  const items = [...document.querySelectorAll('.stock-xml-item')].map((card) => {
    const source = invoice.items[Number(card.dataset.index)];
    const factorInput = card.querySelector('.xml-factor');
    const factorRaw = String(factorInput?.value || '').trim();
    const conversionFactor = Number(factorRaw);
    const convertedQuantity = stockFiniteNumber(source?.quantity) * conversionFactor;
    if (
      !factorRaw
      || !Number.isFinite(conversionFactor)
      || conversionFactor < STOCK_MIN_QUANTITY
      || conversionFactor > STOCK_MAX_QUANTITY
      || !Number.isFinite(convertedQuantity)
      || convertedQuantity > STOCK_MAX_QUANTITY
    ) invalidFactorInput ||= factorInput;
    return {
      ...source,
      productId: card.querySelector('.xml-product').value,
      conversionFactor,
    };
  }).filter((item) => item.productId);
  if (invalidFactorInput) {
    showToast(`A conversão deve gerar entre ${STOCK_MIN_QUANTITY} e ${STOCK_MAX_QUANTITY.toLocaleString('pt-BR')} unidades.`, 'error');
    invalidFactorInput.focus();
    return;
  }
  if (!items.length) { showToast('Vincule pelo menos um item ao estoque.', 'error'); return; }
  const confirmButton = document.getElementById('confirmStockXmlImportButton');
  STATE.stockXmlImporting = true;
  if (confirmButton) { confirmButton.disabled = true; confirmButton.textContent = 'Importando…'; }
  try {
    await fetchStock('/xml/import', { method: 'POST', body: JSON.stringify({ invoice, items }) });
    STATE.stockXmlInvoice = null; closeModal(); showToast('XML importado e estoque atualizado.', 'success'); await loadStock();
  } catch (error) { showToast(String(error?.message || error), 'error', 4500); }
  finally {
    STATE.stockXmlImporting = false;
    if (confirmButton) { confirmButton.disabled = false; confirmButton.textContent = 'Confirmar entrada'; }
  }
}

function renderProductsTable(filter = {}) {
  const search = normalizeAdminSearchText(document.getElementById('productSearch')?.value || '');
  const catF = document.getElementById('productCatFilter')?.value || '';
  const statusF = document.getElementById('productStatusFilter')?.value || '';
  const sortF = document.getElementById('productSort')?.value || 'name';

  let list = [...STATE.products];

  if (search) list = list.filter((product) => {
    const category = STATE.categories.find(item =>
      String(item?.id || '') === String(product?.category || '')
    );
    return matchesAdminSearch([
      product?.id,
      product?.name,
      product?.description,
      product?.ingredients,
      product?.size,
      product?.badge,
      product?.category,
      category?.name,
      category?.description,
      product?.fiscalName,
      product?.fiscalCode,
      product?.barcode,
      product?.gtin,
      product?.ean,
      product?.ncm
    ].filter(Boolean).join(' '), search);
  });

  if (catF) list = list.filter(p => p.category === catF);

  if (statusF === 'active') list = list.filter(p => p.active);
  if (statusF === 'inactive') list = list.filter(p => !p.active);

  list.sort((a, b) => {
    if (sortF === 'name') return compareAdminProductsAlphabetically(a, b);
    if (sortF === 'name-desc') return compareAdminProductsAlphabetically(b, a);
    if (sortF === 'price') return a.price - b.price;
    if (sortF === 'price-desc') return b.price - a.price;
    return 0;
  });

  const grid = document.getElementById('productsGrid');
  const empty = document.getElementById('productsEmpty');
  if (!grid || !empty) return;

  if (list.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map(p => {
    const cat = STATE.categories.find(c => c.id === p.category);
    const productIdLiteral = toInlineJsStringLiteral(p.id);
    const safeImage = sanitizeImageUrl(p.image);
    const safeName = escapeHtml(p.name || '');
    const safeDescription = escapeHtml(p.description || 'Sem descrição');
    const safeEmoji = escapeHtml(p.emoji || '🍕');
    const safeCategory = cat
      ? `${escapeHtml(cat.icon || '')} ${escapeHtml(cat.name || '')}`
      : '—';
    const imgHtml = safeImage
      ? `<img src="${escapeHtml(safeImage)}" class="pc-img" alt="${safeName}" />`
      : `<span class="pc-emoji">${safeEmoji}</span>`;
    const oldPrice = parseFloat(p.oldPrice);
    const currentPrice = parseFloat(p.price);
    const hasPromo = !isNaN(oldPrice) && oldPrice > currentPrice;
    const oldPriceHtml = hasPromo
      ? `<span class="old-price-small">${formatCurrency(p.oldPrice)}</span>`
      : '';
    const fiscalSummary = getProductFiscalSummary(p);

    return `
      <article class="product-admin-card">
        <div class="product-admin-head">
          <div class="product-cell">
            ${imgHtml}
            <div class="pc-info">
              <div class="pc-name">${safeName}</div>
              <div class="pc-desc">${safeDescription}</div>
            </div>
          </div>
          <span class="badge ${p.active ? 'active' : 'inactive'}">${p.active ? 'Ativo' : 'Inativo'}</span>
        </div>

        <div class="product-admin-meta">
          <div class="product-admin-item">
            <span class="pami-label">Categoria</span>
            <span class="pami-value">${safeCategory}</span>
          </div>
          <div class="product-admin-item price">
            <span class="pami-label">Preço</span>
            <span class="pami-value">${oldPriceHtml}${formatCurrency(p.price)}</span>
          </div>
          <div class="product-admin-item">
            <span class="pami-label">Promoção</span>
            <span class="pami-value">${hasPromo ? '✅ Sim' : '— Não'}</span>
          </div>
          <div class="product-admin-item">
            <span class="pami-label">Destaque</span>
            <span class="pami-value">${p.featured ? '⭐ Sim' : '— Não'}</span>
          </div>
          <div class="product-admin-item">
            <span class="pami-label">Fiscal</span>
            <span class="pami-value"><span class="badge ${fiscalSummary.badgeClass}" title="${escapeHtml(fiscalSummary.detail)}">${escapeHtml(fiscalSummary.label)}</span></span>
          </div>
        </div>

        <div class="product-admin-actions">
          <button class="btn-outline sm" onclick="editProduct(${productIdLiteral})">✏️ Editar</button>
          <button class="btn-outline sm" onclick="toggleProductStatus(${productIdLiteral})">${p.active ? '🚫 Desativar' : '✅ Ativar'}</button>
          <button class="btn-danger-outline sm" onclick="deleteProduct(${productIdLiteral})">🗑️ Excluir</button>
        </div>
      </article>
    `;
  }).join('');

  refreshAllBadges();
}

function filterProducts() {
  renderProductsTable();
}

function getAdminProductAlphabeticalKey(product) {
  return normalizeAdminSearchText(product?.name || '')
    .replace(/^pizzas?\s+/, '')
    .replace(/\s+(?:g|m|p)\s+\d+p$/, '')
    .replace(/\s+(?:grande|media|pequena)(?:\s+\d+cm)?$/, '')
    .trim();
}

function compareAdminProductsAlphabetically(a, b) {
  const byFlavor = getAdminProductAlphabeticalKey(a).localeCompare(
    getAdminProductAlphabeticalKey(b),
    'pt-BR',
    { sensitivity: 'base', numeric: true },
  );
  if (byFlavor !== 0) return byFlavor;
  return normalizeAdminSearchText(a?.name || '').localeCompare(
    normalizeAdminSearchText(b?.name || ''),
    'pt-BR',
    { sensitivity: 'base', numeric: true },
  );
}

function clearAdminProductSearch() {
  const productSearch = document.getElementById('productSearch');
  const globalSearch = document.getElementById('globalSearch');
  if (productSearch) productSearch.value = '';
  if (globalSearch) globalSearch.value = '';
}

function handleProductFilterChange() {
  clearAdminProductSearch();
  filterProducts();
}

function normalizeAdminSearchText(value) {
  const raw = fixMojibakeText(String(value || '')).trim();
  const normalized = typeof raw.normalize === 'function'
    ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : raw;

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAdminSearch(searchableText, query) {
  const terms = normalizeAdminSearchText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const normalizedText = normalizeAdminSearchText(searchableText);
  return terms.every(term => normalizedText.includes(term));
}

if (typeof window !== 'undefined') {
  window.filterProducts = filterProducts;
  window.handleProductFilterChange = handleProductFilterChange;
}

function handleGlobalSearch(val) {
  const productSearch = document.getElementById('productSearch');
  if (productSearch) productSearch.value = val;
  clearAdminProductFiltersForSearch(val);
  filterProducts();
}

function handleProductSearch(val) {
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) globalSearch.value = val;
  clearAdminProductFiltersForSearch(val);
  filterProducts();
}

function clearAdminProductFiltersForSearch(value) {
  if (!normalizeAdminSearchText(value)) return;
  const categoryFilter = document.getElementById('productCatFilter');
  const statusFilter = document.getElementById('productStatusFilter');
  if (categoryFilter) categoryFilter.value = '';
  if (statusFilter) statusFilter.value = '';
}

function focusAdminSearch(target = 'products') {
  const input = document.getElementById(target === 'global' ? 'globalSearch' : 'productSearch');
  if (!input) return;
  input.focus();
  filterProducts();
}

function normalizeNcmCode(value) {
  return productDigits(value, 8);
}

function sanitizeNcmCatalogEntry(entry) {
  const code = normalizeNcmCode(entry?.code);
  if (!code || code.length !== 8) return null;
  const title = fixMojibakeText(entry?.title || entry?.description || '').trim();
  if (!title) return null;
  return {
    code,
    title,
    examples: fixMojibakeText(entry?.examples || '').trim(),
    category: fixMojibakeText(entry?.category || 'Personalizado').trim(),
    custom: Boolean(entry?.custom),
    createdAt: entry?.createdAt || '',
  };
}

function loadNcmCatalog() {
  const saved = loadFromLS(LS.ncmCatalog, []);
  STATE.ncmCatalog = Array.isArray(saved)
    ? saved.map(sanitizeNcmCatalogEntry).filter(Boolean)
    : [];
}

function saveNcmCatalog() {
  localStorage.setItem(LS.ncmCatalog, JSON.stringify(STATE.ncmCatalog));
}

function getNcmCatalog() {
  const merged = new Map();
  DEFAULT_NCM_CATALOG.forEach(entry => {
    const clean = sanitizeNcmCatalogEntry(entry);
    if (clean) merged.set(clean.code, clean);
  });
  STATE.ncmCatalog.forEach(entry => {
    const clean = sanitizeNcmCatalogEntry(entry);
    if (clean) merged.set(clean.code, { ...clean, custom: true });
  });
  return [...merged.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category, 'pt-BR');
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

function getCurrentProductNcmContext() {
  const category = STATE.categories.find(cat => cat.id === getVal('pCategory'));
  return [
    getVal('pName'),
    getVal('pFiscalName'),
    getVal('pDescription'),
    getVal('pIngredients'),
    getVal('pSize'),
    category?.name,
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreNcmEntry(entry, query, context) {
  const haystack = `${entry.code} ${entry.title} ${entry.examples} ${entry.category}`.toLowerCase();
  const normalizedQuery = String(query || '').trim().toLowerCase();
  let score = 0;
  if (normalizedQuery && haystack.includes(normalizedQuery)) score += 100;
  if (normalizedQuery && entry.code.startsWith(normalizeNcmCode(normalizedQuery))) score += 120;
  if (!normalizedQuery && context) {
    context.split(/\s+/).filter(term => term.length >= 3).forEach(term => {
      if (haystack.includes(term)) score += 8;
    });
  }
  if (entry.custom) score += 3;
  return score;
}

function findNcmEntry(code) {
  const normalized = normalizeNcmCode(code);
  return getNcmCatalog().find(entry => entry.code === normalized) || null;
}

function updateNcmHint() {
  const hint = document.getElementById('pNcmHint');
  if (!hint) return;
  const code = normalizeNcmCode(getVal('pNcm'));
  if (!code) {
    const fallback = STATE.fiscal?.defaultNcm || '';
    const fallbackEntry = findNcmEntry(fallback);
    hint.textContent = fallbackEntry
      ? `Vazio usa padrao ${fallback}: ${fallbackEntry.title}`
      : `Vazio usa o NCM padrao fiscal ${fallback || 'nao definido'}`;
    return;
  }
  const entry = findNcmEntry(code);
  hint.textContent = entry
    ? `${entry.title}${entry.examples ? ` - ${entry.examples}` : ''}`
    : 'NCM nao encontrado no catalogo local. Confirme com o contador ou cadastre abaixo.';
}

function isNcmPickerOpen() {
  const panel = document.getElementById('ncmPickerPanel');
  return panel && panel.classList.contains('open');
}

function openNcmPicker() {
  const panel = document.getElementById('ncmPickerPanel');
  const search = document.getElementById('ncmSearchInput');
  const customCode = document.getElementById('ncmCustomCode');
  if (!panel) return;
  const wasOpen = panel.classList.contains('open');
  panel.classList.add('open');
  if (!wasOpen && search) search.value = '';
  if (customCode && !customCode.value) customCode.value = normalizeNcmCode(getVal('pNcm'));
  renderNcmCatalogResults();
}

function closeNcmPicker() {
  const panel = document.getElementById('ncmPickerPanel');
  if (panel) panel.classList.remove('open');
}

function toggleNcmPicker() {
  if (isNcmPickerOpen()) closeNcmPicker();
  else openNcmPicker();
}

function handleNcmInputChange() {
  const ncmInput = document.getElementById('pNcm');
  if (ncmInput) ncmInput.value = normalizeNcmCode(ncmInput.value);
  const search = document.getElementById('ncmSearchInput');
  if (search && isNcmPickerOpen()) search.value = getVal('pNcm');
  updateNcmHint();
  if (isNcmPickerOpen()) renderNcmCatalogResults();
}

function renderNcmCatalogResults() {
  const container = document.getElementById('ncmResults');
  if (!container) return;
  const query = getVal('ncmSearchInput');
  const context = getCurrentProductNcmContext();
  const entries = getNcmCatalog()
    .map(entry => ({ entry, score: scoreNcmEntry(entry, query, context) }))
    .filter(row => !query.trim() || row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'pt-BR'))
    .slice(0, 40)
    .map(row => row.entry);

  if (!entries.length) {
    container.innerHTML = '<div class="ncm-empty">Nenhum NCM encontrado. Cadastre abaixo para usar neste produto.</div>';
    return;
  }

  container.innerHTML = entries.map(entry => `
    <button type="button" class="ncm-result" onclick="selectNcmCatalogEntry('${entry.code}')">
      <span class="ncm-code">${escapeHtml(entry.code)}</span>
      <span class="ncm-main">
        <strong>${escapeHtml(entry.title)}</strong>
        <small>${escapeHtml(entry.category)}${entry.examples ? ` - ${escapeHtml(entry.examples)}` : ''}</small>
      </span>
      ${entry.custom ? '<span class="ncm-chip">Meu</span>' : ''}
    </button>
  `).join('');
}

function selectNcmCatalogEntry(code) {
  const entry = findNcmEntry(code);
  setVal('pNcm', normalizeNcmCode(code));
  if (entry && !getVal('pFiscalName').trim()) {
    const productName = getVal('pName').trim();
    if (productName) setVal('pFiscalName', productName);
  }
  updateNcmHint();
  closeNcmPicker();
}

function saveCustomNcmEntry() {
  const code = normalizeNcmCode(getVal('ncmCustomCode') || getVal('pNcm'));
  const title = getVal('ncmCustomTitle').trim();
  const examples = getVal('ncmCustomExamples').trim();
  if (code.length !== 8) {
    showToast('Informe um NCM com 8 digitos.', 'error');
    return;
  }
  if (!title) {
    showToast('Informe para qual produto esse NCM se refere.', 'error');
    return;
  }
  const nextEntry = { code, title, examples, category: 'Meu catalogo', custom: true, createdAt: new Date().toISOString() };
  STATE.ncmCatalog = STATE.ncmCatalog.filter(entry => entry.code !== code).concat(nextEntry);
  saveNcmCatalog();
  setVal('ncmCustomCode', '');
  setVal('ncmCustomTitle', '');
  setVal('ncmCustomExamples', '');
  setVal('pNcm', code);
  updateNcmHint();
  renderNcmCatalogResults();
  showToast('NCM salvo no catalogo local.', 'success');
}

/** Abre modal para NOVO produto */
function openProductModal() {
  STATE.editingId = null;
  resetProductForm();
  document.getElementById('productModalTitle').textContent = 'Novo Produto';
  populateCategorySelectInModal();
  updateNcmHint();
  openModal('productModal');
}

/** Abre modal para EDITAR produto */
function editProduct(id) {
  const product = STATE.products.find(p => p.id === id);
  if (!product) return;
  STATE.editingId = id;

  document.getElementById('productModalTitle').textContent = 'Editar Produto';
  populateCategorySelectInModal();

  // Preenche campos
  setVal('productId', product.id);
  setVal('pName', product.name);
  setVal('pCategory', product.category);
  setVal('pPrice', product.price);
  setVal('pOldPrice', product.oldPrice || '');
  setVal('pEmoji', product.emoji || '');
  setVal('pBadge', product.badge || '');
  setVal('pDescription', product.description || '');
  setVal('pIngredients', product.ingredients || '');
  setVal('pSize', product.size || '');
  setVal('pObservations', product.observations || '');
  setVal('pImage', product.image || '');
  setVal('pFiscalCode', product.fiscalCode || product.sku || '');
  setVal('pBarcode', product.barcode || product.gtin || product.ean || '');
  setVal('pFiscalName', product.fiscalName || '');
  setVal('pNcm', product.ncm || STATE.fiscal?.defaultNcm || '');
  setVal('pCest', product.cest || '');
  setVal('pCfop', product.cfop || STATE.fiscal?.defaultCfop || '');
  setVal('pCsosn', product.csosn || STATE.fiscal?.defaultCsosn || '');
  setVal('pOrigin', product.origin || STATE.fiscal?.defaultOrigin || '0');
  setVal('pUnit', product.unit || STATE.fiscal?.defaultUnit || 'UN');
  setVal('pTribUnit', product.tributaryUnit || product.tribUnit || product.unit || STATE.fiscal?.defaultUnit || 'UN');
  setVal('pTribFactor', product.tributaryFactor || product.tribFactor || '');
  setVal('pAliquotaIcms', product.aliquotaIcms ?? STATE.fiscal?.defaultAliquotaIcms ?? 0);
  setVal('pPisCst', productTaxCst(product.pisCst, ''));
  setVal('pPisAliquota', product.pisAliquota ?? 0);
  setVal('pCofinsCst', productTaxCst(product.cofinsCst, ''));
  setVal('pCofinsAliquota', product.cofinsAliquota ?? 0);
  setVal('pBenefitCode', product.benefitCode || product.cBenef || '');
  setVal('pFiscalProfileSource', product.fiscalProfileSource || '');
  setVal('pFiscalProfileNote', product.fiscalProfileNote || '');
  setVal('pMinimumStock', product.minimumStock ?? 0);
  setVal('pStockUnit', product.stockUnit || product.unit || 'UN');
  document.getElementById('pTrackStock').checked = Boolean(product.trackStock);
  document.getElementById('pFeatured').checked = product.featured;
  document.getElementById('pActive').checked = product.active;
  document.getElementById('pFiscalReviewRequired').checked = product.fiscalReviewRequired === true;

  // Preview de imagem
  updateProductImagePreview(product.image, product.emoji);
  updateNcmHint();

  openModal('productModal');
}

/** Salva produto (novo ou edição) */
async function saveProduct() {
  const name = getVal('pName').trim();
  const price = parseFloat(getVal('pPrice'));
  const cat = getVal('pCategory');

  if (!name) { showToast('Informe o nome do produto.', 'error'); return; }
  if (isNaN(price)) { showToast('Informe um preço válido.', 'error'); return; }
  if (!cat) { showToast('Selecione uma categoria.', 'error'); return; }
  if (!STATE.categories.some((category) => String(category?.id || '') === cat)) {
    showToast('A categoria selecionada nao existe mais. Atualize o painel.', 'error');
    return;
  }

  const oldPriceVal = parseFloat(getVal('pOldPrice'));
  const normalizedOldPrice = !isNaN(oldPriceVal) && oldPriceVal > price ? oldPriceVal : null;
  const barcode = productDigits(getVal('pBarcode'), 14);
  const ncm = productDigits(getVal('pNcm'), 8);
  const cest = productDigits(getVal('pCest'), 7);
  const cfop = productDigits(getVal('pCfop'), 4);
  const tribFactorRaw = parseFloat(getVal('pTribFactor'));
  const tributaryFactor = Number.isFinite(tribFactorRaw) && tribFactorRaw > 0
    ? Number(tribFactorRaw.toFixed(4))
    : null;

  if (barcode && ![8, 12, 13, 14].includes(barcode.length)) {
    showToast('GTIN/EAN deve ter 8, 12, 13 ou 14 digitos. Para pizza sem codigo, deixe vazio.', 'error');
    return;
  }
  if (ncm && ncm.length !== 8) { showToast('NCM deve ter 8 digitos ou ficar vazio para usar o padrao fiscal.', 'error'); return; }
  if (cest && cest.length !== 7) { showToast('CEST deve ter 7 digitos ou ficar vazio.', 'error'); return; }
  if (cfop && cfop.length !== 4) { showToast('CFOP deve ter 4 digitos ou ficar vazio para usar o padrao fiscal.', 'error'); return; }

  const product = {
    id: STATE.editingId || genId('p'),
    name: name,
    category: cat,
    emoji: getVal('pEmoji') || '🍕',
    price: price,
    oldPrice: normalizedOldPrice,
    description: getVal('pDescription').trim(),
    ingredients: getVal('pIngredients').trim(),
    size: getVal('pSize').trim(),
    observations: getVal('pObservations').trim(),
    badge: getVal('pBadge'),
    featured: document.getElementById('pFeatured').checked,
    active: document.getElementById('pActive').checked,
    fiscalCode: productFiscalCode(getVal('pFiscalCode')),
    barcode,
    fiscalName: getVal('pFiscalName').trim(),
    ncm,
    cest,
    cfop,
    csosn: getVal('pCsosn').trim(),
    origin: getVal('pOrigin').trim() || '0',
    unit: (getVal('pUnit').trim() || 'UN').toUpperCase(),
    tributaryUnit: (getVal('pTribUnit').trim() || getVal('pUnit').trim() || 'UN').toUpperCase(),
    tributaryFactor,
    aliquotaIcms: parseFloat(getVal('pAliquotaIcms')) || 0,
    pisCst: productTaxCst(getVal('pPisCst'), ''),
    pisAliquota: parseFloat(getVal('pPisAliquota')) || 0,
    cofinsCst: productTaxCst(getVal('pCofinsCst'), ''),
    cofinsAliquota: parseFloat(getVal('pCofinsAliquota')) || 0,
    benefitCode: getVal('pBenefitCode').trim(),
    fiscalReviewRequired: Boolean(document.getElementById('pFiscalReviewRequired')?.checked),
    fiscalEmissionBlocked: Boolean(
      STATE.products.find(p => p.id === STATE.editingId)?.fiscalEmissionBlocked,
    ),
    fiscalProfileSource: getVal('pFiscalProfileSource').trim(),
    fiscalProfileNote: getVal('pFiscalProfileNote').trim(),
    trackStock: document.getElementById('pTrackStock').checked,
    minimumStock: Math.max(0, parseFloat(getVal('pMinimumStock')) || 0),
    stockUnit: (getVal('pStockUnit').trim() || getVal('pUnit').trim() || 'UN').toUpperCase(),
    image: getVal('pImage'),
  };

  const editing = Boolean(STATE.editingId);
  let nextProducts;
  if (editing) {
    const idx = STATE.products.findIndex(p => p.id === STATE.editingId);
    if (idx >= 0) {
      nextProducts = [...STATE.products];
      nextProducts[idx] = product;
    } else {
      nextProducts = [...STATE.products, product];
    }
  } else {
    nextProducts = [...STATE.products, product];
  }
  const previousProducts = STATE.products;
  STATE.products = nextProducts;

  const localSaved = saveProductsLocalCache(STATE.products);
  const remoteResult = await upsertProductRemote(product, { attempts: 3 });
  if (!remoteResult.remoteOk && Number(remoteResult.status || 0) >= 400 && Number(remoteResult.status || 0) < 500) {
    STATE.products = previousProducts;
    saveProductsLocalCache(STATE.products);
  }
  const successMessage = editing
    ? '✅ Produto atualizado com sucesso!'
    : '✅ Produto criado com sucesso!';
  const feedback = resolveProductRemoteFeedback(remoteResult, { successMessage, localSaved });
  showToast(feedback.message, feedback.type);
  closeModal();
  renderProductsTable();
  refreshAllBadges();
}

async function toggleProductStatus(id) {
  const p = STATE.products.find(p => p.id === id);
  if (!p) return;
  if (p.active !== false && STATE.combos.some((combo) => (
    combo?.active !== false
    && Array.isArray(combo.items)
    && combo.items.some((item) => String(item?.productId || item?.id || '') === String(id))
  ))) {
    showToast('Desative ou edite os combos ativos que usam este produto primeiro.', 'error');
    return;
  }
  const previousActive = p.active;
  p.active = !p.active;
  const localSaved = saveProductsLocalCache(STATE.products);
  const remoteResult = await upsertProductRemote(p, { attempts: 2 });
  if (!remoteResult.remoteOk && Number(remoteResult.status || 0) >= 400 && Number(remoteResult.status || 0) < 500) {
    p.active = previousActive;
    saveProductsLocalCache(STATE.products);
  }
  renderProductsTable();
  const feedback = resolveProductRemoteFeedback(remoteResult, {
    successMessage: `Produto ${p.active ? 'ativado' : 'desativado'}.`,
    localSaved,
  });
  showToast(feedback.message, feedback.type);
}

function deleteProduct(id) {
  const p = STATE.products.find(p => p.id === id);
  if (!p) return;
  confirmDialog(`Excluir "${p.name}"`, 'Esta ação não pode ser desfeita. Deseja continuar?', async () => {
    const remoteResult = await deleteProductRemote(id, { attempts: 2 });
    const deletionConfirmed = remoteResult.remoteOk || Number(remoteResult.status || 0) === 404;
    let localSaved = false;
    if (deletionConfirmed) {
      STATE.products = STATE.products.filter(product => product.id !== id);
      localSaved = saveProductsLocalCache(STATE.products);
    }
    renderProductsTable();
    refreshAllBadges();
    const feedback = resolveProductRemoteFeedback(remoteResult, {
      successMessage: '🗑️ Produto excluído.',
      localSaved,
      allowNotFound: true,
    });
    showToast(feedback.message, feedback.type);
  });
}

function resetProductForm() {
  ['productId', 'pName', 'pPrice', 'pOldPrice', 'pEmoji', 'pDescription', 'pIngredients', 'pSize', 'pObservations', 'pImage', 'pFiscalCode', 'pBarcode', 'pFiscalName', 'pCest', 'pTribFactor', 'pBenefitCode', 'pFiscalProfileSource', 'pFiscalProfileNote'].forEach(id => setVal(id, ''));
  setVal('pBadge', '');
  setVal('pNcm', STATE.fiscal?.defaultNcm || '');
  setVal('pCfop', STATE.fiscal?.defaultCfop || '');
  setVal('pCsosn', STATE.fiscal?.defaultCsosn || '');
  setVal('pOrigin', STATE.fiscal?.defaultOrigin || '0');
  setVal('pUnit', STATE.fiscal?.defaultUnit || 'UN');
  setVal('pTribUnit', STATE.fiscal?.defaultUnit || 'UN');
  setVal('pAliquotaIcms', STATE.fiscal?.defaultAliquotaIcms ?? 0);
  setVal('pPisCst', '');
  setVal('pPisAliquota', 0);
  setVal('pCofinsCst', '');
  setVal('pCofinsAliquota', 0);
  setVal('pMinimumStock', 0);
  setVal('pStockUnit', 'UN');
  document.getElementById('pTrackStock').checked = false;
  document.getElementById('pFeatured').checked = false;
  document.getElementById('pActive').checked = true;
  document.getElementById('pFiscalReviewRequired').checked = false;
  updateNcmHint();
  updateProductImagePreview('', '🍕');
  // Reset file input
  const fi = document.getElementById('pImageFile');
  if (fi) fi.value = '';
}

function setEmoji(emoji) { setVal('pEmoji', emoji); }

function optimizeImageDataUrl(dataUrl, options = {}) {
  const maxWidth = options.maxWidth || 1200;
  const maxHeight = options.maxHeight || 1200;
  const outputType = options.outputType || options.mimeType || 'image/jpeg';
  const canUseQuality = outputType === 'image/jpeg' || outputType === 'image/webp';
  const quality = options.quality ?? 0.86;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const naturalW = Math.max(1, img.naturalWidth || 1);
      const naturalH = Math.max(1, img.naturalHeight || 1);
      const ratio = Math.min(maxWidth / naturalW, maxHeight / naturalH, 1);
      const targetW = Math.max(1, Math.round(naturalW * ratio));
      const targetH = Math.max(1, Math.round(naturalH * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);
      if (canUseQuality) {
        resolve(canvas.toDataURL(outputType, quality));
      } else {
        resolve(canvas.toDataURL(outputType));
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function handleProductImage(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async function (e) {
    const base64 = await optimizeImageDataUrl(e.target.result, {
      maxWidth: 1000,
      maxHeight: 1000,
      quality: 0.8,
    });
    setVal('pImage', base64);
    updateProductImagePreview(base64, '');
  };
  reader.readAsDataURL(file);
}

function updateProductImagePreview(src, emoji) {
  const wrap = document.getElementById('pImagePreview');
  const safeSrc = sanitizeImageUrl(src);
  if (safeSrc) {
    wrap.innerHTML = `<img src="${escapeHtml(safeSrc)}" alt="preview" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    wrap.innerHTML = `<span class="img-placeholder" id="pImageEmoji">${escapeHtml(emoji || '🍕')}</span>`;
  }
}

function clearProductImage() {
  setVal('pImage', '');
  const emoji = getVal('pEmoji') || '🍕';
  updateProductImagePreview('', emoji);
  const fi = document.getElementById('pImageFile');
  if (fi) fi.value = '';
}

/* ==========================================================
   CATEGORIAS
   ========================================================== */
function getBorderCatalogForAdmin() {
  const saved = Array.isArray(STATE.borders) && STATE.borders.length > 0 ? STATE.borders : [];
  if (saved.length > 0) return saved;
  return (typeof window !== 'undefined' && window.PizzaBorderUtils?.getPizzaBorderCatalog)
    ? window.PizzaBorderUtils.getPizzaBorderCatalog()
    : [];
}

function normalizeBorderCatalogForAdmin(list = []) {
  return (Array.isArray(list) ? list : []).map((entry, index) => ({
    id: String(entry?.id || `border-${index + 1}`).trim().toLowerCase(),
    label: String(entry?.label || '').trim() || `Borda ${index + 1}`,
    prices: {
      P: Number(entry?.prices?.P ?? entry?.prices?.p ?? entry?.price ?? 0),
      M: Number(entry?.prices?.M ?? entry?.prices?.m ?? entry?.price ?? 0),
      G: Number(entry?.prices?.G ?? entry?.prices?.g ?? entry?.price ?? 0),
    },
    group: String(entry?.group || entry?.category || '').trim() || 'Especiais',
    active: entry?.active !== false,
  }));
}

function renderBorderCatalog() {
  const container = document.getElementById('bordersConfigList');
  if (!container) return;

  const catalog = normalizeBorderCatalogForAdmin(getBorderCatalogForAdmin());
  container.innerHTML = catalog.map((option, index) => `
    <div class="settings-card border-option-card">
      <div class="form-row">
        <div class="form-group">
          <label>Nome da borda</label>
          <input type="text" value="${escapeHtml(option.label)}" onchange="updateBorderField(${index}, 'label', this.value)" />
        </div>
        <div class="form-group">
          <label>ID</label>
          <input type="text" value="${escapeHtml(option.id)}" onchange="updateBorderField(${index}, 'id', this.value)" />
        </div>
        <div class="form-group">
          <label>Grupo</label>
          <select onchange="updateBorderField(${index}, 'group', this.value)">
            <option value="Tradicional"${option.group === 'Tradicional' ? ' selected' : ''}>Tradicional</option>
            <option value="Especiais"${option.group === 'Especiais' ? ' selected' : ''}>Especiais</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Preço P</label>
          <input type="number" min="0" step="0.01" value="${Number(option.prices?.P || 0).toFixed(2)}" onchange="updateBorderField(${index}, 'prices.P', this.value)" />
        </div>
        <div class="form-group">
          <label>Preço M</label>
          <input type="number" min="0" step="0.01" value="${Number(option.prices?.M || 0).toFixed(2)}" onchange="updateBorderField(${index}, 'prices.M', this.value)" />
        </div>
        <div class="form-group">
          <label>Preço G</label>
          <input type="number" min="0" step="0.01" value="${Number(option.prices?.G || 0).toFixed(2)}" onchange="updateBorderField(${index}, 'prices.G', this.value)" />
        </div>
      </div>
      <div class="form-row">
        <label class="checkbox-inline">
          <input type="checkbox" ${option.active ? 'checked' : ''} onchange="updateBorderField(${index}, 'active', this.checked)" />
          <span>Ativa</span>
        </label>
        <button class="btn-outline" type="button" onclick="removeBorderOption(${index})">Remover</button>
      </div>
    </div>
  `).join('');
}

function updateBorderField(index, field, value) {
  const catalog = normalizeBorderCatalogForAdmin(getBorderCatalogForAdmin());
  const entry = catalog[index];
  if (!entry) return;
  if (field === 'prices.P') entry.prices.P = Number(value || 0);
  else if (field === 'prices.M') entry.prices.M = Number(value || 0);
  else if (field === 'prices.G') entry.prices.G = Number(value || 0);
  else if (field === 'active') entry.active = Boolean(value);
  else if (field === 'label') entry.label = String(value || '').trim();
  else if (field === 'id') entry.id = String(value || '').trim().toLowerCase();
  else if (field === 'group') entry.group = String(value || '').trim() || 'Especiais';
  catalog[index] = entry;
  STATE.borders = catalog;
  renderBorderCatalog();
}

function addBorderOptionRow() {
  const catalog = normalizeBorderCatalogForAdmin(getBorderCatalogForAdmin());
  catalog.push({ id: `nova-borda-${catalog.length + 1}`, label: `Nova Borda ${catalog.length + 1}`, group: 'Especiais', prices: { P: 0, M: 0, G: 0 }, active: true });
  STATE.borders = catalog;
  renderBorderCatalog();
}

function removeBorderOption(index) {
  const catalog = normalizeBorderCatalogForAdmin(getBorderCatalogForAdmin());
  catalog.splice(index, 1);
  STATE.borders = catalog;
  renderBorderCatalog();
}

async function saveBorderCatalog() {
  const catalog = normalizeBorderCatalogForAdmin(getBorderCatalogForAdmin());
  STATE.borders = catalog;
  const saved = await saveToLS(LS.borders, STATE.borders);
  if (saved?.remoteOk) {
    showToast('✅ Bordas salvas com sucesso!', 'success');
  } else if (saved?.queued) {
    showToast('⏳ Bordas salvas localmente e aguardando conexão com o servidor.', 'error');
  } else {
    showToast('⚠️ Não foi possível salvar as bordas.', 'error');
  }
}

function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  const empty = document.getElementById('categoriesEmpty');
  const sorted = [...STATE.categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  if (sorted.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = sorted.map(cat => {
    const count = STATE.products.filter(p => p.category === cat.id && p.active).length;
    const categoryIdLiteral = toInlineJsStringLiteral(cat.id);
    const safeColor = sanitizeHexColor(cat.color, 'var(--accent)');
    const safeIcon = escapeHtml(cat.icon || '📂');
    const safeName = escapeHtml(cat.name || 'Categoria');
    const safeOrder = Number.isFinite(Number(cat.order)) ? Math.trunc(Number(cat.order)) : 0;

    return `
      <div class="category-card" style="border-left-color:${safeColor}">
        <div class="cat-card-header">
          <div class="cat-card-icon-name">
            <span class="cat-card-icon">${safeIcon}</span>
            <div>
              <div class="cat-card-name">${safeName}</div>
              <span class="badge ${cat.active ? 'active' : 'inactive'}" style="margin-top:2px;">${cat.active ? 'Ativa' : 'Inativa'}</span>
            </div>
          </div>
        </div>
        <div class="cat-card-meta">
          <span class="cat-count">${count} produto${count !== 1 ? 's' : ''} ativo${count !== 1 ? 's' : ''}</span>
          <span style="font-size:0.75rem;color:var(--text-3);">Ordem: ${safeOrder}</span>
        </div>
        <div class="cat-card-actions">
          <button class="btn-outline sm" onclick="editCategory(${categoryIdLiteral})">✏️ Editar</button>
          <button class="btn-outline sm" onclick="toggleCategoryStatus(${categoryIdLiteral})">${cat.active ? '🚫 Desativar' : '✅ Ativar'}</button>
          <button class="btn-danger-outline sm" onclick="deleteCategory(${categoryIdLiteral})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function getNextCategoryOrder() {
  return STATE.categories.reduce((maxOrder, cat) => {
    const rawOrder = Number(cat?.order);
    const validOrder = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.trunc(rawOrder) : 0;
    return validOrder > maxOrder ? validOrder : maxOrder;
  }, 0) + 1;
}

function openCategoryModal() {
  STATE.editingId = null;
  resetCategoryForm();
  document.getElementById('categoryModalTitle').textContent = 'Nova Categoria';
  openModal('categoryModal');
}

function editCategory(id) {
  const cat = STATE.categories.find(c => c.id === id);
  if (!cat) return;
  STATE.editingId = id;
  document.getElementById('categoryModalTitle').textContent = 'Editar Categoria';

  setVal('categoryId', cat.id);
  setVal('cName', cat.name);
  setVal('cDescription', cat.description || '');
  setVal('cIcon', cat.icon || '');
  setVal('cColor', cat.color || '#C0392B');
  setVal('cColorText', cat.color || '#C0392B');
  setVal('cOrder', cat.order || 1);
  document.getElementById('cActive').checked = cat.active;

  openModal('categoryModal');
}

async function saveCategory() {
  const name = getVal('cName').trim();
  if (!name) { showToast('Informe o nome da categoria.', 'error'); return; }

  const parsedOrder = parseInt(getVal('cOrder'), 10);
  const existingOrder = STATE.editingId
    ? (STATE.categories.find(c => c.id === STATE.editingId)?.order ?? null)
    : null;
  const fallbackOrder = STATE.editingId
    ? (Number.isFinite(Number(existingOrder)) && Number(existingOrder) > 0
      ? Math.trunc(Number(existingOrder))
      : getNextCategoryOrder())
    : getNextCategoryOrder();
  const categoryOrder = Number.isFinite(parsedOrder) && parsedOrder > 0
    ? parsedOrder
    : fallbackOrder;

  const category = {
    id: STATE.editingId || genId('cat'),
    name: name,
    description: getVal('cDescription').trim(),
    icon: getVal('cIcon') || '📂',
    color: getVal('cColor') || '#C0392B',
    order: categoryOrder,
    active: document.getElementById('cActive').checked,
  };

  const editing = Boolean(STATE.editingId);
  if (editing) {
    const idx = STATE.categories.findIndex(c => c.id === STATE.editingId);
    if (idx >= 0) STATE.categories[idx] = category;
    else STATE.categories.push(category);
  } else {
    STATE.categories.push(category);
  }

  const saveResult = await saveToLS(LS.categories, STATE.categories);
  const successMessage = editing
    ? '✅ Categoria atualizada com sucesso!'
    : '✅ Categoria criada com sucesso!';
  const feedback = resolveSaveFeedback(saveResult, successMessage);
  showToast(feedback.message, feedback.type);
  populateCategorySelects();
  closeModal();
  renderCategories();
}

async function toggleCategoryStatus(id) {
  const cat = STATE.categories.find(c => c.id === id);
  if (!cat) return;
  cat.active = !cat.active;
  const saveResult = await saveToLS(LS.categories, STATE.categories);
  renderCategories();
  const feedback = resolveSaveFeedback(saveResult, `Categoria ${cat.active ? 'ativada' : 'desativada'}.`);
  showToast(feedback.message, feedback.type);
}

function deleteCategory(id) {
  const cat = STATE.categories.find(c => c.id === id);
  if (!cat) return;
  const usedBy = STATE.products.filter(p => p.category === id).length;
  if (usedBy > 0) {
    showToast(`Mova ou exclua os ${usedBy} produto(s) desta categoria antes de removê-la.`, 'error', 3600);
    return;
  }
  const msg = 'Esta ação não pode ser desfeita.';
  confirmDialog(`Excluir "${cat.name}"`, msg, async () => {
    STATE.categories = STATE.categories.filter(c => c.id !== id);
    const saveResult = await saveToLS(LS.categories, STATE.categories);
    populateCategorySelects();
    renderCategories();
    const feedback = resolveSaveFeedback(saveResult, '🗑️ Categoria excluída.');
    showToast(feedback.message, feedback.type);
  });
}

function resetCategoryForm() {
  setVal('categoryId', '');
  setVal('cName', '');
  setVal('cDescription', '');
  setVal('cIcon', '');
  setVal('cColor', '#C0392B');
  setVal('cColorText', '#C0392B');
  setVal('cOrder', String(getNextCategoryOrder()));
  document.getElementById('cActive').checked = true;
}

function setCatEmoji(emoji) { setVal('cIcon', emoji); }

/** Popula todos os <select> de categorias */
function populateCategorySelects() {
  const selects = ['pCategory', 'productCatFilter'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    const isFilter = id === 'productCatFilter';
    el.innerHTML = (isFilter ? '<option value="">Todas as categorias</option>' : '') +
      STATE.categories.map(c => `<option value="${escapeHtml(c.id || '')}">${escapeHtml(c.icon || '📂')} ${escapeHtml(c.name || '')}</option>`).join('');
    el.value = currentVal;
  });
}

function populateCategorySelectInModal() {
  const el = document.getElementById('pCategory');
  if (!el) return;
  el.innerHTML = '<option value="">Selecione a categoria</option>' +
    STATE.categories.map(c => `<option value="${escapeHtml(c.id || '')}">${escapeHtml(c.icon || '📂')} ${escapeHtml(c.name || '')}</option>`).join('');
}

/* ==========================================================
   COMBOS
   ========================================================== */
function renderCombos() {
  const grid = document.getElementById('combosAdminGrid');
  const empty = document.getElementById('combosEmpty');

  if (STATE.combos.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = STATE.combos.map(cb => {
    const itemNames = (Array.isArray(cb.items) ? cb.items : []).map(it => {
      const p = STATE.products.find(prod => prod.id === it.productId);
      const qty = Number.isFinite(Number(it?.qty)) ? Math.max(1, Math.trunc(Number(it.qty))) : 1;
      return p ? `${qty}x ${p.name}` : '—';
    }).join(', ');

    const comboIdLiteral = toInlineJsStringLiteral(cb.id);
    const safeEmoji = escapeHtml(cb.emoji || '⭐');
    const safeName = escapeHtml(cb.name || 'Combo');
    const safeDescription = escapeHtml(cb.description || '—');
    const safeItems = escapeHtml(itemNames || '—');
    const safeBadge = escapeHtml(cb.badge || '');
    const hasPromo = Number(cb.oldPrice) > Number(cb.price);
    const oldPriceHtml = hasPromo
      ? `<span class="cac-old">${formatCurrency(cb.oldPrice)}</span>`
      : '';

    return `
      <div class="combo-admin-card">
        <div class="cac-header">
          <div class="cac-emoji-name">
            <span class="cac-emoji">${safeEmoji}</span>
            <div>
              <div class="cac-name">${safeName}</div>
              <span class="badge ${cb.active ? 'active' : 'inactive'}">${cb.active ? 'Ativo' : 'Inativo'}</span>
            </div>
          </div>
        </div>
        <div class="cac-body">
          <div class="cac-desc">${safeDescription}</div>
          <div class="cac-products">📦 ${safeItems}</div>
          <div class="cac-prices">
            ${oldPriceHtml}
            <span class="cac-new">${formatCurrency(cb.price)}</span>
            ${safeBadge ? `<span class="badge active">${safeBadge}</span>` : ''}
          </div>
          <div class="cac-actions">
          <button class="btn-outline sm" onclick="editCombo(${comboIdLiteral})">✏️ Editar</button>
            <button class="btn-outline sm" onclick="toggleComboStatus(${comboIdLiteral})">${cb.active ? '🚫 Desativar' : '✅ Ativar'}</button>
          <button class="btn-danger-outline sm" onclick="deleteCombo(${comboIdLiteral})">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openComboModal() {
  STATE.editingId = null;
  STATE.selectedComboProducts = [];
  resetComboForm();
  document.getElementById('comboModalTitle').textContent = 'Novo Combo';
  renderComboProductList();
  renderSelectedComboItems();
  openModal('comboModal');
}

function editCombo(id) {
  const combo = STATE.combos.find(c => c.id === id);
  if (!combo) return;
  STATE.editingId = id;
  STATE.selectedComboProducts = combo.items ? JSON.parse(JSON.stringify(combo.items)) : [];

  document.getElementById('comboModalTitle').textContent = 'Editar Combo';

  setVal('comboId', combo.id);
  setVal('cbName', combo.name);
  setVal('cbEmoji', combo.emoji || '');
  setVal('cbPrice', combo.price);
  setVal('cbOldPrice', combo.oldPrice || '');
  setVal('cbBadge', combo.badge || '');
  setVal('cbDescription', combo.description || '');
  document.getElementById('cbActive').checked = combo.active;

  renderComboProductList();
  renderSelectedComboItems();
  openModal('comboModal');
}

function comboItemsAreSellable(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  const activeProductIds = new Set(
    STATE.products.filter((product) => product?.active !== false).map((product) => String(product?.id || '')),
  );
  return items.every((item) => {
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

async function saveCombo() {
  const name = getVal('cbName').trim();
  const price = parseFloat(getVal('cbPrice'));
  if (!name) { showToast('Informe o nome do combo.', 'error'); return; }
  if (isNaN(price)) { showToast('Informe um preço válido.', 'error'); return; }
  const active = document.getElementById('cbActive').checked;
  if (active && !comboItemsAreSellable(STATE.selectedComboProducts)) {
    showToast('Use somente produtos ativos e quantidades válidas antes de ativar o combo.', 'error');
    return;
  }

  const oldPriceVal = parseFloat(getVal('cbOldPrice'));
  const normalizedOldPrice = !isNaN(oldPriceVal) && oldPriceVal > price ? oldPriceVal : null;

  const combo = {
    id: STATE.editingId || genId('cb'),
    name: name,
    emoji: getVal('cbEmoji') || '⭐',
    price: price,
    oldPrice: normalizedOldPrice,
    badge: getVal('cbBadge').trim(),
    description: getVal('cbDescription').trim(),
    items: JSON.parse(JSON.stringify(STATE.selectedComboProducts)),
    active,
  };

  const editing = Boolean(STATE.editingId);
  if (editing) {
    const idx = STATE.combos.findIndex(c => c.id === STATE.editingId);
    if (idx >= 0) STATE.combos[idx] = combo;
    else STATE.combos.push(combo);
  } else {
    STATE.combos.push(combo);
  }

  const saveResult = await saveToLS(LS.combos, STATE.combos);
  const successMessage = editing
    ? '✅ Combo atualizado com sucesso!'
    : '✅ Combo criado com sucesso!';
  const feedback = resolveSaveFeedback(saveResult, successMessage);
  showToast(feedback.message, feedback.type);
  closeModal();
  renderCombos();
  refreshAllBadges();
}

async function toggleComboStatus(id) {
  const cb = STATE.combos.find(c => c.id === id);
  if (!cb) return;
  if (cb.active === false && !comboItemsAreSellable(cb.items)) {
    showToast('Use somente produtos ativos e quantidades válidas antes de ativar o combo.', 'error');
    return;
  }
  cb.active = !cb.active;
  const saveResult = await saveToLS(LS.combos, STATE.combos);
  renderCombos();
  const feedback = resolveSaveFeedback(saveResult, `Combo ${cb.active ? 'ativado' : 'desativado'}.`);
  showToast(feedback.message, feedback.type);
}

function deleteCombo(id) {
  const cb = STATE.combos.find(c => c.id === id);
  if (!cb) return;
  confirmDialog(`Excluir "${cb.name}"`, 'Esta ação não pode ser desfeita.', async () => {
    STATE.combos = STATE.combos.filter(c => c.id !== id);
    const saveResult = await saveToLS(LS.combos, STATE.combos);
    renderCombos();
    const feedback = resolveSaveFeedback(saveResult, '🗑️ Combo excluído.');
    showToast(feedback.message, feedback.type);
  });
}

function resetComboForm() {
  ['comboId', 'cbName', 'cbEmoji', 'cbPrice', 'cbOldPrice', 'cbBadge', 'cbDescription'].forEach(id => setVal(id, ''));
  document.getElementById('cbActive').checked = true;
  setVal('cbProductSearch', '');
}

/** Renderiza lista de produtos para seleção no modal de combo */
function renderComboProductList(search = '') {
  const list = document.getElementById('comboProductList');
  if (!list) return;
  let products = STATE.products.filter(p => p.active);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  list.innerHTML = products.map(p => {
    const selected = STATE.selectedComboProducts.some(s => s.productId === p.id);
    const productIdLiteral = toInlineJsStringLiteral(p.id);
    const safeEmoji = escapeHtml(p.emoji || '🍕');
    const safeName = escapeHtml(p.name || 'Produto');

    return `
      <div class="cps-item ${selected ? 'selected' : ''}" onclick="toggleComboProduct(${productIdLiteral})">
        <input type="checkbox" ${selected ? 'checked' : ''} readonly />
        <span class="cps-item-emoji">${safeEmoji}</span>
        <div class="cps-item-info">
          <div class="cps-item-name">${safeName}</div>
          <div class="cps-item-price">${formatCurrency(p.price)}</div>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty-state-sm">Nenhum produto ativo</div>';
}

function filterComboProducts(val) { renderComboProductList(val); }

function toggleComboProduct(productId) {
  const idx = STATE.selectedComboProducts.findIndex(s => s.productId === productId);
  if (idx >= 0) {
    STATE.selectedComboProducts.splice(idx, 1);
  } else {
    STATE.selectedComboProducts.push({ productId, qty: 1 });
  }
  renderComboProductList(getVal('cbProductSearch'));
  renderSelectedComboItems();
}

function renderSelectedComboItems() {
  const el = document.getElementById('selectedComboItems');
  if (!el) return;
  if (STATE.selectedComboProducts.length === 0) {
    el.innerHTML = '<span class="empty-hint">Nenhum produto selecionado</span>';
    return;
  }

  el.innerHTML = STATE.selectedComboProducts.map(s => {
    const p = STATE.products.find(prod => prod.id === s.productId);
    if (!p) return '';

    const productIdLiteral = toInlineJsStringLiteral(s.productId);
    const qtyValueRaw = Number(s.qty);
    const qtyValue = Number.isFinite(qtyValueRaw) ? Math.min(20, Math.max(1, Math.trunc(qtyValueRaw))) : 1;

    return `
      <div class="sci-item">
        <span>${escapeHtml(p.emoji || '🍕')}</span>
        <input type="number" min="1" max="20" value="${qtyValue}" title="Quantidade"
          style="width:42px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;font-size:0.75rem;"
          onchange="updateComboProductQty(${productIdLiteral}, this.value)" />
        <span>${escapeHtml(p.name || 'Produto')}</span>
        <button onclick="toggleComboProduct(${productIdLiteral})">✕</button>
      </div>
    `;
  }).join('');
}

function updateComboProductQty(productId, qty) {
  const item = STATE.selectedComboProducts.find(s => s.productId === productId);
  if (item) item.qty = parseInt(qty) || 1;
}

/* ==========================================================
   PROMOÇÕES
   ========================================================== */
function renderPromotions() {
  const grid = document.getElementById('promosAdminGrid');
  const empty = document.getElementById('promosEmpty');

  if (STATE.promotions.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = STATE.promotions.map(pr => {
    const promoIdLiteral = toInlineJsStringLiteral(pr.id);
    const safeName = escapeHtml(pr.name || 'Promoção');
    const safeDescription = escapeHtml(pr.description || '—');
    const safeValidity = escapeHtml(formatDateRange(pr.startDate, pr.endDate));
    const safeImage = sanitizeImageUrl(pr.image);

    return `
      <div class="promo-admin-card">
        <div class="pac-header">
          <div>
            <div class="pac-title">${safeName}</div>
            ${pr.banner ? '<span class="pac-tag">📢 Banner</span>' : ''}
          </div>
          <span class="badge ${pr.active ? 'active' : 'inactive'}">${pr.active ? 'Ativa' : 'Inativa'}</span>
        </div>
        <div class="pac-body">
          ${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="${safeName}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:10px;" />` : ''}
          <div class="pac-desc">${safeDescription}</div>
          <div class="pac-validity">📅 ${safeValidity}</div>
          <div class="pac-prices">
            ${pr.oldPrice ? `<span style="text-decoration:line-through;color:var(--text-3);font-size:.82rem;">${formatCurrency(pr.oldPrice)}</span>` : ''}
            ${pr.price ? `<span style="font-size:1.2rem;font-weight:800;color:var(--accent);">${formatCurrency(pr.price)}</span>` : ''}
          </div>
          <div class="pac-actions">
            <button class="btn-outline sm" onclick="editPromotion(${promoIdLiteral})">✏️ Editar</button>
            <button class="btn-outline sm" onclick="togglePromoStatus(${promoIdLiteral})">${pr.active ? '🚫 Desativar' : '✅ Ativar'}</button>
            <button class="btn-danger-outline sm" onclick="deletePromotion(${promoIdLiteral})">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openPromotionModal() {
  STATE.editingId = null;
  STATE.selectedPromoProducts = [];
  resetPromotionForm();
  document.getElementById('promotionModalTitle').textContent = 'Nova Promoção';
  renderPromoProductList();
  renderSelectedPromoItems();
  openModal('promotionModal');
}

function editPromotion(id) {
  const promo = STATE.promotions.find(p => p.id === id);
  if (!promo) return;
  STATE.editingId = id;
  STATE.selectedPromoProducts = promo.products ? [...promo.products] : [];

  document.getElementById('promotionModalTitle').textContent = 'Editar Promoção';

  setVal('promoId', promo.id);
  setVal('prName', promo.name);
  setVal('prDescription', promo.description || '');
  setVal('prPrice', promo.price || '');
  setVal('prOldPrice', promo.oldPrice || '');
  setVal('prStartDate', promo.startDate || '');
  setVal('prEndDate', promo.endDate || '');
  setVal('prImage', promo.image || '');
  document.getElementById('prActive').checked = promo.active;
  document.getElementById('prBanner').checked = promo.banner;

  const prev = document.getElementById('prImagePreview');
  const safePromoImage = sanitizeImageUrl(promo.image);
  prev.innerHTML = safePromoImage
    ? `<img src="${escapeHtml(safePromoImage)}" style="width:100%;height:100%;object-fit:cover;" />`
    : '<span class="img-placeholder">🏷️</span>';

  renderPromoProductList();
  renderSelectedPromoItems();
  openModal('promotionModal');
}

async function savePromotion() {
  const name = getVal('prName').trim();
  if (!name) { showToast('Informe o nome da promoção.', 'error'); return; }

  const promo = {
    id: STATE.editingId || genId('pr'),
    name: name,
    description: getVal('prDescription').trim(),
    price: parseFloat(getVal('prPrice')) || null,
    oldPrice: parseFloat(getVal('prOldPrice')) || null,
    startDate: getVal('prStartDate'),
    endDate: getVal('prEndDate'),
    active: document.getElementById('prActive').checked,
    banner: document.getElementById('prBanner').checked,
    image: getVal('prImage'),
    products: [...STATE.selectedPromoProducts],
  };

  const editing = Boolean(STATE.editingId);
  if (editing) {
    const idx = STATE.promotions.findIndex(p => p.id === STATE.editingId);
    if (idx >= 0) STATE.promotions[idx] = promo;
    else STATE.promotions.push(promo);
  } else {
    STATE.promotions.push(promo);
  }

  const saveResult = await saveToLS(LS.promotions, STATE.promotions);
  const successMessage = editing
    ? '✅ Promoção atualizada com sucesso!'
    : '✅ Promoção criada com sucesso!';
  const feedback = resolveSaveFeedback(saveResult, successMessage);
  showToast(feedback.message, feedback.type);
  closeModal();
  renderPromotions();
  refreshAllBadges();
}

async function togglePromoStatus(id) {
  const pr = STATE.promotions.find(p => p.id === id);
  if (!pr) return;
  pr.active = !pr.active;
  const saveResult = await saveToLS(LS.promotions, STATE.promotions);
  renderPromotions();
  const feedback = resolveSaveFeedback(saveResult, `Promoção ${pr.active ? 'ativada' : 'desativada'}.`);
  showToast(feedback.message, feedback.type);
}

function deletePromotion(id) {
  const pr = STATE.promotions.find(p => p.id === id);
  if (!pr) return;
  confirmDialog(`Excluir "${pr.name}"`, 'Esta ação não pode ser desfeita.', async () => {
    STATE.promotions = STATE.promotions.filter(p => p.id !== id);
    const saveResult = await saveToLS(LS.promotions, STATE.promotions);
    renderPromotions();
    const feedback = resolveSaveFeedback(saveResult, '🗑️ Promoção excluída.');
    showToast(feedback.message, feedback.type);
  });
}

function resetPromotionForm() {
  ['promoId', 'prName', 'prDescription', 'prPrice', 'prOldPrice', 'prStartDate', 'prEndDate', 'prImage'].forEach(id => setVal(id, ''));
  document.getElementById('prActive').checked = true;
  document.getElementById('prBanner').checked = false;
  const prev = document.getElementById('prImagePreview');
  if (prev) prev.innerHTML = '<span class="img-placeholder">🏷️</span>';
  const fi = document.getElementById('prImageFile');
  if (fi) fi.value = '';
}

function renderPromoProductList() {
  const list = document.getElementById('promoProductList');
  if (!list) return;

  list.innerHTML = STATE.products.filter(p => p.active).map(p => {
    const selected = STATE.selectedPromoProducts.includes(p.id);
    const productIdLiteral = toInlineJsStringLiteral(p.id);

    return `
      <div class="cps-item ${selected ? 'selected' : ''}" onclick="togglePromoProduct(${productIdLiteral})">
        <input type="checkbox" ${selected ? 'checked' : ''} readonly />
        <span class="cps-item-emoji">${escapeHtml(p.emoji || '🍕')}</span>
        <div class="cps-item-info">
          <div class="cps-item-name">${escapeHtml(p.name || 'Produto')}</div>
          <div class="cps-item-price">${formatCurrency(p.price)}</div>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty-state-sm">Nenhum produto ativo</div>';
}

function togglePromoProduct(productId) {
  const idx = STATE.selectedPromoProducts.indexOf(productId);
  if (idx >= 0) STATE.selectedPromoProducts.splice(idx, 1);
  else STATE.selectedPromoProducts.push(productId);
  renderPromoProductList();
  renderSelectedPromoItems();
}

function renderSelectedPromoItems() {
  const el = document.getElementById('selectedPromoItems');
  if (!el) return;
  if (STATE.selectedPromoProducts.length === 0) {
    el.innerHTML = '<span class="empty-hint">Nenhum produto selecionado</span>';
    return;
  }

  el.innerHTML = STATE.selectedPromoProducts.map(id => {
    const p = STATE.products.find(prod => prod.id === id);
    if (!p) return '';
    const productIdLiteral = toInlineJsStringLiteral(id);
    return `<div class="sci-item"><span>${escapeHtml(p.emoji || '🍕')}</span><span>${escapeHtml(p.name || 'Produto')}</span><button onclick="togglePromoProduct(${productIdLiteral})">✕</button></div>`;
  }).join('');
}

function handlePromoImage(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = await optimizeImageDataUrl(e.target.result, {
      maxWidth: 1400,
      maxHeight: 900,
      quality: 0.86,
    });
    setVal('prImage', base64);
    const prev = document.getElementById('prImagePreview');
    const safePromoImage = sanitizeImageUrl(base64);
    prev.innerHTML = safePromoImage
      ? `<img src="${escapeHtml(safePromoImage)}" style="width:100%;height:100%;object-fit:cover;" />`
      : '<span class="img-placeholder">🏷️</span>';
  };
  reader.readAsDataURL(input.files[0]);
}

function clearPromoImage() {
  setVal('prImage', '');
  document.getElementById('prImagePreview').innerHTML = '<span class="img-placeholder">🏷️</span>';
  const fi = document.getElementById('prImageFile');
  if (fi) fi.value = '';
}

/* ==========================================================
   ANUNCIOS
   ========================================================== */
function renderAnnouncements() {
  const grid = document.getElementById('announcementsAdminGrid');
  const empty = document.getElementById('announcementsEmpty');
  if (!grid || !empty) return;

  if (!Array.isArray(STATE.announcements) || STATE.announcements.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = STATE.announcements.map((item) => {
    const announcementIdLiteral = toInlineJsStringLiteral(item.id);
    const safeTitle = escapeHtml(item.title || 'Anúncio');
    const safeDescription = escapeHtml(item.description || 'Sem texto adicional');
    const safeValidity = escapeHtml(formatDateRange(item.startDate, item.endDate));
    const safeImage = sanitizeImageUrl(item.image);
    const safeButtonLabel = escapeHtml(item.buttonLabel || '');

    return `
      <div class="announcement-admin-card">
        <div class="aac-media">
          ${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="${safeTitle}" />` : '<span class="aac-placeholder">📢</span>'}
        </div>
        <div class="aac-body">
          <div class="aac-head">
            <div>
              <div class="aac-title">${safeTitle}</div>
              ${safeButtonLabel ? `<span class="aac-tag">${safeButtonLabel}</span>` : ''}
            </div>
            <span class="badge ${item.active ? 'active' : 'inactive'}">${item.active ? 'Ativo' : 'Inativo'}</span>
          </div>
          <div class="aac-desc">${safeDescription}</div>
          <div class="aac-validity">📅 ${safeValidity}</div>
          <div class="aac-actions">
            <button class="btn-outline sm" onclick="editAnnouncement(${announcementIdLiteral})">✏️ Editar</button>
            <button class="btn-outline sm" onclick="toggleAnnouncementStatus(${announcementIdLiteral})">${item.active ? '🚫 Desativar' : '✅ Ativar'}</button>
            <button class="btn-danger-outline sm" onclick="deleteAnnouncement(${announcementIdLiteral})">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openAnnouncementModal() {
  STATE.editingId = null;
  resetAnnouncementForm();
  document.getElementById('announcementModalTitle').textContent = 'Novo Anúncio';
  openModal('announcementModal');
}

function editAnnouncement(id) {
  const item = STATE.announcements.find((announcement) => announcement.id === id);
  if (!item) return;

  STATE.editingId = id;
  document.getElementById('announcementModalTitle').textContent = 'Editar Anúncio';
  setVal('announcementId', item.id);
  setVal('anTitle', item.title || '');
  setVal('anDescription', item.description || '');
  setVal('anStartDate', item.startDate || '');
  setVal('anEndDate', item.endDate || '');
  setVal('anButtonLabel', item.buttonLabel || '');
  setVal('anButtonUrl', item.buttonUrl || '');
  setVal('anImage', item.image || '');
  document.getElementById('anActive').checked = item.active !== false;
  renderAnnouncementImagePreview(item.image);
  openModal('announcementModal');
}

async function saveAnnouncement() {
  const image = getVal('anImage').trim();
  if (!image) {
    showToast('Escolha uma foto para o anúncio.', 'error');
    return;
  }

  const title = getVal('anTitle').trim();
  const buttonLabel = getVal('anButtonLabel').trim();
  const buttonUrl = getVal('anButtonUrl').trim();
  if (buttonLabel && !buttonUrl) {
    showToast('Informe o link do botão ou remova o texto do botão.', 'error');
    return;
  }

  const announcement = {
    id: STATE.editingId || genId('an'),
    title,
    description: getVal('anDescription').trim(),
    image,
    startDate: getVal('anStartDate'),
    endDate: getVal('anEndDate'),
    buttonLabel,
    buttonUrl,
    active: document.getElementById('anActive').checked,
    createdAt: STATE.editingId
      ? (STATE.announcements.find((item) => item.id === STATE.editingId)?.createdAt || new Date().toISOString())
      : new Date().toISOString(),
  };

  const editing = Boolean(STATE.editingId);
  if (editing) {
    const idx = STATE.announcements.findIndex((item) => item.id === STATE.editingId);
    if (idx >= 0) STATE.announcements[idx] = announcement;
    else STATE.announcements.push(announcement);
  } else {
    STATE.announcements.push(announcement);
  }

  const saveResult = await saveToLS(LS.announcements, STATE.announcements);
  const feedback = resolveSaveFeedback(
    saveResult,
    editing ? '✅ Anúncio atualizado com sucesso!' : '✅ Anúncio criado com sucesso!',
  );
  showToast(feedback.message, feedback.type);
  closeModal();
  renderAnnouncements();
  refreshAllBadges();
}

async function toggleAnnouncementStatus(id) {
  const item = STATE.announcements.find((announcement) => announcement.id === id);
  if (!item) return;
  item.active = !item.active;
  const saveResult = await saveToLS(LS.announcements, STATE.announcements);
  renderAnnouncements();
  refreshAllBadges();
  const feedback = resolveSaveFeedback(saveResult, `Anúncio ${item.active ? 'ativado' : 'desativado'}.`);
  showToast(feedback.message, feedback.type);
}

function deleteAnnouncement(id) {
  const item = STATE.announcements.find((announcement) => announcement.id === id);
  if (!item) return;
  confirmDialog(`Excluir "${item.title || 'Anúncio'}"`, 'Esta ação não pode ser desfeita.', async () => {
    STATE.announcements = STATE.announcements.filter((announcement) => announcement.id !== id);
    const saveResult = await saveToLS(LS.announcements, STATE.announcements);
    renderAnnouncements();
    refreshAllBadges();
    const feedback = resolveSaveFeedback(saveResult, '🗑️ Anúncio excluído.');
    showToast(feedback.message, feedback.type);
  });
}

function resetAnnouncementForm() {
  ['announcementId', 'anTitle', 'anDescription', 'anStartDate', 'anEndDate', 'anButtonLabel', 'anButtonUrl', 'anImage']
    .forEach((id) => setVal(id, ''));
  const active = document.getElementById('anActive');
  if (active) active.checked = true;
  renderAnnouncementImagePreview('');
  const fileInput = document.getElementById('anImageFile');
  if (fileInput) fileInput.value = '';
}

function renderAnnouncementImagePreview(image) {
  const preview = document.getElementById('anImagePreview');
  if (!preview) return;
  const safeImage = sanitizeImageUrl(image);
  preview.innerHTML = safeImage
    ? `<img src="${escapeHtml(safeImage)}" style="width:100%;height:100%;object-fit:cover;" />`
    : '<span class="img-placeholder">📢</span>';
}

function handleAnnouncementImage(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    const base64 = await optimizeImageDataUrl(event.target.result, {
      maxWidth: 1600,
      maxHeight: 1200,
      quality: 0.9,
    });
    setVal('anImage', base64);
    renderAnnouncementImagePreview(base64);

    const hasCropperDom = !!(
      document.getElementById('imageCropOverlay') &&
      document.getElementById('cropFrame') &&
      document.getElementById('cropImage')
    );
    if (hasCropperDom) openImageCropper('announcement', base64);
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}

function clearAnnouncementImage() {
  setVal('anImage', '');
  renderAnnouncementImagePreview('');
  const fileInput = document.getElementById('anImageFile');
  if (fileInput) fileInput.value = '';
}

/* ==========================================================
   INFORMAÇÕES DA EMPRESA
   ========================================================== */
function loadCompanyForm() {
  const c = STATE.config;
  setVal('cfgStoreName', getStoreDisplayName(c.storeName));
  setVal('cfgSlogan', c.slogan || '');
  setVal('cfgDescription', c.description || '');
  setVal('cfgFooterText', c.footerText || buildDefaultFooterText(c.storeName));
  setVal('cfgStreet', c.street || '');
  setVal('cfgNumber', c.number || '');
  setVal('cfgNeighborhood', c.neighborhood || '');
  setVal('cfgCity', c.city || '');
  setVal('cfgState', c.state || '');
  setVal('cfgCep', c.cep || '');
  setVal('cfgPhone', c.phone || '');
  setVal('cfgWhatsapp', c.whatsapp || '');
  setVal('cfgEmail', c.email || '');
  setVal('cfgInstagram', c.instagram || '');
  setVal('cfgFacebook', c.facebook || '');
  const colorPrimary = normalizeHexColorInput(c.colorPrimary, '#C0392B');
  const colorSecondary = normalizeHexColorInput(c.colorSecondary, '#E67E22');
  const colorBg = normalizeHexColorInput(c.colorBg, '#FDF6EC');
  const colorText = normalizeHexColorInput(c.colorText, '#1A1A1A');
  const colorSurface = normalizeHexColorInput(c.colorSurface, '#FFFFFF');
  const colorSurfaceDark = normalizeHexColorInput(c.colorSurfaceDark, '#4B1912');
  const colorOnDark = normalizeHexColorInput(c.colorOnDark, '#FFFFFF');
  const colorWhatsapp = normalizeHexColorInput(c.colorWhatsapp, '#25D366');

  setVal('cfgColorPrimary', colorPrimary);
  setVal('cfgColorPrimaryText', colorPrimary);
  setVal('cfgColorSecondary', colorSecondary);
  setVal('cfgColorSecondaryText', colorSecondary);
  setVal('cfgColorBg', colorBg);
  setVal('cfgColorBgText', colorBg);
  setVal('cfgColorText', colorText);
  setVal('cfgColorTextText', colorText);
  setVal('cfgColorSurface', colorSurface);
  setVal('cfgColorSurfaceText', colorSurface);
  setVal('cfgColorSurfaceDark', colorSurfaceDark);
  setVal('cfgColorSurfaceDarkText', colorSurfaceDark);
  setVal('cfgColorOnDark', colorOnDark);
  setVal('cfgColorOnDarkText', colorOnDark);
  setVal('cfgColorWhatsapp', colorWhatsapp);
  setVal('cfgColorWhatsappText', colorWhatsapp);

  // Preview de imagens
  updateCompanyImagePreview('logo', c.logo || '');
  updateCompanyImagePreview('banner', c.banner || '');

  renderScheduleList();
  syncColorPreviewBar();
}

async function saveCompanyInfo() {
  const previousStoreName = getStoreDisplayName(STATE.config.storeName);
  const nextStoreName = getStoreDisplayName(getVal('cfgStoreName'));
  const currentFooterText = String(getVal('cfgFooterText') || '').trim();
  const shouldUseDefaultFooter = !currentFooterText || isDefaultFooterTextForStore(currentFooterText, previousStoreName);
  const nextFooterText = shouldUseDefaultFooter
    ? buildDefaultFooterText(nextStoreName)
    : currentFooterText;

  STATE.config = {
    ...STATE.config,
    storeName: nextStoreName,
    slogan: getVal('cfgSlogan'),
    description: getVal('cfgDescription'),
    footerText: nextFooterText,
    street: getVal('cfgStreet'),
    number: getVal('cfgNumber'),
    neighborhood: getVal('cfgNeighborhood'),
    city: getVal('cfgCity'),
    state: getVal('cfgState'),
    cep: getVal('cfgCep'),
    phone: getVal('cfgPhone'),
    whatsapp: getVal('cfgWhatsapp'),
    email: getVal('cfgEmail'),
    instagram: getVal('cfgInstagram'),
    facebook: getVal('cfgFacebook'),
    colorPrimary: normalizeHexColorInput(getVal('cfgColorPrimary'), '#C0392B'),
    colorSecondary: normalizeHexColorInput(getVal('cfgColorSecondary'), '#E67E22'),
    colorBg: normalizeHexColorInput(getVal('cfgColorBg'), '#FDF6EC'),
    colorText: normalizeHexColorInput(getVal('cfgColorText'), '#1A1A1A'),
    colorSurface: normalizeHexColorInput(getVal('cfgColorSurface'), '#FFFFFF'),
    colorSurfaceDark: normalizeHexColorInput(getVal('cfgColorSurfaceDark'), '#4B1912'),
    colorOnDark: normalizeHexColorInput(getVal('cfgColorOnDark'), '#FFFFFF'),
    colorWhatsapp: normalizeHexColorInput(getVal('cfgColorWhatsapp'), '#25D366'),
    schedule: collectSchedule(),
  };
  const saveResult = await saveToLS(LS.config, STATE.config);
  updateSidebarStoreName();
  const feedback = resolveSaveFeedback(saveResult, '✅ Informações da empresa salvas com sucesso!');
  showToast(feedback.message, feedback.type);
}

/* ── Horários ── */
function renderScheduleList() {
  const container = document.getElementById('scheduleList');
  if (!container) return;
  const schedule = STATE.config.schedule || DEMO_CONFIG.schedule;

  container.innerHTML = schedule.map((s, i) => {
    const safeDay = escapeHtml(s?.day || '');
    const safeOpen = sanitizeTimeValue(s?.open, '11:00');
    const safeClose = sanitizeTimeValue(s?.close, '23:00');
    return `
      <div class="schedule-item">
        <span class="schedule-day">${safeDay}</span>
        <input type="time" value="${safeOpen}"  id="sch-open-${i}"  />
        <input type="time" value="${safeClose}" id="sch-close-${i}" />
        <label class="toggle-switch sm">
          <input type="checkbox" id="sch-active-${i}" ${s?.active ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
    `;
  }).join('');
}

function collectSchedule() {
  const schedule = STATE.config.schedule || DEMO_CONFIG.schedule;
  return schedule.map((s, i) => ({
    day: s.day,
    open: sanitizeTimeValue(getVal(`sch-open-${i}`) || s.open, '11:00'),
    close: sanitizeTimeValue(getVal(`sch-close-${i}`) || s.close, '23:00'),
    active: document.getElementById(`sch-active-${i}`)?.checked ?? s.active,
  }));
}

/* ── Imagens da empresa ── */
function handleImageUpload(type, input) {
  if (!input?.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    const base64 = e.target.result;
    const hasCropperDom = !!(
      document.getElementById('imageCropOverlay') &&
      document.getElementById('cropFrame') &&
      document.getElementById('cropImage')
    );

    // Fallback: se o modal de recorte não existir, aplica direto.
    if (!hasCropperDom) {
      if (type === 'logo') STATE.config.logo = base64;
      if (type === 'banner') STATE.config.banner = base64;
      updateCompanyImagePreview(type, base64);
      showToast('Imagem carregada. Clique em "Salvar Alterações".', 'info', 3200);
      return;
    }

    openImageCropper(type, base64);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function updateCompanyImagePreview(type, src) {
  const id = type === 'logo' ? 'logoPreview' : 'bannerPreview';
  const el = document.getElementById(id);
  if (!el) return;
  const safeSrc = sanitizeImageUrl(src);
  const fit = 'cover';
  const bg = 'transparent';
  const pad = '0';
  if (safeSrc) {
    el.innerHTML = `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(type)}" style="width:100%;height:100%;object-fit:${fit};background:${bg};padding:${pad};" />`;
    return;
  }

  el.innerHTML = '';
  const placeholder = document.createElement('span');
  placeholder.className = 'img-placeholder';
  placeholder.textContent = type === 'logo' ? '🍕' : '🏞️';
  el.appendChild(placeholder);
}

function clearImage(type) {
  if (type === 'logo') STATE.config.logo = '';
  if (type === 'banner') STATE.config.banner = '';
  updateCompanyImagePreview(type, '');
  const fileId = type === 'logo' ? 'logoFile' : 'bannerFile';
  const fi = document.getElementById(fileId);
  if (fi) fi.value = '';
}

const CROP_STATE = {
  type: null,
  source: '',
  baseScale: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  frameW: 0,
  frameH: 0,
  naturalW: 0,
  naturalH: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
};

function initializeCropStateFromImage() {
  const frame = document.getElementById('cropFrame');
  const image = document.getElementById('cropImage');
  if (!frame || !image || !image.naturalWidth || !image.naturalHeight) return false;

  const rect = frame.getBoundingClientRect();
  CROP_STATE.frameW = Math.max(1, rect.width || frame.clientWidth || 1);
  CROP_STATE.frameH = Math.max(1, rect.height || frame.clientHeight || 1);
  CROP_STATE.naturalW = Math.max(1, image.naturalWidth || 1);
  CROP_STATE.naturalH = Math.max(1, image.naturalHeight || 1);
  CROP_STATE.baseScale = Math.max(
    CROP_STATE.frameW / CROP_STATE.naturalW,
    CROP_STATE.frameH / CROP_STATE.naturalH,
  );
  CROP_STATE.zoom = 1;

  const scale = CROP_STATE.baseScale * CROP_STATE.zoom;
  const renderedW = CROP_STATE.naturalW * scale;
  const renderedH = CROP_STATE.naturalH * scale;
  CROP_STATE.offsetX = (CROP_STATE.frameW - renderedW) / 2;
  CROP_STATE.offsetY = (CROP_STATE.frameH - renderedH) / 2;

  updateCropTransform();
  return true;
}

function openCurrentImageCropper(type) {
  let current = '';
  if (type === 'logo') current = STATE.config.logo;
  if (type === 'banner') current = STATE.config.banner;
  if (type === 'announcement') current = getVal('anImage');
  if (!current) {
    showToast('Selecione uma imagem antes de enquadrar.', 'error');
    return;
  }
  openImageCropper(type, current);
}

function openImageCropper(type, src) {
  const overlay = document.getElementById('imageCropOverlay');
  const frame = document.getElementById('cropFrame');
  const image = document.getElementById('cropImage');
  const title = document.getElementById('cropModalTitle');
  const hint = document.getElementById('cropModalHint');
  const zoomRange = document.getElementById('cropZoomRange');
  const zoomLabel = document.getElementById('cropZoomLabel');
  if (!overlay || !frame || !image) return;

  const cropType = ['logo', 'banner', 'announcement'].includes(type) ? type : 'banner';
  CROP_STATE.type = cropType;
  CROP_STATE.source = src;
  CROP_STATE.dragging = false;
  CROP_STATE.zoom = 1;
  CROP_STATE.baseScale = 0;
  CROP_STATE.offsetX = 0;
  CROP_STATE.offsetY = 0;
  CROP_STATE.frameW = 0;
  CROP_STATE.frameH = 0;
  CROP_STATE.naturalW = 0;
  CROP_STATE.naturalH = 0;

  frame.classList.remove('logo', 'banner', 'announcement', 'dragging');
  frame.classList.add(cropType);

  const cropTitles = {
    logo: 'Enquadrar Logo',
    banner: 'Enquadrar Banner',
    announcement: 'Enquadrar Anúncio',
  };
  const cropHints = {
    logo: 'A área circular mostra exatamente como a logo vai aparecer.',
    banner: 'Arraste e ajuste o zoom para definir o banner principal.',
    announcement: 'Arraste e ajuste o zoom para definir a foto do anúncio.',
  };
  if (title) title.textContent = cropTitles[cropType];
  if (hint) hint.textContent = cropHints[cropType];

  if (zoomRange) zoomRange.value = '100';
  if (zoomLabel) zoomLabel.textContent = '100%';

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  image.onload = () => initializeCropStateFromImage();
  image.src = src;
  if (image.complete && image.naturalWidth) {
    requestAnimationFrame(() => initializeCropStateFromImage());
  }
}

function closeImageCropper() {
  blurActiveFormField();
  const overlay = document.getElementById('imageCropOverlay');
  const image = document.getElementById('cropImage');
  const frame = document.getElementById('cropFrame');
  if (overlay) overlay.classList.remove('open');
  if (image) image.src = '';
  if (frame) frame.classList.remove('dragging');
  document.body.style.overflow = '';
  CROP_STATE.dragging = false;
}

function clampCropOffsets() {
  const scale = CROP_STATE.baseScale * CROP_STATE.zoom;
  const renderedW = CROP_STATE.naturalW * scale;
  const renderedH = CROP_STATE.naturalH * scale;

  if (renderedW <= CROP_STATE.frameW) {
    CROP_STATE.offsetX = (CROP_STATE.frameW - renderedW) / 2;
  } else {
    const minX = CROP_STATE.frameW - renderedW;
    CROP_STATE.offsetX = Math.min(0, Math.max(minX, CROP_STATE.offsetX));
  }

  if (renderedH <= CROP_STATE.frameH) {
    CROP_STATE.offsetY = (CROP_STATE.frameH - renderedH) / 2;
  } else {
    const minY = CROP_STATE.frameH - renderedH;
    CROP_STATE.offsetY = Math.min(0, Math.max(minY, CROP_STATE.offsetY));
  }
}

function updateCropTransform() {
  const image = document.getElementById('cropImage');
  if (!image || !CROP_STATE.baseScale) return;
  clampCropOffsets();
  const scale = CROP_STATE.baseScale * CROP_STATE.zoom;
  image.style.transform = `translate(${CROP_STATE.offsetX}px, ${CROP_STATE.offsetY}px) scale(${scale})`;
}

function updateCropZoom(rawValue) {
  const value = Number(rawValue) || 100;
  const nextZoom = Math.min(3.2, Math.max(1, value / 100));
  const label = document.getElementById('cropZoomLabel');
  if (label) label.textContent = `${Math.round(nextZoom * 100)}%`;
  if (!CROP_STATE.baseScale) return;

  const oldScale = CROP_STATE.baseScale * CROP_STATE.zoom;
  const nextScale = CROP_STATE.baseScale * nextZoom;
  const centerX = CROP_STATE.frameW / 2;
  const centerY = CROP_STATE.frameH / 2;

  const ix = (centerX - CROP_STATE.offsetX) / oldScale;
  const iy = (centerY - CROP_STATE.offsetY) / oldScale;

  CROP_STATE.zoom = nextZoom;
  CROP_STATE.offsetX = centerX - (ix * nextScale);
  CROP_STATE.offsetY = centerY - (iy * nextScale);

  updateCropTransform();
}

function getEventClientPoint(e) {
  const touch = e?.touches?.[0] || e?.changedTouches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  return { x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
}

function startCropDrag(e) {
  if (!CROP_STATE.baseScale) return;
  e.preventDefault();
  const point = getEventClientPoint(e);
  CROP_STATE.dragging = true;
  CROP_STATE.startX = point.x;
  CROP_STATE.startY = point.y;
  CROP_STATE.startOffsetX = CROP_STATE.offsetX;
  CROP_STATE.startOffsetY = CROP_STATE.offsetY;
  document.getElementById('cropFrame')?.classList.add('dragging');
}

function onCropDrag(e) {
  if (!CROP_STATE.dragging) return;
  e.preventDefault?.();
  const point = getEventClientPoint(e);
  const dx = point.x - CROP_STATE.startX;
  const dy = point.y - CROP_STATE.startY;
  CROP_STATE.offsetX = CROP_STATE.startOffsetX + dx;
  CROP_STATE.offsetY = CROP_STATE.startOffsetY + dy;
  updateCropTransform();
}

function stopCropDrag() {
  CROP_STATE.dragging = false;
  document.getElementById('cropFrame')?.classList.remove('dragging');
}

function saveCroppedImage() {
  const image = document.getElementById('cropImage');
  if (!image || !CROP_STATE.type) return;
  if (!CROP_STATE.baseScale || !CROP_STATE.frameW || !CROP_STATE.frameH || !CROP_STATE.naturalW || !CROP_STATE.naturalH) {
    if (!initializeCropStateFromImage()) {
      showToast('Aguarde a imagem carregar para aplicar o recorte.', 'error');
      return;
    }
  }

  const outputW = CROP_STATE.type === 'logo' ? 700 : 1600;
  const rawFrameRatio = CROP_STATE.frameH / CROP_STATE.frameW;
  const frameRatio = Number.isFinite(rawFrameRatio) && rawFrameRatio > 0 ? rawFrameRatio : (9 / 16);
  const outputH = CROP_STATE.type === 'logo' ? 700 : Math.round(outputW * frameRatio);
  const scale = CROP_STATE.baseScale * CROP_STATE.zoom;

  const sx = (0 - CROP_STATE.offsetX) / scale;
  const sy = (0 - CROP_STATE.offsetY) / scale;
  const sw = CROP_STATE.frameW / scale;
  const sh = CROP_STATE.frameH / scale;

  const canvas = document.createElement('canvas');
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (CROP_STATE.type === 'logo') {
    // Exporta logo já circular (cantos transparentes), fiel ao avatar final.
    ctx.save();
    ctx.beginPath();
    ctx.arc(outputW / 2, outputH / 2, outputW / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputW, outputH);
    ctx.restore();
  } else {
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputW, outputH);
  }

  const base64 = CROP_STATE.type === 'logo'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.92);

  if (CROP_STATE.type === 'logo') {
    STATE.config.logo = base64;
    updateCompanyImagePreview('logo', base64);
  }
  if (CROP_STATE.type === 'banner') {
    STATE.config.banner = base64;
    updateCompanyImagePreview('banner', base64);
  }
  if (CROP_STATE.type === 'announcement') {
    setVal('anImage', base64);
    renderAnnouncementImagePreview(base64);
  }
  closeImageCropper();
  const message = CROP_STATE.type === 'announcement'
    ? 'Foto enquadrada. Salve o anúncio para publicar.'
    : 'Imagem enquadrada. Clique em "Salvar Alterações".';
  showToast(message, 'info', 3200);
}

function setupCropperEvents() {
  const overlay = document.getElementById('imageCropOverlay');
  const frame = document.getElementById('cropFrame');
  if (!overlay || !frame) return;

  const closeIfOverlayTarget = (e) => {
    if (e.target === overlay) closeImageCropper();
  };

  overlay.addEventListener('mousedown', closeIfOverlayTarget);
  overlay.addEventListener('touchstart', closeIfOverlayTarget, { passive: true });

  if (window.PointerEvent) {
    frame.addEventListener('pointerdown', startCropDrag);
    window.addEventListener('pointermove', onCropDrag);
    window.addEventListener('pointerup', stopCropDrag);
    window.addEventListener('pointercancel', stopCropDrag);
    return;
  }

  frame.addEventListener('mousedown', startCropDrag);
  window.addEventListener('mousemove', onCropDrag);
  window.addEventListener('mouseup', stopCropDrag);

  frame.addEventListener('touchstart', startCropDrag, { passive: false });
  window.addEventListener('touchmove', onCropDrag, { passive: false });
  window.addEventListener('touchend', stopCropDrag);
  window.addEventListener('touchcancel', stopCropDrag);
}

/* ── Cores ── */
const DEFAULT_THEME_COLORS = Object.freeze({
  Primary: '#C0392B',
  Secondary: '#E67E22',
  Bg: '#FDF6EC',
  Text: '#1A1A1A',
  Surface: '#FFFFFF',
  SurfaceDark: '#4B1912',
  OnDark: '#FFFFFF',
  Whatsapp: '#25D366',
});

const THEME_COLOR_FIELD_IDS = Object.freeze(Object.keys(DEFAULT_THEME_COLORS));

function getReadableTextColorFromHex(backgroundHex, light = '#FFFFFF', dark = '#1A1A1A') {
  const safe = sanitizeHexColor(backgroundHex, dark);
  const normalized = safe.length === 4
    ? `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}`
    : safe;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) / 255;
  return luminance > 0.58 ? dark : light;
}

function syncColorText(which) {
  const colorInput = document.getElementById(`cfgColor${which}`);
  const textInput = document.getElementById(`cfgColor${which}Text`);
  if (!colorInput || !textInput) return;
  const rawValue = String(textInput.value || '').trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawValue)) return;
  const fallback = DEFAULT_THEME_COLORS[which] || '#C0392B';
  const safeColor = normalizeHexColorInput(rawValue, fallback);
  colorInput.value = safeColor;
  textInput.value = safeColor;
  syncColorPreviewBar();
}

function syncColorPreviewBar() {
  const bar = document.getElementById('colorPreviewBar');
  if (!bar) return;
  const p = sanitizeHexColor(getVal('cfgColorPrimary'), '#C0392B');
  const s = sanitizeHexColor(getVal('cfgColorSecondary'), '#E67E22');
  const bg = sanitizeHexColor(getVal('cfgColorBg'), '#FDF6EC');
  const t = sanitizeHexColor(getVal('cfgColorText'), '#1A1A1A');
  const sf = sanitizeHexColor(getVal('cfgColorSurface'), '#FFFFFF');
  const d = sanitizeHexColor(getVal('cfgColorSurfaceDark'), '#4B1912');
  const od = sanitizeHexColor(getVal('cfgColorOnDark'), '#FFFFFF');
  const wa = sanitizeHexColor(getVal('cfgColorWhatsapp'), '#25D366');

  const buildChip = (label, background, color, extraStyle = '') =>
    `<span style="background:${background};color:${color};${extraStyle}">${label}</span>`;

  bar.innerHTML = `
    ${buildChip('Primária', p, getReadableTextColorFromHex(p))}
    ${buildChip('Secundária', s, getReadableTextColorFromHex(s))}
    ${buildChip('Fundo', bg, t, 'border:1px solid #ddd;')}
    ${buildChip('Texto', t, getReadableTextColorFromHex(t))}
    ${buildChip('Superfície', sf, getReadableTextColorFromHex(sf), 'border:1px solid #ddd;')}
    ${buildChip('Fundo Escuro', d, od)}
    ${buildChip('Texto Escuro', od, getReadableTextColorFromHex(od), 'border:1px solid #ddd;')}
    ${buildChip('WhatsApp', wa, getReadableTextColorFromHex(wa))}
  `;
}

function resetThemeColors() {
  THEME_COLOR_FIELD_IDS.forEach((which) => {
    const value = DEFAULT_THEME_COLORS[which];
    setVal(`cfgColor${which}`, value);
    setVal(`cfgColor${which}Text`, value);
  });
  syncColorPreviewBar();
  showToast('Paleta padrão restaurada. Clique em "Salvar Alterações" para aplicar no site.', 'success');
}

// Sync color picker → text field (listener)
document.addEventListener('DOMContentLoaded', () => {
  THEME_COLOR_FIELD_IDS.forEach(which => {
    const picker = document.getElementById(`cfgColor${which}`);
    const text = document.getElementById(`cfgColor${which}Text`);
    if (picker && text) {
      picker.addEventListener('input', () => {
        text.value = picker.value.toUpperCase();
        syncColorPreviewBar();
      });
    }
  });
  setupCropperEvents();
});

/* ==========================================================
   VISUAL DO SITE
   ========================================================== */
function loadVisualForm() {
  const v = STATE.visual;
  const heroFloatingImage = v.heroFloatingImage || v.heroPizzaImage || '';
  setVal('vHeroTitle1', v.heroTitle1 || '');
  setVal('vHeroTitle2', v.heroTitle2 || '');
  setVal('vHeroSubtitle', v.heroSubtitle || '');
  setVal('vHeroBadge', v.heroBadge || '');
  setVal('vHeroCta', v.heroCta || '');
  setVal('vHeroFloatingImage', heroFloatingImage);
  setVal('vHeroFloatingName', v.heroFloatingName || '');
  setVal('vHeroFloatingPrice', v.heroFloatingPrice || '');
  setVal('vPromoBannerText', v.promoBannerText || '');
  setVal('vDeliveryTime', v.deliveryTime || '');
  setVal('vRating', v.rating || '');
  setVal('vFreeDelivery', v.freeDelivery || '');
  document.getElementById('vPromoBannerActive').checked = v.promoBannerActive !== false;
  updateVisualHeroImagePreview(heroFloatingImage);

  // Seções
  const secMap = {
    secPromoBanner: 'secPromoBanner', secHero: 'secHero', secCombos: 'secCombos',
    secPizzas: 'secPizzas', secHamb: 'secHamb', secPorcoes: 'secPorcoes',
    secBebidas: 'secBebidas', secSobremesas: 'secSobremesas',
  };
  Object.entries(secMap).forEach(([key]) => {
    const el = document.getElementById(key);
    if (el) el.checked = v[key] !== false;
  });
}

async function saveVisualSettings() {
  STATE.visual = {
    heroTitle1: getVal('vHeroTitle1'),
    heroTitle2: getVal('vHeroTitle2'),
    heroSubtitle: getVal('vHeroSubtitle'),
    heroBadge: getVal('vHeroBadge'),
    heroCta: getVal('vHeroCta'),
    heroFloatingImage: getVal('vHeroFloatingImage').trim(),
    heroFloatingName: getVal('vHeroFloatingName').trim(),
    heroFloatingPrice: getVal('vHeroFloatingPrice').trim(),
    promoBannerText: getVal('vPromoBannerText'),
    promoBannerActive: document.getElementById('vPromoBannerActive').checked,
    deliveryTime: getVal('vDeliveryTime'),
    rating: getVal('vRating'),
    freeDelivery: getVal('vFreeDelivery'),
    secPromoBanner: document.getElementById('secPromoBanner').checked,
    secHero: document.getElementById('secHero').checked,
    secCombos: document.getElementById('secCombos').checked,
    secPizzas: document.getElementById('secPizzas').checked,
    secHamb: document.getElementById('secHamb').checked,
    secPorcoes: document.getElementById('secPorcoes').checked,
    secBebidas: document.getElementById('secBebidas').checked,
    secSobremesas: document.getElementById('secSobremesas').checked,
  };
  const saveResult = await saveToLS(LS.visual, STATE.visual);
  const feedback = resolveSaveFeedback(saveResult, '✅ Visual do site salvo!');
  showToast(feedback.message, feedback.type);
}

function handleVisualHeroImage(input) {
  if (!input?.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = await optimizeImageDataUrl(e.target.result, {
      maxWidth: 1400,
      maxHeight: 1400,
      outputType: 'image/png',
    });
    setVal('vHeroFloatingImage', base64);
    updateVisualHeroImagePreview(base64);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function updateVisualHeroImagePreview(src) {
  const preview = document.getElementById('vHeroFloatPreview');
  if (!preview) return;
  const safeSrc = sanitizeImageUrl(src);
  if (safeSrc) {
    preview.innerHTML = `<img src="${escapeHtml(safeSrc)}" alt="Hero flutuante" style="width:100%;height:100%;object-fit:contain;padding:8px;background:transparent;" />`;
    return;
  }

  preview.innerHTML = '';
  const placeholder = document.createElement('span');
  placeholder.className = 'img-placeholder';
  placeholder.textContent = '🍕';
  preview.appendChild(placeholder);
}

function clearVisualHeroImage() {
  setVal('vHeroFloatingImage', '');
  updateVisualHeroImagePreview('');
  const input = document.getElementById('vHeroFloatFile');
  if (input) input.value = '';
}

/* ==========================================================
   CONFIGURAÇÕES DE PEDIDOS
   ========================================================== */
function loadOrdersForm() {
  const o = STATE.orders;
  setVal('orderWhatsapp', o.whatsapp || '');
  setVal('orderPixKey', o.pixKey || '');
  setVal('orderGreeting', o.greeting || '');
  setVal('orderMsgTemplate', o.msgTemplate || '');
  setVal('orderDeliveryFee', o.deliveryFee || 0);
  setVal('orderFreeDeliveryAt', o.freeDeliveryAt || 0);
  setVal('orderMinValue', o.minValue || 0);
  setVal('orderDeliveryTime', o.deliveryTime || '');
  setVal('orderClosedMsg', o.closedMsg || '');
  setVal('orderOpenTime', o.openTime || '11:00');
  setVal('orderCloseTime', o.closeTime || '23:00');
  document.getElementById('orderStoreOpen').checked = o.storeOpen !== false;

  // Sincroniza o toggle da sidebar
  const sidebarToggle = document.getElementById('storeOpenToggle');
  if (sidebarToggle) sidebarToggle.checked = o.storeOpen !== false;

  // Bairros
  renderNeighborhoodTags();
}

async function saveOrderSettings() {
  STATE.orders = {
    whatsapp: getVal('orderWhatsapp'),
    pixKey: getVal('orderPixKey'),
    greeting: getVal('orderGreeting'),
    msgTemplate: getVal('orderMsgTemplate'),
    deliveryFee: parseFloat(getVal('orderDeliveryFee')) || 0,
    freeDeliveryAt: parseFloat(getVal('orderFreeDeliveryAt')) || 0,
    minValue: parseFloat(getVal('orderMinValue')) || 0,
    deliveryTime: getVal('orderDeliveryTime'),
    storeOpen: document.getElementById('orderStoreOpen').checked,
    closedMsg: getVal('orderClosedMsg'),
    openTime: getVal('orderOpenTime'),
    closeTime: getVal('orderCloseTime'),
    neighborhoods: STATE.orders.neighborhoods || [],
  };
  const saveResult = await saveToLS(LS.orders, STATE.orders);
  updateStoreStatusIndicator();
  const feedback = resolveSaveFeedback(saveResult, '✅ Configurações de pedidos salvas!');
  showToast(feedback.message, feedback.type);
}

async function toggleStoreStatus(isOpen) {
  STATE.orders.storeOpen = isOpen;
  const saveResult = await saveToLS(LS.orders, STATE.orders);
  updateStoreStatusIndicator();
  // Sincroniza todos os toggles
  const t1 = document.getElementById('orderStoreOpen');
  const t2 = document.getElementById('storeOpenToggle');
  if (t1) t1.checked = isOpen;
  if (t2) t2.checked = isOpen;
  const feedback = resolveSaveFeedback(
    saveResult,
    `Loja ${isOpen ? 'aberta ✅' : 'fechada 🔴'}`
  );
  showToast(feedback.message, feedback.type);
}

function updateStoreStatusIndicator() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('storeStatusText');
  const isOpen = STATE.orders.storeOpen !== false;
  if (dot) {
    dot.className = `status-dot ${isOpen ? 'open' : 'closed'}`;
  }
  if (text) text.textContent = isOpen ? 'Loja Aberta' : 'Loja Fechada';
}

/* ── Bairros ── */
function addNeighborhood() {
  const input = document.getElementById('newNeighborhood');
  const val = input.value.trim();
  if (!val) return;
  if (!STATE.orders.neighborhoods) STATE.orders.neighborhoods = [];
  if (!STATE.orders.neighborhoods.includes(val)) {
    STATE.orders.neighborhoods.push(val);
    renderNeighborhoodTags();
    input.value = '';
  } else {
    showToast('Este bairro já foi adicionado.', 'error');
  }
}

function removeNeighborhood(idx) {
  STATE.orders.neighborhoods.splice(idx, 1);
  renderNeighborhoodTags();
}

function renderNeighborhoodTags() {
  const container = document.getElementById('neighborhoodTags');
  if (!container) return;
  const neighborhoods = STATE.orders.neighborhoods || [];
  container.innerHTML = neighborhoods.map((n, i) => `
    <div class="tag-item">
      <span>${escapeHtml(n)}</span>
      <button onclick="removeNeighborhood(${i})">✕</button>
    </div>
  `).join('') || '<span style="color:var(--text-3);font-size:.8rem;">Nenhum bairro cadastrado</span>';
}

/* ==========================================================
   MODAIS (abrir/fechar)
   ========================================================== */

/** IDs dos modais disponíveis */
const MODALS = [
  'adminProfileModal',
  'announcementModal',
  'productModal',
  'categoryModal',
  'comboModal',
  'promotionModal',
  'stockMovementModal',
  'stockXmlModal',
];
let MODAL_RETURN_FOCUS = null;

function openModal(modalId) {
  const alreadyOpen = MODALS.some((id) => document.getElementById(id)?.classList.contains('open'));
  if (!alreadyOpen && typeof document.activeElement?.focus === 'function') {
    MODAL_RETURN_FOCUS = document.activeElement;
  }
  // Fecha qualquer modal aberto
  MODALS.forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  });
  const modal = document.getElementById(modalId);
  const overlay = document.getElementById('modalOverlay');
  if (modal) modal.classList.add('open');
  if (overlay) overlay.classList.add('open');
  const adminApp = document.getElementById('adminApp');
  if (adminApp && modalId === 'adminProfileModal') adminApp.setAttribute('inert', '');
  document.body.style.overflow = 'hidden';
}

function closeModal({ restoreFocus = true } = {}) {
  const focusTarget = MODAL_RETURN_FOCUS;
  MODAL_RETURN_FOCUS = null;
  blurActiveFormField();
  MODALS.forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  });
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('open');
  document.getElementById('adminApp')?.removeAttribute('inert');
  document.body.style.overflow = '';
  clearAdminProfilePasswords();
  const profileError = document.getElementById('adminProfileError');
  if (profileError) profileError.textContent = '';
  STATE.editingId = null;
  if (restoreFocus && typeof focusTarget?.focus === 'function') {
    requestAnimationFrame(() => focusTarget.focus());
  }
}

/* ==========================================================
   MODAL DE CONFIRMAÇÃO
   ========================================================== */
function confirmDialog(title, message, callback, confirmLabel = 'Confirmar', icon = '⚠️', cancelLabel = 'Cancelar', options = {}) {
  STATE.confirmCb = callback;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = message;
  document.getElementById('confirmIcon').textContent = String(icon || '⚠️').trim() || '⚠️';
  document.getElementById('confirmBtn').textContent = String(confirmLabel || 'Confirmar').trim() || 'Confirmar';
  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (cancelBtn) cancelBtn.textContent = String(cancelLabel || 'Cancelar').trim() || 'Cancelar';
  const fields = document.getElementById('confirmFields');
  if (fields) {
    fields.innerHTML = String(options?.fieldsHtml || '');
    fields.hidden = !fields.innerHTML;
  }
  document.getElementById('confirmOverlay').classList.add('open');
  if (options?.focusId) {
    requestAnimationFrame(() => document.getElementById(options.focusId)?.focus());
  }
}

function confirmAction() {
  const shouldClose = STATE.confirmCb ? STATE.confirmCb() : true;
  if (shouldClose !== false) closeConfirm();
}

function closeConfirm() {
  blurActiveFormField();
  document.getElementById('confirmOverlay').classList.remove('open');
  document.getElementById('confirmBtn').textContent = 'Confirmar';
  document.getElementById('confirmIcon').textContent = '⚠️';
  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (cancelBtn) cancelBtn.textContent = 'Cancelar';
  const fields = document.getElementById('confirmFields');
  if (fields) {
    fields.innerHTML = '';
    fields.hidden = true;
  }
  STATE.confirmCb = null;
}

/* ==========================================================
   TOAST DE NOTIFICAÇÃO
   ========================================================== */
function showToast(message, type = 'info', duration = 2800) {
  const toast = document.getElementById('adminToast');
  toast.textContent = fixMojibakeText(message);
  toast.className = `admin-toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function getPrintAgentStatusLabel(status = STATE.printAgent.status) {
  if (!status) return 'Verificando';
  if (status.active && status.agent?.online) return 'Conectado';
  if (status.active) return 'Aguardando app';
  if (!status.tokenConfigured) return 'Token ausente';
  return 'Desativado';
}

function formatPrintAgentCredentialDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('pt-BR');
}

function confirmPrintAgentCredentialRevocation(clientId) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId || STATE.printAgent.revokingClientId) return;
  confirmDialog(
    'Revogar agente de impressao?',
    'O computador "' + safeClientId + '" perdera o acesso imediatamente e precisara de um novo instalador para voltar a imprimir.',
    () => {
      void revokePrintAgentCredential(safeClientId);
      return true;
    },
    'Revogar acesso',
    '🖨️',
    'Manter acesso',
  );
}

function renderPrintAgentCredentials(status) {
  const listEl = document.getElementById('printAgentCredentialsList');
  const legacyEl = document.getElementById('printAgentLegacyStatus');

  if (legacyEl) {
    legacyEl.classList.remove('enabled', 'disabled');
    if (!status) {
      legacyEl.textContent = 'Verificando modo legado';
    } else if (status.legacyTokenAllowed === true) {
      legacyEl.textContent = 'Compatibilidade legada ativa';
      legacyEl.classList.add('enabled');
    } else if (status.legacyTokenAllowed === false) {
      legacyEl.textContent = 'Somente credenciais individuais';
      legacyEl.classList.add('disabled');
    } else {
      legacyEl.textContent = 'Modo legado nao informado';
    }
  }

  if (!listEl) return;
  listEl.replaceChildren();

  if (!status) {
    const empty = document.createElement('p');
    empty.className = 'olap-credentials-empty';
    empty.textContent = 'Carregando credenciais...';
    listEl.appendChild(empty);
    return;
  }

  const credentials = Array.isArray(status.credentials) ? status.credentials : [];
  if (credentials.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'olap-credentials-empty';
    empty.textContent = 'Nenhum computador possui credencial individual.';
    listEl.appendChild(empty);
    return;
  }

  credentials.forEach((credential) => {
    const clientId = String(credential?.clientId || '').trim();
    if (!clientId) return;
    const revokedAt = formatPrintAgentCredentialDate(credential?.revokedAt);
    const lastUsedAt = formatPrintAgentCredentialDate(credential?.lastUsedAt);
    const createdAt = formatPrintAgentCredentialDate(credential?.createdAt);
    const rotatedAt = formatPrintAgentCredentialDate(credential?.rotatedAt);
    const isRevoked = Boolean(revokedAt);
    const isRevoking = STATE.printAgent.revokingClientId === clientId;

    const row = document.createElement('div');
    row.className = `olap-credential-row${isRevoked ? ' is-revoked' : ''}`;
    row.setAttribute('role', 'listitem');

    const main = document.createElement('div');
    main.className = 'olap-credential-main';
    const title = document.createElement('div');
    title.className = 'olap-credential-title';
    const idEl = document.createElement('span');
    idEl.className = 'olap-credential-id';
    idEl.textContent = clientId;
    const statusEl = document.createElement('span');
    statusEl.className = `olap-credential-status ${isRevoked ? 'revoked' : 'active'}`;
    statusEl.textContent = isRevoked ? 'Revogada' : 'Ativa';
    title.append(idEl, statusEl);

    const meta = document.createElement('span');
    meta.className = 'olap-credential-meta';
    if (isRevoked) {
      meta.textContent = `Revogada em ${revokedAt}.`;
    } else if (lastUsedAt) {
      meta.textContent = `Ultimo contato em ${lastUsedAt}.`;
    } else if (rotatedAt) {
      meta.textContent = `Credencial renovada em ${rotatedAt}; aguardando primeiro contato.`;
    } else if (createdAt) {
      meta.textContent = `Criada em ${createdAt}; aguardando primeiro contato.`;
    } else {
      meta.textContent = 'Aguardando primeiro contato.';
    }
    main.append(title, meta);
    row.appendChild(main);

    if (!isRevoked) {
      const revokeBtn = document.createElement('button');
      revokeBtn.className = 'btn-danger-outline sm';
      revokeBtn.type = 'button';
      revokeBtn.textContent = isRevoking ? 'Revogando...' : 'Revogar';
      revokeBtn.disabled = Boolean(STATE.printAgent.revokingClientId) || STATE.printAgent.loading;
      revokeBtn.setAttribute('aria-label', `Revogar credencial do computador ${clientId}`);
      revokeBtn.addEventListener('click', () => confirmPrintAgentCredentialRevocation(clientId));
      row.appendChild(revokeBtn);
    }

    listEl.appendChild(row);
  });
}

async function revokePrintAgentCredential(clientId) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId || STATE.printAgent.revokingClientId) return;
  STATE.printAgent.revokingClientId = safeClientId;
  renderPrintAgentPanel();

  try {
    const response = await fetchWithTimeout(`${PRINT_AGENT_ADMIN_API}/credentials/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-CSRF': ADMIN_SESSION_PROFILE.csrfToken,
      },
      body: JSON.stringify({ clientId: safeClientId }),
      timeoutMs: ADMIN_FETCH_TIMEOUT_MS,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    showToast(`Credencial de "${safeClientId}" revogada.`, 'success', 2600);
    await loadPrintAgentStatus(true);
  } catch (error) {
    console.error('Falha ao revogar credencial do agente de impressao.', error);
    showToast(`Falha ao revogar: ${String(error?.message || error)}`, 'error', 3600);
  } finally {
    STATE.printAgent.revokingClientId = '';
    renderPrintAgentPanel();
  }
}

function renderPrintAgentPanel() {
  const status = STATE.printAgent.status;
  const statusEl = document.getElementById('printAgentStatus');
  const serverUrlEl = document.getElementById('printAgentServerUrl');
  const noteEl = document.getElementById('printAgentNote');
  const statsEl = document.getElementById('printAgentStats');
  const installerBtn = document.getElementById('printAgentInstallerBtn');
  renderPrintAgentCredentials(status);

  if (statusEl) {
    statusEl.classList.remove('connected', 'disconnected');
    statusEl.textContent = getPrintAgentStatusLabel(status);
    statusEl.classList.add(status?.active && status?.agent?.online ? 'connected' : 'disconnected');
  }

  if (serverUrlEl) {
    serverUrlEl.textContent = status?.serverUrl || '--';
  }

  if (noteEl) {
    if (!status) {
      noteEl.textContent = 'Verificando configuracao do agente no servidor.';
    } else if (!status.tokenConfigured) {
      noteEl.textContent = 'Token do agente indisponivel. Verifique permissao da pasta de dados do servidor.';
    } else if (!status.active) {
      noteEl.textContent = 'O agente esta desativado no servidor. Ative PRINT_AGENT_ENABLED=1 para usar instalacao automatica.';
    } else if (status.agent?.online) {
      const lastSeen = status.agent.lastSeenAt
        ? new Date(status.agent.lastSeenAt).toLocaleString('pt-BR')
        : 'agora';
      noteEl.textContent = `App de impressao conectado (${status.agent.clientId || 'computador'}, visto em ${lastSeen}).`;
    } else {
      const installerDate = status.installerModifiedAt
        ? new Date(status.installerModifiedAt).toLocaleString('pt-BR')
        : '';
      noteEl.textContent = installerDate
        ? `Baixe o .exe atualizado em ${installerDate}, execute e clique em Start para ativar a impressao automatica.`
        : 'Baixe o .exe no Windows da impressora, execute e clique em Start para ativar a impressao automatica.';
    }
  }

  if (statsEl) {
    const stats = status?.stats || {};
    const items = [
      ['Pendentes', stats.pending || 0],
      ['Imprimindo', stats.processing || 0],
      ['Concluidas', stats.done || 0],
      ['Falhas', stats.failed || 0],
    ];
    statsEl.innerHTML = items.map(([label, value]) => `
      <div class="olap-stat">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  if (installerBtn) {
    installerBtn.disabled = !status?.active || STATE.printAgent.loading;
  }
}

async function loadPrintAgentStatus(silent = false) {
  if (STATE.printAgent.loading) return;

  STATE.printAgent.loading = true;
  renderPrintAgentPanel();

  try {
    const response = await fetchWithTimeout(`${PRINT_AGENT_ADMIN_API}/status`, {
      cache: 'no-store',
      credentials: 'include',
      timeoutMs: ADMIN_FETCH_TIMEOUT_MS,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    STATE.printAgent.status = await response.json();
    renderPrintAgentPanel();
  } catch (error) {
    console.error('Falha ao carregar status do agente de impressao.', error);
    if (!silent) showToast('Nao foi possivel carregar o status do agente.', 'error', 3200);
  } finally {
    STATE.printAgent.loading = false;
    renderPrintAgentPanel();
  }
}

function getFilenameFromDisposition(disposition, fallback) {
  const raw = String(disposition || '');
  const match = raw.match(/filename="?([^";]+)"?/i);
  return match?.[1] ? match[1] : fallback;
}

async function downloadPrintAgentInstaller() {
  if (STATE.printAgent.downloadingInstaller) {
    showToast('O instalador ja esta sendo baixado. Aguarde a conclusao.', 'info', 2800);
    return;
  }

  STATE.printAgent.downloadingInstaller = true;
  STATE.printAgent.installerDownloadProgress = 0;
  renderPrintAgentPanel();
  showToast('Baixando o app do agente. Aguarde chegar a 100%.', 'info', 3200);

  try {
    const installerPath = String(STATE.printAgent.status?.installerUrl || '/api/admin/print-agent/installer.exe').trim();
    const installerUrl = installerPath.startsWith('http')
      ? installerPath
      : `${API_ORIGIN}${installerPath.startsWith('/') ? installerPath : `/${installerPath}`}`;

    const response = await adminFetch(installerUrl, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      const text = await response.text();
      try {
        const data = text ? JSON.parse(text) : null;
        if (data?.error) message = data.error;
      } catch {
        if (text) message = text;
      }
      throw new Error(message);
    }

    const totalBytes = Math.max(0, Number.parseInt(response.headers.get('Content-Length') || '0', 10) || 0);
    let blob;

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;
      let displayedProgress = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        chunks.push(value);
        receivedBytes += value.byteLength;
        const nextProgress = totalBytes > 0
          ? Math.min(99, Math.floor((receivedBytes / totalBytes) * 100))
          : 0;
        if (nextProgress !== displayedProgress) {
          displayedProgress = nextProgress;
          STATE.printAgent.installerDownloadProgress = nextProgress;
          renderPrintAgentPanel();
        }
      }

      blob = new Blob(chunks, {
        type: response.headers.get('Content-Type') || 'application/vnd.microsoft.portable-executable',
      });
    } else {
      blob = await response.blob();
    }

    if (totalBytes > 0 && blob.size !== totalBytes) {
      throw new Error(`Download incompleto: recebido ${blob.size} de ${totalBytes} bytes.`);
    }

    STATE.printAgent.installerDownloadProgress = 100;
    renderPrintAgentPanel();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getFilenameFromDisposition(
      response.headers.get('Content-Disposition'),
      'cardapio-print-agent-installer.exe',
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('Download concluido. Confira a pasta Downloads do Windows.', 'success', 4200);
  } catch (error) {
    console.error('Falha ao baixar instalador do agente.', error);
    showToast(`Falha ao baixar instalador: ${String(error?.message || error)}`, 'error', 4200);
  } finally {
    STATE.printAgent.downloadingInstaller = false;
    STATE.printAgent.installerDownloadProgress = 0;
    renderPrintAgentPanel();
  }
}

async function copyPrintAgentServerUrl() {
  const value = String(STATE.printAgent.status?.serverUrl || '').trim();
  if (!value) {
    showToast('URL do servidor ainda nao carregada.', 'error', 2600);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showToast('URL do servidor copiada.', 'success', 1800);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast('URL do servidor copiada.', 'success', 1800);
  }
}

function normalizePrintProfile(value) {
  const profileId = String(value || '').trim();
  if (PRINT_LAYOUT_PROFILES[profileId]) return profileId;
  return DEFAULT_PRINT_PROFILE;
}

function getCurrentPrintProfile() {
  return PRINT_LAYOUT_PROFILES[normalizePrintProfile(STATE.autoPrint?.profile)];
}

function getPrintWindowFeatures(profileId = '') {
  const profile = PRINT_LAYOUT_PROFILES[normalizePrintProfile(profileId)] || getCurrentPrintProfile();
  return `width=${profile.previewWidthPx},height=${profile.previewHeightPx}`;
}

function openOrReuseAutoPrinterWindow(allowCreate = true) {
  const current = STATE.autoPrint?.windowRef;
  if (current && !current.closed) return current;
  if (!allowCreate) return null;

  const popup = window.open('', AUTO_PRINT_WINDOW_NAME, getPrintWindowFeatures(STATE.autoPrint.profile));
  if (!popup) return null;

  STATE.autoPrint.windowRef = popup;
  return popup;
}

function saveAutoPrintPreferences() {
  const payload = {
    profile: normalizePrintProfile(STATE.autoPrint?.profile),
  };

  STATE.autoPrint.profile = payload.profile;

  try {
    localStorage.setItem(AUTO_PRINT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Nao foi possivel salvar preferencias de impressao.', error);
  }
}

function loadAutoPrintPreferences() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(AUTO_PRINT_STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('Nao foi possivel carregar preferencias de impressao.', error);
  }

  STATE.autoPrint.enabled = false;
  STATE.autoPrint.profile = normalizePrintProfile(parsed?.profile);
  STATE.autoPrint.armedAt = 0;
  STATE.autoPrint.printedOrderIds = [];
  STATE.autoPrint.skippedNoNameOrderIds = [];
  STATE.autoPrint.windowRef = null;
  STATE.autoPrint.connected = false;
  STATE.autoPrint.warnedDisconnected = false;
  STATE.autoPrint.isProcessing = false;
  STATE.autoPrint.consecutiveFailures = 0;
  STATE.autoPrint.serverSilentSupported = false;
  STATE.autoPrint.warnedServerFallback = false;

  if (parsed?.enabled) {
    saveAutoPrintPreferences();
  }

  syncAutoPrintControls();
}

function hasCustomerNameForPrinting(order) {
  return !isOrderPendingConfirmation(order)
    && String(order?.customerName || '').trim().length > 0;
}

function isOrderPendingConfirmation(order) {
  return String(order?.operationalStatus || '').toLowerCase() === 'pending';
}

function syncAutoPrinterConnectionState(showWarning = true) {
  const ref = STATE.autoPrint?.windowRef;
  if (STATE.autoPrint.connected && ref && ref.closed) {
    STATE.autoPrint.connected = false;
    STATE.autoPrint.windowRef = null;
    if (showWarning && !STATE.autoPrint.warnedDisconnected) {
      STATE.autoPrint.warnedDisconnected = true;
      showToast('Janela da impressora foi fechada. Conecte novamente para continuar.', 'error', 3400);
    }
  } else if (STATE.autoPrint.connected) {
    STATE.autoPrint.warnedDisconnected = false;
  }
}

function syncAutoPrintControls() {
  syncAutoPrinterConnectionState(false);

  const status = document.getElementById('autoPrintStatus');
  const connectBtn = document.getElementById('autoPrintConnectBtn');
  const profileSelect = document.getElementById('autoPrintProfile');

  if (profileSelect) profileSelect.value = normalizePrintProfile(STATE.autoPrint.profile);
  if (connectBtn) {
    connectBtn.textContent = STATE.autoPrint.connected ? 'Desconectar impressora' : 'Conectar impressora';
  }

  if (status) {
    status.classList.remove('connected', 'disconnected');
    if (STATE.autoPrint.connected) {
      status.textContent = 'Conectada';
      status.classList.add('connected');
      return;
    }

    status.textContent = 'Desconectada';
    status.classList.add('disconnected');
  }
}

function setAutoPrintProfile(profileId) {
  const nextProfile = normalizePrintProfile(profileId);
  if (nextProfile === STATE.autoPrint.profile) {
    syncAutoPrintControls();
    return;
  }

  STATE.autoPrint.profile = nextProfile;
  saveAutoPrintPreferences();
  syncAutoPrintControls();

  const label = PRINT_LAYOUT_PROFILES[nextProfile]?.label || 'perfil selecionado';
  showToast(`Formato de impressão atualizado para ${label}.`, 'success', 2500);
}

function writeAutoPrinterSetupPage(popup) {
  if (!popup) return;
  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Impressora conectada</title>
  <style${getDocumentCspNonceAttribute()}>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #101828; font-family: Arial, sans-serif; }
    .box { width: min(540px, calc(100vw - 28px)); border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; padding: 16px 18px; }
    h1 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0; font-size: 13px; line-height: 1.45; color: #344054; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Impressora conectada</h1>
    <p>Janela da impressao manual. Mantenha esta aba aberta enquanto o painel estiver em uso.</p>
  </div>
</body>
</html>`);
  popup.document.close();
}

function toggleAutoPrinterConnection() {
  syncAutoPrinterConnectionState(false);

  if (STATE.autoPrint.connected) {
    disconnectAutoPrinter();
    showToast('Conexao da impressora encerrada.', 'info', 2200);
    return;
  }

  const popup = openOrReuseAutoPrinterWindow(true);
  if (!popup) {
    STATE.autoPrint.connected = false;
    STATE.autoPrint.windowRef = null;
    syncAutoPrintControls();
    showToast('Permita pop-up para conectar a janela local da impressora.', 'error', 3500);
    return;
  }

  writeAutoPrinterSetupPage(popup);
  STATE.autoPrint.windowRef = popup;
  STATE.autoPrint.connected = true;
  STATE.autoPrint.warnedDisconnected = false;
  syncAutoPrintControls();
  showToast('Janela local da impressora conectada com sucesso.', 'success', 3200);
}

function disconnectAutoPrinter(closeWindow = true) {
  const popup = STATE.autoPrint.windowRef;
  if (closeWindow && popup && !popup.closed) {
    popup.close();
  }
  STATE.autoPrint.windowRef = null;
  STATE.autoPrint.connected = false;
  STATE.autoPrint.warnedDisconnected = false;
  STATE.autoPrint.isProcessing = false;
  STATE.autoPrint.consecutiveFailures = 0;
  syncAutoPrintControls();
}

function printAutoPrinterTestPageInBrowser() {
  const popup = openOrReuseAutoPrinterWindow(true);
  if (!popup) {
    showToast('Permita pop-up para enviar o teste para a impressora local.', 'error', 3600);
    return false;
  }

  STATE.autoPrint.windowRef = popup;
  STATE.autoPrint.connected = true;
  STATE.autoPrint.warnedDisconnected = false;
  syncAutoPrintControls();

  try {
    const now = formatReceiptDateTime();
    popup.document.open();
    popup.document.write(
      buildThermalReceiptDocument({
        title: 'Teste de Impressao',
        storeName: getStoreDisplayName(STATE.config?.storeName),
        orderCode: 'TESTE',
        createdAt: now,
        customerName: 'Sistema',
        bodyText: [
          'TESTE DE IMPRESSAO LOCAL',
          `Data: ${now}`,
          '',
          'Modo manual ativo.',
          'A impressao esta sendo feita pelo navegador.',
        ].join('\n'),
        footerText: 'Modo manual local ativo',
        profileId: STATE.autoPrint.profile,
      }),
    );
    popup.document.close();
    popup.focus();
    return true;
  } catch (error) {
    console.error('Falha ao renderizar teste local de impressao.', error);
    showToast(`Falha no teste local: ${String(error?.message || error)}`, 'error', 4200);
    return false;
  }
}

async function printAutoPrinterTestPage() {
  if (!STATE.autoPrint.connected) {
    showToast('Conecte a impressora antes de rodar o teste.', 'error', 3200);
    return;
  }

  const printed = printAutoPrinterTestPageInBrowser();
  if (printed) {
    showToast('Teste enviado pela impressao manual do navegador.', 'success', 2800);
  }
}

function startOrderLogsPolling() {
  stopOrderLogsPolling();
  ORDER_LOGS_POLL_TIMER = setInterval(() => {
    syncAutoPrinterConnectionState(false);
    syncAutoPrintControls();
    if (document.hidden) return;
    loadOrderLogs(true);
    if (STATE.currentPage === 'order-logs') loadPrintAgentStatus(true);
  }, ORDER_LOGS_POLL_INTERVAL_MS);
}

function stopOrderLogsPolling() {
  if (!ORDER_LOGS_POLL_TIMER) return;
  clearInterval(ORDER_LOGS_POLL_TIMER);
  ORDER_LOGS_POLL_TIMER = null;
}

/* ==========================================================
   CAIXA E FISCAL
   ========================================================== */
async function fetchCashierApi(path = '', options = {}) {
  const response = await fetchWithTimeout(`${CASHIER_API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.error || `HTTP ${response.status}`));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function fetchFiscalApi(path = '', options = {}) {
  const response = await fetchWithTimeout(`${FISCAL_API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.error || `HTTP ${response.status}`));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function buildCashierHistoryQuery() {
  const params = new URLSearchParams();
  params.set('status', 'closed');
  params.set('limit', '80');
  const dateFrom = getVal('cashierHistoryDateFrom').trim();
  const dateTo = getVal('cashierHistoryDateTo').trim();
  const operator = getVal('cashierHistoryOperator').trim();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (operator) params.set('operator', operator);
  return `?${params.toString()}`;
}

async function loadCashier(silent = false) {
  if (STATE.cashier.loading) return;
  STATE.cashier.loading = true;
  try {
    await loadOrderLogs(true);
    const [summary, fiscalStatus, sessions, events] = await Promise.all([
      fetchCashierApi('/summary'),
      fetchFiscalApi('/status'),
      fetchCashierApi(`/sessions${buildCashierHistoryQuery()}`),
      fetchFiscalApi('/events?limit=80'),
    ]);
    STATE.cashier.summary = summary;
    STATE.cashier.fiscalStatus = fiscalStatus;
    STATE.cashier.closedSessions = Array.isArray(sessions?.sessions) ? sessions.sessions : [];
    STATE.cashier.fiscalEvents = Array.isArray(events?.events)
      ? events.events
      : (Array.isArray(summary?.recentFiscalEvents) ? summary.recentFiscalEvents : []);
    if (STATE.currentPage === 'cashier') renderCashier();
    refreshAllBadges();
    fetchFiscalApi('/sefaz-status')
      .then((sefazStatus) => {
        STATE.cashier.sefazStatus = sefazStatus;
        if (STATE.currentPage === 'cashier' || STATE.currentPage === 'sefaz') {
          renderSefazStatusPanels();
        }
      })
      .catch((error) => {
        STATE.cashier.sefazStatus = {
          ok: false,
          reachable: false,
          status: 'offline',
          emissionMode: STATE.fiscal?.offlinePreValidation === false ? 'blocked' : 'prevalidated',
          checkedAt: new Date().toISOString(),
          message: String(error?.message || 'Nao foi possivel consultar a SEFAZ.'),
        };
        if (STATE.currentPage === 'cashier' || STATE.currentPage === 'sefaz') {
          renderSefazStatusPanels();
        }
      });
    if (!silent && STATE.currentPage === 'cashier') {
      showToast('Caixa atualizado.', 'success', 1700);
    }
  } catch (error) {
    console.error('Falha ao carregar caixa.', error);
    if (!silent) showToast(String(error?.message || 'Nao foi possivel carregar o caixa.'), 'error', 3600);
  } finally {
    STATE.cashier.loading = false;
  }
}

function getCashierSummary() {
  return STATE.cashier.summary || {
    activeSession: null,
    today: { sales: 0, net: 0, count: 0, byPayment: {} },
    recentMovements: [],
    recentFiscalDocuments: [],
    fiscalDocumentsTotal: 0,
  };
}

function getCashierFiscalDocs() {
  const summary = getCashierSummary();
  return Array.isArray(summary.recentFiscalDocuments) ? summary.recentFiscalDocuments : [];
}

function getCashierOrderFiscalDoc(orderId) {
  const id = String(orderId ?? '');
  const order = (STATE.orderLogs || []).find((item) => String(item?.id ?? '') === id);
  return order?.latestFiscalDocument
    || getCashierFiscalDocs().find((doc) => String(doc?.orderId ?? '') === id)
    || null;
}

function getFiscalDocumentByIdFromState(documentId) {
  const id = String(documentId ?? '');
  const recent = getCashierFiscalDocs().find((doc) => String(doc?.id ?? '') === id);
  if (recent) return recent;
  return (STATE.orderLogs || [])
    .map((order) => order?.latestFiscalDocument)
    .find((doc) => String(doc?.id ?? '') === id) || null;
}

function getFiscalDocumentStatusLabel(status) {
  const labels = {
    draft: 'Pre-validada',
    prevalidated: 'Pre-validada',
    authorized: 'Autorizada',
    processing: 'Processando',
    cancel_pending: 'Cancelamento pendente',
    rejected: 'Rejeitada',
    cancelled: 'Cancelada',
    error: 'Erro',
  };
  return labels[String(status || '').toLowerCase()] || String(status || 'Pre-validada');
}

function getFiscalDocumentStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'authorized') return 'active';
  if (normalized === 'processing' || normalized === 'cancel_pending') return 'featured';
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'error') return 'inactive';
  return 'featured';
}

function getFiscalDocumentActionState(status) {
  const normalized = String(status || '').toLowerCase();
  return {
    canTransmit: ['prevalidated', 'rejected', 'error', 'processing'].includes(normalized),
    transmitLabel: normalized === 'processing' ? 'Consultar' : 'Enviar',
    canCancel: ['draft', 'prevalidated', 'rejected', 'error', 'authorized'].includes(normalized),
  };
}

function getFiscalDocumentPrintableCode(doc) {
  const type = String(doc?.documentType || 'nfce').toUpperCase();
  const series = String(doc?.series || '').trim();
  const number = String(doc?.number || '').trim();
  if (series && number) return `${type} ${series}/${number}`;
  if (number) return `${type} ${number}`;
  return `${type} #${doc?.id || ''}`;
}

function isCashierOrderPaid(order) {
  return String(order?.cashier?.status || '').toLowerCase() === 'paid';
}

function isCashierOrderRefunded(order) {
  return String(order?.cashier?.status || '').toLowerCase() === 'refunded';
}

function getCashierPermissionState() {
  return STATE.cashier.fiscalStatus?.cashierPermissions
    || STATE.fiscal?.cashierPermissions
    || DEMO_FISCAL.cashierPermissions;
}

function cashierActionNeedsManager(action) {
  const permissions = getCashierPermissionState();
  if (!permissions?.operatorLockEnabled) return false;
  if (action === 'refund') return permissions.requireManagerForRefund !== false;
  if (action === 'fiscal-config') return permissions.requireManagerForFiscalConfig !== false;
  if (action === 'fiscal-transmit') return permissions.requireManagerForFiscalTransmit !== false;
  if (action === 'fiscal-event') return permissions.requireManagerForFiscalEvents !== false;
  if (action === 'cash-close') return Boolean(permissions.requireManagerForClose);
  return false;
}

function getManagerPinForAction(action) {
  if (!cashierActionNeedsManager(action)) return '';
  const fromCashier = getVal('cashierManagerPin').trim();
  const fromFiscal = getVal('fiscalManagerActionPin').trim();
  return fromCashier || fromFiscal || '';
}

function getCashierOrdersForView() {
  const logs = Array.isArray(STATE.orderLogs) ? STATE.orderLogs : [];
  ensureCashierOrdersDateFilters();
  const dateFrom = STATE.cashier.ordersDateFrom;
  const dateTo = STATE.cashier.ordersDateTo;
  return logs.filter((order) => {
    if (isOrderPendingConfirmation(order)) return false;
    const dateKey = getOrderLogDateKey(order);
    if (dateFrom && (!dateKey || dateKey < dateFrom)) return false;
    if (dateTo && (!dateKey || dateKey > dateTo)) return false;
    return true;
  });
}

function ensureCashierOrdersDateFilters() {
  if (!STATE.cashier.ordersDateInitialized) {
    const today = getLocalDateISO(new Date());
    STATE.cashier.ordersDateFrom = today;
    STATE.cashier.ordersDateTo = today;
    STATE.cashier.ordersDateInitialized = true;
  }
  const dateFromInput = document.getElementById('cashierOrdersDateFrom');
  const dateToInput = document.getElementById('cashierOrdersDateTo');
  if (dateFromInput && dateFromInput.value !== STATE.cashier.ordersDateFrom) {
    dateFromInput.value = STATE.cashier.ordersDateFrom;
  }
  if (dateToInput && dateToInput.value !== STATE.cashier.ordersDateTo) {
    dateToInput.value = STATE.cashier.ordersDateTo;
  }
}

async function setCashierOrdersDateFilter() {
  const dateFrom = getVal('cashierOrdersDateFrom').trim();
  const dateTo = getVal('cashierOrdersDateTo').trim();
  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('A data inicial nao pode ser posterior a data final.', 'error', 3200);
    return;
  }
  STATE.cashier.ordersDateInitialized = true;
  STATE.cashier.ordersDateFrom = isIsoDate(dateFrom) ? dateFrom : '';
  STATE.cashier.ordersDateTo = isIsoDate(dateTo) ? dateTo : '';
  await refreshCashierOrders(true);
}

async function showCashierOrdersToday() {
  const today = getLocalDateISO(new Date());
  STATE.cashier.ordersDateInitialized = true;
  STATE.cashier.ordersDateFrom = today;
  STATE.cashier.ordersDateTo = today;
  ensureCashierOrdersDateFilters();
  await refreshCashierOrders(true);
}

async function clearCashierOrdersDateFilter() {
  STATE.cashier.ordersDateInitialized = true;
  STATE.cashier.ordersDateFrom = '';
  STATE.cashier.ordersDateTo = '';
  ensureCashierOrdersDateFilters();
  await refreshCashierOrders(true);
}

async function refreshCashierOrders(silent = false) {
  await loadOrderLogs(true);
  if (STATE.currentPage === 'cashier') renderCashierOrders();
  if (!silent) showToast('Pedidos do caixa atualizados.', 'success', 1700);
}

function getFiscalEnvironmentFormConfig(fiscal = {}, environment = fiscal?.environment) {
  const safeEnvironment = String(environment || '').trim().toLowerCase() === 'producao'
    ? 'producao'
    : 'homologacao';
  const environments = fiscal?.environments && typeof fiscal.environments === 'object'
    && !Array.isArray(fiscal.environments)
    ? fiscal.environments
    : {};
  const scoped = environments[safeEnvironment] && typeof environments[safeEnvironment] === 'object'
    && !Array.isArray(environments[safeEnvironment])
    ? environments[safeEnvironment]
    : {};
  const legacy = String(fiscal?.environment || '').trim().toLowerCase() === safeEnvironment
    ? fiscal
    : {};
  const value = (key, fallback = '') => (
    Object.hasOwn(scoped, key) ? scoped[key] : (legacy[key] ?? fallback)
  );
  return {
    cscId: String(value('cscId', '') || '').trim(),
    csc: String(value('csc', '') || '').trim(),
    cscConfigured: Boolean(value('cscConfigured', false)),
    seriesNfce: String(value('seriesNfce', '1') || '1').trim(),
    nextNumberNfce: String(value('nextNumberNfce', '') || '').trim(),
    seriesNfe: String(value('seriesNfe', '1') || '1').trim(),
    nextNumberNfe: String(value('nextNumberNfe', '') || '').trim(),
    numberingConfirmed: safeEnvironment === 'homologacao'
      || Boolean(value('numberingConfirmed', false)),
  };
}

function loadFiscalEnvironmentFields(environment = getVal('fiscalEnvironment')) {
  const f = mergeObjectDefaults(DEMO_FISCAL, STATE.fiscal || {});
  const scoped = getFiscalEnvironmentFormConfig(f, environment);
  setVal('fiscalSeriesNfce', scoped.seriesNfce || '1');
  setVal('fiscalNextNumberNfce', scoped.nextNumberNfce || '');
  setVal('fiscalSeriesNfe', scoped.seriesNfe || '1');
  setVal('fiscalNextNumberNfe', scoped.nextNumberNfe || '');
  setVal('fiscalCscId', scoped.cscId || '');
  setVal('fiscalCsc', scoped.csc || '');
  const cscInput = document.getElementById('fiscalCsc');
  if (cscInput) {
    cscInput.placeholder = scoped.cscConfigured
      ? 'Configurado — deixe em branco para manter'
      : '';
  }
  setVal('fiscalInutilizationSeries', scoped.seriesNfce || '1');
}

function handleFiscalEnvironmentChange() {
  loadFiscalEnvironmentFields(getVal('fiscalEnvironment'));
}

function loadFiscalForm() {
  const f = mergeObjectDefaults(DEMO_FISCAL, STATE.fiscal || {});
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  };
  setChecked('fiscalEnabled', f.enabled);
  setChecked('fiscalTransmitEnabled', f.transmitEnabled);
  setChecked('fiscalOfflinePreValidation', f.offlinePreValidation !== false);
  setVal('fiscalDocumentType', f.documentType || 'nfce');
  setVal('fiscalEnvironment', f.environment || 'homologacao');
  setVal('fiscalSefazStatusUrl', f.sefazStatusUrl || '');
  setVal('fiscalUf', f.uf || 'SP');
  setVal('fiscalCnpj', f.cnpj || '');
  setVal('fiscalIe', f.ie || '');
  setVal('fiscalIm', f.im || '');
  setVal('fiscalCorporateName', f.corporateName || '');
  setVal('fiscalTradeName', f.tradeName || '');
  setVal('fiscalCrt', f.crt || '1');
  setVal('fiscalCityCode', f.cityCode || '');
  setVal('fiscalCnae', f.cnae || '');
  setVal('fiscalAddressStreet', f.addressStreet || STATE.config?.street || '');
  setVal('fiscalAddressNumber', f.addressNumber || STATE.config?.number || '');
  setVal('fiscalAddressNeighborhood', f.addressNeighborhood || STATE.config?.neighborhood || '');
  setVal('fiscalAddressCity', f.addressCity || STATE.config?.city || '');
  setVal('fiscalAddressUf', f.addressUf || f.uf || STATE.config?.state || '');
  setVal('fiscalAddressCep', f.addressCep || STATE.config?.cep || '');
  setVal('fiscalAddressPhone', f.addressPhone || STATE.config?.phone || STATE.config?.whatsapp || '');
  setVal('fiscalNatureOperation', f.natureOperation || 'Venda de mercadoria');
  loadFiscalEnvironmentFields(f.environment || 'homologacao');
  const productionEnvironment = getFiscalEnvironmentFormConfig(f, 'producao');
  setChecked('fiscalProductionNumberingConfirmed', productionEnvironment.numberingConfirmed);
  setVal('fiscalCertificatePath', f.certificatePath || '');
  setVal('fiscalCertificatePassword', f.certificatePassword || '');
  const certificatePasswordInput = document.getElementById('fiscalCertificatePassword');
  if (certificatePasswordInput) {
    certificatePasswordInput.placeholder = f.certificatePasswordConfigured
      ? 'Configurada — deixe em branco para manter'
      : '';
  }
  setVal('fiscalDefaultCfop', f.defaultCfop || '');
  setVal('fiscalDefaultNcm', f.defaultNcm || '');
  setVal('fiscalDefaultCest', f.defaultCest || '');
  setVal('fiscalDefaultCsosn', f.defaultCsosn || '');
  setVal('fiscalDefaultOrigin', f.defaultOrigin || '0');
  setVal('fiscalDefaultUnit', f.defaultUnit || 'UN');
  setVal('fiscalDefaultAliquotaIcms', f.defaultAliquotaIcms ?? 0);
  const deliveryFiscal = mergeObjectDefaults(DEMO_FISCAL.deliveryFiscal, f.deliveryFiscal || {});
  setVal('fiscalDeliveryCode', deliveryFiscal.fiscalCode || deliveryFiscal.code || 'ENTREGA');
  setVal('fiscalDeliveryName', deliveryFiscal.fiscalName || deliveryFiscal.name || 'Taxa de entrega');
  setVal('fiscalDeliveryNcm', deliveryFiscal.ncm || '');
  setVal('fiscalDeliveryCest', deliveryFiscal.cest || '');
  setVal('fiscalDeliveryCfop', deliveryFiscal.cfop || '');
  setVal('fiscalDeliveryCsosn', deliveryFiscal.csosn || '');
  setVal('fiscalDeliveryCst', deliveryFiscal.cst || '');
  setVal('fiscalDeliveryOrigin', deliveryFiscal.origin || '');
  setVal('fiscalDeliveryUnit', deliveryFiscal.unit || 'UN');
  setVal('fiscalDeliveryAliquotaIcms', deliveryFiscal.aliquotaIcms ?? 0);
  setVal('fiscalDeliveryPisCst', productTaxCst(deliveryFiscal.pisCst, ''));
  setVal('fiscalDeliveryCofinsCst', productTaxCst(deliveryFiscal.cofinsCst, ''));
  setChecked('fiscalDeliveryReviewRequired', deliveryFiscal.fiscalReviewRequired === true);
  const permissions = mergeObjectDefaults(DEMO_FISCAL.cashierPermissions, f.cashierPermissions || {});
  setChecked('fiscalOperatorLockEnabled', permissions.operatorLockEnabled);
  setChecked('fiscalRequireManagerRefund', permissions.requireManagerForRefund !== false);
  setChecked('fiscalRequireManagerFiscalConfig', permissions.requireManagerForFiscalConfig !== false);
  setChecked('fiscalRequireManagerFiscalTransmit', permissions.requireManagerForFiscalTransmit !== false);
  setChecked('fiscalRequireManagerFiscalEvents', permissions.requireManagerForFiscalEvents !== false);
  setChecked('fiscalRequireManagerClose', Boolean(permissions.requireManagerForClose));
  setVal('fiscalManagerPin', permissions.managerPin || '');
  const managerPinInput = document.getElementById('fiscalManagerPin');
  if (managerPinInput) {
    managerPinInput.placeholder = permissions.managerPinConfigured
      ? 'Configurado — deixe em branco para manter'
      : '';
  }
  setVal('fiscalManagerActionPin', '');
  const contingency = mergeObjectDefaults(DEMO_FISCAL.contingency, f.contingency || {});
  setChecked('fiscalContingencyEnabled', contingency.enabled);
  setVal('fiscalContingencyMode', contingency.mode || 'offline');
  setVal('fiscalContingencyReason', contingency.reason || '');
}

function collectFiscalForm() {
  const environment = getVal('fiscalEnvironment') || 'homologacao';
  const currentEnvironments = STATE.fiscal?.environments
    && typeof STATE.fiscal.environments === 'object'
    && !Array.isArray(STATE.fiscal.environments)
    ? STATE.fiscal.environments
    : {};
  const currentEnvironment = currentEnvironments[environment]
    && typeof currentEnvironments[environment] === 'object'
    && !Array.isArray(currentEnvironments[environment])
    ? currentEnvironments[environment]
    : {};
  const productionNumberingConfirmed = Boolean(
    document.getElementById('fiscalProductionNumberingConfirmed')?.checked,
  );
  const environments = {
    ...currentEnvironments,
    [environment]: {
      ...currentEnvironment,
      cscId: getVal('fiscalCscId').trim(),
      csc: getVal('fiscalCsc').trim(),
      seriesNfce: getVal('fiscalSeriesNfce').trim() || '1',
      nextNumberNfce: getVal('fiscalNextNumberNfce').trim(),
      seriesNfe: getVal('fiscalSeriesNfe').trim() || '1',
      nextNumberNfe: getVal('fiscalNextNumberNfe').trim(),
      numberingConfirmed: environment === 'homologacao' ? true : productionNumberingConfirmed,
    },
  };
  if (environment !== 'producao') {
    environments.producao = {
      ...(currentEnvironments.producao || {}),
      numberingConfirmed: productionNumberingConfirmed,
    };
  }
  return {
    ...STATE.fiscal,
    enabled: Boolean(document.getElementById('fiscalEnabled')?.checked),
    transmitEnabled: Boolean(document.getElementById('fiscalTransmitEnabled')?.checked),
    offlinePreValidation: document.getElementById('fiscalOfflinePreValidation')
      ? Boolean(document.getElementById('fiscalOfflinePreValidation')?.checked)
      : STATE.fiscal?.offlinePreValidation !== false,
    documentType: getVal('fiscalDocumentType') || 'nfce',
    environment,
    environments,
    productionNumberingConfirmed,
    sefazStatusUrl: getVal('fiscalSefazStatusUrl').trim(),
    uf: getVal('fiscalUf').trim().toUpperCase().slice(0, 2),
    cnpj: getVal('fiscalCnpj').replace(/\D+/g, '').slice(0, 14),
    ie: getVal('fiscalIe').trim(),
    im: getVal('fiscalIm').trim(),
    corporateName: getVal('fiscalCorporateName').trim(),
    tradeName: getVal('fiscalTradeName').trim(),
    crt: getVal('fiscalCrt') || '1',
    cityCode: getVal('fiscalCityCode').replace(/\D+/g, '').slice(0, 7),
    cnae: getVal('fiscalCnae').replace(/\D+/g, '').slice(0, 12),
    addressStreet: getVal('fiscalAddressStreet').trim(),
    addressNumber: getVal('fiscalAddressNumber').trim(),
    addressNeighborhood: getVal('fiscalAddressNeighborhood').trim(),
    addressCity: getVal('fiscalAddressCity').trim(),
    addressUf: getVal('fiscalAddressUf').trim().toUpperCase().slice(0, 2),
    addressCep: getVal('fiscalAddressCep').replace(/\D+/g, '').slice(0, 8),
    addressPhone: getVal('fiscalAddressPhone').replace(/\D+/g, '').slice(0, 14),
    natureOperation: getVal('fiscalNatureOperation').trim() || 'Venda de mercadoria',
    seriesNfce: getVal('fiscalSeriesNfce').trim() || '1',
    nextNumberNfce: getVal('fiscalNextNumberNfce').trim() || '1',
    seriesNfe: getVal('fiscalSeriesNfe').trim() || '1',
    nextNumberNfe: getVal('fiscalNextNumberNfe').trim() || '1',
    cscId: getVal('fiscalCscId').trim(),
    csc: getVal('fiscalCsc').trim(),
    certificatePath: getVal('fiscalCertificatePath').trim(),
    certificatePassword: getVal('fiscalCertificatePassword'),
    defaultCfop: getVal('fiscalDefaultCfop').replace(/\D+/g, '').slice(0, 4),
    defaultNcm: getVal('fiscalDefaultNcm').replace(/\D+/g, '').slice(0, 8),
    defaultCest: getVal('fiscalDefaultCest').replace(/\D+/g, '').slice(0, 7),
    defaultCsosn: getVal('fiscalDefaultCsosn').trim(),
    defaultOrigin: getVal('fiscalDefaultOrigin').trim() || '0',
    defaultUnit: (getVal('fiscalDefaultUnit').trim() || 'UN').toUpperCase(),
    defaultAliquotaIcms: parseFloat(getVal('fiscalDefaultAliquotaIcms')) || 0,
    deliveryFiscal: {
      ...(STATE.fiscal?.deliveryFiscal || {}),
      fiscalCode: productFiscalCode(getVal('fiscalDeliveryCode')) || 'ENTREGA',
      fiscalName: getVal('fiscalDeliveryName').trim() || 'Taxa de entrega',
      ncm: productDigits(getVal('fiscalDeliveryNcm'), 8),
      cest: productDigits(getVal('fiscalDeliveryCest'), 7),
      cfop: productDigits(getVal('fiscalDeliveryCfop'), 4),
      csosn: getVal('fiscalDeliveryCsosn').trim(),
      cst: getVal('fiscalDeliveryCst').trim(),
      origin: getVal('fiscalDeliveryOrigin').trim(),
      unit: (getVal('fiscalDeliveryUnit').trim() || 'UN').toUpperCase(),
      aliquotaIcms: parseFloat(getVal('fiscalDeliveryAliquotaIcms')) || 0,
      pisCst: productTaxCst(getVal('fiscalDeliveryPisCst'), ''),
      cofinsCst: productTaxCst(getVal('fiscalDeliveryCofinsCst'), ''),
      fiscalReviewRequired: Boolean(
        document.getElementById('fiscalDeliveryReviewRequired')?.checked,
      ),
    },
    cashierPermissions: {
      ...(STATE.fiscal?.cashierPermissions || {}),
      operatorLockEnabled: Boolean(document.getElementById('fiscalOperatorLockEnabled')?.checked),
      managerPin: getVal('fiscalManagerPin').trim(),
      requireManagerForRefund: document.getElementById('fiscalRequireManagerRefund')
        ? Boolean(document.getElementById('fiscalRequireManagerRefund')?.checked)
        : true,
      requireManagerForFiscalConfig: document.getElementById('fiscalRequireManagerFiscalConfig')
        ? Boolean(document.getElementById('fiscalRequireManagerFiscalConfig')?.checked)
        : true,
      requireManagerForFiscalTransmit: document.getElementById('fiscalRequireManagerFiscalTransmit')
        ? Boolean(document.getElementById('fiscalRequireManagerFiscalTransmit')?.checked)
        : true,
      requireManagerForFiscalEvents: document.getElementById('fiscalRequireManagerFiscalEvents')
        ? Boolean(document.getElementById('fiscalRequireManagerFiscalEvents')?.checked)
        : true,
      requireManagerForClose: Boolean(document.getElementById('fiscalRequireManagerClose')?.checked),
    },
    contingency: {
      ...(STATE.fiscal?.contingency || {}),
      enabled: Boolean(document.getElementById('fiscalContingencyEnabled')?.checked),
      mode: getVal('fiscalContingencyMode') || 'offline',
      reason: getVal('fiscalContingencyReason').trim(),
    },
    _managerPin: getVal('fiscalManagerActionPin').trim(),
  };
}

async function saveFiscalSettings() {
  const formState = collectFiscalForm();
  const permissions = formState?.cashierPermissions || {};
  const managerPin = String(permissions.managerPin || '').trim();
  const operatorLock = Boolean(permissions.operatorLockEnabled);
  const pinConfigured = Boolean(STATE.fiscal?.cashierPermissions?.managerPinConfigured);

  if (managerPin && !/^\d{4,12}$/.test(managerPin)) {
    showToast('O PIN do gerente deve conter de 4 a 12 digitos numericos.', 'error');
    document.getElementById('fiscalManagerPin')?.focus();
    return;
  }
  if (operatorLock && !managerPin && !pinConfigured) {
    showToast('Configure um PIN do gerente antes de ativar o bloqueio do operador.', 'error');
    document.getElementById('fiscalManagerPin')?.focus();
    return;
  }

  STATE.fiscal = formState;
  const saveResult = await saveToLS(LS.fiscal, STATE.fiscal);
  delete STATE.fiscal._managerPin;
  const feedback = resolveSaveFeedback(saveResult, 'Configuracoes fiscais salvas.');
  showToast(feedback.message, feedback.type);
  await refreshSefazStatus(true);
  await loadCashier(true);
  if (STATE.currentPage === 'sefaz') {
    loadFiscalForm();
    renderFiscalStatus();
    renderSefazStatusPanels();
  }
}

function getSefazStatusLabel(status) {
  const labels = {
    online: 'Online',
    offline: 'Offline',
    timeout: 'Timeout',
    unstable: 'Instavel',
    unknown: 'Nao verificado',
  };
  return labels[String(status || '').toLowerCase()] || 'Nao verificado';
}

function getSefazStatusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'online') return 'active';
  if (normalized === 'offline' || normalized === 'timeout') return 'inactive';
  if (normalized === 'unstable') return 'featured';
  return 'no';
}

function getEmissionModeLabel(status) {
  const mode = String(status?.emissionMode || '').toLowerCase();
  if (mode === 'online') return 'Normal';
  if (mode === 'prevalidated') return 'Pre-validacao local';
  if (mode === 'blocked') return 'Bloqueada';
  return status?.canPreValidate ? 'Pre-validacao local' : 'Aguardando';
}

function getSefazCheckedAtLabel(value) {
  if (!value) return 'Ainda nao verificado';
  return formatOrderLogDate(value) || String(value);
}

function renderSefazStatusPanels() {
  const status = STATE.cashier.sefazStatus || {};
  const fiscalStatus = STATE.cashier.fiscalStatus || {};
  const statusLabel = getSefazStatusLabel(status.status);
  const badgeClass = getSefazStatusBadgeClass(status.status);
  const environment = status.environment || STATE.fiscal?.environment || 'homologacao';
  const canPreValidate = status.canPreValidate ?? Boolean(fiscalStatus.readyForDraft && STATE.fiscal?.offlinePreValidation !== false);
  const offlinePreValidation = status.offlinePreValidation ?? (STATE.fiscal?.offlinePreValidation !== false);
  const url = status.url || STATE.fiscal?.sefazStatusUrl || 'Padrao da UF';
  const message = status.message || 'Verifique o status antes de emitir notas.';
  const checkedAt = getSefazCheckedAtLabel(status.checkedAt);
  const latency = Number.isFinite(Number(status.latencyMs)) && Number(status.latencyMs) > 0
    ? `${Number(status.latencyMs)} ms`
    : '--';
  const modeLabel = getEmissionModeLabel({
    ...status,
    canPreValidate,
  });
  const modeClass = String(status.emissionMode || '').toLowerCase() === 'blocked' ? 'inactive' : 'active';
  const transmissionEnabled = Boolean(fiscalStatus.transmissionEnabled);
  const html = `
    <div class="sefaz-status-item">
      <span>SEFAZ</span>
      <strong><span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span></strong>
      <p>${escapeHtml(message)}</p>
    </div>
    <div class="sefaz-status-item">
      <span>Emissao</span>
      <strong><span class="badge ${modeClass}">${escapeHtml(modeLabel)}</span></strong>
      <p>${offlinePreValidation ? 'Pre-validacao local liberada quando estiver sem SEFAZ.' : 'Pre-validacao local desativada.'}</p>
    </div>
    <div class="sefaz-status-item">
      <span>Envio SEFAZ</span>
      <strong><span class="badge ${transmissionEnabled ? 'active' : 'inactive'}">${transmissionEnabled ? 'Liberado' : 'Bloqueado'}</span></strong>
      <p>${transmissionEnabled ? 'O botao Enviar pode transmitir notas.' : 'Pronto para conferencia, sem transmitir notas.'}</p>
    </div>
    <div class="sefaz-status-item">
      <span>Ambiente</span>
      <strong>${escapeHtml(environment === 'producao' ? 'Producao' : 'Homologacao')}</strong>
      <p>Documento: ${escapeHtml(String(STATE.fiscal?.documentType || 'nfce').toUpperCase())}</p>
    </div>
    <div class="sefaz-status-item">
      <span>Ultima verificacao</span>
      <strong>${escapeHtml(checkedAt)}</strong>
      <p>Resposta: ${escapeHtml(latency)}${status.httpStatus ? ` | HTTP ${escapeHtml(String(status.httpStatus))}` : ''}</p>
    </div>
  `;

  const sefazPanel = document.getElementById('sefazStatusPanel');
  if (sefazPanel) {
    sefazPanel.innerHTML = `${html}
      <div class="sefaz-status-item">
        <span>URL monitorada</span>
        <strong>${escapeHtml(url)}</strong>
        <p>${status.configuredUrl ? 'URL definida manualmente.' : 'URL padrao aplicada pelo sistema.'}</p>
      </div>`;
  }

  const cashierPanel = document.getElementById('cashierSefazStatus');
  if (cashierPanel) cashierPanel.innerHTML = html;
}

async function refreshSefazStatus(silent = false) {
  try {
    const [fiscalStatus, sefazStatus] = await Promise.all([
      fetchFiscalApi('/status'),
      fetchFiscalApi('/sefaz-status'),
    ]);
    STATE.cashier.fiscalStatus = fiscalStatus;
    STATE.cashier.sefazStatus = sefazStatus;
    renderFiscalStatus();
    renderSefazStatusPanels();
    if (!silent) {
      const type = sefazStatus.reachable ? 'success' : 'error';
      showToast(sefazStatus.message || 'Status SEFAZ atualizado.', type, 3600);
    }
    return sefazStatus;
  } catch (error) {
    STATE.cashier.sefazStatus = {
      ok: false,
      reachable: false,
      status: 'offline',
      emissionMode: STATE.fiscal?.offlinePreValidation === false ? 'blocked' : 'prevalidated',
      checkedAt: new Date().toISOString(),
      message: String(error?.message || 'Nao foi possivel verificar a SEFAZ.'),
    };
    renderSefazStatusPanels();
    if (!silent) showToast(STATE.cashier.sefazStatus.message, 'error', 4200);
    return STATE.cashier.sefazStatus;
  }
}

async function loadSefazSettings(silent = true) {
  loadFiscalForm();
  renderFiscalStatus();
  renderSefazStatusPanels();
  await refreshSefazStatus(silent);
}

function renderFiscalStatus() {
  const target = document.getElementById('cashierFiscalStatus');
  if (!target) return;
  const status = STATE.cashier.fiscalStatus;
  if (!status) {
    target.innerHTML = '<div class="empty-state-sm">Status fiscal nao carregado.</div>';
    return;
  }
  const reqs = Array.isArray(status.requirements) ? status.requirements : [];
  const reqHtml = reqs.map((item) => `
    <div class="fiscal-req ${item.ok ? 'ok' : 'missing'}">
      <span>${escapeHtml(item.label || item.key)}</span>
      <strong>${item.ok ? 'OK' : 'Pendente'}</strong>
    </div>
  `).join('');
  target.innerHTML = `
    <div class="cashier-fiscal-head">
      <span class="badge ${status.readyForDraft ? 'active' : 'inactive'}">${status.readyForDraft ? 'Pre-validacao OK' : 'Config pendente'}</span>
      <span class="badge ${status.configuredForSefaz ? 'active' : 'inactive'}">${status.configuredForSefaz ? 'SEFAZ configurada' : 'SEFAZ pendente'}</span>
      <span class="badge ${status.transmissionEnabled ? 'active' : 'inactive'}">${status.transmissionEnabled ? 'Envio liberado' : 'Envio bloqueado'}</span>
      <span class="badge ${status.offlinePreValidation ? 'active' : 'inactive'}">${status.offlinePreValidation ? 'Offline liberado' : 'Offline bloqueado'}</span>
    </div>
    <p class="cashier-muted">${escapeHtml(status.message || '')}</p>
    <div class="fiscal-req-list">${reqHtml}</div>
  `;
}

function renderCashierSessionPanel() {
  const target = document.getElementById('cashierSessionPanel');
  if (!target) return;
  const summary = getCashierSummary();
  const active = summary.activeSession;
  const movementBtn = document.getElementById('cashierMovementBtn');
  if (movementBtn) movementBtn.disabled = !active;

  if (!active) {
    target.innerHTML = `
      <div class="cashier-session-state closed">
        <span class="badge inactive">Fechado</span>
        <p>Abra o caixa para receber pedidos, registrar sangria ou suprimento.</p>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Valor inicial</label>
          <input type="number" id="cashierOpeningAmount" min="0" step="0.01" value="0" />
        </div>
        <div class="form-group">
          <label>Operador</label>
          <input type="text" id="cashierOperator" placeholder="Admin" />
        </div>
      </div>
      <div class="form-group">
        <label>Observacao</label>
        <input type="text" id="cashierOpenNotes" placeholder="Ex: abertura do turno" />
      </div>
      <button class="btn-primary" type="button" onclick="openCashSession()">Abrir Caixa</button>
    `;
    return;
  }

  const totals = active.totals || {};
  const expectedAmount = Number(active.expectedAmount ?? (
    Number(active.openingAmount || 0) + Number(totals.cashDrawerNet ?? totals.net ?? 0)
  ));
  const managerPinHtml = getCashierPermissionState()?.operatorLockEnabled
    ? `
      <div class="form-group">
        <label>PIN gerente</label>
        <input type="password" id="cashierManagerPin" placeholder="Para estorno, fechamento ou fiscal" autocomplete="off" />
      </div>
    `
    : '';

  target.innerHTML = `
    <div class="cashier-session-state open">
      <span class="badge active">Aberto</span>
      <strong>#${escapeHtml(active.id)} - ${escapeHtml(active.operator || 'Admin')}</strong>
      <small>Aberto em ${escapeHtml(formatOrderLogDate(active.openedAt))}</small>
    </div>
    <div class="cashier-session-totals">
      <div><span>Inicial</span><strong>${formatCurrency(active.openingAmount || 0)}</strong></div>
      <div><span>Vendas</span><strong>${formatCurrency(totals.sales || 0)}</strong></div>
      <div><span>Estornos</span><strong>${formatCurrency(totals.refunds || 0)}</strong></div>
      <div><span>Suprimentos</span><strong>${formatCurrency(totals.supplies || 0)}</strong></div>
      <div><span>Sangrias</span><strong>${formatCurrency(totals.withdrawals || 0)}</strong></div>
      <div><span>Esperado</span><strong>${formatCurrency(expectedAmount)}</strong></div>
    </div>
    ${buildCashierPaymentBreakdownHtml(totals)}
    <div class="form-row">
      <div class="form-group">
        <label>Valor contado</label>
        <input type="number" id="cashierClosingAmount" min="0" step="0.01" value="${Number(expectedAmount || 0).toFixed(2)}" />
      </div>
      <div class="form-group">
        <label>Observacao</label>
        <input type="text" id="cashierCloseNotes" placeholder="Fechamento do turno" />
      </div>
      ${managerPinHtml}
    </div>
    <div class="cashier-session-actions">
      <button class="btn-outline" type="button" onclick="printCashierClosingReport()">Imprimir Fechamento</button>
      <button class="btn-danger-outline" type="button" onclick="closeCashSession()">Fechar Caixa</button>
    </div>
  `;
}

function renderCashierOrders() {
  const tbody = document.getElementById('cashierOrdersTableBody');
  const empty = document.getElementById('cashierOrdersEmpty');
  const emptyText = document.getElementById('cashierOrdersEmptyText');
  if (!tbody || !empty) return;
  const active = getCashierSummary().activeSession;
  const orders = getCashierOrdersForView();
  setText('cashierOrdersCount', `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`);
  if (!orders.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    if (emptyText) {
      const dateFrom = STATE.cashier.ordersDateFrom;
      const dateTo = STATE.cashier.ordersDateTo;
      if (dateFrom && dateTo && dateFrom === dateTo) {
        emptyText.textContent = `Nenhum pedido em ${new Date(`${dateFrom}T00:00:00`).toLocaleDateString('pt-BR')}.`;
      } else if (dateFrom || dateTo) {
        emptyText.textContent = 'Nenhum pedido encontrado no periodo informado.';
      } else {
        emptyText.textContent = 'Nenhum pedido para mostrar.';
      }
    }
    return;
  }
  empty.style.display = 'none';
  if (emptyText) emptyText.textContent = 'Nenhum pedido para mostrar.';
  tbody.innerHTML = orders.map((order) => {
    const idLiteral = toInlineJsStringLiteral(order?.id);
    const paid = isCashierOrderPaid(order);
    const refunded = isCashierOrderRefunded(order);
    const fiscalDoc = getCashierOrderFiscalDoc(order?.id);
    const fiscalReady = Boolean(STATE.cashier.fiscalStatus?.readyForDraft);
    const transmitReady = Boolean(STATE.cashier.fiscalStatus?.transmissionEnabled);
    const total = Number(order?.totals?.total || 0);
    const canReceive = Boolean(active) && (!paid || refunded);
    const canRefund = Boolean(active) && paid && !refunded;
    const receiveDisabled = canReceive ? '' : ' disabled';
    const receiveTitle = !active
      ? ' title="Abra o caixa para receber"'
      : paid && !refunded
        ? ' title="Pedido ja recebido"'
        : '';
    const receiveLabel = refunded ? 'Receber novamente' : 'Receber';
    const cashierStatusLabel = refunded ? 'Estornado' : paid ? 'Recebido' : 'Aberto';
    const cashierStatusClass = refunded ? 'inactive' : paid ? 'active' : 'no';
    const fiscalDisabled = fiscalDoc || !fiscalReady ? ' disabled' : '';
    const fiscalTitle = fiscalReady
      ? ' title="Criar nota pre-validada local"'
      : ' title="Configure a SEFAZ antes de criar a nota pre-validada"';
    const fiscalDocIdLiteral = fiscalDoc ? toInlineJsStringLiteral(fiscalDoc.id) : '';
    const fiscalActionState = getFiscalDocumentActionState(fiscalDoc?.status);
    const fiscalTransmitAction = fiscalDoc && fiscalActionState.canTransmit
      ? `<button class="btn-outline sm" type="button" onclick="transmitFiscalDocument(${fiscalDocIdLiteral})"${transmitReady ? '' : ' disabled title="Envio SEFAZ bloqueado no admin"'}>${fiscalActionState.transmitLabel}</button>`
      : '';
    const fiscalCancelAction = fiscalDoc && fiscalActionState.canCancel
      ? `<button class="btn-danger-outline sm" type="button" onclick="cancelFiscalDocument(${fiscalDocIdLiteral})">Cancelar</button>`
      : '';
    const isNfe55 = fiscalDoc && fiscalDoc.documentType === 'nfe';
    const fiscalBadgeLabel = fiscalDoc
      ? (isNfe55 ? `NF-e 55: ${getFiscalDocumentStatusLabel(fiscalDoc.status)}` : getFiscalDocumentStatusLabel(fiscalDoc.status))
      : 'Sem nota';
    const fiscalActions = fiscalDoc
      ? `
            ${fiscalTransmitAction}
            ${isNfe55 ? `<a href="/danfe/${fiscalDoc.id}" target="_blank" class="btn-outline sm" style="text-decoration:none; display:inline-block;" title="Visualizar e imprimir DANFE A4">DANFE A4</a>` : `<button class="btn-outline sm" type="button" onclick="printFiscalDocument(${fiscalDocIdLiteral})" title="Imprimir cupom fiscal">Imprimir</button>`}
            ${fiscalCancelAction}
        `
      : `
            <button class="btn-outline sm" type="button" onclick="createFiscalDraftForOrder(${idLiteral})"${fiscalTitle}${fiscalDisabled}>Pre-validar</button>
            <button class="btn-outline sm" type="button" onclick="openEmitirNota55Modal(${idLiteral})"${fiscalTitle}${fiscalDisabled}>Nota 55</button>
        `;
    const refundAction = canRefund
      ? `<button class="btn-danger-outline sm" type="button" onclick="refundCashierOrder(${idLiteral})">Estornar</button>`
      : '';
    return `
      <tr>
        <td data-label="Pedido"><strong>${escapeHtml(order?.orderCode || `PED-${order?.id || ''}`)}</strong></td>
        <td data-label="Data">${escapeHtml(formatOrderLogDate(order?.createdAt))}</td>
        <td data-label="Cliente">${escapeHtml(order?.customerName || 'Nao informado')}</td>
        <td data-label="Pagamento">${buildCashierOrderPaymentHtml(order)}</td>
        <td data-label="Total"><strong>${escapeHtml(formatCurrency(total))}</strong></td>
        <td data-label="Caixa"><span class="badge ${cashierStatusClass}">${cashierStatusLabel}</span></td>
        <td data-label="Fiscal"><span class="badge ${fiscalDoc ? getFiscalDocumentStatusClass(fiscalDoc.status) : 'no'}">${escapeHtml(fiscalBadgeLabel)}</span></td>
        <td data-label="Acoes">
          <div class="order-log-actions">
            <button class="btn-outline sm" type="button" onclick="printOrderLog(${idLiteral})">Comanda</button>
            <button class="btn-outline sm" type="button" onclick="receiveCashierOrder(${idLiteral})"${receiveTitle}${receiveDisabled}>${receiveLabel}</button>
            ${refundAction}
            ${fiscalActions}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCashierMovements() {
  const tbody = document.getElementById('cashierMovementsTableBody');
  const empty = document.getElementById('cashierMovementsEmpty');
  if (!tbody || !empty) return;
  const movements = Array.isArray(getCashierSummary().recentMovements)
    ? getCashierSummary().recentMovements
    : [];
  if (!movements.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = movements.map((movement) => `
    <tr>
      <td data-label="Data">${escapeHtml(formatOrderLogDate(movement.createdAt))}</td>
      <td data-label="Tipo"><span class="badge ${movement.type === 'withdrawal' || movement.type === 'refund' ? 'inactive' : 'active'}">${escapeHtml(getCashMovementLabel(movement.type))}</span></td>
      <td data-label="Pagamento">${escapeHtml(getPaymentMethodLabel(movement.paymentMethod))}</td>
      <td data-label="Valor"><strong>${escapeHtml(formatCurrency(movement.amount || 0))}</strong></td>
      <td data-label="Descricao">${escapeHtml(movement.description || '-')}</td>
    </tr>
  `).join('');
}

function renderCashierFiscalDocuments() {
  const tbody = document.getElementById('cashierFiscalDocsTableBody');
  const empty = document.getElementById('cashierFiscalDocsEmpty');
  if (!tbody || !empty) return;
  const docs = getCashierFiscalDocs();
  if (!docs.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = docs.map((doc) => {
    const idLiteral = toInlineJsStringLiteral(doc?.id);
    const transmitReady = Boolean(STATE.cashier.fiscalStatus?.transmissionEnabled);
    const fiscalActionState = getFiscalDocumentActionState(doc?.status);
    const transmitAction = fiscalActionState.canTransmit
      ? `<button class="btn-outline sm" type="button" onclick="transmitFiscalDocument(${idLiteral})"${transmitReady ? '' : ' disabled title="Envio SEFAZ bloqueado no admin"'}>${fiscalActionState.transmitLabel}</button>`
      : '';
    const cancelAction = fiscalActionState.canCancel
      ? `<button class="btn-danger-outline sm" type="button" onclick="cancelFiscalDocument(${idLiteral})">Cancelar</button>`
      : '';
    return `
      <tr>
        <td data-label="ID">#${escapeHtml(doc?.id || '')}</td>
        <td data-label="Tipo">${escapeHtml(String(doc?.documentType || 'nfce').toUpperCase())}</td>
        <td data-label="Ambiente">${escapeHtml(doc?.environment || 'homologacao')}</td>
        <td data-label="Status"><span class="badge ${getFiscalDocumentStatusClass(doc?.status)}">${escapeHtml(getFiscalDocumentStatusLabel(doc?.status))}</span></td>
        <td data-label="Total">${escapeHtml(formatCurrency(doc?.total || 0))}</td>
        <td data-label="Acoes">
          <div class="order-log-actions">
            ${transmitAction}
            <button class="btn-outline sm" type="button" onclick="printFiscalDocument(${idLiteral})">Imprimir</button>
            ${cancelAction}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCashierHistory() {
  const tbody = document.getElementById('cashierHistoryTableBody');
  const empty = document.getElementById('cashierHistoryEmpty');
  if (!tbody || !empty) return;
  const sessions = Array.isArray(STATE.cashier.closedSessions) ? STATE.cashier.closedSessions : [];
  if (!sessions.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = sessions.map((session) => {
    const idLiteral = toInlineJsStringLiteral(session?.id);
    const totals = session?.totals || {};
    const paymentSummary = getCashierPaymentBreakdownRows(totals)
      .filter((row) => row.amount !== 0)
      .map((row) => `${getPaymentMethodLabel(row.method)} ${formatCurrency(row.amount)}`)
      .join(' | ') || '-';
    return `
      <tr>
        <td data-label="Caixa"><strong>#${escapeHtml(session?.id || '')}</strong></td>
        <td data-label="Operador">${escapeHtml(session?.operator || 'Admin')}</td>
        <td data-label="Abertura">${escapeHtml(formatOrderLogDate(session?.openedAt))}</td>
        <td data-label="Fechamento">${escapeHtml(formatOrderLogDate(session?.closedAt))}</td>
        <td data-label="Vendas"><strong>${escapeHtml(formatCurrency(totals.sales || 0))}</strong></td>
        <td data-label="Estornos">${escapeHtml(formatCurrency(totals.refunds || 0))}</td>
        <td data-label="Pagamentos">${escapeHtml(paymentSummary)}</td>
        <td data-label="Diferenca"><strong>${escapeHtml(formatCurrency(session?.differenceAmount || 0))}</strong></td>
        <td data-label="Acoes">
          <div class="order-log-actions">
            <button class="btn-outline sm" type="button" onclick="printClosedCashSession(${idLiteral})">Reimprimir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getFiscalEventLabel(type) {
  const labels = {
    cancelamento: 'Cancelamento',
    inutilizacao: 'Inutilizacao',
    contingencia_inicio: 'Inicio contingencia',
    contingencia_fim: 'Fim contingencia',
  };
  return labels[String(type || '').toLowerCase()] || 'Evento';
}

function renderFiscalEvents() {
  const tbody = document.getElementById('cashierFiscalEventsTableBody');
  const empty = document.getElementById('cashierFiscalEventsEmpty');
  if (!tbody || !empty) return;
  const events = Array.isArray(STATE.cashier.fiscalEvents) ? STATE.cashier.fiscalEvents : [];
  if (!events.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = events.map((event) => `
    <tr>
      <td data-label="Data">${escapeHtml(formatOrderLogDate(event?.createdAt))}</td>
      <td data-label="Evento"><span class="badge featured">${escapeHtml(getFiscalEventLabel(event?.eventType))}</span></td>
      <td data-label="Serie">${escapeHtml(event?.series || '-')}</td>
      <td data-label="Numero / chave">${escapeHtml(event?.number || event?.accessKey || '-')}</td>
      <td data-label="Status"><span class="badge ${String(event?.status || '').includes('pending') ? 'inactive' : 'active'}">${escapeHtml(event?.status || 'pending')}</span></td>
      <td data-label="Motivo">${escapeHtml(event?.reason || event?.error || '-')}</td>
    </tr>
  `).join('');
}

function renderCashier() {
  const summary = getCashierSummary();
  const active = summary.activeSession;
  setText('cashierStatusText', active ? 'Aberto' : 'Fechado');
  const statusBadge = document.getElementById('cashierStatusBadge');
  if (statusBadge) {
    statusBadge.className = `badge ${active ? 'active' : 'inactive'}`;
    statusBadge.textContent = active ? 'Aberto' : 'Fechado';
  }
  setText('cashierExpectedAmount', formatCurrency(active?.expectedAmount || 0));
  setText('cashierTodaySales', formatCurrency(summary.today?.sales || 0));
  setText('cashierTodayNet', formatCurrency(summary.today?.net || 0));
  const fiscalDocumentsTotal = Number(summary.fiscalDocumentsTotal);
  setText(
    'cashierFiscalDocsCount',
    Number.isFinite(fiscalDocumentsTotal)
      ? Math.max(0, Math.trunc(fiscalDocumentsTotal))
      : getCashierFiscalDocs().length,
  );
  renderCashierSessionPanel();
  renderSefazStatusPanels();
  renderCashierOrders();
  renderCashierMovements();
  renderCashierFiscalDocuments();
  renderCashierHistory();
  renderFiscalEvents();
}

function getCashMovementLabel(type) {
  const labels = {
    sale: 'Venda',
    supply: 'Suprimento',
    withdrawal: 'Sangria',
    adjustment: 'Ajuste',
    refund: 'Estorno',
  };
  return labels[String(type || '').toLowerCase()] || 'Movimento';
}

const CASHIER_PAYMENT_METHOD_ORDER = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'voucher', 'outro'];

function getPaymentMethodLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    cartao: 'Cartao',
    cartao_debito: 'Cartao debito',
    cartao_credito: 'Cartao credito',
    voucher: 'Voucher',
    outro: 'Outro',
  };
  return labels[String(method || '').toLowerCase()] || 'Outro';
}

function getCashierPaymentBreakdownRows(totalsOrByPayment = {}) {
  const source = totalsOrByPayment?.byPayment && typeof totalsOrByPayment.byPayment === 'object'
    ? totalsOrByPayment.byPayment
    : (totalsOrByPayment && typeof totalsOrByPayment === 'object' && !Array.isArray(totalsOrByPayment) ? totalsOrByPayment : {});
  const detailed = totalsOrByPayment?.byPaymentDetailed && typeof totalsOrByPayment.byPaymentDetailed === 'object'
    ? totalsOrByPayment.byPaymentDetailed
    : {};
  const keys = [
    ...CASHIER_PAYMENT_METHOD_ORDER,
    ...Object.keys(source).filter((key) => !CASHIER_PAYMENT_METHOD_ORDER.includes(String(key).toLowerCase())),
  ];
  return keys
    .map((method) => {
      const normalized = String(method || 'outro').toLowerCase();
      const detail = detailed[normalized] || {};
      return {
        method: normalized,
        amount: Number(source[method] ?? source[normalized] ?? detail.net ?? 0),
        sales: Number(detail.sales || 0),
        refunds: Number(detail.refunds || 0),
        supplies: Number(detail.supplies || 0),
        withdrawals: Number(detail.withdrawals || 0),
        adjustments: Number(detail.adjustments || 0),
        count: Number(detail.count || 0),
      };
    })
    .filter((row, index, rows) => (
      row.amount !== 0 || rows.findIndex((item) => item.method === row.method) === index
    ))
    .filter((row, index, rows) => (
      row.amount !== 0 || rows.some((item) => item.amount !== 0) || index < CASHIER_PAYMENT_METHOD_ORDER.length
    ));
}

function buildCashierPaymentBreakdownHtml(totals = {}) {
  const rows = getCashierPaymentBreakdownRows(totals);
  const rowsHtml = rows.length
    ? rows.map((row) => `
      <div class="cashier-payment-row">
        <span>
          ${escapeHtml(getPaymentMethodLabel(row.method))}
          <small>V ${escapeHtml(formatCurrency(row.sales))} · E ${escapeHtml(formatCurrency(row.refunds))} · S ${escapeHtml(formatCurrency(row.supplies))}</small>
        </span>
        <strong>${escapeHtml(formatCurrency(row.amount))}</strong>
      </div>
    `).join('')
    : '<div class="cashier-payment-row muted"><span>Sem movimentos</span><strong>R$ 0,00</strong></div>';

  return `
    <div class="cashier-close-report">
      <div class="cashier-close-report-head">
        <strong>Resumo por pagamento</strong>
        <span>Liquido do caixa</span>
      </div>
      <div class="cashier-payment-breakdown">${rowsHtml}</div>
    </div>
  `;
}

function normalizeCashierPaymentMethod(method, fallback = 'outro') {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'cartao') return 'cartao_credito';
  if (['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'voucher', 'outro'].includes(raw)) return raw;
  const safeFallback = String(fallback || '').trim().toLowerCase();
  if (safeFallback === 'cartao') return 'cartao_credito';
  return ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'voucher', 'outro'].includes(safeFallback) ? safeFallback : 'outro';
}

function amountToCashierCents(amount) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function parseCashierAmountInputToCents(value) {
  let normalized = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;
  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  if (commaIndex >= 0 && dotIndex >= 0) {
    normalized = commaIndex > dotIndex
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (commaIndex >= 0) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function getCashierOrderPaymentParts(order) {
  const cashierParts = Array.isArray(order?.cashier?.paymentParts) ? order.cashier.paymentParts : [];
  const paymentParts = Array.isArray(order?.payment?.parts) ? order.payment.parts : [];
  const rawParts = cashierParts.length ? cashierParts : paymentParts;
  return rawParts.slice(0, 2).map((part) => {
    const rawAmountCents = part?.amountCents;
    const amountCents = rawAmountCents !== undefined && rawAmountCents !== null
      ? Math.round(Number(rawAmountCents))
      : amountToCashierCents(part?.amount ?? part?.value ?? 0);
    return {
      method: normalizeCashierPaymentMethod(part?.method || part?.paymentMethod, 'outro'),
      amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    };
  }).filter((part) => part.amountCents > 0);
}

function buildCashierOrderPaymentHtml(order) {
  const parts = getCashierOrderPaymentParts(order);
  if (!parts.length) {
    const method = order?.cashier?.paymentMethod || order?.payment?.method || 'outro';
    return escapeHtml(getPaymentMethodLabel(method));
  }
  const detailLabel = parts.length === 2 ? 'Pagamento dividido em duas formas' : 'Forma de pagamento';
  return `
    <div class="cashier-order-payment-parts" aria-label="${escapeHtml(detailLabel)}">
      ${parts.map((part) => `
        <span class="cashier-order-payment-part">
          <span>${escapeHtml(getPaymentMethodLabel(part.method))}</span>
          <strong>${escapeHtml(formatCurrency(part.amountCents / 100))}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function getOrderDefaultPaymentMethod(order) {
  const paymentParts = getCashierOrderPaymentParts(order);
  return normalizeCashierPaymentMethod(
    paymentParts[0]?.method || order?.cashier?.paymentMethod || order?.payment?.method,
    'pix',
  );
}

function getFiscalDocumentPaymentMethod(doc) {
  const payload = getFiscalDocumentPayload(doc);
  return normalizeCashierPaymentMethod(
    payload?.payment?.method || payload?.order?.payment?.method,
    'pix',
  );
}

function normalizeConsumerDocument(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 14);
}

function getOrderConsumerDocument(order) {
  return normalizeConsumerDocument(order?.customerDocument || order?.document || order?.cpfCnpj || '');
}

function getFiscalDocumentConsumerDocument(doc) {
  const payload = getFiscalDocumentPayload(doc);
  return normalizeConsumerDocument(payload?.consumer?.document || payload?.order?.customerDocument || '');
}

function getFiscalDocumentConsumer(doc) {
  const payload = getFiscalDocumentPayload(doc);
  return payload?.consumer && typeof payload.consumer === 'object' ? payload.consumer : {};
}

function isCashierHomeDelivery(order) {
  const type = String(order?.orderType || '').trim().toLowerCase();
  return type.includes('entrega') || type.includes('delivery');
}

function normalizeCashierFiscalOperation(value, fallback = 'retirada') {
  const type = String(value || '').trim().toLowerCase();
  if (type.includes('entrega') || type.includes('delivery')) return 'entrega';
  if (type.includes('consumo') || type === 'local') return 'consumo_local';
  if (type.includes('retirada') || type.includes('pickup') || type.includes('balcao')) return 'retirada';
  return normalizeCashierFiscalOperation(fallback, 'retirada');
}

function handleCashierFiscalOperationChange() {
  const operation = normalizeCashierFiscalOperation(
    document.querySelector('input[name="cashierFiscalOperation"]:checked')?.value,
    'retirada',
  );
  const requireDeliveryRecipient = operation === 'entrega';
  const documentField = document.getElementById('cashierConsumerDocumentField');
  if (documentField) {
    documentField.dataset.requireDeliveryRecipient = requireDeliveryRecipient ? 'true' : 'false';
  }
  setText(
    'cashierConsumerDocumentLabel',
    requireDeliveryRecipient
      ? 'CPF/CNPJ obrigatório para entrega ao domicílio'
      : 'CPF/CNPJ na NFC-e (opcional)',
  );
  setText(
    'cashierConsumerDocumentHint',
    requireDeliveryRecipient
      ? 'Entrega: CPF/CNPJ obrigatório. O endereço local é preenchido automaticamente quando disponível.'
      : 'Retirada ou consumo local: deixe em branco para consumidor não identificado.',
  );
}

function getOrderFiscalConsumerDefaults(order, current = {}) {
  const consumer = normalizeFiscalConsumer(current);
  const deliveryAddress = String(order?.deliveryAddress || '').trim();
  const useStoreCityDefaults = isCashierHomeDelivery(order);
  const endsWithoutNumber = /\s+s\/?\s*n\s*$/i.test(deliveryAddress);
  const streetFromOrder = endsWithoutNumber
    ? deliveryAddress.replace(/\s+s\/?\s*n\s*$/i, '').trim()
    : deliveryAddress;
  return normalizeFiscalConsumer({
    ...consumer,
    document: consumer.document || getOrderConsumerDocument(order),
    name: consumer.name || order?.customerName || '',
    address: {
      ...consumer.address,
      street: consumer.address.street || streetFromOrder,
      number: consumer.address.number || (deliveryAddress ? 'S/N' : ''),
      neighborhood: consumer.address.neighborhood || (useStoreCityDefaults ? 'NAO INFORMADO' : ''),
      city: consumer.address.city || (useStoreCityDefaults
        ? STATE.fiscal?.addressCity || STATE.config?.city || ''
        : ''),
      uf: consumer.address.uf || (useStoreCityDefaults ? STATE.fiscal?.addressUf || STATE.fiscal?.uf || '' : ''),
      cityCode: consumer.address.cityCode || (useStoreCityDefaults ? STATE.fiscal?.cityCode || '' : ''),
    },
  });
}

function normalizeFiscalConsumer(raw = {}) {
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  return {
    document: normalizeConsumerDocument(raw.document || ''),
    name: String(raw.name || '').trim().slice(0, 60),
    email: String(raw.email || '').trim().slice(0, 60),
    phone: String(raw.phone || '').replace(/\D+/g, '').slice(0, 14),
    address: {
      cep: String(address.cep || '').replace(/\D+/g, '').slice(0, 8),
      street: String(address.street || '').trim().slice(0, 60),
      number: String(address.number || '').trim().slice(0, 60),
      complement: String(address.complement || '').trim().slice(0, 60),
      neighborhood: String(address.neighborhood || '').trim().slice(0, 60),
      city: String(address.city || '').trim().slice(0, 60),
      uf: String(address.uf || '').trim().toUpperCase().slice(0, 2),
      cityCode: String(address.cityCode || '').replace(/\D+/g, '').slice(0, 7),
    },
  };
}

function setFiscalConsumerForm(raw = {}) {
  const consumer = normalizeFiscalConsumer(raw);
  setVal('cashierConsumerDocument', consumer.document);
  setVal('cashierConsumerName', consumer.name);
  setVal('cashierConsumerEmail', consumer.email);
  setVal('cashierConsumerPhone', consumer.phone);
  setVal('cashierConsumerCep', consumer.address.cep);
  setVal('cashierConsumerStreet', consumer.address.street);
  setVal('cashierConsumerNumber', consumer.address.number);
  setVal('cashierConsumerComplement', consumer.address.complement);
  setVal('cashierConsumerNeighborhood', consumer.address.neighborhood);
  setVal('cashierConsumerCity', consumer.address.city);
  setVal('cashierConsumerUf', consumer.address.uf);
  setVal('cashierConsumerCityCode', consumer.address.cityCode);
}

function getFiscalConsumerForm() {
  return normalizeFiscalConsumer({
    document: getVal('cashierConsumerDocument'),
    name: getVal('cashierConsumerName'),
    email: getVal('cashierConsumerEmail'),
    phone: getVal('cashierConsumerPhone'),
    address: {
      cep: getVal('cashierConsumerCep'),
      street: getVal('cashierConsumerStreet'),
      number: getVal('cashierConsumerNumber'),
      complement: getVal('cashierConsumerComplement'),
      neighborhood: getVal('cashierConsumerNeighborhood'),
      city: getVal('cashierConsumerCity'),
      uf: getVal('cashierConsumerUf'),
      cityCode: getVal('cashierConsumerCityCode'),
    },
  });
}

function getAlternativeCashierPaymentMethod(primaryMethod, preferredMethod = '') {
  const primary = normalizeCashierPaymentMethod(primaryMethod, 'outro');
  const hasPreferred = Boolean(String(preferredMethod || '').trim());
  const preferred = normalizeCashierPaymentMethod(preferredMethod, 'outro');
  if (hasPreferred && preferred !== primary) return preferred;
  return CASHIER_PAYMENT_METHOD_ORDER.find((method) => method !== primary) || 'outro';
}

function getCashierModalPrimaryPaymentMethod() {
  const selected = document.querySelector('input[name="cashierPaymentMethod"]:checked');
  return normalizeCashierPaymentMethod(selected?.value, 'outro');
}

function updateCashierSplitPaymentValues() {
  const totalCents = Math.max(0, Number(STATE.cashierPaymentModal?.amountCents || 0));
  const firstAmountInput = document.getElementById('cashierFirstPaymentAmount');
  const secondMethodInput = document.getElementById('cashierSecondPaymentMethod');
  const secondAmountOutput = document.getElementById('cashierSecondPaymentAmount');
  const status = document.getElementById('cashierSplitPaymentStatus');
  const firstMethod = getCashierModalPrimaryPaymentMethod();
  const secondMethod = normalizeCashierPaymentMethod(secondMethodInput?.value, 'outro');
  const firstAmountCents = parseCashierAmountInputToCents(firstAmountInput?.value);
  const secondAmountCents = totalCents - firstAmountCents;
  const validAmounts = firstAmountCents > 0 && secondAmountCents > 0;
  const distinctMethods = firstMethod !== secondMethod;

  firstAmountInput?.setAttribute('aria-invalid', validAmounts ? 'false' : 'true');
  secondMethodInput?.setAttribute('aria-invalid', distinctMethods ? 'false' : 'true');
  if (secondAmountOutput) {
    secondAmountOutput.textContent = formatCurrency(Math.max(0, secondAmountCents) / 100);
  }
  if (status) {
    status.classList.toggle('invalid', !validAmounts || !distinctMethods);
    if (!validAmounts) {
      status.textContent = 'O valor da primeira forma deve ser maior que zero e menor que o total.';
    } else if (!distinctMethods) {
      status.textContent = 'Escolha uma forma diferente para a segunda parte.';
    } else {
      status.textContent = `${getPaymentMethodLabel(firstMethod)} ${formatCurrency(firstAmountCents / 100)} + ${getPaymentMethodLabel(secondMethod)} ${formatCurrency(secondAmountCents / 100)} = ${formatCurrency(totalCents / 100)}.`;
    }
  }

  return {
    valid: validAmounts && distinctMethods,
    firstMethod,
    secondMethod,
    firstAmountCents,
    secondAmountCents,
  };
}

function handleCashierPrimaryPaymentMethodChange() {
  const splitEnabled = Boolean(document.getElementById('cashierSplitPaymentEnabled')?.checked);
  if (!STATE.cashierPaymentModal?.allowSplit || !splitEnabled) return;
  const primaryMethod = getCashierModalPrimaryPaymentMethod();
  const secondMethodInput = document.getElementById('cashierSecondPaymentMethod');
  if (secondMethodInput && normalizeCashierPaymentMethod(secondMethodInput.value, 'outro') === primaryMethod) {
    secondMethodInput.value = getAlternativeCashierPaymentMethod(primaryMethod);
  }
  updateCashierSplitPaymentValues();
}

function toggleCashierSplitPayment() {
  const checkbox = document.getElementById('cashierSplitPaymentEnabled');
  const details = document.getElementById('cashierSplitPaymentDetails');
  const optionsLabel = document.getElementById('cashierPaymentOptionsLabel');
  const enabled = Boolean(STATE.cashierPaymentModal?.allowSplit && checkbox?.checked);
  if (details) details.hidden = !enabled;
  if (optionsLabel) optionsLabel.textContent = enabled ? '1ª forma de pagamento' : 'Forma de pagamento';
  if (!enabled) return;

  handleCashierPrimaryPaymentMethodChange();
  requestAnimationFrame(() => document.getElementById('cashierFirstPaymentAmount')?.focus());
}

function openCashierPaymentModal(options = {}) {
  const overlay = document.getElementById('cashierPaymentOverlay');
  const amount = Number(options.amount || 0);
  const amountCents = amountToCashierCents(amount);
  const fallbackMethod = normalizeCashierPaymentMethod(options.defaultMethod, 'pix');
  if (!overlay) {
    return Promise.resolve({
      paymentMethod: fallbackMethod,
      payments: [{ method: fallbackMethod, amountCents }],
      fiscalOperationType: normalizeCashierFiscalOperation(
        options.defaultFiscalOperation,
        'retirada',
      ),
      consumerDocument: normalizeConsumerDocument(options.defaultConsumerDocument || ''),
      consumer: normalizeFiscalConsumer(options.defaultConsumer || {}),
    });
  }

  const title = String(options.title || 'Forma de pagamento').trim();
  const message = String(options.message || 'Escolha a forma de pagamento.').trim();
  const orderCode = String(options.orderCode || 'Pedido').trim();
  const allowSplit = Boolean(options.allowSplit);
  const rawDefaultPayments = Array.isArray(options.defaultPayments) ? options.defaultPayments : [];
  const defaultPayments = rawDefaultPayments.slice(0, 2).map((part) => ({
    method: normalizeCashierPaymentMethod(part?.method || part?.paymentMethod, fallbackMethod),
    amountCents: part?.amountCents !== undefined && part?.amountCents !== null
      ? Math.round(Number(part.amountCents))
      : amountToCashierCents(part?.amount ?? part?.value ?? 0),
  })).filter((part) => Number.isFinite(part.amountCents) && part.amountCents > 0);
  const hasValidDefaultSplit = allowSplit
    && defaultPayments.length === 2
    && defaultPayments[0].method !== defaultPayments[1].method
    && defaultPayments.reduce((sum, part) => sum + part.amountCents, 0) === amountCents;
  const defaultMethod = hasValidDefaultSplit ? defaultPayments[0].method : fallbackMethod;
  const confirmLabel = String(options.confirmLabel || 'Continuar').trim();
  const askDocument = Boolean(options.askDocument);
  const askFiscalOperation = Boolean(options.askFiscalOperation);
  const defaultFiscalOperation = normalizeCashierFiscalOperation(
    options.defaultFiscalOperation,
    'retirada',
  );
  const fiscalOperationField = document.getElementById('cashierFiscalOperationField');
  const documentField = document.getElementById('cashierConsumerDocumentField');
  const documentInput = document.getElementById('cashierConsumerDocument');
  const splitField = document.getElementById('cashierSplitPaymentField');
  const splitCheckbox = document.getElementById('cashierSplitPaymentEnabled');
  const splitDetails = document.getElementById('cashierSplitPaymentDetails');
  const firstAmountInput = document.getElementById('cashierFirstPaymentAmount');
  const secondMethodInput = document.getElementById('cashierSecondPaymentMethod');
  const optionsLabel = document.getElementById('cashierPaymentOptionsLabel');

  STATE.cashierPaymentModal = { allowSplit, amountCents };

  setText('cashierPaymentTitle', title);
  setText('cashierPaymentMessage', message);
  setText('cashierPaymentOrderCode', orderCode);
  setText('cashierPaymentAmount', formatCurrency(amount));
  setText('cashierPaymentConfirmBtn', confirmLabel);

  document.querySelectorAll('input[name="cashierPaymentMethod"]').forEach((input) => {
    input.checked = input.value === defaultMethod;
  });
  document.querySelectorAll('input[name="cashierFiscalOperation"]').forEach((input) => {
    input.checked = input.value === defaultFiscalOperation;
  });
  if (splitField) splitField.hidden = !allowSplit;
  if (splitCheckbox) {
    splitCheckbox.checked = hasValidDefaultSplit;
    splitCheckbox.disabled = amountCents < 2;
  }
  if (splitDetails) splitDetails.hidden = !hasValidDefaultSplit;
  if (optionsLabel) optionsLabel.textContent = hasValidDefaultSplit ? '1ª forma de pagamento' : 'Forma de pagamento';
  if (firstAmountInput) {
    const initialFirstAmountCents = hasValidDefaultSplit
      ? defaultPayments[0].amountCents
      : Math.max(1, Math.floor(amountCents / 2));
    firstAmountInput.value = (initialFirstAmountCents / 100).toFixed(2);
  }
  if (secondMethodInput) {
    secondMethodInput.value = hasValidDefaultSplit
      ? defaultPayments[1].method
      : getAlternativeCashierPaymentMethod(defaultMethod);
  }
  if (fiscalOperationField) fiscalOperationField.style.display = askFiscalOperation ? '' : 'none';
  if (documentField) documentField.style.display = askDocument ? '' : 'none';
  if (documentInput) {
    const initialConsumer = {
      ...(options.defaultConsumer || {}),
      document: options.defaultConsumerDocument || options.defaultConsumer?.document || '',
    };
    setFiscalConsumerForm(askDocument ? initialConsumer : {});
  }
  handleCashierFiscalOperationChange();
  if (hasValidDefaultSplit) updateCashierSplitPaymentValues();

  overlay.classList.add('open');
  requestAnimationFrame(() => {
    const focusTarget = hasValidDefaultSplit
      ? firstAmountInput
      : document.querySelector('input[name="cashierPaymentMethod"]:checked');
    focusTarget?.focus();
  });

  return new Promise((resolve) => {
    STATE.cashierPaymentResolve = resolve;
  });
}

function resolveCashierPaymentSelection(value) {
  const overlay = document.getElementById('cashierPaymentOverlay');
  if (overlay) overlay.classList.remove('open');

  const resolve = STATE.cashierPaymentResolve;
  STATE.cashierPaymentResolve = null;
  if (typeof resolve === 'function') resolve(value);
}

function confirmCashierPaymentSelection() {
  const selected = document.querySelector('input[name="cashierPaymentMethod"]:checked');
  if (!selected) {
    showToast('Escolha uma forma de pagamento.', 'error', 3000);
    return;
  }
  const paymentMethod = normalizeCashierPaymentMethod(selected.value, 'outro');
  const totalCents = Math.max(0, Number(STATE.cashierPaymentModal?.amountCents || 0));
  const splitEnabled = Boolean(
    STATE.cashierPaymentModal?.allowSplit
    && document.getElementById('cashierSplitPaymentEnabled')?.checked
  );
  let payments = [{ method: paymentMethod, amountCents: totalCents }];
  if (splitEnabled) {
    const split = updateCashierSplitPaymentValues();
    if (!split.valid) {
      showToast('Confira as duas formas e os valores do pagamento.', 'error', 3400);
      document.getElementById('cashierFirstPaymentAmount')?.focus();
      return;
    }
    payments = [
      { method: split.firstMethod, amountCents: split.firstAmountCents },
      { method: split.secondMethod, amountCents: split.secondAmountCents },
    ];
  }
  const selectedFiscalOperation = document.querySelector('input[name="cashierFiscalOperation"]:checked');
  const fiscalOperationType = normalizeCashierFiscalOperation(
    selectedFiscalOperation?.value,
    'retirada',
  );
  const documentField = document.getElementById('cashierConsumerDocumentField');
  let consumer = getFiscalConsumerForm();
  const consumerDocument = consumer.document;
  const documentType = String(STATE.fiscal?.documentType || 'nfce').trim().toLowerCase();
  const documentIsVisible = documentField && documentField.style.display !== 'none';
  const requireDeliveryRecipient = documentField?.dataset?.requireDeliveryRecipient === 'true';
  if (documentField && documentField.style.display !== 'none' && consumerDocument && ![11, 14].includes(consumerDocument.length)) {
    showToast('CPF/CNPJ deve ter 11 ou 14 digitos.', 'error', 3200);
    return;
  }
  if (documentIsVisible && documentType === 'nfe' && !consumerDocument) {
    showToast('NF-e modelo 55 exige CPF ou CNPJ do destinatario.', 'error', 3800);
    return;
  }
  if (documentIsVisible && documentType === 'nfce' && requireDeliveryRecipient && !consumerDocument) {
    showToast('Entrega ao domicilio exige CPF ou CNPJ do destinatario na NFC-e.', 'error', 4200);
    return;
  }
  if (documentIsVisible && documentType === 'nfce' && !consumerDocument) {
    consumer = normalizeFiscalConsumer({});
  }
  if (consumer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consumer.email)) {
    showToast('Informe um e-mail valido.', 'error', 3200);
    return;
  }
  const hasAddress = Object.values(consumer.address).some(Boolean);
  const addressComplete = consumer.address.street && consumer.address.number
    && consumer.address.neighborhood && consumer.address.city
    && /^[A-Z]{2}$/.test(consumer.address.uf) && consumer.address.cityCode.length === 7;
  if (hasAddress && !addressComplete) {
    showToast('Complete rua, numero, bairro, cidade, UF e codigo IBGE.', 'error', 4200);
    return;
  }
  if (requireDeliveryRecipient && !addressComplete) {
    showToast('Entrega ao domicilio exige rua, numero, bairro, cidade, UF e codigo IBGE.', 'error', 4600);
    return;
  }
  resolveCashierPaymentSelection({
    paymentMethod,
    payments,
    fiscalOperationType,
    consumerDocument,
    consumer,
  });
}

function cancelCashierPaymentSelection() {
  resolveCashierPaymentSelection(null);
}

function handleCashierPaymentOverlayClick(event) {
  if (event.target && event.target.id === 'cashierPaymentOverlay') {
    cancelCashierPaymentSelection();
  }
}

async function openCashSession() {
  try {
    await fetchCashierApi('/open', {
      method: 'POST',
      body: JSON.stringify({
        openingAmount: parseFloat(getVal('cashierOpeningAmount')) || 0,
        operator: getVal('cashierOperator') || 'Admin',
        notes: getVal('cashierOpenNotes'),
      }),
    });
    showToast('Caixa aberto.', 'success');
    await loadCashier(true);
  } catch (error) {
    showToast(String(error?.message || 'Falha ao abrir caixa.'), 'error', 3600);
  }
}

async function closeCashSession() {
  confirmDialog('Fechar caixa', 'Confirma o fechamento do caixa atual?', async () => {
    try {
      await fetchCashierApi('/close', {
        method: 'POST',
        body: JSON.stringify({
          closingAmount: parseFloat(getVal('cashierClosingAmount')) || 0,
          notes: getVal('cashierCloseNotes'),
          managerPin: getManagerPinForAction('cash-close'),
        }),
      });
      showToast('Caixa fechado.', 'success');
      await loadCashier(true);
    } catch (error) {
      showToast(String(error?.message || 'Falha ao fechar caixa.'), 'error', 3600);
    }
  }, 'Fechar caixa');
}

function buildCashierClosingReportBodyHtml(session, countedAmount) {
  const totals = session?.totals || {};
  const openingAmount = Number(session?.openingAmount || 0);
  const expectedAmount = Number(
    session?.expectedAmount
    ?? (openingAmount + Number(totals.cashDrawerNet ?? totals.net ?? 0)),
  );
  const counted = Number.isFinite(Number(countedAmount)) ? Number(countedAmount) : expectedAmount;
  const difference = counted - expectedAmount;
  const paymentRows = getCashierPaymentBreakdownRows(totals)
    .filter((row) => row.amount !== 0)
    .map((row) => `
      <div class="print-total-line">
        <span>${escapeHtml(getPaymentMethodLabel(row.method))}</span>
        <strong>${escapeHtml(formatCurrency(row.amount))}</strong>
      </div>
      <div class="print-total-line">
        <span> Vendas / Estornos</span>
        <strong>${escapeHtml(formatCurrency(row.sales))} / ${escapeHtml(formatCurrency(row.refunds))}</strong>
      </div>
      <div class="print-total-line">
        <span> Supr. / Sangrias</span>
        <strong>${escapeHtml(formatCurrency(row.supplies))} / ${escapeHtml(formatCurrency(row.withdrawals))}</strong>
      </div>
    `).join('') || '<div class="print-empty">Sem movimentos por pagamento.</div>';

  const infoRows = [
    buildPrintInfoRow('Operador', session?.operator || 'Admin'),
    buildPrintInfoRow('Aberto em', formatOrderLogDate(session?.openedAt)),
    buildPrintInfoRow('Movimentos', totals.count || 0),
  ].filter(Boolean).join('');

  return `
    <section class="print-info">${infoRows}</section>
    <div class="print-section-title">RESUMO DO CAIXA</div>
    <section class="print-totals">
      <div class="print-total-line"><span>Inicial</span><strong>${escapeHtml(formatCurrency(openingAmount))}</strong></div>
      <div class="print-total-line"><span>Vendas</span><strong>${escapeHtml(formatCurrency(totals.sales || 0))}</strong></div>
      <div class="print-total-line"><span>Estornos</span><strong>${escapeHtml(formatCurrency(totals.refunds || 0))}</strong></div>
      <div class="print-total-line"><span>Suprimentos</span><strong>${escapeHtml(formatCurrency(totals.supplies || 0))}</strong></div>
      <div class="print-total-line"><span>Sangrias</span><strong>${escapeHtml(formatCurrency(totals.withdrawals || 0))}</strong></div>
      <div class="print-total-line main"><span>Esperado</span><strong>${escapeHtml(formatCurrency(expectedAmount))}</strong></div>
      <div class="print-total-line"><span>Contado</span><strong>${escapeHtml(formatCurrency(counted))}</strong></div>
      <div class="print-total-line"><span>Diferenca</span><strong>${escapeHtml(formatCurrency(difference))}</strong></div>
    </section>
    <div class="print-section-title">PAGAMENTOS</div>
    <section class="print-totals">${paymentRows}</section>
  `;
}

function printCashierClosingReport() {
  const session = getCashierSummary().activeSession;
  if (!session) {
    showToast('Nao existe caixa aberto para imprimir.', 'error');
    return false;
  }

  const countedAmount = parseFloat(getVal('cashierClosingAmount'));
  const popup = window.open('', '_blank', getPrintWindowFeatures(STATE.autoPrint.profile));
  if (!popup) {
    showToast('Permita pop-up para imprimir o fechamento.', 'error', 3300);
    return false;
  }

  try {
    popup.document.open();
    popup.document.write(
      buildThermalReceiptDocument({
        title: 'Fechamento de Caixa',
        storeName: getStoreDisplayName(STATE.config?.storeName),
        orderCode: `Caixa #${session.id || ''}`,
        createdAt: formatReceiptDateTime(),
        customerName: session.operator || 'Admin',
        profileId: STATE.autoPrint.profile,
        bodyHtml: buildCashierClosingReportBodyHtml(session, countedAmount),
        footerText: 'Conferencia manual do caixa.',
      }),
    );
    popup.document.close();
    popup.focus();
    showToast('Fechamento aberto para impressao.', 'success', 1900);
    return true;
  } catch (error) {
    console.error('Falha ao imprimir fechamento do caixa.', error);
    try {
      popup.close();
    } catch {
      // Ignora falha ao fechar a janela de impressao.
    }
    showToast('Falha ao abrir fechamento para impressao.', 'error', 3600);
    return false;
  }
}

async function printClosedCashSession(sessionId) {
  try {
    const details = await fetchCashierApi(`/sessions/${encodeURIComponent(sessionId)}`);
    const session = details?.session;
    if (!session) {
      showToast('Caixa fechado nao encontrado.', 'error');
      return false;
    }
    const countedAmount = session.closingAmount ?? session.expectedAmount;
    const popup = window.open('', '_blank', getPrintWindowFeatures(STATE.autoPrint.profile));
    if (!popup) {
      showToast('Permita pop-up para reimprimir o fechamento.', 'error', 3300);
      return false;
    }
    popup.document.open();
    popup.document.write(
      buildThermalReceiptDocument({
        title: 'Fechamento de Caixa',
        storeName: getStoreDisplayName(STATE.config?.storeName),
        orderCode: `Caixa #${session.id || ''}`,
        createdAt: formatOrderLogDate(session.closedAt || session.openedAt),
        customerName: session.operator || 'Admin',
        profileId: STATE.autoPrint.profile,
        bodyHtml: buildCashierClosingReportBodyHtml(session, countedAmount),
        footerText: 'Reimpressao do fechamento.',
      }),
    );
    popup.document.close();
    popup.focus();
    showToast('Fechamento reaberto para impressao.', 'success', 1900);
    return true;
  } catch (error) {
    showToast(String(error?.message || 'Falha ao reimprimir fechamento.'), 'error', 3800);
    return false;
  }
}

async function createCashMovementFromForm() {
  try {
    const type = getVal('cashierMovementType');
    await fetchCashierApi('/movements', {
      method: 'POST',
      body: JSON.stringify({
        type,
        paymentMethod: getVal('cashierMovementPayment'),
        amount: parseFloat(getVal('cashierMovementAmount')) || 0,
        description: getVal('cashierMovementDescription'),
        ...(type === 'refund' ? { managerPin: getManagerPinForAction('refund') } : {}),
      }),
    });
    setVal('cashierMovementAmount', '');
    setVal('cashierMovementDescription', '');
    showToast('Movimento registrado.', 'success');
    await loadCashier(true);
  } catch (error) {
    showToast(String(error?.message || 'Falha ao registrar movimento.'), 'error', 3600);
  }
}

async function receiveCashierOrder(orderId, options = {}) {
  const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
  if (!order) {
    if (!options.silent) showToast('Pedido nao encontrado.', 'error');
    return false;
  }
  const orderTotal = Number(order?.totals?.total || 0);
  const orderTotalCents = amountToCashierCents(orderTotal);
  const selection = options.paymentMethod
    ? {
      paymentMethod: normalizeCashierPaymentMethod(options.paymentMethod, getOrderDefaultPaymentMethod(order)),
      payments: [{
        method: normalizeCashierPaymentMethod(options.paymentMethod, getOrderDefaultPaymentMethod(order)),
        amountCents: orderTotalCents,
      }],
      consumerDocument: normalizeConsumerDocument(options.consumerDocument || ''),
    }
    : await openCashierPaymentModal({
      title: 'Receber pedido',
      message: 'Escolha como este pedido sera recebido no caixa.',
      orderCode: order?.orderCode || `PED-${order?.id || ''}`,
      amount: orderTotal,
      defaultMethod: getOrderDefaultPaymentMethod(order),
      defaultPayments: getCashierOrderPaymentParts(order),
      allowSplit: true,
      confirmLabel: 'Receber',
    });
  if (!selection?.paymentMethod && !Array.isArray(selection?.payments)) return false;

  const rawPayments = Array.isArray(selection?.payments) && selection.payments.length
    ? selection.payments
    : [{ method: selection?.paymentMethod, amountCents: orderTotalCents }];
  const payments = rawPayments.map((part) => ({
    method: normalizeCashierPaymentMethod(part?.method || part?.paymentMethod, getOrderDefaultPaymentMethod(order)),
    amountCents: Math.round(Number(part?.amountCents)),
  }));
  const paymentTotalCents = payments.reduce((sum, part) => sum + part.amountCents, 0);
  const hasInvalidPayment = payments.length < 1
    || payments.length > 2
    || payments.some((part) => !Number.isInteger(part.amountCents) || part.amountCents <= 0)
    || paymentTotalCents !== orderTotalCents
    || (payments.length === 2 && payments[0].method === payments[1].method);
  if (hasInvalidPayment) {
    if (!options.silent) showToast('As parcelas devem ser positivas e somar exatamente o total do pedido.', 'error', 3800);
    return false;
  }

  const receivePayload = {
    amount: orderTotal,
    payments,
  };
  if (payments.length === 1) {
    receivePayload.paymentMethod = payments[0].method;
    receivePayload.paymentLabel = getPaymentMethodLabel(payments[0].method);
  }

  try {
    await fetchCashierApi(`/orders/${encodeURIComponent(orderId)}/receive`, {
      method: 'POST',
      body: JSON.stringify(receivePayload),
    });
    if (!options.silent) showToast('Pedido recebido no caixa.', 'success');
    await loadOrderLogs(true);
    await loadCashier(true);
    return true;
  } catch (error) {
    if (!options.silent) showToast(String(error?.message || 'Falha ao receber pedido.'), 'error', 3600);
    return false;
  }
}

async function refundCashierOrder(orderId) {
  const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
  if (!order) {
    showToast('Pedido nao encontrado.', 'error');
    return false;
  }
  if (!getCashierSummary().activeSession) {
    showToast('Abra o caixa antes de estornar pedidos.', 'error');
    return false;
  }
  if (!isCashierOrderPaid(order)) {
    showToast('Este pedido ainda nao esta recebido no caixa.', 'error');
    return false;
  }

  const orderCode = order?.orderCode || `PED-${order?.id || ''}`;
  confirmDialog(
    'Estornar pedido',
    `Confirma o estorno do recebimento ${orderCode}? O valor saira do fechamento do caixa.`,
    async () => {
      try {
        const paymentParts = getCashierOrderPaymentParts(order);
        const refundPayload = {
          reason: 'Estorno manual no caixa',
          managerPin: getManagerPinForAction('refund'),
        };
        if (!paymentParts.length) {
          refundPayload.paymentMethod = order?.cashier?.paymentMethod || order?.payment?.method || 'outro';
        }
        await fetchCashierApi(`/orders/${encodeURIComponent(orderId)}/refund`, {
          method: 'POST',
          body: JSON.stringify(refundPayload),
        });
        showToast('Pedido estornado no caixa.', 'success');
        await loadOrderLogs(true);
        await loadCashier(true);
      } catch (error) {
        showToast(String(error?.message || 'Falha ao estornar pedido.'), 'error', 3800);
      }
    },
    'Estornar',
    '!',
  );
  return true;
}

async function createFiscalDraftForOrder(orderId) {
  const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
  if (!order) {
    showToast('Pedido nao encontrado.', 'error');
    return false;
  }
  const selection = await openCashierPaymentModal({
    title: 'Forma de pagamento da nota',
    message: 'Escolha o pagamento e a operação fiscal que realmente aconteceu.',
    orderCode: order?.orderCode || `PED-${order?.id || ''}`,
    amount: Number(order?.totals?.total || 0),
    defaultMethod: getOrderDefaultPaymentMethod(order),
    defaultConsumerDocument: getOrderConsumerDocument(order),
    defaultConsumer: getOrderFiscalConsumerDefaults(order),
    askDocument: true,
    askFiscalOperation: true,
    defaultFiscalOperation: normalizeCashierFiscalOperation(order?.orderType, 'retirada'),
    confirmLabel: 'Criar nota',
  });
  if (!selection?.paymentMethod) return false;

  const paymentMethod = normalizeCashierPaymentMethod(selection.paymentMethod, getOrderDefaultPaymentMethod(order));
  const consumerDocument = normalizeConsumerDocument(selection.consumerDocument || '');
  const consumer = normalizeFiscalConsumer(selection.consumer || { document: consumerDocument });

  try {
    await fetchFiscalApi('/documents', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        documentType: STATE.fiscal?.documentType || 'nfce',
        environment: STATE.fiscal?.environment || 'homologacao',
        paymentMethod,
        paymentLabel: getPaymentMethodLabel(paymentMethod),
        fiscalOperationType: selection.fiscalOperationType,
        consumerDocument,
        consumer,
        managerPin: getManagerPinForAction('fiscal-transmit'),
      }),
    });
    showToast('Nota pre-validada local criada. Transmita na SEFAZ quando houver conexao.', 'success');
    await loadCashier(true);
    return true;
  } catch (error) {
    showToast(String(error?.message || 'Falha ao criar nota pre-validada.'), 'error', 3800);
    return false;
  }
}

async function transmitFiscalDocument(documentId) {
  if (!STATE.cashier.fiscalStatus?.transmissionEnabled) {
    showToast('Envio SEFAZ bloqueado. Deixe assim ate o contador conferir e liberar no admin.', 'info', 5200);
    return false;
  }
  let doc;
  try {
    doc = await loadFiscalDocumentById(documentId);
  } catch (error) {
    showToast(String(error?.message || 'Nao foi possivel carregar a nota completa.'), 'error', 4200);
    return false;
  }
  if (!doc) {
    showToast('Documento fiscal nao encontrado.', 'error');
    return false;
  }
  const order = doc?.orderId
    ? (STATE.orderLogs || []).find((item) => String(item?.id) === String(doc.orderId))
    : null;
  const fiscalOrder = getFiscalDocumentPayload(doc)?.order || order || {};
  const selection = await openCashierPaymentModal({
    title: 'Transmitir nota',
    message: 'Escolha o pagamento e confirme a operação fiscal antes de transmitir.',
    orderCode: doc ? getFiscalDocumentPrintableCode(doc) : `Nota #${documentId}`,
    amount: Number(doc?.total || order?.totals?.total || 0),
    defaultMethod: doc ? getFiscalDocumentPaymentMethod(doc) : getOrderDefaultPaymentMethod(order),
    defaultConsumerDocument: doc ? getFiscalDocumentConsumerDocument(doc) : getOrderConsumerDocument(order),
    defaultConsumer: getOrderFiscalConsumerDefaults(
      order || fiscalOrder,
      doc ? getFiscalDocumentConsumer(doc) : {},
    ),
    askDocument: true,
    askFiscalOperation: true,
    defaultFiscalOperation: normalizeCashierFiscalOperation(fiscalOrder?.orderType, 'retirada'),
    confirmLabel: 'Enviar',
  });
  if (!selection?.paymentMethod) return false;

  const paymentMethod = normalizeCashierPaymentMethod(
    selection.paymentMethod,
    doc ? getFiscalDocumentPaymentMethod(doc) : getOrderDefaultPaymentMethod(order),
  );
  const consumerDocument = normalizeConsumerDocument(selection.consumerDocument || '');
  const consumer = normalizeFiscalConsumer(selection.consumer || { document: consumerDocument });

  try {
    const result = await fetchFiscalApi(`/documents/${encodeURIComponent(documentId)}/transmit`, {
      method: 'POST',
      body: JSON.stringify({
        paymentMethod,
        paymentLabel: getPaymentMethodLabel(paymentMethod),
        fiscalOperationType: selection.fiscalOperationType,
        consumerDocument,
        consumer,
        managerPin: getManagerPinForAction('fiscal-transmit'),
      }),
    });
    showToast(result?.message || 'Documento transmitido.', 'success');
    const transmittedDoc = result?.document || doc;
    const orderId = transmittedDoc?.orderId || doc?.orderId;
    const currentOrder = orderId
      ? (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId))
      : null;
    let received = true;
    if (orderId && currentOrder && !isCashierOrderPaid(currentOrder)) {
      received = await receiveCashierOrder(orderId, { paymentMethod, consumerDocument });
    }
    await loadCashier(true);
    if (received) {
      const printMessage = result?.reconciled
        ? 'A autorizacao existente foi recuperada da SEFAZ. Deseja abrir a impressao na termica agora?'
        : orderId
          ? 'A nota foi transmitida e recebida. Deseja abrir a impressao na termica agora?'
          : 'A nota foi transmitida. Deseja abrir a impressao na termica agora?';
      confirmDialog(
        'Imprimir nota?',
        printMessage,
        () => printFiscalDocument(documentId),
        'Imprimir',
        'NF',
        'Nao imprimir',
      );
    }
    return true;
  } catch (error) {
    showToast(String(error?.message || 'Transmissao SEFAZ indisponivel.'), 'error', 5200);
    return false;
  }
}

function updateFiscalCancelReasonCount(value) {
  setText('fiscalCancelReasonCount', String(value || '').length);
}

async function submitFiscalCancellation(documentId, reason) {
  try {
    const result = await fetchFiscalApi(`/documents/${encodeURIComponent(documentId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        reason,
        managerPin: getManagerPinForAction('fiscal-event'),
      }),
    });
    showToast(result?.message || 'Cancelamento registrado.', 'success', 3600);
    await loadCashier(true);
  } catch (error) {
    showToast(String(error?.message || 'Falha ao cancelar documento.'), 'error', 4200);
  }
}

async function cancelFiscalDocument(documentId) {
  let fiscalDocument;
  try {
    fiscalDocument = await loadFiscalDocumentById(documentId);
  } catch (error) {
    showToast(String(error?.message || 'Nao foi possivel carregar a nota completa.'), 'error', 4200);
    return;
  }
  const status = String(fiscalDocument?.status || '').toLowerCase();
  if (!['draft', 'prevalidated', 'rejected', 'error', 'authorized'].includes(status)) {
    showToast('Este documento nao esta em um estado que permita cancelamento.', 'info', 4600);
    return;
  }
  const sendsToSefaz = status === 'authorized';
  confirmDialog(
    'Cancelar documento',
    sendsToSefaz
      ? 'Informe por que esta nota precisa ser cancelada. Esta acao sera enviada para a SEFAZ.'
      : 'Informe por que este documento local deve ser cancelado.',
    () => {
      const field = document.getElementById('fiscalCancelReason');
      const reason = String(field?.value || '').trim();
      if (reason.length < 15) {
        showToast('O motivo precisa ter pelo menos 15 caracteres.', 'error', 3600);
        field?.focus();
        return false;
      }
      submitFiscalCancellation(documentId, reason);
      return true;
    },
    sendsToSefaz ? 'Enviar cancelamento' : 'Cancelar documento',
    'NF',
    'Voltar',
    {
      focusId: 'fiscalCancelReason',
      fieldsHtml: `
        <label for="fiscalCancelReason">Motivo do cancelamento</label>
        <textarea id="fiscalCancelReason" minlength="15" maxlength="255" rows="4" oninput="updateFiscalCancelReasonCount(this.value)" placeholder="Ex.: Pedido lançado em duplicidade pelo operador."></textarea>
        <small><span id="fiscalCancelReasonCount">0</span>/255 caracteres · mínimo de 15</small>`,
    },
  );
}

async function createFiscalInutilization() {
  try {
    const result = await fetchFiscalApi('/inutilizations', {
      method: 'POST',
      body: JSON.stringify({
        documentType: STATE.fiscal?.documentType || 'nfce',
        environment: STATE.fiscal?.environment || 'homologacao',
        series: getVal('fiscalInutilizationSeries') || STATE.fiscal?.seriesNfce || '1',
        startNumber: getVal('fiscalInutilizationStart'),
        endNumber: getVal('fiscalInutilizationEnd'),
        reason: getVal('fiscalInutilizationReason'),
        managerPin: getVal('fiscalManagerActionPin') || getManagerPinForAction('fiscal-event'),
      }),
    });
    showToast(result?.message || 'Inutilizacao registrada.', 'success', 3600);
    setVal('fiscalInutilizationStart', '');
    setVal('fiscalInutilizationEnd', '');
    setVal('fiscalInutilizationReason', '');
    await loadCashier(true);
  } catch (error) {
    showToast(String(error?.message || 'Falha ao registrar inutilizacao.'), 'error', 4200);
  }
}

async function applyFiscalContingency() {
  try {
    const result = await fetchFiscalApi('/contingency', {
      method: 'POST',
      body: JSON.stringify({
        enabled: Boolean(document.getElementById('fiscalContingencyEnabled')?.checked),
        mode: getVal('fiscalContingencyMode') || 'offline',
        reason: getVal('fiscalContingencyReason'),
        managerPin: getVal('fiscalManagerActionPin') || getManagerPinForAction('fiscal-event'),
      }),
    });
    STATE.cashier.fiscalStatus = result?.fiscalStatus || STATE.cashier.fiscalStatus;
    showToast('Contingencia atualizada.', 'success', 2400);
    await loadData();
    await loadCashier(true);
  } catch (error) {
    showToast(String(error?.message || 'Falha ao atualizar contingencia.'), 'error', 4200);
  }
}

async function printFiscalDocument(documentId) {
  const id = String(documentId ?? '').trim();
  if (!id) {
    showToast('Documento fiscal invalido para impressao.', 'error');
    return false;
  }

  const popup = window.open('', '_blank', getPrintWindowFeatures(STATE.autoPrint.profile));
  if (!popup) {
    showToast('Permita pop-up para imprimir a nota.', 'error', 3300);
    return false;
  }

  try {
    const doc = await getFiscalDocumentForPrint(id);
    if (!doc) {
      popup.close();
      showToast('Documento fiscal nao encontrado.', 'error');
      return false;
    }

    const payload = getFiscalDocumentPayload(doc);
    const isNfe55 = String(doc?.documentType || payload?.documentType || '').toLowerCase() === 'nfe';
    if (isNfe55) {
      popup.document.open();
      popup.document.write(buildDanfeA4Html(doc));
      popup.document.close();
      popup.focus();
      showToast('DANFE NF-e modelo 55 aberto para impressao.', 'success', 2200);
      return true;
    }

    const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
    const type = String(doc?.documentType || 'nfce').toUpperCase();
    const status = getFiscalDocumentStatusLabel(doc?.status);
    const title = `${type} ${status}`;
    const storeName = payload.issuer?.tradeName
      || payload.issuer?.corporateName
      || getStoreDisplayName(STATE.config?.storeName);
    const customerName = doc?.customerName || order.customerName || 'Consumidor final';

    popup.document.open();
    popup.document.write(
      buildThermalReceiptDocument({
        title,
        storeName,
        orderCode: getFiscalDocumentPrintableCode(doc),
        createdAt: formatOrderLogDate(doc?.createdAt || order.createdAt),
        customerName,
        profileId: STATE.autoPrint.profile,
        bodyHtml: buildFiscalDocumentPrintBodyHtml(doc),
        footerText: '',
        variant: 'fiscal',
      }),
    );
    popup.document.close();
    popup.focus();
    showToast('Nota aberta para impressao.', 'success', 1900);
    return true;
  } catch (error) {
    const message = String(error?.message || error);
    console.error('Falha ao imprimir documento fiscal.', error);
    try {
      popup.close();
    } catch {
      // Ignora falha ao fechar a janela de impressao.
    }
    showToast(`Falha ao abrir nota para impressao: ${message}`, 'error', 4200);
    return false;
  }
}

async function testFiscalConnection() {
  await saveFiscalSettings();
  const status = STATE.cashier.fiscalStatus || {};
  const missing = (status.requirements || []).filter((item) => !item.ok).map((item) => item.label);
  if (missing.length) {
    showToast(`Fiscal pendente: ${missing.slice(0, 3).join(', ')}`, 'error', 5200);
    return;
  }
  if (status.configuredForSefaz && !status.transmissionEnabled) {
    showToast('Configuracao SEFAZ pronta para conferencia. Envio real continua bloqueado.', 'info', 5200);
    return;
  }
  const sefazStatus = STATE.cashier.sefazStatus || {};
  const mode = getEmissionModeLabel(sefazStatus);
  showToast(`Configuracao basica OK. Modo atual: ${mode}.`, 'info', 5200);
}

/* ==========================================================
   EMISSÃO DE NOTA FISCAL MODELO 55 (NF-E) NO CAIXA
   ========================================================== */

function isOrderAccepted(order) {
  if (!order || typeof order !== 'object') return false;
  if (isOrderPendingConfirmation(order)) return false;
  const status = String(order.operationalStatus || order.status || '').toLowerCase();
  return status !== 'cancelled' && status !== 'rejected';
}

function openEmitirNota55Modal(preselectedOrderId = null) {
  try {
    const overlay = document.getElementById('nfe55Overlay');
    const select = document.getElementById('nfe55OrderSelect');
    if (!overlay || !select) {
      console.warn('nfe55Overlay ou nfe55OrderSelect nao encontrado no DOM');
      return;
    }

    const orders = Array.isArray(STATE.orderLogs) ? STATE.orderLogs : [];
    const eligibleOrders = orders.filter((order) => {
      if (!order || !order.id) return false;
      const doc = getCashierOrderFiscalDoc(order.id);
      return isOrderAccepted(order) && (!doc || doc.status !== 'authorized');
    });

    select.innerHTML = '';
    if (!eligibleOrders.length) {
      select.innerHTML = '<option value="">Nenhum pedido elegivel para emissao no momento</option>';
    } else {
      select.innerHTML = '<option value="">-- Selecione uma comanda ou pedido --</option>' + eligibleOrders.map((order) => {
        const id = String(order.id);
        const code = order.orderCode || `PED-${id}`;
        const comanda = order.table || order.comanda || order.metadata?.table || '-';
        const customer = order.customerName || 'Cliente';
        const total = formatCurrency(order.totals?.total || 0);
        const doc = getCashierOrderFiscalDoc(order.id);
        const docInfo = doc ? ` [${doc.documentType.toUpperCase()}: ${getFiscalDocumentStatusLabel(doc.status)}]` : '';
        return `<option value="${id}">${escapeHtml(`${code} | Comanda/Mesa: ${comanda} | ${customer} | ${total}${docInfo}`)}</option>`;
      }).join('');
    }

    if (preselectedOrderId && eligibleOrders.some((o) => String(o.id) === String(preselectedOrderId))) {
      select.value = String(preselectedOrderId);
    } else if (preselectedOrderId) {
      const specificOrder = orders.find((o) => String(o?.id) === String(preselectedOrderId));
      if (specificOrder) {
        const id = String(specificOrder.id);
        const code = specificOrder.orderCode || `PED-${id}`;
        const comanda = specificOrder.table || specificOrder.comanda || specificOrder.metadata?.table || '-';
        const customer = specificOrder.customerName || 'Cliente';
        const total = formatCurrency(specificOrder.totals?.total || 0);
        select.insertAdjacentHTML('afterbegin', `<option value="${id}">${escapeHtml(`${code} | Comanda/Mesa: ${comanda} | ${customer} | ${total}`)}</option>`);
        select.value = id;
      }
    } else if (eligibleOrders.length === 1) {
      select.value = String(eligibleOrders[0].id);
    }

    const freightCheck = document.getElementById('nfe55IncludeFreight');
    if (freightCheck) freightCheck.checked = false;
    const freightFields = document.getElementById('nfe55FreightFields');
    if (freightFields) freightFields.style.display = 'none';
    const freightAmountInput = document.getElementById('nfe55FreightAmount');
    if (freightAmountInput) freightAmountInput.value = '';

    handleNfe55OrderSelectionChange();

    overlay.classList.add('open');
    overlay.style.display = 'flex';
    select.focus();
  } catch (err) {
    console.error('Falha ao abrir modal da NF-e 55:', err);
    showToast(`Erro ao abrir modal da NF-e 55: ${err.message}`, 'error', 5000);
  }
}

function closeNfe55Modal() {
  const overlay = document.getElementById('nfe55Overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.style.display = 'none';
  }
}

function handleNfe55OverlayClick(event) {
  if (event.target && event.target.id === 'nfe55Overlay') {
    closeNfe55Modal();
  }
}

function handleNfe55OrderSelectionChange() {
  const select = document.getElementById('nfe55OrderSelect');
  const preview = document.getElementById('nfe55OrderPreview');
  const orderId = select?.value;
  if (!orderId) {
    if (preview) preview.innerHTML = '<div class="empty-state-sm">Selecione uma comanda ou pedido acima para visualizar os dados.</div>';
    const freightBox = document.getElementById('nfe55FreightBox');
    if (freightBox) freightBox.style.display = 'none';
    return;
  }

  const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
  if (!order) return;

  const doc = getCashierOrderFiscalDoc(order.id);
  const delivery = Number(order.totals?.delivery || 0);

  const freightBox = document.getElementById('nfe55FreightBox');
  const freightCheck = document.getElementById('nfe55IncludeFreight');
  const freightFields = document.getElementById('nfe55FreightFields');
  const freightAmountInput = document.getElementById('nfe55FreightAmount');
  const freightHint = document.getElementById('nfe55FreightHint');

  if (freightBox) freightBox.style.display = 'block';
  if (freightCheck) freightCheck.checked = false;
  if (freightFields) freightFields.style.display = 'none';
  if (freightAmountInput) {
    freightAmountInput.value = delivery > 0 ? delivery.toFixed(2) : '0.00';
  }
  if (freightHint) {
    freightHint.textContent = delivery > 0
      ? `(Taxa de entrega registrada no pedido: R$ ${delivery.toFixed(2).replace('.', ',')})`
      : '(Informe o valor do frete caso deseje somar à nota)';
  }

  updateNfe55PreviewTotals();

  const fieldsToReset = [
    'nfe55Doc', 'nfe55Name', 'nfe55Phone', 'nfe55Email', 'nfe55Ie',
    'nfe55Cep', 'nfe55Street', 'nfe55Number', 'nfe55Complement',
    'nfe55Neighborhood', 'nfe55City', 'nfe55Uf', 'nfe55CityCode'
  ];
  fieldsToReset.forEach((id) => setVal(id, ''));

  const pjRadio = document.querySelector('input[name="nfe55PersonType"][value="PJ"]');
  const pfRadio = document.querySelector('input[name="nfe55PersonType"][value="PF"]');

  if (doc) {
    const pConsumer = getFiscalDocumentPayload(doc)?.consumer;
    if (pConsumer?.document) {
      const isPJ = String(pConsumer.document).replace(/\D/g, '').length > 11;
      if (isPJ && pjRadio) pjRadio.checked = true;
      else if (pfRadio) pfRadio.checked = true;
      handleNfe55PersonTypeChange();
      setVal('nfe55Doc', pConsumer.document);
      const docInput = document.getElementById('nfe55Doc');
      if (docInput) maskNfe55Doc(docInput);
    } else {
      if (pfRadio) pfRadio.checked = true;
      handleNfe55PersonTypeChange();
    }
    if (pConsumer?.name) setVal('nfe55Name', pConsumer.name);
    if (pConsumer?.phone) {
      setVal('nfe55Phone', pConsumer.phone);
      const phoneInput = document.getElementById('nfe55Phone');
      if (phoneInput) maskNfe55Phone(phoneInput);
    }
    if (pConsumer?.email) setVal('nfe55Email', pConsumer.email);
    if (pConsumer?.indIEDest) {
      setVal('nfe55IndIEDest', pConsumer.indIEDest);
      handleNfe55IndIEChange();
    }
    if (pConsumer?.ie) setVal('nfe55Ie', pConsumer.ie);
    if (pConsumer?.address?.street) {
      setVal('nfe55Cep', pConsumer.address.cep || '');
      setVal('nfe55Street', pConsumer.address.street || '');
      setVal('nfe55Number', pConsumer.address.number || '');
      setVal('nfe55Complement', pConsumer.address.complement || '');
      setVal('nfe55Neighborhood', pConsumer.address.neighborhood || '');
      setVal('nfe55City', pConsumer.address.city || '');
      setVal('nfe55Uf', pConsumer.address.uf || '');
      setVal('nfe55CityCode', pConsumer.address.cityCode || '');
      const cepEl = document.getElementById('nfe55Cep');
      if (cepEl) maskNfe55Cep(cepEl);
    }
  } else {
    if (order.customerDocument) {
      const isPJ = String(order.customerDocument).replace(/\D/g, '').length > 11;
      if (isPJ && pjRadio) pjRadio.checked = true;
      else if (pfRadio) pfRadio.checked = true;
      handleNfe55PersonTypeChange();
      setVal('nfe55Doc', order.customerDocument);
      const docInput = document.getElementById('nfe55Doc');
      if (docInput) maskNfe55Doc(docInput);
    } else {
      if (pfRadio) pfRadio.checked = true;
      handleNfe55PersonTypeChange();
    }
    if (order.customerName) setVal('nfe55Name', order.customerName);
    if (order.customerPhone) {
      setVal('nfe55Phone', order.customerPhone);
      const phoneInput = document.getElementById('nfe55Phone');
      if (phoneInput) maskNfe55Phone(phoneInput);
    }
    if (order.deliveryAddress) {
      setVal('nfe55Street', String(order.deliveryAddress).slice(0, 60));
    }
  }

  const defaultMethod = getOrderDefaultPaymentMethod(order);
  const payMethodSelect = document.getElementById('nfe55PaymentMethod');
  if (payMethodSelect && defaultMethod) payMethodSelect.value = defaultMethod;

  const opSelect = document.getElementById('nfe55FiscalOp');
  if (opSelect) {
    opSelect.value = normalizeCashierFiscalOperation(order.orderType, 'consumo_local');
  }
}

function handleNfe55FreightToggle() {
  const freightCheck = document.getElementById('nfe55IncludeFreight');
  const freightFields = document.getElementById('nfe55FreightFields');
  const freightAmountInput = document.getElementById('nfe55FreightAmount');
  const isChecked = Boolean(freightCheck?.checked);

  if (freightFields) {
    freightFields.style.display = isChecked ? 'flex' : 'none';
  }
  if (isChecked) {
    const orderId = document.getElementById('nfe55OrderSelect')?.value;
    const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
    const delivery = Number(order?.totals?.delivery || 0);
    if ((!freightAmountInput?.value || Number(freightAmountInput.value) <= 0) && delivery > 0) {
      freightAmountInput.value = delivery.toFixed(2);
    }
    freightAmountInput?.focus();
  }
  updateNfe55PreviewTotals();
}

function handleNfe55FreightAmountChange() {
  updateNfe55PreviewTotals();
}

function updateNfe55PreviewTotals() {
  const select = document.getElementById('nfe55OrderSelect');
  const preview = document.getElementById('nfe55OrderPreview');
  const orderId = select?.value;
  if (!orderId || !preview) return;

  const order = (STATE.orderLogs || []).find((item) => String(item?.id) === String(orderId));
  if (!order) return;

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsText = items.map((i) => `${i.quantity || 1}x ${i.name || 'Item'}`).join(', ') || 'Nenhum item listado';
  const subtotal = Number(order.totals?.subtotal || items.reduce((s, it) => s + (Number(it.unitPrice || it.price || 0) * Number(it.quantity || 1)), 0));
  const isFreightIncluded = Boolean(document.getElementById('nfe55IncludeFreight')?.checked);
  const freightAmount = isFreightIncluded ? Math.max(0, Number(document.getElementById('nfe55FreightAmount')?.value || 0)) : 0;
  const noteTotal = subtotal + freightAmount;
  const doc = getCashierOrderFiscalDoc(order.id);
  const isPaid = isCashierOrderPaid(order);

  preview.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
      <strong>${escapeHtml(order.orderCode || `PED-${order.id}`)}</strong>
      <div style="text-align:right;">
        <strong style="color:var(--primary, #c0392b); font-size:1.05rem;">${formatCurrency(noteTotal)}</strong>
        ${isFreightIncluded && freightAmount > 0 ? `<div style="font-size:0.75rem; color:var(--text-2, #64748b);">Produtos: ${formatCurrency(subtotal)} + Frete: ${formatCurrency(freightAmount)}</div>` : ''}
      </div>
    </div>
    <div style="color:var(--text-2, #6b7280); font-size:0.8rem; margin-bottom:4px;">
      <strong>Itens:</strong> ${escapeHtml(itemsText)}
    </div>
    <div style="display:flex; gap:12px; font-size:0.78rem;">
      <span><strong>Caixa:</strong> ${isPaid ? 'Pago' : 'Aberto'}</span>
      <span><strong>Cliente:</strong> ${escapeHtml(order.customerName || 'Nao informado')}</span>
      ${doc ? `<span><strong>Nota atual:</strong> ${escapeHtml(doc.documentType.toUpperCase())} (${escapeHtml(getFiscalDocumentStatusLabel(doc.status))})</span>` : ''}
    </div>
  `;
}

function handleNfe55PersonTypeChange() {
  const isPJ = document.querySelector('input[name="nfe55PersonType"]:checked')?.value === 'PJ';
  const docLabel = document.getElementById('nfe55DocLabel');
  const docInput = document.getElementById('nfe55Doc');
  const nameLabel = document.getElementById('nfe55NameLabel');
  const nameInput = document.getElementById('nfe55Name');

  if (isPJ) {
    if (docLabel) docLabel.textContent = 'CNPJ do Destinatario *';
    if (docInput) docInput.placeholder = '00.000.000/0000-00';
    if (nameLabel) nameLabel.textContent = 'Razao Social *';
    if (nameInput) nameInput.placeholder = 'Razao Social da Empresa';
  } else {
    if (docLabel) docLabel.textContent = 'CPF do Destinatario *';
    if (docInput) docInput.placeholder = '000.000.000-00';
    if (nameLabel) nameLabel.textContent = 'Nome Completo *';
    if (nameInput) nameInput.placeholder = 'Nome Completo do Cliente';
  }
  if (docInput) maskNfe55Doc(docInput);
}

function handleNfe55IndIEChange() {
  const indIE = document.getElementById('nfe55IndIEDest')?.value;
  const ieInput = document.getElementById('nfe55Ie');
  if (!ieInput) return;
  if (indIE === '1') {
    ieInput.disabled = false;
    ieInput.focus();
  } else {
    ieInput.disabled = true;
    ieInput.value = '';
  }
}

function maskNfe55Doc(input) {
  if (!input) return;
  const isPJ = document.querySelector('input[name="nfe55PersonType"]:checked')?.value === 'PJ';
  let v = input.value.replace(/\D/g, '');
  if (isPJ) {
    v = v.slice(0, 14);
    if (v.length > 12) {
      v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/, '$1.$2.$3/$4-$5');
    } else if (v.length > 8) {
      v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})$/, '$1.$2.$3/$4');
    } else if (v.length > 5) {
      v = v.replace(/^(\d{2})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{1,3})$/, '$1.$2');
    }
    input.maxLength = 18;
  } else {
    v = v.slice(0, 11);
    if (v.length > 9) {
      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
    } else if (v.length > 6) {
      v = v.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    } else if (v.length > 3) {
      v = v.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
    }
    input.maxLength = 14;
  }
  input.value = v;
}

function maskNfe55Cep(input) {
  if (!input) return;
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
  input.value = v;
}

function maskNfe55Phone(input) {
  if (!input) return;
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else if (v.length > 5) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  }
  input.value = v;
}

async function searchNfe55Cep(isUserClick = false) {
  const cepInput = document.getElementById('nfe55Cep');
  if (!cepInput) return;
  const rawCep = cepInput.value.replace(/\D/g, '');
  if (rawCep.length !== 8) {
    if (isUserClick) showToast('Informe um CEP com 8 digitos.', 'error');
    return;
  }

  const btn = document.getElementById('nfe55CepSearchBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Buscando...';
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha na consulta do CEP.');
    const data = await res.json();
    if (data.erro) {
      if (isUserClick) showToast('CEP nao encontrado.', 'error');
      return;
    }
    if (data.logradouro) setVal('nfe55Street', data.logradouro);
    if (data.bairro) setVal('nfe55Neighborhood', data.bairro);
    if (data.localidade) setVal('nfe55City', data.localidade);
    if (data.uf) setVal('nfe55Uf', data.uf.toUpperCase());
    if (data.ibge) setVal('nfe55CityCode', data.ibge);

    showToast(`Endereco localizado: ${data.localidade}/${data.uf}`, 'success', 2200);
    document.getElementById('nfe55Number')?.focus();
  } catch (error) {
    console.warn('Falha ao consultar CEP no ViaCEP:', error);
    if (isUserClick) showToast('Nao foi possivel consultar o CEP automaticamente. Preencha manualmente.', 'info', 4000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Buscar CEP';
    }
  }
}

async function submitNfe55(action) {
  const select = document.getElementById('nfe55OrderSelect');
  const orderId = Number(select?.value || 0);
  if (!orderId) {
    showToast('Selecione uma comanda ou pedido.', 'error');
    select?.focus();
    return;
  }

  const docInput = document.getElementById('nfe55Doc');
  const docDigits = String(docInput?.value || '').replace(/\D/g, '');
  if (![11, 14].includes(docDigits.length)) {
    showToast('Informe um CPF (11 digitos) ou CNPJ (14 digitos) valido do destinatario.', 'error', 3600);
    docInput?.focus();
    return;
  }

  const nameInput = document.getElementById('nfe55Name');
  const name = String(nameInput?.value || '').trim();
  if (!name) {
    showToast('Informe a Razao Social ou Nome do destinatario.', 'error', 3600);
    nameInput?.focus();
    return;
  }

  const cepDigits = String(getVal('nfe55Cep')).replace(/\D/g, '');
  if (cepDigits.length !== 8) {
    showToast('Informe um CEP valido com 8 digitos (use "Buscar CEP" para preencher rapido).', 'error', 3600);
    document.getElementById('nfe55Cep')?.focus();
    return;
  }

  const street = String(getVal('nfe55Street')).trim();
  const number = String(getVal('nfe55Number')).trim();
  const neighborhood = String(getVal('nfe55Neighborhood')).trim();
  const city = String(getVal('nfe55City')).trim();
  const uf = String(getVal('nfe55Uf')).trim().toUpperCase();
  const cityCode = String(getVal('nfe55CityCode')).replace(/\D/g, '');

  if (!street || !number || !neighborhood || !city || uf.length !== 2 || cityCode.length !== 7) {
    showToast('Preencha o endereco completo com Codigo IBGE de 7 digitos (use "Buscar CEP" para preencher rapido).', 'error', 4500);
    if (!street) document.getElementById('nfe55Street')?.focus();
    else if (!number) document.getElementById('nfe55Number')?.focus();
    else if (!cityCode || cityCode.length !== 7) document.getElementById('nfe55CityCode')?.focus();
    return;
  }

  const indIEDest = document.getElementById('nfe55IndIEDest')?.value || '9';
  const ieDigits = String(getVal('nfe55Ie')).replace(/\D/g, '');
  if (indIEDest === '1' && !ieDigits) {
    showToast('Contribuinte ICMS exige Inscricao Estadual informada.', 'error');
    document.getElementById('nfe55Ie')?.focus();
    return;
  }

  const email = String(getVal('nfe55Email')).trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Informe um e-mail valido para envio da nota.', 'error');
    document.getElementById('nfe55Email')?.focus();
    return;
  }

  const phone = String(getVal('nfe55Phone')).replace(/\D/g, '');
  const paymentMethod = normalizeCashierPaymentMethod(getVal('nfe55PaymentMethod'), 'outro');
  const fiscalOperationType = normalizeCashierFiscalOperation(getVal('nfe55FiscalOp'), 'consumo_local');

  const consumer = {
    name,
    document: docDigits,
    ie: ieDigits,
    indIEDest,
    email,
    phone,
    address: {
      cep: String(getVal('nfe55Cep')).replace(/\D/g, ''),
      street,
      number,
      complement: String(getVal('nfe55Complement')).trim(),
      neighborhood,
      city,
      uf,
      cityCode,
    },
  };

  const draftBtn = document.getElementById('nfe55DraftBtn');
  const transmitBtn = document.getElementById('nfe55TransmitBtn');
  if (draftBtn) draftBtn.disabled = true;
  if (transmitBtn) transmitBtn.disabled = true;

  const includeFreight = Boolean(document.getElementById('nfe55IncludeFreight')?.checked);
  const freight = includeFreight ? Math.max(0, Number(document.getElementById('nfe55FreightAmount')?.value || 0)) : 0;

  try {
    showToast(action === 'transmit' ? 'Criando e transmitindo NF-e 55...' : 'Pre-validando rascunho de NF-e 55...', 'info', 3000);

    const draftRes = await fetchFiscalApi('/documents', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        documentType: 'nfe',
        environment: STATE.fiscal?.environment || 'homologacao',
        paymentMethod,
        paymentLabel: getPaymentMethodLabel(paymentMethod),
        fiscalOperationType,
        consumerDocument: docDigits,
        consumer,
        replaceDraft: true,
        includeFreight,
        freight,
        managerPin: getManagerPinForAction('fiscal-transmit'),
      }),
    });

    const doc = draftRes?.document;
    if (!doc || !doc.id) throw new Error('Nao foi possivel gerar o rascunho da NF-e 55.');

    if (action === 'draft') {
      showToast('NF-e modelo 55 pre-validada com sucesso! Voce pode transmiti-la a qualquer momento.', 'success', 4000);
      closeNfe55Modal();
      await loadCashier(true);
      return;
    }

    const transmitRes = await fetchFiscalApi(`/documents/${encodeURIComponent(doc.id)}/transmit`, {
      method: 'POST',
      body: JSON.stringify({
        paymentMethod,
        paymentLabel: getPaymentMethodLabel(paymentMethod),
        fiscalOperationType,
        consumer,
        includeFreight,
        freight,
        managerPin: getManagerPinForAction('fiscal-transmit'),
      }),
    });

    const transmittedDoc = transmitRes?.document || doc;
    const isAuth = String(transmittedDoc?.status || '').toLowerCase() === 'authorized';

    if (isAuth) {
      showToast('NF-e modelo 55 autorizada pela SEFAZ com sucesso!', 'success', 4500);
      closeNfe55Modal();
      await loadCashier(true);
      if (window.confirm('NF-e modelo 55 autorizada pela SEFAZ com sucesso!\n\nDeseja abrir o DANFE A4 para impressao / salvar em PDF agora?')) {
        await printFiscalDocument(transmittedDoc.id);
      }
    } else {
      const errMsg = transmittedDoc?.error || transmitRes?.message || 'A SEFAZ nao autorizou o documento.';
      showToast(`SEFAZ: ${errMsg}`, 'error', 7000);
      closeNfe55Modal();
      await loadCashier(true);
    }
  } catch (error) {
    console.error('Falha ao processar NF-e 55:', error);
    showToast(String(error?.message || 'Falha ao emitir NF-e modelo 55.'), 'error', 5500);
  } finally {
    if (draftBtn) draftBtn.disabled = false;
    if (transmitBtn) transmitBtn.disabled = false;
  }
}

function generateDanfeBarcodeSvg(accessKey) {
  const digits = String(accessKey || '').replace(/\D/g, '');
  if (digits.length !== 44) return '';
  const patterns = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];
  const codes = [105];
  for (let i = 0; i < digits.length; i += 2) {
    codes.push(Number.parseInt(digits.slice(i, i + 2), 10));
  }
  let chk = codes[0];
  for (let i = 1; i < codes.length; i++) {
    chk += i * codes[i];
  }
  codes.push(chk % 103);
  codes.push(106);

  let modules = '';
  for (const c of codes) {
    const p = patterns[c];
    if (!p) continue;
    let bar = true;
    for (let j = 0; j < p.length; j++) {
      modules += (bar ? '1' : '0').repeat(Number.parseInt(p[j], 10));
      bar = !bar;
    }
  }

  const rects = [];
  let x = 0;
  const height = 38;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === '1') {
      rects.push(`<rect x="${x}" y="0" width="1" height="${height}" fill="#000"/>`);
    }
    x += 1;
  }
  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" style="width:96%; max-width:280px; height:${height}px; display:block; margin:2px auto;">${rects.join('')}</svg>`;
}

function formatFiscalItemProductCode(rawCode, itemNumber, index = 0) {
  const code = String(rawCode || '').trim();
  const fallback = String(itemNumber || index + 1).padStart(3, '0');
  if (!code || code === '-') return fallback;
  if (code.includes('/')) return fallback;
  if (/^(p-|pizza-|prod-|item-)/i.test(code)) return fallback;
  if (code.length > 8 || /^p-\d+/i.test(code)) return fallback;
  return code;
}

function buildDanfeA4Html(doc) {
  const getPayload = (d) => {
    if (!d) return {};
    if (typeof d.payload === 'object' && d.payload !== null) return d.payload;
    if (typeof d.payload === 'string') {
      try { return JSON.parse(d.payload); } catch {}
    }
    if (typeof d.payload_json === 'string') {
      try { return JSON.parse(d.payload_json); } catch {}
    }
    return {};
  };

  const payload = getPayload(doc);
  const issuer = payload.issuer && typeof payload.issuer === 'object' ? payload.issuer : {};
  const issuerAddress = issuer.address && typeof issuer.address === 'object' ? issuer.address : {};
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  const payment = payload.payment && typeof payload.payment === 'object'
    ? payload.payment
    : (order.payment && typeof order.payment === 'object' ? order.payment : {});
  const consumer = payload.consumer && typeof payload.consumer === 'object' ? payload.consumer : {};
  const consumerAddress = consumer.address && typeof consumer.address === 'object' ? consumer.address : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const totals = payload.totals && typeof payload.totals === 'object' ? payload.totals : {};
  const nfe = payload.nfe && typeof payload.nfe === 'object' ? payload.nfe : {};

  const vFrete = Number(payload.freight || totals.vFrete || order.freight || (payload.totals?.vFrete) || 0);
  const itemsSubtotal = items.reduce((sum, it) => sum + Number(it.subtotal || (Number(it.quantity || 1) * Number(it.unitPrice || it.price || 0)) || 0), 0);
  const total = Number(doc?.total || totals.total || totals.vNF || (vFrete > 0 ? itemsSubtotal + vFrete : order.totals?.total) || nfe.total || 0);
  const vProd = Number(totals.vProd || (vFrete > 0 && total >= vFrete ? total - vFrete : (itemsSubtotal > 0 ? itemsSubtotal : total)));
  const number = String(doc?.number || '1').trim();
  const formattedNumber = number.padStart(9, '0');
  const formattedNumberDisplay = formattedNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3');
  const series = String(doc?.series || '1').trim().padStart(3, '0');
  const accessKey = String(doc?.access_key || doc?.accessKey || nfe?.accessKey || '').replace(/\D/g, '');
  const formattedKey = accessKey.replace(/(\d{4})/g, '$1 ').trim();
  const protocol = String(doc?.protocol || nfe?.protocol || '').trim();
  const authDate = doc?.updated_at || doc?.updatedAt || doc?.created_at || doc?.createdAt || new Date().toISOString();
  const issuedAt = doc?.created_at || doc?.createdAt || nfe?.issuedAt || new Date().toISOString();
  const storeName = issuer.tradeName || 'MORADA DA PIZZA';
  const corporateName = issuer.corporateName || 'MICAELE APARECIDA DA SILVA LTDA';
  const xmlContent = nfe?.procXml || nfe?.signedXml || '';

  const consumerName = consumer.name || doc?.customer_name || doc?.customerName || order.customerName || 'CONSUMIDOR';
  const consumerPhone = consumer.phone || consumerAddress.phone || '';
  const consumerIe = consumer.ie || (String(consumer.indIEDest || '') === '2' ? 'ISENTO' : 'NÃO CONTRIBUINTE');
  const rawPayMethod = String(payment.method || payment.label || '').trim().toLowerCase();
  const payMethodMap = {
    pix: 'PIX',
    dinheiro: 'DINHEIRO',
    cash: 'DINHEIRO',
    cartao_credito: 'CARTÃO DE CRÉDITO',
    credito: 'CARTÃO DE CRÉDITO',
    credit: 'CARTÃO DE CRÉDITO',
    cartao_debito: 'CARTÃO DE DÉBITO',
    debito: 'CARTÃO DE DÉBITO',
    debit: 'CARTÃO DE DÉBITO',
    cartao: 'CARTÃO',
  };
  const payMethodDisplay = payMethodMap[rawPayMethod] || (payment.label ? String(payment.label).toUpperCase() : 'PIX');
  const orderRefText = order.customerName
    ? `Pedido ${String(order.customerName).trim().replace(/\.+$/, '')}.`
    : (order.orderCode ? `Pedido ${String(order.orderCode).trim()}.` : '');
  const fedTax = (total * 0.042).toFixed(2).replace('.', ',');
  const estTax = (total * 0.07).toFixed(2).replace('.', ',');

  const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

  const formatDoc = (d) => {
    const digits = String(d || '').replace(/\D/g, '');
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    return d || '-';
  };
  const formatCep = (c) => {
    const digits = String(c || '').replace(/\D/g, '');
    if (digits.length === 8) return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    return c || '-';
  };
  const formatDateBr = (dt) => {
    try {
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return '-';
    }
  };

  const generateBarcodeSvg = (key) => {
    const digits = String(key || '').replace(/\D/g, '');
    if (digits.length !== 44) return '';
    const C128_PATTERNS = [
      "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
      "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
      "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
      "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
      "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
      "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
      "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
      "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
      "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
      "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
      "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
    ];
    const START_C = 105;
    const STOP = 106;
    const pairs = [];
    for (let i = 0; i < 44; i += 2) {
      pairs.push(parseInt(digits.substr(i, 2), 10));
    }
    let chk = START_C;
    for (let i = 0; i < pairs.length; i++) {
      chk += pairs[i] * (i + 1);
    }
    chk = chk % 103;
    const symbols = [START_C].concat(pairs, [chk, STOP]);
    const patternStr = symbols.map(s => C128_PATTERNS[s]).join('');
    const rects = [];
    let x = 0;
    const height = 38;
    let isBar = true;
    for (let i = 0; i < patternStr.length; i++) {
      const w = parseInt(patternStr[i], 10);
      if (isBar) {
        rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`);
      }
      x += w;
      isBar = !isBar;
    }
    return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" style="width:100%; max-width:280px; height:${height}px; display:block; margin:1px auto;">${rects.join('')}</svg>`;
  };

  const barcodeSvg = generateBarcodeSvg(accessKey);

  const itemsRows = items.map((item, idx) => {
    const qty = Number(item.quantity || 1).toFixed(2);
    const unitPrice = Number(item.unitPrice || item.price || 0).toFixed(2);
    const subtotal = Number(item.subtotal || (Number(qty) * Number(unitPrice)) || 0).toFixed(2);
    const aliq = Number(item.aliquotaIcms || 0).toFixed(2);
    return `
      <tr>
        <td style="border:1px solid #000; text-align:center; padding:1.5px 2px;">${escapeHtml(formatFiscalItemProductCode(item.productCode, item.itemNumber, idx))}</td>
        <td style="border:1px solid #000; text-align:left; font-weight:bold; padding:1.5px 4px;">${escapeHtml(item.name || item.displayName || 'Item')}</td>
        <td style="border:1px solid #000; text-align:center; padding:1.5px 2px;">${escapeHtml(item.ncm || '21069090')}</td>
        <td style="border:1px solid #000; text-align:center; padding:1.5px 2px;">${escapeHtml(item.csosn || item.cst || '102')}</td>
        <td style="border:1px solid #000; text-align:center; padding:1.5px 2px;">${escapeHtml(item.cfop || '5102')}</td>
        <td style="border:1px solid #000; text-align:center; padding:1.5px 2px;">${escapeHtml(item.unit || 'UN')}</td>
        <td style="border:1px solid #000; text-align:right; padding:1.5px 3px;">${qty}</td>
        <td style="border:1px solid #000; text-align:right; padding:1.5px 3px;">${unitPrice}</td>
        <td style="border:1px solid #000; text-align:right; font-weight:bold; padding:1.5px 3px;">${subtotal}</td>
        <td style="border:1px solid #000; text-align:right; padding:1.5px 2px;">0,00</td>
        <td style="border:1px solid #000; text-align:right; padding:1.5px 2px;">0,00</td>
        <td style="border:1px solid #000; text-align:right; padding:1.5px 2px;">${aliq}%</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFE - NF-e ${formattedNumberDisplay}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 4mm 5mm 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7pt;
      line-height: 1.15;
      color: #000;
      margin: 0;
      padding: 6px;
      background: #fff;
    }
    .danfe-root {
      width: 100%;
      max-width: 200mm;
      margin: 0 auto;
    }
    table.box {
      width: 100%;
      border-collapse: collapse !important;
      table-layout: fixed;
      margin-bottom: 2px !important;
      border: 1px solid #000 !important;
    }
    table.box td, table.box th {
      border: 1px solid #000 !important;
      padding: 2px 4px !important;
      vertical-align: top;
      overflow: hidden;
    }
    .sec-title {
      background: #efefef !important;
      font-size: 5.5pt;
      font-weight: bold;
      text-transform: uppercase;
      padding: 1.5px 4px !important;
      border: 1px solid #000 !important;
      border-bottom: none !important;
      letter-spacing: 0.03em;
      margin-top: 2px;
    }
    .lbl {
      font-size: 4.8pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #000;
      display: block;
      margin-bottom: 1px;
      line-height: 1;
    }
    .val {
      font-size: 7.2pt;
      font-weight: bold;
      color: #000;
      display: block;
      word-break: break-word;
      line-height: 1.15;
    }
    .val-sm {
      font-size: 6.2pt;
      font-weight: normal;
      color: #000;
      display: block;
      line-height: 1.15;
    }
    .no-print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      color: #fff;
      padding: 8px 14px;
      margin-bottom: 10px;
      border-radius: 4px;
      font-family: system-ui, sans-serif;
    }
    .no-print-bar button {
      padding: 6px 12px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      border: none;
      font-size: 8pt;
      font-family: inherit;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <div>
      <span style="font-size:9.5pt; font-weight:bold; display:block;">DANFE Modelo 55 (NF-e Oficial Padrão SEFAZ)</span>
      <span style="font-size:7pt; color:#cbd5e1;">Para imprimir em folha A4 ou salvar em PDF, clique no botão ao lado.</span>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <button type="button" onclick="window.print()" style="background:#2563eb; color:#fff;" title="Imprimir em folha A4 ou Salvar como PDF">🖨️ Imprimir / Salvar em PDF</button>
      ${xmlContent ? `<button type="button" onclick="downloadXmlFile()" style="background:#059669; color:#fff;" title="Baixar arquivo XML oficial da NF-e">📥 Baixar XML Oficial</button>` : ''}
      <button type="button" onclick="window.close()" style="background:#475569; color:#fff;" title="Fechar visualização">✕ Fechar</button>
    </div>
  </div>

  <div class="danfe-root">

    <!-- 1. CABEÇALHO PRINCIPAL -->
    <table class="box" border="1" cellspacing="0" cellpadding="2">
      <tr>
        <!-- EMITENTE -->
        <td style="width:42%; padding:4px 6px;">
          <div style="font-size:10.5pt; font-weight:bold; text-transform:uppercase; margin-bottom:1px;">${escapeHtml(storeName.toUpperCase())}</div>
          <div style="font-size:7.5pt; font-weight:bold; text-transform:uppercase; margin-bottom:2px;">${escapeHtml(corporateName.toUpperCase())}</div>
          <div class="val-sm">${escapeHtml([issuerAddress.street, issuerAddress.number, issuerAddress.neighborhood].filter(Boolean).join(', '))}</div>
          <div class="val-sm">${escapeHtml([issuerAddress.city, issuerAddress.uf].filter(Boolean).join(' - '))}</div>
          <div class="val-sm">CEP: ${formatCep(issuerAddress.cep)} &nbsp; FONE: ${escapeHtml(issuerAddress.phone || '')}</div>
        </td>

        <!-- QUADRO DANFE -->
        <td style="width:19%; text-align:center; padding:3px 2px; vertical-align:middle;">
          <div style="font-size:13pt; font-weight:bold; letter-spacing:0.04em; line-height:1;">DANFE</div>
          <div style="font-size:5.2pt; font-weight:bold; text-transform:uppercase; margin-top:2px; line-height:1.1;">DOCUMENTO AUXILIAR DA<br>NOTA FISCAL ELETRÔNICA</div>
          <div style="display:flex; justify-content:center; align-items:center; gap:5px; margin:3px 0;">
            <div style="font-size:6.2pt; font-weight:bold; line-height:1.1; text-align:left;">0 - ENTRADA<br>1 - SAÍDA</div>
            <div style="border:1px solid #000; padding:1px 6px; font-weight:bold; font-size:8pt;">1</div>
          </div>
          <div style="font-size:8.5pt; font-weight:bold;">Nº: ${formattedNumberDisplay}</div>
          <div style="font-size:8pt; font-weight:bold;">SÉRIE: ${series}</div>
          <div style="font-size:6pt; font-weight:bold; margin-top:1px;">PÁGINA 1/1</div>
        </td>

        <!-- CONTROLE DO FISCO / CÓDIGO DE BARRAS -->
        <td style="width:39%; padding:3px 4px; text-align:center;">
          <div style="font-size:5.5pt; font-weight:bold; text-transform:uppercase; margin-bottom:1px;">CONTROLE DO FISCO</div>
          ${barcodeSvg}
          <div style="border-top:1px solid #000; padding-top:2px; margin-top:2px; text-align:left;">
            <span class="lbl">CHAVE DE ACESSO PARA CONSULTA DE AUTENTICIDADE NO SITE WWW.NFE.FAZENDA.GOV.BR</span>
            <span style="font-size:7.2pt; font-weight:bold; font-family:'Courier New', monospace; letter-spacing:0.04em; display:block; margin:1px 0 2px;">
              ${formattedKey}
            </span>
            <div style="border-top:1px solid #000; padding-top:2px;">
              <span class="lbl">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
              <span style="font-size:7.2pt; font-weight:bold; display:block;">
                ${escapeHtml(protocol)} - ${formatDateBr(authDate)}
              </span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="3" style="padding:0;">
          <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
            <tr>
              <td style="width:42%; border-left:none; border-bottom:none;">
                <span class="lbl">NATUREZA DA OPERAÇÃO</span>
                <span class="val">${escapeHtml(payload.nature || 'VENDA DE MERCADORIA')}</span>
              </td>
              <td style="width:19%; border-bottom:none;">
                <span class="lbl">INSCRIÇÃO ESTADUAL</span>
                <span class="val">${escapeHtml(issuer.ie || '-')}</span>
              </td>
              <td style="width:19%; border-bottom:none;">
                <span class="lbl">INSC. EST. DO SUBST. TRIB.</span>
                <span class="val">-</span>
              </td>
              <td style="width:20%; border-right:none; border-bottom:none;">
                <span class="lbl">CNPJ</span>
                <span class="val">${formatDoc(issuer.cnpj)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- 2. DESTINATÁRIO / REMETENTE -->
    <div class="sec-title">DESTINATÁRIO / REMETENTE</div>
    <div style="border:1px solid #000; margin-bottom:2px;">
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:65%; border-left:none; border-top:none;">
            <span class="lbl">NOME / RAZÃO SOCIAL</span>
            <span class="val">${escapeHtml(consumerName)}</span>
          </td>
          <td style="width:20%; border-top:none;">
            <span class="lbl">CNPJ / CPF</span>
            <span class="val">${formatDoc(consumer.document)}</span>
          </td>
          <td style="width:15%; border-right:none; border-top:none;">
            <span class="lbl">DATA DA EMISSÃO</span>
            <span class="val">${formatDateBr(issuedAt).split(' ')[0]}</span>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:50%; border-left:none; border-top:none;">
            <span class="lbl">ENDEREÇO</span>
            <span class="val">${escapeHtml([consumerAddress.street, consumerAddress.number, consumerAddress.complement].filter(Boolean).join(', ') || '-')}</span>
          </td>
          <td style="width:25%; border-top:none;">
            <span class="lbl">BAIRRO / DISTRITO</span>
            <span class="val">${escapeHtml(consumerAddress.neighborhood || '-')}</span>
          </td>
          <td style="width:10%; border-top:none;">
            <span class="lbl">CEP</span>
            <span class="val">${formatCep(consumerAddress.cep)}</span>
          </td>
          <td style="width:15%; border-right:none; border-top:none;">
            <span class="lbl">DATA DA SAÍDA/ENTRADA</span>
            <span class="val">${formatDateBr(issuedAt).split(' ')[0]}</span>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:42%; border-left:none; border-top:none; border-bottom:none;">
            <span class="lbl">MUNICÍPIO</span>
            <span class="val">${escapeHtml(consumerAddress.city || 'São Miguel do Araguaia')}</span>
          </td>
          <td style="width:18%; border-top:none; border-bottom:none;">
            <span class="lbl">FONE / FAX</span>
            <span class="val">${escapeHtml(consumerPhone)}</span>
          </td>
          <td style="width:5%; border-top:none; border-bottom:none;">
            <span class="lbl">UF</span>
            <span class="val">${escapeHtml(consumerAddress.uf || 'GO')}</span>
          </td>
          <td style="width:20%; border-top:none; border-bottom:none;">
            <span class="lbl">INSCRIÇÃO ESTADUAL</span>
            <span class="val">${escapeHtml(consumerIe)}</span>
          </td>
          <td style="width:15%; border-right:none; border-top:none; border-bottom:none;">
            <span class="lbl">HORA DA SAÍDA</span>
            <span class="val">${formatDateBr(issuedAt).split(' ')[1] || '-'}</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- 3. FATURA / DUPLICATA -->
    <div class="sec-title">FATURA / DUPLICATA</div>
    <table class="box" border="1" cellspacing="0" cellpadding="2">
      <tr>
        <td style="width:12%;">
          <span class="lbl">NÚMERO</span>
          <span class="val">001</span>
        </td>
        <td style="width:16%;">
          <span class="lbl">VENCIMENTO</span>
          <span class="val">${formatDateBr(issuedAt).split(' ')[0]}</span>
        </td>
        <td style="width:16%;">
          <span class="lbl">VALOR</span>
          <span class="val">R$ ${total.toFixed(2).replace('.', ',')}</span>
        </td>
        <td style="width:16%;">
          <span class="lbl">FORMA PAGAMENTO</span>
          <span class="val">${escapeHtml(payMethodDisplay)}</span>
        </td>
        <td style="width:40%;">
          <span class="lbl">CONDIÇÃO</span>
          <span class="val">PAGAMENTO À VISTA</span>
        </td>
      </tr>
    </table>

    <!-- 4. CÁLCULO DO IMPOSTO -->
    <div class="sec-title">CÁLCULO DO IMPOSTO</div>
    <table class="box" border="1" cellspacing="0" cellpadding="2">
      <tr>
        <td style="width:14%;">
          <span class="lbl">BASE DE CÁLC. ICMS</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td style="width:14%;">
          <span class="lbl">VALOR DO ICMS</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td style="width:14%;">
          <span class="lbl">BASE CÁLC. ICMS S.T.</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td style="width:14%;">
          <span class="lbl">VALOR DO ICMS S.T.</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td style="width:18%;">
          <span class="lbl">V. TOTAL PRODUTOS</span>
          <span class="val" style="text-align:right;">${vProd.toFixed(2).replace('.', ',')}</span>
        </td>
        <td style="width:26%;" rowspan="2">
          <span class="lbl">VALOR TOTAL DA NOTA</span>
          <span class="val" style="font-size:11pt; text-align:right; margin-top:4px;">R$ ${total.toFixed(2).replace('.', ',')}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="lbl">VALOR DO FRETE</span>
          <span class="val" style="text-align:right;">${vFrete.toFixed(2).replace('.', ',')}</span>
        </td>
        <td>
          <span class="lbl">VALOR DO SEGURO</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td>
          <span class="lbl">DESCONTO</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td>
          <span class="lbl">OUTRAS DESPESAS</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
        <td>
          <span class="lbl">VALOR DO IPI</span>
          <span class="val" style="text-align:right;">0,00</span>
        </td>
      </tr>
    </table>

    <!-- 5. TRANSPORTADOR / VOLUMES TRANSPORTADOS -->
    <div class="sec-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div style="border:1px solid #000; margin-bottom:2px;">
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:40%; border-left:none; border-top:none;">
            <span class="lbl">RAZÃO SOCIAL</span>
            <span class="val">SEM OCORRÊNCIA DE TRANSPORTE</span>
          </td>
          <td style="width:22%; border-top:none;">
            <span class="lbl">FRETE POR CONTA</span>
            <span class="val">${vFrete > 0 ? '0 - REMETENTE (CIF)' : '9 - SEM FRETE'}</span>
          </td>
          <td style="width:12%; border-top:none;">
            <span class="lbl">CÓDIGO ANTT</span>
            <span class="val">-</span>
          </td>
          <td style="width:12%; border-top:none;">
            <span class="lbl">PLACA DO VEÍCULO</span>
            <span class="val">-</span>
          </td>
          <td style="width:4%; border-top:none;">
            <span class="lbl">UF</span>
            <span class="val">-</span>
          </td>
          <td style="width:10%; border-right:none; border-top:none;">
            <span class="lbl">CNPJ / CPF</span>
            <span class="val">-</span>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:40%; border-left:none; border-top:none;">
            <span class="lbl">ENDEREÇO</span>
            <span class="val">-</span>
          </td>
          <td style="width:34%; border-top:none;">
            <span class="lbl">MUNICÍPIO</span>
            <span class="val">-</span>
          </td>
          <td style="width:4%; border-top:none;">
            <span class="lbl">UF</span>
            <span class="val">-</span>
          </td>
          <td style="width:22%; border-right:none; border-top:none;">
            <span class="lbl">INSCRIÇÃO ESTADUAL</span>
            <span class="val">-</span>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin:0;" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:15%; border-left:none; border-top:none; border-bottom:none;">
            <span class="lbl">QUANTIDADE</span>
            <span class="val">1</span>
          </td>
          <td style="width:20%; border-top:none; border-bottom:none;">
            <span class="lbl">ESPÉCIE</span>
            <span class="val">VOLUME</span>
          </td>
          <td style="width:20%; border-top:none; border-bottom:none;">
            <span class="lbl">MARCA</span>
            <span class="val">-</span>
          </td>
          <td style="width:15%; border-top:none; border-bottom:none;">
            <span class="lbl">NUMERAÇÃO</span>
            <span class="val">-</span>
          </td>
          <td style="width:15%; border-top:none; border-bottom:none;">
            <span class="lbl">PESO BRUTO</span>
            <span class="val" style="text-align:right;">0,000</span>
          </td>
          <td style="width:15%; border-right:none; border-top:none; border-bottom:none;">
            <span class="lbl">PESO LÍQUIDO</span>
            <span class="val" style="text-align:right;">0,000</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- 6. DADOS DOS PRODUTOS / SERVIÇOS -->
    <div class="sec-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table class="box" border="1" cellspacing="0" cellpadding="2">
      <thead>
        <tr style="background:#efefef;">
          <th style="width:7%; text-align:center;">CÓDIGO</th>
          <th style="width:33%; text-align:left;">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
          <th style="width:8%; text-align:center;">NCM/SH</th>
          <th style="width:6%; text-align:center;">CST</th>
          <th style="width:6%; text-align:center;">CFOP</th>
          <th style="width:4%; text-align:center;">UNID.</th>
          <th style="width:6%; text-align:right;">QTD.</th>
          <th style="width:7%; text-align:right;">V. UNIT.</th>
          <th style="width:8%; text-align:right;">V. TOTAL</th>
          <th style="width:5%; text-align:right;">BC ICMS</th>
          <th style="width:5%; text-align:right;">V. ICMS</th>
          <th style="width:5%; text-align:right;">ALÍQ.</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- 7. DADOS ADICIONAIS -->
    <div class="sec-title">DADOS ADICIONAIS</div>
    <table class="box" border="1" cellspacing="0" cellpadding="2">
      <tr>
        <td style="width:70%; min-height:55px;">
          <span class="lbl">INFORMAÇÕES COMPLEMENTARES</span>
          <div style="font-size:6.5pt; line-height:1.25; margin-top:2px;">
            ${orderRefText ? `${escapeHtml(orderRefText)}<br>` : ''}DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL.<br>
            NAO GERA DIREITO A CREDITO FISCAL DE IPI.<br>
            Val Aprox Tributos: Federal R$ ${fedTax} (4.20%), Estadual R$ ${estTax} (7.00%) Fonte: IBPT.
          </div>
        </td>
        <td style="width:30%; vertical-align:top;">
          <span class="lbl">RESERVADO AO FISCO</span>
        </td>
      </tr>
    </table>

    <!-- 8. CANHOTO (RODAPÉ OFICIAL) -->
    <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px;">
      <table class="box" border="1" cellspacing="0" cellpadding="2">
        <tr>
          <td style="width:82%; padding:3px 5px;">
            <div style="font-size:5.5pt; text-transform:uppercase; margin-bottom:2px;">
              RECEBEMOS DE <strong>${escapeHtml(storeName.toUpperCase())} (${escapeHtml(corporateName.toUpperCase())})</strong> OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO
            </div>
            <div style="font-size:7.5pt; font-weight:bold; margin-bottom:3px;">
              ${escapeHtml(consumerName)}
            </div>
            <table style="width:100%; border-collapse:collapse; margin-top:2px;" border="1" cellspacing="0" cellpadding="2">
              <tr>
                <td style="width:25%;">
                  <span class="lbl">DATA DO RECEBIMENTO</span>
                  <span class="val">&nbsp;</span>
                </td>
                <td style="width:75%;">
                  <span class="lbl">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
                  <span class="val">&nbsp;</span>
                </td>
              </tr>
            </table>
          </td>
          <td style="width:18%; text-align:center; vertical-align:middle; padding:3px;">
            <div style="font-size:9pt; font-weight:bold;">NF-e</div>
            <div style="font-size:8.5pt; font-weight:bold; margin:2px 0;">Nº: ${formattedNumberDisplay}</div>
            <div style="font-size:8pt; font-weight:bold;">SÉRIE: ${series}</div>
          </td>
        </tr>
      </table>
    </div>

  </div>
  ${xmlContent ? `<script>
    function downloadXmlFile() {
      const xml = ${JSON.stringify(xmlContent)};
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NFe_${accessKey || formattedNumber}.xml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>` : ''}
</body>
</html>`;
}

if (typeof window !== 'undefined') {
  window.openEmitirNota55Modal = openEmitirNota55Modal;
  window.closeNfe55Modal = closeNfe55Modal;
  window.closeEmitirNota55Modal = closeNfe55Modal;
  window.handleNfe55OverlayClick = handleNfe55OverlayClick;
  window.handleNfe55OrderSelectionChange = handleNfe55OrderSelectionChange;
  window.handleNfe55OrderSelectChange = handleNfe55OrderSelectionChange;
  window.handleNfe55FreightToggle = handleNfe55FreightToggle;
  window.handleNfe55FreightAmountChange = handleNfe55FreightAmountChange;
  window.updateNfe55PreviewTotals = updateNfe55PreviewTotals;
  window.handleNfe55PersonTypeChange = handleNfe55PersonTypeChange;
  window.handleNfe55IndIEChange = handleNfe55IndIEChange;
  window.maskNfe55Doc = maskNfe55Doc;
  window.maskNfe55Phone = maskNfe55Phone;
  window.maskNfe55Cep = maskNfe55Cep;
  window.searchNfe55Cep = searchNfe55Cep;
  window.submitNfe55 = submitNfe55;
  window.submitEmitirNota55 = submitNfe55;
  window.lookupNfe55Cnpj = lookupNfe55Cnpj;
  window.lookupNfe55Cep = lookupNfe55Cep;
  window.openDanfeA4Window = openDanfeA4Window;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function getLocalDateISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseOrderLogDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const sqliteUtcMatch = raw.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/);
  if (sqliteUtcMatch) {
    const sqliteUtc = new Date(`${raw.replace(' ', 'T')}Z`);
    return Number.isNaN(sqliteUtc.getTime()) ? null : sqliteUtc;
  }

  let parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  if (raw.includes(' ') && !raw.includes('T')) {
    parsed = new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getOrderLogDateKey(log) {
  const parsed = parseOrderLogDate(log?.createdAt);
  return parsed ? getLocalDateISO(parsed) : '';
}

function ensureOrderLogsFilterDate() {
  if (!isIsoDate(STATE.orderLogsFilterDate)) {
    STATE.orderLogsFilterDate = getLocalDateISO(new Date());
  }
  const input = document.getElementById('orderLogsDateFilter');
  if (input && input.value !== STATE.orderLogsFilterDate) {
    input.value = STATE.orderLogsFilterDate;
  }
}

function setOrderLogsFilter(dateValue) {
  const normalized = String(dateValue || '').trim();
  STATE.orderLogsFilterDate = isIsoDate(normalized) ? normalized : getLocalDateISO(new Date());
  ensureOrderLogsFilterDate();
  renderOrderLogsTable();
}

function getOrderLogsFetchLimit() {
  if (STATE.currentPage === 'order-logs') return ORDER_LOGS_FOREGROUND_FETCH_LIMIT;
  if (STATE.currentPage === 'cashier') return 1000;
  return ORDER_LOGS_BACKGROUND_FETCH_LIMIT;
}

function getOrderAnnouncementId(order) {
  const id = Number(order?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function isCustomerOrderAwaitingConfirmation(order) {
  return String(order?.orderSource || '').trim().toLowerCase() === 'storefront'
    && isOrderPendingConfirmation(order);
}

function resetNewOrderAnnouncementTracking() {
  NEW_ORDER_ANNOUNCEMENT_READY = false;
  NEW_ORDER_ANNOUNCEMENT_HIGHEST_ID = 0;
  NEW_ORDER_ANNOUNCED_IDS = new Set();
}

function rememberOrderAnnouncementIds(orderIds) {
  orderIds.forEach((id) => {
    if (id > 0) NEW_ORDER_ANNOUNCED_IDS.add(id);
  });

  while (NEW_ORDER_ANNOUNCED_IDS.size > NEW_ORDER_ANNOUNCEMENT_MAX_TRACKED_IDS) {
    const oldestId = NEW_ORDER_ANNOUNCED_IDS.values().next().value;
    NEW_ORDER_ANNOUNCED_IDS.delete(oldestId);
  }
}

function findNewCustomerOrdersForAnnouncement(orderLogs) {
  const logs = Array.isArray(orderLogs) ? orderLogs : [];
  const ids = logs.map(getOrderAnnouncementId).filter((id) => id > 0);
  const highestIdInResponse = ids.length ? Math.max(...ids) : 0;

  if (!NEW_ORDER_ANNOUNCEMENT_READY) {
    NEW_ORDER_ANNOUNCEMENT_READY = true;
    NEW_ORDER_ANNOUNCEMENT_HIGHEST_ID = highestIdInResponse;
    rememberOrderAnnouncementIds(ids);
    return [];
  }

  const previousHighestId = NEW_ORDER_ANNOUNCEMENT_HIGHEST_ID;
  const newOrders = logs
    .filter((order) => {
      const id = getOrderAnnouncementId(order);
      return id > previousHighestId
        && !NEW_ORDER_ANNOUNCED_IDS.has(id)
        && isCustomerOrderAwaitingConfirmation(order);
    })
    .sort((a, b) => getOrderAnnouncementId(a) - getOrderAnnouncementId(b));

  rememberOrderAnnouncementIds(ids);
  NEW_ORDER_ANNOUNCEMENT_HIGHEST_ID = Math.max(previousHighestId, highestIdInResponse);
  return newOrders;
}

function speakNewOrderAnnouncement(newOrders) {
  if (!Array.isArray(newOrders) || newOrders.length === 0) return false;

  const speech = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!speech || typeof Utterance !== 'function') {
    console.warn('Aviso falado indisponivel neste navegador.');
    return false;
  }

  try {
    // Um unico aviso por lote evita empilhar falas quando dois pedidos chegam juntos.
    speech.cancel();
    const announcement = new Utterance(NEW_ORDER_ANNOUNCEMENT_TEXT);
    announcement.lang = 'pt-BR';
    announcement.rate = 1.25;
    announcement.pitch = 1;
    announcement.volume = 1;
    speech.speak(announcement);
    return true;
  } catch (error) {
    console.warn('Nao foi possivel reproduzir o aviso de novo pedido.', error);
    return false;
  }
}

function announceNewCustomerOrders(orderLogs) {
  const newOrders = findNewCustomerOrdersForAnnouncement(orderLogs);
  speakNewOrderAnnouncement(newOrders);
  return newOrders;
}

async function loadOrderLogs(silent = false) {
  if (ORDER_LOGS_FETCH_IN_PROGRESS) {
    ORDER_LOGS_FETCH_PENDING = true;
    return;
  }

  ORDER_LOGS_FETCH_IN_PROGRESS = true;
  ensureOrderLogsFilterDate();
  try {
    const response = await fetchWithTimeout(`${ORDER_LOGS_API}?limit=${getOrderLogsFetchLimit()}`, {
      cache: 'no-store',
      credentials: 'include',
      timeoutMs: ADMIN_FETCH_TIMEOUT_MS,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    STATE.orderLogs = Array.isArray(data?.orderLogs) ? data.orderLogs : [];
    announceNewCustomerOrders(STATE.orderLogs);
    const totalCount = Number(data?.totalCount);
    const pendingCount = Number(data?.pendingCount);
    STATE.orderLogsTotalCount = Number.isFinite(totalCount)
      ? Math.max(0, Math.trunc(totalCount))
      : STATE.orderLogs.length;
    STATE.orderLogsPendingCount = Number.isFinite(pendingCount)
      ? Math.max(0, Math.trunc(pendingCount))
      : STATE.orderLogs.filter(isOrderPendingConfirmation).length;
    const shouldRenderOrderLogs = STATE.currentPage === 'order-logs';
    const shouldRenderCashierOrders = STATE.currentPage === 'cashier';
    if (shouldRenderOrderLogs) {
      renderOrderLogsTable();
    }
    if (shouldRenderCashierOrders) {
      renderCashierOrders();
    }
    refreshAllBadges();
    syncAutoPrintControls();
    if (!silent && shouldRenderOrderLogs) {
      showToast('Pedidos atualizados com sucesso.', 'success', 1700);
    }
  } catch (error) {
    console.error('Falha ao carregar pedidos registrados.', error);
    if (!silent) showToast('Não foi possível carregar os pedidos registrados.', 'error', 3200);
  } finally {
    ORDER_LOGS_FETCH_IN_PROGRESS = false;
    if (ORDER_LOGS_FETCH_PENDING) {
      ORDER_LOGS_FETCH_PENDING = false;
      loadOrderLogs(true);
    }
  }
}

function formatOrderLogDate(value) {
  if (!value) return '--';
  const date = parseOrderLogDate(value);
  if (!date) return String(value);
  return formatReceiptDateTime(date);
}

function formatReceiptDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return date.toLocaleString('pt-BR', { timeZone: RECEIPT_TIME_ZONE });
  } catch {
    return date.toLocaleString('pt-BR');
  }
}

function getOrderTypeLabel(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'entrega') return 'Entrega';
  if (normalized === 'consumo_local') return 'Consumo local';
  return 'Retirada';
}

function getOrderTypeBadgeClass(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'entrega') return 'yes';
  if (normalized === 'consumo_local') return 'featured';
  return 'active';
}

function getOrderTypeSummaryLine(log) {
  const normalized = String(log?.orderType || '').toLowerCase();
  if (normalized === 'entrega') {
    const delivery = Number(log?.totals?.delivery || 0);
    return delivery === 0 ? 'Entrega: Grátis' : `Taxa de entrega: ${formatCurrency(delivery)}`;
  }
  if (normalized === 'consumo_local') {
    const localTime = String(log?.localConsumptionTime || '').trim();
    return localTime ? `Consumo local: ${localTime}` : 'Consumo local';
  }
  return 'Retirada: No balcão';
}

function getOrderPaymentLabel(log) {
  if (log?.payment?.label) return log.payment.label;
  const method = String(log?.payment?.method || '').toLowerCase();
  if (method === 'cartao') return 'Cartão';
  if (method === 'dinheiro') return 'Dinheiro';
  return 'Pix';
}

function prettifyOrderPrintSizeValue(value) {
  const clean = fixMojibakeText(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  const lowered = clean.toLowerCase();
  if (['p', 'pp', 'peq', 'pequena', 'brotinho', 'broto'].includes(lowered)) return 'Pequena';
  if (['m', 'med', 'media', 'medio'].includes(lowered)) return 'Media';
  if (['g', 'gg', 'gr', 'grande', 'gigante', 'familia'].includes(lowered)) return 'Grande';
  return clean;
}

function getOrderPrintItemName(item) {
  return fixMojibakeText(String(item?.name || 'Item'))
    .replace(/\s+/g, ' ')
    .trim() || 'Item';
}

function getOrderPrintItemSizeLabel(item) {
  const candidates = [
    item?.size,
    item?.sizeLabel,
    item?.sizeName,
    item?.productSize,
    item?.sizeKey,
  ];

  for (const candidate of candidates) {
    const label = prettifyOrderPrintSizeValue(candidate);
    if (label) return label;
  }

  return '';
}

function getOrderPrintItemAmounts(item) {
  const qty = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
  const unitRaw = Number(item?.unitPrice ?? item?.price ?? 0);
  const unit = Number.isFinite(unitRaw) ? unitRaw : 0;
  const subtotalRaw = Number(item?.subtotal != null ? item.subtotal : unit * qty);
  const subtotal = Number.isFinite(subtotalRaw) ? subtotalRaw : 0;
  return { qty, unit, subtotal };
}

function buildOrderLogFallbackMessage(log) {
  const orderTypeRaw = String(log?.orderType || '').toLowerCase();
  const orderCode = log?.orderCode || `PED-${log?.id || ''}`;
  const createdAt = formatOrderLogDate(log?.createdAt);
  const customerName = log?.customerName || 'Não informado';
  const customerNote = String(log?.customerNote || '').trim();
  const orderType = getOrderTypeLabel(log?.orderType);
  const paymentMethod = String(log?.payment?.method || '').toLowerCase();
  const paymentLabel = getOrderPaymentLabel(log);
  const pixKey = String(log?.payment?.pixKey || '').trim();
  const pixReceiptUrl = String(log?.payment?.pixReceiptUrl || '').trim();
  const subtotal = Number(log?.totals?.subtotal || 0);
  const total = Number(log?.totals?.total || 0);
  const items = Array.isArray(log?.items) ? log.items : [];
  const localConsumptionTime = String(log?.localConsumptionTime || '').trim();

  let text = '';
  text += `Pedido ${orderCode}\n`;
  text += `Data: ${createdAt}\n`;
  text += `Cliente: ${customerName}\n`;
  if (customerNote) text += `Observação: ${customerNote}\n`;
  if (orderTypeRaw === 'consumo_local') {
    text += `Consumo local: ${localConsumptionTime || '--'}\n`;
  } else {
    text += `Tipo: ${orderType}\n`;
    if (log?.deliveryAddress) text += `Endereço: ${log.deliveryAddress}\n`;
  }
  text += `Pagamento: ${paymentLabel}\n`;
  if (paymentMethod === 'pix') {
    if (pixKey) text += `Chave Pix: ${pixKey}\n`;
    if (pixReceiptUrl) text += `Comprovante: ${pixReceiptUrl}\n`;
  }
  text += '\n';
  text += 'Itens:\n';

  if (items.length === 0) {
    text += '- Nenhum item listado\n';
  } else {
    items.forEach((item) => {
      const { qty, unit, subtotal: itemSubtotal } = getOrderPrintItemAmounts(item);
      const itemName = getOrderPrintItemName(item);
      const sizeLabel = getOrderPrintItemSizeLabel(item);
      text += `- ${qty}x ${itemName}\n`;
      if (sizeLabel) text += `  Tamanho: ${sizeLabel}\n`;
      text += `  Valor unit.: ${formatCurrency(unit)}\n`;
      text += `  Valor item: ${formatCurrency(itemSubtotal)}\n`;
    });
  }

  text += `\nSubtotal: ${formatCurrency(subtotal)}\n`;
  text += `${getOrderTypeSummaryLine(log)}\n`;
  text += `Total: ${formatCurrency(total)}\n`;
  return text;
}

const PRINT_RECEIPT_EMOJI_REGEX = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu;

function getReceiptColumnsForPrintProfile(profileId) {
  const profile = normalizePrintProfile(profileId);
  if (profile === 'thermal80') return 42;
  if (profile === 'a4') return 64;
  return 32;
}

function cleanOrderPrintText(value) {
  return fixMojibakeText(String(value ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(PRINT_RECEIPT_EMOJI_REGEX, '')
    .replace(/[*`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function printTextWidth(value) {
  return Array.from(String(value || '')).length;
}

function splitPrintWord(word, width) {
  const chars = Array.from(String(word || ''));
  const parts = [];
  let current = '';
  chars.forEach((char) => {
    if (printTextWidth(current + char) > width && current) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  });
  if (current) parts.push(current);
  return parts;
}

function wrapPrintText(value, width) {
  const maxWidth = Math.max(8, Number(width || 32));
  const clean = cleanOrderPrintText(value).replace(/\n+/g, ' ');
  if (!clean) return [];

  const lines = [];
  let current = '';
  clean.split(/\s+/).filter(Boolean).forEach((word) => {
    if (printTextWidth(word) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...splitPrintWord(word, maxWidth));
      return;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (printTextWidth(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function centerPrintLine(value, columns) {
  const clean = cleanOrderPrintText(value).replace(/\n+/g, ' ');
  if (!clean) return '';
  const width = printTextWidth(clean);
  if (width >= columns) return wrapPrintText(clean, columns)[0] || clean;
  return `${' '.repeat(Math.floor((columns - width) / 2))}${clean}`;
}

function pushPrintField(lines, label, value, columns) {
  const cleanLabel = cleanOrderPrintText(label).replace(/:$/, '');
  const cleanValue = cleanOrderPrintText(value);
  if (!cleanLabel || !cleanValue) return;

  const prefix = `${cleanLabel}: `;
  const prefixWidth = printTextWidth(prefix);
  if (prefixWidth > columns - 8) {
    lines.push(`${cleanLabel}:`);
    wrapPrintText(cleanValue, columns).forEach((line) => lines.push(line));
    return;
  }

  const wrapped = wrapPrintText(cleanValue, columns - prefixWidth);
  if (!wrapped.length) return;
  lines.push(`${prefix}${wrapped[0]}`);
  const indent = ' '.repeat(prefixWidth);
  wrapped.slice(1).forEach((line) => lines.push(`${indent}${line}`));
}

function printAmountLine(label, amount, columns) {
  const left = cleanOrderPrintText(label).replace(/:$/, '');
  const right = cleanOrderPrintText(amount);
  const inline = [left ? `${left}:` : '', right].filter(Boolean).join(' ');
  if (columns <= 32) return inline || left || right;

  const gap = columns - printTextWidth(left) - printTextWidth(right);
  if (gap >= 1) return `${left}${' '.repeat(gap)}${right}`;
  return wrapPrintText(inline, columns)[0] || inline;
}

function pushWrappedPrintLine(lines, value, columns, indent = '') {
  const width = Math.max(8, columns - printTextWidth(indent));
  wrapPrintText(value, width).forEach((line) => lines.push(`${indent}${line}`));
}

function buildOrderLogThermalMessage(log, profileId = STATE.autoPrint.profile, includeHeader = true) {
  const columns = getReceiptColumnsForPrintProfile(profileId);
  const sep = '-'.repeat(columns);
  const orderTypeRaw = String(log?.orderType || '').toLowerCase();
  const paymentMethod = String(log?.payment?.method || '').toLowerCase();
  const pixKey = String(log?.payment?.pixKey || '').trim();
  const customerNote = String(log?.customerNote || '').trim();
  const localConsumptionTime = String(log?.localConsumptionTime || '').trim();
  const items = Array.isArray(log?.items) ? log.items : [];
  const subtotal = Number(log?.totals?.subtotal || 0);
  const delivery = Number(log?.totals?.delivery || 0);
  const total = Number(log?.totals?.total || 0);

  const lines = [];
  if (includeHeader) {
    lines.push(centerPrintLine(log?.storeName || getStoreDisplayName(STATE.config?.storeName), columns));
    lines.push(centerPrintLine(`PEDIDO ${log?.orderCode || `PED-${log?.id || ''}`}`, columns));
    lines.push(sep);
    pushPrintField(lines, 'Data', formatOrderLogDate(log?.createdAt), columns);
    pushPrintField(lines, 'Cliente', log?.customerName || 'Nao informado', columns);
  }
  if (customerNote) pushPrintField(lines, 'Obs', customerNote, columns);

  if (orderTypeRaw === 'entrega') {
    pushPrintField(lines, 'Tipo', 'Entrega', columns);
    pushPrintField(lines, 'Endereco', log?.deliveryAddress || '', columns);
  } else if (orderTypeRaw === 'consumo_local') {
    pushPrintField(lines, 'Tipo', 'Consumo local', columns);
    pushPrintField(lines, 'Horario', localConsumptionTime || '--', columns);
  } else {
    pushPrintField(lines, 'Tipo', 'Retirada no local', columns);
  }

  pushPrintField(lines, 'Pagamento', getOrderPaymentLabel(log), columns);
  if (paymentMethod === 'pix' && pixKey) pushPrintField(lines, 'Chave Pix', pixKey, columns);
  if (paymentMethod === 'dinheiro' && log?.payment?.needsChange) {
    pushPrintField(lines, 'Troco para', formatCurrency(log?.payment?.cashGiven || 0), columns);
    pushPrintField(lines, 'Troco', formatCurrency(log?.payment?.change || 0), columns);
  }

  lines.push(sep);
  lines.push(centerPrintLine('ITENS DO PEDIDO', columns));

  if (!items.length) {
    lines.push('Nenhum item listado');
  } else {
    items.forEach((item, index) => {
      const { qty, unit, subtotal: itemSubtotal } = getOrderPrintItemAmounts(item);
      const itemName = getOrderPrintItemName(item).toUpperCase();
      const sizeLabel = getOrderPrintItemSizeLabel(item);
      if (index > 0) lines.push('');
      pushWrappedPrintLine(lines, `${qty}X ${itemName}`, columns);
      if (sizeLabel) pushWrappedPrintLine(lines, `TAMANHO: ${sizeLabel.toUpperCase()}`, columns, '  ');
      lines.push(`  VALOR UNIT.: ${formatCurrency(unit)}`);
      lines.push(`  VALOR ITEM: ${formatCurrency(itemSubtotal)}`);
    });
  }

  lines.push(sep);
  lines.push(printAmountLine('Subtotal:', formatCurrency(subtotal), columns));
  if (orderTypeRaw === 'entrega') {
    lines.push(printAmountLine('Entrega:', delivery === 0 ? 'Gratis' : formatCurrency(delivery), columns));
  } else if (orderTypeRaw === 'consumo_local') {
    lines.push(`Consumo local: ${localConsumptionTime || '--'}`);
  } else {
    lines.push('Retirada: No balcao');
  }
  lines.push(printAmountLine('TOTAL:', formatCurrency(total), columns));
  lines.push(sep);
  lines.push('');
  pushWrappedPrintLine(lines, columns <= 32 ? 'Confirme o pedido.' : 'Por favor, confirme o pedido.', columns);
  lines.push('Obrigado(a)!');

  return lines.map((line) => String(line || '').replace(/[ \t]+$/g, '')).join('\n').trim();
}

function escapeHtml(text) {
  return fixMojibakeText(String(text))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintInfoRow(label, value) {
  const cleanValue = fixMojibakeText(String(value ?? '')).replace(/\s+/g, ' ').trim();
  if (!cleanValue) return '';
  return `<div class="print-info-row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(cleanValue)}</div>`;
}

function buildOrderLogPrintBodyHtml(log) {
  const orderTypeRaw = String(log?.orderType || '').toLowerCase();
  const paymentMethod = String(log?.payment?.method || '').toLowerCase();
  const pixKey = String(log?.payment?.pixKey || '').trim();
  const customerNote = String(log?.customerNote || '').trim();
  const localConsumptionTime = String(log?.localConsumptionTime || '').trim();
  const items = Array.isArray(log?.items) ? log.items : [];
  const subtotal = Number(log?.totals?.subtotal || 0);
  const delivery = Number(log?.totals?.delivery || 0);
  const total = Number(log?.totals?.total || 0);

  const infoRows = [];
  if (customerNote) infoRows.push(buildPrintInfoRow('Obs', customerNote));
  if (orderTypeRaw === 'entrega') {
    infoRows.push(buildPrintInfoRow('Tipo', 'Entrega'));
    infoRows.push(buildPrintInfoRow('Endereco', log?.deliveryAddress || ''));
  } else if (orderTypeRaw === 'consumo_local') {
    infoRows.push(buildPrintInfoRow('Tipo', 'Consumo local'));
    infoRows.push(buildPrintInfoRow('Horario', localConsumptionTime || '--'));
  } else {
    infoRows.push(buildPrintInfoRow('Tipo', 'Retirada no local'));
  }
  infoRows.push(buildPrintInfoRow('Pagamento', getOrderPaymentLabel(log)));
  if (paymentMethod === 'pix' && pixKey) infoRows.push(buildPrintInfoRow('Chave Pix', pixKey));
  if (paymentMethod === 'dinheiro' && log?.payment?.needsChange) {
    infoRows.push(buildPrintInfoRow('Troco para', formatCurrency(log?.payment?.cashGiven || 0)));
    infoRows.push(buildPrintInfoRow('Troco', formatCurrency(log?.payment?.change || 0)));
  }

  const itemsHtml = items.length
    ? items.map((item, index) => {
      const { qty, unit, subtotal: itemSubtotal } = getOrderPrintItemAmounts(item);
      const itemName = getOrderPrintItemName(item).toUpperCase();
      const sizeLabel = getOrderPrintItemSizeLabel(item);
      return `
        <article class="print-item">
          <div class="print-item-main">${escapeHtml(`${qty}X ${itemName}`)}</div>
          ${sizeLabel ? `<div class="print-item-size">Tamanho: <strong>${escapeHtml(sizeLabel)}</strong></div>` : ''}
          <div class="print-item-values">
            <span>Valor unit.: <strong>${escapeHtml(formatCurrency(unit))}</strong></span>
            <span>Valor item: <strong>${escapeHtml(formatCurrency(itemSubtotal))}</strong></span>
          </div>
        </article>
      `;
    }).join('')
    : '<div class="print-empty">Nenhum item listado</div>';

  const orderTypeAmountHtml = orderTypeRaw === 'entrega'
    ? `<div class="print-total-line"><span>Entrega</span><strong>${escapeHtml(delivery === 0 ? 'Gratis' : formatCurrency(delivery))}</strong></div>`
    : orderTypeRaw === 'consumo_local'
      ? `<div class="print-total-line"><span>Consumo local</span><strong>${escapeHtml(localConsumptionTime || '--')}</strong></div>`
      : '<div class="print-total-line"><span>Retirada</span><strong>No balcao</strong></div>';

  return `
    ${infoRows.length ? `<section class="print-info">${infoRows.join('')}</section>` : ''}
    <div class="print-section-title">ITENS DO PEDIDO</div>
    <section class="print-items">${itemsHtml}</section>
    <section class="print-totals">
      <div class="print-total-line"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(subtotal))}</strong></div>
      ${orderTypeAmountHtml}
      <div class="print-total-line main"><span>TOTAL</span><strong>${escapeHtml(formatCurrency(total))}</strong></div>
    </section>
    <div class="print-confirm">Confirme o pedido.</div>
  `;
}

function formatFiscalQuantity(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '1';
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 3,
  });
}

function getFiscalDocumentPayload(doc) {
  return doc?.payload && typeof doc.payload === 'object' && !Array.isArray(doc.payload)
    ? doc.payload
    : {};
}

async function loadFiscalDocumentById(documentId) {
  const id = String(documentId ?? '').trim();
  if (!id) return null;

  const localDoc = getFiscalDocumentByIdFromState(id);
  if (localDoc && Object.hasOwn(localDoc, 'payload')) return localDoc;

  const result = await fetchFiscalApi(`/documents/${encodeURIComponent(id)}`);
  return result?.document || null;
}

async function getFiscalDocumentForPrint(documentId) {
  return loadFiscalDocumentById(documentId);
}

function buildFiscalDocumentPrintBodyHtml(doc) {
  const payload = getFiscalDocumentPayload(doc);
  const issuer = payload.issuer && typeof payload.issuer === 'object' ? payload.issuer : {};
  const issuerAddress = issuer.address && typeof issuer.address === 'object' ? issuer.address : {};
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  const consumer = payload.consumer && typeof payload.consumer === 'object' ? payload.consumer : {};
  const issuerAddressLine = [
    issuerAddress.street,
    issuerAddress.number,
    issuerAddress.complement,
    issuerAddress.neighborhood,
    issuerAddress.city,
    issuerAddress.uf,
    issuerAddress.cep,
  ].filter(Boolean).join(', ');
  const payment = payload.payment && typeof payload.payment === 'object'
    ? payload.payment
    : (order.payment && typeof order.payment === 'object' ? order.payment : {});
  const nfe = payload.nfe && typeof payload.nfe === 'object' && !Array.isArray(payload.nfe)
    ? payload.nfe
    : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = Number(doc?.total || order?.totals?.total || 0);
  const isAuthorized = String(doc?.status || '').toLowerCase() === 'authorized';
  const accessKey = doc?.accessKey || nfe.accessKey || '';
  const protocol = doc?.protocol || nfe.protocol || '';
  const qrCodeImage = nfe.qrCodeImageDataUrl || '';
  const storeName = issuer.tradeName || issuer.corporateName || getStoreDisplayName(STATE.config?.storeName);
  const corporateName = issuer.corporateName && issuer.corporateName !== storeName
    ? issuer.corporateName
    : '';
  const issuerDocumentLine = [
    issuer.cnpj ? `CNPJ: ${issuer.cnpj}` : '',
    issuer.ie ? `IE: ${issuer.ie}` : '',
  ].filter(Boolean).join(' - ');
  const groupedAccessKey = String(accessKey || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  const issuedAt = nfe.issuedAt || doc?.createdAt || order.createdAt || '';
  const authorizationAt = nfe.authorization?.dhRecbto || '';
  const consumerDocument = String(consumer.document || '').replace(/\D/g, '');
  const consumerLabel = consumerDocument
    ? `${consumer.name || 'Consumidor'} - ${consumerDocument}`
    : 'CONSUMIDOR NÃO IDENTIFICADO';
  const paymentLabel = payment.label || getPaymentMethodLabel(payment.method || 'outro');
  const cashGiven = Number(payment.cashGiven || 0);
  const change = Number(payment.change || 0);

  const itemsHtml = items.length
    ? items.map((item, index) => {
      const quantity = formatFiscalQuantity(item?.quantity || 1);
      const unit = String(item?.unit || 'UN').toUpperCase();
      const name = String(item?.name || 'Item').toUpperCase();
      const rawProductCode = String(item?.productCode || item?.productId || item?.itemNumber || '-');
      const isInternalCode = (code) => {
        if (!code || code === '-') return true;
        if (code.includes('/')) return true;
        if (/^(p-|pizza-|prod-|item-)/i.test(code)) return true;
        if (code.length > 8 || /^p-\d+/i.test(code)) return true;
        return false;
      };
      const generatedInternalCode = rawProductCode
        .split('/')
        .map((part) => part.trim())
        .some((part) => isInternalCode(part));
      const productCode = generatedInternalCode
        ? String(item?.itemNumber || index + 1).padStart(3, '0')
        : rawProductCode;
      return `
        <article class="fiscal-item">
          <div class="fiscal-item-name">${escapeHtml(`${productCode} ${name}`)}</div>
          <div class="fiscal-item-values">
            <span>${escapeHtml(`${quantity} ${unit} x ${formatCurrency(item?.unitPrice || 0)}`)}</span>
            <strong>${escapeHtml(formatCurrency(item?.subtotal || 0))}</strong>
          </div>
        </article>
      `;
    }).join('')
    : '<div class="print-empty">Nenhum item listado</div>';

  return `
    <header class="fiscal-head">
      <strong class="fiscal-store">${escapeHtml(storeName)}</strong>
      ${corporateName ? `<div>${escapeHtml(corporateName)}</div>` : ''}
      ${issuerDocumentLine ? `<div>${escapeHtml(issuerDocumentLine)}</div>` : ''}
      ${issuerAddressLine ? `<div>${escapeHtml(issuerAddressLine)}</div>` : ''}
    </header>
    <div class="fiscal-document-title">DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA</div>
    <section class="fiscal-items">
      <div class="fiscal-items-head">
        <span>CÓDIGO / DESCRIÇÃO</span>
        <span>QTD UN x V.UNIT.</span>
        <span>V.TOTAL</span>
      </div>
      ${itemsHtml}
    </section>
    <section class="fiscal-totals">
      <div><span>Qtd. total de itens</span><strong>${escapeHtml(String(items.length).padStart(3, '0'))}</strong></div>
      <div class="main"><span>Valor total R$</span><strong>${escapeHtml(formatCurrency(total))}</strong></div>
      <div><span>Forma de pagamento</span><strong>${escapeHtml(paymentLabel)}</strong></div>
      <div><span>Valor pago R$</span><strong>${escapeHtml(formatCurrency(cashGiven > 0 ? cashGiven : total))}</strong></div>
      ${change > 0 ? `<div><span>Troco R$</span><strong>${escapeHtml(formatCurrency(change))}</strong></div>` : ''}
    </section>
    <section class="fiscal-consult">
      <strong>Consulte pela Chave de Acesso em</strong>
      <div>www.sefaz.go.gov.br/nfce/consulta</div>
      <div class="fiscal-access-key">${escapeHtml(groupedAccessKey)}</div>
    </section>
    ${isAuthorized && qrCodeImage
      ? `
        <section class="print-qr fiscal-qr">
          <img src="${escapeHtml(qrCodeImage)}" alt="QR Code NFC-e" />
          <div class="fiscal-qr-details">
            <strong>${escapeHtml(consumerLabel)}</strong>
            <span>NFC-e nº ${escapeHtml(doc?.number || '-')} Série ${escapeHtml(doc?.series || '-')}</span>
            <span>${escapeHtml(formatOrderLogDate(issuedAt))} - Via consumidor</span>
            ${protocol ? `<span>Protocolo: ${escapeHtml(protocol)}</span>` : ''}
            ${authorizationAt ? `<span>Autorização: ${escapeHtml(formatOrderLogDate(authorizationAt))}</span>` : ''}
          </div>
        </section>
      `
      : ''}
    ${isAuthorized
      ? ''
      : '<div class="print-confirm">Pre-validacao local sem valor fiscal. Envie e autorize na SEFAZ antes de entregar como nota oficial.</div>'}
  `;
}

function buildThermalReceiptDocument({
  title = 'Comanda',
  storeName = '',
  orderCode = '',
  createdAt = '',
  customerName = '',
  bodyText = '',
  bodyHtml = '',
  footerText = '',
  profileId = '',
  variant = 'default',
} = {}) {
  const profile = PRINT_LAYOUT_PROFILES[normalizePrintProfile(profileId)] || getCurrentPrintProfile();
  const printableStoreName = String(storeName || '').trim() || 'Sua Empresa';
  const printableCustomer = String(customerName || '').trim() || 'Não informado';
  const printableCode = String(orderCode || '').trim() || '--';
  const printableCreatedAt = String(createdAt || '').trim() || '--';
  const printableBody = String(bodyText || '').trim() || 'Sem conteúdo da comanda.';
  const printableBodyHtml = String(bodyHtml || '').trim();
  const printableFooter = String(footerText || '').trim();
  const printedAt = formatReceiptDateTime();
  const isFiscal = variant === 'fiscal';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} ${escapeHtml(printableCode)}</title>
  <style${getDocumentCspNonceAttribute()}>
    @page { size: ${profile.pageSize}; margin: ${profile.pageMarginMm}mm; }
    :root { color-scheme: light only; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      color: #000;
      background: #f3f4f6;
      font-family: Consolas, "Courier New", monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt {
      width: ${profile.contentWidth};
      max-width: 100%;
      background: #fff;
      border: 1px solid #d1d5db;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
      border-radius: 6px;
      padding: 8px;
      font-size: ${profile.baseFontPx}px;
      line-height: 1.35;
      letter-spacing: 0.02em;
      font-weight: 600;
    }
    .head {
      text-align: center;
      margin-bottom: 4px;
    }
    .store {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .title {
      font-size: ${profile.titleFontPx}px;
      font-weight: 800;
      margin: 0;
    }
    .code {
      font-size: ${profile.codeFontPx}px;
      font-weight: 700;
      margin-top: 2px;
    }
    .rule {
      margin: 6px 0;
      border-top: 1.5px dashed #000;
    }
    .meta {
      display: grid;
      gap: 3px;
      font-size: ${profile.metaFontPx}px;
      font-weight: 600;
      color: #000;
    }
    .message {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: ${profile.baseFontPx}px;
      line-height: 1.35;
      font-weight: 600;
      color: #000;
    }
    .rich-message {
      white-space: normal;
      font-size: ${profile.baseFontPx}px;
    }
    .print-info {
      display: grid;
      gap: 3px;
      margin-bottom: 7px;
      font-size: calc(${profile.baseFontPx}px + 1px);
      line-height: 1.28;
    }
    .print-info-row strong {
      font-weight: 900;
    }
    .print-section-title {
      margin: 5px 0 6px;
      text-align: center;
      font-size: calc(${profile.baseFontPx}px + 2px);
      line-height: 1.15;
      font-weight: 900;
    }
    .print-items {
      display: grid;
      gap: 8px;
    }
    .print-item {
      padding: 0 0 6px;
      border-bottom: 1.5px dashed #000;
    }
    .print-item-main {
      font-size: calc(${profile.baseFontPx}px + 3px);
      line-height: 1.18;
      font-weight: 900;
      word-break: break-word;
    }
    .print-item-size {
      margin-top: 2px;
      font-size: calc(${profile.baseFontPx}px + 2px);
      line-height: 1.2;
      font-weight: 900;
      word-break: break-word;
    }
    .print-item-values {
      display: grid;
      gap: 2px;
      margin-top: 3px;
      font-size: calc(${profile.baseFontPx}px + 2px);
      line-height: 1.2;
      font-weight: 800;
    }
    .print-item-values strong {
      font-size: calc(${profile.baseFontPx}px + 3px);
      font-weight: 900;
    }
    .print-empty {
      font-size: calc(${profile.baseFontPx}px + 1px);
      font-weight: 800;
    }
    .print-totals {
      display: grid;
      gap: 3px;
      margin-top: 8px;
    }
    .print-total-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: calc(${profile.baseFontPx}px + 2px);
      line-height: 1.2;
      font-weight: 900;
      word-break: break-word;
    }
    .print-total-line strong {
      text-align: right;
      font-size: calc(${profile.baseFontPx}px + 3px);
      font-weight: 900;
    }
    .print-total-line.main {
      margin-top: 4px;
      padding-top: 5px;
      border-top: 1.8px solid #000;
      font-size: calc(${profile.baseFontPx}px + 4px);
    }
    .print-total-line.main strong {
      font-size: calc(${profile.baseFontPx}px + 5px);
    }
    .print-qr {
      display: grid;
      justify-items: center;
      gap: 4px;
      margin-top: 9px;
      font-size: ${profile.metaFontPx}px;
      font-weight: 800;
      line-height: 1.15;
      text-align: center;
      word-break: break-all;
    }
    .print-qr img {
      width: min(170px, 86%);
      height: auto;
      image-rendering: pixelated;
    }
    .print-confirm {
      margin-top: 8px;
      text-align: center;
      font-size: calc(${profile.baseFontPx}px + 1px);
      font-weight: 800;
    }
    .fiscal-head {
      display: grid;
      gap: 1px;
      text-align: center;
      font-size: ${profile.metaFontPx}px;
      line-height: 1.18;
    }
    .fiscal-store {
      font-size: ${profile.titleFontPx}px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .fiscal-document-title {
      margin: 6px 0;
      padding: 5px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      text-align: center;
      font-size: ${profile.metaFontPx}px;
      line-height: 1.2;
      font-weight: 800;
    }
    .fiscal-items {
      display: grid;
    }
    .fiscal-items-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 4px;
      padding-bottom: 3px;
      font-size: calc(${profile.metaFontPx}px - 1px);
      line-height: 1.1;
      font-weight: 900;
    }
    .fiscal-items-head span:nth-child(2),
    .fiscal-items-head span:nth-child(3) {
      text-align: right;
    }
    .fiscal-item {
      padding: 3px 0;
      border-top: 1px dotted #555;
    }
    .fiscal-item-name {
      font-size: ${profile.baseFontPx}px;
      line-height: 1.15;
      font-weight: 800;
      word-break: break-word;
    }
    .fiscal-item-values {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin-top: 1px;
      font-size: ${profile.metaFontPx}px;
      line-height: 1.15;
    }
    .fiscal-item-values strong {
      white-space: nowrap;
      font-weight: 900;
    }
    .fiscal-totals {
      display: grid;
      gap: 2px;
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px dashed #000;
      font-size: ${profile.baseFontPx}px;
    }
    .fiscal-totals > div {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .fiscal-totals .main {
      font-size: calc(${profile.baseFontPx}px + 2px);
      font-weight: 900;
    }
    .fiscal-consult {
      display: grid;
      gap: 2px;
      margin-top: 7px;
      text-align: center;
      font-size: ${profile.metaFontPx}px;
      line-height: 1.15;
    }
    .fiscal-access-key {
      word-spacing: 1px;
      font-size: calc(${profile.metaFontPx}px - 1px);
      font-weight: 800;
    }
    .fiscal-qr {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      align-items: center;
      text-align: center;
    }
    .fiscal-qr img {
      width: 25mm;
      max-width: 100%;
    }
    .fiscal-qr-details {
      display: grid;
      gap: 3px;
      width: 100%;
      font-size: ${profile.metaFontPx}px;
      line-height: 1.18;
      word-break: normal;
      overflow-wrap: anywhere;
    }
    .foot {
      display: grid;
      gap: 3px;
      font-size: ${profile.metaFontPx}px;
      text-align: center;
      font-weight: 600;
      color: #000;
    }
    .actions {
      display: flex;
      gap: 8px;
      width: min(${profile.contentWidth}, 100%);
    }
    .actions button {
      flex: 1;
      border: 1px solid #111;
      background: #fff;
      color: #111;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      cursor: pointer;
    }
    @media print {
      html, body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        background: #fff;
        padding: 0;
        display: block;
      }
      .receipt,
      .receipt * {
        color: #000 !important;
      }
      .meta,
      .message,
      .foot {
        font-weight: 700;
      }
      .receipt strong {
        font-weight: 800;
      }
      .rule {
        border-top-width: 1.8px;
      }
      .receipt {
        width: auto;
        max-width: none;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }
      .actions { display: none !important; }
    }
  </style>
</head>
<body>
  <main class="receipt">
    ${isFiscal ? '' : `<header class="head">
      <div class="store">${escapeHtml(printableStoreName)}</div>
      <h1 class="title">${escapeHtml(title)}</h1>
      <div class="code">${escapeHtml(printableCode)}</div>
    </header>
    <div class="rule"></div>
    <section class="meta">
      <div><strong>Data:</strong> ${escapeHtml(printableCreatedAt)}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(printableCustomer)}</div>
    </section>
    <div class="rule"></div>`}
    ${printableBodyHtml
      ? `<section class="message rich-message">${printableBodyHtml}</section>`
      : `<pre class="message">${escapeHtml(printableBody)}</pre>`}
    ${isFiscal ? '' : '<div class="rule"></div>'}
    <footer class="foot">
      ${printableFooter ? `<div>${escapeHtml(printableFooter)}</div>` : ''}
      ${isFiscal ? '' : `<div>Impresso: ${escapeHtml(printedAt)}</div>`}
    </footer>
  </main>
  <div class="actions">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>
</body>
</html>`;
}

function renderOrderLogInPrintWindow(order, popup, options = {}) {
  const silent = Boolean(options?.silent);
  if (!popup) {
    const message = 'Permita pop-up para imprimir a comanda.';
    if (!silent) showToast(message, 'error', 3400);
    return { success: false, errorMessage: message };
  }

  const orderCode = order.orderCode || `PED-${order.id || ''}`;
  const createdAt = formatOrderLogDate(order.createdAt);
  const storeName = order.storeName || getStoreDisplayName(STATE.config?.storeName);
  const customerName = order.customerName || 'Nao informado';
  const messageText = buildOrderLogThermalMessage(order, STATE.autoPrint.profile, false)
    || buildOrderLogFallbackMessage(order).trim();

  try {
    popup.document.open();
    popup.document.write(
      buildThermalReceiptDocument({
        title: 'Comanda',
        storeName,
        orderCode,
        createdAt,
        customerName,
        profileId: STATE.autoPrint.profile,
        bodyText: messageText,
        bodyHtml: buildOrderLogPrintBodyHtml(order),
      }),
    );
    popup.document.close();
    popup.focus();
    return { success: true, errorMessage: '' };
  } catch (error) {
    const message = String(error?.message || error);
    console.error('Falha ao renderizar comanda para impressao.', error);
    if (!silent) showToast(`Falha ao abrir comanda para impressao: ${message}`, 'error', 3800);
    return { success: false, errorMessage: message };
  }
}

function printOrderLogViaBrowserFallback(order, options = {}) {
  const silent = Boolean(options?.silent);
  let popup = null;

  syncAutoPrinterConnectionState(false);
  if (STATE.autoPrint.connected) {
    popup = openOrReuseAutoPrinterWindow(true);
  }

  if (!popup) {
    popup = window.open('', '_blank', getPrintWindowFeatures(STATE.autoPrint.profile));
    if (!popup) {
      const message = 'Permita pop-up para imprimir a comanda.';
      if (!silent) showToast(message, 'error', 3300);
      return { success: false, errorMessage: message };
    }
  }

  return renderOrderLogInPrintWindow(order, popup, { silent });
}

function printOrderLog(orderId, options = {}) {
  const silent = Boolean(options?.silent);
  const order = (STATE.orderLogs || []).find((o) => String(o.id) === String(orderId));
  if (!order) {
    if (!silent) showToast('Pedido não encontrado para impressão.', 'error');
    return false;
  }

  if (isOrderPendingConfirmation(order)) {
    if (!silent) showToast('Confirme o pedido antes de imprimir.', 'error', 3300);
    return false;
  }

  if (!hasCustomerNameForPrinting(order)) {
    if (!silent) {
      showToast('Impressão bloqueada: pedido sem nome na comanda.', 'error', 3300);
    }
    return false;
  }

  const printResult = printOrderLogViaBrowserFallback(order, {
    silent,
  });
  return Boolean(printResult.success);
}

function confirmOrderLog(orderId) {
  const id = String(orderId ?? '').trim();
  const order = (STATE.orderLogs || []).find((entry) => String(entry?.id) === id);
  if (!id || !order) {
    showToast('Pedido invalido para confirmacao.', 'error');
    return;
  }

  const orderCode = order.orderCode || `PED-${id}`;
  const confirmationCode = String(order?.confirmation?.code || '').trim();
  const codeInstruction = confirmationCode
    ? ` Confira no WhatsApp se o codigo informado pelo cliente e ${confirmationCode}.`
    : '';
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsHtml = items.slice(0, 20).map((item) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const subtotal = Number(item?.subtotal ?? (Number(item?.unitPrice || 0) * quantity));
    return `<li><span>${escapeHtml(`${quantity}x ${item?.name || 'Item'}`)}</span><strong>${escapeHtml(formatCurrency(subtotal))}</strong></li>`;
  }).join('');
  const remainingItems = Math.max(0, items.length - 20);
  const deliveryAddress = String(order?.deliveryAddress || '').trim();
  const customerNote = String(order?.customerNote || '').trim();
  const receiptUrl = String(order?.payment?.pixReceiptUrl || '').trim();
  const summaryHtml = `
    <div class="order-confirmation-summary">
      <div class="ocs-row"><span>Cliente</span><strong>${escapeHtml(order?.customerName || 'Nao informado')}</strong></div>
      <div class="ocs-row"><span>Tipo</span><strong>${escapeHtml(getOrderTypeLabel(order?.orderType))}</strong></div>
      <div class="ocs-row"><span>Pagamento</span><strong>${escapeHtml(getOrderPaymentLabel(order))}</strong></div>
      <div class="ocs-row"><span>Total</span><strong>${escapeHtml(formatCurrency(Number(order?.totals?.total || 0)))}</strong></div>
      ${confirmationCode ? `<div class="ocs-row"><span>Codigo</span><strong>${escapeHtml(confirmationCode)}</strong></div>` : ''}
      ${deliveryAddress ? `<div class="ocs-detail"><span>Endereco</span><strong>${escapeHtml(deliveryAddress)}</strong></div>` : ''}
      ${customerNote ? `<div class="ocs-detail"><span>Observacao</span><strong>${escapeHtml(customerNote)}</strong></div>` : ''}
      <div class="ocs-items"><span>Itens</span><ul>${itemsHtml}</ul>${remainingItems ? `<small>+ ${remainingItems} item(ns)</small>` : ''}</div>
      ${receiptUrl ? `<a class="btn-outline sm" href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer">Abrir comprovante Pix</a>` : ''}
    </div>`;
  confirmDialog(
    'Confirmar pedido',
    `Confirma o pedido ${orderCode}?${codeInstruction} O estoque sera baixado e, quando disponivel, a comanda sera enviada ao agente de impressao.`,
    async () => {
      try {
        const response = await fetch(`${ORDER_LOGS_API}/${encodeURIComponent(id)}/confirm`, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
        });
        let body = {};
        try {
          body = await response.json();
        } catch {
          body = {};
        }
        if (!response.ok) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }

        STATE.orderLogs = (STATE.orderLogs || []).map((entry) => (
          String(entry?.id) === id ? body.orderLog : entry
        ));
        if (isOrderPendingConfirmation(order) && !isOrderPendingConfirmation(body.orderLog)) {
          STATE.orderLogsPendingCount = Math.max(0, Number(STATE.orderLogsPendingCount || 0) - 1);
        }
        renderOrderLogsTable();
        refreshAllBadges();
        const confirmationMessage = body?.idempotentReplay
          ? 'Pedido ja estava confirmado.'
          : body?.printJob?.queued
            ? 'Pedido confirmado e enviado para impressao.'
            : 'Pedido confirmado. Use Imprimir para gerar a comanda manualmente.';
        showToast(confirmationMessage, 'success', 3200);
      } catch (error) {
        console.error('Falha ao confirmar pedido registrado.', error);
        showToast(String(error?.message || 'Nao foi possivel confirmar o pedido.'), 'error', 3600);
      }
    },
    'Confirmar pedido',
    'PED',
    'Voltar',
    { fieldsHtml: summaryHtml },
  );
}

function deleteOrderLog(orderId) {
  const id = String(orderId ?? '').trim();
  if (!id) {
    showToast('Pedido inválido para exclusão.', 'error');
    return;
  }

  const order = (STATE.orderLogs || []).find((o) => String(o.id) === id);
  const orderCode = order?.orderCode || `PED-${id}`;
  const pending = isOrderPendingConfirmation(order);
  const dialogTitle = pending ? 'Recusar pedido' : 'Excluir pedido';
  const dialogAction = pending ? 'Recusar pedido' : 'Excluir pedido';
  const dialogMessage = pending
    ? `Deseja recusar o pedido ${orderCode}? Nenhum estoque sera alterado.`
    : `Deseja excluir o pedido ${orderCode}? Essa acao nao pode ser desfeita.`;

  confirmDialog(
    dialogTitle,
    dialogMessage,
    async () => {
      try {
        const response = await fetch(`${ORDER_LOGS_API}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          cache: 'no-store',
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        STATE.orderLogs = (STATE.orderLogs || []).filter((log) => String(log?.id) !== id);
        STATE.orderLogsTotalCount = Math.max(0, Number(STATE.orderLogsTotalCount || 0) - 1);
        if (pending) {
          STATE.orderLogsPendingCount = Math.max(0, Number(STATE.orderLogsPendingCount || 0) - 1);
        }
        renderOrderLogsTable();
        refreshAllBadges();
        showToast(pending ? 'Pedido recusado com sucesso.' : 'Pedido excluido com sucesso.', 'success', 1800);
      } catch (error) {
        console.error('Falha ao excluir pedido registrado.', error);
        showToast('Não foi possível excluir o pedido.', 'error', 3200);
      }
    },
    dialogAction,
  );
}

function renderOrderLogsTable() {
  const table = document.getElementById('orderLogsTable');
  const tbody = document.getElementById('orderLogsTableBody');
  const mobileList = document.getElementById('orderLogsMobileList');
  const empty = document.getElementById('orderLogsEmpty');
  const emptyText = document.getElementById('orderLogsEmptyText');
  if (!table || !tbody || !empty) return;

  ensureOrderLogsFilterDate();

  const logs = Array.isArray(STATE.orderLogs) ? STATE.orderLogs : [];
  const selectedDate = STATE.orderLogsFilterDate;
  const filteredLogs = logs.filter((log) => getOrderLogDateKey(log) === selectedDate);

  if (filteredLogs.length === 0) {
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
    table.style.display = 'none';
    if (mobileList) mobileList.style.display = 'none';
    empty.style.display = 'block';
    if (emptyText) {
      if (isIsoDate(selectedDate)) {
        const label = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('pt-BR');
        emptyText.textContent = `Nenhum pedido registrado em ${label}.`;
      } else {
        emptyText.textContent = 'Nenhum pedido registrado ainda.';
      }
    }
    return;
  }

  table.style.display = '';
  if (mobileList) mobileList.style.display = '';
  empty.style.display = 'none';
  if (emptyText) emptyText.textContent = 'Nenhum pedido registrado ainda.';
  const shouldBuildMobileCards = Boolean(
    mobileList
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 900px)').matches,
  );

  const rowsHtml = filteredLogs.map((log) => {
    const typeLabel = getOrderTypeLabel(log?.orderType);
    const typeClass = getOrderTypeBadgeClass(log?.orderType);
    const paymentLabel = getOrderPaymentLabel(log);
    const total = Number(log?.totals?.total || 0);
    const orderCode = log?.orderCode || `PED-${log?.id || ''}`;
    const clientName = log?.customerName || 'Não informado';
    const orderIdLiteral = JSON.stringify(log?.id ?? '');
    const pending = isOrderPendingConfirmation(log);
    const confirmationCode = String(log?.confirmation?.code || '').trim();
    const canPrint = hasCustomerNameForPrinting(log);
    const printDisabledAttr = canPrint ? '' : ' disabled';
    const printTitle = canPrint
      ? ' title="Imprimir pedido"'
      : pending
        ? ' title="Confirme o pedido antes de imprimir"'
        : ' title="Impressão bloqueada: pedido sem nome na comanda"';
    const statusHtml = pending
      ? `<div><span class="badge featured">Aguardando confirmacao</span><br><small>${escapeHtml(typeLabel)}${confirmationCode ? ` | ${escapeHtml(confirmationCode)}` : ''}</small></div>`
      : `<span class="badge ${typeClass}">${escapeHtml(typeLabel)}</span>`;
    const actionsHtml = pending
      ? `
        <button class="btn-primary sm" onclick='confirmOrderLog(${orderIdLiteral})'>Confirmar pedido</button>
        <button class="btn-danger-outline sm" onclick='deleteOrderLog(${orderIdLiteral})'>Recusar</button>
      `
      : `
        <button class="btn-outline sm" onclick='printOrderLog(${orderIdLiteral})'${printTitle}${printDisabledAttr}>Imprimir</button>
        <button class="btn-danger-outline sm" onclick='deleteOrderLog(${orderIdLiteral})'>Excluir</button>
      `;

    return `
      <tr>
        <td><strong>${escapeHtml(orderCode)}</strong></td>
        <td>${escapeHtml(formatOrderLogDate(log?.createdAt))}</td>
        <td>${escapeHtml(clientName)}</td>
        <td>${statusHtml}</td>
        <td><strong>${escapeHtml(formatCurrency(total))}</strong></td>
        <td>${escapeHtml(paymentLabel)}</td>
        <td>
          <div class="order-log-actions">
            ${actionsHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const cardsHtml = shouldBuildMobileCards ? filteredLogs.map((log) => {
    const typeLabel = getOrderTypeLabel(log?.orderType);
    const typeClass = getOrderTypeBadgeClass(log?.orderType);
    const paymentLabel = getOrderPaymentLabel(log);
    const total = Number(log?.totals?.total || 0);
    const orderCode = log?.orderCode || `PED-${log?.id || ''}`;
    const clientName = log?.customerName || 'Não informado';
    const createdAt = formatOrderLogDate(log?.createdAt);
    const orderIdLiteral = JSON.stringify(log?.id ?? '');
    const pending = isOrderPendingConfirmation(log);
    const confirmationCode = String(log?.confirmation?.code || '').trim();
    const canPrint = hasCustomerNameForPrinting(log);
    const printDisabledAttr = canPrint ? '' : ' disabled';
    const printTitle = canPrint
      ? ' title="Imprimir pedido"'
      : pending
        ? ' title="Confirme o pedido antes de imprimir"'
        : ' title="Impressão bloqueada: pedido sem nome na comanda"';
    const statusHtml = pending
      ? `<span class="badge featured">Aguardando confirmacao</span><small>${escapeHtml(typeLabel)}${confirmationCode ? ` | ${escapeHtml(confirmationCode)}` : ''}</small>`
      : `<span class="badge ${typeClass}">${escapeHtml(typeLabel)}</span>`;
    const actionsHtml = pending
      ? `
        <button class="btn-primary sm" onclick='confirmOrderLog(${orderIdLiteral})'>Confirmar pedido</button>
        <button class="btn-danger-outline sm" onclick='deleteOrderLog(${orderIdLiteral})'>Recusar</button>
      `
      : `
        <button class="btn-outline sm" onclick='printOrderLog(${orderIdLiteral})'${printTitle}${printDisabledAttr}>Imprimir</button>
        <button class="btn-danger-outline sm" onclick='deleteOrderLog(${orderIdLiteral})'>Excluir</button>
      `;

    return `
      <article class="order-log-card">
        <div class="olc-head">
          <div class="olc-code">${escapeHtml(orderCode)}</div>
          ${statusHtml}
        </div>
        <div class="olc-meta">
          <div class="olc-item">
            <span class="olc-label">Data</span>
            <span class="olc-value">${escapeHtml(createdAt)}</span>
          </div>
          <div class="olc-item">
            <span class="olc-label">Total</span>
            <span class="olc-value total">${escapeHtml(formatCurrency(total))}</span>
          </div>
          <div class="olc-item">
            <span class="olc-label">Cliente</span>
            <span class="olc-value">${escapeHtml(clientName)}</span>
          </div>
          <div class="olc-item">
            <span class="olc-label">Pagamento</span>
            <span class="olc-value">${escapeHtml(paymentLabel)}</span>
          </div>
        </div>
        <div class="olc-actions">
          ${actionsHtml}
        </div>
      </article>
    `;
  }).join('') : '';

  tbody.innerHTML = rowsHtml;
  if (mobileList) mobileList.innerHTML = cardsHtml;
}

function waiterRoleLabel(role) {
  return String(role || '').toLowerCase() === 'manager' ? 'Gerente do salão' : 'Garçom';
}

function waiterAuditActionLabel(action) {
  const labels = {
    session_login: 'Entrou no salão',
    session_logout: 'Saiu do salão',
    staff_user_created: 'Funcionário criado',
    staff_user_updated: 'Funcionário atualizado',
    dining_table_created: 'Mesa cadastrada',
    table_opened: 'Mesa aberta',
    order_added: 'Pedido adicionado',
    order_printed: 'Pedido enviado para impressão',
    item_removed: 'Item retirado',
    order_reprinted: 'Pedido reimpresso',
    account_preview_printed: 'Pré-conta impressa',
    account_reprinted: 'Conta reimpressa',
    account_requested: 'Conta enviada ao Caixa',
    table_reopened: 'Mesa reaberta',
    table_transferred: 'Mesa transferida',
    table_paid: 'Mesa paga e liberada',
  };
  return labels[String(action || '')] || String(action || 'Ação registrada').replaceAll('_', ' ');
}

function formatWaiterAdminDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderWaiterUsersAdmin() {
  const list = document.getElementById('teamUsersList');
  const summary = document.getElementById('teamUsersSummary');
  if (!list) return;
  const users = Array.isArray(ADMIN_WAITER_USERS) ? ADMIN_WAITER_USERS : [];
  const activeCount = users.filter((user) => user.active).length;
  if (summary) summary.textContent = `${activeCount} ativo(s) de ${users.length} cadastrado(s)`;
  list.innerHTML = users.length ? users.map((user) => `
    <article class="team-user-card ${user.active ? '' : 'is-inactive'}">
      <div class="team-user-avatar" aria-hidden="true">${escapeHtml(String(user.displayName || user.username || '?').slice(0, 1).toUpperCase())}</div>
      <div class="team-user-info">
        <div class="team-user-title">
          <strong>${escapeHtml(user.displayName || user.username)}</strong>
          <span class="team-role-badge ${escapeHtml(user.role)}">${escapeHtml(waiterRoleLabel(user.role))}</span>
          ${user.active ? '' : '<span class="team-status-badge">Desativado</span>'}
        </div>
        <p>@${escapeHtml(user.username)}</p>
        <small>Último acesso: ${escapeHtml(formatWaiterAdminDate(user.lastLoginAt))}</small>
      </div>
      <div class="team-user-actions">
        <button class="btn-outline sm" type="button" onclick="editWaiterUserAdmin(${Number(user.id)})">Editar</button>
        <button class="${user.active ? 'btn-danger-outline' : 'btn-outline'} sm" type="button" onclick="toggleWaiterUserActiveAdmin(${Number(user.id)})">
          ${user.active ? 'Desativar' : 'Reativar'}
        </button>
      </div>
    </article>
  `).join('') : '<div class="empty-state-sm">Nenhum funcionário cadastrado. Crie o primeiro acesso ao lado.</div>';
}

async function loadWaiterUsersAdmin(showFeedback = false) {
  const list = document.getElementById('teamUsersList');
  if (list && !ADMIN_WAITER_USERS.length) list.innerHTML = '<div class="empty-state-sm">Carregando equipe...</div>';
  try {
    const response = await fetch(WAITER_USERS_ADMIN_API, { cache: 'no-store', credentials: 'include' });
    if (response.status === 401) {
      showLogin();
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    ADMIN_WAITER_USERS = Array.isArray(body.users) ? body.users : [];
    renderWaiterUsersAdmin();
    if (showFeedback) showToast('Equipe atualizada.', 'success', 1800);
  } catch (error) {
    console.error('Falha ao carregar equipe do salão.', error);
    if (list) list.innerHTML = '<div class="empty-state-sm error">Não foi possível carregar a equipe.</div>';
    if (showFeedback) showToast('Falha ao atualizar a equipe.', 'error');
  }
}

function resetWaiterUserForm() {
  const form = document.getElementById('teamUserForm');
  if (!form) return;
  form.reset();
  setVal('teamUserId', '');
  setVal('teamRole', 'waiter');
  const active = document.getElementById('teamActive');
  if (active) active.checked = true;
  const password = document.getElementById('teamPassword');
  if (password) password.required = true;
  const optional = document.getElementById('teamPasswordOptional');
  if (optional) optional.hidden = true;
  const activeControl = document.getElementById('teamActiveControl');
  if (activeControl) activeControl.hidden = true;
  const cancel = document.getElementById('teamCancelEditButton');
  if (cancel) cancel.hidden = true;
  setText('teamFormTitle', 'Novo funcionário');
  setText('teamSaveButton', 'Criar acesso');
  setText('teamFormError', '');
}

function editWaiterUserAdmin(userId) {
  const user = ADMIN_WAITER_USERS.find((entry) => Number(entry.id) === Number(userId));
  if (!user) return;
  setVal('teamUserId', user.id);
  setVal('teamDisplayName', user.displayName);
  setVal('teamUsername', user.username);
  setVal('teamRole', user.role);
  setVal('teamPassword', '');
  const password = document.getElementById('teamPassword');
  if (password) password.required = false;
  const active = document.getElementById('teamActive');
  if (active) active.checked = Boolean(user.active);
  const optional = document.getElementById('teamPasswordOptional');
  if (optional) optional.hidden = false;
  const activeControl = document.getElementById('teamActiveControl');
  if (activeControl) activeControl.hidden = false;
  const cancel = document.getElementById('teamCancelEditButton');
  if (cancel) cancel.hidden = false;
  setText('teamFormTitle', `Editar ${user.displayName}`);
  setText('teamSaveButton', 'Salvar alterações');
  setText('teamFormError', '');
  document.getElementById('teamDisplayName')?.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveWaiterUserFromAdmin(event) {
  event.preventDefault();
  const id = String(getVal('teamUserId') || '').trim();
  const password = String(getVal('teamPassword') || '');
  const payload = {
    displayName: String(getVal('teamDisplayName') || '').trim(),
    username: String(getVal('teamUsername') || '').trim().toLowerCase(),
    role: getVal('teamRole'),
  };
  if (id) payload.active = Boolean(document.getElementById('teamActive')?.checked);
  if (password) payload.password = password;
  if (!id && !password) {
    setText('teamFormError', 'Informe uma senha ou PIN com pelo menos 4 caracteres.');
    return;
  }
  setText('teamFormError', '');
  const saveButton = document.getElementById('teamSaveButton');
  if (saveButton) saveButton.disabled = true;
  try {
    const response = await fetch(id ? `${WAITER_USERS_ADMIN_API}/${encodeURIComponent(id)}` : WAITER_USERS_ADMIN_API, {
      method: id ? 'PUT' : 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    resetWaiterUserForm();
    await Promise.all([loadWaiterUsersAdmin(), loadWaiterAuditAdmin()]);
    showToast(id ? 'Funcionário atualizado e sessões antigas revogadas.' : 'Acesso criado com sucesso.', 'success', 2600);
  } catch (error) {
    setText('teamFormError', String(error?.message || 'Não foi possível salvar o funcionário.'));
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function toggleWaiterUserActiveAdmin(userId) {
  const user = ADMIN_WAITER_USERS.find((entry) => Number(entry.id) === Number(userId));
  if (!user) return;
  const nextActive = !user.active;
  const execute = async () => {
    try {
      const response = await fetch(`${WAITER_USERS_ADMIN_API}/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      await Promise.all([loadWaiterUsersAdmin(), loadWaiterAuditAdmin()]);
      showToast(nextActive ? 'Funcionário reativado.' : 'Funcionário desativado e sessões revogadas.', 'success', 2400);
    } catch (error) {
      showToast(String(error?.message || 'Não foi possível atualizar o acesso.'), 'error');
    }
  };
  if (nextActive) {
    execute();
    return;
  }
  confirmDialog(
    'Desativar funcionário',
    `${user.displayName} perderá o acesso imediatamente em todos os aparelhos. Deseja continuar?`,
    execute,
    'Desativar',
  );
}

function renderWaiterAuditAdmin() {
  const list = document.getElementById('teamAuditList');
  if (!list) return;
  const events = Array.isArray(ADMIN_WAITER_AUDIT) ? ADMIN_WAITER_AUDIT : [];
  list.innerHTML = events.length ? events.slice(0, 120).map((event) => {
    const actor = event.actorName || event.actorUsername || 'Sistema';
    const entity = [
      event.tableId ? `Mesa ${event.details?.tableNumber || event.tableId}` : '',
      event.orderId ? `Pedido #${event.orderId}` : '',
    ].filter(Boolean).join(' • ');
    return `
      <article class="team-audit-row">
        <span class="team-audit-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(waiterAuditActionLabel(event.action))}</strong>
          <p>${escapeHtml(actor)}${entity ? ` • ${escapeHtml(entity)}` : ''}</p>
          ${event.reason ? `<small>Motivo: ${escapeHtml(event.reason)}</small>` : ''}
        </div>
        <time datetime="${escapeHtml(event.createdAt || '')}">${escapeHtml(formatWaiterAdminDate(event.createdAt))}</time>
      </article>`;
  }).join('') : '<div class="empty-state-sm">Nenhuma atividade do salão registrada ainda.</div>';
}

async function loadWaiterAuditAdmin(showFeedback = false) {
  const list = document.getElementById('teamAuditList');
  if (list && !ADMIN_WAITER_AUDIT.length) list.innerHTML = '<div class="empty-state-sm">Carregando atividade...</div>';
  try {
    const response = await fetch(`${WAITER_AUDIT_ADMIN_API}?limit=200`, { cache: 'no-store', credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    ADMIN_WAITER_AUDIT = Array.isArray(body.events) ? body.events : [];
    renderWaiterAuditAdmin();
    if (showFeedback) showToast('Atividade atualizada.', 'success', 1800);
  } catch (error) {
    console.error('Falha ao carregar auditoria do salão.', error);
    if (list) list.innerHTML = '<div class="empty-state-sm error">Não foi possível carregar a atividade.</div>';
    if (showFeedback) showToast('Falha ao atualizar a atividade.', 'error');
  }
}

function refreshAllBadges() {
  setText('navBadgeProducts', STATE.products.length);
  setText('navBadgeAnnouncements', (STATE.announcements || []).length);
  const totalOrders = Number.isFinite(Number(STATE.orderLogsTotalCount))
    ? Math.max(0, Math.trunc(Number(STATE.orderLogsTotalCount)))
    : (STATE.orderLogs || []).length;
  setText('navBadgeOrderLogs', totalOrders);
  const orderLogsBadge = document.getElementById('navBadgeOrderLogs');
  if (orderLogsBadge) {
    const pendingOrders = Math.max(0, Math.trunc(Number(STATE.orderLogsPendingCount || 0)));
    orderLogsBadge.title = pendingOrders === 1
      ? '1 pedido aguardando confirmacao'
      : `${pendingOrders} pedidos aguardando confirmacao`;
  }
  const cashierBadge = document.getElementById('navBadgeCashier');
  if (cashierBadge) {
    cashierBadge.textContent = getCashierSummary().activeSession ? 'Aberto' : 'Fechado';
  }
}

/* ==========================================================
   UTILITÁRIOS GERAIS
   ========================================================== */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = fixMojibakeText(val);
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = fixMojibakeText(val);
}

function formatCurrency(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateRange(start, end) {
  if (!start && !end) return 'Sem validade definida';
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  if (start && end) return `${fmt(start)} até ${fmt(end)}`;
  if (start) return `A partir de ${fmt(start)}`;
  return `Até ${fmt(end)}`;
}

function openSite() {
  window.open('/', '_blank');
}

/* ==========================================================
   EXPORTAR DADOS
   ========================================================== */
function exportData() {
  const data = {
    config: STATE.config,
    visual: STATE.visual,
    orders: STATE.orders,
    fiscal: STATE.fiscal,
    categories: STATE.categories,
    products: STATE.products,
    combos: STATE.combos,
    promotions: STATE.promotions,
    announcements: STATE.announcements,
    borders: STATE.borders,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const storeSlug = slugifyFileNamePart(getStoreDisplayName());
  a.download = `${storeSlug}-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exportado com sucesso.', 'success');
}

/* ==========================================================
   ATALHOS DE TECLADO
   ========================================================== */
function trapAdminProfileFocus(event) {
  if (event.key !== 'Tab') return false;
  const modal = document.getElementById('adminProfileModal');
  if (!modal?.classList.contains('open')) return false;
  const focusable = Array.from(modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hidden);
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!modal.contains(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  return false;
}

document.addEventListener('keydown', e => {
  if (trapAdminProfileFocus(e)) return;
  if (e.key === 'Escape') {
    cancelCashierPaymentSelection();
    closeImageCropper();
    closeModal();
    closeConfirm();
  }
  // Ctrl+S para salvar na página atual
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    switch (STATE.currentPage) {
      case 'company': saveCompanyInfo(); break;
      case 'visual': saveVisualSettings(); break;
      case 'orders': saveOrderSettings(); break;
      case 'sefaz': saveFiscalSettings(); break;
    }
  }
});

window.addEventListener('pagehide', () => {
  clearAdminCredentialInputs();
  flushPendingRemoteSaves({ keepalive: true });
});

window.addEventListener('beforeunload', () => {
  clearAdminCredentialInputs();
  flushPendingRemoteSaves({ keepalive: true });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushPendingRemoteSaves({ keepalive: true });
  }
});

/* ==========================================================
   INICIALIZAÇÃO PRINCIPAL
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  installMojibakeGuard();
  loadNcmCatalog();

  document.addEventListener('click', (event) => {
    const group = event.target?.closest?.('.ncm-picker-group');
    if (!group) closeNcmPicker();
  });

  if (window.location.protocol === 'file:') {
    console.warn('Arquivo aberto via file://. Para sincronizar dados, use http://localhost:8000.');
    showToast('Abra em http://localhost:8000 para salvar e sincronizar no servidor.', 'error', 5000);
  }

  STATE.config = normalizeTextDeep(loadFromLS(LS.config, DEMO_CONFIG));
  updateAdminBranding();
  checkAuth();
});
