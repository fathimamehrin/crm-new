import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ArrowLeft } from 'lucide-react';
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
  
  // Filter metadata
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [allSources, setAllSources] = useState<LeadSource[]>([]);
  const [agents, setAgents] = useState<User[]>([]);

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
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Leads registered on {format(selectedDate, 'dd MMM yyyy')}
            </h3>
            <span className="badge badge-muted text-xs">
              {dateClients.length} {dateClients.length === 1 ? 'lead' : 'leads'} found
            </span>
          </div>

          <ClientTable
            clients={dateClients}
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