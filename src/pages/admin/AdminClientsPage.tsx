import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, Filter, Users, Activity, CheckCircle2, TrendingUp, DollarSign, ClipboardList, Check, X, ClipboardCheck } from 'lucide-react';
import { getClients, getUsers, getAllSummaries, getAllActivityLogs, getTags, getClientStatuses, getTasks, updateTaskStatus, getLeadSources } from '../../lib/firestore';
import type { Client, FilterOptions, User, Tag, CustomStatus, Task, LeadSource } from '../../types';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

import ClientTable from '../../components/ClientTable/ClientTable';
import ClientFilters from '../../components/ClientTable/ClientFilters';
import Pagination from '../../components/Pagination';
import AddClientModal from '../../components/AddClientModal';
import toast from 'react-hot-toast';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  inactive: 'badge-muted',
  lead: 'badge-warning',
  closed: 'badge-danger',
};

interface SearchMatch {
  type: 'client_info' | 'summary' | 'activity_log';
  field: string;
  text: string;
}

interface ClientSearchResult {
  client: Client;
  matches: SearchMatch[];
}

const AdminClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Helper to parse location state or search params
  const getInitialAgentId = () => {
    if (location.state && typeof location.state === 'object' && 'agentId' in location.state) {
      return (location.state as any).agentId || '';
    }
    const params = new URLSearchParams(location.search);
    return params.get('agentId') || '';
  };

  const getInitialStatus = () => {
    if (location.state && typeof location.state === 'object' && 'status' in location.state) {
      return (location.state as any).status;
    }
    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    if (statusParam !== null) return statusParam as any;
    return ''; // Default empty (All Statuses)
  };

  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const PAGE_SIZE = 25;

  const { currentUser, userProfile } = useAuth();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [allClientsData, setAllClientsData] = useState<Client[]>([]);
  const [customClientFilter, setCustomClientFilter] = useState<{ label: string; clientIds: string[] } | null>(null);

  // Lead Source date range filters
  const [leadSourceRange, setLeadSourceRange] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [leadSourceStartDate, setLeadSourceStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [leadSourceEndDate, setLeadSourceEndDate] = useState(new Date().toISOString().substring(0, 10));
  const [allSources, setAllSources] = useState<LeadSource[]>([]);

  // Task queue modal states
  const [activeTaskTab, setActiveTaskTab] = useState<'assigned' | 'verify'>('assigned');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [rejectTaskModalOpen, setRejectTaskModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [completeTaskModalOpen, setCompleteTaskModalOpen] = useState(false);
  const [completionSummary, setCompletionSummary] = useState('');

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    closed: 0,
    conversionRate: '0.0%',
    revenue: 0,
  });

  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    agentId: getInitialAgentId(),
    status: getInitialStatus(),
    paymentStatus: '',
    dateFrom: '',
    dateTo: '',
    tags: [],
  });

  useEffect(() => {
    const initialAgentId = getInitialAgentId();
    const initialStatus = getInitialStatus();
    setFilters((prev) => {
      if (prev.agentId === initialAgentId && prev.status === initialStatus) {
        return prev;
      }
      return {
        ...prev,
        agentId: initialAgentId,
        status: initialStatus,
      };
    });
    setPage(1);
  }, [location.state, location.search]);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);

  // Snippet generator
  const matchSnippet = (text: string, q: string): string | null => {
    if (!text) return null;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return null;

    const start = Math.max(0, idx - 45);
    const end = Math.min(text.length, idx + q.length + 45);
    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  };

  // Keyword highlighting helper
  const highlightText = (text: string, keyword: string) => {
    if (!keyword.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b', padding: '1px 3px', borderRadius: '4px', fontWeight: 600 }}>
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const [allClientsRes, summariesData, logsData, tasksData, sourcesData] = await Promise.all([
        getClients([], 1000),
        getAllSummaries(),
        getAllActivityLogs(),
        getTasks(),
        getLeadSources()
      ]);

      setAllTasks(tasksData);
      setAllLogs(logsData);
      setAllClientsData(allClientsRes.clients);
      setAllSources(sourcesData);

      let data = [...allClientsRes.clients];

      // 1. Filter by Agent
      if (filters.agentId) {
        if (filters.agentId === 'unassigned') {
          data = data.filter((c) => !c.assignedAgent || c.assignedAgent === 'unassigned');
        } else {
          data = data.filter((c) => c.assignedAgent === filters.agentId);
        }
      }

      // 2. Filter by Status
      if (filters.status) {
        data = data.filter((c) => c.status?.toLowerCase() === filters.status.toLowerCase());
      }

      if (filters.tags && filters.tags.length > 0) {
        data = data.filter((c) =>
          filters.tags.every((tagId) => c.tags?.includes(tagId))
        );
      }

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const results: ClientSearchResult[] = [];

        data.forEach((client) => {
          const matches: SearchMatch[] = [];

          // 1. Client Details
          if (client.name.toLowerCase().includes(q)) {
            matches.push({ type: 'client_info', field: 'Name', text: client.name });
          }
          if (client.whatsappNumber.toLowerCase().includes(q)) {
            matches.push({ type: 'client_info', field: 'WhatsApp Number', text: client.whatsappNumber });
          }
          if (client.email && client.email.toLowerCase().includes(q)) {
            matches.push({ type: 'client_info', field: 'Email', text: client.email });
          }
          if (client.projectName && client.projectName.toLowerCase().includes(q)) {
            matches.push({ type: 'client_info', field: 'Project Name', text: client.projectName });
          }
          if (client.alternateContact && client.alternateContact.toLowerCase().includes(q)) {
            matches.push({ type: 'client_info', field: 'Alternate Contact', text: client.alternateContact });
          }
          if (client.notes && client.notes.toLowerCase().includes(q)) {
            const snip = matchSnippet(client.notes, q);
            if (snip) matches.push({ type: 'client_info', field: 'Notes', text: snip });
          }
          if (client.address && client.address.toLowerCase().includes(q)) {
            const snip = matchSnippet(client.address, q);
            if (snip) matches.push({ type: 'client_info', field: 'Address', text: snip });
          }

          // 2. Summaries & Payments & Files
          const clientSummaries = summariesData.filter((s) => s.clientId === client.id);
          clientSummaries.forEach((s) => {
            if (s.summaryText && s.summaryText.toLowerCase().includes(q)) {
              const snip = matchSnippet(s.summaryText, q);
              if (snip) matches.push({ type: 'summary', field: `Summary (${format(s.createdAt, 'dd MMM yyyy')})`, text: snip });
            }
            if (s.paymentDetails) {
              const pd = s.paymentDetails;
              if (pd.notes && pd.notes.toLowerCase().includes(q)) {
                const snip = matchSnippet(pd.notes, q);
                if (snip) matches.push({ type: 'summary', field: `Payment Notes`, text: snip });
              }
              if (pd.transactionId && pd.transactionId.toLowerCase().includes(q)) {
                matches.push({ type: 'summary', field: `Transaction ID`, text: pd.transactionId });
              }
              if (pd.status && pd.status.toLowerCase().includes(q)) {
                matches.push({ type: 'summary', field: `Payment Status`, text: `Status: ${pd.status}` });
              }
              if (pd.amount !== undefined && pd.amount.toString().includes(q)) {
                matches.push({ type: 'summary', field: `Payment Amount`, text: `Amount: ₹${pd.amount}` });
              }
            }
            if (s.documents) {
              s.documents.forEach((doc) => {
                if (doc.name && doc.name.toLowerCase().includes(q)) {
                  matches.push({ type: 'summary', field: `Document Name`, text: doc.name });
                }
              });
            }
          });

          // 3. Activity Logs
          const clientLogs = logsData.filter((l) => {
            if (l.entityType === 'client' && l.entityId === client.id) return true;
            const summaryIds = clientSummaries.map((s) => s.id);
            if (l.entityType === 'summary' && summaryIds.includes(l.entityId)) return true;
            return false;
          });

          clientLogs.forEach((l) => {
            let logStr = `${l.userName || 'System'} ${l.action.replace(/_/g, ' ')}`;
            if (l.entityName) logStr += ` - ${l.entityName}`;
            if (logStr.toLowerCase().includes(q)) {
              const snip = matchSnippet(logStr, q);
              if (snip) matches.push({ type: 'activity_log', field: `Activity (${format(l.createdAt, 'dd MMM yyyy')})`, text: snip });
            }
          });

          if (matches.length > 0) {
            results.push({ client, matches });
          }
        });

        setSearchResults(results);
        setTotalClients(results.length);
      } else {
        // Fallback to basic date filtering for client list when search is empty
        let filtered = data;
        if (filters.dateFrom) {
          filtered = filtered.filter((c) => c.createdAt >= new Date(filters.dateFrom));
        }
        if (filters.dateTo) {
          filtered = filtered.filter((c) => c.createdAt <= new Date(filters.dateTo + 'T23:59:59'));
        }

        setTotalClients(filtered.length);
        const start = (page - 1) * PAGE_SIZE;
        setClients(filtered.slice(start, start + PAGE_SIZE));
        setSearchResults([]);
      }

      // Calculate stats based on filters.agentId
      let statsClients = allClientsRes.clients;
      if (filters.agentId && filters.agentId !== 'unassigned') {
        statsClients = statsClients.filter(c => c.assignedAgent === filters.agentId);
      } else if (filters.agentId === 'unassigned') {
        statsClients = statsClients.filter(c => !c.assignedAgent || c.assignedAgent === 'unassigned');
      }

      const total = statsClients.length;
      const active = statsClients.filter(c => c.status === 'active' || c.status === 'lead').length;
      const closed = statsClients.filter(c => c.status === 'closed' || c.status === 'won').length;
      const conversionRate = total > 0 ? ((closed / total) * 100).toFixed(1) + '%' : '0.0%';

      const clientIds = new Set(statsClients.map(c => c.id));
      const revenue = summariesData
        .filter(s => clientIds.has(s.clientId) && s.paymentDetails?.status === 'paid' && s.paymentDetails?.amount)
        .reduce((sum, s) => sum + (s.paymentDetails?.amount || 0), 0);

      setStats({ total, active, closed, conversionRate, revenue });

    } catch (err) {
      console.error(err);
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Task queue handlers
  const handleAcceptTask = async (taskId: string) => {
    try {
      await updateTaskStatus(taskId, 'accepted', currentUser!.uid, userProfile?.name || 'Admin');
      toast.success('Task claimed successfully');
      loadClients();
    } catch {
      toast.error('Failed to claim task');
    }
  };

  const handleOpenReject = (task: Task) => {
    setSelectedTask(task);
    setRejectReason('');
    setRejectTaskModalOpen(true);
  };

  const handleRejectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !rejectReason.trim()) return;
    try {
      await updateTaskStatus(selectedTask.id, 'rejected', currentUser!.uid, userProfile?.name || 'Admin', rejectReason.trim());
      toast.success('Task rejected');
      setRejectTaskModalOpen(false);
      loadClients();
    } catch {
      toast.error('Failed to reject task');
    }
  };

  const handleOpenComplete = (task: Task) => {
    setSelectedTask(task);
    setCompletionSummary('');
    setCompleteTaskModalOpen(true);
  };

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !completionSummary.trim()) return;
    try {
      await updateTaskStatus(
        selectedTask.id,
        'completed',
        currentUser!.uid,
        userProfile?.name || 'Admin',
        undefined,
        completionSummary.trim()
      );
      toast.success('Task marked as completed');
      setCompleteTaskModalOpen(false);
      loadClients();
    } catch {
      toast.error('Failed to complete task');
    }
  };

  const handleVerifyTask = async (taskId: string) => {
    try {
      await updateTaskStatus(taskId, 'verified', currentUser!.uid, userProfile?.name || 'Admin');
      toast.success('Task verified and closed');
      loadClients();
    } catch {
      toast.error('Failed to verify task');
    }
  };

  useEffect(() => {
    getUsers('agent').then(setAgents).catch(() => {});
    getTags().then(setAllTags).catch(() => {});
    getClientStatuses().then(setCustomStatuses).catch(() => {});
    getLeadSources().then(setAllSources).catch(() => {});
  }, []);

  const renderAgentActivityCard = () => (
    <div className="card" style={{ padding: 'var(--space-5)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
        <Users size={20} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text-primary)' }}>Daily Agent Activity</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {agents.map(agent => {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          const addedIds = Array.from(new Set(allLogs.filter(l => l.userId === agent.id && l.action === 'client_created' && l.createdAt >= startOfToday).map(l => l.entityId)));
          const updatedIds = Array.from(new Set(allLogs.filter(l => l.userId === agent.id && l.action === 'client_updated' && l.createdAt >= startOfToday).map(l => l.entityId)));
          const pendingTasksCount = allTasks.filter(t => t.assignedTo === agent.id && t.status !== 'verified').length;

          return (
            <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{agent.name}</strong>
                {pendingTasksCount > 0 ? (
                  <span className="badge badge-warning" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, padding: '2px 6px' }}>
                    {pendingTasksCount} Task{pendingTasksCount === 1 ? '' : 's'} Pending
                  </span>
                ) : (
                  <span className="badge badge-muted" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, padding: '2px 6px', color: 'var(--color-text-muted)', background: 'rgba(0,0,0,0.03)' }}>
                    0 Tasks
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (addedIds.length > 0) {
                      setCustomClientFilter({
                        label: `Leads Added Today by ${agent.name}`,
                        clientIds: addedIds
                      });
                      setTimeout(() => {
                        const el = document.getElementById('client-list-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    } else {
                      toast.error(`${agent.name} has not added any leads today`);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: addedIds.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: addedIds.length > 0 ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800 }}>{addedIds.length}</span>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Added Today</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (updatedIds.length > 0) {
                      setCustomClientFilter({
                        label: `Leads Updated Today by ${agent.name}`,
                        clientIds: updatedIds
                      });
                      setTimeout(() => {
                        const el = document.getElementById('client-list-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    } else {
                      toast.error(`${agent.name} has not updated any leads today`);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: updatedIds.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: updatedIds.length > 0 ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800 }}>{updatedIds.length}</span>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Updated Today</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderLeadSourceAnalyticsCard = () => (
    <div className="card" style={{ padding: 'var(--space-5)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)' }}>
      <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <TrendingUp size={20} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text-primary)' }}>Lead Source Performance</h3>
        </div>
        
        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-secondary)', padding: '3px', borderRadius: '8px', overflowX: 'auto' }} className="hide-scrollbar">
          {(['today', 'week', 'month', 'custom'] as const).map(range => (
            <button
              key={range}
              type="button"
              className={`tab-btn ${leadSourceRange === range ? 'active' : ''}`}
              onClick={() => setLeadSourceRange(range)}
              style={{
                flex: 1,
                fontSize: '10px',
                padding: '4px 6px',
                textTransform: 'capitalize',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
              }}
            >
              {range === 'custom' ? 'Custom' : range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'Today'}
            </button>
          ))}
        </div>

        {leadSourceRange === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '10px' }}>
            <div>
              <label style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>From</label>
              <input 
                type="date" 
                className="form-input" 
                style={{ fontSize: '11px', padding: '4px 8px', minHeight: '30px' }} 
                value={leadSourceStartDate} 
                onChange={e => setLeadSourceStartDate(e.target.value)} 
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>To</label>
              <input 
                type="date" 
                className="form-input" 
                style={{ fontSize: '11px', padding: '4px 8px', minHeight: '30px' }} 
                value={leadSourceEndDate} 
                onChange={e => setLeadSourceEndDate(e.target.value)} 
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {(() => {
          const getLeadSourceDateRange = () => {
            let start = new Date();
            let end = new Date();
            
            if (leadSourceRange === 'today') {
              start.setHours(0, 0, 0, 0);
            } else if (leadSourceRange === 'week') {
              const day = start.getDay();
              const diff = start.getDate() - day + (day === 0 ? -6 : 1);
              start.setDate(diff);
              start.setHours(0, 0, 0, 0);
            } else if (leadSourceRange === 'month') {
              start.setDate(1);
              start.setHours(0, 0, 0, 0);
            } else if (leadSourceRange === 'custom') {
              if (leadSourceStartDate) {
                start = new Date(leadSourceStartDate + 'T00:00:00');
              } else {
                start.setHours(0, 0, 0, 0);
              }
              if (leadSourceEndDate) {
                end = new Date(leadSourceEndDate + 'T23:59:59');
              }
            }
            return { start, end };
          };

          const { start, end } = getLeadSourceDateRange();
          const leadsInRange = allClientsData.filter(c => {
            const time = c.createdAt.getTime();
            if (leadSourceRange === 'custom') {
              return time >= start.getTime() && time <= end.getTime();
            }
            return time >= start.getTime();
          });

          const totalLeads = leadsInRange.length;
          
          const sourceCounts: Record<string, number> = {};
          leadsInRange.forEach(c => {
            const sourceName = c.leadSource || 'Unspecified';
            sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
          });

          if (allSources.length === 0) {
            return <p className="text-muted text-xs text-center" style={{ padding: '8px' }}>No lead sources defined.</p>;
          }

          return allSources
            .map(source => ({
              ...source,
              count: sourceCounts[source.name] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .map(source => {
              const percentage = totalLeads > 0 ? (source.count / totalLeads) * 100 : 0;
              return (
                <div key={source.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: source.color }} />
                      {source.name}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                      {source.count} <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>({percentage.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-border)', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percentage}%`, background: source.color, borderRadius: '100px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            });
        })()}
      </div>
    </div>
  );

  const isFilterApplied = !!(
    filters.status ||
    filters.leadSource ||
    (filters.tags && filters.tags.length > 0) ||
    filters.search ||
    filters.agentId ||
    filters.paymentStatus ||
    filters.dateFrom ||
    filters.dateTo ||
    customClientFilter
  );

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 className="page-title">Client Management</h1>
            {isFilterApplied && (
              <span 
                className="badge" 
                style={{ 
                  backgroundColor: 'var(--color-accent-light)', 
                  color: 'var(--color-accent)', 
                  border: '1px solid var(--color-accent)', 
                  fontSize: '12px', 
                  padding: '4px 12px', 
                  borderRadius: '100px', 
                  fontWeight: 750 
                }}
              >
                Filtered Match: {totalClients} {totalClients === 1 ? 'lead' : 'leads'}
              </span>
            )}
          </div>
          <p className="page-subtitle">View and manage all clients across all agents</p>
        </div>
        <button
          id="add-client-btn"
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={18} />
          <span className="desktop-only">Add Client</span>
        </button>
      </div>

      {/* Analytics Grid */}
      <div className="metrics-grid" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Card 1: Total Clients */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Clients</span>
            <Users size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{stats.total}</h3>
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>Total leads registered</span>
          </div>
        </div>

        {/* Card 2: Active Leads */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Leads</span>
            <Activity size={16} style={{ color: 'var(--color-warning)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{stats.active}</h3>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Leads in progress</span>
          </div>
        </div>

        {/* Card 3: Converted (Closed) */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Closed Deals</span>
            <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{stats.closed}</h3>
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>Deals won</span>
          </div>
        </div>

        {/* Card 4: Conversion Rate */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Conversion Rate</span>
            <TrendingUp size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{stats.conversionRate}</h3>
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>Closed vs Total</span>
          </div>
        </div>

        {/* Card 5: Total Revenue */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Revenue</span>
            <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>₹{stats.revenue.toLocaleString('en-IN')}</h3>
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>Paid transactions</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout for Top Cards */}
      <div className="admin-layout-grid" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Left Column: Personal Task Queue */}
        <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          {/* Admin's Personal Task Queue Card */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 'var(--space-5)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} style={{ color: 'var(--color-accent)' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text-primary)' }}>My Personal Task Queue</h3>
              </div>
              <div className="tabs" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`tab-btn ${activeTaskTab === 'assigned' ? 'active' : ''}`}
                  onClick={() => setActiveTaskTab('assigned')}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Assigned to Me ({allTasks.filter(t => t.assignedTo === currentUser?.uid && t.status !== 'verified').length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTaskTab === 'verify' ? 'active' : ''}`}
                  onClick={() => setActiveTaskTab('verify')}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Verify Completed ({allTasks.filter(t => t.createdBy === currentUser?.uid && t.status === 'completed').length})
                </button>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {activeTaskTab === 'assigned' ? (
              (() => {
                const myTasksList = allTasks.filter(t => t.assignedTo === currentUser?.uid && t.status !== 'verified');
                if (myTasksList.length === 0) {
                  return <p className="text-muted text-xs text-center" style={{ padding: 'var(--space-4)' }}>No pending tasks assigned to you.</p>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {myTasksList.map((task) => (
                      <div key={task.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>{task.title}</h4>
                            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{task.description}</p>
                          </div>
                          <span className={`badge badge-${task.status === 'accepted' ? 'primary' : task.status === 'rejected' ? 'danger' : 'accent'}`} style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 750 }}>
                            {task.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <span className="text-xs text-muted">Created by: <strong>{task.createdByName}</strong></span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {task.status === 'pending_acceptance' && (
                              <>
                                <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--color-success)' }} onClick={() => handleAcceptTask(task.id)}>
                                  <Check size={12} /> Claim
                                </button>
                                <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--color-danger)' }} onClick={() => handleOpenReject(task)}>
                                  <X size={12} /> Reject
                                </button>
                              </>
                            )}
                            {task.status === 'accepted' && (
                              <button className="btn btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleOpenComplete(task)}>
                                <ClipboardCheck size={12} /> Complete Task
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              (() => {
                const verifyTasksList = allTasks.filter(t => t.createdBy === currentUser?.uid && t.status === 'completed');
                if (verifyTasksList.length === 0) {
                  return <p className="text-muted text-xs text-center" style={{ padding: 'var(--space-4)' }}>No completed tasks to verify.</p>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {verifyTasksList.map((task) => (
                      <div key={task.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>{task.title}</h4>
                            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{task.description}</p>
                            {task.completionSummary && (
                              <p style={{ margin: '6px 0 0 0', padding: '6px', background: 'var(--color-bg-card)', borderRadius: '4px', fontSize: 'var(--font-size-xs)', borderLeft: '3px solid var(--color-success)' }}>
                                <strong>Result:</strong> {task.completionSummary}
                              </p>
                            )}
                          </div>
                          <span className="badge badge-success" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 750 }}>
                            COMPLETED
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <span className="text-xs text-muted">Claimed by: <strong>{task.assignedToName}</strong></span>
                          <button className="btn btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--color-success)', borderColor: 'var(--color-success)' }} onClick={() => handleVerifyTask(task.id)}>
                            <Check size={12} /> Verify & Close
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
            </div>
          </div>

        </div>

        {/* Right Column: Daily Agent Activity & Lead Source Analytics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="desktop-only">
          {renderAgentActivityCard()}
          {renderLeadSourceAnalyticsCard()}
        </div>
      </div>

      {/* Daily Agent Activity & Team Tasks (Mobile Only) */}
      <div className="mobile-only" style={{ marginBottom: 'var(--space-6)' }}>
        {renderAgentActivityCard()}
      </div>

      {/* Lead Source Analytics (Mobile Only) */}
      <div className="mobile-only" style={{ marginBottom: 'var(--space-6)' }}>
        {renderLeadSourceAnalyticsCard()}
      </div>

      {/* Full-width Client Table Section */}
      <div id="client-list-section" className="card card-flush" style={{ overflow: 'hidden', minWidth: 0 }}>
            {/* Table toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              flexWrap: 'wrap',
            }}>
              {/* Search */}
              <div className="search-wrapper" style={{ flex: 1, minWidth: 0 }}>
                <Search className="search-icon" size={16} />
                <input
                  id="client-search"
                  type="search"
                  className="form-input"
                  placeholder="Search by name, notes, summaries, payments, files..."
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, search: e.target.value }));
                    setPage(1);
                  }}
                />
              </div>

              {/* Filter button */}
              <button
                id="filter-btn"
                className={`btn btn-secondary ${showFilters ? 'btn-primary' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter size={16} />
                Filters
                {(filters.agentId || 
                  filters.status || 
                  filters.paymentStatus || 
                  filters.dateFrom || 
                  filters.dateTo ||
                  (filters.tags && filters.tags.length > 0)) && (
                  <span style={{
                    borderRadius: '100px',
                    background: 'var(--color-accent, #2563eb)',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '1px 5px',
                    marginLeft: '6px',
                    minWidth: '15px',
                    height: '15px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: '13px'
                  }}>
                    {totalClients}
                  </span>
                )}
              </button>
            </div>

            {/* WhatsApp-style Quick Tag Filters */}
            {!loading && allTags.length > 0 && (
              <div 
                className="hide-scrollbar" 
                style={{ 
                  display: 'flex', 
                  gap: '8px', 
                  overflowX: 'auto', 
                  padding: '10px var(--space-4)', 
                  borderBottom: '1px solid var(--color-border)', 
                  background: 'var(--color-bg-elevated)',
                  whiteSpace: 'nowrap',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {/* "All" Pill */}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, tags: [] }));
                    setPage(1);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '100px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid',
                    transition: 'all 0.15s ease',
                    backgroundColor: filters.tags.length === 0 ? 'var(--color-accent)' : 'var(--color-bg-card)',
                    color: filters.tags.length === 0 ? '#ffffff' : 'var(--color-text-secondary)',
                    borderColor: filters.tags.length === 0 ? 'var(--color-accent)' : 'var(--color-border)',
                    flexShrink: 0,
                  }}
                >
                  All
                </button>

                {/* Tag Pills */}
                {allTags.map(tag => {
                  const isSelected = filters.tags.includes(tag.id);
                  const tagColor = tag.color || '#6b7280';
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        setFilters(prev => ({
                          ...prev,
                          tags: isSelected ? [] : [tag.id]
                        }));
                        setPage(1);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '100px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid',
                        transition: 'all 0.15s ease',
                        backgroundColor: isSelected ? tagColor : 'var(--color-bg-card)',
                        color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                        borderColor: isSelected ? tagColor : 'var(--color-border)',
                        flexShrink: 0,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Drilldown active indicator */}
            {customClientFilter && (
              <div style={{
                background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-card))',
                border: '1px solid color-mix(in srgb, var(--color-accent) 20%, var(--color-border))',
                borderRadius: 'var(--radius-lg)',
                padding: '10px 16px',
                margin: 'var(--space-4) var(--space-4) 0 var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Active Filter: <strong>{customClientFilter.label}</strong> ({customClientFilter.clientIds.length} lead{customClientFilter.clientIds.length === 1 ? '' : 's'})
                </span>
                <button 
                  type="button"
                  className="btn btn-ghost btn-sm" 
                  onClick={() => setCustomClientFilter(null)}
                  style={{ minHeight: '28px', padding: '0 8px', fontSize: '12px', color: 'var(--color-danger)' }}
                >
                  Clear Filter
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: 'var(--space-12)', display: 'flex', justifyContent: 'center' }}>
                <div className="spinner spinner-lg" />
              </div>
            ) : filters.search ? (
              searchResults.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Search size={32} />
                  </div>
                  <h3 className="empty-state-title">No matching records found</h3>
                  <p className="empty-state-desc">
                    No clients, notes, summaries, activities, payments or documents match your keyword.
                  </p>
                </div>
              ) : (
                <div className="search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-5)' }}>
                  {(customClientFilter 
                    ? searchResults.filter(r => customClientFilter.clientIds.includes(r.client.id))
                    : searchResults
                  ).map(({ client, matches }) => (
                    <div 
                      key={client.id} 
                      className="card hover-card" 
                      style={{ 
                        padding: 'var(--space-4)', 
                        border: '1px solid var(--color-border)', 
                        background: 'var(--color-bg-card)',
                        borderRadius: 'var(--radius-lg)',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onClick={() => navigate(`/admin/clients/${client.id}`)}
                    >
                      {/* Client header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="avatar avatar-md" style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-accent-light)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.1rem' }}>
                            {client.profileImage ? <img src={client.profileImage} alt={client.name} style={{ borderRadius: '50%' }} /> : client.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
                              {highlightText(client.name, filters.search)}
                            </h4>
                            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                              <span>WhatsApp: {highlightText(client.whatsappNumber, filters.search)}</span>
                              {client.email && <span>Email: {highlightText(client.email, filters.search)}</span>}
                            </div>
                            {client.tags && client.tags.length > 0 && (
                              <div className="tags-list-container" style={{ marginTop: 6 }}>
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
                        <span className={`badge ${STATUS_BADGE[client.status] || 'badge-muted'}`} style={{ textTransform: 'capitalize' }}>
                          {client.status}
                        </span>
                      </div>

                      {/* Matching snippets */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {matches.map((match, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              padding: 'var(--space-3)', 
                              background: 'var(--color-bg-secondary)', 
                              borderRadius: 'var(--radius-md)', 
                              borderLeft: '4px solid var(--color-accent)'
                            }}
                          >
                            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 2 }}>
                              {match.field}
                            </span>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                              {highlightText(match.text, filters.search)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
                {/* Client Table */}
                <ClientTable
                  clients={customClientFilter 
                    ? allClientsData.filter(c => customClientFilter.clientIds.includes(c.id))
                    : clients
                  }
                  loading={loading}
                  agents={agents}
                  isAdminView={true}
                  onRefresh={loadClients}
                  onClearFilters={() => {
                    setFilters({ search: '', agentId: '', status: 'active', paymentStatus: '', dateFrom: '', dateTo: '', tags: [] });
                    setCustomClientFilter(null);
                    setPage(1);
                  }}
                  allTags={allTags}
                  customStatuses={customStatuses}
                  allSources={allSources}
                />

                {/* Pagination */}
                {!customClientFilter && totalClients > PAGE_SIZE && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-4)' }}>
                    <Pagination
                      page={page}
                      totalPages={Math.ceil(totalClients / PAGE_SIZE)}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>


      {/* Reject Task Modal */}
      {rejectTaskModalOpen && selectedTask && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Reject Task</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setRejectTaskModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleRejectTask} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="reject-reason">Reason for Rejection</label>
                <textarea
                  id="reject-reason"
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder="Explain why this task cannot be completed..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRejectTaskModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={!rejectReason.trim()}>Reject Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Task Modal */}
      {completeTaskModalOpen && selectedTask && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Complete Task</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setCompleteTaskModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCompleteTask} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="complete-summary">Completion Summary</label>
                <textarea
                  id="complete-summary"
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder="Describe the actions taken or outcome of this task..."
                  value={completionSummary}
                  onChange={(e) => setCompletionSummary(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCompleteTaskModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!completionSummary.trim()}>Complete Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter Drawer */}
      {showFilters && (
        <>
          <div
            className="filter-drawer-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }}
            onClick={() => setShowFilters(false)}
          />
          <ClientFilters
            filters={filters}
            onChange={(f) => { setFilters(f); setPage(1); }}
            onClose={() => setShowFilters(false)}
            onClear={() => {
              setFilters({ search: '', agentId: '', status: 'active', paymentStatus: '', dateFrom: '', dateTo: '', tags: [] });
              setCustomClientFilter(null);
              setPage(1);
            }}
            allTags={allTags}
            agents={agents}
            customStatuses={customStatuses}
          />
        </>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <AddClientModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
};

export default AdminClientsPage;
