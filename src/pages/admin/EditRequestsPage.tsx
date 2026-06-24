import React, { useEffect, useState } from 'react';
import { 
  getAllEditRequests, 
  updateEditRequestStatus, 
  getAllClientEditRequests, 
  updateClientEditRequestStatus, 
  logActivity 
} from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { Check, X, ClipboardList, Clock, ChevronDown, ChevronUp, User, AlertCircle, AlertTriangle, Trash2, Edit3, UserCheck } from 'lucide-react';
import type { EditRequest, ClientEditRequest } from '../../types';
import toast from 'react-hot-toast';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  completed: 'badge-muted',
};

const REQUEST_TYPE_BADGE: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
  delete: { cls: 'badge-danger', label: 'Deletion', icon: <Trash2 size={10} /> },
  edit: { cls: 'badge-info', label: 'Edit', icon: <Edit3 size={10} /> },
};

/* Helper: Render a single field diff row */
const DiffRow: React.FC<{ label: string; original?: string; proposed?: string }> = ({ label, original, proposed }) => {
  if (original === proposed) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span className="text-xs font-semibold" style={{ textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {original !== undefined && (
          <span className="text-xs" style={{ color: 'var(--color-danger)', textDecoration: 'line-through', opacity: 0.8, wordBreak: 'break-word', flex: 1, minWidth: 120 }}>
            {original || '(empty)'}
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--color-success)', fontWeight: 500, wordBreak: 'break-word', flex: 1, minWidth: 120 }}>
          → {proposed || '(empty)'}
        </span>
      </div>
    </div>
  );
};

/* Helper: Render proposed changes for a summary edit request */
const SummaryDiffView: React.FC<{ req: EditRequest }> = ({ req }) => {
  if (req.requestType === 'delete') {
    return (
      <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-md)', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>Deletion Requested</span>
        </div>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          This summary will be <strong>permanently deleted</strong> from the database when approved.
        </p>
        {req.summaryText && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)' }}>
            <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>Summary to be deleted:</span>
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{req.summaryText}</span>
          </div>
        )}
      </div>
    );
  }

  if (!req.proposedChanges) return null;
  const pc = req.proposedChanges;
  const hasSummaryChange = pc.summaryText !== undefined && pc.summaryText !== req.summaryText;
  const hasPaymentChanges = pc.paymentDetails !== undefined;

  if (!hasSummaryChange && !hasPaymentChanges) {
    return <span className="text-xs text-muted">No visible changes in this request.</span>;
  }

  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <span className="text-xs font-semibold" style={{ textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
        Proposed Changes
      </span>
      {hasSummaryChange && (
        <DiffRow label="Call Notes" original={req.summaryText} proposed={pc.summaryText} />
      )}
      {hasPaymentChanges && pc.paymentDetails && (
        <>
          {pc.paymentDetails.status && (
            <DiffRow label="Payment Status" proposed={pc.paymentDetails.status} />
          )}
          {pc.paymentDetails.amount !== undefined && (
            <DiffRow label="Amount" proposed={`₹${pc.paymentDetails.amount}`} />
          )}
          {pc.paymentDetails.transactionId && (
            <DiffRow label="Transaction ID" proposed={pc.paymentDetails.transactionId} />
          )}
          {pc.paymentDetails.notes && (
            <DiffRow label="Payment Notes" proposed={pc.paymentDetails.notes} />
          )}
        </>
      )}
    </div>
  );
};

/* Helper: Render proposed changes for a client edit request */
const ClientDiffView: React.FC<{ req: ClientEditRequest }> = ({ req }) => {
  if (req.requestType === 'delete') {
    return (
      <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-md)', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>Client Deletion Requested</span>
        </div>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Client <strong>"{req.clientName}"</strong> and all their records will be <strong>permanently deleted</strong> when approved.
        </p>
      </div>
    );
  }

  if (!req.proposedChanges) return null;
  const pc = req.proposedChanges;
  const fields: { key: string; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'whatsappNumber', label: 'WhatsApp Number' },
    { key: 'email', label: 'Email' },
    { key: 'alternateContact', label: 'Alternate Contact' },
    { key: 'address', label: 'Address' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' },
    { key: 'assignedAgent', label: 'Assigned Agent ID' },
    { key: 'assignedAgentName', label: 'Assigned Agent' },
  ];

  const changedFields = fields.filter(f => (pc as any)[f.key] !== undefined);

  if (changedFields.length === 0) {
    return <span className="text-xs text-muted">No visible changes in this request.</span>;
  }

  // Check if this is a takeover/claim request
  const isTakeover = changedFields.some(f => f.key === 'assignedAgent' || f.key === 'assignedAgentName');

  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      {isTakeover && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 10px', background: 'rgba(59, 130, 246, 0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
          <UserCheck size={14} style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
            Client Takeover / Reassignment Request
          </span>
        </div>
      )}
      <span className="text-xs font-semibold" style={{ textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
        Proposed Changes
      </span>
      {changedFields.map(f => (
        <DiffRow key={f.key} label={f.label} proposed={String((pc as any)[f.key] ?? '')} />
      ))}
    </div>
  );
};

const EditRequestsPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  
  // Data states
  const [summaryRequests, setSummaryRequests] = useState<EditRequest[]>([]);
  const [clientRequests, setClientRequests] = useState<ClientEditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Tab selectors
  const [requestType, setRequestType] = useState<'summary' | 'client' | 'claim'>('summary');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'completed'>('all');
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [summariesData, clientsData] = await Promise.all([
        getAllEditRequests(),
        getAllClientEditRequests(),
      ]);
      setSummaryRequests(summariesData);
      setClientRequests(clientsData);
    } catch (err) {
      console.error('Failed to load edit requests:', err);
      toast.error('Failed to load edit requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedRequests(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = async (request: EditRequest | ClientEditRequest, status: 'approved' | 'rejected') => {
    const reqId = request.id;
    setProcessingId(reqId);
    try {
      const reqTypeLabel = request.requestType === 'delete' ? 'deletion' : 'edit';

      if (requestType === 'summary') {
        const req = request as EditRequest;
        await updateEditRequestStatus(req.summaryId, status);
        
        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'summary_updated',
          entityType: 'summary',
          entityId: req.summaryId,
          entityName: `${reqTypeLabel} request by ${req.agentName} ${status}`,
        });
      } else {
        const req = request as ClientEditRequest;
        await updateClientEditRequestStatus(req.clientId, status);

        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'client_updated',
          entityType: 'client',
          entityId: req.clientId,
          entityName: `${reqTypeLabel} request by ${req.agentName} ${status}`,
        });
      }

      if (status === 'approved') {
        if (request.requestType === 'delete') {
          toast.success('Request approved — record has been deleted');
        } else {
          toast.success('Request approved — changes have been applied');
        }
      } else {
        toast.success('Request rejected');
      }
      loadRequests();
    } catch (err) {
      console.error(`Failed to ${status} request:`, err);
      toast.error(`Failed to update request`);
    } finally {
      setProcessingId(null);
    }
  };

  const isClaimRequest = (req: ClientEditRequest) => {
    return !!(req.proposedChanges && req.proposedChanges.assignedAgent !== undefined);
  };

  const activeRequests = 
    requestType === 'summary' 
      ? summaryRequests 
      : requestType === 'client' 
        ? clientRequests.filter(r => !isClaimRequest(r)) 
        : clientRequests.filter(r => isClaimRequest(r));

  const counts = {
    all: activeRequests.length,
    pending: activeRequests.filter(r => r.status === 'pending').length,
    approved: activeRequests.filter(r => r.status === 'approved').length,
    rejected: activeRequests.filter(r => r.status === 'rejected').length,
    completed: activeRequests.filter(r => r.status === 'completed').length,
  };

  const filteredRequests = activeRequests.filter(req => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const getRequestTypeBadge = (reqType?: 'edit' | 'delete') => {
    const type = reqType || 'edit';
    const config = REQUEST_TYPE_BADGE[type];
    return (
      <span className={`badge ${config.cls}`} style={{ fontSize: '9px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase' }}>
        {config.icon} {config.label}
      </span>
    );
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="page-title">Edit Permission Requests</h1>
        <p className="page-subtitle">Review and approve agent requests to edit or delete records. Approved changes are applied automatically.</p>
      </div>

      {/* Top Level Category Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-5)' }}>
        <button
          className={`tab-btn ${requestType === 'summary' ? 'active' : ''}`}
          onClick={() => { setRequestType('summary'); setActiveTab('all'); }}
        >
          Call Summaries
        </button>
        <button
          className={`tab-btn ${requestType === 'client' ? 'active' : ''}`}
          onClick={() => { setRequestType('client'); setActiveTab('all'); }}
        >
          Client Information
        </button>
        <button
          className={`tab-btn ${requestType === 'claim' ? 'active' : ''}`}
          onClick={() => { setRequestType('claim'); setActiveTab('all'); }}
        >
          Claim Requests
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="requests-tabs">
        {(['all', 'pending', 'approved', 'rejected', 'completed'] as const).map((tab) => {
          const count = counts[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              className={`requests-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              <span style={{ textTransform: 'capitalize' }}>{tab}</span>
              {count > 0 && (
                <span className="requests-tab-badge">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><ClipboardList size={28} /></div>
            <h3 className="empty-state-title">No Requests Found</h3>
            <p className="empty-state-desc">There are no {activeTab !== 'all' ? activeTab : ''} requests to show.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop View (Table Layout inside a card wrapper) */}
          <div className="card desktop-only" style={{ padding: 0 }}>
            <div className="table-wrapper table-responsive-stack" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Details</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const isExpanded = !!expandedRequests[req.id];
                    return (
                      <React.Fragment key={req.id}>
                        <tr>
                          {/* Agent Name */}
                          <td data-label="Agent">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                              <div className="avatar avatar-sm">{req.agentName.charAt(0)}</div>
                              <div>
                                <div className="font-semibold text-sm">{req.agentName}</div>
                                <div className="text-xs text-muted">ID: {req.agentId.substring(0, 6)}...</div>
                              </div>
                            </div>
                          </td>

                          {/* Client Name */}
                          <td data-label="Client">
                            <span className="font-medium text-sm text-primary">{req.clientName}</span>
                          </td>

                          {/* Request Type */}
                          <td data-label="Type">
                            {getRequestTypeBadge(req.requestType)}
                          </td>

                          {/* Details: Reason + expand toggle */}
                          <td data-label="Details" style={{ maxWidth: 350 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div className="text-sm" style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                                <strong>Reason:</strong> "{req.reason || 'No reason provided'}"
                              </div>
                              <button
                                onClick={() => toggleExpand(req.id)}
                                className="btn btn-ghost btn-sm"
                                style={{ alignSelf: 'flex-start', padding: '2px 8px', height: 'auto', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                {isExpanded ? <><ChevronUp size={12} /> Hide Details</> : <><ChevronDown size={12} /> View Changes</>}
                              </button>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="text-sm text-muted" data-label="Requested">
                            <div>{format(req.createdAt, 'dd MMM yyyy')}</div>
                            <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.7 }}>
                              {format(req.createdAt, 'hh:mm a')}
                            </div>
                          </td>

                          {/* Status */}
                          <td data-label="Status">
                            <span className={`badge ${STATUS_BADGE[req.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                              {req.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td data-label="Actions">
                            {req.status === 'pending' ? (
                              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <button
                                  className="btn btn-sm btn-primary"
                                  style={{ flex: 1, justifyContent: 'center' }}
                                  onClick={() => handleAction(req, 'approved')}
                                  disabled={processingId === req.id}
                                >
                                  {processingId === req.id ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <><Check size={14} /> Approve</>}
                                </button>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  style={{ flex: 1, justifyContent: 'center', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                  onClick={() => handleAction(req, 'rejected')}
                                  disabled={processingId === req.id}
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                                Resolved {req.updatedAt ? format(req.updatedAt, 'dd MMM, hh:mm a') : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* Expanded diff row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: '0 var(--space-4) var(--space-4)', background: 'var(--color-bg-elevated)' }}>
                              {requestType === 'summary' ? (
                                <SummaryDiffView req={req as EditRequest} />
                              ) : (
                                <ClientDiffView req={req as ClientEditRequest} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View (Card List Layout) */}
          <div className="mobile-only">
            {filteredRequests.map((req) => {
              const isExpanded = !!expandedRequests[req.id];

              return (
                <div 
                  key={req.id}
                  className={`premium-request-card status-${req.status}`}
                >
                  {/* Header */}
                  <div className="request-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="avatar avatar-sm" style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontWeight: 600 }}>
                        {req.agentName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{req.agentName}</div>
                        <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <User size={10} /> Agent
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <span className={`badge ${STATUS_BADGE[req.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                        {req.status}
                      </span>
                      {getRequestTypeBadge(req.requestType)}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="request-card-body">
                    {/* Client */}
                    <div className="request-card-meta-row">
                      <span className="request-card-meta-label">
                        <User size={12} style={{ color: 'var(--color-accent)' }} /> Client Name
                      </span>
                      <span className="request-card-meta-value" style={{ color: 'var(--color-text-primary)', fontSize: '0.925rem' }}>
                        {req.clientName}
                      </span>
                    </div>

                    {/* Reason */}
                    <div className="request-card-reason-box">
                      <span className="request-card-meta-label" style={{ marginBottom: 4 }}>Reason</span>
                      <div className="request-card-reason-text">
                        "{req.reason || 'No reason provided'}"
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <button 
                      onClick={() => toggleExpand(req.id)}
                      className="request-card-collapse-btn"
                      style={{ marginTop: 4 }}
                    >
                      {isExpanded ? (
                        <>Hide Changes <ChevronUp size={12} /></>
                      ) : (
                        <>View Proposed Changes <ChevronDown size={12} /></>
                      )}
                    </button>

                    {/* Diff view */}
                    {isExpanded && (
                      <div style={{ marginTop: 4 }}>
                        {requestType === 'summary' ? (
                          <SummaryDiffView req={req as EditRequest} />
                        ) : (
                          <ClientDiffView req={req as ClientEditRequest} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer / Actions */}
                  <div className="request-card-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      <Clock size={12} />
                      <span>Requested: {format(req.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
                    </div>

                    {req.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 4 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ flex: 1, justifyContent: 'center', minHeight: 38 }}
                          onClick={() => handleAction(req, 'approved')}
                          disabled={processingId === req.id}
                        >
                          {processingId === req.id ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <><Check size={14} /> Approve</>}
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ flex: 1, justifyContent: 'center', minHeight: 38, color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}
                          onClick={() => handleAction(req, 'rejected')}
                          disabled={processingId === req.id}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : (
                      <div className="request-card-footer-resolved" style={{ borderTop: '1px solid rgba(15, 23, 42, 0.04)', paddingTop: 8, marginTop: 2 }}>
                        <AlertCircle size={12} />
                        <span>
                          Resolved {req.updatedAt ? format(req.updatedAt, 'dd MMM, hh:mm a') : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default EditRequestsPage;
