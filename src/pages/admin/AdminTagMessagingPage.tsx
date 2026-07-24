import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Search, Send, Tag as TagIcon, RefreshCw, Users, ChevronDown, ChevronUp, ExternalLink, CheckCircle } from 'lucide-react';
import { getTags, getTagTemplates, getClients, logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { Tag, TagTemplate, Client } from '../../types';
import toast from 'react-hot-toast';
import { where } from 'firebase/firestore';

// ─── Message Variation Rotation ───────────────────────────────────────────────
// Picks a random variation from the template's list (or falls back to templateText).
// Rotating prevents identical message copies from triggering spam flags.
function pickVariation(template: TagTemplate): string {
  const pool = [template.templateText, ...template.variations].filter(Boolean);
  if (pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildWhatsAppLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

interface ClientWithStatus extends Client {
  messageSent?: boolean;
}

const AdminTagMessagingPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<TagTemplate[]>([]);
  const [clients, setClients] = useState<ClientWithStatus[]>([]);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(true);

  // Template preview with rotating variation
  const [previewText, setPreviewText] = useState('');
  const [selectedVariationIdx, setSelectedVariationIdx] = useState<number>(-1); // -1 = random

  const selectedTag = tags.find(t => t.id === selectedTagId);
  const selectedTemplate = templates.find(t => t.tagId === selectedTagId) || null;

  // Load tags and templates on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fetchedTags, fetchedTemplates] = await Promise.all([
          getTags(),
          getTagTemplates(),
        ]);
        setTags(fetchedTags.filter(t => t.status === 'active'));
        setTemplates(fetchedTemplates);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load tags and templates');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // When tag changes, load matching clients and refresh preview
  useEffect(() => {
    if (!selectedTagId) {
      setClients([]);
      setPreviewText('');
      return;
    }
    loadClientsForTag(selectedTagId);
    refreshPreview();
  }, [selectedTagId, templates]);

  const loadClientsForTag = async (tagId: string) => {
    setLoadingClients(true);
    try {
      const { clients: result } = await getClients([where('tags', 'array-contains', tagId)]);
      setClients(result.map(c => ({ ...c, messageSent: false })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load clients for this tag');
    } finally {
      setLoadingClients(false);
    }
  };

  const refreshPreview = useCallback(() => {
    const tmpl = templates.find(t => t.tagId === selectedTagId);
    if (!tmpl) {
      setPreviewText('');
      return;
    }
    if (selectedVariationIdx === -1) {
      setPreviewText(pickVariation(tmpl));
    } else {
      const pool = [tmpl.templateText, ...tmpl.variations];
      setPreviewText(pool[selectedVariationIdx] || tmpl.templateText);
    }
  }, [selectedTagId, templates, selectedVariationIdx]);

  useEffect(() => {
    refreshPreview();
  }, [selectedVariationIdx, refreshPreview]);

  // Send message to a single client
  const handleSendToClient = async (client: ClientWithStatus) => {
    if (!previewText) {
      toast.error('No template text set for this tag');
      return;
    }
    if (!selectedTag) return;

    // Personalise message with client name
    const personalised = previewText.replace(/\{name\}/gi, client.name).replace(/\{client\}/gi, client.name);
    const link = buildWhatsAppLink(client.whatsappNumber, personalised);

    // Open WhatsApp
    window.open(link, '_blank');

    // Log the delivery
    try {
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'tag_message_sent',
        entityType: 'client',
        entityId: client.id,
        entityName: `Tag message sent to ${client.name} via tag "${selectedTag.name}"`,
      });
    } catch (err) {
      console.error('Failed to log delivery:', err);
    }

    // Mark as sent in local state and rotate for next client
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, messageSent: true } : c));
    if (selectedVariationIdx === -1) {
      refreshPreview(); // rotate variation for next send
    }

    toast.success(`WhatsApp opened for ${client.name}`);
  };

  // Bulk open all visible clients
  const handleBulkSend = async () => {
    if (!previewText || !selectedTag) {
      toast.error('No template text set for this tag');
      return;
    }
    const visible = filteredClients;
    if (visible.length === 0) {
      toast.error('No clients to message');
      return;
    }
    if (!window.confirm(`Open WhatsApp for all ${visible.length} visible clients? Your browser may block multiple tabs.`)) return;

    for (const client of visible) {
      const tmpl = selectedTemplate;
      const msg = (tmpl ? pickVariation(tmpl) : previewText)
        .replace(/\{name\}/gi, client.name)
        .replace(/\{client\}/gi, client.name);
      const link = buildWhatsAppLink(client.whatsappNumber, msg);
      window.open(link, '_blank');

      try {
        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'tag_message_sent',
          entityType: 'client',
          entityId: client.id,
          entityName: `Tag message sent to ${client.name} via tag "${selectedTag.name}"`,
        });
      } catch { /* silent */ }
    }
    setClients(prev => prev.map(c => visible.find(v => v.id === c.id) ? { ...c, messageSent: true } : c));
    toast.success(`Opened WhatsApp for ${visible.length} clients`);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.whatsappNumber.includes(searchQuery)
  );

  const variationPool = selectedTemplate
    ? [selectedTemplate.templateText, ...selectedTemplate.variations]
    : [];

  return (
    <div className="page-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={22} color="#fff" />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Tag Messaging</h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Send WhatsApp templates to clients by tag — rotates message variations to reduce spam flags
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Left Panel — Tag selector + Template preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Tag Selector */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <TagIcon size={16} style={{ color: 'var(--color-accent)' }} />
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Select Tag</h3>
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}><div className="spinner" /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tags.map(tag => {
                  const hasTemplate = templates.some(t => t.tagId === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => { setSelectedTagId(tag.id); setSelectedVariationIdx(-1); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-lg)',
                        border: selectedTagId === tag.id ? `2px solid ${tag.color}` : '1px solid var(--color-border)',
                        background: selectedTagId === tag.id ? `${tag.color}10` : 'var(--color-bg-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{tag.name}</span>
                      </div>
                      {hasTemplate ? (
                        <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '2px 7px', borderRadius: '20px', fontWeight: 700 }}>Template ✓</span>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>No template</span>
                      )}
                    </button>
                  );
                })}
                {tags.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', margin: '8px 0' }}>No active tags found</p>
                )}
              </div>
            )}
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <div className="card" style={{ padding: '20px' }}>
              <button
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: expandedPreview ? '14px' : 0 }}
                onClick={() => setExpandedPreview(p => !p)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={16} style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Message Preview</span>
                </div>
                {expandedPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedPreview && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Variation selector */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      Message Variation
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <button
                        onClick={() => setSelectedVariationIdx(-1)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          border: selectedVariationIdx === -1 ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                          background: selectedVariationIdx === -1 ? 'rgba(59,130,246,0.1)' : 'transparent',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: selectedVariationIdx === -1 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        }}
                      >🔀 Random</button>
                      {variationPool.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedVariationIdx(idx)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            border: selectedVariationIdx === idx ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: selectedVariationIdx === idx ? 'rgba(59,130,246,0.1)' : 'transparent',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: selectedVariationIdx === idx ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {idx === 0 ? 'Primary' : `Alt ${idx}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview bubble */}
                  <div style={{ background: 'rgba(37, 211, 102, 0.07)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '12px', padding: '14px', fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: '80px' }}>
                    {previewText || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No template text</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                      onClick={refreshPreview}
                    >
                      <RefreshCw size={12} /> Rotate
                    </button>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                      Use <code style={{ fontSize: '11px', background: 'var(--color-bg-secondary)', padding: '0 4px', borderRadius: '3px' }}>{'{name}'}</code> for client name
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No template warning */}
          {selectedTagId && !selectedTemplate && (
            <div style={{ padding: '16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-lg)', fontSize: '13px', color: '#b45309' }}>
              ⚠️ No template set for this tag. Go to <strong>Admin → Tags</strong> to add a messaging template.
            </div>
          )}
        </div>

        {/* Right Panel — Client list */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} style={{ color: 'var(--color-accent)' }} />
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                {selectedTag ? (
                  <>Clients tagged <span style={{ color: selectedTag.color, fontWeight: 800 }}>"{selectedTag.name}"</span></>
                ) : (
                  'Select a tag to see clients'
                )}
              </h3>
              {!loadingClients && selectedTagId && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>({filteredClients.length} {filteredClients.length === 1 ? 'client' : 'clients'})</span>
              )}
            </div>
            {selectedTagId && selectedTemplate && filteredClients.length > 0 && (
              <button
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                onClick={handleBulkSend}
              >
                <Send size={13} /> Bulk Open All ({filteredClients.length})
              </button>
            )}
          </div>

          {/* Search */}
          {selectedTagId && (
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '32px', height: '36px', fontSize: '13px' }}
                placeholder="Search clients by name or number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* Client list */}
          {!selectedTagId ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
              <MessageSquare size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>Select a tag on the left to load clients</p>
            </div>
          ) : loadingClients ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}><div className="spinner" /></div>
          ) : filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--color-text-muted)' }}>
              <Users size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>No clients found with this tag</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredClients.map(client => (
                <div
                  key={client.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: client.messageSent ? '1px solid rgba(16,185,129,0.35)' : '1px solid var(--color-border)',
                    background: client.messageSent ? 'rgba(16,185,129,0.05)' : 'var(--color-bg-secondary)',
                    gap: '12px',
                    flexWrap: 'wrap',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-accent), #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{client.whatsappNumber}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {client.messageSent && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                        <CheckCircle size={13} /> Sent
                      </span>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '5px 12px' }}
                      onClick={() => handleSendToClient(client)}
                      disabled={!selectedTemplate}
                      title={!selectedTemplate ? 'No template for this tag' : `Open WhatsApp for ${client.name}`}
                    >
                      <ExternalLink size={12} /> Open WA
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTagMessagingPage;
