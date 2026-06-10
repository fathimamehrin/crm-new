import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getClients, getUsers,
} from '../lib/firestore';
import { where } from 'firebase/firestore';
import type { Client, FilterOptions, User } from '../types';

import ClientTable from '../components/ClientTable/ClientTable';
import ClientFilters from '../components/ClientTable/ClientFilters';
import Pagination from '../components/Pagination';
import AddClientModal from '../components/AddClientModal';
import toast from 'react-hot-toast';

const DashboardPage: React.FC = () => {
  const { userRole, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (userRole === 'admin') {
      navigate('/admin/agents', { replace: true });
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

  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    agentId: '',
    status: '',
    paymentStatus: '',
    dateFrom: '',
    dateTo: '',
  });

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (userRole === 'agent' && currentUser) {
        constraints.push(where('assignedAgent', '==', currentUser.uid));
      }
      if (filters.agentId) constraints.push(where('assignedAgent', '==', filters.agentId));
      if (filters.status) constraints.push(where('status', '==', filters.status));

      const { clients: data } = await getClients(constraints, 500);
      let filtered = data;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.whatsappNumber.includes(q) ||
            c.email?.toLowerCase().includes(q)
        );
      }
      if (filters.dateFrom) {
        filtered = filtered.filter((c) => c.createdAt >= new Date(filters.dateFrom));
      }
      if (filters.dateTo) {
        filtered = filtered.filter((c) => c.createdAt <= new Date(filters.dateTo + 'T23:59:59'));
      }

      setTotalClients(filtered.length);
      const start = (page - 1) * PAGE_SIZE;
      setClients(filtered.slice(start, start + PAGE_SIZE));
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
          Add Client
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
              placeholder="Search clients by name, WhatsApp…"
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
            {(filters.agentId || filters.status || filters.dateFrom) && (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--color-accent)', color: '#fff',
                fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>•</span>
            )}
          </button>
        </div>

        {/* Client Table */}
        <ClientTable
          clients={clients}
          loading={loading}
          agents={agents}
          onRefresh={loadClients}
          onClearFilters={() => {
            setFilters({ search: '', agentId: '', status: '', paymentStatus: '', dateFrom: '', dateTo: '' });
            setPage(1);
          }}
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
      </div>

      {/* Filter Drawer */}
      {showFilters && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }}
            onClick={() => setShowFilters(false)}
          />
          <ClientFilters
            filters={filters}
            agents={agents}
            onChange={(f) => { setFilters(f); setPage(1); }}
            onClose={() => setShowFilters(false)}
            onClear={() => {
              setFilters({ search: '', agentId: '', status: '', paymentStatus: '', dateFrom: '', dateTo: '' });
              setPage(1);
            }}
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
