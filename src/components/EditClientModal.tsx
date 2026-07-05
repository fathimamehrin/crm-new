import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, User, Phone, Mail, ClipboardList, Folder } from 'lucide-react';
import { updateClient, getUsers, logActivity, createClientEditRequest, getTags, getClientStatuses, createClientStatus } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { Client, User as UserType, Tag, CustomStatus } from '../types';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  countryCode: z.string(),
  whatsappNumber: z.string()
    .min(4, 'WhatsApp number is too short')
    .max(15, 'WhatsApp number is too long')
    .regex(/^\d+$/, 'Must contain only digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternateContact: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  status: z.string(),
  assignedAgent: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional(),
  projectName: z.string().optional().or(z.literal('')),
  leadSource: z.string().optional().or(z.literal('')),
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

interface EditClientModalProps {
  client: Client;
  onClose: () => void;
  onUpdate: (updatedClient: Client) => void;
  onRequestSubmitted?: () => void;
}

const EditClientModal: React.FC<EditClientModalProps> = ({ client, onClose, onUpdate, onRequestSubmitted }) => {
  const { currentUser, userRole, userProfile } = useAuth();
  const [agents, setAgents] = useState<UserType[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(client.tags || []);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [showCustomStatusInput, setShowCustomStatusInput] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [creatingStatus, setCreatingStatus] = useState(false);

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const list = await getClientStatuses();
        setCustomStatuses(list);
      } catch (err) {
        console.error('Failed to load custom statuses:', err);
      }
    };
    loadStatuses();
  }, []);

  useEffect(() => {
    getTags().then(tags => {
      const clientTagIds = client.tags || [];
      const filtered = tags.filter(t => t.status === 'active' || clientTagIds.includes(t.id));
      setAllTags(filtered);
    }).catch(err => {
      console.error('Failed to load tags:', err);
    });
  }, [client]);

  // Parse whatsappNumber into countryCode and digits
  const parseWhatsApp = (num: string) => {
    let countryCode = '+91';
    let digits = num;

    if (num.startsWith('+')) {
      const possibleCodes = ['+91', '+1', '+44', '+971', '+966', '+61', '+65', '+968', '+974', '+965', '+973'];
      for (const code of possibleCodes) {
        if (num.startsWith(code)) {
          countryCode = code;
          digits = num.substring(code.length);
          break;
        }
      }
    } else if (num.startsWith('91') && num.length > 10) {
      countryCode = '+91';
      digits = num.substring(2);
    }
    return { countryCode, digits };
  };

  const { countryCode, digits } = parseWhatsApp(client.whatsappNumber);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: client.name,
      countryCode,
      whatsappNumber: digits,
      email: client.email || '',
      alternateContact: client.alternateContact || '',
      notes: client.notes || '',
      status: client.status,
      assignedAgent: client.assignedAgent || '',
      address: client.address || '',
      createdAt: client.createdAt ? new Date(client.createdAt).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      projectName: client.projectName || '',
      leadSource: client.leadSource || '',
    },
  });

  const selectedStatus = watch('status');
  const isLead = selectedStatus?.toLowerCase().includes('lead');

  useEffect(() => {
    if (userRole === 'admin') {
      const loadAgents = async () => {
        setLoadingAgents(true);
        try {
          const list = await getUsers('agent');
          setAgents(list);
        } catch (err) {
          console.error('Failed to load agents:', err);
          toast.error('Failed to load agent assignment dropdown');
        } finally {
          setLoadingAgents(false);
        }
      };
      loadAgents();
    }
  }, [userRole]);

  const [reason, setReason] = useState('');

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const fullWhatsAppNumber = data.countryCode + data.whatsappNumber;
      
      // Resolve agent name if updated by admin
      let assignedAgentName = client.assignedAgentName;
      if (userRole === 'admin' && data.assignedAgent !== client.assignedAgent) {
        if (data.assignedAgent) {
          const agentObj = agents.find((a) => a.id === data.assignedAgent);
          assignedAgentName = agentObj ? agentObj.name : '';
        } else {
          assignedAgentName = '';
        }
      }

      const selectedDate = data.createdAt ? new Date(data.createdAt + 'T00:00:00') : new Date();
      const updatedFields: Partial<Client> & { createdAt?: Date } = {
        name: data.name,
        whatsappNumber: fullWhatsAppNumber,
        email: data.email || '',
        alternateContact: data.alternateContact || '',
        notes: data.notes || '',
        status: data.status,
        address: data.address || '',
        tags: selectedTags,
        createdAt: selectedDate,
        projectName: data.projectName || '',
        leadSource: isLead ? (data.leadSource || '') : '',
      };

      if (userRole === 'admin') {
        updatedFields.assignedAgent = data.assignedAgent || '';
        updatedFields.assignedAgentName = assignedAgentName;
        
        await updateClient(client.id, updatedFields);

        // Log update action
        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'client_updated',
          entityType: 'client',
          entityId: client.id,
          entityName: data.name,
        });

        // Pass updated object back
        onUpdate({
          ...client,
          ...updatedFields,
        });

        toast.success('Client details updated successfully');
      } else {
        // Agent submits proposed changes as edit request
        const proposedChanges: Partial<Client> = { ...updatedFields };

        await createClientEditRequest(client.id, {
          clientId: client.id,
          clientName: client.name,
          agentId: currentUser!.uid,
          agentName: userProfile?.name || 'Agent',
          reason: reason.trim() || 'Client details update request',
          requestType: 'edit',
          proposedChanges,
        });

        await logActivity({
          userId: currentUser!.uid,
          userName: userProfile?.name,
          action: 'client_updated',
          entityType: 'client',
          entityId: client.id,
          entityName: `${data.name} (Edit request submitted)`,
        });

        toast.success('Edit request submitted to Admin');
        onRequestSubmitted?.();
      }
      onClose();
    } catch (err) {
      console.error('Failed to update client details:', err);
      toast.error('Failed to update client details');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = userRole === 'admin';

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Edit Client Details</h2>
            <p className="text-sm text-muted" style={{ marginTop: 4 }}>Update client profile information</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="grid grid-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {/* Left Side fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Name */}
              <div className="form-group">
                <label className="form-label required" htmlFor="client-name-input">Client Name</label>
                <div className="search-wrapper">
                  <User className="search-icon" size={16} />
                  <input
                    id="client-name-input"
                    type="text"
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder="Enter name"
                    {...register('name')}
                  />
                </div>
                {errors.name && <span className="form-error">{errors.name.message}</span>}
              </div>

              {/* Project Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-project-name-input">Project Name / Context</label>
                <div className="search-wrapper">
                  <Folder className="search-icon" size={16} />
                  <input
                    id="client-project-name-input"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Downtown Residency, candidate hiring"
                    {...register('projectName')}
                  />
                </div>
              </div>

              {/* WhatsApp Number */}
              <div className="form-group">
                <label className="form-label required" htmlFor="client-whatsapp-input">WhatsApp Number</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    id="client-whatsapp-country"
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
                      id="client-whatsapp-input"
                      type="tel"
                      className={`form-input ${errors.whatsappNumber ? 'error' : ''}`}
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

              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-email-input">Email Address</label>
                <div className="search-wrapper">
                  <Mail className="search-icon" size={16} />
                  <input
                    id="client-email-input"
                    type="text"
                    className={`form-input ${errors.email ? 'error' : ''}`}
                    placeholder="name@example.com"
                    {...register('email')}
                  />
                </div>
                {errors.email && <span className="form-error">{errors.email.message}</span>}
              </div>

              {/* Alternate Contact */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-alt-input">Alternate Contact</label>
                <div className="search-wrapper">
                  <Phone className="search-icon" size={16} />
                  <input
                    id="client-alt-input"
                    type="tel"
                    className={`form-input ${errors.alternateContact ? 'error' : ''}`}
                    placeholder="Alt number / Landline"
                    {...register('alternateContact')}
                  />
                </div>
                {errors.alternateContact && <span className="form-error">{errors.alternateContact.message}</span>}
              </div>
            </div>

            {/* Right Side fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>


              {/* Status */}
              <div className="form-group">
                <label className="form-label required" htmlFor="client-status-select">Status</label>
                <div className="search-wrapper">
                  <ClipboardList className="search-icon" size={16} />
                  <select
                    id="client-status-select"
                    className="form-input form-select"
                    style={{ paddingLeft: '2.5rem' }}
                    {...register('status', {
                      onChange: (e) => {
                        if (e.target.value === 'add-custom-status') {
                          setShowCustomStatusInput(true);
                          // Temporarily restore the select value to match client status so form is not dirty/invalid
                          setValue('status', client.status);
                        }
                      }
                    })}
                  >
                    <option value="active">Active</option>
                    <option value="lead">Lead</option>
                    <option value="inactive">Inactive</option>
                    <option value="closed">Closed</option>
                    {customStatuses.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                    <option value="add-custom-status">+ Add Custom Status...</option>
                  </select>
                </div>
                {showCustomStatusInput && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '8px',
                    padding: '12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-border)'
                  }}>
                    <label className="form-label required" htmlFor="new-status-name-input" style={{ fontSize: 'var(--font-size-xs)' }}>
                      New Custom Status Name
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="new-status-name-input"
                        type="text"
                        className="form-input"
                        style={{ flex: 1, padding: '6px 12px', fontSize: 'var(--font-size-sm)' }}
                        placeholder="e.g. Follow-up"
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        maxLength={30}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ padding: '0 12px', minHeight: 'auto' }}
                        disabled={creatingStatus}
                        onClick={async () => {
                          const nameTrimmed = newStatusName.trim();
                          if (!nameTrimmed) {
                            toast.error('Status name cannot be empty');
                            return;
                          }
                          
                          // Check for duplicates
                          const isDup = ['active', 'inactive', 'lead', 'closed'].includes(nameTrimmed.toLowerCase()) ||
                            customStatuses.some(s => s.name.toLowerCase() === nameTrimmed.toLowerCase());
                          if (isDup) {
                            toast.error('This status already exists');
                            return;
                          }

                          setCreatingStatus(true);
                          try {
                            await createClientStatus(nameTrimmed);
                            toast.success('Custom status added');
                            const updatedList = await getClientStatuses();
                            setCustomStatuses(updatedList);
                            setValue('status', nameTrimmed, { shouldDirty: true, shouldValidate: true });
                            setNewStatusName('');
                            setShowCustomStatusInput(false);
                          } catch (err) {
                            console.error('Failed to create status:', err);
                            toast.error('Failed to create status');
                          } finally {
                            setCreatingStatus(false);
                          }
                        }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0 12px', minHeight: 'auto' }}
                        onClick={() => {
                          setShowCustomStatusInput(false);
                          setNewStatusName('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isLead && (
                <div className="form-group">
                  <label className="form-label" htmlFor="client-lead-source-input">Lead Source</label>
                  <input
                    id="client-lead-source-input"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Google, Facebook, Instagram, Referral"
                    list="edit-lead-sources-list"
                    {...register('leadSource')}
                  />
                  <datalist id="edit-lead-sources-list">
                    <option value="Google Search" />
                    <option value="Facebook Ads" />
                    <option value="Instagram" />
                    <option value="LinkedIn" />
                    <option value="Referral" />
                    <option value="Cold Call" />
                    <option value="WhatsApp" />
                    <option value="Website" />
                    <option value="Event/Exhibition" />
                  </datalist>
                </div>
              )}

              {/* Assigned Agent (Admin Only) */}
              {isAdmin ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="client-agent-select">Assigned Agent</label>
                  <div className="search-wrapper">
                    <User className="search-icon" size={16} />
                    <select
                      id="client-agent-select"
                      className="form-input form-select"
                      style={{ paddingLeft: '2.5rem' }}
                      disabled={loadingAgents}
                      {...register('assignedAgent')}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {/* Lead Creation Date */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-created-at-edit">Lead Creation Date</label>
                <input
                  id="client-created-at-edit"
                  type="date"
                  className="form-input"
                  {...register('createdAt')}
                />
                <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                  Allows correcting the creation date for this contact.
                </p>
              </div>

              {/* Notes / Bio */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-notes-input">Notes / Bio</label>
                <textarea
                  id="client-notes-input"
                  className="form-input"
                  rows={isAdmin ? 2 : 4}
                  style={{ resize: 'vertical' }}
                  placeholder="Bio, client requirements, or details..."
                  {...register('notes')}
                />
              </div>
          </div>
        </div>

        {/* Tags Selection */}
        <div className="form-group" style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
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

          {/* Reason for Edit (Agent Only) */}
          {!isAdmin && (
            <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
              <label className="form-label" htmlFor="edit-reason">Reason for Edit / Justification (Optional)</label>
              <textarea
                id="edit-reason"
                className="form-input"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you making these changes? (Optional)"
              />
            </div>
          )}

          <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClientModal;
