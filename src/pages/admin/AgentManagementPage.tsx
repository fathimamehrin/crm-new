import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { db, firebaseConfig, auth } from '../../lib/firebase';
import { getUsers, updateUser } from '../../lib/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, UserCheck, X, ToggleLeft, ToggleRight,
  Mail, User, Phone, Edit3, Check, Search, Key,
} from 'lucide-react';
import { format } from 'date-fns';
import type { User as UserType } from '../../types';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  password: z.string()
    .min(8, 'password must be atleast 8 characters ')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Requires uppercase, lowercase, number, and special character'),
});
type FormData = z.infer<typeof schema>;

const editSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
});
type EditData = z.infer<typeof editSchema>;

const AgentManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const [agents, setAgents] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);

  const handleResetPassword = async (agent: UserType) => {
    if (!window.confirm(`Are you sure you want to send a password reset email to ${agent.name} (${agent.email})?`)) {
      return;
    }
    setResettingPasswordId(agent.id);
    try {
      await sendPasswordResetEmail(auth, agent.email);
      toast.success(`Password reset email sent to ${agent.name}`);
    } catch (err: any) {
      console.error('Failed to send password reset email:', err);
      toast.error(err.message || 'Failed to send password reset email');
    } finally {
      setResettingPasswordId(null);
    }
  };

  const filteredAgents = agents.filter((agent) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      agent.name.toLowerCase().includes(q) ||
      agent.email.toLowerCase().includes(q) ||
      (agent.phone && agent.phone.toLowerCase().includes(q))
    );
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const handleCloseModal = () => {
    if (isDirty) {
      setShowConfirmModal(true);
    } else {
      setShowModal(false);
      reset();
    }
  };

  const handleDiscardConfirm = () => {
    setShowConfirmModal(false);
    setShowModal(false);
    reset();
  };

  const handleSaveConfirm = () => {
    setShowConfirmModal(false);
    handleSubmit(onSubmit)();
  };

  const { register: editReg, handleSubmit: editSubmit, setValue } = useForm<EditData>({
    resolver: zodResolver(editSchema),
  });

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await getUsers('agent');
      setAgents(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAgents(); }, []);

  const onSubmit = async (data: FormData) => {
    setCreating(true);
    let secondaryApp;
    try {
      const appName = 'SecondaryApp' + Date.now();
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
      await secondaryAuth.signOut();
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: data.name,
        email: data.email,
        phone: data.phone || '',
        role: 'agent',
        status: 'active',
        createdAt: new Date(),
      });

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'agent_created',
        entityType: 'user',
        entityId: cred.user.uid,
        entityName: data.name,
      });

      toast.success(`Agent ${data.name} created`);
      setShowModal(false);
      reset();
      loadAgents();
    } catch (err: any) {
      console.error('Failed to create agent:', err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('This email is already in use by another agent or admin.');
      } else {
        toast.error(err.message || 'Failed to create agent');
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error('Failed to delete secondary app:', e);
        }
      }
      setCreating(false);
    }
  };

  const startEdit = (agent: UserType) => {
    setEditingId(agent.id);
    setValue('name', agent.name);
    setValue('phone', agent.phone || '');
  };

  const onEdit = async (data: EditData) => {
    if (!editingId) return;
    await updateUser(editingId, { name: data.name, phone: data.phone });
    await logActivity({
      userId: currentUser!.uid,
      userName: userProfile?.name,
      action: 'agent_updated',
      entityType: 'user',
      entityId: editingId,
      entityName: data.name,
    });
    toast.success('Agent updated');
    setEditingId(null);
    loadAgents();
  };

  const toggleStatus = async (agent: UserType) => {
    const newStatus = agent.status === 'active' ? 'disabled' : 'active';
    await updateUser(agent.id, { status: newStatus });
    await logActivity({
      userId: currentUser!.uid,
      userName: userProfile?.name,
      action: newStatus === 'active' ? 'agent_enabled' : 'agent_disabled',
      entityType: 'user',
      entityId: agent.id,
      entityName: agent.name,
    });
    toast.success(`Agent ${newStatus}`);
    loadAgents();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title ">Agent Management</h1>
          <p className="page-subtitle">Manage your sales agents</p>
        </div>
        <button id="add-agent-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> <span className="desktop-only">Add Agent</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '240px' }}>
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Search agents by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <select
            className="form-input form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
            aria-label="Filter by Status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>
      </div>
 
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><UserCheck size={28} /></div>
            <h3 className="empty-state-title">No Agents Yet</h3>
            <p className="empty-state-desc">Add agents to assign clients and track their activity.</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><UserCheck size={28} /></div>
            <h3 className="empty-state-title">No Matching Agents</h3>
            <p className="empty-state-desc">No agents matched your search query "{searchQuery}".</p>
          </div>
        ) : (
          <>
            {/* Desktop View Table */}
            <div className="table-wrapper table-responsive-stack desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => (
                    <tr 
                      key={agent.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (editingId !== agent.id && !target.closest('button') && !target.closest('a') && !target.closest('input')) {
                          navigate(`/admin/agents/${agent.id}`);
                        }
                      }}
                      style={{ cursor: editingId === agent.id ? 'default' : 'pointer' }}
                    >
                      <td data-label="Agent">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="avatar avatar-sm">{agent.name.charAt(0)}</div>
                          {editingId === agent.id ? (
                            <form onSubmit={editSubmit(onEdit)} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                              <input {...editReg('name')} className="form-input text-sm" style={{ width: 140, padding: '4px 8px' }} />
                              <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '4px 8px' }}><Check size={12} /></button>
                              <button type="button" className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditingId(null)}><X size={12} /></button>
                            </form>
                          ) : (
                            <Link to={`/admin/agents/${agent.id}`} className="font-semibold text-sm text-accent hover:underline">
                              {agent.name}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-secondary" data-label="Email">{agent.email}</td>
                      <td className="text-sm text-secondary" data-label="Phone">{agent.phone || '—'}</td>
                      <td data-label="Status">
                        <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="text-sm text-muted" data-label="Created">{format(agent.createdAt, 'dd MMM yyyy')}</td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(agent)} aria-label="Edit agent">
                            <Edit3 size={14} />
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm" 
                            onClick={() => handleResetPassword(agent)} 
                            title="Reset Password"
                            aria-label="Reset Password"
                            disabled={resettingPasswordId === agent.id}
                            style={{ padding: '6px' }}
                          >
                            <Key size={14} />
                          </button>
                          <button
                            className={`btn btn-sm ${agent.status === 'active' ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => toggleStatus(agent)}
                          >
                            {agent.status === 'active'
                              ? <><ToggleLeft size={14} /> Disable</>
                              : <><ToggleRight size={14} /> Enable</>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View Cards */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {filteredAgents.map((agent) => (
                <div 
                  key={agent.id}
                  className="mobile-card"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (editingId !== agent.id && !target.closest('button') && !target.closest('a') && !target.closest('input')) {
                      navigate(`/admin/agents/${agent.id}`);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="avatar avatar-sm">{agent.name.charAt(0)}</div>
                      <div>
                        {editingId === agent.id ? (
                          <form onSubmit={editSubmit(onEdit)} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            <input {...editReg('name')} className="form-input text-sm" style={{ width: 140, padding: '4px 8px' }} />
                            <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '4px 8px' }}><Check size={12} /></button>
                            <button type="button" className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditingId(null)}><X size={12} /></button>
                          </form>
                        ) : (
                          <Link to={`/admin/agents/${agent.id}`} className="font-semibold text-sm text-accent hover:underline">
                            {agent.name}
                          </Link>
                        )}
                        <span className="text-xs text-muted" style={{ display: 'block', marginTop: 2 }}>
                          Created: {format(agent.createdAt, 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                    <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {agent.status}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="text-xs text-secondary">
                      <span className="text-muted">Email: </span>{agent.email}
                    </div>
                    <div className="text-xs text-secondary">
                      <span className="text-muted">Phone: </span>{agent.phone || '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(agent)} aria-label="Edit agent">
                      <Edit3 size={14} /> <span style={{ marginLeft: 4 }}>Edit</span>
                    </button>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      onClick={() => handleResetPassword(agent)} 
                      disabled={resettingPasswordId === agent.id}
                      style={{ minHeight: 32 }}
                    >
                      <Key size={14} /> <span style={{ marginLeft: 4 }}>Reset PW</span>
                    </button>
                    <button
                      className={`btn btn-sm ${agent.status === 'active' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleStatus(agent)}
                      style={{ minHeight: 32 }}
                    >
                      {agent.status === 'active'
                        ? <><ToggleLeft size={14} /> Disable</>
                        : <><ToggleRight size={14} /> Enable</>
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Agent Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Agent</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="agent-name">Full Name</label>
                <div className="search-wrapper">
                  <User className="search-icon" size={16} />
                  <input id="agent-name" type="text" className={`form-input ${errors.name ? 'error' : ''}`} style={{ paddingLeft: '2.5rem' }} {...register('name')} />
                </div>
                {errors.name && <span className="form-error">{errors.name.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="agent-email">Email</label>
                <div className="search-wrapper">
                  <Mail className="search-icon" size={16} />
                  <input id="agent-email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} style={{ paddingLeft: '2.5rem' }} {...register('email')} />
                </div>
                {errors.email && <span className="form-error">{errors.email.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="agent-phone">Phone</label>
                <div className="search-wrapper">
                  <Phone className="search-icon" size={16} />
                  <input id="agent-phone" type="tel" className="form-input" style={{ paddingLeft: '2.5rem' }} {...register('phone')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="agent-password">Temporary Password</label>
                <input
                    id="agent-password"
                    type="password"
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter password"
                    autoComplete="new-password"
                    {...register('password', {
                      required: 'Password is required',
                    })}
                  />
      
                {errors.password?.message && <span className="form-error">{errors.password.message}</span>}
              </div>
              <div className="modal-footer" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button id="create-agent-submit" type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating…</> : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header" style={{ marginBottom: 'var(--space-3)' }}>
              <h2 className="modal-title" style={{ fontSize: 'var(--font-size-lg)' }}>Unsaved Changes</h2>
            </div>
            <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-6)' }}>
              You have unsaved changes. Do you want to save them before leaving?
            </p>
            <div className="modal-footer" style={{ marginTop: 0, paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-secondary" onClick={handleDiscardConfirm}>
                Discard
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
                Keep Editing
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveConfirm}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagementPage;
