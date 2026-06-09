import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Calendar, UserCheck, Search, MessageCircle, ExternalLink } from 'lucide-react';
import { getUserById, getClients } from '../../lib/firestore';
import { where } from 'firebase/firestore';
import { format } from 'date-fns';
import type { User, Client } from '../../types';
import toast from 'react-hot-toast';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  inactive: 'badge-muted',
  lead: 'badge-warning',
  closed: 'badge-danger',
};

const AgentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Fetch Agent Profile
      const agentProfile = await getUserById(id);
      if (!agentProfile || agentProfile.role !== 'agent') {
        toast.error('Agent not found');
        navigate('/admin/agents');
        return;
      }
      setAgent(agentProfile);

      // 2. Fetch Clients assigned to this agent
      const { clients: data } = await getClients([where('assignedAgent', '==', id)], 500);
      setClients(data);
      setFilteredClients(data);
    } catch (err) {
      toast.error('Failed to load agent information');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle local client search
  useEffect(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      setFilteredClients(clients);
      return;
    }
    const filtered = clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.whatsappNumber.includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
    setFilteredClients(filtered);
  }, [search, clients]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/admin/agents')} aria-label="Back to Agents">
          <ArrowLeft size={20} />
        </button>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Agent Profile</h1>
          <p className="page-subtitle">View agent details and assigned clients</p>
        </div>
      </div>

      {/* Agent Card */}
      <div className="card" style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="avatar avatar-xl" style={{ fontSize: 'var(--font-size-3xl)', width: 72, height: 72 }}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>{agent.name}</h2>
          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              <Mail size={16} />
              <span>{agent.email}</span>
            </div>
            {agent.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                <Phone size={16} />
                <span>{agent.phone}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              <Calendar size={16} />
              <span>Joined {format(agent.createdAt, 'dd MMM yyyy')}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
          <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'uppercase', padding: '0.35rem 0.75rem', fontWeight: 600 }}>
            {agent.status}
          </span>
          <span className="text-xs text-muted">Sales Agent</span>
        </div>
      </div>

      {/* Client List Card */}
      <div className="card" style={{ padding: 0 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: 200 }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Assigned Clients</h3>
            <span className="badge badge-accent text-xs">{clients.length}</span>
          </div>

          {/* Search */}
          <div className="search-wrapper" style={{ width: 280 }}>
            <Search className="search-icon" size={16} />
            <input
              id="client-search"
              type="search"
              className="form-input"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Client Table */}
        <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
          {filteredClients.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><UserCheck size={28} /></div>
              <h3 className="empty-state-title">No Clients Found</h3>
              <p className="empty-state-desc">No clients match your search criteria or are assigned to this agent.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>WhatsApp</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/clients/${client.id}`)}
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
                        onClick={() => navigate(`/admin/clients/${client.id}`)}
                        aria-label="View client"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentDetailsPage;
