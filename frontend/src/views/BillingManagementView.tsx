import React, {useEffect, useState} from 'react';
import {adminApi} from '../services/api';

/**
 * The five figures the monthly rate is calculated from. Opening and closing
 * stock are entered by hand -- the mess values its own store at month end and
 * this app does not run stock control -- while the three cost lines can be
 * pulled straight from the ledger.
 */
const FIELDS = [
  ['opening_stock_value',      'Opening stock value',      'Last month’s closing value', false],
  ['purchases_value',          'Food purchases',           'From the ledger',                true],
  ['closing_stock_value',      'Closing stock value',      'Counted at month end',           false],
  ['operational_expenses',     'Operating expenses',       'From the ledger',                true],
  ['administrative_expenses',  'Administrative expenses',  'From the ledger',                true],
] as const;

const money = (value: string | number) =>
  Number(value || 0).toLocaleString('en-IN', {style: 'currency', currency: 'INR'});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

export const BillingManagementView: React.FC = () => {
  const previous = new Date(); previous.setMonth(previous.getMonth() - 1);
  const [period, setPeriod] = useState(
    `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`);
  const [figures, setFigures] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map(([key]) => [key, '0.00'])));
  const [preview, setPreview] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);

  const [year, month] = period.split('-').map(Number);

  useEffect(() => {
    let cancelled = false;
    setStatus(null); setPreview(null); setBills([]); setError(''); setBusy(true); setShowReopen(false);
    adminApi.getBillStatus(month, year).then(async data => {
      const rows = data.is_published && data.revision > 0
        ? await adminApi.getPublishedBills(month, year) : [];
      if (!cancelled) {
        setStatus(data); setBills(rows);
        setFigures(data.calculation?.figures || Object.fromEntries(FIELDS.map(([key]) => [key, '0.00'])));
      }
    }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [period]);

  const payload = () => ({year, month, ...Object.fromEntries(FIELDS.map(([key]) => [key, figures[key]]))});

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const published = Boolean(status?.is_published);
  const rows = published ? bills : preview?.students || [];
  const summary = published ? status.calculation : preview;
  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Header & Controls Toolbar */}
        <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                Monthly Mess Rate &amp; Billing
              </h2>
              {status && (published ? (
                <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-black rounded-full">
                  Published · revision {status.revision}
                </span>
              ) : (
                <span className="px-3 py-1 bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/30 text-xs font-black rounded-full">
                  Draft — not visible to students
                </span>
              ))}
            </div>
            <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
              Costs are split across opted-in student-days. A single skipped meal still counts as an
              opted-in day; full-day cuts and days with no service are excluded. Recorded non-waived
              fines are added on top.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1" htmlFor="bill-period">
                Billing Period
              </label>
              <input
                id="bill-period"
                type="month"
                min="2024-01"
                max="2100-12"
                value={period}
                disabled={busy}
                onChange={e => { if (e.target.value) setPeriod(e.target.value); }}
                className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
              />
            </div>

            {published && status.revision > 0 && (
              <div className="flex items-end gap-2">
                <button
                  onClick={() => run(async () => { await adminApi.downloadReportFile(year, month, 'excel'); })}
                  disabled={busy}
                  className="px-3.5 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">table_chart</span>
                  <span>Export Excel</span>
                </button>
                <button
                  onClick={() => run(async () => { await adminApi.downloadReportFile(year, month, 'pdf'); })}
                  disabled={busy}
                  className="px-3.5 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  <span>Export PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)'}}>{error}</p>
        )}
        {busy && (
          <p role="status" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--text-muted)'}}>
            Loading or saving billing…
          </p>
        )}
        {published && status.revision === 0 && (
          <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{background: '#FFF7E7', border: '1px solid #F0D9A8', color: '#8B5E0A'}}>
            This legacy publication needs staff reconciliation. Reopen it with a reason and review the
            new calculation before publishing.
          </p>
        )}

        {/* Calculation of Daily Mess Rate */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
          <div className="p-5 border-b border-[#EFDCB4] bg-[#FDF7EA] flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 className="text-base font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">calculate</span>
                Calculation of Daily Mess Rate
              </h3>
              <p className="text-xs text-[#9B7B52] mt-0.5">
                Official breakdown for <span className="font-bold text-[#2D1A0E]">{periodLabel}</span>
              </p>
            </div>
            <span className="px-3 py-1 bg-[#F47A35]/10 text-[#F47A35] text-xs font-bold rounded-full border border-[#F47A35]/20">
              {periodLabel} Cycle
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div className="bg-[#FDF7EA] p-4 rounded-xl border border-[#E3CB9B] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FIELDS.map(([key, label, hint], i) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor={`bill-${key}`}>
                    {i + 1}. {label} (₹){' '}
                    <span className="font-normal text-[#9B7B52]">({hint})</span>
                  </label>
                  <input
                    id={`bill-${key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={figures[key]}
                    disabled={busy || !status || published}
                    onChange={e => { setFigures({...figures, [key]: e.target.value}); setPreview(null); }}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] disabled:bg-[#F7EEDA] disabled:text-[#9B7B52]"
                  />
                </div>
              ))}
            </div>

            {!published && (
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy || !status}
                  onClick={() => run(async () => {
                    const totals = await adminApi.getLedgerPeriodSummary(month, year);
                    setFigures({
                      ...figures,
                      purchases_value: totals.purchases_value,
                      operational_expenses: totals.operational_expenses,
                      administrative_expenses: totals.administrative_expenses,
                    });
                    setPreview(null);
                  })}
                  className="px-4 py-2.5 bg-white hover:bg-[#F7EEDA] border border-[#E3CB9B] text-[#6B4A28] font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">download_for_offline</span>
                  Fill costs from ledger
                </button>
                <button
                  disabled={busy || !status}
                  onClick={() => run(async () => setPreview(await adminApi.previewBill(payload())))}
                  className="px-4 py-2.5 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  Preview student bills
                </button>
                <button
                  disabled={busy || !preview || preview.chargeable_days === 0}
                  onClick={() => run(async () => {
                    const result = await adminApi.publishBill(
                      {...payload(), preview_token: preview.preview_token} as Parameters<typeof adminApi.publishBill>[0]);
                    setStatus({is_published: true, revision: result.revision, calculation: result});
                    setBills(await adminApi.getPublishedBills(month, year));
                    setPreview(null);
                  })}
                  className="px-4 py-2.5 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">campaign</span>
                  Publish reviewed bills
                </button>
              </div>
            )}

            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {label: 'Opted-in student-days', value: String(summary.chargeable_days), tone: '#2D1A0E'},
                  {label: 'Total costs', value: money(summary.grand_total_expense), tone: '#F47A35'},
                  {label: 'Fines added', value: money(summary.total_fines), tone: '#dc2626'},
                  {label: 'Daily rate', value: money(summary.mess_daily_rate), tone: '#16a34a'},
                ].map(card => (
                  <div key={card.label} className="p-4 rounded-xl border border-[#EFDCB4] bg-white">
                    <p className="text-[10px] font-extrabold uppercase text-[#9B7B52]">{card.label}</p>
                    <p className="text-xl font-black mt-1" style={{color: card.tone}}>{card.value}</p>
                  </div>
                ))}
              </div>
            )}

            {summary && (
              <p className="text-[11px] font-semibold text-[#9B7B52]">
                Amounts are allocated to the nearest paisa so student base charges total the monthly
                costs exactly. The daily rate above is the rounded display value.
              </p>
            )}
          </div>
        </div>

        {/* Student bills */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
            <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">list_alt</span>
              {published ? `Published bills · revision ${status.revision}` : 'Draft preview'}
            </h3>
            <span className="text-xs font-semibold text-[#9B7B52]">{rows.length} students</span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-left text-sm">
              <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">Registration</th>
                  <th className="py-3.5 px-4 text-center">Opted-in days</th>
                  <th className="py-3.5 px-4 text-right">Base charge</th>
                  <th className="py-3.5 px-4 text-right">Fines</th>
                  <th className="py-3.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFDCB4]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#9B7B52] text-sm">
                      {published
                        ? 'No student bills in this revision.'
                        : 'Enter the month’s figures and choose Preview student bills to see exactly what each student will be charged.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((bill: any) => (
                    <tr key={bill.student_id} className="hover:bg-[#FDF7EA] transition-colors">
                      <td className="py-3 px-4 font-bold text-[#2D1A0E]">{bill.student.name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{bill.student.registration_number}</td>
                      <td className="py-3 px-4 text-center font-bold text-[#6B4A28]" style={{fontVariantNumeric: 'tabular-nums'}}>
                        {bill.effective_days}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#5C3D1E]">{money(bill.base_charge)}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#dc2626]">{money(bill.total_fines)}</td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-[#2D1A0E]">{money(bill.grand_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {published && (
          <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-3">
            <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">lock_open</span>
              Correction
            </h3>
            <p className="text-xs font-medium text-[#9B7B52]">
              Reopening hides the current bill from students until a corrected revision is published.
              Earlier published revisions are kept for audit and are never overwritten.
            </p>
            {showReopen ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#6B4A28]" htmlFor="reopen-reason">
                  Reason for correction
                </label>
                <input
                  id="reopen-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Gas invoice for 14th was logged twice"
                  className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => run(async () => {
                      await adminApi.unpublishBill(month, year, reason);
                      setStatus({...status, is_published: false});
                      setPreview(null); setBills([]); setReason(''); setShowReopen(false);
                    })}
                    className="px-4 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Reopen for correction
                  </button>
                  <button
                    onClick={() => { setShowReopen(false); setReason(''); }}
                    className="px-4 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReopen(true)}
                className="px-4 py-2.5 bg-white hover:bg-[#F7EEDA] border border-[#E3CB9B] text-[#6B4A28] font-bold text-xs rounded-xl cursor-pointer"
              >
                Reopen this bill for correction
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
