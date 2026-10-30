import { useMemo, useState } from 'react';
import { formatPhp, moneyFromCentavos, multiplyMoney, type Money } from '../domain/money';

type Category = 'All items' | 'Meals' | 'Drinks' | 'Sides';
type Product = { id: string; name: string; category: Exclude<Category, 'All items'>; price: Money; initials: string };
type CartLine = { product: Product; quantity: number };

const products: Product[] = [
  { id: 'meal-001', name: 'Classic Burger', category: 'Meals', price: moneyFromCentavos(18900), initials: 'CB' },
  { id: 'meal-002', name: 'Crispy Chicken', category: 'Meals', price: moneyFromCentavos(21900), initials: 'CC' },
  { id: 'meal-003', name: 'Beef Rice Bowl', category: 'Meals', price: moneyFromCentavos(16900), initials: 'BR' },
  { id: 'meal-004', name: 'Pasta Alfredo', category: 'Meals', price: moneyFromCentavos(19900), initials: 'PA' },
  { id: 'drink-001', name: 'Iced Tea', category: 'Drinks', price: moneyFromCentavos(4900), initials: 'IT' },
  { id: 'drink-002', name: 'Iced Coffee', category: 'Drinks', price: moneyFromCentavos(7900), initials: 'IC' },
  { id: 'side-001', name: 'French Fries', category: 'Sides', price: moneyFromCentavos(6900), initials: 'FF' },
  { id: 'side-002', name: 'Extra Rice', category: 'Sides', price: moneyFromCentavos(2500), initials: 'ER' },
];
const categories: Category[] = ['All items', 'Meals', 'Drinks', 'Sides'];

export function PosApp() {
  const [category, setCategory] = useState<Category>('All items');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState('');

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All items' || product.category === category;
    const matchesSearch = product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, search]);

  const itemCount = cart.reduce((total, line) => total + line.quantity, 0);
  const subtotal = cart.reduce((total, line) => total + multiplyMoney(line.product.price, line.quantity), 0) as Money;

  function addProduct(product: Product) {
    setNotice('');
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      return existing
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  }

  function startCheckout() {
    setNotice('Demo only — checkout is not enabled until the trusted transaction API, staff authorization, and persistence are implemented.');
  }

  return (
    <div className="pos-shell">
      <aside className="pos-sidebar" aria-label="Main navigation">
        <a className="pos-brand" href="#home" aria-label="Web2table POS home">
          <img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="" />
          <span>Web<span className="brand-two">2</span>table <small>POINT OF SALE</small></span>
        </a>
        <div className="pos-sidebar-label">WORKSPACE</div>
        <nav className="pos-nav">
          <a className="is-active" href="#register" aria-current="page"><span aria-hidden="true">▦</span> Register</a>
          <a href="#orders" onClick={(event) => { event.preventDefault(); setNotice('Order management will be added after the authorized online-order integration is implemented.'); }}><span aria-hidden="true">≡</span> Orders</a>
          <a href="#transactions" onClick={(event) => { event.preventDefault(); setNotice('Transaction history will be available after secure server-side transaction persistence is implemented.'); }}><span aria-hidden="true">◷</span> Transactions</a>
          <a href="#shifts" onClick={(event) => { event.preventDefault(); setNotice('Register shifts are planned; no cash drawer or shift records are persisted yet.'); }}><span aria-hidden="true">▤</span> Shifts</a>
        </nav>
        <div className="pos-sidebar-bottom">
          <div className="pos-environment"><span className="status-dot" /> Prototype environment</div>
          <p>Restaurant operations, connected.</p>
        </div>
      </aside>

      <main className="pos-main" id="register">
        <header className="pos-topbar">
          <div className="pos-breadcrumb">Workspace <span>/</span> <strong>Register</strong></div>
          <div className="pos-topbar-actions"><span className="demo-badge">DEMO DATA</span><div className="pos-avatar" aria-label="Demo cashier">DC</div></div>
        </header>

        <div className="pos-content">
          <section className="pos-page-heading">
            <div><p className="pos-eyebrow">POINT OF SALE</p><h1>Register</h1><p className="pos-subtitle">Build an order and review it before checkout.</p></div>
            <div className="register-status"><span className="status-dot" /> Register not connected</div>
          </section>

          <div className="pos-workspace">
            <section className="catalog-panel" aria-label="Product catalog">
              <div className="catalog-heading"><div><h2>Menu</h2><p>Select an item to add it to the order.</p></div><span className="catalog-count">{visibleProducts.length} items</span></div>
              <label className="product-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu items" aria-label="Search menu items" /><kbd>⌘ K</kbd></label>
              <div className="category-tabs" role="group" aria-label="Filter by category">
                {categories.map((item) => <button key={item} type="button" className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}
              </div>
              <div className="product-grid">
                {visibleProducts.map((product) => <button className="product-card" type="button" key={product.id} onClick={() => addProduct(product)}>
                  <span className={`product-art product-art-${product.category.toLowerCase()}`} aria-hidden="true">{product.initials}</span>
                  <span className="product-card-copy"><span className="product-name">{product.name}</span><span className="product-category">{product.category}</span><strong>{formatPhp(product.price)}</strong></span>
                  <span className="add-product" aria-hidden="true">+</span>
                </button>)}
                {visibleProducts.length === 0 && <div className="catalog-empty">No menu items match your search.</div>}
              </div>
              <p className="sample-data-note">Sample menu only · Not connected to your restaurant catalog</p>
            </section>

            <aside className="order-panel" aria-label="Current order">
              <div className="order-panel-heading"><div><p className="pos-eyebrow">CURRENT SALE</p><h2>New order</h2></div><button className="text-button" type="button" onClick={() => { setCart([]); setNotice(''); }} disabled={cart.length === 0}>Clear</button></div>
              <div className="order-reference"><span className="order-reference-icon" aria-hidden="true">＋</span><div><strong>Walk-in customer</strong><span>In-store order · Draft</span></div><span className="draft-pill">DRAFT</span></div>
              <div className="order-lines-heading"><span>ITEM</span><span>QTY</span><span className="align-right">TOTAL</span></div>
              <div className="order-lines">
                {cart.length === 0 ? <div className="empty-order"><span className="empty-order-icon" aria-hidden="true">▤</span><strong>Your order is empty</strong><p>Select items from the menu to get started.</p></div> : cart.map((line) => <div className="order-line" key={line.product.id}><div className="order-line-product"><strong>{line.product.name}</strong><span>{formatPhp(line.product.price)} each</span></div><div className="quantity-control"><button type="button" onClick={() => changeQuantity(line.product.id, -1)} aria-label={`Remove one ${line.product.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.product.id, 1)} aria-label={`Add one ${line.product.name}`}>+</button></div><strong className="line-total">{formatPhp(multiplyMoney(line.product.price, line.quantity))}</strong></div>)}
              </div>
              <div className="order-summary"><div><span>Items</span><span>{itemCount}</span></div><div><span>Subtotal</span><strong>{formatPhp(subtotal)}</strong></div><div><span>Tax and discounts</span><span className="not-configured">Not configured</span></div><div className="order-total"><span>Total</span><strong>{formatPhp(subtotal)}</strong></div><p className="tax-disclaimer">Tax rules and discounts are not configured in this prototype. Totals are not valid for payment or invoicing.</p></div>
              {notice && <div className="pos-notice" role="status">{notice}</div>}
              <button className="checkout-button" type="button" onClick={startCheckout} disabled={cart.length === 0}>Continue to payment <span aria-hidden="true">→</span></button>
              <p className="checkout-caption">No payment will be processed in this demo.</p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
