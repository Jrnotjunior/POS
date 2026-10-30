import { describe, expect, it } from 'vitest';
import { formatPhp, moneyFromCentavos, multiplyMoney } from './money';

describe('money primitives', () => {
  it('calculates totals using integer centavos', () => {
    expect(multiplyMoney(moneyFromCentavos(12950), 3)).toBe(38850);
  });

  it('rejects invalid money and quantities', () => {
    expect(() => moneyFromCentavos(-1)).toThrow(RangeError);
    expect(() => moneyFromCentavos(1.25)).toThrow(RangeError);
    expect(() => multiplyMoney(moneyFromCentavos(100), -2)).toThrow(RangeError);
  });

  it('formats Philippine pesos for display', () => {
    expect(formatPhp(moneyFromCentavos(12550))).toContain('125.50');
  });
});
