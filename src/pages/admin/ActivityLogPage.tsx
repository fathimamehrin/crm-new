import React, { useEffect, useState, useCallback } from 'react';
import { getActivityLogs, getUsers } from '../../lib/firestore';
import { where } from 'firebase/firestore';
import type { ActivityLog, User } from '../../types';
import { format } from 'date-fns';
import { Activity, Search, Calendar, X } from 'lucide-react';
import Pagination from '../../components/Pagination';

const ACTION_LABELS: Record<string, { label: string; badge: string }> = {
  client_created: { label: 'Client Created', badge: 'badge-success' },
  client_updated: { label: 'Client Updated', badge: 'badge-info' },
  client_assigned: { label: 'Client Assigned', badge: 'badge-accent' },
  summary_added: { label: 'Summary Added', badge: 'badge-success' },
  payment_updated: { label: 'Payment Updated', badge: 'badge-warning' },
  agent_created: { label: 'Agent Created', badge: 'badge-success' },
  agent_updated: { label: 'Agent Updated', badge: 'badge-info' },
  agent_enabled: { label: 'Agent Enabled', badge: 'badge-success' },
  agent_disabled: { label: 'Agent Disabled', badge: 'badge-danger' },
  admin_created: { label: 'Admin Created', badge: 'badge-accent' },
  admin_enabled: { label: 'Admin Enabled', badge: 'badge-success' },
  admin_disabled: { label: 'Admin Disabled', badge: 'badge-danger' },
  user_login: { label: 'User Login', badge: 'badge-muted' },
  user_logout: { label: 'User Logout', badge: 'badge-muted' },
  tag_created: { label: 'Tag Created', badge: 'badge-success' },
  tag_updated: { label: 'Tag Updated', badge: 'badge-info' },
  tag_deleted: { label: 'Tag Deleted', badge: 'badge-danger' },
};

const ActivityLogPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const PAGE_SIZE = 30;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (agentFilter) constraints.push(where('userId', '==', agentFilter));
      const data = await getActivityLogs(constraints, 500);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, [agentFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { getUsers('agent').then(setAgents).catch(() => { }); }, []);

  const filtered = logs.filter((log) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      log.userName?.toLowerCase().includes(q) ||
      log.entityName?.toLowerCase().includes(q) ||
      log.action.includes(q);
    const matchDate =
      (!dateFrom || log.createdAt >= new Date(dateFrom)) &&
      (!dateTo || log.createdAt <= new Date(dateTo + 'T23:59:59'));
    return matchSearch && matchDate;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity Logs</h1>
        <p className="page-subtitle">Complete audit trail of all system actions</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', paddingBottom: '4px' }}>
          
          {isSearchExpanded ? (
            <div className="search-wrapper" style={{ flex: '1 1 auto', minWidth: 200, display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Search className="search-icon" size={16} />
              <input
                id="activity-search"
                type="search"
                className="form-input"
                placeholder="Search by user, entity, action…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                autoFocus
                style={{ paddingRight: 32, width: '100%' }}
              />
              <button 
                className="btn btn-ghost btn-icon" 
                style={{ position: 'absolute', right: 8, height: 24, width: 24, minHeight: 0, padding: 0 }} 
                onClick={() => { setIsSearchExpanded(false); setSearch(''); setPage(1); }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-icon" onClick={() => setIsSearchExpanded(true)} aria-label="Search" style={{ flexShrink: 0 }}>
              <Search size={18} />
            </button>
          )}

          <select
            id="activity-agent-filter"
            className="form-input form-select"
            style={{ width: 'auto', flexShrink: 0 }}
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
          >
            <option value="">All</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Calendar size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              id="activity-date-from"
              type="date"
              className="form-input mobile-icon-date"
              style={{ paddingLeft: 30 }}
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Calendar size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              id="activity-date-to"
              type="date"
              className="form-input mobile-icon-date"
              style={{ paddingLeft: 30 }}
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>

          <span className="text-sm text-muted mobile-record-badge" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {filtered.length} <span className="desktop-only">record{filtered.length !== 1 ? 's' : ''}</span>
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Activity size={28} /></div>
            <h3 className="empty-state-title">No Activity Found</h3>
            <p className="empty-state-desc">No logs match your current filters.</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper table-responsive-stack" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>User</th>
                    <th>Entity</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((log) => {
                    const meta = ACTION_LABELS[log.action] || { label: log.action, badge: 'badge-muted' };
                    return (
                      <tr key={log.id}>
                        <td data-label="Action">
                          <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        </td>
                        <td data-label="User">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <div className="avatar avatar-sm">{log.userName?.charAt(0) || '?'}</div>
                            <span className="text-sm">{log.userName || log.userId.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td data-label="Entity">
                          <div>
                            <div className="text-sm">{log.entityName || '—'}</div>
                            <div className="text-xs text-muted">{log.entityType}</div>
                          </div>
                        </td>
                        <td className="text-sm text-muted" data-label="Date & Time">
                          <div>{format(log.createdAt, 'dd MMM yyyy')}</div>
                          <div className="text-xs">{format(log.createdAt, 'hh:mm:ss a')}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > PAGE_SIZE && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-4)' }}>
                <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ActivityLogPage;
