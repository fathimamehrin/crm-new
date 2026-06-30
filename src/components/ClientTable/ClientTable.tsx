import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MessageCircle, ExternalLink } from 'lucide-react';
import type { Client, User, Tag } from '../../types';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  inactive: 'badge-muted',
  lead: 'badge-warning',
  closed: 'badge-danger',
};

interface ClientTableProps {
  clients: Client[];
  loading: boolean;
  agents: User[];
  onRefresh?: () => void;
  onClearFilters?: () => void;
  isAdminView?: boolean;
  allTags: Tag[];
}

const ClientTable: React.FC<ClientTableProps> = ({ clients, loading, agents, onClearFilters, isAdminView, allTags = [] }) => {
  const navigate = useNavigate();
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-12)', display: 'flex', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <MessageCircle size={32} />
        </div>
        <h3 className="empty-state-title">No Clients Found</h3>
        <p className="empty-state-desc">
          No clients match your search or filters. Try adjusting them, or add a new client.
        </p>
        {onClearFilters && (
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            style={{ marginTop: 'var(--space-3)' }}
            onClick={onClearFilters}
          >
            Clear Search & Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop View (Standard Table) */}
      <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th>Assigned Agent</th>
              <th>Created</th>
              <th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
              >
                {/* Avatar + Name */}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div className="avatar avatar-sm">
                      {client.profileImage
                        ? <img src={client.profileImage} alt={client.name} />
                        : client.name.charAt(0).toUpperCase()
                      }
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div className="font-medium text-sm">{client.name}</div>
                        {client.projectName && (
                          <span
                            className="tag-badge sm"
                            style={{
                              backgroundColor: 'rgba(59, 130, 246, 0.06)',
                              color: 'var(--color-accent)',
                              border: '1px solid rgba(59, 130, 246, 0.15)',
                              padding: '2px 8px',
                              fontWeight: 600
                            }}
                          >
                            {client.projectName}
                          </span>
                        )}
                      </div>
                      {client.email && (
                        <div className="text-xs text-muted">{client.email}</div>
                      )}
                      {client.tags && client.tags.length > 0 && (
                        <div className="tags-list-container" style={{ marginTop: 4 }}>
                          {client.tags.map((tagId) => {
                            const tag = allTags.find((t) => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span
                                key={tag.id}
                                className="tag-badge sm"
                                style={{
                                  backgroundColor: `${tag.color}1c`,
                                  color: tag.color,
                                  border: `1px solid ${tag.color}33`,
                                }}
                              >
                                {tag.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* WhatsApp */}
                <td>
                  <a
                    href={`https://wa.me/${client.whatsappNumber}?text=${encodeURIComponent(`Hello ${client.name}, `)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm"
                    style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageCircle size={14} />
                    {client.whatsappNumber}
                    <ExternalLink size={12} style={{ opacity: 0.6 }} />
                  </a>
                </td>

                {/* Status */}
                <td>
                  <span className={`badge ${STATUS_BADGE[client.status] || 'badge-muted'}`}>
                    {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                  </span>
                </td>

                {/* Agent */}
                <td className="text-sm text-secondary">
                  {client.assignedAgent ? (agentMap[client.assignedAgent] || client.assignedAgentName || '—') : '—'}
                </td>

                {/* Date */}
                <td className="text-sm text-muted">
                  <div>{format(client.createdAt, 'dd MMM yyyy')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.7 }}>
                    {format(client.createdAt, 'hh:mm a')}
                  </div>
                </td>

                {/* Actions */}
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-icon"
                    style={{ width: 32, height: 32 }}
                    onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
                    aria-label="View client"
                  >
                    <ExternalLink size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View (Card List) */}
      <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
        {clients.map((client) => (
          <div 
            key={client.id}
            className="mobile-card"
            onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div className="avatar avatar-sm">
                  {client.profileImage
                    ? <img src={client.profileImage} alt={client.name} />
                    : client.name.charAt(0).toUpperCase()
                  }
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <div className="font-semibold text-sm text-primary">{client.name}</div>
                    {client.projectName && (
                      <span
                        className="tag-badge sm"
                        style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.06)',
                          color: 'var(--color-accent)',
                          border: '1px solid rgba(59, 130, 246, 0.15)',
                          padding: '2px 6px',
                          fontSize: '9px',
                          fontWeight: 600
                        }}
                      >
                        {client.projectName}
                      </span>
                    )}
                  </div>
                  {client.email && <div className="text-xs text-muted truncate" style={{ maxWidth: 180 }}>{client.email}</div>}
                  {client.tags && client.tags.length > 0 && (
                    <div className="tags-list-container" style={{ marginTop: 4 }}>
                      {client.tags.map((tagId) => {
                        const tag = allTags.find((t) => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tag.id}
                            className="tag-badge sm"
                            style={{
                              backgroundColor: `${tag.color}1c`,
                              color: tag.color,
                              border: `1px solid ${tag.color}33`,
                            }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <span className={`badge ${STATUS_BADGE[client.status] || 'badge-muted'}`} style={{ fontSize: '10px' }}>
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span className="text-xs text-muted">Agent: {client.assignedAgent ? (agentMap[client.assignedAgent] || client.assignedAgentName || '—') : '—'}</span>
              <span className="text-xs text-muted">{format(client.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <a
                href={`https://wa.me/${client.whatsappNumber}?text=${encodeURIComponent(`Hello ${client.name}, `)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ 
                  flex: 1, 
                  justifyContent: 'center', 
                  color: 'var(--color-success)', 
                  borderColor: 'rgba(16, 185, 129, 0.2)', 
                  background: 'rgba(16, 185, 129, 0.04)',
                  minHeight: 38
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle size={14} />
                <span>WhatsApp ({client.whatsappNumber})</span>
              </a>
              <button
                className="btn btn-secondary btn-sm btn-icon"
                style={{ minHeight: 38, width: 38 }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`);
                }}
                aria-label="View Details"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default ClientTable;
