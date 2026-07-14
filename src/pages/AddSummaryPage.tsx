import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft, FileText, Mic, DollarSign, Upload, X, CheckCircle,
} from 'lucide-react';
import { createSummary, logActivity, createPayment } from '../lib/firestore';
import { uploadFile, generateStoragePath } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const schema = z.object({
  summaryText: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid', 'failed', '']).optional(),
  transactionId: z.string().optional(),
  paymentNotes: z.string().optional(),
}).refine(data => {
  if (data.paymentAmount && !data.paymentStatus) return false;
  return true;
}, {
  message: "Select a payment status",
  path: ["paymentStatus"]
}).refine(data => {
  if (data.paymentAmount && parseFloat(data.paymentAmount) < 0) return false;
  return true;
}, {
  message: "Amount cannot be negative",
  path: ["paymentAmount"]
});
type FormData = z.infer<typeof schema>;

const AddSummaryPage: React.FC = () => {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const { currentUser, userProfile } = useAuth();

  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentStatus: '' },
  });

  const handleBack = () => {
    const hasUnsavedChanges = isDirty || documents.length > 0 || voiceFile !== null || paymentScreenshot !== null;
    if (hasUnsavedChanges) {
      setShowConfirmModal(true);
    } else {
      navigate(-1);
    }
  };

  const handleDiscard = () => {
    setShowConfirmModal(false);
    navigate(-1);
  };

  const handleSaveConfirm = () => {
    setShowConfirmModal(false);
    handleSubmit(onSubmit)();
  };

  // Voice dropzone
  const { getRootProps: voiceRootProps, getInputProps: voiceInputProps, isDragActive: voiceDrag } = useDropzone({
    onDrop: (f) => f[0] && setVoiceFile(f[0]),
    accept: { 'audio/*': [] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  // Documents dropzone
  const { getRootProps: docsRootProps, getInputProps: docsInputProps, isDragActive: docsDrag } = useDropzone({
    onDrop: (f) => setDocuments((prev) => [...prev, ...f]),
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  });

  // Screenshot dropzone
  const { getRootProps: screenshotRootProps, getInputProps: screenshotInputProps } = useDropzone({
    onDrop: (f) => f[0] && setPaymentScreenshot(f[0]),
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const onSubmit = async (data: FormData) => {
    if (!currentUser || !clientId) return;
    setUploading(true);
    try {
      let voiceUrl = '';
      let screenshotUrl = '';
      const uploadedDocs: { name: string; url: string; type: string; size: number }[] = [];

      interface UploadItem {
        key: string;
        file: File;
        path: string;
      }
      const uploads: UploadItem[] = [];
      if (voiceFile) {
        uploads.push({ key: 'voice', file: voiceFile, path: generateStoragePath('voice', voiceFile.name) });
      }
      if (paymentScreenshot) {
        uploads.push({ key: 'screenshot', file: paymentScreenshot, path: generateStoragePath('payments', paymentScreenshot.name) });
      }
      documents.forEach((doc, index) => {
        uploads.push({ key: `doc_${index}`, file: doc, path: generateStoragePath('documents', doc.name) });
      });

      if (uploads.length > 0) {
        const totalUploads = uploads.length;
        const progressTracker = new Array(totalUploads).fill(0);

        const uploadPromises = uploads.map(async (item, index) => {
          const url = await uploadFile(item.file, item.path, (p) => {
            progressTracker[index] = p;
            const totalProgress = progressTracker.reduce((sum, val) => sum + val, 0) / totalUploads;
            setUploadProgress(totalProgress);
          });
          return { ...item, url };
        });

        const results = await Promise.all(uploadPromises);

        results.forEach((res) => {
          if (res.key === 'voice') {
            voiceUrl = res.url;
          } else if (res.key === 'screenshot') {
            screenshotUrl = res.url;
          } else if (res.key.startsWith('doc_')) {
            uploadedDocs.push({
              name: res.file.name,
              url: res.url,
              type: res.file.type,
              size: res.file.size,
            });
          }
        });
      }

      setUploading(false);

      const paymentDetails = data.paymentStatus ? {
        amount: data.paymentAmount ? parseFloat(data.paymentAmount) : undefined,
        status: data.paymentStatus || undefined,
        screenshotUrl: screenshotUrl || undefined,
        transactionId: data.transactionId || undefined,
        notes: data.paymentNotes || undefined,
      } : undefined;

      const summaryId = await createSummary({
        clientId: clientId,
        summaryText: data.summaryText || '',
        voiceUrl: voiceUrl || undefined,
        documents: uploadedDocs,
        paymentDetails,
        createdBy: currentUser.uid,
        createdByName: userProfile?.name,
      });

      // Also create payment record if payment info provided
      if (paymentDetails && data.paymentAmount) {
        await createPayment({
          clientId,
          amount: parseFloat(data.paymentAmount),
          screenshotUrl: screenshotUrl || '',
          transactionId: data.transactionId || '',
          notes: data.paymentNotes || '',
          status: data.paymentStatus || 'pending',
          createdBy: currentUser.uid,
        });
      }

      await logActivity({
        userId: currentUser.uid,
        userName: userProfile?.name,
        action: 'summary_added',
        entityType: 'summary',
        entityId: summaryId,
        entityName: `Summary for client`,
      });

      if (paymentDetails) {
        await logActivity({
          userId: currentUser.uid,
          userName: userProfile?.name,
          action: 'payment_updated',
          entityType: 'payment',
          entityId: summaryId,
          entityName: `₹${data.paymentAmount || 0} - ${data.paymentStatus}`,
        });
      }

      setSubmitted(true);
      toast.success('Summary added successfully!');
    } catch (err: any) {
      console.error("Failed to save summary:", err);
      const errMsg = (err?.code?.startsWith('storage/') || err?.message?.toLowerCase().includes('storage'))
        ? 'Upload failed: Please make sure Firebase Storage is initialized in the Console and CORS is configured.'
        : (err?.message || 'Failed to save summary');
      toast.error(errMsg);
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 'var(--space-10)' }}>
          <div style={{
            width: 72, height: 72,
            background: 'var(--color-success-light)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-5)', color: 'var(--color-success)',
          }}>
            <CheckCircle size={36} />
          </div>
          <h2 style={{ marginBottom: 'var(--space-3)' }}>Summary Saved!</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-6)' }}>
            The call summary has been attached to this client's history.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate(isAdminPath ? `/admin/clients/${clientId}` : `/clients/${clientId}`, { replace: true, state: { fromForm: true } })}>
              View Client
            </button>
            <button className="btn btn-primary" onClick={() => navigate(isAdminPath ? '/admin/clients' : '/')}>
              {isAdminPath ? 'Clients' : 'Dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', padding: '16px 24px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button type="button" className="btn btn-ghost btn-icon" onClick={handleBack} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1 className="page-title">Add Summary</h1>
            <p className="page-subtitle">Record call notes, documents, and payment details</p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={handleBack} aria-label="Close form">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Summary Text */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
              <FileText size={18} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Summary Notes</h3>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="summary-text">Summary Text</label>
            <textarea
              id="summary-text"
              className={`form-input ${errors.summaryText ? 'error' : ''}`}
              style={{ resize: 'vertical', minHeight: 140 }}
              placeholder="Describe the call, discussion points, outcomes…"
              {...register('summaryText')}
            />
            {errors.summaryText && <span className="form-error">{errors.summaryText.message}</span>}
          </div>
        </div>

        {/* Voice Recording */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-danger)' }}>
              <Mic size={18} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Voice Recording</h3>
            <span className="badge badge-muted text-xs" style={{ marginLeft: 'auto' }}>Optional</span>
          </div>

          {voiceFile ? (
            <div className="file-preview-item">
              <div className="file-preview-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}><Mic size={16} /></div>
              <div style={{ flex: 1 }}>
                <div className="text-sm font-medium">{voiceFile.name}</div>
                <div className="text-xs text-muted">{(voiceFile.size / (1024 * 1024)).toFixed(2)} MB</div>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setVoiceFile(null)}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div {...voiceRootProps()} className={`dropzone ${voiceDrag ? 'active' : ''}`}>
              <input {...voiceInputProps()} id="voice-upload" />
              <Mic size={24} style={{ margin: '0 auto var(--space-2)' }} />
              <p className="text-sm font-medium">Upload voice recording</p>
              <p className="text-xs text-muted">MP3, WAV, M4A up to 50MB</p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-info)' }}>
              <Upload size={18} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Documents</h3>
            <span className="badge badge-muted text-xs" style={{ marginLeft: 'auto' }}>Optional</span>
          </div>

          <div {...docsRootProps()} className={`dropzone ${docsDrag ? 'active' : ''}`} style={{ marginBottom: documents.length ? 'var(--space-3)' : 0 }}>
            <input {...docsInputProps()} id="documents-upload" />
            <Upload size={24} style={{ margin: '0 auto var(--space-2)' }} />
            <p className="text-sm font-medium">Drag & drop files or click to browse</p>
            <p className="text-xs text-muted">PDF, Word, Excel, Images up to 20MB each</p>
          </div>

          {documents.length > 0 && (
            <div className="file-preview-list">
              {documents.map((doc, i) => (
                <div key={i} className="file-preview-item">
                  <div className="file-preview-icon"><FileText size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm font-medium truncate">{doc.name}</div>
                    <div className="text-xs text-muted">{(doc.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setDocuments((d) => d.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Details */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-success-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)' }}>
              <DollarSign size={18} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Payment Details</h3>
            <span className="badge badge-muted text-xs" style={{ marginLeft: 'auto' }}>Optional</span>
          </div>

          <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="payment-amount">Amount (₹)</label>
              <input
                id="payment-amount"
                type="number"
                min="0"
                step="0.01"
                className={`form-input ${errors.paymentAmount ? 'error' : ''}`}
                placeholder="0.00"
                {...register('paymentAmount')}
              />
              {errors.paymentAmount && <span className="form-error">{errors.paymentAmount.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="payment-status">Payment Status</label>
              <select
                id="payment-status"
                className={`form-input form-select ${errors.paymentStatus ? 'error' : ''}`}
                {...register('paymentStatus')}
              >
                <option value="">Select status</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
              {errors.paymentStatus && <span className="form-error">{errors.paymentStatus.message}</span>}
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Payment Screenshot</label>
              {paymentScreenshot ? (
                <div className="file-preview-item">
                  <div className="file-preview-icon"><Upload size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="text-sm font-medium">{paymentScreenshot.name}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setPaymentScreenshot(null)}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div {...screenshotRootProps()} className="dropzone" style={{ padding: 'var(--space-4)' }}>
                  <input {...screenshotInputProps()} id="payment-screenshot" />
                  <Upload size={20} style={{ margin: '0 auto var(--space-1)' }} />
                  <p className="text-sm">Upload payment screenshot</p>
                </div>
              )}
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="payment-notes">Payment Notes</label>
              <textarea
                id="payment-notes"
                className="form-input"
                style={{ resize: 'vertical', minHeight: 72 }}
                placeholder="Any notes about this payment…"
                {...register('paymentNotes')}
              />
            </div>
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div style={{ padding: 'var(--space-4)', background: 'var(--color-accent-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <span className="text-sm font-medium text-accent">Uploading files…</span>
              <span className="text-sm text-accent">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={handleBack}>
            Cancel
          </button>
          <button
            id="add-summary-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isSubmitting || uploading}
          >
            {isSubmitting || uploading
              ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Saving…</>
              : 'Save Summary'}
          </button>
        </div>
      </form>

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
              <button type="button" className="btn btn-secondary" onClick={handleDiscard}>
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

export default AddSummaryPage;
