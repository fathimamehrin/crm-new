import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Phone } from 'lucide-react';
import { getClientByWhatsApp } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const schema = z.object({
  countryCode: z.string(),
  whatsappNumber: z
    .string()
    .regex(/^\d{10}$/, 'WhatsApp number must be exactly 10 digits'),
});
type FormData = z.infer<typeof schema>;

interface AddClientModalProps {
  onClose: () => void;
}

const AddClientModal: React.FC<AddClientModalProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { userRole } = useAuth();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { countryCode: '+91' },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const fullWhatsAppNumber = data.countryCode + data.whatsappNumber;
      const existing = await getClientByWhatsApp(fullWhatsAppNumber);
      if (existing) {
        toast.success('Client already exists. Opening existing record.');
        const isAdmin = userRole === 'admin';
        navigate(isAdmin ? `/admin/clients/${existing.id}` : `/clients/${existing.id}`);
        onClose();
      } else {
        navigate('/clients/new', { state: { whatsappNumber: data.whatsappNumber, countryCode: data.countryCode } });
        onClose();
      }
    } catch {
      toast.error('Error checking WhatsApp number');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Add Client</h2>
            <p className="text-sm text-muted" style={{ marginTop: 4 }}>Enter WhatsApp number to check existing clients</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="form-group">
            <label className="form-label required" htmlFor="whatsapp-check">WhatsApp Number</label>
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
                  id="whatsapp-check"
                  type="tel"
                  className={`form-input ${errors.whatsappNumber ? 'error' : ''}`}
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="10-digit number"
                  maxLength={10}
                  {...register('whatsappNumber')}
                />
              </div>
            </div>
            {errors.whatsappNumber && (
              <span className="form-error">{errors.whatsappNumber.message}</span>
            )}
            <span className="form-hint">We'll check if this client already exists in the system.</span>
          </div>

          <div className="modal-footer" style={{ marginTop: 0, paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              id="whatsapp-check-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Checking…</> : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientModal;
