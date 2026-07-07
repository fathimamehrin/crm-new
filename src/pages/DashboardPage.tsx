import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Check, X, ArrowLeftRight, ClipboardList, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getClients, getUsers, getTags, getAllSummaries, getClientStatuses, getLeadSources, getTasks, updateTaskStatus, reassignTaskRequest
} from '../lib/firestore';
import { where } from 'firebase/firestore';
import type { Client, FilterOptions, User, Tag, CustomStatus, LeadSource, Task } from '../types';
import { format } from 'date-fns';

import ClientTable from '../components/ClientTable/ClientTable';
import ClientFilters from '../components/ClientTable/ClientFilters';
import Pagination from '../components/Pagination';
import AddClientModal from '../components/AddClientModal';
import CalendarView from '../components/CalendarView';
import toast from 'react-hot-toast';


interface SearchMatch {
  type: 'client_info' | 'summary';
  field: string;
  text: string;
}

interface ClientSearchResult {
  client: Client;
  matches: SearchMatch[];
}

const DashboardPage: React.FC = () => {
  const { userRole, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (userRole === 'admin') {
      navigate('/admin/clients', { replace: true });
    }
  }, [userRole, navigate]);

  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const PAGE_SIZE = 25;

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [allFilteredClients, setAllFilteredClients] = useState<Client[]>([]);

  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    agentId: '',
    status: '',
    paymentStatus: '',
    dateFrom: '',
    dateTo: '',
    tags: [],
    leadSource: '',
  });

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [activeTaskTab, setActiveTaskTab] = useState<'assigned' | 'verify'>('assigned');

  // Modal dialog states for task actions
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionSummary, setCompletionSummary] = useState('');
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignToUid, setReassignToUid] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Fetch tasks
  const loadTasks = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await getTasks();
      setAllTasks(data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Inline Actions
  const handleAcceptTask = async (taskId: string) => {
    if (!currentUser) return;
    try {
      await updateTaskStatus(taskId, 'accepted', currentUser.uid, currentUser.displayName || 'Agent');
      toast.success('Task claimed successfully!');
      loadTasks();
    } catch (err) {
      toast.error('Failed to accept task');
    }
  };

  const handleOpenReject = (task: Task) => {
    setSelectedTask(task);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !currentUser) return;
    try {
      await updateTaskStatus(selectedTask.id, 'rejected', currentUser.uid, currentUser.displayName || 'Agent', rejectReason);
      toast.success('Task rejected successfully');
      setShowRejectModal(false);
      loadTasks();
    } catch (err) {
      toast.error('Failed to reject task');
    }
  };

  const handleOpenComplete = (task: Task) => {
    setSelectedTask(task);
    setCompletionSummary('');
    setShowCompleteModal(true);
  };

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !currentUser) return;
    try {
      await updateTaskStatus(selectedTask.id, 'completed', currentUser.uid, currentUser.displayName || 'Agent', undefined, completionSummary);
      toast.success('Task marked completed successfully!');
      setShowCompleteModal(false);
      loadTasks();
    } catch (err) {
      toast.error('Failed to complete task');
    }
  };

  const handleOpenReassign = (task: Task) => {
    setSelectedTask(task);
    setReassignToUid('');
    setReassignReason('');
    setShowReassignModal(true);
  };

  const handleRequestReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !currentUser) return;
    const targetAgent = agents.find(u => u.id === reassignToUid);
    if (!targetAgent) return;
    try {
      await reassignTaskRequest(
        selectedTask.id,
        targetAgent.id,
        targetAgent.name,
        reassignReason,
        currentUser.uid,
        currentUser.displayName || 'Agent'
      );
      toast.success('Reassignment request sent to creator!');
      setShowReassignModal(false);
      loadTasks();
    } catch (err) {
      toast.error('Failed to request reassignment');
    }
  };

  const handleVerifyTask = async (taskId: string) => {
    if (!currentUser) return;
    try {
      await updateTaskStatus(taskId, 'verified', currentUser.uid, currentUser.displayName || 'Agent');
      toast.success('Task verified & officially closed!');
      loadTasks();
    } catch (err) {
      toast.error('Failed to verify task');
    }
  };
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [allSources, setAllSources] = useState<LeadSource[]>([]);

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
      const constraints = [];
      if (userRole === 'agent' && currentUser) {
        constraints.push(where('assignedAgent', '==', currentUser.uid));
      }
      if (filters.agentId) constraints.push(where('assignedAgent', '==', filters.agentId));
      if (filters.status) constraints.push(where('status', '==', filters.status));
      if (filters.leadSource) constraints.push(where('leadSource', '==', filters.leadSource));

      const [clientsRes, summariesData] = await Promise.all([
        getClients(constraints, 500),
        getAllSummaries()
      ]);

      let data = clientsRes.clients;

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

          if (matches.length > 0) {
            results.push({ client, matches });
          }
        });

        setSearchResults(results);
        setTotalClients(results.length);
        setAllFilteredClients(results.map(r => r.client));
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
        setAllFilteredClients(filtered);
      }
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [filters, page, userRole, currentUser]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    getUsers().then(setAgents).catch(() => {});
    getTags().then(setAllTags).catch(() => {});
    getClientStatuses().then(setCustomStatuses).catch(() => {});
    getLeadSources().then(setAllSources).catch(() => {});
  }, []);

  const isFilterApplied = !!(
    filters.status ||
    filters.leadSource ||
    (filters.tags && filters.tags.length > 0) ||
    filters.search ||
    filters.agentId ||
    filters.paymentStatus ||
    filters.dateFrom ||
    filters.dateTo
  );

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 className="page-title">Dashboard</h1>
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
          <p className="page-subtitle">Manage and track all your clients</p>
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

      {/* Agent's Task Queue Section */}
      <div className="card" style={{ padding: 'var(--space-5)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={20} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text-primary)' }}>My Operations Task Queue</h3>
          </div>
          <div className="tabs" style={{ margin: 0 }}>
            <button
              className={`tab-btn ${activeTaskTab === 'assigned' ? 'active' : ''}`}
              onClick={() => setActiveTaskTab('assigned')}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              Assigned to Me ({allTasks.filter(t => t.assignedTo === currentUser?.uid && t.status !== 'verified').length})
            </button>
            <button
              className={`tab-btn ${activeTaskTab === 'verify' ? 'active' : ''}`}
              onClick={() => setActiveTaskTab('verify')}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              Verify Completed ({allTasks.filter(t => t.createdBy === currentUser?.uid && t.status === 'completed').length})
            </button>
          </div>
        </div>

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
                          <>
                            <button className="btn btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleOpenComplete(task)}>
                              <CheckCircle2 size={12} /> Complete
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleOpenReassign(task)}>
                              <ArrowLeftRight size={12} /> Reassign
                            </button>
                          </>
                        )}
                        {task.status === 'pending_reassignment' && (
                          <span className="text-xs text-muted italic">Reassignment approval pending...</span>
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
            const verifyList = allTasks.filter(t => t.createdBy === currentUser?.uid && t.status === 'completed');
            if (verifyList.length === 0) {
              return <p className="text-muted text-xs text-center" style={{ padding: 'var(--space-4)' }}>No tasks completed by others awaiting your verification.</p>;
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {verifyList.map((task) => (
                  <div key={task.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>{task.title}</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{task.description}</p>
                      </div>
                      <button className="btn btn-success btn-sm" style={{ fontSize: '11px', padding: '4px 10px', background: 'var(--color-success)', color: '#fff' }} onClick={() => handleVerifyTask(task.id)}>
                        <Check size={12} /> Verify & Close
                      </button>
                    </div>
                    {task.completionSummary && (
                      <div style={{ padding: '8px 12px', background: 'var(--color-bg-elevated)', borderRadius: '6px', fontSize: '12px', borderLeft: '3px solid var(--color-success)' }}>
                        <strong>Assignee Work Summary:</strong> {task.completionSummary}
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Completed by: <strong>{task.assignedToName}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {/* Table Card */}
      <div className="card" style={{ padding: 0 }}>
        {/* Table toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div className="search-wrapper" style={{ flex: 1, minWidth: 220 }}>
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

          {/* View Mode Toggle */}
          <div className="tabs" style={{ marginLeft: 'var(--space-2)' }}>
            <button
              type="button"
              className={`tab-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              style={{ fontSize: 'var(--font-size-xs)', padding: '0.4rem 0.8rem' }}
            >
              List
            </button>
            <button
              type="button"
              className={`tab-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
              style={{ fontSize: 'var(--font-size-xs)', padding: '0.4rem 0.8rem' }}
            >
              Calendar
            </button>
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
              (filters.status && filters.status !== 'active') || 
              filters.paymentStatus || 
              filters.dateFrom || 
              filters.dateTo ||
              (filters.tags && filters.tags.length > 0)) && (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--color-accent)', color: '#fff',
                fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>•</span>
            )}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-12)', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : viewMode === 'calendar' ? (
          <div style={{ padding: 'var(--space-5)' }}>
            <CalendarView clients={allFilteredClients} isAdminView={false} />
          </div>
        ) : filters.search ? (
          searchResults.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Search size={32} />
              </div>
              <h3 className="empty-state-title">No matching records found</h3>
              <p className="empty-state-desc">
                No clients, notes, summaries, payments or documents match your keyword.
              </p>
            </div>
          ) : (
            <div className="search-results-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-5)' }}>
              {searchResults.map(({ client, matches }) => (
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
                  onClick={() => navigate(`/clients/${client.id}`)}
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
                    {(() => {
                      const statusObj = customStatuses.find(s => s.name.toLowerCase() === client.status.toLowerCase());
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
            clients={clients}
            loading={loading}
            agents={agents}
            onRefresh={loadClients}
            onClearFilters={() => {
              setFilters({ search: '', agentId: '', status: '', paymentStatus: '', dateFrom: '', dateTo: '', tags: [], leadSource: '' });
              setPage(1);
            }}
            allTags={allTags}
            customStatuses={customStatuses}
            allSources={allSources}
            startIndex={(page - 1) * PAGE_SIZE}
          />
 
          {/* Pagination */}
          {totalClients > PAGE_SIZE && (
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
            setFilters({ search: '', agentId: '', status: '', paymentStatus: '', dateFrom: '', dateTo: '', tags: [], leadSource: '' });
            setPage(1);
          }}
          allTags={allTags}
          agents={agents}
          customStatuses={customStatuses}
          allSources={allSources}
        />
      </>
    )}

      {/* Add Client Modal */}
      {showAddModal && (
        <AddClientModal onClose={() => setShowAddModal(false)} />
      )}

      {/* REJECT TASK DIALOG MODAL */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Task</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRejectModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRejectTask}>
              <div className="form-group" style={{ padding: 'var(--space-4) 0' }}>
                <label className="form-label required" htmlFor="agent-reject-reason-input">Rejection Reason</label>
                <textarea
                  id="agent-reject-reason-input"
                  className="form-input"
                  rows={3}
                  placeholder="Provide reason for rejecting this task..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Submit Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETION SUMMARY DIALOG MODAL */}
      {showCompleteModal && (
        <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Complete Task</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCompleteModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCompleteTask}>
              <div className="form-group" style={{ padding: 'var(--space-4) 0' }}>
                <label className="form-label required" htmlFor="agent-completion-summary-input">What did you do?</label>
                <textarea
                  id="agent-completion-summary-input"
                  className="form-input"
                  rows={4}
                  placeholder="Summarize task completion details..."
                  value={completionSummary}
                  onChange={(e) => setCompletionSummary(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Mark Done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN TASK DIALOG MODAL */}
      {showReassignModal && (
        <div className="modal-overlay" onClick={() => setShowReassignModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Request Reassignment</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowReassignModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRequestReassignment}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: 'var(--space-4) 0' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="agent-reassign-assignee-select">Reassign To</label>
                  <select
                     id="agent-reassign-assignee-select"
                     className="form-input form-select"
                     value={reassignToUid}
                     onChange={(e) => setReassignToUid(e.target.value)}
                     required
                  >
                    <option value="">Select Assignee...</option>
                    {agents
                      .filter(u => u.id !== currentUser?.uid && u.id !== selectedTask?.assignedTo)
                      .map(user => (
                        <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="agent-reassign-reason-input">Reason for Reassignment</label>
                  <textarea
                    id="agent-reassign-reason-input"
                    className="form-input"
                    rows={3}
                    placeholder="Provide reason for transfer request..."
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReassignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
