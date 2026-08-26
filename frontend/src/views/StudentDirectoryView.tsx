import React, { useState, useEffect } from 'react';
import { StudentRecord } from '../types';
import { adminApi, authApi } from '../services/api';

interface StudentDirectoryViewProps {
  students: StudentRecord[];
  onAddStudent: (student: StudentRecord) => void;
}

export const StudentDirectoryView: React.FC<StudentDirectoryViewProps> = ({
  students: initialStudents,
  onAddStudent,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [apiStudents, setApiStudents] = useState<StudentRecord[]>(initialStudents);
  const [loading, setLoading] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);
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
  });

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getStudents(searchQuery);
      if (Array.isArray(data)) {
        const formatted: StudentRecord[] = data.map((s: any) => ({
          id: s.id,
          messId: s.profile?.mess_id || `M-${s.registration_number}`,
          regNo: s.registration_number,
          name: s.name,
          room: 'Hostel Block',
          avatar: s.profile?.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=2563eb&color=fff`,
          lunchStatus: 'Confirmed',
          attendanceStatus: s.account_status === 'ACTIVE' ? 'Present' : 'Pending',
          attendancePct: 0,
          fines: 0,
          category: (s.profile?.student_type as any) || 'Hosteller',
          campusLocation: s.campus_location || 'MAIN_CAMPUS',
          phone: '',
          mealsDone: s.meals_done || 0,
          mealsSkipped: s.meals_skipped || 0,
        }));
        setApiStudents(formatted);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [searchQuery]);

  const displayList = apiStudents;

  const filteredStudents = displayList.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.regNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.messId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Confirmed' && student.lunchStatus === 'Confirmed') ||
      (statusFilter === 'Skipped' && student.lunchStatus === 'Skipped') ||
      (statusFilter === 'Present' && student.attendanceStatus === 'Present') ||
      (statusFilter === 'Absent' && student.attendanceStatus === 'Absent');

    return matchesSearch && matchesStatus;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.regNo || !newStudent.dateOfBirth) return;

    setAddLoading(true);
    setAddError(null);

    try {
      const result = await adminApi.createStudent({
        name: newStudent.name,
        registration_number: newStudent.regNo,
        date_of_birth: newStudent.dateOfBirth,
        department: newStudent.department,
        mess_id: newStudent.messId || undefined,
        student_type: 'HOSTELLER',
        campus_location: newStudent.campusLocation || 'MAIN_CAMPUS',
      });

      const created: StudentRecord = {
        id: result.id || newStudent.regNo,
        messId: result.mess_id || `M-${newStudent.regNo}`,
        regNo: newStudent.regNo,
        name: newStudent.name,
        room: newStudent.room || 'Hostel Block',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newStudent.name)}&background=2563eb&color=fff`,
        lunchStatus: 'Confirmed',
        attendanceStatus: 'Pending',
        attendancePct: 0,
        fines: 0,
        category: newStudent.department as any,
        phone: newStudent.phone,
      };

      onAddStudent(created);
      setApiStudents((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewStudent({
        name: '',
        regNo: '',
        messId: '',
        room: '',
        dateOfBirth: '',
        campusLocation: 'MAIN_CAMPUS',
        department: 'Computer Science & Engineering',
        phone: '',
      });
    } catch (err: any) {
      setAddError(err.message || 'Failed to create student account.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f9f9ff]">
      {/* Header with Search and Actions */}
      <header className="bg-white border-b border-[#c3c6d7] p-4 md:px-6 shadow-2xs">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#151c27]">Student Directory</h1>
            <p className="text-xs text-[#434655]">Manage hosteller accounts, meal statuses & profiles</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, reg no..."
                className="w-full pl-9 pr-3 py-2 bg-[#f0f3ff] border border-[#c3c6d7] rounded-lg text-xs font-medium focus:border-[#F47A35] outline-none"
              />
            </div>

            {/* Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#f0f3ff] border border-[#c3c6d7] text-xs font-semibold text-[#151c27] rounded-lg px-3 py-2 outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Confirmed">Meal Confirmed</option>
              <option value="Skipped">Meal Skipped</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
            </select>

            {/* Add Student Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F47A35] text-white font-semibold text-xs rounded-lg hover:bg-[#D45E1A] transition-colors cursor-pointer shadow-2xs"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add Student
            </button>
          </div>
        </div>
      </header>

      {/* Results Cards Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-8">
        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[#737686] bg-white rounded-xl border border-[#c3c6d7] max-w-md mx-auto my-8">
            <span className="material-symbols-outlined text-[48px] mb-2 text-[#D45E1A]">group_off</span>
            <p className="font-semibold text-base text-[#151c27]">No Student Records Found</p>
            <p className="text-xs text-[#434655] mt-1">
              Use "Add Student" button above to add student records, or import from Excel.
            </p>
          </div>
        ) : (
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStudents.map((student) => {
              const isConfirmed = student.lunchStatus === 'Confirmed';
              const isPresent = student.attendanceStatus === 'Present';
              const isAbsent = student.attendanceStatus === 'Absent';

              return (
                <div
                  key={student.id}
                  className="bg-[#ffffff] rounded-xl border border-[#c3c6d7] shadow-2xs p-4 flex flex-col gap-3 hover:shadow-md transition-shadow duration-300"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={student.avatar}
                      alt={student.name}
                      className="w-14 h-14 rounded-full object-cover border border-[#c3c6d7]"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[16px] text-[#151c27] truncate">
                        {student.name}
                      </h3>
                      <p className="text-[13px] text-[#434655]">Reg: {student.regNo}</p>
                      <p className="text-[11px] text-[#737686] mt-0.5">Mess ID: {student.messId}</p>
                    </div>
                  </div>

                  <div className="h-px w-full bg-[#c3c6d7]/30 my-0.5"></div>

                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[#434655]">Lunch:</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 text-[11px] ${
                          isConfirmed
                            ? 'bg-[#6cf8bb]/30 text-[#00714d]'
                            : 'bg-[#ffdad6]/30 text-[#93000a]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {isConfirmed ? 'check_circle' : 'cancel'}
                        </span>
                        {student.lunchStatus}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[#434655]">Attendance:</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 text-[11px] ${
                          isPresent
                            ? 'bg-[#6cf8bb]/30 text-[#00714d]'
                            : isAbsent
                            ? 'bg-[#ffdad6]/30 text-[#93000a]'
                            : 'bg-[#dce2f3] text-[#434655]'
                        }`}
                      >
                        {student.attendanceStatus}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[#434655]">Category:</span>
                      <span className="text-[#151c27] font-medium">{student.category}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedStudent(student)}
                    className="mt-auto w-full py-2 border border-[#c3c6d7] text-[#434655] font-semibold text-xs rounded-lg hover:bg-[#f0f3ff] transition-colors cursor-pointer"
                  >
                    Quick View
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick View Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4 relative">
            <button
              onClick={() => setSelectedStudent(null)}
              className="absolute top-4 right-4 text-[#737686] hover:text-[#151c27]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <div className="flex flex-col items-center text-center gap-2">
              <img
                src={selectedStudent.avatar}
                alt={selectedStudent.name}
                className="w-20 h-20 rounded-full object-cover border-2 border-[#F47A35]"
              />
              <h3 className="text-xl font-bold text-[#151c27]">{selectedStudent.name}</h3>
              <p className="text-xs text-[#434655]">Reg: {selectedStudent.regNo} | {selectedStudent.messId}</p>
              <span className="px-3 py-1 bg-[#6cf8bb]/40 text-[#00714d] rounded-full text-xs font-semibold">
                {selectedStudent.category}
              </span>
            </div>

            <div className="border-t border-[#c3c6d7] pt-3 space-y-2 text-xs text-[#434655]">
              <div className="flex justify-between">
                <span>Account Status:</span>
                <span className="font-semibold text-[#006c49]">{selectedStudent.attendanceStatus}</span>
              </div>
              
              {/* Student Meal Overview */}
              <div className="bg-[#f0f4ff] p-3 rounded-xl border border-[#F47A35]/20 my-2 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F47A35] block">Student Meal Overview</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2.5 rounded-lg border border-[#006c49]/30 flex flex-col">
                    <span className="text-[10px] font-semibold text-[#006c49] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Meals Done
                    </span>
                    <span className="text-xl font-bold text-[#006c49] mt-0.5">{selectedStudent.mealsDone ?? 0}</span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-[#ba1a1a]/30 flex flex-col">
                    <span className="text-[10px] font-semibold text-[#ba1a1a] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">cancel</span>
                      Meals Skipped
                    </span>
                    <span className="text-xl font-bold text-[#ba1a1a] mt-0.5">{selectedStudent.mealsSkipped ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <span>Total Fines:</span>
                <span className="font-semibold text-[#ba1a1a]">₹{selectedStudent.fines}</span>
              </div>
            </div>

            <button
              onClick={async () => {
                try {
                  await adminApi.resetAttendance(selectedStudent.regNo);
                  alert(`Successfully reset attendance for ${selectedStudent.name} (${selectedStudent.regNo})!`);
                  setSelectedStudent(null);
                  fetchStudents();
                } catch (err: any) {
                  alert(err.message || 'Failed to reset attendance.');
                }
              }}
              className="w-full py-2 bg-[#ffdad6] text-[#93000a] font-semibold text-xs rounded-lg hover:bg-[#ffb4ab] transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              Reset Today's Attendance
            </button>

            <button
              onClick={() => setSelectedStudent(null)}
              className="w-full py-2 bg-[#F47A35] text-white font-semibold text-xs rounded-lg hover:bg-[#D45E1A]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleAddSubmit}
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4"
            autoComplete="off"
          >
            <h3 className="text-xl font-bold text-[#151c27]">Add New Student</h3>
            <p className="text-xs text-[#434655] -mt-2">Student will activate their account using Reg No + Date of Birth</p>

            {addError && (
              <div className="p-3 bg-[#ffdad6] text-[#93000a] rounded-xl text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{addError}</span>
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="Enter Student Full Name"
                  autoComplete="off"
                  className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#434655] mb-1">Reg No *</label>
                  <input
                    type="text"
                    required
                    value={newStudent.regNo}
                    onChange={(e) => setNewStudent({ ...newStudent, regNo: e.target.value })}
                    placeholder="Enter Registration No"
                    autoComplete="off"
                    className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#434655] mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={newStudent.dateOfBirth}
                    onChange={(e) => setNewStudent({ ...newStudent, dateOfBirth: e.target.value })}
                    className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#434655] mb-1">Department *</label>
                  <select
                    value={newStudent.department}
                    onChange={(e) => setNewStudent({ ...newStudent, department: e.target.value })}
                    className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm bg-white"
                  >
                    <option value="Computer Science & Engineering">Computer Science & Eng</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Safety & Fire Engineering">Safety & Fire Eng</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Civil Engineering">Civil Engineering</option>
                    <option value="Electronics & Communication">Electronics & Comm</option>
                    <option value="Electrical & Electronics">Electrical & Electronics</option>
                    <option value="Marine Engineering (Lakeside)">Marine Eng (Lakeside)</option>
                    <option value="MCA">MCA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#434655] mb-1">Campus Location *</label>
                  <select
                    value={newStudent.campusLocation}
                    onChange={(e) => setNewStudent({ ...newStudent, campusLocation: e.target.value })}
                    className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm bg-white font-semibold text-[#F47A35]"
                  >
                    <option value="MAIN_CAMPUS">Main Campus (Std Bill)</option>
                    <option value="LAKESIDE_CAMPUS">Lakeside (25% Off Bill)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#434655] mb-1">Mess ID</label>
                <input
                  type="text"
                  value={newStudent.messId}
                  onChange={(e) => setNewStudent({ ...newStudent, messId: e.target.value })}
                  placeholder="Auto-generated if empty"
                  autoComplete="off"
                  className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={addLoading}
                className="flex-1 py-2.5 bg-[#F47A35] text-white font-semibold rounded-lg hover:bg-[#D45E1A] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addLoading ? (
                  <><span className="material-symbols-outlined animate-spin text-[18px]">refresh</span> Creating...</>
                ) : (
                  'Save Student'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 border border-[#c3c6d7] text-[#434655] font-semibold rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
