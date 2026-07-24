import React, { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, CheckCircle, Clock, AlertTriangle,
  Search, Edit3, X, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getSalaryRecords,
  getUsers,
  updateUser,
  markSalaryAsPaid,
  checkAndGenerateSalaryTasks
} from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { User as AppUser, SalaryRecord, SalaryStatus } from '../../types';
import toast from 'react-hot-toast';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const AdminSalariesPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SalaryStatus | 'all'>('all');

  // Mark Paid Modal state
  const [markingRecord, setMarkingRecord] = useState<SalaryRecord | null>(null);
  const [actualPaidDate, setActualPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Edit Staff Structure Modal state
  const [editingStaff, setEditingStaff] = useState<AppUser | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [payStructure, setPayStructure] = useState<'fixed' | 'commission' | 'hybrid'>('fixed');
  const [baseSalary, setBaseSalary] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [payoutDay, setPayoutDay] = useState('1');
  const [bankDetails, setBankDetails] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Auto generate / sync missing salary tasks & records for the selected month
      if (currentUser) {
        await checkAndGenerateSalaryTasks(currentUser.uid, userProfile?.name || 'Admin', selectedMonth);
      }
      // 2. Fetch records & users
      const [allRecords, allUsers] = await Promise.all([
        getSalaryRecords(selectedMonth),
        getUsers()
      ]);
      setRecords(allRecords);
      setStaff(allUsers);
    } catch (err) {
      console.error('Failed to load salary dashboard:', err);
      toast.error('Failed to load salary information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  // Filtered salary records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.userName.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [records, search, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalPayroll = records.reduce((sum, r) => sum + r.totalAmount, 0);
    const paidTotal = records.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.totalAmount, 0);
    const pendingTotal = records.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.totalAmount, 0);
    const overdueTotal = records.filter(r => r.status === 'overdue').reduce((sum, r) => sum + r.totalAmount, 0);
    return { totalPayroll, paidTotal, pendingTotal, overdueTotal };
  }, [records]);

  // Handlers for Marking Paid
  const openMarkPaidModal = (record: SalaryRecord) => {
    setMarkingRecord(record);
    const today = new Date().toISOString().slice(0, 10);
    setActualPaidDate(today);
    setPaymentRef('');
    setPaymentNotes('');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingRecord || !currentUser) return;
    setSubmittingPayment(true);
    try {
      const paidDate = new Date(actualPaidDate);
      await markSalaryAsPaid(
        markingRecord.id,
        paidDate,
        currentUser.uid,
        userProfile?.name || 'Admin',
        paymentRef,
        paymentNotes
      );
      toast.success(`Salary marked as paid for ${markingRecord.userName}`);
      setMarkingRecord(null);
      loadData();
    } catch (err) {
      console.error('Failed to mark salary paid:', err);
      toast.error('Failed to update salary status');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handlers for Editing Staff Structure
  const openEditStaffModal = (user: AppUser) => {
    setEditingStaff(user);
    setJobTitle(user.jobTitle || '');
    setPayStructure(user.payStructure || 'fixed');
    setBaseSalary(user.baseSalary != null ? String(user.baseSalary) : '');
    setCommissionRate(user.commissionRate != null ? String(user.commissionRate) : '');
    setPayoutDay(user.payoutDayOfMonth != null ? String(user.payoutDayOfMonth) : '1');
    setBankDetails(user.bankDetails || '');
  };

  const handleSaveStaffStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setSavingStaff(true);
    try {
      await updateUser(editingStaff.id, {
        jobTitle: jobTitle.trim(),
        payStructure,
        baseSalary: parseFloat(baseSalary) || 0,
        commissionRate: parseFloat(commissionRate) || 0,
        payoutDayOfMonth: parseInt(payoutDay, 10) || 1,
        bankDetails: bankDetails.trim(),
      });
      toast.success(`Salary structure updated for ${editingStaff.name}`);
      setEditingStaff(null);
      loadData();
    } catch (err) {
      console.error('Failed to update staff structure:', err);
      toast.error('Failed to update staff structure');
    } finally {
      setSavingStaff(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: '12px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Staff Salary & Commission Management</h1>
          <p className="page-subtitle">Track staff compensation structures, automated salary tasks, and payout logs</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="month"
            className="form-input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: 'auto' }}
          />
          <button className="btn btn-secondary" onClick={loadData} title="Refresh Salary Statuses">
            <RefreshCw size={16} /> Sync Payout Tasks
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: 'var(--space-6)' }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', backgroundColor: '#6366f118', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={22} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatCurrency(stats.totalPayroll)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total Payroll ({selectedMonth})</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', backgroundColor: '#10b98118', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={22} style={{ color: '#10b981' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>{formatCurrency(stats.paidTotal)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Paid Out</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', backgroundColor: '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(stats.pendingTotal)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Pending Payouts</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', backgroundColor: '#ef444418', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(stats.overdueTotal)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Overdue Payouts</div>
          </div>
        </div>
      </div>

      {/* Salary Records Table & Controls */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-8)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Monthly Payout Tasks & Records</h3>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-wrapper" style={{ width: 220 }}>
              <Search className="search-icon" size={16} />
              <input
                type="text"
                className="form-input"
                placeholder="Search staff name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="form-input form-select"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <DollarSign size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p className="font-medium">No salary records found for this month.</p>
          </div>
        ) : (
          <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Staff Member</th>
                  <th>Structure</th>
                  <th>Base Rate</th>
                  <th>Commission</th>
                  <th>Total Amount</th>
                  <th>Due Date</th>
                  <th>Status / Paid Date</th>
                  <th style={{ width: 130 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, idx) => (
                  <tr key={r.id}>
                    <td className="text-sm font-bold text-muted">{idx + 1}</td>
                    <td>
                      <span className="font-semibold text-primary">{r.userName}</span>
                    </td>
                    <td>
                      <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                        {r.payStructure}
                      </span>
                    </td>
                    <td className="text-sm">{formatCurrency(r.baseSalary)}</td>
                    <td className="text-sm">{formatCurrency(r.commissionEarned)}</td>
                    <td className="font-bold text-success">{formatCurrency(r.totalAmount)}</td>
                    <td className="text-sm text-secondary">{format(r.dueDate, 'dd MMM yyyy')}</td>
                    <td>
                      {r.status === 'paid' ? (
                        <div>
                          <span className="badge badge-success">Paid</span>
                          {r.paidAt && (
                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                              Paid on {format(r.paidAt, 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                      ) : r.status === 'overdue' ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : (
                        <span className="badge badge-warning">Pending</span>
                      )}
                    </td>
                    <td>
                      {r.status !== 'paid' ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px', padding: '4px 10px', gap: 4 }}
                          onClick={() => openMarkPaidModal(r)}
                        >
                          <CheckCircle size={12} /> Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-muted">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Salary Structure Mapping List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Staff Compensation Mapping</h3>
          <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>Map fixed salaries, commission rates, and payout days per staff member</p>
        </div>

        <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name / Email</th>
                <th>Job Title</th>
                <th>Pay Structure</th>
                <th>Base Salary</th>
                <th>Commission Rate</th>
                <th>Payout Day</th>
                <th style={{ width: 100 }}>Configure</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member, idx) => (
                <tr key={member.id}>
                  <td className="text-sm font-bold text-muted">{idx + 1}</td>
                  <td>
                    <div>
                      <span className="font-semibold text-primary">{member.name}</span>
                      <p className="text-xs text-muted" style={{ margin: 0 }}>{member.email}</p>
                    </div>
                  </td>
                  <td className="text-sm">{member.jobTitle || 'Staff Member'}</td>
                  <td>
                    <span className="badge badge-secondary" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                      {member.payStructure || 'fixed'}
                    </span>
                  </td>
                  <td className="font-semibold">{formatCurrency(member.baseSalary || 0)}</td>
                  <td className="text-sm">{member.commissionRate ? `${member.commissionRate}%` : '—'}</td>
                  <td className="text-sm text-secondary">Day {member.payoutDayOfMonth || 1} of month</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEditStaffModal(member)}
                      title="Edit Salary Structure"
                    >
                      <Edit3 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark Paid Modal (With Delayed Payout Date Prompt) */}
      {markingRecord && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Mark Salary as Paid</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setMarkingRecord(null)}><X size={20} /></button>
            </div>

            <form onSubmit={handleConfirmPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted">Payout for</span>
                <p className="font-bold text-primary" style={{ margin: '2px 0 0', fontSize: '15px' }}>{markingRecord.userName}</p>
                <p className="text-sm font-semibold text-success" style={{ margin: '2px 0 0' }}>{formatCurrency(markingRecord.totalAmount)}</p>
              </div>

              {/* Delayed Payment Date Prompt */}
              <div className="form-group">
                <label className="form-label required">What date was this paid?</label>
                <input
                  type="date"
                  className="form-input"
                  value={actualPaidDate}
                  onChange={(e) => setActualPaidDate(e.target.value)}
                  required
                />
                {new Date(actualPaidDate) > markingRecord.dueDate && (
                  <p className="text-xs text-warning" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> Note: Payment date is after scheduled due date ({format(markingRecord.dueDate, 'dd MMM yyyy')}). Delay will be logged.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Payment Reference / Transaction ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. UPI/BANK-REF-98214"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Payment notes..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setMarkingRecord(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submittingPayment}>
                  {submittingPayment ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Structure Modal */}
      {editingStaff && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">Configure Salary Structure</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingStaff(null)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveStaffStructure} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p className="text-xs text-muted">Configure base salary, commission rates, and payout day for <strong>{editingStaff.name}</strong>.</p>

              <div className="form-group">
                <label className="form-label">Job Title / Designation</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Senior Developer, Sales Agent, Commission Worker"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Pay Structure</label>
                <select
                  className="form-input form-select"
                  value={payStructure}
                  onChange={(e) => setPayStructure(e.target.value as any)}
                >
                  <option value="fixed">Fixed Salary</option>
                  <option value="commission">Commission Only</option>
                  <option value="hybrid">Hybrid (Fixed + Commission)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Base Monthly Salary (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 35000"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Commission Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="form-input"
                    placeholder="e.g. 5"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label required">Payout Day of Month (1-31)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="form-input"
                  value={payoutDay}
                  onChange={(e) => setPayoutDay(e.target.value)}
                  required
                />
                <p className="text-xs text-muted" style={{ marginTop: 2 }}>Automated payout task will trigger on this day each month.</p>
              </div>

              <div className="form-group">
                <label className="form-label">Bank Account / Payment Details</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60 }}
                  placeholder="Bank name, Account Number, IFSC, UPI ID..."
                  value={bankDetails}
                  onChange={(e) => setBankDetails(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingStaff(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingStaff}>
                  {savingStaff ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSalariesPage;
