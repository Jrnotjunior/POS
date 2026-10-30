import { describe, expect, it } from 'vitest';
import { validateFiscalProfileDraft, type PosFiscalProfileDraft } from './fiscalProfile';

const validDraft: PosFiscalProfileDraft = {
  taxpayerRegisteredName: 'Example Food Services Inc.',
  tradeName: 'Example Kitchen',
  taxpayerTin: '123456789',
  tinBranchCode: '000',
  registeredAddress: '123 Example Street, Quezon City',
  taxRegime: 'vat_registered',
  invoiceDocumentType: 'invoice',
  invoiceSeriesPrefix: 'MAIN-',
  softwareName: 'Web2table POS',
  softwareVersion: '0.1.0',
  machineOrTerminalIdentifier: null,
};

describe('fiscal profile draft validation', () => {
  it('accepts a structurally valid draft without asserting authorization', () => {
    expect(validateFiscalProfileDraft(validDraft)).toEqual({ valid: true, errors: [] });
  });

  it('rejects malformed taxpayer identifiers, branch codes, and series prefixes', () => {
    const result = validateFiscalProfileDraft({
      ...validDraft,
      taxpayerTin: '123-456',
      tinBranchCode: '00A',
      invoiceSeriesPrefix: 'bad prefix!',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['taxpayerTin', 'tinBranchCode', 'invoiceSeriesPrefix']));
  });

  it('requires taxpayer and software identification fields', () => {
    const result = validateFiscalProfileDraft({
      ...validDraft,
      taxpayerRegisteredName: ' ',
      registeredAddress: '',
      softwareName: ' ',
      softwareVersion: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['taxpayerRegisteredName', 'registeredAddress', 'softwareName', 'softwareVersion']));
  });
});
