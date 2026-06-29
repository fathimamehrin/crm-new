import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, User, Phone, Mail, ClipboardList } from 'lucide-react';
import { updateClient, getUsers, logActivity, createClientEditRequest } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { Client, User as UserType } from '../types';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  countryCode: z.string(),
  whatsappNumber: z.string().regex(/^\d{10}$/, 'WhatsApp number must be exactly 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternateContact: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'lead', 'closed']),
  assignedAgent: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

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

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
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
    },
  });

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

      const updatedFields: Partial<Client> = {
        name: data.name,
        whatsappNumber: fullWhatsAppNumber,
        email: data.email || '',
        alternateContact: data.alternateContact || '',
        notes: data.notes || '',
        status: data.status,
        address: data.address || '',
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
                      placeholder="10-digit number"
                      maxLength={10}
                      {...register('whatsappNumber')}
                      onPaste={(e) => {
                        const pastedText = e.clipboardData.getData('text');
                        const clean = pastedText.replace(/[^\d+]/g, '');
                        const possibleCodes = ['+91', '+1', '+44', '+971', '+966', '+61', '+65', '+968', '+974', '+965', '+973'];
                        let matchedCode = '';
                        let remainingNumber = clean;

                        for (const code of possibleCodes) {
                          if (clean.startsWith(code)) {
                            matchedCode = code;
                            remainingNumber = clean.substring(code.length);
                            break;
                          }
                        }

                        if (!matchedCode) {
                          for (const code of possibleCodes) {
                            const codeWithoutPlus = code.replace('+', '');
                            if (clean.startsWith(codeWithoutPlus) && clean.length > 10) {
                              matchedCode = code;
                              remainingNumber = clean.substring(codeWithoutPlus.length);
                              break;
                            }
                          }
                        }

                        if (!matchedCode && clean.startsWith('0') && clean.length === 11) {
                          e.preventDefault();
                          setValue('whatsappNumber', clean.substring(1), { shouldDirty: true, shouldValidate: true });
                          return;
                        }

                        if (matchedCode) {
                          e.preventDefault();
                          setValue('countryCode', matchedCode, { shouldDirty: true, shouldValidate: true });
                          setValue('whatsappNumber', remainingNumber.slice(0, 10), { shouldDirty: true, shouldValidate: true });
                        }
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

              {/* Address */}
              <div className="form-group">
                <label className="form-label" htmlFor="client-address-input">Address</label>
                <input
                  id="client-address-input"
                  type="text"
                  className="form-input"
                  placeholder="Client address"
                  {...register('address')}
                />
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
                    {...register('status')}
                  >
                    <option value="active">Active</option>
                    <option value="lead">Lead</option>
                    <option value="inactive">Inactive</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

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
