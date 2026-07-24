import React, { useEffect, useState } from 'react';
import { Plus, X, Edit3, Search, Tag as TagIcon, Trash2, GripVertical, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { getTags, createTag, updateTag, deleteTag, logActivity, getTagTemplateByTagId, createTagTemplate, updateTagTemplate, deleteTagTemplate } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { Tag, TagTemplate } from '../../types';
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
  
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Tag template state: keyed by tagId
  const [templates, setTemplates] = useState<Record<string, TagTemplate | null>>({});
  const [expandedTemplateTagId, setExpandedTemplateTagId] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState('');
  const [templateVariations, setTemplateVariations] = useState<string[]>(['']);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Drag and drop / Touch longpress states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const tagsRef = React.useRef<Tag[]>([]);
  const lastSwapTime = React.useRef<number>(0);

  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  const reorderTags = (fromIndex: number, toIndex: number) => {
    const now = Date.now();
    if (now - lastSwapTime.current < 280) return; // 280ms cooldown to prevent flickering swaps
    lastSwapTime.current = now;

    setTags((prevTags) => {
      const result = Array.from(prevTags);
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  };

  const saveNewOrder = async () => {
    try {
      const currentTags = tagsRef.current;
      const promises = currentTags.map((tag, idx) => {
        return updateTag(tag.id, { order: idx });
      });
      await Promise.all(promises);
      toast.success('Tag priority order saved');
    } catch (err) {
      console.error('Failed to save priority:', err);
      toast.error('Failed to save priority order');
    }
  };

  // HTML5 Drag Event Handlers (Desktop)
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      reorderTags(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setIsDragging(false);
    saveNewOrder();
  };

  // Touch Event Handlers for Mobile Instant Drag on Grip handle
  const handleTouchStart = (index: number) => {
    setIsDragging(true);
    setDraggedIndex(index);
    if (navigator.vibrate) {
      navigator.vibrate(40);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || draggedIndex === null) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = element?.closest('[data-index]');
    if (row) {
      const idxAttr = row.getAttribute('data-index');
      if (idxAttr !== null) {
        const hoverIdx = parseInt(idxAttr, 10);
        if (hoverIdx !== draggedIndex) {
          reorderTags(draggedIndex, hoverIdx);
          setDraggedIndex(hoverIdx);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      setDraggedIndex(null);
      saveNewOrder();
    }
  };
  
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

  // Load template for a specific tag into the editor form
  const handleExpandTemplate = async (tag: Tag) => {
    if (expandedTemplateTagId === tag.id) {
      setExpandedTemplateTagId(null);
      return;
    }
    setExpandedTemplateTagId(tag.id);
    // Fetch existing template if not already loaded
    if (!(tag.id in templates)) {
      try {
        const tmpl = await getTagTemplateByTagId(tag.id);
        setTemplates(prev => ({ ...prev, [tag.id]: tmpl }));
        if (tmpl) {
          setTemplateText(tmpl.templateText);
          setTemplateVariations(tmpl.variations.length > 0 ? tmpl.variations : ['']);
        } else {
          setTemplateText('');
          setTemplateVariations(['']);
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load template');
      }
    } else {
      const tmpl = templates[tag.id];
      if (tmpl) {
        setTemplateText(tmpl.templateText);
        setTemplateVariations(tmpl.variations.length > 0 ? tmpl.variations : ['']);
      } else {
        setTemplateText('');
        setTemplateVariations(['']);
      }
    }
  };

  const handleSaveTemplate = async (tag: Tag) => {
    if (!templateText.trim()) {
      toast.error('Template text is required');
      return;
    }
    setSavingTemplate(true);
    try {
      const existing = templates[tag.id];
      const cleanVariations = templateVariations.map(v => v.trim()).filter(Boolean);
      if (existing) {
        await updateTagTemplate(existing.id, {
          templateText: templateText.trim(),
          variations: cleanVariations,
          tagName: tag.name,
          updatedBy: currentUser!.uid,
          updatedByName: userProfile?.name,
        });
        setTemplates(prev => ({ ...prev, [tag.id]: { ...existing, templateText: templateText.trim(), variations: cleanVariations } }));
      } else {
        const newId = await createTagTemplate({
          tagId: tag.id,
          tagName: tag.name,
          templateText: templateText.trim(),
          variations: cleanVariations,
          createdBy: currentUser!.uid,
          createdByName: userProfile?.name,
        });
        const newTmpl: TagTemplate = {
          id: newId,
          tagId: tag.id,
          tagName: tag.name,
          templateText: templateText.trim(),
          variations: cleanVariations,
          createdBy: currentUser!.uid,
          createdByName: userProfile?.name,
          createdAt: new Date(),
        };
        setTemplates(prev => ({ ...prev, [tag.id]: newTmpl }));
      }
      toast.success('Template saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tag: Tag) => {
    const existing = templates[tag.id];
    if (!existing) return;
    if (!window.confirm('Delete this tag template?')) return;
    try {
      await deleteTagTemplate(existing.id);
      setTemplates(prev => ({ ...prev, [tag.id]: null }));
      setTemplateText('');
      setTemplateVariations(['']);
      toast.success('Template deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete template');
    }
  };

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

      {/* Priority instruction card */}
      {!loading && tags.length > 0 && (
        <div style={{
          background: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-bg-card))',
          border: '1px solid color-mix(in srgb, var(--color-accent) 15%, var(--color-border))',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          marginBottom: 'var(--space-5)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}>
          <TagIcon size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
            <strong>Prioritize Display Order</strong>: Long-press on a row and drag it up/down to set the priority order. The priority is saved automatically and applied to filters and select drop-downs across the CRM.
          </span>
        </div>
      )}

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
          <>
            {/* Desktop Table View */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
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
                  {filteredTags.map((tag, index) => {
                    const isDragged = index === draggedIndex;
                    return (
                      <tr 
                        key={tag.id}
                        data-index={index}
                        draggable={true}
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDragEnd}
                        onTouchStart={() => handleTouchStart(index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{
                          cursor: isDragging ? 'grabbing' : 'grab',
                          opacity: isDragged ? 0.5 : 1,
                          backgroundColor: isDragged ? 'rgba(37, 99, 235, 0.05)' : undefined,
                          border: isDragged ? '2px dashed var(--color-accent)' : undefined,
                          boxShadow: isDragged ? '0 4px 12px rgba(15, 23, 42, 0.06)' : undefined,
                          transition: isDragging ? 'none' : 'background 0.2s ease',
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        <td style={{ width: '40px', paddingLeft: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', cursor: 'grab' }}>
                          <GripVertical size={16} />
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
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: templates[tag.id] ? '#10b981' : 'var(--color-text-muted)' }}
                              onClick={() => handleExpandTemplate(tag)}
                              title="Manage messaging template"
                            >
                              <MessageSquare size={13} />
                              <span style={{ fontSize: '11px' }}>{templates[tag.id] ? 'Template ✓' : 'Template'}</span>
                              {expandedTemplateTagId === tag.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
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
                          {/* Inline template editor */}
                          {expandedTemplateTagId === tag.id && (
                            <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                  📱 Messaging Template — <span style={{ color: tag.color }}>{tag.name}</span>
                                </span>
                                {templates[tag.id] && (
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', color: 'var(--color-danger)', padding: '3px 8px' }} onClick={() => handleDeleteTemplate(tag)}>
                                    <Trash2 size={11} /> Delete Template
                                  </button>
                                )}
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '5px' }}>
                                  Primary Message Text <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <textarea
                                  className="form-input text-sm"
                                  rows={4}
                                  placeholder={`Hi {name}, we wanted to follow up regarding your enquiry about...`}
                                  value={templateText}
                                  onChange={e => setTemplateText(e.target.value)}
                                  style={{ resize: 'vertical' }}
                                />
                                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Use <code>{'{name}'}</code> for client name auto-substitution</span>
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '5px' }}>
                                  Alternate Phrasings (Variations) — Rotated randomly to avoid spam flags
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {templateVariations.map((v, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                      <textarea
                                        className="form-input text-sm"
                                        rows={3}
                                        placeholder={`Alternate version ${idx + 1}...`}
                                        value={v}
                                        onChange={e => {
                                          const updated = [...templateVariations];
                                          updated[idx] = e.target.value;
                                          setTemplateVariations(updated);
                                        }}
                                        style={{ flex: 1, resize: 'vertical' }}
                                      />
                                      <button
                                        className="btn btn-ghost btn-icon"
                                        style={{ color: 'var(--color-danger)', marginTop: '2px', padding: 4 }}
                                        onClick={() => setTemplateVariations(prev => prev.filter((_, i) => i !== idx))}
                                        title="Remove variation"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}
                                    onClick={() => setTemplateVariations(prev => [...prev, ''])}
                                  >
                                    <Plus size={11} /> Add Variation
                                  </button>
                                </div>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 16px' }}
                                disabled={savingTemplate || !templateText.trim()}
                                onClick={() => handleSaveTemplate(tag)}
                              >
                                {savingTemplate ? 'Saving...' : '💾 Save Template'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
              {filteredTags.map((tag, index) => (
                <div 
                  key={tag.id} 
                  className="card" 
                  style={{ 
                    padding: '14px 16px', 
                    margin: '0 0 var(--space-2) 0',
                    borderLeft: `4px solid ${tag.color}`,
                    background: 'var(--color-bg-card)',
                    boxShadow: 'var(--shadow-sm)',
                    borderRadius: 'var(--radius-lg)'
                  }}
                  data-index={index}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div 
                        onTouchStart={() => handleTouchStart(index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ color: 'var(--color-text-muted)', cursor: 'grab', padding: '6px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
                      >
                        <GripVertical size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, alignItems: 'flex-start' }}>
                        <span
                          className="tag-badge"
                          style={{
                            backgroundColor: `${tag.color}1c`,
                            color: tag.color,
                            border: `1px solid ${tag.color}33`,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '100px',
                            textTransform: 'uppercase',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {tag.name}
                        </span>
                        <span className="text-xs text-muted" style={{ fontSize: '10px' }}>Created: {format(tag.createdAt, 'dd MMM yyyy')}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button 
                        className="btn btn-secondary btn-icon" 
                        style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }} 
                        onClick={() => startEdit(tag)}
                        aria-label="Edit Tag"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        className="btn btn-secondary btn-icon hover-danger" 
                        style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }} 
                        onClick={() => handleDeleteTag(tag)}
                        aria-label="Delete Tag"
                      >
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
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
