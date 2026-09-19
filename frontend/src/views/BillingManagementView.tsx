import React, {useEffect, useMemo, useState} from 'react';
import {adminApi} from '../services/api';
import {Modal} from '../components/Modal';

/**
 * The five figures the monthly rate is calculated from. The server computes
 *
 *   food  = opening_stock + purchases - closing_stock
 *   total = food + operational + administrative
 *
 * so the statement below is laid out in exactly that order and the arithmetic
 * shown on screen is the arithmetic that produced the bills.
 *
 * Opening and closing stock are typed in -- the mess values its own store at
 * month end and this app does not run stock control. The three cost lines can
 * be pulled from the ledger, and each one opens the entries behind it.
 */
const FIELDS = [
  {key: 'opening_stock_value',     no: 1, label: 'Opening Stock',           hint: 'Last month’s closing stock value', sign: '+' as const, kind: null},
  {key: 'purchases_value',         no: 2, label: 'Purchases',               hint: 'Groceries, fish, meat, milk and the rest', sign: '+' as const, kind: 'PURCHASE'},
  {key: 'closing_stock_value',     no: 3, label: 'Closing Stock',           hint: 'Physical stock value at month end',   sign: '-' as const, kind: null},
  // Nothing new is filed as OPERATIONAL since the Ledger merged that tab into
  // Purchases, so for a current month this line is 0 and is hidden. It stays in
  // the list because months published BEFORE the merge have a real figure here,
  // and their statement has to keep adding up.
  {key: 'operational_expenses',    no: 4, label: 'Operating Expenses',      hint: 'Gas, electricity, water, repairs (now logged under Purchases)', sign: '+' as const, kind: 'OPERATIONAL'},
  {key: 'administrative_expenses', no: 5, label: 'Administrative Expenses', hint: 'Wages, allowance, stationery, misc',  sign: '+' as const, kind: 'ADMINISTRATIVE'},
] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const CATEGORY_LABEL: Record<string, string> = {
  HOSTELLER: 'Hosteller', DAY_SCHOLAR: 'Day scholar', OUTMESS: 'Out-mess',
};
const CAMPUS_LABEL: Record<string, string> = {
  MAIN_CAMPUS: 'Main Campus', LAKESIDE_CAMPUS: 'Lakeside',
};

const money = (value: string | number) =>
  Number(value || 0).toLocaleString('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 2});

/** Plain number with thousands separators, for the ledger-style columns. */
const inr = (value: string | number) =>
  Number(value || 0).toLocaleString('en-IN', {maximumFractionDigits: 2});

const downloadCsv = (filename: string, rows: string[][]) => {
  const escape = (cell: string) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(escape).join(',')).join('\n');
  // BOM so Excel opens the rupee sign and Malayalam names correctly.
  const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const BillingManagementView: React.FC = () => {
  const previous = new Date(); previous.setMonth(previous.getMonth() - 1);
  const [period, setPeriod] = useState(
    `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`);
  const [figures, setFigures] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map(f => [f.key, '0.00'])));
  const [preview, setPreview] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);
  const [lineDetail, setLineDetail] = useState<typeof FIELDS[number] | null>(null);

  const [year, month] = period.split('-').map(Number);

  useEffect(() => {
    let cancelled = false;
    setStatus(null); setPreview(null); setBills([]); setError(''); setBusy(true); setShowReopen(false);
    (async () => {
      try {
        const data = await adminApi.getBillStatus(month, year);
        const rows = data.is_published && data.revision > 0
          ? await adminApi.getPublishedBills(month, year) : [];
        // The ledger and the roll are extras: they fill in the breakdown and
        // the category column, but a failure there must not hide the bill.
        const [entries, students] = await Promise.allSettled([
          adminApi.getLedger(), adminApi.getAllStudents(),
        ]);
        if (cancelled) return;
        setStatus(data); setBills(rows);
        setFigures(data.calculation?.figures || Object.fromEntries(FIELDS.map(f => [f.key, '0.00'])));
        setLedger(entries.status === 'fulfilled' && Array.isArray((entries.value as any)?.entries)
          ? (entries.value as any).entries : []);
        setDirectory(students.status === 'fulfilled' && Array.isArray(students.value) ? students.value : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const payload = () => ({year, month, ...Object.fromEntries(FIELDS.map(f => [f.key, figures[f.key]]))});

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const published = Boolean(status?.is_published);
  const rows: any[] = published ? bills : preview?.students || [];
  const summary = published ? status.calculation : preview;
  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  /** Live ledger entries for this month, per expense head. */
  const entriesFor = (kind: string | null) => kind === null ? [] :
    ledger.filter(e => e.kind === kind && (e.entry_date || '').startsWith(monthPrefix));

  const num = (key: string) => Number(figures[key] || 0);
  /** Lines worth showing: all of them, minus a zero Operating Expenses. */
  const shownFields = FIELDS.filter(f => f.key !== 'operational_expenses' || num(f.key) > 0);
  const foodCost = num('opening_stock_value') + num('purchases_value') - num('closing_stock_value');
  const actualCost = summary
    ? Number(summary.grand_total_expense)
    : foodCost + num('operational_expenses') + num('administrative_expenses');
  const chargeableDays = summary ? Number(summary.chargeable_days) : 0;
  const dailyRate = summary ? Number(summary.mess_daily_rate) : 0;

  const byReg = useMemo(() => {
    const map: Record<string, any> = {};
    directory.forEach(s => { map[s.registration_number] = s; });
    return map;
  }, [directory]);

  /**
   * Days on which the mess served at least one student, taken from the union
   * of every student's opted-in days. It is derived from the same records the
   * charge is, so it cannot drift from the bill the way a hand-entered
   * "days open" figure would.
   */
  const messOpenDays = useMemo(() => {
    const open = new Set<string>();
    rows.forEach(b => (b.opted_in_days || []).forEach((d: string) => open.add(d)));
    return open;
  }, [rows]);

  const daysInMonth = new Date(year, month, 0).getDate();

  /** One line per student, every column derived from the published record. */
  const studentBilling = useMemo(() => rows.map((b, idx) => {
    const reg = b.student?.registration_number || '';
    const profile = byReg[reg] || {};
    const enrolled = b.enrollment_date || '';
    // Only count the open days this student was actually enrolled for, so a
    // mid-month joiner is not shown as having taken a month of mess cuts.
    const openForThem = [...messOpenDays].filter(d => !enrolled || d >= enrolled).length;
    const effective = Number(b.effective_days || 0);
    return {
      slNo: idx + 1,
      messId: profile.mess_id || `M-${reg}`,
      reg,
      name: b.student?.name || '',
      category: CATEGORY_LABEL[profile.student_type] || profile.student_type || '—',
      campus: CAMPUS_LABEL[profile.campus_location] || profile.campus_location || '—',
      totalDays: daysInMonth,
      messOpened: openForThem,
      messCut: Math.max(0, openForThem - effective),
      effectiveDays: effective,
      perDay: Number(b.mess_daily_rate || dailyRate),
      fine: Number(b.total_fines || 0),
      totalBill: Number(b.grand_total || 0),
    };
  }), [rows, byReg, messOpenDays, daysInMonth, dailyRate]);

  const totals = useMemo(() => studentBilling.reduce((acc, r) => ({
    messCut: acc.messCut + r.messCut,
    effectiveDays: acc.effectiveDays + r.effectiveDays,
    fine: acc.fine + r.fine,
    totalBill: acc.totalBill + r.totalBill,
  }), {messCut: 0, effectiveDays: 0, fine: 0, totalBill: 0}), [studentBilling]);

  const exportStudentBilling = () => {
    downloadCsv(`CUSAT_Individual_Student_Billing_${MONTHS[month - 1]}_${year}.csv`, [
      [`CUSAT Mess Individual Monthly Student Billing - ${periodLabel}`],
      [published ? `Published revision ${status.revision}` : 'DRAFT PREVIEW - not published'],
      [],
      ['Sl No', 'Mess ID', 'Reg No', 'Name', 'Category', 'Campus', 'Total Days', 'Mess Open',
       'Mess Cut', 'Effective Days', 'Per Day (INR)', 'Fine (INR)', 'Total Bill (INR)'],
      ...studentBilling.map(r => [
        String(r.slNo), r.messId, r.reg, r.name, r.category, r.campus, String(r.totalDays),
        String(r.messOpened), String(r.messCut), String(r.effectiveDays),
        r.perDay.toFixed(2), r.fine.toFixed(2), r.totalBill.toFixed(2),
      ]),
      [],
      ['TOTALS', '', '', '', '', '', '', '', String(totals.messCut), String(totals.effectiveDays),
       '', totals.fine.toFixed(2), totals.totalBill.toFixed(2)],
    ]);
  };

  const exportBreakdown = () => {
    const lines: string[][] = [
      [`CUSAT Mess Breakdown Expenses Statement - ${periodLabel}`],
      [published ? `Published revision ${status.revision}` : 'DRAFT PREVIEW - not published'],
      [],
    ];
    FIELDS.forEach(f => {
      lines.push([`${f.no}. ${f.label}`, f.hint, `${f.sign === '-' ? '-' : ''}${num(f.key).toFixed(2)}`]);
      const detail = entriesFor(f.kind);
      if (detail.length) {
        lines.push(['', 'Date', 'Category', 'Description', 'Vendor', 'Invoice', 'Amount (INR)']);
        detail.forEach(e => lines.push(['', e.entry_date, e.category, e.description,
          e.vendor || '', e.reference || '', Number(e.amount).toFixed(2)]));
      }
      lines.push([]);
    });
    lines.push(['Actual expenditure of month (1 + 2 - 3 + 4 + 5)', '', actualCost.toFixed(2)]);
    lines.push(['Chargeable days (opted-in student-days)', '', String(chargeableDays)]);
    lines.push(['Mess daily rate (INR / student / day)', '', dailyRate.toFixed(6)]);
    downloadCsv(`CUSAT_Breakdown_Statement_${MONTHS[month - 1]}_${year}.csv`, lines);
  };

  const editable = Boolean(status) && !published && !busy;

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Header & Controls Toolbar */}
        <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                Monthly Mess Rate &amp; Billing Calculation
              </h2>
              {status && (published ? (
                <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-black rounded-full">
                  Published &middot; revision {status.revision}
                </span>
              ) : (
                <span className="px-3 py-1 bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/30 text-xs font-black rounded-full">
                  Draft &middot; not visible to students
                </span>
              ))}
            </div>
            <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
              Select a billing period to calculate actual mess expenditure, chargeable days and the
              daily rate. Click any line item to inspect the entries behind it.
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
                  className="px-3.5 py-2 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
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

        {/* ── Calculation of Daily Mess Rate ───────────────────────── */}
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
            {/* Stock amounts, typed in */}
            <div className="bg-[#FDF7EA] p-4 rounded-xl border border-[#E3CB9B] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="bill-opening">
                  1. Opening Stock Amount (₹){' '}
                  <span className="font-normal text-[#9B7B52]">(Last Month Closing Value)</span>
                </label>
                <input
                  id="bill-opening"
                  type="number" min="0" step="0.01"
                  value={figures.opening_stock_value}
                  disabled={!editable}
                  onChange={e => { setFigures({...figures, opening_stock_value: e.target.value}); setPreview(null); }}
                  placeholder="Enter Opening Stock Amount"
                  className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-extrabold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] disabled:bg-[#F7EEDA] disabled:text-[#9B7B52]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="bill-closing">
                  3. Closing Stock Amount (₹){' '}
                  <span className="font-normal text-[#9B7B52]">(Current Month End Value)</span>
                </label>
                <input
                  id="bill-closing"
                  type="number" min="0" step="0.01"
                  value={figures.closing_stock_value}
                  disabled={!editable}
                  onChange={e => { setFigures({...figures, closing_stock_value: e.target.value}); setPreview(null); }}
                  placeholder="Enter Closing Stock Amount"
                  className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-extrabold text-[#dc2626] focus:outline-none focus:border-[#dc2626] disabled:bg-[#F7EEDA] disabled:text-[#9B7B52]"
                />
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-x-auto">
              <table className="data-table text-left text-sm">
                <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                  <tr>
                    <th className="py-3 px-4">Line Item / Expense Head</th>
                    <th className="py-3 px-4 text-center">Source Details</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFDCB4]">
                  {shownFields.map(f => {
                    const detail = entriesFor(f.kind);
                    const negative = f.sign === '-';
                    return (
                      <tr
                        key={f.key}
                        onClick={() => setLineDetail(f)}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full bg-[#F7EEDA] text-xs font-black flex items-center justify-center ${negative ? 'text-[#dc2626]' : 'text-[#F47A35]'}`}>
                            {f.no}
                          </span>
                          <span>{f.label}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">
                          {f.kind ? `${detail.length} logged ledger ${detail.length === 1 ? 'entry' : 'entries'}` : f.hint}
                        </td>
                        <td className={`py-3.5 px-4 text-right font-mono font-bold ${negative ? 'text-[#dc2626]' : 'text-[#2D1A0E]'}`}>
                          {negative ? '- ' : ''}₹{inr(num(f.key))}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>{f.kind ? 'View entries' : 'View detail'}</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-white font-bold">
                    <td colSpan={2} className="py-4 px-4 text-[#2D1A0E]">
                      Food cost consumed{' '}
                      <span className="text-xs font-normal text-[#9B7B52]">(1 + 2 − 3)</span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-[#2D1A0E]">₹{inr(foodCost)}</td>
                    <td></td>
                  </tr>

                  <tr className="bg-[#FDF7EA] font-extrabold border-t-2 border-[#E3CB9B]">
                    <td colSpan={2} className="py-4 px-4 text-[#2D1A0E]">
                      Actual Expenditure{' '}
                      <span className="text-xs font-normal text-[#9B7B52]">(Formula: 1 + 2 − 3 + 4 + 5)</span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-base text-[#F47A35]">₹{inr(actualCost)}</td>
                    <td></td>
                  </tr>

                  <tr className="bg-white font-bold">
                    <td colSpan={2} className="py-4 px-4 text-[#2D1A0E]">
                      Chargeable Days{' '}
                      <span className="text-xs font-normal text-[#9B7B52]">
                        (Sum of every student&rsquo;s opted-in days)
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-[#2D1A0E]">
                      {summary ? `${chargeableDays.toLocaleString()} Days` : '—'}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mess daily rate */}
            <div className="bg-[#F47A35] text-[#2D1A0E] p-6 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full text-white inline-block">
                  {published ? 'Published calculation' : summary ? 'Draft preview' : 'Awaiting preview'}
                </span>
                <h4 className="text-xl font-extrabold">Mess Daily Rate</h4>
                <p className="text-xs text-white/80">
                  {summary
                    ? `Actual Cost (₹${inr(actualCost)}) ÷ Chargeable Days (${chargeableDays.toLocaleString()})`
                    : 'Enter the month’s figures and choose Preview student bills.'}
                </p>
              </div>

              <div className="bg-white/15 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center">
                <span className="text-3xl font-black tracking-tight">
                  {summary ? `₹${dailyRate.toFixed(2)}` : '—'}
                </span>
                <span className="text-xs font-bold block opacity-90 mt-0.5">/ student / day</span>
              </div>
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
                  className="px-4 py-2.5 bg-white hover:bg-[#F7EEDA] border border-[#E3CB9B] text-[#6B4A28] font-bold text-xs rounded-xl cursor-pointer btn-inert flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">download_for_offline</span>
                  Fill costs from ledger
                </button>
                <button
                  disabled={busy || !status}
                  onClick={() => run(async () => setPreview(await adminApi.previewBill(payload())))}
                  className="px-4 py-2.5 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl cursor-pointer btn-inert flex items-center gap-1.5"
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
                  className="px-4 py-2.5 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-xs rounded-xl cursor-pointer btn-inert flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">campaign</span>
                  Publish reviewed bills
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Breakdown Expenses Statement ─────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#EFDCB4] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                Breakdown Expenses Statement — {periodLabel}
              </h3>
              <p className="text-xs text-[#9B7B52] mt-0.5">
                Itemised statements of purchases, stock values and administrative expenses
              </p>
            </div>

            <button
              onClick={exportBreakdown}
              className="px-4 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px]">table_chart</span>
              <span>Download Breakdown Sheet</span>
            </button>
          </div>

          {shownFields.map(f => {
            const detail = entriesFor(f.kind);
            const negative = f.sign === '-';
            return (
              <div key={f.key} className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                    negative ? 'bg-[#dc2626]/10 text-[#dc2626]' : 'bg-[#F47A35]/10 text-[#F47A35]'}`}>
                    {f.no}
                  </span>
                  {f.label}
                </h4>

                {f.kind === null ? (
                  <div className="p-4 bg-[#FDF7EA] border border-[#EFDCB4] rounded-xl flex justify-between items-center gap-3 text-xs font-bold">
                    <span className="text-[#6B4A28]">{f.label} Amount ({f.hint}):</span>
                    <span className={`font-mono text-sm ${negative ? 'text-[#dc2626]' : 'text-[#F47A35]'}`}>
                      {negative ? '- ' : ''}₹{inr(num(f.key))}
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                    <table className="data-table text-left text-xs">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                        <tr>
                          <th className="py-2.5 px-3">Sl No</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Description / Notes</th>
                          <th className="py-2.5 px-3">Vendor / Invoice</th>
                          <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {detail.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-[#9B7B52]">
                              No {f.label.toLowerCase()} logged in the ledger for {periodLabel}.
                            </td>
                          </tr>
                        ) : detail.map((e, idx) => (
                          <tr key={e.id} className="hover:bg-[#FDF7EA]">
                            <td className="py-2.5 px-3 text-[#9B7B52]">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono text-[#5C3D1E]">{e.entry_date}</td>
                            <td className="py-2.5 px-3 font-bold text-[#F47A35]">{e.category}</td>
                            <td className="py-2.5 px-3 font-semibold text-[#2D1A0E]">{e.description}</td>
                            <td className="py-2.5 px-3 text-[#9B7B52]">
                              {[e.vendor, e.reference].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#16a34a]">
                              ₹{inr(e.amount)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                          <td colSpan={5} className="py-3 px-3 text-[#2D1A0E]">
                            Ledger total for {f.label.toLowerCase()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-sm text-[#F47A35]">
                            ₹{inr(detail.reduce((sum, e) => sum + Number(e.amount || 0), 0))}
                          </td>
                        </tr>
                        {Math.abs(detail.reduce((sum, e) => sum + Number(e.amount || 0), 0) - num(f.key)) > 0.005 && (
                          <tr className="bg-[#FFF7E7] font-bold">
                            <td colSpan={5} className="py-3 px-3 text-[#8B5E0A]">
                              Figure used in the calculation (differs from the ledger total above)
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-sm text-[#8B5E0A]">
                              ₹{inr(num(f.key))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Actual expenditure summary */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">
                =
              </span>
              Actual Expenditure Calculation (1 + 2 − 3 + 4 + 5)
            </h4>
            <div className="bg-[#FDF7EA] p-4 rounded-xl border border-[#E3CB9B] space-y-2 text-xs">
              {shownFields.map(f => (
                <div key={f.key} className="flex justify-between items-center gap-3">
                  <span className="text-[#6B4A28]">
                    {f.no}. {f.sign === '-' ? 'Less ' : 'Add '}{f.label}:
                  </span>
                  <span className={`font-mono font-bold ${f.sign === '-' ? 'text-[#dc2626]' : 'text-[#2D1A0E]'}`}>
                    {f.sign} ₹{inr(num(f.key))}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-[#E3CB9B] flex justify-between items-center gap-3 font-extrabold text-sm">
                <span className="text-[#2D1A0E]">Actual Expenditure of Month:</span>
                <span className="font-mono text-[#F47A35]">₹{inr(actualCost)}</span>
              </div>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-gradient-to-br from-[#5C3D1E] to-[#F47A35] text-white p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/20 pb-4">
              <div>
                <span className="px-3 py-1 bg-white/20 text-white text-xs font-extrabold uppercase tracking-wider rounded-full inline-block mb-1">
                  Final Expense Aggregation
                </span>
                <h3 className="text-2xl font-black tracking-tight">
                  GRAND TOTAL EXPENSE OF {MONTHS[month - 1].toUpperCase()} {year}
                </h3>
              </div>

              <div className="bg-white/15 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 text-right">
                <span className="text-3xl font-black">₹{inr(actualCost)}</span>
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-3 text-xs font-semibold ${shownFields.length === 5 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              {shownFields.map(f => (
                <div key={f.key} className="bg-white/10 p-3 rounded-xl border border-white/15">
                  <span className="opacity-80 block text-[11px] uppercase">{f.no}. {f.label}</span>
                  <span className={`text-base font-bold mt-0.5 block ${f.sign === '-' ? 'text-[#fca5a5]' : ''}`}>
                    {f.sign === '-' ? '- ' : ''}₹{inr(num(f.key))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Individual Monthly Student Billing ───────────────────── */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden space-y-4 p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#EFDCB4] pb-4">
            <div>
              <h3 className="text-xl font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">groups</span>
                Individual Monthly Student Billing ({periodLabel})
              </h3>
              <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                Costs are split across opted-in student-days:{' '}
                <span className="font-mono text-[#2D1A0E] font-bold">(Effective Days × Per Day Rate) + Fine</span>.
                A day counts as a mess cut only when all three meals are skipped.
              </p>
            </div>

            <button
              onClick={exportStudentBilling}
              disabled={studentBilling.length === 0}
              className="px-4 py-2 bg-[#15803d] hover:bg-[#126b33] btn-inert text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
              <span>Export Student Billing Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
            <table className="data-table text-left text-xs">
              <thead className="bg-[#FDF7EA] text-[#6B4A28] font-extrabold uppercase border-b border-[#EFDCB4]">
                <tr>
                  <th className="py-3.5 px-3 text-center">Sl No</th>
                  <th className="py-3.5 px-3">Mess ID</th>
                  <th className="py-3.5 px-4">Name</th>
                  <th className="py-3.5 px-3">Reg No</th>
                  <th className="py-3.5 px-3 text-center">Category</th>
                  <th className="py-3.5 px-3 text-center">Campus</th>
                  <th className="py-3.5 px-3 text-center">Total Days</th>
                  <th className="py-3.5 px-3 text-center">Mess Open</th>
                  <th className="py-3.5 px-3 text-center text-[#dc2626]">Mess Cut</th>
                  <th className="py-3.5 px-3 text-center text-[#16a34a]">Effective Days</th>
                  <th className="py-3.5 px-3 text-right">Per Day (₹)</th>
                  <th className="py-3.5 px-3 text-right text-[#dc2626]">Fine (₹)</th>
                  <th className="py-3.5 px-4 text-right bg-[#F47A35]/5 text-[#F47A35]">Total Bill (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFDCB4]">
                {studentBilling.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-[#9B7B52]">
                      {published
                        ? 'No student bills in this revision.'
                        : 'Enter the month’s figures and choose Preview student bills to see exactly what each student will be charged.'}
                    </td>
                  </tr>
                ) : studentBilling.map(r => (
                  <tr key={r.reg} className="hover:bg-[#FDF7EA] transition-colors">
                    <td className="py-3 px-3 text-center font-mono font-bold text-[#9B7B52]">{r.slNo}</td>
                    <td className="py-3 px-3 font-mono font-bold text-[#F47A35]">{r.messId}</td>
                    <td className="py-3 px-4 font-extrabold text-[#2D1A0E]">{r.name}</td>
                    <td className="py-3 px-3 font-mono text-[#5C3D1E]">{r.reg}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2.5 py-1 bg-[#F7EEDA] text-[#2D1A0E] font-bold text-xs rounded-lg border border-[#E3CB9B] inline-block whitespace-nowrap">
                        {r.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-medium text-[#6B4A28] whitespace-nowrap">{r.campus}</td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-[#5C3D1E]">{r.totalDays}</td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-[#5C3D1E]">{r.messOpened}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-[#dc2626] bg-[#dc2626]/5">{r.messCut}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-[#16a34a] bg-[#16a34a]/5">{r.effectiveDays}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#F47A35]">₹{r.perDay.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#dc2626]">₹{inr(r.fine)}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-sm text-[#F47A35] bg-[#F47A35]/5">
                      ₹{inr(r.totalBill)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {studentBilling.length > 0 && (
                <tfoot className="bg-[#FDF7EA] font-black text-xs border-t-2 border-[#E3CB9B] text-[#2D1A0E]">
                  <tr>
                    <td colSpan={8} className="py-4 px-4 uppercase tracking-wider">Monthly student billing totals:</td>
                    <td className="py-4 px-3 text-center font-mono text-[#dc2626]">{totals.messCut} cuts</td>
                    <td className="py-4 px-3 text-center font-mono text-[#16a34a]">{totals.effectiveDays} days</td>
                    <td className="py-4 px-3 text-right font-mono text-[#F47A35]">₹{dailyRate.toFixed(2)}</td>
                    <td className="py-4 px-3 text-right font-mono text-[#dc2626]">₹{inr(totals.fine)}</td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-[#F47A35] bg-[#F47A35]/10">
                      ₹{inr(totals.totalBill)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {studentBilling.length > 0 && (
            <p className="text-[11px] font-semibold text-[#9B7B52]">
              Mess Open counts the days at least one student was opted in, from this student&rsquo;s
              enrolment onward, so a mid-month joiner is not shown as having taken a month of cuts.
              Amounts are allocated to the nearest paisa, so the student totals add up to the monthly
              cost exactly; the Per Day column shows the rounded rate.
            </p>
          )}
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
                    className="px-4 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] btn-inert text-white font-bold text-xs rounded-xl cursor-pointer"
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

      {/* ── Line-item detail ─────────────────────────────────────── */}
      <Modal
        open={Boolean(lineDetail)}
        onClose={() => setLineDetail(null)}
        panelClassName="max-w-3xl space-y-4"
        labelledBy="line-detail-title"
      >
        {lineDetail && (() => {
          const detail = entriesFor(lineDetail.kind);
          return (
            <>
              <div className="flex justify-between items-start gap-3 pb-4 border-b border-[#EFDCB4]">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#F47A35]">
                    {periodLabel} · line {lineDetail.no}
                  </p>
                  <h3 id="line-detail-title" className="font-display text-[19px] sm:text-[21px] font-bold text-[#2D1A0E] leading-tight mt-0.5">
                    {lineDetail.label}
                    <span className="font-semibold text-[#9B7B52]"> · ₹{inr(num(lineDetail.key))}</span>
                  </h3>
                  <p className="text-[11.5px] font-semibold text-[#9B7B52] mt-1">{lineDetail.hint}</p>
                </div>
                <button
                  onClick={() => setLineDetail(null)}
                  className="w-9 h-9 shrink-0 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {lineDetail.kind === null ? (
                <p className="text-sm font-semibold text-[#5C3D1E] py-4">
                  {lineDetail.label} is entered by hand on this screen — the mess values its own store
                  at month end and this app does not run stock control, so there are no ledger entries
                  behind it.
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto table-scroll min-h-[200px] border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-sm">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4] sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Vendor / Invoice</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {detail.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[#9B7B52] text-sm">
                            Nothing logged under {lineDetail.label.toLowerCase()} for {periodLabel}.
                          </td>
                        </tr>
                      ) : detail.map(e => (
                        <tr key={e.id} className="hover:bg-[#FDF7EA]">
                          <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{e.entry_date}</td>
                          <td className="py-3 px-4 font-bold text-[#F47A35] text-xs">{e.category}</td>
                          <td className="py-3 px-4 font-semibold text-[#2D1A0E]">{e.description}</td>
                          <td className="py-3 px-4 text-xs text-[#9B7B52]">
                            {[e.vendor, e.reference].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[#16a34a]">
                            ₹{inr(e.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 flex justify-between items-center gap-3">
                <span className="text-xs font-semibold text-[#9B7B52]">
                  {lineDetail.kind
                    ? `${detail.length} ${detail.length === 1 ? 'entry' : 'entries'} · ledger total ₹${inr(detail.reduce((s, e) => s + Number(e.amount || 0), 0))}`
                    : `Used in the calculation: ${money(num(lineDetail.key))}`}
                </span>
                <button
                  onClick={() => setLineDetail(null)}
                  className="px-5 py-2 bg-[#2D1A0E] text-white font-semibold text-xs rounded-xl hover:bg-[#3E2718] cursor-pointer"
                >
                  Done / Close
                </button>
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
};
