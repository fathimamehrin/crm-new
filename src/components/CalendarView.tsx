import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, MessageCircle, ExternalLink, Calendar as CalendarIcon, Users } from 'lucide-react';
import type { Client } from '../types';

interface CalendarViewProps {
  clients: Client[];
  isAdminView?: boolean;
}

const CalendarView: React.FC<CalendarViewProps> = ({ clients, isAdminView = false }) => {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Calendar dates generation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  // Group clients by day
  const getClientsForDay = (day: Date) => {
    return clients.filter((c) => isSameDay(new Date(c.createdAt), day));
  };

  const selectedDayClients = getClientsForDay(selectedDate);

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .calendar-layout-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: var(--space-5);
          align-items: start;
        }
        .calendar-grid-wrapper {
          grid-column: 1 / span 8;
        }
        .calendar-detail-panel {
          grid-column: 9 / span 4;
        }
        .calendar-days-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          grid-auto-rows: minmax(96px, 1fr);
          border-top: 1px solid var(--color-border);
          border-left: 1px solid var(--color-border);
        }
        .calendar-event-pill {
          font-size: 0.675rem;
          padding: 2px 6px;
          border-radius: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 550;
          text-align: left;
        }
        .calendar-event-more {
          font-size: 0.625rem;
          color: var(--color-text-muted);
          font-weight: 650;
          text-align: left;
          padding-left: 6px;
        }
        .calendar-day-events-container {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1;
          overflow: hidden;
          margin-top: 4px;
        }

        @media (max-width: 1024px) {
          .calendar-layout-grid {
            display: flex;
            flex-direction: column;
            gap: var(--space-5);
            width: 100%;
          }
          .calendar-grid-wrapper,
          .calendar-detail-panel {
            width: 100%;
            grid-column: auto;
          }
        }

        @media (max-width: 768px) {
          .calendar-detail-panel {
            padding: 16px !important;
            min-height: auto !important;
          }
          .calendar-days-grid {
            grid-auto-rows: minmax(64px, 1fr);
          }
          .event-pill-name {
            display: none;
          }
          .calendar-event-pill {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            padding: 0 !important;
            min-height: auto;
            border: none !important;
          }
          .calendar-event-more {
            display: none;
          }
          .calendar-day-events-container {
            flex-direction: row;
            justify-content: center;
            flex-wrap: wrap;
            gap: 4px;
          }
        }
      `}} />

      {/* Calendar Top Controls */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          flexWrap: 'wrap', 
          gap: 'var(--space-3)',
          background: 'var(--color-bg-card)',
          padding: '16px 20px',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(15, 23, 42, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0, minWidth: '160px' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              className="btn btn-secondary btn-icon" 
              style={{ width: '32px', height: '32px', padding: 0 }}
              onClick={prevMonth}
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              className="btn btn-secondary btn-icon" 
              style={{ width: '32px', height: '32px', padding: 0 }}
              onClick={nextMonth}
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-secondary btn-sm" onClick={goToToday}>
            Today
          </button>
          <span className="text-xs text-muted" style={{ fontWeight: 500 }}>
            {clients.length} clients in filter
          </span>
        </div>
      </div>

      {/* Main Grid: Calendar left, Side detail panel right */}
      <div className="calendar-layout-grid">
        
        {/* Monthly Grid Table Wrapper */}
        <div className="card calendar-grid-wrapper" style={{ padding: '16px', overflow: 'hidden' }}>
          {/* Weekdays Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '8px' }}>
            {WEEKDAYS.map((dayName) => (
              <div 
                key={dayName} 
                style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 600, 
                  color: 'var(--color-text-muted)', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  padding: '8px 0' 
                }}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="calendar-days-grid">
            {days.map((day, idx) => {
              const dayClients = getClientsForDay(day);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  style={{
                    padding: '6px',
                    borderRight: '1px solid var(--color-border)',
                    borderBottom: '1px solid var(--color-border)',
                    background: isSelected 
                      ? 'var(--color-accent-light)' 
                      : (isCurrentMonth ? 'var(--color-bg-card)' : 'var(--color-bg-secondary)'),
                    opacity: isCurrentMonth ? 1 : 0.5,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = isCurrentMonth ? 'var(--color-bg-card)' : 'var(--color-bg-secondary)';
                    }
                  }}
                >
                  {/* Day Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span 
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: isCurrentDay || isSelected ? 700 : 500,
                        backgroundColor: isCurrentDay 
                          ? 'var(--color-accent)' 
                          : 'transparent',
                        color: isCurrentDay 
                          ? '#ffffff' 
                          : (isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)'),
                        boxShadow: isCurrentDay ? 'var(--shadow-sm)' : 'none'
                      }}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayClients.length > 0 && (
                      <span 
                        className="badge badge-accent" 
                        style={{ 
                          fontSize: '8px', 
                          padding: '1px 5px', 
                          height: '14px', 
                          borderRadius: '10px', 
                          fontWeight: 700 
                        }}
                      >
                        {dayClients.length}
                      </span>
                    )}
                  </div>

                  {/* Day Clients Events Pills */}
                  <div className="calendar-day-events-container">
                    {dayClients.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="calendar-event-pill"
                        style={{
                          background: c.status.toLowerCase() === 'active' 
                            ? 'rgba(16, 185, 129, 0.12)' 
                            : (c.status.toLowerCase().includes('lead') ? 'rgba(245, 158, 11, 0.12)' : 'var(--color-bg-secondary)'),
                          color: c.status.toLowerCase() === 'active' 
                            ? '#059669' 
                            : (c.status.toLowerCase().includes('lead') ? '#d97706' : 'var(--color-text-secondary)'),
                          border: c.status.toLowerCase() === 'active'
                            ? '1px solid rgba(16, 185, 129, 0.2)'
                            : (c.status.toLowerCase().includes('lead') ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid var(--color-border)'),
                        }}
                      >
                        <span className="event-pill-name">{c.name}</span>
                      </div>
                    ))}
                    {dayClients.length > 2 && (
                      <div className="calendar-event-more">
                        +{dayClients.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Clients Panel */}
        <div 
          className="card calendar-detail-panel" 
          style={{ 
            gridColumn: '9 / span 4', 
            minHeight: '400px', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: '20px' 
          }}
        >
          {/* Panel Header */}
          <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
              <CalendarIcon size={18} />
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700 }}>
                {format(selectedDate, 'do MMMM yyyy')}
              </h3>
            </div>
            <p className="text-xs text-muted" style={{ marginTop: '4px' }}>
              {selectedDayClients.length} clients registered on this date
            </p>
          </div>

          {/* Panel Content (Clients List) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', maxHeight: '500px' }}>
            {selectedDayClients.length === 0 ? (
              <div 
                style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  padding: '40px 0'
                }}
              >
                <Users size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p className="text-sm font-medium">No clients added</p>
                <p className="text-xs" style={{ marginTop: '2px' }}>Try selecting another date on the calendar.</p>
              </div>
            ) : (
              selectedDayClients.map((client) => {
                let badgeClass = 'badge-muted';
                const lowerStatus = client.status.toLowerCase();
                if (lowerStatus === 'active') badgeClass = 'badge-success';
                else if (lowerStatus.includes('lead')) badgeClass = 'badge-warning';
                else if (lowerStatus === 'closed') badgeClass = 'badge-danger';

                return (
                  <div
                    key={client.id}
                    className="hover-card"
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-elevated)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => navigate(isAdminView ? `/admin/clients/${client.id}` : `/clients/${client.id}`)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div className="font-semibold text-sm text-primary truncate" style={{ maxWidth: '160px' }}>
                        {client.name}
                      </div>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                        {client.status}
                      </span>
                    </div>

                    {client.projectName && (
                      <div className="text-xs text-muted" style={{ marginBottom: '6px' }}>
                        Project: <strong style={{ color: 'var(--color-text-secondary)' }}>{client.projectName}</strong>
                      </div>
                    )}

                    {client.leadSource && (
                      <div className="text-xs text-muted" style={{ marginBottom: '8px' }}>
                        Source: <strong style={{ color: 'var(--color-accent)' }}>{client.leadSource}</strong>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: '8px', marginTop: '4px' }}>
                      <a
                        href={`https://wa.me/${client.whatsappNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs"
                        style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 550 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircle size={12} />
                        WhatsApp
                      </a>
                      <span
                        className="text-xs text-accent"
                        style={{ display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}
                      >
                        Details
                        <ExternalLink size={10} />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CalendarView;
