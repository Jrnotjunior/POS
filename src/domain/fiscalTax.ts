/**
 * Deterministic fiscal arithmetic using integer centavos.
 *
 * Rates and whether prices include tax must come from a validated, effective-dated
 * server-side tax policy. This module intentionally contains no default statutory
 * rate and is not itself authorization to issue a tax invoice.
 */
export type FiscalTaxInput = Readonly<{
  quantity: number;
  unitPriceCentavos: number;
  discountCentavos?: number;
  taxRateBasisPoints: number;
  priceIncludesTax: boolean;
}>;

export type FiscalTaxResult = Readonly<{
  grossBeforeDiscountCentavos: number;
  discountCentavos: number;
  taxableBaseCentavos: number;
  taxCentavos: number;
  totalCentavos: number;
}>;

function requireSafeNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

function roundedRatio(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('Tax calculation exceeds the safe integer range.');
  }
  const roundedNumerator = numerator + Math.floor(denominator / 2);
  if (!Number.isSafeInteger(roundedNumerator)) throw new RangeError('Tax calculation exceeds the safe integer range.');
  const result = Math.floor(roundedNumerator / denominator);
  if (!Number.isSafeInteger(result)) throw new RangeError('Tax calculation exceeds the safe integer range.');
  return result;
}

/** Calculates one already-classified line. The caller must determine legal taxability. */
export function calculateFiscalTaxLine(input: FiscalTaxInput): FiscalTaxResult {
  requireSafeNonNegativeInteger(input.quantity, 'quantity');
  requireSafeNonNegativeInteger(input.unitPriceCentavos, 'unitPriceCentavos');
  const discount = input.discountCentavos ?? 0;
  requireSafeNonNegativeInteger(discount, 'discountCentavos');
  requireSafeNonNegativeInteger(input.taxRateBasisPoints, 'taxRateBasisPoints');
  if (input.quantity < 1) throw new RangeError('quantity must be at least one.');
  if (input.taxRateBasisPoints > 100_000) throw new RangeError('taxRateBasisPoints exceeds the supported range.');

  const gross = input.unitPriceCentavos * input.quantity;
  if (!Number.isSafeInteger(gross)) throw new RangeError('Line amount exceeds the safe integer range.');
  if (discount > gross) throw new RangeError('Discount cannot exceed the line amount.');
  const afterDiscount = gross - discount;
  const rate = input.taxRateBasisPoints;

  if (rate === 0) {
    return {
      grossBeforeDiscountCentavos: gross,
      discountCentavos: discount,
      taxableBaseCentavos: afterDiscount,
      taxCentavos: 0,
      totalCentavos: afterDiscount,
    };
  }

  if (input.priceIncludesTax) {
    const tax = roundedRatio(afterDiscount * rate, 10_000 + rate);
    return {
      grossBeforeDiscountCentavos: gross,
      discountCentavos: discount,
      taxableBaseCentavos: afterDiscount - tax,
      taxCentavos: tax,
      totalCentavos: afterDiscount,
    };
  }

  const tax = roundedRatio(afterDiscount * rate, 10_000);
  const total = afterDiscount + tax;
  if (!Number.isSafeInteger(total)) throw new RangeError('Line total exceeds the safe integer range.');
  return {
    grossBeforeDiscountCentavos: gross,
    discountCentavos: discount,
    taxableBaseCentavos: afterDiscount,
    taxCentavos: tax,
    totalCentavos: total,
  };
}
