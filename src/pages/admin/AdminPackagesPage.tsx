import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus, X, Edit3, Search, Package2, Archive,
  RotateCcw, CheckCircle, AlertTriangle,
  Trash2, Info, DollarSign, Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getPackages,
  createPackage,
  updatePackage,
  markPackageReviewed,
  archivePackage,
  restorePackage,
  isPackageOverdueForReview,
} from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { PackageService, PackageCostComponent, PackagePaymentType, PackageCategory } from '../../types';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PackageCategory, string> = {
  company_registration: 'Company Registration',
  startup: 'Startup',
  service: 'Service',
  other: 'Other',
};

const CATEGORY_COLORS: Record<PackageCategory, string> = {
  company_registration: '#6366f1',
  startup: '#10b981',
  service: '#f59e0b',
  other: '#6b7280',
};

const QUARTER_NAMES = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];

const getCurrentQuarterLabel = () => {
  const m = new Date().getMonth();
  return QUARTER_NAMES[Math.floor(m / 3)];
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

// ─── Empty cost component row ─────────────────────────────────────────────────
const emptyComponent = (): PackageCostComponent => ({ label: '', amount: 0 });

// ─── Default form state ───────────────────────────────────────────────────────
interface FormState {
  name: string;
  category: PackageCategory;
  description: string;
  paymentType: PackagePaymentType;
  fixedRate: string;
  costComponents: PackageCostComponent[];
  totalClientPrice: string;
  markReviewed: boolean;
}

const defaultForm = (): FormState => ({
  name: '',
  category: 'service',
  description: '',
  paymentType: 'direct',
  fixedRate: '',
  costComponents: [emptyComponent()],
  totalClientPrice: '',
  markReviewed: true,
});

// ─── Component ────────────────────────────────────────────────────────────────

const AdminPackagesPage: React.FC = () => {
  const { currentUser, userProfile, userRole } = useAuth();
  const isAdmin = userRole === 'admin';

  const [packages, setPackages] = useState<PackageService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<PackageCategory | ''>('');
  const [filterType, setFilterType] = useState<PackagePaymentType | ''>('');

  // Panel
  const [showPanel, setShowPanel] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageService | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);

  // Expand details / Drawer (admin view breakdown)
  const [breakdownPkg, setBreakdownPkg] = useState<PackageService | null>(null);

  // Review
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // ─── Load ────────────────────────────────────────────────────────────────────
  const loadPackages = async () => {
    setLoading(true);
    try {
      const data = await getPackages(true); // fetch all including archived; we filter in UI
      setPackages(data);
    } catch (err) {
      console.error('Failed to load packages:', err);
      toast.error('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPackages(); }, []);

  // ─── Derived lists ────────────────────────────────────────────────────────────
  const activePackages = useMemo(() => packages.filter(p => p.status === 'active'), [packages]);
  const archivedPackages = useMemo(() => packages.filter(p => p.status === 'archived'), [packages]);
  const overduePackages = useMemo(() => activePackages.filter(isPackageOverdueForReview), [activePackages]);

  const displayList = useMemo(() => {
    const base = showArchived ? archivedPackages : activePackages;
    return base.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
      const matchCat = !filterCategory || p.category === filterCategory;
      const matchType = !filterType || p.paymentType === filterType;
      return matchSearch && matchCat && matchType;
    });
  }, [packages, showArchived, activePackages, archivedPackages, searchQuery, filterCategory, filterType]);

  // ─── Computed total for associated form ──────────────────────────────────────
  const computedTotal = useMemo(() => {
    if (form.paymentType !== 'associated') return 0;
    return form.costComponents.reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  }, [form]);

  // ─── Open panel for add / edit ────────────────────────────────────────────────
  const openAdd = () => {
    setEditingPkg(null);
    setForm(defaultForm());
    setShowPanel(true);
  };

  const openEdit = (pkg: PackageService) => {
    setEditingPkg(pkg);
    setForm({
      name: pkg.name,
      category: pkg.category,
      description: pkg.description || '',
      paymentType: pkg.paymentType,
      fixedRate: pkg.fixedRate != null ? String(pkg.fixedRate) : '',
      costComponents: pkg.costComponents?.length ? pkg.costComponents : [emptyComponent()],
      totalClientPrice: pkg.totalClientPrice != null ? String(pkg.totalClientPrice) : '',
      markReviewed: false,
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditingPkg(null);
  };

  // ─── Cost component helpers ───────────────────────────────────────────────────
  const addCostComponent = () =>
    setForm(f => ({ ...f, costComponents: [...f.costComponents, emptyComponent()] }));

  const removeCostComponent = (i: number) =>
    setForm(f => ({ ...f, costComponents: f.costComponents.filter((_, idx) => idx !== i) }));

  const updateCostComponent = (i: number, field: keyof PackageCostComponent, value: string) =>
    setForm(f => ({
      ...f,
      costComponents: f.costComponents.map((c, idx) =>
        idx === i ? { ...c, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : c
      ),
    }));

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Package name is required'); return; }

    const isDirect = form.paymentType === 'direct';

    if (isDirect && (!form.fixedRate || isNaN(parseFloat(form.fixedRate)))) {
      toast.error('Fixed rate is required for Direct packages'); return;
    }
    if (!isDirect) {
      const validComponents = form.costComponents.filter(c => c.label.trim());
      if (validComponents.length === 0) { toast.error('At least one cost component is required'); return; }
    }

    setSaving(true);
    try {
      const now = new Date();
      const reviewFields = form.markReviewed ? {
        lastReviewedAt: now,
        lastReviewedBy: currentUser!.uid,
        lastReviewedByName: userProfile?.name || '',
      } : {};

      const payload: Omit<PackageService, 'id' | 'createdAt' | 'updatedAt' | 'lastReviewedAt'> & {
        lastReviewedAt?: Date; lastReviewedBy?: string; lastReviewedByName?: string;
      } = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        paymentType: form.paymentType,
        fixedRate: isDirect ? parseFloat(form.fixedRate) : undefined,
        costComponents: !isDirect ? form.costComponents.filter(c => c.label.trim() && c.amount > 0) : undefined,
        totalClientPrice: !isDirect ? computedTotal : undefined,
        status: 'active',
        createdBy: currentUser!.uid,
        createdByName: userProfile?.name || '',
        ...reviewFields,
      };

      if (editingPkg) {
        await updatePackage(editingPkg.id, {
          ...payload,
          updatedBy: currentUser!.uid,
          updatedByName: userProfile?.name || '',
        });
        if (form.markReviewed) {
          await markPackageReviewed(editingPkg.id, currentUser!.uid, userProfile?.name || '');
        }
        toast.success('Package updated successfully');
      } else {
        await createPackage(payload as any);
        toast.success(`Package "${form.name.trim()}" created`);
      }
      closePanel();
      loadPackages();
    } catch (err) {
      console.error('Failed to save package:', err);
      toast.error('Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  // ─── Mark reviewed ────────────────────────────────────────────────────────────
  const handleMarkReviewed = async (pkg: PackageService) => {
    setReviewingId(pkg.id);
    try {
      await markPackageReviewed(pkg.id, currentUser!.uid, userProfile?.name || '');
      toast.success(`"${pkg.name}" marked as reviewed for ${getCurrentQuarterLabel()}`);
      loadPackages();
    } catch (err) {
      toast.error('Failed to mark as reviewed');
    } finally {
      setReviewingId(null);
    }
  };

  // ─── Archive / restore ────────────────────────────────────────────────────────
  const handleArchive = async (pkg: PackageService) => {
    if (!window.confirm(`Archive "${pkg.name}"? It will no longer appear in the active list.`)) return;
    setArchivingId(pkg.id);
    try {
      await archivePackage(pkg.id);
      toast.success(`"${pkg.name}" archived`);
      loadPackages();
    } catch (err) {
      toast.error('Failed to archive package');
    } finally {
      setArchivingId(null);
    }
  };

  const handleRestore = async (pkg: PackageService) => {
    setArchivingId(pkg.id);
    try {
      await restorePackage(pkg.id);
      toast.success(`"${pkg.name}" restored`);
      loadPackages();
    } catch (err) {
      toast.error('Failed to restore package');
    } finally {
      setArchivingId(null);
    }
  };

  // ─── Review All ───────────────────────────────────────────────────────────────
  const handleReviewAll = async () => {
    if (!window.confirm(`Mark all ${overduePackages.length} overdue packages as reviewed for ${getCurrentQuarterLabel()}?`)) return;
    try {
      await Promise.all(overduePackages.map(p =>
        markPackageReviewed(p.id, currentUser!.uid, userProfile?.name || '')
      ));
      toast.success('All packages marked as reviewed');
      loadPackages();
    } catch (err) {
      toast.error('Failed to mark all as reviewed');
    }
  };

  // ─── Category badge ───────────────────────────────────────────────────────────
  const CategoryBadge: React.FC<{ category: PackageCategory }> = ({ category }) => {
    const color = CATEGORY_COLORS[category];
    return (
      <span className="badge" style={{
        backgroundColor: `${color}1c`, color,
        border: `1px solid ${color}33`, fontWeight: 700, fontSize: '11px', padding: '3px 10px',
      }}>
        {CATEGORY_LABELS[category]}
      </span>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: '12px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Packages</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Manage service packages, startup rates, and registration fees'
              : 'Browse available service packages and pricing'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd} id="add-package-btn">
            <Plus size={18} /> <span>Add Package</span>
          </button>
        )}
      </div>

      {/* Stats Bar (admin only) */}
      {isAdmin && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: 'var(--space-6)' }}>
          {[
            { label: 'Total Active', value: activePackages.length, icon: Package2, color: '#6366f1' },
            { label: 'Direct Payments', value: activePackages.filter(p => p.paymentType === 'direct').length, icon: DollarSign, color: '#10b981' },
            { label: 'Associated', value: activePackages.filter(p => p.paymentType === 'associated').length, icon: Layers, color: '#f59e0b' },
            { label: 'Review Needed', value: overduePackages.length, icon: AlertTriangle, color: overduePackages.length > 0 ? '#ef4444' : '#10b981' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: `${stat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} style={{ color: stat.color }} />
                </div>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '3px' }}>{stat.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quarterly Review Banner */}
      {isAdmin && overduePackages.length > 0 && !loading && (
        <div className="card" style={{
          padding: '14px 20px', marginBottom: 'var(--space-5)',
          border: '1px solid #f97316',
          backgroundColor: '#f9731610',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={20} style={{ color: '#f97316', flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 600, color: '#f97316', fontSize: '14px' }}>
                Quarterly Review Required — {getCurrentQuarterLabel()}
              </span>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {overduePackages.length} package{overduePackages.length > 1 ? 's have' : ' has'} not been reviewed this quarter. Please verify rates are up to date.
              </p>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '13px', padding: '7px 16px', borderColor: '#f97316', color: '#f97316' }}
            onClick={handleReviewAll}
          >
            <CheckCircle size={14} /> Mark All Reviewed
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '220px' }}>
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search packages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="packages-search"
          />
        </div>
        <select
          className="form-input form-select"
          style={{ width: 'auto', minWidth: '170px' }}
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as any)}
          id="packages-filter-category"
        >
          <option value="">All Categories</option>
          {(Object.keys(CATEGORY_LABELS) as PackageCategory[]).map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          className="form-input form-select"
          style={{ width: 'auto', minWidth: '160px' }}
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          id="packages-filter-type"
        >
          <option value="">All Types</option>
          <option value="direct">Direct Payment</option>
          <option value="associated">Associated</option>
        </select>
        {isAdmin && (
          <button
            className={`btn ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '13px', padding: '7px 14px', gap: '6px' }}
            onClick={() => setShowArchived(v => !v)}
            id="packages-toggle-archived"
          >
            <Archive size={14} />
            {showArchived ? 'Viewing Archived' : 'Show Archived'}
          </button>
        )}
      </div>

      {/* Table / List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : displayList.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Package2 size={36} style={{ opacity: 0.25, marginBottom: '10px' }} />
            <p className="font-medium">{showArchived ? 'No archived packages' : 'No packages found'}</p>
            {isAdmin && !showArchived && (
              <p style={{ fontSize: '13px', marginTop: '6px' }}>Click <strong>Add Package</strong> to create your first package.</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Desktop Table ── */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', paddingLeft: 'var(--space-4)' }}>#</th>
                    <th>Package Name</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>{isAdmin ? 'Rate / Total' : 'Total Amount'}</th>
                    {isAdmin && <th>Last Reviewed</th>}
                    {isAdmin && <th style={{ width: 130 }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayList.map((pkg, index) => {
                    const overdue = isAdmin && isPackageOverdueForReview(pkg);

                    return (
                      <React.Fragment key={pkg.id}>
                        <tr style={{ opacity: pkg.status === 'archived' ? 0.6 : 1 }}>
                          <td className="text-sm font-bold text-muted" style={{ width: '40px', paddingLeft: 'var(--space-4)', textAlign: 'center' }}>
                            {index + 1}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="font-semibold text-primary">{pkg.name}</span>
                              {pkg.status === 'archived' && (
                                <span className="badge badge-muted" style={{ fontSize: '10px' }}>Archived</span>
                              )}
                              {isAdmin && overdue && (
                                <span className="badge" style={{ fontSize: '10px', backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                                  Review Needed
                                </span>
                              )}
                            </div>
                            {pkg.description && (
                              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{pkg.description}</p>
                            )}
                          </td>
                          <td><CategoryBadge category={pkg.category} /></td>
                          <td>
                            <span className={`badge ${pkg.paymentType === 'direct' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                              {pkg.paymentType === 'direct' ? 'Direct' : 'Associated'}
                            </span>
                          </td>
                          <td>
                            {pkg.paymentType === 'direct' ? (
                              <span className="font-semibold" style={{ color: 'var(--color-success)' }}>
                                {pkg.fixedRate != null ? formatCurrency(pkg.fixedRate) : '—'}
                              </span>
                            ) : (
                              <div>
                                <span className="font-semibold" style={{ color: 'var(--color-success)' }}>
                                  {pkg.totalClientPrice != null ? formatCurrency(pkg.totalClientPrice) : '—'}
                                </span>
                                {isAdmin && pkg.costComponents && pkg.costComponents.length > 0 && (
                                  <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', textDecoration: 'underline' }}
                                    onClick={() => setBreakdownPkg(pkg)}
                                    title="View breakdown"
                                  >
                                    View Breakdown
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              {pkg.lastReviewedAt ? (
                                <div>
                                  <span style={{ fontSize: '12px', color: overdue ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                                    {format(pkg.lastReviewedAt, 'dd MMM yyyy')}
                                  </span>
                                  {pkg.lastReviewedByName && (
                                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '1px 0 0' }}>
                                      by {pkg.lastReviewedByName}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--color-danger)', fontStyle: 'italic' }}>Never reviewed</span>
                              )}
                            </td>
                          )}
                          {isAdmin && (
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {pkg.status === 'active' && overdue && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon"
                                    style={{ width: 'auto', padding: '4px 10px', fontSize: '11px', gap: '4px', color: '#f97316', borderColor: '#f9731640' }}
                                    onClick={() => handleMarkReviewed(pkg)}
                                    disabled={reviewingId === pkg.id}
                                    title="Mark as reviewed for current quarter"
                                    id={`review-pkg-${pkg.id}`}
                                  >
                                    {reviewingId === pkg.id ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <CheckCircle size={12} />}
                                    Review
                                  </button>
                                )}
                                {pkg.status === 'active' && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon"
                                    style={{ width: '32px', height: '32px', padding: 0 }}
                                    onClick={() => openEdit(pkg)}
                                    title="Edit package"
                                    id={`edit-pkg-${pkg.id}`}
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                )}
                                {pkg.status === 'active' ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon hover-danger"
                                    style={{ width: '32px', height: '32px', padding: 0 }}
                                    onClick={() => handleArchive(pkg)}
                                    disabled={archivingId === pkg.id}
                                    title="Archive package"
                                    id={`archive-pkg-${pkg.id}`}
                                  >
                                    {archivingId === pkg.id ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Archive size={14} />}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon"
                                    style={{ width: '32px', height: '32px', padding: 0 }}
                                    onClick={() => handleRestore(pkg)}
                                    disabled={archivingId === pkg.id}
                                    title="Restore package"
                                    id={`restore-pkg-${pkg.id}`}
                                  >
                                    {archivingId === pkg.id ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <RotateCcw size={14} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile Cards ── */}
            <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
              {displayList.map(pkg => {
                const overdue = isAdmin && isPackageOverdueForReview(pkg);
                const color = CATEGORY_COLORS[pkg.category];
                return (
                  <div
                    key={pkg.id}
                    className="card"
                    style={{
                      padding: '14px 16px',
                      borderLeft: `4px solid ${color}`,
                      background: 'var(--color-bg-card)',
                      boxShadow: 'var(--shadow-sm)',
                      borderRadius: 'var(--radius-lg)',
                      opacity: pkg.status === 'archived' ? 0.65 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="font-semibold text-primary" style={{ fontSize: '14px' }}>{pkg.name}</span>
                          {pkg.status === 'archived' && <span className="badge badge-muted" style={{ fontSize: '10px' }}>Archived</span>}
                        </div>
                        {pkg.description && (
                          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '3px 0 6px' }}>{pkg.description}</p>
                        )}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                          <CategoryBadge category={pkg.category} />
                          <span className={`badge ${pkg.paymentType === 'direct' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                            {pkg.paymentType === 'direct' ? 'Direct' : 'Associated'}
                          </span>
                        </div>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{isAdmin && pkg.paymentType === 'direct' ? 'Fixed Rate' : 'Total Amount'}</span>
                            <p className="font-semibold" style={{ fontSize: '15px', color: 'var(--color-success)', margin: '2px 0 0' }}>
                              {pkg.paymentType === 'direct'
                                ? (pkg.fixedRate != null ? formatCurrency(pkg.fixedRate) : '—')
                                : (pkg.totalClientPrice != null ? formatCurrency(pkg.totalClientPrice) : '—')}
                            </p>
                          </div>
                          {isAdmin && pkg.lastReviewedAt && (
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Last Reviewed</span>
                              <p style={{ fontSize: '12px', color: overdue ? 'var(--color-danger)' : 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                                {format(pkg.lastReviewedAt, 'dd MMM yyyy')}
                              </p>
                            </div>
                          )}
                          {isAdmin && !pkg.lastReviewedAt && (
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Review</span>
                              <p style={{ fontSize: '12px', color: 'var(--color-danger)', margin: '2px 0 0', fontStyle: 'italic' }}>Never reviewed</p>
                            </div>
                          )}
                        </div>
                        {isAdmin && overdue && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                            <span className="badge" style={{ fontSize: '10px', backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                              Review Needed
                            </span>
                          </div>
                        )}
                      </div>
                      {isAdmin && pkg.status === 'active' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                          <button
                            className="btn btn-secondary btn-icon"
                            style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }}
                            onClick={() => openEdit(pkg)}
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                          {overdue && (
                            <button
                              className="btn btn-secondary btn-icon"
                              style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0, color: '#f97316', borderColor: '#f9731640' }}
                              onClick={() => handleMarkReviewed(pkg)}
                              title="Mark reviewed"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button
                            className="btn btn-secondary btn-icon hover-danger"
                            style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }}
                            onClick={() => handleArchive(pkg)}
                            title="Archive"
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      )}
                      {isAdmin && pkg.status === 'archived' && (
                        <button
                          className="btn btn-secondary btn-icon"
                          style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }}
                          onClick={() => handleRestore(pkg)}
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Breakdown Right-Side Drawer (Admin Only) ── */}
      {isAdmin && breakdownPkg && (
        <div
          className="modal-overlay"
          onClick={() => setBreakdownPkg(null)}
          style={{ zIndex: 220, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease-out' }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              height: '100vh',
              background: 'var(--color-bg-card)',
              boxShadow: 'var(--shadow-2xl)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.25s ease-out',
              overflowY: 'auto',
              borderLeft: '1px solid var(--color-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                  Cost Breakdown
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                  {breakdownPkg.name}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setBreakdownPkg(null)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              {/* Category & Type badges */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <CategoryBadge category={breakdownPkg.category} />
                <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                  Associated Payment
                </span>
              </div>

              {/* Cost components breakdown list */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'block',
                    marginBottom: '12px',
                  }}
                >
                  Internal Pricing Breakdown
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {breakdownPkg.costComponents && breakdownPkg.costComponents.length > 0 ? (
                    breakdownPkg.costComponents.map((c, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '14px',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-secondary)' }}>{c.label}</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      No individual cost components specified.
                    </span>
                  )}

                  <div
                    style={{
                      borderTop: '1px dashed var(--color-border)',
                      paddingTop: '12px',
                      marginTop: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      Total Client Price
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--color-success)' }}>
                      {formatCurrency(breakdownPkg.totalClientPrice || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Review & audit metadata */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                  Review Details
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Last Reviewed:</span>
                  <span style={{ fontWeight: 600, color: isPackageOverdueForReview(breakdownPkg) ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
                    {breakdownPkg.lastReviewedAt ? format(breakdownPkg.lastReviewedAt, 'dd MMM yyyy, hh:mm a') : 'Never'}
                  </span>
                </div>
                {breakdownPkg.lastReviewedByName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Reviewed By:</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {breakdownPkg.lastReviewedByName}
                    </span>
                  </div>
                )}
                {breakdownPkg.createdByName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Created By:</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {breakdownPkg.createdByName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                gap: '10px',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setBreakdownPkg(null)}
              >
                Close
              </button>
              {isPackageOverdueForReview(breakdownPkg) && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, backgroundColor: '#f97316', borderColor: '#f97316' }}
                  onClick={() => {
                    handleMarkReviewed(breakdownPkg);
                    setBreakdownPkg(null);
                  }}
                >
                  <CheckCircle size={14} /> Mark Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Panel (slide-in from right) ── */}
      {showPanel && (
        <div
          className="modal-overlay"
          onClick={closePanel}
          style={{ zIndex: 200 }}
        >
          <div
            className="modal"
            style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="modal-header">
              <h2 className="modal-title">{editingPkg ? 'Edit Package' : 'Add Package'}</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={closePanel}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Name */}
              <div className="form-group">
                <label className="form-label required" htmlFor="pkg-name">Package Name</label>
                <input
                  id="pkg-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Company Registration – Basic"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  maxLength={80}
                  required
                />
              </div>

              {/* Category */}
              <div className="form-group">
                <label className="form-label required" htmlFor="pkg-category">Category</label>
                <select
                  id="pkg-category"
                  className="form-input form-select"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as PackageCategory }))}
                >
                  {(Object.keys(CATEGORY_LABELS) as PackageCategory[]).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label" htmlFor="pkg-desc">Description <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  id="pkg-desc"
                  className="form-input"
                  style={{ minHeight: '70px', resize: 'vertical' }}
                  placeholder="Brief description of what this package includes..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  maxLength={300}
                />
              </div>

              {/* Payment Type Toggle */}
              <div className="form-group">
                <label className="form-label required">Payment Type</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['direct', 'associated'] as PackagePaymentType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, paymentType: type }))}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '10px',
                        border: form.paymentType === type ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: form.paymentType === type ? 'var(--color-accent)18' : 'var(--color-bg-input)',
                        color: form.paymentType === type ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        textAlign: 'center',
                      }}
                    >
                      {type === 'direct' ? '💳 Direct Payment' : '🔗 Associated'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                  {form.paymentType === 'direct'
                    ? 'Full payment goes directly to a specific service. A single fixed rate is quoted.'
                    : 'Internal pricing breakdown is managed by admin. Agents see only the total client price.'}
                </p>
              </div>

              {/* Direct: Fixed Rate */}
              {form.paymentType === 'direct' && (
                <div className="form-group">
                  <label className="form-label required" htmlFor="pkg-fixed-rate">Fixed Rate (₹)</label>
                  <input
                    id="pkg-fixed-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    placeholder="e.g. 15000"
                    value={form.fixedRate}
                    onChange={e => setForm(f => ({ ...f, fixedRate: e.target.value }))}
                    required
                  />
                </div>
              )}

              {/* Associated: Cost Components */}
              {form.paymentType === 'associated' && (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label className="form-label required" style={{ margin: 0 }}>Cost Components</label>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', gap: '4px' }} onClick={addCostComponent}>
                      <Plus size={12} /> Add Row
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {form.costComponents.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Label (e.g. Base Service Cost)"
                          value={c.label}
                          onChange={e => updateCostComponent(i, 'label', e.target.value)}
                          style={{ flex: 2 }}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          placeholder="Amount"
                          value={c.amount || ''}
                          onChange={e => updateCostComponent(i, 'amount', e.target.value)}
                          style={{ flex: 1 }}
                        />
                        {form.costComponents.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon hover-danger"
                            style={{ width: '32px', height: '32px', padding: 0, flexShrink: 0 }}
                            onClick={() => removeCostComponent(i)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Computed total preview */}
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Total Client Price (auto-calculated)</span>
                      <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-success)' }}>{formatCurrency(computedTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                      <Info size={11} style={{ color: 'var(--color-text-muted)' }} />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Agents will only see this total amount, not the individual components.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mark Reviewed */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <input
                  type="checkbox"
                  id="pkg-mark-reviewed"
                  checked={form.markReviewed}
                  onChange={e => setForm(f => ({ ...f, markReviewed: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }}
                />
                <label htmlFor="pkg-mark-reviewed" style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                  Mark as reviewed for <strong>{getCurrentQuarterLabel()}</strong> (timestamps rates as current)
                </label>
              </div>

              {/* Footer */}
              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={closePanel}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} id="pkg-save-btn">
                  {saving
                    ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    : editingPkg ? 'Save Changes' : 'Create Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPackagesPage;
