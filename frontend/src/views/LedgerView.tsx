import React, {FormEvent, useCallback, useEffect, useState} from 'react';
import {adminApi} from '../services/api';

const KINDS = ['PURCHASE', 'OPERATIONAL', 'ADMINISTRATIVE'] as const;
type Kind = typeof KINDS[number];

const LABELS: Record<Kind, string> = {
  PURCHASE: 'Purchases',
  OPERATIONAL: 'Operational',
  ADMINISTRATIVE: 'Administrative',
};

const money = (v: string | number) =>
  Number(v || 0).toLocaleString('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 2});

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const LedgerView: React.FC = () => {
  const [period, setPeriod] = useState(thisMonth);
  const [filter, setFilter] = useState<'ALL' | Kind>('ALL');
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    kind: 'PURCHASE' as Kind, category: 'Groceries', description: '',
    amount: '', vendor: '', reference: '',
  });

  const [year, month] = period.split('-').map(Number);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sum, list] = await Promise.all([
        adminApi.getLedgerPeriodSummary(month, year),
        adminApi.getLedger(),
      ]);
      setSummary(sum);
      // getLedger is not month-scoped, but the summary above is. Filtering
      // here keeps the cards and the list describing the same period --
      // otherwise the totals and the rows beneath them disagree.
      const rows = Array.isArray(list?.entries) ? list.entries : [];
      setEntries(rows.filter((e: any) => (e.entry_date || '').startsWith(period)));
    } catch (e: any) {
      setSummary(null); setEntries([]);
      setError(e?.message || 'Could not load the ledger.');
    } finally { setLoading(false); }
  }, [month, year, period]);
  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<any>, success: string) => {
    setSaving(true); setError(''); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (e: any) { setError(e?.message || 'That did not work.'); }
    finally { setSaving(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => adminApi.createLedger({
      ...form, amount: Number(form.amount),
      vendor: form.vendor || null, reference: form.reference || null,
    }), 'Entry saved.').then(() => setForm({...form, description: '', amount: '', vendor: '', reference: ''}));
  };

  const shown = filter === 'ALL' ? entries : entries.filter(e => e.kind === filter);
  const total = shown.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" style={{color: 'var(--text-dark)'}}>
          Month{' '}
          <input className="stitch-input inline-block w-auto" type="month"
                 value={period} onChange={e => setPeriod(e.target.value)} />
        </label>
        <button className="btn-secondary" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm" style={{color: 'var(--red)'}}>{error}</p>}
      {message && <p className="text-sm" style={{color: '#006c49'}}>{message}</p>}

      <div className="grid sm:grid-cols-3 gap-3">
        {KINDS.map(kind => {
          const value = kind === 'PURCHASE' ? summary?.purchases_value
            : kind === 'OPERATIONAL' ? summary?.operational_expenses
            : summary?.administrative_expenses;
          return (
            <article key={kind} className="stitch-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{color: 'var(--text-muted)'}}>
                {LABELS[kind]}
              </p>
              <p className="mt-1 font-display text-2xl font-bold" style={{color: 'var(--text-dark)'}}>
                {summary ? money(value) : '—'}
              </p>
            </article>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        <section className="stitch-card p-4 space-y-3">
          <h2 className="font-bold" style={{color: 'var(--text-dark)'}}>New entry</h2>
          <form className="space-y-3" onSubmit={submit}>
            <label className="block text-sm">Date
              <input className="stitch-input" type="date" required value={form.entry_date}
                     onChange={e => setForm({...form, entry_date: e.target.value})} />
            </label>
            <label className="block text-sm">Type
              <select className="stitch-input" value={form.kind}
                      onChange={e => setForm({...form, kind: e.target.value as Kind})}>
                {KINDS.map(k => <option key={k} value={k}>{LABELS[k]}</option>)}
              </select>
            </label>
            <label className="block text-sm">Category
              <input className="stitch-input" required maxLength={80} value={form.category}
                     placeholder="Grocery, Gas, Fish, Meat, Milk…"
                     onChange={e => setForm({...form, category: e.target.value})} />
            </label>
            <label className="block text-sm">Description
              <textarea className="stitch-input" required maxLength={500} rows={2} value={form.description}
                        onChange={e => setForm({...form, description: e.target.value})} />
            </label>
            <label className="block text-sm">Amount (₹)
              <input className="stitch-input" type="number" min="0.01" step="0.01" required value={form.amount}
                     onChange={e => setForm({...form, amount: e.target.value})} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input className="stitch-input" placeholder="Vendor" value={form.vendor}
                     onChange={e => setForm({...form, vendor: e.target.value})} />
              <input className="stitch-input" placeholder="Invoice no." value={form.reference}
                     onChange={e => setForm({...form, reference: e.target.value})} />
            </div>
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </form>
        </section>

        <section className="stitch-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', ...KINDS] as const).map(k => (
              <button key={k} className={filter === k ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                      onClick={() => setFilter(k)}>
                {k === 'ALL' ? 'All' : LABELS[k]}
              </button>
            ))}
            <span className="ml-auto text-sm font-bold" style={{color: 'var(--text-dark)'}}>
              {shown.length} {shown.length === 1 ? 'entry' : 'entries'} · {money(total)}
            </span>
          </div>

          <label className="block text-sm">Reason, required before voiding
            <input className="stitch-input" minLength={5} maxLength={500} value={voidReason}
                   placeholder="Explain the correction"
                   onChange={e => setVoidReason(e.target.value)} />
          </label>

          {shown.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{color: 'var(--text-muted)'}}>
              {loading ? 'Loading…' : 'No entries for this month.'}
            </p>
          ) : (
            <ul className="divide-y" style={{borderColor: 'var(--line)'}}>
              {shown.map(entry => (
                <li key={entry.id} className="py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm" style={{color: 'var(--text-dark)'}}>
                      {entry.category} · {money(entry.amount)}
                    </p>
                    <p className="text-xs" style={{color: 'var(--text-body)'}}>{entry.description}</p>
                    <p className="text-[11px] mt-0.5" style={{color: 'var(--text-muted)'}}>
                      {entry.entry_date} · {LABELS[entry.kind as Kind] || entry.kind}
                      {entry.vendor ? ` · ${entry.vendor}` : ''}
                      {entry.reference ? ` · ${entry.reference}` : ''}
                    </p>
                  </div>
                  <button className="text-xs font-bold disabled:opacity-40" style={{color: 'var(--red)'}}
                          disabled={saving || voidReason.trim().length < 5}
                          onClick={() => run(async () => {
                            await adminApi.voidLedger(entry.id, voidReason);
                            setVoidReason('');
                          }, 'Entry voided, with the reason kept in the audit history.')}>
                    Void
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
