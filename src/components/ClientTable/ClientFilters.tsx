import React from 'react';
import { X } from 'lucide-react';
import type { FilterOptions, User } from '../../types';

interface ClientFiltersProps {
  filters: FilterOptions;
  agents: User[];
  onChange: (f: FilterOptions) => void;
  onClose: () => void;
  onClear: () => void;
}

const ClientFilters: React.FC<ClientFiltersProps> = ({ filters, agents, onChange, onClose, onClear }) => {
  const set = (key: keyof FilterOptions, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="filter-drawer">
      <div className="filter-drawer-header">
        <h3 className="font-semibold">Filters</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="filter-drawer-body">
        {/* Agent filter */}
        <div className="form-group">
          <label className="form-label" htmlFor="filter-agent">Agent</label>
          <select
            id="filter-agent"
            className="form-input form-select"
            value={filters.agentId}
            onChange={(e) => set('agentId', e.target.value)}
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="form-group">
          <label className="form-label" htmlFor="filter-status">Client Status</label>
          <select
            id="filter-status"
            className="form-input form-select"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="lead">Lead</option>
            <option value="inactive">Inactive</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Payment Status */}
        <div className="form-group">
          <label className="form-label" htmlFor="filter-payment">Payment Status</label>
          <select
            id="filter-payment"
            className="form-input form-select"
            value={filters.paymentStatus}
            onChange={(e) => set('paymentStatus', e.target.value)}
          >
            <option value="">All Payments</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Date Range */}
        <div className="form-group">
          <label className="form-label">Date Range</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <input
              id="filter-date-from"
              type="date"
              className="form-input"
              value={filters.dateFrom}
              onChange={(e) => set('dateFrom', e.target.value)}
              placeholder="From"
            />
            <input
              id="filter-date-to"
              type="date"
              className="form-input"
              value={filters.dateTo}
              onChange={(e) => set('dateTo', e.target.value)}
              placeholder="To"
            />
          </div>
        </div>
      </div>

      <div className="filter-drawer-footer">
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClear}>
          Clear All
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
          Apply
        </button>
      </div>
    </div>
  );
};

export default ClientFilters;
