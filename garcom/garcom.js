(async () => {
  'use strict';

  const [pizzaCore, waiterStateCore] = await Promise.all([
    import('/garcom/waiter-pizza-core.mjs'),
    import('/garcom/waiter-state-core.mjs'),
  ]);
  const {
    buildWaiterTheme,
    buildWaiterPizzaCartItem,
    getWaiterPizzaBorderSizeCode,
    getWaiterPizzaSizeKey,
    isSameWaiterPizzaSize,
    isWaiterPizzaProduct,
    normalizeWaiterBorderCatalog,
  } = pizzaCore;
  const {
    buildWaiterDraftKey,
    createWaiterDraft,
    createWaiterRequestId,
    getWaiterTableCounts,
    isWaiterManager,
    isWaiterVersionConflict,
    normalizeWaiterDraft,
    normalizeWaiterPrintStatus,
    waiterPrintStatusLabel,
    waiterTableMatchesFilter,
  } = waiterStateCore;

  const POLL_INTERVAL_MS = 5000;
  const THEME_SYNC_VISIBLE_INTERVAL_MS = 3000;
  const THEME_SYNC_HIDDEN_INTERVAL_MS = 12000;
  const THEME_SYNC_OFFLINE_INTERVAL_MS = 8000;
  const THEME_MANIFEST_TIMEOUT_MS = 2500;

  const state = {
    actor: null,
    csrfToken: '',
    dashboard: null,
    catalog: { products: [], categories: [], borders: [], combos: [] },
    currentTab: null,
    selectedTableId: null,
    openTableFlow: null,
    cart: new Map(),
    pendingSubmission: null,
    category: 'all',
    tableFilter: 'mine',
    tableQuery: '',
    productQuery: '',
    pizzaFlow: null,
    removalFlow: null,
    reprintFlow: null,
    accountFlow: null,
    accountPrintRequest: null,
    orderPrintRequests: new Map(),
    transferFlow: null,
    reopenFlow: null,
    conflictFlow: null,
    refreshingTab: false,
    busy: false,
    online: navigator.onLine,
    config: {},
    configManifestSignature: '',
    pollCount: 0,
    lastConflictVersion: null,
  };

  let publicDataRequest = null;
  let themeSyncRequest = null;
  let themeSyncTimer = null;
  let pollTimer = null;
  let toastTimer = null;
  let cartReturnFocus = null;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    loginScreen: $('#loginScreen'),
    loginForm: $('#loginForm'),
    loginUser: $('#loginUser'),
    loginPassword: $('#loginPassword'),
    loginError: $('#loginError'),
    waiterApp: $('#waiterApp'),
    pageTitle: $('#pageTitle'),
    actorSummary: $('#actorSummary'),
    actorAvatar: $('#actorAvatar'),
    currentWaiterName: $('#currentWaiterName'),
    currentWaiterRole: $('#currentWaiterRole'),
    refreshButton: $('#refreshButton'),
    logoutButton: $('#logoutButton'),
    networkBanner: $('#networkBanner'),
    printerBanner: $('#printerBanner'),
    printerBannerText: $('#printerBannerText'),
    dashboardView: $('#dashboardView'),
    tabView: $('#tabView'),
    statusStrip: $('#statusStrip'),
    tableSearch: $('#tableSearch'),
    tableFilters: $('#tableFilters'),
    tableGrid: $('#tableGrid'),
    historyList: $('#historyList'),
    addTableButton: $('#addTableButton'),
    backButton: $('#backButton'),
    tabHero: $('#tabHero'),
    batchList: $('#batchList'),
    accountActions: $('#accountActions'),
    catalogPanel: $('#catalogPanel'),
    productSearch: $('#productSearch'),
    categoryChips: $('#categoryChips'),
    productGrid: $('#productGrid'),
    cartBar: $('#cartBar'),
    cartToggle: $('#cartToggle'),
    cartCount: $('#cartCount'),
    cartTotal: $('#cartTotal'),
    drawerTotal: $('#drawerTotal'),
    cartDrawer: $('#cartDrawer'),
    drawerBackdrop: $('#drawerBackdrop'),
    closeCartButton: $('#closeCartButton'),
    cartItems: $('#cartItems'),
    orderNote: $('#orderNote'),
    saveOrderButton: $('#saveOrderButton'),
    printOrderButton: $('#printOrderButton'),
    openTableDialog: $('#openTableDialog'),
    openTableForm: $('#openTableForm'),
    openTableTitle: $('#openTableTitle'),
    openTableActorName: $('#openTableActorName'),
    assignedWaiterField: $('#assignedWaiterField'),
    assignedWaiter: $('#assignedWaiter'),
    customerName: $('#customerName'),
    tableNotes: $('#tableNotes'),
    openTableError: $('#openTableError'),
    closeOpenTableDialogButton: $('#closeOpenTableDialogButton'),
    addTableDialog: $('#addTableDialog'),
    addTableForm: $('#addTableForm'),
    newTableNumber: $('#newTableNumber'),
    newTableLabel: $('#newTableLabel'),
    addTableError: $('#addTableError'),
    closeAddTableDialogButton: $('#closeAddTableDialogButton'),
    closeAccountDialog: $('#closeAccountDialog'),
    closeAccountForm: $('#closeAccountForm'),
    closeAccountTable: $('#closeAccountTable'),
    closeAccountCustomer: $('#closeAccountCustomer'),
    closeAccountItems: $('#closeAccountItems'),
    closeAccountTotal: $('#closeAccountTotal'),
    closeAccountError: $('#closeAccountError'),
    closeAccountDialogButton: $('#closeAccountDialogButton'),
    cancelCloseAccountButton: $('#cancelCloseAccountButton'),
    confirmCloseAccountButton: $('#confirmCloseAccountButton'),
    reprintDialog: $('#reprintDialog'),
    reprintForm: $('#reprintForm'),
    reprintDialogTitle: $('#reprintDialogTitle'),
    reprintDialogCopy: $('#reprintDialogCopy'),
    reprintReason: $('#reprintReason'),
    reprintError: $('#reprintError'),
    closeReprintDialogButton: $('#closeReprintDialogButton'),
    transferTableDialog: $('#transferTableDialog'),
    transferTableForm: $('#transferTableForm'),
    transferCurrentSummary: $('#transferCurrentSummary'),
    linkedTablesList: $('#linkedTablesList'),
    linkTargetTable: $('#linkTargetTable'),
    linkTableButton: $('#linkTableButton'),
    transferTargetTable: $('#transferTargetTable'),
    transferTargetWaiterField: $('#transferTargetWaiterField'),
    transferTargetWaiter: $('#transferTargetWaiter'),
    transferReason: $('#transferReason'),
    transferTableError: $('#transferTableError'),
    closeTransferDialogButton: $('#closeTransferDialogButton'),
    reopenTableDialog: $('#reopenTableDialog'),
    reopenTableForm: $('#reopenTableForm'),
    reopenReason: $('#reopenReason'),
    reopenTableError: $('#reopenTableError'),
    closeReopenDialogButton: $('#closeReopenDialogButton'),
    conflictDialog: $('#conflictDialog'),
    conflictMessage: $('#conflictMessage'),
    conflictSummary: $('#conflictSummary'),
    acknowledgeConflictButton: $('#acknowledgeConflictButton'),
    pizzaDialog: $('#pizzaDialog'),
    pizzaDialogTitle: $('#pizzaDialogTitle'),
    pizzaDialogCopy: $('#pizzaDialogCopy'),
    pizzaDialogContent: $('#pizzaDialogContent'),
    closePizzaDialogButton: $('#closePizzaDialogButton'),
    removeItemDialog: $('#removeItemDialog'),
    removeItemForm: $('#removeItemForm'),
    removeItemSummary: $('#removeItemSummary'),
    removeItemQuantity: $('#removeItemQuantity'),
    removeItemReason: $('#removeItemReason'),
    removeItemPrint: $('#removeItemPrint'),
    removeItemError: $('#removeItemError'),
    closeRemoveItemDialogButton: $('#closeRemoveItemDialogButton'),
    printPreviewDialog: $('#printPreviewDialog'),
    printPreviewText: $('#printPreviewText'),
    closePreviewButton: $('#closePreviewButton'),
    browserPrintButton: $('#browserPrintButton'),
    toast: $('#toast'),
  };

  class ApiError extends Error {
    constructor(message, { status = 0, code = '', body = null, cause = null } = {}) {
      super(message, cause ? { cause } : undefined);
      this.name = 'ApiError';
      this.status = status;
      this.code = code || body?.code || '';
      this.body = body;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  function dateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function elapsed(value) {
    const started = new Date(value).getTime();
    if (!Number.isFinite(started)) return '--';
    const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }

  function roleLabel(role) {
    if (role === 'admin') return 'Administrador';
    if (role === 'manager') return 'Gerente';
    return 'Garçom';
  }

  function cashierStatusLabel(tab) {
    const status = String(tab?.cashier?.status || '').toLowerCase();
    if (status === 'paid') return 'Recebida no Caixa';
    if (status === 'refunded') return 'Estornada no Caixa';
    if (tab?.status === 'awaiting_payment' || tab?.cashierOrderId) return 'Aguardando pagamento no Caixa';
    return 'Sem cobrança no Caixa';
  }

  function setConnectivity(online) {
    state.online = Boolean(online);
    elements.networkBanner.classList.toggle('is-hidden', state.online);
  }

  function renderActorIdentity() {
    const name = state.actor?.displayName || state.actor?.username || 'Equipe';
    elements.currentWaiterName.textContent = name;
    elements.currentWaiterRole.textContent = roleLabel(state.actor?.role);
    elements.actorAvatar.textContent = (name.trim()[0] || 'G').toUpperCase();
    elements.actorSummary.setAttribute('aria-label', `${name}, ${roleLabel(state.actor?.role)}`);
    elements.actorSummary.title = `${name} · ${roleLabel(state.actor?.role)}`;
    elements.addTableButton.classList.remove('is-hidden');
  }

  function renderPrinterBanner() {
    const printAgent = state.dashboard?.printAgent;
    if (!printAgent) {
      elements.printerBanner.classList.add('is-hidden');
      return;
    }
    const enabled = printAgent.enabled !== false;
    const online = Boolean(printAgent.agent?.online);
    elements.printerBanner.classList.toggle('is-hidden', enabled && online);
    elements.printerBannerText.textContent = !enabled
      ? 'A impressão automática não está ativa. Use a prévia do navegador.'
      : 'O agente do Caixa está offline. Pedidos ficam registrados, mas confirme a impressão.';
  }

  async function api(path, options = {}) {
    const {
      timeoutMs = 12000,
      skipCsrf = false,
      handleUnauthorized = true,
      affectConnectivity = true,
      ...requestOptions
    } = options;
    const method = String(requestOptions.method || 'GET').toUpperCase();
    const headers = { ...(requestOptions.headers || {}) };
    if (requestOptions.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (
      !skipCsrf
      && state.csrfToken
      && path.startsWith('/api/waiter/')
      && !['GET', 'HEAD', 'OPTIONS'].includes(method)
      && path !== '/api/waiter/login'
    ) {
      headers['X-Waiter-CSRF'] = state.csrfToken;
    }

    let controller = null;
    let timer = null;
    if (!requestOptions.signal && typeof AbortController === 'function' && timeoutMs > 0) {
      controller = new AbortController();
      requestOptions.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...requestOptions,
        method,
        headers,
      });
      if (affectConnectivity) setConnectivity(true);
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json()
        : { error: await response.text() };
      if (response.status === 401 && handleUnauthorized && path !== '/api/waiter/login') {
        showLogin();
      }
      if (!response.ok) {
        throw new ApiError(body?.error || `Falha na solicitação (HTTP ${response.status}).`, {
          status: response.status,
          code: body?.code,
          body,
        });
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (affectConnectivity) setConnectivity(false);
      const timedOut = error?.name === 'AbortError';
      throw new ApiError(
        timedOut ? 'A conexão demorou demais. Confira a internet e tente novamente.' : 'Sem conexão com o sistema. Seu rascunho continua salvo.',
        { status: 0, code: timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', cause: error },
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function toast(message, type = 'success') {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', type === 'error');
    elements.toast.classList.remove('is-hidden');
    toastTimer = setTimeout(() => elements.toast.classList.add('is-hidden'), 4200);
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    document.body.classList.toggle('is-busy', state.busy);
    document.body.setAttribute('aria-busy', String(state.busy));
    if (state.busy) {
      document.querySelectorAll('button:not(:disabled)').forEach((button) => {
        button.dataset.waiterBusyDisabled = 'true';
        button.disabled = true;
      });
    } else {
      document.querySelectorAll('button[data-waiter-busy-disabled="true"]').forEach((button) => {
        delete button.dataset.waiterBusyDisabled;
        button.disabled = false;
      });
      renderTab();
      renderCart();
    }
  }

  function closeAllDialogs() {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    state.selectedTableId = null;
    state.openTableFlow = null;
    state.pizzaFlow = null;
    state.removalFlow = null;
    state.reprintFlow = null;
    state.accountFlow = null;
    state.accountPrintRequest = null;
    state.transferFlow = null;
    state.reopenFlow = null;
    state.conflictFlow = null;
  }

  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function showLogin() {
    persistCurrentDraft();
    stopPolling();
    state.actor = null;
    state.csrfToken = '';
    state.dashboard = null;
    state.currentTab = null;
    state.cart.clear();
    state.orderPrintRequests.clear();
    state.pendingSubmission = null;
    elements.waiterApp.classList.add('is-hidden');
    elements.loginScreen.classList.remove('is-hidden');
    elements.cartBar.classList.add('is-hidden');
    closeCart({ restoreFocus: false });
    closeAllDialogs();
    elements.loginPassword.value = '';
    setTimeout(() => elements.loginUser.focus(), 50);
  }

  function applyWaiterTheme(config = {}) {
    const theme = buildWaiterTheme(config);
    const root = document.documentElement;
    Object.entries(theme.cssVariables).forEach(([name, value]) => root.style.setProperty(name, value));
    root.dataset.waiterTheme = 'admin';
    state.config = { ...config };
    if (document.body) {
      document.body.style.backgroundColor = theme.colors.bg;
      document.body.style.color = theme.colors.text;
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', theme.colors.primary);
    return theme;
  }

  function getConfigManifestSignature(manifest) {
    const config = manifest?.sections?.config;
    if (!config || typeof config !== 'object') return '';
    const updatedAt = String(config.updatedAt || '');
    const bytes = Number.parseInt(String(config.bytes || 0), 10) || 0;
    return updatedAt || bytes ? `${updatedAt}:${bytes}` : '';
  }

  async function loadPublicData() {
    if (publicDataRequest) return publicDataRequest;
    publicDataRequest = api('/api/data').finally(() => {
      publicDataRequest = null;
    });
    return publicDataRequest;
  }

  async function apiWithTimeout(path, options = {}, timeoutMs = THEME_MANIFEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await api(path, {
        ...options,
        signal: controller.signal,
        handleUnauthorized: false,
        affectConnectivity: false,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function syncWaiterTheme({ force = false } = {}) {
    if (themeSyncRequest) return themeSyncRequest;
    themeSyncRequest = (async () => {
      const readManifestSignature = async () => {
        try {
          const manifest = await apiWithTimeout('/api/data/manifest');
          return getConfigManifestSignature(manifest);
        } catch {
          return '';
        }
      };
      if (force) {
        const manifestRequest = readManifestSignature();
        const data = await loadPublicData();
        applyWaiterTheme(data?.config || {});
        const signature = await manifestRequest;
        if (signature) state.configManifestSignature = signature;
        return true;
      }
      const signature = await readManifestSignature();
      if (signature && signature === state.configManifestSignature) return false;
      const data = await loadPublicData();
      applyWaiterTheme(data?.config || {});
      if (signature) state.configManifestSignature = signature;
      return true;
    })().finally(() => {
      themeSyncRequest = null;
    });
    return themeSyncRequest;
  }

  function getNextThemeSyncDelay() {
    if (!navigator.onLine) return THEME_SYNC_OFFLINE_INTERVAL_MS;
    if (document.hidden) return THEME_SYNC_HIDDEN_INTERVAL_MS;
    return THEME_SYNC_VISIBLE_INTERVAL_MS;
  }

  function scheduleNextThemeSync() {
    clearTimeout(themeSyncTimer);
    themeSyncTimer = setTimeout(async () => {
      try { await syncWaiterTheme(); } catch { /* A próxima rodada tenta novamente. */ }
      scheduleNextThemeSync();
    }, getNextThemeSyncDelay());
  }

  function syncWaiterThemeNow({ force = false } = {}) {
    clearTimeout(themeSyncTimer);
    return syncWaiterTheme({ force }).catch(() => false).finally(scheduleNextThemeSync);
  }

  function cartItemsForStorage() {
    return [...state.cart.values()].map(({ product, quantity }) => ({ product, quantity }));
  }

  function draftStorageKey(tabId = state.currentTab?.id) {
    if (!state.actor || !tabId) return '';
    try { return buildWaiterDraftKey(state.actor, tabId); } catch { return ''; }
  }

  function persistCurrentDraft() {
    const key = draftStorageKey();
    if (!key || !state.currentTab) return;
    const items = cartItemsForStorage();
    const note = elements.orderNote.value.trim();
    try {
      if (!items.length && !note && !state.pendingSubmission) {
        localStorage.removeItem(key);
        return;
      }
      const draft = createWaiterDraft({
        actor: state.actor,
        tabId: state.currentTab.id,
        tabVersion: state.currentTab.version,
        items,
        note,
        pendingSubmission: state.pendingSubmission,
      });
      if (draft) localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      toast('Não foi possível salvar o rascunho neste aparelho.', 'error');
    }
  }

  function clearStoredDraft(tabId = state.currentTab?.id) {
    const key = draftStorageKey(tabId);
    if (!key) return;
    try { localStorage.removeItem(key); } catch { /* Armazenamento indisponível. */ }
  }

  function getTableDraftCount(tabId) {
    const key = draftStorageKey(tabId);
    if (!key) return 0;
    try {
      const draft = normalizeWaiterDraft(localStorage.getItem(key), { actor: state.actor, tabId });
      return (draft?.items || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    } catch {
      return 0;
    }
  }

  function restoreDraftForCurrentTab() {
    state.cart.clear();
    state.pendingSubmission = null;
    elements.orderNote.value = '';
    if (!state.currentTab || state.currentTab.status !== 'open') {
      renderCart();
      return;
    }
    const key = draftStorageKey();
    if (!key) return;
    try {
      const draft = normalizeWaiterDraft(localStorage.getItem(key), {
        actor: state.actor,
        tabId: state.currentTab.id,
      });
      if (!draft) return;
      draft.items.forEach(({ product, quantity }) => {
        if (product?.id != null) state.cart.set(String(product.id), { product, quantity });
      });
      elements.orderNote.value = draft.note;
      state.pendingSubmission = draft.pendingSubmission;
      renderCart();
      if (draft.items.length) toast(`Rascunho restaurado: ${draft.items.reduce((sum, item) => sum + item.quantity, 0)} item(ns).`);
    } catch {
      // Um rascunho inválido não interrompe o atendimento.
    }
  }

  function ensureDraftEditable() {
    if (!state.pendingSubmission) return true;
    toast('Há um envio aguardando confirmação. Verifique ou reenvie antes de alterar os itens.', 'error');
    openCart();
    return false;
  }

  function clearCurrentDraftAfterSuccess() {
    clearStoredDraft();
    state.cart.clear();
    state.pendingSubmission = null;
    elements.orderNote.value = '';
    closeCart({ restoreFocus: false });
    renderCart();
  }

  async function loadDashboard({ render = true } = {}) {
    const dashboard = await api('/api/waiter/dashboard');
    state.dashboard = dashboard;
    if (dashboard.actor) state.actor = dashboard.actor;
    renderActorIdentity();
    renderPrinterBanner();
    if (render) renderDashboard();
    return dashboard;
  }

  async function loadCatalog() {
    const data = await loadPublicData();
    applyWaiterTheme(data?.config || {});
    state.catalog.products = Array.isArray(data.products) ? data.products.filter((product) => product.active !== false) : [];
    state.catalog.categories = Array.isArray(data.categories) ? data.categories.filter((category) => category.active !== false) : [];
    state.catalog.borders = normalizeWaiterBorderCatalog(data.borders);
    state.catalog.combos = Array.isArray(data.combos) ? data.combos.filter((combo) => combo.active !== false) : [];
    renderCategories();
    renderProducts();
  }

  async function bootApp(session = null) {
    if (session?.actor) state.actor = session.actor;
    if (session?.csrfToken) state.csrfToken = session.csrfToken;
    elements.loginScreen.classList.add('is-hidden');
    elements.waiterApp.classList.remove('is-hidden');
    renderActorIdentity();
    await Promise.all([loadDashboard(), loadCatalog()]);
    showDashboard({ historyMode: 'replace' });
    startPolling();
  }

  function showDashboard({ historyMode = 'replace' } = {}) {
    persistCurrentDraft();
    state.currentTab = null;
    state.cart.clear();
    state.pendingSubmission = null;
    elements.orderNote.value = '';
    elements.pageTitle.textContent = 'Salão';
    elements.dashboardView.classList.remove('is-hidden');
    elements.tabView.classList.add('is-hidden');
    elements.cartBar.classList.add('is-hidden');
    closeCart({ restoreFocus: false });
    renderDashboard();
    if (historyMode === 'replace') history.replaceState({ waiterView: 'dashboard' }, '', location.pathname);
    if (historyMode === 'push') history.pushState({ waiterView: 'dashboard' }, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function showTab(tabId, suppliedTab = null, { historyMode = 'push' } = {}) {
    if (state.currentTab && Number(state.currentTab.id) !== Number(tabId)) persistCurrentDraft();
    const tab = suppliedTab && !suppliedTab.restricted
      ? suppliedTab
      : (await api(`/api/waiter/tabs/${tabId}`)).tab;
    state.currentTab = tab;
    state.lastConflictVersion = null;
    state.category = 'all';
    state.productQuery = '';
    elements.productSearch.value = '';
    elements.pageTitle.textContent = tab.tableDisplay || `Mesa ${tab.tableNumber}`;
    elements.dashboardView.classList.add('is-hidden');
    elements.tabView.classList.remove('is-hidden');
    restoreDraftForCurrentTab();
    renderTab();
    renderCategories();
    renderProducts();
    renderCart();
    if (historyMode === 'push') history.pushState({ waiterView: 'tab', tabId: tab.id }, '', location.pathname);
    if (historyMode === 'replace') history.replaceState({ waiterView: 'tab', tabId: tab.id }, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (state.pendingSubmission && state.online) reconcilePendingSubmission({ notify: true }).catch(() => {});
  }

  function updateFilterButtons(counts) {
    elements.tableFilters.querySelectorAll('[data-table-filter]').forEach((button) => {
      const filter = button.dataset.tableFilter;
      const active = state.tableFilter === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      const count = button.querySelector('[data-filter-count]');
      if (count) count.textContent = String(counts[filter] || 0);
    });
  }

  function renderDashboard() {
    if (!state.dashboard) return;
    const tables = state.dashboard.tables || [];
    const open = tables.filter((table) => (table.activeTab || table.openTab)?.status === 'open').length;
    const awaiting = tables.filter((table) => (table.activeTab || table.openTab)?.status === 'awaiting_payment').length;
    const free = tables.length - open - awaiting;
    const uniqueActiveTabs = new Map();
    tables.forEach((table) => {
      const tab = table.activeTab || table.openTab;
      if (tab?.id && !uniqueActiveTabs.has(Number(tab.id))) uniqueActiveTabs.set(Number(tab.id), tab);
    });
    const activeTotal = [...uniqueActiveTabs.values()]
      .reduce((sum, tab) => sum + Number(tab?.totals?.total || 0), 0);
    elements.statusStrip.innerHTML = `
      <div class="status-card is-open"><strong>${open}</strong><span>mesas abertas</span></div>
      <div class="status-card"><strong>${awaiting}</strong><span>aguardando Caixa</span></div>
      <div class="status-card"><strong>${money(activeTotal)}</strong><span>${free} livre(s)</span></div>`;

    const counts = getWaiterTableCounts(tables, state.actor);
    updateFilterButtons(counts);
    const query = normalizeText(state.tableQuery);
    const filtered = tables.filter((table) => {
      const tab = table.activeTab || table.openTab;
      const haystack = normalizeText(`${table.tableNumber} ${table.label} ${tab?.customerName || ''} ${tab?.waiterName || ''}`);
      return waiterTableMatchesFilter(table, state.tableFilter, state.actor) && (!query || haystack.includes(query));
    });
    elements.tableGrid.innerHTML = filtered.length ? filtered.map((table) => {
      const tab = table.activeTab || table.openTab;
      const awaitingPayment = tab?.status === 'awaiting_payment';
      const restricted = Boolean(tab?.restricted);
      const draftCount = tab?.id ? getTableDraftCount(tab.id) : 0;
      const details = tab
        ? `${escapeHtml(tab.customerName || 'Sem identificação')} · ${escapeHtml(tab.waiterName || 'Equipe')} · ${elapsed(tab.openedAt)}`
        : escapeHtml(table.label || 'Toque para abrir');
      return `
        <button class="table-card ${tab?.status === 'open' ? 'open' : ''} ${awaitingPayment ? 'awaiting' : ''} ${restricted ? 'restricted' : ''}" type="button"
          data-table-id="${table.id}" data-tab-id="${tab?.id || ''}" data-restricted="${restricted ? 'true' : 'false'}"
          ${restricted ? 'aria-disabled="true"' : ''}>
          ${draftCount ? `<span class="table-draft-badge">Rascunho ${draftCount}</span>` : ''}
          <span class="table-number">Mesa ${table.tableNumber}</span>
          <span class="table-state">${awaitingPayment ? 'Aguardando Caixa' : tab ? 'Em atendimento' : 'Livre'}</span>
          <span class="table-meta">
            <span class="table-card-details">${details}</span>
            <strong>${tab ? money(tab.totals?.total) : 'Abrir'}</strong>
          </span>
        </button>`;
    }).join('') : '<div class="empty-state">Nenhuma mesa neste filtro.</div>';

    const historyRows = state.dashboard.recentClosedTabs || [];
    elements.historyList.innerHTML = historyRows.length ? historyRows.map((tab) => `
      <button class="history-row" type="button" data-history-tab-id="${tab.id}">
        <span class="history-table">${tab.tableNumber}</span>
        <span><p>${escapeHtml(tab.customerName || tab.tableDisplay || `Mesa ${tab.tableNumber}`)}</p><small>${dateTime(tab.closedAt)} · ${tab.batchCount} pedido(s) · ${escapeHtml(cashierStatusLabel(tab))}</small></span>
        <strong>${money(tab.totals?.total)}</strong>
      </button>`).join('') : '<div class="empty-state">As suas contas fechadas aparecerão aqui.</div>';
    elements.tableGrid.setAttribute('aria-busy', 'false');
  }

  function renderPrintStatus(job, requested = true) {
    const status = normalizeWaiterPrintStatus(job, requested);
    const label = waiterPrintStatusLabel(job, requested);
    const error = status === 'failed' && job?.lastError
      ? `<span class="print-error-copy">${escapeHtml(job.lastError)}</span>`
      : '';
    return `<span class="print-status" data-status="${status}" title="${escapeHtml(job?.lastError || label)}">${escapeHtml(label)}</span>${error}`;
  }

  function latestAccountPrint(tab) {
    return (tab?.accountPrints || []).find((job) => (
      job.operationKind === 'table_account_final' || job.operationKind === 'table_account_preview'
    )) || null;
  }

  function hasPriorAccountPrint(tab) {
    return Boolean(latestAccountPrint(tab));
  }

  function renderTab() {
    const tab = state.currentTab;
    if (!tab) return;
    const isOpen = tab.status === 'open';
    const isAwaiting = tab.status === 'awaiting_payment';
    const accountPrint = latestAccountPrint(tab);
    elements.tabHero.innerHTML = `
      <div>
        <p class="eyebrow">${isOpen ? 'Comanda aberta' : isAwaiting ? 'Aguardando o Caixa' : 'Comanda fechada'}</p>
        <h2>${escapeHtml(tab.tableDisplay || `Mesa ${tab.tableNumber}`)}</h2>
        <p>${escapeHtml(tab.customerName || 'Sem identificação')} · ${escapeHtml(tab.waiterName || 'Garçom não informado')}</p>
        ${tab.notes ? `<p class="tab-note">Observação: ${escapeHtml(tab.notes)}</p>` : ''}
        ${isOpen ? `<p>${elapsed(tab.openedAt)} em atendimento</p>` : `<span class="closed-badge">${escapeHtml(cashierStatusLabel(tab))}</span>`}
        ${accountPrint ? `<div class="account-print-state">${renderPrintStatus(accountPrint, true)}</div>` : ''}
      </div>
      <div class="hero-total"><span>Total da mesa</span><strong>${money(tab.totals?.total)}</strong><span>${tab.itemCount} item(ns)</span></div>`;

    elements.batchList.innerHTML = tab.batches?.length ? tab.batches.map((batch) => {
      const initialPrintJob = batch.print?.initial || null;
      const printJob = batch.print?.latest || initialPrintJob;
      return `
        <article class="batch-card">
          <div class="batch-head"><div><p>Pedido ${batch.batchNumber}</p><small>${dateTime(batch.createdAt)}</small></div><strong>${money(batch.totals?.total)}</strong></div>
          <div class="batch-body">
            ${(batch.items || []).map((item) => `
              <div class="batch-item">
                <span>${item.quantity}× ${escapeHtml(item.name)}${item.borderLabel ? `<small> · ${escapeHtml(item.borderLabel)}</small>` : ''}</span>
                <span class="batch-item-actions">
                  <strong>${money(item.subtotal)}</strong>
                  ${isOpen ? `<button type="button" data-remove-order-id="${batch.id}" data-remove-line-item-id="${escapeHtml(item.lineItemId)}" aria-label="Retirar ${escapeHtml(item.name)} deste pedido">Retirar</button>` : ''}
                </span>
              </div>`).join('') || '<p class="cancelled-batch-label">Pedido totalmente retirado</p>'}
            ${batch.waiter?.note ? `<p class="batch-note">Observação: ${escapeHtml(batch.waiter.note)}</p>` : ''}
            ${(batch.waiter?.adjustments || []).length ? `
              <div class="batch-adjustments">
                ${(batch.waiter.adjustments || []).slice().reverse().map((adjustment) => `
                  <small>Retirado: ${adjustment.quantity}× ${escapeHtml(adjustment.item?.name || 'Item')} · ${escapeHtml(adjustment.reason || '')}</small>`).join('')}
              </div>` : ''}
            <div class="batch-footer">
              <span class="batch-print-copy">${renderPrintStatus(printJob, batch.printRequested)}</span>
              ${initialPrintJob
                ? `<button type="button" data-reprint-order-id="${batch.id}">Reimprimir</button>`
                : `<button type="button" data-print-order-id="${batch.id}">Imprimir pedido</button>`}
            </div>
          </div>
        </article>`;
    }).join('') : '<div class="empty-state">A comanda está aberta. Adicione o primeiro pedido abaixo.</div>';

    if (isOpen) {
      elements.accountActions.innerHTML = `
        <button class="button button-secondary" type="button" data-action="print-account" ${tab.itemCount ? '' : 'disabled'}>${hasPriorAccountPrint(tab) ? 'Imprimir segunda via' : 'Imprimir conta completa'}</button>
        <button class="button button-quiet" type="button" data-action="transfer-table">Organizar / juntar mesas</button>
        <button class="button button-danger" type="button" data-action="request-account" ${tab.itemCount ? '' : 'disabled'}>Enviar conta ao Caixa</button>`;
    } else if (isAwaiting) {
      elements.accountActions.innerHTML = `
        <button class="button button-primary" type="button" data-action="print-account">Imprimir segunda via</button>
        ${isWaiterManager(state.actor) ? '<button class="button button-quiet" type="button" data-action="reopen-table">Reabrir comanda</button>' : ''}`;
    } else {
      elements.accountActions.innerHTML = '<button class="button button-primary" type="button" data-action="print-account" disabled>Conta finalizada</button>';
    }
    elements.catalogPanel.classList.toggle('is-hidden', !isOpen);
    renderCart();
  }

  function renderCategories() {
    const comboChip = state.catalog.combos.length ? [{ id: 'combos', name: 'Combos' }] : [];
    const chips = [
      { id: 'all', name: 'Todos' },
      ...comboChip,
      ...state.catalog.categories.map((category) => ({ id: String(category.id), name: category.name || category.label || 'Categoria' })),
    ];
    elements.categoryChips.innerHTML = chips.map((category) => `
      <button class="chip ${state.category === category.id ? 'active' : ''}" type="button" data-category-id="${escapeHtml(category.id)}" aria-pressed="${state.category === category.id}">${escapeHtml(category.name)}</button>`).join('');
  }

  function renderProducts() {
    const query = normalizeText(state.productQuery);
    const products = state.catalog.products.filter((product) => {
      if (state.category === 'combos') return false;
      const categoryMatches = state.category === 'all' || String(product.category) === state.category;
      const textMatches = !query || normalizeText(`${product.name} ${product.description || ''} ${product.ingredients || ''}`).includes(query);
      return categoryMatches && textMatches;
    }).map((product) => ({ kind: 'product', product }));
    const combos = (state.category === 'all' || state.category === 'combos')
      ? state.catalog.combos
        .filter((combo) => !query || normalizeText(`${combo.name} ${combo.description || ''}`).includes(query))
        .map((combo) => ({
          kind: 'combo',
          product: { ...combo, id: `combo-${combo.id}`, productId: combo.id, name: `Combo ${combo.name}`, isCombo: true },
        }))
      : [];
    const catalogItems = [...combos, ...products];
    elements.productGrid.innerHTML = catalogItems.length ? catalogItems.map(({ kind, product }) => `
      <button class="product-card" type="button" data-product-id="${escapeHtml(product.id)}" data-catalog-kind="${kind}">
        <span><span class="product-emoji">${escapeHtml(product.emoji || '🍕')}</span><h3>${escapeHtml(product.name)}</h3><small>${escapeHtml(product.size || product.description || '')}</small></span>
        ${kind === 'combo' ? '<span class="pizza-product-hint">Combo do cardápio</span>' : ''}
        ${kind === 'product' && isWaiterPizzaProduct(product, state.catalog.categories) ? '<span class="pizza-product-hint">Inteira, meio a meio e bordas</span>' : ''}
        <strong>${money(product.price)}</strong>
      </button>`).join('') : '<div class="empty-state">Nenhum produto encontrado.</div>';
  }

  function cartTotal() {
    return [...state.cart.values()].reduce((sum, item) => sum + (Number(item.product.price || 0) * item.quantity), 0);
  }

  function renderCart() {
    const items = [...state.cart.values()];
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = cartTotal();
    elements.cartCount.textContent = String(count);
    elements.cartTotal.textContent = money(total);
    elements.drawerTotal.textContent = money(total);
    elements.cartBar.classList.toggle('is-hidden', !state.currentTab || state.currentTab.status !== 'open' || count === 0);
    elements.cartItems.innerHTML = items.length ? items.map(({ product, quantity }) => `
      <div class="cart-row">
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          ${product.borderLabel ? `<small class="cart-item-detail">Borda: ${escapeHtml(product.borderLabel)} (+ ${money(product.borderPrice)})</small>` : ''}
          <p>${money(Number(product.price || 0) * quantity)}</p>
        </div>
        <div class="quantity-control">
          <button type="button" data-cart-action="minus" data-product-id="${escapeHtml(product.id)}" aria-label="Diminuir ${escapeHtml(product.name)}">−</button>
          <strong>${quantity}</strong>
          <button type="button" data-cart-action="plus" data-product-id="${escapeHtml(product.id)}" aria-label="Aumentar ${escapeHtml(product.name)}">+</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Escolha os produtos do pedido.</div>';
    const pending = state.pendingSubmission;
    elements.saveOrderButton.textContent = pending ? 'Reenviar sem duplicar' : 'Salvar sem imprimir';
    elements.printOrderButton.textContent = pending ? 'Reenviar pedido' : 'Enviar e imprimir';
  }

  function addCartProduct(product, message = '') {
    if (!ensureDraftEditable()) return;
    const key = String(product.id);
    const current = state.cart.get(key);
    state.cart.set(key, { product, quantity: (current?.quantity || 0) + 1 });
    renderCart();
    persistCurrentDraft();
    toast(message || `${product.name} adicionado`);
  }

  function changeCartQuantity(productId, delta) {
    if (!ensureDraftEditable()) return;
    const current = state.cart.get(String(productId));
    if (!current) return;
    const quantity = current.quantity + delta;
    if (quantity <= 0) state.cart.delete(String(productId));
    else state.cart.set(String(productId), { ...current, quantity });
    renderCart();
    persistCurrentDraft();
    if (state.cart.size === 0) closeCart();
  }

  function closePizzaDialog() {
    state.pizzaFlow = null;
    if (elements.pizzaDialog.open) elements.pizzaDialog.close();
  }

  function renderPizzaModeStep() {
    const baseProduct = state.pizzaFlow?.baseProduct;
    if (!baseProduct) return;
    elements.pizzaDialogTitle.textContent = 'Como deseja essa pizza?';
    elements.pizzaDialogCopy.textContent = `${baseProduct.name}${baseProduct.size ? ` · ${baseProduct.size}` : ''}`;
    elements.pizzaDialogContent.innerHTML = `
      <div class="pizza-mode-grid">
        <button class="pizza-mode-card" type="button" data-pizza-mode="whole">
          <span class="pizza-mode-icon">●</span><span><strong>Pizza inteira</strong><small>Um único sabor</small></span>
        </button>
        <button class="pizza-mode-card" type="button" data-pizza-mode="half">
          <span class="pizza-mode-icon half">◐</span><span><strong>Meio a meio</strong><small>Escolher outro sabor do mesmo tamanho</small></span>
        </button>
      </div>
      <button class="button button-quiet button-large" type="button" data-pizza-cancel>Cancelar</button>`;
  }

  function renderPizzaHalfStep() {
    const baseProduct = state.pizzaFlow?.baseProduct;
    if (!baseProduct) return;
    const options = state.catalog.products
      .filter((product) => product.active !== false && isWaiterPizzaProduct(product, state.catalog.categories))
      .filter((product) => isSameWaiterPizzaSize(baseProduct, product))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'));
    elements.pizzaDialogTitle.textContent = 'Escolha a outra metade';
    elements.pizzaDialogCopy.textContent = `Somente sabores do tamanho ${baseProduct.size || getWaiterPizzaSizeKey(baseProduct) || 'selecionado'}.`;
    elements.pizzaDialogContent.innerHTML = `
      <button class="pizza-back-button" type="button" data-pizza-back="mode">← Voltar</button>
      <div class="pizza-flavor-list">
        ${options.map((product) => `
          <button class="pizza-flavor-option" type="button" data-pizza-second-id="${escapeHtml(product.id)}">
            <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.size || '')}</small></span><b>${money(product.price)}</b>
          </button>`).join('')}
      </div>`;
  }

  function renderPizzaBorderStep() {
    const flow = state.pizzaFlow;
    const baseProduct = flow?.baseProduct;
    if (!baseProduct) return;
    const sizeCode = getWaiterPizzaBorderSizeCode(baseProduct);
    const groups = state.catalog.borders.reduce((map, border) => {
      const group = border.group || 'Especiais';
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(border);
      return map;
    }, new Map());
    elements.pizzaDialogTitle.textContent = 'Escolha a borda';
    elements.pizzaDialogCopy.textContent = `${flow.mode === 'half' ? 'Pizza meio a meio' : baseProduct.name} · tamanho ${sizeCode}`;
    const borderOption = (border) => {
      const price = Number(border.prices?.[sizeCode] ?? border.prices?.M ?? 0);
      return `<label class="pizza-border-option"><input type="radio" name="waiterPizzaBorder" value="${escapeHtml(border.id)}"><span><strong>${escapeHtml(border.label)}</strong><small>+ ${money(price)}</small></span></label>`;
    };
    elements.pizzaDialogContent.innerHTML = `
      <button class="pizza-back-button" type="button" data-pizza-back="${flow.mode === 'half' ? 'half' : 'mode'}">← Voltar</button>
      <div class="pizza-border-list">
        <label class="pizza-border-option is-selected"><input type="radio" name="waiterPizzaBorder" value="" checked><span><strong>Sem borda</strong><small>R$ 0,00</small></span></label>
        ${[...groups.entries()].map(([group, borders]) => `<fieldset class="pizza-border-group"><legend>${escapeHtml(group)}</legend>${borders.map(borderOption).join('')}</fieldset>`).join('')}
      </div>
      <button class="button button-primary button-large" type="button" data-pizza-confirm>Adicionar ao pedido</button>`;
  }

  function openPizzaDialog(product) {
    if (!ensureDraftEditable()) return;
    state.pizzaFlow = { baseProduct: product, secondProduct: null, mode: '' };
    renderPizzaModeStep();
    elements.pizzaDialog.showModal();
  }

  function confirmPizzaComposition() {
    const flow = state.pizzaFlow;
    if (!flow?.baseProduct) return;
    const selectedBorder = elements.pizzaDialogContent.querySelector('input[name="waiterPizzaBorder"]:checked');
    try {
      const item = buildWaiterPizzaCartItem({
        firstProduct: flow.baseProduct,
        secondProduct: flow.mode === 'half' ? flow.secondProduct : null,
        borderId: selectedBorder?.value || '',
        borders: state.catalog.borders,
        categories: state.catalog.categories,
      });
      closePizzaDialog();
      addCartProduct(item, item.isHalfPizza ? 'Pizza meio a meio adicionada' : `${item.name} adicionada`);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function addProduct(productId, catalogKind = 'product') {
    if (!ensureDraftEditable()) return;
    if (catalogKind === 'combo') {
      const comboId = String(productId).replace(/^combo-/, '');
      const combo = state.catalog.combos.find((entry) => String(entry.id) === comboId);
      if (!combo) return;
      addCartProduct({ ...combo, id: `combo-${combo.id}`, productId: combo.id, name: `Combo ${combo.name}`, isCombo: true });
      return;
    }
    const product = state.catalog.products.find((entry) => String(entry.id) === String(productId));
    if (!product) return;
    if (isWaiterPizzaProduct(product, state.catalog.categories)) {
      openPizzaDialog(product);
      return;
    }
    addCartProduct(product);
  }

  function openCart() {
    if (!state.cart.size) return;
    cartReturnFocus = document.activeElement;
    elements.cartDrawer.classList.remove('is-hidden');
    elements.drawerBackdrop.classList.remove('is-hidden');
    elements.cartDrawer.setAttribute('aria-hidden', 'false');
    elements.cartToggle.setAttribute('aria-expanded', 'true');
    setTimeout(() => elements.closeCartButton.focus(), 30);
  }

  function closeCart({ restoreFocus = true } = {}) {
    const wasOpen = !elements.cartDrawer.classList.contains('is-hidden');
    elements.cartDrawer.classList.add('is-hidden');
    elements.drawerBackdrop.classList.add('is-hidden');
    elements.cartDrawer.setAttribute('aria-hidden', 'true');
    elements.cartToggle.setAttribute('aria-expanded', 'false');
    if (wasOpen && restoreFocus && cartReturnFocus instanceof HTMLElement) cartReturnFocus.focus();
    cartReturnFocus = null;
  }

  function showPrintResult(printJob, successMessage) {
    if (printJob?.queued) {
      toast(successMessage || 'Impressão enviada para a fila.');
      return;
    }
    if (printJob?.previewText) {
      elements.printPreviewText.textContent = printJob.previewText;
      elements.printPreviewDialog.showModal();
      toast(printJob.error || 'Use a prévia para imprimir.', printJob.error ? 'error' : 'success');
      return;
    }
    toast(printJob?.error || successMessage || 'Operação concluída.', printJob?.error ? 'error' : 'success');
  }

  function buildOrderSubmission(printRequested) {
    const clientRequestId = createWaiterRequestId('waiter-order');
    const items = [...state.cart.values()].map(({ product, quantity }, index) => ({
      productId: product.productId || product.id,
      id: product.id,
      lineItemId: `${clientRequestId}:line:${index + 1}`,
      name: product.name,
      quantity,
      unitPrice: Number(product.price || 0),
      subtotal: Number(product.price || 0) * quantity,
      size: product.size || '',
      sizeKey: product.sizeKey || '',
      emoji: product.emoji || '',
      isCombo: Boolean(product.isCombo),
      isHalfPizza: Boolean(product.isHalfPizza),
      halfPizzaFirstId: product.halfPizzaFirstId || '',
      halfPizzaSecondId: product.halfPizzaSecondId || '',
      borderSelection: product.borderSelection || null,
      borderLabel: product.borderLabel || '',
      borderPrice: Number(product.borderPrice || 0),
    }));
    return {
      kind: 'order',
      clientRequestId,
      status: 'ready',
      createdAt: new Date().toISOString(),
      payload: {
        clientRequestId,
        expectedVersion: state.currentTab.version,
        items,
        note: elements.orderNote.value.trim(),
        printRequested,
      },
    };
  }

  async function reconcilePendingSubmission({ notify = false } = {}) {
    const pending = state.pendingSubmission;
    if (!pending || !state.currentTab || pending.kind !== 'order' || state.refreshingTab) return false;
    state.refreshingTab = true;
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}`);
      state.currentTab = body.tab;
      const found = (body.tab.batches || []).some((batch) => String(batch.clientRequestId || '') === String(pending.clientRequestId));
      if (found) {
        clearCurrentDraftAfterSuccess();
        renderTab();
        await loadDashboard({ render: false });
        if (notify) toast('Pedido confirmado na comanda. Nenhum item foi duplicado.');
        return true;
      }
      if (body.tab.status === 'open') {
        pending.status = 'ready';
        pending.payload.expectedVersion = body.tab.version;
        state.pendingSubmission = pending;
        persistCurrentDraft();
        renderTab();
        if (notify) toast('O pedido ainda não chegou ao sistema. Toque em reenviar.', 'error');
      } else if (notify) {
        toast('A mesa não aceita mais pedidos. O rascunho foi preservado.', 'error');
      }
      return false;
    } finally {
      state.refreshingTab = false;
    }
  }

  function openConflict(error, message = '') {
    const current = error?.body?.tab;
    if (current && state.currentTab && Number(current.id) === Number(state.currentTab.id)) {
      state.currentTab = current;
      renderTab();
    }
    if (state.pendingSubmission) {
      state.pendingSubmission.status = 'conflict';
      persistCurrentDraft();
    }
    state.conflictFlow = { clearPendingOnAcknowledge: Boolean(state.pendingSubmission) };
    elements.conflictMessage.textContent = message || error.message || 'Outro aparelho alterou esta mesa. Seu rascunho foi preservado.';
    elements.conflictSummary.innerHTML = state.currentTab
      ? `<strong>${escapeHtml(state.currentTab.tableDisplay || `Mesa ${state.currentTab.tableNumber}`)}</strong><br>Agora possui ${state.currentTab.itemCount || 0} item(ns), total ${money(state.currentTab.totals?.total)}.<br>Revise o pedido local antes de enviar novamente.`
      : 'Atualize o salão e revise a operação.';
    if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
  }

  async function submitOrder(printRequested) {
    if (state.busy || !state.currentTab || (!state.cart.size && !state.pendingSubmission)) return;
    if (state.currentTab.status !== 'open') {
      toast('Esta mesa não aceita mais pedidos. O rascunho continua salvo.', 'error');
      return;
    }
    if (!state.pendingSubmission) state.pendingSubmission = buildOrderSubmission(printRequested);
    const pending = state.pendingSubmission;
    pending.status = 'submitting';
    persistCurrentDraft();
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/orders`, {
        method: 'POST',
        body: JSON.stringify(pending.payload),
        timeoutMs: 15000,
      });
      state.currentTab = body.tab;
      clearCurrentDraftAfterSuccess();
      renderTab();
      showPrintResult(body.printJob, pending.payload.printRequested ? 'Pedido enviado para impressão.' : 'Pedido salvo na comanda.');
      try {
        await loadDashboard({ render: false });
      } catch {
        // O pedido já foi confirmado; o polling atualizará o resumo do salão.
      }
    } catch (error) {
      if (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500) {
        pending.status = 'uncertain';
        state.pendingSubmission = pending;
        persistCurrentDraft();
        toast('Não foi possível confirmar o envio. O pedido será verificado antes de qualquer reenvio.', 'error');
        setTimeout(() => reconcilePendingSubmission({ notify: true }).catch(() => {}), 800);
      } else if (isWaiterVersionConflict(error)) {
        openConflict(error);
      } else {
        state.pendingSubmission = null;
        persistCurrentDraft();
        toast(error.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  function closeRemoveItemDialog() {
    state.removalFlow = null;
    elements.removeItemError.textContent = '';
    if (elements.removeItemDialog.open) elements.removeItemDialog.close();
  }

  function openRemoveItemDialog(orderId, lineItemId) {
    if (!state.currentTab || state.currentTab.status !== 'open') return;
    const batch = (state.currentTab.batches || []).find((entry) => String(entry.id) === String(orderId));
    const item = batch?.items?.find((entry) => String(entry.lineItemId) === String(lineItemId));
    if (!batch || !item) {
      toast('Item não encontrado. Atualize a comanda.', 'error');
      return;
    }
    const maxQuantity = Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1);
    state.removalFlow = {
      orderId: batch.id,
      lineItemId: item.lineItemId,
      item,
      maxQuantity,
      clientRequestId: createWaiterRequestId('waiter-remove'),
      expectedVersion: state.currentTab.version,
    };
    elements.removeItemSummary.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>Pedido ${batch.batchNumber} · ${maxQuantity} unidade(s) enviada(s)</span><b>${money(item.subtotal)}</b>`;
    elements.removeItemQuantity.max = String(maxQuantity);
    elements.removeItemQuantity.value = '1';
    elements.removeItemReason.value = '';
    elements.removeItemPrint.checked = true;
    elements.removeItemError.textContent = '';
    elements.removeItemDialog.showModal();
    setTimeout(() => elements.removeItemReason.focus(), 50);
  }

  async function confirmRemoveItem(event) {
    event.preventDefault();
    const flow = state.removalFlow;
    if (state.busy || !state.currentTab || !flow) return;
    const quantity = Number.parseInt(elements.removeItemQuantity.value, 10);
    const reason = elements.removeItemReason.value.trim();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > flow.maxQuantity) {
      elements.removeItemError.textContent = `Informe uma quantidade entre 1 e ${flow.maxQuantity}.`;
      return;
    }
    if (reason.length < 3) {
      elements.removeItemError.textContent = 'Informe o motivo da retirada.';
      elements.removeItemReason.focus();
      return;
    }
    setBusy(true);
    try {
      const body = await api(
        `/api/waiter/tabs/${state.currentTab.id}/orders/${flow.orderId}/items/${encodeURIComponent(flow.lineItemId)}/remove`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientRequestId: flow.clientRequestId,
            expectedVersion: flow.expectedVersion,
            quantity,
            reason,
            printRequested: elements.removeItemPrint.checked,
          }),
        },
      );
      state.currentTab = body.tab;
      closeRemoveItemDialog();
      renderTab();
      await loadDashboard({ render: false });
      showPrintResult(body.printJob, 'Retirada registrada e avisada à cozinha.');
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeRemoveItemDialog();
        openConflict(error, 'Outro aparelho alterou a comanda antes da retirada. Revise o item e tente novamente.');
      } else {
        elements.removeItemError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  function closeReprintDialog() {
    state.reprintFlow = null;
    elements.reprintError.textContent = '';
    if (elements.reprintDialog.open) elements.reprintDialog.close();
  }

  function openReprintDialog(kind, orderId = null) {
    if (!state.currentTab) return;
    state.reprintFlow = {
      kind,
      orderId,
      clientRequestId: createWaiterRequestId(kind === 'order' ? 'waiter-reprint' : 'waiter-account-copy'),
    };
    elements.reprintDialogTitle.textContent = kind === 'order' ? 'Reimprimir pedido' : 'Imprimir segunda via da conta';
    elements.reprintDialogCopy.textContent = kind === 'order'
      ? 'A via sairá identificada como reimpressão para evitar produção duplicada.'
      : `Informe por que a conta de ${state.currentTab.tableDisplay || `Mesa ${state.currentTab.tableNumber}`} precisa de outra via.`;
    elements.reprintReason.value = '';
    elements.reprintError.textContent = '';
    elements.reprintDialog.showModal();
    setTimeout(() => elements.reprintReason.focus(), 50);
  }

  async function printOrderBatch(orderId) {
    if (!state.currentTab || state.busy) return;
    const batch = (state.currentTab.batches || []).find((entry) => String(entry.id) === String(orderId));
    if (!batch) {
      toast('Este pedido não está mais disponível. Atualize a comanda.', 'error');
      return;
    }
    if (batch.print?.initial) {
      openReprintDialog('order', orderId);
      return;
    }

    const requestKey = `${state.currentTab.id}:${orderId}`;
    if (!state.orderPrintRequests.has(requestKey)) {
      state.orderPrintRequests.set(requestKey, createWaiterRequestId('waiter-order-print'));
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/orders/${orderId}/reprint`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId: state.orderPrintRequests.get(requestKey) }),
      });
      state.orderPrintRequests.delete(requestKey);
      state.currentTab = body.tab;
      renderTab();
      showPrintResult(body.printJob, 'Pedido enviado para impressão.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function executeAccountPrint({ clientRequestId, reason = '' }) {
    const body = await api(`/api/waiter/tabs/${state.currentTab.id}/print`, {
      method: 'POST',
      body: JSON.stringify({ clientRequestId, reason }),
    });
    state.currentTab = body.tab;
    renderTab();
    showPrintResult(body.printJob, reason ? 'Segunda via enviada para a fila.' : 'Conta completa enviada para a fila.');
    return body;
  }

  async function printAccount() {
    if (state.busy || !state.currentTab || !state.currentTab.itemCount) return;
    if (hasPriorAccountPrint(state.currentTab)) {
      openReprintDialog('account');
      return;
    }
    if (!state.accountPrintRequest) state.accountPrintRequest = createWaiterRequestId('waiter-account-print');
    setBusy(true);
    try {
      await executeAccountPrint({ clientRequestId: state.accountPrintRequest });
      state.accountPrintRequest = null;
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReprint(event) {
    event.preventDefault();
    const flow = state.reprintFlow;
    if (!flow || state.busy || !state.currentTab) return;
    const reason = elements.reprintReason.value.trim();
    if (reason.length < 3) {
      elements.reprintError.textContent = 'Informe um motivo com pelo menos 3 caracteres.';
      elements.reprintReason.focus();
      return;
    }
    setBusy(true);
    try {
      if (flow.kind === 'order') {
        const body = await api(`/api/waiter/tabs/${state.currentTab.id}/orders/${flow.orderId}/reprint`, {
          method: 'POST',
          body: JSON.stringify({ clientRequestId: flow.clientRequestId, reason }),
        });
        state.currentTab = body.tab;
        renderTab();
        showPrintResult(body.printJob, 'Reimpressão enviada para a fila.');
      } else {
        await executeAccountPrint({ clientRequestId: flow.clientRequestId, reason });
      }
      closeReprintDialog();
    } catch (error) {
      elements.reprintError.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  async function openCloseAccountDialog() {
    if (state.busy || !state.currentTab) return;
    if (state.cart.size || state.pendingSubmission) {
      toast('Há itens no novo pedido. Confirme o envio antes de solicitar a conta.', 'error');
      openCart();
      return;
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}`);
      state.currentTab = body.tab;
      renderTab();
      if (body.tab.status !== 'open') throw new ApiError('Esta comanda não está mais aberta.', { status: 409, body: { tab: body.tab } });
      if (!body.tab.itemCount) throw new ApiError('Não é possível enviar uma conta sem itens.', { status: 400 });
      state.accountFlow = {
        clientRequestId: createWaiterRequestId('waiter-account'),
        expectedVersion: body.tab.version,
      };
      elements.closeAccountTable.textContent = body.tab.tableDisplay || `Mesa ${body.tab.tableNumber}`;
      elements.closeAccountCustomer.textContent = body.tab.customerName || 'Sem identificação';
      elements.closeAccountItems.textContent = `${body.tab.itemCount} item(ns)`;
      elements.closeAccountTotal.textContent = money(body.tab.totals?.total);
      elements.confirmCloseAccountButton.textContent = `Enviar ${money(body.tab.totals?.total)} ao Caixa`;
      elements.closeAccountError.textContent = '';
      elements.closeAccountDialog.showModal();
      setTimeout(() => elements.cancelCloseAccountButton.focus(), 50);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function closeAccountDialog() {
    state.accountFlow = null;
    elements.closeAccountError.textContent = '';
    if (elements.closeAccountDialog.open) elements.closeAccountDialog.close();
  }

  async function confirmCloseAccount(event) {
    event.preventDefault();
    const flow = state.accountFlow;
    if (!flow || !state.currentTab || state.busy) return;
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/account-request`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.clientRequestId,
          expectedVersion: flow.expectedVersion,
        }),
      });
      state.currentTab = body.tab;
      clearStoredDraft(body.tab.id);
      state.cart.clear();
      state.pendingSubmission = null;
      closeAccountDialog();
      renderTab();
      await loadDashboard({ render: false });
      showPrintResult(body.printJob, 'Conta enviada ao Caixa. A mesa está aguardando pagamento.');
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeAccountDialog();
        openConflict(error, 'A comanda mudou antes do envio ao Caixa. Confira os itens e o novo total.');
      } else {
        elements.closeAccountError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  function populateTransferDialog({ resetReason = false } = {}) {
    if (!state.currentTab) return;
    const freeTables = (state.dashboard?.tables || []).filter((table) => !(table.activeTab || table.openTab) && Number(table.id) !== Number(state.currentTab.tableId));
    const staff = state.dashboard?.staff || [];
    const freeTableOptions = freeTables.map((table) => `<option value="${table.id}">Mesa ${table.tableNumber}${table.label ? ` · ${escapeHtml(table.label)}` : ''}</option>`).join('');
    elements.linkTargetTable.innerHTML = '<option value="">Escolha uma mesa livre</option>' + freeTableOptions;
    elements.transferTargetTable.innerHTML = '<option value="">Manter mesa principal</option>' + freeTableOptions;
    elements.transferTargetWaiter.innerHTML = '<option value="">Manter responsável atual</option>' + staff
      .filter((member) => Number(member.id) !== Number(state.currentTab.waiterUserId))
      .map((member) => `<option value="${member.id}">${escapeHtml(member.displayName)} · ${escapeHtml(roleLabel(member.role))}</option>`).join('');
    elements.transferTargetWaiterField.classList.toggle('is-hidden', !isWaiterManager(state.actor));
    const linkedTables = Array.isArray(state.currentTab.linkedTables) && state.currentTab.linkedTables.length
      ? state.currentTab.linkedTables
      : [{ tableId: state.currentTab.tableId, tableNumber: state.currentTab.tableNumber, isPrimary: true }];
    elements.linkedTablesList.innerHTML = linkedTables.map((table) => `
      <div class="linked-table-item">
        <span><strong>Mesa ${table.tableNumber}</strong><small>${table.isPrimary ? 'Principal' : 'Juntada à comanda'}</small></span>
        ${table.isPrimary ? '<span class="linked-table-fixed">Fixa</span>' : `<button type="button" data-unlink-table-id="${table.tableId}" aria-label="Liberar Mesa ${table.tableNumber}">Liberar</button>`}
      </div>`).join('');
    elements.transferCurrentSummary.innerHTML = `<span>Comanda atual</span><strong>${escapeHtml(state.currentTab.tableDisplay || `Mesa ${state.currentTab.tableNumber}`)}<br>${escapeHtml(state.currentTab.waiterName || 'Equipe')}</strong>`;
    if (resetReason) elements.transferReason.value = '';
    elements.transferTableError.textContent = '';
  }

  function openTransferDialog() {
    if (!state.currentTab || state.currentTab.status !== 'open') return;
    state.transferFlow = {
      clientRequestId: createWaiterRequestId('waiter-transfer'),
      linkRequestId: createWaiterRequestId('waiter-link-table'),
      unlinkRequestIds: new Map(),
      expectedVersion: state.currentTab.version,
    };
    populateTransferDialog({ resetReason: true });
    elements.transferTableDialog.showModal();
    setTimeout(() => elements.linkTargetTable.focus(), 50);
  }

  function closeTransferDialog() {
    state.transferFlow = null;
    elements.transferTableError.textContent = '';
    if (elements.transferTableDialog.open) elements.transferTableDialog.close();
  }

  async function confirmTransfer(event) {
    event.preventDefault();
    const flow = state.transferFlow;
    if (!flow || !state.currentTab || state.busy) return;
    const targetTableId = elements.transferTargetTable.value;
    const waiterUserId = isWaiterManager(state.actor) ? elements.transferTargetWaiter.value : '';
    const reason = elements.transferReason.value.trim();
    if (!targetTableId && !waiterUserId) {
      elements.transferTableError.textContent = 'Escolha uma nova mesa' + (isWaiterManager(state.actor) ? ' ou um novo responsável.' : '.');
      return;
    }
    if (reason.length < 3) {
      elements.transferTableError.textContent = 'Informe o motivo da transferência.';
      elements.transferReason.focus();
      return;
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.clientRequestId,
          expectedVersion: flow.expectedVersion,
          targetTableId: targetTableId || undefined,
          waiterUserId: waiterUserId || undefined,
          reason,
        }),
      });
      state.currentTab = body.tab;
      closeTransferDialog();
      elements.pageTitle.textContent = body.tab.tableDisplay || `Mesa ${body.tab.tableNumber}`;
      renderTab();
      await loadDashboard({ render: false });
      showPrintResult(body.printJob, 'Atendimento transferido com sucesso.');
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeTransferDialog();
        openConflict(error, 'A mesa mudou antes da transferência. Revise e tente novamente.');
      } else if (error.code === 'TARGET_TABLE_OCCUPIED') {
        elements.transferTableError.textContent = 'A mesa escolhida acabou de ser ocupada. Escolha outra.';
        await loadDashboard({ render: false }).catch(() => {});
      } else {
        elements.transferTableError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  async function linkTableToCurrentTab() {
    const flow = state.transferFlow;
    if (!flow || !state.currentTab || state.busy) return;
    const targetTableId = elements.linkTargetTable.value;
    const reason = elements.transferReason.value.trim();
    if (!targetTableId) {
      elements.transferTableError.textContent = 'Escolha uma mesa livre para juntar.';
      elements.linkTargetTable.focus();
      return;
    }
    if (reason.length < 3) {
      elements.transferTableError.textContent = 'Informe o motivo da organização.';
      elements.transferReason.focus();
      return;
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/tables/link`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.linkRequestId,
          expectedVersion: flow.expectedVersion,
          targetTableId,
          reason,
        }),
      });
      state.currentTab = body.tab;
      flow.expectedVersion = body.tab.version;
      flow.linkRequestId = createWaiterRequestId('waiter-link-table');
      await loadDashboard({ render: false });
      populateTransferDialog();
      toast(`${body.tab.tableDisplay || 'Mesas'} agora compartilham a mesma comanda.`);
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeTransferDialog();
        openConflict(error, 'A comanda mudou antes de juntar as mesas. Revise e tente novamente.');
      } else if (error.code === 'TARGET_TABLE_OCCUPIED') {
        elements.transferTableError.textContent = 'A mesa escolhida acabou de ser ocupada. Escolha outra.';
        await loadDashboard({ render: false }).catch(() => {});
        populateTransferDialog();
      } else {
        elements.transferTableError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlinkTableFromCurrentTab(tableId) {
    const flow = state.transferFlow;
    if (!flow || !state.currentTab || state.busy) return;
    const reason = elements.transferReason.value.trim();
    if (reason.length < 3) {
      elements.transferTableError.textContent = 'Informe o motivo antes de liberar a mesa.';
      elements.transferReason.focus();
      return;
    }
    const key = String(tableId);
    if (!flow.unlinkRequestIds.has(key)) {
      flow.unlinkRequestIds.set(key, createWaiterRequestId('waiter-unlink-table'));
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/tables/${tableId}/unlink`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.unlinkRequestIds.get(key),
          expectedVersion: flow.expectedVersion,
          reason,
        }),
      });
      state.currentTab = body.tab;
      flow.expectedVersion = body.tab.version;
      flow.unlinkRequestIds.delete(key);
      await loadDashboard({ render: false });
      populateTransferDialog();
      toast('Mesa liberada e pronta para outro atendimento.');
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeTransferDialog();
        openConflict(error, 'A comanda mudou antes de liberar a mesa. Revise e tente novamente.');
      } else {
        elements.transferTableError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  function openReopenDialog() {
    if (!state.currentTab || state.currentTab.status !== 'awaiting_payment' || !isWaiterManager(state.actor)) return;
    state.reopenFlow = {
      clientRequestId: createWaiterRequestId('waiter-reopen'),
      expectedVersion: state.currentTab.version,
    };
    elements.reopenReason.value = '';
    elements.reopenTableError.textContent = '';
    elements.reopenTableDialog.showModal();
    setTimeout(() => elements.reopenReason.focus(), 50);
  }

  function closeReopenDialog() {
    state.reopenFlow = null;
    elements.reopenTableError.textContent = '';
    if (elements.reopenTableDialog.open) elements.reopenTableDialog.close();
  }

  async function confirmReopen(event) {
    event.preventDefault();
    const flow = state.reopenFlow;
    if (!flow || !state.currentTab || state.busy) return;
    const reason = elements.reopenReason.value.trim();
    if (reason.length < 3) {
      elements.reopenTableError.textContent = 'Informe o motivo da reabertura.';
      elements.reopenReason.focus();
      return;
    }
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tabs/${state.currentTab.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.clientRequestId,
          expectedVersion: flow.expectedVersion,
          reason,
        }),
      });
      state.currentTab = body.tab;
      closeReopenDialog();
      renderTab();
      await loadDashboard({ render: false });
      toast('Comanda reaberta. Ela não está mais pendente no Caixa.');
    } catch (error) {
      if (isWaiterVersionConflict(error)) {
        closeReopenDialog();
        openConflict(error, 'O estado da conta mudou antes da reabertura. Confira no Caixa.');
      } else {
        elements.reopenTableError.textContent = error.message;
      }
    } finally {
      setBusy(false);
    }
  }

  function openTableDialog(tableId) {
    const table = state.dashboard?.tables?.find((entry) => entry.id === Number(tableId));
    if (!table) return;
    state.selectedTableId = table.id;
    state.openTableFlow = {
      tableId: table.id,
      clientRequestId: createWaiterRequestId('waiter-open'),
    };
    elements.openTableTitle.textContent = `Abrir Mesa ${table.tableNumber}`;
    elements.openTableActorName.textContent = state.actor?.displayName || state.actor?.username || 'Equipe';
    elements.customerName.value = '';
    elements.tableNotes.value = '';
    elements.openTableError.textContent = '';
    if (isWaiterManager(state.actor)) {
      elements.assignedWaiterField.classList.remove('is-hidden');
      elements.assignedWaiter.innerHTML = `<option value="">${escapeHtml(state.actor?.displayName || 'Eu')}</option>` + (state.dashboard?.staff || [])
        .filter((member) => Number(member.id) !== Number(state.actor?.id))
        .map((member) => `<option value="${member.id}">${escapeHtml(member.displayName)} · ${escapeHtml(roleLabel(member.role))}</option>`).join('');
    } else {
      elements.assignedWaiterField.classList.add('is-hidden');
      elements.assignedWaiter.innerHTML = '';
    }
    elements.openTableDialog.showModal();
    setTimeout(() => elements.customerName.focus(), 50);
  }

  function closeOpenTableDialog() {
    if (state.busy) return;
    state.openTableFlow = null;
    state.selectedTableId = null;
    elements.openTableError.textContent = '';
    if (elements.openTableDialog.open) elements.openTableDialog.close();
  }

  async function confirmOpenTable(event) {
    event.preventDefault();
    const flow = state.openTableFlow;
    if (state.busy || !flow || !state.selectedTableId) return;
    setBusy(true);
    try {
      const body = await api(`/api/waiter/tables/${state.selectedTableId}/open`, {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: flow.clientRequestId,
          customerName: elements.customerName.value.trim(),
          notes: elements.tableNotes.value.trim(),
          waiterUserId: isWaiterManager(state.actor) && elements.assignedWaiter.value
            ? elements.assignedWaiter.value
            : undefined,
        }),
      });
      elements.openTableDialog.close();
      state.openTableFlow = null;
      state.selectedTableId = null;
      await loadDashboard({ render: false });
      await showTab(body.tab.id, body.tab);
      toast(`Mesa ${body.tab.tableNumber} aberta.`);
    } catch (error) {
      elements.openTableError.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  async function addTable(event) {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    try {
      await api('/api/waiter/tables', {
        method: 'POST',
        body: JSON.stringify({ tableNumber: elements.newTableNumber.value, label: elements.newTableLabel.value.trim() }),
      });
      elements.addTableDialog.close();
      elements.addTableForm.reset();
      await loadDashboard();
      toast('Mesa adicionada ao salão.');
    } catch (error) {
      elements.addTableError.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  async function refreshVisibleData({ notify = true } = {}) {
    if (state.busy) return;
    setBusy(true);
    try {
      if (state.currentTab) {
        const body = await api(`/api/waiter/tabs/${state.currentTab.id}`);
        state.currentTab = body.tab;
        renderTab();
      }
      await Promise.all([loadDashboard({ render: !state.currentTab }), loadCatalog(), syncWaiterTheme({ force: true })]);
      if (notify) toast('Dados atualizados.');
    } catch (error) {
      if (notify) toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pollWaiterState() {
    clearTimeout(pollTimer);
    if (!state.actor) return;
    if (!document.hidden && !state.busy && navigator.onLine) {
      try {
        state.pollCount += 1;
        if (state.currentTab) {
          const previousVersion = Number(state.currentTab.version || 1);
          const body = await api(`/api/waiter/tabs/${state.currentTab.id}`, { timeoutMs: 8000 });
          state.currentTab = body.tab;
          renderTab();
          if (state.pendingSubmission?.status === 'uncertain') {
            await reconcilePendingSubmission({ notify: true });
          }
          if (
            Number(body.tab.version || 1) !== previousVersion
            && state.cart.size
            && !state.pendingSubmission
            && state.lastConflictVersion !== body.tab.version
          ) {
            state.lastConflictVersion = body.tab.version;
            openConflict({ message: 'A comanda recebeu outra alteração.', body: { tab: body.tab } }, 'Outro aparelho alterou esta mesa enquanto você montava um pedido. Seu rascunho foi preservado.');
          }
        } else {
          await loadDashboard();
        }
        if (state.currentTab && state.pollCount % 3 === 0) await loadDashboard({ render: false });
      } catch (error) {
        if (error.status !== 0 && error.status !== 401) {
          // A atualização manual permanece disponível.
        }
      }
    }
    pollTimer = setTimeout(pollWaiterState, POLL_INTERVAL_MS);
  }

  function startPolling() {
    stopPolling();
    pollTimer = setTimeout(pollWaiterState, POLL_INTERVAL_MS);
  }

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.loginError.textContent = '';
    setBusy(true);
    try {
      const session = await api('/api/waiter/login', {
        method: 'POST',
        skipCsrf: true,
        handleUnauthorized: false,
        body: JSON.stringify({ username: elements.loginUser.value.trim(), password: elements.loginPassword.value }),
      });
      state.actor = session.actor;
      state.csrfToken = session.csrfToken || '';
      elements.loginPassword.value = '';
      await bootApp(session);
    } catch (error) {
      elements.loginError.textContent = error.message;
    } finally {
      setBusy(false);
    }
  });

  elements.logoutButton.addEventListener('click', async () => {
    persistCurrentDraft();
    try { await api('/api/waiter/logout', { method: 'POST', body: '{}' }); } catch { /* A sessão pode já estar encerrada. */ }
    showLogin();
  });
  elements.refreshButton.addEventListener('click', () => refreshVisibleData());
  elements.backButton.addEventListener('click', () => {
    persistCurrentDraft();
    if (history.state?.waiterView === 'tab') history.back();
    else showDashboard();
  });
  elements.tableSearch.addEventListener('input', () => { state.tableQuery = elements.tableSearch.value; renderDashboard(); });
  elements.tableFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-table-filter]');
    if (!button) return;
    state.tableFilter = button.dataset.tableFilter;
    renderDashboard();
  });
  elements.productSearch.addEventListener('input', () => { state.productQuery = elements.productSearch.value; renderProducts(); });
  elements.orderNote.addEventListener('input', () => {
    if (state.pendingSubmission) {
      elements.orderNote.value = state.pendingSubmission.payload?.note || '';
      toast('Conclua o envio pendente antes de alterar a observação.', 'error');
      return;
    }
    persistCurrentDraft();
  });

  elements.addTableButton.addEventListener('click', () => {
    const numbers = (state.dashboard?.tables || []).map((table) => table.tableNumber);
    elements.newTableNumber.value = String((numbers.length ? Math.max(...numbers) : 0) + 1);
    elements.newTableLabel.value = '';
    elements.addTableError.textContent = '';
    elements.addTableDialog.showModal();
  });
  elements.openTableForm.addEventListener('submit', confirmOpenTable);
  elements.addTableForm.addEventListener('submit', addTable);
  elements.closeOpenTableDialogButton.addEventListener('click', closeOpenTableDialog);
  elements.openTableDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeOpenTableDialog();
  });
  elements.closeAddTableDialogButton.addEventListener('click', () => elements.addTableDialog.close());

  elements.tableGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-table-id]');
    if (!card) return;
    if (card.dataset.restricted === 'true') {
      toast('Esta mesa pertence a outro garçom. Peça a transferência a um gerente.', 'error');
      return;
    }
    if (card.dataset.tabId) showTab(card.dataset.tabId).catch((error) => toast(error.message, 'error'));
    else openTableDialog(card.dataset.tableId);
  });
  elements.historyList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-history-tab-id]');
    if (row) showTab(row.dataset.historyTabId).catch((error) => toast(error.message, 'error'));
  });
  elements.categoryChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category-id]');
    if (!chip) return;
    state.category = chip.dataset.categoryId;
    renderCategories();
    renderProducts();
  });
  elements.productGrid.addEventListener('click', (event) => {
    const product = event.target.closest('[data-product-id]');
    if (product) addProduct(product.dataset.productId, product.dataset.catalogKind || 'product');
  });
  elements.batchList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-order-id]');
    if (removeButton) {
      openRemoveItemDialog(removeButton.dataset.removeOrderId, removeButton.dataset.removeLineItemId);
      return;
    }
    const printButton = event.target.closest('[data-print-order-id]');
    if (printButton) {
      printOrderBatch(printButton.dataset.printOrderId);
      return;
    }
    const reprintButton = event.target.closest('[data-reprint-order-id]');
    if (reprintButton) openReprintDialog('order', reprintButton.dataset.reprintOrderId);
  });
  elements.accountActions.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'print-account') printAccount();
    if (action === 'request-account') openCloseAccountDialog();
    if (action === 'transfer-table') openTransferDialog();
    if (action === 'reopen-table') openReopenDialog();
  });

  elements.cartToggle.addEventListener('click', openCart);
  elements.closeCartButton.addEventListener('click', () => closeCart());
  elements.drawerBackdrop.addEventListener('click', () => closeCart());
  elements.cartDrawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCart();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...elements.cartDrawer.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  elements.cartItems.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;
    changeCartQuantity(button.dataset.productId, button.dataset.cartAction === 'plus' ? 1 : -1);
  });
  elements.saveOrderButton.addEventListener('click', () => submitOrder(false));
  elements.printOrderButton.addEventListener('click', () => submitOrder(true));

  elements.closePizzaDialogButton.addEventListener('click', closePizzaDialog);
  elements.pizzaDialog.addEventListener('cancel', (event) => { event.preventDefault(); closePizzaDialog(); });
  elements.pizzaDialogContent.addEventListener('change', (event) => {
    if (!event.target.matches('input[name="waiterPizzaBorder"]')) return;
    elements.pizzaDialogContent.querySelectorAll('.pizza-border-option').forEach((option) => {
      option.classList.toggle('is-selected', option.contains(event.target) && event.target.checked);
    });
  });
  elements.pizzaDialogContent.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-pizza-mode]')?.dataset.pizzaMode;
    if (mode === 'whole') {
      state.pizzaFlow.mode = 'whole';
      state.pizzaFlow.secondProduct = null;
      renderPizzaBorderStep();
      return;
    }
    if (mode === 'half') { state.pizzaFlow.mode = 'half'; renderPizzaHalfStep(); return; }
    const secondId = event.target.closest('[data-pizza-second-id]')?.dataset.pizzaSecondId;
    if (secondId) {
      const secondProduct = state.catalog.products.find((product) => String(product.id) === String(secondId));
      if (!secondProduct) return;
      state.pizzaFlow.secondProduct = secondProduct;
      renderPizzaBorderStep();
      return;
    }
    const back = event.target.closest('[data-pizza-back]')?.dataset.pizzaBack;
    if (back === 'mode') renderPizzaModeStep();
    if (back === 'half') renderPizzaHalfStep();
    if (event.target.closest('[data-pizza-cancel]')) closePizzaDialog();
    if (event.target.closest('[data-pizza-confirm]')) confirmPizzaComposition();
  });

  elements.removeItemForm.addEventListener('submit', confirmRemoveItem);
  elements.closeRemoveItemDialogButton.addEventListener('click', closeRemoveItemDialog);
  elements.removeItemDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeRemoveItemDialog(); });
  elements.reprintForm.addEventListener('submit', confirmReprint);
  elements.closeReprintDialogButton.addEventListener('click', closeReprintDialog);
  elements.reprintDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeReprintDialog(); });
  elements.closeAccountForm.addEventListener('submit', confirmCloseAccount);
  elements.closeAccountDialogButton.addEventListener('click', closeAccountDialog);
  elements.cancelCloseAccountButton.addEventListener('click', closeAccountDialog);
  elements.closeAccountDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeAccountDialog(); });
  elements.transferTableForm.addEventListener('submit', confirmTransfer);
  elements.linkTableButton.addEventListener('click', linkTableToCurrentTab);
  elements.linkedTablesList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-unlink-table-id]');
    if (button) unlinkTableFromCurrentTab(button.dataset.unlinkTableId);
  });
  elements.closeTransferDialogButton.addEventListener('click', closeTransferDialog);
  elements.transferTableDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeTransferDialog(); });
  elements.reopenTableForm.addEventListener('submit', confirmReopen);
  elements.closeReopenDialogButton.addEventListener('click', closeReopenDialog);
  elements.reopenTableDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeReopenDialog(); });
  elements.conflictDialog.addEventListener('cancel', (event) => event.preventDefault());
  elements.acknowledgeConflictButton.addEventListener('click', () => {
    if (state.conflictFlow?.clearPendingOnAcknowledge && state.pendingSubmission?.status === 'conflict') {
      state.pendingSubmission = null;
      persistCurrentDraft();
      renderCart();
    }
    state.conflictFlow = null;
    elements.conflictDialog.close();
  });
  elements.closePreviewButton.addEventListener('click', () => elements.printPreviewDialog.close());
  elements.browserPrintButton.addEventListener('click', () => window.print());

  window.addEventListener('popstate', (event) => {
    if (!state.actor) return;
    if (event.state?.waiterView === 'tab' && event.state.tabId) {
      showTab(event.state.tabId, null, { historyMode: 'none' }).catch((error) => toast(error.message, 'error'));
    } else {
      showDashboard({ historyMode: 'none' });
    }
  });
  window.addEventListener('pagehide', persistCurrentDraft);
  window.addEventListener('offline', () => setConnectivity(false));
  window.addEventListener('online', () => {
    setConnectivity(true);
    syncWaiterThemeNow();
    if (state.pendingSubmission) reconcilePendingSubmission({ notify: true }).catch(() => {});
    pollWaiterState();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      syncWaiterThemeNow();
      pollWaiterState();
    }
  });

  setConnectivity(navigator.onLine);
  syncWaiterThemeNow({ force: true });
  api('/api/waiter/session', { skipCsrf: true, handleUnauthorized: false })
    .then((session) => (session.authenticated ? bootApp(session) : showLogin()))
    .catch(showLogin);
})();
