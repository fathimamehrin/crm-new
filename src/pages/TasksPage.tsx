import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getUsers,
  createTask,
  updateTaskStatus,
  reassignTaskRequest,
  approveReassignment,
  rejectReassignment,
  getTasks,
} from '../lib/firestore';
import { where, QueryConstraint } from 'firebase/firestore';
import type { Task, User } from '../types';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { 
  Plus, Check, X, ArrowLeftRight, CheckSquare, ClipboardList,
  Clock, User as UserIcon, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  pending_acceptance: 'badge-warning',
  accepted: 'badge-info',
  rejected: 'badge-danger',
  completed: 'badge-success',
  pending_reassignment: 'badge-accent',
};

const STATUS_LABEL: Record<string, string> = {
  pending_acceptance: 'Awaiting Acceptance',
  accepted: 'In Progress',
  rejected: 'Rejected',
  completed: 'Completed',
  pending_reassignment: 'Pending Reassignment',
};

const TasksPage: React.FC = () => {
  const { currentUser, userProfile, userRole } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'assigned' | 'created' | 'all'>('assigned');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showRejectReassignModal, setShowRejectReassignModal] = useState(false);
  
  // Selected task for dialog action
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Input fields for modals
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [completionSummary, setCompletionSummary] = useState('');
  const [reassignToUid, setReassignToUid] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [rejectReassignReason, setRejectReassignReason] = useState('');

  // Expandable history state
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Load users for task assignment dropdown
      const allUsers = await getUsers();
      setUsers(allUsers.filter(u => u.status === 'active'));

      // Determine query constraints based on tab
      const constraints: QueryConstraint[] = [];
      if (activeTab === 'assigned') {
        constraints.push(where('assignedTo', '==', currentUser.uid));
      } else if (activeTab === 'created') {
        constraints.push(where('createdBy', '==', currentUser.uid));
      }
      
      const loadedTasks = await getTasks(constraints);
      setTasks(loadedTasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Default to 'created' tab if agent and has no assigned tasks, or just keep assigned as default
  }, [activeTab, currentUser]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;
    if (!newTaskTitle.trim() || !newTaskAssignee) {
      toast.error('Title and Assignee are required');
      return;
    }

    const targetUser = users.find(u => u.id === newTaskAssignee);
    if (!targetUser) {
      toast.error('Selected assignee not found');
      return;
    }

    try {
      await createTask(
        newTaskTitle.trim(),
        newTaskDescription.trim(),
        newTaskAssignee,
        targetUser.name,
        currentUser.uid,
        userProfile.name
      );
      toast.success('Task created and assigned successfully');
      setShowAddModal(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskAssignee('');
      loadData();
    } catch (err) {
      console.error('Failed to create task:', err);
      toast.error('Failed to create task');
    }
  };

  const handleAcceptTask = async (task: Task) => {
    if (!currentUser || !userProfile) return;
    try {
      await updateTaskStatus(task.id, 'accepted', currentUser.uid, userProfile.name);
      toast.success('Task accepted');
      loadData();
    } catch (err) {
      console.error('Failed to accept task:', err);
      toast.error('Failed to accept task');
    }
  };

  const handleRejectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile || !selectedTask) return;
    if (!rejectReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await updateTaskStatus(
        selectedTask.id, 
        'rejected', 
        currentUser.uid, 
        userProfile.name, 
        rejectReason.trim()
      );
      toast.success('Task rejected successfully');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedTask(null);
      loadData();
    } catch (err) {
      console.error('Failed to reject task:', err);
      toast.error('Failed to reject task');
    }
  };

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile || !selectedTask) return;
    if (!completionSummary.trim()) {
      toast.error('Completion summary notes are required');
      return;
    }

    try {
      await updateTaskStatus(
        selectedTask.id,
        'completed',
        currentUser.uid,
        userProfile.name,
        undefined,
        completionSummary.trim()
      );
      toast.success('Task completed and summary updated');
      setShowCompleteModal(false);
      setCompletionSummary('');
      setSelectedTask(null);
      loadData();
    } catch (err) {
      console.error('Failed to complete task:', err);
      toast.error('Failed to complete task');
    }
  };

  const handleRequestReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile || !selectedTask) return;
    if (!reassignToUid || !reassignReason.trim()) {
      toast.error('Assignee and reason are required');
      return;
    }

    const targetUser = users.find(u => u.id === reassignToUid);
    if (!targetUser) {
      toast.error('Target assignee not found');
      return;
    }

    try {
      await reassignTaskRequest(
        selectedTask.id,
        reassignToUid,
        targetUser.name,
        reassignReason.trim(),
        currentUser.uid,
        userProfile.name
      );
      toast.success('Reassignment request sent to task creator');
      setShowReassignModal(false);
      setReassignToUid('');
      setReassignReason('');
      setSelectedTask(null);
      loadData();
    } catch (err) {
      console.error('Failed to request reassignment:', err);
      toast.error('Failed to request reassignment');
    }
  };

  const handleApproveReassignment = async (task: Task) => {
    if (!currentUser || !userProfile) return;
    try {
      await approveReassignment(task.id, currentUser.uid, userProfile.name);
      toast.success('Reassignment request approved. Awaiting acceptance from new assignee');
      loadData();
    } catch (err) {
      console.error('Failed to approve reassignment:', err);
      toast.error('Failed to approve reassignment');
    }
  };

  const handleRejectReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile || !selectedTask) return;
    if (!rejectReassignReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await rejectReassignment(
        selectedTask.id,
        currentUser.uid,
        userProfile.name,
        rejectReassignReason.trim()
      );
      toast.success('Reassignment request rejected');
      setShowRejectReassignModal(false);
      setRejectReassignReason('');
      setSelectedTask(null);
      loadData();
    } catch (err) {
      console.error('Failed to reject reassignment:', err);
      toast.error('Failed to reject reassignment');
    }
  };

  const toggleHistory = (taskId: string) => {
    setExpandedHistory(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  return (
    <div>
      {/* Header section */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Tasks & Workflows</h1>
          <p className="page-subtitle">Track task assignments, reassignments, completions, and workflow histories</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={18} />
          <span>Create Task</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-5)' }}>
        <button
          className={`tab-btn ${activeTab === 'assigned' ? 'active' : ''}`}
          onClick={() => setActiveTab('assigned')}
        >
          Assigned to Me
        </button>
        <button
          className={`tab-btn ${activeTab === 'created' ? 'active' : ''}`}
          onClick={() => setActiveTab('created')}
        >
          Created by Me
        </button>
        {userRole === 'admin' && (
          <button
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Tasks (Admin)
          </button>
        )}
      </div>

      {/* Main Grid List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-state-icon">
            <ClipboardList size={32} />
          </div>
          <h3 className="empty-state-title">No tasks found</h3>
          <p className="empty-state-desc">There are no tasks registered in this category.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {tasks.map((task) => {
            const isAssignedToMe = task.assignedTo === currentUser?.uid;
            const isCreatedByMe = task.createdBy === currentUser?.uid;
            const historyExpanded = !!expandedHistory[task.id];

            return (
              <div 
                key={task.id} 
                className="card"
                style={{ 
                  padding: '24px', 
                  border: '1px solid var(--color-border)', 
                  background: 'var(--color-bg-card)',
                  borderRadius: 'var(--radius-lg)' 
                }}
              >
                {/* Task Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {task.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <UserIcon size={12} />
                        From: <strong>{task.createdByName}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <UserIcon size={12} />
                        To: <strong>{task.assignedToName}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        Created: {format(new Date(task.createdAt), 'dd MMM yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                  
                  <span className={`badge ${STATUS_BADGE[task.status] || 'badge-muted'}`} style={{ fontSize: '11px', padding: '4px 12px' }}>
                    {STATUS_LABEL[task.status] || task.status}
                  </span>
                </div>

                {/* Task Description */}
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {task.description}
                  </p>
                </div>

                {/* Additional task summaries/rejections details based on current state */}
                {task.status === 'rejected' && task.rejectReason && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.15)', marginBottom: '16px', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>Rejection Reason: <strong>{task.rejectReason}</strong></span>
                  </div>
                )}

                {task.status === 'completed' && task.completionSummary && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.15)', marginBottom: '16px', color: '#059669', fontSize: 'var(--font-size-sm)' }}>
                    <CheckSquare size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Completion Summary</strong>
                      <span style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{task.completionSummary}</span>
                    </div>
                  </div>
                )}

                {task.status === 'pending_reassignment' && task.reassignRequestedToName && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', background: 'var(--color-accent-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(37, 99, 235, 0.15)', marginBottom: '16px', fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Reassignment Request Pending Approval:</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      Requesting transfer to <strong>{task.reassignRequestedToName}</strong>
                    </span>
                    {task.reassignReason && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                        Reason: "{task.reassignReason}"
                      </span>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {/* Assigned User Actions */}
                  {isAssignedToMe && task.status === 'pending_acceptance' && (
                    <>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => handleAcceptTask(task)}
                      >
                        <Check size={14} /> Accept Task
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowRejectModal(true);
                        }}
                      >
                        <X size={14} /> Reject Task
                      </button>
                    </>
                  )}

                  {isAssignedToMe && task.status === 'accepted' && (
                    <>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowCompleteModal(true);
                        }}
                      >
                        <CheckSquare size={14} /> Mark Completed
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowReassignModal(true);
                        }}
                      >
                        <ArrowLeftRight size={14} /> Reassign Task
                      </button>
                    </>
                  )}

                  {/* Creator Actions */}
                  {isCreatedByMe && task.status === 'pending_reassignment' && (
                    <>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => handleApproveReassignment(task)}
                      >
                        <Check size={14} /> Approve Reassignment
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowRejectReassignModal(true);
                        }}
                      >
                        <X size={14} /> Reject Reassignment
                      </button>
                    </>
                  )}
                </div>

                {/* History Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleHistory(task.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    padding: 0,
                    outline: 'none'
                  }}
                >
                  {historyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{historyExpanded ? 'Hide History Trail' : 'Show History Trail'} ({task.history.length})</span>
                </button>

                {/* History Accordion Content (Timeline) */}
                {historyExpanded && (
                  <div style={{ marginTop: '16px', paddingLeft: '12px', borderLeft: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {task.history.map((hist, hIdx) => (
                      <div key={hIdx} style={{ position: 'relative' }}>
                        {/* Timeline node dot */}
                        <div style={{
                          position: 'absolute',
                          left: '-20px',
                          top: '4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: hist.action === 'completed' ? 'var(--color-success)' : (hist.action === 'rejected' ? 'var(--color-danger)' : 'var(--color-accent)'),
                          border: '2px solid var(--color-bg-card)',
                        }} />
                        
                        <div style={{ fontSize: 'var(--font-size-xs)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                            {hist.action.replace('_', ' ')}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)' }}> by </span>
                          <strong style={{ color: 'var(--color-text-secondary)' }}>{hist.performedByName}</strong>
                          <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                            {format(new Date(hist.timestamp), 'dd MMM HH:mm')}
                          </span>
                        </div>
                        {hist.details && (
                          <div style={{ marginTop: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'var(--color-bg-secondary)', padding: '6px 10px', borderRadius: '4px', display: 'inline-block' }}>
                            {hist.details}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE TASK DIALOG MODAL */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Task</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="task-title-input">Task Title</label>
                  <input
                    id="task-title-input"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Call client back"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="task-desc-input">Description</label>
                  <textarea
                    id="task-desc-input"
                    className="form-input"
                    rows={4}
                    placeholder="Describe details of the task here..."
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="task-assignee-select">Assign To</label>
                  <select
                    id="task-assignee-select"
                    className="form-input form-select"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    required
                  >
                    <option value="">Select Assignee...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT TASK REASON DIALOG MODAL */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Task</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRejectModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRejectTask}>
              <div className="form-group">
                <label className="form-label required" htmlFor="reject-reason-input">Rejection Reason</label>
                <textarea
                  id="reject-reason-input"
                  className="form-input"
                  rows={3}
                  placeholder="Provide reason for rejecting this task..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Submit Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETION SUMMARY DIALOG MODAL */}
      {showCompleteModal && (
        <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Complete Task</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCompleteModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCompleteTask}>
              <div className="form-group">
                <label className="form-label required" htmlFor="completion-summary-input">What did you do?</label>
                <textarea
                  id="completion-summary-input"
                  className="form-input"
                  rows={4}
                  placeholder="Summarize the action details taken to complete this task (e.g. Called and scheduled follow-up on Friday)..."
                  value={completionSummary}
                  onChange={(e) => setCompletionSummary(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Mark Done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN TASK DIALOG MODAL */}
      {showReassignModal && (
        <div className="modal-overlay" onClick={() => setShowReassignModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Request Reassignment</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowReassignModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRequestReassignment}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="reassign-assignee-select">Reassign To</label>
                  <select
                    id="reassign-assignee-select"
                    className="form-input form-select"
                    value={reassignToUid}
                    onChange={(e) => setReassignToUid(e.target.value)}
                    required
                  >
                    <option value="">Select Assignee...</option>
                    {users
                      .filter(u => u.id !== currentUser?.uid && u.id !== selectedTask?.assignedTo)
                      .map(user => (
                        <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="reassign-reason-input">Reason for Reassignment</label>
                  <textarea
                    id="reassign-reason-input"
                    className="form-input"
                    rows={3}
                    placeholder="Provide reason for request to transfer this task..."
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReassignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT REASSIGNMENT DIALOG MODAL */}
      {showRejectReassignModal && (
        <div className="modal-overlay" onClick={() => setShowRejectReassignModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Reassignment Request</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRejectReassignModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRejectReassignment}>
              <div className="form-group">
                <label className="form-label required" htmlFor="reject-reassign-reason-input">Rejection Reason</label>
                <textarea
                  id="reject-reassign-reason-input"
                  className="form-input"
                  rows={3}
                  placeholder="Provide reason for rejecting transfer request..."
                  value={rejectReassignReason}
                  onChange={(e) => setRejectReassignReason(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectReassignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TasksPage;
