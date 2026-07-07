import React, { useEffect, useState } from 'react';
import { Plus, X, Edit3, Search, Tag as TagIcon, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { getTags, createTag, updateTag, deleteTag, logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { Tag } from '../../types';
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

const AdminTagsPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  
  // Data states
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add tag modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0].hex);
  const [creating, setCreating] = useState(false);

  // Edit tag state
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTags = async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } catch (err) {
      console.error('Failed to load tags:', err);
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) {
      toast.error('Tag name is required');
      return;
    }

    // Check for duplicates (case insensitive)
    const isDuplicate = tags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('A tag with this name already exists');
      return;
    }

    setCreating(true);
    try {
      const tagId = await createTag({
        name: newTagName.trim(),
        color: newTagColor,
        status: 'active',
      });

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'tag_created',
        entityType: 'tag',
        entityId: tagId,
        entityName: newTagName.trim(),
      });

      toast.success(`Tag "${newTagName.trim()}" created successfully`);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0].hex);
      setShowAddModal(false);
      loadTags();
    } catch (err) {
      console.error('Failed to create tag:', err);
      toast.error('Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag) return;
    if (!editTagName.trim()) {
      toast.error('Tag name is required');
      return;
    }

    // Check for duplicates excluding current tag
    const isDuplicate = tags.some(t => t.id !== editingTag.id && t.name.toLowerCase() === editTagName.trim().toLowerCase());
    if (isDuplicate) {
      toast.error('Another tag with this name already exists');
      return;
    }

    setSaving(true);
    try {
      await updateTag(editingTag.id, {
        name: editTagName.trim(),
        color: editTagColor,
      });

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'tag_updated',
        entityType: 'tag',
        entityId: editingTag.id,
        entityName: editTagName.trim(),
      });

      toast.success('Tag updated successfully');
      setEditingTag(null);
      loadTags();
    } catch (err) {
      console.error('Failed to update tag:', err);
      toast.error('Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (tag: Tag) => {
    if (!window.confirm(`Are you sure you want to delete the tag "${tag.name}"? This will also remove it from all assigned clients.`)) {
      return;
    }
    
    try {
      await deleteTag(tag.id);
      
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'tag_deleted' as any,
        entityType: 'tag',
        entityId: tag.id,
        entityName: tag.name,
      });
      
      toast.success(`Tag "${tag.name}" deleted successfully`);
      loadTags();
    } catch (err) {
      console.error('Failed to delete tag:', err);
      toast.error('Failed to delete tag');
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  };

  const filteredTags = tags.filter((tag) => {
    const q = searchQuery.toLowerCase();
    return tag.name.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Tag Management</h1>
          <p className="page-subtitle">Create and manage custom tags for contact segmentation</p>
        </div>
        <button id="add-tag-btn" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> <span>Add Tag</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search tags by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tags List Container */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : tags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><TagIcon size={28} /></div>
            <h3 className="empty-state-title">No Tags Created Yet</h3>
            <p className="empty-state-desc">Create custom tags (e.g. Investor, Lawyer, Vendor) to organize your clients.</p>
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><TagIcon size={28} /></div>
            <h3 className="empty-state-title">No Matching Tags</h3>
            <p className="empty-state-desc">No tags matched your search query "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px', paddingLeft: 'var(--space-4)' }}></th>
                  <th>Tag Name</th>
                  <th>Visual Preview</th>
                  <th>Created At</th>
                  <th style={{ width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTags.map((tag, index) => (
                  <tr key={tag.id}>
                    <td className="text-sm font-bold text-muted" style={{ width: '40px', paddingLeft: 'var(--space-4)', textAlign: 'center' }}>
                      {index + 1}
                    </td>
                    <td className="font-semibold text-sm">{tag.name}</td>
                    <td>
                      <span
                        className="tag-badge"
                        style={{
                          backgroundColor: `${tag.color}1c`,
                          color: tag.color,
                          border: `1px solid ${tag.color}33`,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: '100px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {tag.name}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{format(tag.createdAt, 'dd MMM yyyy')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(tag)} aria-label="Edit Tag">
                          <Edit3 size={14} /> <span style={{ marginLeft: 4 }}>Edit</span>
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteTag(tag)}
                          style={{ minHeight: 32 }}
                        >
                          <Trash2 size={14} /> <span style={{ marginLeft: 4 }}>Delete</span>
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

      {/* Add Tag Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add Tag</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateTag} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="tag-name">Tag Name</label>
                <input
                  id="tag-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Investor, CS, Vendor"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = newTagColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setNewTagColor(color.hex)}
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
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Create Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tag Modal */}
      {editingTag && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Tag</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => setEditingTag(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateTag} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="edit-tag-name">Tag Name</label>
                <input
                  id="edit-tag-name"
                  type="text"
                  className="form-input"
                  value={editTagName}
                  onChange={(e) => setEditTagName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Select Label Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '6px' }}>
                  {PRESET_COLORS.map((color) => {
                    const isSelected = editTagColor === color.hex;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setEditTagColor(color.hex)}
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
              </div>

              <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingTag(null)}>Cancel</button>
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

export default AdminTagsPage;
