import React, { useEffect, useState } from 'react';
import { studentApi } from '../services/api';
import { ChefMascot } from '../components/FoodIllustrations';

interface FineLine {
  meal_date: string;
  meal_type: string;
  amount: string;
  status: string;
}

interface BillData {
  month: number;
  year: number;
  student: { name: string; registration_number: string };
  mess_daily_rate: string;
  effective_days: number;
  days_attended: string[];
  food_charge: string;
  fines: FineLine[];
  total_fines: string;
  grand_total: string;
  published_at: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const inr = (v: string | number) =>
  Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A student's own monthly bill.
 *
 * Deliberately styled as a paper bill rather than another dashboard card —
 * this is a document someone might keep, not a screen they operate. The
 * "download" action is the browser's own print-to-PDF: a dedicated print
 * stylesheet hides the app chrome and leaves only the bill sheet, so what
 * prints is pixel-identical to what's on screen instead of a second
 * PDF-rendering pipeline that could drift out of sync with it.
 */
export const StudentBillView: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bill, setBill] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotPublished(false);
    setError(null);

    studentApi
      .getMyBill(month, year)
      .then(data => { if (!cancelled) setBill(data); })
      .catch((e: any) => {
        if (cancelled) return;
        const msg = e?.message || '';
        if (msg.includes('BILL_NOT_PUBLISHED') || msg.includes('not been published')) {
          setNotPublished(true);
        } else {
          setError('Could not load your bill. Try again in a moment.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [month, year]);

  const monthOptions = MONTH_NAMES.map((name, i) => ({ label: name, value: i + 1 }));
  const yearOptions = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const billNo = bill
    ? `MC-${bill.year}${String(bill.month).padStart(2, '0')}-${bill.student.registration_number}`
    : '';

  return (
    <main className="page-container">
      {/* ── Screen-only controls; hidden entirely when printing ── */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
            My Bill
          </h2>
          <p className="text-[13px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Your official mess bill, once the month is published.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="stitch-input"
            style={{ width: 'auto', padding: '9px 12px' }}
            aria-label="Month"
          >
            {monthOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="stitch-input"
            style={{ width: 'auto', padding: '9px 12px' }}
            aria-label="Year"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {bill && (
            <button onClick={() => window.print()} className="btn-primary" style={{ padding: '10px 18px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>download</span>
              Download
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div
          className="rounded-2xl px-6 py-16 text-center no-print"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        >
          <span
            className="material-symbols-outlined animate-spin"
            style={{ fontSize: 28, color: 'var(--text-light)' }}
          >
            progress_activity
          </span>
        </div>
      )}

      {!loading && notPublished && (
        <div
          className="rounded-2xl px-6 py-14 text-center no-print flex flex-col items-center gap-3"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        >
          <ChefMascot size={64} />
          <p className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Not published yet
          </p>
          <p className="text-[13px] font-semibold max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
            The mess office hasn&rsquo;t finalized {MONTH_NAMES[month - 1]} {year}&rsquo;s bill. Check back once
            it&rsquo;s published.
          </p>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-2xl px-6 py-14 text-center no-print"
          style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}
        >
          {error}
        </div>
      )}

      {!loading && bill && (
        <div className="bill-sheet">
          {/* Letterhead */}
          <div className="bill-header">
            <div className="bill-brand">
              <span className="bill-brand-mark">🍴</span>
              <div>
                <p className="bill-brand-name">CUSAT MessConnect</p>
                <p className="bill-brand-sub">Hostel Mess &middot; Cochin University of Science and Technology</p>
              </div>
            </div>
            <div className="bill-meta">
              <p><span>Bill No.</span> {billNo}</p>
              <p><span>Period</span> {MONTH_NAMES[bill.month - 1]} {bill.year}</p>
              <p><span>Issued</span> {bill.published_at ? new Date(bill.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>

          <div className="bill-divider" />

          {/* Billed-to */}
          <div className="bill-billto">
            <p className="bill-label">Billed to</p>
            <p className="bill-student-name">{bill.student.name}</p>
            <p className="bill-student-reg">Registration No. {bill.student.registration_number}</p>
          </div>

          {/* Line items */}
          <table className="bill-table">
            <thead>
              <tr>
                <th style={{ width: '52%' }}>Description</th>
                <th className="num" style={{ width: '16%' }}>Qty</th>
                <th className="num" style={{ width: '16%' }}>Rate</th>
                <th className="num" style={{ width: '16%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Mess food charge
                  <span className="bill-line-note">Days attended this month, at the published daily rate</span>
                </td>
                <td className="num">{bill.effective_days}</td>
                <td className="num">₹{inr(bill.mess_daily_rate)}</td>
                <td className="num">₹{inr(bill.food_charge)}</td>
              </tr>

              {bill.fines.map((f, i) => (
                <tr key={i}>
                  <td>
                    Fine — missed {f.meal_type.charAt(0) + f.meal_type.slice(1).toLowerCase()}
                    <span className="bill-line-note">
                      {new Date(f.meal_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      {f.status === 'PAID' ? ' · already paid' : ''}
                    </span>
                  </td>
                  <td className="num">1</td>
                  <td className="num">₹{inr(f.amount)}</td>
                  <td className="num">₹{inr(f.amount)}</td>
                </tr>
              ))}

              {bill.fines.length === 0 && (
                <tr>
                  <td colSpan={4} className="bill-no-fines">No fines this month.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="bill-totals">
            <div className="bill-totals-row">
              <span>Food charge</span>
              <span>₹{inr(bill.food_charge)}</span>
            </div>
            <div className="bill-totals-row">
              <span>Fines</span>
              <span>₹{inr(bill.total_fines)}</span>
            </div>
            <div className="bill-totals-row bill-grand-total">
              <span>Total due</span>
              <span>₹{inr(bill.grand_total)}</span>
            </div>
          </div>

          <div className="bill-footer">
            <p>This is a system-generated bill from CUSAT MessConnect. For queries, contact the mess office.</p>
          </div>
        </div>
      )}
    </main>
  );
};
