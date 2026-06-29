import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar,
  Plus, FileText, Mic, DollarSign, Edit3, UserCheck,
  MessageCircle, ExternalLink, X, Copy, Check, Grid, List, Clock, Trash2, Upload
} from 'lucide-react';
import { getClientById, getSummariesByClient, updateSummary, createEditRequest, getEditRequest, createClientEditRequest, getClientEditRequest, updateClientEditRequestStatus, deleteDoc, doc } from '../lib/firestore';
import { logActivity } from '../lib/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Client, Summary, PaymentStatus, EditRequest, ClientEditRequest, DocumentFile } from '../types';
import EditClientModal from '../components/EditClientModal';
import { resolvePresignedUrls, uploadFile, deleteFile, generateStoragePath } from '../lib/storage';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';

const PAYMENT_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  partial: 'badge-info',
  paid: 'badge-success',
  failed: 'badge-danger',
};

const ClientDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const { userRole, currentUser, userProfile } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [rawSummaries, setRawSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit requests tracking state
  const [editRequests, setEditRequests] = useState<Record<string, EditRequest>>({});

  // Client edit requests state
  const [clientEditRequest, setClientEditRequest] = useState<ClientEditRequest | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [showRequestClientEditModal, setShowRequestClientEditModal] = useState(false);
  const [clientRequestReason, setClientRequestReason] = useState('');
  const [submittingClientRequest, setSubmittingClientRequest] = useState(false);

  // New deletion and edit/takeover state variables
  const [summaryEditReason, setSummaryEditReason] = useState('');
  const [showRequestClientDeleteModal, setShowRequestClientDeleteModal] = useState(false);
  const [clientDeleteReason, setClientDeleteReason] = useState('');
  const [submittingClientDelete, setSubmittingClientDelete] = useState(false);
  const [deletingSummary, setDeletingSummary] = useState<Summary | null>(null);
  const [summaryDeleteReason, setSummaryDeleteReason] = useState('');
  const [submittingSummaryDelete, setSubmittingSummaryDelete] = useState(false);

  // Modal edit attachment states
  const [modalEditDocs, setModalEditDocs] = useState<DocumentFile[]>([]);
  const [modalEditVoiceUrl, setModalEditVoiceUrl] = useState<string | null>(null);
  const [modalEditScreenshotUrl, setModalEditScreenshotUrl] = useState<string | null>(null);

  // New files to upload states
  const [newUploadedDocs, setNewUploadedDocs] = useState<File[]>([]);
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const [newScreenshotFile, setNewScreenshotFile] = useState<File | null>(null);

  // Uploading state
  const [uploadingModalFiles, setUploadingModalFiles] = useState(false);
  const [modalFilesUploadProgress, setModalFilesUploadProgress] = useState(0);

  const {
    getRootProps: getModalDocsRootProps,
    getInputProps: getModalDocsInputProps,
    isDragActive: isModalDocsDragActive
  } = useDropzone({
    onDrop: (files) => setNewUploadedDocs((prev) => [...prev, ...files]),
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
  });

  const {
    getRootProps: getModalVoiceRootProps,
    getInputProps: getModalVoiceInputProps,
    isDragActive: isModalVoiceDragActive
  } = useDropzone({
    onDrop: (files) => files[0] && setNewVoiceFile(files[0]),
    accept: { 'audio/*': [] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const {
    getRootProps: getModalScreenshotRootProps,
    getInputProps: getModalScreenshotInputProps,
    isDragActive: isModalScreenshotDragActive
  } = useDropzone({
    onDrop: (files) => files[0] && setNewScreenshotFile(files[0]),
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const handleRequestClientEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !clientRequestReason.trim()) return;
    setSubmittingClientRequest(true);
    try {
      await createClientEditRequest(client.id, {
        clientId: client.id,
        clientName: client.name,
        agentId: currentUser!.uid,
        agentName: userProfile?.name || 'Agent',
        reason: clientRequestReason,
        requestType: 'edit',
        proposedChanges: {
          assignedAgent: currentUser!.uid,
          assignedAgentName: userProfile?.name || 'Agent',
        }
      });

      const newReq = await getClientEditRequest(client.id);
      setClientEditRequest(newReq);

      toast.success('Client claim request submitted to admin!');
      setShowRequestClientEditModal(false);
      setClientRequestReason('');
    } catch (err) {
      console.error('Failed to create client claim request:', err);
      toast.error('Failed to submit claim request');
    } finally {
      setSubmittingClientRequest(false);
    }
  };

  const handleClientUpdated = async (updatedClient: Client) => {
    setClient(updatedClient);
    if (userRole === 'agent') {
      try {
        await updateClientEditRequestStatus(client!.id, 'completed');
        const updatedReq = await getClientEditRequest(client!.id);
        setClientEditRequest(updatedReq);
      } catch (err) {
        console.error('Failed to lock client edit request:', err);
      }
    }
  };


  const handleAdminDeleteClient = async () => {
    if (!client) return;
    if (!window.confirm(`Are you sure you want to permanently delete the client "${client.name}" and all their records?`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'clients', client.id));
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'client_updated',
        entityType: 'client',
        entityId: client.id,
        entityName: `${client.name} (Deleted by Admin)`,
      });
      toast.success('Client permanently deleted');
      navigate('/');
    } catch (err) {
      console.error('Failed to delete client:', err);
      toast.error('Failed to delete client');
      setLoading(false);
    }
  };

  const handleRequestClientDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setSubmittingClientDelete(true);
    try {
      await createClientEditRequest(client.id, {
        clientId: client.id,
        clientName: client.name,
        agentId: currentUser!.uid,
        agentName: userProfile?.name || 'Agent',
        reason: clientDeleteReason.trim() || 'Client deletion request',
        requestType: 'delete',
      });

      const newReq = await getClientEditRequest(client.id);
      setClientEditRequest(newReq);

      toast.success('Client deletion request submitted to Admin!');
      setShowRequestClientDeleteModal(false);
      setClientDeleteReason('');
    } catch (err) {
      console.error('Failed to create client deletion request:', err);
      toast.error('Failed to submit deletion request');
    } finally {
      setSubmittingClientDelete(false);
    }
  };

  const handleAdminDeleteSummary = async (summaryId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this summary?')) {
      return;
    }
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'summaries', summaryId));
      await logActivity({
        userId: currentUser!.uid,
        userName: userProfile?.name,
        action: 'summary_updated',
        entityType: 'summary',
        entityId: summaryId,
        entityName: `Deleted summary for client`,
      });
      toast.success('Summary permanently deleted');
      setSummaries(prev => prev.filter(s => s.id !== summaryId));
      setSelectedSummary(null);
    } catch (err) {
      console.error('Failed to delete summary:', err);
      toast.error('Failed to delete summary');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSummaryDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSummary) return;
    setSubmittingSummaryDelete(true);
    try {
      await createEditRequest(deletingSummary.id, {
        clientId: client!.id,
        clientName: client!.name,
        summaryId: deletingSummary.id,
        summaryText: deletingSummary.summaryText,
        agentId: currentUser!.uid,
        agentName: userProfile?.name || 'Agent',
        reason: summaryDeleteReason.trim() || 'Summary deletion request',
        requestType: 'delete',
      });

      const newReq = await getEditRequest(deletingSummary.id);
      if (newReq) {
        setEditRequests((prev) => ({ ...prev, [deletingSummary.id]: newReq }));
      }

      toast.success('Deletion request submitted to Admin!');
      setDeletingSummary(null);
      setSummaryDeleteReason('');
    } catch (err) {
      console.error('Failed to create deletion request:', err);
      toast.error('Failed to submit deletion request');
    } finally {
      setSubmittingSummaryDelete(false);
    }
  };



  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'summaries' | 'payments' | 'documents'>('summaries');
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('grid');

  const handleCopyWhatsApp = () => {
    if (!client) return;
    navigator.clipboard.writeText(client.whatsappNumber);
    setCopied(true);
    toast.success('WhatsApp number copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [modalEditSummaryText, setModalEditSummaryText] = useState('');
  const [modalEditAmount, setModalEditAmount] = useState('');
  const [modalEditStatus, setModalEditStatus] = useState<PaymentStatus | ''>('');
  const [modalEditTransactionId, setModalEditTransactionId] = useState('');
  const [modalEditPaymentNotes, setModalEditPaymentNotes] = useState('');
  const [savingModalEdit, setSavingModalEdit] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'close_modal' | 'cancel_edit'>('close_modal');

  const isEditModalDirty = () => {
    if (!selectedSummary) return false;
    const originalText = selectedSummary.summaryText || '';
    const originalAmount = selectedSummary.paymentDetails?.amount?.toString() || '';
    const originalStatus = selectedSummary.paymentDetails?.status || '';
    const originalTxId = selectedSummary.paymentDetails?.transactionId || '';
    const originalNotes = selectedSummary.paymentDetails?.notes || '';

    return (
      modalEditSummaryText !== originalText ||
      modalEditAmount !== originalAmount ||
      modalEditStatus !== originalStatus ||
      modalEditTransactionId !== originalTxId ||
      modalEditPaymentNotes !== originalNotes
    );
  };

  const handleCloseModal = () => {
    if (isEditingInModal && isEditModalDirty()) {
      setConfirmAction('close_modal');
      setShowConfirmModal(true);
    } else {
      setSelectedSummary(null);
    }
  };

  const handleCancelEdit = () => {
    if (isEditModalDirty()) {
      setConfirmAction('cancel_edit');
      setShowConfirmModal(true);
    } else {
      setIsEditingInModal(false);
    }
  };

  const handleDiscardConfirm = () => {
    setShowConfirmModal(false);
    if (confirmAction === 'close_modal') {
      setSelectedSummary(null);
    } else {
      setIsEditingInModal(false);
    }
  };

  const handleSaveConfirm = async () => {
    setShowConfirmModal(false);
    const success = await handleSaveModalEdit();
    if (success && confirmAction === 'close_modal') {
      setSelectedSummary(null);
    }
  };

  const handleSelectSummary = (s: Summary) => {
    const raw = rawSummaries.find(r => r.id === s.id) || s;
    setSelectedSummary(s);
    setModalEditSummaryText(s.summaryText);
    setModalEditAmount(s.paymentDetails?.amount?.toString() || '');
    setModalEditStatus(s.paymentDetails?.status || '');
    setModalEditTransactionId(s.paymentDetails?.transactionId || '');
    setModalEditPaymentNotes(s.paymentDetails?.notes || '');
    
    setModalEditDocs(raw.documents || []);
    setModalEditVoiceUrl(raw.voiceUrl || null);
    setModalEditScreenshotUrl(raw.paymentDetails?.screenshotUrl || null);

    setNewUploadedDocs([]);
    setNewVoiceFile(null);
    setNewScreenshotFile(null);
    setIsEditingInModal(false);
  };

  const handleStartEditSummary = (summary: Summary) => {
    const raw = rawSummaries.find(r => r.id === summary.id) || summary;
    setSelectedSummary(summary);
    setModalEditSummaryText(summary.summaryText);
    setModalEditAmount(summary.paymentDetails?.amount?.toString() || '');
    setModalEditStatus(summary.paymentDetails?.status || '');
    setModalEditTransactionId(summary.paymentDetails?.transactionId || '');
    setModalEditPaymentNotes(summary.paymentDetails?.notes || '');

    setModalEditDocs(raw.documents || []);
    setModalEditVoiceUrl(raw.voiceUrl || null);
    setModalEditScreenshotUrl(raw.paymentDetails?.screenshotUrl || null);

    setNewUploadedDocs([]);
    setNewVoiceFile(null);
    setNewScreenshotFile(null);
    setIsEditingInModal(true);
  };

  const handleSaveModalEdit = async () => {
    if (!selectedSummary) return false;

    if (modalEditStatus && modalEditAmount && parseFloat(modalEditAmount) < 0) {
      toast.error('Amount cannot be negative');
      return false;
    }

    setSavingModalEdit(true);
    try {
      const raw = rawSummaries.find(r => r.id === selectedSummary.id) || selectedSummary;

      let newVoiceKey = modalEditVoiceUrl;
      let newScreenshotKey = modalEditScreenshotUrl;
      const newDocsList = [...modalEditDocs];

      interface UploadItem {
        key: string;
        file: File;
        path: string;
      }
      const uploads: UploadItem[] = [];

      if (newVoiceFile) {
        uploads.push({ key: 'voice', file: newVoiceFile, path: generateStoragePath('voice', newVoiceFile.name) });
      }
      if (newScreenshotFile && modalEditStatus) {
        uploads.push({ key: 'screenshot', file: newScreenshotFile, path: generateStoragePath('payments', newScreenshotFile.name) });
      }
      newUploadedDocs.forEach((docFile, index) => {
        uploads.push({ key: `doc_${index}`, file: docFile, path: generateStoragePath('documents', docFile.name) });
      });

      if (uploads.length > 0) {
        setUploadingModalFiles(true);
        const totalUploads = uploads.length;
        const progressTracker = new Array(totalUploads).fill(0);

        const uploadPromises = uploads.map(async (item, index) => {
          const url = await uploadFile(item.file, item.path, (p) => {
            progressTracker[index] = p;
            const totalProgress = progressTracker.reduce((sum, val) => sum + val, 0) / totalUploads;
            setModalFilesUploadProgress(totalProgress);
          });
          return { ...item, url };
        });

        const results = await Promise.all(uploadPromises);
        setUploadingModalFiles(false);

        results.forEach((res) => {
          if (res.key === 'voice') {
            newVoiceKey = res.url;
          } else if (res.key === 'screenshot') {
            newScreenshotKey = res.url;
          } else if (res.key.startsWith('doc_')) {
            newDocsList.push({
              name: res.file.name,
              url: res.url,
              type: res.file.type,
              size: res.file.size,
            });
          }
        });
      }

      if (!modalEditStatus) {
        newScreenshotKey = null;
      }

      if (userRole === 'admin') {
        if (raw.voiceUrl && newVoiceKey !== raw.voiceUrl) {
          await deleteFile(raw.voiceUrl);
        }
        if (raw.paymentDetails?.screenshotUrl && newScreenshotKey !== raw.paymentDetails.screenshotUrl) {
          await deleteFile(raw.paymentDetails.screenshotUrl);
        }
        const rawDocs = raw.documents || [];
        for (const rd of rawDocs) {
          if (!newDocsList.some(d => d.url === rd.url)) {
            await deleteFile(rd.url);
          }
        }
      }

      const updatedPaymentDetails = modalEditStatus ? {
        amount: modalEditAmount ? parseFloat(modalEditAmount) : undefined,
        status: modalEditStatus as PaymentStatus,
        transactionId: modalEditTransactionId || undefined,
        notes: modalEditPaymentNotes || undefined,
        screenshotUrl: newScreenshotKey || undefined,
      } : null;

      const updatedFields = {
        summaryText: modalEditSummaryText,
        voiceUrl: newVoiceKey || null,
        documents: newDocsList,
        paymentDetails: updatedPaymentDetails,
      };

      if (userRole === 'admin') {
        await updateSummary(selectedSummary.id, updatedFields);

        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'summary_updated',
          entityType: 'summary',
          entityId: selectedSummary.id,
          entityName: `Edited summary details in modal`,
        });

        const sList = await getSummariesByClient(client!.id);
        const resolved = await resolveSummariesUrls(sList);
        setSummaries(resolved);
        setRawSummaries(sList);

        const updatedSummaryObj = resolved.find(s => s.id === selectedSummary.id);
        if (updatedSummaryObj) {
          setSelectedSummary(updatedSummaryObj);
        } else {
          setSelectedSummary(null);
        }

        setIsEditingInModal(false);
        toast.success('Summary details updated successfully');
      } else {
        await createEditRequest(selectedSummary.id, {
          clientId: client!.id,
          clientName: client!.name,
          summaryId: selectedSummary.id,
          summaryText: selectedSummary.summaryText,
          agentId: currentUser!.uid,
          agentName: userProfile?.name || 'Agent',
          reason: summaryEditReason.trim() || 'Summary details update request',
          requestType: 'edit',
          proposedChanges: updatedFields,
        });

        const newReq = await getEditRequest(selectedSummary.id);
        if (newReq) {
          setEditRequests((prev) => ({ ...prev, [selectedSummary.id]: newReq }));
        }

        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'summary_updated',
          entityType: 'summary',
          entityId: selectedSummary.id,
          entityName: `Edited summary details in modal (Edit request submitted)`,
        });

        toast.success('Edit request submitted to Admin');
        setIsEditingInModal(false);
      }
      return true;
    } catch (err) {
      console.error("Failed to update summary in modal:", err);
      toast.error('Failed to update summary details');
      return false;
    } finally {
      setSavingModalEdit(false);
    }
  };

  const resolveSummariesUrls = async (summariesList: Summary[]): Promise<Summary[]> => {
    const keysToResolve = new Set<string>();

    summariesList.forEach((s) => {
      if (s.voiceUrl && !s.voiceUrl.startsWith('http://') && !s.voiceUrl.startsWith('https://')) {
        keysToResolve.add(s.voiceUrl);
      }
      if (s.paymentDetails?.screenshotUrl && !s.paymentDetails.screenshotUrl.startsWith('http://') && !s.paymentDetails.screenshotUrl.startsWith('https://')) {
        keysToResolve.add(s.paymentDetails.screenshotUrl);
      }
      if (Array.isArray(s.documents)) {
        s.documents.forEach((doc) => {
          if (doc.url && !doc.url.startsWith('http://') && !doc.url.startsWith('https://')) {
            keysToResolve.add(doc.url);
          }
        });
      }
    });

    if (keysToResolve.size === 0) return summariesList;

    try {
      const resolvedUrls = await resolvePresignedUrls(Array.from(keysToResolve));

      return summariesList.map((s) => {
        const updated: Summary = { ...s };
        if (s.voiceUrl && resolvedUrls[s.voiceUrl]) {
          updated.voiceUrl = resolvedUrls[s.voiceUrl];
        }
        if (s.paymentDetails?.screenshotUrl && resolvedUrls[s.paymentDetails.screenshotUrl]) {
          updated.paymentDetails = {
            ...s.paymentDetails,
            screenshotUrl: resolvedUrls[s.paymentDetails.screenshotUrl],
          };
        }
        if (Array.isArray(s.documents)) {
          updated.documents = s.documents.map((doc) => {
            if (doc.url && resolvedUrls[doc.url]) {
              return { ...doc, url: resolvedUrls[doc.url] };
            }
            return doc;
          });
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to resolve presigned URLs:', err);
      return summariesList;
    }
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [c, s] = await Promise.all([
          getClientById(id),
          getSummariesByClient(id),
        ]);
        setClient(c);

        // Load client edit request if agent
        if (id) {
          try {
            const clientReq = await getClientEditRequest(id);
            setClientEditRequest(clientReq);
          } catch (err) {
            console.error('Failed to load client edit request:', err);
          }
        }

        // Load any edit requests associated with the summaries
        const requestsMap: Record<string, EditRequest> = {};
        const requestPromises = s.map(async (summary) => {
          try {
            const req = await getEditRequest(summary.id);
            if (req) {
              requestsMap[summary.id] = req;
            }
          } catch (err) {
            console.error(`Failed to load request for ${summary.id}:`, err);
          }
        });
        await Promise.all(requestPromises);
        setEditRequests(requestsMap);

        const resolved = await resolveSummariesUrls(s);
        setSummaries(resolved);
        setRawSummaries(s);
      } catch {
        toast.error('Failed to load client');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const openFile = (url: string) => {
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="empty-state">
        <h3>Client not found</h3>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: 'var(--space-4)' }}>Back to Dashboard</button>
      </div>
    );
  }

  const allDocuments = summaries.flatMap((s) =>
    (s.documents || []).map((doc) => ({
      ...doc,
      summaryId: s.id,
      createdAt: s.createdAt,
      createdByName: s.createdByName
    }))
  );

  return (
    <div className="page-container" style={{ maxWidth: 935, margin: '0 auto', width: '100%', padding: '0 var(--space-4)' }}>
      {/* Back & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-xl)' }}>Client Details</h1>
        </div>
      </div>

      {/* Client Profile Header Card */}
      <div className="client-profile-card">
        <div className="client-header-row">
          <div className="client-header-info">
            <div className="client-avatar">
              {client.profileImage ? (
                <img src={client.profileImage} alt={client.name} />
              ) : (
                client.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="client-name-status">
              <h2 className="client-title">{client.name}</h2>
            </div>
          </div>
          <div className="client-actions" style={{ display: 'flex', gap: '8px' }}>
            {userRole === 'admin' ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEditClientModal(true)}
                  title="Edit Info"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  <Edit3 size={16} />
                  <span>Edit Info</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleAdminDeleteClient}
                  title="Delete Client"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                  <X size={16} />
                  <span>Delete Client</span>
                </button>
              </>
            ) : userRole === 'agent' ? (
              <>
                {clientEditRequest?.status === 'pending' ? (
                  <button
                    className="btn btn-secondary"
                    disabled
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', opacity: 0.65, cursor: 'not-allowed' }}
                    title="An edit/takeover request is pending Admin approval"
                  >
                    <Clock size={16} style={{ animation: 'spin 2s linear infinite' }} />
                    <span>Request Pending</span>
                  </button>
                ) : (
                  <>
                    {client.assignedAgent !== currentUser?.uid && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowRequestClientEditModal(true)}
                        title="Claim Client"
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                      >
                        <UserCheck size={16} />
                        <span>Claim Client</span>
                      </button>
                    )}
                    {client.assignedAgent === currentUser?.uid && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowRequestClientDeleteModal(true)}
                        title="Delete Client"
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                      >
                        <X size={16} />
                        <span>Delete Client</span>
                      </button>
                    )}
                  </>
                )}
              </>
            ) : null}

            <button
              id="add-summary-btn"
              className="btn btn-primary"
              onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}
              title="Add Summary"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <Plus size={16} />
              <span>Add Summary</span>
            </button>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="client-meta-grid">
          <div className="client-meta-item">
            <MessageCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <a
              href={`https://wa.me/${client.whatsappNumber}?text=${encodeURIComponent(`Hello ${client.name}, `)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {client.whatsappNumber}
            </a>
            <button
              onClick={handleCopyWhatsApp}
              className="btn btn-ghost"
              style={{ padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', border: 'none', background: 'none', minHeight: 'auto', width: 'auto' }}
              title="Copy WhatsApp Number"
            >
              {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
            </button>
          </div>

          {client.email && (
            <div className="client-meta-item">
              <Mail size={16} style={{ flexShrink: 0 }} />
              <span className="truncate" title={client.email}>{client.email}</span>
            </div>
          )}

          {client.alternateContact && (
            <div className="client-meta-item">
              <Phone size={16} style={{ flexShrink: 0 }} />
              <span>{client.alternateContact}</span>
            </div>
          )}

          {client.address && (
            <div className="client-meta-item">
              <MapPin size={16} style={{ flexShrink: 0 }} />
              <span className="truncate" title={client.address}>{client.address}</span>
            </div>
          )}

          <div className="client-meta-item">
            <Calendar size={16} style={{ flexShrink: 0 }} />
            <span>Joined {format(client.createdAt, 'dd MMM yyyy')}</span>
          </div>

          <div className="client-meta-item">
            <UserCheck size={16} style={{ flexShrink: 0 }} />
            <span className="truncate">
              Agent: <strong>{client.assignedAgentName || client.assignedAgent || 'Not Assigned'}</strong>
            </span>
          </div>
        </div>

        {client.notes && (
          <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '16px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
              Notes / Bio
            </span>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {client.notes}
            </div>
          </div>
        )}
      </div>

      {/* SaaS CRM Tabs Navigation */}
      <nav className="client-tabs-nav">
        <button
          className={`client-tab-btn ${activeTab === 'summaries' ? 'active' : ''}`}
          onClick={() => setActiveTab('summaries')}
        >
          <Grid size={16} />
          <span>Summaries ({summaries.length})</span>
        </button>
        <button
          className={`client-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <DollarSign size={16} />
          <span>Payments ({summaries.filter((s) => s.paymentDetails?.status).length})</span>
        </button>
        <button
          className={`client-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={16} />
          <span>Documents ({allDocuments.length})</span>
        </button>
      </nav>

      {/* Tab Panels */}
      {activeTab === 'summaries' && (
        <>
          {summaries.length > 0 && (
            <div className="client-view-toggle">
              <button
                className={`client-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <Grid size={20} />
              </button>
              <button
                className={`client-view-toggle-btn ${viewMode === 'feed' ? 'active' : ''}`}
                onClick={() => setViewMode('feed')}
                title="Feed View"
              >
                <List size={20} />
              </button>
            </div>
          )}

          {summaries.length === 0 ? (
            <div className="card empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><FileText size={28} /></div>
              <h3 className="empty-state-title">No Summaries Yet</h3>
              <p className="empty-state-desc">Add a call summary to start tracking this client's interactions.</p>
              <button className="btn btn-primary" onClick={() => navigate(isAdminPath ? `/admin/clients/${id}/summary` : `/clients/${id}/summary`)}>
                <Plus size={16} /> Add First Summary
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="client-log-grid">
              {summaries.map((s) => {
                const hasPayment = !!s.paymentDetails?.status;
                const hasVoice = !!s.voiceUrl;
                const docCount = s.documents?.length || 0;
                return (
                  <div
                    key={s.id}
                    className="client-log-card"
                    onClick={() => {
                      handleSelectSummary(s);
                    }}
                  >
                    <div className="client-log-header">
                      <span className="client-log-author">{s.createdByName || 'Agent'}</span>
                      {s.updatedAt ? (
                        <span className="client-log-date" style={{ color: 'var(--color-accent)' }}>Edited: {format(s.updatedAt, 'dd MMM yyyy')}</span>
                      ) : (
                        <span className="client-log-date">{format(s.createdAt, 'dd MMM yyyy')}</span>
                      )}
                    </div>
                    <div className="client-log-body">
                      {s.summaryText}
                    </div>
                    <div className="client-log-footer">
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {hasPayment && (
                          <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: 2 }} title={`Payment: ₹${s.paymentDetails?.amount}`}>
                            <DollarSign size={10} /> ₹{s.paymentDetails?.amount}
                          </span>
                        )}
                        {hasVoice && (
                          <span className="badge badge-accent" style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: 2 }} title="Voice Recording">
                            <Mic size={10} /> Voice
                          </span>
                        )}
                        {docCount > 0 && (
                          <span className="badge badge-muted" style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: 2 }} title={`${docCount} Documents`}>
                            <FileText size={10} /> {docCount} Doc{docCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600 }}>View Details</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="client-feed-list">
              {summaries.map((s) => (
                <div
                  key={s.id}
                  className="client-feed-post"
                  onClick={() => {
                    handleSelectSummary(s);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="client-feed-header">
                    <div className="client-feed-author-info">
                      <div className="avatar avatar-sm">
                        {s.createdByName?.charAt(0).toUpperCase() || 'A'}
                      </div>
                      <div>
                        <span className="client-feed-author-name">{s.createdByName || 'Unknown Agent'}</span>
                        <div className="client-feed-post-date" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>Created: {format(s.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
                          {s.updatedAt && (
                            <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>Edited: {format(s.updatedAt, 'dd MMM yyyy, hh:mm a')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {userRole === 'admin' ? (
                        <>
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ padding: 4, width: 24, height: 24, color: 'var(--color-accent)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditSummary(s);
                            }}
                            title="Edit Summary"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ padding: 4, width: 24, height: 24, color: 'var(--color-danger)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAdminDeleteSummary(s.id);
                            }}
                            title="Delete Summary"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : userRole === 'agent' && s.createdBy === currentUser?.uid ? (
                        <>
                          {editRequests[s.id]?.status === 'pending' ? (
                            <span className="badge badge-warning" style={{ padding: '2px 6px', fontSize: '10px' }} title={`Reason: ${editRequests[s.id].reason}`}>
                              ⏳ Pending
                            </span>
                          ) : (
                            <>
                              <button
                                className="btn btn-ghost btn-icon"
                                style={{ padding: 4, width: 24, height: 24, color: 'var(--color-accent)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSummaryEditReason('');
                                  handleStartEditSummary(s);
                                }}
                                title="Edit Summary"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                className="btn btn-ghost btn-icon"
                                style={{ padding: 4, width: 24, height: 24, color: 'var(--color-danger)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingSummary(s);
                                }}
                                title="Request Delete Summary"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="client-feed-post-body">
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.summaryText}</p>
                  </div>

                  {/* Attachments inside Feed Card */}
                  {(s.voiceUrl || s.documents?.length > 0 || s.paymentDetails) && (
                    <div className="client-feed-post-attachments" onClick={(e) => e.stopPropagation()}>
                      {s.voiceUrl && (
                        <div style={{ marginBottom: '12px' }}>
                          <audio controls src={s.voiceUrl} style={{ width: '100%' }} />
                        </div>
                      )}

                      {s.documents?.length > 0 && (
                        <div className="file-preview-list" style={{ gap: '8px', marginBottom: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                          {s.documents.map((doc, i) => (
                            <a
                              key={i}
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                openFile(doc.url);
                              }}
                              className="file-preview-item"
                              style={{ padding: '6px 10px', background: 'var(--color-bg-secondary)', textDecoration: 'none' }}
                            >
                              <FileText size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                              <span className="text-xs font-medium truncate" style={{ flex: 1 }}>{doc.name}</span>
                              <ExternalLink size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                            </a>
                          ))}
                        </div>
                      )}

                      {s.paymentDetails && s.paymentDetails.status && (
                        <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Payment</span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{s.paymentDetails.amount !== undefined ? `₹${s.paymentDetails.amount}` : '—'}</span>
                          </div>
                          <span className={`badge ${PAYMENT_BADGE[s.paymentDetails.status] || 'badge-muted'}`} style={{ textTransform: 'uppercase', fontSize: '9px' }}>
                            {s.paymentDetails.status}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="client-feed-post-footer">
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Click to open details & edits</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 600 }}>View Details →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'payments' && (
        <div className="client-receipt-list">
          {summaries.filter(s => s.paymentDetails?.status).length === 0 ? (
            <div className="card empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon"><DollarSign size={28} /></div>
              <h3 className="empty-state-title">No Payments Recorded</h3>
              <p className="empty-state-desc">There are no financial summaries log entries for this client.</p>
            </div>
          ) : (
            summaries
              .filter(s => s.paymentDetails?.status)
              .map((s) => {
                const pay = s.paymentDetails!;
                return (
                  <div key={s.id} className="client-receipt-card">
                    <div className="client-receipt-main">
                      <div className="client-receipt-header">
                        <span className="client-receipt-title">Payment Record</span>
                        <span className={`badge ${PAYMENT_BADGE[pay.status || ''] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                          {pay.status}
                        </span>
                      </div>

                      <div className="client-receipt-info-grid">
                        {pay.amount !== undefined && (
                          <div className="client-receipt-info-item">
                            <span className="client-receipt-label">Amount</span>
                            <span className="client-receipt-value" style={{ color: 'var(--color-success)', fontSize: '1.1rem' }}>₹{pay.amount}</span>
                          </div>
                        )}

                        <div className="client-receipt-info-item">
                          <span className="client-receipt-label">Log Date</span>
                          <span className="client-receipt-value">{format(s.createdAt, 'dd MMM yyyy')}</span>
                        </div>

                        {pay.transactionId && (
                          <div className="client-receipt-info-item">
                            <span className="client-receipt-label">Transaction ID</span>
                            <span className="client-receipt-value mono">{pay.transactionId}</span>
                          </div>
                        )}

                        <div className="client-receipt-info-item">
                          <span className="client-receipt-label">Logged By</span>
                          <span className="client-receipt-value">{s.createdByName || 'System'}</span>
                        </div>
                      </div>

                      {pay.notes && (
                        <div className="client-receipt-notes">
                          <span className="client-receipt-label" style={{ display: 'block', marginBottom: '4px' }}>Payment Notes</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{pay.notes}</span>
                        </div>
                      )}
                    </div>

                    {pay.screenshotUrl && (
                      <div
                        className="client-receipt-screenshot-container"
                        onClick={() => openFile(pay.screenshotUrl!)}
                        title="Click to download screenshot"
                      >
                        <img src={pay.screenshotUrl} alt="Receipt Screenshot" />
                        <div className="client-receipt-screenshot-overlay">
                          <ExternalLink size={20} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="client-doc-grid">
          {allDocuments.length === 0 ?
            <div className="card empty-state" style={{ padding: 'var(--space-10)', gridColumn: '1 / -1' }}>
              <div className="empty-state-icon"><FileText size={28} /></div>
              <h3 className="empty-state-title">No Documents Attached</h3>
              <p className="empty-state-desc">There are no files or screenshots uploaded for this client.</p>
            </div>
            :
            allDocuments.map((doc, idx) => {
              const isImage = doc.url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.name);
              return (
                <div
                  key={idx}
                  className="client-doc-card"
                  onClick={() => openFile(doc.url)}
                  title={`Click to download: ${doc.name}`}
                >
                  {isImage ? (
                    <img src={doc.url} alt={doc.name} className="client-doc-card-image" />
                  ) : (
                    <div className="client-doc-card-placeholder">
                      <div className="client-doc-icon-wrapper">
                        <FileText size={24} />
                      </div>
                      <div className="client-doc-name">{doc.name}</div>
                      <div className="client-doc-size">{(doc.size / 1024).toFixed(1)} KB</div>
                    </div>
                  )}
                  <div className="client-doc-card-overlay">
                    <ExternalLink size={20} />
                    <span style={{ fontSize: '11px', fontWeight: 600, wordBreak: 'break-all' }}>{doc.name}</span>
                    <span style={{ fontSize: '9px', opacity: 0.8 }}>Uploaded {format(doc.createdAt, 'dd MMM yyyy')}</span>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* Summary Detail Modal */}
      {selectedSummary && (
        <div className="modal-overlay" onClick={() => { if (!savingModalEdit) handleCloseModal(); }}>
          <div
            className="modal"
            style={{
              maxWidth: 1000,
              width: '95%',
              maxHeight: '95vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--space-6)',
              animation: 'fadeIn 0.2s ease'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexShrink: 0 }}>
              <h2 className="modal-title" style={{ fontSize: 'var(--font-size-lg)' }}>{isEditingInModal ? 'Edit Summary Details' : 'Summary Details'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {!isEditingInModal && (
                  <>
                    {userRole === 'admin' ? (
                      <>
                        <button
                          className="btn btn-ghost btn-sm summary-action-btn"
                          onClick={() => setIsEditingInModal(true)}
                          title="Edit Details"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', height: 'auto', fontSize: 'var(--font-size-xs)', border: '1px solid var(--color-border)' }}
                        >
                          <Edit3 size={12} />
                          <span className="summary-action-label">Edit Details</span>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm summary-action-btn"
                          onClick={() => handleAdminDeleteSummary(selectedSummary.id)}
                          title="Delete Summary"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', height: 'auto', fontSize: 'var(--font-size-xs)', border: '1px solid var(--color-border)', color: 'var(--color-danger)' }}
                        >
                          <Trash2 size={12} />
                          <span className="summary-action-label">Delete Summary</span>
                        </button>
                      </>
                    ) : userRole === 'agent' && selectedSummary.createdBy === currentUser?.uid ? (
                      <>
                        {editRequests[selectedSummary.id]?.status === 'pending' ? (
                          <span className="badge badge-warning" style={{ padding: '4px 8px', fontSize: '11px' }}>
                            ⏳ Request Pending
                          </span>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm summary-action-btn"
                              onClick={() => {
                                setSummaryEditReason('');
                                setIsEditingInModal(true);
                              }}
                              title="Edit Details"
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', height: 'auto', fontSize: 'var(--font-size-xs)', border: '1px solid var(--color-border)' }}
                            >
                              <Edit3 size={12} />
                              <span className="summary-action-label">Edit Details</span>
                            </button>
                            <button
                              className="btn btn-ghost btn-sm summary-action-btn"
                              onClick={() => setDeletingSummary(selectedSummary)}
                              title="Delete Summary"
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', height: 'auto', fontSize: 'var(--font-size-xs)', border: '1px solid var(--color-border)', color: 'var(--color-danger)' }}
                            >
                              <Trash2 size={12} />
                              <span className="summary-action-label">Delete Summary</span>
                            </button>
                          </>
                        )}
                      </>
                    ) : null}
                  </>
                )}
                <button className="btn btn-ghost btn-icon" onClick={handleCloseModal} disabled={savingModalEdit}><X size={20} /></button>
              </div>
            </div>

            {isEditingInModal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1, overflowY: 'auto', paddingRight: 'var(--space-1)' }}>
                {/* Creator details (read-only) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className="avatar avatar-md">
                    {selectedSummary.createdByName?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Editing summary by {selectedSummary.createdByName || 'Unknown'}</div>
                    <div className="text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>Created: {format(selectedSummary.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
                      {selectedSummary.updatedAt && (
                        <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>Edited: {format(selectedSummary.updatedAt, 'dd MMM yyyy, hh:mm a')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Call Notes input */}
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-edit-notes">Call Notes</label>
                  <textarea
                    id="modal-edit-notes"
                    className="form-input"
                    style={{ minHeight: 300, resize: 'vertical' }}
                    value={modalEditSummaryText}
                    onChange={(e) => setModalEditSummaryText(e.target.value)}
                    placeholder="Enter call notes..."
                  />
                </div>

                {/* Divider */}
                <hr className="divider" style={{ margin: 'var(--space-2) 0' }} />

                {/* Payment Details inputs */}
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                    Payment Information
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="modal-edit-status">Payment Status</label>
                        <select
                          id="modal-edit-status"
                          className="form-input form-select"
                          value={modalEditStatus}
                          onChange={(e) => setModalEditStatus(e.target.value as PaymentStatus | '')}
                        >
                          <option value="">No Payment</option>
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="modal-edit-amount">Amount (₹)</label>
                        <input
                          id="modal-edit-amount"
                          type="number"
                          step="0.01"
                          className="form-input"
                          placeholder="e.g. 1000"
                          value={modalEditAmount}
                          onChange={(e) => setModalEditAmount(e.target.value)}
                          disabled={!modalEditStatus}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="modal-edit-paynotes">Payment Notes</label>
                      <textarea
                        id="modal-edit-paynotes"
                        className="form-input"
                        style={{ minHeight: 60, resize: 'vertical' }}
                        placeholder="Add payment notes..."
                        value={modalEditPaymentNotes}
                        onChange={(e) => setModalEditPaymentNotes(e.target.value)}
                        disabled={!modalEditStatus}
                      />
                    </div>
                  </div>
                </div>

                {/* File Attachments Edit Section */}
                <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                    Attachments
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {/* 1. Documents */}
                    <div className="form-group">
                      <label className="form-label">Documents / Files</label>
                      
                      {/* Existing documents */}
                      {modalEditDocs.length > 0 && (
                        <div className="file-preview-list" style={{ marginBottom: 'var(--space-2)' }}>
                          {modalEditDocs.map((doc, idx) => (
                            <div key={`existing-doc-${idx}`} className="file-preview-item">
                              <div className="file-preview-icon"><FileText size={16} /></div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="text-sm font-medium truncate">{doc.name}</div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                onClick={() => setModalEditDocs((prev) => prev.filter((_, i) => i !== idx))}
                                style={{ color: 'var(--color-danger)' }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Dropzone for new documents */}
                      <div {...getModalDocsRootProps()} className={`dropzone ${isModalDocsDragActive ? 'active' : ''}`} style={{ padding: 'var(--space-3)' }}>
                        <input {...getModalDocsInputProps()} />
                        <Upload size={18} style={{ margin: '0 auto var(--space-1)' }} />
                        <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Drag & drop files or click to add documents</p>
                      </div>

                      {/* Selected new files */}
                      {newUploadedDocs.length > 0 && (
                        <div className="file-preview-list" style={{ marginTop: 'var(--space-2)' }}>
                          {newUploadedDocs.map((file, idx) => (
                            <div key={`new-doc-${idx}`} className="file-preview-item" style={{ borderColor: 'var(--color-accent)' }}>
                              <div className="file-preview-icon" style={{ color: 'var(--color-accent)' }}><FileText size={16} /></div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="text-sm font-medium truncate">{file.name} (New)</div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                onClick={() => setNewUploadedDocs((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2. Voice Recording */}
                    <div className="form-group">
                      <label className="form-label">Voice Recording</label>
                      
                      {modalEditVoiceUrl ? (
                        <div className="file-preview-item">
                          <div className="file-preview-icon" style={{ color: 'var(--color-accent)' }}><Mic size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span className="text-sm font-medium">Existing voice recording</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={() => setModalEditVoiceUrl(null)}
                            style={{ color: 'var(--color-danger)' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : newVoiceFile ? (
                        <div className="file-preview-item" style={{ borderColor: 'var(--color-accent)' }}>
                          <div className="file-preview-icon" style={{ color: 'var(--color-accent)' }}><Mic size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span className="text-sm font-medium truncate">{newVoiceFile.name} (New)</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={() => setNewVoiceFile(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div {...getModalVoiceRootProps()} className={`dropzone ${isModalVoiceDragActive ? 'active' : ''}`} style={{ padding: 'var(--space-3)' }}>
                          <input {...getModalVoiceInputProps()} />
                          <Mic size={18} style={{ margin: '0 auto var(--space-1)' }} />
                          <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Drag & drop or click to add voice recording</p>
                        </div>
                      )}
                    </div>

                    {/* 3. Payment Screenshot (Only when status is chosen) */}
                    {modalEditStatus && (
                      <div className="form-group">
                        <label className="form-label">Payment Screenshot</label>
                        
                        {modalEditScreenshotUrl ? (
                          <div className="file-preview-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="file-preview-icon" style={{ color: 'var(--color-success)' }}><Upload size={16} /></div>
                              <img src={modalEditScreenshotUrl} alt="Existing" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                              <span className="text-xs font-medium text-muted">Existing screenshot</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon"
                              onClick={() => setModalEditScreenshotUrl(null)}
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : newScreenshotFile ? (
                          <div className="file-preview-item" style={{ borderColor: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="file-preview-icon" style={{ color: 'var(--color-success)' }}><Upload size={16} /></div>
                              <span className="text-sm font-medium truncate">{newScreenshotFile.name} (New)</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon"
                              onClick={() => setNewScreenshotFile(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div {...getModalScreenshotRootProps()} className={`dropzone ${isModalScreenshotDragActive ? 'active' : ''}`} style={{ padding: 'var(--space-3)' }}>
                            <input {...getModalScreenshotInputProps()} />
                            <Upload size={18} style={{ margin: '0 auto var(--space-1)' }} />
                            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Drag & drop or click to add screenshot</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload progress bar inside modal */}
                {uploadingModalFiles && (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-accent-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                      <span className="text-xs font-medium text-accent">Uploading attachment files…</span>
                      <span className="text-xs text-accent">{Math.round(modalFilesUploadProgress)}%</span>
                    </div>
                    <div className="progress-bar" style={{ height: '6px' }}>
                      <div className="progress-fill" style={{ width: `${modalFilesUploadProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Agent: optional reason for edit */}
                {userRole === 'agent' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="modal-edit-reason">Reason for Edit (Optional)</label>
                    <textarea
                      id="modal-edit-reason"
                      className="form-input"
                      style={{ minHeight: 60, resize: 'vertical' }}
                      placeholder="Briefly describe why you're requesting this edit..."
                      value={summaryEditReason}
                      onChange={(e) => setSummaryEditReason(e.target.value)}
                    />
                  </div>
                )}

                {/* Edit Form Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelEdit}
                    disabled={savingModalEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveModalEdit}
                    disabled={savingModalEdit}
                  >
                    {savingModalEdit ? 'Saving...' : userRole === 'agent' ? 'Submit Edit Request' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', flex: 1, overflowY: 'auto', paddingRight: 'var(--space-1)' }}>
                {/* Creator details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div className="avatar avatar-md">
                    {selectedSummary.createdByName?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Added by {selectedSummary.createdByName || 'Unknown'}</div>
                    <div className="text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>Created: {format(selectedSummary.createdAt, 'dd MMM yyyy, hh:mm a')}</span>
                      {selectedSummary.updatedAt && (
                        <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>Edited: {format(selectedSummary.updatedAt, 'dd MMM yyyy, hh:mm a')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status badges */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {selectedSummary.paymentDetails?.status && (
                    <span className={`badge ${PAYMENT_BADGE[selectedSummary.paymentDetails.status] || 'badge-muted'}`}>
                      <DollarSign size={11} />
                      Payment: {selectedSummary.paymentDetails.status}
                    </span>
                  )}
                  {selectedSummary.voiceUrl && <span className="badge badge-accent"><Mic size={11} /> Has Voice</span>}
                  {selectedSummary.documents?.length > 0 && (
                    <span className="badge badge-muted"><FileText size={11} /> {selectedSummary.documents.length} Document{selectedSummary.documents.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Summary text */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Call Notes
                  </h3>
                  <textarea
                    readOnly
                    className="form-input text-sm"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 1.6,
                      color: 'var(--color-text-secondary)',
                      minHeight: 350,
                      resize: 'vertical',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                    value={selectedSummary.summaryText}
                  />
                </div>

                {/* Voice player */}
                {selectedSummary.voiceUrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Voice Recording
                    </h3>
                    <audio controls src={selectedSummary.voiceUrl} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
                  </div>
                )}

                {/* Documents */}
                {selectedSummary.documents?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Attached Documents ({selectedSummary.documents.length})
                    </h3>
                    <div className="file-preview-list">
                      {selectedSummary.documents.map((doc, i) => (
                        <a
                          key={i}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openFile(doc.url);
                          }}
                          className="file-preview-item"
                          style={{ textDecoration: 'none' }}
                        >
                          <div className="file-preview-icon"><FileText size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="text-sm font-medium truncate">{doc.name}</div>
                            <div className="text-xs text-muted">{(doc.size / 1024).toFixed(1)} KB</div>
                          </div>
                          <ExternalLink size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Details */}
                {selectedSummary.paymentDetails && (selectedSummary.paymentDetails.amount !== undefined || selectedSummary.paymentDetails.status || selectedSummary.paymentDetails.transactionId) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--color-bg-elevated)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 0 }}>
                      Payment Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                      <div>
                        <div className="text-xs text-muted">Amount</div>
                        <div className="text-sm font-semibold">
                          {selectedSummary.paymentDetails.amount !== undefined ? `₹${selectedSummary.paymentDetails.amount}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">Status</div>
                        <span className={`badge ${PAYMENT_BADGE[selectedSummary.paymentDetails.status || ''] || 'badge-muted'}`} style={{ textTransform: 'uppercase' }}>
                          {selectedSummary.paymentDetails.status}
                        </span>
                      </div>
                      {selectedSummary.paymentDetails.transactionId && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted">Transaction ID</div>
                          <div className="text-sm font-medium" style={{ fontFamily: 'monospace' }}>
                            {selectedSummary.paymentDetails.transactionId}
                          </div>
                        </div>
                      )}
                      {selectedSummary.paymentDetails.notes && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted">Payment Notes</div>
                          <div className="text-sm text-secondary">
                            {selectedSummary.paymentDetails.notes}
                          </div>
                        </div>
                      )}
                      {selectedSummary.paymentDetails.screenshotUrl && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Payment Screenshot</div>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openFile(selectedSummary.paymentDetails!.screenshotUrl!);
                            }}
                            style={{ display: 'block', maxWidth: 200 }}
                          >
                            <img
                              src={selectedSummary.paymentDetails.screenshotUrl}
                              alt="Screenshot"
                              style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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

      {/* Request Client Claim Modal */}
      {showRequestClientEditModal && (
        <div className="modal-overlay" onClick={() => { if (!submittingClientRequest) setShowRequestClientEditModal(false); }}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Claim Client</h2>
                <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                  Explain why you want to claim/take over this client.
                </p>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowRequestClientEditModal(false)}
                disabled={submittingClientRequest}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRequestClientEdit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="client-request-reason">Reason for Claim</label>
                <textarea
                  id="client-request-reason"
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder="e.g., Previous agent left, I am taking over this lead"
                  value={clientRequestReason}
                  onChange={(e) => setClientRequestReason(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 0, paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRequestClientEditModal(false)}
                  disabled={submittingClientRequest}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingClientRequest || !clientRequestReason.trim()}
                >
                  {submittingClientRequest ? 'Submitting...' : 'Submit Claim Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Details Modal */}
      {showEditClientModal && client && (
        <EditClientModal
          client={client}
          onClose={() => setShowEditClientModal(false)}
          onUpdate={handleClientUpdated}
        />
      )}

      {/* Request Client Delete Modal */}
      {showRequestClientDeleteModal && (
        <div className="modal-overlay" onClick={() => { if (!submittingClientDelete) setShowRequestClientDeleteModal(false); }}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Request Client Deletion</h2>
                <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                  Explain why you want to delete this client's profile.
                </p>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowRequestClientDeleteModal(false)}
                disabled={submittingClientDelete}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRequestClientDelete} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="client-delete-reason">Reason for Deletion</label>
                <textarea
                  id="client-delete-reason"
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder="Why are you requesting deletion? (Optional)"
                  value={clientDeleteReason}
                  onChange={(e) => setClientDeleteReason(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 0, paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRequestClientDeleteModal(false)}
                  disabled={submittingClientDelete}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-danger"
                  disabled={submittingClientDelete}
                >
                  {submittingClientDelete ? 'Submitting...' : 'Submit Delete Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Summary Delete Modal */}
      {deletingSummary && (
        <div className="modal-overlay" onClick={() => { if (!submittingSummaryDelete) setDeletingSummary(null); }}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Request Summary Deletion</h2>
                <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                  Explain why this summary should be deleted.
                </p>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setDeletingSummary(null)}
                disabled={submittingSummaryDelete}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRequestSummaryDelete} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="summary-delete-reason">Reason for Deletion</label>
                <textarea
                  id="summary-delete-reason"
                  className="form-input"
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder="Why are you requesting deletion? (Optional)"
                  value={summaryDeleteReason}
                  onChange={(e) => setSummaryDeleteReason(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 0, paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeletingSummary(null)}
                  disabled={submittingSummaryDelete}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-danger"
                  disabled={submittingSummaryDelete}
                >
                  {submittingSummaryDelete ? 'Submitting...' : 'Submit Delete Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDetailsPage;
