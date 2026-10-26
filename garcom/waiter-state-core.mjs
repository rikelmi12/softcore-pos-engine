export const WAITER_DRAFT_SCHEMA_VERSION = 1;
export const WAITER_TABLE_FILTERS = Object.freeze(['mine', 'open', 'awaiting', 'free']);

function safeInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeTokenPart(value, fallback = 'unknown') {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

export function isWaiterManager(actor) {
  return actor?.role === 'manager' || actor?.role === 'admin';
}

export function waiterActorStorageId(actor) {
  const userId = safeInteger(actor?.id ?? actor?.userId);
  if (userId) return `user-${userId}`;
  return `actor-${safeTokenPart(actor?.username, 'anonymous')}`;
}

export function buildWaiterDraftKey(actor, tabId) {
  const normalizedTabId = safeInteger(tabId);
  if (!normalizedTabId) throw new Error('Comanda invalida para o rascunho.');
  return `waiter:draft:v${WAITER_DRAFT_SCHEMA_VERSION}:${waiterActorStorageId(actor)}:tab-${normalizedTabId}`;
}

export function createWaiterRequestId(prefix = 'waiter') {
  const safePrefix = safeTokenPart(prefix, 'waiter').slice(0, 28);
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${safePrefix}:${uuid}`;
  const random = Math.random().toString(36).slice(2);
  return `${safePrefix}:${Date.now().toString(36)}:${random}`;
}

export function normalizeWaiterDraft(raw, { actor, tabId } = {}) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (Number(parsed.schemaVersion) !== WAITER_DRAFT_SCHEMA_VERSION) return null;
  const expectedTabId = safeInteger(tabId);
  const savedTabId = safeInteger(parsed.tabId);
  if (!savedTabId || (expectedTabId && savedTabId !== expectedTabId)) return null;
  if (actor && String(parsed.actorId || '') !== waiterActorStorageId(actor)) return null;

  const items = Array.isArray(parsed.items)
    ? parsed.items
      .filter((entry) => entry?.product && typeof entry.product === 'object')
      .map((entry) => ({
        product: { ...entry.product },
        quantity: Math.max(1, Number.parseInt(String(entry.quantity || 1), 10) || 1),
      }))
      .slice(0, 120)
    : [];
  const pending = parsed.pendingSubmission && typeof parsed.pendingSubmission === 'object'
    ? {
      ...parsed.pendingSubmission,
      clientRequestId: String(parsed.pendingSubmission.clientRequestId || ''),
      status: String(parsed.pendingSubmission.status || 'ready'),
    }
    : null;
  return {
    schemaVersion: WAITER_DRAFT_SCHEMA_VERSION,
    actorId: String(parsed.actorId || ''),
    tabId: savedTabId,
    tabVersion: Math.max(1, Number.parseInt(String(parsed.tabVersion || 1), 10) || 1),
    items,
    note: String(parsed.note || '').slice(0, 600),
    pendingSubmission: pending,
    updatedAt: String(parsed.updatedAt || ''),
  };
}

export function createWaiterDraft({ actor, tabId, tabVersion, items = [], note = '', pendingSubmission = null } = {}) {
  return normalizeWaiterDraft({
    schemaVersion: WAITER_DRAFT_SCHEMA_VERSION,
    actorId: waiterActorStorageId(actor),
    tabId,
    tabVersion,
    items,
    note,
    pendingSubmission,
    updatedAt: new Date().toISOString(),
  }, { actor, tabId });
}

export function waiterTableMatchesFilter(table, filter, actor) {
  const selected = WAITER_TABLE_FILTERS.includes(filter) ? filter : 'mine';
  const tab = table?.activeTab || table?.openTab || null;
  if (selected === 'free') return !tab;
  if (selected === 'open') return tab?.status === 'open';
  if (selected === 'awaiting') return tab?.status === 'awaiting_payment';
  if (!tab) return false;
  const actorId = safeInteger(actor?.id ?? actor?.userId);
  const ownerId = safeInteger(tab?.waiterUserId);
  if (actorId && ownerId) return actorId === ownerId;
  return String(tab?.waiterUsername || '').toLowerCase() === String(actor?.username || '').toLowerCase();
}

export function getWaiterTableCounts(tables = [], actor = null) {
  const list = Array.isArray(tables) ? tables : [];
  return Object.fromEntries(WAITER_TABLE_FILTERS.map((filter) => [
    filter,
    list.filter((table) => waiterTableMatchesFilter(table, filter, actor)).length,
  ]));
}

export function normalizeWaiterPrintStatus(job, requested = true) {
  if (!requested && !job) return 'not_requested';
  if (!job) return 'not_printed';
  const raw = String(job?.status || job?.rawStatus || '').trim().toLowerCase();
  if (raw === 'pending' || raw === 'queued') return 'queued';
  if (raw === 'processing' || raw === 'printing') return 'printing';
  if (raw === 'done' || raw === 'printed') return 'printed';
  if (raw === 'failed') return 'failed';
  return requested ? 'queued' : 'not_requested';
}

export function waiterPrintStatusLabel(job, requested = true) {
  const status = normalizeWaiterPrintStatus(job, requested);
  return ({
    queued: 'Na fila',
    printing: 'Imprimindo',
    printed: 'Impresso',
    failed: 'Falhou',
    not_printed: 'Ainda não impresso',
    not_requested: 'Nao solicitado',
  })[status];
}

export function tabHasPendingWaiterPrint(tab) {
  const jobs = [
    ...(Array.isArray(tab?.accountPrints) ? tab.accountPrints : []),
    ...(Array.isArray(tab?.batches)
      ? tab.batches.flatMap((batch) => [batch?.print?.latest, batch?.print?.initial].filter(Boolean))
      : []),
  ];
  return jobs.some((job) => ['queued', 'printing'].includes(normalizeWaiterPrintStatus(job)));
}

export function isWaiterVersionConflict(errorLike) {
  return Number(errorLike?.status) === 409
    && String(errorLike?.code || errorLike?.body?.code || '') === 'TAB_VERSION_CONFLICT';
}
