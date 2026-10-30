import { useEffect, useMemo, useState } from 'react';
import { addToCart, calculateCartSubtotal, changeCartQuantity, countCartItems, type CartLine } from '../domain/cart';
import { formatPhp, moneyFromCentavos, multiplyMoney, type Money } from '../domain/money';
import { createConfiguredPosApiClient } from '../integrations/web2table/posApiClient';
import type { PosCashSaleHistoryItem, PosCashSaleResult, PosSessionContext } from '../integrations/web2table/posApiContract';
import { PosSignIn } from '../integrations/web2table/PosSignIn';
import { signOutPos, supabaseAuth } from '../integrations/web2table/supabaseAuth';
import '../styles/pos-auth.css';

type Category = string;
type Product = { id: string; name: string; category: string; price: Money; initials: string };
type View = 'register' | 'transactions';
const demoProducts: Product[] = [
  { id: 'meal-001', name: 'Classic Burger', category: 'Meals', price: moneyFromCentavos(18900), initials: 'CB' },
  { id: 'meal-002', name: 'Crispy Chicken', category: 'Meals', price: moneyFromCentavos(21900), initials: 'CC' },
  { id: 'meal-003', name: 'Beef Rice Bowl', category: 'Meals', price: moneyFromCentavos(16900), initials: 'BR' },
  { id: 'meal-004', name: 'Pasta Alfredo', category: 'Meals', price: moneyFromCentavos(19900), initials: 'PA' },
  { id: 'drink-001', name: 'Iced Tea', category: 'Drinks', price: moneyFromCentavos(4900), initials: 'IT' },
  { id: 'drink-002', name: 'Iced Coffee', category: 'Drinks', price: moneyFromCentavos(7900), initials: 'IC' },
  { id: 'side-001', name: 'French Fries', category: 'Sides', price: moneyFromCentavos(6900), initials: 'FF' },
  { id: 'side-002', name: 'Extra Rice', category: 'Sides', price: moneyFromCentavos(2500), initials: 'ER' },
];

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
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [session, setSession] = useState<PosSessionContext | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'demo' | 'loading' | 'connected' | 'error'>(apiClient ? 'loading' : 'demo');
  const [category, setCategory] = useState<Category>('All items');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('register');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);
  const [lastSale, setLastSale] = useState<PosCashSaleResult | null>(null);
  const [sales, setSales] = useState<PosCashSaleHistoryItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');

  useEffect(() => {
    let active = true;
    async function checkExistingSession() {
      if (!apiClient || !supabaseAuth) { setAuthReady(true); return; }
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
    if (!apiClient || !authenticated) return;
    const client = apiClient;
    let active = true;
    async function loadAuthorizedMenu() {
      try {
        const authorizedSession = await client.getSession();
        const menu = await client.getBranchMenu(authorizedSession.branchId);
        if (!active) return;
        setSession(authorizedSession);
        setProducts(menu.filter((item) => item.available).map((item) => ({
          id: item.id, name: item.name, category: item.categoryName,
          price: moneyFromCentavos(item.unitPriceCentavos),
          initials: item.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase(),
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
    return () => { active = false; };
  }, [apiClient, authenticated]);

  async function loadSales() {
    if (!apiClient || !session) return;
    setSalesLoading(true); setSalesError('');
    try { setSales(await apiClient.getBranchSales(session.branchId)); }
    catch (error) { setSalesError(error instanceof Error ? error.message : 'Could not load transaction history.'); }
    finally { setSalesLoading(false); }
  }

  useEffect(() => { if (view === 'transactions' && authenticated && session) void loadSales(); }, [view, authenticated, session?.branchId]);

  const categoryOptions = useMemo<Category[]>(() => ['All items', ...new Set(products.map((product) => product.category))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All items' || product.category === category;
    const matchesSearch = product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, search, products]);
  const itemCount = countCartItems(cart);
  const subtotal = calculateCartSubtotal(cart);
  const receivedCentavos = Math.round((Number(cashReceived) || 0) * 100);
  const dueCentavos = Math.round(subtotal * 100);
  const changeCentavos = receivedCentavos - dueCentavos;

  function addProduct(product: Product) { setNotice(''); setCart((current) => addToCart(current, product)); }
  function changeQuantity(productId: string, delta: number) { setCart((current) => changeCartQuantity(current, productId, delta)); }

  async function completeCashSale() {
    if (!apiClient || !session || cart.length === 0 || receivedCentavos < dueCentavos || submittingSale) return;
    setSubmittingSale(true); setNotice('');
    try {
      const result = await apiClient.createCashSale({
        branchId: session.branchId,
        idempotencyKey: newIdempotencyKey(),
        cashTenderedCentavos: receivedCentavos,
        items: cart.map((line) => ({ itemId: line.product.id, quantity: line.quantity })),
      });
      setLastSale(result);
      setCart([]);
      setCashReceived('');
      setCheckoutOpen(false);
      setNotice(`Sale ${saleLabel(result)} saved successfully.`);
      setView('register');
      void loadSales();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The sale could not be saved. Please retry.');
    } finally { setSubmittingSale(false); }
  }

  function printReceipt(sale: PosCashSaleHistoryItem | PosCashSaleResult = lastSale as PosCashSaleResult) {
    if (!sale) return;
    const saved = 'items' in sale ? sale : null;
    const itemRows = saved?.items.map((item) => `<tr><td>${escapeHtml(item.item_name_snapshot)} × ${item.quantity}</td><td>${formatPhp(moneyFromCentavos(item.line_total_centavos))}</td></tr>`).join('') ?? '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${saleLabel(sale)}</title><style>body{font:14px/1.45 Arial,sans-serif;color:#111;max-width:320px;margin:24px auto;padding:0 12px}h1,p{text-align:center}h1{font-size:20px}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px dashed #ddd}td:last-child{text-align:right;white-space:nowrap}.total{font-weight:bold;font-size:18px;border-top:1px solid #111;padding-top:12px}.muted{color:#555;font-size:12px}</style></head><body><h1>Web2table</h1><p>Restaurant operations, connected.</p><p>Cash sale receipt<br>${saleLabel(sale)}<br><span class="muted">${new Date(sale.created_at).toLocaleString()}</span></p><table>${itemRows}</table><p class="total">Total: ${formatPhp(moneyFromCentavos(sale.total_centavos))}</p><p>Cash received: ${formatPhp(moneyFromCentavos(sale.cash_tendered_centavos))}<br>Change: ${formatPhp(moneyFromCentavos(sale.change_centavos))}</p><p>Thank you!</p><script>window.onload=()=>window.print()<\/script></body></html>`;
    const popup = window.open('', '_blank', 'width=420,height=680');
    if (!popup) { setNotice('Allow pop-ups to print the receipt.'); return; }
    popup.document.write(html); popup.document.close();
  }

  if (apiClient && !authReady) return <main className="pos-auth-page"><p role="status">Checking secure session…</p></main>;
  if (apiClient && !authenticated) return <PosSignIn onAuthenticated={() => { setAuthenticated(true); setConnectionStatus('loading'); setNotice(''); }} />;

  return (
    <div className="pos-shell">
      <aside className="pos-sidebar" aria-label="Main navigation">
        <a className="pos-brand" href="#home" aria-label="Web2table POS home"><img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="" /><span>Web<span className="brand-two">2</span>table <small>POINT OF SALE</small></span></a>
        <div className="pos-sidebar-label">WORKSPACE</div>
        <nav className="pos-nav">
          <a className={view === 'register' ? 'is-active' : ''} href="#register" aria-current={view === 'register' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('register'); }}><span aria-hidden="true">▦</span> Register</a>
          <a className={view === 'transactions' ? 'is-active' : ''} href="#transactions" aria-current={view === 'transactions' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setView('transactions'); }}><span aria-hidden="true">◷</span> Transactions</a>
          <a href="#orders" onClick={(e) => { e.preventDefault(); setNotice('Online order queue integration is the next module.'); }}><span aria-hidden="true">≡</span> Orders</a>
          <a href="#shifts" onClick={(e) => { e.preventDefault(); setNotice('Shift and cash-drawer reconciliation is not implemented yet.'); }}><span aria-hidden="true">▤</span> Shifts</a>
        </nav>
        <div className="pos-sidebar-bottom"><div className="pos-environment"><span className="status-dot" /> {connectionStatus === 'connected' ? 'Live restaurant data' : connectionStatus === 'error' ? 'Connection issue' : 'Prototype environment'}</div><p>Restaurant operations, connected.</p></div>
      </aside>
      <main className="pos-main" id={view}>
        <header className="pos-topbar"><div className="pos-breadcrumb">Workspace <span>/</span> <strong>{view === 'register' ? 'Register' : 'Transactions'}</strong></div><div className="pos-topbar-actions">{authenticated && <button className="pos-sign-out" type="button" onClick={async () => { await signOutPos(); setAuthenticated(false); setSession(null); setProducts([]); setCart([]); setConnectionStatus('loading'); }}>Sign out</button>}<span className="demo-badge">{connectionStatus === 'connected' ? 'LIVE MENU' : connectionStatus === 'loading' ? 'CONNECTING' : connectionStatus === 'error' ? 'API ERROR' : 'DEMO DATA'}</span><div className="pos-avatar" aria-label={session?.displayName ?? 'Demo cashier'}>{session ? session.displayName.split(/\s+/).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase() : 'DC'}</div></div></header>
        <div className="pos-content">
          {view === 'register' ? <>
            <section className="pos-page-heading"><div><p className="pos-eyebrow">POINT OF SALE</p><h1>Register</h1><p className="pos-subtitle">Build an order, collect cash, and print the receipt.</p></div><div className={`register-status register-status-${connectionStatus}`}><span className="status-dot" /> {connectionStatus === 'loading' ? 'Connecting to register…' : connectionStatus === 'connected' ? `Connected · ${session?.branchName ?? 'Authorized branch'}` : connectionStatus === 'error' ? 'Register connection failed' : 'Demo mode · Checkout disabled'}</div></section>
            <div className="pos-workspace">
              <section className="catalog-panel" aria-label="Product catalog">
                <div className="catalog-heading"><div><h2>Menu</h2><p>Select an item to add it to the order.</p></div><span className="catalog-count">{visibleProducts.length} items</span></div>
                <label className="product-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items" aria-label="Search menu items" /><kbd>⌘ K</kbd></label>
                <div className="category-tabs" role="group" aria-label="Filter by category">{categoryOptions.map((item) => <button key={item} type="button" className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
                <div className="product-grid">{visibleProducts.map((product) => <button className="product-card" type="button" key={product.id} onClick={() => addProduct(product)}><span className={`product-art product-art-${product.category.toLowerCase()}`} aria-hidden="true">{product.initials}</span><span className="product-card-copy"><span className="product-name">{product.name}</span><span className="product-category">{product.category}</span><strong>{formatPhp(product.price)}</strong></span><span className="add-product" aria-hidden="true">+</span></button>)}{visibleProducts.length === 0 && <div className="catalog-empty">No menu items match your search.</div>}</div>
                {connectionStatus === 'demo' && <p className="sample-data-note">Sample menu only · Cash checkout is disabled outside the trusted API.</p>}{connectionStatus === 'loading' && <p className="sample-data-note">Loading menu from your authorized branch…</p>}{connectionStatus === 'error' && <p className="sample-data-note">Live menu unavailable. Checkout remains disabled.</p>}
              </section>
              <aside className="order-panel" aria-label="Current order">
                <div className="order-panel-heading"><div><p className="pos-eyebrow">CURRENT SALE</p><h2>New order</h2></div><button className="text-button" type="button" onClick={() => { setCart([]); setNotice(''); }} disabled={cart.length === 0}>Clear</button></div>
                <div className="order-reference"><span className="order-reference-icon" aria-hidden="true">＋</span><div><strong>{session?.displayName ?? 'Walk-in customer'}</strong><span>{session ? `${session.branchName} · Draft` : 'In-store order · Draft'}</span></div><span className="draft-pill">DRAFT</span></div>
                <div className="order-lines-heading"><span>ITEM</span><span>QTY</span><span className="align-right">TOTAL</span></div>
                <div className="order-lines">{cart.length === 0 ? <div className="empty-order"><span className="empty-order-icon" aria-hidden="true">▤</span><strong>Your order is empty</strong><p>Select items from the menu to get started.</p></div> : cart.map((line) => <div className="order-line" key={line.product.id}><div className="order-line-product"><strong>{line.product.name}</strong><span>{formatPhp(line.product.price)} each</span></div><div className="quantity-control"><button type="button" onClick={() => changeQuantity(line.product.id, -1)} aria-label={`Remove one ${line.product.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.product.id, 1)} aria-label={`Add one ${line.product.name}`}>+</button></div><strong className="line-total">{formatPhp(multiplyMoney(line.product.price, line.quantity))}</strong></div>)}</div>
                <div className="order-summary"><div><span>Items</span><span>{itemCount}</span></div><div><span>Subtotal</span><strong>{formatPhp(subtotal)}</strong></div><div><span>Tax and discounts</span><span className="not-configured">Not configured</span></div><div className="order-total"><span>Total</span><strong>{formatPhp(subtotal)}</strong></div>{connectionStatus === 'demo' && <p className="tax-disclaimer">Demo prices are for preview only. Use the authorized live menu for actual sales.</p>}</div>
                {notice && <div className="pos-notice" role="status">{notice}</div>}
                <button className="checkout-button" type="button" disabled={connectionStatus !== 'connected' || cart.length === 0} onClick={() => { setCashReceived(''); setCheckoutOpen(true); }}>Checkout · Cash <span aria-hidden="true">→</span></button>
                <p className="checkout-caption">{connectionStatus === 'connected' ? 'Cash sales are saved by the trusted server.' : 'Connect to the authorized POS API to accept a sale.'}</p>
                {lastSale && <button className="text-button receipt-action" type="button" onClick={() => printReceipt(lastSale)}>Print last receipt · {saleLabel(lastSale)}</button>}
              </aside>
            </div>
          </> : <>
            <section className="pos-page-heading"><div><p className="pos-eyebrow">CASH MANAGEMENT</p><h1>Transactions</h1><p className="pos-subtitle">Saved cash sales for your authorized branch.</p></div><button className="text-button" type="button" onClick={() => void loadSales()} disabled={salesLoading}>{salesLoading ? 'Refreshing…' : 'Refresh history'}</button></section>
            {salesError && <div className="pos-notice" role="alert">{salesError}</div>}
            <section className="transactions-panel"><div className="transactions-heading"><div><h2>Sales history</h2><p>{session?.branchName ?? 'Authorized branch'} · Most recent first</p></div><span className="catalog-count">{sales.length} records</span></div>
              {salesLoading ? <p className="transactions-empty">Loading saved transactions…</p> : sales.length === 0 ? <p className="transactions-empty">No saved cash sales found for this branch.</p> : <div className="transactions-table-wrap"><table className="transactions-table"><thead><tr><th>Receipt</th><th>Date</th><th>Items</th><th>Payment</th><th>Total</th><th>Receipt</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong>{saleLabel(sale)}</strong></td><td>{new Date(sale.created_at).toLocaleString()}</td><td>{sale.items.map((item) => `${item.item_name_snapshot} ×${item.quantity}`).join(', ')}</td><td><span className="paid-pill">PAID · CASH</span></td><td><strong>{formatPhp(moneyFromCentavos(sale.total_centavos))}</strong></td><td><button className="text-button" type="button" onClick={() => printReceipt(sale)}>Print</button></td></tr>)}</tbody></table></div>}
            </section>
          </>}
        </div>
      </main>
      {checkoutOpen && <div className="checkout-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submittingSale) setCheckoutOpen(false); }}><section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="checkout-dialog-heading"><div><p className="pos-eyebrow">PAYMENT METHOD · CASH</p><h2 id="checkout-title">Complete sale</h2></div><button type="button" className="dialog-close" onClick={() => setCheckoutOpen(false)} disabled={submittingSale} aria-label="Close checkout">×</button></div><div className="checkout-due"><span>Amount due</span><strong>{formatPhp(subtotal)}</strong></div><label className="cash-input-label" htmlFor="cash-received">Cash received (PHP)</label><div className="cash-input-wrap"><span>₱</span><input id="cash-received" inputMode="decimal" autoFocus value={cashReceived} onChange={(e) => setCashReceived(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="0.00" /></div><div className="cash-shortcuts"><button type="button" onClick={() => setCashReceived((dueCentavos / 100).toFixed(2))}>Exact amount</button>{[100, 500, 1000].filter((amount) => amount * 100 >= dueCentavos).slice(0, 3).map((amount) => <button key={amount} type="button" onClick={() => setCashReceived(String(amount))}>₱{amount}</button>)}</div><div className="change-row"><span>{changeCentavos >= 0 ? 'Change due' : 'Remaining balance'}</span><strong className={changeCentavos < 0 ? 'amount-short' : ''}>{formatPhp(moneyFromCentavos(Math.abs(changeCentavos)))}</strong></div>{notice && <div className="pos-notice" role="status">{notice}</div>}<button className="checkout-button" type="button" disabled={submittingSale || receivedCentavos < dueCentavos || dueCentavos <= 0} onClick={() => void completeCashSale()}>{submittingSale ? 'Saving sale…' : 'Confirm cash payment'} <span aria-hidden="true">→</span></button><p className="checkout-caption">The server revalidates menu prices and branch authorization before saving.</p></section></div>}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
