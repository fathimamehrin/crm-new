import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar,
  Plus, FileText, Mic, DollarSign, Edit3, UserCheck,
  MessageCircle, ExternalLink, X, Copy, Check, Grid, List
} from 'lucide-react';
import { getClientById, getSummariesByClient, getUsers, updateClient, updateSummary } from '../lib/firestore';
import { logActivity } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { Client, Summary, User as UserType, PaymentStatus } from '../types';
import toast from 'react-hot-toast';

const PAYMENT_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  partial: 'badge-info',
  paid: 'badge-success',
  failed: 'badge-danger',
};

const ClientDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const { userRole, currentUser, userProfile } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [agents, setAgents] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassigning, setReassigning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');

  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editSummaryText, setEditSummaryText] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'summaries' | 'payments' | 'documents'>('summaries');
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('grid');

  const handleCopyWhatsApp = () => {
    if (!client) return;
    navigator.clipboard.writeText(client.whatsappNumber);
    setCopied(true);
    toast.success('WhatsApp number copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [modalEditSummaryText, setModalEditSummaryText] = useState('');
  const [modalEditAmount, setModalEditAmount] = useState('');
  const [modalEditStatus, setModalEditStatus] = useState<PaymentStatus | ''>('');
  const [modalEditTransactionId, setModalEditTransactionId] = useState('');
  const [modalEditPaymentNotes, setModalEditPaymentNotes] = useState('');
  const [savingModalEdit, setSavingModalEdit] = useState(false);

  useEffect(() => {
    if (selectedSummary) {
      setModalEditSummaryText(selectedSummary.summaryText);
      setModalEditAmount(selectedSummary.paymentDetails?.amount?.toString() || '');
      setModalEditStatus(selectedSummary.paymentDetails?.status || '');
      setModalEditTransactionId(selectedSummary.paymentDetails?.transactionId || '');
      setModalEditPaymentNotes(selectedSummary.paymentDetails?.notes || '');
      setIsEditingInModal(false);
    }
  }, [selectedSummary]);

  const handleStartEditSummary = (summary: Summary) => {
    setEditingSummaryId(summary.id);
    setEditSummaryText(summary.summaryText);
  };

  const handleSaveSummary = async (summaryId: string) => {
    if (!editSummaryText.trim()) return;
    setSavingSummary(true);
    try {
      await updateSummary(summaryId, { summaryText: editSummaryText });
      
      // Update local state
      setSummaries((prev) =>
        prev.map((s) => (s.id === summaryId ? { ...s, summaryText: editSummaryText } : s))
      );

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'summary_updated',
        entityType: 'summary',
        entityId: summaryId,
        entityName: `Edited summary for client`,
      });

      setEditingSummaryId(null);
      toast.success('Summary updated successfully');
    } catch {
      toast.error('Failed to update summary');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleSaveModalEdit = async () => {
    if (!selectedSummary) return;
    if (!modalEditSummaryText.trim()) {
      toast.error('Call notes cannot be empty');
      return;
    }

    setSavingModalEdit(true);
    try {
      const updatedPaymentDetails = modalEditStatus ? {
        amount: modalEditAmount ? parseFloat(modalEditAmount) : undefined,
        status: modalEditStatus as PaymentStatus,
        transactionId: modalEditTransactionId || undefined,
        notes: modalEditPaymentNotes || undefined,
        screenshotUrl: selectedSummary.paymentDetails?.screenshotUrl, // preserve existing screenshot
      } : undefined;

      const updatedFields = {
        summaryText: modalEditSummaryText,
        paymentDetails: updatedPaymentDetails,
      };

      await updateSummary(selectedSummary.id, updatedFields);

      // Log activity
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'summary_updated',
        entityType: 'summary',
        entityId: selectedSummary.id,
        entityName: `Edited summary details in modal`,
      });

      // Update local state
      setSummaries((prev) =>
        prev.map((s) => (s.id === selectedSummary.id ? { ...s, ...updatedFields } : s))
      );
      setSelectedSummary((prev) => prev ? { ...prev, ...updatedFields } : null);
      setIsEditingInModal(false);
      toast.success('Summary details updated successfully');
    } catch (err) {
      console.error("Failed to update summary in modal:", err);
      toast.error('Failed to update summary details');
    } finally {
      setSavingModalEdit(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [c, s, a] = await Promise.all([
          getClientById(id),
          getSummariesByClient(id),
          getUsers('agent'),
        ]);
        setClient(c);
        setSummaries(s);
        setAgents(a);
        setSelectedAgent(c?.assignedAgent || '');
      } catch {
        toast.error('Failed to load client');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleReassign = async () => {
    if (!id || !client) return;
    const agent = agents.find((a) => a.id === selectedAgent);
    try {
      await updateClient(id, {
        assignedAgent: selectedAgent,
        assignedAgentName: agent?.name || '',
      });
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'client_assigned',
        entityType: 'client',
        entityId: id,
        entityName: client.name,
      });
      setClient((c) => c ? { ...c, assignedAgent: selectedAgent, assignedAgentName: agent?.name } : c);
      setReassigning(false);
      toast.success('Agent reassigned');
    } catch {
      toast.error('Failed to reassign agent');
    }
  };

  const downloadBase64File = (dataUrl: string, fileName: string) => {
    try {
      if (!dataUrl.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || '';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download file:", err);
      toast.error("Failed to download file. Opening in new tab instead.");
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="empty-state">
        <h3>Client not found</h3>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: 'var(--space-4)' }}>Back to Dashboard</button>
      </div>
    );
  }

  const allDocuments = summaries.flatMap((s) =>
    (s.documents || []).map((doc) => ({
      ...doc,
      summaryId: s.id,
      createdAt: s.createdAt,
      createdByName: s.createdByName
    }))
  );

  return (
    <div className="page-container" style={{ maxWidth: 935, margin: '0 auto', width: '100%', padding: '0 var(--space-4)' }}>
      {/* Back & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-xl)' }}>Client Details</h1>
        </div>
      </div>

      {/* Instagram Profile Header */}
      <div className="ig-profile-header">
        <div className="ig-avatar-col">
          <div className="ig-profile-avatar-outer">
            <div className="ig-profile-avatar-inner">
              {client.profileImage ? (
                <img src={client.profileImage} alt={client.name} />
              ) : (
                client.name.charAt(0).toUpperCase()
              )}
            </div>
          </div>
        </div>

        <div className="ig-info-col">
          <div className="ig-username-row">
            <h2 className="ig-username">{client.name}</h2>
            <span className={`badge ${client.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
              {client.status}
            </span>
            <div className="ig-action-buttons">
              <button
                id="add-summary-btn"
                className="btn-ig-primary"
                onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}
              >
                <Plus size={16} />
                <span>Add Summary</span>
              </button>
              {userRole === 'admin' && (
                <button 
                  className="btn-ig-secondary" 
                  onClick={() => setReassigning((v) => !v)}
                >
                  <Edit3 size={14} />
                  <span>{reassigning ? 'Cancel' : 'Assign Agent'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Stats Row - Desktop */}
          <ul className="ig-stats-row desktop-only">
            <li className="ig-stat-item">
              <span className="ig-stat-count">{summaries.length}</span> summaries
            </li>
            <li className="ig-stat-item">
              <span className="ig-stat-count">
                {summaries.filter((s) => s.paymentDetails?.status).length}
              </span> payments
            </li>
            <li className="ig-stat-item">
              <span className="ig-stat-count">
                {allDocuments.length}
              </span> documents
            </li>
          </ul>

          {/* Bio Info */}
          <div className="ig-bio">
            <span className="ig-bio-name">{client.name}</span>
            <div className="ig-bio-meta-list">
              <div className="ig-bio-meta-item">
                <MessageCircle size={14} style={{ color: 'var(--color-success)' }} />
                <a 
                  href={`https://wa.me/${client.whatsappNumber}?text=${encodeURIComponent(`Hello ${client.name}, `)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  {client.whatsappNumber}
                </a>
                <button 
                  onClick={handleCopyWhatsApp}
                  className="btn btn-ghost"
                  style={{ padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', border: 'none', background: 'none', minHeight: 'auto', width: 'auto' }}
                  title="Copy WhatsApp Number"
                >
                  {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
                </button>
              </div>

              {client.email && (
                <div className="ig-bio-meta-item">
                  <Mail size={14} />
                  <span>{client.email}</span>
                </div>
              )}

              {client.alternateContact && (
                <div className="ig-bio-meta-item">
                  <Phone size={14} />
                  <span>{client.alternateContact}</span>
                </div>
              )}

              {client.address && (
                <div className="ig-bio-meta-item">
                  <MapPin size={14} />
                  <span>{client.address}</span>
                </div>
              )}

              <div className="ig-bio-meta-item">
                <Calendar size={14} />
                <span>Joined {format(client.createdAt, 'dd MMM yyyy')}</span>
              </div>

              {/* Reassignment block inline inside bio on active */}
              {reassigning ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: '8px', maxWidth: 300 }}>
                  <select
                    className="form-input form-select"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    id="reassign-agent-select"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleReassign}>
                    Save Assignment
                  </button>
                </div>
              ) : (
                <div className="ig-bio-meta-item">
                  <UserCheck size={14} />
                  <span>
                    Assigned Agent: <strong>{client.assignedAgentName || client.assignedAgent || 'Not Assigned'}</strong>
                  </span>
                </div>
              )}
            </div>

            {client.notes && (
              <div className="ig-bio-description">
                {client.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row - Mobile Only */}
      <div className="mobile-only">
        <ul className="ig-stats-row">
          <li className="ig-stat-item">
            <span className="ig-stat-count">{summaries.length}</span>
            <span>summaries</span>
          </li>
          <li className="ig-stat-item">
            <span className="ig-stat-count">
              {summaries.filter((s) => s.paymentDetails?.status).length}
            </span>
            <span>payments</span>
          </li>
          <li className="ig-stat-item">
            <span className="ig-stat-count">
              {allDocuments.length}
            </span>
            <span>documents</span>
          </li>
        </ul>
      </div>

      {/* Instagram Tabs Navigation */}
      <nav className="ig-tabs-nav">
        <button 
          className={`ig-tab-btn ${activeTab === 'summaries' ? 'active' : ''}`}
          onClick={() => setActiveTab('summaries')}
        >
          <Grid size={16} />
          <span>Summaries</span>
        </button>
        <button 
          className={`ig-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <DollarSign size={16} />
          <span>Payments</span>
        </button>
        <button 
          className={`ig-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={16} />
          <span>Documents</span>
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'summaries' && (
        <>
          {summaries.length > 0 && (
            <div className="ig-view-toggle">
              <button 
                className={`ig-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <Grid size={20} />
              </button>
              <button 
                className={`ig-view-toggle-btn ${viewMode === 'feed' ? 'active' : ''}`}
                onClick={() => setViewMode('feed')}
                title="Feed View"
              >
                <List size={20} />
              </button>
            </div>
          )}

          {summaries.length === 0 ? (
            <div className="card empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><FileText size={28} /></div>
              <h3 className="empty-state-title">No Summaries Yet</h3>
              <p className="empty-state-desc">Add a call summary to start tracking this client's interactions.</p>
              <button className="btn btn-primary" onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}>
                <Plus size={16} /> Add First Summary
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="ig-grid-container">
              {summaries.map((s) => {
                const hasPayment = !!s.paymentDetails?.status;
                const hasVoice = !!s.voiceUrl;
                const docCount = s.documents?.length || 0;
                return (
                  <div 
                    key={s.id} 
                    className="ig-post-tile"
                    onClick={() => {
                      if (editingSummaryId !== s.id) {
                        setSelectedSummary(s);
                      }
                    }}
                  >
                    <div className="ig-post-tile-header">
                      <span>{s.createdByName || 'Agent'}</span>
                      <span>{format(s.createdAt, 'dd MMM')}</span>
                    </div>
                    <div className="ig-post-tile-body">
                      {s.summaryText}
                    </div>
                    <div className="ig-post-tile-footer">
                      <div className="ig-tile-badge-group">
                        {hasPayment && (
                          <span className="ig-tile-badge" title={`Payment: ₹${s.paymentDetails?.amount}`}>
                            <DollarSign size={10} />
                          </span>
                        )}
                        {hasVoice && (
                          <span className="ig-tile-badge" title="Voice Recording">
                            <Mic size={10} />
                          </span>
                        )}
                        {docCount > 0 && (
                          <span className="ig-tile-badge" title={`${docCount} Documents`}>
                            <FileText size={10} />
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600 }}>View Details</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ig-feed-container">
              {summaries.map((s) => (
                <div 
                  key={s.id} 
                  className="ig-feed-post"
                  onClick={() => {
                    if (editingSummaryId !== s.id) {
                      setSelectedSummary(s);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="ig-feed-post-header">
                    <div className="ig-feed-post-author">
                      <div className="avatar avatar-sm">
                        {s.createdByName?.charAt(0).toUpperCase() || 'A'}
                      </div>
                      <div>
                        <span className="ig-feed-post-author-name">{s.createdByName || 'Unknown Agent'}</span>
                        <div className="ig-feed-post-date">{format(s.createdAt, 'dd MMM yyyy, hh:mm a')}</div>
                      </div>
                    </div>
                    {userRole === 'admin' && editingSummaryId !== s.id && (
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ padding: 4, width: 24, height: 24, color: 'var(--color-accent)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditSummary(s);
                        }}
                        title="Edit Summary"
                      >
                        <Edit3 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="ig-feed-post-body">
                    {editingSummaryId === s.id ? (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
                      >
                        <textarea
                          className="form-input text-sm"
                          style={{ minHeight: 100, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
                          value={editSummaryText}
                          onChange={(e) => setEditSummaryText(e.target.value)}
                          placeholder="Edit call summary..."
                        />
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingSummaryId(null)}
                            disabled={savingSummary}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveSummary(s.id)}
                            disabled={savingSummary || !editSummaryText.trim()}
                          >
                            {savingSummary ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.summaryText}</p>
                    )}
                  </div>

                  {/* Attachments inside Feed Card */}
                  {editingSummaryId !== s.id && (s.voiceUrl || s.documents?.length > 0 || s.paymentDetails) && (
                    <div className="ig-feed-post-attachments" onClick={(e) => e.stopPropagation()}>
                      {s.voiceUrl && (
                        <div style={{ marginBottom: '12px' }}>
                          <audio controls src={s.voiceUrl} style={{ width: '100%' }} />
                        </div>
                      )}
                      
                      {s.documents?.length > 0 && (
                        <div className="file-preview-list" style={{ gap: '8px', marginBottom: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                          {s.documents.map((doc, i) => (
                            <a 
                              key={i} 
                              href="#" 
                              onClick={(e) => {
                                e.preventDefault();
                                downloadBase64File(doc.url, doc.name);
                              }} 
                              className="file-preview-item"
                              style={{ padding: '6px 10px', background: 'var(--color-bg-secondary)', textDecoration: 'none' }}
                            >
                              <FileText size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                              <span className="text-xs font-medium truncate" style={{ flex: 1 }}>{doc.name}</span>
                              <ExternalLink size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                            </a>
                          ))}
                        </div>
                      )}

                      {s.paymentDetails && s.paymentDetails.status && (
                        <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Payment</span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{s.paymentDetails.amount !== undefined ? `₹${s.paymentDetails.amount}` : '—'}</span>
                          </div>
                          <span className={`badge ${PAYMENT_BADGE[s.paymentDetails.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '9px' }}>
                            {s.paymentDetails.status}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="ig-feed-post-footer">
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Click to open details & edits</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 600 }}>View Details →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'payments' && (
        <div className="ig-receipt-list">
          {summaries.filter(s => s.paymentDetails?.status).length === 0 ? (
            <div className="card empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><DollarSign size={28} /></div>
              <h3 className="empty-state-title">No Payments Recorded</h3>
              <p className="empty-state-desc">There are no financial summaries log entries for this client.</p>
            </div>
          ) : (
            summaries
              .filter(s => s.paymentDetails?.status)
              .map((s) => {
                const pay = s.paymentDetails!;
                return (
                  <div key={s.id} className="ig-receipt-card">
                    <div className="ig-receipt-main">
                      <div className="ig-receipt-header">
                        <span className="ig-receipt-title">Payment Record</span>
                        <span className={`badge ${PAYMENT_BADGE[pay.status || ''] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                          {pay.status}
                        </span>
                      </div>
                      
                      <div className="ig-receipt-info-grid">
                        {pay.amount !== undefined && (
                          <div className="ig-receipt-info-item">
                            <span className="ig-receipt-label">Amount</span>
                            <span className="ig-receipt-value" style={{ color: 'var(--color-success)', fontSize: '1.1rem' }}>₹{pay.amount}</span>
                          </div>
                        )}
                        
                        <div className="ig-receipt-info-item">
                          <span className="ig-receipt-label">Log Date</span>
                          <span className="ig-receipt-value">{format(s.createdAt, 'dd MMM yyyy')}</span>
                        </div>

                        {pay.transactionId && (
                          <div className="ig-receipt-info-item">
                            <span className="ig-receipt-label">Transaction ID</span>
                            <span className="ig-receipt-value mono">{pay.transactionId}</span>
                          </div>
                        )}

                        <div className="ig-receipt-info-item">
                          <span className="ig-receipt-label">Logged By</span>
                          <span className="ig-receipt-value">{s.createdByName || 'System'}</span>
                        </div>
                      </div>

                      {pay.notes && (
                        <div className="ig-receipt-notes">
                          <span className="ig-receipt-label" style={{ display: 'block', marginBottom: '4px' }}>Payment Notes</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{pay.notes}</span>
                        </div>
                      )}
                    </div>

                    {pay.screenshotUrl && (
                      <div 
                        className="ig-receipt-screenshot-container"
                        onClick={() => downloadBase64File(pay.screenshotUrl!, 'payment_screenshot.png')}
                        title="Click to download screenshot"
                      >
                        <img src={pay.screenshotUrl} alt="Receipt Screenshot" />
                        <div className="ig-receipt-screenshot-overlay">
                          <ExternalLink size={20} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="ig-doc-grid">
          {allDocuments.length === 0 ?
            <div className="card empty-state" style={{ padding: 'var(--space-10)', gridColumn: '1 / -1' }}>
              <div className="empty-state-icon"><FileText size={28} /></div>
              <h3 className="empty-state-title">No Documents Attached</h3>
              <p className="empty-state-desc">There are no files or screenshots uploaded for this client.</p>
            </div>
          :
            allDocuments.map((doc, idx) => {
              const isImage = doc.url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.name);
              return (
                <div 
                  key={idx} 
                  className="ig-doc-card"
                  onClick={() => downloadBase64File(doc.url, doc.name)}
                  title={`Click to download: ${doc.name}`}
                >
                  {isImage ? (
                    <img src={doc.url} alt={doc.name} className="ig-doc-card-image" />
                  ) : (
                    <div className="ig-doc-card-placeholder">
                      <div className="ig-doc-icon-wrapper">
                        <FileText size={24} />
                      </div>
                      <div className="ig-doc-name">{doc.name}</div>
                      <div className="ig-doc-size">{(doc.size / 1024).toFixed(1)} KB</div>
                    </div>
                  )}
                  <div className="ig-doc-card-overlay">
                    <ExternalLink size={20} />
                    <span style={{ fontSize: '11px', fontWeight: 600, wordBreak: 'break-all' }}>{doc.name}</span>
                    <span style={{ fontSize: '9px', opacity: 0.8 }}>Uploaded {format(doc.createdAt, 'dd MMM yyyy')}</span>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* Summary Detail Modal */}
      {selectedSummary && (
        <div className="modal-overlay" onClick={() => { if (!savingModalEdit) setSelectedSummary(null); }}>
          <div 
            className="modal" 
            style={{ 
              maxWidth: 600, 
              width: '95%', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: 'var(--space-5)',
              animation: 'fadeIn 0.2s ease' 
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexShrink: 0 }}>
              <h2 className="modal-title" style={{ fontSize: 'var(--font-size-lg)' }}>{isEditingInModal ? 'Edit Summary Details' : 'Summary Details'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {userRole === 'admin' && !isEditingInModal && (
                  <button 
                    className="btn btn-ghost btn-sm" 
                    onClick={() => setIsEditingInModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', height: 'auto', fontSize: 'var(--font-size-xs)', border: '1px solid var(--color-border)' }}
                  >
                    <Edit3 size={12} /> Edit Details
                  </button>
                )}
                <button className="btn btn-ghost btn-icon" onClick={() => setSelectedSummary(null)} disabled={savingModalEdit}><X size={20} /></button>
              </div>
            </div>
            
            {isEditingInModal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1, overflowY: 'auto', paddingRight: 'var(--space-1)' }}>
                {/* Creator details (read-only) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className="avatar avatar-md">
                    {selectedSummary.createdByName?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Editing summary by {selectedSummary.createdByName || 'Unknown'}</div>
                    <div className="text-xs text-muted">
                      {format(selectedSummary.createdAt, 'dd MMM yyyy, hh:mm a')}
                    </div>
                  </div>
                </div>

                {/* Call Notes input */}
                <div className="form-group">
                  <label className="form-label required" htmlFor="modal-edit-notes">Call Notes</label>
                  <textarea
                    id="modal-edit-notes"
                    className="form-input"
                    style={{ minHeight: 120, resize: 'vertical' }}
                    value={modalEditSummaryText}
                    onChange={(e) => setModalEditSummaryText(e.target.value)}
                    placeholder="Enter call notes..."
                  />
                </div>

                {/* Divider */}
                <hr className="divider" style={{ margin: 'var(--space-2) 0' }} />

                {/* Payment Details inputs */}
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                    Payment Information
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="modal-edit-status">Payment Status</label>
                        <select
                          id="modal-edit-status"
                          className="form-input form-select"
                          value={modalEditStatus}
                          onChange={(e) => setModalEditStatus(e.target.value as PaymentStatus | '')}
                        >
                          <option value="">No Payment</option>
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="modal-edit-amount">Amount (₹)</label>
                        <input
                          id="modal-edit-amount"
                          type="number"
                          step="0.01"
                          className="form-input"
                          placeholder="e.g. 1000"
                          value={modalEditAmount}
                          onChange={(e) => setModalEditAmount(e.target.value)}
                          disabled={!modalEditStatus}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="modal-edit-txid">Transaction ID</label>
                      <input
                        id="modal-edit-txid"
                        type="text"
                        className="form-input"
                        placeholder="e.g. TXN12345678"
                        value={modalEditTransactionId}
                        onChange={(e) => setModalEditTransactionId(e.target.value)}
                        disabled={!modalEditStatus}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="modal-edit-paynotes">Payment Notes</label>
                      <textarea
                        id="modal-edit-paynotes"
                        className="form-input"
                        style={{ minHeight: 60, resize: 'vertical' }}
                        placeholder="Add payment notes..."
                        value={modalEditPaymentNotes}
                        onChange={(e) => setModalEditPaymentNotes(e.target.value)}
                        disabled={!modalEditStatus}
                      />
                    </div>
                  </div>
                </div>

                {/* Edit Form Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setIsEditingInModal(false)}
                    disabled={savingModalEdit}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={handleSaveModalEdit}
                    disabled={savingModalEdit || !modalEditSummaryText.trim()}
                  >
                    {savingModalEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', flex: 1, overflowY: 'auto', paddingRight: 'var(--space-1)' }}>
                {/* Creator details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className="avatar avatar-md">
                    {selectedSummary.createdByName?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Added by {selectedSummary.createdByName || 'Unknown'}</div>
                    <div className="text-xs text-muted">
                      {format(selectedSummary.createdAt, 'dd MMM yyyy, hh:mm a')}
                    </div>
                  </div>
                </div>

                {/* Status badges */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {selectedSummary.paymentDetails?.status && (
                    <span className={`badge ${PAYMENT_BADGE[selectedSummary.paymentDetails.status] || 'badge-muted'}`}>
                      <DollarSign size={11} />
                      Payment: {selectedSummary.paymentDetails.status}
                    </span>
                  )}
                  {selectedSummary.voiceUrl && <span className="badge badge-accent"><Mic size={11} /> Has Voice</span>}
                  {selectedSummary.documents?.length > 0 && (
                    <span className="badge badge-muted"><FileText size={11} /> {selectedSummary.documents.length} Document{selectedSummary.documents.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Summary text */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Call Notes
                  </h3>
                  <div style={{ 
                    background: 'var(--color-bg-elevated)', 
                    padding: 'var(--space-4)', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-sm)',
                    lineHeight: 1.75,
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedSummary.summaryText}
                  </div>
                </div>

                {/* Voice player */}
                {selectedSummary.voiceUrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Voice Recording
                    </h3>
                    <audio controls src={selectedSummary.voiceUrl} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                  </div>
                )}

                {/* Documents */}
                {selectedSummary.documents?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Attached Documents ({selectedSummary.documents.length})
                    </h3>
                    <div className="file-preview-list">
                      {selectedSummary.documents.map((doc, i) => (
                        <a 
                          key={i} 
                          href="#" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            downloadBase64File(doc.url, doc.name);
                          }} 
                          className="file-preview-item" 
                          style={{ textDecoration: 'none' }}
                        >
                          <div className="file-preview-icon"><FileText size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="text-sm font-medium truncate">{doc.name}</div>
                            <div className="text-xs text-muted">{(doc.size / 1024).toFixed(1)} KB</div>
                          </div>
                          <ExternalLink size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Details */}
                {selectedSummary.paymentDetails && (selectedSummary.paymentDetails.amount !== undefined || selectedSummary.paymentDetails.status || selectedSummary.paymentDetails.transactionId) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--color-bg-elevated)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 0 }}>
                      Payment Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                      <div>
                        <div className="text-xs text-muted">Amount</div>
                        <div className="text-sm font-semibold">
                          {selectedSummary.paymentDetails.amount !== undefined ? `₹${selectedSummary.paymentDetails.amount}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">Status</div>
                        <span className={`badge ${PAYMENT_BADGE[selectedSummary.paymentDetails.status || ''] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                          {selectedSummary.paymentDetails.status}
                        </span>
                      </div>
                      {selectedSummary.paymentDetails.transactionId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted">Transaction ID</div>
                          <div className="text-sm font-medium" style={{ fontFamily: 'monospace' }}>
                            {selectedSummary.paymentDetails.transactionId}
                          </div>
                        </div>
                      )}
                      {selectedSummary.paymentDetails.notes && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted">Payment Notes</div>
                          <div className="text-sm text-secondary">
                            {selectedSummary.paymentDetails.notes}
                          </div>
                        </div>
                      )}
                      {selectedSummary.paymentDetails.screenshotUrl && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Payment Screenshot</div>
                          <a 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              downloadBase64File(selectedSummary.paymentDetails!.screenshotUrl!, 'screenshot.png');
                            }} 
                            style={{ display: 'block', maxWidth: 200 }}
                          >
                            <img 
                              src={selectedSummary.paymentDetails.screenshotUrl} 
                              alt="Screenshot" 
                              style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDetailsPage;
