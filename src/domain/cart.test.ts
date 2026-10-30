import { describe, expect, it } from 'vitest';
import { addToCart, calculateCartSubtotal, changeCartQuantity, countCartItems, type CartProduct } from './cart';
import { moneyFromCentavos } from './money';

const burger: CartProduct = { id: 'burger', name: 'Burger', price: moneyFromCentavos(18900) };
const tea: CartProduct = { id: 'tea', name: 'Tea', price: moneyFromCentavos(4900) };

describe('POS cart domain', () => {
  it('adds a new product with quantity one', () => {
    expect(addToCart([], burger)).toEqual([{ product: burger, quantity: 1 }]);
  });

  it('increments an existing product instead of duplicating its line', () => {
    const cart = addToCart(addToCart([], burger), burger);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('changes quantity and removes a line at zero', () => {
    const cart = addToCart([], burger);
    expect(changeCartQuantity(cart, 'burger', 1)[0].quantity).toBe(2);
    expect(changeCartQuantity(cart, 'burger', -1)).toEqual([]);
  });

  it('does not change unrelated cart lines', () => {
    const cart = addToCart(addToCart([], burger), tea);
    expect(changeCartQuantity(cart, 'burger', 1)[1]).toEqual({ product: tea, quantity: 1 });
  });

  it('counts items and calculates exact centavo subtotal', () => {
    const cart = addToCart(addToCart(addToCart([], burger), burger), tea);
    expect(countCartItems(cart)).toBe(3);
    expect(calculateCartSubtotal(cart)).toBe(42700);
  });

  it('rejects invalid quantity deltas', () => {
    expect(() => changeCartQuantity([], 'burger', 0)).toThrow(RangeError);
    expect(() => changeCartQuantity([], 'burger', 1.5)).toThrow(RangeError);
  });
});
