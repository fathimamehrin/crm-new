export type UserRole = 'admin' | 'agent';
export type UserStatus = 'active' | 'disabled';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'failed';
export type ClientStatus = string;

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  allowedTaskTypes?: ('payment' | 'follow_up' | 'general' | 'salary')[];
  allowedModules?: string[]; // e.g. ['clients', 'tasks', 'packages', 'calendar', 'analytics', 'salaries']
  allowedTags?: string[];
  allowedLeadSources?: string[];
  clientVisibilityScope?: 'all' | 'assigned_only';
  analyticsVisibilityScope?: 'all' | 'own_only' | 'none';
  // Staff Salary & Compensation Structure
  jobTitle?: string;                     // Developer, Sales Agent, Manager, Commission Worker, etc.
  payStructure?: 'fixed' | 'commission' | 'hybrid';
  baseSalary?: number;                   // Monthly fixed base rate
  commissionRate?: number;               // Commission percentage or fixed bonus per sale
  payoutDayOfMonth?: number;             // Payout day (1-31)
  bankDetails?: string;
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
  createdAt: Date;          // The "date of lead" — user-selectable, when the lead originally came in
  addedByAgentAt?: Date;    // System timestamp of when the agent added/created this record
  assignedAt?: Date;        // System timestamp of when the lead was (last) assigned to an agent
  createdBy: string;
  tags?: string[];
  projectName?: string;
  leadSource?: string;
  paymentStatus?: string;
}

export interface PaymentDetails {
  amount?: number;
  status?: PaymentStatus;
  screenshotUrl?: string | null;
  transactionId?: string;
  notes?: string;
}

export interface Summary {
  id: string;
  clientId: string;
  summaryText: string;
  voiceUrl?: string | null;
  documents: DocumentFile[];
  paymentDetails?: PaymentDetails | null;
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
  | 'user_logout'
  | 'tag_created'
  | 'tag_updated'
  | 'tag_enabled'
  | 'tag_disabled'
  | 'task_created'
  | 'task_accepted'
  | 'task_rejected'
  | 'task_completed'
  | 'task_reassign_requested'
  | 'task_reassign_approved'
  | 'task_reassign_rejected'
  | 'task_verified'
  | 'status_created'
  | 'status_updated'
  | 'status_deleted'
  | 'source_created'
  | 'source_updated'
  | 'source_deleted'
  | 'admin_note_added'
  | 'admin_note_updated'
  | 'admin_note_deleted'
  | 'tag_message_sent';

export type EntityType = 'client' | 'summary' | 'payment' | 'user' | 'tag' | 'task' | 'status' | 'source' | 'admin_note' | 'tag_template';

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
  tags: string[];
  leadSource?: string;
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
    voiceUrl?: string | null;
    documents?: DocumentFile[];
    paymentDetails?: PaymentDetails | null;
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
    leadSource?: string;
  };
  agentId: string;
  agentName: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: Date;
  updatedAt?: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string; // Hex color code
  status: 'active' | 'disabled';
  createdAt: Date;
  order?: number;
}

export interface CustomStatus {
  id: string;
  name: string;
  color: string; // Hex color code
  status: 'active' | 'disabled';
  createdAt: Date;
}

export interface LeadSource {
  id: string;
  name: string;
  color: string; // Hex color code
  status: 'active' | 'disabled';
  createdAt: Date;
}

// ─── Task Workflow Types ───
export type TaskStatus =
  | 'pending_acceptance'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'pending_reassignment'
  | 'verified';

export type TaskHistoryAction =
  | 'created'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'reassign_requested'
  | 'reassign_approved'
  | 'reassign_rejected'
  | 'verified'
  | 'deleted';

export interface TaskHistoryItem {
  timestamp: Date;
  action: TaskHistoryAction;
  performedBy: string; // user ID
  performedByName: string; // user name
  details?: string; // reason or reassign info
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  assignedTo: string;
  assignedToName: string;
  status: TaskStatus;
  rejectReason?: string;
  reassignReason?: string;
  reassignRequestedTo?: string;
  reassignRequestedToName?: string;
  completionSummary?: string;
  createdAt: Date;
  history: TaskHistoryItem[];
  type?: 'payment' | 'follow_up' | 'general' | 'salary';
  clientId?: string;
  clientName?: string;
  voiceUrl?: string;
  dueDate?: Date;
  reminderDateTime?: Date;
}


// ─── Packages ─────────────────────────────────────────────────────────────────
export type PackagePaymentType = 'direct' | 'associated';
export type PackageCategory = 'company_registration' | 'startup' | 'service' | 'other';

export interface PackageCostComponent {
  label: string;   // e.g. "Base Service Cost", "Agent Commission", "VAT"
  amount: number;
}

export interface PackageService {
  id: string;
  name: string;
  category: PackageCategory;
  description?: string;
  paymentType: PackagePaymentType;
  // For direct payments — single fixed rate, visible to all
  fixedRate?: number;
  // For associated payments — admin sees full breakdown, agents see only totalClientPrice
  costComponents?: PackageCostComponent[];  // flexible list of cost items
  totalClientPrice?: number;                 // final quoted amount for the client
  // Quarterly review tracking
  lastReviewedAt?: Date;
  lastReviewedBy?: string;
  lastReviewedByName?: string;
  // Meta
  status: 'active' | 'archived';
  createdAt: Date;
  createdBy: string;
  createdByName?: string;
  updatedAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
}

// ─── Salary & Commission Records ──────────────────────────────────────────────
export type SalaryStatus = 'pending' | 'paid' | 'overdue';

export interface SalaryRecord {
  id: string;
  userId: string;
  userName: string;
  month: string;                       // e.g. "2026-07"
  dueDate: Date;                        // Expected payout date
  payStructure: 'fixed' | 'commission' | 'hybrid';
  baseSalary: number;
  commissionEarned: number;
  totalAmount: number;
  status: SalaryStatus;
  paidAt?: Date;                        // Actual payment date (prompted if delayed)
  paidBy?: string;
  paidByName?: string;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  taskId?: string;                      // Associated automated salary task ID
}

// ─── Admin Notes ──────────────────────────────────────────────────────────────
/**
 * Admin-private sticky notes on a lead profile.
 * Not visible to agents.
 */
export interface AdminNote {
  id: string;
  clientId: string;
  text: string;
  isPinned: boolean;
  /** If this note was converted into a task, the task ID is stored here */
  linkedTaskId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ─── Tag Messaging Templates ──────────────────────────────────────────────────
/**
 * A messaging template associated with a tag.
 * `variations` are alternate phrasings — one is picked at random on each send
 * to reduce spam flag risk.
 */
export interface TagTemplate {
  id: string;
  tagId: string;
  tagName: string;
  /** Primary message text (used when no variation is selected) */
  templateText: string;
  /** Alternate phrasings for rotation */
  variations: string[];
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
}
