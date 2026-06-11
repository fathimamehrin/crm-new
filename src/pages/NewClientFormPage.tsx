import React, { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { Upload, User, Phone, Mail, MapPin, FileText, ArrowLeft } from 'lucide-react';
import { createClient } from '../lib/firestore';
import { uploadFile, generateStoragePath } from '../lib/storage';
import { logActivity } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  whatsappNumber: z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternateContact: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const NewClientFormPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const prefilledNumber = (location.state as any)?.whatsappNumber || '';

  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { whatsappNumber: prefilledNumber },
  });

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setProfileImage(files[0]);
      setPreviewUrl(URL.createObjectURL(files[0]));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const onSubmit = async (data: FormData) => {
    if (!currentUser) return;
    try {
      let profileImageUrl = '';
      if (profileImage) {
        setUploading(true);
        const path = generateStoragePath('profiles', profileImage.name);
        profileImageUrl = await uploadFile(profileImage, path, setUploadProgress);
        setUploading(false);
      }

      const isAgent = userProfile?.role === 'agent';
      const clientId = await createClient({
        name: data.name,
        whatsappNumber: data.whatsappNumber,
        email: data.email || '',
        alternateContact: data.alternateContact || '',
        address: data.address || '',
        notes: data.notes || '',
        profileImage: profileImageUrl,
        status: 'active',
        assignedAgent: isAgent ? currentUser.uid : '',
        assignedAgentName: isAgent ? (userProfile?.name || '') : '',
        createdBy: currentUser.uid,
      });

      await logActivity({
        userId: currentUser.uid,
        userName: userProfile?.name,
        action: 'client_created',
        entityType: 'client',
        entityId: clientId,
        entityName: data.name,
      });

      toast.success('Client created successfully!');
      navigate(`/clients/${clientId}/summary`, { state: { isNew: true } });
    } catch (err) {
      toast.error('Failed to create client');
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', padding: '16px 24px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={20} />
        </button>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">New Client</h1>
          <p className="page-subtitle">Fill in the client's information below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Profile Image */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-base)' }}>
            Profile Photo
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
            <div className="avatar avatar-xl">
              {previewUrl ? <img src={previewUrl} alt="Preview" /> : <User size={32} />}
            </div>
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'active' : ''}`}
              style={{ flex: 1 }}
            >
              <input {...getInputProps()} id="profile-image-input" />
              <Upload size={24} style={{ margin: '0 auto var(--space-2)' }} />
              <p className="text-sm font-medium">
                {isDragActive ? 'Drop image here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>PNG, JPG up to 5MB</p>
            </div>
          </div>
          {uploading && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>Uploading {Math.round(uploadProgress)}%</p>
            </div>
          )}
        </div>

        {/* Client Info */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-base)' }}>
            Client Information
          </h3>
          <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
            {/* Full Name */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label required" htmlFor="client-name">Full Name</label>
              <div className="search-wrapper">
                <User className="search-icon" size={16} />
                <input
                  id="client-name"
                  type="text"
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="John Doe"
                  {...register('name')}
                />
              </div>
              {errors.name && <span className="form-error">{errors.name.message}</span>}
            </div>

            {/* WhatsApp */}
            <div className="form-group">
              <label className="form-label required" htmlFor="client-whatsapp">WhatsApp Number</label>
              <div className="search-wrapper">
                <Phone className="search-icon" size={16} />
                <input
                  id="client-whatsapp"
                  type="tel"
                  className={`form-input ${errors.whatsappNumber ? 'error' : ''}`}
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="10 digits"
                  maxLength={10}
                  {...register('whatsappNumber')}
                />
              </div>
              {errors.whatsappNumber && <span className="form-error">{errors.whatsappNumber.message}</span>}
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="client-email">Email</label>
              <div className="search-wrapper">
                <Mail className="search-icon" size={16} />
                <input
                  id="client-email"
                  type="email"
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="optional"
                  {...register('email')}
                />
              </div>
              {errors.email && <span className="form-error">{errors.email.message}</span>}
            </div>

            {/* Alternate Contact */}
            <div className="form-group">
              <label className="form-label" htmlFor="client-alt-contact">Alternate Contact</label>
              <input
                id="client-alt-contact"
                type="tel"
                className="form-input"
                placeholder="optional"
                {...register('alternateContact')}
              />
            </div>

            {/* Address */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="client-address">Address</label>
              <div className="search-wrapper">
                <MapPin className="search-icon" size={16} style={{ top: '14px', transform: 'none' }} />
                <textarea
                  id="client-address"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', resize: 'vertical', minHeight: 80 }}
                  placeholder="Full address"
                  {...register('address')}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="client-notes">Notes</label>
              <div className="search-wrapper">
                <FileText className="search-icon" size={16} style={{ top: '14px', transform: 'none' }} />
                <textarea
                  id="client-notes"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', resize: 'vertical', minHeight: 80 }}
                  placeholder="Any additional notes…"
                  {...register('notes')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button
            id="new-client-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isSubmitting || uploading}
          >
            {isSubmitting ? (
              <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Saving…</>
            ) : 'Save & Add Summary'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewClientFormPage;
