import React, {useCallback, useEffect, useState} from 'react';
import {adminApi} from '../services/api';

const TABS = ['PENDING', 'VERIFIED', 'REJECTED', 'ALL'] as const;
type Tab = typeof TABS[number];

const money = (v: string | number) =>
  Number(v || 0).toLocaleString('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 2});

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

const TONE: Record<string, string> = {
  PENDING: '#B7470D', VERIFIED: '#006c49', REJECTED: 'var(--red)',
};

export const PaymentsView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-payment note, so reviewing one does not carry a note into the next.
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await adminApi.getPayments(tab === 'ALL' ? undefined : tab);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Could not load payment submissions.');
    } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const review = async (row: any, decision: 'VERIFIED' | 'REJECTED') => {
    const note = (notes[row.id] || '').trim();
    // A rejection tells a student their money was not accepted. It has to say
    // why, and the reason reaches them in the notification the server sends.
    if (decision === 'REJECTED' && note.length < 5) {
      setError('Rejecting a payment needs a reason of at least 5 characters. The student is told what it says.');
      return;
    }
    setBusyId(row.id); setError(''); setMessage('');
    try {
      await adminApi.reviewPayment(row.id, decision, note || 'Verified against the bank statement.');
      setMessage(`${row.student_name || row.registration_number}: payment ${decision.toLowerCase()}.`);
      setNotes({...notes, [row.id]: ''});
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not record that decision.');
    } finally { setBusyId(null); }
  };

  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(t => (
          <button key={t} className={tab === t ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                  onClick={() => setTab(t)}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
        <span className="ml-auto text-sm font-bold" style={{color: 'var(--text-dark)'}}>
          {rows.length} {rows.length === 1 ? 'submission' : 'submissions'} · {money(total)}
        </span>
      </div>

      {error && <p role="alert" className="text-sm" style={{color: 'var(--red)'}}>{error}</p>}
      {message && <p className="text-sm" style={{color: '#006c49'}}>{message}</p>}

      {rows.length === 0 ? (
        <div className="stitch-card p-8 text-center">
          <p className="text-sm" style={{color: 'var(--text-muted)'}}>
            {loading ? 'Loading…'
              : tab === 'PENDING' ? 'Nothing waiting to be reviewed.'
              : 'No submissions with this status.'}
          </p>
          {!loading && tab === 'PENDING' && (
            <p className="text-xs mt-2" style={{color: 'var(--text-muted)'}}>
              Students submit a UTR against a published bill. Nothing appears here until a bill is published.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => (
            <li key={row.id} className="stitch-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold" style={{color: 'var(--text-dark)'}}>
                    {row.student_name || 'Unknown student'}
                    <span className="font-normal text-xs" style={{color: 'var(--text-muted)'}}>
                      {' '}· {row.registration_number}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5" style={{color: 'var(--text-body)'}}>
                    UTR <span className="font-mono select-all">{row.utr}</span>
                  </p>
                  <p className="text-[11px] mt-0.5" style={{color: 'var(--text-muted)'}}>
                    {row.month ? `${MONTHS[row.month]} ${row.year} bill` : 'Bill'}
                    {row.bill_revision ? ` · revision ${row.bill_revision}` : ''}
                    {row.created_at ? ` · submitted ${new Date(row.created_at).toLocaleString('en-IN')}` : ''}
                  </p>
                  {row.review_note && (
                    <p className="text-[11px] mt-1" style={{color: 'var(--text-muted)'}}>
                      Note: {row.review_note}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-xl font-bold" style={{color: 'var(--text-dark)'}}>
                    {money(row.amount)}
                  </p>
                  <p className="text-[11px] font-bold uppercase tracking-wider"
                     style={{color: TONE[row.status] || 'var(--text-muted)'}}>
                    {row.status}
                  </p>
                </div>
              </div>

              {row.status === 'PENDING' && (
                <div className="mt-3 pt-3 border-t space-y-2" style={{borderColor: 'var(--line)'}}>
                  <input className="stitch-input" maxLength={500}
                         placeholder="Note — required to reject, optional to verify"
                         value={notes[row.id] || ''}
                         onChange={e => setNotes({...notes, [row.id]: e.target.value})} />
                  <div className="flex gap-2">
                    <button className="btn-primary text-xs" disabled={busyId === row.id}
                            onClick={() => review(row, 'VERIFIED')}>
                      {busyId === row.id ? 'Saving…' : 'Verify payment'}
                    </button>
                    <button className="btn-secondary text-xs" disabled={busyId === row.id}
                            onClick={() => review(row, 'REJECTED')}>
                      Reject
                    </button>
                  </div>
                  <p className="text-[11px]" style={{color: 'var(--text-muted)'}}>
                    Either decision notifies the student and is final — a submission can only be reviewed once.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
