import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { Upload, User, Phone, Mail, FileText, ArrowLeft, Mic, DollarSign, X, Folder } from 'lucide-react';
import { createClient, createSummary, createPayment, getClientByWhatsApp, updateClient, getTags, getClientStatuses, getLeadSources } from '../lib/firestore';
import { uploadFile, generateStoragePath } from '../lib/storage';
import { logActivity } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import type { Tag, CustomStatus, LeadSource } from '../types';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  countryCode: z.string(),
  whatsappNumber: z.string()
    .min(4, 'WhatsApp number is too short')
    .max(15, 'WhatsApp number is too long')
    .regex(/^\d+$/, 'Must contain only digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternateContact: z.string().optional(),
  notes: z.string().optional(),
  summaryText: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid', 'failed', '']).optional(),
  transactionId: z.string().optional(),
  paymentNotes: z.string().optional(),
  createdAt: z.string().optional(),
  projectName: z.string().optional(),
  status: z.string().optional(),
  leadSource: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// Helper to parse WhatsApp phone numbers gracefully supporting international formats & copy-paste cleaning
const parseWhatsAppNumber = (rawText: string) => {
  const clean = rawText.trim().replace(/[^\d+]/g, '');
  const possibleCodes = ['+91', '+1', '+44', '+971', '+966', '+61', '+65', '+968', '+974', '+965', '+973'];

  for (const code of possibleCodes) {
    if (clean.startsWith(code)) {
      return {
        countryCode: code,
        digits: clean.substring(code.length),
      };
    }
  }

  for (const code of possibleCodes) {
    const codeWithoutPlus = code.replace('+', '');
    if (clean.startsWith(codeWithoutPlus) && clean.length > codeWithoutPlus.length + 3) {
      return {
        countryCode: code,
        digits: clean.substring(codeWithoutPlus.length),
      };
    }
  }

  if (clean.startsWith('0') && clean.length > 5) {
    return {
      countryCode: null,
      digits: clean.substring(1),
    };
  }

  return {
    countryCode: null,
    digits: clean.replace('+', ''),
  };
};

const NewClientFormPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const prefilledNumber = (location.state as any)?.whatsappNumber || '';
  const prefilledCountryCode = (location.state as any)?.countryCode || '+91';

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [documents, setDocuments] = useState<File[]>([]);
  const [addSummary, setAddSummary] = useState(false);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);

  useEffect(() => {
    getTags().then(tags => {
      setAllTags(tags.filter(t => t.status === 'active'));
    }).catch(err => {
      console.error('Failed to load tags:', err);
    });

    getClientStatuses().then(list => {
      setCustomStatuses(list);
    }).catch(err => {
      console.error('Failed to load custom statuses:', err);
    });

    getLeadSources().then(list => {
      setLeadSources(list.filter(s => s.status === 'active'));
    }).catch(err => {
      console.error('Failed to load lead sources:', err);
    });
  }, []);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      whatsappNumber: prefilledNumber,
      countryCode: prefilledCountryCode,
      paymentStatus: '',
      createdAt: new Date().toISOString().substring(0, 10),
      projectName: '',
      status: 'Active',
      leadSource: '',
    },
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



  const {
    getRootProps: getDocsRootProps,
    getInputProps: getDocsInputProps,
    isDragActive: isDocsDragActive
  } = useDropzone({
    onDrop: (files) => setDocuments((prev) => [...prev, ...files]),
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  });

  const {
    getRootProps: getVoiceRootProps,
    getInputProps: getVoiceInputProps,
    isDragActive: isVoiceDragActive
  } = useDropzone({
    onDrop: (files) => files[0] && setVoiceFile(files[0]),
    accept: { 'audio/*': [] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const {
    getRootProps: getScreenshotRootProps,
    getInputProps: getScreenshotInputProps
  } = useDropzone({
    onDrop: (files) => files[0] && setPaymentScreenshot(files[0]),
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const onSubmit = async (data: FormData) => {
    if (!currentUser) return;

    let existing: any = null;
    const fullWhatsAppNumber = data.countryCode + data.whatsappNumber;
    try {
      existing = await getClientByWhatsApp(fullWhatsAppNumber);
    } catch (err) {
      console.error(err);
      toast.error('Error checking WhatsApp number');
      return;
    }

    if (addSummary) {
      if (data.paymentAmount && !data.paymentStatus) {
        toast.error('Please select a payment status');
        return;
      }
      if (data.paymentAmount && parseFloat(data.paymentAmount) < 0) {
        toast.error('Amount cannot be negative');
        return;
      }
    }

    try {
      interface UploadItem {
        key: string;
        file: File;
        path: string;
      }
      const uploads: UploadItem[] = [];

      if (voiceFile && addSummary) {
        uploads.push({ key: 'voice', file: voiceFile, path: generateStoragePath('voice', voiceFile.name) });
      }
      if (paymentScreenshot && addSummary) {
        uploads.push({ key: 'screenshot', file: paymentScreenshot, path: generateStoragePath('payments', paymentScreenshot.name) });
      }
      documents.forEach((doc, index) => {
        uploads.push({ key: `doc_${index}`, file: doc, path: generateStoragePath('documents', doc.name) });
      });

      let voiceUrl = '';
      let screenshotUrl = '';
      const uploadedDocs: { name: string; url: string; type: string; size: number }[] = [];

      if (uploads.length > 0) {
        setUploading(true);
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
        setUploading(false);

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

      const isAdmin = userProfile?.role === 'admin';
      const isAgent = userProfile?.role === 'agent';
      let clientId = '';

      if (existing) {
        clientId = existing.id;
        const mergedNotes = data.notes 
          ? (existing.notes ? `${existing.notes}\n\n${data.notes}` : data.notes)
          : (existing.notes || '');

        if (isAdmin) {
          await updateClient(clientId, {
            name: data.name,
            email: data.email || existing.email || '',
            alternateContact: data.alternateContact || existing.alternateContact || '',
            notes: mergedNotes,
          });
          await logActivity({
            userId: currentUser.uid,
            userName: userProfile?.name,
            action: 'client_updated',
            entityType: 'client',
            entityId: clientId,
            entityName: data.name,
          });
          toast.success('Existing client details updated.');
        } else {
          toast.success('Existing client found. Redirecting to profile...');
        }
      } else {
        let selectedDate = new Date();
        if (data.createdAt) {
          const parts = data.createdAt.split('-');
          if (parts.length === 3) {
            selectedDate.setFullYear(parseInt(parts[0], 10));
            selectedDate.setMonth(parseInt(parts[1], 10) - 1);
            selectedDate.setDate(parseInt(parts[2], 10));
          }
        }
        const now = new Date();
        clientId = await createClient({
          name: data.name,
          whatsappNumber: data.countryCode + data.whatsappNumber,
          email: data.email || '',
          alternateContact: data.alternateContact || '',
          address: '',
          notes: data.notes || '',
          profileImage: '',
          status: data.status || 'active',
          assignedAgent: (isAgent || isAdmin) ? currentUser.uid : '',
          assignedAgentName: (isAgent || isAdmin) ? (userProfile?.name || '') : '',
          createdBy: currentUser.uid,
          tags: selectedTags,
          createdAt: selectedDate,
          addedByAgentAt: now,
          assignedAt: (isAgent || isAdmin) ? now : undefined,
          projectName: data.projectName || '',
          leadSource: data.leadSource || '',
        });

        await logActivity({
          userId: currentUser.uid,
          userName: userProfile?.name,
          action: 'client_created',
          entityType: 'client',
          entityId: clientId,
          entityName: data.name,
        });
        toast.success('New client created successfully.');
      }

      const hasSummary = addSummary || uploadedDocs.length > 0;
      let summaryId = '';
      if (hasSummary) {
        const paymentDetails = (addSummary && data.paymentStatus) ? {
          amount: data.paymentAmount ? parseFloat(data.paymentAmount) : undefined,
          status: data.paymentStatus || undefined,
          screenshotUrl: screenshotUrl || undefined,
          transactionId: data.transactionId || undefined,
          notes: data.paymentNotes || undefined,
        } : undefined;

        summaryId = await createSummary({
          clientId: clientId,
          summaryText: addSummary ? (data.summaryText || '') : 'Uploaded documents on client registration',
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
      }

      navigate(isAdmin ? `/admin/clients/${clientId}` : `/clients/${clientId}`);
    } catch (err: any) {
      console.error(err);
      const errMsg = (err?.code?.startsWith('storage/') || err?.message?.toLowerCase().includes('storage'))
        ? 'Upload failed: Please make sure Firebase Storage is initialized in the Console and CORS is configured.'
        : 'Failed to create client';
      toast.error(errMsg);
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', padding: '16px 24px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button type="button" className="btn btn-ghost btn-icon" onClick={handleBack} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1 className="page-title">New Client</h1>
            <p className="page-subtitle">Fill in the client's information below</p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={handleBack} aria-label="Close form">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>


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

            {/* Project Name */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="client-project-name">Project Name / Context</label>
              <div className="search-wrapper">
                <Folder className="search-icon" size={16} />
                <input
                  id="client-project-name"
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="e.g. Downtown Residency, commercial purchase, candidate hiring"
                  {...register('projectName')}
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div className="form-group">
              <label className="form-label required" htmlFor="client-whatsapp">WhatsApp Number</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  id="whatsapp-country"
                  className="form-input form-select"
                  style={{ width: '90px', paddingRight: '20px' }}
                  {...register('countryCode')}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+971">+971</option>
                  <option value="+966">+966</option>
                  <option value="+61">+61</option>
                  <option value="+65">+65</option>
                  <option value="+968">+968</option>
                  <option value="+974">+974</option>
                  <option value="+965">+965</option>
                  <option value="+973">+973</option>
                </select>
                <div className="search-wrapper" style={{ flex: 1 }}>
                  <Phone className="search-icon" size={16} />
                  <input
                    id="client-whatsapp"
                    type="tel"
                    className={`form-input ${errors.whatsappNumber ? 'error' : ''}`}
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="Enter phone number"
                    maxLength={15}
                    {...register('whatsappNumber', {
                      onChange: (e) => {
                        const parsed = parseWhatsAppNumber(e.target.value);
                        if (parsed.countryCode) {
                          setValue('countryCode', parsed.countryCode, { shouldDirty: true, shouldValidate: true });
                        }
                        setValue('whatsappNumber', parsed.digits, { shouldDirty: true, shouldValidate: true });
                      }
                    })}
                    onPaste={(e) => {
                      const pastedText = e.clipboardData.getData('text');
                      const parsed = parseWhatsAppNumber(pastedText);
                      e.preventDefault();
                      if (parsed.countryCode) {
                        setValue('countryCode', parsed.countryCode, { shouldDirty: true, shouldValidate: true });
                      }
                      setValue('whatsappNumber', parsed.digits, { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                </div>
              </div>
              {errors.whatsappNumber && <span className="form-error">{errors.whatsappNumber.message}</span>}
            </div>



            {/* Lead Creation Date */}
            <div className="form-group">
              <label className="form-label" htmlFor="client-created-at">Lead Creation Date</label>
              <input
                id="client-created-at"
                type="date"
                className="form-input"
                {...register('createdAt')}
              />
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Defaults to today. Backdate this for historical entries.
              </p>
            </div>

            {/* Status */}
            <div className="form-group">
              <label className="form-label required" htmlFor="client-status-select">Status</label>
              <select
                id="client-status-select"
                className="form-input form-select"
                {...register('status')}
              >
                {customStatuses.filter(s => s.status === 'active').map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
 
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="client-lead-source">Lead Source</label>
              <select
                id="client-lead-source"
                className="form-input form-select"
                {...register('leadSource')}
              >
                <option value="">Select Lead Source (Optional)...</option>
                {leadSources.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Select the channel from which this lead originated.
              </p>
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

            {/* Tags / Labels */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Tags / Labels</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTags(selectedTags.filter(id => id !== tag.id));
                        } else {
                          setSelectedTags([...selectedTags, tag.id]);
                        }
                      }}
                      className={`tag-selectable-pill ${isSelected ? 'active' : ''}`}
                      style={isSelected ? {
                        backgroundColor: `${tag.color}1c`,
                        color: tag.color,
                        borderColor: tag.color,
                      } : {}}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {allTags.length === 0 && (
                  <span className="text-xs text-muted">No custom tags available. Manage tags in the Admin Panel.</span>
                )}
              </div>
            </div>

            {/* Client Files / Documents instead of Address */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Client Files / Documents (Optional)</label>
              <div {...getDocsRootProps()} className={`dropzone ${isDocsDragActive ? 'active' : ''}`} style={{ marginBottom: documents.length ? 'var(--space-3)' : 0 }}>
                <input {...getDocsInputProps()} id="documents-upload" />
                <Upload size={24} style={{ margin: '0 auto var(--space-2)' }} />
                <p className="text-sm font-medium">Drag & drop files or click to browse</p>
                <p className="text-xs text-muted">PDF, Word, Excel, Images up to 20MB each</p>
              </div>

              {documents.length > 0 && (
                <div className="file-preview-list" style={{ marginTop: 'var(--space-3)' }}>
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

            {/* Email (relocated to bottom) */}
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

            {/* Alternate Contact (relocated to bottom) */}
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
          </div>
        </div>

        {/* Call Summary Option */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              id="toggle-summary-checkbox"
              type="checkbox"
              checked={addSummary}
              onChange={(e) => setAddSummary(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="toggle-summary-checkbox" style={{ fontWeight: 600, cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
              Add Call Summary / Interaction details
            </label>
          </div>

          {addSummary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-4)' }}>
              {/* Summary Text */}
              <div className="form-group">
                <label className="form-label" htmlFor="summary-text">Summary Text</label>
                <textarea
                  id="summary-text"
                  className={`form-input ${errors.summaryText ? 'error' : ''}`}
                  style={{ resize: 'vertical', minHeight: 100 }}
                  placeholder="Describe the call, discussion points, outcomes…"
                  {...register('summaryText')}
                />
                {errors.summaryText && <span className="form-error">{errors.summaryText.message}</span>}
              </div>

              {/* Voice Recording */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Mic size={14} /> Voice Recording (Optional)
                </label>
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
                  <div {...getVoiceRootProps()} className={`dropzone ${isVoiceDragActive ? 'active' : ''}`} style={{ padding: 'var(--space-4)' }}>
                    <input {...getVoiceInputProps()} id="voice-upload" />
                    <Mic size={20} style={{ margin: '0 auto var(--space-1)' }} />
                    <p className="text-sm">Upload voice recording</p>
                  </div>
                )}
              </div>

              {/* Payment Details */}
              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <DollarSign size={14} /> Payment Details (Optional)
                </h4>
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
                      <div {...getScreenshotRootProps()} className="dropzone" style={{ padding: 'var(--space-4)' }}>
                        <input {...getScreenshotInputProps()} id="payment-screenshot" />
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
                      style={{ resize: 'vertical', minHeight: 60 }}
                      placeholder="Any notes about this payment…"
                      {...register('paymentNotes')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
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
            id="new-client-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isSubmitting || uploading}
          >
            {isSubmitting || uploading ? (
              <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Saving…</>
            ) : 'Save Client'}
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

export default NewClientFormPage;
