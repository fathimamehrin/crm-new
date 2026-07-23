import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import type { Client, User, Tag, CustomStatus, LeadSource, Task } from '../../types';

interface ClientTableProps {
  clients: Client[];
  loading: boolean;
  agents: User[];
  onRefresh?: () => void;
  onClearFilters?: () => void;
  isAdminView?: boolean;
  allTags: Tag[];
  customStatuses?: CustomStatus[];
  allSources?: LeadSource[];
  startIndex?: number;
  allTasks?: Task[];
}

const ClientTable: React.FC<ClientTableProps> = ({ 
  clients, 
  loading, 
  agents, 
  onClearFilters, 
  isAdminView, 
  allTags = [],
  customStatuses = [],
  allSources = [],
  startIndex = 0,
  allTasks = []
}) => {
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
        <table className="table" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ width: 45, paddingLeft: 'var(--space-3)' }}>#</th>
              <th style={{ minWidth: 180 }}>Client</th>
              <th style={{ minWidth: 120 }}>WhatsApp</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ minWidth: 120 }}>Lead Source</th>
              <th style={{ minWidth: 120 }}>Agent</th>
              <th style={{ minWidth: 110 }}>Active Tasks</th>
              <th style={{ width: 110 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => {
              const slNo = startIndex + index + 1;
              const statusObj = customStatuses.find(s => s.name.toLowerCase() === client.status.toLowerCase());
              const statusColor = statusObj?.color || 'transparent';
              
              // Full-tile background tint (using ~6% opacity) & left status color border
              const rowBg = statusColor !== 'transparent' ? `color-mix(in srgb, ${statusColor} 10%, transparent)` : undefined;
              const borderLeftStyle = statusColor !== 'transparent' ? `4px solid ${statusColor}` : undefined;

              return (
                <tr
                  key={client.id}
                  style={{ 
                    cursor: 'pointer',
                    background: rowBg
                  }}
                  onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
                >
                  {/* Serial Number Cell */}
                  <td 
                    className="text-sm font-bold text-muted" 
                    style={{ 
                      width: 45, 
                      paddingLeft: 'var(--space-3)', 
                      borderLeft: borderLeftStyle,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    {slNo}
                  </td>

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
                    </a>
                  </td>

                  {/* Status */}
                  <td>
                    {(() => {
                      const statusColor = statusObj?.color || '#6b7280';
                      return (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: `${statusColor}1c`,
                            color: statusColor,
                            border: `1px solid ${statusColor}33`,
                            fontWeight: 750,
                            fontSize: '11px',
                            textTransform: 'uppercase'
                          }}
                        >
                          {client.status}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Lead Source */}
                  <td className="text-sm">
                    {(() => {
                      const sourceName = client.leadSource || 'Unspecified';
                      const sourceObj = allSources.find(s => s.name.toLowerCase() === sourceName.toLowerCase());
                      const sourceColor = sourceObj?.color || '#6b7280';
                      return (
                        <span
                          className="tag-badge sm"
                          style={{
                            backgroundColor: `${sourceColor}10`,
                            color: sourceColor,
                            border: `1px solid ${sourceColor}25`,
                            padding: '2px 8px',
                            fontWeight: 700,
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {sourceName}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Agent */}
                  <td className="text-sm">
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {client.assignedAgent ? (agentMap[client.assignedAgent] || client.assignedAgentName || 'Unassigned') : 'Unassigned'}
                    </span>
                  </td>

                  {/* Active Tasks */}
                  <td>
                    {(() => {
                      const clientTasks = allTasks.filter(t => t.clientId === client.id && t.status !== 'verified');
                      if (clientTasks.length > 0) {
                        return (
                          <span
                            className="badge badge-accent"
                            style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', whiteSpace: 'nowrap' }}
                          >
                            {clientTasks.length} task{clientTasks.length > 1 ? 's' : ''}
                          </span>
                        );
                      }
                      return <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>;
                    })()}
                  </td>

                  {/* Date */}
                  <td className="text-sm text-muted">
                    <div>{format(client.createdAt, 'dd MMM yyyy')}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.7 }}>
                      {format(client.createdAt, 'hh:mm a')}
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile View (Card List) */}
      <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
        {clients.map((client, index) => {
          const slNo = startIndex + index + 1;
          const statusObj = customStatuses.find(s => s.name.toLowerCase() === client.status.toLowerCase());
          const statusColor = statusObj?.color || 'transparent';

          // Full-card background tint (using ~6% opacity) & left status color border
          const cardBg = statusColor !== 'transparent' ? `color-mix(in srgb, ${statusColor} 8%, var(--color-bg-card))` : 'var(--color-bg-card)';
          const borderLeftStyle = statusColor !== 'transparent' ? `4px solid ${statusColor}` : undefined;

          return (
            <div 
              key={client.id}
              className="mobile-card"
              onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
              style={{
                background: cardBg,
                borderLeft: borderLeftStyle
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {/* Serial Number Display next to avatar */}
                  <span 
                    style={{ 
                      fontSize: '13px', 
                      fontWeight: 800, 
                      color: 'var(--color-text-muted)', 
                      minWidth: '20px', 
                      textAlign: 'center' 
                    }}
                  >
                    {slNo}
                  </span>
                  
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
                {(() => {
                  const statusColor = statusObj?.color || '#6b7280';
                  return (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${statusColor}1c`,
                        color: statusColor,
                        border: `1px solid ${statusColor}33`,
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        fontWeight: 750
                      }}
                    >
                      {client.status}
                    </span>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-1)', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Agent: {client.assignedAgent ? (agentMap[client.assignedAgent] || client.assignedAgentName || '—') : '—'}</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{format(client.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
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
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ClientTable;
