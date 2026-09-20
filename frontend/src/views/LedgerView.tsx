import React, {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {adminApi} from '../services/api';
import { Modal } from '../components/Modal';
import {money} from '../utils/format';

/**
 * OPERATIONAL is still a valid kind on the server and older entries keep it --
 * it is why LABELS below still names it -- but nothing new is filed under it.
 * Gas and electricity are purchases as far as the mess is concerned, and two
 * tabs that behaved identically only made staff guess which one to use. The
 * monthly total is unaffected either way: Billing adds all three kinds.
 */
const KINDS = ['PURCHASE', 'OPERATIONAL', 'ADMINISTRATIVE'] as const;
type Kind = typeof KINDS[number];

const LABELS: Record<Kind, string> = {
  PURCHASE: 'Purchases',
  OPERATIONAL: 'Operational',
  ADMINISTRATIVE: 'Administrative',
};

const TABS: ReadonlyArray<{id: Kind; label: string; icon: string}> = [
  {id: 'PURCHASE',       label: 'Purchases',      icon: 'shopping_cart'},
  {id: 'ADMINISTRATIVE', label: 'Administrative', icon: 'work'},
];

/**
 * The starting list. Gas, electricity and the rest live under Purchases now
 * that the tabs are merged. The dropdown also offers every category already
 * used in the ledger, so "adding" one is simply using it once -- there is no
 * separate catalogue to maintain and nothing to keep in sync.
 */
const SUGGESTIONS: Record<Kind, string[]> = {
  PURCHASE: [
    'Grocery', 'Vegetables', 'Fruits', 'Fish', 'Meat', 'Chicken', 'Egg', 'Milk',
    'Bread', 'Rice', 'Oil', 'Spices', 'Tea & Coffee', 'Snacks',
    'Gas', 'Electricity', 'Water', 'Cleaning supplies', 'Repairs', 'Equipment', 'Transport',
  ],
  OPERATIONAL: ['Gas', 'Electricity', 'Water', 'Repairs', 'Cleaning supplies'],
  ADMINISTRATIVE: [
    'Staff wages', 'Cook wages', 'Committee allowance', 'Stationery',
    'Office', 'Licences', 'Bank charges', 'Miscellaneous',
  ],
};

/** Category pill colours, matching the ledger's long-standing palette. */
const CATEGORY_TONE: Array<[RegExp, string]> = [
  [/grocer|vegetab|fruit|rice|bread|spice|oil/i, '#2563eb'],
  [/gas|electric|fuel|water|repair|equip|transport|clean/i, '#ea580c'],
  [/fish/i, '#0284c7'],
  [/meat|chicken/i, '#dc2626'],
  [/milk|egg|tea|coffee|snack/i, '#16a34a'],
  [/wage|allowance|station|office|licen|bank/i, '#7c3aed'],
];
const toneFor = (category: string) =>
  (CATEGORY_TONE.find(([re]) => re.test(category || '')) || [null, '#7c3aed'])[1] as string;

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const LedgerView: React.FC = () => {
  const [period, setPeriod] = useState(thisMonth);
  const [tab, setTab] = useState<Kind>('PURCHASE');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [voiding, setVoiding] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    category: 'Grocery', description: '',
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
    try { await action(); setMessage(success); await load(); return true; }
    catch (e: any) { setError(e?.message || 'That did not work.'); return false; }
    finally { setSaving(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => adminApi.createLedger({
      entry_date: form.entry_date,
      kind: tab,
      category: form.category.trim(),
      description: form.description.trim(),
      amount: Number(form.amount),
      vendor: form.vendor.trim() || null,
      reference: form.reference.trim() || null,
    }), `${LABELS[tab]} entry saved.`);
    if (ok) setForm({...form, description: '', amount: '', vendor: '', reference: ''});
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter(e => e.kind === tab)
      .filter(e => !q
        || (e.description || '').toLowerCase().includes(q)
        || (e.category || '').toLowerCase().includes(q)
        || (e.vendor || '').toLowerCase().includes(q)
        || (e.reference || '').toLowerCase().includes(q));
  }, [entries, tab, search]);

  /**
   * What the dropdown offers: the starting list for this kind, plus every
   * category already used in the ledger. A category "added" here is simply one
   * that has been used once -- it reappears on its own next month, with no
   * catalogue to maintain and nothing that can fall out of sync with the data.
   */
  const categoryOptions = useMemo(() => {
    const used = entries.filter(e => e.kind === tab).map(e => String(e.category || '').trim());
    const seen = new Set<string>();
    const all = [...SUGGESTIONS[tab], ...used, form.category].filter(Boolean);
    return all.filter(c => {
      const key = c.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.localeCompare(b));
  }, [entries, tab, form.category]);

  const commitNewCategory = () => {
    const name = newCategory.trim();
    if (name.length < 2) { setError('A category name needs at least two characters.'); return; }
    // Title-case the first letter so "fish" and "Fish" do not become two
    // entries in a dropdown built from what has been used.
    const formatted = name.charAt(0).toUpperCase() + name.slice(1);
    setForm({...form, category: formatted});
    setAddingCategory(false);
    setNewCategory('');
    setError('');
  };

  const total = shown.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const average = shown.length ? Math.round(total / shown.length) : 0;

  const summaryValue = (kind: Kind) =>
    kind === 'PURCHASE' ? summary?.purchases_value
    : kind === 'OPERATIONAL' ? summary?.operational_expenses
    : summary?.administrative_expenses;

  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('en-IN', {month: 'long', year: 'numeric'});

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Page header — the month everything on this screen is scoped to */}
        <div className="flex items-center justify-between gap-3 pb-3" style={{borderBottom: '1px solid var(--card-border)'}}>
          <label className="text-[12px] sm:text-sm font-semibold flex items-center gap-1.5 min-w-0" style={{color: 'var(--text-muted)'}}>
            <span className="material-symbols-outlined shrink-0" style={{fontSize: 16}}>calendar_today</span>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              aria-label="Ledger month"
              className="px-2 py-1 bg-[#FDF7EA] border border-[#E3CB9B] rounded-lg text-xs font-bold text-[#5C3D1E] focus:outline-none focus:border-[#F47A35]"
            />
          </label>

          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
            style={{background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)'}}
            title="Refresh"
          >
            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{fontSize: 17}}>refresh</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <section className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">account_balance_wallet</span>
                Ledger &amp; Operational Accounts
              </h2>
              <p className="text-xs font-medium text-[#9B7B52]">
                Complete purchase history and administrative expenses for {monthLabel}
              </p>
            </div>

            <button
              onClick={() => setShowExport(true)}
              className="px-4 py-2 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              Download Ledger Summary
            </button>
          </div>

          {/* Ledger sub-navigation */}
          <div className="bg-white rounded-2xl border border-[#EFDCB4] p-1.5 flex gap-1 overflow-x-auto hide-scrollbar">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setAddingCategory(false); setForm(f => ({...f, category: SUGGESTIONS[t.id][0]})); }}
                className={`shrink-0 lg:flex-1 py-2.5 px-3.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                  tab === t.id ? 'bg-[#F47A35] text-[#2D1A0E]' : 'text-[#9B7B52] hover:bg-[#F7EEDA] hover:text-[#2D1A0E]'
                }`}
              >
                <span className="material-symbols-outlined" style={{fontSize: 17}}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
               style={{background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)'}}>{error}</p>
          )}
          {message && (
            <p role="status" className="px-3.5 py-3 rounded-xl text-xs font-bold"
               style={{background: 'var(--green-light)', border: '1px solid #A6DCBB', color: 'var(--green)'}}>{message}</p>
          )}

          {/* Entry form */}
          <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-4">
            <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">
                {tab === 'PURCHASE' ? 'add_shopping_cart' : tab === 'OPERATIONAL' ? 'bolt' : 'badge'}
              </span>
              Log New {LABELS[tab].replace(/s$/, '')} Entry
            </h3>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="ledger-date">Entry Date</label>
                  <input
                    id="ledger-date"
                    type="date"
                    value={form.entry_date}
                    onChange={e => setForm({...form, entry_date: e.target.value})}
                    required
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="ledger-category">Category</label>
                  {addingCategory ? (
                    <div className="flex gap-1.5">
                      <input
                        id="ledger-category"
                        autoFocus
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitNewCategory(); }
                          if (e.key === 'Escape') { setAddingCategory(false); setNewCategory(''); }
                        }}
                        maxLength={80}
                        placeholder="New category name"
                        className="w-full p-2.5 bg-white border border-[#F47A35] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={commitNewCategory}
                        className="px-2.5 py-2 bg-[#15803d] hover:bg-[#126b33] text-white text-xs font-bold rounded-xl whitespace-nowrap cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingCategory(false); setNewCategory(''); }}
                        title="Cancel"
                        aria-label="Cancel adding a category"
                        className="px-2.5 py-2 bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#6B4A28] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      id="ledger-category"
                      value={form.category}
                      onChange={e => {
                        if (e.target.value === '__ADD__') { setAddingCategory(true); setNewCategory(''); }
                        else setForm({...form, category: e.target.value});
                      }}
                      required
                      className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                    >
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__ADD__">+ Add a new category…</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="ledger-desc">Description / Notes</label>
                  <input
                    id="ledger-desc"
                    type="text"
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    required
                    maxLength={500}
                    placeholder="e.g. LPG Cylinder Refill, Fresh Fish…"
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="ledger-amount">Total Bill Amount (₹)</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="ledger-amount"
                      type="number"
                      value={form.amount}
                      onChange={e => setForm({...form, amount: e.target.value})}
                      placeholder="e.g. 500"
                      required
                      min="0.01"
                      step="0.01"
                      className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                    />
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full sm:w-auto px-4 py-2.5 bg-[#F47A35] hover:bg-[#F68C51] disabled:opacity-60 text-[#2D1A0E] font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {saving ? 'Saving…' : 'Log Entry'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.vendor}
                  onChange={e => setForm({...form, vendor: e.target.value})}
                  placeholder="Vendor / supplier (optional)"
                  aria-label="Vendor"
                  className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                />
                <input
                  type="text"
                  value={form.reference}
                  onChange={e => setForm({...form, reference: e.target.value})}
                  placeholder="Invoice / bill number (optional)"
                  aria-label="Invoice number"
                  className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                />
              </div>
            </form>
          </div>

          {/* Summary Stat Bar: 3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
              <p className="text-xs font-bold text-[#9B7B52]">{monthLabel} {LABELS[tab]}</p>
              <p className="text-2xl font-extrabold text-[#F47A35] mt-1">
                {summary ? money(summaryValue(tab)) : '—'}
              </p>
              <p className="text-[11px] text-[#9B7B52] mt-1">Period total from the server</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
              <p className="text-xs font-bold text-[#9B7B52]">Entries Shown</p>
              <p className="text-2xl font-extrabold text-[#2D1A0E] mt-1">{shown.length} Entries</p>
              <p className="text-[11px] text-[#9B7B52] mt-1">{money(total)} after filters</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
              <p className="text-xs font-bold text-[#9B7B52]">Average Entry</p>
              <p className="text-2xl font-extrabold text-[#16a34a] mt-1">{money(average)}</p>
              <p className="text-[11px] text-[#9B7B52] mt-1">Avg cost per entry</p>
            </div>
          </div>

          {/* Search toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-96">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">search</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search description, category, vendor or invoice…"
                className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
            </div>
            <span className="text-xs font-semibold text-[#9B7B52]">
              Showing {shown.length} of {entries.filter(e => e.kind === tab).length} {LABELS[tab].toLowerCase()} entries in {monthLabel}
            </span>
          </div>

          {/* History table */}
          <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
              <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">history</span>
                {LABELS[tab]} Log
              </h3>
              <span className="text-xs font-semibold text-[#9B7B52]">{money(total)} shown</span>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table text-left text-sm">
                <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                  <tr>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">Description / Notes</th>
                    <th className="py-3.5 px-4">Vendor / Invoice</th>
                    <th className="py-3.5 px-4">Amount (₹)</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFDCB4]">
                  {loading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-[#9B7B52] text-sm">Loading…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#9B7B52] text-sm">
                        No {LABELS[tab].toLowerCase()} entries for {monthLabel}.
                      </td>
                    </tr>
                  ) : (
                    shown.map(row => {
                      const tone = toneFor(row.category);
                      return (
                        <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                          <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{row.entry_date}</td>
                          <td className="py-3 px-4">
                            <span
                              className="px-2.5 py-0.5 text-xs font-extrabold rounded-full border inline-block"
                              style={{background: `${tone}1A`, color: tone, borderColor: `${tone}4D`}}
                            >
                              {row.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#2D1A0E]">{row.description}</td>
                          <td className="py-3 px-4 text-xs text-[#9B7B52]">
                            {[row.vendor, row.reference].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-3 px-4 font-extrabold text-[#16a34a]">{money(row.amount)}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => { setVoiding(row); setVoidReason(''); }}
                              className="p-1.5 text-[#dc2626] hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                              title="Void this entry"
                              aria-label={`Void ${row.category} entry of ${money(row.amount)}`}
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* ── Void confirmation ────────────────────────────────────── */}
      {voiding && (
        <Modal open scrim={false}><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#2D1A0E]">Void this entry?</h3>
            <p className="text-sm text-[#5C3D1E]">
              {voiding.category} · {money(voiding.amount)} on {voiding.entry_date}
            </p>
            <p className="text-xs font-semibold text-[#9B7B52]">
              Nothing is deleted. The entry is marked void and stops counting towards the month, and
              the reason below is kept in the audit history.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="void-reason">
                Reason (at least 5 characters)
              </label>
              <input
                id="void-reason"
                type="text"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                minLength={5}
                maxLength={500}
                placeholder="Explain the correction"
                className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
            </div>
            <div className="flex gap-2">
              <button
                disabled={saving || voidReason.trim().length < 5}
                onClick={async () => {
                  const row = voiding;
                  const ok = await run(() => adminApi.voidLedger(row.id, voidReason.trim()),
                    'Entry voided, with the reason kept in the audit history.');
                  if (ok) { setVoiding(null); setVoidReason(''); }
                }}
                className="flex-1 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] btn-inert text-white font-semibold rounded-xl cursor-pointer"
              >
                {saving ? 'Voiding…' : 'Void entry'}
              </button>
              <button
                onClick={() => { setVoiding(null); setVoidReason(''); }}
                className="px-4 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div></Modal>
      )}

      {/* ── Export ───────────────────────────────────────────────── */}
      {showExport && (
        <Modal open scrim={false}><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#2D1A0E]">Export {monthLabel}</h3>
            <p className="text-sm text-[#5C3D1E]">
              The monthly report covers the ledger, attendance and billing for {monthLabel}. Choose a format:
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try { await adminApi.downloadReportFile(year, month, 'excel'); setShowExport(false); }
                  catch (e: any) { setError(e?.message || 'Export failed.'); setShowExport(false); }
                }}
                className="flex-1 py-2.5 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-semibold rounded-xl cursor-pointer"
              >
                Download Excel (.xlsx)
              </button>
              <button
                onClick={async () => {
                  try { await adminApi.downloadReportFile(year, month, 'pdf'); setShowExport(false); }
                  catch (e: any) { setError(e?.message || 'Export failed.'); setShowExport(false); }
                }}
                className="flex-1 py-2.5 bg-[#15803d] hover:bg-[#126b33] text-white font-semibold rounded-xl cursor-pointer"
              >
                Download PDF
              </button>
            </div>
            <button
              onClick={() => setShowExport(false)}
              className="w-full text-center text-sm text-[#9B7B52] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div></Modal>
      )}
    </div>
  );
};
