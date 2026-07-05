import React from 'react';
import { X } from 'lucide-react';
import type { FilterOptions, Tag, User, CustomStatus } from '../../types';

interface ClientFiltersProps {
  filters: FilterOptions;
  onChange: (f: FilterOptions) => void;
  onClose: () => void;
  onClear: () => void;
  allTags: Tag[];
  agents: User[];
  customStatuses?: CustomStatus[];
}

const ClientFilters: React.FC<ClientFiltersProps> = ({ filters, onChange, onClose, onClear, allTags = [], agents = [], customStatuses = [] }) => {
  const set = (key: keyof FilterOptions, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="filter-drawer">
      <div className="filter-drawer-header">
        <h3 className="font-semibold">Filters</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="filter-drawer-body">

        {/* Assigned Agent */}
        <div className="form-group">
          <label className="form-label" htmlFor="filter-agent">Assigned Agent</label>
          <select
            id="filter-agent"
            className="form-input form-select"
            value={filters.agentId}
            onChange={(e) => set('agentId', e.target.value)}
          >
            <option value="">All Agents</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        {/* Client Status */}
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
            <option value="inactive">Inactive</option>
            <option value="lead">Lead</option>
            <option value="closed">Closed</option>
            {customStatuses.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
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

        {/* Filter by Tags */}
        <div className="form-group">
          <label className="form-label">Filter by Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {allTags.map((tag) => {
              const isSelected = (filters.tags || []).includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const current = filters.tags || [];
                    const updated = current.includes(tag.id)
                      ? current.filter((id) => id !== tag.id)
                      : [...current, tag.id];
                    onChange({ ...filters, tags: updated });
                  }}
                  className="tag-badge"
                  style={{
                    backgroundColor: isSelected ? `${tag.color}1c` : 'var(--color-bg-elevated)',
                    color: isSelected ? tag.color : 'var(--color-text-secondary)',
                    border: isSelected ? `1px solid ${tag.color}` : '1px solid var(--color-border)',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: '100px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tag.name}
                </button>
              );
            })}
            {allTags.length === 0 && (
              <span className="text-xs text-muted" style={{ display: 'block', fontStyle: 'italic' }}>No custom tags found</span>
            )}
          </div>
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
