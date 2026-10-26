import { createServer } from 'node:http';
import https from 'node:https';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import forge from 'node-forge';
import QRCode from 'qrcode';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  centsToMoney,
  calculateExpectedCashDrawerCents,
  calculateCashTotalsFromRows as calculateCashTotalsFromRowsCore,
  manualCashMovementRequiresRefundAuthorization,
  moneyToCents,
  normalizeCashierPaymentParts,
  normalizeMoneyValue as normalizeMoneyValueCore,
} from './lib/cashier-core.mjs';
import {
  buildStockAnalytics,
  calculateRestoredAverageUnitCost,
  calculateWeightedAverageUnitCost,
  roundStockMoney,
  roundStockQuantity,
  roundStockUnitCost,
  stockMovementFinancials,
} from './lib/stock-core.mjs';
import {
  buildNfeIdeConsumerIndicatorsXml,
  buildNfeIcmsXml,
  buildNfePaymentDetailsXml,
  buildNfeStatusServiceSoap,
  buildNfeAuthorizationSoap as buildCoreNfeAuthorizationSoap,
  buildXmlPreflightValidation,
  getFiscalEnvironmentConfig,
  isNfceHomeDeliveryOrder,
  normalizeNfceOperationType,
  shouldExcludeThirdPartyDelivery,
  shouldRefreshNfeIssuedAtForRetry,
  sumNfeFcpStRetained,
  updateFiscalEnvironmentConfig,
  validateExplicitFiscalProductProfile,
} from './lib/fiscal-core.mjs';
import { getOrderDeletionGuard } from './lib/order-core.mjs';
import {
  buildCanonicalHalfPizzaName,
  canonicalizeCatalogOrderItem,
  compareFiscalTaxProfiles,
  resolveFiscalCatalogSource,
} from './lib/catalog-order-core.mjs';
import { resolveSefazServices } from './lib/sefaz-connectors.mjs';
import {
  buildNfeProtocolConsultationSoap,
  buildReconciledFiscalDocument,
  getNfeProtocolConsultationCode,
  parseNfeProtocolConsultationResponse,
  shouldConsultNfeProtocolBeforeRetry,
} from './lib/sefaz-protocol-core.mjs';
import {
  buildStorefrontState,
  renderStorefrontHtml,
} from './lib/storefront-core.mjs';
import {
  materializeSectionAssets,
  persistCatalogDataImage,
} from './lib/catalog-assets.mjs';
const [NODE_MAJOR, NODE_MINOR] = String(process.versions.node || '0.0.0')
  .split('.')
  .slice(0, 2)
  .map((value) => Number.parseInt(value, 10));
const nodeVersionUnsupported = !Number.isFinite(NODE_MAJOR)
  || !Number.isFinite(NODE_MINOR)
  || NODE_MAJOR < 22
  || (NODE_MAJOR === 22 && NODE_MINOR < 5);
if (nodeVersionUnsupported) {
  throw new Error(`Node.js 22.5.0 ou superior é obrigatório para este projeto (versão atual: ${process.versions.node}).`);
}
const { DatabaseSync } = await import('node:sqlite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const CATALOG_ASSETS_DIR = path.join(ROOT_DIR, 'assets', 'catalog');
const CATALOG_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function parseEnvFileLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) value = quoted[2];
  return { key, value };
}

function loadEnvFileIfPresent(filePath) {
  if (!existsSync(filePath)) return;

  try {
    const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    for (const line of content.split(/\r?\n/)) {
      const entry = parseEnvFileLine(line);
      if (!entry) continue;
      if (process.env[entry.key] == null) process.env[entry.key] = entry.value;
    }
  } catch (error) {
    console.warn(`Falha ao carregar variaveis de ambiente em ${filePath}.`, error);
  }
}

loadEnvFileIfPresent(path.join(ROOT_DIR, '.env'));

const DATA_DIR_FROM_ENV = String(process.env.DATA_DIR || '').trim();
const DATA_DIR = path.resolve(DATA_DIR_FROM_ENV || path.join(ROOT_DIR, 'data'));
const DB_PATH = path.join(DATA_DIR, 'cardapio.db');
const DB_BACKUP_DIR = path.join(DATA_DIR, 'backups');
const ORDER_RECEIPTS_DIR = path.join(DATA_DIR, 'order-receipts');
const DEFAULT_DATA_PATH = path.join(DATA_DIR, 'default-data.json');
const ADMIN_DIR = path.join(ROOT_DIR, 'admin login');
const ADMIN_LOGIN_FILE_PATH = path.join(ADMIN_DIR, 'login.html');
const WAITER_DIR = path.join(ROOT_DIR, 'garcom');
const WAITER_INDEX_FILE_PATH = path.join(WAITER_DIR, 'garcom.html');
const SOFTTEC_DIR = path.join(ROOT_DIR, 'softtec');
const SOFTTEC_INDEX_FILE_PATH = path.join(SOFTTEC_DIR, 'index.html');
const SOFTTEC_ASSETS_DIR = path.join(SOFTTEC_DIR, 'assets');

const MUNDONAUTICASMA_DIR = path.join(ROOT_DIR, 'Mundonauticasma');
const MUNDONAUTICASMA_INDEX_FILE_PATH = path.join(MUNDONAUTICASMA_DIR, 'index.html');
const MUNDONAUTICASMA_ASSETS_DIR = path.join(MUNDONAUTICASMA_DIR, 'assets');

const PHARMATIVA_DIR = path.join(ROOT_DIR, 'pharmativa');
const PHARMATIVA_INDEX_FILE_PATH = path.join(PHARMATIVA_DIR, 'index.html');
const PHARMATIVA_ASSETS_DIR = path.join(PHARMATIVA_DIR, 'assets');

const PUBLIC_PHARMATIVA_STATIC_FILES = new Set(['styles.css', 'script.js']);
const PUBLIC_PHARMATIVA_ASSET_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.css',
  '.js',
  '.map',
  '.json',
  '.woff',
  '.woff2',
  '.webp',
]);

const PUBLIC_MUNDONAUTICASMA_STATIC_FILES = new Set(['styles.css', 'script.js']);
const PUBLIC_MUNDONAUTICASMA_ASSET_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.css',
  '.js',
  '.map',
  '.json',
  '.woff',
  '.woff2',
  '.webp',
]);
const PRINT_AGENT_WINDOWS_SCRIPT_PATH = path.join(ROOT_DIR, 'tools', 'print-agent-windows.mjs');
const PRINT_AGENT_WINDOWS_APP_PATH = path.join(ROOT_DIR, 'tools', 'print-agent-windows-app.ps1');
const PRINT_AGENT_WINDOWS_INSTALLER_EXE_PATH = path.join(
  ROOT_DIR,
  'tools',
  'dist',
  'print-agent-windows',
  'CardapioPrintAgentInstaller.exe',
);
const INDEX_FILE_PATH = path.join(ROOT_DIR, 'index.html');
const FRONTEND_BOOTSTRAP_GLOBAL = '__BF_BOOTSTRAP_DATA__';

const SECTIONS = [
  'config',
  'visual',
  'orders',
  'fiscal',
  'categories',
  'products',
  'combos',
  'promotions',
  'announcements',
  'borders',
];
const PRIVATE_STATE_SECTIONS = new Set(['fiscal']);
const PUBLIC_STATE_SECTIONS = SECTIONS.filter((section) => !PRIVATE_STATE_SECTIONS.has(section));

const SECTION_SCHEMA = {
  config: 'object',
  visual: 'object',
  orders: 'object',
  fiscal: 'object',
  categories: 'array',
  products: 'array',
  combos: 'array',
  promotions: 'array',
  announcements: 'array',
  borders: 'array',
};

const NODE_ENV = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
const DB_SYNC_MODE_ALLOWED = new Set(['OFF', 'NORMAL', 'FULL', 'EXTRA']);
const DB_SYNC_MODE_DEFAULT = NODE_ENV === 'production' ? 'FULL' : 'NORMAL';
const DB_SYNC_MODE_CANDIDATE = String(process.env.DB_SYNC_MODE || DB_SYNC_MODE_DEFAULT).trim().toUpperCase();
const DB_SYNC_MODE = DB_SYNC_MODE_ALLOWED.has(DB_SYNC_MODE_CANDIDATE) ? DB_SYNC_MODE_CANDIDATE : DB_SYNC_MODE_DEFAULT;
const RECEIPT_TIME_ZONE = String(process.env.RECEIPT_TIME_ZONE || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim() || 'admin';
let ADMIN_BOOTSTRAP_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const ADMIN_PASSWORD_WAS_GENERATED = NODE_ENV !== 'production' && !ADMIN_BOOTSTRAP_PASSWORD;
if (ADMIN_PASSWORD_WAS_GENERATED) {
  ADMIN_BOOTSTRAP_PASSWORD = randomBytes(24).toString('base64url');
}
const DATA_ENCRYPTION_KEY_FROM_ENV = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
const DATA_ENCRYPTION_KEY = createHash('sha256')
  .update(
    DATA_ENCRYPTION_KEY_FROM_ENV
      || `softcore-development-only\0${ADMIN_BOOTSTRAP_PASSWORD}`,
    'utf8',
  )
  .digest();
const ORDER_RECEIPT_LINK_SECRET_FROM_ENV = String(
  process.env.ORDER_RECEIPT_LINK_SECRET || '',
).trim();
const ORDER_RECEIPT_LINK_SECRET = ORDER_RECEIPT_LINK_SECRET_FROM_ENV
  || randomBytes(32).toString('base64url');
const ADMIN_SESSION_COOKIE = 'bf_admin_session';
const WAITER_SESSION_COOKIE = 'bf_waiter_session';
const ADMIN_SESSION_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.ADMIN_SESSION_TTL_MS || `${8 * 60 * 60 * 1000}`, 10) || (8 * 60 * 60 * 1000),
);
const WAITER_SESSION_IDLE_MS = Math.max(
  5 * 60_000,
  Number.parseInt(process.env.WAITER_SESSION_IDLE_MS || `${60 * 60 * 1000}`, 10) || (60 * 60 * 1000),
);
const WAITER_SESSION_ABSOLUTE_MS = Math.max(
  WAITER_SESSION_IDLE_MS,
  Number.parseInt(process.env.WAITER_SESSION_ABSOLUTE_MS || `${8 * 60 * 60 * 1000}`, 10) || (8 * 60 * 60 * 1000),
);
const WAITER_SESSION_TOUCH_MS = Math.max(
  30_000,
  Number.parseInt(process.env.WAITER_SESSION_TOUCH_MS || `${5 * 60 * 1000}`, 10) || (5 * 60 * 1000),
);
const WAITER_BODY_MAX_BYTES = Math.max(
  64 * 1024,
  Number.parseInt(process.env.WAITER_BODY_MAX_BYTES || `${512 * 1024}`, 10) || (512 * 1024),
);
const WAITER_REPRINT_WINDOW_MS = Math.max(
  60_000,
  Number.parseInt(process.env.WAITER_REPRINT_WINDOW_MS || `${5 * 60 * 1000}`, 10) || (5 * 60 * 1000),
);
const WAITER_REPRINT_MAX_REQUESTS = Math.max(
  3,
  Number.parseInt(process.env.WAITER_REPRINT_MAX_REQUESTS || '8', 10) || 8,
);
const LOGIN_RATE_WINDOW_MS = Math.max(
  10_000,
  Number.parseInt(process.env.LOGIN_RATE_WINDOW_MS || `${10 * 60 * 1000}`, 10) || (10 * 60 * 1000),
);
const LOGIN_RATE_MAX_ATTEMPTS = Math.max(
  3,
  Number.parseInt(process.env.LOGIN_RATE_MAX_ATTEMPTS || '8', 10) || 8,
);
const ADMIN_LOGIN_GLOBAL_MAX_ATTEMPTS = Math.max(
  3,
  Number.parseInt(
    process.env.ADMIN_LOGIN_GLOBAL_MAX_ATTEMPTS || `${LOGIN_RATE_MAX_ATTEMPTS}`,
    10,
  ) || LOGIN_RATE_MAX_ATTEMPTS,
);
const WAITER_LOGIN_GLOBAL_MAX_ATTEMPTS = Math.max(
  LOGIN_RATE_MAX_ATTEMPTS,
  Number.parseInt(process.env.WAITER_LOGIN_GLOBAL_MAX_ATTEMPTS || '24', 10) || 24,
);
const LOGIN_RATE_BLOCK_MS = Math.max(
  10_000,
  Number.parseInt(process.env.LOGIN_RATE_BLOCK_MS || `${15 * 60 * 1000}`, 10) || (15 * 60 * 1000),
);
const ORDER_LOG_WINDOW_MS = Math.max(
  5_000,
  Number.parseInt(process.env.ORDER_LOG_WINDOW_MS || '60000', 10) || 60000,
);
const ORDER_LOG_MAX_REQUESTS = Math.max(
  1,
  Number.parseInt(process.env.ORDER_LOG_MAX_REQUESTS || '12', 10) || 12,
);
const ORDER_LOG_RATE_BLOCK_MS = Math.max(
  10_000,
  Number.parseInt(process.env.ORDER_LOG_RATE_BLOCK_MS || `${15 * 60 * 1000}`, 10) || (15 * 60 * 1000),
);
const ORDER_LOG_RATE_BLOCK_AFTER = Math.max(
  1,
  Number.parseInt(process.env.ORDER_LOG_RATE_BLOCK_AFTER || '2', 10) || 2,
);
const ORDER_RECEIPT_WINDOW_MS = Math.max(
  5_000,
  Number.parseInt(process.env.ORDER_RECEIPT_WINDOW_MS || '60000', 10) || 60000,
);
const ORDER_RECEIPT_MAX_REQUESTS = Math.max(
  1,
  Number.parseInt(process.env.ORDER_RECEIPT_MAX_REQUESTS || '10', 10) || 10,
);
const ORDER_RECEIPT_RATE_BLOCK_MS = Math.max(
  10_000,
  Number.parseInt(process.env.ORDER_RECEIPT_RATE_BLOCK_MS || `${15 * 60 * 1000}`, 10) || (15 * 60 * 1000),
);
const ORDER_RECEIPT_RATE_BLOCK_AFTER = Math.max(
  1,
  Number.parseInt(process.env.ORDER_RECEIPT_RATE_BLOCK_AFTER || '2', 10) || 2,
);
const MAX_ORDER_LOG_PAYLOAD_BYTES = Math.max(
  1_024,
  Number.parseInt(process.env.MAX_ORDER_LOG_PAYLOAD_BYTES || `${96 * 1024}`, 10) || (96 * 1024),
);
const ORDER_STATUS_PENDING = 'pending';
const ORDER_STATUS_ACCEPTED = 'accepted';
const ORDER_SOURCE_STOREFRONT = 'storefront';
const PUBLIC_ORDER_PENDING_TTL_MS = Math.max(
  15 * 60_000,
  Number.parseInt(process.env.PUBLIC_ORDER_PENDING_TTL_MS || `${2 * 60 * 60 * 1000}`, 10)
    || (2 * 60 * 60 * 1000),
);
const PUBLIC_ORDER_PENDING_MAX_PER_CLIENT = Math.max(
  1,
  Math.min(20, Number.parseInt(process.env.PUBLIC_ORDER_PENDING_MAX_PER_CLIENT || '3', 10) || 3),
);
const PUBLIC_ORDER_PENDING_MAX_GLOBAL = Math.max(
  20,
  Math.min(1000, Number.parseInt(process.env.PUBLIC_ORDER_PENDING_MAX_GLOBAL || '100', 10) || 100),
);
const MAX_ORDER_RECEIPT_BYTES = Math.max(
  256 * 1024,
  Number.parseInt(process.env.MAX_ORDER_RECEIPT_BYTES || `${4 * 1024 * 1024}`, 10) || (4 * 1024 * 1024),
);
const ORDER_RECEIPT_LINK_TTL_MS = Math.max(
  60_000,
  Number.parseInt(
    process.env.ORDER_RECEIPT_LINK_TTL_MS || `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || (30 * 24 * 60 * 60 * 1000),
);
const ORDER_RECEIPT_PENDING_TTL_MS = Math.max(
  5 * 60_000,
  Number.parseInt(
    process.env.ORDER_RECEIPT_PENDING_TTL_MS || `${60 * 60 * 1000}`,
    10,
  ) || (60 * 60 * 1000),
);
const ORDER_RECEIPT_CLEANUP_INTERVAL_MS = Math.max(
  60_000,
  Number.parseInt(
    process.env.ORDER_RECEIPT_CLEANUP_INTERVAL_MS || `${15 * 60 * 1000}`,
    10,
  ) || (15 * 60 * 1000),
);
const ORDER_RECEIPT_MAX_PENDING_PER_IP = Math.min(
  10,
  Math.max(
    1,
    Number.parseInt(process.env.ORDER_RECEIPT_MAX_PENDING_PER_IP || '3', 10) || 3,
  ),
);
const MAX_PRODUCT_IMAGE_BYTES = Math.max(
  32 * 1024,
  Number.parseInt(process.env.MAX_PRODUCT_IMAGE_BYTES || `${2 * 1024 * 1024}`, 10) || (2 * 1024 * 1024),
);
const MAX_PRODUCT_IMAGE_URL_CHARS = Math.max(
  256,
  Number.parseInt(process.env.MAX_PRODUCT_IMAGE_URL_CHARS || '2000', 10) || 2000,
);
const MAX_JSON_BODY_BYTES = Math.max(
  256 * 1024,
  Number.parseInt(process.env.MAX_JSON_BODY_BYTES || `${24 * 1024 * 1024}`, 10) || (24 * 1024 * 1024),
);
const SEFAZ_STATUS_TIMEOUT_MS = Math.max(
  1_500,
  Number.parseInt(process.env.SEFAZ_STATUS_TIMEOUT_MS || '4500', 10) || 4_500,
);
const SEFAZ_SOAP_TIMEOUT_MS = Math.max(
  8_000,
  Number.parseInt(process.env.SEFAZ_SOAP_TIMEOUT_MS || '30000', 10) || 30_000,
);
const FISCAL_OPERATION_STALE_MS = Math.max(5 * 60_000, SEFAZ_SOAP_TIMEOUT_MS * 4);
const NFE_XML_NS = 'http://www.portalfiscal.inf.br/nfe';
const NFE_SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';
const NFE_VERSION = '4.00';
const NFE_SIGNATURE_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const NFE_CANONICALIZATION_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const NFE_ENVELOPED_SIGNATURE_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const NFE_SHA1_DIGEST = 'http://www.w3.org/2000/09/xmldsig#sha1';
const SEFAZ_GO_SERVICES = {
  homologacao: {
    autorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
    statusServico: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
    qrCode: 'https://nfewebhomolog.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
    urlChave: 'http://www.sefaz.go.gov.br/nfce/consulta',
  },
  producao: {
    autorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
    statusServico: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
    qrCode: 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
    urlChave: 'http://www.sefaz.go.gov.br/nfce/consulta',
  },
};
const DB_BACKUP_KEEP_FILES = Math.max(
  3,
  Number.parseInt(process.env.DB_BACKUP_KEEP_FILES || '10', 10) || 10,
);
const CORS_ORIGINS = new Set(
  String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'auto').trim().toLowerCase();
const ALLOW_NULL_ORIGIN = String(process.env.ALLOW_NULL_ORIGIN || (NODE_ENV === 'production' ? '0' : '1')) === '1';
const PUBLIC_WRITE_REQUIRE_ORIGIN = String(
  process.env.PUBLIC_WRITE_REQUIRE_ORIGIN || (NODE_ENV === 'production' ? '1' : '0'),
) === '1';
const WAITER_WRITE_REQUIRE_ORIGIN = String(
  process.env.WAITER_WRITE_REQUIRE_ORIGIN || (NODE_ENV === 'production' ? '1' : '0'),
) === '1';
const STOCK_WRITE_REQUIRE_ORIGIN = String(
  process.env.STOCK_WRITE_REQUIRE_ORIGIN || (NODE_ENV === 'production' ? '1' : '0'),
) === '1';
const STOCK_BODY_MAX_BYTES = Math.max(
  16 * 1024,
  Number.parseInt(process.env.STOCK_BODY_MAX_BYTES || `${256 * 1024}`, 10) || (256 * 1024),
);
const STOCK_XML_BODY_MAX_BYTES = Math.max(
  5 * 1024 * 1024,
  Number.parseInt(process.env.STOCK_XML_BODY_MAX_BYTES || `${6 * 1024 * 1024}`, 10) || (6 * 1024 * 1024),
);
const STOCK_INITIAL_COUNT_MAX_ITEMS = 200;
const STOCK_MAX_QUANTITY = 1_000_000;
const STOCK_MAX_UNIT_COST = 1_000_000;
const SILENT_PRINT_ENABLED = String(process.env.SILENT_PRINT_ENABLED || '1').trim() !== '0';
const SILENT_PRINT_PRINTER = String(process.env.SILENT_PRINT_PRINTER || '').trim();
const SILENT_PRINT_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.SILENT_PRINT_TIMEOUT_MS || '20000', 10) || 20_000,
);
const SILENT_PRINT_TEXT_MAX_CHARS = Math.max(
  2_000,
  Number.parseInt(process.env.SILENT_PRINT_TEXT_MAX_CHARS || '30000', 10) || 30_000,
);
const THERMAL_RECEIPT_COLUMNS = Math.min(
  48,
  Math.max(28, Number.parseInt(process.env.THERMAL_RECEIPT_COLUMNS || '32', 10) || 32),
);
function receiptColumnsForPaperWidth(paperWidthMm) {
  const width = Number.parseInt(String(paperWidthMm || ''), 10);
  if (Number.isFinite(width) && width >= 140) return 64;
  if (Number.isFinite(width) && width >= 40 && width <= 60) return 32;
  if (Number.isFinite(width) && width < 75) {
    return Math.min(40, Math.max(32, Math.round((width - 10) / 1.55)));
  }
  if (Number.isFinite(width) && width >= 75) {
    return Math.min(80, Math.max(42, Math.round((width - 8) / 1.70)));
  }
  return 32;
}

function resolveThermalReceiptColumns(options = {}) {
  const rawColumns = Number.parseInt(String(options?.receiptColumns || ''), 10);
  if (Number.isFinite(rawColumns) && rawColumns >= 28 && rawColumns <= 80) return rawColumns;

  const printMode = String(options?.printMode || '').trim().toLowerCase();
  if (printMode === 'a4' || printMode === 'laser' || printMode === 'standard') return 64;

  const rawPaperWidth = Number.parseInt(String(options?.paperWidthMm || ''), 10);
  if (Number.isFinite(rawPaperWidth) && rawPaperWidth > 0) {
    return receiptColumnsForPaperWidth(rawPaperWidth);
  }

  return THERMAL_RECEIPT_COLUMNS;
}
const PRINT_AGENT_ENABLED = String(process.env.PRINT_AGENT_ENABLED || '1').trim() !== '0';
const PRINT_AGENT_ALLOW_LEGACY_TOKEN = String(
  process.env.PRINT_AGENT_ALLOW_LEGACY_TOKEN || '1',
).trim() === '1';
const PRINT_AGENT_TOKEN_FROM_ENV = String(process.env.PRINT_AGENT_TOKEN || '').trim();
const PRINT_AGENT_TOKEN_PATH = path.join(DATA_DIR, 'print-agent-token.txt');
function resolvePrintAgentToken() {
  if (!PRINT_AGENT_ENABLED) return '';
  if (PRINT_AGENT_TOKEN_FROM_ENV) return PRINT_AGENT_TOKEN_FROM_ENV;

  try {
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(PRINT_AGENT_TOKEN_PATH)) {
      const saved = readFileSync(PRINT_AGENT_TOKEN_PATH, 'utf8').trim();
      if (saved) return saved;
    }

    const generated = randomBytes(32).toString('base64url');
    writeFileSync(PRINT_AGENT_TOKEN_PATH, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch (error) {
    console.error('Falha ao criar token persistente do agente de impressao.', error);
    return '';
  }
}
const PRINT_AGENT_TOKEN = resolvePrintAgentToken();
const PRINT_AGENT_TOKEN_WAS_GENERATED = PRINT_AGENT_ENABLED && !PRINT_AGENT_TOKEN_FROM_ENV && PRINT_AGENT_TOKEN.length > 0;
const PRINT_AGENT_CLAIM_TTL_MS = Math.max(
  10_000,
  Number.parseInt(process.env.PRINT_AGENT_CLAIM_TTL_MS || '120000', 10) || 120_000,
);
const PRINT_AGENT_MAX_PENDING_AGE_MS = Math.min(
  24 * 60 * 60 * 1000,
  Math.max(
    60_000,
    Number.parseInt(process.env.PRINT_AGENT_MAX_PENDING_AGE_MS || '600000', 10) || 600_000,
  ),
);
const PRINT_AGENT_ENROLLMENT_TTL_MS = Math.min(
  60 * 60_000,
  Math.max(
    1_000,
    Number.parseInt(process.env.PRINT_AGENT_ENROLLMENT_TTL_MS || `${10 * 60_000}`, 10)
      || (10 * 60_000),
  ),
);
const PRINT_AGENT_ENROLL_RATE_WINDOW_MS = Math.max(
  1_000,
  Number.parseInt(process.env.PRINT_AGENT_ENROLL_RATE_WINDOW_MS || '60000', 10) || 60_000,
);
const PRINT_AGENT_ENROLL_RATE_MAX_REQUESTS = Math.min(
  100,
  Math.max(1, Number.parseInt(process.env.PRINT_AGENT_ENROLL_RATE_MAX_REQUESTS || '8', 10) || 8),
);
const PRINT_AGENT_ENROLL_RATE_BLOCK_MS = Math.max(
  1_000,
  Number.parseInt(process.env.PRINT_AGENT_ENROLL_RATE_BLOCK_MS || `${15 * 60_000}`, 10)
    || (15 * 60_000),
);
const PRINT_AGENT_ENROLL_RATE_BLOCK_AFTER = Math.max(
  1,
  Number.parseInt(process.env.PRINT_AGENT_ENROLL_RATE_BLOCK_AFTER || '2', 10) || 2,
);
const PRINT_AGENT_ENROLL_RATE_LIMIT = new Map();
const PRINT_AGENT_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.PRINT_AGENT_MAX_ATTEMPTS || '3', 10) || 3,
);
const PRINT_AGENT_ACTIVE = PRINT_AGENT_ENABLED && PRINT_AGENT_TOKEN.length > 0;
const WAITER_DEFAULT_TABLES = Math.min(
  200,
  Math.max(1, Number.parseInt(process.env.WAITER_DEFAULT_TABLES || '20', 10) || 20),
);
const WAITER_ROLES = new Set(['waiter', 'manager']);
const WAITER_PASSWORD_HASH_PREFIX = 'waiter:v1';
const WAITER_SCRYPT_N = 2 ** 15;
const WAITER_SCRYPT_R = 8;
const WAITER_SCRYPT_P = 3;
const WAITER_SCRYPT_MAXMEM = 128 * 1024 * 1024;
const IS_WSL = process.platform === 'linux' && (
  Boolean(process.env.WSL_DISTRO_NAME)
  || /microsoft/i.test(String(os.release() || ''))
);
const SILENT_PRINT_SERVER_CAPABLE = process.platform === 'win32' || IS_WSL;

const ADMIN_SESSIONS = new Map();
const LOGIN_RATE_LIMIT = new Map();
const ORDER_LOG_RATE_LIMIT = new Map();
const ORDER_RECEIPT_RATE_LIMIT = new Map();
const WAITER_REPRINT_RATE_LIMIT = new Map();
const ORDER_RECEIPT_MIME_TO_EXTENSION = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
]);
const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);
const LOCAL_CATALOG_IMAGE_PATH_PATTERN = /^\/assets\/catalog\/[a-f0-9]{64}\.(?:png|jpe?g|webp|gif|bmp|avif)$/i;
let DEFAULT_STATE_CACHE = null;
let STATE_CACHE = null;
let STATE_MANIFEST_CACHE = null;

if (NODE_ENV === 'production' && DATA_ENCRYPTION_KEY_FROM_ENV.length < 32) {
  throw new Error(
    'DATA_ENCRYPTION_KEY nao definido ou muito curto em producao. Configure um segredo aleatorio com pelo menos 32 caracteres.',
  );
}
if (NODE_ENV === 'production' && Buffer.byteLength(ORDER_RECEIPT_LINK_SECRET_FROM_ENV, 'utf8') < 32) {
  throw new Error(
    'ORDER_RECEIPT_LINK_SECRET nao definido ou muito curto em producao. Configure um segredo aleatorio com pelo menos 32 bytes.',
  );
}

function resolvePublicHost() {
  const configured = String(process.env.PUBLIC_HOST || '').trim();
  if (configured) return configured;

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address && address.family === 'IPv4' && !address.internal && address.address) {
        return address.address;
      }
    }
  }
  return 'localhost';
}

const PUBLIC_HOST = resolvePublicHost();
const PORT = Number.parseInt(process.env.PORT || '8000', 10);
const FALLBACK_ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `http://${PUBLIC_HOST}:${PORT}`,
  `https://${PUBLIC_HOST}:${PORT}`,
]);

if (ADMIN_PASSWORD_WAS_GENERATED) {
  console.warn('ADMIN_PASSWORD não definido. Senha temporária gerada para esta execução.');
  console.warn(`Usuário admin: ${ADMIN_USER}`);
  if (process.stdout.isTTY) {
    console.warn(`Senha admin temporária: ${ADMIN_BOOTSTRAP_PASSWORD}`);
  } else {
    console.warn('Senha admin temporária omitida porque o ambiente não é interativo.');
  }
}

if (PRINT_AGENT_ENABLED && !PRINT_AGENT_ACTIVE) {
  console.warn('PRINT_AGENT_TOKEN nao definido. O agente externo de impressao ficara desativado.');
}
if (PRINT_AGENT_TOKEN_WAS_GENERATED) {
  console.warn(`PRINT_AGENT_TOKEN nao definido. Token persistente criado em: ${PRINT_AGENT_TOKEN_PATH}`);
}

function normalizeIpAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  if (raw === '::1') return '127.0.0.1';
  return raw;
}

function isLoopbackIp(value) {
  const ip = normalizeIpAddress(value);
  return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1';
}

function isPrivateIp(value) {
  const ip = normalizeIpAddress(value);
  if (isLoopbackIp(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  const match = ip.match(/^172\.(\d{1,2})\./);
  if (match) {
    const octet = Number.parseInt(match[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  return ip.startsWith('fc') || ip.startsWith('fd');
}

function shouldTrustProxyHeaders(req) {
  if (['1', 'true', 'yes', 'sim', 'on'].includes(TRUST_PROXY)) return true;
  if (['0', 'false', 'no', 'nao', 'off'].includes(TRUST_PROXY)) return false;
  const remoteAddress = normalizeIpAddress(req.socket?.remoteAddress || '');
  if (TRUST_PROXY === 'private') return isPrivateIp(remoteAddress);
  return isLoopbackIp(remoteAddress);
}

function getForwardedHeaderFirstValue(req, headerName) {
  return String(req.headers[headerName] || '').split(',')[0].trim();
}

function getForwardedIpChain(req) {
  return String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((value) => normalizeIpAddress(value))
    .filter((value) => isIP(value) !== 0);
}

function getClientIp(req) {
  const remoteAddress = normalizeIpAddress(req.socket?.remoteAddress || 'unknown') || 'unknown';
  if (!shouldTrustProxyHeaders(req)) return remoteAddress;

  const forwardedChain = getForwardedIpChain(req);
  if (forwardedChain.length === 0) return remoteAddress;

  const trustPrivateHops = TRUST_PROXY === 'private'
    || ['1', 'true', 'yes', 'sim', 'on'].includes(TRUST_PROXY);
  while (forwardedChain.length > 1) {
    const proxyHop = forwardedChain.at(-1);
    const isTrustedHop = isLoopbackIp(proxyHop)
      || (trustPrivateHops && isPrivateIp(proxyHop));
    if (!isTrustedHop) break;
    forwardedChain.pop();
  }

  return forwardedChain.at(-1) || remoteAddress;
}

function secureCompare(expected, received) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

const ENCRYPTED_SECRET_PREFIX = 'enc:v1';
const HASHED_MANAGER_PIN_PREFIX = 'pin:v1';

function encryptSecret(value) {
  const plaintext = String(value || '');
  if (!plaintext || plaintext.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

function decryptSecret(value) {
  const stored = String(value || '');
  if (!stored || !stored.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) return stored;
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Formato de segredo fiscal criptografado invalido.');
  }
  try {
    const iv = Buffer.from(parts[2], 'base64url');
    const authTag = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'Nao foi possivel descriptografar os segredos fiscais. Verifique DATA_ENCRYPTION_KEY.',
    );
  }
}

function hashManagerPin(value) {
  const pin = String(value || '').trim();
  if (!pin || pin.startsWith(`${HASHED_MANAGER_PIN_PREFIX}:`)) return pin;
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32);
  return [
    HASHED_MANAGER_PIN_PREFIX,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(':');
}

function verifyManagerPin(storedValue, receivedValue) {
  const stored = String(storedValue || '').trim();
  const received = String(receivedValue || '').trim();
  if (!stored || !received) return false;
  if (!stored.startsWith(`${HASHED_MANAGER_PIN_PREFIX}:`)) {
    return secureCompare(stored, received);
  }
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pin' || parts[1] !== 'v1') return false;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const expected = Buffer.from(parts[3], 'base64url');
    const receivedHash = scryptSync(received, salt, expected.length);
    return expected.length > 0
      && expected.length === receivedHash.length
      && timingSafeEqual(expected, receivedHash);
  } catch {
    return false;
  }
}

function normalizeWaiterUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return '';
  return username;
}

function normalizeWaiterRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return WAITER_ROLES.has(role) ? role : '';
}

function validateWaiterPassword(value) {
  const password = String(value || '');
  if (password.length < 4 || password.length > 128) {
    return { error: 'A senha ou PIN deve ter entre 4 e 128 caracteres.' };
  }
  return { password };
}

function deriveWaiterPassword(password, salt, { n = WAITER_SCRYPT_N, r = WAITER_SCRYPT_R, p = WAITER_SCRYPT_P } = {}) {
  return scryptSync(String(password || ''), salt, 32, {
    N: n,
    r,
    p,
    maxmem: WAITER_SCRYPT_MAXMEM,
  });
}

function hashWaiterPassword(value) {
  const validation = validateWaiterPassword(value);
  if (validation.error) throw new Error(validation.error);
  const salt = randomBytes(16);
  const derived = deriveWaiterPassword(validation.password, salt);
  return [
    WAITER_PASSWORD_HASH_PREFIX,
    `N=${WAITER_SCRYPT_N}`,
    `r=${WAITER_SCRYPT_R}`,
    `p=${WAITER_SCRYPT_P}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(':');
}

function verifyWaiterPassword(storedValue, receivedValue) {
  const stored = String(storedValue || '').trim();
  const received = String(receivedValue || '');
  if (!stored || received.length < 1 || received.length > 128) return false;
  const parts = stored.split(':');
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== WAITER_PASSWORD_HASH_PREFIX) return false;
  const n = Number.parseInt(String(parts[2] || '').replace(/^N=/, ''), 10);
  const r = Number.parseInt(String(parts[3] || '').replace(/^r=/, ''), 10);
  const p = Number.parseInt(String(parts[4] || '').replace(/^p=/, ''), 10);
  if (n !== WAITER_SCRYPT_N || r !== WAITER_SCRYPT_R || p !== WAITER_SCRYPT_P) return false;
  try {
    const salt = Buffer.from(parts[5], 'base64url');
    const expected = Buffer.from(parts[6], 'base64url');
    if (salt.length !== 16 || expected.length !== 32) return false;
    const receivedHash = deriveWaiterPassword(received, salt, { n, r, p });
    return timingSafeEqual(expected, receivedHash);
  } catch {
    return false;
  }
}

function isWaiterPasswordHashWellFormed(storedValue) {
  const stored = String(storedValue || '').trim();
  const parts = stored.split(':');
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== WAITER_PASSWORD_HASH_PREFIX) return false;
  const n = Number.parseInt(String(parts[2] || '').replace(/^N=/, ''), 10);
  const r = Number.parseInt(String(parts[3] || '').replace(/^r=/, ''), 10);
  const p = Number.parseInt(String(parts[4] || '').replace(/^p=/, ''), 10);
  if (n !== WAITER_SCRYPT_N || r !== WAITER_SCRYPT_R || p !== WAITER_SCRYPT_P) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[5] || '') || !/^[A-Za-z0-9_-]+$/.test(parts[6] || '')) return false;
  try {
    return Buffer.from(parts[5], 'base64url').length === 16
      && Buffer.from(parts[6], 'base64url').length === 32;
  } catch {
    return false;
  }
}

function normalizeAdminDisplayName(value) {
  const displayName = String(value || '').trim().replace(/\s+/g, ' ');
  if (displayName.length < 2 || displayName.length > 60 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return '';
  }
  return displayName;
}

function validateAdminPassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 128) {
    return { error: 'A nova senha deve ter entre 8 e 128 caracteres.' };
  }
  return { password };
}

let WAITER_DUMMY_PASSWORD_HASH = '';
function getWaiterDummyPasswordHash() {
  if (!WAITER_DUMMY_PASSWORD_HASH) {
    WAITER_DUMMY_PASSWORD_HASH = hashWaiterPassword('credencial-inexistente-uso-interno');
  }
  return WAITER_DUMMY_PASSWORD_HASH;
}

function deriveWaiterCsrfToken(rawSessionToken) {
  const token = String(rawSessionToken || '');
  if (!token || token.length > 200) return '';
  return createHmac('sha256', DATA_ENCRYPTION_KEY)
    .update(`waiter-csrf:v1\0${token}`, 'utf8')
    .digest('base64url');
}

function getWaiterCsrfToken(req, sessionId) {
  const safeSessionId = trimString(sessionId, 80);
  if (!safeSessionId) return '';
  const rawSessionToken = parseCookies(req.headers.cookie)[WAITER_SESSION_COOKIE];
  const csrfToken = deriveWaiterCsrfToken(rawSessionToken);
  if (!csrfToken) return '';
  const result = db.prepare(`
    UPDATE waiter_sessions
    SET csrf_hash = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(hashSessionSecret(csrfToken), safeSessionId);
  return Number(result.changes) === 1 ? csrfToken : '';
}

function mapFiscalEnvironments(fiscal, mapper) {
  const environments = fiscal?.environments;
  if (!environments || typeof environments !== 'object' || Array.isArray(environments)) return;
  for (const [environment, config] of Object.entries(environments)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) continue;
    environments[environment] = mapper({ ...config }, environment);
  }
}

function protectFiscalSecretsForStorage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const protectedFiscal = cloneState(value);
  protectedFiscal.csc = encryptSecret(protectedFiscal.csc);
  protectedFiscal.certificatePassword = encryptSecret(protectedFiscal.certificatePassword);
  mapFiscalEnvironments(protectedFiscal, (config) => ({
    ...config,
    csc: encryptSecret(config.csc),
  }));
  if (
    protectedFiscal.cashierPermissions
    && typeof protectedFiscal.cashierPermissions === 'object'
    && !Array.isArray(protectedFiscal.cashierPermissions)
  ) {
    protectedFiscal.cashierPermissions = {
      ...protectedFiscal.cashierPermissions,
      managerPin: hashManagerPin(protectedFiscal.cashierPermissions.managerPin),
    };
  }
  return protectedFiscal;
}

function serializeSectionForStorage(section, value) {
  const storageValue = section === 'fiscal'
    ? protectFiscalSecretsForStorage(value)
    : value;
  return JSON.stringify(storageValue);
}

function restoreFiscalSecretsFromStorage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const fiscal = cloneState(value);
  fiscal.csc = decryptSecret(fiscal.csc);
  fiscal.certificatePassword = decryptSecret(fiscal.certificatePassword);
  mapFiscalEnvironments(fiscal, (config) => ({
    ...config,
    csc: decryptSecret(config.csc),
  }));
  return fiscal;
}

function redactFiscalForAdmin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const fiscal = cloneState(value);
  fiscal.cscConfigured = Boolean(String(fiscal.csc || '').trim());
  fiscal.csc = '';
  fiscal.certificatePasswordConfigured = Boolean(String(fiscal.certificatePassword || ''));
  fiscal.certificatePassword = '';
  mapFiscalEnvironments(fiscal, (config) => ({
    ...config,
    cscConfigured: Boolean(String(config.csc || '').trim()),
    csc: '',
  }));
  if (
    fiscal.cashierPermissions
    && typeof fiscal.cashierPermissions === 'object'
    && !Array.isArray(fiscal.cashierPermissions)
  ) {
    fiscal.cashierPermissions = {
      ...fiscal.cashierPermissions,
      managerPinConfigured: Boolean(String(fiscal.cashierPermissions.managerPin || '').trim()),
      managerPin: '',
    };
  }
  delete fiscal._managerPin;
  delete fiscal.managerPinForAction;
  delete fiscal.authorizationPin;
  return fiscal;
}

function toAdminState(rawState) {
  const state = normalizeState(rawState);
  return {
    ...state,
    fiscal: redactFiscalForAdmin(state.fiscal),
  };
}

function headerValueToString(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function getPrintAgentTokenFromRequest(req) {
  const authorization = headerValueToString(req.headers.authorization);
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) return String(match[1]).trim();
  }

  const headerToken = headerValueToString(req.headers['x-print-agent-token']);
  if (headerToken) return headerToken;
  return '';
}

function normalizePrintAgentClientId(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 120 || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  return raw;
}

function hashPrintAgentSecret(purpose, value) {
  const secret = String(value || '');
  if (!secret || secret.length > 200) return '';
  return createHmac('sha256', DATA_ENCRYPTION_KEY)
    .update('print-agent-' + purpose + ':v1\0' + secret, 'utf8')
    .digest('hex');
}

function printAgentPayloadMatchesAccess(access, payload) {
  if (!access?.ok || access.legacy) return true;
  const bodyClientId = payload?.clientId == null
    ? ''
    : normalizePrintAgentClientId(payload.clientId);
  return !bodyClientId || bodyClientId === access.clientId;
}

function authenticatePrintAgentRequest(req) {
  if (!PRINT_AGENT_ACTIVE) return { ok: false, legacy: false, clientId: '' };
  const token = getPrintAgentTokenFromRequest(req);
  if (!token || token.length > 200) return { ok: false, legacy: false, clientId: '' };

  if (PRINT_AGENT_ALLOW_LEGACY_TOKEN && secureCompare(PRINT_AGENT_TOKEN, token)) {
    return {
      ok: true,
      legacy: true,
      clientId: normalizePrintAgentClientId(headerValueToString(req.headers['x-print-agent-id'])),
    };
  }

  const clientId = normalizePrintAgentClientId(headerValueToString(req.headers['x-print-agent-id']));
  if (!clientId) return { ok: false, legacy: false, clientId: '' };
  const row = db.prepare(`
    SELECT credential_hash AS credentialHash
    FROM print_agent_credentials
    WHERE client_id = ? AND revoked_at IS NULL
  `).get(clientId);
  const receivedHash = hashPrintAgentSecret('credential', token);
  if (!row?.credentialHash || !receivedHash || !secureCompare(row.credentialHash, receivedHash)) {
    return { ok: false, legacy: false, clientId: '' };
  }

  const now = new Date();
  const touchBefore = new Date(now.getTime() - 60_000).toISOString();
  db.prepare(`
    UPDATE print_agent_credentials
    SET last_used_at = ?
    WHERE client_id = ?
      AND revoked_at IS NULL
      AND (last_used_at IS NULL OR last_used_at < ?)
  `).run(now.toISOString(), clientId, touchBefore);

  return { ok: true, legacy: false, clientId };
}

function hasPrintAgentAccess(req) {
  return authenticatePrintAgentRequest(req).ok;
}

function getPrintAgentClientId(req, payload = null, access = null) {
  if (access?.ok && access.clientId) return access.clientId;
  const fromBody = trimString(payload?.clientId, 120);
  if (fromBody) return fromBody;

  const fromHeader = trimString(headerValueToString(req.headers['x-print-agent-id']), 120);
  if (fromHeader) return fromHeader;

  const fromHost = trimString(headerValueToString(req.headers.host), 120);
  if (fromHost) return fromHost;

  return 'agent-' + (trimString(getClientIp(req), 80) || 'unknown');
}

function isRequestSecure(req) {
  const forwardedProto = shouldTrustProxyHeaders(req)
    ? getForwardedHeaderFirstValue(req, 'x-forwarded-proto').toLowerCase()
    : '';
  return Boolean(req.socket?.encrypted) || forwardedProto === 'https';
}

function clearStaleAttempts() {
  const now = Date.now();
  for (const [key, entry] of LOGIN_RATE_LIMIT.entries()) {
    if (!entry) {
      LOGIN_RATE_LIMIT.delete(key);
      continue;
    }
    if (entry.blockUntil && entry.blockUntil > now) continue;
    if (now - entry.firstAttemptAt > LOGIN_RATE_WINDOW_MS) {
      LOGIN_RATE_LIMIT.delete(key);
    }
  }
}

function getLoginRateKey(req, user) {
  return `${getClientIp(req)}|${String(user || '').trim().toLowerCase()}`;
}

function getLoginBlockRemainingMs(rateKey) {
  clearStaleAttempts();
  const entry = LOGIN_RATE_LIMIT.get(rateKey);
  if (!entry || !entry.blockUntil) return 0;
  const remaining = entry.blockUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

function registerLoginFailure(rateKey, maxAttempts = LOGIN_RATE_MAX_ATTEMPTS) {
  clearStaleAttempts();
  const now = Date.now();
  const entry = LOGIN_RATE_LIMIT.get(rateKey);

  if (!entry || (now - entry.firstAttemptAt) > LOGIN_RATE_WINDOW_MS) {
    LOGIN_RATE_LIMIT.set(rateKey, {
      count: 1,
      firstAttemptAt: now,
      blockUntil: 0,
    });
    return;
  }

  entry.count += 1;
  if (entry.count >= Math.max(1, Number(maxAttempts) || LOGIN_RATE_MAX_ATTEMPTS)) {
    entry.blockUntil = now + LOGIN_RATE_BLOCK_MS;
    entry.count = 0;
    entry.firstAttemptAt = now;
  }
  LOGIN_RATE_LIMIT.set(rateKey, entry);
}

function clearLoginFailures(rateKey) {
  LOGIN_RATE_LIMIT.delete(rateKey);
}

function checkSlidingRateLimit(map, key, maxRequests, windowMs, options = {}) {
  const blockMs = Math.max(0, Number.parseInt(String(options?.blockMs ?? 0), 10) || 0);
  const blockAfter = Math.max(1, Number.parseInt(String(options?.blockAfter ?? Number.MAX_SAFE_INTEGER), 10) || Number.MAX_SAFE_INTEGER);
  const now = Date.now();

  for (const [storedKey, storedEntry] of map.entries()) {
    if (!storedEntry) {
      map.delete(storedKey);
      continue;
    }
    if (storedEntry.blockedUntil && storedEntry.blockedUntil > now) continue;
    if ((now - storedEntry.windowStartAt) > windowMs && (now - (storedEntry.lastViolationAt || 0)) > (windowMs * 2)) {
      map.delete(storedKey);
    }
  }

  const entry = map.get(key) || {
    count: 0,
    windowStartAt: now,
    violations: 0,
    blockedUntil: 0,
    lastViolationAt: 0,
  };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    map.set(key, entry);
    return {
      limited: true,
      isBlocked: true,
      retryAfterMs: Math.max(1, entry.blockedUntil - now),
    };
  }

  if ((now - entry.windowStartAt) > windowMs) {
    entry.count = 0;
    entry.windowStartAt = now;
  }

  entry.count += 1;
  if (entry.count <= maxRequests) {
    map.set(key, entry);
    return { limited: false, isBlocked: false, retryAfterMs: 0 };
  }

  entry.violations = (entry.violations || 0) + 1;
  entry.lastViolationAt = now;
  const windowRetryAfter = Math.max(1, windowMs - (now - entry.windowStartAt));

  if (blockMs > 0 && entry.violations >= blockAfter) {
    entry.blockedUntil = now + blockMs;
    entry.violations = 0;
    entry.count = 0;
    entry.windowStartAt = now;
    map.set(key, entry);
    return {
      limited: true,
      isBlocked: true,
      retryAfterMs: blockMs,
    };
  }

  map.set(key, entry);
  return {
    limited: true,
    isBlocked: false,
    retryAfterMs: windowRetryAfter,
  };
}

function sanitizeOrigin(origin) {
  return String(origin || '').trim();
}

function isOriginAllowed(req, origin) {
  const normalized = sanitizeOrigin(origin);
  if (!normalized) return true;
  if (normalized === 'null') return ALLOW_NULL_ORIGIN;
  if (CORS_ORIGINS.has(normalized)) return true;
  if (FALLBACK_ALLOWED_ORIGINS.has(normalized)) return true;

  const host = String(req.headers.host || '').trim();
  if (!host) return false;
  return normalized === `http://${host}` || normalized === `https://${host}`;
}

function isPublicWriteEndpoint(req, pathname) {
  if (req.method !== 'POST') return false;
  return pathname === '/api/order-logs' || pathname === '/api/order-receipts';
}

function validatePublicWriteOrigin(req, pathname) {
  if (!isPublicWriteEndpoint(req, pathname)) return { ok: true, error: '' };
  const origin = sanitizeOrigin(req.headers.origin);
  if (!origin) {
    if (!PUBLIC_WRITE_REQUIRE_ORIGIN) return { ok: true, error: '' };
    return { ok: false, error: 'Origem obrigatoria para este endpoint.' };
  }
  if (!isOriginAllowed(req, origin)) {
    return { ok: false, error: 'Origem nao permitida.' };
  }
  return { ok: true, error: '' };
}

function validateWaiterWriteOrigin(req, pathname) {
  if (!pathname.startsWith('/api/waiter/')) return { ok: true, error: '' };
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return { ok: true, error: '' };
  const origin = sanitizeOrigin(req.headers.origin);
  if (!origin) {
    if (!WAITER_WRITE_REQUIRE_ORIGIN) return { ok: true, error: '' };
    return { ok: false, error: 'Origem obrigatoria para este endpoint.' };
  }
  if (!isOriginAllowed(req, origin)) {
    return { ok: false, error: 'Origem nao permitida.' };
  }
  return { ok: true, error: '' };
}

function validateStockWriteOrigin(req, pathname) {
  if (!pathname.startsWith('/api/stock/')) return { ok: true, error: '' };
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return { ok: true, error: '' };
  const origin = sanitizeOrigin(req.headers.origin);
  if (!origin) {
    if (!STOCK_WRITE_REQUIRE_ORIGIN) return { ok: true, error: '' };
    return { ok: false, error: 'Origem obrigatoria para movimentar estoque.' };
  }
  if (!isOriginAllowed(req, origin)) {
    return { ok: false, error: 'Origem nao permitida.' };
  }
  return { ok: true, error: '' };
}

function emptySection(section) {
  if (['categories', 'products', 'combos', 'promotions', 'announcements', 'borders'].includes(section)) return [];
  return {};
}

function buildEmptyState() {
  const fallback = {};
  for (const section of SECTIONS) fallback[section] = emptySection(section);
  return fallback;
}

function cloneState(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function toPublicState(rawState) {
  const normalized = normalizeState(rawState);
  const publicState = {};
  for (const section of PUBLIC_STATE_SECTIONS) {
    publicState[section] = cloneState(normalized[section]);
  }
  return publicState;
}

function normalizeState(raw) {
  const state = {};
  for (const section of SECTIONS) {
    const value = raw?.[section];
    if (['categories', 'products', 'combos', 'promotions', 'announcements', 'borders'].includes(section)) {
      state[section] = Array.isArray(value) ? value : [];
    } else {
      state[section] = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
  }
  return state;
}

function readDefaultState() {
  if (DEFAULT_STATE_CACHE) return cloneState(DEFAULT_STATE_CACHE);

  if (!existsSync(DEFAULT_DATA_PATH)) {
    DEFAULT_STATE_CACHE = buildEmptyState();
    return cloneState(DEFAULT_STATE_CACHE);
  }

  try {
    const rawText = readFileSync(DEFAULT_DATA_PATH, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(rawText);
    DEFAULT_STATE_CACHE = normalizeState(parsed);
    return cloneState(DEFAULT_STATE_CACHE);
  } catch (error) {
    console.error('Falha ao ler default-data.json. Usando estado vazio.', error);
    DEFAULT_STATE_CACHE = buildEmptyState();
    return cloneState(DEFAULT_STATE_CACHE);
  }
}

function persistDefaultStateSnapshot(state) {
  const normalized = toPublicState(state);
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${DEFAULT_DATA_PATH}.tmp`;

  try {
    writeFileSync(tempPath, payload, 'utf8');
    renameSync(tempPath, DEFAULT_DATA_PATH);
    DEFAULT_STATE_CACHE = normalizeState(normalized);
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // Ignora erro ao limpar arquivo temporario.
    }
    console.error('Falha ao atualizar default-data.json.', error);
  }
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function pruneOldDbBackups() {
  if (!existsSync(DB_BACKUP_DIR)) return;

  let backups = [];
  try {
    backups = readdirSync(DB_BACKUP_DIR)
      .filter((name) => /^cardapio-\d{4}-\d{2}-\d{2}T/.test(name) && name.toLowerCase().endsWith('.db'))
      .map((name) => {
        const filePath = path.join(DB_BACKUP_DIR, name);
        let mtimeMs = 0;
        try {
          mtimeMs = statSync(filePath).mtimeMs || 0;
        } catch {
          mtimeMs = 0;
        }
        return { name, filePath, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (error) {
    console.error('Falha ao listar backups do banco.', error);
    return;
  }

  const stale = backups.slice(DB_BACKUP_KEEP_FILES);
  for (const item of stale) {
    try {
      unlinkSync(item.filePath);
    } catch (error) {
      console.error(`Falha ao remover backup antigo: ${item.name}`, error);
    }
  }
}

function backupCurrentDb() {
  if (!existsSync(DB_PATH)) return;
  mkdirSync(DB_BACKUP_DIR, { recursive: true });

  const backupName = `cardapio-${backupTimestamp()}.db`;
  const backupPath = path.join(DB_BACKUP_DIR, backupName);
  try {
    // Cria backup consistente mesmo com WAL ativo, incluindo transações ainda não checkpointadas.
    const sqlSafeBackupPath = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${sqlSafeBackupPath}';`);
    pruneOldDbBackups();
    console.log(`Backup do banco criado: ${backupName}`);
  } catch (error) {
    console.error('Falha ao criar backup do banco.', error);
  }
}

let db;

function protectFiscalSecretsInDatabase(targetDb) {
  const appStateTable = targetDb.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'app_state'
  `).get();
  if (!appStateTable) return false;

  // Evita que o conteudo substituido permaneça recuperavel em paginas livres
  // do SQLite. O VACUUM abaixo reescreve o arquivo depois da migracao.
  targetDb.exec('PRAGMA secure_delete = ON;');

  const row = targetDb.prepare("SELECT value FROM app_state WHERE section = 'fiscal'").get();
  if (!row?.value) return;

  let fiscal;
  try {
    fiscal = JSON.parse(row.value);
  } catch {
    throw new Error('Configuracao fiscal invalida no banco; migracao segura cancelada.');
  }
  if (!fiscal || typeof fiscal !== 'object' || Array.isArray(fiscal)) return;

  const protectedFiscal = protectFiscalSecretsForStorage(fiscal);
  const serialized = JSON.stringify(protectedFiscal);
  if (serialized === row.value) return false;

  targetDb.prepare(`
    UPDATE app_state
    SET value = ?, updated_at = ?
    WHERE section = 'fiscal'
  `).run(serialized, new Date().toISOString());
  targetDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  targetDb.exec('VACUUM;');
  targetDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  return true;
}

function migrateFiscalSecretsAtRest() {
  if (!protectFiscalSecretsInDatabase(db)) return;
  STATE_CACHE = null;
  STATE_MANIFEST_CACHE = null;
  checkpointWal('TRUNCATE');
  console.log('Segredos fiscais migrados para armazenamento protegido.');
}

function migrateFiscalBackupSecretsAtRest() {
  if (!existsSync(DB_BACKUP_DIR)) return;
  let migrated = 0;
  const backupNames = readdirSync(DB_BACKUP_DIR)
    .filter((name) => name.toLowerCase().endsWith('.db'));
  for (const backupName of backupNames) {
    const backupPath = path.join(DB_BACKUP_DIR, backupName);
    let backupDb;
    try {
      backupDb = new DatabaseSync(backupPath);
      if (protectFiscalSecretsInDatabase(backupDb)) migrated += 1;
    } catch (error) {
      throw new Error(
        `Falha ao proteger segredos fiscais no backup ${backupName}: ${String(error?.message || error)}`,
      );
    } finally {
      try {
        backupDb?.close();
      } catch {
        // A falha original, quando houver, deve ser preservada.
      }
    }
  }
  if (migrated > 0) {
    console.log(`Segredos fiscais protegidos em ${migrated} backup(s) do banco.`);
  }
}

function initDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(ORDER_RECEIPTS_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`PRAGMA synchronous = ${DB_SYNC_MODE};`);
  db.exec('PRAGMA wal_autocheckpoint = 200;');
  backupCurrentDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      section TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      password_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrateAdminAccountSchema();
  initializeAdminAccount();
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL,
      idempotency_key TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'legacy',
      status TEXT NOT NULL DEFAULT 'accepted',
      request_fingerprint TEXT NOT NULL DEFAULT '',
      confirmation_code TEXT NOT NULL DEFAULT '',
      confirmed_at TEXT NOT NULL DEFAULT '',
      confirmed_by TEXT NOT NULL DEFAULT '',
      inventory_applied INTEGER NOT NULL DEFAULT 1,
      client_key TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureTableColumn('order_logs', 'idempotency_key', "idempotency_key TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('order_logs', 'source', "source TEXT NOT NULL DEFAULT 'legacy'");
  ensureTableColumn('order_logs', 'status', "status TEXT NOT NULL DEFAULT 'accepted'");
  ensureTableColumn('order_logs', 'request_fingerprint', "request_fingerprint TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('order_logs', 'confirmation_code', "confirmation_code TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('order_logs', 'confirmed_at', "confirmed_at TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('order_logs', 'confirmed_by', "confirmed_by TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('order_logs', 'inventory_applied', 'inventory_applied INTEGER NOT NULL DEFAULT 1');
  ensureTableColumn('order_logs', 'client_key', "client_key TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_logs_idempotency_key
    ON order_logs (idempotency_key)
    WHERE TRIM(idempotency_key) <> '';
    CREATE INDEX IF NOT EXISTS idx_order_logs_status_created_at
    ON order_logs (status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_order_logs_pending_client
    ON order_logs (source, status, client_key, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_receipt_uploads (
      upload_id TEXT PRIMARY KEY,
      client_request_id TEXT NOT NULL,
      client_ip TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      access_url TEXT NOT NULL DEFAULT '',
      order_id INTEGER,
      created_at TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_order_receipt_uploads_pending
    ON order_receipt_uploads (client_ip, order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_order_receipt_uploads_order_id
    ON order_receipt_uploads (order_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_balances (
      product_id TEXT PRIMARY KEY,
      quantity REAL NOT NULL DEFAULT 0,
      minimum_quantity REAL NOT NULL DEFAULT 0,
      average_unit_cost REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      order_id INTEGER,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      balance_after REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      unit_revenue REAL NOT NULL DEFAULT 0,
      supplier TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      request_fingerprint TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON stock_movements(order_id, id);
    CREATE TABLE IF NOT EXISTS stock_xml_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_key TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL DEFAULT '',
      supplier_cnpj TEXT NOT NULL DEFAULT '',
      supplier_name TEXT NOT NULL DEFAULT '',
      issued_at TEXT NOT NULL DEFAULT '',
      total REAL NOT NULL DEFAULT 0,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_supplier_mappings (
      supplier_cnpj TEXT NOT NULL,
      supplier_product_code TEXT NOT NULL,
      product_id TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(supplier_cnpj, supplier_product_code)
    );
    CREATE TABLE IF NOT EXISTS stock_mutation_requests (
      request_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureTableColumn('stock_balances', 'average_unit_cost', 'average_unit_cost REAL NOT NULL DEFAULT 0');
  ensureTableColumn('stock_movements', 'unit_revenue', 'unit_revenue REAL NOT NULL DEFAULT 0');
  ensureTableColumn('stock_movements', 'actor', "actor TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('stock_movements', 'request_id', "request_id TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('stock_movements', 'request_fingerprint', "request_fingerprint TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_request_id_unique
    ON stock_movements(request_id)
    WHERE TRIM(request_id) <> '';
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at
    ON stock_movements(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created_at
    ON stock_movements(movement_type, created_at DESC, id DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      order_code TEXT NOT NULL,
      payload TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'order',
      source_id INTEGER,
      job_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      claimed_by TEXT NOT NULL DEFAULT '',
      claimed_at TEXT,
      lease_expires_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migratePrintJobsForMultipleSources();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_print_jobs_status_id
    ON print_jobs (status, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_job_key
    ON print_jobs (job_key)
    WHERE TRIM(job_key) <> '';
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_agent_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      consumed_by_client_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_print_agent_enrollments_expires_at
    ON print_agent_enrollments (expires_at);

    CREATE TABLE IF NOT EXISTS print_agent_credentials (
      client_id TEXT PRIMARY KEY,
      credential_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      rotated_at TEXT,
      last_used_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_print_agent_credentials_active
    ON print_agent_credentials (revoked_at, client_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_agent_heartbeats (
      client_id TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      print_mode TEXT NOT NULL DEFAULT '',
      paper_width_mm INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiter_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'waiter',
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      password_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_waiter_users_active_role
    ON waiter_users (active, role, display_name);

    CREATE TABLE IF NOT EXISTS waiter_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_hash TEXT NOT NULL,
      user_id INTEGER,
      actor_username TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      revoked_at TEXT,
      client_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_waiter_sessions_token_active
    ON waiter_sessions (token_hash, revoked_at, absolute_expires_at);
    CREATE INDEX IF NOT EXISTS idx_waiter_sessions_user_active
    ON waiter_sessions (user_id, revoked_at, absolute_expires_at);

    CREATE TABLE IF NOT EXISTS waiter_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_username TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      tab_id INTEGER,
      table_id INTEGER,
      order_id INTEGER,
      line_item_id TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      client_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_waiter_audit_tab_id
    ON waiter_audit_events (tab_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_waiter_audit_actor_id
    ON waiter_audit_events (actor_user_id, id DESC);

    CREATE TABLE IF NOT EXISTS waiter_mutation_requests (
      request_key TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      tab_id INTEGER,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_waiter_mutation_tab_id
    ON waiter_mutation_requests (tab_id, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS dining_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS table_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      customer_name TEXT NOT NULL DEFAULT '',
      waiter_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_table_tabs_status_id
    ON table_tabs (status, id DESC);
    CREATE TABLE IF NOT EXISTS table_tab_orders (
      tab_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL UNIQUE,
      batch_number INTEGER NOT NULL,
      print_requested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tab_id, batch_number)
    );
    CREATE INDEX IF NOT EXISTS idx_table_tab_orders_tab_id
    ON table_tab_orders (tab_id, batch_number);
    CREATE TABLE IF NOT EXISTS table_tab_members (
      tab_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      linked_by_user_id INTEGER,
      linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unlinked_at TEXT,
      PRIMARY KEY (tab_id, table_id)
    );
    CREATE INDEX IF NOT EXISTS idx_table_tab_members_tab_active
    ON table_tab_members (tab_id, active, is_primary DESC, table_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_tab_members_one_active_tab_per_table
    ON table_tab_members (table_id)
    WHERE active = 1;
  `);
  ensureTableColumn('table_tabs', 'cashier_order_id', 'cashier_order_id INTEGER');
  ensureTableColumn('table_tabs', 'waiter_user_id', 'waiter_user_id INTEGER');
  ensureTableColumn('table_tabs', 'waiter_username', "waiter_username TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('table_tabs', 'opened_by_user_id', 'opened_by_user_id INTEGER');
  ensureTableColumn('table_tabs', 'closed_by_user_id', 'closed_by_user_id INTEGER');
  ensureTableColumn('table_tabs', 'version', 'version INTEGER NOT NULL DEFAULT 1');
  ensureTableColumn('table_tabs', 'bill_requested_at', 'bill_requested_at TEXT');
  ensureTableColumn('table_tabs', 'paid_at', 'paid_at TEXT');
  ensureTableColumn('table_tab_orders', 'created_by_user_id', 'created_by_user_id INTEGER');
  ensureTableColumn('table_tab_orders', 'client_request_id', "client_request_id TEXT NOT NULL DEFAULT ''");
  db.exec(`
    DROP INDEX IF EXISTS idx_table_tabs_one_open_per_table;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_tabs_one_active_per_table
    ON table_tabs (table_id)
    WHERE status IN ('open', 'awaiting_payment');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_tab_orders_client_request
    ON table_tab_orders (client_request_id)
    WHERE TRIM(client_request_id) <> '';
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_table_tabs_cashier_order_id
    ON table_tabs (cashier_order_id);
  `);
  db.exec(`
    INSERT OR IGNORE INTO table_tab_members (
      tab_id, table_id, is_primary, active, linked_by_user_id, linked_at
    )
    SELECT id, table_id, 1,
      CASE WHEN status IN ('open', 'awaiting_payment') THEN 1 ELSE 0 END,
      opened_by_user_id, opened_at
    FROM table_tabs;

    UPDATE table_tab_members
    SET active = 1, unlinked_at = NULL
    WHERE is_primary = 1
      AND tab_id IN (
        SELECT id FROM table_tabs WHERE status IN ('open', 'awaiting_payment')
      );

    UPDATE table_tab_members
    SET active = 0, unlinked_at = COALESCE(unlinked_at, CURRENT_TIMESTAMP)
    WHERE active = 1
      AND tab_id IN (
        SELECT id FROM table_tabs WHERE status NOT IN ('open', 'awaiting_payment')
      );
  `);
  seedDefaultDiningTables();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'open',
      operator TEXT NOT NULL DEFAULT '',
      opening_amount REAL NOT NULL DEFAULT 0,
      opening_amount_cents INTEGER NOT NULL DEFAULT 0,
      closing_amount REAL,
      closing_amount_cents INTEGER,
      expected_amount REAL,
      expected_amount_cents INTEGER,
      difference_amount REAL,
      difference_amount_cents INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      snapshot_payload TEXT NOT NULL DEFAULT '{}',
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cash_sessions_status_id
    ON cash_sessions (status, id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      order_id INTEGER,
      fiscal_document_id INTEGER,
      type TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureTableColumn('cash_sessions', 'opening_amount_cents', 'opening_amount_cents INTEGER NOT NULL DEFAULT 0');
  ensureTableColumn('cash_sessions', 'closing_amount_cents', 'closing_amount_cents INTEGER');
  ensureTableColumn('cash_sessions', 'expected_amount_cents', 'expected_amount_cents INTEGER');
  ensureTableColumn('cash_sessions', 'difference_amount_cents', 'difference_amount_cents INTEGER');
  ensureTableColumn('cash_sessions', 'snapshot_payload', "snapshot_payload TEXT NOT NULL DEFAULT '{}'");
  ensureTableColumn('cash_movements', 'amount_cents', 'amount_cents INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    UPDATE cash_sessions
    SET opening_amount_cents = ROUND(opening_amount * 100)
    WHERE opening_amount_cents = 0 AND opening_amount != 0;
  `);
  db.exec(`
    UPDATE cash_sessions
    SET closing_amount_cents = ROUND(closing_amount * 100)
    WHERE closing_amount IS NOT NULL AND closing_amount_cents IS NULL;
  `);
  db.exec(`
    UPDATE cash_sessions
    SET expected_amount_cents = ROUND(expected_amount * 100)
    WHERE expected_amount IS NOT NULL AND expected_amount_cents IS NULL;
  `);
  db.exec(`
    UPDATE cash_sessions
    SET difference_amount_cents = ROUND(difference_amount * 100)
    WHERE difference_amount IS NOT NULL AND difference_amount_cents IS NULL;
  `);
  db.exec(`
    UPDATE cash_movements
    SET amount_cents = ROUND(amount * 100)
    WHERE amount_cents = 0 AND amount != 0;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id
    ON cash_movements (session_id, id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cash_movements_order_id
    ON cash_movements (order_id);
  `);
  // Ciclos receber -> estornar -> receber novamente precisam preservar todos
  // os movimentos. A exclusividade e controlada transacionalmente pelo estado
  // atual do pedido em receiveOrderInCashier.
  db.exec('DROP INDEX IF EXISTS idx_cash_movements_unique_order_sale;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      document_type TEXT NOT NULL DEFAULT 'nfce',
      status TEXT NOT NULL DEFAULT 'draft',
      environment TEXT NOT NULL DEFAULT 'homologacao',
      access_key TEXT NOT NULL DEFAULT '',
      protocol TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL DEFAULT '',
      series TEXT NOT NULL DEFAULT '',
      total REAL NOT NULL DEFAULT 0,
      customer_name TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      sefaz_response TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      operation_token TEXT NOT NULL DEFAULT '',
      operation_type TEXT NOT NULL DEFAULT '',
      operation_started_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureTableColumn('fiscal_documents', 'operation_token', "operation_token TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('fiscal_documents', 'operation_type', "operation_type TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('fiscal_documents', 'operation_started_at', 'operation_started_at TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fiscal_documents_order_id
    ON fiscal_documents (order_id, id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status_id
    ON fiscal_documents (status, id);
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_documents_unique_number
    ON fiscal_documents (document_type, environment, series, number)
    WHERE TRIM(number) <> '';
  `);
  db.exec(`
    DROP TRIGGER IF EXISTS trg_stock_movements_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_stock_movements_order_accepted_update;
    DROP TRIGGER IF EXISTS trg_print_jobs_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_print_jobs_order_accepted_update;
    DROP TRIGGER IF EXISTS trg_cash_movements_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_cash_movements_order_accepted_update;
    DROP TRIGGER IF EXISTS trg_fiscal_documents_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_fiscal_documents_order_accepted_update;
    DROP TRIGGER IF EXISTS trg_table_tab_orders_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_table_tab_orders_order_accepted_update;
    DROP TRIGGER IF EXISTS trg_table_tabs_cashier_order_accepted_insert;
    DROP TRIGGER IF EXISTS trg_table_tabs_cashier_order_accepted_update;

    CREATE TRIGGER trg_stock_movements_order_accepted_insert
    BEFORE INSERT ON stock_movements
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_stock_movements_order_accepted_update
    BEFORE UPDATE OF order_id ON stock_movements
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_print_jobs_order_accepted_insert
    BEFORE INSERT ON print_jobs
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_print_jobs_order_accepted_update
    BEFORE UPDATE OF order_id ON print_jobs
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_cash_movements_order_accepted_insert
    BEFORE INSERT ON cash_movements
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_cash_movements_order_accepted_update
    BEFORE UPDATE OF order_id ON cash_movements
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_fiscal_documents_order_accepted_insert
    BEFORE INSERT ON fiscal_documents
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_fiscal_documents_order_accepted_update
    BEFORE UPDATE OF order_id ON fiscal_documents
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_table_tab_orders_order_accepted_insert
    BEFORE INSERT ON table_tab_orders
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_table_tab_orders_order_accepted_update
    BEFORE UPDATE OF order_id ON table_tab_orders
    WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_table_tabs_cashier_order_accepted_insert
    BEFORE INSERT ON table_tabs
    WHEN NEW.cashier_order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.cashier_order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
    CREATE TRIGGER trg_table_tabs_cashier_order_accepted_update
    BEFORE UPDATE OF cashier_order_id ON table_tabs
    WHEN NEW.cashier_order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM order_logs WHERE id = NEW.cashier_order_id AND status = 'accepted'
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORDER_NOT_ACCEPTED');
    END;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      environment TEXT NOT NULL DEFAULT 'homologacao',
      access_key TEXT NOT NULL DEFAULT '',
      protocol TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL DEFAULT '',
      series TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      sefaz_response TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fiscal_events_type_id
    ON fiscal_events (event_type, id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fiscal_events_document_id
    ON fiscal_events (document_id, id);
  `);

  const defaults = readDefaultState();
  const existing = new Set(db.prepare('SELECT section FROM app_state').all().map((row) => row.section));
  const insertState = db.prepare(`
    INSERT INTO app_state (section, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `);

  for (const section of SECTIONS) {
    if (existing.has(section)) continue;
    insertState.run(section, serializeSectionForStorage(section, defaults[section]));
  }

  migrateFiscalSecretsAtRest();
  migrateFiscalBackupSecretsAtRest();
  migrateLegacyOrderReceiptReferences();
  cleanupExpiredPublicOrders();
  cleanupExpiredOrderReceiptUploads();

  // Mantem o fallback /api/default-data alinhado com o estado real do banco.
  const bootState = readState();
  persistDefaultStateSnapshot(bootState);
  db.exec('PRAGMA optimize;');
}

function checkpointWal(mode = 'PASSIVE') {
  try {
    db.exec(`PRAGMA wal_checkpoint(${mode});`);
  } catch (error) {
    console.error(`Falha ao executar checkpoint WAL (${mode}).`, error);
  }
}

function tableHasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName});`).all();
  return rows.some((row) => String(row.name || '').toLowerCase() === String(columnName || '').toLowerCase());
}

function ensureTableColumn(tableName, columnName, definition) {
  if (tableHasColumn(tableName, columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`);
}

function migratePrintJobsForMultipleSources() {
  const columns = db.prepare('PRAGMA table_info(print_jobs);').all();
  const hasSourceType = columns.some((row) => String(row.name || '') === 'source_type');
  const orderIdColumn = columns.find((row) => String(row.name || '') === 'order_id');
  if (hasSourceType && Number(orderIdColumn?.notnull || 0) === 0) return;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(`
      ALTER TABLE print_jobs RENAME TO print_jobs_legacy;
      CREATE TABLE print_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        order_code TEXT NOT NULL,
        payload TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'order',
        source_id INTEGER,
        job_key TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        claimed_by TEXT NOT NULL DEFAULT '',
        claimed_at TEXT,
        lease_expires_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO print_jobs (
        id, order_id, order_code, payload, source_type, source_id, job_key,
        status, attempts, last_error, claimed_by, claimed_at, lease_expires_at,
        completed_at, created_at, updated_at
      )
      SELECT
        id, order_id, order_code, payload, 'order', order_id,
        'order:' || order_id || ':initial', status, attempts, last_error,
        claimed_by, claimed_at, lease_expires_at, completed_at, created_at, updated_at
      FROM print_jobs_legacy;
      DROP TABLE print_jobs_legacy;
    `);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original da migracao.
    }
    throw error;
  }
}

function seedDefaultDiningTables() {
  const existing = Number(db.prepare('SELECT COUNT(*) AS total FROM dining_tables').get()?.total || 0);
  if (existing > 0) return;

  const insert = db.prepare(`
    INSERT INTO dining_tables (table_number, label, active, created_at, updated_at)
    VALUES (?, '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (let number = 1; number <= WAITER_DEFAULT_TABLES; number += 1) insert.run(number);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original.
    }
    throw error;
  }
}

function createOptionalUniqueIndex(sql, label) {
  try {
    db.exec(sql);
  } catch (error) {
    console.warn(`Indice unico ${label} nao foi criado. Verifique registros duplicados antes de produzir.`, error?.message || error);
  }
}

function readState() {
  if (STATE_CACHE) return cloneState(STATE_CACHE);

  const defaults = readDefaultState();
  const rows = db.prepare('SELECT section, value FROM app_state').all();
  const state = { ...defaults };

  for (const row of rows) {
    if (!SECTIONS.includes(row.section)) continue;
    try {
      const parsed = JSON.parse(row.value);
      state[row.section] = row.section === 'fiscal'
        ? restoreFiscalSecretsFromStorage(parsed)
        : parsed;
    } catch {
      if (row.section === 'fiscal' && String(row.value || '').includes(`${ENCRYPTED_SECRET_PREFIX}:`)) {
        throw new Error(
          'Falha ao carregar configuracao fiscal protegida. Verifique DATA_ENCRYPTION_KEY antes de iniciar.',
        );
      }
      state[row.section] = defaults[row.section];
    }
  }
  STATE_CACHE = normalizeState(state);
  return cloneState(STATE_CACHE);
}

function readPublicState() {
  return buildStorefrontState(readState(), { activeOnly: true });
}

function readStateManifest() {
  if (STATE_MANIFEST_CACHE) return cloneState(STATE_MANIFEST_CACHE);

  const rows = db.prepare(`
    SELECT section, updated_at AS updatedAt, length(value) AS bytes
    FROM app_state
    ORDER BY section ASC
  `).all();

  const sections = {};
  for (const section of SECTIONS) {
    sections[section] = { updatedAt: '', bytes: 0 };
  }
  for (const row of rows) {
    if (!SECTIONS.includes(row.section)) continue;
    sections[row.section] = {
      updatedAt: String(row.updatedAt || ''),
      bytes: Number.parseInt(String(row.bytes || 0), 10) || 0,
    };
  }

  const version = SECTIONS
    .map((section) => {
      const item = sections[section] || {};
      return `${section}:${item.updatedAt || ''}:${item.bytes || 0}`;
    })
    .join('|');

  STATE_MANIFEST_CACHE = {
    ok: true,
    version,
    sections,
  };
  return cloneState(STATE_MANIFEST_CACHE);
}

function toPublicStateManifest(manifest) {
  const sections = {};
  for (const section of PUBLIC_STATE_SECTIONS) {
    const item = manifest?.sections?.[section] || {};
    sections[section] = {
      updatedAt: String(item.updatedAt || ''),
      bytes: Number.parseInt(String(item.bytes || 0), 10) || 0,
    };
  }

  const version = PUBLIC_STATE_SECTIONS
    .map((section) => {
      const item = sections[section] || {};
      return `${section}:${item.updatedAt || ''}:${item.bytes || 0}`;
    })
    .join('|');

  return {
    ok: true,
    version,
    sections,
  };
}

function readPublicStateManifest() {
  return toPublicStateManifest(readStateManifest());
}

function catalogReferenceProductId(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return trimString(value.productId || value.id, 140);
  }
  return trimString(value, 140);
}

function getCatalogProductReferences(state, productId) {
  const safeProductId = trimString(productId, 140);
  const combos = (Array.isArray(state?.combos) ? state.combos : []).filter((combo) => (
    Array.isArray(combo?.items)
    && combo.items.some((item) => catalogReferenceProductId(item) === safeProductId)
  ));
  const promotions = (Array.isArray(state?.promotions) ? state.promotions : []).filter((promotion) => (
    Array.isArray(promotion?.products)
    && promotion.products.some((item) => catalogReferenceProductId(item) === safeProductId)
  ));
  return { combos: combos.length, promotions: promotions.length };
}

function getProductStockReferences(productId) {
  const safeProductId = trimString(productId, 140);
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?) AS stockMovements,
      (SELECT COUNT(*) FROM stock_supplier_mappings WHERE product_id = ?) AS supplierMappings,
      (SELECT COUNT(*) FROM stock_balances WHERE product_id = ?) AS stockBalanceRows,
      COALESCE((SELECT quantity FROM stock_balances WHERE product_id = ? LIMIT 1), 0) AS stockBalanceQuantity
  `).get(safeProductId, safeProductId, safeProductId, safeProductId);
  return {
    stockMovements: Number(row?.stockMovements || 0),
    supplierMappings: Number(row?.supplierMappings || 0),
    stockBalanceRows: Number(row?.stockBalanceRows || 0),
    stockBalanceQuantity: roundStockQuantity(row?.stockBalanceQuantity || 0),
  };
}

function productStockReferencesAreBlocking(references) {
  return Number(references?.stockMovements || 0) > 0
    || Number(references?.supplierMappings || 0) > 0
    || Math.abs(Number(references?.stockBalanceQuantity || 0)) > 0.000001;
}

function productCatalogMutationError(productId, code, references) {
  const error = createOrderRequestError(
    code === 'PRODUCT_ID_HAS_HISTORY'
      ? `O ID "${productId}" pertence a um produto com historico de estoque e nao pode ser reutilizado.`
      : `O produto "${productId}" possui vinculos. Remova-os ou desative o produto em vez de exclui-lo.`,
    409,
    code,
  );
  error.linkedReferences = references;
  return error;
}

function validateProductCatalogTransition(currentState, nextState) {
  const currentProducts = Array.isArray(currentState?.products) ? currentState.products : [];
  const nextProducts = Array.isArray(nextState?.products) ? nextState.products : [];
  const currentIds = new Set(currentProducts.map((item) => trimString(item?.id, 140)).filter(Boolean));
  const nextIds = new Set(nextProducts.map((item) => trimString(item?.id, 140)).filter(Boolean));
  const cleanupBalanceIds = [];

  for (const productId of currentIds) {
    if (nextIds.has(productId)) continue;
    const catalogReferences = getCatalogProductReferences(nextState, productId);
    const stockReferences = getProductStockReferences(productId);
    const linkedReferences = { ...catalogReferences, ...stockReferences };
    if (catalogReferences.combos > 0
      || catalogReferences.promotions > 0
      || productStockReferencesAreBlocking(stockReferences)) {
      throw productCatalogMutationError(productId, 'PRODUCT_HAS_LINKED_RECORDS', linkedReferences);
    }
    if (stockReferences.stockBalanceRows > 0) cleanupBalanceIds.push(productId);
  }

  for (const productId of nextIds) {
    if (currentIds.has(productId)) continue;
    const stockReferences = getProductStockReferences(productId);
    if (productStockReferencesAreBlocking(stockReferences)) {
      throw productCatalogMutationError(productId, 'PRODUCT_ID_HAS_HISTORY', {
        combos: 0,
        promotions: 0,
        ...stockReferences,
      });
    }
    if (stockReferences.stockBalanceRows > 0) cleanupBalanceIds.push(productId);
  }

  return { cleanupBalanceIds: [...new Set(cleanupBalanceIds)] };
}

function validateCatalogStructureTransition(currentState, nextState, { validateProductCategories = true } = {}) {
  const nextProducts = Array.isArray(nextState?.products) ? nextState.products : [];
  const activeProductIds = new Set(
    nextProducts
      .filter((product) => product && typeof product === 'object' && product.active !== false)
      .map((product) => trimString(product.id, 140))
      .filter(Boolean),
  );
  const activeCombos = (Array.isArray(nextState?.combos) ? nextState.combos : [])
    .filter((combo) => combo && typeof combo === 'object' && combo.active !== false);
  const activeEmptyCombo = activeCombos
    .find((combo) => (
      !Array.isArray(combo.items) || combo.items.length === 0
    ));
  if (activeEmptyCombo) {
    throw createOrderRequestError(
      `O combo "${trimString(activeEmptyCombo.name || activeEmptyCombo.id, 120) || 'sem nome'}" precisa ter pelo menos um produto.`,
      409,
      'ACTIVE_COMBO_REQUIRES_ITEMS',
    );
  }

  const activeInvalidCombo = activeCombos.find((combo) => combo.items.some((item) => {
    const isObject = item && typeof item === 'object' && !Array.isArray(item);
    const productId = isObject ? catalogReferenceProductId(item) : '';
    const quantity = isObject ? Number(item.quantity ?? item.qty) : Number.NaN;
    return !productId
      || !Number.isInteger(quantity)
      || quantity < 1
      || quantity > 20
      || !activeProductIds.has(productId);
  }));
  if (activeInvalidCombo) {
    throw createOrderRequestError(
      `O combo "${trimString(activeInvalidCombo.name || activeInvalidCombo.id, 120) || 'sem nome'}" possui produto ou quantidade invalida.`,
      409,
      'ACTIVE_COMBO_INVALID_ITEMS',
    );
  }

  const currentCategoryIds = new Set(
    (Array.isArray(currentState?.categories) ? currentState.categories : [])
      .map((category) => trimString(category?.id, 140))
      .filter(Boolean),
  );
  const nextCategoryIds = new Set(
    (Array.isArray(nextState?.categories) ? nextState.categories : [])
      .map((category) => trimString(category?.id, 140))
      .filter(Boolean),
  );
  const removedCategoryIds = [...currentCategoryIds].filter((categoryId) => !nextCategoryIds.has(categoryId));
  for (const categoryId of removedCategoryIds) {
    const linkedProducts = (Array.isArray(nextState?.products) ? nextState.products : [])
      .filter((product) => trimString(product?.category, 140) === categoryId);
    if (linkedProducts.length > 0) {
      const error = createOrderRequestError(
        `A categoria "${categoryId}" ainda possui ${linkedProducts.length} produto(s). Reatribua-os antes de removê-la.`,
        409,
        'CATEGORY_HAS_LINKED_PRODUCTS',
      );
      error.linkedReferences = { products: linkedProducts.length };
      throw error;
    }
  }

  if (validateProductCategories) {
    const productWithMissingCategory = nextProducts.find((product) => {
      const rawCategoryId = typeof product?.category === 'string' ? product.category : '';
      const categoryId = trimString(rawCategoryId, 140);
      return rawCategoryId !== categoryId || !categoryId || !nextCategoryIds.has(categoryId);
    });
    if (productWithMissingCategory) {
      const categoryId = trimString(productWithMissingCategory?.category, 140);
      const error = createOrderRequestError(
        `O produto "${trimString(productWithMissingCategory.name || productWithMissingCategory.id, 120) || 'sem nome'}" aponta para uma categoria inexistente.`,
        409,
        'PRODUCT_CATEGORY_NOT_FOUND',
      );
      error.linkedReferences = { products: 1, categoryId };
      throw error;
    }
  }
}

function writeSections(sectionValues) {
  const payload = {};
  for (const [section, value] of Object.entries(sectionValues || {})) {
    if (!SECTIONS.includes(section)) continue;
    payload[section] = materializeSectionAssets(section, value, {
      assetsDir: CATALOG_ASSETS_DIR,
    }).value;
  }
  if (Object.keys(payload).length === 0) return;

  const statement = db.prepare(`
    INSERT INTO app_state (section, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(section) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  const validatesCatalog = ['products', 'categories', 'combos']
    .some((section) => Object.hasOwn(payload, section));
  const currentState = validatesCatalog ? readState() : null;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const nextState = currentState ? { ...currentState, ...payload } : null;
    const productTransition = currentState && Object.hasOwn(payload, 'products')
      ? validateProductCatalogTransition(currentState, nextState)
      : { cleanupBalanceIds: [] };
    if (currentState) {
      validateCatalogStructureTransition(currentState, nextState, {
        validateProductCategories: Object.hasOwn(payload, 'products') || Object.hasOwn(payload, 'categories'),
      });
    }
    const updatedAt = new Date().toISOString();
    for (const [section, value] of Object.entries(payload)) {
      statement.run(section, serializeSectionForStorage(section, value), updatedAt);
    }
    for (const productId of productTransition.cleanupBalanceIds) {
      db.prepare(`
        DELETE FROM stock_balances
        WHERE product_id = ? AND ABS(quantity) <= 0.000001
      `).run(productId);
    }
    db.exec('COMMIT;');
    if (!STATE_CACHE) {
      STATE_CACHE = readState();
    }
    for (const [section, value] of Object.entries(payload)) {
      STATE_CACHE[section] = cloneState(value);
    }
    STATE_MANIFEST_CACHE = null;
    checkpointWal('PASSIVE');
    persistDefaultStateSnapshot(STATE_CACHE);
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function parseOrderLogRow(row) {
  let payload = {};
  try {
    const parsed = JSON.parse(row?.payload || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
  } catch {
    payload = {};
  }

  payload.id = row.id;
  payload.orderCode = payload.orderCode || row.orderCode || `PED-${row.id}`;
  payload.createdAt = payload.createdAt || row.createdAt;
  const storedStatus = trimString(row?.status, 40).toLowerCase();
  payload.operationalStatus = storedStatus || ORDER_STATUS_ACCEPTED;
  payload.orderSource = trimString(row?.source, 40) || 'legacy';
  payload.inventoryApplied = Number(row?.inventoryApplied ?? 1) === 1;
  payload.confirmation = {
    code: trimString(row?.confirmationCode, 40),
    confirmedAt: trimString(row?.confirmedAt, 80),
    confirmedBy: trimString(row?.confirmedBy, 120),
  };
  if (Object.hasOwn(row || {}, 'fiscalDocumentId')) {
    payload.latestFiscalDocument = row.fiscalDocumentId == null ? null : {
      id: row.fiscalDocumentId,
      orderId: row.id,
      documentType: String(row.fiscalDocumentType || 'nfce'),
      status: String(row.fiscalDocumentStatus || 'draft'),
      environment: String(row.fiscalDocumentEnvironment || 'homologacao'),
      accessKey: String(row.fiscalDocumentAccessKey || ''),
      protocol: String(row.fiscalDocumentProtocol || ''),
      number: String(row.fiscalDocumentNumber || ''),
      series: String(row.fiscalDocumentSeries || ''),
      total: normalizeMoneyValue(row.fiscalDocumentTotal, 0),
      customerName: String(row.fiscalDocumentCustomerName || ''),
      error: String(row.fiscalDocumentError || ''),
      createdAt: String(row.fiscalDocumentCreatedAt || ''),
      updatedAt: String(row.fiscalDocumentUpdatedAt || ''),
    };
  }
  return payload;
}

function isOrderAccepted(orderLog) {
  return String(orderLog?.operationalStatus || ORDER_STATUS_ACCEPTED) === ORDER_STATUS_ACCEPTED;
}

function isOrderPending(orderLog) {
  return String(orderLog?.operationalStatus || '') === ORDER_STATUS_PENDING;
}

function buildOrderConfirmationCode(clientRequestId) {
  const compact = trimString(clientRequestId, 120).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!compact) return '';
  return `WEB-${compact.slice(-8).padStart(8, '0')}`;
}

function buildPublicOrderClientKey(clientIp) {
  return createHmac('sha256', DATA_ENCRYPTION_KEY)
    .update(`public-order-client\0${String(clientIp || 'unknown')}`, 'utf8')
    .digest('hex');
}

function buildOrderRequestFingerprint(payload) {
  let canonical = {};
  try {
    canonical = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? JSON.parse(JSON.stringify(payload))
      : {};
  } catch {
    canonical = {};
  }
  delete canonical.orderCode;
  delete canonical.createdAt;
  delete canonical.storeName;
  delete canonical.whatsappMessage;
  delete canonical.inventoryTracked;
  delete canonical.operationalStatus;
  delete canonical.orderSource;
  delete canonical.inventoryApplied;
  delete canonical.confirmation;
  delete canonical.idempotentReplay;
  for (const item of Array.isArray(canonical.items) ? canonical.items : []) {
    if (item?.fiscalCatalogSnapshot && typeof item.fiscalCatalogSnapshot === 'object') {
      delete item.fiscalCatalogSnapshot.capturedAt;
    }
  }
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function createOrderRequestError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const ORDER_LOGS_ADMIN_VISIBLE_FILTER_SQL = `
  NOT EXISTS (
    SELECT 1 FROM table_tab_orders tto WHERE tto.order_id = ol.id
  )
  AND CASE
    WHEN json_valid(ol.payload)
      THEN COALESCE(json_extract(ol.payload, '$.cashierEligible'), 1)
    ELSE 1
  END <> 0
`;

function getOrderLogStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS totalCount,
      SUM(CASE WHEN ol.status = ? THEN 1 ELSE 0 END) AS pendingCount
    FROM order_logs ol
    WHERE ${ORDER_LOGS_ADMIN_VISIBLE_FILTER_SQL}
      AND ol.status IN (?, ?)
  `).get(ORDER_STATUS_PENDING, ORDER_STATUS_PENDING, ORDER_STATUS_ACCEPTED);
  return {
    totalCount: Math.max(0, Number(row?.totalCount || 0)),
    pendingCount: Math.max(0, Number(row?.pendingCount || 0)),
  };
}

function listOrderLogs(limit = 200) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || '200'), 10) || 200, 1000));
  const selectByStatus = db.prepare(`
    SELECT
      ol.id AS id,
      ol.order_code AS orderCode,
      ol.source,
      ol.status,
      ol.confirmation_code AS confirmationCode,
      ol.confirmed_at AS confirmedAt,
      ol.confirmed_by AS confirmedBy,
      ol.inventory_applied AS inventoryApplied,
      ol.payload,
      ol.created_at AS createdAt,
      fd.id AS fiscalDocumentId,
      fd.document_type AS fiscalDocumentType,
      fd.status AS fiscalDocumentStatus,
      fd.environment AS fiscalDocumentEnvironment,
      fd.access_key AS fiscalDocumentAccessKey,
      fd.protocol AS fiscalDocumentProtocol,
      fd.number AS fiscalDocumentNumber,
      fd.series AS fiscalDocumentSeries,
      fd.total AS fiscalDocumentTotal,
      fd.customer_name AS fiscalDocumentCustomerName,
      fd.error AS fiscalDocumentError,
      fd.created_at AS fiscalDocumentCreatedAt,
      fd.updated_at AS fiscalDocumentUpdatedAt
    FROM order_logs ol
    LEFT JOIN fiscal_documents fd ON fd.id = (
      SELECT latest_fd.id
      FROM fiscal_documents latest_fd
      WHERE latest_fd.order_id = ol.id
      ORDER BY latest_fd.id DESC
      LIMIT 1
    )
    WHERE ${ORDER_LOGS_ADMIN_VISIBLE_FILTER_SQL}
      AND ol.status = ?
    ORDER BY ol.id DESC
    LIMIT ?
  `);
  const pendingRows = selectByStatus.all(
    ORDER_STATUS_PENDING,
    PUBLIC_ORDER_PENDING_MAX_GLOBAL,
  );
  const acceptedRows = selectByStatus.all(ORDER_STATUS_ACCEPTED, safeLimit);

  return [...pendingRows, ...acceptedRows].map((row) => parseOrderLogRow(row));
}

function getOrderLogById(orderId) {
  const row = db.prepare(`
    SELECT
      id,
      order_code AS orderCode,
      source,
      status,
      confirmation_code AS confirmationCode,
      confirmed_at AS confirmedAt,
      confirmed_by AS confirmedBy,
      inventory_applied AS inventoryApplied,
      payload,
      created_at AS createdAt
    FROM order_logs
    WHERE id = ?
    LIMIT 1
  `).get(orderId);
  if (!row) return null;
  return parseOrderLogRow(row);
}

function shouldTrackOrderInventory(payload) {
  return payload?.inventoryTracked !== false
    && payload?.inventory?.tracked !== false
    && payload?.waiter?.inventoryTracked !== false;
}

function createOrderLogWithinTransaction(payload, {
  applyStock = true,
  source = 'internal',
  status = ORDER_STATUS_ACCEPTED,
  requestFingerprint = '',
  confirmationCode = '',
  confirmedAt = '',
  confirmedBy = '',
  clientKey = '',
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload inválido.');
  }

  let orderCode = String(payload.orderCode || '').trim();
  if (!orderCode) orderCode = `PED-${Date.now()}`;
  orderCode = orderCode.slice(0, 80);
  const safeSource = trimString(source, 40).replace(/[^a-z0-9_-]/gi, '') || 'internal';
  const requestedKey = trimString(payload.clientRequestId, 120);
  const idempotencyKey = requestedKey
    ? `${safeSource === ORDER_SOURCE_STOREFRONT ? 'storefront' : 'client'}:${requestedKey}`
    : `legacy-order:${orderCode}`;
  const safeStatus = status === ORDER_STATUS_PENDING ? ORDER_STATUS_PENDING : ORDER_STATUS_ACCEPTED;
  const safeRequestFingerprint = trimString(requestFingerprint, 64).toLowerCase();
  const safeConfirmationCode = trimString(confirmationCode, 40);
  const safeClientKey = trimString(clientKey, 64).toLowerCase();

  const selectExisting = db.prepare(`
    SELECT
      id,
      order_code AS orderCode,
      source,
      status,
      request_fingerprint AS requestFingerprint,
      confirmation_code AS confirmationCode,
      confirmed_at AS confirmedAt,
      confirmed_by AS confirmedBy,
      inventory_applied AS inventoryApplied,
      payload,
      created_at AS createdAt
    FROM order_logs
    WHERE idempotency_key = ?
    LIMIT 1
  `);
  let existing = selectExisting.get(idempotencyKey);
  if (!existing && safeSource === ORDER_SOURCE_STOREFRONT && requestedKey) {
    existing = selectExisting.get(`client:${requestedKey}`);
  }
  if (existing) {
    const existingSource = trimString(existing.source, 40) || 'legacy';
    if (safeSource !== ORDER_SOURCE_STOREFRONT && existingSource === ORDER_SOURCE_STOREFRONT) {
      throw createOrderRequestError(
        'Este identificador de envio pertence a outro fluxo de pedido.',
        409,
        'IDEMPOTENCY_SOURCE_MISMATCH',
      );
    }
    if (safeRequestFingerprint) {
      let storedFingerprint = trimString(existing.requestFingerprint, 64).toLowerCase();
      if (!storedFingerprint) {
        try {
          storedFingerprint = buildOrderRequestFingerprint(JSON.parse(existing.payload || '{}'));
        } catch {
          storedFingerprint = '';
        }
      }
      if (!storedFingerprint || !secureCompare(storedFingerprint, safeRequestFingerprint)) {
        throw createOrderRequestError(
          'Este identificador de envio ja foi usado com outro pedido.',
          409,
          'IDEMPOTENCY_PAYLOAD_MISMATCH',
        );
      }
    }
    return {
      ...parseOrderLogRow(existing),
      idempotentReplay: true,
    };
  }

  if (safeSource === ORDER_SOURCE_STOREFRONT && safeStatus === ORDER_STATUS_PENDING) {
    if (!/^[a-f0-9]{64}$/.test(safeClientKey)) {
      throw createOrderRequestError(
        'Nao foi possivel identificar a origem do pedido.',
        400,
        'ORDER_CLIENT_KEY_INVALID',
      );
    }
    const pendingCounts = db.prepare(`
      SELECT
        COUNT(*) AS globalCount,
        SUM(CASE WHEN client_key = ? THEN 1 ELSE 0 END) AS clientCount
      FROM order_logs
      WHERE source = ? AND status = ?
    `).get(safeClientKey, ORDER_SOURCE_STOREFRONT, ORDER_STATUS_PENDING);
    if (Number(pendingCounts?.clientCount || 0) >= PUBLIC_ORDER_PENDING_MAX_PER_CLIENT) {
      throw createOrderRequestError(
        'Existem pedidos demais aguardando confirmacao para esta conexao.',
        429,
        'PENDING_ORDER_CLIENT_LIMIT',
      );
    }
    if (Number(pendingCounts?.globalCount || 0) >= PUBLIC_ORDER_PENDING_MAX_GLOBAL) {
      throw createOrderRequestError(
        'A fila de confirmacao esta cheia. Tente novamente em instantes.',
        503,
        'PENDING_ORDER_GLOBAL_LIMIT',
      );
    }
  }

  const receiptUpload = bindOrderReceiptUploadWithinTransaction(payload);
  const serialized = JSON.stringify(payload);
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > MAX_ORDER_LOG_PAYLOAD_BYTES) {
    throw new Error(`Payload excede o limite permitido (${MAX_ORDER_LOG_PAYLOAD_BYTES} bytes).`);
  }

  const insertResult = db.prepare(`
    INSERT INTO order_logs (
      order_code,
      idempotency_key,
      source,
      status,
      request_fingerprint,
      confirmation_code,
      confirmed_at,
      confirmed_by,
      inventory_applied,
      client_key,
      payload,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    orderCode,
    idempotencyKey,
    safeSource,
    safeStatus,
    safeRequestFingerprint,
    safeConfirmationCode,
    trimString(confirmedAt, 80),
    trimString(confirmedBy, 120),
    0,
    safeClientKey,
    serialized,
  );

  const insertedId = Number(insertResult.lastInsertRowid);
  if (receiptUpload) {
    const claimResult = db.prepare(`
      UPDATE order_receipt_uploads
      SET order_id = ?, claimed_at = ?
      WHERE upload_id = ? AND order_id IS NULL
    `).run(insertedId, new Date().toISOString(), receiptUpload.uploadId);
    if (Number(claimResult.changes || 0) !== 1) {
      throw new Error('Comprovante Pix ja foi vinculado a outro pedido.');
    }
  }
  if (applyStock && shouldTrackOrderInventory(payload)) {
    const appliedMovements = applyOrderStockMovement(insertedId, payload, -1);
    if (appliedMovements > 0) {
      db.prepare('UPDATE order_logs SET inventory_applied = 1 WHERE id = ?').run(insertedId);
    }
  }
  return {
    ...getOrderLogById(insertedId),
    idempotentReplay: false,
  };
}

function createOrderLog(payload, options = {}) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const created = createOrderLogWithinTransaction(payload, options);
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return created;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // A transacao pode ja ter sido encerrada pelo SQLite.
    }
    throw error;
  }
}

function confirmPublicOrder(orderId, actorName = ADMIN_USER) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) {
    return { error: 'ID de pedido invalido.', statusCode: 400 };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const existingOrder = getOrderLogById(safeOrderId);
    if (!existingOrder) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido nao encontrado.', statusCode: 404 };
    }
    if (existingOrder.orderSource !== ORDER_SOURCE_STOREFRONT) {
      db.exec('ROLLBACK;');
      return {
        error: 'Este pedido nao pertence ao fluxo de confirmacao da loja virtual.',
        statusCode: 409,
        code: 'ORDER_NOT_CONFIRMABLE',
      };
    }
    if (isOrderAccepted(existingOrder)) {
      db.exec('ROLLBACK;');
      return {
        orderLog: existingOrder,
        printJob: describeOrderPrintJob(existingOrder),
        idempotentReplay: true,
      };
    }
    if (!isOrderPending(existingOrder)) {
      db.exec('ROLLBACK;');
      return {
        error: 'Pedido nao esta aguardando confirmacao.',
        statusCode: 409,
        code: 'ORDER_NOT_PENDING',
      };
    }

    const revalidated = sanitizeOrderLogPayload(existingOrder);
    if (revalidated.error) {
      db.exec('ROLLBACK;');
      return {
        error: `Pedido nao pode ser confirmado: ${revalidated.error}`,
        statusCode: 409,
        code: 'ORDER_REVALIDATION_FAILED',
      };
    }

    const confirmedAt = new Date().toISOString();
    const confirmedBy = trimString(actorName, 120) || ADMIN_USER;
    const confirmedPayload = {
      ...revalidated.payload,
      inventoryTracked: true,
    };
    const serialized = JSON.stringify(confirmedPayload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_ORDER_LOG_PAYLOAD_BYTES) {
      throw createOrderRequestError(
        `Payload excede o limite permitido (${MAX_ORDER_LOG_PAYLOAD_BYTES} bytes).`,
        400,
        'ORDER_PAYLOAD_TOO_LARGE',
      );
    }

    const updateResult = db.prepare(`
      UPDATE order_logs
      SET status = ?,
          confirmed_at = ?,
          confirmed_by = ?,
          inventory_applied = 0,
          payload = ?
      WHERE id = ? AND status = ?
    `).run(
      ORDER_STATUS_ACCEPTED,
      confirmedAt,
      confirmedBy,
      serialized,
      safeOrderId,
      ORDER_STATUS_PENDING,
    );
    if (Number(updateResult.changes || 0) !== 1) {
      throw createOrderRequestError(
        'Pedido foi alterado durante a confirmacao. Atualize e tente novamente.',
        409,
        'ORDER_CONFIRMATION_CONFLICT',
      );
    }

    let acceptedOrder = getOrderLogById(safeOrderId);
    if (shouldTrackOrderInventory(acceptedOrder)) {
      const appliedMovements = applyOrderStockMovement(safeOrderId, acceptedOrder, -1);
      if (appliedMovements > 0) {
        db.prepare('UPDATE order_logs SET inventory_applied = 1 WHERE id = ?').run(safeOrderId);
        acceptedOrder = getOrderLogById(safeOrderId);
      }
    }

    let queued = false;
    if (PRINT_AGENT_ACTIVE) {
      queued = enqueuePrintJobFromOrder(acceptedOrder);
      if (!queued) {
        throw new Error('Nao foi possivel criar a comanda inicial do pedido confirmado.');
      }
    }

    const orderLog = getOrderLogById(safeOrderId);
    const printJob = describeOrderPrintJob(orderLog, { queued });
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return {
      orderLog,
      printJob,
      idempotentReplay: false,
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    if (error?.statusCode) {
      return {
        error: String(error.message || 'Falha ao confirmar pedido.'),
        statusCode: Number(error.statusCode),
        code: String(error.code || 'ORDER_CONFIRMATION_FAILED'),
      };
    }
    throw error;
  }
}

function deleteOrderLog(orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return { deleted: false };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const existingOrder = getOrderLogById(safeOrderId);
    if (!existingOrder) {
      db.exec('ROLLBACK;');
      return { deleted: false };
    }

    const references = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM cash_movements WHERE order_id = ?) AS cashMovementCount,
        (SELECT COUNT(*) FROM fiscal_documents WHERE order_id = ?) AS fiscalDocumentCount,
        (SELECT COUNT(*) FROM table_tabs WHERE cashier_order_id = ?) AS tableTabCount,
        (SELECT COUNT(*) FROM table_tab_orders WHERE order_id = ?) AS tableTabOrderCount
    `).get(safeOrderId, safeOrderId, safeOrderId, safeOrderId);
    const guard = getOrderDeletionGuard(references);
    if (guard.blocked) {
      db.exec('ROLLBACK;');
      return {
        deleted: false,
        statusCode: 409,
        ...guard,
      };
    }

    const receiptFiles = db.prepare(`
      SELECT file_name AS fileName
      FROM order_receipt_uploads
      WHERE order_id = ?
    `).all(safeOrderId);
    if (isOrderAccepted(existingOrder)) {
      applyOrderStockMovement(safeOrderId, existingOrder, 1, { restoreAll: true });
    }
    const result = db.prepare('DELETE FROM order_logs WHERE id = ?').run(safeOrderId);
    if (Number(result.changes) > 0) {
      db.prepare('DELETE FROM print_jobs WHERE order_id = ?').run(safeOrderId);
      db.prepare('DELETE FROM table_tab_orders WHERE order_id = ?').run(safeOrderId);
      db.prepare('DELETE FROM order_receipt_uploads WHERE order_id = ?').run(safeOrderId);
    }
    db.exec('COMMIT;');
    for (const receipt of receiptFiles) {
      const filePath = safeResolve(ORDER_RECEIPTS_DIR, receipt.fileName);
      if (!filePath) continue;
      try {
        unlinkSync(filePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.error(`Falha ao remover comprovante do pedido ${safeOrderId}.`, error);
        }
      }
    }
    return { deleted: Number(result.changes) > 0 };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function waiterStoreName() {
  const config = readState()?.config || {};
  return trimString(
    config.tradeName || config.storeName || config.name || config.nomeFantasia,
    120,
  ) || 'Morada da Pizza';
}

function waiterCurrentTime() {
  try {
    return new Date().toLocaleTimeString('pt-BR', {
      timeZone: RECEIPT_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

function aggregateWaiterTabItems(batches = []) {
  const grouped = new Map();
  for (const batch of batches) {
    for (const item of Array.isArray(batch?.items) ? batch.items : []) {
      const key = JSON.stringify([
        item?.productId || item?.id || '',
        item?.name || '',
        item?.unitPrice ?? item?.price ?? 0,
        item?.size || item?.sizeKey || '',
        item?.borderLabel || item?.borderSelection?.label || '',
      ]);
      const quantity = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
      const unitPrice = normalizeMoneyValue(item?.unitPrice ?? item?.price, 0);
      const current = grouped.get(key);
      if (current) {
        current.quantity += quantity;
        current.subtotal = normalizeMoneyValue(current.subtotal + (unitPrice * quantity), 0);
      } else {
        grouped.set(key, {
          ...item,
          quantity,
          unitPrice,
          subtotal: normalizeMoneyValue(unitPrice * quantity, 0),
        });
      }
    }
  }
  return [...grouped.values()];
}

function getWaiterLineItemId(item, orderId, itemIndex) {
  const saved = trimString(item?.lineItemId, 120);
  return saved || `legacy-${Number(orderId) || 0}-${Number(itemIndex) || 0}`;
}

function mapWaiterPrintStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pending') return 'queued';
  if (normalized === 'processing') return 'printing';
  if (normalized === 'done') return 'printed';
  if (normalized === 'failed') return 'failed';
  return 'not_requested';
}

function toWaiterPrintJob(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    operationKind: String(row.operationKind || ''),
    sourceType: String(row.sourceType || ''),
    sourceId: row.sourceId == null ? null : Number(row.sourceId),
    status: mapWaiterPrintStatus(row.status),
    rawStatus: String(row.status || ''),
    attempts: Number(row.attempts || 0),
    lastError: String(row.lastError || ''),
    claimedBy: String(row.claimedBy || ''),
    claimedAt: String(row.claimedAt || ''),
    completedAt: String(row.completedAt || ''),
    createdAt: String(row.createdAt || ''),
  };
}

function listWaiterPrintJobs({ orderId = null, tabId = null, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 20), 10) || 20, 100));
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  const safeTabId = Number.parseInt(String(tabId || ''), 10);
  let rows = [];
  if (Number.isInteger(safeOrderId) && safeOrderId > 0) {
    rows = db.prepare(`
      SELECT
        id,
        source_type AS sourceType,
        source_id AS sourceId,
        job_key AS jobKey,
        status,
        attempts,
        last_error AS lastError,
        claimed_by AS claimedBy,
        claimed_at AS claimedAt,
        completed_at AS completedAt,
        created_at AS createdAt,
        CASE
          WHEN json_valid(payload) THEN COALESCE(json_extract(payload, '$.operationKind'), '')
          ELSE ''
        END AS operationKind
      FROM print_jobs
      WHERE order_id = ? OR (source_id = ? AND source_type IN ('order', 'waiter_order_reprint'))
      ORDER BY id DESC
      LIMIT ?
    `).all(safeOrderId, safeOrderId, safeLimit);
  } else if (Number.isInteger(safeTabId) && safeTabId > 0) {
    rows = db.prepare(`
      SELECT
        id,
        source_type AS sourceType,
        source_id AS sourceId,
        job_key AS jobKey,
        status,
        attempts,
        last_error AS lastError,
        claimed_by AS claimedBy,
        claimed_at AS claimedAt,
        completed_at AS completedAt,
        created_at AS createdAt,
        CASE
          WHEN json_valid(payload) THEN COALESCE(json_extract(payload, '$.operationKind'), '')
          ELSE ''
        END AS operationKind
      FROM print_jobs
      WHERE source_id = ? AND source_type LIKE 'table_tab%'
      ORDER BY id DESC
      LIMIT ?
    `).all(safeTabId, safeLimit);
  }
  return rows.map(toWaiterPrintJob);
}

function listTableTabMembers(rawTabId, { activeOnly = false } = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  if (!Number.isInteger(tabId) || tabId <= 0) return [];
  const rows = db.prepare(`
    SELECT
      ttm.table_id AS tableId,
      dt.table_number AS tableNumber,
      dt.label,
      ttm.is_primary AS isPrimary,
      ttm.active,
      ttm.linked_at AS linkedAt,
      ttm.unlinked_at AS unlinkedAt
    FROM table_tab_members ttm
    JOIN dining_tables dt ON dt.id = ttm.table_id
    WHERE ttm.tab_id = ?
      ${activeOnly ? 'AND ttm.active = 1' : ''}
    ORDER BY ttm.is_primary DESC, dt.table_number ASC
  `).all(tabId);
  return rows.map((member) => ({
    tableId: Number(member.tableId),
    tableNumber: Number(member.tableNumber),
    label: String(member.label || ''),
    isPrimary: Boolean(member.isPrimary),
    active: Boolean(member.active),
    linkedAt: String(member.linkedAt || ''),
    unlinkedAt: String(member.unlinkedAt || ''),
  }));
}

function tableTabDisplayName(tab) {
  const numbers = (Array.isArray(tab?.tableNumbers) ? tab.tableNumbers : [tab?.tableNumber])
    .map((value) => Number.parseInt(String(value || ''), 10))
    .filter((value, index, list) => Number.isInteger(value) && value > 0 && list.indexOf(value) === index)
    .sort((a, b) => a - b);
  if (numbers.length > 1) return `Mesas ${numbers.join(' + ')}`;
  return `Mesa ${numbers[0] || Number(tab?.tableNumber) || '--'}`;
}

function findActiveTableTabId(rawTableId, { excludingTabId = null } = {}) {
  const tableId = Number.parseInt(String(rawTableId || ''), 10);
  const excluded = Number.parseInt(String(excludingTabId || ''), 10);
  if (!Number.isInteger(tableId) || tableId <= 0) return null;
  const member = db.prepare(`
    SELECT tt.id
    FROM table_tab_members ttm
    JOIN table_tabs tt ON tt.id = ttm.tab_id
    WHERE ttm.table_id = ? AND ttm.active = 1
      AND tt.status IN ('open', 'awaiting_payment')
      AND (? IS NULL OR tt.id <> ?)
    LIMIT 1
  `).get(tableId, Number.isInteger(excluded) ? excluded : null, Number.isInteger(excluded) ? excluded : null);
  if (member) return Number(member.id);
  const legacy = db.prepare(`
    SELECT id FROM table_tabs
    WHERE table_id = ? AND status IN ('open', 'awaiting_payment')
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(tableId, Number.isInteger(excluded) ? excluded : null, Number.isInteger(excluded) ? excluded : null);
  return legacy ? Number(legacy.id) : null;
}

function getTableTabById(rawTabId) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  if (!Number.isFinite(tabId) || tabId <= 0) return null;
  const row = db.prepare(`
    SELECT
      tt.id,
      tt.table_id AS tableId,
      dt.table_number AS tableNumber,
      dt.label AS tableLabel,
      tt.status,
      tt.customer_name AS customerName,
      tt.waiter_name AS waiterName,
      tt.waiter_user_id AS waiterUserId,
      tt.waiter_username AS waiterUsername,
      tt.notes,
      tt.version,
      tt.cashier_order_id AS cashierOrderId,
      tt.opened_at AS openedAt,
      tt.bill_requested_at AS billRequestedAt,
      tt.paid_at AS paidAt,
      tt.closed_at AS closedAt,
      tt.updated_at AS updatedAt
    FROM table_tabs tt
    JOIN dining_tables dt ON dt.id = tt.table_id
    WHERE tt.id = ?
    LIMIT 1
  `).get(tabId);
  if (!row) return null;

  const orderRows = db.prepare(`
    SELECT
      tto.batch_number AS batchNumber,
      tto.print_requested AS printRequested,
      tto.created_at AS linkedAt,
      ol.id,
      ol.order_code AS orderCode,
      ol.payload,
      ol.created_at AS createdAt
    FROM table_tab_orders tto
    JOIN order_logs ol ON ol.id = tto.order_id
    WHERE tto.tab_id = ?
    ORDER BY tto.batch_number ASC
  `).all(tabId);
  const batches = orderRows.map((orderRow) => {
    const parsed = parseOrderLogRow(orderRow);
    const itemsWithIds = (Array.isArray(parsed.items) ? parsed.items : []).map((item, itemIndex) => ({
      ...item,
      lineItemId: getWaiterLineItemId(item, parsed.id, itemIndex),
    }));
    const printJobs = listWaiterPrintJobs({ orderId: parsed.id, limit: 12 });
    return {
      ...parsed,
      items: itemsWithIds,
      batchNumber: Number(orderRow.batchNumber || 0),
      printRequested: Boolean(orderRow.printRequested),
      linkedAt: orderRow.linkedAt || '',
      print: {
        latest: printJobs[0] || null,
        initial: printJobs.find((job) => job.operationKind === 'waiter_order_initial') || null,
        reprints: printJobs.filter((job) => job.operationKind === 'waiter_order_reprint'),
      },
    };
  });
  const items = aggregateWaiterTabItems(batches);
  const total = normalizeMoneyValue(
    batches.reduce((sum, batch) => sum + normalizeMoneyValue(batch?.totals?.total, 0), 0),
    0,
  );
  const itemCount = items.reduce(
    (sum, item) => sum + Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1),
    0,
  );
  const cashierOrderId = Number.parseInt(String(row.cashierOrderId || ''), 10);
  const cashierOrder = Number.isFinite(cashierOrderId) && cashierOrderId > 0
    ? getOrderLogById(cashierOrderId)
    : null;
  const storedMembers = listTableTabMembers(tabId);
  const fallbackMember = {
    tableId: Number(row.tableId),
    tableNumber: Number(row.tableNumber),
    label: String(row.tableLabel || ''),
    isPrimary: true,
    active: ['open', 'awaiting_payment'].includes(String(row.status || '')),
    linkedAt: String(row.openedAt || ''),
    unlinkedAt: '',
  };
  const isActiveTab = ['open', 'awaiting_payment'].includes(String(row.status || ''));
  const linkedTables = isActiveTab
    ? storedMembers.filter((member) => member.active)
    : row.paidAt
      ? storedMembers.filter((member) => String(member.unlinkedAt || '') === String(row.paidAt))
      : storedMembers.filter((member) => member.isPrimary);
  if (!linkedTables.length) linkedTables.push(fallbackMember);
  const tableNumbers = linkedTables
    .map((member) => member.tableNumber)
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((a, b) => a - b);
  return {
    ...row,
    id: Number(row.id),
    tableId: Number(row.tableId),
    tableNumber: Number(row.tableNumber),
    waiterUserId: row.waiterUserId == null ? null : Number(row.waiterUserId),
    version: Math.max(1, Number(row.version || 1)),
    cashierOrderId: cashierOrder?.id || null,
    cashier: cashierOrder?.cashier || null,
    batches,
    items,
    totals: { subtotal: total, delivery: 0, total },
    itemCount,
    batchCount: batches.length,
    linkedTables,
    tableIds: linkedTables.map((member) => member.tableId),
    tableNumbers,
    tableDisplay: tableTabDisplayName({ tableNumber: row.tableNumber, tableNumbers }),
    accountPrints: listWaiterPrintJobs({ tabId, limit: 20 }),
  };
}

function canWaiterManageTab(actor, tab) {
  if (!actor || !tab) return false;
  if (actor.role === 'manager' || actor.role === 'admin') return true;
  return actor.role === 'waiter'
    && actor.userId != null
    && Number(tab.waiterUserId) === Number(actor.userId);
}

function redactWaiterTabForActor(tab, actor) {
  if (!tab || canWaiterManageTab(actor, tab)) return tab;
  return {
    id: tab.id,
    tableId: tab.tableId,
    tableNumber: tab.tableNumber,
    tableLabel: tab.tableLabel,
    status: tab.status,
    waiterUserId: tab.waiterUserId,
    waiterUsername: tab.waiterUsername,
    waiterName: tab.waiterName,
    openedAt: tab.openedAt,
    billRequestedAt: tab.billRequestedAt,
    updatedAt: tab.updatedAt,
    version: tab.version,
    restricted: true,
  };
}

function listWaiterTables(actor = null) {
  const rows = db.prepare(`
    SELECT id, table_number AS tableNumber, label, active, created_at AS createdAt,
      updated_at AS updatedAt
    FROM dining_tables
    WHERE active = 1
    ORDER BY table_number ASC
  `).all();
  const openTabs = db.prepare(`
    SELECT tt.id, ttm.table_id AS tableId
    FROM table_tabs tt
    JOIN table_tab_members ttm ON ttm.tab_id = tt.id AND ttm.active = 1
    WHERE tt.status IN ('open', 'awaiting_payment')
    UNION ALL
    SELECT tt.id, tt.table_id AS tableId
    FROM table_tabs tt
    WHERE tt.status IN ('open', 'awaiting_payment')
      AND NOT EXISTS (
        SELECT 1 FROM table_tab_members ttm
        WHERE ttm.tab_id = tt.id AND ttm.active = 1
      )
    ORDER BY id DESC
  `).all();
  const openByTable = new Map(openTabs.map((tab) => {
    const fullTab = getTableTabById(tab.id);
    return [Number(tab.tableId), redactWaiterTabForActor(fullTab, actor)];
  }));
  return rows.map((row) => ({
    id: Number(row.id),
    tableNumber: Number(row.tableNumber),
    label: String(row.label || ''),
    active: Boolean(row.active),
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    activeTab: openByTable.get(Number(row.id)) || null,
    openTab: openByTable.get(Number(row.id)) || null,
  }));
}

function listRecentClosedTableTabs(limit = 30, actor = null) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 30), 10) || 30, 100));
  const canViewAll = ['manager', 'admin'].includes(actor?.role) ? 1 : 0;
  const actorUserId = Number.isInteger(Number(actor?.userId)) ? Number(actor.userId) : -1;
  const rows = db.prepare(`
    SELECT id
    FROM table_tabs
    WHERE status = 'closed'
      AND (? = 1 OR waiter_user_id = ?)
    ORDER BY id DESC
    LIMIT ?
  `).all(canViewAll, actorUserId, safeLimit);
  return rows
    .map((row) => getTableTabById(row.id))
    .filter((tab) => tab && (
      actor?.role === 'manager'
      || actor?.role === 'admin'
      || (actor?.userId != null && Number(tab.waiterUserId) === Number(actor.userId))
    ));
}

function getWaiterDashboard(actor) {
  return {
    ok: true,
    actor: {
      id: actor?.userId || null,
      username: actor?.username || '',
      displayName: actor?.displayName || '',
      role: actor?.role || '',
    },
    tables: listWaiterTables(actor),
    recentClosedTabs: listRecentClosedTableTabs(30, actor),
    staff: ['manager', 'admin'].includes(actor?.role) ? listWaiterUsers({ activeOnly: true }) : [],
    printAgent: {
      enabled: PRINT_AGENT_ACTIVE,
      stats: PRINT_AGENT_ACTIVE ? getPrintJobsStats() : null,
      agent: PRINT_AGENT_ACTIVE ? getLatestPrintAgentHeartbeat() : null,
    },
  };
}

function createDiningTable(rawPayload = {}) {
  const tableNumber = Number.parseInt(String(rawPayload?.tableNumber || ''), 10);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999) {
    return { error: 'Número da mesa deve ficar entre 1 e 999.', statusCode: 400 };
  }
  const label = trimString(rawPayload?.label, 80);
  try {
    const result = db.prepare(`
      INSERT INTO dining_tables (table_number, label, active, created_at, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(tableNumber, label);
    return listWaiterTables().find((table) => table.id === Number(result.lastInsertRowid));
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return { error: 'Esta mesa já está cadastrada.', statusCode: 409 };
    }
    throw error;
  }
}

function openTableTab(rawTableId, rawPayload = {}, actor = null, context = {}) {
  const tableId = Number.parseInt(String(rawTableId || ''), 10);
  const table = db.prepare(`
    SELECT id, table_number AS tableNumber, active
    FROM dining_tables
    WHERE id = ?
    LIMIT 1
  `).get(tableId);
  if (!table || !Boolean(table.active)) return { error: 'Mesa não encontrada.', statusCode: 404 };
  if (!actor) return { error: 'Nao autenticado.', statusCode: 401 };
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  if (!requestId) return { error: 'Identificador da abertura invalido. Atualize e tente novamente.', statusCode: 400 };
  let assignedUser = null;
  const requestedUserId = Number.parseInt(String(rawPayload?.waiterUserId || ''), 10);
  if (Number.isInteger(requestedUserId) && requestedUserId > 0 && ['manager', 'admin'].includes(actor.role)) {
    assignedUser = getWaiterUserById(requestedUserId);
    if (!assignedUser?.active) return { error: 'Garcom selecionado indisponivel.', statusCode: 400 };
  } else if (actor.userId != null) {
    assignedUser = getWaiterUserById(actor.userId);
  }
  const waiterUserId = assignedUser?.id || actor.userId || null;
  const waiterUsername = assignedUser?.username || actor.username || '';
  const waiterName = assignedUser?.displayName || actor.displayName || actor.username || 'Equipe';
  const requestFingerprint = buildWaiterTableOpenFingerprint({
    tableId,
    waiterUserId,
    customerName: rawPayload?.customerName,
    notes: rawPayload?.notes,
  });

  db.exec('BEGIN IMMEDIATE;');
  try {
    const replay = getWaiterMutationRequest(actor, 'table_open', requestId);
    if (replay) {
      if (Number(replay.result?.tableId) !== tableId
        || Number(replay.tabId) <= 0
        || replay.result?.requestFingerprint !== requestFingerprint) {
        db.exec('ROLLBACK;');
        return {
          error: 'Este identificador de abertura ja foi usado com outros dados.',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          statusCode: 409,
        };
      }
      const replayTab = getTableTabById(replay.tabId);
      if (!replayTab) {
        db.exec('ROLLBACK;');
        return { error: 'A comanda desta abertura nao esta mais disponivel.', statusCode: 409 };
      }
      const replayAccess = requireWaiterTabAccess(actor, replayTab);
      if (replayAccess.error) {
        db.exec('ROLLBACK;');
        return replayAccess;
      }
      db.exec('COMMIT;');
      return { tab: replayTab, idempotentReplay: true };
    }
    const existingTabId = findActiveTableTabId(tableId);
    if (existingTabId) {
      db.exec('ROLLBACK;');
      return {
        error: 'Esta mesa ja possui uma comanda ativa.',
        statusCode: 409,
        tab: redactWaiterTabForActor(getTableTabById(existingTabId), actor),
      };
    }
    const result = db.prepare(`
      INSERT INTO table_tabs (
        table_id, status, customer_name, waiter_name, waiter_user_id,
        waiter_username, opened_by_user_id, notes, version, opened_at, updated_at
      )
      VALUES (?, 'open', ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tableId,
      trimString(rawPayload?.customerName, 120),
      waiterName,
      waiterUserId,
      waiterUsername,
      actor.userId || null,
      trimString(rawPayload?.notes, 900),
    );
    const tabId = Number(result.lastInsertRowid);
    db.prepare(`
      INSERT INTO table_tab_members (
        tab_id, table_id, is_primary, active, linked_by_user_id, linked_at, unlinked_at
      )
      VALUES (?, ?, 1, 1, ?, CURRENT_TIMESTAMP, NULL)
    `).run(tabId, tableId, actor.userId || null);
    storeWaiterMutationRequest(actor, 'table_open', requestId, tabId, { tableId, requestFingerprint });
    recordWaiterAuditEvent(actor, 'table_opened', {
      tabId,
      tableId,
      requestId,
      context,
      details: { assignedUserId: waiterUserId, customerName: trimString(rawPayload?.customerName, 120) },
    });
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return { tab: getTableTabById(tabId) };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      const existingTabId = findActiveTableTabId(tableId);
      return {
        error: 'Esta mesa ja possui uma comanda ativa.',
        statusCode: 409,
        tab: existingTabId
          ? redactWaiterTabForActor(getTableTabById(existingTabId), actor)
          : null,
      };
    }
    throw error;
  }
}

function normalizeWaiterRequestId(value) {
  const requestId = trimString(value, 120);
  if (!requestId || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return '';
  return requestId;
}

function buildWaiterTableOpenFingerprint({ tableId, waiterUserId, customerName, notes } = {}) {
  return createHash('sha256')
    .update(JSON.stringify({
      tableId: Number(tableId) || null,
      waiterUserId: Number(waiterUserId) || null,
      customerName: trimString(customerName, 120),
      notes: trimString(notes, 900),
    }), 'utf8')
    .digest('hex');
}

function buildWaiterOrderRequestFingerprint(items, note, printRequested) {
  const deterministicItems = (Array.isArray(items) ? items : []).map((item) => {
    const snapshot = item?.fiscalCatalogSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return item;
    const { capturedAt: _capturedAt, ...stableSnapshot } = snapshot;
    return { ...item, fiscalCatalogSnapshot: stableSnapshot };
  });
  return createHash('sha256')
    .update(JSON.stringify({ items: deterministicItems, note, printRequested }), 'utf8')
    .digest('hex');
}

function getWaiterMutationRequest(actor, action, requestId) {
  const safeRequestId = normalizeWaiterRequestId(requestId);
  if (!safeRequestId) return null;
  const actorKey = waiterActorKey(actor);
  const requestKey = `${actorKey}:${action}:${safeRequestId}`;
  const row = db.prepare(`
    SELECT request_key AS requestKey, action, actor_key AS actorKey,
      tab_id AS tabId, result_json AS resultJson, created_at AS createdAt
    FROM waiter_mutation_requests
    WHERE request_key = ?
    LIMIT 1
  `).get(requestKey);
  if (!row) return null;
  let result = {};
  try { result = JSON.parse(row.resultJson || '{}'); } catch { result = {}; }
  return { ...row, result };
}

function storeWaiterMutationRequest(actor, action, requestId, tabId, result = {}) {
  const safeRequestId = normalizeWaiterRequestId(requestId);
  if (!safeRequestId) throw new Error('Identificador da operacao invalido.');
  const actorKey = waiterActorKey(actor);
  const requestKey = `${actorKey}:${action}:${safeRequestId}`;
  db.prepare(`
    INSERT INTO waiter_mutation_requests (
      request_key, action, actor_key, tab_id, result_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(requestKey, action, actorKey, Number(tabId) || null, JSON.stringify(result || {}));
  return requestKey;
}

function validateWaiterTabVersion(tab, rawExpectedVersion) {
  const expectedVersion = Number.parseInt(String(rawExpectedVersion || ''), 10);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return { error: 'Atualize a comanda antes de continuar.', code: 'TAB_VERSION_REQUIRED', statusCode: 400, tab };
  }
  if (expectedVersion !== Number(tab?.version || 1)) {
    return {
      error: 'A comanda foi atualizada em outro aparelho. Revise os dados e tente novamente.',
      code: 'TAB_VERSION_CONFLICT',
      statusCode: 409,
      expectedVersion,
      currentVersion: Number(tab?.version || 1),
      tab,
    };
  }
  return { expectedVersion };
}

function requireWaiterTabAccess(actor, tab, { managerOnly = false } = {}) {
  if (!tab) return { error: 'Comanda nao encontrada.', statusCode: 404 };
  if (managerOnly && !['manager', 'admin'].includes(actor?.role)) {
    return { error: 'Esta acao exige um gerente.', statusCode: 403 };
  }
  if (!canWaiterManageTab(actor, tab)) {
    return { error: 'Esta mesa esta atribuida a outro garcom. Solicite a transferencia ao gerente.', statusCode: 403 };
  }
  return { ok: true };
}

function addOrderToTableTab(rawTabId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  if (!Number.isInteger(tabId) || tabId <= 0) return { error: 'Comanda invalida.', statusCode: 400 };
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  if (!requestId) return { error: 'Identificador do envio invalido. Atualize a pagina e tente novamente.', statusCode: 400 };
  const rawItems = Array.isArray(rawPayload?.items) ? rawPayload.items : [];
  if (rawItems.length === 0) return { error: 'Adicione pelo menos um item ao pedido.', statusCode: 400 };
  if (rawItems.length > 120) return { error: 'Quantidade de itens acima do limite permitido.', statusCode: 400 };

  const state = readState();
  const items = [];
  for (let itemIndex = 0; itemIndex < rawItems.length; itemIndex += 1) {
    const rawItem = rawItems[itemIndex];
    const sanitized = sanitizeOrderItem(rawItem, state);
    if (sanitized.error) return { error: sanitized.error, statusCode: 400 };
    const requestedLineId = trimString(rawItem?.lineItemId, 120);
    const fallbackLineId = `line-${createHash('sha256').update(`${requestId}\0${itemIndex}`, 'utf8').digest('hex').slice(0, 32)}`;
    items.push({
      ...sanitized.item,
      lineItemId: /^[A-Za-z0-9._:-]{8,120}$/.test(requestedLineId) ? requestedLineId : fallbackLineId,
    });
  }
  const subtotal = normalizeMoneyValue(
    items.reduce((sum, item) => sum + normalizeMoneyValue(item.subtotal, 0), 0),
    0,
  );
  const printRequested = rawPayload?.printRequested !== false;
  const note = trimString(rawPayload?.note, 600);
  const requestFingerprint = buildWaiterOrderRequestFingerprint(items, note, printRequested);
  let created = null;
  let currentTab = null;
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    currentTab = getTableTabById(tabId);
    const access = requireWaiterTabAccess(actor, currentTab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const existingRow = db.prepare(`
      SELECT id, order_code AS orderCode, payload, created_at AS createdAt
      FROM order_logs
      WHERE idempotency_key = ?
      LIMIT 1
    `).get(`client:${requestId}`);
    if (existingRow) {
      created = parseOrderLogRow(existingRow);
      const existingLink = db.prepare(`
        SELECT tab_id AS tabId FROM table_tab_orders WHERE order_id = ? LIMIT 1
      `).get(created.id);
      if (Number(existingLink?.tabId) !== tabId || created?.waiter?.requestFingerprint !== requestFingerprint) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador de envio ja foi usado com outro pedido.', code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', statusCode: 409 };
      }
      idempotentReplay = true;
      db.exec('COMMIT;');
    } else {
      if (currentTab.status !== 'open') {
        db.exec('ROLLBACK;');
        return { error: 'Esta comanda nao aceita novos itens.', code: 'TAB_NOT_OPEN', statusCode: 409, tab: currentTab };
      }
      const versionCheck = validateWaiterTabVersion(currentTab, rawPayload?.expectedVersion);
      if (versionCheck.error) {
        db.exec('ROLLBACK;');
        return versionCheck;
      }
      const nextBatch = Number(db.prepare(`
        SELECT COALESCE(MAX(batch_number), 0) + 1 AS nextBatch
        FROM table_tab_orders
        WHERE tab_id = ?
      `).get(currentTab.id)?.nextBatch || 1);
      const payload = {
        orderCode: `M${currentTab.tableNumber}-C${currentTab.id}-P${nextBatch}`,
        clientRequestId: requestId,
        createdAt: new Date().toISOString(),
        storeName: waiterStoreName(),
        customerName: currentTab.customerName || currentTab.tableDisplay,
        customerNote: trimString([
          currentTab.tableDisplay,
          currentTab.waiterName ? `Garçom: ${currentTab.waiterName}` : '',
          note,
        ].filter(Boolean).join(' • '), 900),
        orderType: 'consumo_local',
        deliveryAddress: '',
        localConsumptionTime: waiterCurrentTime(),
        location: null,
        payment: {
          method: 'dinheiro',
          label: 'Pagamento no fechamento',
          needsChange: false,
          cashGiven: null,
          change: null,
          pixKey: '',
          pixReceiptUrl: '',
          pixReceiptFileName: '',
        },
        totals: { subtotal, delivery: 0, total: subtotal },
        items,
        whatsappMessage: '',
        cashierEligible: false,
        inventoryTracked: true,
        waiter: {
          tabId: currentTab.id,
          tableId: currentTab.tableId,
          tableNumber: currentTab.tableNumber,
          tableIds: currentTab.tableIds,
          tableNumbers: currentTab.tableNumbers,
          tableDisplay: currentTab.tableDisplay,
          waiterName: currentTab.waiterName,
          actorUserId: actor?.userId || null,
          actorName: actor?.displayName || '',
          batchNumber: nextBatch,
          batchStatus: 'active',
          cashierEligible: false,
          inventoryTracked: true,
          requestFingerprint,
          note,
          adjustments: [],
        },
      };
      created = createOrderLogWithinTransaction(payload);
      db.prepare(`
        INSERT INTO table_tab_orders (
          tab_id, order_id, batch_number, print_requested, created_by_user_id,
          client_request_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(currentTab.id, created.id, nextBatch, printRequested ? 1 : 0, actor?.userId || null, requestId);
      const versionUpdate = db.prepare(`
        UPDATE table_tabs
        SET version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'open' AND version = ?
      `).run(currentTab.id, versionCheck.expectedVersion);
      if (Number(versionUpdate.changes) !== 1) throw new Error('Conflito ao atualizar a comanda.');
      recordWaiterAuditEvent(actor, 'order_added', {
        tabId: currentTab.id,
        tableId: currentTab.tableId,
        orderId: created.id,
        requestId,
        context,
        details: { itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), subtotal, printRequested },
      });
      db.exec('COMMIT;');
    }
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* A transacao pode ja ter sido concluida. */ }
    throw error;
  }

  const printJob = printRequested ? buildPrintJobResultFromOrder(created) : {
    enabled: PRINT_AGENT_ACTIVE,
    queued: false,
    error: '',
  };
  checkpointWal('PASSIVE');
  return {
    order: { ...created, idempotentReplay },
    printJob,
    tab: getTableTabById(tabId),
    idempotentReplay,
  };
}

function buildTableTabAccountOrder(tab, { final = false, reprint = false, reason = '', actor = null } = {}) {
  const baseTitle = final ? 'CONTA FINAL - PAGAR NO CAIXA' : 'PRE-CONTA - MESA ABERTA';
  return {
    documentTitle: reprint ? `2A VIA - ${baseTitle}` : baseTitle,
    orderCode: `MESA-${tab.tableNumber}-C${tab.id}`,
    createdAt: new Date().toISOString(),
    storeName: waiterStoreName(),
    customerName: tab.customerName
      ? `${tab.tableDisplay} - ${tab.customerName}`
      : tab.tableDisplay,
    customerNote: trimString([
      tab.waiterName ? `Garçom: ${tab.waiterName}` : '',
      tab.notes ? `Mesa: ${tab.notes}` : '',
      `Aberta em ${formatOrderCreatedAtForPrint(tab.openedAt)}`,
      `${tab.batchCount} pedido(s) enviado(s)`,
      reprint ? `Reimpressao por ${actor?.displayName || actor?.username || 'equipe'}` : '',
      reprint && reason ? `Motivo da reimpressao: ${reason}` : '',
    ].filter(Boolean).join(' • '), 900),
    orderType: 'consumo_local',
    localConsumptionTime: waiterCurrentTime(),
    payment: { method: 'dinheiro', label: final ? 'Receber no caixa' : 'Conta ainda aberta', needsChange: false },
    totals: tab.totals,
    items: tab.items,
  };
}

function queueTableTabSummaryPrint(tab, {
  final = false,
  reprint = false,
  reason = '',
  actor = null,
  requestId = '',
} = {}) {
  const printable = buildTableTabAccountOrder(tab, { final, reprint, reason, actor });
  const previewText = buildOrderPrintText(printable);
  const result = {
    enabled: PRINT_AGENT_ACTIVE,
    queued: false,
    error: '',
    previewText,
  };
  if (!PRINT_AGENT_ACTIVE) {
    result.error = 'Agente de impressão não está ativo; use a prévia para imprimir pelo navegador.';
    return result;
  }
  try {
    const safeRequestId = normalizeWaiterRequestId(requestId) || randomUUID();
    const jobKey = final
      ? reprint
        ? `table-tab:${tab.id}:final:reprint:${safeRequestId}`
        : `table-tab:${tab.id}:final:${safeRequestId}`
      : `table-tab:${tab.id}:account:${safeRequestId}`;
    const inserted = enqueueGenericPrintJob({
      orderCode: printable.orderCode,
      customerName: printable.customerName,
      createdAt: printable.createdAt,
      text: previewText,
      sourceType: 'table_tab_account',
      sourceId: tab.id,
      jobKey,
      operationKind: final ? 'table_account_final' : 'table_account_preview',
      orderSnapshot: printable,
      isReprint: reprint,
      reason,
      actorName: actor?.displayName || actor?.username || '',
      station: 'cashier',
    });
    result.job = getPrintJobByKey(jobKey);
    const existingFailed = result.job?.status === 'failed';
    result.queued = inserted || Boolean(result.job && !existingFailed);
    result.idempotentReplay = !inserted && Boolean(result.job);
    if (existingFailed) {
      result.error = result.job.lastError || 'A impressao falhou. Solicite uma nova segunda via.';
    } else if (!result.queued) {
      result.error = 'Nao foi possivel enviar esta conta para a fila.';
    }
  } catch (error) {
    result.error = `Falha ao enfileirar conta: ${String(error?.message || error)}`;
  }
  return result;
}

function reprintTableTabOrder(rawTabId, rawOrderId, rawPayload = {}, actor = null, context = {}) {
  const tab = getTableTabById(rawTabId);
  if (!tab) return { error: 'Comanda não encontrada.', statusCode: 404 };
  const access = requireWaiterTabAccess(actor, tab);
  if (access.error) return access;
  const orderId = Number.parseInt(String(rawOrderId || ''), 10);
  const order = tab.batches.find((batch) => Number(batch.id) === orderId);
  if (!order) return { error: 'Pedido não pertence a esta comanda.', statusCode: 404 };
  const initialJobKey = `order:${orderId}:initial`;
  const initialJob = getPrintJobByKey(initialJobKey);
  const isReprint = Boolean(initialJob);
  const reason = trimString(rawPayload?.reason, 300);
  if (isReprint && reason.length < 3) return { error: 'Informe o motivo da reimpressao.', statusCode: 400 };
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  if (!requestId) return { error: 'Identificador da impressao invalido.', statusCode: 400 };
  if (isReprint) {
    const rate = checkWaiterReprintRate(actor);
    if (rate.error) return rate;
  }
  const printable = isReprint
    ? {
      ...order,
      documentTitle: 'REIMPRESSAO - NAO PRODUZIR NOVAMENTE',
      customerNote: trimString([
        `REIMPRESSAO solicitada por ${actor?.displayName || actor?.username || 'equipe'}`,
        `Motivo: ${reason}`,
        order.customerNote || '',
      ].filter(Boolean).join(' • '), 900),
    }
    : order;
  const printJob = {
    enabled: PRINT_AGENT_ACTIVE,
    queued: false,
    error: '',
    previewText: buildOrderPrintText(printable),
  };
  if (!PRINT_AGENT_ACTIVE) {
    printJob.error = 'Agente de impressão não está ativo; use a prévia para imprimir pelo navegador.';
  } else {
    try {
      const inserted = enqueuePrintJobFromOrder(printable, {
        reprint: isReprint,
        requestId,
        reason,
        actorName: actor?.displayName || actor?.username || '',
      });
      const jobKey = isReprint ? `order:${orderId}:reprint:${requestId}` : initialJobKey;
      printJob.job = getPrintJobByKey(jobKey);
      printJob.queued = inserted || Boolean(printJob.job);
      printJob.idempotentReplay = !inserted && Boolean(printJob.job);
      if (!printJob.queued) printJob.error = 'Não foi possível enfileirar a reimpressão.';
    } catch (error) {
      printJob.error = `Falha ao enfileirar reimpressão: ${String(error?.message || error)}`;
    }
  }
  if (printJob.queued && !printJob.idempotentReplay) {
    recordWaiterAuditEvent(actor, isReprint ? 'order_reprinted' : 'order_printed', {
      tabId: tab.id,
      tableId: tab.tableId,
      orderId,
      requestId,
      reason,
      context,
    });
  }
  return { tab: getTableTabById(tab.id), order, printJob, isReprint };
}

function buildWaiterAdjustmentPrint(tab, order, adjustment) {
  const removed = adjustment?.item || {};
  const lines = [
    waiterStoreName(),
    'CANCELAMENTO / ALTERACAO',
    tab.tableDisplay,
    `Pedido ${order.batchNumber || order?.waiter?.batchNumber || '--'}`,
    tab.waiterName ? `Garcom: ${tab.waiterName}` : '',
    '',
    `RETIRAR ${adjustment.quantity}x ${removed.name || 'Item'}`,
    removed.borderLabel ? `Borda: ${removed.borderLabel}` : '',
    ...wrapReceiptText(`Motivo: ${adjustment.reason}`, THERMAL_RECEIPT_COLUMNS),
    adjustment.operator ? `Operador: ${adjustment.operator}` : '',
    `Registrado: ${formatOrderCreatedAtForPrint(adjustment.at)}`,
  ].filter((line) => line !== '');
  return `${lines.join('\n')}\n`;
}

function queueWaiterAdjustmentPrint(tab, order, adjustment, printRequested) {
  const previewText = buildWaiterAdjustmentPrint(tab, order, adjustment);
  const result = {
    enabled: PRINT_AGENT_ACTIVE,
    queued: false,
    error: '',
    previewText,
  };
  if (!printRequested) {
    result.previewText = '';
    return result;
  }
  if (!PRINT_AGENT_ACTIVE) {
    result.error = 'Agente de impressão não está ativo; use a prévia para imprimir pelo navegador.';
    return result;
  }
  try {
    const jobKey = `table-tab:${tab.id}:adjustment:${adjustment.id}`;
    const inserted = enqueueGenericPrintJob({
      orderCode: order.orderCode || `MESA-${tab.tableNumber}`,
      customerName: tab.customerName || tab.tableDisplay,
      createdAt: adjustment.at,
      text: previewText,
      sourceType: 'table_tab_adjustment',
      sourceId: tab.id,
      jobKey,
      operationKind: 'table_adjustment',
      reason: adjustment.reason,
      actorName: adjustment.operator,
      station: 'kitchen',
    });
    result.job = getPrintJobByKey(jobKey);
    result.queued = inserted || Boolean(result.job);
    result.idempotentReplay = !inserted && Boolean(result.job);
    if (!result.queued) result.error = 'Nao foi possivel enviar o cancelamento para impressao.';
  } catch (error) {
    result.error = `Falha ao imprimir cancelamento: ${String(error?.message || error)}`;
  }
  return result;
}

function removeItemFromTableTabOrder(rawTabId, rawOrderId, rawLineItemId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  const orderId = Number.parseInt(String(rawOrderId || ''), 10);
  if (!Number.isInteger(tabId) || tabId <= 0 || !Number.isInteger(orderId) || orderId <= 0) {
    return { error: 'Comanda ou pedido inválido.', statusCode: 400 };
  }
  const lineItemId = trimString(rawLineItemId, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(lineItemId)) return { error: 'Item invalido.', statusCode: 400 };
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  if (!requestId) return { error: 'Identificador da retirada invalido. Atualize e tente novamente.', statusCode: 400 };

  const reason = trimString(rawPayload?.reason, 300);
  if (reason.length < 3) {
    return { error: 'Informe o motivo da retirada (mínimo de 3 caracteres).', statusCode: 400 };
  }
  const requestedQuantity = Number.parseInt(String(rawPayload?.quantity || '1'), 10);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 999) {
    return { error: 'Quantidade inválida para retirada.', statusCode: 400 };
  }

  let adjustment;
  let updatedOrder;
  let updatedTab;
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    if (!tab) {
      db.exec('ROLLBACK;');
      return { error: 'Comanda não encontrada.', statusCode: 404 };
    }
    const access = requireWaiterTabAccess(actor, tab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const replay = getWaiterMutationRequest(actor, 'item_remove', requestId);
    if (replay) {
      if (Number(replay.tabId) !== tabId || Number(replay.result?.orderId) !== orderId || replay.result?.lineItemId !== lineItemId) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador de retirada ja foi usado em outra operacao.', code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', statusCode: 409 };
      }
      adjustment = replay.result.adjustment || null;
      updatedOrder = getOrderLogById(orderId);
      updatedTab = tab;
      idempotentReplay = true;
      db.exec('COMMIT;');
    } else {
    if (tab.status !== 'open') {
      db.exec('ROLLBACK;');
      return { error: 'Só é possível retirar itens de uma mesa aberta.', statusCode: 409 };
    }
    const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
    if (versionCheck.error) {
      db.exec('ROLLBACK;');
      return versionCheck;
    }
    const order = tab.batches.find((batch) => Number(batch.id) === orderId);
    if (!order) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido não pertence a esta comanda.', statusCode: 404 };
    }
    const items = Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [];
    const itemIndex = items.findIndex((item, index) => getWaiterLineItemId(item, orderId, index) === lineItemId);
    const item = items[itemIndex];
    if (!item) {
      db.exec('ROLLBACK;');
      return { error: 'Item não encontrado neste pedido.', statusCode: 404 };
    }
    const currentQuantity = Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1);
    if (requestedQuantity > currentQuantity) {
      db.exec('ROLLBACK;');
      return { error: `A retirada máxima deste item é ${currentQuantity}.`, statusCode: 400 };
    }

    const at = new Date().toISOString();
    adjustment = {
      id: randomUUID(),
      action: 'item_removed',
      lineItemId,
      item: { ...item, lineItemId, quantity: requestedQuantity, subtotal: normalizeMoneyValue(Number(item.unitPrice || 0) * requestedQuantity, 0) },
      quantity: requestedQuantity,
      reason,
      operator: actor?.displayName || actor?.username || tab.waiterName || ADMIN_USER,
      actorUserId: actor?.userId || null,
      at,
    };

    if (requestedQuantity === currentQuantity) {
      items.splice(itemIndex, 1);
    } else {
      items[itemIndex] = {
        ...item,
        lineItemId,
        quantity: currentQuantity - requestedQuantity,
        subtotal: normalizeMoneyValue(Number(item.unitPrice || 0) * (currentQuantity - requestedQuantity), 0),
      };
    }
    const subtotal = normalizeMoneyValue(
      items.reduce((sum, entry) => sum + normalizeMoneyValue(entry?.subtotal, 0), 0),
      0,
    );
    const previousAdjustments = Array.isArray(order?.waiter?.adjustments)
      ? order.waiter.adjustments
      : [];
    const nextOrder = {
      ...order,
      items,
      totals: { subtotal, delivery: 0, total: subtotal },
      waiter: {
        ...(order.waiter || {}),
        batchStatus: items.length ? 'adjusted' : 'cancelled',
        adjustments: [...previousAdjustments, adjustment].slice(-100),
      },
    };
    const update = updateOrderLogPayload(orderId, nextOrder);
    if (update.error) throw new Error(update.error);
    applyOrderStockMovement(orderId, {
      orderCode: order.orderCode,
      items: [{ ...item, quantity: requestedQuantity }],
    }, 1);
    const versionUpdate = db.prepare(`
      UPDATE table_tabs
      SET version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open' AND version = ?
    `).run(tabId, versionCheck.expectedVersion);
    if (Number(versionUpdate.changes) !== 1) throw new Error('Conflito ao atualizar a comanda.');
    storeWaiterMutationRequest(actor, 'item_remove', requestId, tabId, {
      orderId,
      lineItemId,
      adjustment,
    });
    recordWaiterAuditEvent(actor, 'item_removed', {
      tabId,
      tableId: tab.tableId,
      orderId,
      lineItemId,
      requestId,
      reason,
      context,
      details: { quantity: requestedQuantity, itemName: item.name, restoredStock: true },
    });
    updatedOrder = update.orderLog;
    db.exec('COMMIT;');
    updatedTab = getTableTabById(tabId);
    checkpointWal('PASSIVE');
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original.
    }
    throw error;
  }

  const printJob = queueWaiterAdjustmentPrint(
    updatedTab,
    { ...updatedOrder, batchNumber: updatedOrder?.waiter?.batchNumber },
    adjustment,
    rawPayload?.printRequested !== false,
  );
  return { tab: updatedTab, order: updatedOrder, adjustment, printJob, idempotentReplay };
}

function buildClosedTableCashierOrder(tab) {
  const sentAt = new Date().toISOString();
  return {
    orderCode: `MESA-${tab.tableNumber}-C${tab.id}`,
    clientRequestId: `waiter-tab-close-${tab.id}`,
    createdAt: sentAt,
    storeName: waiterStoreName(),
    customerName: tab.customerName
      ? `${tab.tableDisplay} - ${tab.customerName}`
      : tab.tableDisplay,
    customerNote: trimString([
      tab.tableDisplay,
      tab.waiterName ? `Garçom: ${tab.waiterName}` : '',
      tab.notes ? `Observação: ${tab.notes}` : '',
      `Aberta em ${formatOrderCreatedAtForPrint(tab.openedAt)}`,
      `${tab.batchCount} pedido(s) consolidado(s)`,
    ].filter(Boolean).join(' • '), 900),
    orderType: 'consumo_local',
    deliveryAddress: '',
    localConsumptionTime: waiterCurrentTime(),
    location: null,
    payment: {
      method: 'outro',
      label: 'A definir no caixa',
      parts: [],
      needsChange: false,
    },
    totals: tab.totals,
    items: tab.items,
    whatsappMessage: '',
    cashierEligible: true,
    inventoryTracked: false,
    inventory: { tracked: false, sourceOrderIds: tab.batches.map((batch) => Number(batch.id)) },
    waiter: {
      tabId: tab.id,
      tableId: tab.tableId,
      tableNumber: tab.tableNumber,
      tableIds: tab.tableIds,
      tableNumbers: tab.tableNumbers,
      tableDisplay: tab.tableDisplay,
      waiterName: tab.waiterName,
      consolidated: true,
      cashierEligible: true,
      inventoryTracked: false,
      sourceOrderIds: tab.batches.map((batch) => Number(batch.id)),
    },
    cashier: {
      status: 'pending',
      sentAt,
    },
  };
}

function closeTableTab(rawTabId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return { error: 'Comanda inválida.', statusCode: 400 };
  }
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  if (!requestId) return { error: 'Identificador do fechamento invalido. Atualize e tente novamente.', statusCode: 400 };
  let cashierOrder = null;
  let resultTab = null;
  let replayHasSnapshot = false;
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    if (!tab) {
      db.exec('ROLLBACK;');
      return { error: 'Comanda não encontrada.', statusCode: 404 };
    }
    const access = requireWaiterTabAccess(actor, tab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const replay = getWaiterMutationRequest(actor, 'account_request', requestId);
    if (replay) {
      if (Number(replay.tabId) !== tabId) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador de fechamento ja foi usado.', code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', statusCode: 409 };
      }
      const replayCashierOrderId = Number(replay.result?.cashierOrderId || 0);
      cashierOrder = replay.result?.cashierOrderSnapshot
        && typeof replay.result.cashierOrderSnapshot === 'object'
        ? replay.result.cashierOrderSnapshot
        : replayCashierOrderId > 0
          ? getOrderLogById(replayCashierOrderId)
          : null;
      if (replay.result?.tabSnapshot && typeof replay.result.tabSnapshot === 'object') {
        resultTab = replay.result.tabSnapshot;
        replayHasSnapshot = true;
      }
      idempotentReplay = true;
      db.exec('COMMIT;');
    } else {
    if (tab.status !== 'open') {
      db.exec('ROLLBACK;');
      return { error: 'Esta comanda nao esta aberta para solicitar a conta.', code: 'TAB_NOT_OPEN', statusCode: 409, tab };
    }
    if (tab.itemCount <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Nao e possivel enviar uma conta sem itens ao Caixa.', statusCode: 400 };
    }
    const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
    if (versionCheck.error) {
      db.exec('ROLLBACK;');
      return versionCheck;
    }
    cashierOrder = createOrderLogWithinTransaction(
      buildClosedTableCashierOrder(tab),
      { applyStock: false },
    );
    const result = db.prepare(`
      UPDATE table_tabs
      SET status = 'awaiting_payment', cashier_order_id = ?,
        bill_requested_at = CURRENT_TIMESTAMP, version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open' AND version = ?
    `).run(cashierOrder.id, tab.id, versionCheck.expectedVersion);
    if (Number(result.changes) === 0) {
      db.exec('ROLLBACK;');
      return { error: 'A comanda mudou enquanto era fechada. Atualize e tente novamente.', statusCode: 409 };
    }
    resultTab = getTableTabById(tab.id);
    storeWaiterMutationRequest(actor, 'account_request', requestId, tab.id, {
      cashierOrderId: cashierOrder.id,
      cashierOrderSnapshot: cashierOrder,
      tabSnapshot: resultTab,
    });
    recordWaiterAuditEvent(actor, 'account_requested', {
      tabId: tab.id,
      tableId: tab.tableId,
      orderId: cashierOrder.id,
      requestId,
      context,
      details: { total: tab.totals.total, itemCount: tab.itemCount },
    });
    db.exec('COMMIT;');
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original.
    }
    throw error;
  }
  checkpointWal('PASSIVE');
  const closedTab = resultTab || getTableTabById(tabId);
  const currentTab = getTableTabById(tabId);
  const replayStillRepresentsCurrentClose = currentTab?.status === 'awaiting_payment'
    && Number(currentTab?.cashierOrderId || 0) === Number(cashierOrder?.id || 0);
  let printJob;
  if (idempotentReplay && !replayHasSnapshot) {
    const existingJob = (currentTab?.accountPrints || [])
      .find((job) => job.operationKind === 'table_account_final') || null;
    printJob = {
      enabled: PRINT_AGENT_ACTIVE,
      queued: Boolean(existingJob),
      error: existingJob ? '' : 'O resultado original foi registrado por uma versao anterior e nao sera reimpresso automaticamente.',
      previewText: existingJob?.text
        || (existingJob?.orderSnapshot ? buildOrderPrintText(existingJob.orderSnapshot) : ''),
      job: existingJob,
      idempotentReplay: true,
    };
  } else if (idempotentReplay && !replayStillRepresentsCurrentClose) {
    const existingJob = getPrintJobByKey(`table-tab:${tabId}:final:${requestId}`);
    printJob = {
      enabled: PRINT_AGENT_ACTIVE,
      queued: Boolean(existingJob),
      error: existingJob ? '' : 'O fechamento original foi reaberto e nao sera enfileirado novamente.',
      previewText: existingJob?.text
        || (existingJob?.orderSnapshot ? buildOrderPrintText(existingJob.orderSnapshot) : ''),
      job: existingJob || null,
      idempotentReplay: true,
    };
  } else {
    printJob = queueTableTabSummaryPrint(closedTab, {
      final: true,
      actor,
      requestId,
    });
  }
  return {
    tab: closedTab,
    cashierOrder: cashierOrder
      ? (getOrderLogById(cashierOrder.id) || cashierOrder)
      : null,
    printJob,
    idempotentReplay,
  };
}

function reopenTableTab(rawTabId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  if (!Number.isInteger(tabId) || tabId <= 0) return { error: 'Comanda invalida.', statusCode: 400 };
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  const reason = trimString(rawPayload?.reason, 300);
  if (!requestId) return { error: 'Identificador da operacao invalido.', statusCode: 400 };
  if (reason.length < 3) return { error: 'Informe o motivo da reabertura.', statusCode: 400 };
  let cashierOrderId = null;
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    const access = requireWaiterTabAccess(actor, tab, { managerOnly: true });
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const replay = getWaiterMutationRequest(actor, 'table_reopen', requestId);
    if (replay) {
      if (Number(replay.tabId) !== tabId) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador ja foi usado em outra reabertura.', statusCode: 409 };
      }
      idempotentReplay = true;
      db.exec('COMMIT;');
      return { tab: getTableTabById(tabId), idempotentReplay };
    }
    if (tab.status !== 'awaiting_payment') {
      db.exec('ROLLBACK;');
      return { error: 'Somente uma conta aguardando o Caixa pode ser reaberta.', statusCode: 409, tab };
    }
    const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
    if (versionCheck.error) {
      db.exec('ROLLBACK;');
      return versionCheck;
    }
    cashierOrderId = Number(tab.cashierOrderId || 0) || null;
    if (cashierOrderId) {
      const references = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM cash_movements WHERE order_id = ?) AS cashMovementCount,
          (SELECT COUNT(*) FROM fiscal_documents WHERE order_id = ?) AS fiscalDocumentCount
      `).get(cashierOrderId, cashierOrderId);
      if (Number(references?.cashMovementCount || 0) > 0 || Number(references?.fiscalDocumentCount || 0) > 0) {
        db.exec('ROLLBACK;');
        return { error: 'A conta ja possui movimento financeiro ou documento fiscal e nao pode ser reaberta.', statusCode: 409 };
      }
    }
    const update = db.prepare(`
      UPDATE table_tabs
      SET status = 'open', cashier_order_id = NULL, bill_requested_at = NULL,
        version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'awaiting_payment' AND version = ?
    `).run(tabId, versionCheck.expectedVersion);
    if (Number(update.changes) !== 1) throw new Error('Conflito ao reabrir a mesa.');
    if (cashierOrderId) {
      db.prepare('DELETE FROM print_jobs WHERE order_id = ?').run(cashierOrderId);
      db.prepare('DELETE FROM order_logs WHERE id = ?').run(cashierOrderId);
    }
    storeWaiterMutationRequest(actor, 'table_reopen', requestId, tabId, { cashierOrderId });
    recordWaiterAuditEvent(actor, 'table_reopened', {
      tabId,
      tableId: tab.tableId,
      orderId: cashierOrderId,
      requestId,
      reason,
      context,
    });
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return { tab: getTableTabById(tabId), idempotentReplay };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    throw error;
  }
}

function buildTableTransferPrint(tab, previousTableNumber, reason, actor) {
  const lines = [
    waiterStoreName(),
    'TRANSFERENCIA DE MESA',
    `Comanda C${tab.id}`,
    `Mesa anterior: ${previousTableNumber}`,
    `Nova mesa: ${tab.tableNumber}`,
    `Responsavel: ${tab.waiterName || '--'}`,
    `Operador: ${actor?.displayName || actor?.username || '--'}`,
    ...wrapReceiptText(`Motivo: ${reason}`, THERMAL_RECEIPT_COLUMNS),
    `Horario: ${formatReceiptDateTime()}`,
  ];
  return `${lines.join('\n')}\n`;
}

function linkDiningTableToTab(rawTabId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  const targetTableId = Number.parseInt(String(rawPayload?.targetTableId || ''), 10);
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  const reason = trimString(rawPayload?.reason, 300);
  if (!Number.isInteger(tabId) || tabId <= 0 || !Number.isInteger(targetTableId) || targetTableId <= 0) {
    return { error: 'Informe uma mesa valida para juntar.', statusCode: 400 };
  }
  if (!requestId) return { error: 'Identificador da organizacao invalido.', statusCode: 400 };
  if (reason.length < 3) return { error: 'Informe o motivo para juntar as mesas.', statusCode: 400 };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    const access = requireWaiterTabAccess(actor, tab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const replay = getWaiterMutationRequest(actor, 'table_link', requestId);
    if (replay) {
      if (Number(replay.tabId) !== tabId || Number(replay.result?.targetTableId) !== targetTableId) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador ja foi usado em outra organizacao.', statusCode: 409 };
      }
      db.exec('COMMIT;');
      return { tab: getTableTabById(tabId), linkedTable: replay.result?.linkedTable || null, idempotentReplay: true };
    }
    if (tab.status !== 'open') {
      db.exec('ROLLBACK;');
      return { error: 'Somente uma comanda aberta pode receber outra mesa.', code: 'TAB_NOT_OPEN', statusCode: 409, tab };
    }
    const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
    if (versionCheck.error) {
      db.exec('ROLLBACK;');
      return versionCheck;
    }
    const target = db.prepare(`
      SELECT id, table_number AS tableNumber, label, active
      FROM dining_tables WHERE id = ? LIMIT 1
    `).get(targetTableId);
    if (!target || !Boolean(target.active)) {
      db.exec('ROLLBACK;');
      return { error: 'Mesa para juntar nao encontrada ou inativa.', statusCode: 404 };
    }
    const ownMember = db.prepare(`
      SELECT active FROM table_tab_members WHERE tab_id = ? AND table_id = ? LIMIT 1
    `).get(tabId, targetTableId);
    if (Boolean(ownMember?.active)) {
      db.exec('ROLLBACK;');
      return { error: 'Esta mesa ja faz parte da comanda.', code: 'TABLE_ALREADY_LINKED', statusCode: 409, tab };
    }
    const occupiedTabId = findActiveTableTabId(targetTableId, { excludingTabId: tabId });
    if (occupiedTabId) {
      db.exec('ROLLBACK;');
      return { error: 'Esta mesa esta ocupada por outra comanda.', code: 'TARGET_TABLE_OCCUPIED', statusCode: 409 };
    }
    db.prepare(`
      INSERT INTO table_tab_members (
        tab_id, table_id, is_primary, active, linked_by_user_id, linked_at, unlinked_at
      ) VALUES (?, ?, 0, 1, ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(tab_id, table_id) DO UPDATE SET
        is_primary = 0,
        active = 1,
        linked_by_user_id = excluded.linked_by_user_id,
        linked_at = CURRENT_TIMESTAMP,
        unlinked_at = NULL
    `).run(tabId, targetTableId, actor?.userId || null);
    const update = db.prepare(`
      UPDATE table_tabs
      SET version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open' AND version = ?
    `).run(tabId, versionCheck.expectedVersion);
    if (Number(update.changes) !== 1) {
      db.exec('ROLLBACK;');
      return { error: 'A comanda mudou enquanto as mesas eram juntadas.', code: 'TAB_VERSION_CONFLICT', statusCode: 409 };
    }
    const linkedTable = {
      tableId: Number(target.id),
      tableNumber: Number(target.tableNumber),
      label: String(target.label || ''),
      isPrimary: false,
      active: true,
    };
    storeWaiterMutationRequest(actor, 'table_link', requestId, tabId, { targetTableId, linkedTable });
    recordWaiterAuditEvent(actor, 'table_linked', {
      tabId,
      tableId: targetTableId,
      requestId,
      reason,
      context,
      details: { primaryTableId: tab.tableId, linkedTableNumber: Number(target.tableNumber) },
    });
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return { tab: getTableTabById(tabId), linkedTable, idempotentReplay: false };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return { error: 'Esta mesa foi ocupada por outra comanda.', code: 'TARGET_TABLE_OCCUPIED', statusCode: 409 };
    }
    throw error;
  }
}

function unlinkDiningTableFromTab(rawTabId, rawTableId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  const tableId = Number.parseInt(String(rawTableId || ''), 10);
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  const reason = trimString(rawPayload?.reason, 300);
  if (!Number.isInteger(tabId) || tabId <= 0 || !Number.isInteger(tableId) || tableId <= 0) {
    return { error: 'Mesa vinculada invalida.', statusCode: 400 };
  }
  if (!requestId) return { error: 'Identificador da organizacao invalido.', statusCode: 400 };
  if (reason.length < 3) return { error: 'Informe o motivo para liberar a mesa.', statusCode: 400 };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    const access = requireWaiterTabAccess(actor, tab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    const replay = getWaiterMutationRequest(actor, 'table_unlink', requestId);
    if (replay) {
      if (Number(replay.tabId) !== tabId || Number(replay.result?.tableId) !== tableId) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador ja foi usado em outra organizacao.', statusCode: 409 };
      }
      db.exec('COMMIT;');
      return { tab: getTableTabById(tabId), idempotentReplay: true };
    }
    if (tab.status !== 'open') {
      db.exec('ROLLBACK;');
      return { error: 'Somente uma comanda aberta pode liberar mesa.', code: 'TAB_NOT_OPEN', statusCode: 409, tab };
    }
    const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
    if (versionCheck.error) {
      db.exec('ROLLBACK;');
      return versionCheck;
    }
    const member = db.prepare(`
      SELECT ttm.is_primary AS isPrimary, dt.table_number AS tableNumber
      FROM table_tab_members ttm
      JOIN dining_tables dt ON dt.id = ttm.table_id
      WHERE ttm.tab_id = ? AND ttm.table_id = ? AND ttm.active = 1
      LIMIT 1
    `).get(tabId, tableId);
    if (!member) {
      db.exec('ROLLBACK;');
      return { error: 'Esta mesa nao esta vinculada a comanda.', statusCode: 404 };
    }
    if (Boolean(member.isPrimary)) {
      db.exec('ROLLBACK;');
      return { error: 'A mesa principal nao pode ser liberada. Use mover comanda.', code: 'PRIMARY_TABLE_REQUIRED', statusCode: 409 };
    }
    const unlink = db.prepare(`
      UPDATE table_tab_members
      SET active = 0, unlinked_at = CURRENT_TIMESTAMP
      WHERE tab_id = ? AND table_id = ? AND active = 1 AND is_primary = 0
    `).run(tabId, tableId);
    if (Number(unlink.changes) !== 1) {
      db.exec('ROLLBACK;');
      return { error: 'A mesa vinculada mudou. Atualize e tente novamente.', statusCode: 409 };
    }
    const update = db.prepare(`
      UPDATE table_tabs
      SET version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'open' AND version = ?
    `).run(tabId, versionCheck.expectedVersion);
    if (Number(update.changes) !== 1) {
      db.exec('ROLLBACK;');
      return { error: 'A comanda mudou enquanto a mesa era liberada.', code: 'TAB_VERSION_CONFLICT', statusCode: 409 };
    }
    storeWaiterMutationRequest(actor, 'table_unlink', requestId, tabId, { tableId });
    recordWaiterAuditEvent(actor, 'table_unlinked', {
      tabId,
      tableId,
      requestId,
      reason,
      context,
      details: { tableNumber: Number(member.tableNumber), primaryTableId: tab.tableId },
    });
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return { tab: getTableTabById(tabId), idempotentReplay: false };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    throw error;
  }
}

function transferTableTab(rawTabId, rawPayload = {}, actor = null, context = {}) {
  const tabId = Number.parseInt(String(rawTabId || ''), 10);
  const targetTableId = Number.parseInt(String(rawPayload?.targetTableId || ''), 10);
  const targetWaiterUserId = Number.parseInt(String(rawPayload?.waiterUserId || ''), 10);
  const hasTableTransfer = Number.isInteger(targetTableId) && targetTableId > 0;
  const hasWaiterTransfer = Number.isInteger(targetWaiterUserId) && targetWaiterUserId > 0;
  if (!Number.isInteger(tabId) || tabId <= 0 || (!hasTableTransfer && !hasWaiterTransfer)) {
    return { error: 'Informe a nova mesa ou o novo responsavel.', statusCode: 400 };
  }
  const requestId = normalizeWaiterRequestId(rawPayload?.clientRequestId);
  const reason = trimString(rawPayload?.reason, 300);
  if (!requestId) return { error: 'Identificador da transferencia invalido.', statusCode: 400 };
  if (reason.length < 3) return { error: 'Informe o motivo da transferencia.', statusCode: 400 };
  let previousTableNumber = null;
  let updatedTab = null;
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const tab = getTableTabById(tabId);
    const access = requireWaiterTabAccess(actor, tab);
    if (access.error) {
      db.exec('ROLLBACK;');
      return access;
    }
    if (hasWaiterTransfer && !['manager', 'admin'].includes(actor?.role)) {
      db.exec('ROLLBACK;');
      return { error: 'Somente gerente pode trocar o responsavel pela mesa.', statusCode: 403 };
    }
    const replay = getWaiterMutationRequest(actor, 'table_transfer', requestId);
    if (replay) {
      const replayTargetTableId = Number(replay.result?.targetTableId || 0);
      const replayWaiterUserId = Number(replay.result?.waiterUserId || 0);
      if (
        Number(replay.tabId) !== tabId
        || (hasTableTransfer && replayTargetTableId !== targetTableId)
        || (hasWaiterTransfer && replayWaiterUserId !== targetWaiterUserId)
      ) {
        db.exec('ROLLBACK;');
        return { error: 'Este identificador ja foi usado em outra transferencia.', statusCode: 409 };
      }
      previousTableNumber = replay.result?.previousTableNumber || tab.tableNumber;
      idempotentReplay = true;
      db.exec('COMMIT;');
      updatedTab = tab;
    } else {
      if (tab.status !== 'open') {
        db.exec('ROLLBACK;');
        return { error: 'Somente mesas abertas podem ser transferidas.', code: 'TAB_NOT_OPEN', statusCode: 409, tab };
      }
      const versionCheck = validateWaiterTabVersion(tab, rawPayload?.expectedVersion);
      if (versionCheck.error) {
        db.exec('ROLLBACK;');
        return versionCheck;
      }
      let nextTableId = tab.tableId;
      if (hasTableTransfer && targetTableId !== tab.tableId) {
        const target = db.prepare(`
          SELECT id, table_number AS tableNumber, active FROM dining_tables WHERE id = ? LIMIT 1
        `).get(targetTableId);
        if (!target || !Boolean(target.active)) {
          db.exec('ROLLBACK;');
          return { error: 'Mesa de destino indisponivel.', statusCode: 404 };
        }
        const occupiedTabId = findActiveTableTabId(targetTableId, { excludingTabId: tabId });
        if (occupiedTabId) {
          db.exec('ROLLBACK;');
          return { error: 'A mesa de destino esta ocupada.', code: 'TARGET_TABLE_OCCUPIED', statusCode: 409 };
        }
        nextTableId = targetTableId;
      }
      let nextUserId = tab.waiterUserId;
      let nextUsername = tab.waiterUsername;
      let nextName = tab.waiterName;
      if (hasWaiterTransfer) {
        const targetUser = getWaiterUserById(targetWaiterUserId);
        if (!targetUser?.active) {
          db.exec('ROLLBACK;');
          return { error: 'Funcionario de destino indisponivel.', statusCode: 404 };
        }
        nextUserId = targetUser.id;
        nextUsername = targetUser.username;
        nextName = targetUser.displayName;
      }
      previousTableNumber = tab.tableNumber;
      if (nextTableId !== tab.tableId) {
        db.prepare(`
          UPDATE table_tab_members
          SET active = 0, is_primary = 0, unlinked_at = CURRENT_TIMESTAMP
          WHERE tab_id = ? AND table_id = ? AND active = 1
        `).run(tabId, tab.tableId);
        db.prepare('UPDATE table_tab_members SET is_primary = 0 WHERE tab_id = ?').run(tabId);
        db.prepare(`
          INSERT INTO table_tab_members (
            tab_id, table_id, is_primary, active, linked_by_user_id, linked_at, unlinked_at
          ) VALUES (?, ?, 1, 1, ?, CURRENT_TIMESTAMP, NULL)
          ON CONFLICT(tab_id, table_id) DO UPDATE SET
            is_primary = 1,
            active = 1,
            linked_by_user_id = excluded.linked_by_user_id,
            linked_at = CURRENT_TIMESTAMP,
            unlinked_at = NULL
        `).run(tabId, nextTableId, actor?.userId || null);
      }
      const update = db.prepare(`
        UPDATE table_tabs
        SET table_id = ?, waiter_user_id = ?, waiter_username = ?, waiter_name = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'open' AND version = ?
      `).run(nextTableId, nextUserId || null, nextUsername || '', nextName || '', tabId, versionCheck.expectedVersion);
      if (Number(update.changes) !== 1) throw new Error('Conflito ao transferir a mesa.');
      storeWaiterMutationRequest(actor, 'table_transfer', requestId, tabId, {
        previousTableNumber,
        targetTableId: nextTableId,
        waiterUserId: nextUserId,
      });
      recordWaiterAuditEvent(actor, 'table_transferred', {
        tabId,
        tableId: nextTableId,
        requestId,
        reason,
        context,
        details: {
          previousTableId: tab.tableId,
          previousTableNumber,
          targetTableId: nextTableId,
          previousWaiterUserId: tab.waiterUserId,
          targetWaiterUserId: nextUserId,
          linkedTableIds: tab.tableIds,
        },
      });
      db.exec('COMMIT;');
      checkpointWal('PASSIVE');
      updatedTab = getTableTabById(tabId);
    }
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    throw error;
  }
  let printJob = { enabled: PRINT_AGENT_ACTIVE, queued: false, error: '', previewText: '' };
  if (hasTableTransfer && Number(previousTableNumber) !== Number(updatedTab.tableNumber)) {
    const previewText = buildTableTransferPrint(updatedTab, previousTableNumber, reason, actor);
    printJob = { enabled: PRINT_AGENT_ACTIVE, queued: false, error: '', previewText };
    if (PRINT_AGENT_ACTIVE) {
      const jobKey = `table-tab:${updatedTab.id}:transfer:${requestId}`;
      const inserted = enqueueGenericPrintJob({
        orderCode: `MESA-${updatedTab.tableNumber}-C${updatedTab.id}`,
        customerName: updatedTab.customerName || `Mesa ${updatedTab.tableNumber}`,
        text: previewText,
        sourceType: 'table_tab_transfer',
        sourceId: updatedTab.id,
        jobKey,
        operationKind: 'table_transfer',
        reason,
        actorName: actor?.displayName || actor?.username || '',
        station: 'kitchen',
      });
      printJob.job = getPrintJobByKey(jobKey);
      printJob.queued = inserted || Boolean(printJob.job);
      printJob.idempotentReplay = !inserted && Boolean(printJob.job);
    } else {
      printJob.error = 'Agente de impressao nao esta ativo; use a previa.';
    }
  }
  return { tab: getTableTabById(tabId), printJob, idempotentReplay };
}

function getStockProducts() {
  const row = db.prepare("SELECT value FROM app_state WHERE section='products' LIMIT 1").get();
  try {
    const products = JSON.parse(String(row?.value || '[]'));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

function getStockCombos() {
  const row = db.prepare("SELECT value FROM app_state WHERE section='combos' LIMIT 1").get();
  try {
    const combos = JSON.parse(String(row?.value || '[]'));
    return Array.isArray(combos) ? combos : [];
  } catch {
    return [];
  }
}

function normalizeStockRequestId(value) {
  const requestId = trimString(value, 180);
  if (!requestId || !/^[A-Za-z0-9._:-]{8,180}$/.test(requestId)) return '';
  return requestId;
}

function stockRequestFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function getStockMutationRequest(requestId) {
  const row = db.prepare(`
    SELECT request_id AS requestId, action, request_fingerprint AS requestFingerprint,
      result_json AS resultJson, actor, created_at AS createdAt
    FROM stock_mutation_requests
    WHERE request_id = ?
    LIMIT 1
  `).get(requestId);
  if (!row) return null;
  let result = {};
  try { result = JSON.parse(row.resultJson || '{}'); } catch { result = {}; }
  return { ...row, result };
}

function storeStockMutationRequest(requestId, action, requestFingerprint, result, actor) {
  db.prepare(`
    INSERT INTO stock_mutation_requests (
      request_id, action, request_fingerprint, result_json, actor, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(requestId, action, requestFingerprint, JSON.stringify(result || {}), trimString(actor, 120));
}

function stockPeriodWindow(rawPeriod) {
  const period = ['7d', '30d', '90d', 'all'].includes(String(rawPeriod || '').trim().toLowerCase())
    ? String(rawPeriod).trim().toLowerCase()
    : '30d';
  const now = new Date();
  if (period === 'all') return { period, from: '', to: now.toISOString(), sqlFrom: '' };
  const days = Number.parseInt(period, 10);
  const fromDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  return {
    period,
    from: fromDate.toISOString(),
    to: now.toISOString(),
    sqlFrom: fromDate.toISOString().replace('T', ' ').slice(0, 19),
  };
}

function getStockBalanceRow(productId) {
  const row = db.prepare(`
    SELECT product_id AS productId, quantity, minimum_quantity AS minimumQuantity,
      average_unit_cost AS averageUnitCost, updated_at AS updatedAt
    FROM stock_balances
    WHERE product_id = ?
    LIMIT 1
  `).get(productId);
  return row ? {
    ...row,
    quantity: roundStockQuantity(row.quantity),
    minimumQuantity: roundStockQuantity(row.minimumQuantity),
    averageUnitCost: Math.max(0, roundStockUnitCost(row.averageUnitCost)),
  } : {
    productId,
    quantity: 0,
    minimumQuantity: 0,
    averageUnitCost: 0,
    updatedAt: '',
  };
}

function upsertStockBalance({ productId, quantity, minimumQuantity, averageUnitCost }) {
  db.prepare(`
    INSERT INTO stock_balances (
      product_id, quantity, minimum_quantity, average_unit_cost, updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(product_id) DO UPDATE SET
      quantity = excluded.quantity,
      minimum_quantity = excluded.minimum_quantity,
      average_unit_cost = excluded.average_unit_cost,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    productId,
    roundStockQuantity(quantity),
    Math.max(0, roundStockQuantity(minimumQuantity)),
    Math.max(0, roundStockUnitCost(averageUnitCost)),
  );
}

function insertStockMovement({
  productId,
  orderId = null,
  movementType,
  quantity,
  balanceAfter,
  unitCost = 0,
  unitRevenue = 0,
  supplier = '',
  invoiceNumber = '',
  notes = '',
  actor = '',
  requestId = '',
  requestFingerprint = '',
}) {
  const result = db.prepare(`
    INSERT INTO stock_movements (
      product_id, order_id, movement_type, quantity, balance_after,
      unit_cost, unit_revenue, supplier, invoice_number, notes,
      actor, request_id, request_fingerprint, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    productId,
    orderId == null ? null : Number(orderId),
    movementType,
    roundStockQuantity(quantity),
    roundStockQuantity(balanceAfter),
    Math.max(0, roundStockUnitCost(unitCost)),
    Math.max(0, roundStockMoney(unitRevenue)),
    trimString(supplier, 160),
    trimString(invoiceNumber, 80),
    trimString(notes, 500),
    trimString(actor, 120),
    trimString(requestId, 240),
    trimString(requestFingerprint, 128),
  );
  return Number(result.lastInsertRowid);
}

function mapStockMovementRow(row) {
  if (!row) return null;
  const movement = {
    id: Number(row.id),
    productId: String(row.productId ?? row.product_id ?? ''),
    orderId: row.orderId ?? row.order_id ?? null,
    movementType: String(row.movementType ?? row.movement_type ?? ''),
    quantity: roundStockQuantity(row.quantity),
    balanceAfter: roundStockQuantity(row.balanceAfter ?? row.balance_after),
    unitCost: roundStockMoney(row.unitCost ?? row.unit_cost),
    unitRevenue: roundStockMoney(row.unitRevenue ?? row.unit_revenue),
    supplier: String(row.supplier || ''),
    invoiceNumber: String(row.invoiceNumber ?? row.invoice_number ?? ''),
    notes: String(row.notes || ''),
    actor: String(row.actor || ''),
    actorName: String(row.actor || ''),
    requestId: String(row.requestId ?? row.request_id ?? ''),
    requestFingerprint: String(row.requestFingerprint ?? row.request_fingerprint ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
  return { ...movement, ...stockMovementFinancials(movement) };
}

function getStockMovementById(id) {
  const row = db.prepare(`
    SELECT id, product_id AS productId, order_id AS orderId,
      movement_type AS movementType, quantity, balance_after AS balanceAfter,
      unit_cost AS unitCost, unit_revenue AS unitRevenue, supplier,
      invoice_number AS invoiceNumber, notes, actor, request_id AS requestId,
      request_fingerprint AS requestFingerprint, created_at AS createdAt
    FROM stock_movements WHERE id = ? LIMIT 1
  `).get(Number(id));
  return mapStockMovementRow(row);
}

function getStockSnapshot(rawPeriod = '30d') {
  const products = getStockProducts();
  const balances = new Map(db.prepare('SELECT * FROM stock_balances').all().map((row) => [String(row.product_id), row]));
  const items = products.filter((product) => Boolean(product?.trackStock)).map((product) => {
    const row = balances.get(String(product.id)) || {};
    const quantity = roundStockQuantity(row.quantity || 0);
    const availableQuantity = Math.max(0, quantity);
    const salePrice = Math.max(0, roundStockMoney(product.price));
    const averageUnitCostPrecise = Math.max(0, roundStockUnitCost(row.average_unit_cost || 0));
    const averageUnitCost = roundStockMoney(averageUnitCostPrecise);
    const inventoryValue = roundStockMoney(availableQuantity * averageUnitCostPrecise);
    const potentialRevenue = roundStockMoney(availableQuantity * salePrice);
    return {
      productId: product.id,
      name: product.name,
      unit: product.stockUnit || product.unit || 'UN',
      quantity,
      minimumQuantity: roundStockQuantity(row.minimum_quantity ?? product.minimumStock ?? 0),
      lowStock: quantity <= Number(row.minimum_quantity ?? product.minimumStock ?? 0),
      salePrice,
      averageUnitCost,
      inventoryValue,
      potentialRevenue,
      potentialGrossProfit: roundStockMoney(potentialRevenue - inventoryValue),
      updatedAt: row.updated_at || '',
    };
  });
  const periodWindow = stockPeriodWindow(rawPeriod);
  const movementSql = `
    SELECT id, product_id AS productId, order_id AS orderId,
      movement_type AS movementType, quantity, balance_after AS balanceAfter,
      unit_cost AS unitCost, unit_revenue AS unitRevenue, supplier,
      invoice_number AS invoiceNumber, notes, actor, request_id AS requestId,
      request_fingerprint AS requestFingerprint, created_at AS createdAt
    FROM stock_movements
    ${periodWindow.sqlFrom ? 'WHERE created_at >= ?' : ''}
    ORDER BY id DESC
  `;
  const analyticsRows = periodWindow.sqlFrom
    ? db.prepare(movementSql).all(periodWindow.sqlFrom)
    : db.prepare(movementSql).all();
  const movements = analyticsRows.slice(0, 300).map(mapStockMovementRow);
  const analytics = buildStockAnalytics({
    movements: analyticsRows,
    items,
    period: periodWindow.period,
    from: periodWindow.from,
    to: periodWindow.to,
  });
  return { period: periodWindow.period, items, movements, analytics };
}

function createStockMovement(raw = {}, actor = '', rawPeriod = '30d') {
  const productId = trimString(raw.productId, 140);
  const movementType = String(raw.movementType || '').trim().toLowerCase();
  if (!['entry', 'exit', 'adjustment'].includes(movementType)) {
    return { error: 'Tipo de movimentacao invalido.', statusCode: 400 };
  }
  const rawQuantity = Number(raw.quantity);
  if (!Number.isFinite(rawQuantity) || rawQuantity < 0 || rawQuantity > STOCK_MAX_QUANTITY) {
    return { error: 'Quantidade invalida.', statusCode: 400 };
  }
  if (movementType !== 'adjustment' && rawQuantity <= 0) {
    return { error: 'Quantidade deve ser maior que zero.', statusCode: 400 };
  }
  const requestId = normalizeStockRequestId(raw.clientRequestId);
  if (!requestId) {
    return { error: 'Identificador da movimentacao invalido.', code: 'STOCK_REQUEST_ID_REQUIRED', statusCode: 400 };
  }
  const rawUnitCost = Number(raw.unitCost || 0);
  if (!Number.isFinite(rawUnitCost) || rawUnitCost < 0 || rawUnitCost > STOCK_MAX_UNIT_COST) {
    return { error: 'Custo unitario invalido.', statusCode: 400 };
  }
  const rawMinimumQuantity = raw.minimumQuantity == null || raw.minimumQuantity === ''
    ? null
    : Number(raw.minimumQuantity);
  if (rawMinimumQuantity != null && (
    !Number.isFinite(rawMinimumQuantity)
    || rawMinimumQuantity < 0
    || rawMinimumQuantity > STOCK_MAX_QUANTITY
  )) {
    return { error: 'Estoque minimo invalido.', statusCode: 400 };
  }
  const suppliedUnitCost = Math.max(0, roundStockMoney(rawUnitCost));
  const canonical = {
    productId,
    movementType,
    quantity: roundStockQuantity(rawQuantity),
    unitCost: suppliedUnitCost,
    supplier: trimString(raw.supplier, 160),
    invoiceNumber: trimString(raw.invoiceNumber, 80),
    notes: trimString(raw.notes, 500),
    minimumQuantity: rawMinimumQuantity == null ? null : roundStockQuantity(rawMinimumQuantity),
  };
  const requestFingerprint = stockRequestFingerprint(canonical);
  let movementId = null;
  let idempotentReplay = false;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const replay = getStockMutationRequest(requestId);
    if (replay) {
      if (replay.action !== 'manual_movement' || replay.requestFingerprint !== requestFingerprint) {
        db.exec('ROLLBACK;');
        return {
          error: 'Este identificador de movimentacao ja foi usado com outro conteudo.',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          statusCode: 409,
        };
      }
      movementId = Number(replay.result?.movementId || 0) || null;
      idempotentReplay = true;
      db.exec('ROLLBACK;');
    } else {
      const product = getStockProducts().find((item) => String(item?.id) === productId);
      if (!product || !product.trackStock) {
        db.exec('ROLLBACK;');
        return { error: 'Produto sem controle de estoque.', statusCode: 400 };
      }
      const current = getStockBalanceRow(productId);
      const currentQuantity = current.quantity;
      const currentAverageUnitCost = current.averageUnitCost;
      if (movementType === 'exit' && canonical.quantity > currentQuantity) {
        db.exec('ROLLBACK;');
        return { error: 'Saida maior que o saldo disponivel.', code: 'INSUFFICIENT_STOCK', statusCode: 409 };
      }
      const delta = movementType === 'entry'
        ? canonical.quantity
        : movementType === 'exit'
          ? -canonical.quantity
          : roundStockQuantity(canonical.quantity - currentQuantity);
      const balanceAfter = roundStockQuantity(currentQuantity + delta);
      const fallbackEntryCost = currentAverageUnitCost > 0 ? currentAverageUnitCost : suppliedUnitCost;
      const movementUnitCost = movementType === 'entry'
        ? suppliedUnitCost
        : movementType === 'exit' || delta < 0
          ? currentAverageUnitCost
          : suppliedUnitCost > 0 ? suppliedUnitCost : fallbackEntryCost;
      let averageUnitCost = currentAverageUnitCost;
      if (movementType === 'entry' || delta > 0) {
        averageUnitCost = calculateWeightedAverageUnitCost({
          currentQuantity: Math.max(0, currentQuantity),
          currentAverageUnitCost,
          entryQuantity: Math.max(0, delta),
          entryUnitCost: movementUnitCost,
        });
      }
      if (balanceAfter === 0) averageUnitCost = 0;
      const minimumQuantity = canonical.minimumQuantity == null
        ? Math.max(0, roundStockQuantity(product.minimumStock || current.minimumQuantity || 0))
        : canonical.minimumQuantity;
      upsertStockBalance({ productId, quantity: balanceAfter, minimumQuantity, averageUnitCost });
      movementId = insertStockMovement({
        productId,
        movementType,
        quantity: delta,
        balanceAfter,
        unitCost: movementUnitCost,
        supplier: canonical.supplier,
        invoiceNumber: canonical.invoiceNumber,
        notes: canonical.notes,
        actor,
        requestId,
        requestFingerprint,
      });
      storeStockMutationRequest(requestId, 'manual_movement', requestFingerprint, { movementId }, actor);
      db.exec('COMMIT;');
      checkpointWal('PASSIVE');
    }
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    throw error;
  }

  return {
    stock: getStockSnapshot(rawPeriod),
    movement: movementId ? getStockMovementById(movementId) : null,
    requestId,
    idempotentReplay,
  };
}

function refreshProductsStateAfterStockCommit(products) {
  try {
    if (STATE_CACHE) {
      STATE_CACHE.products = cloneState(products);
    } else {
      STATE_CACHE = null;
    }
    STATE_MANIFEST_CACHE = null;
    const state = STATE_CACHE ? cloneState(STATE_CACHE) : readState();
    persistDefaultStateSnapshot(state);
    return true;
  } catch (error) {
    STATE_CACHE = null;
    STATE_MANIFEST_CACHE = null;
    console.warn('Contagem de estoque confirmada, mas a atualizacao do snapshot local falhou.', error);
    return false;
  }
}

function createInitialStockCount(raw = {}, actor = '', rawPeriod = '30d') {
  const requestId = normalizeStockRequestId(raw.clientRequestId);
  if (!requestId) {
    return { error: 'Identificador da contagem inicial invalido.', code: 'STOCK_REQUEST_ID_REQUIRED', statusCode: 400 };
  }
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (!rawItems.length || rawItems.length > STOCK_INITIAL_COUNT_MAX_ITEMS) {
    return {
      error: `A contagem inicial deve conter entre 1 e ${STOCK_INITIAL_COUNT_MAX_ITEMS} itens.`,
      statusCode: 400,
    };
  }
  const seenProducts = new Set();
  const items = [];
  for (const rawItem of rawItems) {
    const productId = trimString(rawItem?.productId, 140);
    if (!productId) return { error: 'Produto invalido na contagem inicial.', statusCode: 400 };
    if (seenProducts.has(productId)) {
      return { error: `Produto duplicado na contagem inicial: ${productId}.`, code: 'DUPLICATE_PRODUCT', statusCode: 400 };
    }
    seenProducts.add(productId);
    const quantity = Number(rawItem?.quantity);
    const unitCost = Number(rawItem?.unitCost);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > STOCK_MAX_QUANTITY) {
      return { error: `Saldo final invalido para ${productId}.`, statusCode: 400 };
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > STOCK_MAX_UNIT_COST) {
      return { error: `Custo unitario invalido para ${productId}.`, statusCode: 400 };
    }
    const minimumRaw = rawItem?.minimumQuantity;
    const minimumQuantity = minimumRaw == null ? null : Number(minimumRaw);
    if (minimumQuantity != null && (
      !Number.isFinite(minimumQuantity)
      || minimumQuantity < 0
      || minimumQuantity > STOCK_MAX_QUANTITY
    )) {
      return { error: `Estoque minimo invalido para ${productId}.`, statusCode: 400 };
    }
    items.push({
      productId,
      quantity: roundStockQuantity(quantity),
      unitCost: Math.max(0, roundStockMoney(unitCost)),
      minimumQuantity: minimumQuantity == null ? null : roundStockQuantity(minimumQuantity),
    });
  }
  items.sort((a, b) => a.productId.localeCompare(b.productId));
  const activateStock = raw.activateStock === true;
  const supplier = trimString(raw.supplier, 160);
  const invoiceNumber = trimString(raw.invoiceNumber, 80);
  const notes = trimString(raw.notes, 500);
  const canonical = { activateStock, supplier, invoiceNumber, notes, items };
  const requestFingerprint = stockRequestFingerprint(canonical);
  let movementIds = [];
  let activatedProducts = null;
  let idempotentReplay = false;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const replay = getStockMutationRequest(requestId);
    if (replay) {
      if (replay.action !== 'initial_count' || replay.requestFingerprint !== requestFingerprint) {
        db.exec('ROLLBACK;');
        return {
          error: 'Este identificador de contagem ja foi usado com outro conteudo.',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          statusCode: 409,
        };
      }
      movementIds = Array.isArray(replay.result?.movementIds)
        ? replay.result.movementIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
      idempotentReplay = true;
      db.exec('ROLLBACK;');
    } else {
      const products = getStockProducts();
      const productIndexes = new Map(products.map((product, index) => [String(product?.id || ''), index]));
      for (const item of items) {
        if (!productIndexes.has(item.productId)) {
          db.exec('ROLLBACK;');
          return { error: `Produto nao encontrado: ${item.productId}.`, code: 'PRODUCT_NOT_FOUND', statusCode: 400 };
        }
      }

      const nextProducts = products.map((product) => ({ ...product }));
      let productsChanged = false;
      for (const item of items) {
        const index = productIndexes.get(item.productId);
        const product = nextProducts[index];
        if (!product.trackStock && !activateStock) {
          db.exec('ROLLBACK;');
          return { error: `Ative o controle de estoque para ${product.name || item.productId}.`, code: 'STOCK_NOT_ACTIVE', statusCode: 400 };
        }
        if (activateStock && (!product.trackStock || String(product.stockUnit || '').toUpperCase() !== 'UN')) {
          nextProducts[index] = { ...product, trackStock: true, stockUnit: 'UN' };
          productsChanged = true;
        }
      }
      if (productsChanged) {
        db.prepare(`
          INSERT INTO app_state (section, value, updated_at)
          VALUES ('products', ?, ?)
          ON CONFLICT(section) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(JSON.stringify(nextProducts), new Date().toISOString());
        activatedProducts = nextProducts;
      }

      for (const item of items) {
        const product = nextProducts[productIndexes.get(item.productId)];
        const current = getStockBalanceRow(item.productId);
        const delta = roundStockQuantity(item.quantity - current.quantity);
        const minimumQuantity = item.minimumQuantity == null
          ? Math.max(0, roundStockQuantity(product.minimumStock ?? current.minimumQuantity ?? 0))
          : item.minimumQuantity;
        const averageUnitCost = item.quantity > 0 ? roundStockUnitCost(item.unitCost) : 0;
        upsertStockBalance({
          productId: item.productId,
          quantity: item.quantity,
          minimumQuantity,
          averageUnitCost,
        });
        const itemRequestId = `${requestId}:${createHash('sha256').update(item.productId).digest('hex').slice(0, 16)}`;
        movementIds.push(insertStockMovement({
          productId: item.productId,
          movementType: 'initial_count',
          quantity: delta,
          balanceAfter: item.quantity,
          unitCost: item.unitCost,
          supplier,
          invoiceNumber,
          notes,
          actor,
          requestId: itemRequestId,
          requestFingerprint,
        }));
      }
      storeStockMutationRequest(
        requestId,
        'initial_count',
        requestFingerprint,
        { movementIds, productIds: items.map((item) => item.productId) },
        actor,
      );
      db.exec('COMMIT;');
      if (activatedProducts) refreshProductsStateAfterStockCommit(activatedProducts);
      checkpointWal('PASSIVE');
    }
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    throw error;
  }

  return {
    stock: getStockSnapshot(rawPeriod),
    movements: movementIds.map(getStockMovementById).filter(Boolean),
    requestId,
    idempotentReplay,
  };
}

function xmlElements(node, localName) {
  const result = [];
  const visit = (current) => {
    if (!current) return;
    if (String(current.localName || current.nodeName || '').split(':').pop() === localName) result.push(current);
    for (let index = 0; index < (current.childNodes?.length || 0); index += 1) visit(current.childNodes[index]);
  };
  visit(node);
  return result;
}

function parseStockNfeXml(rawXml) {
  const xml = String(rawXml || '').trim();
  if (!xml || Buffer.byteLength(xml, 'utf8') > 5 * 1024 * 1024) return { error: 'XML vazio ou acima de 5 MB.' };
  const errors = [];
  const doc = new DOMParser({ onError: (level, msg) => { if (level !== 'warning') errors.push(msg); } }).parseFromString(xml, 'application/xml');
  if (errors.length || !findFirstXmlElement(doc, 'infNFe')) return { error: 'Arquivo XML de NF-e invalido.' };
  const infNFe = findFirstXmlElement(doc, 'infNFe');
  const ide = findFirstXmlElement(infNFe, 'ide');
  const emit = findFirstXmlElement(infNFe, 'emit');
  const total = findFirstXmlElement(infNFe, 'ICMSTot');
  const id = String(infNFe?.getAttribute?.('Id') || '').replace(/^NFe/, '');
  const protocolKey = childXmlText(findFirstXmlElement(doc, 'infProt'), 'chNFe');
  const accessKey = onlyDigits(protocolKey || id, 44);
  if (accessKey.length !== 44) return { error: 'Chave de acesso da NF-e nao encontrada.' };
  const supplierCnpj = onlyDigits(childXmlText(emit, 'CNPJ') || childXmlText(emit, 'CPF'), 14);
  const mappings = new Map(db.prepare('SELECT * FROM stock_supplier_mappings WHERE supplier_cnpj=?').all(supplierCnpj).map((row) => [String(row.supplier_product_code), row]));
  const items = xmlElements(infNFe, 'det').map((det, index) => {
    const prod = findFirstXmlElement(det, 'prod');
    const supplierCode = trimString(childXmlText(prod, 'cProd'), 120);
    const mapping = mappings.get(supplierCode);
    return {
      index: index + 1,
      supplierCode,
      barcode: onlyDigits(childXmlText(prod, 'cEAN'), 14),
      name: trimString(childXmlText(prod, 'xProd'), 160),
      ncm: onlyDigits(childXmlText(prod, 'NCM'), 8),
      cest: onlyDigits(childXmlText(prod, 'CEST'), 7),
      cfop: onlyDigits(childXmlText(prod, 'CFOP'), 4),
      unit: trimString(childXmlText(prod, 'uCom'), 12),
      quantity: Number(childXmlText(prod, 'qCom') || 0),
      unitCost: Number(childXmlText(prod, 'vUnCom') || 0),
      total: Number(childXmlText(prod, 'vProd') || 0),
      productId: mapping?.product_id || '',
      conversionFactor: Number(mapping?.conversion_factor || 1),
    };
  }).filter((item) => item.supplierCode && item.name && item.quantity > 0);
  return { invoice: { accessKey, invoiceNumber: childXmlText(ide, 'nNF'), issuedAt: childXmlText(ide, 'dhEmi') || childXmlText(ide, 'dEmi'), supplierCnpj, supplierName: trimString(childXmlText(emit, 'xNome'), 160), total: Number(childXmlText(total, 'vNF') || 0), items } };
}

function importStockNfe(raw = {}, actor = '', rawPeriod = '30d') {
  const invoice = raw.invoice && typeof raw.invoice === 'object' ? raw.invoice : {};
  const accessKey = onlyDigits(invoice.accessKey, 44);
  if (accessKey.length !== 44) return { error: 'Chave da NF-e invalida.', statusCode: 400 };
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (!rawItems.length || rawItems.length > 500) {
    return { error: 'Selecione entre 1 e 500 itens para entrada.', statusCode: 400 };
  }
  const items = [];
  for (const rawItem of rawItems) {
    const quantity = Number(rawItem?.quantity);
    const conversionFactor = Number(rawItem?.conversionFactor || 1);
    const unitCost = Number(rawItem?.unitCost || 0);
    if (
      !Number.isFinite(quantity) || quantity <= 0 || quantity > STOCK_MAX_QUANTITY
      || !Number.isFinite(conversionFactor) || conversionFactor <= 0 || conversionFactor > STOCK_MAX_QUANTITY
      || !Number.isFinite(unitCost) || unitCost < 0 || unitCost > STOCK_MAX_UNIT_COST
      || (quantity * conversionFactor) > STOCK_MAX_QUANTITY
    ) {
      return { error: `Quantidade, conversao ou custo invalido para ${rawItem?.name || 'item'}.`, statusCode: 400 };
    }
    items.push({
      productId: trimString(rawItem?.productId, 140),
      supplierCode: trimString(rawItem?.supplierCode, 120),
      name: trimString(rawItem?.name, 160),
      quantity: roundStockQuantity(quantity),
      conversionFactor: roundStockQuantity(conversionFactor),
      unitCost: Math.max(0, roundStockMoney(unitCost)),
    });
  }
  const canonical = {
    accessKey,
    invoiceNumber: trimString(invoice.invoiceNumber, 80),
    supplierCnpj: onlyDigits(invoice.supplierCnpj, 14),
    supplierName: trimString(invoice.supplierName, 160),
    issuedAt: trimString(invoice.issuedAt, 80),
    total: roundStockMoney(invoice.total),
    items,
  };
  const requestFingerprint = stockRequestFingerprint(canonical);
  let movementIds = [];
  let idempotentReplay = false;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const existing = db.prepare(`
      SELECT id, payload FROM stock_xml_imports WHERE access_key = ? LIMIT 1
    `).get(accessKey);
    if (existing) {
      let stored = {};
      try { stored = JSON.parse(existing.payload || '{}'); } catch { stored = {}; }
      if (stored.requestFingerprint && stored.requestFingerprint !== requestFingerprint) {
        db.exec('ROLLBACK;');
        return {
          error: 'Esta chave de NF-e ja foi importada com outro conteudo.',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          statusCode: 409,
        };
      }
      movementIds = db.prepare(`
        SELECT id FROM stock_movements
        WHERE request_id LIKE ?
        ORDER BY id ASC
      `).all(`xml:${accessKey}:%`).map((row) => Number(row.id));
      idempotentReplay = true;
      db.exec('ROLLBACK;');
      return {
        stock: getStockSnapshot(rawPeriod),
        movements: movementIds.map(getStockMovementById).filter(Boolean),
        accessKey,
        idempotentReplay,
      };
    }
    const products = getStockProducts();
    for (const item of items) {
      const productId = item.productId;
      const product = products.find((entry) => String(entry?.id) === productId && entry?.trackStock);
      const factor = item.conversionFactor;
      const sourceQuantity = item.quantity;
      if (!product || factor <= 0 || sourceQuantity <= 0) {
        throw new Error(`Vinculo ou quantidade invalida para ${item.name || 'item'}.`);
      }
      const quantity = roundStockQuantity(sourceQuantity * factor);
      const unitCost = roundStockUnitCost(item.unitCost / factor);
      const current = getStockBalanceRow(productId);
      const balanceAfter = roundStockQuantity(current.quantity + quantity);
      const averageUnitCost = calculateWeightedAverageUnitCost({
        currentQuantity: Math.max(0, current.quantity),
        currentAverageUnitCost: current.averageUnitCost,
        entryQuantity: quantity,
        entryUnitCost: unitCost,
      });
      upsertStockBalance({
        productId,
        quantity: balanceAfter,
        minimumQuantity: current.updatedAt ? current.minimumQuantity : Number(product.minimumStock || 0),
        averageUnitCost,
      });
      const itemRequestId = `xml:${accessKey}:${movementIds.length + 1}:${createHash('sha256').update(`${productId}:${item.supplierCode}`).digest('hex').slice(0, 12)}`;
      movementIds.push(insertStockMovement({
        productId,
        movementType: 'xml_entry',
        quantity,
        balanceAfter,
        unitCost,
        supplier: canonical.supplierName,
        invoiceNumber: canonical.invoiceNumber,
        notes: `NF-e ${accessKey}`,
        actor,
        requestId: itemRequestId,
        requestFingerprint,
      }));
      db.prepare(`INSERT INTO stock_supplier_mappings(supplier_cnpj,supplier_product_code,product_id,conversion_factor,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(supplier_cnpj,supplier_product_code) DO UPDATE SET product_id=excluded.product_id,conversion_factor=excluded.conversion_factor,updated_at=CURRENT_TIMESTAMP`).run(canonical.supplierCnpj, item.supplierCode, productId, factor);
    }
    db.prepare(`INSERT INTO stock_xml_imports(access_key,invoice_number,supplier_cnpj,supplier_name,issued_at,total,payload) VALUES(?,?,?,?,?,?,?)`).run(
      accessKey,
      canonical.invoiceNumber,
      canonical.supplierCnpj,
      canonical.supplierName,
      canonical.issuedAt,
      canonical.total,
      JSON.stringify({ invoice: canonical, items, requestFingerprint, actor: trimString(actor, 120) }),
    );
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return {
      stock: getStockSnapshot(rawPeriod),
      movements: movementIds.map(getStockMovementById).filter(Boolean),
      accessKey,
      idempotentReplay,
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    return { error: String(error?.message || error), statusCode: 400 };
  }
}

function stockOrderActor(payload = {}) {
  return trimString(
    payload?.waiter?.actorName
      || payload?.waiter?.waiterName
      || payload?.cashier?.operator
      || payload?.customerName
      || 'Pedido',
    120,
  );
}

function getRestorableSaleSnapshot(orderId, productId, requestedQuantity, fallbackCost, fallbackRevenue) {
  const rows = db.prepare(`
    SELECT movement_type AS movementType, quantity, unit_cost AS unitCost,
      unit_revenue AS unitRevenue
    FROM stock_movements
    WHERE order_id = ? AND product_id = ?
      AND movement_type IN ('sale', 'sale_restore')
    ORDER BY id ASC
  `).all(orderId, productId);
  let soldQuantity = 0;
  let restoredQuantity = 0;
  let soldCost = 0;
  let restoredCost = 0;
  let soldRevenue = 0;
  let restoredRevenue = 0;
  for (const row of rows) {
    const quantity = Math.abs(roundStockQuantity(row.quantity));
    const cost = Math.max(0, roundStockUnitCost(row.unitCost));
    const revenue = Math.max(0, roundStockMoney(row.unitRevenue));
    if (row.movementType === 'sale') {
      soldQuantity += quantity;
      soldCost += quantity * cost;
      soldRevenue += quantity * revenue;
    } else {
      restoredQuantity += quantity;
      restoredCost += quantity * cost;
      restoredRevenue += quantity * revenue;
    }
  }
  const remainingQuantity = Math.max(0, roundStockQuantity(soldQuantity - restoredQuantity));
  const remainingCost = Math.max(0, soldCost - restoredCost);
  const remainingRevenue = Math.max(0, soldRevenue - restoredRevenue);
  const hasRequestedQuantity = requestedQuantity !== null && requestedQuantity !== undefined;
  const requested = hasRequestedQuantity
    ? Math.max(0, roundStockQuantity(requestedQuantity))
    : remainingQuantity;
  const matched = Math.min(requested, remainingQuantity);
  const historicalCost = remainingQuantity > 0 ? remainingCost / remainingQuantity : fallbackCost;
  const historicalRevenue = remainingQuantity > 0 ? remainingRevenue / remainingQuantity : fallbackRevenue;
  return {
    unitCost: Math.max(0, roundStockUnitCost(historicalCost)),
    unitRevenue: Math.max(0, roundStockMoney(historicalRevenue)),
    matchedQuantity: matched,
  };
}

function normalizeOrderStockComponents(rawComponents) {
  const components = new Map();
  for (const rawComponent of Array.isArray(rawComponents) ? rawComponents : []) {
    const productId = trimString(rawComponent?.productId ?? rawComponent?.id, 120);
    const quantity = Math.max(0, roundStockQuantity(rawComponent?.quantity ?? rawComponent?.qty));
    if (!productId || !quantity) continue;
    components.set(productId, roundStockQuantity((components.get(productId) || 0) + quantity));
  }
  return [...components].map(([productId, quantity]) => ({ productId, quantity }));
}

function getOrderItemStockTargets(item, productsById, combosById) {
  const orderedQuantity = Math.max(0, roundStockQuantity(item?.quantity || 0));
  if (!orderedQuantity) return [];

  let components = [];
  if (Boolean(item?.isHalfPizza)) {
    components = normalizeOrderStockComponents(
      Array.isArray(item?.stockComponents) && item.stockComponents.length
        ? item.stockComponents
        : [
          { productId: item?.halfPizzaFirstId, quantity: 0.5 },
          { productId: item?.halfPizzaSecondId, quantity: 0.5 },
        ],
    );
  } else if (Boolean(item?.isCombo)) {
    const combo = combosById.get(String(item?.productId || item?.id || ''));
    components = normalizeOrderStockComponents(
      Array.isArray(item?.stockComponents) && item.stockComponents.length
        ? item.stockComponents
        : combo?.items,
    );
  } else {
    components = normalizeOrderStockComponents([{
      productId: item?.productId || item?.id,
      quantity: 1,
    }]);
  }
  if (!components.length) return [];

  const weightedComponents = components.map((component) => {
    const product = productsById.get(component.productId);
    const catalogPrice = Math.max(0, Number(product?.price) || 0);
    return {
      ...component,
      product,
      weight: catalogPrice * component.quantity,
    };
  });
  const pricedWeight = weightedComponents.reduce((sum, component) => sum + component.weight, 0);
  const totalWeight = pricedWeight > 0
    ? pricedWeight
    : weightedComponents.reduce((sum, component) => sum + component.quantity, 0);
  const lineRevenue = Math.max(0, roundStockMoney(
    Number(item?.unitPrice ?? item?.price ?? 0) * orderedQuantity,
  ));

  return weightedComponents.map((component) => {
    const quantity = roundStockQuantity(orderedQuantity * component.quantity);
    const weight = pricedWeight > 0 ? component.weight : component.quantity;
    const allocatedRevenue = totalWeight > 0 ? lineRevenue * (weight / totalWeight) : 0;
    return {
      productId: component.productId,
      product: component.product,
      quantity,
      unitRevenue: quantity > 0 ? Math.max(0, roundStockMoney(allocatedRevenue / quantity)) : 0,
      lineItemId: trimString(item?.lineItemId || item?.id, 120),
    };
  }).filter((component) => component.productId && component.quantity > 0);
}

function getOrderStockTargets(orderId, payload, direction, { restoreAll = false } = {}) {
  if (direction > 0 && restoreAll) {
    return db.prepare(`
      SELECT DISTINCT product_id AS productId
      FROM stock_movements
      WHERE order_id = ? AND movement_type IN ('sale', 'sale_restore')
      ORDER BY product_id ASC
    `).all(orderId).map((row) => ({
      productId: String(row.productId || ''),
      product: null,
      quantity: null,
      unitRevenue: 0,
      lineItemId: '',
    }));
  }

  const products = getStockProducts();
  const productsById = new Map(products.map((product) => [String(product?.id || ''), product]));
  const combosById = new Map(getStockCombos().map((combo) => [String(combo?.id || ''), combo]));
  return (Array.isArray(payload?.items) ? payload.items : []).flatMap(
    (item) => getOrderItemStockTargets(item, productsById, combosById),
  );
}

function applyOrderStockMovement(orderId, payload, direction, options = {}) {
  const products = getStockProducts();
  const byId = new Map(products.map((product) => [String(product?.id || ''), product]));
  let appliedMovements = 0;
  const targets = getOrderStockTargets(orderId, payload, direction, options);
  for (const target of targets) {
    const productId = String(target?.productId || '');
    const product = target?.product || byId.get(productId);
    if (direction < 0 && !product?.trackStock) continue;
    const requestedQuantity = target?.quantity === null
      ? null
      : Math.max(0, roundStockQuantity(target?.quantity || 0));
    if (requestedQuantity !== null && !requestedQuantity) continue;
    const current = getStockBalanceRow(productId);
    const fallbackRevenue = Math.max(0, roundStockMoney(target?.unitRevenue));
    let quantity = requestedQuantity || 0;
    let unitCost = current.averageUnitCost;
    let unitRevenue = fallbackRevenue;
    let averageUnitCost = current.averageUnitCost;
    if (direction > 0) {
      const restore = getRestorableSaleSnapshot(
        orderId,
        productId,
        requestedQuantity,
        current.averageUnitCost,
        fallbackRevenue,
      );
      quantity = restore.matchedQuantity;
      if (!quantity) continue;
      unitCost = restore.unitCost;
      unitRevenue = restore.unitRevenue;
      averageUnitCost = calculateRestoredAverageUnitCost({
        currentQuantity: Math.max(0, current.quantity),
        currentAverageUnitCost: current.averageUnitCost,
        restoredQuantity: quantity,
        restoredUnitCost: unitCost,
      });
    }
    const balanceAfter = roundStockQuantity(current.quantity + (direction * quantity));
    upsertStockBalance({
      productId,
      quantity: balanceAfter,
      minimumQuantity: current.updatedAt
        ? current.minimumQuantity
        : Math.max(0, Number(product?.minimumStock) || 0),
      averageUnitCost,
    });
    const movementType = direction < 0 ? 'sale' : 'sale_restore';
    const requestFingerprint = stockRequestFingerprint({
      orderId: Number(orderId),
      productId,
      movementType,
      quantity,
      unitCost: roundStockUnitCost(unitCost),
      unitRevenue,
      lineItemId: trimString(target?.lineItemId, 120),
    });
    insertStockMovement({
      productId,
      orderId,
      movementType,
      quantity: direction * quantity,
      balanceAfter,
      unitCost,
      unitRevenue,
      notes: `Pedido ${payload?.orderCode || orderId}`,
      actor: stockOrderActor(payload),
      requestFingerprint,
    });
    appliedMovements += 1;
  }
  return appliedMovements;
}

function parseJsonObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Mantem o fallback.
  }
  return fallback;
}

function normalizeMoneyValue(value, fallback = 0) {
  return normalizeMoneyValueCore(value, fallback);
}

function rowMoneyCents(moneyValue, centsValue, fallbackMoney = 0) {
  const parsedCents = Number.parseInt(String(centsValue ?? ''), 10);
  if (Number.isFinite(parsedCents)) return parsedCents;
  return moneyToCents(moneyValue, fallbackMoney);
}

function parseCashSessionRow(row, options = {}) {
  if (!row) return null;
  const session = {
    id: row.id,
    status: String(row.status || 'open'),
    operator: String(row.operator || ''),
    openingAmountCents: rowMoneyCents(row.openingAmount ?? row.opening_amount, row.openingAmountCents ?? row.opening_amount_cents, 0),
    closingAmountCents: row.closingAmountCents == null && row.closing_amount_cents == null && row.closingAmount == null && row.closing_amount == null
      ? null
      : rowMoneyCents(row.closingAmount ?? row.closing_amount, row.closingAmountCents ?? row.closing_amount_cents, 0),
    expectedAmountCents: row.expectedAmountCents == null && row.expected_amount_cents == null && row.expectedAmount == null && row.expected_amount == null
      ? null
      : rowMoneyCents(row.expectedAmount ?? row.expected_amount, row.expectedAmountCents ?? row.expected_amount_cents, 0),
    differenceAmountCents: row.differenceAmountCents == null && row.difference_amount_cents == null && row.differenceAmount == null && row.difference_amount == null
      ? null
      : rowMoneyCents(row.differenceAmount ?? row.difference_amount, row.differenceAmountCents ?? row.difference_amount_cents, 0),
    openingAmount: normalizeMoneyValue(row.openingAmount ?? row.opening_amount, centsToMoney(rowMoneyCents(null, row.openingAmountCents ?? row.opening_amount_cents, 0))),
    closingAmount: row.closingAmount == null && row.closing_amount == null && row.closingAmountCents == null && row.closing_amount_cents == null
      ? null
      : normalizeMoneyValue(row.closingAmount ?? row.closing_amount, centsToMoney(rowMoneyCents(null, row.closingAmountCents ?? row.closing_amount_cents, 0))),
    expectedAmount: row.expectedAmount == null && row.expected_amount == null && row.expectedAmountCents == null && row.expected_amount_cents == null
      ? null
      : normalizeMoneyValue(row.expectedAmount ?? row.expected_amount, centsToMoney(rowMoneyCents(null, row.expectedAmountCents ?? row.expected_amount_cents, 0))),
    differenceAmount: row.differenceAmount == null && row.difference_amount == null && row.differenceAmountCents == null && row.difference_amount_cents == null
      ? null
      : normalizeMoneyValue(row.differenceAmount ?? row.difference_amount, centsToMoney(rowMoneyCents(null, row.differenceAmountCents ?? row.difference_amount_cents, 0))),
    notes: String(row.notes || ''),
    snapshot: parseJsonObject(row.snapshotPayload || row.snapshot_payload, {}),
    openedAt: String(row.openedAt || row.opened_at || ''),
    closedAt: String(row.closedAt || row.closed_at || ''),
    createdAt: String(row.createdAt || row.created_at || ''),
    updatedAt: String(row.updatedAt || row.updated_at || ''),
  };
  if (options.withTotals) {
    session.totals = calculateCashSessionTotals(session.id);
    if (session.expectedAmount == null) {
      session.expectedAmountCents = calculateExpectedCashDrawerCents(
        session.openingAmountCents,
        session.totals,
      );
      session.expectedAmount = centsToMoney(session.expectedAmountCents);
    }
  }
  return session;
}

function parseCashMovementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.sessionId ?? row.session_id,
    orderId: row.orderId ?? row.order_id ?? null,
    fiscalDocumentId: row.fiscalDocumentId ?? row.fiscal_document_id ?? null,
    type: String(row.type || ''),
    paymentMethod: String(row.paymentMethod || row.payment_method || ''),
    amountCents: rowMoneyCents(row.amount, row.amountCents ?? row.amount_cents, 0),
    amount: normalizeMoneyValue(row.amount, centsToMoney(rowMoneyCents(null, row.amountCents ?? row.amount_cents, 0))),
    description: String(row.description || ''),
    payload: parseJsonObject(row.payload, {}),
    createdAt: String(row.createdAt || row.created_at || ''),
  };
}

function getOpenCashSession() {
  const row = db.prepare(`
    SELECT
      id,
      status,
      operator,
      opening_amount AS openingAmount,
      opening_amount_cents AS openingAmountCents,
      closing_amount AS closingAmount,
      closing_amount_cents AS closingAmountCents,
      expected_amount AS expectedAmount,
      expected_amount_cents AS expectedAmountCents,
      difference_amount AS differenceAmount,
      difference_amount_cents AS differenceAmountCents,
      notes,
      snapshot_payload AS snapshotPayload,
      opened_at AS openedAt,
      closed_at AS closedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM cash_sessions
    WHERE status = 'open'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  return parseCashSessionRow(row, { withTotals: true });
}

function getCashSessionById(sessionId) {
  const safeSessionId = Number.parseInt(String(sessionId || ''), 10);
  if (!Number.isFinite(safeSessionId) || safeSessionId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      status,
      operator,
      opening_amount AS openingAmount,
      opening_amount_cents AS openingAmountCents,
      closing_amount AS closingAmount,
      closing_amount_cents AS closingAmountCents,
      expected_amount AS expectedAmount,
      expected_amount_cents AS expectedAmountCents,
      difference_amount AS differenceAmount,
      difference_amount_cents AS differenceAmountCents,
      notes,
      snapshot_payload AS snapshotPayload,
      opened_at AS openedAt,
      closed_at AS closedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM cash_sessions
    WHERE id = ?
    LIMIT 1
  `).get(safeSessionId);
  return parseCashSessionRow(row, { withTotals: true });
}

function movementSignedAmount(type, amount) {
  const safeAmount = normalizeMoneyValue(amount, 0);
  const normalizedType = String(type || '').toLowerCase();
  if (normalizedType === 'withdrawal' || normalizedType === 'refund') return -safeAmount;
  return safeAmount;
}

function createEmptyCashTotals(count = 0) {
  return {
    sales: 0,
    supplies: 0,
    withdrawals: 0,
    refunds: 0,
    adjustments: 0,
    net: 0,
    count,
    byPayment: {},
    byPaymentDetailed: {},
  };
}

function addCashMovementToTotals(totals, row) {
  const type = String(row?.type || '').toLowerCase();
  const paymentMethod = normalizePaymentMethod(row?.paymentMethod || row?.payment_method, 'outro');
  const amount = normalizeMoneyValue(row?.amount, 0);

  if (type === 'sale') totals.sales += amount;
  if (type === 'supply') totals.supplies += amount;
  if (type === 'withdrawal') totals.withdrawals += amount;
  if (type === 'refund') totals.refunds += amount;
  if (type === 'adjustment') totals.adjustments += amount;

  const signedAmount = movementSignedAmount(type, amount);
  totals.net += signedAmount;
  totals.byPayment[paymentMethod] = normalizeMoneyValue((totals.byPayment[paymentMethod] || 0) + signedAmount, 0);

  if (!totals.byPaymentDetailed[paymentMethod]) {
    totals.byPaymentDetailed[paymentMethod] = createEmptyCashTotals(0);
  }
  const methodTotals = totals.byPaymentDetailed[paymentMethod];
  methodTotals.count += 1;
  if (type === 'sale') methodTotals.sales += amount;
  if (type === 'supply') methodTotals.supplies += amount;
  if (type === 'withdrawal') methodTotals.withdrawals += amount;
  if (type === 'refund') methodTotals.refunds += amount;
  if (type === 'adjustment') methodTotals.adjustments += amount;
  methodTotals.net += signedAmount;
}

function normalizeCashTotals(totals) {
  const normalized = {
    sales: normalizeMoneyValue(totals.sales, 0),
    supplies: normalizeMoneyValue(totals.supplies, 0),
    withdrawals: normalizeMoneyValue(totals.withdrawals, 0),
    refunds: normalizeMoneyValue(totals.refunds, 0),
    adjustments: normalizeMoneyValue(totals.adjustments, 0),
    net: normalizeMoneyValue(totals.net, 0),
    count: Number.parseInt(String(totals.count || 0), 10) || 0,
    byPayment: {},
    byPaymentDetailed: {},
  };
  for (const [method, amount] of Object.entries(totals.byPayment || {})) {
    normalized.byPayment[method] = normalizeMoneyValue(amount, 0);
  }
  for (const [method, methodTotals] of Object.entries(totals.byPaymentDetailed || {})) {
    normalized.byPaymentDetailed[method] = normalizeCashTotals(methodTotals);
  }
  return normalized;
}

function calculateCashTotalsFromRows(rows = []) {
  return calculateCashTotalsFromRowsCore(rows);
}

function calculateCashSessionTotals(sessionId) {
  const safeSessionId = Number.parseInt(String(sessionId || ''), 10);
  if (!Number.isFinite(safeSessionId) || safeSessionId <= 0) {
    return calculateCashTotalsFromRows([]);
  }

  const rows = db.prepare(`
    SELECT type, payment_method AS paymentMethod, amount, amount_cents AS amountCents
    FROM cash_movements
    WHERE session_id = ?
  `).all(safeSessionId);

  return calculateCashTotalsFromRows(rows);
}

function listCashMovements({ limit = 80, sessionId = null } = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || '80'), 10) || 80, 500));
  const safeSessionId = Number.parseInt(String(sessionId || ''), 10);
  const hasSessionFilter = Number.isFinite(safeSessionId) && safeSessionId > 0;
  const rows = hasSessionFilter
    ? db.prepare(`
        SELECT
          id,
          session_id AS sessionId,
          order_id AS orderId,
          fiscal_document_id AS fiscalDocumentId,
          type,
          payment_method AS paymentMethod,
          amount,
          amount_cents AS amountCents,
          description,
          payload,
          created_at AS createdAt
        FROM cash_movements
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(safeSessionId, safeLimit)
    : db.prepare(`
        SELECT
          id,
          session_id AS sessionId,
          order_id AS orderId,
          fiscal_document_id AS fiscalDocumentId,
          type,
          payment_method AS paymentMethod,
          amount,
          amount_cents AS amountCents,
          description,
          payload,
          created_at AS createdAt
        FROM cash_movements
        ORDER BY id DESC
        LIMIT ?
      `).all(safeLimit);
  return rows.map((row) => parseCashMovementRow(row));
}

function cashLocalDateBounds(dateValue) {
  const raw = trimString(dateValue, 20);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  try {
    const start = zonedDateTimeToUtcDate({ year, month, day, hour: 0, minute: 0, second: 0 }, RECEIPT_TIME_ZONE);
    const noonNext = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
    const next = getTimeZoneParts(noonNext, RECEIPT_TIME_ZONE);
    const end = zonedDateTimeToUtcDate({
      year: next.year,
      month: next.month,
      day: next.day,
      hour: 0,
      minute: 0,
      second: 0,
    }, RECEIPT_TIME_ZONE);
    return {
      start: formatSqlUtcDateTime(start),
      end: formatSqlUtcDateTime(end),
    };
  } catch {
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      start: formatSqlUtcDateTime(start),
      end: formatSqlUtcDateTime(end),
    };
  }
}

function listCashSessions({
  status = 'closed',
  operator = '',
  dateFrom = '',
  dateTo = '',
  limit = 80,
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || '80'), 10) || 80, 500));
  const normalizedStatus = trimString(status, 20).toLowerCase();
  const filters = [];
  const params = [];

  if (normalizedStatus && normalizedStatus !== 'all') {
    filters.push('status = ?');
    params.push(normalizedStatus === 'open' ? 'open' : 'closed');
  }

  const safeOperator = trimString(operator, 120);
  if (safeOperator) {
    filters.push('operator LIKE ?');
    params.push(`%${safeOperator.replace(/[%_]/g, '')}%`);
  }

  const fromBounds = cashLocalDateBounds(dateFrom);
  if (fromBounds) {
    filters.push('opened_at >= ?');
    params.push(fromBounds.start);
  }
  const toBounds = cashLocalDateBounds(dateTo);
  if (toBounds) {
    filters.push('opened_at < ?');
    params.push(toBounds.end);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      id,
      status,
      operator,
      opening_amount AS openingAmount,
      opening_amount_cents AS openingAmountCents,
      closing_amount AS closingAmount,
      closing_amount_cents AS closingAmountCents,
      expected_amount AS expectedAmount,
      expected_amount_cents AS expectedAmountCents,
      difference_amount AS differenceAmount,
      difference_amount_cents AS differenceAmountCents,
      notes,
      snapshot_payload AS snapshotPayload,
      opened_at AS openedAt,
      closed_at AS closedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM cash_sessions
    ${whereSql}
    ORDER BY id DESC
    LIMIT ?
  `).all(...params, safeLimit);

  return rows.map((row) => parseCashSessionRow(row, { withTotals: true }));
}

function getCashSessionDetails(sessionId) {
  const session = getCashSessionById(sessionId);
  if (!session) return null;
  return {
    session,
    movements: listCashMovements({ limit: 500, sessionId: session.id }),
  };
}

function getCashMovementById(movementId) {
  const safeMovementId = Number.parseInt(String(movementId || ''), 10);
  if (!Number.isFinite(safeMovementId) || safeMovementId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      order_id AS orderId,
      fiscal_document_id AS fiscalDocumentId,
      type,
      payment_method AS paymentMethod,
      amount,
      amount_cents AS amountCents,
      description,
      payload,
      created_at AS createdAt
    FROM cash_movements
    WHERE id = ?
    LIMIT 1
  `).get(safeMovementId);
  return parseCashMovementRow(row);
}

function getCashSaleMovementForOrder(orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      order_id AS orderId,
      fiscal_document_id AS fiscalDocumentId,
      type,
      payment_method AS paymentMethod,
      amount,
      amount_cents AS amountCents,
      description,
      payload,
      created_at AS createdAt
    FROM cash_movements
    WHERE order_id = ? AND type = 'sale'
    ORDER BY id DESC
    LIMIT 1
  `).get(safeOrderId);
  return parseCashMovementRow(row);
}

function getCashSaleMovementsForOrder(orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return [];
  const rows = db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      order_id AS orderId,
      fiscal_document_id AS fiscalDocumentId,
      type,
      payment_method AS paymentMethod,
      amount,
      amount_cents AS amountCents,
      description,
      payload,
      created_at AS createdAt
    FROM cash_movements
    WHERE order_id = ? AND type = 'sale'
    ORDER BY id DESC
  `).all(safeOrderId);
  return rows.map((row) => parseCashMovementRow(row));
}

function getCurrentCashSaleMovements(orderLog) {
  const movementIds = Array.isArray(orderLog?.cashier?.movementIds)
    ? orderLog.cashier.movementIds
      .map((value) => Number.parseInt(String(value || ''), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (movementIds.length) {
    return movementIds
      .map((movementId) => getCashMovementById(movementId))
      .filter((movement) => movement?.type === 'sale' && Number(movement.orderId) === Number(orderLog?.id));
  }
  const legacyMovementId = Number.parseInt(String(orderLog?.cashier?.movementId || ''), 10);
  if (Number.isFinite(legacyMovementId) && legacyMovementId > 0) {
    const movement = getCashMovementById(legacyMovementId);
    if (movement?.type === 'sale' && Number(movement.orderId) === Number(orderLog?.id)) return [movement];
  }
  const latest = getCashSaleMovementsForOrder(orderLog?.id)[0];
  return latest ? [latest] : [];
}

function getCashRefundMovementForOrder(orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      order_id AS orderId,
      fiscal_document_id AS fiscalDocumentId,
      type,
      payment_method AS paymentMethod,
      amount,
      amount_cents AS amountCents,
      description,
      payload,
      created_at AS createdAt
    FROM cash_movements
    WHERE order_id = ? AND type = 'refund'
    ORDER BY id DESC
    LIMIT 1
  `).get(safeOrderId);
  return parseCashMovementRow(row);
}

function getLatestFiscalDocumentForOrder(orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      order_id AS orderId,
      document_type AS documentType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      total,
      customer_name AS customerName,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_documents
    WHERE order_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(safeOrderId);
  return parseFiscalDocumentRow(row);
}

function linkFiscalDocumentToOrderMovements(orderId, fiscalDocumentId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  const safeFiscalDocumentId = Number.parseInt(String(fiscalDocumentId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return 0;
  if (!Number.isFinite(safeFiscalDocumentId) || safeFiscalDocumentId <= 0) return 0;
  const result = db.prepare(`
    UPDATE cash_movements
    SET fiscal_document_id = ?
    WHERE order_id = ?
      AND fiscal_document_id IS NULL
      AND type IN ('sale', 'refund')
  `).run(safeFiscalDocumentId, safeOrderId);
  return Number(result.changes || 0);
}

function openCashSession(rawPayload = {}) {
  const active = getOpenCashSession();
  if (active) return { error: 'Ja existe um caixa aberto.', statusCode: 409, session: active };

  const openingAmount = normalizeMoneyValue(rawPayload?.openingAmount, 0);
  if (openingAmount < 0) return { error: 'Valor inicial do caixa invalido.', statusCode: 400 };
  const openingAmountCents = moneyToCents(openingAmount, 0);

  const operator = trimString(rawPayload?.operator || rawPayload?._operator, 120) || ADMIN_USER;
  const notes = trimString(rawPayload?.notes, 900);
  const result = db.prepare(`
    INSERT INTO cash_sessions (status, operator, opening_amount, opening_amount_cents, notes, opened_at, created_at, updated_at)
    VALUES ('open', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(operator, openingAmount, openingAmountCents, notes);
  checkpointWal('PASSIVE');
  return { session: getCashSessionById(Number(result.lastInsertRowid)) };
}

function closeCashSession(rawPayload = {}) {
  const active = getOpenCashSession();
  if (!active) return { error: 'Nao existe caixa aberto para fechar.', statusCode: 409 };

  const auth = authorizeManagerAction('cash-close', rawPayload);
  if (!auth.ok) return { error: auth.error, statusCode: auth.statusCode || 403 };

  const closingAmount = normalizeMoneyValue(rawPayload?.closingAmount, active.expectedAmount ?? 0);
  if (closingAmount < 0) return { error: 'Valor de fechamento invalido.', statusCode: 400 };
  const closingAmountCents = moneyToCents(closingAmount, 0);

  const totals = active.totals || calculateCashSessionTotals(active.id);
  const expectedAmountCents = calculateExpectedCashDrawerCents(active.openingAmountCents, totals);
  const expectedAmount = centsToMoney(expectedAmountCents);
  const differenceAmountCents = closingAmountCents - expectedAmountCents;
  const differenceAmount = centsToMoney(differenceAmountCents);
  const notes = trimString(rawPayload?.notes, 900);
  const operator = trimString(rawPayload?._operator, 120) || active.operator || ADMIN_USER;
  const snapshot = {
    sessionId: active.id,
    operator,
    openedAt: active.openedAt,
    closedAt: new Date().toISOString(),
    openingAmountCents: active.openingAmountCents,
    closingAmountCents,
    expectedAmountCents,
    differenceAmountCents,
    totals,
    movements: listCashMovements({ limit: 500, sessionId: active.id }),
    notes: notes || active.notes || '',
  };

  db.prepare(`
    UPDATE cash_sessions
    SET
      status = 'closed',
      closing_amount = ?,
      closing_amount_cents = ?,
      expected_amount = ?,
      expected_amount_cents = ?,
      difference_amount = ?,
      difference_amount_cents = ?,
      notes = ?,
      snapshot_payload = ?,
      closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'open'
  `).run(
    closingAmount,
    closingAmountCents,
    expectedAmount,
    expectedAmountCents,
    differenceAmount,
    differenceAmountCents,
    notes || active.notes,
    JSON.stringify(snapshot),
    active.id,
  );
  checkpointWal('PASSIVE');
  return { session: getCashSessionById(active.id) };
}

const CASH_MOVEMENT_TYPES = new Set(['sale', 'supply', 'withdrawal', 'adjustment', 'refund']);
const CASH_PAYMENT_METHODS = new Set(['dinheiro', 'pix', 'cartao', 'cartao_debito', 'cartao_credito', 'voucher', 'outro']);
const CASH_PAYMENT_METHOD_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartao',
  cartao_debito: 'Cartao de debito',
  cartao_credito: 'Cartao de credito',
  voucher: 'Voucher',
  outro: 'Outro',
};

function normalizeCashMovementType(value) {
  const type = trimString(value, 32).toLowerCase();
  return CASH_MOVEMENT_TYPES.has(type) ? type : '';
}

function normalizePaymentMethod(value, fallback = 'outro') {
  const method = trimString(value, 32).toLowerCase();
  if (CASH_PAYMENT_METHODS.has(method)) return method;
  return CASH_PAYMENT_METHODS.has(fallback) ? fallback : 'outro';
}

function getPaymentMethodLabel(value) {
  const method = normalizePaymentMethod(value, 'outro');
  return CASH_PAYMENT_METHOD_LABELS[method] || CASH_PAYMENT_METHOD_LABELS.outro;
}

function buildPaymentSnapshot(basePayment = {}, rawMethod = '', rawLabel = '') {
  const current = basePayment && typeof basePayment === 'object' && !Array.isArray(basePayment)
    ? basePayment
    : {};
  const paymentMethod = normalizePaymentMethod(rawMethod, current.method || 'outro');
  const paymentLabel = trimString(rawLabel, 40) || getPaymentMethodLabel(paymentMethod);
  const nextPayment = {
    ...current,
    method: paymentMethod,
    label: paymentLabel,
  };
  const requestedMethod = trimString(rawMethod, 32).toLowerCase();
  const previousMethod = normalizePaymentMethod(current.method, 'outro');
  if (requestedMethod && paymentMethod !== previousMethod) delete nextPayment.parts;

  if (paymentMethod !== 'pix') {
    delete nextPayment.pixKey;
    delete nextPayment.pixReceiptUrl;
    delete nextPayment.pixReceiptFileName;
  }
  if (paymentMethod !== 'dinheiro') {
    nextPayment.needsChange = false;
    nextPayment.cashGiven = 0;
    nextPayment.change = 0;
  }

  return nextPayment;
}

function normalizeFiscalPaymentForTotal(rawPayment = {}, fiscalTotal = 0) {
  const payment = rawPayment && typeof rawPayment === 'object' && !Array.isArray(rawPayment)
    ? { ...rawPayment }
    : {};
  const fiscalTotalCents = moneyToCents(fiscalTotal, 0);
  if (fiscalTotalCents <= 0 || !Array.isArray(payment.parts) || payment.parts.length === 0) {
    return payment;
  }

  const originalTotalCents = payment.parts.reduce((sum, part) => {
    const suppliedCents = part?.amountCents ?? part?.amount_cents;
    const amountCents = suppliedCents == null
      ? moneyToCents(part?.amount, 0)
      : Number.parseInt(String(suppliedCents), 10);
    return sum + (Number.isInteger(amountCents) && amountCents > 0 ? amountCents : 0);
  }, 0);
  const normalizedOriginal = normalizeCashierPaymentParts(payment.parts, originalTotalCents);
  if (normalizedOriginal.error) {
    delete payment.parts;
    return payment;
  }
  if (originalTotalCents === fiscalTotalCents) {
    payment.parts = normalizedOriginal.parts.map((part) => ({
      ...part,
      label: getPaymentMethodLabel(part.method),
    }));
    return payment;
  }

  if (fiscalTotalCents < normalizedOriginal.parts.length) {
    delete payment.parts;
    return payment;
  }

  let remainingCents = fiscalTotalCents;
  const allocatedParts = normalizedOriginal.parts.map((part, index, parts) => {
    const remainingParts = parts.length - index - 1;
    const proportionalCents = index === parts.length - 1
      ? remainingCents
      : Math.round((part.amountCents / originalTotalCents) * fiscalTotalCents);
    const amountCents = Math.max(1, Math.min(proportionalCents, remainingCents - remainingParts));
    remainingCents -= amountCents;
    return {
      method: part.method,
      label: getPaymentMethodLabel(part.method),
      amountCents,
      amount: centsToMoney(amountCents),
    };
  });
  payment.parts = allocatedParts;
  payment.label = allocatedParts.length === 1
    ? allocatedParts[0].label
    : allocatedParts.map((part) => `${part.label} ${formatCurrencyBRL(part.amount)}`).join(' + ');
  return payment;
}

function createCashMovement(rawPayload = {}) {
  const active = getOpenCashSession();
  if (!active) return { error: 'Abra o caixa antes de registrar movimentos.', statusCode: 409 };

  const type = normalizeCashMovementType(rawPayload?.type);
  if (!type) return { error: 'Tipo de movimento invalido.', statusCode: 400 };
  if (type === 'sale') {
    return { error: 'Venda manual nao permitida. Receba um pedido pelo caixa.', statusCode: 400 };
  }
  if (manualCashMovementRequiresRefundAuthorization(type)) {
    const auth = authorizeManagerAction('refund', rawPayload);
    if (!auth.ok) return { error: auth.error, statusCode: auth.statusCode || 403 };
  }

  const amount = normalizeMoneyValue(rawPayload?.amount, 0);
  if (amount <= 0) return { error: 'Valor do movimento deve ser maior que zero.', statusCode: 400 };
  const amountCents = moneyToCents(amount, 0);

  const paymentMethod = normalizePaymentMethod(rawPayload?.paymentMethod, type === 'sale' ? 'pix' : 'dinheiro');
  const orderIdValue = Number.parseInt(String(rawPayload?.orderId || ''), 10);
  const fiscalDocumentIdValue = Number.parseInt(String(rawPayload?.fiscalDocumentId || ''), 10);
  const orderId = Number.isFinite(orderIdValue) && orderIdValue > 0 ? orderIdValue : null;
  const fiscalDocumentId = Number.isFinite(fiscalDocumentIdValue) && fiscalDocumentIdValue > 0
    ? fiscalDocumentIdValue
    : null;
  if (orderId) {
    const orderLog = getOrderLogById(orderId);
    if (!orderLog) {
      return { error: 'Pedido nao encontrado.', statusCode: 404, code: 'ORDER_NOT_FOUND' };
    }
    if (!isOrderAccepted(orderLog)) {
      return {
        error: 'Confirme o pedido antes de vincular movimentos de caixa.',
        statusCode: 409,
        code: 'ORDER_CONFIRMATION_REQUIRED',
      };
    }
  }
  const description = trimString(rawPayload?.description, 500);
  const payload = rawPayload?.payload && typeof rawPayload.payload === 'object' && !Array.isArray(rawPayload.payload)
    ? rawPayload.payload
    : {};
  payload.audit = {
    ...(payload.audit && typeof payload.audit === 'object' ? payload.audit : {}),
    action: type,
    operator: trimString(rawPayload?._operator, 120) || active.operator || ADMIN_USER,
    at: new Date().toISOString(),
  };

  const result = db.prepare(`
    INSERT INTO cash_movements (
      session_id,
      order_id,
      fiscal_document_id,
      type,
      payment_method,
      amount,
      amount_cents,
      description,
      payload,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    active.id,
    orderId,
    fiscalDocumentId,
    type,
    paymentMethod,
    amount,
    amountCents,
    description,
    JSON.stringify(payload),
  );
  checkpointWal('PASSIVE');
  return { movement: getCashMovementById(Number(result.lastInsertRowid)) };
}

function updateOrderLogPayload(orderId, nextPayload) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return { error: 'Pedido invalido.' };
  if (!nextPayload || typeof nextPayload !== 'object' || Array.isArray(nextPayload)) {
    return { error: 'Payload de pedido invalido.' };
  }

  const orderCode = trimString(nextPayload.orderCode, 80) || `PED-${safeOrderId}`;
  const serialized = JSON.stringify(nextPayload);
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > MAX_ORDER_LOG_PAYLOAD_BYTES) {
    return { error: `Payload excede o limite permitido (${MAX_ORDER_LOG_PAYLOAD_BYTES} bytes).` };
  }

  const result = db.prepare(`
    UPDATE order_logs
    SET order_code = ?, payload = ?
    WHERE id = ?
  `).run(orderCode, serialized, safeOrderId);
  if (Number(result.changes) <= 0) return { error: 'Pedido nao encontrado.' };
  return { orderLog: getOrderLogById(safeOrderId) };
}

function receiveOrderInCashier(orderId, rawPayload = {}) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) {
    return { error: 'ID de pedido invalido.', statusCode: 400 };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const orderLog = getOrderLogById(safeOrderId);
    if (!orderLog) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido nao encontrado.', statusCode: 404 };
    }
    if (!isOrderAccepted(orderLog)) {
      db.exec('ROLLBACK;');
      return {
        error: 'Confirme o pedido antes de recebe-lo no caixa.',
        statusCode: 409,
        code: 'ORDER_CONFIRMATION_REQUIRED',
      };
    }

    const active = getOpenCashSession();
    if (!active) {
      db.exec('ROLLBACK;');
      return { error: 'Abra o caixa antes de receber pedidos.', statusCode: 409 };
    }

    const existing = getCashSaleMovementForOrder(safeOrderId);
    if (existing && String(orderLog?.cashier?.status || '').toLowerCase() !== 'refunded') {
      db.exec('ROLLBACK;');
      return {
        error: 'Pedido ja foi recebido no caixa.',
        statusCode: 409,
        movement: existing,
        orderLog,
      };
    }

    const amount = normalizeMoneyValue(orderLog?.totals?.total, 0);
    if (amount <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Total do pedido invalido para recebimento.', statusCode: 400 };
    }
    const amountCents = moneyToCents(amount, 0);

    const requestedPayments = Array.isArray(rawPayload?.payments) && rawPayload.payments.length
      ? rawPayload.payments
      : [{
        method: rawPayload?.paymentMethod || orderLog?.payment?.method || 'outro',
        amountCents,
      }];
    const normalizedPayments = normalizeCashierPaymentParts(requestedPayments, amountCents);
    if (normalizedPayments.error) {
      db.exec('ROLLBACK;');
      return { error: normalizedPayments.error, statusCode: 400 };
    }
    const paymentParts = normalizedPayments.parts.map((part) => ({
      ...part,
      label: getPaymentMethodLabel(part.method),
    }));
    const firstPayment = paymentParts[0];
    const paymentLabel = paymentParts.length === 1
      ? (trimString(rawPayload?.paymentLabel, 40) || firstPayment.label)
      : paymentParts.map((part) => `${part.label} ${formatCurrencyBRL(part.amount)}`).join(' + ');
    const payment = {
      ...buildPaymentSnapshot(orderLog?.payment, firstPayment.method, paymentLabel),
      label: trimString(paymentLabel, 120),
      parts: paymentParts,
    };
    const paidAt = new Date().toISOString();
    const operator = trimString(rawPayload?._operator, 120) || active.operator || ADMIN_USER;
    const fiscalDocument = getLatestFiscalDocumentForOrder(safeOrderId);
    const fiscalDocumentId = fiscalDocument?.id || null;
    const movementPayload = {
      orderCode: orderLog.orderCode || `PED-${safeOrderId}`,
      customerName: orderLog.customerName || '',
      fiscalDocumentId,
      payment,
      paymentParts,
      totals: orderLog.totals || {},
      audit: {
        action: 'receive',
        operator,
        at: paidAt,
      },
    };
    const insertMovement = db.prepare(`
      INSERT INTO cash_movements (
        session_id,
        order_id,
        fiscal_document_id,
        type,
        payment_method,
        amount,
        amount_cents,
        description,
        payload,
        created_at
      )
      VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const movements = paymentParts.map((part, index) => {
      const partPayload = {
        ...movementPayload,
        paymentPart: { ...part, index: index + 1, count: paymentParts.length },
      };
      const insertResult = insertMovement.run(
        active.id,
        safeOrderId,
        fiscalDocumentId,
        part.method,
        part.amount,
        part.amountCents,
        `Recebimento ${movementPayload.orderCode}${paymentParts.length > 1 ? ` (${index + 1}/${paymentParts.length})` : ''}`,
        JSON.stringify(partPayload),
      );
      return getCashMovementById(Number(insertResult.lastInsertRowid));
    });
    const movement = movements[0];
    const updated = {
      ...orderLog,
      payment,
      cashier: {
        status: 'paid',
        paidAt,
        paymentMethod: firstPayment.method,
        paymentParts,
        amount,
        amountCents,
        movementId: movement.id,
        movementIds: movements.map((entry) => entry.id),
        sessionId: movement.sessionId,
        operator,
      },
    };
    const updateResult = updateOrderLogPayload(safeOrderId, updated);
    if (updateResult.error) {
      db.exec('ROLLBACK;');
      return { error: updateResult.error, statusCode: 400 };
    }

    const linkedTab = db.prepare(`
      SELECT id, table_id AS tableId, status
      FROM table_tabs
      WHERE cashier_order_id = ?
      LIMIT 1
    `).get(safeOrderId);
    if (linkedTab && linkedTab.status === 'awaiting_payment') {
      const tabUpdate = db.prepare(`
        UPDATE table_tabs
        SET status = 'closed', paid_at = ?, closed_at = ?,
          closed_by_user_id = ?, version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'awaiting_payment'
      `).run(
        paidAt,
        paidAt,
        rawPayload?._actor?.userId || null,
        linkedTab.id,
      );
      if (Number(tabUpdate.changes) !== 1) {
        db.exec('ROLLBACK;');
        return { error: 'A mesa vinculada nao esta aguardando pagamento. Atualize o Caixa.', statusCode: 409 };
      }
      db.prepare(`
        UPDATE table_tab_members
        SET active = 0, unlinked_at = ?
        WHERE tab_id = ? AND active = 1
      `).run(paidAt, linkedTab.id);
      recordWaiterAuditEvent(rawPayload?._actor || {
        source: 'admin',
        username: operator,
        displayName: operator,
        role: 'admin',
      }, 'table_paid', {
        tabId: linkedTab.id,
        tableId: linkedTab.tableId,
        orderId: safeOrderId,
        context: rawPayload?._context || {},
        details: { amount, amountCents, paymentParts },
      });
    }

    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return {
      movement,
      movements,
      orderLog: updateResult.orderLog,
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function refundOrderInCashier(orderId, rawPayload = {}) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) {
    return { error: 'ID de pedido invalido.', statusCode: 400 };
  }

  const auth = authorizeManagerAction('refund', rawPayload);
  if (!auth.ok) return { error: auth.error, statusCode: auth.statusCode || 403 };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const active = getOpenCashSession();
    if (!active) {
      db.exec('ROLLBACK;');
      return { error: 'Abra o caixa antes de estornar pedidos.', statusCode: 409 };
    }

    const orderLog = getOrderLogById(safeOrderId);
    if (!orderLog) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido nao encontrado.', statusCode: 404 };
    }
    if (!isOrderAccepted(orderLog)) {
      db.exec('ROLLBACK;');
      return {
        error: 'Confirme o pedido antes de realizar operacoes no caixa.',
        statusCode: 409,
        code: 'ORDER_CONFIRMATION_REQUIRED',
      };
    }

    if (String(orderLog?.cashier?.status || '').toLowerCase() === 'refunded') {
      db.exec('ROLLBACK;');
      return { error: 'Pedido ja foi estornado.', statusCode: 409, orderLog };
    }

    const saleMovements = getCurrentCashSaleMovements(orderLog);
    if (!saleMovements.length) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido ainda nao foi recebido no caixa.', statusCode: 409, orderLog };
    }

    const amountCents = saleMovements.reduce(
      (sum, saleMovement) => sum + Math.max(0, Number(saleMovement?.amountCents || 0)),
      0,
    );
    const amount = centsToMoney(amountCents);
    if (amount <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Valor do estorno invalido.', statusCode: 400 };
    }

    const reason = trimString(rawPayload?.reason, 500) || 'Estorno de pedido';
    const operator = trimString(rawPayload?._operator, 120) || active.operator || ADMIN_USER;
    const refundedAt = new Date().toISOString();
    const fiscalDocument = getLatestFiscalDocumentForOrder(safeOrderId);
    const fiscalDocumentId = fiscalDocument?.id || saleMovements[0]?.fiscalDocumentId || null;
    const paymentParts = saleMovements.map((saleMovement) => ({
      method: normalizePaymentMethod(saleMovement.paymentMethod, 'outro'),
      label: getPaymentMethodLabel(saleMovement.paymentMethod),
      amount: normalizeMoneyValue(saleMovement.amount, 0),
      amountCents: Number(saleMovement.amountCents || moneyToCents(saleMovement.amount, 0)),
      saleMovementId: saleMovement.id,
    }));
    const basePayload = {
      orderCode: orderLog.orderCode || `PED-${safeOrderId}`,
      customerName: orderLog.customerName || '',
      saleMovementIds: saleMovements.map((saleMovement) => saleMovement.id),
      fiscalDocumentId,
      reason,
      payment: orderLog.payment || {},
      paymentParts,
      totals: orderLog.totals || {},
      audit: {
        action: 'refund',
        operator,
        at: refundedAt,
      },
    };

    const insertRefund = db.prepare(`
      INSERT INTO cash_movements (
        session_id,
        order_id,
        fiscal_document_id,
        type,
        payment_method,
        amount,
        amount_cents,
        description,
        payload,
        created_at
      )
      VALUES (?, ?, ?, 'refund', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const movements = saleMovements.map((saleMovement, index) => {
      const paymentMethod = normalizePaymentMethod(saleMovement.paymentMethod, 'outro');
      const partAmountCents = Number(saleMovement.amountCents || moneyToCents(saleMovement.amount, 0));
      const partAmount = centsToMoney(partAmountCents);
      const payload = {
        ...basePayload,
        saleMovementId: saleMovement.id,
        paymentPart: { ...paymentParts[index], index: index + 1, count: saleMovements.length },
      };
      const insertResult = insertRefund.run(
        active.id,
        safeOrderId,
        fiscalDocumentId,
        paymentMethod,
        partAmount,
        partAmountCents,
        `Estorno ${basePayload.orderCode}${saleMovements.length > 1 ? ` (${index + 1}/${saleMovements.length})` : ''}: ${reason}`,
        JSON.stringify(payload),
      );
      return getCashMovementById(Number(insertResult.lastInsertRowid));
    });
    const movement = movements[0];
    const updated = {
      ...orderLog,
      cashier: {
        ...(orderLog.cashier || {}),
        status: 'refunded',
        refundedAt,
        refundReason: reason,
        refundMovementId: movement.id,
        refundMovementIds: movements.map((entry) => entry.id),
        refundSessionId: movement.sessionId,
        refundOperator: operator,
      },
    };
    const updateResult = updateOrderLogPayload(safeOrderId, updated);
    if (updateResult.error) {
      db.exec('ROLLBACK;');
      return { error: updateResult.error, statusCode: 400 };
    }

    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return {
      movement,
      movements,
      orderLog: updateResult.orderLog,
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = Number.parseInt(part.value, 10);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour || 0,
    minute: map.minute || 0,
    second: map.second || 0,
  };
}

function zonedDateTimeToUtcDate(parts, timeZone) {
  const targetUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0,
  );
  let utcMs = targetUtc;
  for (let i = 0; i < 3; i += 1) {
    const actual = getTimeZoneParts(new Date(utcMs), timeZone);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    utcMs += targetUtc - actualUtc;
  }
  return new Date(utcMs);
}

function formatSqlUtcDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function cashTodayBounds(now = new Date()) {
  try {
    const current = getTimeZoneParts(now, RECEIPT_TIME_ZONE);
    const start = zonedDateTimeToUtcDate({
      year: current.year,
      month: current.month,
      day: current.day,
      hour: 0,
      minute: 0,
      second: 0,
    }, RECEIPT_TIME_ZONE);
    const nextLocalNoonUtc = Date.UTC(current.year, current.month - 1, current.day + 1, 12, 0, 0);
    const next = getTimeZoneParts(new Date(nextLocalNoonUtc), RECEIPT_TIME_ZONE);
    const end = zonedDateTimeToUtcDate({
      year: next.year,
      month: next.month,
      day: next.day,
      hour: 0,
      minute: 0,
      second: 0,
    }, RECEIPT_TIME_ZONE);
    return {
      start: formatSqlUtcDateTime(start),
      end: formatSqlUtcDateTime(end),
    };
  } catch {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start: formatSqlUtcDateTime(start),
      end: formatSqlUtcDateTime(end),
    };
  }
}

function getCashierSummary() {
  const activeSession = getOpenCashSession();
  const todayBounds = cashTodayBounds();
  const todayRows = db.prepare(`
    SELECT type, payment_method AS paymentMethod, amount, amount_cents AS amountCents
    FROM cash_movements
    WHERE created_at >= ? AND created_at < ?
  `).all(todayBounds.start, todayBounds.end);

  const today = calculateCashTotalsFromRows(todayRows);

  return {
    ok: true,
    activeSession,
    today,
    recentMovements: activeSession
      ? listCashMovements({ limit: 80, sessionId: activeSession.id })
      : [],
    recentFiscalDocuments: listFiscalDocuments(40),
    fiscalDocumentsTotal: getFiscalDocumentStats().totalCount,
    recentFiscalEvents: listFiscalEvents(40),
  };
}

function onlyDigits(value, maxLength = 32) {
  return String(value ?? '').replace(/\D+/g, '').slice(0, maxLength);
}

function normalizeFiscalDocumentType(value, fallback = 'nfce') {
  const raw = trimString(value, 12).toLowerCase().replace(/[^a-z]/g, '');
  if (raw === 'nfe') return 'nfe';
  return fallback === 'nfe' ? 'nfe' : 'nfce';
}

function normalizeFiscalEnvironment(value) {
  const raw = trimString(value, 24).toLowerCase();
  return raw === 'producao' ? 'producao' : 'homologacao';
}

function normalizeHttpUrl(value, maxLength = 500) {
  const raw = trimString(value, maxLength);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

function getDefaultSefazStatusUrl(fiscal, environment) {
  const uf = trimString(fiscal?.uf, 2).toUpperCase();
  if (uf === 'GO') {
    return environment === 'producao'
      ? 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe'
      : 'https://nfewebhomolog.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe';
  }
  return 'https://www.nfe.fazenda.gov.br/portal/principal.aspx';
}

async function fetchSefazStatusUrl(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), SEFAZ_STATUS_TIMEOUT_MS)
    : null;
  const options = {
    method: 'HEAD',
    redirect: 'follow',
    cache: 'no-store',
    signal: controller?.signal,
  };

  try {
    let response = await fetch(url, options);
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        ...options,
        method: 'GET',
      });
    }
    return response;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const NFE_UF_CODES = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

function getNfeUfCode(uf) {
  return NFE_UF_CODES[trimString(uf, 2).toUpperCase()] || '';
}

function resolveLocalProjectPath(rawPath) {
  const value = trimString(rawPath, 600);
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value);
}

function fiscalAddressValue(fiscal, config, fiscalKey, configKey, fallback = '', maxLength = 120) {
  return trimString(fiscal?.[fiscalKey], maxLength)
    || trimString(config?.[configKey], maxLength)
    || trimString(fallback, maxLength);
}

function getFiscalIssuerAddress(fiscal = {}, config = {}) {
  const uf = (
    trimString(fiscal.addressUf, 2)
    || trimString(fiscal.uf, 2)
    || trimString(config.state, 2)
  ).toUpperCase();
  return {
    street: fiscalAddressValue(fiscal, config, 'addressStreet', 'street', 'Endereco nao informado', 60),
    number: fiscalAddressValue(fiscal, config, 'addressNumber', 'number', 'S/N', 60),
    neighborhood: fiscalAddressValue(fiscal, config, 'addressNeighborhood', 'neighborhood', 'Centro', 60),
    city: fiscalAddressValue(fiscal, config, 'addressCity', 'city', '', 60),
    uf,
    cep: onlyDigits(fiscal?.addressCep || config?.cep, 8),
    phone: onlyDigits(fiscal?.addressPhone || config?.phone || config?.whatsapp, 14),
  };
}

function nfeText(value, maxLength = 120) {
  return trimString(value, maxLength)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(name, value) {
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function cdata(value) {
  return `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function formatNfeDecimal(value, decimals = 2) {
  const numeric = toFiniteNumber(value);
  const safe = numeric === null ? 0 : numeric;
  return safe.toFixed(decimals);
}

function formatNfeAmount(value) {
  return formatNfeDecimal(normalizeMoneyValue(value, 0), 2);
}

function formatNfeQuantity(value) {
  return formatNfeDecimal(Math.max(0.0001, Number(value || 0) || 0.0001), 4);
}

function getDatePartsInTimeZone(value = new Date(), timeZone = RECEIPT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = byType.hour === '24' ? '00' : byType.hour;
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour,
    minute: byType.minute,
    second: byType.second,
  };
}

function formatNfeDateTime(value = new Date()) {
  const parts = getDatePartsInTimeZone(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-03:00`;
}

function getNfeYearMonth(value = new Date()) {
  const parts = getDatePartsInTimeZone(value);
  return `${String(parts.year).slice(-2)}${parts.month}`;
}

function computeNfeAccessKeyDigit(key43) {
  const digits = onlyDigits(key43, 43);
  if (digits.length !== 43) throw new Error('Chave de acesso base invalida.');
  let weight = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }
  const mod = sum % 11;
  const digit = 11 - mod;
  return digit >= 10 ? '0' : String(digit);
}

function randomNfeCode() {
  const value = randomBytes(4).readUInt32BE(0) % 100000000;
  return String(value).padStart(8, '0');
}

function buildNfeAccessKey({
  uf,
  issuedAt,
  cnpj,
  model,
  series,
  number,
  emissionType = '1',
  numericCode = '',
}) {
  const cUf = getNfeUfCode(uf);
  if (!cUf) throw new Error('UF invalida para gerar chave de acesso.');
  const aamm = getNfeYearMonth(issuedAt);
  const cnpjDigits = onlyDigits(cnpj, 14);
  if (cnpjDigits.length !== 14) throw new Error('CNPJ do emitente invalido.');
  const modelDigits = onlyDigits(model, 2).padStart(2, '0');
  const seriesDigits = onlyDigits(series, 3).padStart(3, '0');
  const numberDigits = onlyDigits(number, 9).padStart(9, '0');
  const safeEmissionType = onlyDigits(emissionType, 1) || '1';
  const cNf = onlyDigits(numericCode, 8).padStart(8, '0') || randomNfeCode();
  const key43 = `${cUf}${aamm}${cnpjDigits}${modelDigits}${seriesDigits}${numberDigits}${safeEmissionType}${cNf}`;
  return `${key43}${computeNfeAccessKeyDigit(key43)}`;
}

function getExistingNfeKeyParts(accessKey) {
  const key = onlyDigits(accessKey, 44);
  if (key.length !== 44) return null;
  return {
    accessKey: key,
    cNF: key.slice(35, 43),
    cDV: key.slice(43),
  };
}

function getSefazServicesForFiscal(fiscal, environment) {
  const uf = trimString(fiscal?.uf, 2).toUpperCase();
  const serviceOverrides = fiscal?.sefazServices && typeof fiscal.sefazServices === 'object' && !Array.isArray(fiscal.sefazServices)
    ? fiscal.sefazServices
    : {};
  const environmentOverrides = serviceOverrides[environment] && typeof serviceOverrides[environment] === 'object'
    ? serviceOverrides[environment]
    : {};
  const flatOverrides = {};
  if (normalizeHttpUrl(fiscal?.sefazStatusUrl)) flatOverrides.statusServico = normalizeHttpUrl(fiscal.sefazStatusUrl);
  return resolveSefazServices({
    uf,
    environment,
    overrides: {
      ...environmentOverrides,
      ...flatOverrides,
    },
  });
}

function getNfceQrCodeBaseUrl(fiscal, environment) {
  return getSefazServicesForFiscal(fiscal, environment).qrCode;
}

function getNfceUrlChave(fiscal, environment) {
  return getSefazServicesForFiscal(fiscal, environment).urlChave;
}

function buildNfceQrCodeUrl({ accessKey, environment, fiscal }) {
  const tpAmb = environment === 'producao' ? '1' : '2';
  const environmentConfig = getFiscalEnvironmentConfig(fiscal, environment);
  const cscId = trimString(environmentConfig.cscId, 20);
  const csc = trimString(environmentConfig.csc, 200);
  if (!cscId || !csc) throw new Error('ID CSC/CSC obrigatorios para gerar QR Code NFC-e.');
  const payload = `${accessKey}|2|${tpAmb}|${cscId}`;
  const hash = createHash('sha1').update(`${payload}${csc}`, 'utf8').digest('hex').toUpperCase();
  return `${getNfceQrCodeBaseUrl(fiscal, environment)}?p=${payload}|${hash}`;
}

function getNfePresenceIndicator(order) {
  if (isNfceHomeDeliveryOrder(order?.orderType)) return '4';
  return '1';
}

function normalizeNfeGtin(value) {
  const digits = onlyDigits(value, 14);
  return isValidGtinDigits(digits) ? digits : 'SEM GTIN';
}

function normalizeNfeTaxCst(value, fallback = '49') {
  const digits = onlyDigits(value, 2);
  if (!digits) return fallback;
  return digits.padStart(2, '0');
}

function calculatePercentTaxValue(base, rate) {
  const safeBase = normalizeMoneyValue(base, 0);
  const safeRate = normalizeMoneyValue(rate, 0);
  return normalizeMoneyValue(safeBase * (safeRate / 100), 0);
}

function normalizeNfeItem(rawItem, index, environment, fiscal = {}) {
  const profileValidation = validateExplicitFiscalProductProfile(rawItem, {
    crt: fiscal?.crt,
    environment,
  });
  if (!profileValidation.ok) {
    throw new Error(
      `Perfil fiscal incompleto no item ${index + 1}: ${profileValidation.errors.join(' ')}`,
    );
  }
  const quantity = Math.max(0.0001, Number(rawItem?.quantity || 1) || 1);
  const unitPrice = normalizeMoneyValue(rawItem?.unitPrice, 0);
  const subtotal = normalizeMoneyValue(rawItem?.subtotal ?? (unitPrice * quantity), 0);
  const homologName = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
  const name = environment === 'homologacao'
    ? homologName
    : nfeText(rawItem?.name || 'Item', 120);
  const codeSource = rawItem?.productCode || rawItem?.fiscalCode || rawItem?.productId || rawItem?.id || rawItem?.itemNumber || index + 1;
  const productCode = nfeText(codeSource, 60).replace(/[^A-Za-z0-9._-]/g, '') || String(index + 1);
  const tributaryUnit = nfeText(rawItem?.tributaryUnit || rawItem?.tribUnit || rawItem?.unit || 'UN', 6).toUpperCase() || 'UN';
  const tributaryFactor = normalizeOptionalFactor(rawItem?.tributaryFactor ?? rawItem?.tribFactor) || 1;
  const tributaryQuantity = Math.max(0.0001, quantity * tributaryFactor);
  const tributaryUnitPrice = tributaryQuantity > 0
    ? normalizeMoneyValue(subtotal / tributaryQuantity, 0)
    : unitPrice;
  const pisAliquota = normalizeOptionalRate(rawItem?.pisAliquota);
  const cofinsAliquota = normalizeOptionalRate(rawItem?.cofinsAliquota);
  return {
    itemNumber: index + 1,
    productCode,
    gtin: normalizeNfeGtin(rawItem?.gtin || rawItem?.barcode || rawItem?.ean),
    name,
    ncm: onlyDigits(rawItem?.ncm, 8),
    cest: onlyDigits(rawItem?.cest || '', 7),
    benefitCode: nfeText(rawItem?.benefitCode || rawItem?.cBenef || '', 10),
    cfop: onlyDigits(rawItem?.cfop, 4),
    csosn: nfeText(rawItem?.csosn, 4),
    cst: nfeText(rawItem?.cst || '', 4),
    origin: onlyDigits(rawItem?.origin, 1),
    unit: nfeText(rawItem?.unit, 6).toUpperCase(),
    tributaryUnit,
    quantity,
    tributaryQuantity,
    unitPrice,
    tributaryUnitPrice,
    subtotal,
    aliquotaIcms: normalizeMoneyValue(rawItem?.aliquotaIcms, 0),
    vBCSTRet: rawItem?.vBCSTRet,
    pST: rawItem?.pST,
    vICMSSubstituto: rawItem?.vICMSSubstituto,
    vICMSSTRet: rawItem?.vICMSSTRet,
    vBCFCPSTRet: rawItem?.vBCFCPSTRet,
    pFCPSTRet: rawItem?.pFCPSTRet,
    vFCPSTRet: rawItem?.vFCPSTRet,
    pRedBCEfet: rawItem?.pRedBCEfet,
    vBCEfet: rawItem?.vBCEfet,
    pICMSEfet: rawItem?.pICMSEfet,
    vICMSEfet: rawItem?.vICMSEfet,
    pisCst: normalizeNfeTaxCst(rawItem?.pisCst, ''),
    pisAliquota,
    pisValue: calculatePercentTaxValue(subtotal, pisAliquota),
    cofinsCst: normalizeNfeTaxCst(rawItem?.cofinsCst, ''),
    cofinsAliquota,
    cofinsValue: calculatePercentTaxValue(subtotal, cofinsAliquota),
  };
}

function buildNfePisXml(item) {
  const cst = normalizeNfeTaxCst(item?.pisCst, '49');
  if (['01', '02'].includes(cst)) {
    return `
      <PIS>
        <PISAliq>
          ${xmlTag('CST', cst)}
          <vBC>${formatNfeAmount(item.subtotal)}</vBC>
          <pPIS>${formatNfeDecimal(item.pisAliquota, 2)}</pPIS>
          <vPIS>${formatNfeAmount(item.pisValue)}</vPIS>
        </PISAliq>
      </PIS>`;
  }
  if (['04', '06', '07', '08', '09'].includes(cst)) {
    return `
      <PIS>
        <PISNT>
          ${xmlTag('CST', cst)}
        </PISNT>
      </PIS>`;
  }
  return `
    <PIS>
      <PISOutr>
        ${xmlTag('CST', cst)}
        <vBC>${formatNfeAmount(item.pisAliquota > 0 ? item.subtotal : 0)}</vBC>
        <pPIS>${formatNfeDecimal(item.pisAliquota, 2)}</pPIS>
        <vPIS>${formatNfeAmount(item.pisValue)}</vPIS>
      </PISOutr>
    </PIS>`;
}

function buildNfeCofinsXml(item) {
  const cst = normalizeNfeTaxCst(item?.cofinsCst, '49');
  if (['01', '02'].includes(cst)) {
    return `
      <COFINS>
        <COFINSAliq>
          ${xmlTag('CST', cst)}
          <vBC>${formatNfeAmount(item.subtotal)}</vBC>
          <pCOFINS>${formatNfeDecimal(item.cofinsAliquota, 2)}</pCOFINS>
          <vCOFINS>${formatNfeAmount(item.cofinsValue)}</vCOFINS>
        </COFINSAliq>
      </COFINS>`;
  }
  if (['04', '06', '07', '08', '09'].includes(cst)) {
    return `
      <COFINS>
        <COFINSNT>
          ${xmlTag('CST', cst)}
        </COFINSNT>
      </COFINS>`;
  }
  return `
    <COFINS>
      <COFINSOutr>
        ${xmlTag('CST', cst)}
        <vBC>${formatNfeAmount(item.cofinsAliquota > 0 ? item.subtotal : 0)}</vBC>
        <pCOFINS>${formatNfeDecimal(item.cofinsAliquota, 2)}</pCOFINS>
        <vCOFINS>${formatNfeAmount(item.cofinsValue)}</vCOFINS>
      </COFINSOutr>
    </COFINS>`;
}

function buildNfeTaxXml(item, fiscal) {
  return `
    <imposto>
      <vTotTrib>0.00</vTotTrib>
      ${buildNfeIcmsXml(item, fiscal)}
      ${buildNfePisXml(item)}
      ${buildNfeCofinsXml(item)}
    </imposto>`;
}

function buildNfeItemsXml(items, fiscal, idDest = '1') {
  return items.map((item) => {
    let cfop = item.cfop;
    if (idDest === '2' && cfop && cfop.startsWith('5')) {
      cfop = '6' + cfop.slice(1);
    }
    return `
    <det nItem="${item.itemNumber}">
      <prod>
        ${xmlTag('cProd', item.productCode)}
        ${xmlTag('cEAN', item.gtin)}
        ${xmlTag('xProd', item.name)}
        ${xmlTag('NCM', item.ncm)}
        ${item.cest ? xmlTag('CEST', item.cest) : ''}
        ${item.benefitCode ? xmlTag('cBenef', item.benefitCode) : ''}
        ${xmlTag('CFOP', cfop)}
        ${xmlTag('uCom', item.unit)}
        <qCom>${formatNfeQuantity(item.quantity)}</qCom>
        <vUnCom>${formatNfeDecimal(item.unitPrice, 10)}</vUnCom>
        <vProd>${formatNfeAmount(item.subtotal)}</vProd>
        ${xmlTag('cEANTrib', item.gtin)}
        ${xmlTag('uTrib', item.tributaryUnit)}
        <qTrib>${formatNfeQuantity(item.tributaryQuantity)}</qTrib>
        <vUnTrib>${formatNfeDecimal(item.tributaryUnitPrice, 10)}</vUnTrib>
        ${(item.vFrete && Number(item.vFrete) > 0) ? `<vFrete>${formatNfeAmount(item.vFrete)}</vFrete>` : ''}
        <indTot>1</indTot>
      </prod>
      ${buildNfeTaxXml(item, fiscal)}
    </det>`;
  }).join('');
}

function calculateNfeTotals(items, fiscal, freight = 0) {
  const vProd = normalizeMoneyValue(items.reduce((sum, item) => sum + normalizeMoneyValue(item.subtotal, 0), 0), 0);
  const vFrete = normalizeMoneyValue(freight, 0);
  const crt = trimString(fiscal?.crt, 2);
  const normalRegime = crt && crt !== '1' && crt !== '4';
  const vBC = normalRegime ? normalizeMoneyValue(vProd + vFrete, 0) : 0;
  const vICMS = normalRegime
    ? normalizeMoneyValue(items.reduce((sum, item) => {
      const base = normalizeMoneyValue(item.subtotal, 0);
      const itemFrete = normalizeMoneyValue(item.vFrete, 0);
      const rate = normalizeMoneyValue(item.aliquotaIcms, 0);
      return sum + ((base + itemFrete) * (rate / 100));
    }, 0), 0)
    : 0;
  const vPIS = normalizeMoneyValue(items.reduce((sum, item) => sum + normalizeMoneyValue(item.pisValue, 0), 0), 0);
  const vCOFINS = normalizeMoneyValue(items.reduce((sum, item) => sum + normalizeMoneyValue(item.cofinsValue, 0), 0), 0);
  const vFCPSTRet = sumNfeFcpStRetained(items);
  return {
    vBC,
    vICMS,
    vFCPSTRet,
    vProd,
    vFrete,
    vPIS,
    vCOFINS,
    vNF: normalizeMoneyValue(vProd + vFrete, 0),
  };
}

function buildNfeTotalsXml(totals) {
  return `
    <total>
      <ICMSTot>
        <vBC>${formatNfeAmount(totals.vBC)}</vBC>
        <vICMS>${formatNfeAmount(totals.vICMS)}</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>${formatNfeAmount(totals.vFCPSTRet)}</vFCPSTRet>
        <vProd>${formatNfeAmount(totals.vProd)}</vProd>
        <vFrete>${formatNfeAmount(totals.vFrete || 0)}</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>${formatNfeAmount(totals.vPIS)}</vPIS>
        <vCOFINS>${formatNfeAmount(totals.vCOFINS)}</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${formatNfeAmount(totals.vNF)}</vNF>
        <vTotTrib>0.00</vTotTrib>
      </ICMSTot>
    </total>`;
}

function buildNfePaymentXml(payment, total) {
  const totalCents = moneyToCents(total, 0);
  let parts = [];
  if (Array.isArray(payment?.parts) && payment.parts.length) {
    const normalized = normalizeCashierPaymentParts(payment.parts, totalCents);
    if (normalized.error) {
      throw new Error(`Pagamentos da nota invalidos: ${normalized.error}`);
    }
    parts = normalized.parts;
  } else {
    parts = [{
      method: trimString(payment?.method, 32) || 'outro',
      amountCents: totalCents,
      amount: centsToMoney(totalCents),
    }];
  }
  const detailsXml = buildNfePaymentDetailsXml(parts);
  return `
    <pag>
      ${detailsXml}
    </pag>`;
}

function buildNfeConsumerXml(payload, documentType) {
  const consumer = payload.consumer && typeof payload.consumer === 'object' ? payload.consumer : {};
  const document = onlyDigits(consumer.document, 14);
  const homeDelivery = documentType === 'nfce' && isNfceHomeDeliveryOrder(payload?.order?.orderType);
  if (!document) {
    if (documentType === 'nfe') throw new Error('NF-e modelo 55 exige destinatario com CPF/CNPJ.');
    if (homeDelivery) {
      throw new Error('NFC-e de entrega a domicilio exige CPF ou CNPJ do destinatario.');
    }
    return '';
  }
  const documentTag = document.length > 11 ? 'CNPJ' : 'CPF';
  const address = consumer.address && typeof consumer.address === 'object' ? consumer.address : {};
  const street = trimString(address.street, 60);
  const number = trimString(address.number, 60);
  const neighborhood = trimString(address.neighborhood, 60);
  const cityCode = onlyDigits(address.cityCode, 7);
  const city = trimString(address.city, 60);
  const uf = trimString(address.uf, 2).toUpperCase();
  const cep = onlyDigits(address.cep, 8);
  const complement = trimString(address.complement, 60);
  const phone = onlyDigits(consumer.phone || address.phone, 14);
  const email = trimString(consumer.email, 60);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail do destinatario invalido.');
  }
  const hasAddress = Boolean(street || number || neighborhood || cityCode || city || uf || cep || complement);
  if (documentType === 'nfe' && !hasAddress) {
    throw new Error('NF-e modelo 55 exige o endereco completo do destinatario.');
  }
  if (homeDelivery && !hasAddress) {
    throw new Error('NFC-e de entrega a domicilio exige o endereco completo do destinatario.');
  }
  if (hasAddress && (!street || !number || !neighborhood || cityCode.length !== 7 || !city || !/^[A-Z]{2}$/.test(uf))) {
    throw new Error('Endereco do destinatario incompleto. Informe rua, numero, bairro, cidade, UF e codigo IBGE.');
  }
  if (documentType === 'nfe' && cep.length !== 8) {
    throw new Error('NF-e modelo 55 exige CEP valido com 8 digitos no endereco do destinatario.');
  }
  const addressXml = hasAddress ? `
      <enderDest>
        ${xmlTag('xLgr', nfeText(street, 60))}
        ${xmlTag('nro', nfeText(number, 60))}
        ${complement ? xmlTag('xCpl', nfeText(complement, 60)) : ''}
        ${xmlTag('xBairro', nfeText(neighborhood, 60))}
        ${xmlTag('cMun', cityCode)}
        ${xmlTag('xMun', nfeText(city, 60))}
        ${xmlTag('UF', uf)}
        ${cep ? xmlTag('CEP', cep) : ''}
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
        ${phone ? xmlTag('fone', phone) : ''}
      </enderDest>` : '';
  const indIEDest = ['1', '2', '9'].includes(String(consumer.indIEDest))
    ? String(consumer.indIEDest)
    : (consumer.ie ? '1' : '9');
  const ieDigits = onlyDigits(consumer.ie, 14);
  if (documentType === 'nfe' && indIEDest === '1' && !ieDigits) {
    throw new Error('Inscricao Estadual obrigatoria para destinatario Contribuinte ICMS (indIEDest=1).');
  }
  const ieXml = (indIEDest === '1' || indIEDest === '9') && ieDigits
    ? xmlTag('IE', ieDigits)
    : '';
  return `
    <dest>
      ${xmlTag(documentTag, document)}
      ${xmlTag('xNome', nfeText(consumer.name || 'Consumidor final', 60))}
      ${addressXml}
      <indIEDest>${indIEDest}</indIEDest>
      ${ieXml}
      ${email ? xmlTag('email', email) : ''}
    </dest>`;
}

function buildNfeAdditionalInfoXml(payload, environment) {
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  const freightAmount = normalizeMoneyValue(payload.freight ?? order.freight, 0);
  const thirdPartyDelivery = freightAmount > 0 ? 0 : normalizeMoneyValue(order.thirdPartyDeliveryAmount, 0);
  const parts = [
    environment === 'homologacao' ? 'EMISSAO EM HOMOLOGACAO - SEM VALOR FISCAL' : '',
    order.orderCode ? `Pedido ${order.orderCode}` : '',
    thirdPartyDelivery > 0
      ? `Entrega de terceiro no valor de R$ ${thirdPartyDelivery.toFixed(2).replace('.', ',')} nao integra esta NFC-e`
      : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  return `
    <infAdic>
      ${xmlTag('infCpl', nfeText(parts.join(' | '), 500))}
    </infAdic>`;
}

function buildUnsignedNfeXml(document, payload, fiscal) {
  const state = readState();
  const config = state.config || {};
  const documentType = normalizeFiscalDocumentType(document.documentType || payload.documentType || fiscal.documentType, 'nfce');
  const model = documentType === 'nfe' ? '55' : '65';
  const environment = normalizeFiscalEnvironment(document.environment || payload.environment || fiscal.environment);
  const tpAmb = environment === 'producao' ? '1' : '2';
  const issuedAt = payload?.nfe?.issuedAt ? new Date(payload.nfe.issuedAt) : new Date();
  const safeIssuedAt = Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt;
  const uf = trimString(fiscal.uf || payload?.issuer?.uf, 2).toUpperCase();
  const cUf = getNfeUfCode(uf);
  if (!cUf) throw new Error('UF fiscal invalida para NFC-e.');

  const issuerAddress = getFiscalIssuerAddress(fiscal, config);
  const issuer = payload.issuer && typeof payload.issuer === 'object' ? payload.issuer : {};
  const cnpj = onlyDigits(issuer.cnpj || fiscal.cnpj, 14);
  const cityCode = onlyDigits(issuer.cityCode || fiscal.cityCode, 7);
  const series = onlyDigits(document.series || (documentType === 'nfe' ? fiscal.seriesNfe : fiscal.seriesNfce), 3) || '1';
  const number = onlyDigits(document.number || (documentType === 'nfe' ? fiscal.nextNumberNfe : fiscal.nextNumberNfce), 9);
  if (!number) throw new Error('Numero fiscal invalido.');

  const existingKey = getExistingNfeKeyParts(document.accessKey || payload?.nfe?.accessKey);
  const cNF = existingKey?.cNF || randomNfeCode();
  const accessKey = existingKey?.accessKey || buildNfeAccessKey({
    uf,
    issuedAt: safeIssuedAt,
    cnpj,
    model,
    series,
    number,
    numericCode: cNF,
  });
  const cDV = existingKey?.cDV || accessKey.slice(-1);
  const infNFeId = `NFe${accessKey}`;
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) throw new Error('Documento fiscal sem itens.');
  const items = rawItems.map((item, index) => normalizeNfeItem(item, index, environment, fiscal));

  const rawFreight = payload.freight ?? document.freight ?? payload?.order?.freight;
  const freight = normalizeMoneyValue(rawFreight, 0);
  if (freight > 0 && items.length > 0) {
    const totalSubtotal = items.reduce((sum, it) => sum + normalizeMoneyValue(it.subtotal, 0), 0);
    let allocatedFrete = 0;
    items.forEach((item, idx) => {
      if (idx === items.length - 1) {
        item.vFrete = normalizeMoneyValue(freight - allocatedFrete, 0);
      } else {
        const share = totalSubtotal > 0
          ? normalizeMoneyValue(freight * (normalizeMoneyValue(item.subtotal, 0) / totalSubtotal), 0)
          : 0;
        item.vFrete = share;
        allocatedFrete = normalizeMoneyValue(allocatedFrete + share, 0);
      }
    });
  }

  const totals = calculateNfeTotals(items, fiscal, freight);
  if (totals.vNF <= 0) throw new Error('Total da NFC-e invalido.');

  const qrCodeUrl = documentType === 'nfce'
    ? buildNfceQrCodeUrl({ accessKey, environment, fiscal })
    : '';
  const consumerXml = buildNfeConsumerXml(payload, documentType);
  const additionalInfoXml = buildNfeAdditionalInfoXml(payload, environment);
  const payment = payload.payment && typeof payload.payment === 'object'
    ? payload.payment
    : (order.payment && typeof order.payment === 'object' ? order.payment : {});

  const consumerAddress = payload?.consumer?.address && typeof payload.consumer.address === 'object'
    ? payload.consumer.address
    : {};
  const consumerUf = trimString(consumerAddress.uf, 2).toUpperCase();
  const idDest = (documentType === 'nfe' && consumerUf && consumerUf !== uf) ? '2' : '1';

  const infNFeXml = `
    <infNFe Id="${infNFeId}" versao="${NFE_VERSION}">
      <ide>
        ${xmlTag('cUF', cUf)}
        ${xmlTag('cNF', cNF)}
        ${xmlTag('natOp', nfeText(payload.nature || fiscal.natureOperation || 'Venda de mercadoria', 60))}
        ${xmlTag('mod', model)}
        ${xmlTag('serie', Number.parseInt(series, 10))}
        ${xmlTag('nNF', Number.parseInt(number, 10))}
        ${xmlTag('dhEmi', formatNfeDateTime(safeIssuedAt))}
        <tpNF>1</tpNF>
        <idDest>${idDest}</idDest>
        ${xmlTag('cMunFG', cityCode)}
        <tpImp>${documentType === 'nfce' ? '4' : '1'}</tpImp>
        <tpEmis>1</tpEmis>
        ${xmlTag('cDV', cDV)}
        ${xmlTag('tpAmb', tpAmb)}
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        ${buildNfeIdeConsumerIndicatorsXml(getNfePresenceIndicator(order))}
        <procEmi>0</procEmi>
        <verProc>cardapio-local-1.0.0</verProc>
      </ide>
      <emit>
        ${xmlTag('CNPJ', cnpj)}
        ${xmlTag('xNome', nfeText(issuer.corporateName || fiscal.corporateName || config.storeName || 'Sua Empresa', 60))}
        ${xmlTag('xFant', nfeText(issuer.tradeName || fiscal.tradeName || config.storeName || 'Sua Empresa', 60))}
        <enderEmit>
          ${xmlTag('xLgr', nfeText(issuerAddress.street, 60))}
          ${xmlTag('nro', nfeText(issuerAddress.number, 60))}
          ${xmlTag('xBairro', nfeText(issuerAddress.neighborhood, 60))}
          ${xmlTag('cMun', cityCode)}
          ${xmlTag('xMun', nfeText(issuerAddress.city, 60))}
          ${xmlTag('UF', issuerAddress.uf)}
          ${issuerAddress.cep ? xmlTag('CEP', issuerAddress.cep) : ''}
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
          ${issuerAddress.phone ? xmlTag('fone', issuerAddress.phone) : ''}
        </enderEmit>
        ${xmlTag('IE', nfeText(issuer.ie || fiscal.ie, 14))}
        ${issuer.im || fiscal.im ? xmlTag('IM', nfeText(issuer.im || fiscal.im, 15)) : ''}
        ${xmlTag('CRT', nfeText(issuer.crt || fiscal.crt || '1', 1))}
      </emit>
      ${consumerXml}
      ${buildNfeItemsXml(items, fiscal, idDest)}
      ${buildNfeTotalsXml(totals)}
      <transp><modFrete>${(totals.vFrete || 0) > 0 ? '0' : '9'}</modFrete></transp>
      ${buildNfePaymentXml(payment, totals.vNF)}
      ${additionalInfoXml}
    </infNFe>`;

  const infNFeSuplXml = documentType === 'nfce'
    ? `
      <infNFeSupl>
        <qrCode>${cdata(qrCodeUrl)}</qrCode>
        ${xmlTag('urlChave', getNfceUrlChave(fiscal, environment))}
      </infNFeSupl>`
    : '';

  return {
    accessKey,
    cNF,
    cDV,
    issuedAt: safeIssuedAt.toISOString(),
    environment,
    tpAmb,
    documentType,
    model,
    series: String(Number.parseInt(series, 10)),
    number: String(Number.parseInt(number, 10)),
    total: totals.vNF,
    qrCodeUrl,
    xml: `<NFe xmlns="${NFE_XML_NS}">${infNFeXml}${infNFeSuplXml}</NFe>`,
  };
}

function loadFiscalCertificate(fiscal) {
  const certificatePath = resolveLocalProjectPath(fiscal?.certificatePath);
  if (!certificatePath || !existsSync(certificatePath)) {
    throw new Error('Certificado digital nao encontrado no caminho configurado.');
  }
  const passphrase = String(fiscal?.certificatePassword || '');
  if (!passphrase) throw new Error('Senha do certificado digital nao configurada.');
  const pfxBuffer = readFileSync(certificatePath);
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary'), 'binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certBag = certBags.find((bag) => bag.cert);
  const keyBag = keyBags.find((bag) => bag.key);
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error('Certificado PFX sem chave privada/certificado legivel.');
  }
  return {
    pfxBuffer,
    passphrase,
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
  };
}

function signFiscalXml(unsignedXml, certificate, xpath) {
  const signer = new SignedXml({
    privateKey: certificate.privateKeyPem,
    publicCert: certificate.certPem,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  signer.addReference({
    xpath,
    transforms: [NFE_ENVELOPED_SIGNATURE_TRANSFORM, NFE_CANONICALIZATION_ALGORITHM],
    digestAlgorithm: NFE_SHA1_DIGEST,
  });
  signer.canonicalizationAlgorithm = NFE_CANONICALIZATION_ALGORITHM;
  signer.signatureAlgorithm = NFE_SIGNATURE_ALGORITHM;
  signer.computeSignature(unsignedXml);
  return signer.getSignedXml();
}

function signNfeXml(unsignedXml, certificate) {
  return signFiscalXml(unsignedXml, certificate, "//*[local-name(.)='infNFe']");
}

function buildNfeAuthorizationSoap(signedNfeXml, lotId) {
  return buildCoreNfeAuthorizationSoap(signedNfeXml, lotId, NFE_VERSION);
}

function buildNfeEventSoap(signedEventoXml, lotId) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${NFE_SOAP12_NS}">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NFE_XML_NS}/wsdl/NFeRecepcaoEvento4">
      <envEvento xmlns="${NFE_XML_NS}" versao="1.00">
        <idLote>${xmlEscape(lotId)}</idLote>
        ${signedEventoXml}
      </envEvento>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

function buildNfeInutilizationSoap(signedInutXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${NFE_SOAP12_NS}">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NFE_XML_NS}/wsdl/NFeInutilizacao4">
      ${signedInutXml}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

function postSoap(url, soapBody, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const certificate = options?.certificate || null;
    const action = trimString(options?.action, 240)
      || 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote';
    const requestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      rejectUnauthorized: true,
      timeout: SEFAZ_SOAP_TIMEOUT_MS,
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
        SOAPAction: action,
        'Content-Length': Buffer.byteLength(soapBody, 'utf8'),
      },
    };
    if (certificate?.pfxBuffer) {
      requestOptions.pfx = certificate.pfxBuffer;
      requestOptions.passphrase = certificate.passphrase;
    }
    const request = https.request(requestOptions, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          httpStatus: response.statusCode || 0,
          httpStatusText: response.statusMessage || '',
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Tempo esgotado ao transmitir para a SEFAZ.'));
    });
    request.on('error', reject);
    request.write(soapBody, 'utf8');
    request.end();
  });
}

function postSoapWithCertificate(url, soapBody, certificate) {
  return postSoap(url, soapBody, { certificate });
}

function xmlLocalName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').pop();
}

function findFirstXmlElement(node, localName) {
  if (!node) return null;
  if (node.nodeType === 1 && xmlLocalName(node) === localName) return node;
  for (let index = 0; index < (node.childNodes?.length || 0); index += 1) {
    const found = findFirstXmlElement(node.childNodes[index], localName);
    if (found) return found;
  }
  return null;
}

function childXmlText(node, localName) {
  const child = findFirstXmlElement(node, localName);
  return trimString(child?.textContent || '', 500);
}

function serializeXmlElement(node) {
  if (!node) return '';
  return new XMLSerializer().serializeToString(node);
}

function parseNfeAuthorizationResponse(responseBody) {
  const xml = String(responseBody || '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const retEnvi = findFirstXmlElement(doc, 'retEnviNFe');
  const protNFe = findFirstXmlElement(doc, 'protNFe');
  const infProt = findFirstXmlElement(protNFe, 'infProt');
  const fault = findFirstXmlElement(doc, 'Fault');
  return {
    batch: retEnvi ? {
      cStat: childXmlText(retEnvi, 'cStat'),
      xMotivo: childXmlText(retEnvi, 'xMotivo'),
      dhRecbto: childXmlText(retEnvi, 'dhRecbto'),
      nRec: childXmlText(retEnvi, 'nRec'),
    } : null,
    authorization: infProt ? {
      cStat: childXmlText(infProt, 'cStat'),
      xMotivo: childXmlText(infProt, 'xMotivo'),
      chNFe: childXmlText(infProt, 'chNFe'),
      nProt: childXmlText(infProt, 'nProt'),
      dhRecbto: childXmlText(infProt, 'dhRecbto'),
      protNFeXml: serializeXmlElement(protNFe),
    } : null,
    fault: fault ? trimString(fault.textContent || '', 1000) : '',
    rawXml: xml,
  };
}

function parseNfeStatusServiceResponse(responseBody) {
  const xml = String(responseBody || '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const ret = findFirstXmlElement(doc, 'retConsStatServ');
  const fault = findFirstXmlElement(doc, 'Fault');
  return {
    cStat: ret ? childXmlText(ret, 'cStat') : '',
    xMotivo: ret ? childXmlText(ret, 'xMotivo') : '',
    cUF: ret ? childXmlText(ret, 'cUF') : '',
    tpAmb: ret ? childXmlText(ret, 'tpAmb') : '',
    dhRecbto: ret ? childXmlText(ret, 'dhRecbto') : '',
    tMed: ret ? childXmlText(ret, 'tMed') : '',
    fault: fault ? trimString(fault.textContent || '', 1000) : '',
    rawXml: xml,
  };
}

function parseNfeEventResponse(responseBody) {
  const xml = String(responseBody || '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const retEnvEvento = findFirstXmlElement(doc, 'retEnvEvento');
  const retEvento = findFirstXmlElement(doc, 'retEvento');
  const infEvento = findFirstXmlElement(retEvento, 'infEvento');
  const fault = findFirstXmlElement(doc, 'Fault');
  return {
    batch: retEnvEvento ? {
      cStat: childXmlText(retEnvEvento, 'cStat'),
      xMotivo: childXmlText(retEnvEvento, 'xMotivo'),
    } : null,
    event: infEvento ? {
      cStat: childXmlText(infEvento, 'cStat'),
      xMotivo: childXmlText(infEvento, 'xMotivo'),
      chNFe: childXmlText(infEvento, 'chNFe'),
      tpEvento: childXmlText(infEvento, 'tpEvento'),
      nSeqEvento: childXmlText(infEvento, 'nSeqEvento'),
      nProt: childXmlText(infEvento, 'nProt'),
      dhRegEvento: childXmlText(infEvento, 'dhRegEvento'),
      retEventoXml: serializeXmlElement(retEvento),
    } : null,
    fault: fault ? trimString(fault.textContent || '', 1000) : '',
    rawXml: xml,
  };
}

function parseNfeInutilizationResponse(responseBody) {
  const xml = String(responseBody || '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const retInut = findFirstXmlElement(doc, 'retInutNFe');
  const infInut = findFirstXmlElement(retInut, 'infInut');
  const fault = findFirstXmlElement(doc, 'Fault');
  return {
    inutilization: infInut ? {
      cStat: childXmlText(infInut, 'cStat'),
      xMotivo: childXmlText(infInut, 'xMotivo'),
      nProt: childXmlText(infInut, 'nProt'),
      dhRecbto: childXmlText(infInut, 'dhRecbto'),
      infInutXml: serializeXmlElement(retInut),
    } : null,
    fault: fault ? trimString(fault.textContent || '', 1000) : '',
    rawXml: xml,
  };
}

function buildNfeCancelEventXml(document, fiscal, reason) {
  const environment = normalizeFiscalEnvironment(document.environment || fiscal.environment);
  const tpAmb = environment === 'producao' ? '1' : '2';
  const uf = trimString(fiscal.uf, 2).toUpperCase();
  const cOrgao = getNfeUfCode(uf);
  if (!cOrgao) throw new Error('UF fiscal invalida para cancelamento.');
  const cnpj = onlyDigits(fiscal.cnpj, 14);
  if (cnpj.length !== 14) throw new Error('CNPJ do emitente invalido para cancelamento.');
  const accessKey = onlyDigits(document.accessKey, 44);
  if (accessKey.length !== 44) throw new Error('Chave de acesso invalida para cancelamento.');
  const protocol = trimString(document.protocol, 80);
  if (!protocol) throw new Error('Protocolo de autorizacao obrigatorio para cancelamento.');
  const eventType = '110111';
  const sequence = '1';
  const eventId = `ID${eventType}${accessKey}${sequence.padStart(2, '0')}`;
  return `<evento xmlns="${NFE_XML_NS}" versao="1.00">
  <infEvento Id="${eventId}">
    <cOrgao>${cOrgao}</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${accessKey}</chNFe>
    <dhEvento>${formatNfeDateTime(new Date())}</dhEvento>
    <tpEvento>${eventType}</tpEvento>
    <nSeqEvento>${sequence}</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>Cancelamento</descEvento>
      <nProt>${xmlEscape(protocol)}</nProt>
      <xJust>${xmlEscape(nfeText(reason, 255))}</xJust>
    </detEvento>
  </infEvento>
</evento>`;
}

function buildNfeInutilizationXml({ fiscal, documentType, environment, series, startNumber, endNumber, reason }) {
  const safeEnvironment = normalizeFiscalEnvironment(environment || fiscal.environment);
  const tpAmb = safeEnvironment === 'producao' ? '1' : '2';
  const uf = trimString(fiscal.uf, 2).toUpperCase();
  const cUf = getNfeUfCode(uf);
  if (!cUf) throw new Error('UF fiscal invalida para inutilizacao.');
  const cnpj = onlyDigits(fiscal.cnpj, 14);
  if (cnpj.length !== 14) throw new Error('CNPJ do emitente invalido para inutilizacao.');
  const model = normalizeFiscalDocumentType(documentType, 'nfce') === 'nfe' ? '55' : '65';
  const safeSeries = onlyDigits(series, 3).padStart(3, '0');
  const start = onlyDigits(startNumber, 9).padStart(9, '0');
  const end = onlyDigits(endNumber, 9).padStart(9, '0');
  const year = getDatePartsInTimeZone(new Date(), RECEIPT_TIME_ZONE).year.slice(-2);
  const id = `ID${cUf}${year}${cnpj}${model}${safeSeries}${start}${end}`;
  return `<inutNFe xmlns="${NFE_XML_NS}" versao="${NFE_VERSION}">
  <infInut Id="${id}">
    <tpAmb>${tpAmb}</tpAmb>
    <xServ>INUTILIZAR</xServ>
    <cUF>${cUf}</cUF>
    <ano>${year}</ano>
    <CNPJ>${cnpj}</CNPJ>
    <mod>${model}</mod>
    <serie>${Number.parseInt(safeSeries, 10)}</serie>
    <nNFIni>${Number.parseInt(start, 10)}</nNFIni>
    <nNFFin>${Number.parseInt(end, 10)}</nNFFin>
    <xJust>${xmlEscape(nfeText(reason, 255))}</xJust>
  </infInut>
</inutNFe>`;
}

async function transmitNfeCancelEvent(document, fiscal, reason) {
  const environment = normalizeFiscalEnvironment(document.environment || fiscal.environment);
  const services = getSefazServicesForFiscal(fiscal, environment);
  if (!services.recepcaoEvento) throw new Error('Webservice de eventos SEFAZ nao configurado para esta UF.');
  const certificate = loadFiscalCertificate(fiscal);
  const unsignedXml = buildNfeCancelEventXml(document, fiscal, reason);
  const signedXml = signFiscalXml(unsignedXml, certificate, "//*[local-name(.)='infEvento']");
  const lotId = String(Date.now()).slice(-15).padStart(15, '0');
  const request = {
    environment,
    uf: trimString(fiscal.uf, 2).toUpperCase(),
    service: 'NFeRecepcaoEvento4',
    url: services.recepcaoEvento,
    lotId,
    sentAt: new Date().toISOString(),
  };
  const soapResponse = await postSoap(services.recepcaoEvento, buildNfeEventSoap(signedXml, lotId), {
    certificate,
    action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento',
  });
  const parsed = parseNfeEventResponse(soapResponse.body);
  return {
    request,
    httpStatus: soapResponse.httpStatus,
    httpStatusText: soapResponse.httpStatusText,
    parsed,
    signedXml,
    rawXml: parsed.rawXml,
  };
}

async function transmitNfeInutilizationEvent({ fiscal, documentType, environment, series, startNumber, endNumber, reason }) {
  const safeEnvironment = normalizeFiscalEnvironment(environment || fiscal.environment);
  const services = getSefazServicesForFiscal(fiscal, safeEnvironment);
  if (!services.inutilizacao) throw new Error('Webservice de inutilizacao SEFAZ nao configurado para esta UF.');
  const certificate = loadFiscalCertificate(fiscal);
  const unsignedXml = buildNfeInutilizationXml({
    fiscal,
    documentType,
    environment: safeEnvironment,
    series,
    startNumber,
    endNumber,
    reason,
  });
  const signedXml = signFiscalXml(unsignedXml, certificate, "//*[local-name(.)='infInut']");
  const request = {
    environment: safeEnvironment,
    uf: trimString(fiscal.uf, 2).toUpperCase(),
    service: 'NFeInutilizacao4',
    url: services.inutilizacao,
    sentAt: new Date().toISOString(),
  };
  const soapResponse = await postSoap(services.inutilizacao, buildNfeInutilizationSoap(signedXml), {
    certificate,
    action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF',
  });
  const parsed = parseNfeInutilizationResponse(soapResponse.body);
  return {
    request,
    httpStatus: soapResponse.httpStatus,
    httpStatusText: soapResponse.httpStatusText,
    parsed,
    signedXml,
    rawXml: parsed.rawXml,
  };
}

async function consultFiscalDocumentProtocol(document, fiscal) {
  const environment = normalizeFiscalEnvironment(document.environment || fiscal.environment);
  const services = getSefazServicesForFiscal(fiscal, environment);
  if (!services.consultaProtocolo) {
    throw new Error('Webservice de consulta de protocolo SEFAZ nao configurado para esta UF.');
  }
  const certificate = loadFiscalCertificate(fiscal);
  const accessKey = onlyDigits(document.accessKey, 44);
  const request = {
    environment,
    uf: trimString(fiscal.uf, 2).toUpperCase(),
    service: 'NFeConsultaProtocolo4',
    url: services.consultaProtocolo,
    accessKey,
    sentAt: new Date().toISOString(),
  };
  const soapBody = buildNfeProtocolConsultationSoap({
    accessKey,
    environment,
    version: NFE_VERSION,
  });
  const soapResponse = await postSoap(services.consultaProtocolo, soapBody, {
    certificate,
    action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF',
  });
  return {
    request,
    httpStatus: soapResponse.httpStatus,
    httpStatusText: soapResponse.httpStatusText,
    parsed: parseNfeProtocolConsultationResponse(soapResponse.body),
    receivedAt: new Date().toISOString(),
  };
}

function persistFiscalProtocolReconciliation(document, consultation, { operationToken = '' } = {}) {
  const reconciliation = buildReconciledFiscalDocument(document, consultation, {
    nfeVersion: NFE_VERSION,
    nfeNamespace: NFE_XML_NS,
  });
  if (!reconciliation.reconciled) {
    return {
      reconciled: false,
      code: reconciliation.code,
      document,
      consultation,
    };
  }
  const safeOperationToken = trimString(operationToken, 80);
  const result = db.prepare(`
    UPDATE fiscal_documents
    SET status = 'authorized',
        access_key = ?,
        protocol = ?,
        payload = ?,
        sefaz_response = ?,
        error = '',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (? = '' OR operation_token = ?)
  `).run(
    reconciliation.accessKey,
    reconciliation.protocol,
    JSON.stringify(reconciliation.payload),
    JSON.stringify(reconciliation.sefazResponse),
    document.id,
    safeOperationToken,
    safeOperationToken,
  );
  if (Number(result.changes || 0) !== 1) {
    throw createOrderRequestError(
      'A operacao fiscal perdeu a posse do documento durante a conciliacao.',
      409,
      'FISCAL_OPERATION_OWNERSHIP_LOST',
    );
  }
  checkpointWal('PASSIVE');
  return {
    reconciled: true,
    document: getFiscalDocumentById(document.id),
    consultation,
  };
}

async function reconcileFiscalDocumentProtocol(document, fiscal, options = {}) {
  const consultation = await consultFiscalDocumentProtocol(document, fiscal);
  return persistFiscalProtocolReconciliation(document, consultation, options);
}

async function buildNfePackage(document, fiscal) {
  const payload = document.payload && typeof document.payload === 'object' && !Array.isArray(document.payload)
    ? { ...document.payload }
    : {};
  if (shouldRefreshNfeIssuedAtForRetry(document?.status)) {
    payload.nfe = {
      ...(payload.nfe && typeof payload.nfe === 'object' && !Array.isArray(payload.nfe)
        ? payload.nfe
        : {}),
      issuedAt: new Date().toISOString(),
    };
  }
  const nfeContext = buildUnsignedNfeXml(document, payload, fiscal);
  const certificate = loadFiscalCertificate(fiscal);
  const signedXml = signNfeXml(nfeContext.xml, certificate);
  const qrCodeImageDataUrl = nfeContext.qrCodeUrl
    ? await QRCode.toDataURL(nfeContext.qrCodeUrl, { margin: 1, width: 220 })
    : '';
  const updatedPayload = {
    ...payload,
    nfe: {
      ...(payload.nfe && typeof payload.nfe === 'object' ? payload.nfe : {}),
      accessKey: nfeContext.accessKey,
      cNF: nfeContext.cNF,
      cDV: nfeContext.cDV,
      issuedAt: nfeContext.issuedAt,
      model: nfeContext.model,
      tpAmb: nfeContext.tpAmb,
      qrCodeUrl: nfeContext.qrCodeUrl,
      qrCodeImageDataUrl,
      unsignedXml: nfeContext.xml,
      signedXml,
    },
  };
  return {
    ...nfeContext,
    certificate,
    signedXml,
    qrCodeImageDataUrl,
    payload: updatedPayload,
  };
}

function getFiscalConfig() {
  const state = readState();
  return state.fiscal && typeof state.fiscal === 'object' && !Array.isArray(state.fiscal)
    ? state.fiscal
    : {};
}

function getCashierPermissions(fiscal = getFiscalConfig()) {
  const raw = fiscal?.cashierPermissions && typeof fiscal.cashierPermissions === 'object' && !Array.isArray(fiscal.cashierPermissions)
    ? fiscal.cashierPermissions
    : {};
  return {
    operatorLockEnabled: Boolean(raw.operatorLockEnabled),
    managerPin: trimString(raw.managerPin, 80),
    requireManagerForRefund: raw.requireManagerForRefund !== false,
    requireManagerForFiscalConfig: raw.requireManagerForFiscalConfig !== false,
    requireManagerForFiscalTransmit: raw.requireManagerForFiscalTransmit !== false,
    requireManagerForFiscalEvents: raw.requireManagerForFiscalEvents !== false,
    requireManagerForClose: Boolean(raw.requireManagerForClose),
  };
}

function cashierActionRequiresManager(action, fiscal = getFiscalConfig()) {
  const permissions = getCashierPermissions(fiscal);
  if (!permissions.operatorLockEnabled) return false;
  if (action === 'refund') return permissions.requireManagerForRefund;
  if (action === 'fiscal-config') return permissions.requireManagerForFiscalConfig;
  if (action === 'fiscal-transmit') return permissions.requireManagerForFiscalTransmit;
  if (action === 'fiscal-event') return permissions.requireManagerForFiscalEvents;
  if (action === 'cash-close') return permissions.requireManagerForClose;
  return false;
}

function getManagerPinFromPayload(rawPayload = {}) {
  return trimString(
    rawPayload?.managerPin
    || rawPayload?._managerPin
    || rawPayload?.authorizationPin
    || rawPayload?.pin,
    80,
  );
}

function authorizeManagerAction(action, rawPayload = {}, fiscal = getFiscalConfig()) {
  if (!cashierActionRequiresManager(action, fiscal)) return { ok: true };
  const permissions = getCashierPermissions(fiscal);
  if (!permissions.managerPin) {
    return {
      ok: false,
      error: 'PIN do gerente nao configurado.',
      statusCode: 409,
    };
  }
  const receivedPin = getManagerPinFromPayload(rawPayload);
  if (!verifyManagerPin(permissions.managerPin, receivedPin)) {
    return {
      ok: false,
      error: 'PIN do gerente invalido para esta acao.',
      statusCode: 403,
    };
  }
  return { ok: true };
}

function stripControlFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const next = { ...value };
  delete next._managerPin;
  delete next.managerPinForAction;
  delete next.authorizationPin;
  return next;
}

function prepareFiscalConfigForStorage(value) {
  const clean = stripControlFields(value);
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) return clean;
  const currentFiscal = getFiscalConfig();
  const environment = normalizeFiscalEnvironment(clean.environment);
  const currentEnvironmentConfig = getFiscalEnvironmentConfig(currentFiscal, environment);
  const incomingEnvironments = clean.environments
    && typeof clean.environments === 'object'
    && !Array.isArray(clean.environments)
    ? clean.environments
    : {};
  const currentEnvironments = currentFiscal.environments
    && typeof currentFiscal.environments === 'object'
    && !Array.isArray(currentFiscal.environments)
    ? currentFiscal.environments
    : {};
  const mergedEnvironments = {};
  const environmentNames = new Set([
    ...Object.keys(currentEnvironments),
    ...Object.keys(incomingEnvironments),
    'homologacao',
    'producao',
  ]);
  for (const environmentName of environmentNames) {
    const currentConfig = currentEnvironments[environmentName]
      && typeof currentEnvironments[environmentName] === 'object'
      && !Array.isArray(currentEnvironments[environmentName])
      ? currentEnvironments[environmentName]
      : {};
    const incomingConfig = incomingEnvironments[environmentName]
      && typeof incomingEnvironments[environmentName] === 'object'
      && !Array.isArray(incomingEnvironments[environmentName])
      ? incomingEnvironments[environmentName]
      : {};
    const submittedCsc = trimString(incomingConfig.csc, 200);
    mergedEnvironments[environmentName] = {
      ...currentConfig,
      ...incomingConfig,
      csc: submittedCsc || trimString(currentConfig.csc, 200),
    };
    delete mergedEnvironments[environmentName].cscConfigured;
  }
  clean.environments = mergedEnvironments;
  clean.certificatePassword = String(clean.certificatePassword || '')
    || String(currentFiscal.certificatePassword || '');
  delete clean.certificatePasswordConfigured;
  delete clean.cscConfigured;

  const currentPermissions = currentFiscal.cashierPermissions
    && typeof currentFiscal.cashierPermissions === 'object'
    && !Array.isArray(currentFiscal.cashierPermissions)
    ? currentFiscal.cashierPermissions
    : {};
  const incomingPermissions = clean.cashierPermissions
    && typeof clean.cashierPermissions === 'object'
    && !Array.isArray(clean.cashierPermissions)
    ? clean.cashierPermissions
    : {};
  const submittedManagerPin = trimString(incomingPermissions.managerPin, 80);
  if (submittedManagerPin && !/^\d{4,12}$/.test(submittedManagerPin)) {
    const error = new Error('PIN do gerente deve conter de 4 a 12 digitos numericos.');
    error.statusCode = 400;
    throw error;
  }
  const operatorLock = Boolean(incomingPermissions.operatorLockEnabled);
  const currentPinConfigured = Boolean(String(currentPermissions.managerPin || '').trim());
  if (operatorLock && !submittedManagerPin && !currentPinConfigured) {
    const error = new Error('Configure um PIN do gerente antes de ativar o bloqueio do operador.');
    error.statusCode = 400;
    throw error;
  }
  clean.cashierPermissions = {
    ...currentPermissions,
    ...incomingPermissions,
    managerPin: submittedManagerPin
      ? hashManagerPin(submittedManagerPin)
      : String(currentPermissions.managerPin || ''),
  };
  delete clean.cashierPermissions.managerPinConfigured;

  const submittedEnvironmentConfig = getFiscalEnvironmentConfig(clean, environment);
  const submittedCsc = trimString(clean.csc, 200)
    || trimString(submittedEnvironmentConfig.csc, 200);
  const effectiveCsc = submittedCsc || trimString(currentEnvironmentConfig.csc, 200);
  const numberingConfirmed = environment === 'homologacao'
    ? true
    : Boolean(
      Object.hasOwn(clean, 'productionNumberingConfirmed')
        ? clean.productionNumberingConfirmed
        : currentEnvironmentConfig.numberingConfirmed,
    );
  const next = updateFiscalEnvironmentConfig(clean, environment, {
    cscId: trimString(clean.cscId, 20),
    csc: effectiveCsc,
    seriesNfce: onlyDigits(clean.seriesNfce, 3) || '1',
    nextNumberNfce: onlyDigits(clean.nextNumberNfce, 9),
    seriesNfe: onlyDigits(clean.seriesNfe, 3) || '1',
    nextNumberNfe: onlyDigits(clean.nextNumberNfe, 9),
    numberingConfirmed,
  });
  return {
    ...next,
    productionNumberingConfirmed: environment === 'producao' && numberingConfirmed,
  };
}

function buildFiscalStatus(overrides = {}) {
  const state = readState();
  const fiscal = overrides?.fiscal && typeof overrides.fiscal === 'object'
    ? overrides.fiscal
    : (state.fiscal && typeof state.fiscal === 'object' && !Array.isArray(state.fiscal) ? state.fiscal : {});
  const issuerAddress = getFiscalIssuerAddress(fiscal, state.config || {});
  const documentType = normalizeFiscalDocumentType(overrides?.documentType || fiscal.documentType, 'nfce');
  const environment = normalizeFiscalEnvironment(overrides?.environment || fiscal.environment);
  const environmentConfig = getFiscalEnvironmentConfig(fiscal, environment);
  const series = documentType === 'nfe'
    ? environmentConfig.seriesNfe
    : environmentConfig.seriesNfce;
  const nextNumber = documentType === 'nfe'
    ? environmentConfig.nextNumberNfe
    : environmentConfig.nextNumberNfce;
  const requirements = [
    { key: 'cnpj', label: 'CNPJ do emitente', ok: onlyDigits(fiscal.cnpj, 14).length === 14 },
    { key: 'ie', label: 'Inscricao estadual', ok: trimString(fiscal.ie, 30).length > 0 },
    { key: 'uf', label: 'UF da empresa', ok: /^[A-Z]{2}$/.test(trimString(fiscal.uf, 2).toUpperCase()) },
    { key: 'cityCode', label: 'Codigo IBGE do municipio', ok: onlyDigits(fiscal.cityCode, 7).length === 7 },
    { key: 'address', label: 'Endereco fiscal', ok: Boolean(
      issuerAddress.street
      && issuerAddress.number
      && issuerAddress.neighborhood
      && issuerAddress.city
      && issuerAddress.uf
      && issuerAddress.cep.length === 8,
    ) },
    { key: 'crt', label: 'Regime tributario CRT', ok: ['1', '2', '3', '4'].includes(trimString(fiscal.crt, 2)) },
    { key: 'serie', label: `Serie fiscal (${environment})`, ok: trimString(series, 20).length > 0 },
    { key: 'number', label: `Proximo numero (${environment})`, ok: Number.parseInt(String(nextNumber || ''), 10) > 0 },
    {
      key: 'numberingConfirmed',
      label: 'Numeracao de producao confirmada',
      ok: environment !== 'producao' || environmentConfig.numberingConfirmed,
    },
    { key: 'certificate', label: 'Certificado A1/A3', ok: trimString(fiscal.certificatePath, 500).length > 0 },
    { key: 'certificatePassword', label: 'Senha do certificado', ok: trimString(fiscal.certificatePassword, 500).length > 0 },
  ];
  if (documentType === 'nfce') {
    requirements.push(
      { key: 'cscId', label: `ID do CSC (${environment})`, ok: trimString(environmentConfig.cscId, 20).length > 0 },
      { key: 'csc', label: `CSC da NFC-e (${environment})`, ok: trimString(environmentConfig.csc, 180).length > 0 },
    );
  }

  const readyForDraft = requirements
    .filter((item) => !['certificate', 'certificatePassword', 'cscId', 'csc'].includes(item.key))
    .every((item) => item.ok);
  const configuredForSefaz = requirements.every((item) => item.ok);
  const transmissionEnabled = Boolean(fiscal.enabled) && Boolean(fiscal.transmitEnabled);
  const readyForSefaz = configuredForSefaz && transmissionEnabled;

  return {
    ok: true,
    mode: configuredForSefaz ? (transmissionEnabled ? 'sefaz-ready' : 'sefaz-locked') : 'prevalidation-only',
    documentType,
    environment,
    environmentConfig: {
      seriesNfce: environmentConfig.seriesNfce,
      nextNumberNfce: environmentConfig.nextNumberNfce,
      seriesNfe: environmentConfig.seriesNfe,
      nextNumberNfe: environmentConfig.nextNumberNfe,
      numberingConfirmed: environmentConfig.numberingConfirmed,
      cscConfigured: Boolean(environmentConfig.cscId && environmentConfig.csc),
    },
    enabled: Boolean(fiscal.enabled),
    readyForDraft,
    readyForSefaz,
    configuredForSefaz,
    transmissionEnabled,
    offlinePreValidation: fiscal.offlinePreValidation !== false,
    contingency: fiscal.contingency && typeof fiscal.contingency === 'object' && !Array.isArray(fiscal.contingency)
      ? {
        enabled: Boolean(fiscal.contingency.enabled),
        mode: trimString(fiscal.contingency.mode, 40) || 'offline',
        reason: trimString(fiscal.contingency.reason, 500),
        startedAt: trimString(fiscal.contingency.startedAt, 80),
      }
      : { enabled: false, mode: 'offline', reason: '', startedAt: '' },
    cashierPermissions: {
      ...getCashierPermissions(fiscal),
      managerPinConfigured: Boolean(getCashierPermissions(fiscal).managerPin),
      managerPin: '',
    },
    requirements,
    message: readyForSefaz
      ? 'Conector SEFAZ configurado para transmissao em homologacao/producao conforme o ambiente selecionado.'
      : configuredForSefaz
        ? 'Conector SEFAZ configurado, mas a transmissao esta bloqueada ate liberar no admin.'
        : 'Pre-validacao local disponivel. Complete certificado, CSC e dados fiscais para transmitir e autorizar na SEFAZ.',
  };
}

async function buildSefazServiceStatus() {
  const fiscal = getFiscalConfig();
  const fiscalStatus = buildFiscalStatus();
  const environment = normalizeFiscalEnvironment(fiscal.environment);
  const configuredUrl = normalizeHttpUrl(fiscal.sefazStatusUrl);
  let serviceUrl = '';
  let connectorBuiltin = false;
  try {
    const services = getSefazServicesForFiscal(fiscal, environment);
    serviceUrl = normalizeHttpUrl(services.statusServico);
    connectorBuiltin = Boolean(services.builtin);
  } catch {
    serviceUrl = '';
  }
  const url = serviceUrl || configuredUrl || getDefaultSefazStatusUrl(fiscal, environment);
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const offlinePreValidation = fiscal.offlinePreValidation !== false;
  const base = {
    ok: true,
    provider: 'SEFAZ',
    uf: trimString(fiscal.uf, 2).toUpperCase(),
    environment,
    url,
    configuredUrl: Boolean(configuredUrl),
    connectorBuiltin,
    checkMode: serviceUrl ? 'soap-status-service' : 'http-fallback',
    checkedAt,
    timeoutMs: SEFAZ_STATUS_TIMEOUT_MS,
    offlinePreValidation,
    canPreValidate: Boolean(fiscalStatus.readyForDraft && offlinePreValidation),
  };

  try {
    if (serviceUrl) {
      const certificate = loadFiscalCertificate(fiscal);
      const soapBody = buildNfeStatusServiceSoap({
        uf: fiscal.uf,
        environment,
        version: NFE_VERSION,
      });
      const response = await postSoap(serviceUrl, soapBody, {
        action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF',
        certificate,
      });
      const latencyMs = Date.now() - startedAt;
      const parsed = parseNfeStatusServiceResponse(response.body);
      const cStat = String(parsed.cStat || '');
      const reachable = response.httpStatus > 0 && response.httpStatus < 500 && ['107', '108', '109'].includes(cStat);
      const status = cStat === '107' ? 'online' : reachable ? 'unstable' : 'offline';
      const emissionMode = status === 'online' ? 'online' : (base.canPreValidate ? 'prevalidated' : 'blocked');
      return {
        ...base,
        reachable,
        status,
        emissionMode,
        latencyMs,
        httpStatus: response.httpStatus,
        httpStatusText: response.httpStatusText || '',
        sefazStatus: {
          cStat,
          xMotivo: parsed.xMotivo,
          cUF: parsed.cUF,
          tpAmb: parsed.tpAmb,
          dhRecbto: parsed.dhRecbto,
          tMed: parsed.tMed,
        },
        message: parsed.xMotivo
          ? `SEFAZ: ${parsed.xMotivo}`
          : (reachable ? 'SEFAZ respondeu ao webservice de status.' : 'SEFAZ nao retornou status operacional esperado.'),
      };
    }

    const response = await fetchSefazStatusUrl(url);
    const latencyMs = Date.now() - startedAt;
    const reachable = response.status > 0 && response.status < 500;
    const status = reachable ? 'online' : 'unstable';
    const emissionMode = reachable ? 'online' : (base.canPreValidate ? 'prevalidated' : 'blocked');
    return {
      ...base,
      reachable,
      status,
      emissionMode,
      latencyMs,
      httpStatus: response.status,
      httpStatusText: response.statusText || '',
      message: reachable
        ? 'SEFAZ acessivel a partir deste servidor.'
        : 'SEFAZ respondeu com instabilidade. Use pre-validacao local e transmita depois.',
    };
  } catch (error) {
    const isTimeout = String(error?.name || '') === 'AbortError';
    const emissionMode = base.canPreValidate ? 'prevalidated' : 'blocked';
    return {
      ...base,
      reachable: false,
      status: isTimeout ? 'timeout' : 'offline',
      emissionMode,
      latencyMs: Date.now() - startedAt,
      httpStatus: 0,
      httpStatusText: '',
      message: base.canPreValidate
        ? 'Sem alcance da SEFAZ ou internet. Crie nota pre-validada local e transmita quando voltar.'
        : 'Sem alcance da SEFAZ ou internet. Complete a configuracao fiscal antes de pre-validar notas.',
      error: trimString(error?.message || String(error), 240),
    };
  }
}

function parseFiscalDocumentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId ?? row.order_id ?? null,
    documentType: String(row.documentType || row.document_type || 'nfce'),
    status: String(row.status || 'draft'),
    environment: String(row.environment || 'homologacao'),
    accessKey: String(row.accessKey || row.access_key || ''),
    protocol: String(row.protocol || ''),
    number: String(row.number || ''),
    series: String(row.series || ''),
    total: normalizeMoneyValue(row.total, 0),
    customerName: String(row.customerName || row.customer_name || ''),
    payload: parseJsonObject(row.payload, {}),
    sefazResponse: parseJsonObject(row.sefazResponse || row.sefaz_response, {}),
    error: String(row.error || ''),
    createdAt: String(row.createdAt || row.created_at || ''),
    updatedAt: String(row.updatedAt || row.updated_at || ''),
  };
}

function parseFiscalEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.documentId ?? row.document_id ?? null,
    eventType: String(row.eventType || row.event_type || ''),
    status: String(row.status || 'pending'),
    environment: String(row.environment || 'homologacao'),
    accessKey: String(row.accessKey || row.access_key || ''),
    protocol: String(row.protocol || ''),
    number: String(row.number || ''),
    series: String(row.series || ''),
    reason: String(row.reason || ''),
    payload: parseJsonObject(row.payload, {}),
    sefazResponse: parseJsonObject(row.sefazResponse || row.sefaz_response, {}),
    error: String(row.error || ''),
    createdAt: String(row.createdAt || row.created_at || ''),
    updatedAt: String(row.updatedAt || row.updated_at || ''),
  };
}

function getFiscalEventById(eventId) {
  const safeEventId = Number.parseInt(String(eventId || ''), 10);
  if (!Number.isFinite(safeEventId) || safeEventId <= 0) return null;
  return parseFiscalEventRow(db.prepare(`
    SELECT
      id,
      document_id AS documentId,
      event_type AS eventType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      reason,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_events
    WHERE id = ?
    LIMIT 1
  `).get(safeEventId));
}

function listFiscalDocuments(limit = 80) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || '80'), 10) || 80, 500));
  const rows = db.prepare(`
    SELECT
      id,
      order_id AS orderId,
      document_type AS documentType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      total,
      customer_name AS customerName,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_documents
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map((row) => parseFiscalDocumentRow(row));
}

function getFiscalDocumentStats() {
  const row = db.prepare('SELECT COUNT(*) AS totalCount FROM fiscal_documents').get();
  return { totalCount: Math.max(0, Number(row?.totalCount || 0)) };
}

function listFiscalEvents(limit = 80) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || '80'), 10) || 80, 500));
  const rows = db.prepare(`
    SELECT
      id,
      document_id AS documentId,
      event_type AS eventType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      reason,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_events
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map((row) => parseFiscalEventRow(row));
}

function getFiscalDocumentById(documentId) {
  const safeDocumentId = Number.parseInt(String(documentId || ''), 10);
  if (!Number.isFinite(safeDocumentId) || safeDocumentId <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      order_id AS orderId,
      document_type AS documentType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      total,
      customer_name AS customerName,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_documents
    WHERE id = ?
    LIMIT 1
  `).get(safeDocumentId);
  return parseFiscalDocumentRow(row);
}

function acquireFiscalDocumentOperation(documentId, operationType) {
  const safeDocumentId = Number.parseInt(String(documentId || ''), 10);
  const safeOperationType = trimString(operationType, 40);
  if (!Number.isFinite(safeDocumentId) || safeDocumentId <= 0 || !safeOperationType) {
    return { error: 'Operacao fiscal invalida.', statusCode: 400, code: 'FISCAL_OPERATION_INVALID' };
  }

  const token = randomUUID();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - FISCAL_OPERATION_STALE_MS).toISOString();
  const result = db.prepare(`
    UPDATE fiscal_documents
    SET operation_token = ?, operation_type = ?, operation_started_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (
        COALESCE(TRIM(operation_token), '') = ''
        OR operation_started_at IS NULL
        OR julianday(operation_started_at) <= julianday(?)
      )
  `).run(token, safeOperationType, now.toISOString(), safeDocumentId, staleBefore);
  if (Number(result.changes || 0) !== 1) {
    const active = db.prepare(`
      SELECT operation_type AS operationType, operation_started_at AS operationStartedAt
      FROM fiscal_documents
      WHERE id = ?
      LIMIT 1
    `).get(safeDocumentId);
    return {
      error: 'Outra operacao fiscal ja esta em andamento para este documento.',
      statusCode: 409,
      code: 'FISCAL_OPERATION_IN_PROGRESS',
      operationType: trimString(active?.operationType, 40),
      operationStartedAt: trimString(active?.operationStartedAt, 80),
    };
  }
  return { token, document: getFiscalDocumentById(safeDocumentId) };
}

function releaseFiscalDocumentOperation(documentId, token) {
  const safeDocumentId = Number.parseInt(String(documentId || ''), 10);
  const safeToken = trimString(token, 80);
  if (!Number.isFinite(safeDocumentId) || safeDocumentId <= 0 || !safeToken) return false;
  const result = db.prepare(`
    UPDATE fiscal_documents
    SET operation_token = '', operation_type = '', operation_started_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND operation_token = ?
  `).run(safeDocumentId, safeToken);
  return Number(result.changes || 0) === 1;
}

function fiscalDocumentOperationIsOwned(documentId, token) {
  const row = db.prepare(`
    SELECT 1
    FROM fiscal_documents
    WHERE id = ? AND operation_token = ?
    LIMIT 1
  `).get(Number(documentId), trimString(token, 80));
  return Boolean(row);
}

function buildFiscalOperationOwnershipError(documentId, message = '') {
  return {
    error: trimString(message, 500) || 'A operacao fiscal perdeu a posse do documento antes de concluir.',
    statusCode: 409,
    code: 'FISCAL_OPERATION_OWNERSHIP_LOST',
    document: getFiscalDocumentById(documentId),
  };
}

function insertFiscalEvent({
  documentId = null,
  eventType,
  status = 'pending',
  environment = 'homologacao',
  accessKey = '',
  protocol = '',
  number = '',
  series = '',
  reason = '',
  payload = {},
  sefazResponse = {},
  error = '',
}) {
  const result = db.prepare(`
    INSERT INTO fiscal_events (
      document_id,
      event_type,
      status,
      environment,
      access_key,
      protocol,
      number,
      series,
      reason,
      payload,
      sefaz_response,
      error,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    Number.isFinite(Number(documentId)) && Number(documentId) > 0 ? Number(documentId) : null,
    trimString(eventType, 40),
    trimString(status, 40) || 'pending',
    normalizeFiscalEnvironment(environment),
    trimString(accessKey, 80),
    trimString(protocol, 80),
    trimString(number, 20),
    trimString(series, 20),
    trimString(reason, 500),
    JSON.stringify(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    JSON.stringify(sefazResponse && typeof sefazResponse === 'object' && !Array.isArray(sefazResponse) ? sefazResponse : {}),
    trimString(error, 500),
  );
  return parseFiscalEventRow(db.prepare(`
    SELECT
      id,
      document_id AS documentId,
      event_type AS eventType,
      status,
      environment,
      access_key AS accessKey,
      protocol,
      number,
      series,
      reason,
      payload,
      sefaz_response AS sefazResponse,
      error,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fiscal_events
    WHERE id = ?
    LIMIT 1
  `).get(Number(result.lastInsertRowid)));
}

function fiscalValue(rawValue, fallbackValue, maxLength = 80) {
  const raw = trimString(rawValue, maxLength);
  if (raw) return raw;
  return trimString(fallbackValue, maxLength);
}

function appendFiscalBorderDescription(baseName, borderLabel) {
  const cleanName = trimString(baseName, 120) || 'Pizza';
  const cleanBorder = trimString(borderLabel, 80);
  if (!cleanBorder) return cleanName;
  const suffix = ` - Borda: ${cleanBorder}`;
  if (suffix.length >= 120) return trimString(suffix.slice(3), 120);
  return `${cleanName.slice(0, 120 - suffix.length).trim()}${suffix}`;
}

function buildFiscalDeliveryItem({ delivery, fiscal, defaults, itemNumber }) {
  const rawDeliveryFiscal = fiscal?.deliveryFiscal && typeof fiscal.deliveryFiscal === 'object'
    && !Array.isArray(fiscal.deliveryFiscal)
    ? fiscal.deliveryFiscal
    : {};
  const unit = fiscalValue(rawDeliveryFiscal.unit, defaults.unit, 6).toUpperCase();
  const tributaryFactor = normalizeOptionalFactor(rawDeliveryFiscal.tributaryFactor ?? rawDeliveryFiscal.tribFactor) || 1;

  return {
    itemNumber,
    productId: 'delivery-fee',
    displayName: fiscalValue(rawDeliveryFiscal.name, 'Taxa de entrega', 120),
    name: fiscalValue(rawDeliveryFiscal.fiscalName || rawDeliveryFiscal.name, 'Taxa de entrega', 120),
    productCode: fiscalValue(rawDeliveryFiscal.fiscalCode || rawDeliveryFiscal.code, 'ENTREGA', 60),
    barcode: onlyDigits(rawDeliveryFiscal.barcode || rawDeliveryFiscal.gtin || rawDeliveryFiscal.ean, 14),
    ncm: onlyDigits(rawDeliveryFiscal.ncm || defaults.ncm, 8) || defaults.ncm,
    cest: onlyDigits(rawDeliveryFiscal.cest || defaults.cest, 7),
    benefitCode: fiscalValue(rawDeliveryFiscal.benefitCode || rawDeliveryFiscal.cBenef, '', 10),
    cfop: onlyDigits(rawDeliveryFiscal.cfop || defaults.cfop, 4) || defaults.cfop,
    csosn: fiscalValue(rawDeliveryFiscal.csosn, defaults.csosn, 4),
    cst: fiscalValue(rawDeliveryFiscal.cst, '', 4),
    origin: fiscalValue(rawDeliveryFiscal.origin, defaults.origin, 1),
    unit,
    tributaryUnit: fiscalValue(rawDeliveryFiscal.tributaryUnit || rawDeliveryFiscal.tribUnit, unit, 6).toUpperCase(),
    tributaryFactor,
    quantity: 1,
    unitPrice: delivery,
    subtotal: delivery,
    aliquotaIcms: normalizeMoneyValue(rawDeliveryFiscal.aliquotaIcms ?? defaults.aliquotaIcms, 0),
    vBCSTRet: rawDeliveryFiscal.vBCSTRet,
    pST: rawDeliveryFiscal.pST,
    vICMSSubstituto: rawDeliveryFiscal.vICMSSubstituto,
    vICMSSTRet: rawDeliveryFiscal.vICMSSTRet,
    vBCFCPSTRet: rawDeliveryFiscal.vBCFCPSTRet,
    pFCPSTRet: rawDeliveryFiscal.pFCPSTRet,
    vFCPSTRet: rawDeliveryFiscal.vFCPSTRet,
    pRedBCEfet: rawDeliveryFiscal.pRedBCEfet,
    vBCEfet: rawDeliveryFiscal.vBCEfet,
    pICMSEfet: rawDeliveryFiscal.pICMSEfet,
    vICMSEfet: rawDeliveryFiscal.vICMSEfet,
    pisCst: normalizeNfeTaxCst(rawDeliveryFiscal.pisCst, '49'),
    pisAliquota: normalizeOptionalRate(rawDeliveryFiscal.pisAliquota),
    cofinsCst: normalizeNfeTaxCst(rawDeliveryFiscal.cofinsCst, '49'),
    cofinsAliquota: normalizeOptionalRate(rawDeliveryFiscal.cofinsAliquota),
    fiscalReviewRequired: rawDeliveryFiscal.fiscalReviewRequired === true,
    fiscalEmissionBlocked: rawDeliveryFiscal.fiscalEmissionBlocked === true,
  };
}

function buildCanonicalFiscalProductProfile(product, fiscal, defaults, fallbackCode) {
  const unit = fiscalValue(product?.unit, defaults.unit, 6).toUpperCase();
  const tributaryFactor = normalizeOptionalFactor(product?.tributaryFactor ?? product?.tribFactor) || 1;
  return {
    displayName: trimString(product?.name || 'Item', 140),
    fiscalName: fiscalValue(product?.fiscalName, product?.name || 'Item', 120),
    productCode: fiscalValue(
      product?.fiscalCode || product?.sku,
      product?.id || fallbackCode,
      60,
    ),
    barcode: onlyDigits(product?.barcode || product?.gtin || product?.ean, 14),
    ncm: onlyDigits(product?.ncm || fiscal.defaultNcm || defaults.ncm, 8) || defaults.ncm,
    cest: onlyDigits(product?.cest || fiscal.defaultCest || defaults.cest, 7),
    benefitCode: fiscalValue(product?.benefitCode || product?.cBenef, '', 10),
    cfop: onlyDigits(product?.cfop || defaults.cfop, 4) || defaults.cfop,
    csosn: fiscalValue(product?.csosn, defaults.csosn, 4),
    cst: fiscalValue(product?.cst, '', 4),
    origin: fiscalValue(product?.origin, defaults.origin, 1),
    unit,
    tributaryUnit: fiscalValue(
      product?.tributaryUnit || product?.tribUnit,
      unit,
      6,
    ).toUpperCase(),
    tributaryFactor,
    aliquotaIcms: normalizeMoneyValue(
      product?.aliquotaIcms ?? fiscal.defaultAliquotaIcms,
      0,
    ),
    vBCSTRet: product?.vBCSTRet,
    pST: product?.pST,
    vICMSSubstituto: product?.vICMSSubstituto,
    vICMSSTRet: product?.vICMSSTRet,
    vBCFCPSTRet: product?.vBCFCPSTRet,
    pFCPSTRet: product?.pFCPSTRet,
    vFCPSTRet: product?.vFCPSTRet,
    pRedBCEfet: product?.pRedBCEfet,
    vBCEfet: product?.vBCEfet,
    pICMSEfet: product?.pICMSEfet,
    vICMSEfet: product?.vICMSEfet,
    pisCst: normalizeNfeTaxCst(product?.pisCst, '49'),
    pisAliquota: normalizeOptionalRate(product?.pisAliquota),
    cofinsCst: normalizeNfeTaxCst(product?.cofinsCst, '49'),
    cofinsAliquota: normalizeOptionalRate(product?.cofinsAliquota),
    fiscalReviewRequired: product?.fiscalReviewRequired === true,
    fiscalEmissionBlocked: product?.fiscalEmissionBlocked === true,
  };
}

function fiscalCatalogError(message) {
  const error = new Error(message);
  error.code = 'FISCAL_CATALOG_INVALID';
  error.statusCode = 409;
  return error;
}

function describeIncompatibleFiscalFields(fields = []) {
  const labels = {
    ncm: 'NCM',
    cest: 'CEST',
    benefitCode: 'cBenef',
    cfop: 'CFOP',
    csosn: 'CSOSN',
    cst: 'CST',
    origin: 'origem',
    unit: 'unidade',
    tributaryUnit: 'unidade tributavel',
    tributaryFactor: 'fator tributavel',
    aliquotaIcms: 'aliquota ICMS',
    pisCst: 'CST PIS',
    pisAliquota: 'aliquota PIS',
    cofinsCst: 'CST COFINS',
    cofinsAliquota: 'aliquota COFINS',
    fiscalReviewRequired: 'status de revisao fiscal',
    fiscalEmissionBlocked: 'bloqueio de emissao fiscal',
  };
  return fields.map((field) => labels[field] || field).join(', ');
}

function buildFiscalDraftPayload(orderLog, fiscal, documentType, options = {}) {
  const state = readState();
  const environment = normalizeFiscalEnvironment(fiscal.environment);
  const items = Array.isArray(orderLog?.items) ? orderLog.items : [];
  const payment = options?.payment && typeof options.payment === 'object' && !Array.isArray(options.payment)
    ? options.payment
    : (orderLog.payment || {});
  const rawConsumer = options?.consumer && typeof options.consumer === 'object' ? options.consumer : {};
  const consumerDocument = onlyDigits(rawConsumer.document || options?.consumerDocument || orderLog.customerDocument, 14);

  const defaultCfop = fiscalValue(fiscal.defaultCfop, documentType === 'nfe' ? '5102' : '5102', 8);
  const defaultNcm = onlyDigits(fiscal.defaultNcm || '21069090', 8) || '21069090';
  const defaultCsosn = fiscalValue(fiscal.defaultCsosn, '102', 4);
  const defaultOrigin = fiscalValue(fiscal.defaultOrigin, '0', 1);
  const defaultUnit = fiscalValue(fiscal.defaultUnit, 'UN', 6).toUpperCase();
  const issuerAddress = getFiscalIssuerAddress(fiscal, state.config || {});

  const defaults = {
    cfop: defaultCfop,
    ncm: defaultNcm,
    cest: onlyDigits(fiscal.defaultCest || '', 7),
    csosn: defaultCsosn,
    origin: defaultOrigin,
    unit: defaultUnit,
    aliquotaIcms: normalizeMoneyValue(fiscal.defaultAliquotaIcms, 0),
  };
  const fiscalItems = items.map((item, index) => {
    const source = resolveFiscalCatalogSource(item, state);
    if (source.error) {
      throw fiscalCatalogError(
        `Nao foi possivel montar o item fiscal ${index + 1}: ${source.error}`,
      );
    }
    for (const product of source.products) {
      const validation = validateExplicitFiscalProductProfile(product, {
        crt: fiscal?.crt,
        environment,
      });
      if (!validation.ok) {
        const productLabel = trimString(product?.name || product?.id, 130) || `item ${index + 1}`;
        throw fiscalCatalogError(
          `Perfil fiscal de "${productLabel}" incompleto ou nao liberado: ${validation.errors.join(' ')}`,
        );
      }
    }
    const profiles = source.products.map((product, productIndex) => (
      buildCanonicalFiscalProductProfile(
        product,
        fiscal,
        defaults,
        `${index + 1}-${productIndex + 1}`,
      )
    ));
    if (source.kind === 'combo') {
      throw fiscalCatalogError(
        `O combo "${trimString(source.product?.name || source.productId, 130)}" precisa ter seus componentes `
        + 'fiscais separados antes da emissao. Cadastre os itens do combo por NCM/CFOP/tributacao.',
      );
    }
    if (source.kind === 'half') {
      const compatibility = compareFiscalTaxProfiles(profiles);
      if (!compatibility.compatible) {
        const fields = describeIncompatibleFiscalFields(compatibility.incompatibleFields);
        throw fiscalCatalogError(
          `Pizza meio a meio "${buildCanonicalHalfPizzaName(source.firstProduct, source.secondProduct)}" `
          + `possui tributacao fiscal diferente entre os sabores (${fields}). `
          + 'Ajuste os produtos para a mesma tributacao ou emita os sabores separadamente.',
        );
      }
    }

    const profile = profiles[0];
    const quantity = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
    const unitPrice = normalizeMoneyValue(item?.unitPrice ?? item?.price, 0);
    const subtotal = normalizeMoneyValue(unitPrice * quantity, 0);
    const borderLabel = trimString(item?.borderLabel || item?.borderSelection?.label, 80);
    const canonicalDisplayName = source.kind === 'half'
      ? buildCanonicalHalfPizzaName(source.firstProduct, source.secondProduct)
      : (source.kind === 'combo'
        ? `Combo ${trimString(source.product?.name || source.productId, 130)}`
        : profile.displayName);
    const baseFiscalName = source.kind === 'half'
      ? `Meio a meio: ${profile.fiscalName} / ${profiles[1].fiscalName}`
      : profile.fiscalName;
    const fiscalName = appendFiscalBorderDescription(
      fiscalValue(baseFiscalName, canonicalDisplayName || 'Item', 120),
      borderLabel,
    );
    const productCode = source.kind === 'half'
      ? fiscalValue(
        `${profile.productCode}/${profiles[1].productCode}`,
        source.productId,
        60,
      )
      : profile.productCode;
    return {
      itemNumber: index + 1,
      productId: source.productId,
      displayName: trimString(canonicalDisplayName || 'Item', 140),
      name: fiscalName,
      productCode,
      barcode: source.kind === 'half' ? '' : profile.barcode,
      ncm: profile.ncm,
      cest: profile.cest,
      benefitCode: profile.benefitCode,
      cfop: profile.cfop,
      csosn: profile.csosn,
      cst: profile.cst,
      origin: profile.origin,
      unit: profile.unit,
      tributaryUnit: profile.tributaryUnit,
      tributaryFactor: profile.tributaryFactor,
      quantity,
      unitPrice,
      subtotal,
      aliquotaIcms: profile.aliquotaIcms,
      vBCSTRet: profile.vBCSTRet,
      pST: profile.pST,
      vICMSSubstituto: profile.vICMSSubstituto,
      vICMSSTRet: profile.vICMSSTRet,
      vBCFCPSTRet: profile.vBCFCPSTRet,
      pFCPSTRet: profile.pFCPSTRet,
      vFCPSTRet: profile.vFCPSTRet,
      pRedBCEfet: profile.pRedBCEfet,
      vBCEfet: profile.vBCEfet,
      pICMSEfet: profile.pICMSEfet,
      vICMSEfet: profile.vICMSEfet,
      pisCst: profile.pisCst,
      pisAliquota: profile.pisAliquota,
      cofinsCst: profile.cofinsCst,
      cofinsAliquota: profile.cofinsAliquota,
      fiscalReviewRequired: source.products.some((product) => product?.fiscalReviewRequired === true),
      fiscalEmissionBlocked: source.products.some((product) => product?.fiscalEmissionBlocked === true),
    };
  });
  const delivery = normalizeMoneyValue(orderLog?.totals?.delivery, 0);
  const includeFreight = Boolean(options?.includeFreight);
  const freight = includeFreight
    ? normalizeMoneyValue(options?.freight !== undefined ? options.freight : delivery, 0)
    : 0;
  const excludeThirdPartyDelivery = delivery > 0 && !includeFreight && shouldExcludeThirdPartyDelivery(fiscal);
  if (delivery > 0 && !excludeThirdPartyDelivery && !includeFreight) {
    const deliveryFiscal = fiscal?.deliveryFiscal && typeof fiscal.deliveryFiscal === 'object'
      && !Array.isArray(fiscal.deliveryFiscal)
      ? fiscal.deliveryFiscal
      : {};
    const deliveryValidation = validateExplicitFiscalProductProfile(deliveryFiscal, {
      crt: fiscal?.crt,
      environment,
    });
    if (!deliveryValidation.ok) {
      throw fiscalCatalogError(
        `Perfil fiscal da taxa de entrega incompleto ou nao liberado: ${deliveryValidation.errors.join(' ')}`,
      );
    }
    fiscalItems.push(buildFiscalDeliveryItem({
      delivery,
      fiscal,
      defaults,
      itemNumber: fiscalItems.length + 1,
    }));
  }

  const productsSubtotal = normalizeMoneyValue(
    fiscalItems.reduce((sum, item) => sum + normalizeMoneyValue(item.subtotal, 0), 0),
    0,
  );
  const invoiceTotal = normalizeMoneyValue(productsSubtotal + freight, 0);

  return {
    model: documentType === 'nfe' ? '55' : '65',
    documentType,
    environment,
    freight,
    totals: {
      subtotal: productsSubtotal,
      vProd: productsSubtotal,
      vFrete: freight,
      delivery: freight,
      total: invoiceTotal,
      vNF: invoiceTotal,
    },
    nature: fiscalValue(fiscal.natureOperation, 'Venda de mercadoria', 120),
    issuer: {
      cnpj: onlyDigits(fiscal.cnpj, 14),
      ie: fiscalValue(fiscal.ie, '', 30),
      im: fiscalValue(fiscal.im, '', 30),
      corporateName: fiscalValue(fiscal.corporateName, fiscal.tradeName || fiscal.storeName || 'Sua Empresa', 160),
      tradeName: fiscalValue(fiscal.tradeName, fiscal.corporateName || 'Sua Empresa', 120),
      crt: fiscalValue(fiscal.crt, '1', 2),
      uf: fiscalValue(fiscal.uf, '', 2).toUpperCase(),
      cityCode: onlyDigits(fiscal.cityCode, 7),
      cnae: onlyDigits(fiscal.cnae, 12),
      address: issuerAddress,
    },
    order: {
      id: orderLog.id,
      orderCode: orderLog.orderCode || `PED-${orderLog.id || ''}`,
      createdAt: orderLog.createdAt || '',
      customerName: orderLog.customerName || '',
      orderType: normalizeNfceOperationType(
        options?.fiscalOperationType,
        orderLog.orderType || 'retirada',
      ),
      originalOrderType: orderLog.orderType || '',
      deliveryAddress: orderLog.deliveryAddress || '',
      payment,
      totals: orderLog.totals || {},
      freight,
      thirdPartyDeliveryAmount: excludeThirdPartyDelivery ? delivery : 0,
      fiscalProductsTotal: productsSubtotal,
    },
    payment,
    consumer: {
      name: trimString(rawConsumer.name || orderLog.customerName || 'Consumidor final', 60),
      document: consumerDocument,
      ie: onlyDigits(rawConsumer.ie, 14),
      indIEDest: trimString(rawConsumer.indIEDest, 1) || (rawConsumer.ie ? '1' : '9'),
      email: trimString(rawConsumer.email, 60),
      phone: onlyDigits(rawConsumer.phone, 14),
      address: {
        cep: onlyDigits(rawConsumer.address?.cep, 8),
        street: trimString(rawConsumer.address?.street, 60),
        number: trimString(rawConsumer.address?.number, 60),
        complement: trimString(rawConsumer.address?.complement, 60),
        neighborhood: trimString(rawConsumer.address?.neighborhood, 60),
        city: trimString(rawConsumer.address?.city, 60),
        uf: trimString(rawConsumer.address?.uf, 2).toUpperCase(),
        cityCode: onlyDigits(rawConsumer.address?.cityCode, 7),
      },
    },
    items: fiscalItems,
  };
}

function createFiscalDraftForOrder(rawPayload = {}) {
  const orderId = Number.parseInt(String(rawPayload?.orderId || ''), 10);
  if (!Number.isFinite(orderId) || orderId <= 0) return { error: 'Pedido invalido.', statusCode: 400 };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const orderLog = getOrderLogById(orderId);
    if (!orderLog) {
      db.exec('ROLLBACK;');
      return { error: 'Pedido nao encontrado.', statusCode: 404 };
    }
    if (!isOrderAccepted(orderLog)) {
      db.exec('ROLLBACK;');
      return {
        error: 'Confirme o pedido antes de criar o documento fiscal.',
        statusCode: 409,
        code: 'ORDER_CONFIRMATION_REQUIRED',
      };
    }

    const existingForOrder = db.prepare(`
      SELECT id, status, document_type
      FROM fiscal_documents
      WHERE order_id = ? AND status NOT IN ('cancelled')
      ORDER BY id DESC
      LIMIT 1
    `).get(orderId);
    if (existingForOrder) {
      if (rawPayload?.replaceDraft && existingForOrder.status === 'prevalidated') {
        db.prepare(`
          UPDATE fiscal_documents
          SET status = 'cancelled',
              error = 'Substituida por nova nota fiscal antes da transmissao',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existingForOrder.id);
      } else {
        db.exec('ROLLBACK;');
        return {
          error: 'Este pedido ja possui nota pre-validada.',
          statusCode: 409,
          document: getFiscalDocumentById(existingForOrder.id),
        };
      }
    }

    const fiscal = getFiscalConfig();
    const documentType = normalizeFiscalDocumentType(rawPayload?.documentType || fiscal.documentType, 'nfce');
    const environment = normalizeFiscalEnvironment(fiscal.environment);
    const fiscalStatus = buildFiscalStatus({ documentType, environment });
    if (!fiscalStatus.readyForDraft) {
      db.exec('ROLLBACK;');
      return {
        error: 'Configure os dados fiscais obrigatorios antes de criar a nota pre-validada.',
        statusCode: 409,
        fiscalStatus,
      };
    }
    if (
      rawPayload?.environment
      && normalizeFiscalEnvironment(rawPayload.environment) !== environment
    ) {
      db.exec('ROLLBACK;');
      return {
        error: 'O ambiente solicitado difere do ambiente fiscal selecionado no admin.',
        statusCode: 409,
      };
    }
    const orderTotal = normalizeMoneyValue(orderLog?.totals?.total, 0);
    if (orderTotal <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Total do pedido invalido para documento fiscal.', statusCode: 400 };
    }

    const seriesKey = documentType === 'nfe' ? 'seriesNfe' : 'seriesNfce';
    const nextNumberKey = documentType === 'nfe' ? 'nextNumberNfe' : 'nextNumberNfce';
    const environmentConfig = getFiscalEnvironmentConfig(fiscal, environment);
    const series = fiscalValue(environmentConfig[seriesKey], '1', 20);
    const currentNumber = Number.parseInt(String(environmentConfig[nextNumberKey] || ''), 10);
    if (!Number.isFinite(currentNumber) || currentNumber <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Proximo numero fiscal invalido.', statusCode: 400 };
    }
    const number = String(currentNumber);

    const existingNumber = db.prepare(`
      SELECT id
      FROM fiscal_documents
      WHERE document_type = ? AND environment = ? AND series = ? AND number = ?
      LIMIT 1
    `).get(documentType, environment, series, number);
    if (existingNumber) {
      db.exec('ROLLBACK;');
      return {
        error: `Numero fiscal ${series}/${number} ja utilizado. Ajuste o proximo numero fiscal.`,
        statusCode: 409,
        document: getFiscalDocumentById(existingNumber.id),
      };
    }

    const payment = buildPaymentSnapshot(
      orderLog?.payment,
      rawPayload?.paymentMethod,
      rawPayload?.paymentLabel,
    );
    const consumer = rawPayload?.consumer && typeof rawPayload.consumer === 'object'
      ? rawPayload.consumer
      : { document: rawPayload?.consumerDocument };
    const includeFreight = Boolean(rawPayload?.includeFreight);
    const freight = includeFreight
      ? normalizeMoneyValue(rawPayload?.freight !== undefined ? rawPayload.freight : orderLog?.totals?.delivery, 0)
      : 0;
    const payload = buildFiscalDraftPayload(orderLog, fiscal, documentType, {
      payment,
      consumer,
      includeFreight,
      freight,
      fiscalOperationType: normalizeNfceOperationType(
        rawPayload?.fiscalOperationType,
        orderLog.orderType || 'retirada',
      ),
    });
    const fiscalTotal = normalizeMoneyValue(
      payload.items.reduce((sum, item) => sum + normalizeMoneyValue(item.subtotal, 0), 0) + (payload.freight || 0),
      0,
    );
    if (fiscalTotal <= 0) {
      db.exec('ROLLBACK;');
      return { error: 'Total dos produtos invalido para documento fiscal.', statusCode: 400 };
    }
    const fiscalPayment = normalizeFiscalPaymentForTotal(payload.payment, fiscalTotal);
    payload.payment = fiscalPayment;
    payload.order = {
      ...(payload.order && typeof payload.order === 'object' ? payload.order : {}),
      payment: fiscalPayment,
    };
    payload.audit = {
      action: 'create-fiscal-prevalidation',
      operator: trimString(rawPayload?._operator, 120) || ADMIN_USER,
      at: new Date().toISOString(),
    };
    const result = db.prepare(`
      INSERT INTO fiscal_documents (
        order_id,
        document_type,
        status,
        environment,
        number,
        series,
        total,
        customer_name,
        payload,
        sefaz_response,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'prevalidated', ?, ?, ?, ?, ?, ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      orderId,
      documentType,
      environment,
      number,
      series,
      fiscalTotal,
      trimString(orderLog.customerName, 160),
      JSON.stringify(payload),
    );
    const fiscalDocumentId = Number(result.lastInsertRowid);
    linkFiscalDocumentToOrderMovements(orderId, fiscalDocumentId);

    const updatedFiscal = {
      ...updateFiscalEnvironmentConfig(fiscal, environment, {
        [seriesKey]: series,
        [nextNumberKey]: String(currentNumber + 1),
      }),
      [seriesKey]: series,
      [nextNumberKey]: String(currentNumber + 1),
    };
    db.prepare(`
      INSERT INTO app_state (section, value, updated_at)
      VALUES ('fiscal', ?, ?)
      ON CONFLICT(section) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(serializeSectionForStorage('fiscal', updatedFiscal), new Date().toISOString());
    STATE_CACHE = null;
    STATE_MANIFEST_CACHE = null;

    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    persistDefaultStateSnapshot(readState());
    const document = getFiscalDocumentById(fiscalDocumentId);
    return { document };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    if (error?.code === 'FISCAL_CATALOG_INVALID') {
      return {
        error: String(error.message || 'Item fiscal incompativel com o catalogo atual.'),
        statusCode: Number(error.statusCode || 409),
      };
    }
    throw error;
  }
}

function prepareFiscalDocumentPaymentPayload(document, rawPayload = {}) {
  if (!document) return null;
  const rawMethod = trimString(rawPayload?.paymentMethod, 32);
  const rawConsumer = rawPayload?.consumer && typeof rawPayload.consumer === 'object' ? rawPayload.consumer : null;
  const rawDoc = rawPayload?.consumerDocument;
  const rawOpType = rawPayload?.fiscalOperationType;
  const hasFreightUpdate = rawPayload?.includeFreight !== undefined;
  if (!rawMethod && !rawConsumer && !rawDoc && !rawOpType && !hasFreightUpdate) return document;

  const payload = document.payload && typeof document.payload === 'object' && !Array.isArray(document.payload)
    ? { ...document.payload }
    : {};
  const order = payload.order && typeof payload.order === 'object' && !Array.isArray(payload.order)
    ? { ...payload.order }
    : {};

  let updatedDocTotal = document.total;
  if (hasFreightUpdate) {
    const inc = Boolean(rawPayload.includeFreight);
    const fr = inc
      ? normalizeMoneyValue(rawPayload.freight !== undefined ? rawPayload.freight : (payload.freight ?? order.totals?.delivery), 0)
      : 0;
    payload.freight = fr;
    order.freight = fr;
    if (inc) order.thirdPartyDeliveryAmount = 0;
    const prodsTotal = normalizeMoneyValue(
      (payload.items || []).reduce((sum, it) => sum + normalizeMoneyValue(it.subtotal, 0), 0),
      0,
    );
    updatedDocTotal = normalizeMoneyValue(prodsTotal + fr, 0);
    payload.totals = {
      ...(payload.totals || {}),
      subtotal: prodsTotal,
      vProd: prodsTotal,
      vFrete: fr,
      total: updatedDocTotal,
      vNF: updatedDocTotal,
    };
  }

  const payment = rawMethod
    ? buildPaymentSnapshot(
      payload.payment || order.payment || {},
      rawMethod,
      rawPayload?.paymentLabel,
    )
    : (payload.payment || order.payment || {});
  const consumer = payload.consumer && typeof payload.consumer === 'object' && !Array.isArray(payload.consumer)
    ? { ...payload.consumer }
    : {};
  const consumerDocument = onlyDigits(rawConsumer?.document || rawDoc || consumer.document, 14);
  const fiscalOperationType = normalizeNfceOperationType(
    rawOpType || order.orderType,
    order.orderType || 'retirada',
  );

  payload.payment = payment;
  payload.order = {
    ...order,
    payment,
    orderType: fiscalOperationType,
  };
  payload.consumer = {
    ...consumer,
    ...rawConsumer,
    document: consumerDocument,
    address: {
      ...(consumer.address && typeof consumer.address === 'object' ? consumer.address : {}),
      ...(rawConsumer.address && typeof rawConsumer.address === 'object' ? rawConsumer.address : {}),
    },
  };
  payload.audit = {
    ...(payload.audit && typeof payload.audit === 'object' ? payload.audit : {}),
    lastPaymentUpdateAt: new Date().toISOString(),
    lastPaymentUpdateBy: trimString(rawPayload?._operator, 120) || ADMIN_USER,
  };

  return { ...document, total: updatedDocTotal, payload };
}

async function cancelFiscalDocument(documentId, rawPayload = {}) {
  let document = getFiscalDocumentById(documentId);
  if (!document) return { error: 'Documento fiscal nao encontrado.', statusCode: 404 };

  const managerAuth = authorizeManagerAction('fiscal-event', rawPayload);
  if (!managerAuth.ok) {
    return {
      error: managerAuth.error,
      statusCode: managerAuth.statusCode || 403,
      document,
    };
  }

  const reason = trimString(rawPayload?.reason, 500);
  if (reason.length < 15) {
    return {
      error: 'Informe um motivo de cancelamento com pelo menos 15 caracteres.',
      statusCode: 400,
      document,
    };
  }

  const operation = acquireFiscalDocumentOperation(document.id, 'cancel');
  if (operation.error) return { ...operation, document: getFiscalDocumentById(document.id) };
  const operationToken = operation.token;
  try {
    document = getFiscalDocumentById(document.id);
    const fiscal = getFiscalConfig();
    const fiscalStatus = buildFiscalStatus();
    const currentStatus = String(document.status || '').toLowerCase();
    if (currentStatus === 'cancelled' || currentStatus === 'cancel_pending') {
      return {
        error: 'Documento fiscal ja possui cancelamento registrado.',
        statusCode: 409,
        document,
      };
    }
    if (shouldConsultNfeProtocolBeforeRetry(document)) {
      return {
        error: 'A situacao desta nota ainda precisa ser conciliada com a SEFAZ antes do cancelamento.',
        statusCode: 409,
        code: 'FISCAL_PROTOCOL_RECONCILIATION_REQUIRED',
        document,
      };
    }
    if (!['draft', 'prevalidated', 'rejected', 'error', 'authorized'].includes(currentStatus)) {
      return {
        error: 'Documento fiscal nao esta em um estado valido para cancelamento.',
        statusCode: 409,
        code: 'FISCAL_DOCUMENT_STATUS_INVALID',
        document,
      };
    }
    const authorized = currentStatus === 'authorized';
    const transmissionEnabled = fiscalStatus.transmissionEnabled && fiscalStatus.readyForSefaz;
    const now = new Date().toISOString();
    const requestedBy = trimString(rawPayload?._operator, 120) || ADMIN_USER;
    const baseEventPayload = {
      documentId: document.id,
      documentStatus: currentStatus,
      reason,
      requestedAt: now,
      requestedBy,
      officialTransmissionPending: authorized,
      transmissionEnabled,
    };
    let eventStatus = authorized
      ? (transmissionEnabled ? 'pending_connector' : 'pending_sefaz')
      : 'registered_local';
    let message = authorized
      ? 'Cancelamento oficial deve ser enviado pelo webservice de eventos da SEFAZ. Evento deixado pendente.'
      : 'Documento pre-validado cancelado localmente. Sem valor fiscal emitido.';
    let officialResponse = {
      sent: false,
      message,
    };
    let officialError = authorized ? message : '';
    let event = null;

    if (authorized && transmissionEnabled) {
      db.exec('BEGIN IMMEDIATE;');
      try {
        if (!fiscalDocumentOperationIsOwned(document.id, operationToken)) {
          throw createOrderRequestError(
            'A operacao fiscal perdeu a posse do documento antes de registrar o envio.',
            409,
            'FISCAL_OPERATION_OWNERSHIP_LOST',
          );
        }
        event = insertFiscalEvent({
          documentId: document.id,
          eventType: 'cancelamento',
          status: eventStatus,
          environment: document.environment || fiscal.environment,
          accessKey: document.accessKey,
          protocol: document.protocol,
          number: document.number,
          series: document.series,
          reason,
          payload: baseEventPayload,
          sefazResponse: {
            sent: false,
            pending: true,
            message: 'Cancelamento preparado para transmissao a SEFAZ.',
          },
        });
        const inFlightPayload = {
          ...(document.payload && typeof document.payload === 'object' ? document.payload : {}),
          cancellation: {
            reason,
            requestedAt: now,
            eventId: event.id,
            status: event.status,
            officialTransmissionPending: true,
          },
        };
        const inFlightUpdate = db.prepare(`
          UPDATE fiscal_documents
          SET status = 'cancel_pending',
              payload = ?,
              error = '',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND operation_token = ?
        `).run(JSON.stringify(inFlightPayload), document.id, operationToken);
        if (Number(inFlightUpdate.changes || 0) !== 1) {
          throw createOrderRequestError(
            'A operacao fiscal perdeu a posse do documento antes de registrar o envio.',
            409,
            'FISCAL_OPERATION_OWNERSHIP_LOST',
          );
        }
        db.exec('COMMIT;');
      } catch (error) {
        try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
        throw error;
      }
      checkpointWal('PASSIVE');
      document = getFiscalDocumentById(document.id);

      try {
        const response = await transmitNfeCancelEvent(document, fiscal, reason);
        const eventInfo = response.parsed?.event || {};
        const approved = ['135', '136', '155'].includes(String(eventInfo.cStat || ''));
        eventStatus = approved ? 'authorized' : 'rejected';
        message = eventInfo.xMotivo || response.parsed?.batch?.xMotivo || response.parsed?.fault || 'Resposta de cancelamento sem motivo detalhado.';
        officialResponse = {
          sent: true,
          ...response,
        };
        officialError = approved ? '' : message;
      } catch (error) {
        eventStatus = 'pending_sefaz';
        message = trimString(error?.message || String(error), 500);
        officialResponse = {
          sent: false,
          message,
        };
        officialError = message;
      }
    }

    if (!fiscalDocumentOperationIsOwned(document.id, operationToken)) {
      return {
        error: 'A operacao fiscal perdeu a posse do documento antes de concluir.',
        statusCode: 409,
        code: 'FISCAL_OPERATION_OWNERSHIP_LOST',
        document: getFiscalDocumentById(document.id),
      };
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      if (!fiscalDocumentOperationIsOwned(document.id, operationToken)) {
        throw createOrderRequestError(
          'A operacao fiscal perdeu a posse do documento antes de gravar.',
          409,
          'FISCAL_OPERATION_OWNERSHIP_LOST',
        );
      }
      const finalEventPayload = {
        ...baseEventPayload,
        officialTransmissionPending: authorized && eventStatus !== 'authorized',
        completedAt: new Date().toISOString(),
      };
      if (event) {
        const eventUpdateResult = db.prepare(`
          UPDATE fiscal_events
          SET status = ?,
              payload = ?,
              sefaz_response = ?,
              error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `).run(
          eventStatus,
          JSON.stringify(finalEventPayload),
          JSON.stringify(officialResponse),
          officialError,
          event.id,
          document.id,
        );
        if (Number(eventUpdateResult.changes || 0) !== 1) {
          throw createOrderRequestError(
            'O evento fiscal em andamento nao foi encontrado para conclusao.',
            409,
            'FISCAL_EVENT_OWNERSHIP_LOST',
          );
        }
        event = getFiscalEventById(event.id);
      } else {
        event = insertFiscalEvent({
          documentId: document.id,
          eventType: 'cancelamento',
          status: eventStatus,
          environment: document.environment || fiscal.environment,
          accessKey: document.accessKey,
          protocol: document.protocol,
          number: document.number,
          series: document.series,
          reason,
          payload: finalEventPayload,
          sefazResponse: officialResponse,
          error: officialError,
        });
      }

      const nextPayload = {
        ...(document.payload && typeof document.payload === 'object' ? document.payload : {}),
        cancellation: {
          reason,
          requestedAt: now,
          eventId: event.id,
          status: event.status,
          officialTransmissionPending: authorized && eventStatus !== 'authorized',
        },
      };
      const nextStatus = authorized
        ? (eventStatus === 'authorized' ? 'cancelled' : 'cancel_pending')
        : 'cancelled';
      const updateResult = db.prepare(`
        UPDATE fiscal_documents
        SET status = ?,
            payload = ?,
            error = ?,
            operation_token = '',
            operation_type = '',
            operation_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operation_token = ?
      `).run(nextStatus, JSON.stringify(nextPayload), officialError, document.id, operationToken);
      if (Number(updateResult.changes || 0) !== 1) {
        throw createOrderRequestError(
          'A operacao fiscal perdeu a posse do documento antes de gravar.',
          409,
          'FISCAL_OPERATION_OWNERSHIP_LOST',
        );
      }
      db.exec('COMMIT;');
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
      throw error;
    }
    checkpointWal('PASSIVE');
    return {
      document: getFiscalDocumentById(document.id),
      event,
      message,
    };
  } catch (error) {
    if (Number(error?.statusCode || 0) >= 400) {
      return {
        error: trimString(error?.message || String(error), 500),
        statusCode: Number(error.statusCode),
        code: trimString(error?.code, 80),
        document: getFiscalDocumentById(document.id),
      };
    }
    throw error;
  } finally {
    releaseFiscalDocumentOperation(document.id, operationToken);
  }
}

async function createFiscalNumberInutilization(rawPayload = {}) {
  const managerAuth = authorizeManagerAction('fiscal-event', rawPayload);
  if (!managerAuth.ok) {
    return { error: managerAuth.error, statusCode: managerAuth.statusCode || 403 };
  }

  const fiscal = getFiscalConfig();
  const documentType = normalizeFiscalDocumentType(rawPayload?.documentType || fiscal.documentType, 'nfce');
  const environment = normalizeFiscalEnvironment(rawPayload?.environment || fiscal.environment);
  const series = onlyDigits(rawPayload?.series || (documentType === 'nfe' ? fiscal.seriesNfe : fiscal.seriesNfce), 3) || '1';
  const startNumber = Number.parseInt(onlyDigits(rawPayload?.startNumber || rawPayload?.numberStart, 9), 10);
  const endNumber = Number.parseInt(onlyDigits(rawPayload?.endNumber || rawPayload?.numberEnd || rawPayload?.startNumber, 9), 10);
  const reason = trimString(rawPayload?.reason, 500);
  if (!Number.isFinite(startNumber) || startNumber <= 0 || !Number.isFinite(endNumber) || endNumber <= 0 || endNumber < startNumber) {
    return { error: 'Informe uma faixa numerica valida para inutilizacao.', statusCode: 400 };
  }
  if (reason.length < 15) {
    return { error: 'Informe uma justificativa de inutilizacao com pelo menos 15 caracteres.', statusCode: 400 };
  }

  const fiscalStatus = buildFiscalStatus();
  const transmissionEnabled = fiscalStatus.transmissionEnabled && fiscalStatus.readyForSefaz;
  let message = transmissionEnabled
    ? 'Inutilizacao registrada para envio pelo conector de eventos da SEFAZ.'
    : 'Inutilizacao registrada localmente. Envio SEFAZ continua bloqueado ate liberacao no admin.';
  let eventStatus = transmissionEnabled ? 'pending_connector' : 'pending_sefaz';
  let sefazResponse = {
    sent: false,
    message,
  };
  let error = transmissionEnabled ? 'Conector real de inutilizacao ainda pendente.' : message;

  if (transmissionEnabled) {
    try {
      const response = await transmitNfeInutilizationEvent({
        fiscal,
        documentType,
        environment,
        series,
        startNumber,
        endNumber,
        reason,
      });
      const info = response.parsed?.inutilization || {};
      const approved = ['102'].includes(String(info.cStat || ''));
      eventStatus = approved ? 'authorized' : 'rejected';
      message = info.xMotivo || response.parsed?.fault || 'Resposta de inutilizacao sem motivo detalhado.';
      sefazResponse = {
        sent: true,
        ...response,
      };
      error = approved ? '' : message;
    } catch (eventError) {
      eventStatus = 'pending_sefaz';
      message = trimString(eventError?.message || String(eventError), 500);
      sefazResponse = {
        sent: false,
        message,
      };
      error = message;
    }
  }

  const event = insertFiscalEvent({
    eventType: 'inutilizacao',
    status: eventStatus,
    environment,
    number: `${startNumber}-${endNumber}`,
    series,
    reason,
    payload: {
      documentType,
      model: documentType === 'nfe' ? '55' : '65',
      series,
      startNumber,
      endNumber,
      reason,
      requestedAt: new Date().toISOString(),
      requestedBy: trimString(rawPayload?._operator, 120) || ADMIN_USER,
      transmissionEnabled,
    },
    sefazResponse,
    error,
  });
  checkpointWal('PASSIVE');
  return { event, message };
}

function updateFiscalContingency(rawPayload = {}) {
  const managerAuth = authorizeManagerAction('fiscal-event', rawPayload);
  if (!managerAuth.ok) return { error: managerAuth.error, statusCode: managerAuth.statusCode || 403 };

  const fiscal = getFiscalConfig();
  const enabled = Boolean(rawPayload?.enabled);
  const reason = trimString(rawPayload?.reason, 500);
  if (enabled && reason.length < 10) {
    return { error: 'Informe o motivo da contingencia.', statusCode: 400 };
  }

  const current = fiscal.contingency && typeof fiscal.contingency === 'object' && !Array.isArray(fiscal.contingency)
    ? fiscal.contingency
    : {};
  const contingency = {
    enabled,
    mode: trimString(rawPayload?.mode, 40) || current.mode || 'offline',
    reason: enabled ? reason : '',
    startedAt: enabled ? (current.startedAt || new Date().toISOString()) : '',
    updatedAt: new Date().toISOString(),
  };
  writeSections({
    fiscal: {
      ...fiscal,
      contingency,
    },
  });
  const event = insertFiscalEvent({
    eventType: enabled ? 'contingencia_inicio' : 'contingencia_fim',
    status: 'registered_local',
    environment: fiscal.environment,
    reason: enabled ? reason : 'Contingencia encerrada',
    payload: {
      contingency,
      requestedAt: new Date().toISOString(),
      requestedBy: trimString(rawPayload?._operator, 120) || ADMIN_USER,
    },
    sefazResponse: {
      sent: false,
      message: enabled
        ? 'Contingencia NFC-e ativada localmente. As notas devem ser transmitidas quando a SEFAZ/conexao voltar.'
        : 'Contingencia local encerrada.',
    },
  });
  checkpointWal('PASSIVE');
  return {
    fiscalStatus: buildFiscalStatus(),
    event,
  };
}

function getFiscalDocumentSefazStatusCode(document) {
  return trimString(
    document?.sefazResponse?.authorization?.cStat
      || document?.sefazResponse?.batch?.cStat,
    10,
  );
}

function advanceFiscalDocumentNumberAfterDuplicate(document, fiscal) {
  if (!document || getFiscalDocumentSefazStatusCode(document) !== '539') return document;

  const environment = normalizeFiscalEnvironment(document.environment || fiscal.environment);
  const documentType = normalizeFiscalDocumentType(document.documentType || fiscal.documentType, 'nfce');
  const seriesKey = documentType === 'nfe' ? 'seriesNfe' : 'seriesNfce';
  const nextNumberKey = documentType === 'nfe' ? 'nextNumberNfe' : 'nextNumberNfce';
  const environmentConfig = getFiscalEnvironmentConfig(fiscal, environment);
  const currentNumber = Number.parseInt(String(document.number || ''), 10) || 0;
  let nextNumber = Number.parseInt(String(environmentConfig[nextNumberKey] || ''), 10) || 0;
  nextNumber = Math.max(currentNumber + 1, nextNumber, 1);
  while (db.prepare(`
    SELECT 1
    FROM fiscal_documents
    WHERE document_type = ? AND environment = ? AND series = ? AND number = ? AND id <> ?
    LIMIT 1
  `).get(documentType, environment, document.series, String(nextNumber), document.id)) {
    nextNumber += 1;
  }

  const previousReason = trimString(
    document.sefazResponse?.authorization?.xMotivo
      || document.sefazResponse?.batch?.xMotivo
      || document.error,
    500,
  );
  const duplicateAccessKey = previousReason.match(/\b\d{44}\b/)?.[0] || '';
  const payload = document.payload && typeof document.payload === 'object' && !Array.isArray(document.payload)
    ? { ...document.payload }
    : {};
  delete payload.nfe;
  payload.audit = {
    ...(payload.audit && typeof payload.audit === 'object' && !Array.isArray(payload.audit)
      ? payload.audit
      : {}),
    numberCorrections: [
      ...(Array.isArray(payload.audit?.numberCorrections) ? payload.audit.numberCorrections : []),
      {
        from: String(document.number || ''),
        to: String(nextNumber),
        reason: 'SEFAZ 539: numero ja autorizado com outra chave de acesso.',
        duplicateAccessKey,
        at: new Date().toISOString(),
      },
    ],
  };
  const updatedFiscal = {
    ...updateFiscalEnvironmentConfig(fiscal, environment, {
      [seriesKey]: document.series,
      [nextNumberKey]: String(nextNumber + 1),
    }),
    [seriesKey]: document.series,
    [nextNumberKey]: String(nextNumber + 1),
  };

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      UPDATE fiscal_documents
      SET status = 'prevalidated',
          access_key = '',
          protocol = '',
          number = ?,
          payload = ?,
          sefaz_response = '{}',
          error = '',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(nextNumber), JSON.stringify(payload), document.id);
    db.prepare(`
      INSERT INTO app_state (section, value, updated_at)
      VALUES ('fiscal', ?, ?)
      ON CONFLICT(section) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(serializeSectionForStorage('fiscal', updatedFiscal), new Date().toISOString());
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original.
    }
    throw error;
  }
  STATE_CACHE = null;
  STATE_MANIFEST_CACHE = null;
  checkpointWal('PASSIVE');
  persistDefaultStateSnapshot(readState());
  insertFiscalEvent({
    documentId: document.id,
    eventType: 'number_conflict',
    status: 'registered_local',
    environment,
    accessKey: duplicateAccessKey,
    number: String(document.number || ''),
    series: document.series,
    reason: previousReason,
    payload: {
      previousNumber: String(document.number || ''),
      reassignedNumber: String(nextNumber),
      detectedAt: new Date().toISOString(),
    },
    sefazResponse: document.sefazResponse,
  });
  return getFiscalDocumentById(document.id);
}

async function transmitFiscalDocument(documentId, rawPayload = {}) {
  let document = getFiscalDocumentById(documentId);
  if (!document) return { error: 'Documento fiscal nao encontrado.', statusCode: 404 };

  const managerAuth = authorizeManagerAction('fiscal-transmit', rawPayload);
  if (!managerAuth.ok) {
    return {
      error: managerAuth.error,
      statusCode: managerAuth.statusCode || 403,
      document,
    };
  }

  const currentStatus = String(document.status || '').toLowerCase();
  if (currentStatus === 'authorized') {
    return {
      error: 'Documento fiscal ja autorizado na SEFAZ.',
      statusCode: 409,
      document,
    };
  }
  if (!['prevalidated', 'rejected', 'error', 'processing'].includes(currentStatus)) {
    return {
      error: 'Documento fiscal nao esta em um estado valido para transmissao.',
      statusCode: 409,
      code: 'FISCAL_DOCUMENT_STATUS_INVALID',
      document,
    };
  }

  const operation = acquireFiscalDocumentOperation(document.id, 'transmit');
  if (operation.error) return { ...operation, document: getFiscalDocumentById(document.id) };
  const operationToken = operation.token;
  try {
    document = getFiscalDocumentById(document.id);
    const lockedStatus = String(document.status || '').toLowerCase();
    if (lockedStatus === 'authorized') {
      return {
        error: 'Documento fiscal ja autorizado na SEFAZ.',
        statusCode: 409,
        document,
      };
    }
    if (!['prevalidated', 'rejected', 'error', 'processing'].includes(lockedStatus)) {
      return {
        error: 'Documento fiscal nao esta em um estado valido para transmissao.',
        statusCode: 409,
        code: 'FISCAL_DOCUMENT_STATUS_INVALID',
        document,
      };
    }
    document = prepareFiscalDocumentPaymentPayload(document, rawPayload);
    const normalizedFiscalPayment = normalizeFiscalPaymentForTotal(
      document?.payload?.payment || document?.payload?.order?.payment || {},
      document.total,
    );
    document = {
      ...document,
      payload: {
        ...(document.payload && typeof document.payload === 'object' ? document.payload : {}),
        payment: normalizedFiscalPayment,
        order: {
          ...(document?.payload?.order && typeof document.payload.order === 'object'
            ? document.payload.order
            : {}),
          payment: normalizedFiscalPayment,
        },
      },
    };

  const fiscal = getFiscalConfig();
  if (!rawPayload?.dryRun && getFiscalDocumentSefazStatusCode(document) === '539') {
    document = advanceFiscalDocumentNumberAfterDuplicate(document, fiscal);
  }
  const configuredEnvironment = normalizeFiscalEnvironment(fiscal.environment);
  const documentEnvironment = normalizeFiscalEnvironment(document.environment || configuredEnvironment);
  if (documentEnvironment !== configuredEnvironment) {
    return {
      error: 'O ambiente do documento difere do ambiente fiscal selecionado no admin.',
      statusCode: 409,
      document,
    };
  }
  const documentType = normalizeFiscalDocumentType(document.documentType || fiscal.documentType, 'nfce');
  const fiscalStatus = buildFiscalStatus({ documentType, environment: documentEnvironment });
  if (!fiscalStatus.transmissionEnabled) {
    return {
      error: 'Transmissao para a SEFAZ bloqueada no admin. A configuracao pode ser conferida, mas nenhuma nota sera enviada.',
      statusCode: 409,
      document,
      fiscalStatus,
    };
  }
  if (!fiscalStatus.readyForSefaz) {
    return {
      error: 'Configuracao fiscal ainda nao esta pronta para transmitir na SEFAZ.',
      statusCode: 409,
      document,
      fiscalStatus,
    };
  }

  if (documentType === 'nfe') {
    const consumer = document?.payload?.consumer || {};
    const docDigits = onlyDigits(consumer.document, 14);
    if (!docDigits || (docDigits.length !== 11 && docDigits.length !== 14)) {
      return {
        error: 'NF-e modelo 55 exige destinatario com CPF (11 digitos) ou CNPJ (14 digitos).',
        statusCode: 400,
        document,
      };
    }
    const address = consumer.address || {};
    const street = trimString(address.street, 60);
    const number = trimString(address.number, 60);
    const neighborhood = trimString(address.neighborhood, 60);
    const city = trimString(address.city, 60);
    const uf = trimString(address.uf, 2).toUpperCase();
    const cityCode = onlyDigits(address.cityCode, 7);
    const cep = onlyDigits(address.cep, 8);
    if (!street || !number || !neighborhood || !city || cityCode.length !== 7 || !/^[A-Z]{2}$/.test(uf) || cep.length !== 8) {
      return {
        error: 'NF-e modelo 55 exige endereco completo do destinatario com CEP (8 digitos) e codigo IBGE (7 digitos).',
        statusCode: 400,
        document,
      };
    }
    const indIEDest = ['1', '2', '9'].includes(String(consumer.indIEDest))
      ? String(consumer.indIEDest)
      : (consumer.ie ? '1' : '9');
    const ieDigits = onlyDigits(consumer.ie, 14);
    if (indIEDest === '1' && !ieDigits) {
      return {
        error: 'NF-e modelo 55 exige Inscricao Estadual quando o destinatario e Contribuinte ICMS (indIEDest=1).',
        statusCode: 400,
        document,
      };
    }
  } else if (documentType !== 'nfce') {
    return {
      error: 'Tipo de documento fiscal nao suportado. Use "nfce" ou "nfe".',
      statusCode: 400,
      document,
    };
  }

  if (!rawPayload?.dryRun && !rawPayload?.validateOnly && shouldConsultNfeProtocolBeforeRetry(document)) {
    try {
      const reconciliation = await reconcileFiscalDocumentProtocol(document, fiscal, { operationToken });
      if (reconciliation.reconciled) {
        return {
          document: reconciliation.document,
          sefazResponse: reconciliation.consultation,
          reconciled: true,
          message: 'Nota conciliada com a autorizacao que ja constava na SEFAZ.',
        };
      }
      const consultationCode = getNfeProtocolConsultationCode(reconciliation.consultation);
      const storedCode = getFiscalDocumentSefazStatusCode(document);
      if (storedCode === '204' || consultationCode !== '217') {
        const consultationReason = trimString(
          reconciliation.consultation?.parsed?.authorization?.xMotivo
            || reconciliation.consultation?.parsed?.status?.xMotivo
            || reconciliation.consultation?.parsed?.fault,
          500,
        );
        return {
          error: consultationReason
            ? `Consulta SEFAZ: ${consultationReason}`
            : 'A SEFAZ informou duplicidade, mas a consulta ainda nao devolveu o protocolo. Tente novamente em instantes.',
          statusCode: 409,
          document,
          sefazResponse: reconciliation.consultation,
        };
      }
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400) {
        return {
          error: trimString(error?.message || String(error), 500),
          statusCode: Number(error.statusCode),
          code: trimString(error?.code, 80),
          document: getFiscalDocumentById(document.id),
        };
      }
      return {
        error: `Nao foi possivel confirmar a situacao da nota antes do reenvio: ${trimString(error?.message || String(error), 420)}`,
        statusCode: 502,
        document,
      };
    }
  }

  const environment = documentEnvironment;
  const services = getSefazServicesForFiscal(fiscal, environment);
  const lotId = String(Date.now()).slice(-15).padStart(15, '0');

  let nfePackage;
  try {
    nfePackage = await buildNfePackage(document, fiscal);
  } catch (error) {
    const message = trimString(error?.message || String(error), 500);
    const updateResult = db.prepare(`
      UPDATE fiscal_documents
      SET status = 'error',
          error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operation_token = ?
    `).run(message, document.id, operationToken);
    if (Number(updateResult.changes || 0) !== 1) {
      return buildFiscalOperationOwnershipError(document.id);
    }
    checkpointWal('PASSIVE');
    return {
      error: message,
      statusCode: 409,
      document: getFiscalDocumentById(document.id),
    };
  }

  const xmlPreflight = buildXmlPreflightValidation(nfePackage.signedXml, [
    'NFe',
    'infNFe',
    'ide',
    'emit',
    'det',
    'total',
    'pag',
    'Signature',
  ]);
  if (!xmlPreflight.ok) {
    const message = trimString(`XML fiscal incompleto: ${xmlPreflight.errors.join(' ')}`, 500);
    const updateResult = db.prepare(`
      UPDATE fiscal_documents
      SET status = 'error',
          access_key = ?,
          total = ?,
          payload = ?,
          error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operation_token = ?
    `).run(
      nfePackage.accessKey,
      nfePackage.total,
      JSON.stringify(nfePackage.payload),
      message,
      document.id,
      operationToken,
    );
    if (Number(updateResult.changes || 0) !== 1) {
      return buildFiscalOperationOwnershipError(document.id);
    }
    checkpointWal('PASSIVE');
    return {
      error: message,
      statusCode: 409,
      document: getFiscalDocumentById(document.id),
      validation: xmlPreflight,
    };
  }

  if (rawPayload?.dryRun || rawPayload?.validateOnly) {
    return {
      document: {
        ...document,
        status: 'prevalidated',
        accessKey: nfePackage.accessKey,
        total: nfePackage.total,
        payload: nfePackage.payload,
      },
      sefazResponse: {
        dryRun: true,
        message: `XML ${documentType === 'nfe' ? 'NF-e modelo 55' : 'NFC-e modelo 65'} montado e assinado localmente. Nenhum envio para a SEFAZ foi realizado.`,
      },
    };
  }

  const soapBody = buildNfeAuthorizationSoap(nfePackage.signedXml, lotId);
  const sefazRequest = {
    environment,
    uf: trimString(fiscal.uf, 2).toUpperCase(),
    service: 'NFeAutorizacao4',
    url: services.autorizacao,
    lotId,
    sentAt: new Date().toISOString(),
  };

  const inFlightPayload = {
    ...nfePackage.payload,
    nfe: {
      ...nfePackage.payload.nfe,
      status: 'processing',
      transmission: {
        request: sefazRequest,
        pending: true,
      },
    },
  };
  const markProcessingResult = db.prepare(`
    UPDATE fiscal_documents
    SET status = 'processing',
        access_key = ?,
        total = ?,
        payload = ?,
        error = '',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND operation_token = ?
  `).run(
    nfePackage.accessKey,
    nfePackage.total,
    JSON.stringify(inFlightPayload),
    document.id,
    operationToken,
  );
  if (Number(markProcessingResult.changes || 0) !== 1) {
    return buildFiscalOperationOwnershipError(document.id);
  }
  checkpointWal('PASSIVE');

  let soapResponse;
  try {
    soapResponse = await postSoapWithCertificate(services.autorizacao, soapBody, nfePackage.certificate);
  } catch (error) {
    const message = trimString(error?.message || String(error), 500);
    const sefazResponse = {
      request: sefazRequest,
      httpStatus: 0,
      error: message,
    };
    const payload = {
      ...nfePackage.payload,
      nfe: {
        ...nfePackage.payload.nfe,
        transmission: sefazResponse,
      },
    };
    const updateResult = db.prepare(`
      UPDATE fiscal_documents
      SET status = 'error',
          access_key = ?,
          total = ?,
          payload = ?,
          sefaz_response = ?,
          error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operation_token = ?
    `).run(
      nfePackage.accessKey,
      nfePackage.total,
      JSON.stringify(payload),
      JSON.stringify(sefazResponse),
      message,
      document.id,
      operationToken,
    );
    if (Number(updateResult.changes || 0) !== 1) {
      return buildFiscalOperationOwnershipError(document.id);
    }
    checkpointWal('PASSIVE');
    return {
      error: message,
      statusCode: 502,
      document: getFiscalDocumentById(document.id),
      sefazResponse,
    };
  }

  const parsedResponse = parseNfeAuthorizationResponse(soapResponse.body);
  const authorization = parsedResponse.authorization || {};
  const batch = parsedResponse.batch || {};
  const authorized = ['100', '150'].includes(String(authorization.cStat || ''));
  const pending = ['103', '105'].includes(String(batch.cStat || authorization.cStat || ''));
  const status = authorized ? 'authorized' : pending ? 'processing' : 'rejected';
  const protocol = authorized ? trimString(authorization.nProt, 80) : '';
  const message = trimString(
    authorization.xMotivo
    || batch.xMotivo
    || parsedResponse.fault
    || soapResponse.httpStatusText
    || 'Resposta SEFAZ sem motivo detalhado.',
    500,
  );
  const procXml = authorized && authorization.protNFeXml
    ? `<nfeProc versao="${NFE_VERSION}" xmlns="${NFE_XML_NS}">${nfePackage.signedXml}${authorization.protNFeXml}</nfeProc>`
    : '';
  const sefazResponse = {
    request: sefazRequest,
    httpStatus: soapResponse.httpStatus,
    httpStatusText: soapResponse.httpStatusText,
    batch,
    authorization,
    fault: parsedResponse.fault,
    receivedAt: new Date().toISOString(),
  };
  const payload = {
    ...nfePackage.payload,
    nfe: {
      ...nfePackage.payload.nfe,
      protocol,
      status,
      authorization,
      transmission: sefazResponse,
      procXml,
    },
  };

  const finalUpdateResult = db.prepare(`
    UPDATE fiscal_documents
    SET status = ?,
        access_key = ?,
        protocol = ?,
        total = ?,
        payload = ?,
        sefaz_response = ?,
        error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND operation_token = ?
  `).run(
    status,
    nfePackage.accessKey,
    protocol,
    nfePackage.total,
    JSON.stringify(payload),
    JSON.stringify(sefazResponse),
    authorized ? '' : message,
    document.id,
    operationToken,
  );
  if (Number(finalUpdateResult.changes || 0) !== 1) {
    return buildFiscalOperationOwnershipError(document.id);
  }
  checkpointWal('PASSIVE');
  const updatedDocument = getFiscalDocumentById(document.id);

  if (!authorized) {
    const responseCode = String(authorization.cStat || batch.cStat || '');
    if (responseCode === '204') {
      try {
        const reconciliation = await reconcileFiscalDocumentProtocol(updatedDocument, fiscal, { operationToken });
        if (reconciliation.reconciled) {
          return {
            document: reconciliation.document,
            sefazResponse: reconciliation.consultation,
            reconciled: true,
            message: 'A SEFAZ confirmou que a nota ja estava autorizada; o protocolo foi recuperado.',
          };
        }
        const consultationReason = trimString(
          reconciliation.consultation?.parsed?.authorization?.xMotivo
            || reconciliation.consultation?.parsed?.status?.xMotivo
            || reconciliation.consultation?.parsed?.fault,
          500,
        );
        return {
          error: consultationReason
            ? `Duplicidade confirmada. Consulta SEFAZ: ${consultationReason}`
            : 'Duplicidade confirmada, mas o protocolo ainda nao foi devolvido pela SEFAZ. Tente novamente em instantes.',
          statusCode: 409,
          document: updatedDocument,
          sefazResponse,
        };
      } catch (error) {
        if (Number(error?.statusCode || 0) >= 400) {
          return {
            error: trimString(error?.message || String(error), 500),
            statusCode: Number(error.statusCode),
            code: trimString(error?.code, 80),
            document: getFiscalDocumentById(document.id),
            sefazResponse,
          };
        }
        return {
          error: `Duplicidade confirmada e falha ao consultar o protocolo: ${trimString(error?.message || String(error), 420)}`,
          statusCode: 502,
          document: updatedDocument,
          sefazResponse,
        };
      }
    }
    if (responseCode === '539') {
      const reassignedDocument = advanceFiscalDocumentNumberAfterDuplicate(updatedDocument, fiscal);
      return {
        error: `SEFAZ informou que o numero ${document.number} ja estava autorizado por outro sistema. O caixa reservou automaticamente o numero ${reassignedDocument.number}; clique em Enviar novamente.`,
        statusCode: 409,
        document: reassignedDocument,
        sefazResponse,
      };
    }
    return {
      error: `SEFAZ: ${message}`,
      statusCode: 409,
      document: updatedDocument,
      sefazResponse,
    };
  }

  return {
    document: updatedDocument,
    sefazResponse,
  };
  } finally {
    releaseFiscalDocumentOperation(document.id, operationToken);
  }
}

function formatCurrencyBRL(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatOrderCreatedAtForPrint(value) {
  if (!value) return '--';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return formatReceiptDateTime(parsed);
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

const RECEIPT_CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const RECEIPT_EMOJI_REGEX = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu;

function cleanReceiptText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(RECEIPT_CONTROL_CHAR_REGEX, '')
    .replace(RECEIPT_EMOJI_REGEX, '')
    .replace(/[*`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function receiptTextWidth(value) {
  return Array.from(String(value || '')).length;
}

function splitLongReceiptWord(word, width) {
  const chars = Array.from(String(word || ''));
  const parts = [];
  let current = '';

  for (const char of chars) {
    if (receiptTextWidth(current + char) > width && current) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function wrapReceiptText(value, width = THERMAL_RECEIPT_COLUMNS) {
  const maxWidth = Math.max(8, Number.parseInt(String(width || THERMAL_RECEIPT_COLUMNS), 10) || THERMAL_RECEIPT_COLUMNS);
  const clean = cleanReceiptText(value).replace(/\n+/g, ' ');
  if (!clean) return [];

  const lines = [];
  let current = '';
  for (const word of clean.split(/\s+/).filter(Boolean)) {
    if (receiptTextWidth(word) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...splitLongReceiptWord(word, maxWidth));
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (receiptTextWidth(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function centerReceiptLine(value, columns = THERMAL_RECEIPT_COLUMNS) {
  const clean = cleanReceiptText(value).replace(/\n+/g, ' ');
  if (!clean) return '';
  const wrapped = wrapReceiptText(clean, columns);
  return (wrapped.length ? wrapped : [clean])
    .map((line) => {
      const width = receiptTextWidth(line);
      const left = Math.max(0, Math.floor((columns - width) / 2));
      return `${' '.repeat(left)}${line}`;
    })
    .join('\n');
}

function receiptAmountLine(label, amount, columns = THERMAL_RECEIPT_COLUMNS) {
  const left = cleanReceiptText(label).replace(/:$/, '');
  const right = cleanReceiptText(amount);
  const inline = [left ? `${left}:` : '', right].filter(Boolean).join(' ');
  if (columns <= 32) return inline || left || right;

  const gap = columns - receiptTextWidth(left) - receiptTextWidth(right);
  if (gap >= 1) return `${left}${' '.repeat(gap)}${right}`;
  return wrapReceiptText(inline, columns)[0] || inline;
}

function pushReceiptField(lines, label, value, columns = THERMAL_RECEIPT_COLUMNS) {
  const cleanLabel = cleanReceiptText(label).replace(/:$/, '');
  const cleanValue = cleanReceiptText(value);
  if (!cleanLabel || !cleanValue) return;

  const prefix = `${cleanLabel}: `;
  const prefixWidth = receiptTextWidth(prefix);
  if (prefixWidth > columns - 8) {
    lines.push(`${cleanLabel}:`);
    wrapReceiptText(cleanValue, columns).forEach((line) => lines.push(line));
    return;
  }

  const wrapped = wrapReceiptText(cleanValue, columns - prefixWidth);
  if (wrapped.length === 0) {
    lines.push(prefix.trimEnd());
    return;
  }

  lines.push(`${prefix}${wrapped[0]}`);
  const indent = ' '.repeat(prefixWidth);
  wrapped.slice(1).forEach((line) => lines.push(`${indent}${line}`));
}

function pushReceiptWrapped(lines, value, indent = '', columns = THERMAL_RECEIPT_COLUMNS) {
  const cleanIndent = String(indent || '');
  const width = Math.max(8, columns - receiptTextWidth(cleanIndent));
  wrapReceiptText(value, width).forEach((line) => {
    lines.push(`${cleanIndent}${line}`);
  });
}

function getReceiptOrderTypeLabel(orderType) {
  if (orderType === 'entrega') return 'Entrega';
  if (orderType === 'consumo_local') return 'Consumo local';
  return 'Retirada';
}

function prettifyReceiptSizeValue(value) {
  const clean = cleanReceiptText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const lowered = clean.toLowerCase();
  if (['p', 'pp', 'peq', 'pequena', 'brotinho', 'broto'].includes(lowered)) return 'Pequena';
  if (['m', 'med', 'media', 'medio'].includes(lowered)) return 'Media';
  if (['g', 'gg', 'gr', 'grande', 'gigante', 'familia'].includes(lowered)) return 'Grande';
  return clean;
}

function getReceiptItemSizeLabel(item) {
  const candidates = [
    item?.size,
    item?.sizeLabel,
    item?.sizeName,
    item?.productSize,
    item?.sizeKey,
  ];

  for (const candidate of candidates) {
    const label = prettifyReceiptSizeValue(candidate);
    if (label) return label;
  }

  return '';
}

function buildThermalOrderPrintText(order, options = {}) {
  const columns = resolveThermalReceiptColumns(options);
  const orderCode = cleanReceiptText(order?.orderCode || `PED-${order?.id || ''}`) || '--';
  const documentTitle = cleanReceiptText(order?.documentTitle || 'PEDIDO') || 'PEDIDO';
  const storeName = cleanReceiptText(order?.storeName || 'Sua Empresa') || 'Sua Empresa';
  const createdAt = formatOrderCreatedAtForPrint(order?.createdAt);
  const customerName = cleanReceiptText(order?.customerName || '') || 'Nao informado';
  const customerNote = cleanReceiptText(order?.customerNote || '');
  const orderType = cleanReceiptText(order?.orderType || '').toLowerCase();
  const deliveryAddress = cleanReceiptText(order?.deliveryAddress || '');
  const localConsumptionTime = cleanReceiptText(order?.localConsumptionTime || '');
  const payment = order?.payment && typeof order.payment === 'object' ? order.payment : {};
  const paymentMethod = cleanReceiptText(payment.method || '').toLowerCase();
  const paymentLabel = cleanReceiptText(payment.label || '') || 'Pix';
  const pixKey = cleanReceiptText(payment.pixKey || '');
  const needsChange = paymentMethod === 'dinheiro' && Boolean(payment.needsChange);
  const subtotal = Number(order?.totals?.subtotal || 0);
  const delivery = Number(order?.totals?.delivery || 0);
  const total = Number(order?.totals?.total || 0);
  const items = Array.isArray(order?.items) ? order.items : [];
  const sep = '-'.repeat(columns);

  const titleParts = receiptTextWidth(documentTitle) <= columns
    ? [documentTitle]
    : documentTitle
      .split(/\s+-\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  const lines = [centerReceiptLine(storeName, columns)];
  titleParts.forEach((part) => lines.push(centerReceiptLine(part, columns)));
  lines.push(centerReceiptLine(orderCode, columns), sep);

  pushReceiptField(lines, 'Data', createdAt, columns);
  pushReceiptField(lines, 'Cliente', customerName, columns);
  if (customerNote) pushReceiptField(lines, 'Obs', customerNote, columns);

  if (orderType === 'entrega') {
    pushReceiptField(lines, 'Tipo', 'Entrega', columns);
    if (deliveryAddress) pushReceiptField(lines, 'Endereco', deliveryAddress, columns);
  } else if (orderType === 'consumo_local') {
    pushReceiptField(lines, 'Tipo', 'Consumo local', columns);
    pushReceiptField(lines, 'Horario', localConsumptionTime || '--', columns);
  } else {
    pushReceiptField(lines, 'Tipo', 'Retirada no local', columns);
  }

  pushReceiptField(lines, 'Pagamento', paymentLabel, columns);
  if (paymentMethod === 'pix' && pixKey) pushReceiptField(lines, 'Chave Pix', pixKey, columns);
  if (needsChange) {
    pushReceiptField(lines, 'Troco para', formatCurrencyBRL(payment.cashGiven || 0), columns);
    pushReceiptField(lines, 'Troco', formatCurrencyBRL(payment.change || 0), columns);
  }

  lines.push(sep);
  lines.push(centerReceiptLine('ITENS DO PEDIDO', columns));

  if (items.length === 0) {
    lines.push('Nenhum item listado');
  } else {
    items.forEach((item, index) => {
      const qty = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
      const unitPriceRaw = Number(item?.unitPrice ?? item?.price ?? 0);
      const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : 0;
      const subtotalRaw = item?.subtotal != null ? Number(item.subtotal) : unitPrice * qty;
      const itemSubtotal = Number.isFinite(subtotalRaw) ? subtotalRaw : 0;
      const itemName = (cleanReceiptText(item?.name || 'Item') || 'Item').toUpperCase();
      const sizeLabel = getReceiptItemSizeLabel(item);
      const borderLabel = cleanReceiptText(item?.borderLabel || item?.borderSelection?.label);
      const borderPriceRaw = Number(item?.borderPrice ?? item?.borderSelection?.price ?? 0);
      const borderPrice = Number.isFinite(borderPriceRaw) ? borderPriceRaw : 0;

      if (index > 0) lines.push('');
      pushReceiptWrapped(lines, `${qty}X ${itemName}`, '', columns);
      if (sizeLabel) pushReceiptWrapped(lines, `TAMANHO: ${sizeLabel.toUpperCase()}`, '  ', columns);
      if (borderLabel) {
        const priceLabel = borderPrice > 0 ? ` (+${formatCurrencyBRL(borderPrice)})` : '';
        pushReceiptWrapped(lines, `BORDA: ${borderLabel.toUpperCase()}${priceLabel}`, '  ', columns);
      }
      lines.push(`  VALOR UNIT.: ${formatCurrencyBRL(unitPrice)}`);
      lines.push(`  VALOR ITEM: ${formatCurrencyBRL(itemSubtotal)}`);
    });
  }

  lines.push(sep);
  lines.push(receiptAmountLine('Subtotal:', formatCurrencyBRL(subtotal), columns));

  if (orderType === 'entrega') {
    lines.push(receiptAmountLine('Entrega:', delivery === 0 ? 'Gratis' : formatCurrencyBRL(delivery), columns));
  } else if (orderType === 'consumo_local') {
    lines.push(`Consumo local: ${localConsumptionTime || '--'}`);
  } else {
    lines.push('Retirada: No balcao');
  }

  lines.push(receiptAmountLine('TOTAL:', formatCurrencyBRL(total), columns));
  lines.push(sep);
  lines.push('');
  pushReceiptWrapped(lines, columns <= 32 ? 'Confirme o pedido.' : 'Por favor, confirme o pedido.', '', columns);
  lines.push('Obrigado(a)!');

  return lines
    .map((line) => String(line || '').replace(/[ \t]+$/g, ''))
    .join('\r\n')
    .trim();
}

function buildFallbackOrderPrintText(order) {
  const orderCode = String(order?.orderCode || `PED-${order?.id || ''}`).trim() || '--';
  const storeName = String(order?.storeName || 'Sua Empresa').trim() || 'Sua Empresa';
  const createdAt = formatOrderCreatedAtForPrint(order?.createdAt);
  const customerName = String(order?.customerName || '').trim() || 'Nao informado';
  const customerNote = String(order?.customerNote || '').trim();
  const orderTypeRaw = String(order?.orderType || '').toLowerCase();
  const orderType = orderTypeRaw === 'entrega'
    ? 'Entrega'
    : orderTypeRaw === 'consumo_local'
      ? 'Consumo local'
      : 'Retirada';
  const paymentLabel = String(order?.payment?.label || '').trim() || 'Pix';
  const subtotal = Number(order?.totals?.subtotal || 0);
  const delivery = Number(order?.totals?.delivery || 0);
  const total = Number(order?.totals?.total || 0);
  const deliveryAddress = String(order?.deliveryAddress || '').trim();
  const localConsumptionTime = String(order?.localConsumptionTime || '').trim();
  const items = Array.isArray(order?.items) ? order.items : [];

  const lines = [
    `${storeName}`,
    `${String(order?.documentTitle || 'Pedido').trim() || 'Pedido'} ${orderCode}`,
    `Data: ${createdAt}`,
    `Cliente: ${customerName}`,
  ];
  if (customerNote) {
    lines.push(`Observacao: ${customerNote}`);
  }
  if (orderTypeRaw === 'consumo_local') {
    lines.push(`Consumo local: ${localConsumptionTime || '--'}`);
  } else {
    lines.push(`Tipo: ${orderType}`);
    if (deliveryAddress) lines.push(`Endereco: ${deliveryAddress}`);
  }
  lines.push(`Pagamento: ${paymentLabel}`);
  lines.push('');
  lines.push('Itens:');
  if (items.length === 0) {
    lines.push('- Nenhum item listado');
  } else {
    items.forEach((item) => {
      const qty = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
      const unitPriceRaw = Number(item?.unitPrice ?? item?.price ?? 0);
      const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : 0;
      const itemSubtotalRaw = item?.subtotal != null
        ? Number(item.subtotal)
        : unitPrice * qty;
      const itemSubtotal = Number.isFinite(itemSubtotalRaw) ? itemSubtotalRaw : 0;
      const itemName = String(item?.name || 'Item').trim() || 'Item';
      const sizeLabel = getReceiptItemSizeLabel(item);
      const borderLabel = String(item?.borderLabel || item?.borderSelection?.label || '').trim();
      const borderPriceRaw = Number(item?.borderPrice ?? item?.borderSelection?.price ?? 0);
      const borderPrice = Number.isFinite(borderPriceRaw) ? borderPriceRaw : 0;
      lines.push(`- ${qty}x ${itemName}`);
      if (sizeLabel) lines.push(`  Tamanho: ${sizeLabel}`);
      if (borderLabel) lines.push(`  Borda: ${borderLabel}${borderPrice > 0 ? ` (+${formatCurrencyBRL(borderPrice)})` : ''}`);
      lines.push(`  Valor unit.: ${formatCurrencyBRL(unitPrice)}`);
      lines.push(`  Valor item: ${formatCurrencyBRL(itemSubtotal)}`);
    });
  }
  lines.push('');
  lines.push(`Subtotal: ${formatCurrencyBRL(subtotal)}`);
  lines.push(`Entrega: ${delivery === 0 ? 'Gratis' : formatCurrencyBRL(delivery)}`);
  lines.push(`Total: ${formatCurrencyBRL(total)}`);
  lines.push('');
  lines.push(`Impresso em: ${formatReceiptDateTime()}`);
  return lines.join('\r\n');
}

function buildOrderPrintText(order, options = {}) {
  const baseText = buildThermalOrderPrintText(order, options) || buildFallbackOrderPrintText(order);
  const normalized = baseText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!normalized) return 'Pedido sem conteudo.';
  if (normalized.length > SILENT_PRINT_TEXT_MAX_CHARS) {
    return `${normalized.slice(0, SILENT_PRINT_TEXT_MAX_CHARS)}\n\n[texto truncado para impressao]`;
  }
  return normalized;
}

function parsePrintJobRow(row) {
  if (!row) return null;

  let payload = {};
  try {
    const parsed = JSON.parse(row.payload || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed;
    }
  } catch {
    payload = {};
  }

  const text = String(payload.text || '').trim();
  return {
    id: row.id,
    orderId: row.orderId,
    sourceType: String(row.sourceType || 'order').trim() || 'order',
    sourceId: Number.parseInt(String(row.sourceId || 0), 10) || null,
    orderCode: String(row.orderCode || payload.orderCode || '').trim() || `PED-${row.orderId || ''}`,
    jobKey: String(row.jobKey || '').trim(),
    customerName: String(payload.customerName || '').trim(),
    createdAt: String(payload.createdAt || row.createdAt || '').trim(),
    text,
    operationKind: String(payload.operationKind || '').trim(),
    station: String(payload.station || '').trim(),
    isReprint: Boolean(payload.isReprint),
    originalJobId: Number.parseInt(String(payload.originalJobId || 0), 10) || null,
    reason: String(payload.reason || '').trim(),
    actorName: String(payload.actorName || '').trim(),
    orderSnapshot: payload.orderSnapshot && typeof payload.orderSnapshot === 'object'
      ? payload.orderSnapshot
      : null,
    status: String(row.status || '').trim(),
    attempts: Number.parseInt(String(row.attempts || 0), 10) || 0,
    lastError: String(row.lastError || '').trim(),
    claimedBy: String(row.claimedBy || '').trim(),
    claimedAt: String(row.claimedAt || '').trim(),
    leaseExpiresAt: String(row.leaseExpiresAt || '').trim(),
    completedAt: String(row.completedAt || '').trim(),
  };
}

function buildPrintJobIdentityCode(orderCode, orderId) {
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  const fallbackCode = Number.isFinite(safeOrderId) && safeOrderId > 0 ? `PED-${safeOrderId}` : 'PED';
  const baseCode = trimString(orderCode, 80) || fallbackCode;
  if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) return baseCode;

  const suffix = `-${safeOrderId}`;
  if (baseCode.endsWith(suffix)) return baseCode;

  const maxBaseLength = Math.max(1, 80 - suffix.length);
  return `${baseCode.slice(0, maxBaseLength)}${suffix}`;
}

function enqueueGenericPrintJob({
  orderId = null,
  orderCode = '',
  customerName = '',
  createdAt = '',
  text = '',
  sourceType = 'order',
  sourceId = null,
  jobKey = '',
  operationKind = '',
  station = '',
  isReprint = false,
  originalJobId = null,
  reason = '',
  actorName = '',
  orderSnapshot = null,
} = {}) {
  if (!PRINT_AGENT_ACTIVE) return false;
  const safeOrderId = Number.parseInt(String(orderId || ''), 10);
  const normalizedOrderId = Number.isFinite(safeOrderId) && safeOrderId > 0 ? safeOrderId : null;
  const safeSourceType = trimString(sourceType, 40).replace(/[^a-z0-9_-]/gi, '') || 'order';
  const parsedSourceId = Number.parseInt(String(sourceId || ''), 10);
  const normalizedSourceId = Number.isFinite(parsedSourceId) && parsedSourceId > 0 ? parsedSourceId : null;
  const safeCustomerName = trimString(customerName, 120);
  if (!safeCustomerName) return false;
  const displayOrderCode = trimString(orderCode, 80)
    || (normalizedOrderId ? `PED-${normalizedOrderId}` : `IMP-${Date.now()}`);
  const printJobCode = normalizedOrderId
    ? buildPrintJobIdentityCode(displayOrderCode, normalizedOrderId)
    : displayOrderCode;
  const payload = {
    orderId: normalizedOrderId,
    orderCode: displayOrderCode,
    printJobCode,
    customerName: safeCustomerName,
    createdAt: trimString(createdAt, 80) || new Date().toISOString(),
    text: trimString(text, SILENT_PRINT_TEXT_MAX_CHARS),
    operationKind: trimString(operationKind, 60),
    station: trimString(station, 40),
    isReprint: Boolean(isReprint),
    originalJobId: Number.parseInt(String(originalJobId || ''), 10) || null,
    reason: trimString(reason, 300),
    actorName: trimString(actorName, 120),
    orderSnapshot: orderSnapshot && typeof orderSnapshot === 'object' && !Array.isArray(orderSnapshot)
      ? orderSnapshot
      : null,
  };
  const serialized = JSON.stringify(payload);
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  const maxPrintJobPayloadBytes = MAX_ORDER_LOG_PAYLOAD_BYTES * 2;
  if (serializedBytes > maxPrintJobPayloadBytes) {
    throw new Error(`Comanda excede o limite permitido (${maxPrintJobPayloadBytes} bytes).`);
  }

  const result = db.prepare(`
    INSERT OR IGNORE INTO print_jobs (
      order_id,
      order_code,
      payload,
      source_type,
      source_id,
      job_key,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    normalizedOrderId,
    printJobCode,
    serialized,
    safeSourceType,
    normalizedSourceId,
    trimString(jobKey, 180),
  );

  return Number(result.changes) > 0;
}

function enqueuePrintJobFromOrder(orderLog, {
  reprint = false,
  requestId = '',
  reason = '',
  actorName = '',
} = {}) {
  if (!orderLog || typeof orderLog !== 'object' || Array.isArray(orderLog)) return false;
  if (!isOrderAccepted(orderLog)) return false;
  const orderId = Number.parseInt(String(orderLog.id || ''), 10);
  if (!Number.isFinite(orderId) || orderId <= 0) return false;
  return enqueueGenericPrintJob({
    orderId,
    orderCode: trimString(orderLog.orderCode, 80) || `PED-${orderId}`,
    customerName: trimString(orderLog.customerName, 120),
    createdAt: trimString(orderLog.createdAt, 80),
    text: buildOrderPrintText(orderLog),
    sourceType: reprint ? 'waiter_order_reprint' : 'order',
    sourceId: orderId,
    jobKey: reprint
      ? `order:${orderId}:reprint:${normalizeWaiterRequestId(requestId) || randomUUID()}`
      : `order:${orderId}:initial`,
    operationKind: reprint ? 'waiter_order_reprint' : 'waiter_order_initial',
    station: 'kitchen',
    isReprint: reprint,
    reason,
    actorName,
    orderSnapshot: orderLog,
  });
}

function getPrintJobByKey(jobKey) {
  const safeKey = trimString(jobKey, 180);
  if (!safeKey) return null;
  const row = db.prepare(`
    SELECT
      id,
      order_id AS orderId,
      order_code AS orderCode,
      payload,
      source_type AS sourceType,
      source_id AS sourceId,
      job_key AS jobKey,
      status,
      attempts,
      last_error AS lastError,
      claimed_by AS claimedBy,
      claimed_at AS claimedAt,
      lease_expires_at AS leaseExpiresAt,
      completed_at AS completedAt,
      created_at AS createdAt
    FROM print_jobs
    WHERE job_key = ?
    LIMIT 1
  `).get(safeKey);
  return parsePrintJobRow(row);
}

function describeOrderPrintJob(orderLog, { queued = false } = {}) {
  const orderId = Number.parseInt(String(orderLog?.id || ''), 10);
  return {
    enabled: PRINT_AGENT_ACTIVE,
    queued: Boolean(queued),
    deferred: false,
    error: PRINT_AGENT_ACTIVE
      ? ''
      : 'Agente de impressao nao esta ativo; use a previa para imprimir pelo navegador.',
    previewText: buildOrderPrintText(orderLog),
    job: PRINT_AGENT_ACTIVE && Number.isFinite(orderId) && orderId > 0
      ? getPrintJobByKey(`order:${orderId}:initial`)
      : null,
  };
}

function buildPrintJobResultFromOrder(orderLog) {
  const result = {
    enabled: PRINT_AGENT_ACTIVE,
    queued: false,
    deferred: false,
    error: '',
    previewText: buildOrderPrintText(orderLog),
    job: null,
  };
  if (!isOrderAccepted(orderLog)) {
    result.deferred = true;
    result.error = 'Aguardando confirmacao administrativa antes da impressao.';
    result.previewText = '';
    return result;
  }
  if (!PRINT_AGENT_ACTIVE) {
    result.error = 'Agente de impressao nao esta ativo; use a previa para imprimir pelo navegador.';
    return result;
  }

  try {
    result.queued = enqueuePrintJobFromOrder(orderLog);
    result.job = getPrintJobByKey(`order:${Number(orderLog?.id)}:initial`);
    if (!result.queued) {
      const customerName = trimString(orderLog?.customerName, 120);
      if (!customerName) {
        result.error = 'Comanda nao enfileirada: pedido sem nome do cliente.';
      } else {
        result.error = result.job ? '' : 'Comanda nao enfileirada: ja existe um job para este pedido.';
      }
    }
  } catch (error) {
    result.error = `Falha ao enfileirar comanda: ${String(error?.message || error)}`;
  }

  return result;
}

function cleanupPrintAgentEnrollments() {
  const retentionCutoff = new Date(Date.now() - (7 * 24 * 60 * 60_000)).toISOString();
  db.prepare(`
    DELETE FROM print_agent_enrollments
    WHERE (consumed_at IS NOT NULL AND consumed_at <= ?)
       OR (expires_at <= ?)
  `).run(retentionCutoff, retentionCutoff);
}

function createPrintAgentEnrollment(createdBy) {
  cleanupPrintAgentEnrollments();
  const code = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRINT_AGENT_ENROLLMENT_TTL_MS);
  db.prepare(`
    INSERT INTO print_agent_enrollments (
      code_hash,
      created_by,
      created_at,
      expires_at,
      consumed_at,
      consumed_by_client_id
    )
    VALUES (?, ?, ?, ?, NULL, '')
  `).run(
    hashPrintAgentSecret('enrollment', code),
    trimString(createdBy, 80),
    now.toISOString(),
    expiresAt.toISOString(),
  );
  return { code, expiresAt: expiresAt.toISOString() };
}

function consumePrintAgentEnrollment(code, clientId) {
  const codeHash = hashPrintAgentSecret('enrollment', code);
  const safeClientId = normalizePrintAgentClientId(clientId);
  if (!codeHash || !safeClientId) return null;

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const enrollment = db.prepare(`
      SELECT id
      FROM print_agent_enrollments
      WHERE code_hash = ?
        AND consumed_at IS NULL
        AND expires_at > ?
      LIMIT 1
    `).get(codeHash, now);
    if (!enrollment?.id) {
      db.exec('ROLLBACK;');
      return null;
    }

    const consumed = db.prepare(`
      UPDATE print_agent_enrollments
      SET consumed_at = ?, consumed_by_client_id = ?
      WHERE id = ?
        AND consumed_at IS NULL
        AND expires_at > ?
    `).run(now, safeClientId, enrollment.id, now);
    if (Number(consumed.changes) !== 1) {
      db.exec('ROLLBACK;');
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    const credentialHash = hashPrintAgentSecret('credential', token);
    db.prepare(`
      INSERT INTO print_agent_credentials (
        client_id,
        credential_hash,
        created_at,
        rotated_at,
        last_used_at,
        revoked_at
      )
      VALUES (?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(client_id) DO UPDATE SET
        credential_hash = excluded.credential_hash,
        rotated_at = excluded.created_at,
        last_used_at = NULL,
        revoked_at = NULL
    `).run(safeClientId, credentialHash, now);
    db.exec('COMMIT;');
    return { token, clientId: safeClientId };
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserva o erro original da transacao de enrollment.
    }
    throw error;
  }
}

function discardLatePrintJobs(nowIso = new Date().toISOString()) {
  const cutoffAt = new Date(Date.parse(nowIso) - PRINT_AGENT_MAX_PENDING_AGE_MS).toISOString();
  const result = db.prepare(`
    UPDATE print_jobs
    SET
      status = 'failed',
      last_error = ?,
      claimed_by = '',
      claimed_at = NULL,
      lease_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE (
      status = 'pending'
      OR (
        status = 'processing'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?
      )
    )
      AND datetime(created_at) <= datetime(?)
  `).run(
    'Comanda dispensada: o agente ficou offline por tempo demais. Nao imprimir automaticamente.',
    nowIso,
    cutoffAt,
  );
  return Number(result.changes) || 0;
}

function claimNextPrintJob(clientId = '', printOptions = {}) {
  const safeClientId = trimString(clientId, 120) || 'print-agent';
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + PRINT_AGENT_CLAIM_TTL_MS).toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    discardLatePrintJobs(nowIso);
    db.prepare(`
      UPDATE print_jobs
      SET
        status = 'failed',
        last_error = CASE
          WHEN TRIM(last_error) = '' THEN ?
          ELSE last_error
        END,
        lease_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?
        AND attempts >= ?
    `).run('Lease expirado sem confirmacao do agente.', nowIso, PRINT_AGENT_MAX_ATTEMPTS);

    const candidate = db.prepare(`
      SELECT
        id,
        order_id AS orderId,
        order_code AS orderCode,
        payload,
        source_type AS sourceType,
        source_id AS sourceId,
        job_key AS jobKey,
        status,
        attempts,
        last_error AS lastError,
        claimed_by AS claimedBy,
        claimed_at AS claimedAt,
        lease_expires_at AS leaseExpiresAt,
        completed_at AS completedAt,
        created_at AS createdAt
      FROM print_jobs
      WHERE status = 'pending'
         OR (
           status = 'processing'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at <= ?
           AND attempts < ?
         )
      ORDER BY id ASC
      LIMIT 1
    `).get(nowIso, PRINT_AGENT_MAX_ATTEMPTS);

    if (!candidate) {
      db.exec('COMMIT;');
      return null;
    }

    const updateResult = db.prepare(`
      UPDATE print_jobs
      SET
        status = 'processing',
        attempts = attempts + 1,
        claimed_by = ?,
        claimed_at = ?,
        lease_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(safeClientId, nowIso, leaseExpiresAt, candidate.id);

    if (Number(updateResult.changes) <= 0) {
      db.exec('COMMIT;');
      return null;
    }

    const claimed = db.prepare(`
      SELECT
        id,
        order_id AS orderId,
        order_code AS orderCode,
        payload,
        source_type AS sourceType,
        source_id AS sourceId,
        job_key AS jobKey,
        status,
        attempts,
        last_error AS lastError,
        claimed_by AS claimedBy,
        claimed_at AS claimedAt,
        lease_expires_at AS leaseExpiresAt,
        completed_at AS completedAt,
        created_at AS createdAt
      FROM print_jobs
      WHERE id = ?
      LIMIT 1
    `).get(candidate.id);

    db.exec('COMMIT;');
    const job = parsePrintJobRow(claimed);
    if (job?.orderSnapshot) job.text = buildOrderPrintText(job.orderSnapshot, printOptions);
    return job;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function completePrintJob(jobId, clientId = '') {
  const safeJobId = Number.parseInt(String(jobId || ''), 10);
  if (!Number.isFinite(safeJobId) || safeJobId <= 0) return false;
  const safeClientId = trimString(clientId, 120);
  if (!safeClientId) return false;

  const completedAt = new Date().toISOString();
  const result = db.prepare(`
    UPDATE print_jobs
    SET
      status = 'done',
      lease_expires_at = NULL,
      completed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'processing'
      AND claimed_by = ?
  `).run(completedAt, safeJobId, safeClientId);
  return Number(result.changes) > 0;
}

function failPrintJob(jobId, errorMessage = '', clientId = '') {
  const safeJobId = Number.parseInt(String(jobId || ''), 10);
  if (!Number.isFinite(safeJobId) || safeJobId <= 0) {
    return { updated: false, status: 'invalid_id' };
  }

  const current = db.prepare(`
    SELECT attempts, status, claimed_by AS claimedBy
    FROM print_jobs
    WHERE id = ?
    LIMIT 1
  `).get(safeJobId);
  if (!current) return { updated: false, status: 'not_found' };
  const safeClientId = trimString(clientId, 120);
  if (!safeClientId || String(current.claimedBy || '') !== safeClientId) {
    return { updated: false, status: 'owner_mismatch' };
  }

  const attempts = Number.parseInt(String(current.attempts || 0), 10) || 0;
  const cleanError = trimString(errorMessage, 900);
  const lowerError = cleanError.toLowerCase();
  const probablyPrinted = lowerError.includes('timeout no powershell')
    || (lowerError.includes('powershell') && lowerError.includes('timeout'));
  const nextStatus = probablyPrinted
    ? 'done'
    : attempts >= PRINT_AGENT_MAX_ATTEMPTS
      ? 'failed'
      : 'pending';
  const completedAt = probablyPrinted ? new Date().toISOString() : null;

  const result = db.prepare(`
    UPDATE print_jobs
    SET
      status = ?,
      last_error = ?,
      lease_expires_at = NULL,
      completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END,
      claimed_by = CASE WHEN ? = 'pending' THEN '' ELSE claimed_by END,
      claimed_at = CASE WHEN ? = 'pending' THEN NULL ELSE claimed_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'processing'
      AND claimed_by = ?
  `).run(nextStatus, cleanError, nextStatus, completedAt, nextStatus, nextStatus, safeJobId, safeClientId);

  return {
    updated: Number(result.changes) > 0,
    status: nextStatus,
  };
}

function getPrintJobsStats() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM print_jobs
    GROUP BY status
  `).all();

  const stats = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
  };
  for (const row of rows) {
    const status = String(row?.status || '').trim();
    const total = Number.parseInt(String(row?.total || 0), 10) || 0;
    if (Object.prototype.hasOwnProperty.call(stats, status)) {
      stats[status] = total;
    }
  }
  return stats;
}

function recordPrintAgentHeartbeat(clientId, printOptions = {}) {
  const safeClientId = trimString(clientId, 120) || 'print-agent';
  const printMode = trimString(printOptions?.printMode, 40);
  const paperWidthMm = Number.parseInt(String(printOptions?.paperWidthMm || ''), 10);
  const lastSeenAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO print_agent_heartbeats (
      client_id,
      last_seen_at,
      print_mode,
      paper_width_mm,
      updated_at
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      print_mode = excluded.print_mode,
      paper_width_mm = excluded.paper_width_mm,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    safeClientId,
    lastSeenAt,
    printMode,
    Number.isFinite(paperWidthMm) ? paperWidthMm : null,
  );
}

function getLatestPrintAgentHeartbeat() {
  const row = db.prepare(`
    SELECT
      client_id AS clientId,
      last_seen_at AS lastSeenAt,
      print_mode AS printMode,
      paper_width_mm AS paperWidthMm
    FROM print_agent_heartbeats
    ORDER BY last_seen_at DESC
    LIMIT 1
  `).get();
  if (!row) return { online: false, clientId: '', lastSeenAt: '', printMode: '', paperWidthMm: null };
  const ageMs = Date.now() - new Date(row.lastSeenAt).getTime();
  return {
    ...row,
    online: Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 15_000,
  };
}

function getRequestBaseUrl(req) {
  const forwardedProto = shouldTrustProxyHeaders(req)
    ? getForwardedHeaderFirstValue(req, 'x-forwarded-proto').toLowerCase()
    : '';
  const proto = forwardedProto || (isRequestSecure(req) ? 'https' : 'http');
  const host = headerValueToString(req.headers.host) || `${PUBLIC_HOST}:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function listPrintAgentCredentials() {
  return db.prepare(`
    SELECT
      client_id AS clientId,
      created_at AS createdAt,
      rotated_at AS rotatedAt,
      last_used_at AS lastUsedAt,
      revoked_at AS revokedAt
    FROM print_agent_credentials
    ORDER BY COALESCE(last_used_at, rotated_at, created_at) DESC, client_id ASC
    LIMIT 200
  `).all();
}

function revokePrintAgentCredential(clientId) {
  const safeClientId = normalizePrintAgentClientId(clientId);
  if (!safeClientId) return { error: 'Identificacao do agente invalida.', statusCode: 400 };
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE print_agent_credentials
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE client_id = ?
  `).run(now, safeClientId);
  if (Number(result.changes) !== 1) {
    return { error: 'Credencial do agente nao encontrada.', statusCode: 404 };
  }
  db.prepare('DELETE FROM print_agent_heartbeats WHERE client_id = ?').run(safeClientId);
  const revoked = db.prepare(`
    SELECT revoked_at AS revokedAt
    FROM print_agent_credentials
    WHERE client_id = ?
    LIMIT 1
  `).get(safeClientId);
  return { clientId: safeClientId, revokedAt: String(revoked?.revokedAt || now) };
}

function isPrintAgentOnline() {
  return PRINT_AGENT_ACTIVE && getLatestPrintAgentHeartbeat().online === true;
}

function buildPrintAgentAdminStatus(req) {
  const installerReady = existsSync(PRINT_AGENT_WINDOWS_INSTALLER_EXE_PATH);
  let installerModifiedAt = '';
  let installerSizeBytes = 0;
  if (installerReady) {
    try {
      const installerStats = statSync(PRINT_AGENT_WINDOWS_INSTALLER_EXE_PATH);
      installerModifiedAt = installerStats.mtime.toISOString();
      installerSizeBytes = installerStats.size;
    } catch {
      installerModifiedAt = '';
      installerSizeBytes = 0;
    }
  }
  const installerVersionQuery = installerModifiedAt
    ? `?v=${encodeURIComponent(installerModifiedAt)}`
    : '';

  return {
    ok: true,
    enabled: PRINT_AGENT_ENABLED,
    active: PRINT_AGENT_ACTIVE,
    tokenConfigured: PRINT_AGENT_TOKEN.length > 0,
    legacyTokenAllowed: PRINT_AGENT_ALLOW_LEGACY_TOKEN,
    credentials: listPrintAgentCredentials(),
    serverUrl: getRequestBaseUrl(req),
    installerUrl: `/api/admin/print-agent/installer.exe${installerVersionQuery}`,
    installerReady,
    installerModifiedAt,
    installerSizeBytes,
    agentDownloadUrl: '/api/print-agent/download/windows-agent.mjs',
    appDownloadUrl: '/api/print-agent/download/windows-app.ps1',
    claimTtlMs: PRINT_AGENT_CLAIM_TTL_MS,
    maxAttempts: PRINT_AGENT_MAX_ATTEMPTS,
    stats: PRINT_AGENT_ACTIVE ? getPrintJobsStats() : null,
    agent: PRINT_AGENT_ACTIVE ? getLatestPrintAgentHeartbeat() : null,
  };
}

function toPowerShellLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function toWindowsPathFromWslPath(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return raw;
  const directWindowsPath = raw.match(/^[A-Za-z]:\\/);
  if (directWindowsPath) return raw;
  const mountedDrivePath = raw.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (mountedDrivePath) {
    const drive = String(mountedDrivePath[1]).toUpperCase();
    const rest = String(mountedDrivePath[2] || '').replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return raw.replace(/\//g, '\\');
}

function getPowerShellCandidates() {
  if (process.platform === 'win32') {
    return ['powershell.exe', 'pwsh.exe'];
  }
  if (IS_WSL) {
    return [
      '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      'powershell.exe',
      'pwsh.exe',
    ];
  }
  return [];
}

function runPowerShellWithCommand(command, script, timeoutMs = SILENT_PRINT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: process.platform === 'win32' },
    );
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        child.kill();
      } catch {
        // Ignora erro ao encerrar processo em timeout.
      }
      reject(new Error(`Timeout ao enviar impressao (${timeoutMs}ms).`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, command });
        return;
      }
      const details = (stderr || stdout || '').trim();
      reject(new Error(details || `PowerShell finalizou com codigo ${code}.`));
    });
  });
}

async function runPowerShell(script, timeoutMs = SILENT_PRINT_TIMEOUT_MS) {
  const candidates = getPowerShellCandidates();
  if (!candidates.length) {
    throw new Error(
      `Impressao silenciosa sem confirmacao nao suportada neste ambiente (${process.platform}).`,
    );
  }

  let lastError = null;
  for (const command of candidates) {
    try {
      return await runPowerShellWithCommand(command, script, timeoutMs);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '').toLowerCase();
      const isCommandMissing = error?.code === 'ENOENT'
        || message.includes('not found')
        || message.includes('nao foi reconhecido')
        || message.includes('não foi reconhecido');
      if (isCommandMissing) {
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('PowerShell indisponivel para impressao silenciosa.');
}

async function printTextSilently(text, printerName = '') {
  if (!SILENT_PRINT_ENABLED) {
    const error = new Error('Impressao silenciosa desativada no servidor.');
    error.code = 'SILENT_PRINT_DISABLED';
    throw error;
  }
  if (!SILENT_PRINT_SERVER_CAPABLE) {
    const error = new Error(`Impressao silenciosa sem confirmacao exige Windows/WSL (ambiente atual: ${process.platform}).`);
    error.code = 'SILENT_PRINT_UNSUPPORTED_ENV';
    throw error;
  }

  const payload = String(text || '').trim();
  if (!payload) throw new Error('Conteudo vazio para impressao.');

  const tempRoot = IS_WSL ? '/mnt/c/Windows/Temp' : os.tmpdir();
  const tempPath = path.join(tempRoot, `bf-order-print-${Date.now()}-${randomUUID()}.txt`);
  await writeFile(tempPath, `${payload}\r\n`, 'utf8');
  const selectedPrinter = String(printerName || SILENT_PRINT_PRINTER || '').trim();
  const printablePath = IS_WSL ? toWindowsPathFromWslPath(tempPath) : tempPath;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$Path = ${toPowerShellLiteral(printablePath)}`,
    `$Printer = ${toPowerShellLiteral(selectedPrinter)}`,
    'if ($Printer -and $Printer.Trim().Length -gt 0) {',
    '  Get-Content -LiteralPath $Path -Encoding UTF8 | Out-Printer -Name $Printer',
    '} else {',
    '  Get-Content -LiteralPath $Path -Encoding UTF8 | Out-Printer',
    '}',
  ].join('; ');

  try {
    await runPowerShell(script, SILENT_PRINT_TIMEOUT_MS);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignora erro de limpeza de arquivo temporario.
    }
  }
}

async function printOrderLogSilently(orderLog, printerName = '') {
  const text = buildOrderPrintText(orderLog);
  await printTextSilently(text, printerName);
}

function buildSilentPrintTestText() {
  const lines = [
    'TESTE DE IMPRESSAO SILENCIOSA',
    `Data: ${formatReceiptDateTime()}`,
    '',
    'Se voce recebeu este cupom sem popup,',
    'a autoimpressao direta esta ativa.',
  ];
  return lines.join('\r\n');
}

function isValidSectionValue(section, value) {
  const expected = SECTION_SCHEMA[section];
  if (!expected) return false;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return false;
}

function toBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'sim') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'nao') return false;
  }
  return defaultValue;
}

function isValidGtinDigits(value) {
  return [8, 12, 13, 14].includes(String(value || '').length);
}

function normalizeOptionalRate(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric < 0) return 0;
  return Number(numeric.toFixed(2));
}

function normalizeOptionalFactor(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric <= 0) return null;
  return Number(numeric.toFixed(4));
}

function sanitizeProductImage(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { image: '' };

  if (LOCAL_CATALOG_IMAGE_PATH_PATTERN.test(raw)) {
    return { image: raw };
  }

  const dataUrlMatch = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrlMatch) {
    const mimeRaw = String(dataUrlMatch[1] || '').toLowerCase();
    const mimeType = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw;
    if (!PRODUCT_IMAGE_ALLOWED_MIME_TYPES.has(mimeType)) {
      return { error: 'Imagem do produto com tipo nao suportado.' };
    }

    const base64 = String(dataUrlMatch[2] || '').replace(/\s+/g, '');
    if (!base64) return { error: 'Imagem do produto vazia.' };

    const maxDataUrlChars = Math.ceil(MAX_PRODUCT_IMAGE_BYTES * 1.5) + 512;
    if (raw.length > maxDataUrlChars) {
      return { error: `Imagem do produto excede o limite permitido (${MAX_PRODUCT_IMAGE_BYTES} bytes).` };
    }

    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return { error: 'Imagem do produto em base64 invalida.' };
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return { error: 'Imagem do produto vazia.' };
    }

    const normalizedInput = base64.replace(/=+$/g, '');
    const normalizedDecoded = buffer.toString('base64').replace(/=+$/g, '');
    if (normalizedInput !== normalizedDecoded) {
      return { error: 'Imagem do produto em base64 invalida.' };
    }

    if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
      return { error: `Imagem do produto excede o limite permitido (${MAX_PRODUCT_IMAGE_BYTES} bytes).` };
    }

    try {
      const materialized = persistCatalogDataImage(
        `data:${mimeType};base64,${buffer.toString('base64')}`,
        { assetsDir: CATALOG_ASSETS_DIR },
      );
      return { image: materialized.value };
    } catch (error) {
      console.error('Falha ao persistir imagem do produto no catalogo.', error);
      return { error: 'Falha ao salvar imagem do produto.' };
    }
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Imagem do produto deve usar URL http/https, arquivo local do catalogo ou data:image.' };
    }
    const href = parsed.toString();
    if (href.length > MAX_PRODUCT_IMAGE_URL_CHARS) {
      return { error: `URL da imagem do produto excede o limite permitido (${MAX_PRODUCT_IMAGE_URL_CHARS} caracteres).` };
    }
    return { image: href };
  } catch {
    return { error: 'Imagem do produto invalida.' };
  }
}

function sanitizeProductPayload(rawProduct) {
  if (!rawProduct || typeof rawProduct !== 'object' || Array.isArray(rawProduct)) {
    return { error: 'Produto inválido.' };
  }

  const id = trimString(rawProduct.id, 140);
  if (!id) return { error: 'ID do produto é obrigatório.' };

  const name = trimString(rawProduct.name, 180);
  if (!name) return { error: 'Nome do produto é obrigatório.' };

  const category = trimString(rawProduct.category, 140);
  if (!category) return { error: 'Categoria do produto é obrigatória.' };

  const priceValue = toFiniteNumber(rawProduct.price);
  if (priceValue === null || priceValue < 0) {
    return { error: 'Preço do produto inválido.' };
  }

  const oldPriceValue = toFiniteNumber(rawProduct.oldPrice);
  const oldPrice = oldPriceValue !== null && oldPriceValue > priceValue
    ? Number(oldPriceValue.toFixed(2))
    : null;

  const imageResult = sanitizeProductImage(rawProduct.image);
  if (imageResult.error) return { error: imageResult.error };
  const image = imageResult.image;
  const barcode = onlyDigits(rawProduct.barcode || rawProduct.gtin || rawProduct.ean, 14);
  if (barcode && !isValidGtinDigits(barcode)) {
    return { error: 'GTIN/EAN do produto deve ter 8, 12, 13 ou 14 digitos.' };
  }
  const fiscalCode = trimString(rawProduct.fiscalCode || rawProduct.sku, 60).replace(/[^A-Za-z0-9._-]/g, '');
  const tributaryFactor = normalizeOptionalFactor(rawProduct.tributaryFactor ?? rawProduct.tribFactor);

  return {
    product: {
      id,
      name,
      category,
      emoji: trimString(rawProduct.emoji, 20) || '🍕',
      price: Number(priceValue.toFixed(2)),
      oldPrice,
      description: trimString(rawProduct.description, 2200),
      ingredients: trimString(rawProduct.ingredients, 2200),
      size: trimString(rawProduct.size, 160),
      observations: trimString(rawProduct.observations, 2000),
      badge: trimString(rawProduct.badge, 80),
      featured: toBoolean(rawProduct.featured, false),
      active: toBoolean(rawProduct.active, true),
      trackStock: toBoolean(rawProduct.trackStock, false),
      minimumStock: Math.max(0, toFiniteNumber(rawProduct.minimumStock) || 0),
      stockUnit: trimString(rawProduct.stockUnit || rawProduct.unit, 12).toUpperCase() || 'UN',
      fiscalCode,
      barcode,
      fiscalName: trimString(rawProduct.fiscalName, 160),
      ncm: onlyDigits(rawProduct.ncm, 8),
      cest: onlyDigits(rawProduct.cest, 7),
      cfop: onlyDigits(rawProduct.cfop, 4),
      csosn: trimString(rawProduct.csosn, 4),
      cst: trimString(rawProduct.cst, 4),
      origin: trimString(rawProduct.origin, 1),
      unit: trimString(rawProduct.unit, 6).toUpperCase(),
      tributaryUnit: trimString(rawProduct.tributaryUnit || rawProduct.tribUnit || rawProduct.unit, 6).toUpperCase(),
      tributaryFactor,
      aliquotaIcms: normalizeMoneyValue(rawProduct.aliquotaIcms, 0),
      vBCSTRet: trimString(rawProduct.vBCSTRet, 40) || null,
      pST: trimString(rawProduct.pST, 40) || null,
      vICMSSubstituto: trimString(rawProduct.vICMSSubstituto, 40) || null,
      vICMSSTRet: trimString(rawProduct.vICMSSTRet, 40) || null,
      vBCFCPSTRet: trimString(rawProduct.vBCFCPSTRet, 40) || null,
      pFCPSTRet: trimString(rawProduct.pFCPSTRet, 40) || null,
      vFCPSTRet: trimString(rawProduct.vFCPSTRet, 40) || null,
      pRedBCEfet: trimString(rawProduct.pRedBCEfet, 40) || null,
      vBCEfet: trimString(rawProduct.vBCEfet, 40) || null,
      pICMSEfet: trimString(rawProduct.pICMSEfet, 40) || null,
      vICMSEfet: trimString(rawProduct.vICMSEfet, 40) || null,
      pisCst: normalizeNfeTaxCst(rawProduct.pisCst, ''),
      pisAliquota: normalizeOptionalRate(rawProduct.pisAliquota),
      cofinsCst: normalizeNfeTaxCst(rawProduct.cofinsCst, ''),
      cofinsAliquota: normalizeOptionalRate(rawProduct.cofinsAliquota),
      benefitCode: trimString(rawProduct.benefitCode || rawProduct.cBenef, 10),
      fiscalReviewRequired: rawProduct.fiscalReviewRequired === true,
      fiscalEmissionBlocked: rawProduct.fiscalEmissionBlocked === true,
      fiscalProfileSource: trimString(rawProduct.fiscalProfileSource, 240),
      fiscalProfileNote: trimString(rawProduct.fiscalProfileNote, 1000),
      image,
    },
  };
}

function upsertProduct(rawProduct) {
  const sanitized = sanitizeProductPayload(rawProduct);
  if (sanitized.error) return sanitized;

  const state = readState();
  const products = Array.isArray(state.products) ? [...state.products] : [];
  const idx = products.findIndex((item) => trimString(item?.id, 140) === sanitized.product.id);
  const created = idx < 0;

  if (created) {
    products.push(sanitized.product);
  } else {
    products[idx] = sanitized.product;
  }

  try {
    writeSections({ products });
  } catch (error) {
    if (Number(error?.statusCode || 0) >= 400) {
      return {
        error: String(error.message || 'Alteracao de produto bloqueada.'),
        statusCode: Number(error.statusCode),
        code: String(error.code || 'PRODUCT_MUTATION_BLOCKED'),
        linkedReferences: error.linkedReferences || {},
      };
    }
    throw error;
  }
  return {
    product: sanitized.product,
    created,
    totalProducts: products.length,
  };
}

function deleteProductById(rawId) {
  const id = trimString(rawId, 140);
  if (!id) return { error: 'ID do produto inválido.' };

  const state = readState();
  const products = Array.isArray(state.products) ? [...state.products] : [];
  const nextProducts = products.filter((item) => trimString(item?.id, 140) !== id);

  if (nextProducts.length === products.length) {
    return { deleted: false };
  }

  try {
    writeSections({ products: nextProducts });
  } catch (error) {
    if (Number(error?.statusCode || 0) >= 400) {
      return {
        error: String(error.message || 'Exclusao de produto bloqueada.'),
        statusCode: Number(error.statusCode),
        code: String(error.code || 'PRODUCT_DELETE_BLOCKED'),
        linkedReferences: error.linkedReferences || {},
      };
    }
    throw error;
  }
  return { deleted: true };
}

function parseCookies(cookieHeader) {
  const cookies = {};
  const raw = String(cookieHeader || '').trim();
  if (!raw) return cookies;

  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function migrateAdminAccountSchema() {
  const columns = db.prepare('PRAGMA table_info(admin_account);').all();
  if (!columns.some((column) => String(column.name || '').toLowerCase() === 'id')) {
    throw new Error('Schema de admin_account invalido: coluna id ausente. Inicializacao cancelada.');
  }

  ensureTableColumn('admin_account', 'username', "username TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('admin_account', 'display_name', "display_name TEXT NOT NULL DEFAULT 'Administrador'");
  ensureTableColumn('admin_account', 'password_hash', "password_hash TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('admin_account', 'session_version', 'session_version INTEGER NOT NULL DEFAULT 1');
  ensureTableColumn('admin_account', 'password_changed_at', "password_changed_at TEXT NOT NULL DEFAULT ''");
  ensureTableColumn('admin_account', 'updated_at', "updated_at TEXT NOT NULL DEFAULT ''");

  db.prepare(`
    UPDATE admin_account
    SET username = CASE WHEN TRIM(username) = '' THEN ? ELSE username END,
        display_name = CASE WHEN TRIM(display_name) = '' THEN 'Administrador' ELSE display_name END,
        session_version = CASE WHEN session_version IS NULL OR session_version < 1 THEN 1 ELSE session_version END,
        password_changed_at = CASE
          WHEN TRIM(password_changed_at) = '' AND TRIM(password_hash) <> '' THEN CURRENT_TIMESTAMP
          ELSE password_changed_at
        END,
        updated_at = CASE WHEN TRIM(updated_at) = '' THEN CURRENT_TIMESTAMP ELSE updated_at END
    WHERE id = 1
  `).run(ADMIN_USER);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_account_username_nocase
    ON admin_account (username COLLATE NOCASE);
  `);
}

function clearAdminBootstrapPassword() {
  ADMIN_BOOTSTRAP_PASSWORD = '';
  try {
    process.env.ADMIN_PASSWORD = '';
    delete process.env.ADMIN_PASSWORD;
  } catch {
    // O processo sera encerrado se o bootstrap falhar; nao retemos outra copia no modulo.
  }
}

function initializeAdminAccount() {
  try {
    const existing = db.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM admin_account
      WHERE id = 1
    `).get();
    const existingHash = String(existing?.passwordHash || '').trim();
    if (existingHash) {
      if (!isWaiterPasswordHashWellFormed(existingHash)) {
        throw new Error('Hash da conta administrativa invalido. Inicializacao cancelada sem redefinir a senha.');
      }
      return { created: false };
    }

    if (!ADMIN_BOOTSTRAP_PASSWORD) {
      throw new Error(
        'ADMIN_PASSWORD e obrigatorio somente para inicializar um banco sem conta administrativa.',
      );
    }
    const validation = validateAdminPassword(ADMIN_BOOTSTRAP_PASSWORD);
    if (validation.error) {
      throw new Error(`ADMIN_PASSWORD invalido: ${validation.error}`);
    }
    const passwordHash = hashWaiterPassword(validation.password);
    if (existing) {
      db.prepare(`
        UPDATE admin_account
        SET username = ?,
            display_name = CASE WHEN TRIM(display_name) = '' THEN 'Administrador' ELSE display_name END,
            password_hash = ?,
            session_version = CASE WHEN session_version < 1 THEN 1 ELSE session_version END,
            password_changed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(ADMIN_USER, passwordHash);
    } else {
      db.prepare(`
        INSERT INTO admin_account (id, username, display_name, password_hash)
        VALUES (1, ?, ?, ?)
      `).run(ADMIN_USER, 'Administrador', passwordHash);
    }
    return { created: true };
  } finally {
    clearAdminBootstrapPassword();
  }
}

function getAdminAccount({ includeHash = false } = {}) {
  const row = db.prepare(`
    SELECT
      username,
      display_name AS displayName,
      password_hash AS passwordHash,
      session_version AS sessionVersion,
      password_changed_at AS passwordChangedAt,
      updated_at AS updatedAt
    FROM admin_account
    WHERE id = 1
  `).get();
  if (!row) return null;
  const account = {
    username: String(row.username || ADMIN_USER),
    displayName: String(row.displayName || 'Administrador'),
    sessionVersion: Number(row.sessionVersion || 1),
    passwordChangedAt: String(row.passwordChangedAt || ''),
    updatedAt: String(row.updatedAt || ''),
  };
  if (includeHash) account.passwordHash = String(row.passwordHash || '');
  return account;
}

function verifyAdminPassword(account, password) {
  return verifyWaiterPassword(account?.passwordHash || getWaiterDummyPasswordHash(), password);
}

function deriveAdminCsrfToken(rawSessionToken) {
  const token = String(rawSessionToken || '');
  if (!token || token.length > 200) return '';
  return createHmac('sha256', DATA_ENCRYPTION_KEY)
    .update(`admin-csrf:v1\0${token}`, 'utf8')
    .digest('base64url');
}

function isValidAdminCsrfRequest(req, session) {
  const received = headerValueToString(req.headers['x-admin-csrf']);
  return Boolean(received && session && secureCompare(deriveAdminCsrfToken(session.token), received));
}

function updateAdminAccount({ displayName, currentPassword, newPassword }) {
  const account = getAdminAccount({ includeHash: true });
  if (!account || !verifyAdminPassword(account, currentPassword)) {
    return { error: 'Senha atual incorreta.', statusCode: 401 };
  }

  const normalizedName = normalizeAdminDisplayName(displayName);
  if (!normalizedName) {
    return { error: 'Informe um nome entre 2 e 60 caracteres.', statusCode: 400 };
  }

  const wantsPasswordChange = String(newPassword || '').length > 0;
  let passwordHash = account.passwordHash;
  if (wantsPasswordChange) {
    const validation = validateAdminPassword(newPassword);
    if (validation.error) return { error: validation.error, statusCode: 400 };
    if (secureCompare(String(currentPassword || ''), validation.password)) {
      return { error: 'A nova senha deve ser diferente da senha atual.', statusCode: 400 };
    }
    passwordHash = hashWaiterPassword(validation.password);
  }

  const displayNameChanged = normalizedName !== account.displayName;
  const changed = displayNameChanged || wantsPasswordChange;
  if (!changed) {
    return { error: 'Nenhuma alteração foi informada.', statusCode: 400 };
  }

  const updateResult = db.prepare(`
    UPDATE admin_account
    SET display_name = ?,
        password_hash = ?,
        session_version = session_version + ?,
        password_changed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE password_changed_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND session_version = ?
      AND password_hash = ?
      AND display_name = ?
  `).run(
    normalizedName,
    passwordHash,
    wantsPasswordChange ? 1 : 0,
    wantsPasswordChange ? 1 : 0,
    account.sessionVersion,
    account.passwordHash,
    account.displayName,
  );
  if (Number(updateResult.changes) !== 1) {
    return {
      error: 'A conta foi alterada em outra sessao. Atualize a pagina e tente novamente.',
      statusCode: 409,
    };
  }

  if (displayNameChanged) {
    db.prepare(`
      UPDATE waiter_sessions
      SET actor_name = ?
      WHERE user_id IS NULL
        AND actor_role = 'admin'
        AND revoked_at IS NULL
    `).run(normalizedName);
  }

  return {
    account: getAdminAccount(),
    displayNameChanged,
    passwordChanged: wantsPasswordChange,
  };
}

function clearExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, session] of ADMIN_SESSIONS.entries()) {
    if (!session || session.expiresAt <= now) {
      ADMIN_SESSIONS.delete(token);
    }
  }
}

function createAdminSession(account = getAdminAccount()) {
  clearExpiredAdminSessions();
  const token = randomUUID();
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  ADMIN_SESSIONS.set(token, {
    user: account?.username || ADMIN_USER,
    displayName: account?.displayName || 'Administrador',
    sessionVersion: Number(account?.sessionVersion || 1),
    expiresAt,
  });
  return token;
}

function getAdminSession(req) {
  clearExpiredAdminSessions();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const session = ADMIN_SESSIONS.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    ADMIN_SESSIONS.delete(token);
    return null;
  }
  const account = getAdminAccount();
  if (!account || Number(session.sessionVersion || 0) !== Number(account.sessionVersion || 0)) {
    ADMIN_SESSIONS.delete(token);
    return null;
  }
  session.user = account.username;
  session.displayName = account.displayName;
  return { token, ...session };
}

function deleteAdminSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (token) ADMIN_SESSIONS.delete(token);
}

function buildAdminSessionCookie(req, token) {
  const maxAge = Math.max(60, Math.floor(ADMIN_SESSION_TTL_MS / 1000));
  const secureAttr = isRequestSecure(req) ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secureAttr}`;
}

function buildClearAdminSessionCookie(req) {
  const secureAttr = isRequestSecure(req) ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secureAttr}`;
}

function hashSessionSecret(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('base64url');
}

function toWaiterUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: String(row.username || ''),
    displayName: String(row.displayName ?? row.display_name ?? ''),
    role: String(row.role || 'waiter'),
    active: Boolean(row.active),
    sessionVersion: Number(row.sessionVersion ?? row.session_version ?? 1),
    lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? '',
    passwordChangedAt: row.passwordChangedAt ?? row.password_changed_at ?? '',
    createdAt: row.createdAt ?? row.created_at ?? '',
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
  };
}

function listWaiterUsers({ activeOnly = false } = {}) {
  const rows = db.prepare(`
    SELECT
      id,
      username,
      display_name AS displayName,
      role,
      active,
      session_version AS sessionVersion,
      last_login_at AS lastLoginAt,
      password_changed_at AS passwordChangedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM waiter_users
    ${activeOnly ? 'WHERE active = 1' : ''}
    ORDER BY active DESC, display_name COLLATE NOCASE ASC, id ASC
  `).all();
  return rows.map(toWaiterUser);
}

function getWaiterUserByUsername(rawUsername, { includeHash = false } = {}) {
  const username = normalizeWaiterUsername(rawUsername);
  if (!username) return null;
  const row = db.prepare(`
    SELECT
      id,
      username,
      display_name AS displayName,
      role,
      password_hash AS passwordHash,
      active,
      session_version AS sessionVersion,
      last_login_at AS lastLoginAt,
      password_changed_at AS passwordChangedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM waiter_users
    WHERE username = ? COLLATE NOCASE
    LIMIT 1
  `).get(username);
  if (!row) return null;
  const user = toWaiterUser(row);
  if (includeHash) user.passwordHash = String(row.passwordHash || '');
  return user;
}

function getWaiterUserById(rawId, { includeHash = false } = {}) {
  const id = Number.parseInt(String(rawId || ''), 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = db.prepare(`
    SELECT
      id,
      username,
      display_name AS displayName,
      role,
      password_hash AS passwordHash,
      active,
      session_version AS sessionVersion,
      last_login_at AS lastLoginAt,
      password_changed_at AS passwordChangedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM waiter_users
    WHERE id = ?
    LIMIT 1
  `).get(id);
  if (!row) return null;
  const user = toWaiterUser(row);
  if (includeHash) user.passwordHash = String(row.passwordHash || '');
  return user;
}

function createWaiterUser(rawPayload = {}) {
  const username = normalizeWaiterUsername(rawPayload?.username);
  if (!username) {
    return { error: 'Use de 3 a 40 caracteres no usuario: letras minusculas, numeros, ponto, traco ou sublinhado.', statusCode: 400 };
  }
  const displayName = trimString(rawPayload?.displayName, 80);
  if (displayName.length < 2) return { error: 'Informe o nome do funcionario.', statusCode: 400 };
  const role = normalizeWaiterRole(rawPayload?.role || 'waiter');
  if (!role) return { error: 'Funcao invalida.', statusCode: 400 };
  const validation = validateWaiterPassword(rawPayload?.password);
  if (validation.error) return { error: validation.error, statusCode: 400 };
  let passwordHash;
  try {
    passwordHash = hashWaiterPassword(validation.password);
  } catch (error) {
    return { error: String(error?.message || 'Senha invalida.'), statusCode: 400 };
  }
  try {
    const result = db.prepare(`
      INSERT INTO waiter_users (
        username, display_name, role, password_hash, active,
        session_version, password_changed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(username, displayName, role, passwordHash);
    checkpointWal('PASSIVE');
    return { user: getWaiterUserById(Number(result.lastInsertRowid)) };
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return { error: 'Este usuario ja existe.', statusCode: 409 };
    }
    throw error;
  }
}

function revokeWaiterUserSessions(userId) {
  const safeUserId = Number.parseInt(String(userId || ''), 10);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return 0;
  const result = db.prepare(`
    UPDATE waiter_sessions
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(safeUserId);
  return Number(result.changes || 0);
}

function updateWaiterUser(rawId, rawPayload = {}) {
  const existing = getWaiterUserById(rawId, { includeHash: true });
  if (!existing) return { error: 'Funcionario nao encontrado.', statusCode: 404 };
  const username = rawPayload?.username == null
    ? existing.username
    : normalizeWaiterUsername(rawPayload.username);
  if (!username) return { error: 'Usuario invalido.', statusCode: 400 };
  const displayName = rawPayload?.displayName == null
    ? existing.displayName
    : trimString(rawPayload.displayName, 80);
  if (displayName.length < 2) return { error: 'Informe o nome do funcionario.', statusCode: 400 };
  const role = rawPayload?.role == null ? existing.role : normalizeWaiterRole(rawPayload.role);
  if (!role) return { error: 'Funcao invalida.', statusCode: 400 };
  const active = rawPayload?.active == null ? existing.active : Boolean(rawPayload.active);
  const hasNewPassword = String(rawPayload?.password || '').length > 0;
  let passwordHash = existing.passwordHash;
  if (hasNewPassword) {
    const validation = validateWaiterPassword(rawPayload.password);
    if (validation.error) return { error: validation.error, statusCode: 400 };
    passwordHash = hashWaiterPassword(validation.password);
  }
  const securityChanged = hasNewPassword || role !== existing.role || active !== existing.active;
  try {
    db.exec('BEGIN IMMEDIATE;');
    db.prepare(`
      UPDATE waiter_users
      SET username = ?, display_name = ?, role = ?, password_hash = ?, active = ?,
        session_version = session_version + ?,
        password_changed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE password_changed_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      username,
      displayName,
      role,
      passwordHash,
      active ? 1 : 0,
      securityChanged ? 1 : 0,
      hasNewPassword ? 1 : 0,
      existing.id,
    );
    if (securityChanged) revokeWaiterUserSessions(existing.id);
    db.exec('COMMIT;');
    checkpointWal('PASSIVE');
    return { user: getWaiterUserById(existing.id), sessionsRevoked: securityChanged };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* Preserva o erro original. */ }
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return { error: 'Este usuario ja existe.', statusCode: 409 };
    }
    throw error;
  }
}

function cleanupWaiterSessions() {
  const nowIso = new Date().toISOString();
  db.prepare(`
    DELETE FROM waiter_sessions
    WHERE absolute_expires_at <= ?
       OR idle_expires_at <= ?
       OR (revoked_at IS NOT NULL AND revoked_at <= datetime('now', '-7 days'))
  `).run(nowIso, nowIso);
}

function createWaiterSession(req, actor) {
  cleanupWaiterSessions();
  const token = randomBytes(32).toString('base64url');
  const csrfToken = deriveWaiterCsrfToken(token);
  const sessionId = randomUUID();
  const createdAt = new Date();
  const idleExpiresAt = new Date(createdAt.getTime() + WAITER_SESSION_IDLE_MS);
  const absoluteExpiresAt = new Date(createdAt.getTime() + WAITER_SESSION_ABSOLUTE_MS);
  db.prepare(`
    INSERT INTO waiter_sessions (
      id, token_hash, csrf_hash, user_id, actor_username, actor_name, actor_role,
      session_version, created_at, last_seen_at, idle_expires_at, absolute_expires_at,
      revoked_at, client_ip, user_agent
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    sessionId,
    hashSessionSecret(token),
    hashSessionSecret(csrfToken),
    actor.userId || null,
    trimString(actor.username, 40),
    trimString(actor.displayName, 80),
    trimString(actor.role, 20),
    Number(actor.sessionVersion || 1),
    createdAt.toISOString(),
    createdAt.toISOString(),
    idleExpiresAt.toISOString(),
    absoluteExpiresAt.toISOString(),
    trimString(getClientIp(req), 100),
    trimString(req.headers['user-agent'], 300),
  );
  return { token, csrfToken, sessionId, absoluteExpiresAt: absoluteExpiresAt.toISOString() };
}

function getWaiterSession(req) {
  cleanupWaiterSessions();
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[WAITER_SESSION_COOKIE];
  if (!rawToken || rawToken.length > 200) return null;
  const row = db.prepare(`
    SELECT
      ws.id,
      ws.csrf_hash AS csrfHash,
      ws.user_id AS userId,
      ws.actor_username AS actorUsername,
      ws.actor_name AS actorName,
      ws.actor_role AS actorRole,
      ws.session_version AS sessionVersion,
      ws.created_at AS createdAt,
      ws.last_seen_at AS lastSeenAt,
      ws.idle_expires_at AS idleExpiresAt,
      ws.absolute_expires_at AS absoluteExpiresAt,
      wu.username AS currentUsername,
      wu.display_name AS currentName,
      wu.role AS currentRole,
      wu.active AS userActive,
      wu.session_version AS currentSessionVersion
    FROM waiter_sessions ws
    LEFT JOIN waiter_users wu ON wu.id = ws.user_id
    WHERE ws.token_hash = ? AND ws.revoked_at IS NULL
    LIMIT 1
  `).get(hashSessionSecret(rawToken));
  if (!row) return null;
  const now = Date.now();
  const invalidExpiry = new Date(row.idleExpiresAt).getTime() <= now
    || new Date(row.absoluteExpiresAt).getTime() <= now;
  const invalidUser = row.userId != null && (
    !Boolean(row.userActive)
    || Number(row.currentSessionVersion || 0) !== Number(row.sessionVersion || 0)
  );
  const invalidAdminFallback = row.userId == null
    && String(row.actorRole || '') === 'admin'
    && Number(row.sessionVersion || 0) !== Number(getAdminAccount()?.sessionVersion || 0);
  if (invalidExpiry || invalidUser || invalidAdminFallback) {
    db.prepare(`UPDATE waiter_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
    return null;
  }
  const actor = {
    source: 'waiter',
    sessionId: String(row.id),
    csrfHash: String(row.csrfHash || ''),
    userId: row.userId == null ? null : Number(row.userId),
    username: String(row.currentUsername || row.actorUsername || ''),
    displayName: String(row.currentName || row.actorName || ''),
    role: String(row.currentRole || row.actorRole || 'waiter'),
    createdAt: String(row.createdAt || ''),
    absoluteExpiresAt: String(row.absoluteExpiresAt || ''),
  };
  const lastSeenMs = new Date(row.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs) || (now - lastSeenMs) >= WAITER_SESSION_TOUCH_MS) {
    const nextIdleMs = Math.min(
      now + WAITER_SESSION_IDLE_MS,
      new Date(row.absoluteExpiresAt).getTime(),
    );
    db.prepare(`
      UPDATE waiter_sessions
      SET last_seen_at = ?, idle_expires_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(new Date(now).toISOString(), new Date(nextIdleMs).toISOString(), row.id);
  }
  return actor;
}

function getWaiterActor(req) {
  const waiterSession = getWaiterSession(req);
  if (waiterSession) return waiterSession;
  const adminSession = getAdminSession(req);
  if (!adminSession) return null;
  return {
    source: 'admin',
    sessionId: adminSession.token,
    userId: null,
    username: String(adminSession.user || ADMIN_USER),
    displayName: 'Administrador',
    role: 'admin',
    absoluteExpiresAt: new Date(adminSession.expiresAt).toISOString(),
  };
}

function deleteWaiterSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[WAITER_SESSION_COOKIE];
  if (!rawToken || rawToken.length > 200) return;
  db.prepare(`
    UPDATE waiter_sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(hashSessionSecret(rawToken));
}

function buildWaiterSessionCookie(req, token) {
  const maxAge = Math.max(60, Math.floor(WAITER_SESSION_ABSOLUTE_MS / 1000));
  const secureAttr = isRequestSecure(req) ? '; Secure' : '';
  return `${WAITER_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secureAttr}`;
}

function buildClearWaiterSessionCookie(req) {
  const secureAttr = isRequestSecure(req) ? '; Secure' : '';
  return `${WAITER_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secureAttr}`;
}

function authorizeWaiterRequest(req, allowedRoles = ['waiter', 'manager', 'admin']) {
  const actor = getWaiterActor(req);
  if (!actor) return { error: 'Nao autenticado.', statusCode: 401 };
  if (!allowedRoles.includes(actor.role)) return { error: 'Voce nao tem permissao para esta acao.', statusCode: 403 };
  if (actor.source === 'waiter' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const received = headerValueToString(req.headers['x-waiter-csrf']);
    if (!received || !secureCompare(actor.csrfHash, hashSessionSecret(received))) {
      return { error: 'Sessao de seguranca invalida. Atualize a pagina e tente novamente.', statusCode: 403 };
    }
  }
  return { actor };
}

function waiterActorKey(actor) {
  return actor?.userId ? `user:${actor.userId}` : `${actor?.source || 'unknown'}:${actor?.username || ''}`;
}

function checkWaiterReprintRate(actor) {
  const result = checkSlidingRateLimit(
    WAITER_REPRINT_RATE_LIMIT,
    waiterActorKey(actor),
    WAITER_REPRINT_MAX_REQUESTS,
    WAITER_REPRINT_WINDOW_MS,
    { blockMs: WAITER_REPRINT_WINDOW_MS, blockAfter: 3 },
  );
  if (!result.limited) return { ok: true };
  return {
    error: 'Muitas reimpressoes em pouco tempo. Aguarde antes de tentar novamente.',
    code: 'WAITER_REPRINT_RATE_LIMIT',
    statusCode: 429,
    retryAfterSeconds: Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
  };
}

function waiterRequestContext(req) {
  return {
    clientIp: trimString(getClientIp(req), 100),
    userAgent: trimString(req.headers['user-agent'], 300),
  };
}

function recordWaiterAuditEvent(actor, action, details = {}) {
  const safeAction = trimString(action, 80);
  if (!safeAction) return null;
  let detailsJson = '{}';
  try {
    detailsJson = JSON.stringify(details?.details && typeof details.details === 'object' ? details.details : {});
  } catch {
    detailsJson = '{}';
  }
  if (Buffer.byteLength(detailsJson, 'utf8') > 12 * 1024) detailsJson = '{"truncated":true}';
  const result = db.prepare(`
    INSERT INTO waiter_audit_events (
      actor_user_id, actor_username, actor_name, actor_role, action,
      tab_id, table_id, order_id, line_item_id, request_id, reason,
      details_json, client_ip, user_agent, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    actor?.userId || null,
    trimString(actor?.username, 40),
    trimString(actor?.displayName, 80),
    trimString(actor?.role, 20),
    safeAction,
    Number.parseInt(String(details?.tabId || ''), 10) || null,
    Number.parseInt(String(details?.tableId || ''), 10) || null,
    Number.parseInt(String(details?.orderId || ''), 10) || null,
    trimString(details?.lineItemId, 120),
    trimString(details?.requestId, 120),
    trimString(details?.reason, 300),
    detailsJson,
    trimString(details?.context?.clientIp, 100),
    trimString(details?.context?.userAgent, 300),
  );
  return Number(result.lastInsertRowid);
}

function listWaiterAuditEvents(limit = 200) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 200), 10) || 200, 1000));
  return db.prepare(`
    SELECT
      id,
      actor_user_id AS actorUserId,
      actor_username AS actorUsername,
      actor_name AS actorName,
      actor_role AS actorRole,
      action,
      tab_id AS tabId,
      table_id AS tableId,
      order_id AS orderId,
      line_item_id AS lineItemId,
      request_id AS requestId,
      reason,
      details_json AS detailsJson,
      created_at AS createdAt
    FROM waiter_audit_events
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => {
    let details = {};
    try { details = JSON.parse(row.detailsJson || '{}'); } catch { details = {}; }
    const { detailsJson, ...event } = row;
    return { ...event, details };
  });
}

function corsHeaders(req) {
  const origin = sanitizeOrigin(req.headers.origin);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Waiter-CSRF, X-Print-Agent-Token, X-Print-Agent-Id',
  };

  if (origin && isOriginAllowed(req, origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers.Vary = 'Origin';
  }
  return headers;
}

function createCspNonce() {
  return randomBytes(18).toString('base64url');
}

function buildContentSecurityPolicy(cspNonce = '') {
  const nonceSource = cspNonce ? `'nonce-${cspNonce}'` : '';
  const scriptSources = [nonceSource, cspNonce ? "'strict-dynamic'" : '', "'self'"]
    .filter(Boolean)
    .join(' ');
  const styleSources = ["'self'", nonceSource, 'https://fonts.googleapis.com']
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "frame-src https://www.google.com https://maps.google.com",
    "form-action 'self'",
    "object-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'unsafe-inline'",
    `style-src ${styleSources}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');
}

function defaultSecurityHeaders({ cspNonce = '' } = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': buildContentSecurityPolicy(cspNonce),
  };
}

function noCacheHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  };
}

function noTransformHtmlHeaders() {
  return {
    ...noCacheHeaders(),
    'Cache-Control': `${noCacheHeaders()['Cache-Control']}, no-transform`,
  };
}

const API_TEXT_KEYS_TO_CLEAN = new Set(['error', 'message', 'serverMessage', 'httpStatusText']);
const API_TEXT_REPLACEMENTS = [
  ['Ã¡', 'a'], ['Ã¢', 'a'], ['Ã£', 'a'], ['Ãª', 'e'], ['Ã©', 'e'],
  ['Ã­', 'i'], ['Ã³', 'o'], ['Ã´', 'o'], ['Ãº', 'u'], ['Ã§', 'c'],
  ['Ã', 'A'], ['Ã‰', 'E'], ['Ã“', 'O'], ['Ãš', 'U'], ['Ã‡', 'C'],
  ['Ã ', 'A'], ['Ã±', 'n'], ['Ã¼', 'u'],
  ['â€œ', '"'], ['â€', '"'], ['â€˜', "'"], ['â€™', "'"],
  ['â€¦', '...'], ['â€“', '-'], ['â€”', '-'], ['Â', ''],
];

function cleanApiText(value) {
  let text = String(value ?? '');
  for (const [broken, fixed] of API_TEXT_REPLACEMENTS) {
    text = text.split(broken).join(fixed);
  }
  return text;
}

function cleanApiResponsePayload(value, key = '') {
  if (typeof value === 'string') {
    return API_TEXT_KEYS_TO_CLEAN.has(key) ? cleanApiText(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanApiResponsePayload(item));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      next[entryKey] = cleanApiResponsePayload(entryValue, entryKey);
    }
    return next;
  }
  return value;
}

function writeJson(req, res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(cleanApiResponsePayload(payload)), 'utf8');
  res.writeHead(status, {
    ...corsHeaders(req),
    ...defaultSecurityHeaders(),
    ...noCacheHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    ...extraHeaders,
  });
  res.end(body);
}

function writeText(res, status, message) {
  const body = Buffer.from(String(message || ''), 'utf8');
  res.writeHead(status, {
    ...defaultSecurityHeaders(),
    ...noCacheHeaders(),
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(body.length),
  });
  res.end(body);
}

function writeDownload(req, res, status, content, filename, contentType = 'application/octet-stream') {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ''), 'utf8');
  const safeFilename = String(filename || 'download.bin').replace(/["\r\n\\/]/g, '_');
  res.writeHead(status, {
    ...corsHeaders(req),
    ...defaultSecurityHeaders(),
    ...noCacheHeaders(),
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${safeFilename}"`,
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Content-Length': String(body.length),
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return map[ext] || 'application/octet-stream';
}

function safeResolve(baseDir, relativePath) {
  const clean = String(relativePath || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(baseDir, clean);
  const base = path.resolve(baseDir);
  if (resolved === base) return resolved;
  if (!resolved.startsWith(`${base}${path.sep}`)) return null;
  return resolved;
}

function injectCspNonceIntoHtml(html, cspNonce) {
  if (!cspNonce) return String(html || '');

  const nonceMeta = `<meta name="csp-nonce" content="${cspNonce}" />`;
  let protectedHtml = String(html || '').replace(
    /<(script|style)\b(?![^>]*\bnonce\s*=)([^>]*)>/gi,
    (_match, tagName, attributes) => `<${tagName} nonce="${cspNonce}"${attributes}>`,
  );

  protectedHtml = protectedHtml.replace(
    /<head\b([^>]*)>/i,
    (headTag, attributes) => `${headTag}\n  ${nonceMeta}`,
  );
  return protectedHtml;
}

async function serveFile(res, filePath, { cacheControl = '', headOnly = false } = {}) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    writeText(res, 404, 'Arquivo não encontrado.');
    return;
  }

  if (!fileStat.isFile()) {
    writeText(res, 404, 'Arquivo não encontrado.');
    return;
  }

  try {
    const isHtml = path.extname(filePath).toLowerCase() === '.html';
    const cspNonce = isHtml ? createCspNonce() : '';
    const rawContent = await readFile(filePath);
    const content = isHtml
      ? Buffer.from(injectCspNonceIntoHtml(rawContent.toString('utf8'), cspNonce), 'utf8')
      : rawContent;
    res.writeHead(200, {
      ...defaultSecurityHeaders({ cspNonce }),
      ...(isHtml
        ? noTransformHtmlHeaders()
        : (cacheControl ? { 'Cache-Control': cacheControl } : noCacheHeaders())),
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': String(content.length),
    });
    res.end(headOnly ? undefined : content);
  } catch {
    writeText(res, 500, 'Falha ao ler arquivo.');
  }
}

function escapeJsonForInlineScript(jsonText) {
  return String(jsonText || '')
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function injectBootstrapDataIntoIndexHtml(html, state, manifest = null) {
  const payload = {
    state,
    manifest,
    generatedAt: Date.now(),
  };
  const encodedPayload = escapeJsonForInlineScript(JSON.stringify(payload));
  const bootstrapTag = `<script type="application/json" id="${FRONTEND_BOOTSTRAP_GLOBAL}">${encodedPayload}</script>`;

  const scriptTagIndex = html.lastIndexOf('<script src="script.js');
  if (scriptTagIndex >= 0) {
    return `${html.slice(0, scriptTagIndex)}${bootstrapTag}\n  ${html.slice(scriptTagIndex)}`;
  }

  const bodyCloseIndex = html.lastIndexOf('</body>');
  if (bodyCloseIndex >= 0) {
    return `${html.slice(0, bodyCloseIndex)}${bootstrapTag}\n${html.slice(bodyCloseIndex)}`;
  }

  return `${html}\n${bootstrapTag}`;
}

async function serveIndexWithBootstrap(req, res) {
  try {
    const [template, rawState, manifest] = await Promise.all([
      readFile(INDEX_FILE_PATH, 'utf8'),
      Promise.resolve(readState()),
      Promise.resolve(readPublicStateManifest()),
    ]);
    const rendered = renderStorefrontHtml(template, rawState);
    const hydrated = injectBootstrapDataIntoIndexHtml(rendered.html, rendered.state, manifest);
    const cspNonce = createCspNonce();
    const body = Buffer.from(injectCspNonceIntoHtml(hydrated, cspNonce), 'utf8');

    res.writeHead(200, {
      ...defaultSecurityHeaders({ cspNonce }),
      ...noTransformHtmlHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(body.length),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Falha ao montar bootstrap inicial do cardapio.', error);
    await serveFile(res, INDEX_FILE_PATH, { headOnly: req.method === 'HEAD' });
  }
}

function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve) => {
    const bodyLimit = Math.max(1, Number.parseInt(String(maxBytes || ''), 10) || MAX_JSON_BODY_BYTES);
    req.__bodyTooLarge = false;
    req.__bodyLimit = bodyLimit;
    let raw = '';
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), 'utf8');
      totalBytes += chunkBytes;
      if (totalBytes > bodyLimit) {
        tooLarge = true;
        req.__bodyTooLarge = true;
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        resolve(null);
        return;
      }
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function isBodyTooLarge(req) {
  return Boolean(req.__bodyTooLarge);
}

function writePayloadTooLarge(req, res) {
  writeJson(req, res, 413, {
    error: `Payload excede o limite permitido (${Number(req.__bodyLimit || MAX_JSON_BODY_BYTES)} bytes).`,
  });
}

function trimString(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function moneyValuesMatch(left, right, tolerance = 0.02) {
  return Math.abs(normalizeMoneyValue(left, 0) - normalizeMoneyValue(right, 0)) <= tolerance;
}

function sanitizeOrderTime(value) {
  const raw = trimString(value, 10);
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return '';
  return `${match[1]}:${match[2]}`;
}

function sanitizeOrderReceiptUrl(value) {
  const raw = trimString(value, 900);
  if (!raw) return '';

  if (raw.startsWith('/order-receipts/')) {
    try {
      const parsed = new URL(raw, 'https://receipt.local');
      const rel = decodeURIComponent(parsed.pathname.replace('/order-receipts/', '').replace(/^\/+/, ''));
      if (!rel || rel.includes('/')) return '';
      const resolved = safeResolve(ORDER_RECEIPTS_DIR, rel);
      if (!resolved) return '';

      const link = parseOrderReceiptLinkParams(parsed.searchParams);
      if (link) return buildCanonicalOrderReceiptAccessUrl(rel, link);
      return `/order-receipts/${encodeURIComponent(rel)}`;
    } catch {
      return '';
    }
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().slice(0, 900);
    }
  } catch {
    return '';
  }

  return '';
}

function parseOrderReceiptLinkParams(searchParams) {
  if (!searchParams) return null;
  const versionValues = searchParams.getAll('v');
  const expiresValues = searchParams.getAll('expires');
  const signatureValues = searchParams.getAll('sig');
  const version = String(versionValues[0] || '').trim();
  const expectedKeys = version ? new Set(['v', 'expires', 'sig']) : new Set(['expires', 'sig']);
  const keys = [...searchParams.keys()];
  if (
    versionValues.length > 1
    || expiresValues.length !== 1
    || signatureValues.length !== 1
    || keys.length !== expectedKeys.size
    || keys.some((key) => !expectedKeys.has(key))
    || (version && version !== '2')
  ) {
    return null;
  }

  const expiresRaw = String(expiresValues[0] || '').trim();
  const signature = String(signatureValues[0] || '').trim();
  if (!/^\d{1,12}$/.test(expiresRaw) || !/^[a-zA-Z0-9_-]{43}$/.test(signature)) {
    return null;
  }
  return { version, expiresRaw, signature };
}

function buildCanonicalOrderReceiptAccessUrl(fileName, link) {
  const safePath = `/order-receipts/${encodeURIComponent(fileName)}`;
  const versionQuery = link.version ? `v=${encodeURIComponent(link.version)}&` : '';
  return `${safePath}?${versionQuery}expires=${encodeURIComponent(link.expiresRaw)}&sig=${encodeURIComponent(link.signature)}`;
}

function signOrderReceiptLink(fileName, expires) {
  return createHmac('sha256', ORDER_RECEIPT_LINK_SECRET)
    .update(`order-receipt-link:v2\0${fileName}\0${expires}`, 'utf8')
    .digest('base64url');
}

function buildOrderReceiptAccessUrl(fileName, now = Date.now()) {
  const expires = Math.floor((now + ORDER_RECEIPT_LINK_TTL_MS) / 1000);
  const signature = signOrderReceiptLink(fileName, expires);
  return buildCanonicalOrderReceiptAccessUrl(fileName, {
    version: '2',
    expiresRaw: String(expires),
    signature,
  });
}

function isOrderReceiptRequestAuthorized(req, fileName, searchParams) {
  if (getAdminSession(req)) return true;

  const link = parseOrderReceiptLinkParams(searchParams);
  if (!link) return false;

  const expires = Number.parseInt(link.expiresRaw, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const maximumFutureSeconds = Math.ceil(ORDER_RECEIPT_LINK_TTL_MS / 1000) + 300;
  if (
    !Number.isSafeInteger(expires)
    || expires < nowSeconds
    || expires > nowSeconds + maximumFutureSeconds
  ) {
    return false;
  }

  if (link.version === '2') {
    return secureCompare(signOrderReceiptLink(fileName, expires), link.signature);
  }

  const accessUrl = buildCanonicalOrderReceiptAccessUrl(fileName, link);
  return Boolean(db.prepare(`
    SELECT 1
    FROM order_receipt_uploads
    WHERE file_name = ? AND access_url = ? COLLATE BINARY
    LIMIT 1
  `).get(fileName, accessUrl));
}

function sanitizeOrderReceiptFileName(value) {
  const trimmed = trimString(value, 180);
  if (!trimmed) return '';
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectOrderReceiptMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return '';
}

function parseOrderReceiptUpload(rawBody) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { error: 'Corpo inválido.' };
  }

  const clientRequestId = trimString(rawBody.clientRequestId, 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,119}$/.test(clientRequestId)) {
    return { error: 'Identificador do pedido invalido para o comprovante.' };
  }

  const originalName = sanitizeOrderReceiptFileName(rawBody.fileName) || 'comprovante';
  const mimeHintRaw = trimString(rawBody.mimeType, 80).toLowerCase();
  const mimeHint = mimeHintRaw === 'image/jpg' ? 'image/jpeg' : mimeHintRaw;
  const dataUrl = String(rawBody.dataUrl || '').trim();
  if (!dataUrl) return { error: 'Comprovante não enviado.' };

  const maxDataUrlChars = Math.ceil(MAX_ORDER_RECEIPT_BYTES * 1.5) + 512;
  if (dataUrl.length > maxDataUrlChars) {
    return { error: `Comprovante excede o limite permitido (${MAX_ORDER_RECEIPT_BYTES} bytes).` };
  }

  const dataUrlMatch = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!dataUrlMatch) return { error: 'Formato de comprovante inválido.' };

  const mimeFromDataUrlRaw = String(dataUrlMatch[1] || '').toLowerCase();
  const mimeType = mimeFromDataUrlRaw === 'image/jpg' ? 'image/jpeg' : mimeFromDataUrlRaw;
  if (!ORDER_RECEIPT_MIME_TO_EXTENSION.has(mimeType)) {
    return { error: 'Tipo de imagem não suportado para comprovante.' };
  }

  if (mimeHint && ORDER_RECEIPT_MIME_TO_EXTENSION.has(mimeHint) && mimeHint !== mimeType) {
    return { error: 'Tipo de imagem do comprovante inválido.' };
  }

  const base64 = String(dataUrlMatch[2] || '').replace(/\s+/g, '');
  if (!base64) return { error: 'Comprovante vazio.' };

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { error: 'Comprovante em base64 inválido.' };
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { error: 'Comprovante vazio.' };
  }

  const normalizedInput = base64.replace(/=+$/g, '');
  const normalizedDecoded = buffer.toString('base64').replace(/=+$/g, '');
  if (normalizedInput !== normalizedDecoded) {
    return { error: 'Comprovante em base64 inválido.' };
  }

  if (buffer.length > MAX_ORDER_RECEIPT_BYTES) {
    return { error: `Comprovante excede o limite permitido (${MAX_ORDER_RECEIPT_BYTES} bytes).` };
  }
  if (detectOrderReceiptMimeType(buffer) !== mimeType) {
    return { error: 'Conteudo do comprovante nao corresponde ao tipo de imagem informado.' };
  }

  const extension = ORDER_RECEIPT_MIME_TO_EXTENSION.get(mimeType) || 'jpg';
  return {
    receipt: {
      clientRequestId,
      originalName,
      mimeType,
      extension,
      buffer,
      sizeBytes: buffer.length,
    },
  };
}

function extractOrderReceiptFileName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://receipt.local');
    if (!parsed.pathname.startsWith('/order-receipts/')) return '';
    const fileName = decodeURIComponent(parsed.pathname.slice('/order-receipts/'.length));
    if (!fileName || fileName.includes('/') || !safeResolve(ORDER_RECEIPTS_DIR, fileName)) return '';
    return fileName;
  } catch {
    return '';
  }
}

function toPublicOrderReceiptUpload(row) {
  if (!row) return null;
  return {
    uploadId: String(row.uploadId || ''),
    url: String(row.accessUrl || ''),
    fileName: String(row.originalName || ''),
    mimeType: String(row.mimeType || ''),
    sizeBytes: Number(row.sizeBytes || 0),
  };
}

function migrateLegacyOrderReceiptReferences() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO order_receipt_uploads (
      upload_id, client_request_id, client_ip, file_name, original_name,
      mime_type, size_bytes, access_url, order_id, created_at, claimed_at
    ) VALUES (?, ?, 'legacy', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = db.prepare(`
    SELECT id, payload, created_at AS createdAt
    FROM order_logs
    ORDER BY id ASC
  `).all();
  let migrated = 0;
  for (const row of rows) {
    let payload;
    try {
      payload = JSON.parse(row.payload || '{}');
    } catch {
      continue;
    }
    const receiptUrl = String(payload?.payment?.pixReceiptUrl || '').trim();
    const fileName = extractOrderReceiptFileName(receiptUrl);
    const filePath = fileName ? safeResolve(ORDER_RECEIPTS_DIR, fileName) : '';
    if (!filePath || !existsSync(filePath)) continue;
    const fileStat = statSync(filePath);
    const uploadId = `legacy-${createHash('sha256').update(fileName).digest('hex').slice(0, 32)}`;
    const result = insert.run(
      uploadId,
      trimString(payload.clientRequestId, 120) || `legacy-order-${row.id}`,
      fileName,
      sanitizeOrderReceiptFileName(payload?.payment?.pixReceiptFileName) || fileName,
      '',
      Number(fileStat.size || 0),
      sanitizeOrderReceiptUrl(receiptUrl) || buildOrderReceiptAccessUrl(fileName),
      Number(row.id),
      fileStat.mtime.toISOString(),
      row.createdAt || new Date().toISOString(),
    );
    migrated += Number(result.changes || 0);
  }
  if (migrated > 0) console.log(`${migrated} comprovante(s) legado(s) vinculado(s) aos pedidos.`);
}

function cleanupExpiredOrderReceiptUploads(now = Date.now()) {
  const cutoff = new Date(now - ORDER_RECEIPT_PENDING_TTL_MS).toISOString();
  const expired = db.prepare(`
    SELECT upload_id AS uploadId, file_name AS fileName
    FROM order_receipt_uploads
    WHERE order_id IS NULL AND created_at <= ?
  `).all(cutoff);
  let removed = 0;
  for (const row of expired) {
    const filePath = safeResolve(ORDER_RECEIPTS_DIR, row.fileName);
    if (!filePath) continue;
    try {
      unlinkSync(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.error(`Falha ao limpar comprovante pendente ${row.uploadId}.`, error);
        continue;
      }
    }
    removed += Number(db.prepare(`
      DELETE FROM order_receipt_uploads
      WHERE upload_id = ? AND order_id IS NULL
    `).run(row.uploadId).changes || 0);
  }
  if (removed > 0) {
    checkpointWal('PASSIVE');
    console.log(`${removed} comprovante(s) pendente(s) expirado(s) removido(s).`);
  }
  return removed;
}

function cleanupExpiredPublicOrders(now = Date.now()) {
  const cutoff = new Date(now - PUBLIC_ORDER_PENDING_TTL_MS).toISOString();
  const expiredRows = db.prepare(`
    SELECT id
    FROM order_logs
    WHERE source = ? AND status = ? AND julianday(created_at) <= julianday(?)
    ORDER BY id ASC
    LIMIT ?
  `).all(
    ORDER_SOURCE_STOREFRONT,
    ORDER_STATUS_PENDING,
    cutoff,
    PUBLIC_ORDER_PENDING_MAX_GLOBAL,
  );
  let removed = 0;
  for (const row of expiredRows) {
    const result = deleteOrderLog(row.id);
    if (result.deleted) removed += 1;
  }
  if (removed > 0) {
    console.log(`${removed} pedido(s) publico(s) pendente(s) expirado(s) removido(s).`);
  }
  return removed;
}

function bindOrderReceiptUploadWithinTransaction(payload) {
  const payment = payload?.payment;
  if (!payment || payment.method !== 'pix') return null;
  const uploadId = trimString(payment.pixReceiptUploadId, 80);
  if (!uploadId) {
    if (payment.pixReceiptUrl) throw new Error('Identificador do comprovante Pix ausente.');
    return null;
  }
  const clientRequestId = trimString(payload.clientRequestId, 120);
  if (!clientRequestId) throw new Error('Identificador do pedido ausente para vincular o comprovante.');
  const row = db.prepare(`
    SELECT
      upload_id AS uploadId,
      client_request_id AS clientRequestId,
      file_name AS fileName,
      original_name AS originalName,
      mime_type AS mimeType,
      size_bytes AS sizeBytes,
      access_url AS accessUrl,
      order_id AS orderId,
      created_at AS createdAt
    FROM order_receipt_uploads
    WHERE upload_id = ?
    LIMIT 1
  `).get(uploadId);
  if (!row || row.clientRequestId !== clientRequestId) {
    throw new Error('Comprovante Pix nao pertence a este pedido.');
  }
  if (row.orderId) throw new Error('Comprovante Pix ja foi vinculado a outro pedido.');
  const createdAt = new Date(row.createdAt).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > ORDER_RECEIPT_PENDING_TTL_MS) {
    throw new Error('Comprovante Pix expirado. Envie o arquivo novamente.');
  }
  const filePath = safeResolve(ORDER_RECEIPTS_DIR, row.fileName);
  if (!filePath || !existsSync(filePath)) throw new Error('Arquivo do comprovante Pix nao encontrado.');
  payment.pixReceiptUrl = row.accessUrl;
  payment.pixReceiptFileName = row.originalName;
  return row;
}

async function persistOrderReceipt(receipt, clientIp) {
  if (!receipt || !Buffer.isBuffer(receipt.buffer) || !receipt.extension) {
    throw new Error('Comprovante inválido.');
  }

  cleanupExpiredOrderReceiptUploads();
  const existing = db.prepare(`
    SELECT
      upload_id AS uploadId,
      file_name AS fileName,
      original_name AS originalName,
      mime_type AS mimeType,
      size_bytes AS sizeBytes,
      access_url AS accessUrl
    FROM order_receipt_uploads
    WHERE client_request_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(receipt.clientRequestId);
  if (existing) {
    const existingPath = safeResolve(ORDER_RECEIPTS_DIR, existing.fileName);
    if (existingPath && existsSync(existingPath)) return toPublicOrderReceiptUpload(existing);
  }

  const normalizedClientIp = trimString(clientIp, 100) || 'unknown';
  const pendingCount = Number(db.prepare(`
    SELECT COUNT(*) AS total
    FROM order_receipt_uploads
    WHERE client_ip = ? AND order_id IS NULL
  `).get(normalizedClientIp)?.total || 0);
  if (pendingCount >= ORDER_RECEIPT_MAX_PENDING_PER_IP) {
    const error = new Error('Limite de comprovantes pendentes atingido. Finalize o pedido ou aguarde a expiracao.');
    error.statusCode = 429;
    throw error;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = randomUUID().replace(/-/g, '').slice(0, 20);
    const fileName = `${Date.now()}-${token}.${receipt.extension}`;
    const filePath = safeResolve(ORDER_RECEIPTS_DIR, fileName);
    if (!filePath) {
      throw new Error('Falha ao montar caminho do comprovante.');
    }

    try {
      await writeFile(filePath, receipt.buffer, { flag: 'wx' });
      const uploadId = randomUUID();
      const accessUrl = buildOrderReceiptAccessUrl(fileName);
      const createdAt = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO order_receipt_uploads (
            upload_id, client_request_id, client_ip, file_name, original_name,
            mime_type, size_bytes, access_url, order_id, created_at, claimed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, '')
        `).run(
          uploadId,
          receipt.clientRequestId,
          normalizedClientIp,
          fileName,
          receipt.originalName || `comprovante.${receipt.extension}`,
          receipt.mimeType,
          receipt.sizeBytes,
          accessUrl,
          createdAt,
        );
      } catch (error) {
        try {
          unlinkSync(filePath);
        } catch {
          // Preserva o erro original do banco.
        }
        throw error;
      }
      return { uploadId, url: accessUrl, fileName: receipt.originalName, mimeType: receipt.mimeType, sizeBytes: receipt.sizeBytes };
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new Error('Falha ao salvar comprovante.');
}

function sanitizeOrderLocation(rawLocation) {
  if (!rawLocation || typeof rawLocation !== 'object' || Array.isArray(rawLocation)) return null;

  const lat = toFiniteNumber(rawLocation.lat);
  const lng = toFiniteNumber(rawLocation.lng);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const accuracyValue = toFiniteNumber(rawLocation.accuracy);
  const accuracy = accuracyValue !== null && accuracyValue >= 0 ? Math.round(accuracyValue) : null;
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    accuracy,
  };
}

function calculateConfiguredDeliveryFee(subtotal) {
  const state = readState();
  const orders = state.orders && typeof state.orders === 'object' && !Array.isArray(state.orders)
    ? state.orders
    : {};
  const deliveryFee = Math.max(0, normalizeMoneyValue(orders.deliveryFee, 0));
  const freeDeliveryAt = Math.max(0, normalizeMoneyValue(orders.freeDeliveryAt, 0));
  return normalizeMoneyValue(subtotal >= freeDeliveryAt ? 0 : deliveryFee, 0);
}

function isPizzaCatalogProduct(product, state) {
  if (!product || typeof product !== 'object') return false;
  const categoryId = trimString(product.category, 140).toLowerCase();
  if (categoryId.includes('pizza')) return true;
  const categories = Array.isArray(state?.categories) ? state.categories : [];
  const category = categories.find((entry) => String(entry?.id || '') === String(product.category || ''));
  return trimString(category?.name, 140).toLowerCase().includes('pizza');
}

function resolvePizzaBorderSizeCode(...values) {
  for (const value of values) {
    const raw = trimString(value, 160);
    if (!raw) continue;
    const direct = raw.toUpperCase();
    if (['P', 'M', 'G'].includes(direct)) return direct;

    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (/\b(pequena|pequeno|peq|brotinho|broto|small)\b/.test(normalized)) return 'P';
    if (/\b(media|medio|med|medium)\b/.test(normalized)) return 'M';
    if (/\b(grande|grande|gigante|familia|family|large)\b/.test(normalized)) return 'G';
  }
  return '';
}

function resolveOrderPizzaBasePrice(rawItem, state) {
  const products = Array.isArray(state?.products) ? state.products : [];
  const productById = new Map(products.map((product) => [String(product?.id || ''), product]));
  const isHalfPizza = Boolean(rawItem?.isHalfPizza);
  const selectedProducts = isHalfPizza
    ? [
      productById.get(String(rawItem?.halfPizzaFirstId || '')),
      productById.get(String(rawItem?.halfPizzaSecondId || '')),
    ]
    : [productById.get(String(rawItem?.productId || rawItem?.id || ''))];

  if (!selectedProducts.length || selectedProducts.some((product) => !isPizzaCatalogProduct(product, state))) {
    return { error: 'Borda personalizada so pode ser usada em pizzas cadastradas.' };
  }

  const sizes = selectedProducts.map((product) => resolvePizzaBorderSizeCode(product?.size, product?.name));
  const size = resolvePizzaBorderSizeCode(rawItem?.borderSelection?.size, rawItem?.sizeKey, rawItem?.size, ...sizes);
  if (!size || sizes.some((entry) => entry && entry !== size)) {
    return { error: 'Tamanho da pizza invalido para a borda personalizada.' };
  }

  const basePrice = Math.max(...selectedProducts.map((product) => normalizeMoneyValue(product?.price, 0)));
  return { size, basePrice };
}

function sanitizeOrderBorderSelection(rawItem, state, unitPrice) {
  const rawSelection = rawItem?.borderSelection && typeof rawItem.borderSelection === 'object'
    ? rawItem.borderSelection
    : {};
  const borderId = trimString(rawSelection.id || rawItem?.borderId, 120).toLowerCase();
  if (!borderId) return { borderSelection: null };

  const borders = Array.isArray(state?.borders) ? state.borders : [];
  const border = borders.find((entry) => (
    String(entry?.id || '').trim().toLowerCase() === borderId
    && entry?.active !== false
  ));
  if (!border) return { error: 'Borda personalizada indisponivel.' };

  const pizza = resolveOrderPizzaBasePrice(rawItem, state);
  if (pizza.error) return pizza;

  const prices = border?.prices && typeof border.prices === 'object' ? border.prices : {};
  const price = toFiniteNumber(prices[pizza.size] ?? prices[pizza.size.toLowerCase()] ?? border?.price);
  if (price === null || price < 0) return { error: 'Preco da borda personalizada invalido.' };

  const expectedUnitPrice = normalizeMoneyValue(pizza.basePrice + price, 0);
  if (!moneyValuesMatch(unitPrice, expectedUnitPrice)) {
    return { error: 'Preco da pizza com borda nao confere com o cardapio.' };
  }

  return {
    borderSelection: {
      id: borderId,
      label: trimString(border?.label || border?.name || 'Borda personalizada', 100),
      group: trimString(border?.group, 80),
      size: pizza.size,
      price: Number(price.toFixed(2)),
    },
  };
}

function sanitizeOrderItemLegacy(rawItem, state) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return { error: 'Item do pedido inválido.' };
  }

  const name = trimString(rawItem.name, 140);
  if (!name) return { error: 'Item do pedido sem nome.' };

  const quantity = Number.parseInt(rawItem.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return { error: `Quantidade inválida para o item "${name}".` };
  }

  const unitPrice = toFiniteNumber(rawItem.unitPrice ?? rawItem.price);
  if (unitPrice === null || unitPrice < 0) {
    return { error: `Preço unitário inválido para o item "${name}".` };
  }

  const subtotalValue = toFiniteNumber(rawItem.subtotal);
  const subtotal = normalizeMoneyValue(unitPrice * quantity, 0);
  if (subtotalValue !== null && subtotalValue >= 0 && !moneyValuesMatch(subtotalValue, subtotal)) {
    return { error: `Subtotal invalido para o item "${name}".` };
  }

  const borderResult = sanitizeOrderBorderSelection(rawItem, state, unitPrice);
  if (borderResult.error) return borderResult;
  const borderSelection = borderResult.borderSelection;

  return {
    item: {
      id: trimString(rawItem.id, 120),
      productId: trimString(rawItem.productId, 120),
      name,
      quantity,
      unitPrice: Number(unitPrice.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      isCombo: Boolean(rawItem.isCombo),
      isHalfPizza: Boolean(rawItem.isHalfPizza),
      halfPizzaFirstId: trimString(rawItem.halfPizzaFirstId, 120),
      halfPizzaSecondId: trimString(rawItem.halfPizzaSecondId, 120),
      size: trimString(rawItem.size, 160),
      sizeKey: trimString(rawItem.sizeKey, 80),
      emoji: trimString(rawItem.emoji, 24),
      borderSelection,
      borderLabel: borderSelection?.label || '',
      borderPrice: Number(borderSelection?.price || 0),
    },
  };
}

function sanitizeOrderItem(rawItem, state) {
  return canonicalizeCatalogOrderItem(rawItem, state);
}

function sanitizeOrderLogPayload(rawPayload, { enforceStorefrontPolicy = false } = {}) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { error: 'Corpo inválido.' };
  }

  const orderTypeRaw = trimString(rawPayload.orderType, 32).toLowerCase();
  let orderType = '';
  if (orderTypeRaw === 'entrega') orderType = 'entrega';
  if (orderTypeRaw === 'retirada') orderType = 'retirada';
  if (orderTypeRaw === 'consumo_local') orderType = 'consumo_local';
  if (!orderType) return { error: 'Tipo de pedido inválido.' };

  const itemsRaw = Array.isArray(rawPayload.items) ? rawPayload.items : [];
  if (itemsRaw.length === 0) return { error: 'Pedido sem itens.' };
  if (itemsRaw.length > 120) return { error: 'Pedido com quantidade de itens acima do limite permitido.' };

  const state = readState();
  const orderSettings = state.orders && typeof state.orders === 'object' && !Array.isArray(state.orders)
    ? state.orders
    : {};
  const items = [];
  for (const rawItem of itemsRaw) {
    const sanitized = sanitizeOrderItem(rawItem, state);
    if (sanitized.error) return { error: sanitized.error };
    items.push(sanitized.item);
  }

  const totals = rawPayload.totals;
  if (!totals || typeof totals !== 'object' || Array.isArray(totals)) {
    return { error: 'Totais do pedido inválidos.' };
  }

  const subtotal = toFiniteNumber(totals.subtotal);
  const delivery = toFiniteNumber(totals.delivery);
  const total = toFiniteNumber(totals.total);
  if (
    subtotal === null || subtotal < 0
    || delivery === null || delivery < 0
    || total === null || total < 0
  ) {
    return { error: 'Totais do pedido inválidos.' };
  }

  const calculatedSubtotal = normalizeMoneyValue(
    items.reduce((sum, item) => sum + normalizeMoneyValue(item.subtotal, 0), 0),
    0,
  );
  if (!moneyValuesMatch(subtotal, calculatedSubtotal)) {
    return { error: 'Subtotal do pedido nao confere com os itens.' };
  }
  const expectedDelivery = orderType === 'entrega'
    ? calculateConfiguredDeliveryFee(calculatedSubtotal)
    : 0;
  if (!moneyValuesMatch(delivery, expectedDelivery)) {
    return { error: 'Taxa de entrega nao confere com a configuracao da loja.' };
  }
  const expectedTotal = normalizeMoneyValue(calculatedSubtotal + expectedDelivery, 0);
  if (!moneyValuesMatch(total, expectedTotal)) {
    return { error: 'Total do pedido nao confere com subtotal e entrega.' };
  }

  const payment = rawPayload.payment;
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) {
    return { error: 'Dados de pagamento inválidos.' };
  }

  const paymentMethodRaw = trimString(payment.method, 32).toLowerCase();
  if (!['pix', 'cartao', 'dinheiro'].includes(paymentMethodRaw)) {
    return { error: 'Método de pagamento inválido.' };
  }

  const paymentLabelMap = {
    pix: 'Pix',
    cartao: 'Cartão',
    dinheiro: 'Dinheiro',
  };
  const paymentLabel = paymentLabelMap[paymentMethodRaw];

  const needsChange = paymentMethodRaw === 'dinheiro' && Boolean(payment.needsChange);
  let cashGiven = toFiniteNumber(payment.cashGiven);
  let change = toFiniteNumber(payment.change);
  if (paymentMethodRaw !== 'dinheiro') {
    cashGiven = null;
    change = null;
  } else {
    if (!needsChange) {
      cashGiven = null;
      change = null;
    } else if (cashGiven === null || cashGiven <= 0) {
      return { error: 'Valor para troco inválido.' };
    } else if (cashGiven + 0.001 < expectedTotal) {
      return { error: 'Valor para troco menor que o total do pedido.' };
    } else {
      cashGiven = normalizeMoneyValue(cashGiven, 0);
      change = normalizeMoneyValue(cashGiven - expectedTotal, 0);
    }
  }

  const pixKey = paymentMethodRaw === 'pix' ? trimString(orderSettings.pixKey, 180) : '';
  const pixReceiptUrl = paymentMethodRaw === 'pix' ? sanitizeOrderReceiptUrl(payment.pixReceiptUrl) : '';
  const pixReceiptFileName = paymentMethodRaw === 'pix'
    ? sanitizeOrderReceiptFileName(payment.pixReceiptFileName)
    : '';
  const pixReceiptUploadId = paymentMethodRaw === 'pix'
    ? trimString(payment.pixReceiptUploadId, 80)
    : '';

  const location = sanitizeOrderLocation(rawPayload.location);
  const deliveryAddress = orderType === 'entrega' ? trimString(rawPayload.deliveryAddress, 280) : '';
  if (orderType === 'entrega' && !deliveryAddress) {
    return { error: 'Endereço de entrega obrigatório para pedidos de entrega.' };
  }
  const localConsumptionTime = orderType === 'consumo_local' ? sanitizeOrderTime(rawPayload.localConsumptionTime) : '';
  if (orderType === 'consumo_local' && !localConsumptionTime) {
    return { error: 'Horário obrigatório para consumo local.' };
  }

  if (enforceStorefrontPolicy) {
    if (orderSettings.storeOpen === false) {
      return { error: trimString(orderSettings.closedMsg, 300) || 'Loja fechada no momento.' };
    }
    const minimumValue = Math.max(0, normalizeMoneyValue(orderSettings.minValue, 0));
    if (minimumValue > 0 && calculatedSubtotal + 0.001 < minimumValue) {
      return { error: `Pedido abaixo do valor minimo de R$ ${minimumValue.toFixed(2)}.` };
    }
    if (orderType === 'entrega' && paymentMethodRaw !== 'pix') {
      return { error: 'Pedidos para entrega aceitam somente pagamento via Pix.' };
    }
    if (paymentMethodRaw === 'pix' && !pixKey) {
      return { error: 'A loja ainda nao configurou a chave Pix.' };
    }

    if (orderType === 'consumo_local') {
      const openTime = sanitizeOrderTime(orderSettings.openTime);
      const closeTime = sanitizeOrderTime(orderSettings.closeTime);
      if (openTime && closeTime && openTime !== closeTime) {
        const toMinutes = (value) => {
          const [hours, minutes] = value.split(':').map(Number);
          return (hours * 60) + minutes;
        };
        const requestedMinutes = toMinutes(localConsumptionTime);
        const openMinutes = toMinutes(openTime);
        const closeMinutes = toMinutes(closeTime);
        const isWithinWindow = openMinutes < closeMinutes
          ? requestedMinutes >= openMinutes && requestedMinutes <= closeMinutes
          : requestedMinutes >= openMinutes || requestedMinutes <= closeMinutes;
        if (!isWithinWindow) {
          return { error: `Horario para consumo local deve ficar entre ${openTime} e ${closeTime}.` };
        }
      }
    }
  }

  const createdAtInput = trimString(rawPayload.createdAt, 80);
  let createdAt = '';
  if (createdAtInput) {
    const parsedDate = new Date(createdAtInput);
    if (!Number.isNaN(parsedDate.getTime())) createdAt = parsedDate.toISOString();
  }
  if (!createdAt) createdAt = new Date().toISOString();

  const orderCodeInput = trimString(rawPayload.orderCode, 80);
  const orderCode = orderCodeInput || `PED-${Date.now()}`;
  const clientRequestId = trimString(rawPayload.clientRequestId, 120);
  const customerName = trimString(rawPayload.customerName, 120);
  if (!customerName) {
    return { error: 'Nome do cliente e obrigatorio.' };
  }

  return {
    payload: {
      orderCode,
      clientRequestId,
      createdAt,
      storeName: trimString(rawPayload.storeName, 120) || 'Sua Empresa',
      customerName,
      customerNote: trimString(rawPayload.customerNote, 900),
      orderType,
      deliveryAddress,
      localConsumptionTime,
      location,
      payment: {
        method: paymentMethodRaw,
        label: paymentLabel,
        needsChange,
        cashGiven,
        change,
        pixKey,
        pixReceiptUrl,
        pixReceiptFileName,
        pixReceiptUploadId,
      },
      totals: {
        subtotal: Number(subtotal.toFixed(2)),
        delivery: Number(delivery.toFixed(2)),
        total: Number(total.toFixed(2)),
      },
      items,
      whatsappMessage: trimString(rawPayload.whatsappMessage, 16_000),
    },
  };
}

function normalizeStaticPath(pathValue) {
  return String(pathValue || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim()
    .toLowerCase();
}

const PUBLIC_STATIC_ROOT_FILES = new Set([
  'favicon.svg',
  'manifest.json',
  'script.js',
  'service-worker.js',
  'style.css',
]);
const PUBLIC_ADMIN_STATIC_FILES = new Set(['admin.css', 'admin.html', 'admin.js']);
const PUBLIC_WAITER_STATIC_FILES = new Set([
  'garcom.css',
  'garcom.html',
  'garcom.js',
  'waiter-pizza-core.mjs',
  'waiter-state-core.mjs',
]);
const PUBLIC_SOFTTEC_STATIC_FILES = new Set(['softtec.css', 'softtec.js']);
const PUBLIC_SOFTTEC_ASSET_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
  '.woff',
  '.woff2',
]);
const PUBLIC_ASSET_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
]);
const PUBLIC_ASSETS_DIR = path.resolve(ROOT_DIR, 'assets');
const PUBLIC_PIZZA_OPTIONS_PATH = path.resolve(ROOT_DIR, 'lib', 'pizza-options.js');

function isAllowedStaticRootTarget(rootTarget, resolved) {
  const normalized = normalizeStaticPath(rootTarget);
  if (!normalized || !resolved) return false;
  if (PUBLIC_STATIC_ROOT_FILES.has(normalized)) return true;
  if (resolved === PUBLIC_PIZZA_OPTIONS_PATH && normalized === 'lib/pizza-options.js') return true;
  if (
    resolved.startsWith(`${PUBLIC_ASSETS_DIR}${path.sep}`)
    && PUBLIC_ASSET_EXTENSIONS.has(path.extname(resolved).toLowerCase())
  ) {
    return true;
  }
  return false;
}

function isAllowedAdminStaticTarget(relativePath) {
  const normalized = normalizeStaticPath(relativePath);
  return PUBLIC_ADMIN_STATIC_FILES.has(normalized) && !normalized.includes('/');
}

function isAllowedWaiterStaticTarget(relativePath) {
  const normalized = normalizeStaticPath(relativePath);
  return PUBLIC_WAITER_STATIC_FILES.has(normalized) && !normalized.includes('/');
}

function isAllowedSofttecStaticTarget(relativePath, resolved) {
  const normalized = normalizeStaticPath(relativePath);
  if (!normalized || !resolved) return false;
  if (PUBLIC_SOFTTEC_STATIC_FILES.has(normalized) && !normalized.includes('/')) return true;
  return resolved.startsWith(`${SOFTTEC_ASSETS_DIR}${path.sep}`)
    && PUBLIC_SOFTTEC_ASSET_EXTENSIONS.has(path.extname(resolved).toLowerCase());
}

function isAllowedMundonauticasmaStaticTarget(relativePath, resolved) {
  const normalized = normalizeStaticPath(relativePath);
  if (!normalized || !resolved) return false;
  if (PUBLIC_MUNDONAUTICASMA_STATIC_FILES.has(normalized) && !normalized.includes('/')) return true;
  return resolved.startsWith(`${MUNDONAUTICASMA_ASSETS_DIR}${path.sep}`)
    && PUBLIC_MUNDONAUTICASMA_ASSET_EXTENSIONS.has(path.extname(resolved).toLowerCase());
}

function isAllowedPharmativaStaticTarget(relativePath, resolved) {
  const normalized = normalizeStaticPath(relativePath);
  if (!normalized || !resolved) return false;
  if (PUBLIC_PHARMATIVA_STATIC_FILES.has(normalized) && !normalized.includes('/')) return true;
  return resolved.startsWith(`${PHARMATIVA_ASSETS_DIR}${path.sep}`)
    && PUBLIC_PHARMATIVA_ASSET_EXTENSIONS.has(path.extname(resolved).toLowerCase());
}

function writeStaticMethodNotAllowed(res) {
  const body = Buffer.from('Metodo nao permitido.', 'utf8');
  res.writeHead(405, {
    ...defaultSecurityHeaders(),
    ...noCacheHeaders(),
    Allow: 'GET, HEAD',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(body.length),
  });
  res.end(body);
}

function sectionFromPath(pathname) {
  if (!pathname.startsWith('/api/data/')) return '';
  return pathname.replace('/api/data/', '').replace(/^\/+|\/+$/g, '');
}

async function handleApi(req, res, pathname, searchParams) {
  const origin = sanitizeOrigin(req.headers.origin);
  if (origin && !isOriginAllowed(req, origin)) {
    writeJson(req, res, 403, { error: 'Origem não permitida.' });
    return true;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      ...defaultSecurityHeaders(),
    });
    res.end();
    return true;
  }

  const publicWriteOriginValidation = validatePublicWriteOrigin(req, pathname);
  if (!publicWriteOriginValidation.ok) {
    writeJson(req, res, 403, { error: publicWriteOriginValidation.error });
    return true;
  }

  const waiterWriteOriginValidation = validateWaiterWriteOrigin(req, pathname);
  if (!waiterWriteOriginValidation.ok) {
    writeJson(req, res, 403, { error: waiterWriteOriginValidation.error });
    return true;
  }

  const stockWriteOriginValidation = validateStockWriteOrigin(req, pathname);
  if (!stockWriteOriginValidation.ok) {
    writeJson(req, res, 403, { error: stockWriteOriginValidation.error });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/waiter/login') {
    const body = await readJsonBody(req, 8 * 1024);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const usernameInput = String(body?.username ?? body?.user ?? '').trim();
    const username = normalizeWaiterUsername(usernameInput);
    const password = String(body?.password ?? body?.pin ?? '');
    const rateKey = `waiter:${getLoginRateKey(req, username || 'anonymous')}`;
    const globalRateKey = `waiter-ip:${getClientIp(req)}`;
    const blockedMs = Math.max(
      getLoginBlockRemainingMs(rateKey),
      getLoginBlockRemainingMs(globalRateKey),
    );
    if (blockedMs > 0) {
      const retryAfter = Math.max(1, Math.ceil(blockedMs / 1000));
      writeJson(req, res, 429, { ok: false, error: 'Muitas tentativas. Aguarde e tente novamente.' }, { 'Retry-After': String(retryAfter) });
      return true;
    }

    const user = username ? getWaiterUserByUsername(username, { includeHash: true }) : null;
    const validStaffPassword = verifyWaiterPassword(user?.passwordHash || getWaiterDummyPasswordHash(), password);
    const validStaff = Boolean(user?.active && validStaffPassword);
    const adminAccount = getAdminAccount({ includeHash: true });
    const validAdminFallback = !validStaff
      && secureCompare(String(adminAccount?.username || '').toLowerCase(), usernameInput.toLowerCase())
      && verifyAdminPassword(adminAccount, password);
    if (!validStaff && !validAdminFallback) {
      registerLoginFailure(rateKey);
      registerLoginFailure(globalRateKey, WAITER_LOGIN_GLOBAL_MAX_ATTEMPTS);
      writeJson(req, res, 401, { ok: false, error: 'Credenciais invalidas.' });
      return true;
    }

    clearLoginFailures(rateKey);
    clearLoginFailures(globalRateKey);
    const actor = validStaff ? {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      sessionVersion: user.sessionVersion,
    } : {
      userId: null,
      username: adminAccount.username,
      displayName: adminAccount.displayName,
      role: 'admin',
      sessionVersion: adminAccount.sessionVersion,
    };
    if (validStaff) {
      db.prepare(`UPDATE waiter_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`).run(user.id);
    }
    // A shared waiter device must never retain a pre-existing full admin session.
    deleteAdminSession(req);
    const created = createWaiterSession(req, actor);
    recordWaiterAuditEvent({ ...actor, source: 'waiter' }, 'session_login', {
      context: waiterRequestContext(req),
      details: { adminFallback: validAdminFallback },
    });
    writeJson(req, res, 200, {
      ok: true,
      actor: { id: actor.userId, username: actor.username, displayName: actor.displayName, role: actor.role },
      csrfToken: created.csrfToken,
      expiresAt: created.absoluteExpiresAt,
    }, {
      'Set-Cookie': [
        buildWaiterSessionCookie(req, created.token),
        buildClearAdminSessionCookie(req),
      ],
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/waiter/session') {
    const actor = getWaiterActor(req);
    const csrfToken = actor?.source === 'waiter' ? getWaiterCsrfToken(req, actor.sessionId) : '';
    writeJson(req, res, 200, {
      ok: true,
      authenticated: Boolean(actor),
      actor: actor ? {
        id: actor.userId,
        username: actor.username,
        displayName: actor.displayName,
        role: actor.role,
      } : null,
      csrfToken,
      expiresAt: actor?.absoluteExpiresAt || '',
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/waiter/logout') {
    const actor = getWaiterSession(req);
    if (actor) {
      const received = headerValueToString(req.headers['x-waiter-csrf']);
      if (!received || !secureCompare(actor.csrfHash, hashSessionSecret(received))) {
        writeJson(req, res, 403, { error: 'Sessao de seguranca invalida. Atualize a pagina e tente novamente.' });
        return true;
      }
      recordWaiterAuditEvent(actor, 'session_logout', { context: waiterRequestContext(req) });
      deleteWaiterSession(req);
    }
    writeJson(req, res, 200, { ok: true }, { 'Set-Cookie': buildClearWaiterSessionCookie(req) });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/waiter-users') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, { ok: true, users: listWaiterUsers() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/waiter-users') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = createWaiterUser(body || {});
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    recordWaiterAuditEvent({
      source: 'admin', username: adminSession.user || ADMIN_USER,
      displayName: 'Administrador', role: 'admin', userId: null,
    }, 'staff_user_created', {
      context: waiterRequestContext(req),
      details: { userId: result.user.id, username: result.user.username, role: result.user.role },
    });
    writeJson(req, res, 201, { ok: true, user: result.user });
    return true;
  }

  const adminWaiterUserMatch = pathname.match(/^\/api\/admin\/waiter-users\/(\d+)$/);
  if (['PUT', 'PATCH'].includes(req.method) && adminWaiterUserMatch) {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = updateWaiterUser(adminWaiterUserMatch[1], body || {});
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    recordWaiterAuditEvent({
      source: 'admin', username: adminSession.user || ADMIN_USER,
      displayName: 'Administrador', role: 'admin', userId: null,
    }, 'staff_user_updated', {
      context: waiterRequestContext(req),
      details: { userId: result.user.id, username: result.user.username, role: result.user.role, active: result.user.active, sessionsRevoked: result.sessionsRevoked },
    });
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/waiter-audit') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, { ok: true, events: listWaiterAuditEvents(searchParams.get('limit') || 200) });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/session') {
    const session = getAdminSession(req);
    writeJson(req, res, 200, {
      ok: true,
      authenticated: Boolean(session),
      user: session?.user || null,
      displayName: session?.displayName || null,
      csrfToken: session ? deriveAdminCsrfToken(session.token) : '',
    });
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/admin/profile') {
    const session = getAdminSession(req);
    if (!session) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const csrfToken = String(req.headers['x-admin-csrf'] || '');
    if (!secureCompare(deriveAdminCsrfToken(session.token), csrfToken)) {
      writeJson(req, res, 403, { error: 'Validacao de seguranca expirada. Recarregue a pagina.' });
      return true;
    }
    const rateKey = `admin-profile:${getClientIp(req)}`;
    const blockedMs = getLoginBlockRemainingMs(rateKey);
    if (blockedMs > 0) {
      writeJson(req, res, 429, { error: 'Muitas tentativas. Aguarde e tente novamente.' }, {
        'Retry-After': String(Math.max(1, Math.ceil(blockedMs / 1000))),
      });
      return true;
    }
    const body = await readJsonBody(req, 8 * 1024);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = updateAdminAccount({
      displayName: body?.displayName,
      currentPassword: body?.currentPassword,
      newPassword: body?.newPassword,
    });
    if (result.error) {
      if (result.statusCode === 401) registerLoginFailure(rateKey);
      writeJson(req, res, result.statusCode || 400, { ok: false, error: result.error });
      return true;
    }
    clearLoginFailures(rateKey);
    const updated = result.account;
    if (result.displayNameChanged && !result.passwordChanged) {
      for (const activeSession of ADMIN_SESSIONS.values()) {
        if (
          activeSession
          && Number(activeSession.sessionVersion || 0) === Number(updated.sessionVersion || 0)
        ) {
          activeSession.user = updated.username;
          activeSession.displayName = updated.displayName;
        }
      }
    }
    try {
      recordWaiterAuditEvent({
        source: 'admin',
        username: session.user || updated.username || ADMIN_USER,
        displayName: session.displayName || updated.displayName || 'Administrador',
        role: 'admin',
        userId: null,
      }, 'admin_profile_updated', {
        context: waiterRequestContext(req),
        details: {
          displayNameChanged: Boolean(result.displayNameChanged),
          passwordChanged: Boolean(result.passwordChanged),
          sessionsRevoked: Boolean(result.passwordChanged),
        },
      });
    } catch (error) {
      console.error('Falha ao registrar auditoria da alteracao do perfil administrativo.', error);
    }
    let token = session.token;
    let responseHeaders = {};
    if (result.passwordChanged) {
      ADMIN_SESSIONS.clear();
      token = createAdminSession(updated);
      responseHeaders = { 'Set-Cookie': buildAdminSessionCookie(req, token) };
    }
    writeJson(req, res, 200, {
      ok: true,
      user: updated.username,
      displayName: updated.displayName,
      displayNameChanged: result.displayNameChanged,
      passwordChanged: result.passwordChanged,
      csrfToken: deriveAdminCsrfToken(token),
    }, responseHeaders);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/data') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, toAdminState(readState()));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const globalRateKey = `admin-ip:${getClientIp(req)}`;
    const globalBlockedMs = getLoginBlockRemainingMs(globalRateKey);
    if (globalBlockedMs > 0) {
      req.resume();
      writeJson(
        req,
        res,
        429,
        { ok: false, error: 'Muitas tentativas. Aguarde e tente novamente.' },
        { 'Retry-After': String(Math.max(1, Math.ceil(globalBlockedMs / 1000))) },
      );
      return true;
    }

    const body = await readJsonBody(req, 8 * 1024);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const user = String(body?.user || '').trim();
    const password = String(body?.password || '');
    const rateKey = getLoginRateKey(req, user || 'anonymous');
    const blockedMs = Math.max(
      getLoginBlockRemainingMs(rateKey),
      getLoginBlockRemainingMs(globalRateKey),
    );

    if (blockedMs > 0) {
      const retryAfter = Math.max(1, Math.ceil(blockedMs / 1000));
      writeJson(
        req,
        res,
        429,
        { ok: false, error: 'Muitas tentativas. Aguarde e tente novamente.' },
        { 'Retry-After': String(retryAfter) },
      );
      return true;
    }

    const account = getAdminAccount({ includeHash: true });
    const validUser = secureCompare(String(account?.username || '').toLowerCase(), user.toLowerCase());
    const validPassword = verifyAdminPassword(account, password);
    if (!validUser || !validPassword) {
      registerLoginFailure(rateKey);
      registerLoginFailure(globalRateKey, ADMIN_LOGIN_GLOBAL_MAX_ATTEMPTS);
      writeJson(req, res, 401, { ok: false, error: 'Credenciais inválidas.' });
      return true;
    }

    clearLoginFailures(rateKey);
    clearLoginFailures(globalRateKey);
    const token = createAdminSession(account);
    writeJson(
      req,
      res,
      200,
      {
        ok: true,
        user: account.username,
        displayName: account.displayName,
        csrfToken: deriveAdminCsrfToken(token),
      },
      { 'Set-Cookie': buildAdminSessionCookie(req, token) },
    );
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    deleteAdminSession(req);
    writeJson(
      req,
      res,
      200,
      { ok: true },
      { 'Set-Cookie': buildClearAdminSessionCookie(req) },
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/waiter/dashboard') {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    writeJson(req, res, 200, getWaiterDashboard(auth.actor));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/waiter/tables') {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const table = createDiningTable(body || {});
    if (table?.error) {
      writeJson(req, res, table.statusCode || 400, { error: table.error });
      return true;
    }
    recordWaiterAuditEvent(auth.actor, 'dining_table_created', {
      tableId: table.id,
      context: waiterRequestContext(req),
      details: { tableNumber: table.tableNumber, label: table.label },
    });
    writeJson(req, res, 201, { ok: true, table });
    return true;
  }

  const waiterOpenMatch = pathname.match(/^\/api\/waiter\/tables\/(\d+)\/open$/);
  if (req.method === 'POST' && waiterOpenMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = openTableTab(waiterOpenMatch[1], body || {}, auth.actor, waiterRequestContext(req));
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, result.idempotentReplay ? 200 : 201, { ok: true, ...result });
    return true;
  }

  const waiterOrderReprintMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/orders\/(\d+)\/reprint$/);
  if (req.method === 'POST' && waiterOrderReprintMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = reprintTableTabOrder(
      waiterOrderReprintMatch[1],
      waiterOrderReprintMatch[2],
      body || {},
      auth.actor,
      waiterRequestContext(req),
    );
    if (result.error) {
      writeJson(
        req,
        res,
        result.statusCode || 400,
        result,
        result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {},
      );
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterOrderItemRemoveMatch = pathname.match(
    /^\/api\/waiter\/tabs\/(\d+)\/orders\/(\d+)\/items\/([^/]+)\/remove$/,
  );
  if (req.method === 'POST' && waiterOrderItemRemoveMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    try {
      const result = removeItemFromTableTabOrder(
        waiterOrderItemRemoveMatch[1],
        waiterOrderItemRemoveMatch[2],
        decodeURIComponent(waiterOrderItemRemoveMatch[3]),
        body || {},
        auth.actor,
        waiterRequestContext(req),
      );
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, 200, { ok: true, ...result });
    } catch (error) {
      writeJson(req, res, 400, { error: String(error?.message || 'Falha ao retirar item da mesa.') });
    }
    return true;
  }

  const waiterOrderMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/orders$/);
  if (req.method === 'POST' && waiterOrderMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    try {
      const result = addOrderToTableTab(waiterOrderMatch[1], body || {}, auth.actor, waiterRequestContext(req));
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, result.idempotentReplay ? 200 : 201, { ok: true, ...result });
    } catch (error) {
      writeJson(req, res, 400, { error: String(error?.message || 'Falha ao adicionar pedido à mesa.') });
    }
    return true;
  }

  const waiterPrintMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/print$/);
  if (req.method === 'POST' && waiterPrintMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const tab = getTableTabById(waiterPrintMatch[1]);
    if (!tab) {
      writeJson(req, res, 404, { error: 'Comanda não encontrada.' });
      return true;
    }
    if (tab.itemCount === 0) {
      writeJson(req, res, 400, { error: 'Comanda sem itens.' });
      return true;
    }
    const access = requireWaiterTabAccess(auth.actor, tab);
    if (access.error) {
      writeJson(req, res, access.statusCode, access);
      return true;
    }
    const requestId = normalizeWaiterRequestId(body?.clientRequestId);
    if (!requestId) {
      writeJson(req, res, 400, { error: 'Identificador da impressao invalido.' });
      return true;
    }
    const accountJobKey = `table-tab:${tab.id}:account:${requestId}`;
    const finalAccountJobKey = `table-tab:${tab.id}:final:${requestId}`;
    const finalReprintJobKey = `table-tab:${tab.id}:final:reprint:${requestId}`;
    const isFinalAccount = tab.status === 'awaiting_payment' || tab.status === 'closed';
    const existingAccountJob = [accountJobKey, finalAccountJobKey, finalReprintJobKey]
      .map((jobKey) => getPrintJobByKey(jobKey))
      .filter(Boolean)
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))[0] || null;
    if (existingAccountJob) {
      const existingFailed = existingAccountJob.rawStatus === 'failed'
        || existingAccountJob.status === 'failed';
      writeJson(req, res, 200, {
        ok: true,
        tab: getTableTabById(tab.id),
        printJob: {
          enabled: PRINT_AGENT_ACTIVE,
          queued: !existingFailed,
          error: existingFailed
            ? (existingAccountJob.lastError || 'A impressao falhou. Solicite uma nova segunda via.')
            : '',
          previewText: existingAccountJob.text
            || (existingAccountJob.orderSnapshot ? buildOrderPrintText(existingAccountJob.orderSnapshot) : ''),
          job: existingAccountJob,
          idempotentReplay: true,
        },
      });
      return true;
    }
    const priorAccounts = (tab.accountPrints || []).filter((job) => (
      job.operationKind === 'table_account_preview' || job.operationKind === 'table_account_final'
    ));
    const reprint = priorAccounts.length > 0;
    const reason = trimString(body?.reason, 300);
    if (reprint && reason.length < 3) {
      writeJson(req, res, 400, { error: 'Informe o motivo da segunda via.' });
      return true;
    }
    if (reprint) {
      const rate = checkWaiterReprintRate(auth.actor);
      if (rate.error) {
        writeJson(req, res, rate.statusCode, rate, { 'Retry-After': String(rate.retryAfterSeconds) });
        return true;
      }
    }
    const printJob = queueTableTabSummaryPrint(tab, {
      final: isFinalAccount,
      reprint,
      reason,
      actor: auth.actor,
      requestId,
    });
    if (printJob.queued && !printJob.idempotentReplay) {
      recordWaiterAuditEvent(auth.actor, reprint ? 'account_reprinted' : 'account_preview_printed', {
        tabId: tab.id,
        tableId: tab.tableId,
        requestId,
        reason,
        context: waiterRequestContext(req),
      });
    }
    writeJson(req, res, 200, { ok: true, tab: getTableTabById(tab.id), printJob });
    return true;
  }

  const waiterCloseMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/(?:close|account-request)$/);
  if (req.method === 'POST' && waiterCloseMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = closeTableTab(
      waiterCloseMatch[1],
      body || {},
      auth.actor,
      waiterRequestContext(req),
    );
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterReopenMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/reopen$/);
  if (req.method === 'POST' && waiterReopenMatch) {
    const auth = authorizeWaiterRequest(req, ['manager', 'admin']);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = reopenTableTab(waiterReopenMatch[1], body || {}, auth.actor, waiterRequestContext(req));
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterTransferMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/transfer$/);
  if (req.method === 'POST' && waiterTransferMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = transferTableTab(waiterTransferMatch[1], body || {}, auth.actor, waiterRequestContext(req));
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterTableLinkMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/tables\/link$/);
  if (req.method === 'POST' && waiterTableLinkMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = linkDiningTableToTab(
      waiterTableLinkMatch[1],
      body || {},
      auth.actor,
      waiterRequestContext(req),
    );
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterTableUnlinkMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)\/tables\/(\d+)\/unlink$/);
  if (req.method === 'POST' && waiterTableUnlinkMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const body = await readJsonBody(req, WAITER_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = unlinkDiningTableFromTab(
      waiterTableUnlinkMatch[1],
      waiterTableUnlinkMatch[2],
      body || {},
      auth.actor,
      waiterRequestContext(req),
    );
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  const waiterTabMatch = pathname.match(/^\/api\/waiter\/tabs\/(\d+)$/);
  if (req.method === 'GET' && waiterTabMatch) {
    const auth = authorizeWaiterRequest(req);
    if (auth.error) {
      writeJson(req, res, auth.statusCode, { error: auth.error });
      return true;
    }
    const tab = getTableTabById(waiterTabMatch[1]);
    if (!tab) {
      writeJson(req, res, 404, { error: 'Comanda não encontrada.' });
      return true;
    }
    const access = requireWaiterTabAccess(auth.actor, tab);
    if (access.error) {
      writeJson(req, res, access.statusCode, access);
      return true;
    }
    writeJson(req, res, 200, { ok: true, tab });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/print-agent/credentials/revoke') {
    const session = getAdminSession(req);
    if (!session) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    if (!isValidAdminCsrfRequest(req, session)) {
      writeJson(req, res, 403, { error: 'Validacao de seguranca expirada. Recarregue a pagina.' });
      return true;
    }
    const body = await readJsonBody(req, 8 * 1024);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = revokePrintAgentCredential(body?.clientId);
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, { error: result.error });
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...result });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/print-agent/status') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }

    writeJson(req, res, 200, buildPrintAgentAdminStatus(req));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/print-agent/installer.exe') {
    const session = getAdminSession(req);
    if (!session) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    if (!isValidAdminCsrfRequest(req, session)) {
      writeJson(req, res, 403, { error: 'Validacao de seguranca expirada. Recarregue a pagina.' });
      return true;
    }
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, {
        error: 'Agente de impressao indisponivel. Ative PRINT_AGENT_ENABLED ou verifique permissao da pasta de dados.',
      });
      return true;
    }
    if (!existsSync(PRINT_AGENT_WINDOWS_INSTALLER_EXE_PATH)) {
      writeJson(req, res, 409, {
        error: 'Instalador .exe indisponivel no servidor. Gere o arquivo em tools/dist/print-agent-windows/CardapioPrintAgentInstaller.exe.',
      });
      return true;
    }

    try {
      const content = await readFile(PRINT_AGENT_WINDOWS_INSTALLER_EXE_PATH);
      const enrollment = createPrintAgentEnrollment(session.user);
      writeDownload(
        req,
        res,
        200,
        content,
        `cardapio-print-agent-setup-${enrollment.code}.exe`,
        'application/vnd.microsoft.portable-executable',
      );
      return true;
    } catch (error) {
      console.error('Falha ao disponibilizar instalador .exe do agente de impressao.', error);
      writeJson(req, res, 500, { error: 'Falha ao baixar instalador .exe do agente.' });
      return true;
    }
  }

  if (
    req.method === 'GET'
    && (
      pathname === '/api/admin/print-agent/installer.exe'
      || pathname === '/api/admin/print-agent/installer.cmd'
    )
  ) {
    writeJson(req, res, 404, { error: 'Nao encontrado.' });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/cashier/summary') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, getCashierSummary());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/cashier/sessions') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, {
      ok: true,
      sessions: listCashSessions({
        status: searchParams.get('status') || 'closed',
        operator: searchParams.get('operator') || '',
        dateFrom: searchParams.get('dateFrom') || '',
        dateTo: searchParams.get('dateTo') || '',
        limit: searchParams.get('limit') || '80',
      }),
    });
    return true;
  }

  const cashSessionMatch = pathname.match(/^\/api\/cashier\/sessions\/(\d+)$/);
  if (req.method === 'GET' && cashSessionMatch) {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const details = getCashSessionDetails(cashSessionMatch[1]);
    if (!details) {
      writeJson(req, res, 404, { error: 'Caixa nao encontrado.' });
      return true;
    }
    writeJson(req, res, 200, { ok: true, ...details });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/cashier/open') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = openCashSession({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 201, { ok: true, session: result.session });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/cashier/close') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = closeCashSession({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, session: result.session });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/cashier/movements') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = createCashMovement({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 201, { ok: true, movement: result.movement });
    return true;
  }

  if (req.method === 'POST') {
    const receiveMatch = pathname.match(/^\/api\/cashier\/orders\/(\d+)\/receive$/);
    if (receiveMatch) {
      const adminSession = getAdminSession(req);
      if (!adminSession) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }
      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }
      const cashierActor = {
        source: 'admin',
        userId: null,
        username: adminSession.user || ADMIN_USER,
        displayName: adminSession.user || ADMIN_USER,
        role: 'admin',
      };
      const result = receiveOrderInCashier(receiveMatch[1], {
        ...(body || {}),
        _operator: adminSession.user || ADMIN_USER,
        _actor: cashierActor,
        _context: waiterRequestContext(req),
      });
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, 200, {
        ok: true,
        movement: result.movement,
        movements: result.movements || [result.movement].filter(Boolean),
        orderLog: result.orderLog,
      });
      return true;
    }

    const refundMatch = pathname.match(/^\/api\/cashier\/orders\/(\d+)\/refund$/);
    if (refundMatch) {
      const adminSession = getAdminSession(req);
      if (!adminSession) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }
      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }
      const result = refundOrderInCashier(refundMatch[1], { ...(body || {}), _operator: adminSession.user || ADMIN_USER });
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, 200, {
        ok: true,
        movement: result.movement,
        movements: result.movements || [result.movement].filter(Boolean),
        orderLog: result.orderLog,
      });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/fiscal/status') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, buildFiscalStatus());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/fiscal/sefaz-status') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    writeJson(req, res, 200, await buildSefazServiceStatus());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/fiscal/documents') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const limit = Number.parseInt(searchParams.get('limit') || '80', 10);
    writeJson(req, res, 200, {
      ok: true,
      documents: listFiscalDocuments(limit),
      ...getFiscalDocumentStats(),
    });
    return true;
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


  const fiscalDanfeDirectMatch = pathname.match(/^\/danfe\/(\d+)$/) || pathname.match(/^\/api\/fiscal\/documents\/(\d+)\/danfe$/);
  if (req.method === 'GET' && fiscalDanfeDirectMatch) {
    if (!getAdminSession(req)) {
      if (pathname.startsWith('/api/')) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
      } else {
        res.writeHead(302, { Location: '/admin login/login.html' });
        res.end();
      }
      return true;
    }
    const document = getFiscalDocumentById(fiscalDanfeDirectMatch[1]);
    if (!document) {
      writeText(res, 404, 'Documento fiscal nao encontrado.');
      return true;
    }
    const html = buildDanfeA4Html(document);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(html);
    return true;
  }

  const fiscalDocumentGetMatch = pathname.match(/^\/api\/fiscal\/documents\/(\d+)$/);
  if (req.method === 'GET' && fiscalDocumentGetMatch) {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const document = getFiscalDocumentById(fiscalDocumentGetMatch[1]);
    if (!document) {
      writeJson(req, res, 404, { error: 'Documento fiscal nao encontrado.' });
      return true;
    }
    writeJson(req, res, 200, { ok: true, document });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/fiscal/events') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const limit = Number.parseInt(searchParams.get('limit') || '80', 10);
    writeJson(req, res, 200, { ok: true, events: listFiscalEvents(limit) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/fiscal/documents') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = createFiscalDraftForOrder({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 201, { ok: true, document: result.document });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/fiscal/inutilizations') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = await createFiscalNumberInutilization({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 201, { ok: true, event: result.event, message: result.message });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/fiscal/contingency') {
    const adminSession = getAdminSession(req);
    if (!adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const result = updateFiscalContingency({ ...(body || {}), _operator: adminSession.user || ADMIN_USER });
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    writeJson(req, res, 200, { ok: true, fiscalStatus: result.fiscalStatus, event: result.event });
    return true;
  }

  if (req.method === 'POST') {
    const transmitMatch = pathname.match(/^\/api\/fiscal\/documents\/(\d+)\/transmit$/);
    if (transmitMatch) {
      const adminSession = getAdminSession(req);
      if (!adminSession) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }
      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }
      const result = await transmitFiscalDocument(transmitMatch[1], { ...(body || {}), _operator: adminSession.user || ADMIN_USER });
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, 200, {
        ok: true,
        document: result.document,
        ...(result.message ? { message: result.message } : {}),
        ...(result.reconciled ? { reconciled: true } : {}),
        ...(result.sefazResponse ? { sefazResponse: result.sefazResponse } : {}),
        ...(result.validation ? { validation: result.validation } : {}),
      });
      return true;
    }

    const cancelMatch = pathname.match(/^\/api\/fiscal\/documents\/(\d+)\/cancel$/);
    if (cancelMatch) {
      const adminSession = getAdminSession(req);
      if (!adminSession) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }
      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }
      const result = await cancelFiscalDocument(cancelMatch[1], { ...(body || {}), _operator: adminSession.user || ADMIN_USER });
      if (result.error) {
        writeJson(req, res, result.statusCode || 400, result);
        return true;
      }
      writeJson(req, res, 200, {
        ok: true,
        document: result.document,
        event: result.event,
        message: result.message,
      });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/products/upsert') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }

    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }

    const result = upsertProduct(body);
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }

    writeJson(req, res, 200, {
      ok: true,
      created: result.created,
      totalProducts: result.totalProducts,
      product: result.product,
    });
    return true;
  }

  if (pathname === '/api/stock' && req.method === 'GET') {
    if (!getAdminSession(req)) { writeJson(req, res, 401, { error: 'Nao autenticado.' }); return true; }
    writeJson(req, res, 200, getStockSnapshot(searchParams.get('period') || '30d'));
    return true;
  }

  if (pathname === '/api/stock/movements' && req.method === 'POST') {
    const adminSession = getAdminSession(req);
    if (!adminSession) { writeJson(req, res, 401, { error: 'Nao autenticado.' }); return true; }
    const body = await readJsonBody(req, STOCK_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) { writePayloadTooLarge(req, res); return true; }
    const result = createStockMovement(body || {}, adminSession.user || ADMIN_USER, searchParams.get('period') || '30d');
    if (result.error) { writeJson(req, res, result.statusCode || 400, result); return true; }
    writeJson(req, res, 200, {
      ok: true,
      ...result.stock,
      movement: result.movement,
      requestId: result.requestId,
      idempotentReplay: result.idempotentReplay,
    });
    return true;
  }

  if (pathname === '/api/stock/initial-count' && req.method === 'POST') {
    const adminSession = getAdminSession(req);
    if (!adminSession) { writeJson(req, res, 401, { error: 'Nao autenticado.' }); return true; }
    const body = await readJsonBody(req, STOCK_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) { writePayloadTooLarge(req, res); return true; }
    const result = createInitialStockCount(body || {}, adminSession.user || ADMIN_USER, searchParams.get('period') || '30d');
    if (result.error) { writeJson(req, res, result.statusCode || 400, result); return true; }
    writeJson(req, res, 200, {
      ok: true,
      ...result.stock,
      movements: result.movements,
      requestId: result.requestId,
      idempotentReplay: result.idempotentReplay,
    });
    return true;
  }

  if (pathname === '/api/stock/xml/preview' && req.method === 'POST') {
    if (!getAdminSession(req)) { writeJson(req, res, 401, { error: 'Nao autenticado.' }); return true; }
    const body = await readJsonBody(req, STOCK_XML_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) { writePayloadTooLarge(req, res); return true; }
    const result = parseStockNfeXml(body?.xml);
    if (result.error) { writeJson(req, res, 400, result); return true; }
    if (db.prepare('SELECT id FROM stock_xml_imports WHERE access_key=?').get(result.invoice.accessKey)) { writeJson(req, res, 409, { error: 'Esta NF-e ja foi importada.' }); return true; }
    writeJson(req, res, 200, result); return true;
  }

  if (pathname === '/api/stock/xml/import' && req.method === 'POST') {
    const adminSession = getAdminSession(req);
    if (!adminSession) { writeJson(req, res, 401, { error: 'Nao autenticado.' }); return true; }
    const body = await readJsonBody(req, STOCK_XML_BODY_MAX_BYTES);
    if (isBodyTooLarge(req)) { writePayloadTooLarge(req, res); return true; }
    const result = importStockNfe(body || {}, adminSession.user || ADMIN_USER, searchParams.get('period') || '30d');
    if (result.error) { writeJson(req, res, result.statusCode || 400, result); return true; }
    writeJson(req, res, 200, {
      ok: true,
      ...result.stock,
      movements: result.movements,
      accessKey: result.accessKey,
      idempotentReplay: result.idempotentReplay,
    }); return true;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/products/')) {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }

    const idRaw = pathname.replace('/api/products/', '').replace(/^\/+|\/+$/g, '');
    const result = deleteProductById(idRaw);
    if (result.error) {
      writeJson(req, res, result.statusCode || 400, result);
      return true;
    }
    if (!result.deleted) {
      writeJson(req, res, 404, { error: 'Produto nao encontrado.' });
      return true;
    }

    writeJson(req, res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    writeJson(req, res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/data') {
    writeJson(req, res, 200, readPublicState());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/data/manifest') {
    writeJson(req, res, 200, readPublicStateManifest());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/default-data') {
    writeJson(req, res, 200, buildStorefrontState(readDefaultState(), { activeOnly: true }));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/order-receipts') {
    const clientIp = getClientIp(req);
    const rateResult = checkSlidingRateLimit(
      ORDER_RECEIPT_RATE_LIMIT,
      clientIp,
      ORDER_RECEIPT_MAX_REQUESTS,
      ORDER_RECEIPT_WINDOW_MS,
      {
        blockMs: ORDER_RECEIPT_RATE_BLOCK_MS,
        blockAfter: ORDER_RECEIPT_RATE_BLOCK_AFTER,
      },
    );
    if (rateResult.limited) {
      const retryAfter = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      writeJson(
        req,
        res,
        429,
        {
          error: rateResult.isBlocked
            ? 'Muitas solicitacoes. IP temporariamente bloqueado.'
            : 'Muitas solicitacoes. Tente novamente em instantes.',
        },
        { 'Retry-After': String(retryAfter) },
      );
      return true;
    }

    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }

    const parsed = parseOrderReceiptUpload(body);
    if (parsed.error) {
      writeJson(req, res, 400, { error: parsed.error });
      return true;
    }

    try {
      const saved = await persistOrderReceipt(parsed.receipt, clientIp);
      writeJson(req, res, 201, { ok: true, receipt: saved });
      return true;
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode >= 500) console.error('Falha ao persistir comprovante Pix.', error);
      writeJson(req, res, statusCode, {
        error: statusCode === 429
          ? String(error.message || 'Limite de comprovantes pendentes atingido.')
          : 'Falha ao salvar comprovante.',
      });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/order-logs/print-test') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    try {
      await printTextSilently(buildSilentPrintTestText());
      writeJson(req, res, 200, {
        ok: true,
        mode: 'silent',
        printer: SILENT_PRINT_PRINTER || 'default',
      });
      return true;
    } catch (error) {
      console.error('Falha ao imprimir pagina de teste silenciosa.', error);
      const errorCode = String(error?.code || 'SILENT_PRINT_FAILED').trim() || 'SILENT_PRINT_FAILED';
      const isCapabilityIssue = errorCode === 'SILENT_PRINT_UNSUPPORTED_ENV' || errorCode === 'SILENT_PRINT_DISABLED';
      writeJson(req, res, isCapabilityIssue ? 409 : 500, {
        error: `Falha na impressao silenciosa: ${String(error?.message || error)}`,
        code: errorCode,
      });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/print-agent/enroll') {
    const clientIp = getClientIp(req);
    const rateResult = checkSlidingRateLimit(
      PRINT_AGENT_ENROLL_RATE_LIMIT,
      clientIp,
      PRINT_AGENT_ENROLL_RATE_MAX_REQUESTS,
      PRINT_AGENT_ENROLL_RATE_WINDOW_MS,
      {
        blockMs: PRINT_AGENT_ENROLL_RATE_BLOCK_MS,
        blockAfter: PRINT_AGENT_ENROLL_RATE_BLOCK_AFTER,
      },
    );
    if (rateResult.limited) {
      writeJson(req, res, 429, { error: 'Muitas tentativas de ativacao. Aguarde e tente novamente.' }, {
        'Retry-After': String(Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000))),
      });
      return true;
    }
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
      return true;
    }

    const body = await readJsonBody(req, 8 * 1024);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const code = String(body?.code || '').trim();
    const bodyClientId = normalizePrintAgentClientId(body?.clientId);
    const headerClientId = normalizePrintAgentClientId(
      headerValueToString(req.headers['x-print-agent-id']),
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !bodyClientId || headerClientId !== bodyClientId) {
      writeJson(req, res, 400, { error: 'Codigo ou identificacao do agente invalido.' });
      return true;
    }

    try {
      const credential = consumePrintAgentEnrollment(code, bodyClientId);
      if (!credential) {
        writeJson(req, res, 401, { error: 'Codigo de ativacao invalido, expirado ou ja utilizado.' });
        return true;
      }
      writeJson(req, res, 200, {
        ok: true,
        serverUrl: getRequestBaseUrl(req),
        token: credential.token,
        clientId: credential.clientId,
        defaults: {
          printMode: 'thermal',
          paperWidthMm: 80,
          feedAfterPrintMm: 15,
          pollMs: 2500,
          startWithWindows: true,
        },
      });
      return true;
    } catch (error) {
      console.error('Falha ao ativar credencial do agente de impressao.', error);
      writeJson(req, res, 500, { error: 'Falha ao ativar agente de impressao.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/print-agent/download/windows-agent.mjs') {
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
      return true;
    }
    if (!hasPrintAgentAccess(req)) {
      writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
      return true;
    }

    try {
      const content = await readFile(PRINT_AGENT_WINDOWS_SCRIPT_PATH);
      writeDownload(
        req,
        res,
        200,
        content,
        'print-agent-windows.mjs',
        'application/javascript; charset=utf-8',
      );
      return true;
    } catch (error) {
      console.error('Falha ao disponibilizar script do agente de impressao.', error);
      writeJson(req, res, 500, { error: 'Falha ao baixar script do agente.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/print-agent/download/windows-app.ps1') {
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
      return true;
    }
    if (!hasPrintAgentAccess(req)) {
      writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
      return true;
    }

    try {
      const content = await readFile(PRINT_AGENT_WINDOWS_APP_PATH);
      writeDownload(
        req,
        res,
        200,
        content,
        'print-agent-windows-app.ps1',
        'text/plain; charset=utf-8',
      );
      return true;
    } catch (error) {
      console.error('Falha ao disponibilizar app do agente de impressao.', error);
      writeJson(req, res, 500, { error: 'Falha ao baixar app do agente.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/print-agent/jobs/stats') {
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
      return true;
    }
    const printAgentAccess = authenticatePrintAgentRequest(req);
    if (!printAgentAccess.ok) {
      writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
      return true;
    }
    const statsClientId = getPrintAgentClientId(req, null, printAgentAccess);
    recordPrintAgentHeartbeat(statsClientId);

    writeJson(req, res, 200, {
      ok: true,
      claimTtlMs: PRINT_AGENT_CLAIM_TTL_MS,
      maxAttempts: PRINT_AGENT_MAX_ATTEMPTS,
      stats: getPrintJobsStats(),
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/print-agent/jobs/claim') {
    if (!PRINT_AGENT_ACTIVE) {
      writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
      return true;
    }
    let printAgentAccess = authenticatePrintAgentRequest(req);
    if (!printAgentAccess.ok) {
      writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
      return true;
    }

    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    printAgentAccess = authenticatePrintAgentRequest(req);
    if (!printAgentAccess.ok) {
      writeJson(req, res, 401, { error: 'Credencial do agente revogada ou invalida.' });
      return true;
    }
    if (!printAgentPayloadMatchesAccess(printAgentAccess, body)) {
      writeJson(req, res, 403, { error: 'Client ID nao corresponde a credencial do agente.' });
      return true;
    }

    try {
      const clientId = getPrintAgentClientId(req, body, printAgentAccess);
      recordPrintAgentHeartbeat(clientId, {
        printMode: body?.printMode,
        paperWidthMm: body?.paperWidthMm,
      });
      const job = claimNextPrintJob(clientId, {
        printMode: body?.printMode,
        paperWidthMm: body?.paperWidthMm,
        receiptColumns: body?.receiptColumns,
      });
      writeJson(req, res, 200, {
        ok: true,
        job,
        claimTtlMs: PRINT_AGENT_CLAIM_TTL_MS,
      });
      return true;
    } catch (error) {
      console.error('Falha ao reservar job de impressao para agente externo.', error);
      writeJson(req, res, 500, { error: 'Falha ao reservar job de impressao.' });
      return true;
    }
  }

  if (req.method === 'POST') {
    const printMatch = pathname.match(/^\/api\/order-logs\/(\d+)\/print$/);
    if (printMatch) {
      if (!getAdminSession(req)) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }
      const orderId = Number.parseInt(printMatch[1], 10);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        writeJson(req, res, 400, { error: 'ID de pedido invalido.' });
        return true;
      }

      const orderLog = getOrderLogById(orderId);
      if (!orderLog) {
        writeJson(req, res, 404, { error: 'Pedido nao encontrado.' });
        return true;
      }
      if (!isOrderAccepted(orderLog)) {
        writeJson(req, res, 409, {
          error: 'Confirme o pedido antes de imprimi-lo.',
          code: 'ORDER_CONFIRMATION_REQUIRED',
        });
        return true;
      }
      const customerName = String(orderLog.customerName || '').trim();
      if (!customerName) {
        writeJson(req, res, 400, { error: 'Impressao bloqueada: pedido sem nome na comanda.' });
        return true;
      }

      try {
        await printOrderLogSilently(orderLog);
        writeJson(req, res, 200, {
          ok: true,
          mode: 'silent',
          printer: SILENT_PRINT_PRINTER || 'default',
          orderId,
        });
        return true;
      } catch (error) {
        console.error(`Falha ao imprimir pedido ${orderId} de forma silenciosa.`, error);
        const errorCode = String(error?.code || 'SILENT_PRINT_FAILED').trim() || 'SILENT_PRINT_FAILED';
        const isCapabilityIssue = errorCode === 'SILENT_PRINT_UNSUPPORTED_ENV' || errorCode === 'SILENT_PRINT_DISABLED';
        writeJson(req, res, isCapabilityIssue ? 409 : 500, {
          error: `Falha na impressao silenciosa: ${String(error?.message || error)}`,
          code: errorCode,
        });
        return true;
      }
    }

    const completeMatch = pathname.match(/^\/api\/print-agent\/jobs\/(\d+)\/complete$/);
    if (completeMatch) {
      if (!PRINT_AGENT_ACTIVE) {
        writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
        return true;
      }
      if (!hasPrintAgentAccess(req)) {
        writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
        return true;
      }

      const jobId = Number.parseInt(completeMatch[1], 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        writeJson(req, res, 400, { error: 'ID de job invalido.' });
        return true;
      }

      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }
      const clientId = getPrintAgentClientId(req, body);
      const completed = completePrintJob(jobId, clientId);
      if (!completed) {
        writeJson(req, res, 409, { error: 'Job nao pertence a este agente, nao foi encontrado ou ja foi finalizado.' });
        return true;
      }

      writeJson(req, res, 200, { ok: true, status: 'done', jobId });
      return true;
    }

    const failMatch = pathname.match(/^\/api\/print-agent\/jobs\/(\d+)\/fail$/);
    if (failMatch) {
      if (!PRINT_AGENT_ACTIVE) {
        writeJson(req, res, 409, { error: 'Agente externo de impressao desativado no servidor.' });
        return true;
      }
      if (!hasPrintAgentAccess(req)) {
        writeJson(req, res, 401, { error: 'Token do agente de impressao invalido.' });
        return true;
      }

      const jobId = Number.parseInt(failMatch[1], 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        writeJson(req, res, 400, { error: 'ID de job invalido.' });
        return true;
      }

      const body = await readJsonBody(req);
      if (isBodyTooLarge(req)) {
        writePayloadTooLarge(req, res);
        return true;
      }

      const errorMessage = trimString(body?.error || body?.errorMessage, 900) || 'Falha de impressao no agente.';
      const clientId = getPrintAgentClientId(req, body);
      const result = failPrintJob(jobId, errorMessage, clientId);
      if (!result.updated) {
        writeJson(req, res, result.status === 'owner_mismatch' ? 409 : 404, {
          error: result.status === 'owner_mismatch'
            ? 'Job reservado por outro agente de impressao.'
            : 'Job nao encontrado ou sem lock ativo.',
        });
        return true;
      }

      writeJson(req, res, 200, {
        ok: true,
        jobId,
        status: result.status,
      });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/order-logs') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Não autenticado.' });
      return true;
    }
    const limit = Number.parseInt(searchParams.get('limit') || '200', 10);
    writeJson(req, res, 200, {
      orderLogs: listOrderLogs(limit),
      ...getOrderLogStats(),
    });
    return true;
  }

  if (req.method === 'POST') {
    const confirmOrderMatch = pathname.match(/^\/api\/order-logs\/(\d+)\/confirm$/);
    if (confirmOrderMatch) {
      const session = getAdminSession(req);
      if (!session) {
        writeJson(req, res, 401, { error: 'Nao autenticado.' });
        return true;
      }

      try {
        const result = confirmPublicOrder(confirmOrderMatch[1], session.user || ADMIN_USER);
        if (result.error) {
          writeJson(req, res, result.statusCode || 409, {
            error: result.error,
            code: result.code || 'ORDER_CONFIRMATION_FAILED',
          });
          return true;
        }
        writeJson(req, res, 200, {
          ok: true,
          orderLog: result.orderLog,
          printJob: result.printJob,
          idempotentReplay: Boolean(result.idempotentReplay),
        });
        return true;
      } catch (error) {
        console.error(`Falha ao confirmar pedido ${confirmOrderMatch[1]}.`, error);
        writeJson(req, res, 500, { error: 'Falha ao confirmar pedido.' });
        return true;
      }
    }
  }

  if (req.method === 'GET' && pathname.startsWith('/api/data/')) {
    const section = sectionFromPath(pathname);
    if (!SECTIONS.includes(section)) {
      writeJson(req, res, 404, { error: 'Seção inválida.' });
      return true;
    }
    const adminSession = getAdminSession(req);
    if (PRIVATE_STATE_SECTIONS.has(section) && !adminSession) {
      writeJson(req, res, 401, { error: 'Nao autenticado.' });
      return true;
    }
    const source = adminSession ? toAdminState(readState()) : readPublicState();
    writeJson(req, res, 200, { [section]: source[section] ?? emptySection(section) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/order-logs') {
    const clientIp = getClientIp(req);
    cleanupExpiredPublicOrders();
    const rateResult = checkSlidingRateLimit(
      ORDER_LOG_RATE_LIMIT,
      clientIp,
      ORDER_LOG_MAX_REQUESTS,
      ORDER_LOG_WINDOW_MS,
      {
        blockMs: ORDER_LOG_RATE_BLOCK_MS,
        blockAfter: ORDER_LOG_RATE_BLOCK_AFTER,
      },
    );
    if (rateResult.limited) {
      const retryAfter = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      writeJson(
        req,
        res,
        429,
        {
          error: rateResult.isBlocked
            ? 'Muitas solicitacoes. IP temporariamente bloqueado.'
            : 'Muitas solicitacoes. Tente novamente em instantes.',
        },
        { 'Retry-After': String(retryAfter) },
      );
      return true;
    }

    const body = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    const sanitized = sanitizeOrderLogPayload(body, { enforceStorefrontPolicy: true });
    if (sanitized.error) {
      writeJson(req, res, 400, { error: sanitized.error });
      return true;
    }

    const clientRequestId = trimString(sanitized.payload.clientRequestId, 120);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,119}$/.test(clientRequestId)) {
      writeJson(req, res, 400, { error: 'Identificador seguro do pedido ausente ou invalido.' });
      return true;
    }
    const requestFingerprint = buildOrderRequestFingerprint(sanitized.payload);
    const confirmationCode = buildOrderConfirmationCode(clientRequestId);
    const submittedAt = new Date().toISOString();
    const pendingPayload = {
      ...sanitized.payload,
      orderCode: `${confirmationCode}-${randomBytes(3).toString('hex').toUpperCase()}`,
      createdAt: submittedAt,
      storeName: waiterStoreName(),
      inventoryTracked: false,
    };

    try {
      const created = createOrderLog(pendingPayload, {
        applyStock: false,
        source: ORDER_SOURCE_STOREFRONT,
        status: ORDER_STATUS_PENDING,
        requestFingerprint,
        confirmationCode,
        clientKey: buildPublicOrderClientKey(clientIp),
      });
      const confirmationRequired = isOrderPending(created);
      const printJob = confirmationRequired
        ? buildPrintJobResultFromOrder(created)
        : {
          enabled: PRINT_AGENT_ACTIVE,
          queued: false,
          deferred: false,
          error: '',
          previewText: '',
          job: PRINT_AGENT_ACTIVE ? getPrintJobByKey(`order:${Number(created.id)}:initial`) : null,
        };
      writeJson(req, res, created.idempotentReplay ? 200 : 202, {
        ok: true,
        confirmationRequired,
        orderLog: created,
        printJob,
      });
      return true;
    } catch (error) {
      writeJson(req, res, Number(error?.statusCode || 400), {
        error: String(error?.message || 'Falha ao criar pedido.'),
        code: String(error?.code || 'ORDER_CREATE_FAILED'),
      });
      return true;
    }
  }

  if (req.method === 'PUT' && pathname === '/api/data') {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Não autenticado.' });
      return true;
    }
    const rawBody = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      writeJson(req, res, 400, { error: 'Corpo inválido.' });
      return true;
    }

    if (Object.hasOwn(rawBody, 'fiscal')) {
      const managerAuth = authorizeManagerAction('fiscal-config', rawBody.fiscal || {});
      if (!managerAuth.ok) {
        writeJson(req, res, managerAuth.statusCode || 403, { error: managerAuth.error });
        return true;
      }
    }
    const body = {};
    for (const [section, value] of Object.entries(rawBody)) {
      body[section] = section === 'fiscal' ? prepareFiscalConfigForStorage(value) : value;
    }

    const invalid = Object.entries(body)
      .filter(([section, value]) => SECTIONS.includes(section) && !isValidSectionValue(section, value))
      .map(([section]) => section);

    if (invalid.length > 0) {
      writeJson(req, res, 400, { error: `Tipo inválido para seção: ${invalid.join(', ')}` });
      return true;
    }

    try {
      writeSections(body);
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400) {
        writeJson(req, res, Number(error.statusCode), {
          error: String(error.message || 'Alteracao de catalogo bloqueada.'),
          code: String(error.code || 'CATALOG_MUTATION_BLOCKED'),
          linkedReferences: error.linkedReferences || {},
        });
        return true;
      }
      throw error;
    }
    writeJson(req, res, 200, { ok: true });
    return true;
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/data/')) {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Não autenticado.' });
      return true;
    }
    const section = sectionFromPath(pathname);
    if (!SECTIONS.includes(section)) {
      writeJson(req, res, 404, { error: 'Seção inválida.' });
      return true;
    }

    const rawBody = await readJsonBody(req);
    if (isBodyTooLarge(req)) {
      writePayloadTooLarge(req, res);
      return true;
    }
    if (section === 'fiscal') {
      const managerAuth = authorizeManagerAction('fiscal-config', rawBody || {});
      if (!managerAuth.ok) {
        writeJson(req, res, managerAuth.statusCode || 403, { error: managerAuth.error });
        return true;
      }
    }
    let body;
    try {
      body = section === 'fiscal' ? prepareFiscalConfigForStorage(rawBody) : rawBody;
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400) {
        writeJson(req, res, Number(error.statusCode), { error: String(error.message || 'Configuracao fiscal invalida.') });
        return true;
      }
      throw error;
    }
    if (!isValidSectionValue(section, body)) {
      const expected = SECTION_SCHEMA[section] === 'object' ? 'objeto' : 'lista';
      writeJson(req, res, 400, { error: `Valor inválido para '${section}'. Esperado: ${expected}.` });
      return true;
    }

    try {
      writeSections({ [section]: body });
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400) {
        writeJson(req, res, Number(error.statusCode), {
          error: String(error.message || 'Alteracao de catalogo bloqueada.'),
          code: String(error.code || 'CATALOG_MUTATION_BLOCKED'),
          linkedReferences: error.linkedReferences || {},
        });
        return true;
      }
      throw error;
    }
    writeJson(req, res, 200, { ok: true });
    return true;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/order-logs/')) {
    if (!getAdminSession(req)) {
      writeJson(req, res, 401, { error: 'Não autenticado.' });
      return true;
    }
    const idRaw = pathname.replace('/api/order-logs/', '').replace(/^\/+|\/+$/g, '');
    if (!/^\d+$/.test(idRaw)) {
      writeJson(req, res, 400, { error: 'ID de pedido inválido.' });
      return true;
    }

    const result = deleteOrderLog(Number.parseInt(idRaw, 10));
    if (result.error) {
      writeJson(req, res, result.statusCode || 409, {
        error: result.error,
        code: result.code || 'ORDER_DELETE_BLOCKED',
        linkedReferences: {
          cashMovements: result.cashMovementCount || 0,
          fiscalDocuments: result.fiscalDocumentCount || 0,
          tableTabs: result.tableTabCount || 0,
          tableTabOrders: result.tableTabOrderCount || 0,
        },
      });
      return true;
    }
    if (!result.deleted) {
      writeJson(req, res, 404, { error: 'Pedido não encontrado.' });
      return true;
    }

    writeJson(req, res, 200, { ok: true });
    return true;
  }

  if (pathname.startsWith('/api/')) {
    writeJson(req, res, 404, { error: 'Rota não encontrada.' });
    return true;
  }

  return false;
}

async function handleStatic(req, res, pathname, searchParams) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    writeStaticMethodNotAllowed(res);
    return;
  }
  const headOnly = req.method === 'HEAD';

  if (pathname === '/garcom') {
    res.writeHead(301, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/garcom/',
    });
    res.end();
    return;
  }

  if (pathname === '/garcom/') {
    await serveFile(res, WAITER_INDEX_FILE_PATH, { headOnly });
    return;
  }

  if (pathname.startsWith('/garcom/')) {
    const rel = pathname.replace('/garcom/', '');
    if (!isAllowedWaiterStaticTarget(rel)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    const filePath = safeResolve(WAITER_DIR, rel);
    if (!filePath) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  if (pathname === '/softtec' || pathname === '/softtec/index.html') {
    res.writeHead(301, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/softtec/',
    });
    res.end();
    return;
  }
  if (pathname === '/softtec/') {
    await serveFile(res, SOFTTEC_INDEX_FILE_PATH, { headOnly });
    return;
  }
  if (pathname.startsWith('/softtec/')) {
    const rel = pathname.replace('/softtec/', '');
    const filePath = safeResolve(SOFTTEC_DIR, rel);
    if (!filePath || !isAllowedSofttecStaticTarget(rel, filePath)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  // Mundonauticasma routes (mirror of /softtec)
  if (pathname === '/Mundonauticasma' || pathname === '/Mundonauticasma/index.html') {
    res.writeHead(301, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/Mundonauticasma/',
    });
    res.end();
    return;
  }
  if (pathname === '/Mundonauticasma/') {
    await serveFile(res, MUNDONAUTICASMA_INDEX_FILE_PATH, { headOnly });
    return;
  }
  if (pathname.startsWith('/Mundonauticasma/')) {
    const rel = pathname.replace('/Mundonauticasma/', '');
    const filePath = safeResolve(MUNDONAUTICASMA_DIR, rel);
    if (!filePath || !isAllowedMundonauticasmaStaticTarget(rel, filePath)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  // Pharmativa Awwwards v2 routes
  if (pathname === '/pharmativa' || pathname === '/pharmativa/index.html') {
    res.writeHead(301, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/pharmativa/',
    });
    res.end();
    return;
  }
  if (pathname === '/pharmativa/') {
    await serveFile(res, PHARMATIVA_INDEX_FILE_PATH, { headOnly });
    return;
  }
  if (pathname.startsWith('/pharmativa/')) {
    const rel = pathname.replace('/pharmativa/', '');
    const filePath = safeResolve(PHARMATIVA_DIR, rel);
    if (!filePath || !isAllowedPharmativaStaticTarget(rel, filePath)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  if (pathname === '/admin') {
    res.writeHead(301, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/admin/',
    });
    res.end();
    return;
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(302, {
      ...defaultSecurityHeaders(),
      ...noCacheHeaders(),
      Location: '/favicon.svg',
    });
    res.end();
    return;
  }

  if (pathname === '/admin/') {
    const adminFile = getAdminSession(req)
      ? path.join(ADMIN_DIR, 'admin.html')
      : ADMIN_LOGIN_FILE_PATH;
    await serveFile(res, adminFile, { headOnly });
    return;
  }

  if (pathname.startsWith('/admin/')) {
    if (!getAdminSession(req)) {
      writeText(res, 401, 'Autenticacao administrativa obrigatoria.');
      return;
    }
    const rel = pathname.replace('/admin/', '');
    if (!isAllowedAdminStaticTarget(rel)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    const filePath = safeResolve(ADMIN_DIR, rel);
    if (!filePath) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  if (pathname === '/admin login/' || pathname === '/admin%20login/') {
    const adminFile = getAdminSession(req)
      ? path.join(ADMIN_DIR, 'admin.html')
      : ADMIN_LOGIN_FILE_PATH;
    await serveFile(res, adminFile, { headOnly });
    return;
  }

  if (pathname.startsWith('/admin login/') || pathname.startsWith('/admin%20login/')) {
    if (!getAdminSession(req)) {
      writeText(res, 401, 'Autenticacao administrativa obrigatoria.');
      return;
    }
    const normalized = pathname.replace('/admin%20login/', '/admin login/');
    const rel = normalized.replace('/admin login/', '');
    if (!isAllowedAdminStaticTarget(rel)) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    const filePath = safeResolve(ADMIN_DIR, rel);
    if (!filePath) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }
    await serveFile(res, filePath, { headOnly });
    return;
  }

  if (pathname.startsWith('/order-receipts/')) {
    const rel = pathname.replace('/order-receipts/', '').replace(/^\/+/, '');
    if (!rel || rel.includes('/')) {
      writeText(res, 404, 'Arquivo não encontrado.');
      return;
    }

    const filePath = safeResolve(ORDER_RECEIPTS_DIR, rel);
    if (!filePath) {
      writeText(res, 403, 'Acesso negado.');
      return;
    }

    if (!isOrderReceiptRequestAuthorized(req, rel, searchParams)) {
      writeJson(req, res, 401, { error: 'Comprovante protegido. Acesso nao autorizado.' });
      return;
    }

    await serveFile(res, filePath, { headOnly });
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    await serveIndexWithBootstrap(req, res);
    return;
  }

  const rootTarget = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = safeResolve(ROOT_DIR, rootTarget);
  if (!resolved) {
    writeText(res, 403, 'Acesso negado.');
    return;
  }
  if (!isAllowedStaticRootTarget(rootTarget, resolved)) {
    writeText(res, 403, 'Acesso negado.');
    return;
  }

  const cacheControl = resolved.startsWith(`${CATALOG_ASSETS_DIR}${path.sep}`)
    ? CATALOG_ASSET_CACHE_CONTROL
    : '';
  await serveFile(res, resolved, { cacheControl, headOnly });
}

async function requestHandler(req, res) {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    writeText(res, 400, 'URL inválida.');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname || '/');
  } catch {
    writeText(res, 400, 'Caminho inválido.');
    return;
  }

  const handledApi = await handleApi(req, res, pathname, parsedUrl.searchParams);
  if (handledApi) return;

  await handleStatic(req, res, pathname, parsedUrl.searchParams);
}

function runServer() {
  initDb();
  const orderReceiptCleanupTimer = setInterval(() => {
    try {
      cleanupExpiredPublicOrders();
      cleanupExpiredOrderReceiptUploads();
    } catch (error) {
      console.error('Falha na limpeza periodica de pedidos e comprovantes pendentes.', error);
    }
  }, ORDER_RECEIPT_CLEANUP_INTERVAL_MS);
  orderReceiptCleanupTimer.unref();

  const server = createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      console.error('Erro não tratado na requisição:', error);
      writeText(res, 500, 'Erro interno do servidor.');
    });
  });

  server.listen(PORT, PUBLIC_HOST, () => {
    console.log(`Servidor ativo em http://${PUBLIC_HOST}:${PORT}`);
    console.log(`Banco SQLite em: ${DB_PATH}`);
    console.log(`Modo de durabilidade SQLite: ${DB_SYNC_MODE}`);
    console.log(`Limite máximo de corpo JSON: ${MAX_JSON_BODY_BYTES} bytes`);
    if (PUBLIC_HOST !== 'localhost' && PUBLIC_HOST !== '127.0.0.1') {
      console.log(`Acesso local em http://localhost:${PORT}`);
    }
    console.log(`Admin em http://${PUBLIC_HOST}:${PORT}/admin/`);
  });

  let shuttingDown = false;
  const closeGracefully = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(orderReceiptCleanupTimer);
    console.log(`Sinal ${signal} recebido. Encerrando servidor com checkpoint do banco...`);
    server.close(() => {
      try {
        checkpointWal('TRUNCATE');
        db.close();
      } catch (error) {
        console.error('Falha ao fechar banco durante encerramento.', error);
      }
      process.exit(0);
    });

    setTimeout(() => {
      try {
        checkpointWal('TRUNCATE');
        db.close();
      } catch {
        // Sem acao: forca encerramento em seguida.
      }
      process.exit(0);
    }, 5000).unref();
  };

  process.once('SIGINT', () => closeGracefully('SIGINT'));
  process.once('SIGTERM', () => closeGracefully('SIGTERM'));
}

runServer();
