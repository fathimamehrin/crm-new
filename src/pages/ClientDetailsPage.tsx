import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Clock,
  Plus, FileText, Mic, DollarSign, Edit3, UserCheck,
  MessageCircle, ExternalLink, X,
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="page-title">Client Details</h1>
        <div style={{ flex: 1 }} />
        <button
          id="add-summary-btn"
          className="btn btn-primary"
          onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}
        >
          <Plus size={18} />
          Add Summary
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* Left: Basic Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="avatar avatar-xl" style={{ margin: '0 auto var(--space-4)' }}>
              {client.profileImage
                ? <img src={client.profileImage} alt={client.name} />
                : client.name.charAt(0).toUpperCase()
              }
            </div>
            <h2 style={{ marginBottom: 'var(--space-1)' }}>{client.name}</h2>
            <span className={`badge ${client.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
              {client.status}
            </span>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contact Info
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <MessageCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                <a href={`https://wa.me/${client.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {client.whatsappNumber} <ExternalLink size={12} />
                </a>
              </div>

              {client.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Mail size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span className="text-sm">{client.email}</span>
                </div>
              )}

              {client.alternateContact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Phone size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span className="text-sm">{client.alternateContact}</span>
                </div>
              )}

              {client.address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <MapPin size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
                  <span className="text-sm">{client.address}</span>
                </div>
              )}
            </div>

            <hr className="divider" style={{ margin: '0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-xs text-muted flex items-center gap-1"><Calendar size={12} /> Created</span>
                <span className="text-xs">{format(client.createdAt, 'dd MMM yyyy')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-xs text-muted flex items-center gap-1"><Clock size={12} /> Time</span>
                <span className="text-xs">{format(client.createdAt, 'hh:mm a')}</span>
              </div>
            </div>
          </div>

          {/* Assigned Agent */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Assigned Agent
              </h3>
              {userRole === 'admin' && (
                <button className="btn btn-ghost btn-sm" onClick={() => setReassigning((v) => !v)}>
                  <Edit3 size={12} />
                  {reassigning ? 'Cancel' : 'Edit'}
                </button>
              )}
            </div>

            {reassigning ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div className="avatar avatar-sm" style={{ background: client.assignedAgent ? undefined : 'var(--color-bg-elevated)' }}>
                  {client.assignedAgentName ? client.assignedAgentName.charAt(0) : <UserCheck size={14} />}
                </div>
                <span className="text-sm">
                  {client.assignedAgentName || client.assignedAgent || 'Not Assigned'}
                </span>
              </div>
            )}
          </div>

          {client.notes && (
            <div className="card">
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                Notes
              </h3>
              <p className="text-sm" style={{ lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
                {client.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right: Summaries */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
              Call Summaries <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 'var(--font-size-sm)' }}>({summaries.length})</span>
            </h2>
          </div>

          {summaries.length === 0 ? (
            <div className="card empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><FileText size={28} /></div>
              <h3 className="empty-state-title">No Summaries Yet</h3>
              <p className="empty-state-desc">Add a call summary to start tracking this client's interactions.</p>
              <button className="btn btn-primary" onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}>
                <Plus size={16} /> Add First Summary
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {summaries.map((s) => (
                <div 
                  key={s.id} 
                  className="card" 
                  style={{ animation: 'slideUp 0.3s ease', cursor: 'pointer' }}
                  onClick={() => {
                    if (editingSummaryId !== s.id) {
                      setSelectedSummary(s);
                    }
                  }}
                >
                  {/* Summary header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {s.paymentDetails?.status && (
                        <span className={`badge ${PAYMENT_BADGE[s.paymentDetails.status] || 'badge-muted'}`}>
                          <DollarSign size={11} />
                          {s.paymentDetails.status} {s.paymentDetails.amount ? `· ₹${s.paymentDetails.amount}` : ''}
                        </span>
                      )}
                      {s.voiceUrl && <span className="badge badge-accent"><Mic size={11} /> Voice</span>}
                      {s.documents?.length > 0 && (
                        <span className="badge badge-muted"><FileText size={11} /> {s.documents.length} doc{s.documents.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {format(s.createdAt, 'dd MMM yyyy, hh:mm a')}
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
                  </div>

                  {editingSummaryId === s.id ? (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}
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
                    <>
                      {/* Summary text */}
                      <p className="text-sm" style={{ lineHeight: 1.75, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {s.summaryText}
                      </p>

                      {/* Voice player */}
                      {s.voiceUrl && (
                        <div style={{ marginTop: 'var(--space-4)' }} onClick={(e) => e.stopPropagation()}>
                          <audio controls src={s.voiceUrl} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                        </div>
                      )}

                      {/* Documents */}
                      {s.documents?.length > 0 && (
                        <div className="file-preview-list" style={{ marginTop: 'var(--space-3)' }} onClick={(e) => e.stopPropagation()}>
                          {s.documents.map((doc, i) => (
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
                      )}

                      {/* Payment details */}
                      {s.paymentDetails && (s.paymentDetails.amount !== undefined || s.paymentDetails.status || s.paymentDetails.transactionId) && (
                        <div 
                          style={{ 
                            marginTop: 'var(--space-3)', 
                            padding: 'var(--space-3)', 
                            background: 'var(--color-bg-elevated)', 
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-2)'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Payment Information
                            </span>
                            {s.paymentDetails.status && (
                              <span className={`badge ${PAYMENT_BADGE[s.paymentDetails.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '9px', padding: '2px 6px' }}>
                                {s.paymentDetails.status}
                              </span>
                            )}
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                            {s.paymentDetails.amount !== undefined && (
                              <div>
                                <div className="text-xs text-muted">Amount</div>
                                <div className="text-sm font-semibold">₹{s.paymentDetails.amount}</div>
                              </div>
                            )}
                            {s.paymentDetails.transactionId && (
                              <div>
                                <div className="text-xs text-muted">Transaction ID</div>
                                <div className="text-sm font-medium" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{s.paymentDetails.transactionId}</div>
                              </div>
                            )}
                          </div>
                          
                          {s.paymentDetails.notes && (
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                              <div className="text-xs text-muted">Payment Notes</div>
                              <div className="text-sm text-secondary">{s.paymentDetails.notes}</div>
                            </div>
                          )}

                          {s.paymentDetails.screenshotUrl && (
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                              <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Screenshot</div>
                               <a 
                                 href="#" 
                                 onClick={(e) => {
                                   e.preventDefault();
                                   e.stopPropagation();
                                   downloadBase64File(s.paymentDetails!.screenshotUrl!, 'screenshot.png');
                                 }} 
                                 style={{ display: 'inline-block', maxWidth: 120 }}
                               >
                                <img 
                                  src={s.paymentDetails.screenshotUrl} 
                                  alt="Screenshot" 
                                  style={{ width: '100%', maxHeight: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                                />
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div className="avatar avatar-sm">
                          {s.createdByName?.charAt(0) || 'A'}
                        </div>
                        <span className="text-xs text-muted">Added by {s.createdByName || 'Unknown'}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary Detail Modal */}
      {selectedSummary && (
        <div className="modal-overlay" onClick={() => { if (!savingModalEdit) setSelectedSummary(null); }}>
          <div className="modal" style={{ maxWidth: 600, width: '90%', animation: 'fadeIn 0.2s ease' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="modal-title">{isEditingInModal ? 'Edit Summary Details' : 'Summary Details'}</h2>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '70vh', overflowY: 'auto', paddingRight: 'var(--space-2)' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '70vh', overflowY: 'auto', paddingRight: 'var(--space-2)' }}>
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
                        <span className={`badge ${PAYMENT_BADGE[selectedSummary.paymentDetails.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
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

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 320px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ClientDetailsPage;
