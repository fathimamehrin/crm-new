import React, { useEffect, useState } from 'react';
import { getUsers, getAllActivityLogs } from '../../lib/firestore';
import { format, subDays, startOfDay, isAfter, isBefore } from 'date-fns';
import { Clock, User, Search, Activity } from 'lucide-react';
import type { User as AppUser, ActivityLog } from '../../types';
import toast from 'react-hot-toast';

interface WorkdaySpan {
  dateStr: string;
  start: Date;
  end: Date;
  durationMs: number;
  sessionCount: number;
  activityCount: number;
}

interface AgentStats {
  agent: AppUser;
  totalDurationMs: number;
  avgDurationMs: number;
  totalActivities: number;
  activeDaysCount: number;
  dailySpans: Record<string, WorkdaySpan>;
}

const StaffDurationPage: React.FC = () => {
  const [agents, setAgents] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all'>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [allAgents, allLogs] = await Promise.all([
        getUsers('agent'),
        getAllActivityLogs()
      ]);
      setAgents(allAgents);
      setLogs(allLogs);
    } catch (err) {
      console.error('Failed to load activity analytics:', err);
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Format milliseconds to human readable
  const formatDuration = (ms: number): string => {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  };

  // Filter logs based on selection
  const getFilteredLogs = (): ActivityLog[] => {
    let filtered = logs;

    // Date range filter
    const now = new Date();
    if (dateRange === 'today') {
      const todayStart = startOfDay(now);
      filtered = filtered.filter(log => isAfter(log.createdAt, todayStart));
    } else if (dateRange === '7days') {
      const sevenDaysAgo = startOfDay(subDays(now, 7));
      filtered = filtered.filter(log => isAfter(log.createdAt, sevenDaysAgo));
    } else if (dateRange === '30days') {
      const thirtyDaysAgo = startOfDay(subDays(now, 30));
      filtered = filtered.filter(log => isAfter(log.createdAt, thirtyDaysAgo));
    } else if (dateRange === 'all' && customStartDate && customEndDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = new Date(customEndDate + 'T23:59:59');
      filtered = filtered.filter(log => isAfter(log.createdAt, start) && isBefore(log.createdAt, end));
    }

    return filtered;
  };

  // Process activity logs into agent stats and workday list
  const processStats = (): { agentStats: Record<string, AgentStats>; workdayList: (WorkdaySpan & { agentName: string; agentId: string })[] } => {
    const filteredLogs = getFilteredLogs();
    const stats: Record<string, AgentStats> = {};

    // Initialize map for all agents
    agents.forEach(agent => {
      stats[agent.id] = {
        agent,
        totalDurationMs: 0,
        avgDurationMs: 0,
        totalActivities: 0,
        activeDaysCount: 0,
        dailySpans: {}
      };
    });

    // Group logs by agent & date
    const groupedLogs: Record<string, Record<string, ActivityLog[]>> = {};

    filteredLogs.forEach(log => {
      const userId = log.userId;
      // Skip if log is by an admin/user not in agents list (or filter by selected agent)
      if (!stats[userId] || (selectedAgentId !== 'all' && userId !== selectedAgentId)) {
        return;
      }

      const dateStr = format(log.createdAt, 'yyyy-MM-dd');
      if (!groupedLogs[userId]) {
        groupedLogs[userId] = {};
      }
      if (!groupedLogs[userId][dateStr]) {
        groupedLogs[userId][dateStr] = [];
      }
      groupedLogs[userId][dateStr].push(log);
    });

    const workdayList: (WorkdaySpan & { agentName: string; agentId: string })[] = [];

    // Calculate workday sessions for each agent
    Object.entries(groupedLogs).forEach(([agentId, dateGroup]) => {
      const agentStat = stats[agentId];
      if (!agentStat) return;

      Object.entries(dateGroup).forEach(([dateStr, dayLogs]) => {
        // Sort day logs chronologically
        dayLogs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        const sessions: { start: Date; end: Date }[] = [];
        const SESSION_BREAK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours gap splits a session
        const MINIMUM_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 mins minimum credit per login activity

        dayLogs.forEach(log => {
          const logTime = log.createdAt;
          if (sessions.length === 0) {
            sessions.push({ start: logTime, end: logTime });
          } else {
            const lastSession = sessions[sessions.length - 1];
            const gap = logTime.getTime() - lastSession.end.getTime();

            if (gap > SESSION_BREAK_THRESHOLD_MS) {
              sessions.push({ start: logTime, end: logTime });
            } else {
              lastSession.end = logTime;
            }
          }
        });

        // Sum duration of day's sessions
        let dayDurationMs = 0;
        sessions.forEach(s => {
          let diff = s.end.getTime() - s.start.getTime();
          if (diff < MINIMUM_SESSION_DURATION_MS) {
            diff = MINIMUM_SESSION_DURATION_MS;
          }
          dayDurationMs += diff;
        });

        const span: WorkdaySpan = {
          dateStr,
          start: dayLogs[0].createdAt,
          end: dayLogs[dayLogs.length - 1].createdAt,
          durationMs: dayDurationMs,
          sessionCount: sessions.length,
          activityCount: dayLogs.length
        };

        agentStat.dailySpans[dateStr] = span;
        agentStat.totalDurationMs += dayDurationMs;
        agentStat.totalActivities += dayLogs.length;
        agentStat.activeDaysCount += 1;

        workdayList.push({
          ...span,
          agentId,
          agentName: agentStat.agent.name
        });
      });

      // Calculate average duration per active day
      if (agentStat.activeDaysCount > 0) {
        agentStat.avgDurationMs = Math.round(agentStat.totalDurationMs / agentStat.activeDaysCount);
      }
    });

    // Sort workday list descending by date
    workdayList.sort((a, b) => b.start.getTime() - a.start.getTime());

    return {
      agentStats: stats,
      workdayList
    };
  };

  const { agentStats, workdayList } = processStats();

  // Search filter for workdays
  const filteredWorkdayList = workdayList.filter(row => {
    const matchesSearch = row.agentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAgent = selectedAgentId === 'all' || row.agentId === selectedAgentId;
    return matchesSearch && matchesAgent;
  });

  // Calculate high level dashboard totals
  const overallMetrics = () => {
    let totalWorkMs = 0;
    let totalLogs = 0;
    let activeAgentName = 'None';
    let maxWorkMs = 0;

    Object.values(agentStats).forEach(s => {
      totalWorkMs += s.totalDurationMs;
      totalLogs += s.totalActivities;
      if (s.totalDurationMs > maxWorkMs) {
        maxWorkMs = s.totalDurationMs;
        activeAgentName = s.agent.name;
      }
    });

    return {
      totalWorkHours: formatDuration(totalWorkMs),
      totalLogs,
      mostActiveAgent: activeAgentName,
      activeAgentsCount: Object.values(agentStats).filter(s => s.activeDaysCount > 0).length
    };
  };

  const summaryMetrics = overallMetrics();

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Staff Activity & Durations</h1>
          <p className="page-subtitle">Track agent work workday spans, login sessions, and active operations</p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="analytics-dashboard-grid">
        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-accent-light)', color: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Clock size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Working Time</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{summaryMetrics.totalWorkHours}</div>
          </div>
        </div>

        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-success-light)', color: 'var(--color-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Activity size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Operations Logged</div>
            <div className="font-bold text-2xl monospaced" style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{summaryMetrics.totalLogs}</div>
          </div>
        </div>

        <div className="card col-span-4" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--color-warning-light)', color: 'var(--color-warning)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <User size={22} />
          </div>
          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Active Agent</div>
            <div className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{summaryMetrics.mostActiveAgent}</div>
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)' }}>
        <div className="analytics-filters-bar" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          
          {/* Agent Selector */}
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
          <div className="analytics-date-filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

          {/* Custom Date Picker Fields */}
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

          {/* Search agent */}
          <div className="search-wrapper" style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}>
            <Search className="search-icon" size={16} />
            <input
              type="search"
              className="form-input"
              placeholder="Search agent workday list…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search agents"
            />
          </div>
        </div>
      </div>

      <div className="analytics-dashboard-grid">
        {/* Agent Leaderboard Bar Chart */}
        <div className="card col-span-4">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Activity Performance</h3>
          <div className="leaderboard-list">
            {Object.values(agentStats)
              .sort((a, b) => b.totalActivities - a.totalActivities)
              .map((stat) => {
                const maxLogs = Math.max(...Object.values(agentStats).map(s => s.totalActivities), 1);
                const percent = Math.min(100, Math.round((stat.totalActivities / maxLogs) * 100));
                
                return (
                  <div key={stat.agent.id} className="leaderboard-item">
                    <div className="leaderboard-item-header">
                      <span className="leaderboard-item-name">{stat.agent.name}</span>
                      <span className="leaderboard-item-value">{stat.totalActivities} operations</span>
                    </div>
                    <div className="leaderboard-bar-bg">
                      <div 
                        className="leaderboard-bar-fill" 
                        style={{ 
                          width: `${percent}%`, 
                          background: `linear-gradient(135deg, var(--color-accent), #818cf8)` 
                        }} 
                      />
                    </div>
                  </div>
                );
              })}
            {agents.length === 0 && (
              <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-4) 0' }}>No agents to evaluate.</div>
            )}
          </div>
        </div>

        {/* Agent Duration Leaderboard Bar Chart */}
        <div className="card col-span-4">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Time Contribution</h3>
          <div className="leaderboard-list">
            {Object.values(agentStats)
              .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
              .map((stat) => {
                const maxWork = Math.max(...Object.values(agentStats).map(s => s.totalDurationMs), 1);
                const percent = Math.min(100, Math.round((stat.totalDurationMs / maxWork) * 100));
                
                return (
                  <div key={stat.agent.id} className="leaderboard-item">
                    <div className="leaderboard-item-header">
                      <span className="leaderboard-item-name">{stat.agent.name}</span>
                      <span className="leaderboard-item-value monospaced" style={{ fontSize: '12px' }}>{formatDuration(stat.totalDurationMs)}</span>
                    </div>
                    <div className="leaderboard-bar-bg">
                      <div 
                        className="leaderboard-bar-fill" 
                        style={{ 
                          width: `${percent}%`, 
                          background: `linear-gradient(135deg, var(--color-success), #34d399)` 
                        }} 
                      />
                    </div>
                  </div>
                );
              })}
            {agents.length === 0 && (
              <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-4) 0' }}>No agents to evaluate.</div>
            )}
          </div>
        </div>

        {/* Staff Metrics grid */}
        <div className="card col-span-4">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Active Agents</h3>
          <div className="leaderboard-list">
            {Object.values(agentStats).map((stat) => (
              <div key={stat.agent.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar avatar-sm">{stat.agent.name.charAt(0)}</div>
                  <div>
                    <div className="font-semibold text-sm">{stat.agent.name}</div>
                    <div className="text-xs text-muted">{stat.agent.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold monospaced" style={{ color: 'var(--color-accent)' }}>
                    {stat.activeDaysCount} active days
                  </div>
                  <div className="text-xs text-muted">
                    Avg: {formatDuration(stat.avgDurationMs)}/day
                  </div>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-center text-xs text-muted" style={{ padding: 'var(--space-4) 0' }}>No active records.</div>
            )}
          </div>
        </div>
      </div>

      {/* Workday Span Log Details */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Daily Workday Sessions Log</h3>
          <span className="badge badge-muted text-xs">{filteredWorkdayList.length} entries</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : filteredWorkdayList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock size={28} /></div>
            <h3 className="empty-state-title">No Work Log Entries</h3>
            <p className="empty-state-desc">There are no agent activity spans matching the filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-wrapper desktop-only" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Date</th>
                    <th>First Activity</th>
                    <th>Last Activity</th>
                    <th>Workday Span</th>
                    <th>Total Operations</th>
                    <th style={{ textAlign: 'right' }}>Active Work Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkdayList.map((row, idx) => (
                    <tr key={`${row.agentId}-${row.dateStr}-${idx}`} style={{ cursor: 'default' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div className="avatar avatar-sm">{row.agentName.charAt(0)}</div>
                          <span className="font-semibold text-sm">{row.agentName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="text-sm font-medium">{format(row.start, 'dd MMM yyyy')}</div>
                        <div className="text-xs text-muted">{format(row.start, 'EEEE')}</div>
                      </td>
                      <td className="text-xs monospaced text-muted">
                        {format(row.start, 'hh:mm:ss a')}
                      </td>
                      <td className="text-xs monospaced text-muted">
                        {format(row.end, 'hh:mm:ss a')}
                      </td>
                      <td className="text-xs text-secondary font-medium">
                        {format(row.start, 'hh:mm a')} - {format(row.end, 'hh:mm a')}
                      </td>
                      <td className="text-sm monospaced text-secondary">
                        {row.activityCount} actions ({row.sessionCount} sessions)
                      </td>
                      <td className="font-bold text-sm monospaced" style={{ color: 'var(--color-accent)', textAlign: 'right' }}>
                        {formatDuration(row.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {filteredWorkdayList.map((row, idx) => (
                <div 
                  key={`${row.agentId}-${row.dateStr}-mob-${idx}`}
                  className="mobile-card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <div className="avatar avatar-sm">{row.agentName.charAt(0)}</div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{row.agentName}</div>
                        <div className="text-xs text-muted">{format(row.start, 'dd MMM yyyy')}</div>
                      </div>
                    </div>
                    <span 
                      className="font-bold text-sm monospaced" 
                      style={{ color: 'var(--color-accent)', background: 'var(--color-accent-light)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}
                    >
                      {formatDuration(row.durationMs)}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Workday Span</span>
                      <span className="text-xs font-semibold text-secondary">
                        {format(row.start, 'hh:mm a')} - {format(row.end, 'hh:mm a')}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>Active Events</span>
                      <span className="text-xs text-secondary font-medium">
                        {row.activityCount} actions ({row.sessionCount} sessions)
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', background: 'var(--color-bg-secondary)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                    <span>First: {format(row.start, 'hh:mm:ss a')}</span>
                    <span>Last: {format(row.end, 'hh:mm:ss a')}</span>
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

export default StaffDurationPage;
