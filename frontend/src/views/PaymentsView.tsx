import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {adminApi} from '../services/api';
import { Modal } from '../components/Modal';
import {money, downloadCsv} from '../utils/format';

type Status = 'PENDING' | 'VERIFIED' | 'REJECTED';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const CATEGORY_LABEL: Record<string, string> = {
  HOSTELLER: 'Hosteller', DAY_SCHOLAR: 'Day scholar', OUTMESS: 'Out-mess',
};
const CAMPUS_LABEL: Record<string, string> = {
  MAIN_CAMPUS: 'Main Campus', LAKESIDE_CAMPUS: 'Lakeside',
};

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
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [directory, setDirectory] = useState<any[]>([]);
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
      // The roll carries mess id, membership category and campus; payment
      // submissions carry only the name and registration number, so the two
      // are joined here to give the sheet the same columns as Billing.
      const [data, students] = await Promise.all([
        adminApi.getPayments(),
        adminApi.getAllStudents().catch(() => []),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setDirectory(Array.isArray(students) ? students : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Could not load payment submissions.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  const byReg = useMemo(() => {
    const map: Record<string, any> = {};
    directory.forEach(s => { map[s.registration_number] = s; });
    return map;
  }, [directory]);

  /** Payment rows for the chosen period, each carrying its student's roll details. */
  const forPeriod = useMemo(
    () => rows
      .filter(r => Number(r.month) === month && Number(r.year) === year)
      .map(r => {
        const profile = byReg[r.registration_number] || {};
        return {
          ...r,
          messId: profile.mess_id || (r.registration_number ? `M-${r.registration_number}` : '\u2014'),
          studentType: profile.student_type || '',
          category: CATEGORY_LABEL[profile.student_type] || profile.student_type || '\u2014',
          campus: CAMPUS_LABEL[profile.campus_location] || profile.campus_location || '\u2014',
        };
      }),
    [rows, month, year, byReg]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forPeriod
      .filter(r => statusFilter === 'ALL' || r.status === statusFilter)
      .filter(r => categoryFilter === 'ALL' || r.studentType === categoryFilter)
      .filter(r => !q
        || (r.student_name || '').toLowerCase().includes(q)
        || (r.registration_number || '').toLowerCase().includes(q)
        || (r.messId || '').toLowerCase().includes(q)
        || (r.utr || '').toLowerCase().includes(q));
  }, [forPeriod, statusFilter, categoryFilter, search]);

  const exportSheet = () => {
    downloadCsv(`CUSAT_Student_Payments_${MONTHS[month - 1]}_${year}.csv`, [
      [`CUSAT Mess Student Monthly Payments - ${periodLabel}`],
      [`${shown.length} of ${forPeriod.length} submissions (filters applied)`],
      [],
      ['Sl No', 'Mess ID', 'Reg No', 'Name', 'Category', 'Campus', 'Submitted',
       'Bill Revision', 'Amount (INR)', 'Status', 'Ref UTR Number', 'Reviewed', 'Review Note'],
      ...shown.map((r, i) => [
        String(i + 1), r.messId, r.registration_number || '', r.student_name || '',
        r.category, r.campus,
        r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
        r.bill_revision ? String(r.bill_revision) : '',
        Number(r.amount || 0).toFixed(2), r.status, r.utr || '',
        r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('en-IN') : '',
        r.review_note || '',
      ]),
      [],
      ['TOTALS', '', '', '', '', '', '', '',
       shown.reduce((sum, r) => sum + Number(r.amount || 0), 0).toFixed(2)],
      ['VERIFIED ONLY', '', '', '', '', '', '', '',
       shown.filter(r => r.status === 'VERIFIED')
            .reduce((sum, r) => sum + Number(r.amount || 0), 0).toFixed(2)],
    ]);
  };

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
            {label: 'Collected', value: Number(counts.collected).toLocaleString('en-IN',
              {style: 'currency', currency: 'INR', maximumFractionDigits: 0}),
             icon: 'account_balance', tone: '#2D1A0E'},
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
            <label className="text-[10px] font-extrabold uppercase text-[#9B7B52]" htmlFor="pay-category">
              Category:
            </label>
            <select
              id="pay-category"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="HOSTELLER">Hosteller</option>
              <option value="DAY_SCHOLAR">Day scholar</option>
              <option value="OUTMESS">Out-mess</option>
            </select>

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

            <button
              onClick={exportSheet}
              disabled={shown.length === 0}
              className="px-4 py-2 bg-[#15803d] hover:bg-[#126b33] btn-inert text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
              <span>Export Payments Excel</span>
            </button>
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
                  <th className="py-3 px-4">Mess ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Reg No</th>
                  <th className="py-3 px-4 text-center">Category</th>
                  <th className="py-3 px-4 text-center">Campus</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Ref UTR Number</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFDCB4]">
                {loading ? (
                  <tr><td colSpan={11} className="py-8 text-center text-[#9B7B52] text-sm">Loading…</td></tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-[#9B7B52] text-sm">
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
                      <td className="py-3 px-4 font-mono font-bold text-[#F47A35]">{row.messId}</td>
                      <td className="py-3 px-4 font-bold text-[#2D1A0E]">{row.student_name || 'Unknown student'}</td>
                      <td className="py-3 px-4 font-mono text-[#5C3D1E]">{row.registration_number || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 bg-[#F7EEDA] text-[#2D1A0E] font-bold text-xs rounded-lg border border-[#E3CB9B] inline-block whitespace-nowrap">
                          {row.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-[#6B4A28] whitespace-nowrap">{row.campus}</td>
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
                              className="px-2.5 py-1 bg-[#15803d] hover:bg-[#126b33] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
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
              {shown.length > 0 && (
                <tfoot className="bg-[#FDF7EA] font-black text-xs border-t-2 border-[#E3CB9B] text-[#2D1A0E]">
                  <tr>
                    <td colSpan={6} className="py-4 px-4 uppercase tracking-wider">
                      Totals for {shown.length} shown {shown.length === 1 ? 'submission' : 'submissions'}:
                    </td>
                    <td className="py-4 px-4 text-[#9B7B52] font-semibold">
                      {shown.filter(r => r.status === 'VERIFIED').length} verified
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-[#F47A35] bg-[#F47A35]/10">
                      {money(shown.reduce((sum, r) => sum + Number(r.amount || 0), 0))}
                    </td>
                    <td colSpan={3} className="py-4 px-4 text-[#9B7B52] font-semibold">
                      {money(shown.filter(r => r.status === 'VERIFIED')
                        .reduce((sum, r) => sum + Number(r.amount || 0), 0))} verified against the bank
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ── Review confirmation ──────────────────────────────────── */}
      {reviewing && (
        <Modal open scrim={false}><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                className={`flex-1 py-2.5 text-white font-semibold rounded-xl cursor-pointer btn-inert ${
                  reviewing.decision === 'VERIFIED'
                    ? 'bg-[#15803d] hover:bg-[#126b33]'
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
        </div></Modal>
      )}
    </div>
  );
};
