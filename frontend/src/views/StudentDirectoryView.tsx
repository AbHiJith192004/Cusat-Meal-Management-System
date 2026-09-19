import React, { useState, useEffect, useRef } from 'react';
import { StudentRecord } from '../types';
import { adminApi } from '../services/api';
import { CreateAdminModal } from '../components/CreateAdminModal';
import { Modal } from '../components/Modal';

interface StudentDirectoryViewProps {
  /** Only a Super Warden may create administrator accounts. */
  isSuperAdmin?: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  HOSTELLER: 'Hosteller',
  DAY_SCHOLAR: 'Day scholar',
  OUTMESS: 'Out-mess',
};

const CAMPUS_LABEL: Record<string, string> = {
  MAIN_CAMPUS: 'Main Campus',
  LAKESIDE_CAMPUS: 'Lakeside',
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/30',
  PENDING: 'bg-[#ea580c]/10 text-[#ea580c] border-[#ea580c]/30',
  SUSPENDED: 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30',
  INACTIVE: 'bg-[#9B7B52]/10 text-[#6B4A28] border-[#9B7B52]/30',
};

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export const StudentDirectoryView: React.FC<StudentDirectoryViewProps> = ({ isSuperAdmin = false }) => {
  const requestSequence = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [apiStudents, setApiStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<{id: string; code: string; expiry: string} | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupReason, setSetupReason] = useState('');
  // Scanner (committee) access, granted straight from the student panel so
  // staff do not have to memorise a name and go hunting in a dropdown on
  // the Operations screen.
  const [committee, setCommittee] = useState<any[]>([]);
  const [scannerDays, setScannerDays] = useState('7');
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  // Membership is the one thing on this panel that changes what a student is
  // CHARGED, so it is edited deliberately -- with a reason -- rather than by
  // a dropdown that saves on change.
  const [memberType, setMemberType] = useState('HOSTELLER');
  const [memberCampus, setMemberCampus] = useState('MAIN_CAMPUS');
  const [memberReason, setMemberReason] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSaved, setMemberSaved] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const [newStudent, setNewStudent] = useState({
    name: '',
    regNo: '',
    messId: '',
    room: '',
    dateOfBirth: '',
    department: 'Computer Science & Engineering',
    phone: '',
    // Read and written in three places below but missing from this initial
    // shape, so the field was typed away and never persisted.
    campusLocation: 'MAIN_CAMPUS',
    studentType: 'HOSTELLER',
  });

  const fetchStudents = async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await adminApi.getAllStudents(searchQuery);
      if (sequence !== requestSequence.current) return;
      if (Array.isArray(data)) {
        const formatted: StudentRecord[] = data.map((s: any) => ({
          id: s.id,
          messId: s.mess_id || `M-${s.registration_number}`,
          regNo: s.registration_number,
          name: s.name,
          room: 'Hostel Block',
          avatar: s.photo_url || '',
          lunchStatus: 'Confirmed',
          attendanceStatus: 'Pending',
          accountStatus: s.account_status,
          attendancePct: 0,
          fines: 0,
          category: (s.student_type as any) || 'HOSTELLER',
          campusLocation: s.campus_location || 'MAIN_CAMPUS',
          phone: '',
          mealsDone: s.meals_done || 0,
          mealsSkipped: s.meals_skipped || 0,
        }));
        setApiStudents(formatted);
      }
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      setApiStudents([]);
      setLoadError(e instanceof Error ? e.message : 'Could not load student records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchStudents, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Active scanner grants, so the panel can show whether THIS student
  // already holds one rather than offering to grant a second (the server
  // rejects overlapping assignments anyway, but the error is a poor way to
  // learn it). Fetched once, and refreshed after every grant or revoke.
  const fetchCommittee = async () => {
    try {
      const rows = await adminApi.getCommittee();
      setCommittee(Array.isArray(rows) ? rows : []);
    } catch { setCommittee([]); }
  };
  useEffect(() => { fetchCommittee(); }, []);

  const scannerGrant = selectedStudent
    ? committee.find((c: any) => c.student_id === selectedStudent.id)
    : undefined;

  const filteredStudents = apiStudents.filter((student) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      student.name.toLowerCase().includes(q) ||
      student.regNo.toLowerCase().includes(q) ||
      student.messId.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && student.accountStatus === 'ACTIVE') ||
      (statusFilter === 'Pending' && student.accountStatus === 'PENDING');

    const matchesCategory = categoryFilter === 'ALL' || student.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const openStudent = (student: StudentRecord) => {
    setSelectedStudent(student);
    setSetupReason('');
    setSetupResult(null);
    setSetupError(null);
    setScannerError(null);
    setMemberType(String(student.category || 'HOSTELLER'));
    setMemberCampus(String(student.campusLocation || 'MAIN_CAMPUS'));
    setMemberReason('');
    setMemberError(null);
    setMemberSaved(false);
  };

  /** True once the admin has actually picked something different. */
  const membershipDirty = Boolean(selectedStudent) && (
    memberType !== String(selectedStudent?.category || 'HOSTELLER') ||
    memberCampus !== String(selectedStudent?.campusLocation || 'MAIN_CAMPUS'));

  const saveMembership = async () => {
    if (!selectedStudent) return;
    setMemberBusy(true); setMemberError(null); setMemberSaved(false);
    try {
      await adminApi.updateMembership(selectedStudent.id, {
        student_type: memberType,
        campus_location: memberCampus,
        reason: memberReason.trim(),
      });
      setMemberSaved(true);
      setMemberReason('');
      setSelectedStudent({ ...selectedStudent, category: memberType as any, campusLocation: memberCampus as any });
      await fetchStudents();
    } catch (err: any) {
      setMemberError(err.message || 'Could not change the membership.');
    } finally { setMemberBusy(false); }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.regNo || !newStudent.dateOfBirth) return;

    setAddLoading(true);
    setAddError(null);
    try {
      await adminApi.createStudent({
        name: newStudent.name.trim(),
        registration_number: newStudent.regNo.trim(),
        date_of_birth: newStudent.dateOfBirth,
        department: newStudent.department,
        mess_id: newStudent.messId.trim() || undefined,
        student_type: newStudent.studentType,
        campus_location: newStudent.campusLocation,
      });
      setShowAddModal(false);
      setNewStudent({
        name: '', regNo: '', messId: '', room: '', dateOfBirth: '',
        department: 'Computer Science & Engineering', phone: '',
        campusLocation: 'MAIN_CAMPUS', studentType: 'HOSTELLER',
      });
      await fetchStudents();
    } catch (err: any) {
      setAddError(err.message || 'Failed to create student account.');
    } finally {
      setAddLoading(false);
    }
  };

  const counts = {
    total: apiStudents.length,
    active: apiStudents.filter(s => s.accountStatus === 'ACTIVE').length,
    pending: apiStudents.filter(s => s.accountStatus === 'PENDING').length,
    outmess: apiStudents.filter(s => s.category === 'OUTMESS').length,
  };

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">badge</span>
              Master Student Directory &amp; Records
            </h2>
            <p className="text-xs font-medium text-[#9B7B52]">
              Student profiles, mess membership and account status. Click any student for full details.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <button
                onClick={() => setShowCreateAdmin(true)}
                className="px-4 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                Create Admin User
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Add Student
            </button>
          </div>
        </div>

        {/* Roll summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'On the roll', value: counts.total, icon: 'groups', tone: '#F47A35' },
            { label: 'Activated', value: counts.active, icon: 'verified_user', tone: '#16a34a' },
            { label: 'Not activated', value: counts.pending, icon: 'hourglass_top', tone: '#ea580c' },
            { label: 'Out-mess', value: counts.outmess, icon: 'no_meals', tone: '#6B7280' },
          ].map(card => (
            <div key={card.label} className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${card.tone}1A`, color: card.tone }}
              >
                <span className="material-symbols-outlined">{card.icon}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block truncate">{card.label}</span>
                <span className="text-xl font-black block" style={{ color: card.tone }}>{card.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filter & Search Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-96">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student name, reg no, mess ID…"
              className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
            />
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Membership category"
              className="px-3 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-semibold text-[#5C3D1E] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="HOSTELLER">Hosteller</option>
              <option value="DAY_SCHOLAR">Day scholar</option>
              <option value="OUTMESS">Out-mess</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Account status"
              className="px-3 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-semibold text-[#5C3D1E] cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Account active</option>
              <option value="Pending">Activation pending</option>
            </select>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
             style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}>
            {loadError} No cached or sample students are being displayed.
          </p>
        )}

        {/* Master Student Data Table */}
        <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
            <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F47A35]">group</span>
              Student Records
            </h3>
            <span className="text-xs font-semibold text-[#9B7B52]">
              Showing {filteredStudents.length} of {apiStudents.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table text-left text-sm">
              <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                <tr>
                  <th className="py-3.5 px-4">Photo</th>
                  <th className="py-3.5 px-4">Mess ID</th>
                  <th className="py-3.5 px-4">Student Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Campus</th>
                  <th className="py-3.5 px-4 text-center">Account</th>
                  <th className="py-3.5 px-4 text-center">Meals done / cut</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFDCB4]">
                {loading ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9B7B52] text-sm">Loading student records…</td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#9B7B52] text-sm">
                      <span className="material-symbols-outlined text-[36px] text-[#BFA37A] block mb-1">group_off</span>
                      <span className="font-bold text-base text-[#5C3D1E] block">No Student Records Found</span>
                      <span className="text-xs block mt-1">
                        Use &ldquo;Add Student&rdquo; above for one student. A whole intake is loaded with
                        ops/import_students.py; there is no upload control here yet.
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openStudent(row)}
                      className="hover:bg-[#FDF7EA] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        {row.avatar ? (
                          <img src={row.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-[#E3CB9B]" />
                        ) : (
                          <span
                            className="w-10 h-10 rounded-full bg-[#F47A35]/10 text-[#F47A35] font-bold text-xs flex items-center justify-center"
                            aria-hidden="true"
                          >
                            {initials(row.name)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-[#F47A35]">{row.messId}</td>
                      <td className="py-3 px-4 font-bold text-[#2D1A0E]">
                        {row.name}
                        <span className="block text-[11px] font-normal text-[#9B7B52]">Reg: {row.regNo}</span>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-[#5C3D1E]">
                        <span className="px-2.5 py-1 bg-[#F7EEDA] text-[#2D1A0E] rounded-lg border border-[#E3CB9B] whitespace-nowrap">
                          {CATEGORY_LABEL[String(row.category)] || row.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#6B4A28] whitespace-nowrap">
                        {CAMPUS_LABEL[String(row.campusLocation)] || row.campusLocation}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-3 py-1 border text-xs font-extrabold rounded-full whitespace-nowrap ${STATUS_PILL[row.accountStatus || 'PENDING'] || ''}`}>
                          {row.accountStatus || 'PENDING'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-xs font-bold text-[#5C3D1E]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span className="text-[#16a34a]">{row.mealsDone ?? 0}</span>
                        <span className="text-[#BFA37A]"> / </span>
                        <span className="text-[#dc2626]">{row.mealsSkipped ?? 0}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openStudent(row); }}
                          className="px-3 py-1 bg-[#F47A35]/10 hover:bg-[#F47A35] text-[#F47A35] hover:text-[#2D1A0E] font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                          Quick View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Quick View ───────────────────────────────────────────── */}
      <Modal open={Boolean(selectedStudent)} onClose={() => setSelectedStudent(null)} panelClassName="max-w-md space-y-4">
        {selectedStudent && (
          <>
            <div className="flex justify-between items-start gap-3 pb-4 border-b border-[#EFDCB4]">
              <div className="flex items-center gap-3 min-w-0">
                {selectedStudent.avatar ? (
                  <img src={selectedStudent.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-[#F47A35]" />
                ) : (
                  <span
                    className="w-14 h-14 shrink-0 rounded-full bg-[#F47A35]/10 text-[#F47A35] flex items-center justify-center text-lg font-bold"
                    aria-hidden="true"
                  >
                    {initials(selectedStudent.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="font-display text-[19px] font-bold text-[#2D1A0E] truncate">{selectedStudent.name}</h3>
                  <p className="text-[11.5px] font-semibold text-[#9B7B52]">
                    Reg {selectedStudent.regNo} · {selectedStudent.messId}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="px-2.5 py-0.5 bg-[#F7EEDA] text-[#2D1A0E] rounded-lg border border-[#E3CB9B] text-[11px] font-bold">
                      {CATEGORY_LABEL[String(selectedStudent.category)] || selectedStudent.category}
                    </span>
                    <span className={`px-2.5 py-0.5 border rounded-lg text-[11px] font-bold ${STATUS_PILL[selectedStudent.accountStatus || 'PENDING'] || ''}`}>
                      {selectedStudent.accountStatus || 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="w-9 h-9 shrink-0 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Meal overview */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#16a34a]/5 p-3 rounded-xl border border-[#16a34a]/30">
                <span className="text-[10px] font-extrabold uppercase text-[#16a34a] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Meals done
                </span>
                <span className="text-xl font-black text-[#16a34a] block mt-0.5">{selectedStudent.mealsDone ?? 0}</span>
              </div>
              <div className="bg-[#dc2626]/5 p-3 rounded-xl border border-[#dc2626]/30">
                <span className="text-[10px] font-extrabold uppercase text-[#dc2626] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                  Mess cuts
                </span>
                <span className="text-xl font-black text-[#dc2626] block mt-0.5">{selectedStudent.mealsSkipped ?? 0}</span>
              </div>
            </div>

            {/* Mess membership -- the only field here that changes a bill */}
            <section className="p-4 rounded-xl border border-[#EFDCB4] bg-[#FDF7EA] space-y-2" aria-label="Mess membership">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F47A35] block">
                Mess membership
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="member-type">Category</label>
                  <select
                    id="member-type"
                    value={memberType}
                    onChange={e => { setMemberType(e.target.value); setMemberSaved(false); }}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="HOSTELLER">Inmate (hosteller)</option>
                    <option value="DAY_SCHOLAR">Day scholar</option>
                    <option value="OUTMESS">Out-mess</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="member-campus">Campus</label>
                  <select
                    id="member-campus"
                    value={memberCampus}
                    onChange={e => { setMemberCampus(e.target.value); setMemberSaved(false); }}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="MAIN_CAMPUS">Main Campus</option>
                    <option value="LAKESIDE_CAMPUS">Lakeside</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] font-semibold text-[#9B7B52]">
                {memberType === 'OUTMESS'
                  ? 'Out-mess students take no meals and are never billed or fined.'
                  : memberCampus === 'LAKESIDE_CAMPUS'
                  ? 'Lakeside is billed at its own rate.'
                  : 'Counts towards the mess roll and is billed each month.'}
                {' '}Published bills are not changed &mdash; this applies from the next calculation.
              </p>

              {membershipDirty && (
                <>
                  <label className="block text-xs font-bold text-[#6B4A28]" htmlFor="member-reason">
                    Reason for the change (at least 5 characters)
                  </label>
                  <input
                    id="member-reason"
                    value={memberReason}
                    onChange={e => setMemberReason(e.target.value)}
                    placeholder="e.g. Moved off the mess from this month, confirmed with the warden"
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                  <button
                    disabled={memberBusy || memberReason.trim().length < 5}
                    onClick={saveMembership}
                    className="w-full py-2 bg-[#F47A35] hover:bg-[#F68C51] disabled:opacity-50 text-[#2D1A0E] font-bold text-xs rounded-xl cursor-pointer"
                  >
                    {memberBusy ? 'Saving…' : 'Save membership change'}
                  </button>
                </>
              )}
              {memberSaved && (
                <p role="status" className="text-xs font-bold" style={{ color: 'var(--green)' }}>
                  Membership updated and recorded in the audit log.
                </p>
              )}
              {memberError && <p role="alert" className="text-xs font-bold" style={{ color: 'var(--red)' }}>{memberError}</p>}
            </section>

            {/* Account setup */}
            <section className="p-4 rounded-xl border border-[#EFDCB4] bg-[#FDF7EA] space-y-2" aria-label="Account setup">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F47A35] block">
                Password setup code
              </span>
              <label className="block text-xs font-bold text-[#6B4A28]" htmlFor="setup-reason">
                Identity verification note
              </label>
              <input
                id="setup-reason"
                value={setupReason}
                onChange={e => setSetupReason(e.target.value)}
                placeholder="How was this student's identity checked?"
                className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
              <button
                disabled={setupBusy || setupReason.trim().length < 10}
                onClick={async () => {
                  setSetupBusy(true); setSetupError(null); setSetupResult(null);
                  try {
                    const result = await adminApi.issueSetupCode(selectedStudent.id, setupReason);
                    setSetupResult({ id: selectedStudent.id, code: result.setup_code, expiry: result.expires_at });
                  } catch (error: any) { setSetupError(error.message); }
                  finally { setSetupBusy(false); }
                }}
                className="w-full py-2 bg-[#F47A35] hover:bg-[#F68C51] disabled:opacity-50 text-[#2D1A0E] font-bold text-xs rounded-xl cursor-pointer"
              >
                {setupBusy ? 'Issuing…' : 'Issue one-use password setup code'}
              </button>
              {setupError && <p role="alert" className="text-xs font-bold" style={{ color: 'var(--red)' }}>{setupError}</p>}
              {setupResult?.id === selectedStudent.id && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-[#6B4A28]">
                    Give this code to the student in person. It is shown only now, and expires{' '}
                    {new Date(setupResult.expiry).toLocaleString('en-IN')}.
                  </p>
                  <code className="block p-2.5 bg-white border border-[#E3CB9B] rounded-lg text-[11px] font-mono break-all select-all text-[#2D1A0E]">
                    {setupResult.code}
                  </code>
                </div>
              )}
            </section>

            {/* Meal scanner access */}
            <section className="p-4 rounded-xl border border-[#EFDCB4] bg-[#FDF7EA] space-y-2" aria-label="Meal scanner access">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F47A35] block">
                Meal scanner access
              </span>
              {scannerGrant ? (
                <>
                  <p className="text-xs font-semibold text-[#6B4A28]">
                    Can scan meals until{' '}
                    <span className="font-bold">{new Date(scannerGrant.ends_at).toLocaleString('en-IN')}</span>.
                    It stops by itself then; revoking is only for ending it early.
                  </p>
                  <button
                    disabled={scannerBusy}
                    onClick={async () => {
                      setScannerBusy(true); setScannerError(null);
                      try {
                        await adminApi.revokeCommittee(selectedStudent.id, 'Scanner access ended early by an administrator');
                        await fetchCommittee();
                      } catch (error: any) { setScannerError(error.message); }
                      finally { setScannerBusy(false); }
                    }}
                    className="w-full py-2 bg-white hover:bg-[#F7EEDA] border border-[#E3CB9B] text-[#dc2626] font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {scannerBusy ? 'Working…' : 'Revoke scanner access'}
                  </button>
                </>
              ) : selectedStudent.accountStatus !== 'ACTIVE' ? (
                <p className="text-xs font-semibold text-[#6B4A28]">
                  This student has not activated their account yet, so they cannot be given scanner
                  access. Issue a setup code above, or ask them to activate with their student ID and
                  date of birth.
                </p>
              ) : (
                <>
                  <label className="block text-xs font-bold text-[#6B4A28]" htmlFor="scanner-days">For how long</label>
                  <select
                    id="scanner-days"
                    value={scannerDays}
                    onChange={e => setScannerDays(e.target.value)}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="1">Today only</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                  </select>
                  <button
                    disabled={scannerBusy}
                    onClick={async () => {
                      setScannerBusy(true); setScannerError(null);
                      try {
                        // Start a minute ago so a clock skew between this browser
                        // and the server cannot reject a window as starting in
                        // the past, and so access works immediately.
                        const starts = new Date(Date.now() - 60_000);
                        const ends = new Date(starts.getTime() + Number(scannerDays) * 86_400_000);
                        await adminApi.assignCommittee({
                          student_id: selectedStudent.id,
                          starts_at: starts.toISOString(),
                          ends_at: ends.toISOString(),
                          scope: 'ATTENDANCE_SCANNER',
                        });
                        await fetchCommittee();
                      } catch (error: any) { setScannerError(error.message); }
                      finally { setScannerBusy(false); }
                    }}
                    className="w-full py-2 bg-[#15803d] hover:bg-[#126b33] disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    {scannerBusy ? 'Working…' : 'Let this student scan meals'}
                  </button>
                </>
              )}
              {scannerError && <p role="alert" className="text-xs font-bold" style={{ color: 'var(--red)' }}>{scannerError}</p>}
            </section>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const reason = window.prompt("Reason for resetting today's attendance:")?.trim();
                    if (!reason || reason.length < 3) return;
                    await adminApi.resetAttendance(selectedStudent.regNo, reason);
                    setSelectedStudent(null);
                    await fetchStudents();
                  } catch (err: any) {
                    alert(err.message || 'Failed to reset attendance.');
                  }
                }}
                className="flex-1 py-2.5 bg-[#FDECEA] hover:bg-[#F6C8C3] text-[#93000a] font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Reset Today&rsquo;s Attendance
              </button>
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-5 py-2.5 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Add Student ──────────────────────────────────────────── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} scrim={false}>
        {showAddModal && (
        <div className="modal-scrim animate-fade-in">
          <form onSubmit={handleAddSubmit} className="modal-panel max-w-md space-y-4" autoComplete="off">
            <div className="pb-3 border-b border-[#EFDCB4]">
              <h3 className="font-display text-[19px] font-bold text-[#2D1A0E]">Add New Student</h3>
              <p className="text-[11.5px] font-semibold text-[#9B7B52] mt-0.5">
                Create the record, then issue a one-use setup code after verifying the student&rsquo;s identity.
              </p>
            </div>

            {addError && (
              <div className="p-3 rounded-xl text-xs font-bold flex items-center gap-2"
                   style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}>
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-name">Full Name *</label>
                <input
                  id="new-name"
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="Enter Student Full Name"
                  autoComplete="off"
                  className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-reg">Reg No *</label>
                  <input
                    id="new-reg"
                    type="text"
                    required
                    value={newStudent.regNo}
                    onChange={(e) => setNewStudent({ ...newStudent, regNo: e.target.value })}
                    placeholder="Registration No"
                    autoComplete="off"
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-dob">Date of Birth *</label>
                  <input
                    id="new-dob"
                    type="date"
                    required
                    value={newStudent.dateOfBirth}
                    onChange={(e) => setNewStudent({ ...newStudent, dateOfBirth: e.target.value })}
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-dept">Department *</label>
                  <select
                    id="new-dept"
                    value={newStudent.department}
                    onChange={(e) => setNewStudent({ ...newStudent, department: e.target.value })}
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="Computer Science & Engineering">Computer Science &amp; Eng</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Safety & Fire Engineering">Safety &amp; Fire Eng</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Civil Engineering">Civil Engineering</option>
                    <option value="Electronics & Communication">Electronics &amp; Comm</option>
                    <option value="Electrical & Electronics">Electrical &amp; Electronics</option>
                    <option value="Marine Engineering (Lakeside)">Marine Eng (Lakeside)</option>
                    <option value="MCA">MCA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-campus">Campus Location *</label>
                  <select
                    id="new-campus"
                    value={newStudent.campusLocation}
                    onChange={(e) => setNewStudent({ ...newStudent, campusLocation: e.target.value })}
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#F47A35] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="MAIN_CAMPUS">Main Campus (Std Bill)</option>
                    <option value="LAKESIDE_CAMPUS">Lakeside (25% Off Bill)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-type">Membership *</label>
                  <select
                    id="new-type"
                    value={newStudent.studentType}
                    onChange={(e) => setNewStudent({ ...newStudent, studentType: e.target.value })}
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="HOSTELLER">Hosteller</option>
                    <option value="DAY_SCHOLAR">Day scholar</option>
                    <option value="OUTMESS">Out-mess (not billed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1" htmlFor="new-mess-id">Mess ID</label>
                  <input
                    id="new-mess-id"
                    type="text"
                    value={newStudent.messId}
                    onChange={(e) => setNewStudent({ ...newStudent, messId: e.target.value })}
                    placeholder="Auto-generated if empty"
                    autoComplete="off"
                    className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={addLoading}
                className="flex-1 py-2.5 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {addLoading ? (
                  <><span className="material-symbols-outlined animate-spin text-[18px]">refresh</span> Creating…</>
                ) : (
                  'Save Student'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-bold text-sm rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
        )}
      </Modal>

      <CreateAdminModal isOpen={showCreateAdmin} onClose={() => setShowCreateAdmin(false)} />
    </div>
  );
};
