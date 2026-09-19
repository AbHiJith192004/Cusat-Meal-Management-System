import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { adminApi } from '../services/api';

/**
 * Inventory used to be the first panel here. It is gone from the UI at the
 * owner's request -- the mess does not run stock control through this app, and
 * a catalogue nobody maintained made the ledger's purchase figures look like
 * they should reconcile against stock when they never did. The endpoints are
 * untouched, so nothing recorded is lost and it can come back as a tab.
 */
type Panel = 'committee' | 'attendance';

const panels: {id: Panel; label: string; icon: string}[] = [
  {id: 'committee',  label: 'Committee access', icon: 'badge'},
  {id: 'attendance', label: 'Bulk attendance',  icon: 'fact_check'},
];

const today = () => new Date().toISOString().slice(0, 10);

export const AdminOperationsView: React.FC = () => {
  const [panel, setPanel] = useState<Panel>('committee');
  const [data, setData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ok: boolean; text: string} | null>(null);
  const [committeeForm, setCommitteeForm] = useState({student_id: '', starts_at: '', ends_at: ''});
  const [bulkForm, setBulkForm] = useState({
    student_ids: [] as string[], meal_date: today(), meal_type: 'BREAKFAST', reason: '',
  });

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    // Each panel reads this one `data` and their shapes differ, so switching
    // panels would otherwise render the new panel against the old response
    // while the fetch is still in flight. Clearing it first, and using
    // Array.isArray at every .map site, keeps an inherited Array method (the
    // `entries` collision that once took this whole screen down) from ever
    // being mistaken for data again.
    setData(null);
    try {
      if (panel === 'committee') {
        setData(await adminApi.getCommittee());
        setStudents(await adminApi.getStudentOptions());
      }
      if (panel === 'attendance') setStudents(await adminApi.getStudentOptions());
    } catch (e: any) { setMessage({ok: false, text: e.message}); }
    finally { setLoading(false); }
  }, [panel]);
  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<any>, success: string) => {
    setSaving(true); setMessage(null);
    try { await action(); setMessage({ok: true, text: success}); await load(); }
    catch (e: any) { setMessage({ok: false, text: e.message}); }
    finally { setSaving(false); }
  };

  const assignCommittee = (e: FormEvent) => {
    e.preventDefault();
    run(() => adminApi.assignCommittee({
      ...committeeForm,
      starts_at: new Date(committeeForm.starts_at).toISOString(),
      ends_at: new Date(committeeForm.ends_at).toISOString(),
      scope: 'ATTENDANCE_SCANNER',
    }), 'Committee scanner access assigned.');
  };

  const submitBulk = (e: FormEvent) => {
    e.preventDefault();
    run(() => adminApi.bulkAttendance(bulkForm), `${bulkForm.student_ids.length} attendance records saved.`);
  };

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        <div>
          <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#F47A35]">settings_suggest</span>
            Mess Operations
          </h2>
          <p className="text-xs font-medium text-[#9B7B52]">
            Scanner access for committee students, and attendance recorded in bulk when the scanner was not staffed.
          </p>
        </div>

        {/* Panel sub-navigation */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] p-1.5 flex gap-1 overflow-x-auto hide-scrollbar">
          {panels.map(p => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`shrink-0 lg:flex-1 py-2.5 px-3.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                panel === p.id ? 'bg-[#F47A35] text-white' : 'text-[#9B7B52] hover:bg-[#F7EEDA] hover:text-[#2D1A0E]'
              }`}
            >
              <span className="material-symbols-outlined" style={{fontSize: 17}}>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>

        {message && (
          <div
            role="alert"
            className="rounded-xl px-3.5 py-3 text-xs font-bold flex items-start gap-2"
            style={message.ok
              ? {background: 'var(--green-light)', border: '1px solid #A6DCBB', color: 'var(--green)'}
              : {background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)'}}
          >
            <span className="material-symbols-outlined" style={{fontSize: 17}}>
              {message.ok ? 'check_circle' : 'error'}
            </span>
            <span className="flex-1">{message.text}</span>
          </div>
        )}

        {loading ? (
          <p role="status" className="py-12 text-center font-bold" style={{color: 'var(--text-muted)'}}>Loading…</p>
        ) : panel === 'committee' ? (
          <section className="grid lg:grid-cols-[400px_1fr] gap-4 items-start">
            <Card title="Assign scanner access" icon="person_add">
              <p className="text-xs font-medium text-[#9B7B52] mb-3">
                Grants a student the meal scanner for a fixed window. It expires on its own; revoking
                is only for ending it early. A shorter route exists on the student&rsquo;s own Quick View.
              </p>
              <form className="space-y-3" onSubmit={assignCommittee}>
                <Field label="Student">
                  <select
                    className="stitch-input" required value={committeeForm.student_id}
                    onChange={e => setCommitteeForm({...committeeForm, student_id: e.target.value})}
                  >
                    <option value="">Choose student</option>
                    {students.map(x => (
                      <option key={x.id} value={x.id}>{x.name} ({x.registration_number})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Starts">
                  <input
                    className="stitch-input" type="datetime-local" required value={committeeForm.starts_at}
                    onChange={e => setCommitteeForm({...committeeForm, starts_at: e.target.value})}
                  />
                </Field>
                <Field label="Ends">
                  <input
                    className="stitch-input" type="datetime-local" required value={committeeForm.ends_at}
                    onChange={e => setCommitteeForm({...committeeForm, ends_at: e.target.value})}
                  />
                </Field>
                <Submit busy={saving}>Assign access</Submit>
              </form>
            </Card>

            <Card title="Active committee" icon="groups">
              <Rows empty="No active assignments.">
                {(Array.isArray(data) ? data : []).map((x: any) => (
                  <Row
                    key={x.id}
                    title={x.name}
                    detail={x.registration_number}
                    meta={`Until ${new Date(x.ends_at).toLocaleString('en-IN')}`}
                    action={
                      <button
                        className="text-xs font-bold cursor-pointer"
                        style={{color: 'var(--red)'}}
                        onClick={() => run(
                          () => adminApi.revokeCommittee(x.student_id, 'Committee assignment ended by administrator'),
                          'Access revoked.')}
                      >
                        Revoke
                      </button>
                    }
                  />
                ))}
              </Rows>
            </Card>
          </section>
        ) : (
          <section className="max-w-2xl">
            <Card title="Atomic bulk attendance" icon="fact_check">
              <p className="text-xs font-medium text-[#9B7B52] mb-3">
                Choose up to 300 active students. The whole batch is rejected if any selected record
                already exists, so it can never half-apply.
              </p>
              <form className="space-y-3" onSubmit={submitBulk}>
                <Field label="Date and meal">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="stitch-input" type="date" max={today()} required value={bulkForm.meal_date}
                      onChange={e => setBulkForm({...bulkForm, meal_date: e.target.value})}
                    />
                    <select
                      className="stitch-input" value={bulkForm.meal_type}
                      onChange={e => setBulkForm({...bulkForm, meal_type: e.target.value})}
                    >
                      {['BREAKFAST', 'LUNCH', 'DINNER'].map(x => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                </Field>
                <Field label="Students">
                  <div className="max-h-64 overflow-auto rounded-xl border p-2" style={{borderColor: 'var(--line)'}}>
                    {students.map(x => (
                      <label key={x.id} className="flex gap-2 p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={bulkForm.student_ids.includes(x.id)}
                          onChange={e => setBulkForm({
                            ...bulkForm,
                            student_ids: e.target.checked
                              ? [...bulkForm.student_ids, x.id]
                              : bulkForm.student_ids.filter(id => id !== x.id),
                          })}
                        />
                        <span>{x.name} <small>{x.registration_number}</small></span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Reason">
                  <input
                    className="stitch-input" required minLength={5} value={bulkForm.reason}
                    onChange={e => setBulkForm({...bulkForm, reason: e.target.value})}
                  />
                </Field>
                <Submit busy={saving || !bulkForm.student_ids.length}>
                  Save {bulkForm.student_ids.length} records
                </Submit>
              </form>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
};

const Card: React.FC<{title: string; icon?: string; children: React.ReactNode}> = ({title, icon, children}) => (
  <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs p-5">
    <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2 mb-4">
      {icon && <span className="material-symbols-outlined text-[#F47A35]">{icon}</span>}
      {title}
    </h3>
    {children}
  </div>
);

const Field: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <label className="block text-xs font-bold" style={{color: 'var(--text-body)'}}>
    <span className="block mb-1">{label}</span>
    {children}
  </label>
);

const Submit: React.FC<{busy: boolean; children: React.ReactNode}> = ({busy, children}) => (
  <button
    className="w-full py-2.5 bg-[#F47A35] hover:bg-[#D45E1A] disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer"
    type="submit"
    disabled={busy}
  >
    {busy ? 'Saving…' : children}
  </button>
);

const Rows: React.FC<{empty: string; children: React.ReactNode}> = ({empty, children}) => (
  <div className="divide-y" style={{borderColor: 'var(--line)'}}>
    {React.Children.count(children)
      ? children
      : <p className="py-8 text-center text-sm" style={{color: 'var(--text-muted)'}}>{empty}</p>}
  </div>
);

const Row: React.FC<{title: string; detail: string; meta?: string; action?: React.ReactNode}> = ({
  title, detail, meta, action,
}) => (
  <div className="py-3 flex items-start justify-between gap-3">
    <div>
      <p className="text-sm font-bold" style={{color: 'var(--text-dark)'}}>{title}</p>
      <p className="text-xs mt-1" style={{color: 'var(--text-body)'}}>{detail}</p>
      {meta && <p className="text-[11px] mt-1" style={{color: 'var(--text-muted)'}}>{meta}</p>}
    </div>
    {action}
  </div>
);
