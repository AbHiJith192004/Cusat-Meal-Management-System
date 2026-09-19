import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {adminApi} from '../services/api';

type Status = 'PENDING' | 'VERIFIED' | 'REJECTED';

const money = (v: string | number) =>
  Number(v || 0).toLocaleString('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 2});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_PILL: Record<Status, string> = {
  PENDING:  'bg-[#ea580c]/10 text-[#ea580c] border-[#ea580c]/30',
  VERIFIED: 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/30',
  REJECTED: 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30',
};

export const PaymentsView: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reviewing, setReviewing] = useState<{row: any; decision: 'VERIFIED' | 'REJECTED'} | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Every status is fetched once and filtered here, so the summary cards
      // can count paid against pending without three round trips.
      const data = await adminApi.getPayments();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Could not load payment submissions.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const forPeriod = useMemo(
    () => rows.filter(r => Number(r.month) === month && Number(r.year) === year),
    [rows, month, year]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forPeriod
      .filter(r => statusFilter === 'ALL' || r.status === statusFilter)
      .filter(r => !q
        || (r.student_name || '').toLowerCase().includes(q)
        || (r.registration_number || '').toLowerCase().includes(q)
        || (r.utr || '').toLowerCase().includes(q));
  }, [forPeriod, statusFilter, search]);

  const counts = useMemo(() => ({
    total: forPeriod.length,
    verified: forPeriod.filter(r => r.status === 'VERIFIED').length,
    pending: forPeriod.filter(r => r.status === 'PENDING').length,
    rejected: forPeriod.filter(r => r.status === 'REJECTED').length,
    collected: forPeriod.filter(r => r.status === 'VERIFIED')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0),
  }), [forPeriod]);

  const submit = async () => {
    if (!reviewing) return;
    const {row, decision} = reviewing;
    const text = note.trim();
    // A rejection tells a student their money was not accepted. It has to say
    // why, and the reason reaches them in the notification the server sends.
    if (decision === 'REJECTED' && text.length < 5) {
      setError('Rejecting a payment needs a reason of at least 5 characters. The student is told what it says.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      await adminApi.reviewPayment(row.id, decision, text || 'Verified against the bank statement.');
      setMessage(`${row.student_name || row.registration_number}: payment ${decision.toLowerCase()}.`);
      setReviewing(null); setNote('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not record that decision.');
    } finally { setBusy(false); }
  };

  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const yearOptions = Array.from({length: 4}, (_, i) => now.getFullYear() - i);

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Controls Toolbar */}
        <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">payments</span>
              Student Monthly Payments &amp; Status
            </h2>
            <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
              Students submit the bank UTR for their published bill. Verify it against the bank credit,
              or reject it with a reason the student is shown.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1" htmlFor="pay-month">
                Billing Month
              </label>
              <select
                id="pay-month"
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1" htmlFor="pay-year">
                Billing Year
              </label>
              <select
                id="pay-year"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <button
              onClick={() => load()}
              disabled={loading}
              className="px-3.5 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)'}}>{error}</p>
        )}
        {message && (
          <p role="status" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{background: 'var(--green-light)', border: '1px solid #A6DCBB', color: 'var(--green)'}}>{message}</p>
        )}

        {/* Overview Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {label: 'Submissions', value: String(counts.total), icon: 'groups', tone: '#F47A35'},
            {label: 'Verified', value: String(counts.verified), icon: 'check_circle', tone: '#16a34a'},
            {label: 'Awaiting review', value: String(counts.pending), icon: 'pending_actions', tone: '#ea580c'},
            {label: 'Collected', value: money(counts.collected), icon: 'account_balance', tone: '#2D1A0E'},
          ].map(card => (
            <div key={card.label} className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{background: `${card.tone}1A`, color: card.tone}}
              >
                <span className="material-symbols-outlined">{card.icon}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block truncate">{card.label}</span>
                <span className="text-xl font-black block truncate" style={{color: card.tone}}>{card.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#9B7B52] text-[18px]">search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, registration number or UTR…"
              className="w-full pl-9 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-medium focus:outline-none focus:border-[#F47A35]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <label className="text-[10px] font-extrabold uppercase text-[#9B7B52]" htmlFor="pay-status">
              Payment Status:
            </label>
            <select
              id="pay-status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | Status)}
              className="px-3 py-1.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Awaiting review</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {/* Students Payment Table */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
            <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
              {periodLabel} submissions
            </h3>
            <span className="text-xs font-semibold text-[#9B7B52]">
              Showing {shown.length} of {forPeriod.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-left text-xs">
              <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                <tr>
                  <th className="py-3 px-4">Sl No</th>
                  <th className="py-3 px-4">Reg No</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Ref UTR Number</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFDCB4]">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-[#9B7B52] text-sm">Loading…</td></tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#9B7B52] text-sm">
                      No payment submissions for {periodLabel}.
                      <span className="block text-xs mt-1">
                        Students can only submit once that month&rsquo;s bill has been published.
                      </span>
                    </td>
                  </tr>
                ) : (
                  shown.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                      <td className="py-3 px-4 text-[#9B7B52]">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#F47A35]">{row.registration_number || '—'}</td>
                      <td className="py-3 px-4 font-bold text-[#2D1A0E]">{row.student_name || 'Unknown student'}</td>
                      <td className="py-3 px-4 text-[#6B4A28]">
                        {row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '—'}
                        {row.bill_revision ? (
                          <span className="block text-[10.5px] text-[#9B7B52]">revision {row.bill_revision}</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-[#2D1A0E]">{money(row.amount)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-0.5 border text-xs font-extrabold rounded-full inline-block ${STATUS_PILL[row.status as Status] || ''}`}>
                          {row.status}
                        </span>
                        {row.review_note && (
                          <span className="block text-[10.5px] text-[#9B7B52] mt-1 max-w-[180px] mx-auto">
                            {row.review_note}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#5C3D1E] select-all">{row.utr}</td>
                      <td className="py-3 px-4 text-center">
                        {row.status === 'PENDING' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => { setReviewing({row, decision: 'VERIFIED'}); setNote(''); setError(''); }}
                              className="px-2.5 py-1 bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => { setReviewing({row, decision: 'REJECTED'}); setNote(''); setError(''); }}
                              className="px-2.5 py-1 bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#dc2626] font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-[#9B7B52]">
                            {row.reviewed_at ? `Reviewed ${new Date(row.reviewed_at).toLocaleDateString('en-IN')}` : 'Reviewed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Review confirmation ──────────────────────────────────── */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#2D1A0E]">
              {reviewing.decision === 'VERIFIED' ? 'Verify this payment?' : 'Reject this payment?'}
            </h3>
            <div className="text-sm text-[#5C3D1E] space-y-1">
              <p className="font-bold">{reviewing.row.student_name || reviewing.row.registration_number}</p>
              <p>{money(reviewing.row.amount)} · UTR <span className="font-mono">{reviewing.row.utr}</span></p>
              <p className="text-xs text-[#9B7B52]">{periodLabel} bill</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="review-note">
                {reviewing.decision === 'VERIFIED'
                  ? 'Note (optional)'
                  : 'Reason (required, at least 5 characters)'}
              </label>
              <input
                id="review-note"
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={500}
                placeholder={reviewing.decision === 'VERIFIED'
                  ? 'Verified against the bank statement.'
                  : 'e.g. No matching credit found for this UTR'}
                className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
            </div>

            <p className="text-[11px] font-semibold text-[#9B7B52]">
              The student is notified either way, and a submission can only be reviewed once.
            </p>

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={busy || (reviewing.decision === 'REJECTED' && note.trim().length < 5)}
                className={`flex-1 py-2.5 text-white font-semibold rounded-xl cursor-pointer disabled:opacity-50 ${
                  reviewing.decision === 'VERIFIED'
                    ? 'bg-[#16a34a] hover:bg-[#15803d]'
                    : 'bg-[#dc2626] hover:bg-[#b91c1c]'
                }`}
              >
                {busy ? 'Saving…' : reviewing.decision === 'VERIFIED' ? 'Verify payment' : 'Reject payment'}
              </button>
              <button
                onClick={() => { setReviewing(null); setNote(''); }}
                className="px-4 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
