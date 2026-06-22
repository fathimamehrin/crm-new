export type UserRole = 'admin' | 'agent';
export type UserStatus = 'active' | 'disabled';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'failed';
export type ClientStatus = 'active' | 'inactive' | 'lead' | 'closed';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

export interface Client {
  id: string;
  profileImage?: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  alternateContact?: string;
  address?: string;
  notes?: string;
  assignedAgent?: string;
  assignedAgentName?: string;
  status: ClientStatus;
  createdAt: Date;
  createdBy: string;
}

export interface PaymentDetails {
  amount?: number;
  status?: PaymentStatus;
  screenshotUrl?: string;
  transactionId?: string;
  notes?: string;
}

export interface Summary {
  id: string;
  clientId: string;
  summaryText: string;
  voiceUrl?: string;
  documents: DocumentFile[];
  paymentDetails?: PaymentDetails;
  createdAt: Date;
  updatedAt?: Date;
  createdBy: string;
  createdByName?: string;
}

export interface DocumentFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface Payment {
  id: string;
  clientId: string;
  amount: number;
  screenshotUrl?: string;
  transactionId?: string;
  notes?: string;
  status: PaymentStatus;
  createdAt: Date;
  createdBy: string;
}

export type ActivityAction =
  | 'client_created'
  | 'client_updated'
  | 'client_assigned'
  | 'summary_added'
  | 'summary_updated'
  | 'payment_updated'
  | 'agent_created'
  | 'agent_updated'
  | 'agent_enabled'
  | 'agent_disabled'
  | 'admin_created'
  | 'admin_enabled'
  | 'admin_disabled'
  | 'user_login'
  | 'user_logout';

export type EntityType = 'client' | 'summary' | 'payment' | 'user';

export interface ActivityLog {
  id: string;
  userId: string;
  userName?: string;
  action: ActivityAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  createdAt: Date;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  link?: string;
}

export interface FilterOptions {
  search: string;
  agentId: string;
  status: ClientStatus | '';
  paymentStatus: PaymentStatus | '';
  dateFrom: string;
  dateTo: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface EditRequest {
  id: string; // Equals summaryId
  clientId: string;
  clientName: string;
  summaryId: string;
  summaryText: string; // Original summary text
  requestType?: 'edit' | 'delete';
  proposedChanges?: {
    summaryText?: string;
    paymentDetails?: PaymentDetails;
  };
  agentId: string;
  agentName: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: Date;
  updatedAt?: Date;
}

export interface ClientEditRequest {
  id: string; // Equals clientId
  clientId: string;
  clientName: string;
  requestType?: 'edit' | 'delete';
  proposedChanges?: {
    name?: string;
    whatsappNumber?: string;
    email?: string;
    alternateContact?: string;
    address?: string;
    notes?: string;
    status?: ClientStatus;
    assignedAgent?: string;
    assignedAgentName?: string;
  };
  agentId: string;
  agentName: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: Date;
  updatedAt?: Date;
}


