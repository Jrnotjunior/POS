import { multiplyMoney, moneyFromCentavos, type Money } from './money';

export type CartProduct = {
  id: string;
  name: string;
  price: Money;
};

export type CartLine = {
  product: CartProduct;
  quantity: number;
};

export function addToCart(cart: CartLine[], product: CartProduct): CartLine[] {
  const existing = cart.find((line) => line.product.id === product.id);
  if (!existing) return [...cart, { product, quantity: 1 }];
  return cart.map((line) => line.product.id === product.id
    ? { ...line, quantity: line.quantity + 1 }
    : line);
}

export function changeCartQuantity(cart: CartLine[], productId: string, delta: number): CartLine[] {
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new RangeError('Quantity change must be a non-zero safe integer.');
  }

  return cart.flatMap((line) => {
    if (line.product.id !== productId) return [line];
    const quantity = line.quantity + delta;
    if (!Number.isSafeInteger(quantity)) {
      throw new RangeError('Quantity must be a safe integer.');
    }
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });
}

export function countCartItems(cart: CartLine[]): number {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

export function calculateCartSubtotal(cart: CartLine[]): Money {
  const total = cart.reduce((sum, line) => sum + multiplyMoney(line.product.price, line.quantity), 0);
  return moneyFromCentavos(total);
}
