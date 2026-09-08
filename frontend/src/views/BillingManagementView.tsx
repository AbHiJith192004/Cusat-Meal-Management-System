import React, {useEffect, useState} from 'react';
import {adminApi} from '../services/api';

const fields = [
  ['opening_stock_value', 'Opening stock value'], ['purchases_value', 'Food purchases'],
  ['closing_stock_value', 'Closing stock value'], ['operational_expenses', 'Operating expenses'],
  ['administrative_expenses', 'Administrative expenses'],
] as const;
const money = (value: string | number) => Number(value).toLocaleString('en-IN', {style: 'currency', currency: 'INR'});

export const BillingManagementView: React.FC = () => {
  const previous = new Date(); previous.setMonth(previous.getMonth() - 1);
  const [period, setPeriod] = useState(`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2, '0')}`);
  const [figures, setFigures] = useState<Record<string, string>>(Object.fromEntries(fields.map(([key]) => [key, '0.00'])));
  const [preview, setPreview] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [year, month] = period.split('-').map(Number);
  useEffect(() => {
    let cancelled = false;
    setStatus(null); setPreview(null); setBills([]); setError(''); setBusy(true);
    adminApi.getBillStatus(month, year).then(async data => {
      const rows = data.is_published && data.revision > 0 ? await adminApi.getPublishedBills(month, year) : [];
      if (!cancelled) {
        setStatus(data); setBills(rows);
        setFigures(data.calculation?.figures || Object.fromEntries(fields.map(([key]) => [key, '0.00'])));
      }
    }).catch(e => {if (!cancelled) setError(e.message);})
      .finally(() => {if (!cancelled) setBusy(false);});
    return () => {cancelled = true;};
  }, [period]);
  const payload = () => ({year, month, ...Object.fromEntries(fields.map(([key]) => [key, figures[key]]))});
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try {await action();} catch (e: any) {setError(e.message);} finally {setBusy(false);}
  };
  const rows = status?.is_published ? bills : preview?.students || [];
  const summary = status?.is_published ? status.calculation : preview;
  return <section className="p-4 md:p-6 space-y-4 bg-white rounded-2xl border border-[#E3CB9B]">
    <div className="flex flex-wrap justify-between gap-3">
      <h2 className="text-xl font-bold">Monthly billing</h2>
      <input aria-label="Billing month" type="month" min="2024-01" max="2100-12" value={period} disabled={busy}
        onChange={e => {if (e.target.value) setPeriod(e.target.value);}} className="stitch-input w-auto"/>
    </div>
    <p>Costs are split across opted-in student-days. A single skipped meal still counts as an opted-in day. Full-day cuts and days with no opted-in service are excluded. Recorded non-waived fines are added separately.</p>
    <p className="text-sm">Enter verified monthly expense and stock totals in INR. The preview shows exactly what each student will be charged. Publication is available after the month ends.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {busy && <p role="status">Loading or saving billing…</p>}
    {status?.is_published && status.revision === 0 && <p role="alert">This legacy publication needs staff reconciliation. Reopen it with a reason and review the new calculation before publishing.</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}
        <input className="stitch-input mt-1" type="number" min="0" step="0.01" value={figures[key]} disabled={busy || !status || status.is_published}
          onChange={e => {setFigures({...figures, [key]: e.target.value}); setPreview(null);}}/>
      </label>)}
    </div>
    {!status?.is_published && <div className="flex flex-wrap gap-3">
      <button className="btn-secondary" disabled={busy || !status} onClick={() => run(async () => {
        const totals = await adminApi.getLedgerPeriodSummary(month, year);
        setFigures({...figures, purchases_value:totals.purchases_value,
          operational_expenses:totals.operational_expenses,
          administrative_expenses:totals.administrative_expenses});
        setPreview(null);
      })}>Fill costs from ledger</button>
      <button className="btn-secondary" disabled={busy || !status} onClick={() => run(async () => setPreview(await adminApi.previewBill(payload())))}>Preview student bills</button>
      <button className="btn-primary" disabled={busy || !preview || preview.chargeable_days === 0} onClick={() => run(async () => {
        const result = await adminApi.publishBill({...payload(), preview_token: preview.preview_token} as Parameters<typeof adminApi.publishBill>[0]);
        setStatus({is_published: true, revision: result.revision, calculation: result});
        setBills(await adminApi.getPublishedBills(month, year)); setPreview(null);
      })}>Publish reviewed bills</button>
    </div>}
    {summary && <p className="font-semibold">{status?.is_published ? `Published revision ${status.revision}` : 'Draft preview'} · {summary.chargeable_days} opted-in student-days · Costs {money(summary.grand_total_expense)} · Fines {money(summary.total_fines)} · Daily allocation rate {money(summary.mess_daily_rate)}</p>}
    {summary && <p className="text-sm">Amounts are allocated to the nearest paisa so student base charges total the monthly costs exactly. The displayed daily rate is rounded.</p>}
    <div className="overflow-auto"><table className="w-full text-sm text-left">
      <thead><tr>{['Student', 'Registration', 'Opted-in days', 'Base charge', 'Fines', 'Total'].map(h => <th className="p-2 border-b" key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((bill: any) => <tr key={bill.student_id}>
        <td className="p-2">{bill.student.name}</td><td>{bill.student.registration_number}</td><td>{bill.effective_days}</td>
        <td>{money(bill.base_charge)}</td><td>{money(bill.total_fines)}</td><td>{money(bill.grand_total)}</td>
      </tr>)}</tbody>
    </table></div>
    {status?.is_published && <div className="space-y-3">
      {status.revision > 0 && <div className="flex gap-3">{(['excel','pdf'] as const).map(format => <button key={format} className="btn-secondary" disabled={busy} onClick={() => run(async () => {await adminApi.downloadReportFile(year,month,format);})}>Download {format.toUpperCase()}</button>)}</div>}
      <label className="block">Reason for correction<input className="stitch-input" value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
      <button className="btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => run(async () => {
        await adminApi.unpublishBill(month,year,reason); setStatus({...status,is_published:false}); setPreview(null); setBills([]); setReason('');
      })}>Reopen for correction</button>
      <p className="text-sm">Reopening hides the current bill until a corrected revision is published. Earlier published revisions are retained for audit.</p>
    </div>}
  </section>;
};
