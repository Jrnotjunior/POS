/** Money is represented as integer centavos to avoid floating-point arithmetic. */
export type Money = number & { readonly __brand: 'MoneyCentavos' };

export function moneyFromCentavos(value: number): Money {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Money must be a non-negative safe integer in centavos.');
  }
  return value as Money;
}

export function multiplyMoney(unitPrice: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('Quantity must be a non-negative safe integer.');
  }
  const total = unitPrice * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('Calculated total exceeds the safe integer range.');
  }
  return moneyFromCentavos(total);
}

export function formatPhp(value: Money): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
