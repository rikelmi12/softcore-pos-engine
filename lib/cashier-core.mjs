export function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function moneyToCents(value, fallback = 0) {
  const number = toFiniteNumber(value);
  if (number === null) {
    const fallbackNumber = toFiniteNumber(fallback);
    return Math.round((fallbackNumber || 0) * 100);
  }
  return Math.round(number * 100);
}

export function centsToMoney(value) {
  const cents = Number.parseInt(String(value ?? 0), 10);
  return Number(((Number.isFinite(cents) ? cents : 0) / 100).toFixed(2));
}

export function normalizeMoneyValue(value, fallback = 0) {
  return centsToMoney(moneyToCents(value, fallback));
}

const CASHIER_SPLIT_PAYMENT_METHODS = new Set([
  'dinheiro',
  'pix',
  'cartao',
  'cartao_debito',
  'cartao_credito',
  'voucher',
  'outro',
]);

/**
 * Normaliza uma ou duas parcelas de recebimento e garante que a soma em
 * centavos seja exatamente igual ao total do pedido.
 */
export function normalizeCashierPaymentParts(rawParts, totalAmountCents) {
  const totalCents = Number.parseInt(String(totalAmountCents ?? ''), 10);
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { error: 'Total do pedido invalido para recebimento.', parts: [] };
  }
  if (!Array.isArray(rawParts) || rawParts.length < 1 || rawParts.length > 2) {
    return { error: 'Informe uma ou duas formas de pagamento.', parts: [] };
  }

  const parts = [];
  const usedMethods = new Set();
  for (const rawPart of rawParts) {
    if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) {
      return { error: 'Parcela de pagamento invalida.', parts: [] };
    }
    const method = String(rawPart.method || rawPart.paymentMethod || '').trim().toLowerCase();
    if (!CASHIER_SPLIT_PAYMENT_METHODS.has(method)) {
      return { error: 'Forma de pagamento invalida.', parts: [] };
    }
    if (usedMethods.has(method)) {
      return { error: 'Escolha formas de pagamento diferentes.', parts: [] };
    }
    usedMethods.add(method);

    const suppliedCents = rawPart.amountCents ?? rawPart.amount_cents;
    const amountCents = suppliedCents == null
      ? moneyToCents(rawPart.amount, 0)
      : Number.parseInt(String(suppliedCents), 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { error: 'O valor de cada forma de pagamento deve ser maior que zero.', parts: [] };
    }
    parts.push({
      method,
      amountCents,
      amount: centsToMoney(amountCents),
    });
  }

  const receivedCents = parts.reduce((sum, part) => sum + part.amountCents, 0);
  if (receivedCents !== totalCents) {
    return {
      error: `A soma dos pagamentos deve ser exatamente ${centsToMoney(totalCents).toFixed(2)}.`,
      parts: [],
      totalCents,
      receivedCents,
    };
  }

  return { parts, totalCents, receivedCents };
}

export function getRowAmountCents(row = {}) {
  const amountCents = row.amountCents ?? row.amount_cents;
  const parsed = Number.parseInt(String(amountCents ?? ''), 10);
  if (Number.isFinite(parsed)) return parsed;
  return moneyToCents(row.amount, 0);
}

export function movementSignedCents(type, amountCents) {
  const safeAmountCents = Math.max(0, Number.parseInt(String(amountCents ?? 0), 10) || 0);
  const normalizedType = String(type || '').toLowerCase();
  if (normalizedType === 'withdrawal' || normalizedType === 'refund') return -safeAmountCents;
  return safeAmountCents;
}

export function movementAffectsCashDrawer(row = {}) {
  const paymentMethod = String(row?.paymentMethod ?? row?.payment_method ?? '').trim().toLowerCase();
  return paymentMethod === 'dinheiro';
}

export function calculateExpectedCashDrawerCents(openingAmountCents, totals = {}) {
  const opening = Number.parseInt(String(openingAmountCents ?? 0), 10);
  const drawerNet = Number.parseInt(String(totals?.cashDrawerNetCents ?? 0), 10);
  return (Number.isFinite(opening) ? opening : 0) + (Number.isFinite(drawerNet) ? drawerNet : 0);
}

export function manualCashMovementRequiresRefundAuthorization(type) {
  return String(type || '').trim().toLowerCase() === 'refund';
}

function createEmptyCashTotals(count = 0) {
  return {
    salesCents: 0,
    suppliesCents: 0,
    withdrawalsCents: 0,
    refundsCents: 0,
    adjustmentsCents: 0,
    netCents: 0,
    cashDrawerNetCents: 0,
    sales: 0,
    supplies: 0,
    withdrawals: 0,
    refunds: 0,
    adjustments: 0,
    net: 0,
    cashDrawerNet: 0,
    count,
    byPaymentCents: {},
    byPayment: {},
    byPaymentDetailed: {},
  };
}

function addCashMovementToTotals(totals, row) {
  const type = String(row?.type || '').toLowerCase();
  const paymentMethod = String(row?.paymentMethod || row?.payment_method || 'outro').toLowerCase() || 'outro';
  const amountCents = Math.max(0, getRowAmountCents(row));

  if (type === 'sale') totals.salesCents += amountCents;
  if (type === 'supply') totals.suppliesCents += amountCents;
  if (type === 'withdrawal') totals.withdrawalsCents += amountCents;
  if (type === 'refund') totals.refundsCents += amountCents;
  if (type === 'adjustment') totals.adjustmentsCents += amountCents;

  const signedCents = movementSignedCents(type, amountCents);
  totals.netCents += signedCents;
  if (movementAffectsCashDrawer(row)) totals.cashDrawerNetCents += signedCents;
  totals.byPaymentCents[paymentMethod] = (totals.byPaymentCents[paymentMethod] || 0) + signedCents;

  if (!totals.byPaymentDetailed[paymentMethod]) {
    totals.byPaymentDetailed[paymentMethod] = createEmptyCashTotals(0);
  }
  const methodTotals = totals.byPaymentDetailed[paymentMethod];
  methodTotals.count += 1;
  if (type === 'sale') methodTotals.salesCents += amountCents;
  if (type === 'supply') methodTotals.suppliesCents += amountCents;
  if (type === 'withdrawal') methodTotals.withdrawalsCents += amountCents;
  if (type === 'refund') methodTotals.refundsCents += amountCents;
  if (type === 'adjustment') methodTotals.adjustmentsCents += amountCents;
  methodTotals.netCents += signedCents;
  if (movementAffectsCashDrawer(row)) methodTotals.cashDrawerNetCents += signedCents;
  methodTotals.byPaymentCents[paymentMethod] = (methodTotals.byPaymentCents[paymentMethod] || 0) + signedCents;
}

function normalizeTotals(totals) {
  const moneyFields = [
    ['salesCents', 'sales'],
    ['suppliesCents', 'supplies'],
    ['withdrawalsCents', 'withdrawals'],
    ['refundsCents', 'refunds'],
    ['adjustmentsCents', 'adjustments'],
    ['netCents', 'net'],
    ['cashDrawerNetCents', 'cashDrawerNet'],
  ];
  for (const [centsKey, moneyKey] of moneyFields) {
    totals[centsKey] = Number.parseInt(String(totals[centsKey] || 0), 10) || 0;
    totals[moneyKey] = centsToMoney(totals[centsKey]);
  }
  for (const [method, cents] of Object.entries(totals.byPaymentCents || {})) {
    totals.byPayment[method] = centsToMoney(cents);
  }
  for (const [method, methodTotals] of Object.entries(totals.byPaymentDetailed || {})) {
    totals.byPaymentDetailed[method] = normalizeTotals(methodTotals);
  }
  return totals;
}

export function calculateCashTotalsFromRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const totals = createEmptyCashTotals(list.length);
  for (const row of list) addCashMovementToTotals(totals, row);
  return normalizeTotals(totals);
}
