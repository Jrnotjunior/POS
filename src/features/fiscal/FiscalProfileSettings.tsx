import { useEffect, useState, type FormEvent } from 'react';
import { validateFiscalProfileDraft } from '../../domain/fiscalProfile';
import type { PosFiscalProfile, PosFiscalProfileDraft, PosSessionContext } from '../../integrations/web2table/posApiContract';
import type { createPosApiClient } from '../../integrations/web2table/posApiClient';
import '../../styles/pos-fiscal-profile.css';

type Props = Readonly<{
  apiClient: ReturnType<typeof createPosApiClient>;
  session: PosSessionContext;
}>;

function blankDraft(branchId: string): PosFiscalProfileDraft {
  return {
    branchId, taxpayerRegisteredName: '', tradeName: '', taxpayerTin: '', tinBranchCode: '000',
    registeredAddress: '', taxRegime: 'other_requires_review', invoiceSeriesPrefix: '',
    softwareName: 'Web2table POS', softwareVersion: '0.1.0', machineOrTerminalIdentifier: '',
  };
}

function fromProfile(profile: PosFiscalProfile): PosFiscalProfileDraft {
  return {
    branchId: profile.branch_id,
    taxpayerRegisteredName: profile.taxpayer_registered_name,
    tradeName: profile.trade_name,
    taxpayerTin: profile.taxpayer_tin,
    tinBranchCode: profile.tin_branch_code,
    registeredAddress: profile.registered_address,
    taxRegime: profile.tax_regime,
    invoiceSeriesPrefix: profile.invoice_series_prefix,
    softwareName: profile.software_name,
    softwareVersion: profile.software_version,
    machineOrTerminalIdentifier: profile.machine_or_terminal_identifier,
  };
}

export function FiscalProfileSettings({ apiClient, session }: Props) {
  const [profile, setProfile] = useState<PosFiscalProfile | null>(null);
  const [draft, setDraft] = useState<PosFiscalProfileDraft>(() => blankDraft(session.branchId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    void apiClient.getFiscalProfile(session.branchId).then((result) => {
      if (!active) return;
      setProfile(result);
      setDraft(result ? fromProfile(result) : blankDraft(session.branchId));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load taxpayer configuration.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiClient, session.branchId]);

  function update<K extends keyof PosFiscalProfileDraft>(key: K, value: PosFiscalProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateFiscalProfileDraft(draft);
    if (!validation.valid) {
      setError(`Check these fields: ${validation.errors.join(', ')}.`);
      setNotice('');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await apiClient.saveFiscalProfile(draft);
      setProfile(saved);
      setDraft(fromProfile(saved));
      setNotice('Taxpayer configuration saved as a draft. It does not authorize invoice issuance.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save taxpayer configuration.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="transactions-panel fiscal-profile-panel" aria-labelledby="fiscal-profile-title">
    <div className="transactions-heading">
      <div><h2 id="fiscal-profile-title">Taxpayer configuration</h2><p>{session.branchName}</p></div>
      <span className={profile?.fiscal_status === 'authorized' ? 'paid-pill' : 'catalog-count'}>{profile?.fiscal_status?.replaceAll('_', ' ').toUpperCase() ?? 'NOT SET UP'}</span>
    </div>
    <div className="fiscal-profile-notice" role="note">
      <strong>Fiscal issuance is disabled.</strong> Saving these details creates a draft only. It does not confirm BIR authorization or make the receipt/X/Z previews fiscal documents.
    </div>
    {error && <div className="pos-notice" role="alert">{error}</div>}
    {notice && <div className="pos-notice" role="status">{notice}</div>}
    {loading ? <p className="transactions-empty">Loading taxpayer configuration…</p> : <form className="fiscal-profile-form" onSubmit={(event) => void save(event)}>
      <div className="fiscal-profile-grid">
        <label>Registered taxpayer name<input required maxLength={200} value={draft.taxpayerRegisteredName} onChange={(event) => update('taxpayerRegisteredName', event.target.value)} autoComplete="organization" /></label>
        <label>Trade name (optional)<input maxLength={200} value={draft.tradeName ?? ''} onChange={(event) => update('tradeName', event.target.value)} /></label>
        <label>TIN (digits only)<input required inputMode="numeric" maxLength={12} value={draft.taxpayerTin} onChange={(event) => update('taxpayerTin', event.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
        <label>TIN branch code<input required inputMode="numeric" maxLength={3} value={draft.tinBranchCode} onChange={(event) => update('tinBranchCode', event.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
        <label className="fiscal-profile-wide">Registered business address<textarea required maxLength={500} rows={3} value={draft.registeredAddress} onChange={(event) => update('registeredAddress', event.target.value)} /></label>
        <label>Tax regime<select value={draft.taxRegime} onChange={(event) => update('taxRegime', event.target.value as PosFiscalProfileDraft['taxRegime'])}>
          <option value="other_requires_review">Needs tax review</option><option value="vat_registered">VAT registered</option><option value="non_vat">Non-VAT</option>
        </select></label>
        <label>Invoice series prefix<input required maxLength={20} value={draft.invoiceSeriesPrefix} onChange={(event) => update('invoiceSeriesPrefix', event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))} /></label>
        <label>Software name<input required maxLength={160} value={draft.softwareName} onChange={(event) => update('softwareName', event.target.value)} /></label>
        <label>Software version<input required maxLength={80} value={draft.softwareVersion} onChange={(event) => update('softwareVersion', event.target.value)} /></label>
        <label className="fiscal-profile-wide">Machine / terminal identifier (if applicable)<input maxLength={160} value={draft.machineOrTerminalIdentifier ?? ''} onChange={(event) => update('machineOrTerminalIdentifier', event.target.value)} /></label>
      </div>
      <div className="fiscal-profile-actions"><button className="checkout-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save taxpayer configuration'} <span aria-hidden="true">→</span></button></div>
    </form>}
  </section>;
}
