import { describe, expect, it } from 'vitest';
import { calculateFiscalTaxLine } from './fiscalTax';

describe('calculateFiscalTaxLine', () => {
  it('calculates tax-exclusive prices using configured basis points', () => {
    expect(calculateFiscalTaxLine({
      quantity: 2, unitPriceCentavos: 10_000, taxRateBasisPoints: 1_200, priceIncludesTax: false,
    })).toEqual({
      grossBeforeDiscountCentavos: 20_000, discountCentavos: 0,
      taxableBaseCentavos: 20_000, taxCentavos: 2_400, totalCentavos: 22_400,
    });
  });

  it('extracts tax from tax-inclusive price without changing the payable total', () => {
    expect(calculateFiscalTaxLine({
      quantity: 1, unitPriceCentavos: 11_200, taxRateBasisPoints: 1_200, priceIncludesTax: true,
    })).toEqual({
      grossBeforeDiscountCentavos: 11_200, discountCentavos: 0,
      taxableBaseCentavos: 10_000, taxCentavos: 1_200, totalCentavos: 11_200,
    });
  });

  it('applies an explicit line discount before tax calculation', () => {
    expect(calculateFiscalTaxLine({
      quantity: 2, unitPriceCentavos: 5_000, discountCentavos: 1_000,
      taxRateBasisPoints: 1_200, priceIncludesTax: false,
    })).toEqual({
      grossBeforeDiscountCentavos: 10_000, discountCentavos: 1_000,
      taxableBaseCentavos: 9_000, taxCentavos: 1_080, totalCentavos: 10_080,
    });
  });

  it('applies a discount before extracting tax from a tax-inclusive price', () => {
    expect(calculateFiscalTaxLine({
      quantity: 1, unitPriceCentavos: 11_200, discountCentavos: 1_200,
      taxRateBasisPoints: 1_200, priceIncludesTax: true,
    })).toEqual({
      grossBeforeDiscountCentavos: 11_200, discountCentavos: 1_200,
      taxableBaseCentavos: 8_929, taxCentavos: 1_071, totalCentavos: 10_000,
    });
  });

  it('rejects fractional rates and tax calculations that exceed safe integer precision', () => {
    expect(() => calculateFiscalTaxLine({
      quantity: 1, unitPriceCentavos: 100, taxRateBasisPoints: 12.5, priceIncludesTax: false,
    })).toThrow();
    expect(() => calculateFiscalTaxLine({
      quantity: 1, unitPriceCentavos: Number.MAX_SAFE_INTEGER, taxRateBasisPoints: 1, priceIncludesTax: true,
    })).toThrow();
  });

  it('supports zero-rated/no-tax lines only when the caller supplies a zero rate', () => {
    expect(calculateFiscalTaxLine({
      quantity: 1, unitPriceCentavos: 1_999, taxRateBasisPoints: 0, priceIncludesTax: false,
    })).toEqual({
      grossBeforeDiscountCentavos: 1_999, discountCentavos: 0,
      taxableBaseCentavos: 1_999, taxCentavos: 0, totalCentavos: 1_999,
    });
  });

  it('rejects invalid amounts, discounts, rates, and quantities', () => {
    expect(() => calculateFiscalTaxLine({ quantity: 0, unitPriceCentavos: 1, taxRateBasisPoints: 0, priceIncludesTax: false })).toThrow();
    expect(() => calculateFiscalTaxLine({ quantity: 1, unitPriceCentavos: 1, discountCentavos: 2, taxRateBasisPoints: 0, priceIncludesTax: false })).toThrow();
    expect(() => calculateFiscalTaxLine({ quantity: 1, unitPriceCentavos: Number.MAX_SAFE_INTEGER, taxRateBasisPoints: 10_000, priceIncludesTax: false })).toThrow();
  });
});
