import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Phone } from 'lucide-react';
import { getClientByWhatsApp } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

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
    digits: clean,
  };
};

const schema = z.object({
  countryCode: z.string(),
  whatsappNumber: z
    .string()
    .regex(/^\d{7,15}$/, 'WhatsApp number must be between 7 and 15 digits'),
});
type FormData = z.infer<typeof schema>;

interface AddClientModalProps {
  onClose: () => void;
}

const AddClientModal: React.FC<AddClientModalProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { userRole } = useAuth();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
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
                  placeholder="WhatsApp number"
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
