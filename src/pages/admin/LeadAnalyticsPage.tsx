import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients, getUsers, getTags, getAllSummaries } from '../../lib/firestore';
import { format, subDays, startOfDay, isAfter, isBefore, startOfWeek } from 'date-fns';
import { Users, TrendingUp, BarChart3, Calendar, UserCheck, Tag as TagIcon, CheckCircle } from 'lucide-react';
import type { Client, User as AppUser, Tag, Summary } from '../../types';
import toast from 'react-hot-toast';

interface LeadTimeSeries {
  key: string;
  label: string;
  date: Date;
  total: number;
  converted: number;
  rate: number;
}

interface AgentLeadPerformance {
  id: string;
  name: string;
  total: number;
  converted: number;
  rate: number;
}

const LeadAnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<AppUser[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'month' | 'year' | 'custom' | 'all'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [selectedTagId, setSelectedTagId] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('week');

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsRes, allAgents, allTags, summariesRes] = await Promise.all([
        getClients([], 1000),
        getUsers('agent'),
        getTags(),
        getAllSummaries()
      ]);
      setClients(clientsRes.clients);
      setAgents(allAgents);
      setTags(allTags);
      setSummaries(summariesRes);
    } catch (err) {
      console.error('Failed to load lead analytics:', err);
      toast.error('Failed to load leads data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter clients in-memory
  const getFilteredClients = (): Client[] => {
    let filtered = [...clients];

    // 1. Date range filter
    const now = new Date();
    if (dateRange === 'today') {
      const todayStart = startOfDay(now);
      filtered = filtered.filter(c => isAfter(c.createdAt, todayStart));
    } else if (dateRange === '7days') {
      const sevenDaysAgo = startOfDay(subDays(now, 7));
      filtered = filtered.filter(c => isAfter(c.createdAt, sevenDaysAgo));
    } else if (dateRange === '30days') {
      const thirtyDaysAgo = startOfDay(subDays(now, 30));
      filtered = filtered.filter(c => isAfter(c.createdAt, thirtyDaysAgo));
    } else if (dateRange === 'month') {
      const currentMonthPrefix = now.toISOString().substring(0, 7);
      filtered = filtered.filter(c => c.createdAt.toISOString().substring(0, 7) === currentMonthPrefix);
    } else if (dateRange === 'year') {
      const currentYear = now.getFullYear().toString();
      filtered = filtered.filter(c => c.createdAt.getFullYear().toString() === currentYear);
    } else if (dateRange === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = new Date(customEndDate + 'T23:59:59');
      filtered = filtered.filter(c => isAfter(c.createdAt, start) && isBefore(c.createdAt, end));
    }

    // 2. Agent filter
    if (selectedAgentId !== 'all') {
      filtered = filtered.filter(c => c.assignedAgent === selectedAgentId);
    }

    // 3. Tag filter
    if (selectedTagId !== 'all') {
      filtered = filtered.filter(c => c.tags?.includes(selectedTagId));
    }

    return filtered;
  };

  const filteredClients = getFilteredClients();

  // Compute metrics and analytics
  const getAnalytics = () => {
    const totalLeads = filteredClients.length;

    // Filter unique paying client IDs and total payments count
    const clientIds = new Set(filteredClients.map(c => c.id));
    const paymentSummaries = summaries.filter(s => 
      clientIds.has(s.clientId) && 
      s.paymentDetails?.amount && 
      (s.paymentDetails?.status?.toLowerCase() === 'paid' || s.paymentDetails?.status?.toLowerCase() === 'partial')
    );
    
    const payingClientIds = new Set(paymentSummaries.map(s => s.clientId));
    const payingLeadsCount = payingClientIds.size;
    const totalPaymentsCount = paymentSummaries.length;

    const conversionRate = totalLeads > 0 ? Math.round((payingLeadsCount / totalLeads) * 100) : 0;

    // Grouped Time Series
    const timeGroups: Record<string, { label: string; date: Date; total: number; converted: number }> = {};
    filteredClients.forEach(c => {
      let groupKey = '';
      let groupLabel = '';

      if (groupBy === 'day') {
        groupKey = format(c.createdAt, 'yyyy-MM-dd');
        groupLabel = format(c.createdAt, 'dd MMM yyyy');
      } else if (groupBy === 'week') {
        const start = startOfWeek(c.createdAt, { weekStartsOn: 1 });
        groupKey = format(start, 'yyyy-MM-dd');
        groupLabel = `W/c ${format(start, 'dd MMM')}`;
      } else { // month
        groupKey = format(c.createdAt, 'yyyy-MM');
        groupLabel = format(c.createdAt, 'MMM yyyy');
      }

      if (!timeGroups[groupKey]) {
        timeGroups[groupKey] = {
          label: groupLabel,
          date: c.createdAt,
          total: 0,
          converted: 0
        };
      }
      timeGroups[groupKey].total++;
      if (payingClientIds.has(c.id)) {
        timeGroups[groupKey].converted++;
      }
    });

    const timeSeriesList: LeadTimeSeries[] = Object.entries(timeGroups)
      .map(([key, item]) => ({
        key,
        label: item.label,
        date: item.date,
        total: item.total,
        converted: item.converted,
        rate: item.total > 0 ? Math.round((item.converted / item.total) * 100) : 0
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Agent performance list
    const agentPerformanceMap: Record<string, { name: string; total: number; converted: number }> = {};
    
    // Initialize active agents
    agents.forEach(a => {
      agentPerformanceMap[a.id] = { name: a.name, total: 0, converted: 0 };
    });
    // Add unassigned
    agentPerformanceMap['unassigned'] = { name: 'Unassigned', total: 0, converted: 0 };

    filteredClients.forEach(c => {
      const agentId = c.assignedAgent || 'unassigned';
      const agentName = c.assignedAgentName || 'Unassigned';
      if (!agentPerformanceMap[agentId]) {
        agentPerformanceMap[agentId] = { name: agentName, total: 0, converted: 0 };
      }
      agentPerformanceMap[agentId].total++;
      if (payingClientIds.has(c.id)) {
        agentPerformanceMap[agentId].converted++;
      }
    });

    const agentPerformanceList: AgentLeadPerformance[] = Object.entries(agentPerformanceMap)
      .map(([id, item]) => ({
        id,
        name: item.name,
        total: item.total,
        converted: item.converted,
        rate: item.total > 0 ? Math.round((item.converted / item.total) * 100) : 0
      }))
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total);

    // Lead source performance map
    const sourcePerformanceMap: Record<string, { name: string; total: number; converted: number; statuses: Record<string, number> }> = {};
    // Helper: convert "whatsapp" → "Whatsapp", "WHATSAPP" → "Whatsapp"
    const toTitleCase = (s: string) => s.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

    filteredClients.forEach(c => {
      const rawSource = c.leadSource ? c.leadSource.trim() : 'Unknown';
      const sourceKey = rawSource.toLowerCase();
      // Canonical display name — title case so "whatsapp" shows as "Whatsapp"
      const canonicalName = toTitleCase(rawSource);
      if (!sourcePerformanceMap[sourceKey]) {
        sourcePerformanceMap[sourceKey] = { name: canonicalName, total: 0, converted: 0, statuses: {} };
      }
      sourcePerformanceMap[sourceKey].total++;
      if (payingClientIds.has(c.id)) {
        sourcePerformanceMap[sourceKey].converted++;
      }
      
      const statusLabel = c.status.charAt(0).toUpperCase() + c.status.slice(1);
      if (!sourcePerformanceMap[sourceKey].statuses[statusLabel]) {
        sourcePerformanceMap[sourceKey].statuses[statusLabel] = 0;
      }
      sourcePerformanceMap[sourceKey].statuses[statusLabel]++;
    });

    const sourcePerformanceList = Object.values(sourcePerformanceMap)
      .map(item => ({
        name: item.name,
        total: item.total,
        converted: item.converted,
        statuses: item.statuses,
        rate: item.total > 0 ? Math.round((item.converted / item.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    return {
      totalLeads,
      payingLeadsCount,
      totalPaymentsCount,
      conversionRate,
      timeSeriesList,
      agentPerformanceList,
      sourcePerformanceList,
    };
  };

  const analytics = getAnalytics();

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Lead Analytics</h1>
          <p className="page-subtitle">Track incoming leads volume, conversion rates, and agent registration performance</p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="analytics-dashboard-grid">
        <div className="card col-span-3" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-accent-light)', color: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Users size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leads Received</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{analytics.totalLeads}</div>
          </div>
        </div>

        <div className="card col-span-3" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-success-light)', color: 'var(--color-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <CheckCircle size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversion Rate</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-success)', marginTop: 2 }}>{analytics.conversionRate}%</div>
            <div className="text-xs text-muted" style={{ marginTop: 2 }}>Total Payments: {analytics.totalPaymentsCount}</div>
          </div>
        </div>

        <div className="card col-span-3" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-warning-light)', color: 'var(--color-warning)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paying Clients</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-warning)', marginTop: 2 }}>{analytics.payingLeadsCount}</div>
          </div>
        </div>

        <div className="card col-span-3" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-success-light)', color: 'var(--color-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payments Received</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-success)', marginTop: 2 }}>{analytics.totalPaymentsCount}</div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)' }}>
        <div className="analytics-filters-bar" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          
          {/* Agent Filter */}
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <div className="search-wrapper">
              <UserCheck className="search-icon" size={14} style={{ color: 'var(--color-text-muted)' }} />
              <select
                className="form-input form-select"
                style={{ paddingLeft: '2rem' }}
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                aria-label="Filter by Agent"
              >
                <option value="all">All Agents</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tag Filter */}
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <div className="search-wrapper">
              <TagIcon className="search-icon" size={14} style={{ color: 'var(--color-text-muted)' }} />
              <select
                className="form-input form-select"
                style={{ paddingLeft: '2rem' }}
                value={selectedTagId}
                onChange={(e) => setSelectedTagId(e.target.value)}
                aria-label="Filter by Tag"
              >
                <option value="all">All Tags</option>
                {tags.map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date range filter buttons */}
          <div className="analytics-date-filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['month', 'today', '7days', '30days', 'year', 'all', 'custom'] as const).map(range => (
              <button
                key={range}
                className={`btn btn-sm ${dateRange === range ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDateRange(range)}
              >
                {range === 'month' ? 'Current Month' : range === 'today' ? 'Today' : range === '7days' ? 'Last 7 Days' : range === '30days' ? 'Last 30 Days' : range === 'year' ? 'Current Year' : range === 'all' ? 'Lifetime' : 'Custom'}
              </button>
            ))}
          </div>

          {/* Custom Dates */}
          {dateRange === 'custom' && (
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

          {/* Grouping Select */}
          <div className="form-group" style={{ minWidth: 140, marginBottom: 0, marginLeft: 'auto' }}>
            <div className="search-wrapper">
              <Calendar className="search-icon" size={14} style={{ color: 'var(--color-text-muted)' }} />
              <select
                className="form-input form-select"
                style={{ paddingLeft: '2rem' }}
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                aria-label="Group by interval"
              >
                <option value="day">Group by Day</option>
                <option value="week">Group by Week</option>
                <option value="month">Group by Month</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="analytics-dashboard-grid">
        
        {/* Lead Timelines Trend */}
        <div className="card col-span-12">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <BarChart3 size={16} style={{ color: 'var(--color-accent)' }} /> Leads Volume & Conversion Trend
            </h3>
            <span className="text-xs text-muted" style={{ fontWeight: 500 }}>Grouped by {groupBy}s</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
              <div className="spinner" />
            </div>
          ) : analytics.timeSeriesList.length === 0 ? (
            <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-10) 0' }}>
              No leads registered in this period.
            </div>
          ) : (
            <div className="horizontal-bar-chart" style={{ gap: 'var(--space-5)' }}>
              {analytics.timeSeriesList.map((row, idx) => {
                const maxLeads = Math.max(...analytics.timeSeriesList.map(t => t.total), 1);
                const leadPercent = Math.min(100, Math.round((row.total / maxLeads) * 100));
                
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
                      <span className="font-semibold text-primary">{row.label}</span>
                      <span className="text-muted font-medium">
                        {row.total} leads <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>({row.converted} paying - {row.rate}%)</span>
                      </span>
                    </div>
                    {/* Visual Dual Bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {/* Total Leads Bar */}
                      <div className="leaderboard-bar-bg" style={{ height: 6 }}>
                        <div 
                          className="leaderboard-bar-fill" 
                          style={{ 
                            width: `${leadPercent}%`, 
                            background: 'linear-gradient(90deg, var(--color-accent-light), var(--color-accent))' 
                          }} 
                        />
                      </div>
                      {/* Converted Leads Ratio Indicator */}
                      <div className="leaderboard-bar-bg" style={{ height: 4 }}>
                        <div 
                          className="leaderboard-bar-fill" 
                          style={{ 
                            width: `${row.rate}%`, 
                            background: 'linear-gradient(90deg, #a7f3d0, var(--color-success))' 
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Agent Performance Leaderboard Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={16} style={{ color: 'var(--color-accent)' }} /> Agent Lead Registration & Conversion
          </h3>
          <span className="badge badge-muted text-xs">{analytics.agentPerformanceList.length} active logs</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner" />
          </div>
        ) : analytics.agentPerformanceList.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-state-title">No Lead Data Logged</h3>
            <p className="empty-state-desc">There are no leads assigned to active agents in this range.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th style={{ textAlign: 'center' }}>Leads Assigned</th>
                    <th style={{ textAlign: 'center' }}>Paying Clients</th>
                    <th>Conversion Performance</th>
                    <th style={{ textAlign: 'right' }}>Conversion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.agentPerformanceList.map((row) => (
                    <tr 
                      key={row.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate('/admin/clients', { state: { agentId: row.id, status: '' } })}
                      title={`View clients for ${row.name}`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div className="avatar avatar-sm">{row.name.charAt(0).toUpperCase()}</div>
                          <span className="text-sm font-semibold text-primary">{row.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }} className="monospaced font-medium">
                        {row.total}
                      </td>
                      <td style={{ textAlign: 'center' }} className="monospaced font-medium text-success">
                        {row.converted}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="leaderboard-bar-bg" style={{ flex: 1, height: 6 }}>
                            <div 
                              className="leaderboard-bar-fill" 
                              style={{ 
                                width: `${row.rate}%`, 
                                background: 'linear-gradient(90deg, var(--color-warning), var(--color-success))' 
                              }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="monospaced font-bold text-success text-sm">
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {analytics.agentPerformanceList.map((row) => (
                <div 
                  key={`${row.id}-mob`}
                  className="mobile-card"
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', cursor: 'pointer' }}
                  onClick={() => navigate('/admin/clients', { state: { agentId: row.id, status: '' } })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="avatar avatar-sm">{row.name.charAt(0).toUpperCase()}</div>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)' }}>{row.name}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-success)' }}>
                      {row.rate}%
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', marginTop: '2px' }}>
                    <div>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Assigned</span>
                      <span className="text-xs font-semibold text-secondary">{row.total} leads</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Converted</span>
                      <span className="text-xs font-semibold text-success">{row.converted} leads</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '4px' }}>
                    <div className="leaderboard-bar-bg" style={{ height: 6, width: '100%' }}>
                      <div 
                        className="leaderboard-bar-fill" 
                        style={{ 
                          width: `${row.rate}%`, 
                          background: 'linear-gradient(90deg, var(--color-warning), var(--color-success))' 
                        }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lead Source Performance Table */}
      <div className="card" style={{ padding: 0, marginTop: 'var(--space-6)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} style={{ color: 'var(--color-accent)' }} /> Lead Source Performance & Conversion Funnel
          </h3>
          <span className="badge badge-muted text-xs">{analytics.sourcePerformanceList.length} sources tracked</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner" />
          </div>
        ) : analytics.sourcePerformanceList.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <h3 className="empty-state-title">No Lead Source Data</h3>
            <p className="empty-state-desc">There are no leads with source information in this range.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Source Channel</th>
                    <th style={{ textAlign: 'center' }}>Total Leads</th>
                    <th style={{ textAlign: 'center' }}>Paying Clients</th>
                    <th>Conversion Funnel</th>
                    <th style={{ textAlign: 'right' }}>Conversion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.sourcePerformanceList.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="font-semibold text-sm text-primary">{row.name}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {Object.entries(row.statuses).map(([statusName, count]) => {
                            let badgeClass = 'badge-muted';
                            const lowerStatus = statusName.toLowerCase();
                            if (lowerStatus === 'active') badgeClass = 'badge-success';
                            else if (lowerStatus === 'lead') badgeClass = 'badge-warning';
                            else if (lowerStatus === 'closed') badgeClass = 'badge-danger';
                            
                            return (
                              <span 
                                key={statusName} 
                                className={`badge ${badgeClass}`} 
                                style={{ fontSize: '9px', padding: '1px 5px', textTransform: 'capitalize' }}
                              >
                                {statusName}: {count}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }} className="monospaced font-medium">
                        {row.total}
                      </td>
                      <td style={{ textAlign: 'center' }} className="monospaced font-medium text-success">
                        {row.converted}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="leaderboard-bar-bg" style={{ flex: 1, height: 6 }}>
                            <div 
                              className="leaderboard-bar-fill" 
                              style={{ 
                                width: `${row.rate}%`, 
                                background: 'linear-gradient(90deg, var(--color-warning), var(--color-success))' 
                              }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="monospaced font-bold text-success text-sm">
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {analytics.sourcePerformanceList.map((row, idx) => (
                <div 
                  key={`${row.name}-${idx}`}
                  className="mobile-card"
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)' }}>{row.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-success)' }}>{row.rate}%</span>
                  </div>
                  
                  {/* Status Pills */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {Object.entries(row.statuses).map(([statusName, count]) => {
                      let badgeClass = 'badge-muted';
                      const lowerStatus = statusName.toLowerCase();
                      if (lowerStatus === 'active') badgeClass = 'badge-success';
                      else if (lowerStatus === 'lead') badgeClass = 'badge-warning';
                      else if (lowerStatus === 'closed') badgeClass = 'badge-danger';
                      
                      return (
                        <span key={statusName} className={`badge ${badgeClass}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                          {statusName}: {count}
                        </span>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', marginTop: '2px' }}>
                    <div>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Total Leads</span>
                      <span className="text-xs font-semibold text-secondary">{row.total}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Converted</span>
                      <span className="text-xs font-semibold text-success">{row.converted}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '4px' }}>
                    <div className="leaderboard-bar-bg" style={{ height: 6, width: '100%' }}>
                      <div 
                        className="leaderboard-bar-fill" 
                        style={{ 
                          width: `${row.rate}%`, 
                          background: 'linear-gradient(90deg, var(--color-warning), var(--color-success))' 
                        }} 
                      />
                    </div>
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

export default LeadAnalyticsPage;
