import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getAuth,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { db, firebaseConfig } from '../../lib/firebase';
import { getUsers, updateUser } from '../../lib/firestore';
import { setDoc, doc } from 'firebase/firestore';
import { logActivity } from '../../lib/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, UserCog, X, ToggleLeft, ToggleRight, Mail, User, Lock } from 'lucide-react';
import { format } from 'date-fns';
import type { User as UserType } from '../../types';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(8, 'Min 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Requires uppercase, lowercase, number, and special character'),
});
type FormData = z.infer<typeof schema>;

const AdminManagementPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [admins, setAdmins] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await getUsers('admin');
      setAdmins(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAdmins(); }, []);

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
        role: 'admin',
        status: 'active',
        phone: '',
        createdAt: new Date(),
      });

      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'admin_created',
        entityType: 'user',
        entityId: cred.user.uid,
        entityName: data.name,
      });

      toast.success(`Admin ${data.name} created`);
      setShowModal(false);
      reset();
      loadAdmins();
    } catch (err: any) {
      console.error('Failed to create admin:', err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('This email is already in use by another agent or admin.');
      } else {
        toast.error(err.message || 'Failed to create admin');
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

  const toggleStatus = async (admin: UserType) => {
    const newStatus = admin.status === 'active' ? 'disabled' : 'active';
    await updateUser(admin.id, { status: newStatus });
    await logActivity({
      userId: currentUser!.uid,
      userName: userProfile?.name,
      action: newStatus === 'active' ? 'admin_enabled' : 'admin_disabled',
      entityType: 'user',
      entityId: admin.id,
      entityName: admin.name,
    });
    toast.success(`Admin ${newStatus}`);
    loadAdmins();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Admin Management</h1>
          <p className="page-subtitle">Manage system administrators</p>
        </div>
        <button id="add-admin-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> <span className="desktop-only">Add Admin</span>
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : admins.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><UserCog size={28} /></div>
            <h3 className="empty-state-title">No Admins Found</h3>
            <p className="empty-state-desc">Create the first admin account.</p>
          </div>
        ) : (
          <>
            {/* Desktop View Table */}
            <div className="table-wrapper table-responsive-stack desktop-only" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id}>
                      <td data-label="Admin">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div className="avatar avatar-sm">{admin.name.charAt(0)}</div>
                          <span className="font-medium text-sm">{admin.name}</span>
                        </div>
                      </td>
                      <td className="text-sm text-secondary" data-label="Email">{admin.email}</td>
                      <td data-label="Status">
                        <span className={`badge ${admin.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {admin.status}
                        </span>
                      </td>
                      <td className="text-sm text-muted" data-label="Created">{format(admin.createdAt, 'dd MMM yyyy')}</td>
                      <td data-label="Actions">
                        <button
                          className={`btn btn-sm ${admin.status === 'active' ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => toggleStatus(admin)}
                        >
                          {admin.status === 'active'
                            ? <><ToggleLeft size={14} /> Disable</>
                            : <><ToggleRight size={14} /> Enable</>
                          }
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View Cards */}
            <div className="mobile-only" style={{ padding: 'var(--space-4) var(--space-3)' }}>
              {admins.map((admin) => (
                <div 
                  key={admin.id}
                  className="mobile-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="avatar avatar-sm">{admin.name.charAt(0)}</div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{admin.name}</div>
                        <span className="text-xs text-muted" style={{ display: 'block', marginTop: 2 }}>
                          Created: {format(admin.createdAt, 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                    <span className={`badge ${admin.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {admin.status}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)' }}>
                    <div className="text-xs text-secondary">
                      <span className="text-muted">Email: </span>{admin.email}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      className={`btn btn-sm ${admin.status === 'active' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleStatus(admin)}
                      style={{ minHeight: 32 }}
                    >
                      {admin.status === 'active'
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

      {/* Add Admin Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Admin</h2>
              <button className="btn btn-ghost btn-icon" type="button" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="admin-name">Full Name</label>
                <div className="search-wrapper">
                  <User className="search-icon" size={16} />
                  <input id="admin-name" type="text" className={`form-input ${errors.name ? 'error' : ''}`} style={{ paddingLeft: '2.5rem' }} placeholder="Admin name" {...register('name')} />
                </div>
                {errors.name && <span className="form-error">{errors.name.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="admin-email">Email</label>
                <div className="search-wrapper">
                  <Mail className="search-icon" size={16} />
                  <input id="admin-email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} style={{ paddingLeft: '2.5rem' }} placeholder="admin@company.com" {...register('email')} />
                </div>
                {errors.email && <span className="form-error">{errors.email.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="admin-password">Password</label>
                <div className="search-wrapper">
                  <Lock className="search-icon" size={16} />
                  <input id="admin-password" type="password" className={`form-input ${errors.password ? 'error' : ''}`} style={{ paddingLeft: '2.5rem' }} placeholder="min 8 chars, 1 upper, 1 special" {...register('password')} />
                </div>
                {errors.password && <span className="form-error">{errors.password.message}</span>}
              </div>
              <div className="modal-footer" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button id="create-admin-submit" type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating…</> : 'Create Admin'}
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

export default AdminManagementPage;
