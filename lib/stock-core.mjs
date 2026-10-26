function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundStockMoney(value) {
  return Number((Math.round((finiteNumber(value, 0) + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function roundStockQuantity(value) {
  return Number((Math.round((finiteNumber(value, 0) + Number.EPSILON) * 1_000_000) / 1_000_000).toFixed(6));
}

export function roundStockUnitCost(value) {
  return Number((Math.round((finiteNumber(value, 0) + Number.EPSILON) * 1_000_000) / 1_000_000).toFixed(6));
}

export function calculateWeightedAverageUnitCost({
  currentQuantity = 0,
  currentAverageUnitCost = 0,
  entryQuantity = 0,
  entryUnitCost = 0,
} = {}) {
  const currentQty = Math.max(0, roundStockQuantity(currentQuantity));
  const incomingQty = Math.max(0, roundStockQuantity(entryQuantity));
  const nextQuantity = roundStockQuantity(currentQty + incomingQty);
  if (nextQuantity <= 0) return 0;

  const currentValue = currentQty * Math.max(0, roundStockUnitCost(currentAverageUnitCost));
  const incomingValue = incomingQty * Math.max(0, roundStockUnitCost(entryUnitCost));
  return roundStockUnitCost((currentValue + incomingValue) / nextQuantity);
}

export function calculateRestoredAverageUnitCost({
  currentQuantity = 0,
  currentAverageUnitCost = 0,
  restoredQuantity = 0,
  restoredUnitCost = 0,
} = {}) {
  return calculateWeightedAverageUnitCost({
    currentQuantity,
    currentAverageUnitCost,
    entryQuantity: restoredQuantity,
    entryUnitCost: restoredUnitCost,
  });
}

export function stockMovementFinancials(rawMovement = {}) {
  const movementType = String(rawMovement.movementType ?? rawMovement.movement_type ?? '').trim();
  const quantity = roundStockQuantity(rawMovement.quantity);
  const unitCost = Math.max(0, roundStockUnitCost(rawMovement.unitCost ?? rawMovement.unit_cost));
  const unitRevenue = Math.max(0, roundStockMoney(rawMovement.unitRevenue ?? rawMovement.unit_revenue));
  let totalCost = roundStockMoney(Math.abs(quantity) * unitCost);
  let totalRevenue = roundStockMoney(Math.abs(quantity) * unitRevenue);

  if (movementType === 'sale_restore') {
    totalCost = -totalCost;
    totalRevenue = -totalRevenue;
  }
  if (!['sale', 'sale_restore'].includes(movementType)) totalRevenue = 0;

  return {
    totalCost,
    totalRevenue,
    grossProfit: roundStockMoney(totalRevenue - (
      ['sale', 'sale_restore'].includes(movementType) ? totalCost : 0
    )),
  };
}

function emptyProductAnalytics(productId, name = '') {
  return {
    productId: String(productId || ''),
    name: String(name || ''),
    quantitySold: 0,
    salesRevenue: 0,
    costOfGoods: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
  };
}

export function buildStockAnalytics({ movements = [], items = [], period = '30d', from = '', to = '' } = {}) {
  const safeMovements = Array.isArray(movements) ? movements : [];
  const safeItems = Array.isArray(items) ? items : [];
  const names = new Map(safeItems.map((item) => [String(item?.productId || ''), String(item?.name || '')]));
  const products = new Map();
  let entryUnits = 0;
  let entryValue = 0;
  let outputUnits = 0;
  let manualExitUnits = 0;
  let manualExitCost = 0;
  let netSalesUnits = 0;
  let netSalesRevenue = 0;
  let netCostOfGoods = 0;

  for (const movement of safeMovements) {
    const type = String(movement?.movementType ?? movement?.movement_type ?? '').trim();
    const quantity = roundStockQuantity(movement?.quantity);
    const unitCost = Math.max(0, roundStockUnitCost(movement?.unitCost ?? movement?.unit_cost));
    const unitRevenue = Math.max(0, roundStockMoney(movement?.unitRevenue ?? movement?.unit_revenue));
    const productId = String(movement?.productId ?? movement?.product_id ?? '');

    const isPositiveEntry = quantity > 0 && ['entry', 'xml_entry', 'initial_count', 'adjustment'].includes(type);
    const isManualOutput = quantity < 0 && ['exit', 'initial_count', 'adjustment'].includes(type);
    if (isPositiveEntry) {
      entryUnits = roundStockQuantity(entryUnits + quantity);
      entryValue = roundStockMoney(entryValue + (quantity * unitCost));
    }
    if (isManualOutput) {
      const units = Math.abs(quantity);
      outputUnits = roundStockQuantity(outputUnits + units);
      manualExitUnits = roundStockQuantity(manualExitUnits + units);
      manualExitCost = roundStockMoney(manualExitCost + (units * unitCost));
    }

    if (type !== 'sale' && type !== 'sale_restore') continue;
    const sign = type === 'sale' ? 1 : -1;
    const units = Math.abs(quantity) * sign;
    const revenue = Math.abs(quantity) * unitRevenue * sign;
    const cogs = Math.abs(quantity) * unitCost * sign;
    netSalesUnits = roundStockQuantity(netSalesUnits + units);
    outputUnits = roundStockQuantity(outputUnits + units);
    netSalesRevenue = roundStockMoney(netSalesRevenue + revenue);
    netCostOfGoods = roundStockMoney(netCostOfGoods + cogs);

    const current = products.get(productId) || emptyProductAnalytics(productId, names.get(productId));
    current.quantitySold = roundStockQuantity(current.quantitySold + units);
    current.salesRevenue = roundStockMoney(current.salesRevenue + revenue);
    current.costOfGoods = roundStockMoney(current.costOfGoods + cogs);
    current.cogs = current.costOfGoods;
    current.grossProfit = roundStockMoney(current.salesRevenue - current.costOfGoods);
    current.grossMarginPercent = current.salesRevenue > 0
      ? roundStockMoney((current.grossProfit / current.salesRevenue) * 100)
      : 0;
    products.set(productId, current);
  }

  const inventoryValue = roundStockMoney(safeItems.reduce((sum, item) => sum + finiteNumber(item?.inventoryValue, 0), 0));
  const potentialRevenue = roundStockMoney(safeItems.reduce((sum, item) => sum + finiteNumber(item?.potentialRevenue, 0), 0));
  const potentialGrossProfit = roundStockMoney(safeItems.reduce((sum, item) => sum + finiteNumber(item?.potentialGrossProfit, 0), 0));
  const salesUnits = Math.max(0, netSalesUnits);
  const salesRevenue = Math.max(0, netSalesRevenue);
  const costOfGoods = Math.max(0, netCostOfGoods);
  const grossProfit = roundStockMoney(salesRevenue - costOfGoods);
  const grossMarginPercent = salesRevenue > 0
    ? roundStockMoney((grossProfit / salesRevenue) * 100)
    : 0;
  const summary = {
    controlledProducts: safeItems.length,
    lowStockCount: safeItems.filter((item) => Boolean(item?.lowStock)).length,
    currentUnits: roundStockQuantity(safeItems.reduce((sum, item) => sum + finiteNumber(item?.quantity, 0), 0)),
    inventoryValue,
    entryUnits,
    entriesQuantity: entryUnits,
    entryValue,
    entriesValue: entryValue,
    outputUnits: Math.max(0, roundStockQuantity(outputUnits)),
    exitsQuantity: manualExitUnits,
    manualExitQuantity: manualExitUnits,
    manualExitCost,
    salesUnits,
    salesQuantity: salesUnits,
    salesRevenue,
    costOfGoods,
    cogs: costOfGoods,
    grossProfit,
    grossMarginPercent,
    potentialRevenue,
    potentialGrossProfit,
    netSalesUnits,
    netSalesRevenue,
    netCostOfGoods,
    netGrossProfit: roundStockMoney(netSalesRevenue - netCostOfGoods),
    hasPriorPeriodReversals: netSalesUnits < 0 || netSalesRevenue < 0 || netCostOfGoods < 0,
  };
  const rankedProducts = [...products.values()]
    .map((product) => {
      const netQuantitySold = product.quantitySold;
      const netSalesRevenue = product.salesRevenue;
      const netCostOfGoods = product.costOfGoods;
      const quantitySold = Math.max(0, netQuantitySold);
      const productRevenue = Math.max(0, netSalesRevenue);
      const productCost = Math.max(0, netCostOfGoods);
      const productProfit = roundStockMoney(productRevenue - productCost);
      return {
        ...product,
        quantitySold,
        salesRevenue: productRevenue,
        costOfGoods: productCost,
        cogs: productCost,
        grossProfit: productProfit,
        grossMarginPercent: productRevenue > 0
          ? roundStockMoney((productProfit / productRevenue) * 100)
          : 0,
        netQuantitySold,
        netSalesRevenue,
        netCostOfGoods,
        netGrossProfit: roundStockMoney(netSalesRevenue - netCostOfGoods),
      };
    })
    .sort((a, b) => (
      b.grossProfit - a.grossProfit
      || b.salesRevenue - a.salesRevenue
      || a.name.localeCompare(b.name, 'pt-BR')
    ));

  return {
    period,
    from,
    to,
    basis: 'estimated_order_sales',
    basisLabel: 'Estimativa pelas baixas realizadas no envio dos pedidos; nao representa lucro liquido ou valor recebido no Caixa.',
    summary,
    ...summary,
    products: rankedProducts,
  };
}
