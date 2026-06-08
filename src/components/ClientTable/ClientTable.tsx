import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MessageCircle, ExternalLink } from 'lucide-react';
import type { Client, User } from '../../types';

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
}

const ClientTable: React.FC<ClientTableProps> = ({ clients, loading, agents }) => {
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
      </div>
    );
  }

  return (
    <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
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
              onClick={() => navigate(`/clients/${client.id}`)}
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
                    <div className="font-medium text-sm">{client.name}</div>
                    {client.email && (
                      <div className="text-xs text-muted">{client.email}</div>
                    )}
                  </div>
                </div>
              </td>

              {/* WhatsApp */}
              <td>
                <a
                  href={`https://wa.me/${client.whatsappNumber}`}
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
                  onClick={() => navigate(`/clients/${client.id}`)}
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
  );
};

export default ClientTable;
