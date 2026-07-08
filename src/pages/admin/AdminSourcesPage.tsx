import React, { useEffect, useState } from 'react';
import { Plus, X, Edit3, Search, Share2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { getLeadSources, createLeadSource, updateLeadSource, deleteLeadSource, logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { LeadSource } from '../../types';
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

const AdminSourcesPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  
  // Data states
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add source modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceColor, setNewSourceColor] = useState(PRESET_COLORS[0].hex);
  const [creating, setCreating] = useState(false);

  // Edit source state
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [editSourceName, setEditSourceName] = useState('');
  const [editSourceColor, setEditSourceColor] = useState('');
  const [editSourceState, setEditSourceState] = useState<'active' | 'disabled'>('active');
  const [saving, setSaving] = useState(false);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await getLeadSources();
      if (data.length === 0) {
        // Seeding default sources if none exist
        const defaults = [
          { name: 'Google', color: '#3b82f6' },
          { name: 'Facebook', color: '#6366f1' },
          { name: 'Referral', color: '#a855f7' },
          { name: 'Other', color: '#6b7280' },
        ];
        for (const d of defaults) {
          await createLeadSource(d.name, d.color);
        }
        const refreshed = await getLeadSources();
        setSources(refreshed);
      } else {
        setSources(data);
      }
    } catch (err) {
      console.error('Failed to load lead sources:', err);
      toast.error('Failed to load lead sources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) {
      toast.error('Lead source name is required');
      return;
    }

    // Check duplicates
    const isDuplicate = sources.some(s => s.name.toLowerCase() === newSourceName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('A lead source with this name already exists');
      return;
    }

    setCreating(true);
    try {
      const sourceId = await createLeadSource(newSourceName.trim(), newSourceColor);

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'source_created' as any,
        entityType: 'source' as any,
        entityId: sourceId,
        entityName: newSourceName.trim(),
      });

      toast.success(`Lead source "${newSourceName.trim()}" created successfully`);
      setNewSourceName('');
      setNewSourceColor(PRESET_COLORS[0].hex);
      setShowAddModal(false);
      loadSources();
    } catch (err) {
      console.error('Failed to create lead source:', err);
      toast.error('Failed to create lead source');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource) return;
    if (!editSourceName.trim()) {
      toast.error('Lead source name is required');
      return;
    }

    // Check duplicates
    const isDuplicate = sources.some(s => s.id !== editingSource.id && s.name.toLowerCase() === editSourceName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('Another lead source with this name already exists');
      return;
    }

    setSaving(true);
    try {
      await updateLeadSource(
        editingSource.id,
        {
          name: editSourceName.trim(),
          color: editSourceColor,
          status: editSourceState,
        },
        editingSource.name
      );

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'source_updated' as any,
        entityType: 'source' as any,
        entityId: editingSource.id,
        entityName: editSourceName.trim(),
      });

      toast.success('Lead source updated successfully');
      setEditingSource(null);
      loadSources();
    } catch (err) {
      console.error('Failed to update lead source:', err);
      toast.error('Failed to update lead source');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSource = async (source: LeadSource) => {
    if (!window.confirm(`Are you sure you want to delete the lead source "${source.name}"? This will clear the lead source field for all clients using it.`)) {
      return;
    }
    
    try {
      await deleteLeadSource(source.id, source.name);
      
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'source_deleted' as any,
        entityType: 'source' as any,
        entityId: source.id,
        entityName: source.name,
      });
      
      toast.success(`Lead source "${source.name}" deleted successfully`);
      loadSources();
    } catch (err) {
      console.error('Failed to delete lead source:', err);
      toast.error('Failed to delete lead source');
    }
  };

  const startEdit = (source: LeadSource) => {
    setEditingSource(source);
    setEditSourceName(source.name);
    setEditSourceColor(source.color);
    setEditSourceState(source.status);
  };

  const filteredSources = sources.filter((source) => {
    const q = searchQuery.toLowerCase();
    return source.name.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Lead Source Management</h1>
          <p className="page-subtitle">Configure custom advertising channels, campaigns, and referral sources</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> <span>Add Lead Source</span>
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search lead sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sources Table List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : filteredSources.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Share2 size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p className="font-medium">No lead sources found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', paddingLeft: 'var(--space-4)' }}></th>
                    <th>Source Channel</th>
                    <th>Badge Preview</th>
                    <th>State</th>
                    <th>Created</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.map((source, index) => (
                    <tr key={source.id}>
                      <td className="text-sm font-bold text-muted" style={{ width: '40px', paddingLeft: 'var(--space-4)', textAlign: 'center' }}>
                        {index + 1}
                      </td>
                      <td className="font-semibold text-primary">{source.name}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: `${source.color}1c`,
                            color: source.color,
                            border: `1px solid ${source.color}33`,
                            fontWeight: 700,
                            fontSize: '11px',
                            padding: '3px 10px',
                          }}
                        >
                          {source.name}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${source.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
                          {source.status === 'active' ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="text-xs text-muted">
                        {format(new Date(source.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon"
                            style={{ width: '32px', height: '32px', padding: 0 }}
                            onClick={() => startEdit(source)}
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon hover-danger"
                            style={{ width: '32px', height: '32px', padding: 0 }}
                            onClick={() => handleDeleteSource(source)}
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

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
              {filteredSources.map((source) => (
                <div 
                  key={source.id} 
                  className="card" 
                  style={{ 
                    padding: 'var(--space-4)', 
                    margin: 0,
                    borderLeft: `4px solid ${source.color}`,
                    background: 'var(--color-bg-card)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="font-semibold text-primary text-sm">{source.name}</span>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${source.color}1c`,
                        color: source.color,
                        border: `1px solid ${source.color}33`,
                        fontWeight: 700,
                        fontSize: '11px',
                        padding: '3px 10px',
                      }}
                    >
                      {source.name}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                    <span className={`badge ${source.status === 'active' ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: '10px' }}>
                      {source.status === 'active' ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-xs text-muted">Created: {format(new Date(source.createdAt), 'dd MMM yyyy')}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px dashed var(--color-border)', paddingTop: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 10px', fontSize: '11px', height: '28px', minHeight: 'auto' }}
                      onClick={() => startEdit(source)}
                    >
                      <Edit3 size={12} /> <span style={{ marginLeft: 4 }}>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm hover-danger"
                      style={{ padding: '4px 10px', fontSize: '11px', height: '28px', minHeight: 'auto' }}
                      onClick={() => handleDeleteSource(source)}
                    >
                      <Trash2 size={12} /> <span style={{ marginLeft: 4 }}>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Lead Source</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateSource} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="source-name">Source Channel Name</label>
                <input
                  id="source-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Google Ads, Cold Email, Yelp"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = newSourceColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setNewSourceColor(color.hex)}
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
                    value={newSourceColor} 
                    onChange={(e) => setNewSourceColor(e.target.value)} 
                    style={{ width: '40px', height: '30px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }} 
                  />
                  <span className="text-xs font-semibold monospaced" style={{ color: 'var(--color-text-secondary)' }}>{newSourceColor.toUpperCase()}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Create Source'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Source Modal */}
      {editingSource && (
        <div className="modal-overlay" onClick={() => setEditingSource(null)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Lead Source</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setEditingSource(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateSource} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="edit-source-name">Source Channel Name</label>
                <input
                  id="edit-source-name"
                  type="text"
                  className="form-input"
                  value={editSourceName}
                  onChange={(e) => setEditSourceName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-source-state">State</label>
                <select
                  id="edit-source-state"
                  className="form-input form-select"
                  value={editSourceState}
                  onChange={(e) => setEditSourceState(e.target.value as 'active' | 'disabled')}
                >
                  <option value="active">Active / Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = editSourceColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setEditSourceColor(color.hex)}
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
                    value={editSourceColor} 
                    onChange={(e) => setEditSourceColor(e.target.value)} 
                    style={{ width: '40px', height: '30px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }} 
                  />
                  <span className="text-xs font-semibold monospaced" style={{ color: 'var(--color-text-secondary)' }}>{editSourceColor.toUpperCase()}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingSource(null)}>Cancel</button>
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

export default AdminSourcesPage;
