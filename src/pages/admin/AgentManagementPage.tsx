import React, { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { getUsers, updateUser } from '../../lib/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, UserCheck, X, ToggleLeft, ToggleRight,
  Mail, User, Phone, Edit3, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import type { User as UserType } from '../../types';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Min 6 characters'),
});
type FormData = z.infer<typeof schema>;

const editSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
});
type EditData = z.infer<typeof editSchema>;

const AgentManagementPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [agents, setAgents] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

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
    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
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
      toast.error(err.message || 'Failed to create agent');
    } finally {
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
          <h1 className="page-title">Agent Management</h1>
          <p className="page-subtitle">Manage your sales agents</p>
        </div>
        <button id="add-agent-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Add Agent
        </button>
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
        ) : (
          <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
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
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div className="avatar avatar-sm">{agent.name.charAt(0)}</div>
                        {editingId === agent.id ? (
                          <form onSubmit={editSubmit(onEdit)} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            <input {...editReg('name')} className="form-input text-sm" style={{ width: 140, padding: '4px 8px' }} />
                            <button type="submit" className="btn btn-sm btn-primary" style={{ padding: '4px 8px' }}><Check size={12} /></button>
                            <button type="button" className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditingId(null)}><X size={12} /></button>
                          </form>
                        ) : (
                          <span className="font-medium text-sm">{agent.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-sm text-secondary">{agent.email}</td>
                    <td className="text-sm text-secondary">{agent.phone || '—'}</td>
                    <td>
                      <span className={`badge ${agent.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{format(agent.createdAt, 'dd MMM yyyy')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(agent)}>
                          <Edit3 size={14} />
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
        )}
      </div>

      {/* Add Agent Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Agent</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowModal(false); reset(); }}><X size={20} /></button>
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
                <input id="agent-password" type="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="min 6 characters" {...register('password')} />
                {errors.password && <span className="form-error">{errors.password.message}</span>}
              </div>
              <div className="modal-footer" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); reset(); }}>Cancel</button>
                <button id="create-agent-submit" type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating…</> : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagementPage;
