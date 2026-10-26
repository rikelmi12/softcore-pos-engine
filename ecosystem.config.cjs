const fs = require("node:fs");
const path = require("node:path");

function parseEnvFileLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) value = quoted[2];
  return { key, value };
}

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvFileLine(line);
    if (!entry) continue;
    // A aplicacao le e descarta ADMIN_PASSWORD apenas durante o bootstrap.
    // Nao copie esse segredo para o ambiente persistido pelo PM2.
    if (entry.key === "ADMIN_PASSWORD") continue;
    if (process.env[entry.key] == null) process.env[entry.key] = entry.value;
  }
}

loadEnvFileIfPresent(path.join(__dirname, ".env"));

const DATA_ENCRYPTION_KEY = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
const ORDER_RECEIPT_LINK_SECRET = String(process.env.ORDER_RECEIPT_LINK_SECRET || '').trim();
const CLOUDFLARED_TUNNEL_ID = String(process.env.CLOUDFLARED_TUNNEL_ID || '').trim();
const PORT = String(process.env.PORT || '8000').trim() || '8000';
const PUBLIC_HOST = String(process.env.PUBLIC_HOST || '127.0.0.1').trim() || '127.0.0.1';
const DB_BACKUP_KEEP_FILES = String(process.env.DB_BACKUP_KEEP_FILES || '2').trim() || '2';
const PRINT_AGENT_ENABLED = String(process.env.PRINT_AGENT_ENABLED || '1').trim() || '1';
const PRINT_AGENT_TOKEN = String(process.env.PRINT_AGENT_TOKEN || '').trim();
const PRINT_AGENT_CLAIM_TTL_MS = String(process.env.PRINT_AGENT_CLAIM_TTL_MS || '120000').trim() || '120000';
const PRINT_AGENT_MAX_ATTEMPTS = String(process.env.PRINT_AGENT_MAX_ATTEMPTS || '3').trim() || '3';
const CORS_ORIGINS = String(
  process.env.CORS_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`,
).trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'auto').trim() || 'auto';

if (DATA_ENCRYPTION_KEY.length < 32) {
  throw new Error(
    "DATA_ENCRYPTION_KEY nao definido ou muito curto. Use um segredo aleatorio com pelo menos 32 caracteres.",
  );
}
if (Buffer.byteLength(ORDER_RECEIPT_LINK_SECRET, 'utf8') < 32) {
  throw new Error(
    "ORDER_RECEIPT_LINK_SECRET nao definido ou muito curto. Use um segredo aleatorio com pelo menos 32 bytes.",
  );
}

const apps = [
  {
    name: "cardapio-api",
    script: "server.mjs",
    cwd: __dirname,
    interpreter: "node",
    autorestart: true,
    max_restarts: 10,
    env: {
      PORT,
      PUBLIC_HOST,
      NODE_ENV: "production",
      NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-certificates.crt",
      ADMIN_USER: "admin",
      DATA_ENCRYPTION_KEY,
      ORDER_RECEIPT_LINK_SECRET,
      DATA_DIR: "/var/lib/cardapio/data",
      DB_SYNC_MODE: "FULL",
      DB_BACKUP_KEEP_FILES,
      MAX_JSON_BODY_BYTES: `${24 * 1024 * 1024}`,
      CORS_ORIGINS,
      TRUST_PROXY,
      ALLOW_NULL_ORIGIN: "0",
      PRINT_AGENT_ENABLED,
      PRINT_AGENT_TOKEN,
      PRINT_AGENT_CLAIM_TTL_MS,
      PRINT_AGENT_MAX_ATTEMPTS,
    },
  },
];

if (CLOUDFLARED_TUNNEL_ID) {
  apps.push({
    name: "Rikelmitunnel",
    script: "cloudflared",
    args: `tunnel run ${CLOUDFLARED_TUNNEL_ID}`,
    cwd: __dirname,
    interpreter: "none",
    autorestart: true,
    max_restarts: 10,
  });
}

module.exports = {
  apps,
};
