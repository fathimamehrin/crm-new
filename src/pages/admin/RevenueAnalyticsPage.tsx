import React, { useEffect, useState } from 'react';
import { getAllSummaries, getUsers } from '../../lib/firestore';
import { format, subDays, startOfDay, isAfter, isBefore } from 'date-fns';
import { DollarSign, Search, TrendingUp } from 'lucide-react';
import type { Summary, User as AppUser } from '../../types';
import toast from 'react-hot-toast';

interface PaymentTx {
  summaryId: string;
  clientId: string;
  clientName: string;
  amount: number;
  status: 'paid' | 'pending' | 'partial' | 'failed';
  transactionId?: string;
  notes?: string;
  date: Date;
  createdBy: string;
  createdByName?: string;
}

const STATUS_COLOR: Record<string, string> = {
  paid: 'var(--color-success)',
  pending: 'var(--color-warning)',
  partial: 'var(--color-info)',
  failed: 'var(--color-danger)',
};

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'badge-success',
  pending: 'badge-warning',
  partial: 'badge-info',
  failed: 'badge-danger',
};

const RevenueAnalyticsPage: React.FC = () => {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [agents, setAgents] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all'>('30days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [allSummaries, allAgents] = await Promise.all([
        getAllSummaries(),
        getUsers('agent')
      ]);
      setSummaries(allSummaries);
      setAgents(allAgents);
    } catch (err) {
      console.error('Failed to load revenue analytics:', err);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map summaries to flat list of payment transactions
  const getRawTransactions = (): PaymentTx[] => {
    const txs: PaymentTx[] = [];
    
    // Find summaries containing paymentDetails and find client name
    summaries.forEach(s => {
      if (s.paymentDetails && s.paymentDetails.status) {
        // Find corresponding client info (stored on summary or default)
        txs.push({
          summaryId: s.id,
          clientId: s.clientId,
          clientName: s.paymentDetails.notes?.includes('Client:') 
            ? s.paymentDetails.notes.split('Client:')[1].split('\n')[0].trim()
            : 'Client Record', // fallback or placeholder, we will get details from summary if clientName is missing. Wait, summaries don't have client name directly, but we can look for s.paymentDetails.notes or just default to client ID or 'Client'
          amount: s.paymentDetails.amount || 0,
          status: s.paymentDetails.status as any,
          transactionId: s.paymentDetails.transactionId,
          notes: s.paymentDetails.notes,
          date: s.createdAt,
          createdBy: s.createdBy,
          createdByName: s.createdByName || 'System'
        });
      }
    });

    return txs;
  };

  // Filter transactions based on selection
  const getFilteredTransactions = (): PaymentTx[] => {
    const rawTxs = getRawTransactions();
    let filtered = rawTxs;

    // Date range filter
    const now = new Date();
    if (dateRange === 'today') {
      const todayStart = startOfDay(now);
      filtered = filtered.filter(tx => isAfter(tx.date, todayStart));
    } else if (dateRange === '7days') {
      const sevenDaysAgo = startOfDay(subDays(now, 7));
      filtered = filtered.filter(tx => isAfter(tx.date, sevenDaysAgo));
    } else if (dateRange === '30days') {
      const thirtyDaysAgo = startOfDay(subDays(now, 30));
      filtered = filtered.filter(tx => isAfter(tx.date, thirtyDaysAgo));
    } else if (dateRange === 'all' && customStartDate && customEndDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = new Date(customEndDate + 'T23:59:59');
      filtered = filtered.filter(tx => isAfter(tx.date, start) && isBefore(tx.date, end));
    }

    // Agent filter
    if (selectedAgentId !== 'all') {
      filtered = filtered.filter(tx => tx.createdBy === selectedAgentId);
    }

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.clientName.toLowerCase().includes(q) || 
        tx.transactionId?.toLowerCase().includes(q) ||
        tx.createdByName?.toLowerCase().includes(q) ||
        tx.amount.toString().includes(q)
      );
    }

    return filtered;
  };

  const filteredTxs = getFilteredTransactions();

  // Compute analytics
  const getAnalytics = () => {
    let collectedTotal = 0; // Paid + Partial
    let pendingTotal = 0;
    let failedTotal = 0;

    const statusCounts = { paid: 0, pending: 0, partial: 0, failed: 0 };
    const agentRevenue: Record<string, { name: string; collected: number }> = {};
    const monthlyRevenue: Record<string, number> = {};

    filteredTxs.forEach(tx => {
      // Status counters
      if (tx.status === 'paid') {
        collectedTotal += tx.amount;
        statusCounts.paid += 1;
      } else if (tx.status === 'partial') {
        collectedTotal += tx.amount; // partial is collected revenue
        statusCounts.partial += 1;
      } else if (tx.status === 'pending') {
        pendingTotal += tx.amount;
        statusCounts.pending += 1;
      } else if (tx.status === 'failed') {
        failedTotal += tx.amount;
        statusCounts.failed += 1;
      }

      // Group by agent
      const agentId = tx.createdBy;
      const agentName = tx.createdByName || 'System';
      if (!agentRevenue[agentId]) {
        agentRevenue[agentId] = { name: agentName, collected: 0 };
      }
      if (tx.status === 'paid' || tx.status === 'partial') {
        agentRevenue[agentId].collected += tx.amount;
      }

      // Group by month
      const monthStr = format(tx.date, 'MMM yyyy');
      if (!monthlyRevenue[monthStr]) {
        monthlyRevenue[monthStr] = 0;
      }
      if (tx.status === 'paid' || tx.status === 'partial') {
        monthlyRevenue[monthStr] += tx.amount;
      }
    });

    // Generate Conic Gradient for Donut Chart
    const totalCount = statusCounts.paid + statusCounts.pending + statusCounts.partial + statusCounts.failed || 1;
    const paidPct = Math.round((statusCounts.paid / totalCount) * 100);
    const pendingPct = Math.round((statusCounts.pending / totalCount) * 100);
    const partialPct = Math.round((statusCounts.partial / totalCount) * 100);
    const failedPct = 100 - paidPct - pendingPct - partialPct;

    const p1 = paidPct;
    const p2 = p1 + pendingPct;
    const p3 = p2 + partialPct;

    const conicGradientStyle = {
      background: `conic-gradient(
        var(--color-success) 0% ${p1}%,
        var(--color-warning) ${p1}% ${p2}%,
        var(--color-info) ${p2}% ${p3}%,
        var(--color-danger) ${p3}% 100%
      )`
    };

    return {
      collectedTotal,
      pendingTotal,
      failedTotal,
      statusCounts,
      percentages: { paid: paidPct, pending: pendingPct, partial: partialPct, failed: failedPct },
      conicGradientStyle,
      agentRevenue: Object.values(agentRevenue).sort((a, b) => b.collected - a.collected),
      monthlyRevenue: Object.entries(monthlyRevenue).map(([month, val]) => ({ month, amount: val }))
    };
  };

  const analytics = getAnalytics();

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Revenue & Payments Analytics</h1>
          <p className="page-subtitle">Analyze collected revenue, pending statements, and agent sales performance</p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="analytics-dashboard-grid">
        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-success-light)', color: 'var(--color-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue Collected</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-success)', marginTop: 2 }}>₹{analytics.collectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-warning-light)', color: 'var(--color-warning)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Invoices</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-warning)', marginTop: 2 }}>₹{analytics.pendingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-info-light)', color: 'var(--color-info)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Transactions</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{filteredTxs.length} logs</div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          
          {/* Agent Dropdown */}
          <div className="form-group" style={{ minWidth: 160 }}>
            <select
              className="form-input form-select"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              aria-label="Filter by agent"
            >
              <option value="all">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>

          {/* Date range filter buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['today', '7days', '30days', 'all'] as const).map(range => (
              <button
                key={range}
                className={`btn btn-sm ${dateRange === range ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDateRange(range)}
              >
                {range === 'today' && 'Today'}
                {range === '7days' && 'Last 7 Days'}
                {range === '30days' && 'Last 30 Days'}
                {range === 'all' && (customStartDate ? 'Custom Range' : 'All Time / Custom')}
              </button>
            ))}
          </div>

          {/* Custom Dates */}
          {dateRange === 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, padding: '6px 12px' }}
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                aria-label="Start date"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, padding: '6px 12px' }}
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                aria-label="End date"
              />
            </div>
          )}

          {/* Search bar */}
          <div className="search-wrapper" style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}>
            <Search className="search-icon" size={16} />
            <input
              type="search"
              className="form-input"
              placeholder="Search ledger by transaction ID, agent…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search ledger"
            />
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Grid */}
      <div className="analytics-dashboard-grid">
        
        {/* Payment Status Donut Chart */}
        <div className="card col-span-4" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Payment Status Split</h3>
          <div className="donut-chart-wrapper" style={{ flex: 1 }}>
            <div className="donut-chart-radial" style={analytics.conicGradientStyle} />
            <div className="donut-legend">
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-success)' }} /> Paid
                </span>
                <span className="donut-legend-value">{analytics.statusCounts.paid} ({analytics.percentages.paid}%)</span>
              </div>
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-warning)' }} /> Pending
                </span>
                <span className="donut-legend-value">{analytics.statusCounts.pending} ({analytics.percentages.pending}%)</span>
              </div>
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-info)' }} /> Partial
                </span>
                <span className="donut-legend-value">{analytics.statusCounts.partial} ({analytics.percentages.partial}%)</span>
              </div>
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-danger)' }} /> Failed
                </span>
                <span className="donut-legend-value">{analytics.statusCounts.failed} ({analytics.percentages.failed}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Agent Revenue Performance Leaderboard */}
        <div className="card col-span-4">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Agent Revenue Performance</h3>
          <div className="leaderboard-list">
            {analytics.agentRevenue.map((item, idx) => {
              const maxRev = Math.max(...analytics.agentRevenue.map(a => a.collected), 1);
              const percent = Math.min(100, Math.round((item.collected / maxRev) * 100));
              return (
                <div key={idx} className="leaderboard-item">
                  <div className="leaderboard-item-header">
                    <span className="leaderboard-item-name">{item.name}</span>
                    <span className="leaderboard-item-value monospaced" style={{ color: 'var(--color-success)' }}>
                      ₹{item.collected.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="leaderboard-bar-bg">
                    <div 
                      className="leaderboard-bar-fill" 
                      style={{ 
                        width: `${percent}%`, 
                        background: 'linear-gradient(135deg, var(--color-success), #34d399)' 
                      }} 
                    />
                  </div>
                </div>
              );
            })}
            {analytics.agentRevenue.length === 0 && (
              <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-5) 0' }}>No agent payment contributions logged.</div>
            )}
          </div>
        </div>

        {/* Monthly Revenue growth bar chart */}
        <div className="card col-span-4">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Monthly Collection Trend</h3>
          <div className="horizontal-bar-chart">
            {analytics.monthlyRevenue.map((item, idx) => {
              const maxVal = Math.max(...analytics.monthlyRevenue.map(m => m.amount), 1);
              const percent = Math.min(100, Math.round((item.amount / maxVal) * 100));
              return (
                <div key={idx} className="bar-chart-row">
                  <span className="bar-chart-label">{item.month}</span>
                  <div className="leaderboard-bar-bg">
                    <div 
                      className="leaderboard-bar-fill" 
                      style={{ 
                        width: `${percent}%`, 
                        background: 'linear-gradient(135deg, var(--color-accent), #818cf8)' 
                      }} 
                    />
                  </div>
                  <span className="bar-chart-value monospaced" style={{ fontSize: '12px' }}>₹{item.amount.toLocaleString('en-IN')}</span>
                </div>
              );
            })}
            {analytics.monthlyRevenue.length === 0 && (
              <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-5) 0' }}>No historical collections recorded.</div>
            )}
          </div>
        </div>

      </div>

      {/* Transaction Ledger details */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Payment Transaction Ledger</h3>
          <span className="badge badge-muted text-xs">{filteredTxs.length} transactions</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : filteredTxs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><DollarSign size={28} /></div>
            <h3 className="empty-state-title">No Transactions Recorded</h3>
            <p className="empty-state-desc">There are no financial logs matching the filters.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table Layout */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference Client</th>
                    <th>Transaction ID / Ref</th>
                    <th>Collected By</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map((row, idx) => (
                    <tr key={`${row.summaryId}-${idx}`} style={{ cursor: 'default' }}>
                      <td>
                        <div className="text-sm font-medium">{format(row.date, 'dd MMM yyyy')}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{format(row.date, 'hh:mm a')}</div>
                      </td>
                      <td>
                        <span className="font-semibold text-sm text-primary">{row.clientName}</span>
                        {row.notes && row.notes !== 'Client' && (
                          <div className="text-xs text-muted truncate" style={{ maxWidth: 180, opacity: 0.8 }} title={row.notes}>
                            {row.notes.split('\n')[1] || row.notes}
                          </div>
                        )}
                      </td>
                      <td className="text-xs monospaced text-secondary">
                        {row.transactionId || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div className="avatar avatar-sm">{row.createdByName?.charAt(0) || 'S'}</div>
                          <span className="text-sm text-secondary font-medium">{row.createdByName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${PAYMENT_BADGE[row.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                          {row.status}
                        </span>
                      </td>
                      <td className="font-bold text-sm monospaced" style={{ color: STATUS_COLOR[row.status], textAlign: 'right' }}>
                        ₹{row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards Layout */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {filteredTxs.map((row, idx) => (
                <div 
                  key={`${row.summaryId}-mob-${idx}`}
                  className="mobile-card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="font-semibold text-sm text-primary">{row.clientName}</span>
                      <div className="text-xs text-muted">{format(row.date, 'dd MMM yyyy, hh:mm a')}</div>
                    </div>
                    <span 
                      className="font-bold text-sm monospaced" 
                      style={{ color: STATUS_COLOR[row.status], background: `${STATUS_COLOR[row.status]}10`, padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}
                    >
                      ₹{row.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Reference</span>
                      <span className="text-xs monospaced text-secondary">{row.transactionId || '—'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Collector</span>
                      <span className="text-xs text-secondary font-medium">{row.createdByName}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                    <span className={`badge ${PAYMENT_BADGE[row.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '9px' }}>
                      {row.status}
                    </span>
                    {row.notes && (
                      <span className="text-xs text-muted truncate" style={{ maxWidth: '70%' }}>
                        {row.notes.split('\n')[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RevenueAnalyticsPage;
