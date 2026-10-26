function normalizeReferenceCount(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getOrderDeletionGuard({
  cashMovementCount = 0,
  fiscalDocumentCount = 0,
  tableTabCount = 0,
  tableTabOrderCount = 0,
} = {}) {
  const cashMovements = normalizeReferenceCount(cashMovementCount);
  const fiscalDocuments = normalizeReferenceCount(fiscalDocumentCount);
  const tableTabs = normalizeReferenceCount(tableTabCount);
  const tableTabOrders = normalizeReferenceCount(tableTabOrderCount);
  const blocked = cashMovements > 0
    || fiscalDocuments > 0
    || tableTabs > 0
    || tableTabOrders > 0;

  return {
    blocked,
    cashMovementCount: cashMovements,
    fiscalDocumentCount: fiscalDocuments,
    tableTabCount: tableTabs,
    tableTabOrderCount: tableTabOrders,
    code: blocked ? 'ORDER_HAS_LINKED_RECORDS' : '',
    error: blocked
      ? 'Pedido nao pode ser excluido porque possui comanda, movimentos de caixa ou documentos fiscais vinculados.'
      : '',
  };
}
