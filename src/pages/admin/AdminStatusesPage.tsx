import React, { useEffect, useState } from 'react';
import { Plus, X, Edit3, Search, Sliders, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { getClientStatuses, createClientStatus, updateClientStatus, deleteClientStatus, logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { CustomStatus } from '../../types';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Yellow', hex: '#f59e0b' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Gray', hex: '#6b7280' },
];

const AdminStatusesPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  
  // Data states
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add status modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState(PRESET_COLORS[0].hex);
  const [creating, setCreating] = useState(false);

  // Edit status state
  const [editingStatus, setEditingStatus] = useState<CustomStatus | null>(null);
  const [editStatusName, setEditStatusName] = useState('');
  const [editStatusColor, setEditStatusColor] = useState('');
  const [editStatusState, setEditStatusState] = useState<'active' | 'disabled'>('active');
  const [saving, setSaving] = useState(false);

  const loadStatuses = async () => {
    setLoading(true);
    try {
      const data = await getClientStatuses();
      if (data.length === 0) {
        // Seeding default statuses if none exist
        const defaults = [
          { name: 'Active', color: '#10b981' },
          { name: 'Inactive', color: '#6b7280' },
          { name: 'Lead', color: '#f59e0b' },
          { name: 'Closed', color: '#ef4444' },
        ];
        for (const d of defaults) {
          await createClientStatus(d.name, d.color);
        }
        const refreshed = await getClientStatuses();
        setStatuses(refreshed);
      } else {
        setStatuses(data);
      }
    } catch (err) {
      console.error('Failed to load statuses:', err);
      toast.error('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
  }, []);

  const handleCreateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusName.trim()) {
      toast.error('Status name is required');
      return;
    }

    // Check for duplicates (case insensitive)
    const isDuplicate = statuses.some(s => s.name.toLowerCase() === newStatusName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('A status with this name already exists');
      return;
    }

    setCreating(true);
    try {
      const statusId = await createClientStatus(newStatusName.trim(), newStatusColor);

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'status_created' as any,
        entityType: 'status' as any,
        entityId: statusId,
        entityName: newStatusName.trim(),
      });

      toast.success(`Status "${newStatusName.trim()}" created successfully`);
      setNewStatusName('');
      setNewStatusColor(PRESET_COLORS[0].hex);
      setShowAddModal(false);
      loadStatuses();
    } catch (err) {
      console.error('Failed to create status:', err);
      toast.error('Failed to create status');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStatus) return;
    if (!editStatusName.trim()) {
      toast.error('Status name is required');
      return;
    }

    // Check duplicates
    const isDuplicate = statuses.some(s => s.id !== editingStatus.id && s.name.toLowerCase() === editStatusName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('Another status with this name already exists');
      return;
    }

    setSaving(true);
    try {
      await updateClientStatus(
        editingStatus.id,
        {
          name: editStatusName.trim(),
          color: editStatusColor,
          status: editStatusState,
        },
        editingStatus.name
      );

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'status_updated' as any,
        entityType: 'status' as any,
        entityId: editingStatus.id,
        entityName: editStatusName.trim(),
      });

      toast.success('Status updated successfully');
      setEditingStatus(null);
      loadStatuses();
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStatus = async (status: CustomStatus) => {
    if (!window.confirm(`Are you sure you want to delete the status "${status.name}"? This will revert all matching clients to the default "Active" status.`)) {
      return;
    }
    
    try {
      await deleteClientStatus(status.id, status.name);
      
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'status_deleted' as any,
        entityType: 'status' as any,
        entityId: status.id,
        entityName: status.name,
      });
      
      toast.success(`Status "${status.name}" deleted successfully`);
      loadStatuses();
    } catch (err) {
      console.error('Failed to delete status:', err);
      toast.error('Failed to delete status');
    }
  };

  const startEdit = (status: CustomStatus) => {
    setEditingStatus(status);
    setEditStatusName(status.name);
    setEditStatusColor(status.color);
    setEditStatusState(status.status);
  };

  const filteredStatuses = statuses.filter((status) => {
    const q = searchQuery.toLowerCase();
    return status.name.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Lead Status Management</h1>
          <p className="page-subtitle">Configure dynamic workflow status tags and custom tracking categories</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> <span>Add Status</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search custom statuses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Status Table List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : filteredStatuses.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Sliders size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p className="font-medium">No statuses found</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px', paddingLeft: 'var(--space-4)' }}></th>
                  <th>Status Name</th>
                  <th>Badge Preview</th>
                  <th>State</th>
                  <th>Created</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatuses.map((status, index) => (
                  <tr key={status.id}>
                    <td className="text-sm font-bold text-muted" style={{ width: '40px', paddingLeft: 'var(--space-4)', textAlign: 'center' }}>
                      {index + 1}
                    </td>
                    <td className="font-semibold text-primary">{status.name}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: `${status.color}1c`,
                          color: status.color,
                          border: `1px solid ${status.color}33`,
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '3px 10px',
                        }}
                      >
                        {status.name}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${status.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
                        {status.status === 'active' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-xs text-muted">
                      {format(new Date(status.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: '32px', height: '32px', padding: 0 }}
                          onClick={() => startEdit(status)}
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon hover-danger"
                          style={{ width: '32px', height: '32px', padding: 0 }}
                          onClick={() => handleDeleteStatus(status)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Status Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Status</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateStatus} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="status-name">Status Name</label>
                <input
                  id="status-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. In Negotiation, Warm Lead"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = newStatusColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setNewStatusColor(color.hex)}
                        style={{
                          backgroundColor: `${color.hex}1c`,
                          color: color.hex,
                          border: isSelected ? `2px solid ${color.hex}` : `1px solid ${color.hex}40`,
                          borderRadius: '8px',
                          padding: '8px 4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'center',
                          boxShadow: isSelected ? `0 0 0 3px ${color.hex}24` : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {color.name}
                      </button>
                    );
                  })}
                </div>
                
                {/* Custom Color Input Picker */}
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="text-xs text-muted" style={{ fontWeight: 650 }}>Or choose custom color:</span>
                  <input 
                    type="color" 
                    value={newStatusColor} 
                    onChange={(e) => setNewStatusColor(e.target.value)} 
                    style={{ width: '40px', height: '30px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }} 
                  />
                  <span className="text-xs font-semibold monospaced" style={{ color: 'var(--color-text-secondary)' }}>{newStatusColor.toUpperCase()}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Create Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editingStatus && (
        <div className="modal-overlay" onClick={() => setEditingStatus(null)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Status</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setEditingStatus(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="edit-status-name">Status Name</label>
                <input
                  id="edit-status-name"
                  type="text"
                  className="form-input"
                  value={editStatusName}
                  onChange={(e) => setEditStatusName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-status-state">State</label>
                <select
                  id="edit-status-state"
                  className="form-input form-select"
                  value={editStatusState}
                  onChange={(e) => setEditStatusState(e.target.value as 'active' | 'disabled')}
                >
                  <option value="active">Active / Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = editStatusColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setEditStatusColor(color.hex)}
                        style={{
                          backgroundColor: `${color.hex}1c`,
                          color: color.hex,
                          border: isSelected ? `2px solid ${color.hex}` : `1px solid ${color.hex}40`,
                          borderRadius: '8px',
                          padding: '8px 4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'center',
                          boxShadow: isSelected ? `0 0 0 3px ${color.hex}24` : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {color.name}
                      </button>
                    );
                  })}
                </div>
                
                {/* Custom Color Input Picker */}
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="text-xs text-muted" style={{ fontWeight: 650 }}>Or choose custom color:</span>
                  <input 
                    type="color" 
                    value={editStatusColor} 
                    onChange={(e) => setEditStatusColor(e.target.value)} 
                    style={{ width: '40px', height: '30px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }} 
                  />
                  <span className="text-xs font-semibold monospaced" style={{ color: 'var(--color-text-secondary)' }}>{editStatusColor.toUpperCase()}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingStatus(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStatusesPage;
