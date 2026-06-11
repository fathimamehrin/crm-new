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
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/admin/agents')} aria-label="Back to Agents">
          <ArrowLeft size={20} />
        </button>
        <div className="page-header" style={{ marginBottom: 0 , marginTop:'10px' }}>
          <h1 className="page-title">Agent Profile</h1>
          <p className="page-subtitle">View agent details and assigned clients</p>
        </div>
      </div>

      {/* Agent Card */}
      <div className="card" style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' , 
      boxShadow: '0 10px 30px rgba(31, 110, 238, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04)'}}>
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
      <div className="card" style={{ padding: 0 , boxShadow: '0 10px 30px rgba(31, 110, 238, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04)'}}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: 200 }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Assigned Clients</h3>
            <span className="badge badge-accent text-md">{clients.length}</span>
          </div>

          {/* Search */}
          <div className="search-wrapper" style={{ flex: '1 1 300px', maxWidth: 380 }}>
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

        {/* Client Table - Desktop Only */}
        <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
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

        {/* Client Cards - Mobile Only */}
        {filteredClients.length === 0 ? (
          <div className="empty-state mobile-only" style={{ padding: 'var(--space-10)' }}>
            <div className="empty-state-icon"><UserCheck size={28} /></div>
            <h3 className="empty-state-title">No Clients Found</h3>
            <p className="empty-state-desc">No clients match your search criteria or are assigned to this agent.</p>
          </div>
        ) : (          <div className="mobile-client-list mobile-only-flex" style={{ flexDirection: 'column', gap: '12px', padding: '16px', width: '100%', boxSizing: 'border-box' }}>
            {filteredClients.map((client) => (
              <div
                key={client.id}
                className="client-card"
                onClick={() => navigate(`/admin/clients/${client.id}`)}
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Header: Avatar, Name, Status Badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div className="avatar avatar-md" style={{ width: 44, height: 44, flexShrink: 0, background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontWeight: 600 }}>
                      {client.profileImage ? (
                        <img src={client.profileImage} alt={client.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        client.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text-primary)', wordBreak: 'break-word', lineHeight: 1.25 }}>
                      {client.name}
                    </h4>
                  </div>
                  <span className={`badge ${STATUS_BADGE[client.status] || 'badge-muted'}`} style={{ fontSize: '0.75rem', padding: '4px 8px', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
                    {client.status}
                  </span>
                </div>

                {/* Metadata List / Grid (styled like ClientDetailsPage) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    <MessageCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                    <a
                      href={`https://wa.me/${client.whatsappNumber}?text=${encodeURIComponent(`Hello ${client.name}, `)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-text-accent)', textDecoration: 'none', fontWeight: 500 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {client.whatsappNumber}
                    </a>
                  </div>

                  {client.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', minWidth: 0 }}>
                      <Mail size={14} style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.email}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    <Calendar size={14} style={{ flexShrink: 0 }} />
                    <span>Joined: {format(client.createdAt, 'dd MMM yyyy')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentDetailsPage;
