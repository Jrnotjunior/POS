export type PosFiscalTaxRegime = 'vat_registered' | 'non_vat' | 'other_requires_review';
export type PosFiscalStatus = 'draft' | 'pending_review' | 'authorized' | 'suspended';

export type PosFiscalProfileDraft = Readonly<{
  taxpayerRegisteredName: string;
  tradeName?: string | null;
  taxpayerTin: string;
  tinBranchCode: string;
  registeredAddress: string;
  taxRegime: PosFiscalTaxRegime;
  invoiceDocumentType: 'invoice';
  invoiceSeriesPrefix: string;
  softwareName: string;
  softwareVersion: string;
  machineOrTerminalIdentifier?: string | null;
}>;

export type FiscalProfileValidation = Readonly<{
  valid: boolean;
  errors: readonly string[];
}>;

/**
 * Client-side shape validation only. The server/database must independently
 * validate, authorize, and audit configuration. A valid draft is not evidence
 * of BIR authorization and cannot enable fiscal issuance.
 */
export function validateFiscalProfileDraft(value: PosFiscalProfileDraft): FiscalProfileValidation {
  const errors: string[] = [];
  const required = (field: string, raw: string, min: number, max: number) => {
    const normalized = raw.trim();
    if (normalized.length < min || normalized.length > max) errors.push(field);
  };

  required('taxpayerRegisteredName', value.taxpayerRegisteredName, 2, 200);
  required('registeredAddress', value.registeredAddress, 5, 500);
  required('softwareName', value.softwareName, 2, 160);
  required('softwareVersion', value.softwareVersion, 1, 80);

  if (value.tradeName != null && (value.tradeName.trim().length < 1 || value.tradeName.trim().length > 200)) errors.push('tradeName');
  if (!/^[0-9]{9,12}$/.test(value.taxpayerTin)) errors.push('taxpayerTin');
  if (!/^[0-9]{3}$/.test(value.tinBranchCode)) errors.push('tinBranchCode');
  if (!['vat_registered', 'non_vat', 'other_requires_review'].includes(value.taxRegime)) errors.push('taxRegime');
  if (value.invoiceDocumentType !== 'invoice') errors.push('invoiceDocumentType');
  if (!/^[A-Z0-9-]{1,20}$/.test(value.invoiceSeriesPrefix)) errors.push('invoiceSeriesPrefix');
  if (value.machineOrTerminalIdentifier != null && value.machineOrTerminalIdentifier.trim().length > 160) errors.push('machineOrTerminalIdentifier');

  return { valid: errors.length === 0, errors };
}
