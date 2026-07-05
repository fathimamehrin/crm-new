import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getClients, getUsers, getTags, getAllSummaries, getClientStatuses,
} from '../lib/firestore';
import { where } from 'firebase/firestore';
import type { Client, FilterOptions, User, Tag, CustomStatus } from '../types';
import { format } from 'date-fns';

import ClientTable from '../components/ClientTable/ClientTable';
import ClientFilters from '../components/ClientTable/ClientFilters';
import Pagination from '../components/Pagination';
import AddClientModal from '../components/AddClientModal';
import CalendarView from '../components/CalendarView';
import toast from 'react-hot-toast';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  inactive: 'badge-muted',
  lead: 'badge-warning',
  closed: 'badge-danger',
};

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
  });

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
      const constraints = [];
      if (userRole === 'agent' && currentUser) {
        constraints.push(where('assignedAgent', '==', currentUser.uid));
      }
      if (filters.agentId) constraints.push(where('assignedAgent', '==', filters.agentId));
      if (filters.status) constraints.push(where('status', '==', filters.status));

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
    getUsers('agent').then(setAgents).catch(() => {});
    getTags().then(setAllTags).catch(() => {});
    getClientStatuses().then(setCustomStatuses).catch(() => {});
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Dashboard</h1>
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
              clients={clients}
              loading={loading}
              agents={agents}
              onRefresh={loadClients}
              onClearFilters={() => {
                setFilters({ search: '', agentId: '', status: 'active', paymentStatus: '', dateFrom: '', dateTo: '', tags: [] });
                setPage(1);
              }}
              allTags={allTags}
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
              setFilters({ search: '', agentId: '', status: 'active', paymentStatus: '', dateFrom: '', dateTo: '', tags: [] });
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

export default DashboardPage;
