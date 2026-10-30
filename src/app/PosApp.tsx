import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { addToCart, calculateCartSubtotal, changeCartQuantity, countCartItems, type CartLine } from '../domain/cart';
import { formatPhp, moneyFromCentavos, multiplyMoney, type Money } from '../domain/money';
import { renderCashReceiptHtml, renderXReadingHtml, renderZReadingHtml } from '../domain/fiscalDocuments';
import { FiscalProfileSettings } from '../features/fiscal/FiscalProfileSettings';
import { createConfiguredPosApiClient } from '../integrations/web2table/posApiClient';
import type { PosCashSaleHistoryItem, PosCashSaleResult, PosCashierShift, PosClosedShift, PosSessionContext, PosLoyaltyCustomer, PosLoyaltyBalance, PosStaffOrder, PosStaffOrderAction } from '../integrations/web2table/posApiContract';
import { PosSignIn } from '../integrations/web2table/PosSignIn';
import { signOutPos, supabaseAuth } from '../integrations/web2table/supabaseAuth';
import { subscribeToTenantOrderChanges, type PosRealtimeTable } from '../integrations/web2table/posRealtime';
import '../styles/pos-auth.css';
import '../styles/pos-transactions.css';

type Category = string;
type Product = { id: string; name: string; category: string; price: Money; imageUrl: string | null };
type View = 'register' | 'transactions' | 'orders' | 'shifts' | 'fiscal';
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function saleLabel(sale: PosCashSaleHistoryItem | PosCashSaleResult): string {
  return `POS-${String(sale.sale_number).padStart(6, '0')}`;
}

export function PosApp() {
  const apiClient = useMemo(() => createConfiguredPosApiClient(), []);
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [session, setSession] = useState<PosSessionContext | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'connected' | 'error'>(apiClient ? 'loading' : 'error');
  const [category, setCategory] = useState<Category>('All items');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('register');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);
  const [lastSale, setLastSale] = useState<PosCashSaleResult | null>(null);
  const pendingSaleKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const [sales, setSales] = useState<PosCashSaleHistoryItem[]>([]);
  const salesRequestId = useRef(0);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');
  const [salesSearch, setSalesSearch] = useState('');
  const [orders, setOrders] = useState<PosStaffOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [ordersNotice, setOrdersNotice] = useState('');
  const [ordersFilter, setOrdersFilter] = useState<'active' | 'all'>('active');
  const [busyOrderId, setBusyOrderId] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(() => new Set());
  const [ordersRealtimeStatus, setOrdersRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const ordersRequestId = useRef(0);
  const [cashierShift, setCashierShift] = useState<PosCashierShift | null>(null);
  const shiftRequestId = useRef(0);
  const [, setShiftLoading] = useState(false);
  const [shiftActionBusy, setShiftActionBusy] = useState(false);
  const [openingCash, setOpeningCash] = useState('0.00');
  const [countedCash, setCountedCash] = useState('');
  const [shiftCloseNote, setShiftCloseNote] = useState('');
  const [lastClosedShift, setLastClosedShift] = useState<PosClosedShift | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [loyaltySearch, setLoyaltySearch] = useState('');
  const [loyaltyCustomers, setLoyaltyCustomers] = useState<PosLoyaltyCustomer[]>([]);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<PosLoyaltyCustomer | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<PosLoyaltyBalance | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');

  useEffect(() => {
    let active = true;
    async function checkExistingSession() {
      if (!apiClient || !supabaseAuth) { setConnectionStatus('error'); setNotice('POS is not configured for live service. Configure the Supabase URL, public key, and POS API URL before using this register.'); setAuthReady(true); return; }
      try {
        const { data } = await supabaseAuth.auth.getSession();
        if (data.session) {
          const { data: assurance } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel();
          if (active) setAuthenticated(assurance?.currentLevel === 'aal2');
        }
      } catch {
        if (active) setNotice('Unable to verify your session. Please sign in again.');
      } finally { if (active) setAuthReady(true); }
    }
    void checkExistingSession();
    return () => { active = false; };
  }, [apiClient]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearch('');
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (!apiClient || !authenticated) return;
    const client = apiClient;
    let active = true;
    const initialShiftRequestId = ++shiftRequestId.current;
    async function loadAuthorizedMenu() {
      try {
        const authorizedSession = await client.getSession();
        const [menu, shift] = await Promise.all([
          client.getBranchMenu(authorizedSession.branchId),
          client.getCashierShift(authorizedSession.branchId),
        ]);
        if (!active) return;
        setSession(authorizedSession);
        if (initialShiftRequestId === shiftRequestId.current) setCashierShift(shift.active ? shift : null);
        setProducts(menu.filter((item) => item.available).map((item) => ({
          id: item.id, name: item.name, category: item.categoryName,
          price: moneyFromCentavos(item.unitPriceCentavos),
          imageUrl: item.imagePath ? `https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/menu-images/${item.imagePath.split('/').map(encodeURIComponent).join('/')}` : null,
        })));
        setConnectionStatus('connected');
      } catch (error) {
        if (!active) return;
        setProducts([]);
        setConnectionStatus('error');
        setNotice(error instanceof Error ? error.message : 'Unable to connect to the POS service.');
      }
    }
    void loadAuthorizedMenu();
    return () => { active = false; shiftRequestId.current += 1; };
  }, [apiClient, authenticated]);

  async function refreshShift() {
    if (!apiClient || !session) return;
    const requestedBranchId = session.branchId;
    const requestId = ++shiftRequestId.current;
    setShiftLoading(true);
    try {
      const shift = await apiClient.getCashierShift(requestedBranchId);
      if (requestId !== shiftRequestId.current) return;
      setCashierShift(shift.active ? shift : null);
    } catch (error) {
      if (requestId !== shiftRequestId.current) return;
      setNotice(error instanceof Error ? error.message : 'Could not load cashier shift.');
    } finally {
      if (requestId === shiftRequestId.current) setShiftLoading(false);
    }
  }

  async function openShift() {
    if (!apiClient || !session || shiftActionBusy) return;
    const amount = Math.round((Number(openingCash) || 0) * 100);
    if (!Number.isSafeInteger(amount) || amount < 0) { setNotice('Enter a valid opening cash amount.'); return; }
    const requestId = ++shiftRequestId.current;
    const requestedBranchId = session.branchId;
    setShiftActionBusy(true); setNotice('');
    try {
      const shift = await apiClient.openCashierShift(requestedBranchId, amount);
      if (requestId !== shiftRequestId.current) return;
      setCashierShift(shift); setOpeningCash('0.00'); setNotice('Cashier shift opened successfully.');
    } catch (error) {
      if (requestId !== shiftRequestId.current) return;
      setNotice(error instanceof Error ? error.message : 'Could not open cashier shift.');
    } finally {
      if (requestId === shiftRequestId.current) setShiftActionBusy(false);
    }
  }

  async function closeShift() {
    if (!apiClient || !session || shiftActionBusy) return;
    const amount = Math.round((Number(countedCash) || 0) * 100);
    if (!Number.isSafeInteger(amount) || amount < 0 || !countedCash.trim()) { setNotice('Enter the counted cash amount.'); return; }
    const requestId = ++shiftRequestId.current;
    const requestedBranchId = session.branchId;
    setShiftActionBusy(true); setNotice('');
    try {
      const closed = await apiClient.closeCashierShift(requestedBranchId, amount, shiftCloseNote);
      if (requestId !== shiftRequestId.current) return;
      setLastClosedShift(closed); setCashierShift(null); setCountedCash(''); setShiftCloseNote('');
      setNotice('Cashier shift closed. Review the cash variance below.');
    } catch (error) {
      if (requestId !== shiftRequestId.current) return;
      setNotice(error instanceof Error ? error.message : 'Could not close cashier shift.');
    } finally {
      if (requestId === shiftRequestId.current) setShiftActionBusy(false);
    }
  }

  async function loadSales() {
    if (!apiClient || !session) return;
    const requestedBranchId = session.branchId;
    const requestId = ++salesRequestId.current;
    setSalesLoading(true);
    setSalesError('');
    // Clear prior rows before loading this branch's data.
    setSales([]);
    try {
      const branchSales = await apiClient.getBranchSales(requestedBranchId);
      // Ignore responses from an older request after a branch/session refresh.
      if (requestId !== salesRequestId.current) return;
      setSales(branchSales);
    } catch (error) {
      if (requestId !== salesRequestId.current) return;
      setSalesError(error instanceof Error ? error.message : 'Could not load transaction history.');
    } finally {
      if (requestId === salesRequestId.current) setSalesLoading(false);
    }
  }

  useEffect(() => { if (view === 'transactions' && authenticated && session) void loadSales(); }, [view, authenticated, session?.branchId]);

  async function loadOrders(quiet = false) {
    if (!apiClient || !session) return;
    const requestedBranchId = session.branchId;
    const requestId = ++ordersRequestId.current;
    if (!quiet) setOrdersLoading(true);
    setOrdersError('');
    try {
      const result = await apiClient.getStaffOrders(requestedBranchId, ordersFilter);
      if (requestId !== ordersRequestId.current) return;
      setOrders(result);
    } catch (error) {
      if (requestId !== ordersRequestId.current) return;
      setOrdersError(error instanceof Error ? error.message : 'Could not load online orders.');
    } finally {
      if (requestId === ordersRequestId.current) setOrdersLoading(false);
    }
  }

  async function actOnOrder(order: PosStaffOrder, action: PosStaffOrderAction) {
    if (!apiClient || !session || busyOrderId) return;
    setBusyOrderId(order.id);
    setOrdersError('');
    setOrdersNotice('');
    try {
      await apiClient.transitionStaffOrder(session.branchId, order.id, action);
      setOrdersNotice(`Order #${order.order_number}: ${action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'cancelled'}.`);
      await loadOrders();
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : 'Could not update this order.');
    } finally {
      setBusyOrderId('');
    }
  }

  useEffect(() => {
    if (!authenticated || !session) {
      setOrdersRealtimeStatus('disconnected');
      return;
    }
    let active = true;
    setOrdersRealtimeStatus('connecting');
    if (view === 'orders') void loadOrders();

    // Keep one private tenant subscription for all POS views. Broadcasts are
    // refresh signals only; business data always comes from authorized APIs.
    const unsubscribe = supabaseAuth
      ? subscribeToTenantOrderChanges(
          supabaseAuth,
          session.tenantId,
          (table: PosRealtimeTable) => {
            if (!active || document.visibilityState !== 'visible' || !navigator.onLine) return;
            if (table === 'customer_orders' && view === 'orders') void loadOrders(true);
            if (table === 'pos_sales' && view === 'transactions') void loadSales();
            if (table === 'pos_cashier_shifts' && (view === 'shifts' || view === 'register')) void refreshShift();
          },
          setOrdersRealtimeStatus,
        )
      : () => setOrdersRealtimeStatus('error');

    const refreshWhenVisible = () => {
      if (!active || document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (view === 'orders') void loadOrders(true);
      if (view === 'transactions') void loadSales();
      if (view === 'shifts' || view === 'register') void refreshShift();
    };
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      ordersRequestId.current += 1;
      salesRequestId.current += 1;
      shiftRequestId.current += 1;
    };
  }, [view, authenticated, session?.branchId, session?.tenantId, ordersFilter]);
  const categoryOptions = useMemo<Category[]>(() => ['All items', ...new Set(products.map((product) => product.category))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All items' || product.category === category;
    const matchesSearch = product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, search, products]);
  const filteredSales = useMemo(() => {
    const query = salesSearch.trim().toLocaleLowerCase();
    if (!query) return sales;
    return sales.filter((sale) =>
      saleLabel(sale).toLocaleLowerCase().includes(query)
      || sale.items.some((item) => item.item_name_snapshot.toLocaleLowerCase().includes(query))
      || new Date(sale.created_at).toLocaleString().toLocaleLowerCase().includes(query)
      || formatPhp(moneyFromCentavos(sale.total_centavos)).toLocaleLowerCase().includes(query)
    );
  }, [sales, salesSearch]);
  const itemCount = countCartItems(cart);
  const subtotal = calculateCartSubtotal(cart);
  const receivedCentavos = Math.round((Number(cashReceived) || 0) * 100);
  const dueCentavos = subtotal;
  const changeCentavos = receivedCentavos - dueCentavos;

  function addProduct(product: Product) { setNotice(''); setCart((current) => addToCart(current, product)); }
  function changeQuantity(productId: string, delta: number) { setCart((current) => changeCartQuantity(current, productId, delta)); }
  async function searchLoyaltyCustomers(query = loyaltySearch) {
    if (!apiClient || !session || query.trim().length < 2) {
      setLoyaltyCustomers([]);
      setLoyaltyError(query.trim().length < 2 ? '' : '');
      return;
    }
    setLoyaltyLoading(true); setLoyaltyError(''); setLoyaltyBalance(null); setLoyaltyCustomer(null);
    try {
      const results = await apiClient.searchLoyaltyCustomers(session.branchId, query.trim());
      setLoyaltyCustomers(results);
      if (results.length === 0) setLoyaltyError('No linked customer accounts found for this branch.');
    } catch (error) {
      setLoyaltyCustomers([]);
      setLoyaltyError(error instanceof Error ? error.message : 'Customer search failed.');
    } finally { setLoyaltyLoading(false); }
  }

  async function selectLoyaltyCustomer(customer: PosLoyaltyCustomer) {
    if (!apiClient || !session) return;
    setLoyaltyCustomer(customer); setCustomerName(customer.displayName); setLoyaltyCustomers([]); setLoyaltyLoading(true); setLoyaltyError('');
    try {
      const balance = await apiClient.getLoyaltyBalance(session.branchId, customer.customerUserId);
      setLoyaltyBalance(balance);
    } catch (error) {
      setLoyaltyBalance(null);
      setLoyaltyError(error instanceof Error ? error.message : 'Could not load loyalty balance.');
    } finally { setLoyaltyLoading(false); }
  }


  async function completeCashSale() {
    if (!apiClient || !session || !cashierShift?.active || cart.length === 0 || receivedCentavos < dueCentavos || submittingSale) return;
    setSubmittingSale(true); setNotice('');
    try {
      const saleFingerprint = `${session.branchId}:${cart.map((line) => `${line.product.id}:${line.quantity}`).sort().join('|')}`;
      if (pendingSaleKey.current?.fingerprint !== saleFingerprint) {
        pendingSaleKey.current = { fingerprint: saleFingerprint, key: newIdempotencyKey() };
      }
      const result = await apiClient.createCashSale({
        branchId: session.branchId,
        idempotencyKey: pendingSaleKey.current.key,
        cashTenderedCentavos: receivedCentavos,
        items: cart.map((line) => ({ itemId: line.product.id, quantity: line.quantity })),
      });
      pendingSaleKey.current = null;
      setLastSale(result);
      // The create-sale API returns persisted database line snapshots.
      // Printing can work immediately without relying on history refresh.
      setCart([]);
      setCashReceived('');
      setCheckoutOpen(false);
      setNotice(`Sale ${saleLabel(result)} saved successfully.`);
      setView('register');
      // Prefer persisted sale-line snapshots for the receipt; a history refresh failure
      // must not turn an already-saved sale into an apparent checkout failure.
      const requestedBranchId = session.branchId;
      const historyRequestId = ++salesRequestId.current;
      try {
        const refreshedSales = await apiClient.getBranchSales(requestedBranchId);
        // A post-checkout refresh must not restore history for a stale branch/session.
        if (historyRequestId !== salesRequestId.current) return;
        setSales(refreshedSales);
        const persistedSale = refreshedSales.find((sale) => sale.id === result.id);
        if (persistedSale) {
          setLastSale(persistedSale);
        }
      } catch {
        // The saved sale response already contains persisted line snapshots, so
        // receipt printing remains available even when history refresh fails.
        setNotice(`Sale ${saleLabel(result)} was saved. Transaction history could not be refreshed; the receipt uses the saved sale record.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The sale could not be saved. Please retry.');
    } finally { setSubmittingSale(false); }
  }

  function printDocument(html: string, title: string) {
    const popup = window.open('', '_blank', 'width=420,height=760');
    if (!popup) { setNotice('Allow pop-ups to print this document.'); return; }
    popup.document.open();
    popup.document.write(html.replace('</body>', `<script>document.title=${JSON.stringify(title)};window.onload=()=>window.print()<\\/script></body>`));
    popup.document.close();
  }

  function printReceipt(sale: PosCashSaleHistoryItem | PosCashSaleResult = lastSale as PosCashSaleResult) {
    if (!sale || !session) return;
    const savedItems = sale.items;
    const html = renderCashReceiptHtml(sale, savedItems, {
      sellerName: session.tenantName,
      branchName: session.branchName,
      cashierName: session.displayName,
    });
    printDocument(html, `Cash receipt ${saleLabel(sale)}`);
  }

  function printXReading() {
    if (!cashierShift?.active || !session) return;
    try {
      printDocument(renderXReadingHtml(cashierShift, {
        sellerName: session.tenantName, branchName: session.branchName, cashierName: session.displayName,
      }), 'X Reading — Operational Preview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not prepare the X reading preview.');
    }
  }

  function printZReading() {
    if (!lastClosedShift || !session) return;
    try {
      printDocument(renderZReadingHtml(lastClosedShift, {
        sellerName: session.tenantName, branchName: session.branchName, cashierName: session.displayName,
      }), 'Z Reading — Operational Preview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not prepare the Z reading preview.');
    }
  }

  if (!authReady) return <main className="pos-auth-page"><p role="status">Checking secure session…</p></main>;
  if (!apiClient || !supabaseAuth) return <main className="pos-auth-page"><section className="pos-auth-card" role="alert"><h1>Live POS is not configured</h1><p>This register requires the restaurant’s authenticated POS API. The register requires the configured live POS service.</p><p>{notice || 'Configure the Supabase URL, public key, and POS API URL in the deployment environment.'}</p></section></main>;
  if (!authenticated) return <PosSignIn onAuthenticated={() => { setAuthenticated(true); setConnectionStatus('loading'); setNotice(''); }} />;

  return (
    <div className="pos-shell">
      <main className="pos-main" id={view}>
        <header className="pos-topbar"><nav className="pos-nav pos-top-nav" aria-label="POS workspace"><a className={view === 'register' ? 'is-active' : ''} href="#register" aria-current={view === 'register' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('register'); }}><span aria-hidden="true">▦</span> Register</a><a className={view === 'transactions' ? 'is-active' : ''} href="#transactions" aria-current={view === 'transactions' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('transactions'); }}><span aria-hidden="true">◷</span> Transactions</a><a className={view === 'orders' ? 'is-active' : ''} href="#orders" aria-current={view === 'orders' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('orders'); setOrdersNotice(''); }}><span aria-hidden="true">≡</span> Orders</a><a className={view === 'shifts' ? 'is-active' : ''} href="#shifts" aria-current={view === 'shifts' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('shifts'); void refreshShift(); }}><span aria-hidden="true">▤</span> Shifts</a>{session?.role === 'restaurant_owner' && <a className={view === 'fiscal' ? 'is-active' : ''} href="#fiscal" aria-current={view === 'fiscal' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('fiscal'); }}><span aria-hidden="true">⚙</span> Management</a>}</nav><div className="pos-topbar-actions">{authenticated && <button className="pos-sign-out" type="button" onClick={async () => {
            try { await signOutPos(); }
            finally {
              setAuthenticated(false);
              setSession(null);
              setProducts([]);
              setCart([]);
              setCategory('All items');
              setSearch('');
              setNotice('');
              setView('register');
              setCheckoutOpen(false);
              setCashReceived('');
              setSubmittingSale(false);
              setLastSale(null);
              pendingSaleKey.current = null;
              salesRequestId.current += 1;
              ordersRequestId.current += 1;
              setOrders([]);
              setOrdersError('');
              setOrdersNotice('');
              setOrdersLoading(false);
              setBusyOrderId('');
              setSales([]);
              setSalesLoading(false);
              setSalesError('');
              setSalesSearch('');
              shiftRequestId.current += 1;
              setCashierShift(null);
              setShiftActionBusy(false);
              setOpeningCash('0.00');
              setCountedCash('');
              setShiftCloseNote('');
              setLastClosedShift(null);
              setConnectionStatus('loading');
            }
          }}>Sign out</button>}<span className="pos-connection-badge">{connectionStatus === 'connected' ? 'LIVE POS' : connectionStatus === 'loading' ? 'CONNECTING' : 'API ERROR'}</span><div className="pos-account-menu"><button className="pos-account-button" type="button" aria-label="Open account menu" aria-expanded={accountMenuOpen} aria-haspopup="menu" onClick={() => setAccountMenuOpen(open => !open)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5" /></svg></button>{accountMenuOpen && <div className="pos-account-dropdown" role="menu"><div className="pos-account-name">{session?.displayName ?? 'Account name unavailable'}</div><div className="pos-account-role">{session?.role?.replaceAll('_', ' ') ?? 'Cashier'}</div>{authenticated && <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); const signOutButton = document.querySelector<HTMLButtonElement>('.pos-sign-out'); signOutButton?.click(); }} >Log out</button>}</div>}</div></div></header>
        <div className="pos-content">
          {view === 'register' ? <>
            
            <div className="pos-workspace">
              <section className="catalog-panel" aria-label="Product catalog">
                <div className="catalog-heading"><div><h2>Menu</h2><p>Select an item to add it to the order.</p></div><span className="catalog-count">{visibleProducts.length} items</span></div>
                <label className="product-search"><span aria-hidden="true">⌕</span><input ref={searchInputRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items" aria-label="Search menu items" /><kbd>⌘ K</kbd></label>
                <div className="category-tabs" role="group" aria-label="Filter by category">{categoryOptions.map((item) => <button key={item} type="button" className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
                <div className="product-grid">{visibleProducts.map((product) => <button className="product-card" type="button" key={product.id} onClick={() => addProduct(product)}><span className="product-art">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.classList.add('has-image-error'); }} /> : <span className="product-art-fallback" aria-hidden="true">No image</span>}</span><span className="product-card-copy"><span className="product-name">{product.name}</span><span className="product-category">{product.category}</span><strong>{formatPhp(product.price)}</strong></span><span className="add-product" aria-hidden="true">+</span></button>)}{visibleProducts.length === 0 && <div className="catalog-empty">{connectionStatus === 'loading' ? 'Loading your restaurant menu…' : connectionStatus === 'error' ? 'The live menu could not be loaded. Please retry your connection.' : products.length === 0 ? 'No available menu items for this branch.' : 'No menu items match your search.'}</div>}</div>
                {connectionStatus === 'loading' && <p className="pos-connection-note">Loading menu from your authorized branch…</p>}{connectionStatus === 'error' && <p className="sample-data-note">Live menu unavailable. Checkout remains disabled.</p>}
              </section>
              <aside className="order-panel" aria-label="Current order">
                <div className="order-panel-heading"><div><p className="pos-eyebrow">CURRENT SALE</p><h2>New order</h2></div><button className="text-button" type="button" onClick={() => { setCart([]); setNotice(''); }} disabled={cart.length === 0}>Clear</button></div>
                <section className="pos-customer-panel" aria-label="Sale customer">
                  <label htmlFor="pos-customer-name">Customer name <span>OPTIONAL</span></label>
                  <input id="pos-customer-name" name="customerName" autoComplete="off" maxLength={120} value={customerName} onChange={(event) => {
                    const value = event.target.value.slice(0, 120);
                    setCustomerName(value);
                    setLoyaltySearch(value);
                    setLoyaltyError('');
                    if (loyaltyCustomer && value.trim() !== loyaltyCustomer.displayName) { setLoyaltyCustomer(null); setLoyaltyBalance(null); }
                    if (value.trim().length >= 2) void searchLoyaltyCustomers(value);
                    else { setLoyaltyCustomers([]); setLoyaltyLoading(false); setLoyaltyBalance(null); }
                  }} placeholder="Enter customer name" aria-describedby="pos-customer-help" />
                  <small id="pos-customer-help" className="pos-customer-help">Type a name to find an existing customer account.</small>
                  {loyaltyCustomers.length > 0 && !loyaltyCustomer && <div className="pos-loyalty-results" role="listbox" aria-label="Matching customer accounts">{loyaltyCustomers.map((customer) => <button key={customer.customerUserId} type="button" role="option" onClick={() => void selectLoyaltyCustomer(customer)}><span><strong>{customer.displayName}</strong><small>Phone ending {customer.phoneLastFour || '----'}</small></span><span>Select</span></button>)}</div>}
                  {loyaltyLoading && !loyaltyCustomer && <p className="pos-loyalty-meta" role="status">Finding customer accounts…</p>}
                  {loyaltyCustomer && <div className="pos-customer-selected"><span>Selected: <strong>{loyaltyCustomer.displayName}</strong></span><button type="button" onClick={() => { setLoyaltyCustomer(null); setLoyaltyBalance(null); setLoyaltySearch(customerName); setLoyaltyError(''); void searchLoyaltyCustomers(customerName); }}>Change</button></div>}
                  {loyaltyCustomer && loyaltyLoading && <p className="pos-loyalty-meta">Loading points balance…</p>}
                  {loyaltyBalance && <div className="pos-loyalty-balance"><span>Available points</span><strong>{loyaltyBalance.account.points_balance.toLocaleString()}</strong><small>{loyaltyBalance.settings.enabled ? (loyaltyBalance.settings.redemption_enabled ? 'Rewards enabled' : 'Earning enabled · redemption off') : 'Loyalty is disabled for this restaurant'}</small></div>}

                  {loyaltyError && !loyaltyCustomer && <p className="pos-loyalty-error" role="status">{loyaltyError}</p>}
                </section>

                <div className="order-reference"><span className="order-reference-icon" aria-hidden="true">＋</span><div><strong>{customerName.trim() || loyaltyCustomer?.displayName || 'Walk-in customer'}</strong><span>{session ? `${session.branchName} · Draft` : 'In-store order · Draft'}</span></div><span className="draft-pill">DRAFT</span></div>
                <div className="order-lines-heading"><span>ITEM</span><span>QTY</span><span className="align-right">TOTAL</span></div>
                <div className="order-lines">{cart.length === 0 ? <div className="empty-order"><span className="empty-order-icon" aria-hidden="true">▤</span><strong>Your order is empty</strong><p>Select items from the menu to get started.</p></div> : cart.map((line) => <div className="order-line" key={line.product.id}><div className="order-line-product"><strong>{line.product.name}</strong><span>{formatPhp(line.product.price)} each</span></div><div className="quantity-control"><button type="button" onClick={() => changeQuantity(line.product.id, -1)} aria-label={`Remove one ${line.product.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.product.id, 1)} aria-label={`Add one ${line.product.name}`}>+</button></div><strong className="line-total">{formatPhp(multiplyMoney(line.product.price, line.quantity))}</strong></div>)}</div>
                <div className="order-summary"><div><span>Items</span><span>{itemCount}</span></div><div><span>Subtotal</span><strong>{formatPhp(subtotal)}</strong></div><div><span>Tax and discounts</span><span className="not-configured">Not configured</span></div><div className="order-total"><span>Total</span><strong>{formatPhp(subtotal)}</strong></div></div>
                {notice && <div className="pos-notice" role="status">{notice}</div>}
                <button className="checkout-button" type="button" disabled={connectionStatus !== 'connected' || !cashierShift?.active || cart.length === 0} onClick={() => { setCashReceived(''); setCheckoutOpen(true); }}>Checkout · Cash <span aria-hidden="true">→</span></button>
                <p className="checkout-caption">{connectionStatus !== 'connected' ? 'Connect to the authorized POS API to accept a sale.' : !cashierShift?.active ? 'Open a cashier shift before accepting cash sales.' : 'Cash sales are saved to your active shift.'}</p>
                {lastSale && <button className="text-button receipt-action" type="button" onClick={() => printReceipt(lastSale)}>Print last receipt · {saleLabel(lastSale)}</button>}
              </aside>
            </div>
          </> : view === 'transactions' ? <>
            
            {salesError && <div className="pos-notice" role="alert">{salesError}</div>}
            <section className="transactions-panel"><div className="transactions-heading"><div><h2>Sales history</h2><p>{session?.branchName ?? 'Authorized branch'} · Most recent first</p></div><span className="catalog-count">{filteredSales.length} of {sales.length} records</span></div>
              <div className="transactions-toolbar"><label className="transactions-search"><span aria-hidden="true">⌕</span><input type="search" value={salesSearch} onChange={(event) => setSalesSearch(event.target.value)} placeholder="Search receipt, item, date, or total" aria-label="Search transactions" />{salesSearch && <button type="button" onClick={() => setSalesSearch('')} aria-label="Clear transaction search">×</button>}</label></div>
              {salesLoading ? <p className="transactions-empty">Loading saved transactions…</p> : sales.length === 0 ? <p className="transactions-empty">No saved cash sales found for this branch.</p> : filteredSales.length === 0 ? <p className="transactions-empty">No transactions match “{escapeHtml(salesSearch)}”. Try a receipt number, item name, date, or total.</p> : <div className="transactions-table-wrap"><table className="transactions-table"><thead><tr><th>Receipt</th><th>Date</th><th>Items</th><th>Payment</th><th>Total</th><th>Receipt</th></tr></thead><tbody>{filteredSales.map((sale) => <tr key={sale.id}><td><strong>{saleLabel(sale)}</strong></td><td>{new Date(sale.created_at).toLocaleString()}</td><td>{sale.items.map((item) => `${item.item_name_snapshot} ×${item.quantity}`).join(', ')}</td><td><span className="paid-pill">PAID · CASH</span></td><td><strong>{formatPhp(moneyFromCentavos(sale.total_centavos))}</strong></td><td><button className="text-button" type="button" onClick={() => printReceipt(sale)}>Print</button></td></tr>)}</tbody></table></div>}
            </section>
          </> : view === 'orders' ? <>
            <section className="transactions-panel">
              <div className="transactions-heading">
                <div><h2>Online orders</h2></div>
                <div className="cash-shortcuts"><span className={ordersRealtimeStatus === 'connected' ? 'paid-pill' : 'catalog-count'} role="status">{ordersRealtimeStatus === 'connected' ? 'REALTIME CONNECTED' : ordersRealtimeStatus === 'error' ? 'REALTIME UNAVAILABLE' : ordersRealtimeStatus === 'disconnected' ? 'REALTIME DISCONNECTED' : 'CONNECTING REALTIME'}</span><button className="text-button" type="button" onClick={() => void loadOrders()} disabled={ordersLoading}>{ordersLoading ? 'Refreshing…' : 'Refresh'}</button></div>
              </div>
              <div className="transactions-toolbar">
                <div className="cash-shortcuts" role="group" aria-label="Order filter">
                  <button type="button" className={ordersFilter === 'active' ? 'is-selected' : ''} aria-pressed={ordersFilter === 'active'} onClick={() => setOrdersFilter('active')}>Active orders</button>
                  <button type="button" className={ordersFilter === 'all' ? 'is-selected' : ''} aria-pressed={ordersFilter === 'all'} onClick={() => setOrdersFilter('all')}>All orders</button>
                  <span className="catalog-count">{orders.length} orders</span>
                </div>
              </div>
              {ordersError && <div className="pos-notice" role="alert">{ordersError}</div>}
              {ordersNotice && <div className="pos-notice" role="status">{ordersNotice}</div>}
              {ordersLoading && orders.length === 0 ? <p className="transactions-empty">Loading orders from your authorized branch…</p>
                : orders.length === 0 ? <p className="transactions-empty">No {ordersFilter === 'active' ? 'active ' : ''}online orders for this branch.</p>
                : <div className="transactions-table-wrap"><table className="transactions-table"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Fulfilment</th><th>Items</th><th>Payment</th><th>Total</th><th>Status / Actions</th></tr></thead><tbody>
                  {orders.map((order) => <Fragment key={order.id}>
                    <tr>
                      <td><strong>#{order.order_number}</strong><br /><button className="text-button" type="button" aria-expanded={expandedOrderIds.has(order.id)} onClick={() => setExpandedOrderIds((current) => { const next = new Set(current); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); return next; })}>{expandedOrderIds.has(order.id) ? 'Hide details' : 'Details'}</button></td>
                      <td>{new Date(order.created_at).toLocaleString()}</td>
                      <td><strong>{order.customer_name}</strong><br /><span>{order.customer_phone}</span></td>
                      <td>{order.order_type.replaceAll('_', ' ')}{order.delivery_address ? <><br /><span>{order.delivery_address}</span></> : null}</td>
                      <td>{order.items.map((item) => `${item.item_name} ×${item.quantity}`).join(', ')}</td>
                      <td>{order.payment_status.replaceAll('_', ' ')}{order.payment_method ? <><br /><span>{order.payment_method}</span></> : null}</td>
                      <td><strong>{order.total_centavos === null ? 'Awaiting confirmation' : formatPhp(moneyFromCentavos(order.total_centavos))}</strong></td>
                      <td><span className="paid-pill">{order.order_status.replaceAll('_', ' ')}</span>
                        {order.order_status === 'pending_confirmation' && <div className="cash-shortcuts"><button type="button" disabled={busyOrderId !== ''} onClick={() => void actOnOrder(order, 'confirm')}>{busyOrderId === order.id ? 'Saving…' : 'Confirm'}</button><button type="button" disabled={busyOrderId !== ''} onClick={() => void actOnOrder(order, 'reject')}>Reject</button></div>}
                        {order.order_status === 'confirmed' && <div className="cash-shortcuts"><button type="button" disabled={busyOrderId !== ''} onClick={() => void actOnOrder(order, 'cancel')}>Cancel</button></div>}
                      </td>
                    </tr>
                    {expandedOrderIds.has(order.id) && <tr><td colSpan={8}>
                      <section aria-label={`Details for order ${order.order_number}`}>
                        <h3>Order #{order.order_number} details</h3>
                        <p><strong>Items</strong></p>
                        <ul>{order.items.map((item) => <li key={item.id}>{item.item_name} — {item.quantity} × {formatPhp(moneyFromCentavos(item.unit_price_centavos))} = {formatPhp(moneyFromCentavos(item.line_total_centavos))}
                          {item.options && item.options.length > 0 && <ul>{item.options.map((option, index) => <li key={option.id ?? `${option.group_name ?? 'option'}-${option.name ?? index}`}>{option.group_name ? `${option.group_name}: ` : ''}{option.name ?? 'Option'}</li>)}</ul>}
                        </li>)}</ul>
                        <p><strong>Subtotal:</strong> {formatPhp(moneyFromCentavos(order.subtotal_centavos))}</p>
                        {order.delivery_fee_centavos !== null && <p><strong>Delivery fee:</strong> {formatPhp(moneyFromCentavos(order.delivery_fee_centavos))}</p>}
                        <p><strong>Total:</strong> {order.total_centavos === null ? 'Awaiting confirmation' : formatPhp(moneyFromCentavos(order.total_centavos))}</p>
                        {order.delivery_notes.trim() && <p><strong>Fulfilment notes:</strong> {order.delivery_notes}</p>}
                        <p><strong>Last updated:</strong> {new Date(order.updated_at).toLocaleString()}</p>
                      </section>
                    </td></tr>}
                  </Fragment>)}
                </tbody></table></div>}
            </section>
          </> : view === 'fiscal' ? (
            session?.role === 'restaurant_owner' && apiClient
              ? <FiscalProfileSettings apiClient={apiClient} session={session} />
              : <section className="transactions-panel"><div className="transactions-heading"><div><h2>Taxpayer setup unavailable</h2></div></div><p className="transactions-empty">Only a restaurant owner can manage taxpayer configuration.</p></section>
          ) : <>
            
            {notice && <div className="pos-notice" role="status">{notice}</div>}
            <section className="transactions-panel">
              <div className="transactions-heading"><div><h2>{cashierShift?.active ? 'Active shift' : 'No active shift'}</h2><p>{session?.branchName ?? 'Authorized branch'} · {session?.displayName ?? 'Cashier'}</p></div><span className={cashierShift?.active ? 'paid-pill' : 'catalog-count'}>{cashierShift?.active ? 'OPEN' : 'CLOSED'}</span></div>
              {cashierShift?.active ? <div className="transactions-toolbar">
                <p>Opened {cashierShift.opened_at ? new Date(cashierShift.opened_at).toLocaleString() : 'recently'}</p>
                <p>Opening cash: <strong>{formatPhp(moneyFromCentavos(cashierShift.opening_cash_centavos ?? 0))}</strong></p>
                <p>Cash sales: <strong>{formatPhp(moneyFromCentavos(cashierShift.cash_sales_centavos ?? 0))}</strong></p>
                <p>Expected cash: <strong>{formatPhp(moneyFromCentavos(cashierShift.expected_cash_centavos ?? cashierShift.opening_cash_centavos ?? 0))}</strong></p>
                <label className="cash-input-label" htmlFor="counted-cash">Counted cash at close (PHP)</label><div className="cash-input-wrap"><span>₱</span><input id="counted-cash" inputMode="decimal" value={countedCash} onChange={(event) => setCountedCash(event.target.value.replace(/[^0-9.]/g, '').replace(/(\\..*)\\./g, '$1'))} placeholder="0.00" /></div>
                <label className="cash-input-label" htmlFor="shift-close-note">Closing note (optional)</label><div className="cash-input-wrap"><input id="shift-close-note" value={shiftCloseNote} onChange={(event) => setShiftCloseNote(event.target.value.slice(0, 500))} placeholder="Explain any cash difference" /></div>
                <button className="text-button" type="button" onClick={printXReading}>Print X reading preview</button>
                <button className="checkout-button" type="button" disabled={shiftActionBusy || !countedCash.trim()} onClick={() => void closeShift()}>{shiftActionBusy ? 'Closing shift…' : 'Close shift and reconcile'} <span aria-hidden="true">→</span></button>
              </div> : <div className="transactions-toolbar">
                <p>Start a shift before recording cash sales. The opening float and every sale will be used for reconciliation.</p>
                <label className="cash-input-label" htmlFor="opening-cash">Opening cash (PHP)</label><div className="cash-input-wrap"><span>₱</span><input id="opening-cash" inputMode="decimal" value={openingCash} onChange={(event) => setOpeningCash(event.target.value.replace(/[^0-9.]/g, '').replace(/(\\..*)\\./g, '$1'))} placeholder="0.00" /></div>
                <button className="checkout-button" type="button" disabled={shiftActionBusy || !openingCash.trim()} onClick={() => void openShift()}>{shiftActionBusy ? 'Opening shift…' : 'Open cashier shift'} <span aria-hidden="true">→</span></button>
              </div>}
            </section>
            {lastClosedShift && <section className="transactions-panel"><div className="transactions-heading"><div><h2>Last shift reconciliation</h2><p>{new Date(lastClosedShift.closed_at).toLocaleString()}</p></div><span className={lastClosedShift.cash_variance_centavos === 0 ? 'paid-pill' : 'catalog-count'}>{lastClosedShift.cash_variance_centavos === 0 ? 'BALANCED' : 'VARIANCE'}</span></div><div className="transactions-toolbar"><p>Expected cash: <strong>{formatPhp(moneyFromCentavos(lastClosedShift.expected_cash_centavos))}</strong></p><p>Counted cash: <strong>{formatPhp(moneyFromCentavos(lastClosedShift.counted_cash_centavos))}</strong></p><p>Difference: <strong>{formatPhp(moneyFromCentavos(Math.abs(lastClosedShift.cash_variance_centavos)))} {lastClosedShift.cash_variance_centavos < 0 ? 'short' : lastClosedShift.cash_variance_centavos > 0 ? 'over' : ''}</strong></p><button className="text-button" type="button" onClick={printZReading}>Print Z reading preview</button></div></section>}
          </>}
        </div>
      </main>
      {checkoutOpen && cashierShift?.active && <div className="checkout-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submittingSale) setCheckoutOpen(false); }}><section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="checkout-dialog-heading"><div><p className="pos-eyebrow">PAYMENT METHOD · CASH</p><h2 id="checkout-title">Complete sale</h2></div><button type="button" className="dialog-close" onClick={() => setCheckoutOpen(false)} disabled={submittingSale} aria-label="Close checkout">×</button></div><div className="checkout-due"><span>Amount due</span><strong>{formatPhp(subtotal)}</strong></div><label className="cash-input-label" htmlFor="cash-received">Cash received (PHP)</label><div className="cash-input-wrap"><span>₱</span><input id="cash-received" inputMode="decimal" autoFocus value={cashReceived} onChange={(e) => setCashReceived(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="0.00" /></div><div className="cash-shortcuts-group"><p className="cash-shortcuts-label">Quick tender</p><div className="cash-shortcuts">{Array.from(new Set([dueCentavos, Math.ceil(dueCentavos / 5000) * 5000, Math.ceil(dueCentavos / 10000) * 10000, 50000, 100000])).filter((amount) => amount >= dueCentavos && amount > 0).sort((a, b) => a - b).slice(0, 5).map((amount) => <button key={amount} type="button" className={receivedCentavos === amount ? 'is-selected' : ''} aria-pressed={receivedCentavos === amount} onClick={() => setCashReceived((amount / 100).toFixed(2))}>{amount === dueCentavos ? 'Exact · ' : ''}{formatPhp(moneyFromCentavos(amount))}</button>)}</div></div><div className="change-row"><span>{changeCentavos >= 0 ? 'Change due' : 'Remaining balance'}</span><strong className={changeCentavos < 0 ? 'amount-short' : ''}>{formatPhp(moneyFromCentavos(Math.abs(changeCentavos)))}</strong></div>{notice && <div className="pos-notice" role="status">{notice}</div>}<button className="checkout-button" type="button" disabled={submittingSale || receivedCentavos < dueCentavos || dueCentavos <= 0} onClick={() => void completeCashSale()}>{submittingSale ? 'Saving sale…' : 'Confirm cash payment'} <span aria-hidden="true">→</span></button><p className="checkout-caption">The server revalidates menu prices and branch authorization before saving.</p></section></div>}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
