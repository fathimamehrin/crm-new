import React, { useEffect, useState } from 'react';
import { getAllEditRequests, updateEditRequestStatus, logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { Check, X, ClipboardList, Clock, ChevronDown, ChevronUp, User, FileText, AlertCircle } from 'lucide-react';
import type { EditRequest } from '../../types';
import toast from 'react-hot-toast';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  completed: 'badge-muted',
};

const EditRequestsPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'completed'>('all');
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await getAllEditRequests();
      setRequests(data);
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

  const handleAction = async (request: EditRequest, status: 'approved' | 'rejected') => {
    try {
      await updateEditRequestStatus(request.summaryId, status);
      
      // Log this activity
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'summary_updated',
        entityType: 'summary',
        entityId: request.summaryId,
        entityName: `Edit request by ${request.agentName} ${status}`,
      });

      toast.success(`Request successfully ${status}`);
      loadRequests();
    } catch (err) {
      console.error(`Failed to ${status} request:`, err);
      toast.error(`Failed to update request`);
    }
  };

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="page-title">Edit Permission Requests</h1>
        <p className="page-subtitle">Manage agent requests to edit call summaries</p>
      </div>

      {/* Tabs Filter (Responsive Layout) */}
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
                    <th>Reason</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => (
                    <tr key={req.id}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="font-medium text-sm text-primary">{req.clientName}</span>
                        </div>
                      </td>

                      {/* Reason & Snippet */}
                      <td data-label="Reason" style={{ maxWidth: 300 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                            "{req.reason}"
                          </div>
                          <div className="text-xs text-muted truncate" title={req.summaryText} style={{ opacity: 0.8 }}>
                            Original: {req.summaryText}
                          </div>
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
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ flex: 1, justifyContent: 'center', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              onClick={() => handleAction(req, 'rejected')}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View (Card List Layout) */}
          <div className="mobile-only">
            {filteredRequests.map((req) => {
              const isExpanded = !!expandedRequests[req.id];
              const previewText = req.summaryText.length > 90 
                ? `${req.summaryText.substring(0, 90)}...` 
                : req.summaryText;

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
                    <span className={`badge ${STATUS_BADGE[req.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                      {req.status}
                    </span>
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
                      <span className="request-card-meta-label" style={{ marginBottom: 4 }}>Reason for Edit</span>
                      <div className="request-card-reason-text">
                        "{req.reason}"
                      </div>
                    </div>

                    {/* Original Notes */}
                    <div className="request-card-meta-row" style={{ marginTop: 4 }}>
                      <span className="request-card-meta-label">
                        <FileText size={12} /> Original Summary Notes
                      </span>
                      
                      {isExpanded ? (
                        <div className="request-card-original-notes">
                          {req.summaryText}
                        </div>
                      ) : (
                        <div className="text-xs text-muted" style={{ opacity: 0.9, lineHeight: 1.4, marginTop: 4 }}>
                          {previewText}
                        </div>
                      )}

                      {req.summaryText.length > 90 && (
                        <button 
                          onClick={() => toggleExpand(req.id)}
                          className="request-card-collapse-btn"
                        >
                          {isExpanded ? (
                            <>Collapse <ChevronUp size={12} /></>
                          ) : (
                            <>Show Full Notes <ChevronDown size={12} /></>
                          )}
                        </button>
                      )}
                    </div>
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
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ flex: 1, justifyContent: 'center', minHeight: 38, color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}
                          onClick={() => handleAction(req, 'rejected')}
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
