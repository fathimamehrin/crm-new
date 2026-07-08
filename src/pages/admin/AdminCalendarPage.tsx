import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ArrowLeft, Search, X } from 'lucide-react';
import { getClients, getTags, getClientStatuses, getLeadSources, getUsers } from '../../lib/firestore';
import type { Client, Tag, CustomStatus, LeadSource, User } from '../../types';
import { format } from 'date-fns';
import CalendarView from '../../components/CalendarView';
import ClientTable from '../../components/ClientTable/ClientTable';
import toast from 'react-hot-toast';

const AdminCalendarPage: React.FC = () => {
  const navigate = useNavigate();

  // All clients (for calendar heatmap)
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Date-specific filtered list
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  
  // Local filters for date-specific view
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSource, setSelectedSource] = useState('');

  // Filter metadata
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [allSources, setAllSources] = useState<LeadSource[]>([]);
  const [agents, setAgents] = useState<User[]>([]);

  // Reset filters when the selected date changes
  useEffect(() => {
    setSearch('');
    setSelectedTag('');
    setSelectedStatus('');
    setSelectedSource('');
  }, [selectedDate]);

  // Load all clients + metadata
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [res, tags, statuses, sources, usersList] = await Promise.all([
        getClients([], 2000),
        getTags(),
        getClientStatuses(),
        getLeadSources(),
        getUsers(),
      ]);
      setAllClients(res.clients);
      setAllTags(tags);
      setCustomStatuses(statuses);
      setAllSources(sources);
      setAgents(usersList);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Filter clients to the selected date
  const dateClients = allClients.filter(client => {
    if (!selectedDate) return false;
    const clientDate = new Date(client.createdAt);
    return format(clientDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  });

  // Apply local date-specific search & filters
  const filteredDateClients = dateClients.filter(client => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const match = 
        client.name.toLowerCase().includes(q) ||
        client.whatsappNumber.toLowerCase().includes(q) ||
        (client.email && client.email.toLowerCase().includes(q)) ||
        (client.projectName && client.projectName.toLowerCase().includes(q)) ||
        (client.notes && client.notes.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (selectedTag && !client.tags?.includes(selectedTag)) return false;
    if (selectedStatus && client.status.toLowerCase() !== selectedStatus.toLowerCase()) return false;
    if (selectedSource && (client.leadSource || '').toLowerCase() !== selectedSource.toLowerCase()) return false;
    return true;
  });

  const hasActiveLocalFilters = !!(search || selectedTag || selectedStatus || selectedSource);

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <button 
          className="btn btn-secondary btn-icon btn-sm" 
          onClick={() => navigate('/admin/clients')}
          aria-label="Back to Clients"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarIcon size={24} style={{ color: 'var(--color-accent)' }} /> Calendar
          </h1>
          <p className="page-subtitle">Interactive Google Calendar overview of your lead operations</p>
        </div>
      </div>

      {/* Main Calendar Card */}
      <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
            <div className="spinner" />
          </div>
        ) : (
          <CalendarView
            clients={allClients}
            isAdminView={true}
            onDateClick={(date) => setSelectedDate(date)}
            hideDetailPanel={true}
          />
        )}
      </div>

      {/* Date specific client list */}
      {selectedDate && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                Leads registered on {format(selectedDate, 'dd MMM yyyy')}
              </h3>
              {hasActiveLocalFilters && (
                <span className="badge" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontSize: '11px', padding: '2px 8px', borderRadius: '100px', fontWeight: 700 }}>
                  Filtered Match: {filteredDateClients.length} of {dateClients.length}
                </span>
              )}
            </div>
            <span className="badge badge-muted text-xs">
              {filteredDateClients.length} {filteredDateClients.length === 1 ? 'lead' : 'leads'} found
            </span>
          </div>

          {/* Local Filters Toolbar */}
          <div style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--space-3)', 
            padding: 'var(--space-4) var(--space-5)', 
            borderBottom: '1px solid var(--color-border)', 
            flexWrap: 'wrap',
            background: 'var(--color-bg-secondary)'
          }}>
            {/* Local search */}
            <div className="search-wrapper" style={{ flex: 1, minWidth: 200 }}>
              <Search className="search-icon" size={16} />
              <input
                type="text"
                className="form-input"
                placeholder="Search leads on this date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>

            {/* Status Select */}
            <select
              className="form-input form-select"
              style={{ width: 'auto', minWidth: 140 }}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {customStatuses.filter(s => s.status === 'active').map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>

            {/* Tag Select */}
            <select
              className="form-input form-select"
              style={{ width: 'auto', minWidth: 140 }}
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
            >
              <option value="">All Tags</option>
              {allTags.filter(t => t.status === 'active').map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Source Select */}
            <select
              className="form-input form-select"
              style={{ width: 'auto', minWidth: 140 }}
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
            >
              <option value="">All Sources</option>
              {allSources.filter(s => s.status === 'active').map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>

            {/* Clear Filters Button */}
            {hasActiveLocalFilters && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch('');
                  setSelectedTag('');
                  setSelectedStatus('');
                  setSelectedSource('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={14} /> Clear Local
              </button>
            )}
          </div>

          <ClientTable
            clients={filteredDateClients}
            loading={loading}
            agents={agents}
            onRefresh={loadAll}
            isAdminView={true}
            allTags={allTags}
            customStatuses={customStatuses}
            allSources={allSources}
            startIndex={0}
          />
        </div>
      )}
    </div>
  );
};

export default AdminCalendarPage;