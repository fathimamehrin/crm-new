import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  QueryDocumentSnapshot,
  QueryConstraint,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { User, Client, Summary, Payment, ActivityLog, EditRequest, ClientEditRequest, Tag, CustomStatus, Task, TaskHistoryItem, LeadSource, TaskHistoryAction, ActivityAction } from '../types';

// ─── Lazy Collection References ───────────────────────────────────────────────
// Use functions to avoid crash when db is null (Firebase not yet configured)
const usersColRef    = () => collection(db, 'users');
const clientsColRef  = () => collection(db, 'clients');
const summariesColRef= () => collection(db, 'summaries');
const paymentsColRef = () => collection(db, 'payments');
const logsColRef     = () => collection(db, 'activityLogs');
const editRequestsColRef = () => collection(db, 'editRequests');
const clientEditRequestsColRef = () => collection(db, 'clientEditRequests');
const tagsColRef = () => collection(db, 'tags');
const clientStatusesColRef = () => collection(db, 'clientStatuses');
const tasksColRef = () => collection(db, 'tasks');
const leadSourcesColRef = () => collection(db, 'leadSources');

// Named exports kept for AddSummaryPage (uses addDoc(paymentsCol, ...))
// These are proxy objects; actual collection() call is deferred to function-call time
export const paymentsCol = { toString: () => 'payments' };

// ─── Converters ───────────────────────────────────────────────────────────────
const toDate = (val: Timestamp | Date | undefined): Date =>
  val instanceof Timestamp ? val.toDate() : val instanceof Date ? val : new Date();

type AnySnap = QueryDocumentSnapshot<any>;

export const userFromDoc = (snap: AnySnap): User => ({
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
} as User);

export const clientFromDoc = (snap: AnySnap): Client => ({
  id: snap.id,
  ...snap.data(),
  createdAt: toDate(snap.data().createdAt),
  addedByAgentAt: snap.data().addedByAgentAt ? toDate(snap.data().addedByAgentAt) : undefined,
  assignedAt: snap.data().assignedAt ? toDate(snap.data().assignedAt) : undefined,
} as Client);

export const summaryFromDoc = (snap: AnySnap): Summary => ({
  id: snap.id, ...snap.data(),
  createdAt: toDate(snap.data().createdAt),
  updatedAt: snap.data().updatedAt ? toDate(snap.data().updatedAt) : undefined,
  documents: snap.data().documents || [],
} as Summary);

export const paymentFromDoc = (snap: AnySnap): Payment => ({
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
} as Payment);

export const activityLogFromDoc = (snap: AnySnap): ActivityLog => ({
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
} as ActivityLog);

export const editRequestFromDoc = (snap: AnySnap): EditRequest => ({
  id: snap.id,
  ...snap.data(),
  createdAt: toDate(snap.data().createdAt),
  updatedAt: snap.data().updatedAt ? toDate(snap.data().updatedAt) : undefined,
} as EditRequest);

export const clientEditRequestFromDoc = (snap: AnySnap): ClientEditRequest => ({
  id: snap.id,
  ...snap.data(),
  createdAt: toDate(snap.data().createdAt),
  updatedAt: snap.data().updatedAt ? toDate(snap.data().updatedAt) : undefined,
} as ClientEditRequest);

export const tagFromDoc = (snap: AnySnap): Tag => ({
  id: snap.id,
  ...snap.data(),
  createdAt: toDate(snap.data().createdAt),
} as Tag);

export const customStatusFromDoc = (snap: AnySnap): CustomStatus => ({
  id: snap.id,
  name: snap.data().name,
  color: snap.data().color || '#6b7280',
  status: snap.data().status || 'active',
  createdAt: toDate(snap.data().createdAt),
} as CustomStatus);

export const leadSourceFromDoc = (snap: AnySnap): LeadSource => ({
  id: snap.id,
  name: snap.data().name,
  color: snap.data().color || '#6b7280',
  status: snap.data().status || 'active',
  createdAt: toDate(snap.data().createdAt),
} as LeadSource);

export const taskFromDoc = (snap: AnySnap): Task => {
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: toDate(data.createdAt),
    history: (data.history || []).map((h: any) => ({
      ...h,
      timestamp: toDate(h.timestamp),
    })),
  } as Task;
};

// Helper to recursively strip undefined properties so Firestore doesn't reject them
const cleanObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(cleanObject);
  }

  if (obj && typeof obj === 'object' && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null)) {
    const result: any = {};
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (val !== undefined) {
        result[key] = cleanObject(val);
      }
    });
    return result;
  }

  return obj;
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const getUserById = async (id: string): Promise<User | null> => {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return userFromDoc(snap as AnySnap);
};

export const getUsers = async (role?: 'admin' | 'agent'): Promise<User[]> => {
  const constraints: QueryConstraint[] = [];
  if (role) constraints.push(where('role', '==', role));
  const snap = await getDocs(query(usersColRef(), ...constraints));
  const users = snap.docs.map(userFromDoc);
  return users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const createUser = async (data: Omit<User, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(usersColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
};

export const updateUser = async (id: string, data: Partial<User>): Promise<void> => {
  await updateDoc(doc(db, 'users', id), cleanObject(data));
};

// ─── Clients ──────────────────────────────────────────────────────────────────
export const getClientByWhatsApp = async (number: string, agentId?: string): Promise<Client | null> => {
  // Extract digits
  const clean = number.replace(/\D/g, '');
  const tenDigit = clean.slice(-10);

  const searchValues = [number];
  if (tenDigit.length === 10) {
    searchValues.push(tenDigit);
    searchValues.push(`91${tenDigit}`);
    searchValues.push(`+91${tenDigit}`);
    const prefix = clean.slice(0, -10);
    if (prefix && prefix !== '91') {
      searchValues.push(`${prefix}${tenDigit}`);
      searchValues.push(`+${prefix}${tenDigit}`);
    }
  }

  const uniqueValues = Array.from(new Set(searchValues.filter(Boolean)));
  const constraints = [where('whatsappNumber', 'in', uniqueValues)];
  if (agentId) {
    constraints.push(where('assignedAgent', '==', agentId));
  }
  const snap = await getDocs(query(clientsColRef(), ...constraints));
  if (snap.empty) return null;
  return clientFromDoc(snap.docs[0] as AnySnap);
};

export const getClients = async (
  constraints: QueryConstraint[] = [],
  _pageSize = 25,
  _lastDoc?: AnySnap
): Promise<{ clients: Client[]; lastDoc: AnySnap | null }> => {
  const snap = await getDocs(query(clientsColRef(), ...constraints));
  const clients = snap.docs.map(clientFromDoc);
  clients.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { clients, lastDoc: null };
};

export const createClient = async (data: Omit<Client, 'id' | 'createdAt'> & { createdAt?: Date }): Promise<string> => {
  const ref = await addDoc(clientsColRef(), cleanObject({
    ...data,
    createdAt: data.createdAt || serverTimestamp(),
  }));
  return ref.id;
};

export const updateClient = async (id: string, data: Partial<Client>): Promise<void> => {
  await updateDoc(doc(db, 'clients', id), cleanObject(data));
};

export const getClientById = async (id: string): Promise<Client | null> => {
  const snap = await getDoc(doc(db, 'clients', id));
  if (!snap.exists()) return null;
  return clientFromDoc(snap as AnySnap);
};

// ─── Summaries ────────────────────────────────────────────────────────────────
export const getSummariesByClient = async (clientId: string): Promise<Summary[]> => {
  const snap = await getDocs(
    query(summariesColRef(), where('clientId', '==', clientId))
  );
  const summaries = snap.docs.map(summaryFromDoc);
  return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const createSummary = async (data: Omit<Summary, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(summariesColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
};

export const updateSummary = async (id: string, data: Partial<Summary>): Promise<void> => {
  await updateDoc(doc(db, 'summaries', id), cleanObject({
    ...data,
    updatedAt: serverTimestamp(),
  }));
};

// ─── Tags ────────────────────────────────────────────────────────────────────
export const getTags = async (): Promise<Tag[]> => {
  const snap = await getDocs(tagsColRef());
  const tags = snap.docs.map(tagFromDoc);
  return tags.sort((a, b) => {
    const aOrder = a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
};

export const createTag = async (data: Omit<Tag, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(tagsColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
};

export const updateTag = async (id: string, data: Partial<Tag>): Promise<void> => {
  await updateDoc(doc(db, 'tags', id), cleanObject(data));
};

// ─── Client Statuses ──────────────────────────────────────────────────────────
export const getClientStatuses = async (): Promise<CustomStatus[]> => {
  const snap = await getDocs(clientStatusesColRef());
  let statuses = snap.docs.map(customStatusFromDoc);
  if (statuses.length === 0) {
    const refetch = await getDocs(clientStatusesColRef());
    if (refetch.docs.length === 0) {
      const defaults = [
        { name: 'Active', color: '#10b981' },
        { name: 'Inactive', color: '#6b7280' },
        { name: 'Lead', color: '#f59e0b' },
        { name: 'Closed', color: '#ef4444' },
      ];
      for (const d of defaults) {
        await createClientStatus(d.name, d.color);
      }
      const snapRefreshed = await getDocs(clientStatusesColRef());
      statuses = snapRefreshed.docs.map(customStatusFromDoc);
    } else {
      statuses = refetch.docs.map(customStatusFromDoc);
    }
  }

  // Deduplicate by case-insensitive name to hide any duplicate DB records
  const uniqueStatuses: CustomStatus[] = [];
  const seen = new Set<string>();
  for (const s of statuses) {
    const key = s.name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStatuses.push(s);
    }
  }

  return uniqueStatuses.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

export const createClientStatus = async (name: string, color: string): Promise<string> => {
  const ref = await addDoc(clientStatusesColRef(), cleanObject({
    name,
    color,
    status: 'active',
    createdAt: serverTimestamp(),
  }));
  return ref.id;
};

export const updateClientStatus = async (
  id: string, 
  data: { name: string; color: string; status: 'active' | 'disabled' },
  oldName?: string
): Promise<void> => {
  await updateDoc(doc(db, 'clientStatuses', id), cleanObject(data));

  if (oldName && oldName.trim() !== data.name.trim()) {
    const q = query(clientsColRef(), where('status', '==', oldName.trim()));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { status: data.name.trim() });
    });
    await batch.commit();
  }
};

export const deleteClientStatus = async (id: string, name: string): Promise<void> => {
  await deleteDoc(doc(db, 'clientStatuses', id));

  const q = query(clientsColRef(), where('status', '==', name));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(docSnap => {
    batch.update(docSnap.ref, { status: 'Active' });
  });
  await batch.commit();
};

// ─── Lead Sources ───────────────────────────────────────────────────────────
export const getLeadSources = async (): Promise<LeadSource[]> => {
  const snap = await getDocs(leadSourcesColRef());
  let sources = snap.docs.map(leadSourceFromDoc);
  if (sources.length === 0) {
    const refetch = await getDocs(leadSourcesColRef());
    if (refetch.docs.length === 0) {
      const defaults = [
        { name: 'Google', color: '#3b82f6' },
        { name: 'Facebook', color: '#6366f1' },
        { name: 'Referral', color: '#a855f7' },
        { name: 'Other', color: '#6b7280' },
      ];
      for (const d of defaults) {
        await createLeadSource(d.name, d.color);
      }
      const snapRefreshed = await getDocs(leadSourcesColRef());
      sources = snapRefreshed.docs.map(leadSourceFromDoc);
    } else {
      sources = refetch.docs.map(leadSourceFromDoc);
    }
  }

  // Deduplicate by case-insensitive name to hide duplicate DB records
  const uniqueSources: LeadSource[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const key = s.name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSources.push(s);
    }
  }

  return uniqueSources.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

export const createLeadSource = async (name: string, color: string): Promise<string> => {
  const ref = await addDoc(leadSourcesColRef(), cleanObject({
    name,
    color,
    status: 'active',
    createdAt: serverTimestamp(),
  }));
  return ref.id;
};

export const updateLeadSource = async (
  id: string,
  data: { name: string; color: string; status: 'active' | 'disabled' },
  oldName?: string
): Promise<void> => {
  await updateDoc(doc(db, 'leadSources', id), cleanObject(data));

  if (oldName && oldName.trim() !== data.name.trim()) {
    const q = query(clientsColRef(), where('leadSource', '==', oldName.trim()));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { leadSource: data.name.trim() });
    });
    await batch.commit();
  }
};

export const deleteLeadSource = async (id: string, name: string): Promise<void> => {
  await deleteDoc(doc(db, 'leadSources', id));

  const q = query(clientsColRef(), where('leadSource', '==', name));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(docSnap => {
    batch.update(docSnap.ref, { leadSource: '' });
  });
  await batch.commit();
};

export const deleteTag = async (id: string): Promise<void> => {
  // Delete the tag document
  await deleteDoc(doc(db, 'tags', id));
  
  // Find and update all clients with this tag
  const q = query(clientsColRef(), where('tags', 'array-contains', id));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(docSnap => {
    const clientData = docSnap.data();
    const updatedTags = (clientData.tags || []).filter((tagId: string) => tagId !== id);
    batch.update(docSnap.ref, { tags: updatedTags });
  });
  await batch.commit();
};

// ─── Payments ────────────────────────────────────────────────────────────────
export const createPayment = async (data: Omit<Payment, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(paymentsColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
};

// ─── Activity Logs ────────────────────────────────────────────────────────────
export const logActivity = async (
  data: Omit<ActivityLog, 'id' | 'createdAt'>
): Promise<void> => {
  await addDoc(logsColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
};

export const getActivityLogs = async (
  constraints: QueryConstraint[] = [],
  pageSize = 50
): Promise<ActivityLog[]> => {
  const snap = await getDocs(query(logsColRef(), ...constraints));
  const logs = snap.docs.map(activityLogFromDoc);
  logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return logs.slice(0, pageSize);
};

// ─── Edit Requests ────────────────────────────────────────────────────────────
export const createEditRequest = async (
  summaryId: string,
  data: Omit<EditRequest, 'id' | 'createdAt' | 'status'>
): Promise<void> => {
  const docRef = doc(db, 'editRequests', summaryId);
  // Delete any existing request first so Firestore treats setDoc as a "create"
  // (avoids permission errors when overwriting a previous request)
  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await deleteDoc(docRef);
    }
  } catch {
    // Ignore – if delete fails, the setDoc below may still succeed
  }
  await setDoc(docRef, cleanObject({
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  }));
};

export const getEditRequest = async (summaryId: string): Promise<EditRequest | null> => {
  const snap = await getDoc(doc(db, 'editRequests', summaryId));
  if (!snap.exists()) return null;
  return editRequestFromDoc(snap as AnySnap);
};

export const getAllEditRequests = async (status?: string): Promise<EditRequest[]> => {
  const constraints: QueryConstraint[] = [];
  if (status) constraints.push(where('status', '==', status));
  const snap = await getDocs(query(editRequestsColRef(), ...constraints));
  const requests = snap.docs.map(editRequestFromDoc);
  return requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const updateEditRequestStatus = async (
  summaryId: string,
  status: 'approved' | 'rejected' | 'completed'
): Promise<void> => {
  if (status === 'approved') {
    const req = await getEditRequest(summaryId);
    if (req) {
      if (req.requestType === 'delete') {
        await deleteDoc(doc(db, 'summaries', summaryId));
      } else {
        if (req.proposedChanges) {
          await updateDoc(doc(db, 'summaries', summaryId), cleanObject({
            ...req.proposedChanges,
            updatedAt: serverTimestamp(),
          }));
        }
      }
    }
  }

  await updateDoc(doc(db, 'editRequests', summaryId), cleanObject({
    status,
    updatedAt: serverTimestamp(),
  }));
};

// ─── Client Edit Requests ─────────────────────────────────────────────────────
export const createClientEditRequest = async (
  clientId: string,
  data: Omit<ClientEditRequest, 'id' | 'createdAt' | 'status'>
): Promise<void> => {
  const docRef = doc(db, 'clientEditRequests', clientId);
  // Delete any existing request first so Firestore treats setDoc as a "create"
  // (avoids permission errors when overwriting a previous request)
  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await deleteDoc(docRef);
    }
  } catch {
    // Ignore – if delete fails, the setDoc below may still succeed
  }
  await setDoc(docRef, cleanObject({
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  }));
};

export const getClientEditRequest = async (clientId: string): Promise<ClientEditRequest | null> => {
  const snap = await getDoc(doc(db, 'clientEditRequests', clientId));
  if (!snap.exists()) return null;
  return clientEditRequestFromDoc(snap as AnySnap);
};

export const getAllClientEditRequests = async (status?: string): Promise<ClientEditRequest[]> => {
  const constraints: QueryConstraint[] = [];
  if (status) constraints.push(where('status', '==', status));
  const snap = await getDocs(query(clientEditRequestsColRef(), ...constraints));
  const requests = snap.docs.map(clientEditRequestFromDoc);
  return requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const updateClientEditRequestStatus = async (
  clientId: string,
  status: 'approved' | 'rejected' | 'completed'
): Promise<void> => {
  if (status === 'approved') {
    const req = await getClientEditRequest(clientId);
    if (req) {
      if (req.requestType === 'delete') {
        await deleteDoc(doc(db, 'clients', clientId));
      } else {
        if (req.proposedChanges) {
          await updateDoc(doc(db, 'clients', clientId), cleanObject(req.proposedChanges));
        }
      }
    }
  }

  await updateDoc(doc(db, 'clientEditRequests', clientId), cleanObject({
    status,
    updatedAt: serverTimestamp(),
  }));
};

export const getAllSummaries = async (): Promise<Summary[]> => {
  const snap = await getDocs(summariesColRef());
  const summaries = snap.docs.map(summaryFromDoc);
  return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getAllActivityLogs = async (): Promise<ActivityLog[]> => {
  const snap = await getDocs(logsColRef());
  const logs = snap.docs.map(activityLogFromDoc);
  return logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

// ─── Tasks Workflow Helpers ──────────────────────────────────────────────────
export const createTask = async (
  title: string,
  description: string,
  assignedTo: string,
  assignedToName: string,
  createdBy: string,
  createdByName: string
): Promise<string> => {
  const history: TaskHistoryItem[] = [
    {
      timestamp: new Date(),
      action: 'created',
      performedBy: createdBy,
      performedByName: createdByName,
      details: `Assigned to ${assignedToName}`,
    },
  ];

  const taskData: Omit<Task, 'id'> = {
    title,
    description,
    createdBy,
    createdByName,
    assignedTo,
    assignedToName,
    status: 'pending_acceptance',
    createdAt: new Date(),
    history,
  };

  const ref = await addDoc(tasksColRef(), cleanObject(taskData));

  // Log activity
  await logActivity({
    userId: createdBy,
    userName: createdByName,
    action: 'task_created',
    entityType: 'task',
    entityId: ref.id,
    entityName: title,
  });

  return ref.id;
};

export const updateTaskStatus = async (
  taskId: string,
  status: Task['status'],
  userId: string,
  userName: string,
  details?: string,
  completionSummary?: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const task = taskFromDoc(snap as AnySnap);

  let historyAction: TaskHistoryAction = 'accepted';
  let activityAction: ActivityAction = 'task_accepted';

  if (status === 'rejected') {
    historyAction = 'rejected';
    activityAction = 'task_rejected';
  } else if (status === 'completed') {
    historyAction = 'completed';
    activityAction = 'task_completed';
  } else if (status === 'verified') {
    historyAction = 'verified';
    activityAction = 'task_verified';
  }

  const historyItem: TaskHistoryItem = {
    timestamp: new Date(),
    action: historyAction,
    performedBy: userId,
    performedByName: userName,
    details: details || completionSummary || undefined,
  };

  const updateData: Partial<Task> = {
    status,
    history: [...task.history, historyItem],
  };

  if (status === 'rejected') {
    updateData.rejectReason = details;
  } else if (status === 'completed') {
    updateData.completionSummary = completionSummary;
  }

  await updateDoc(taskRef, cleanObject(updateData));

  await logActivity({
    userId,
    userName,
    action: activityAction,
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
  });
};

export const reassignTaskRequest = async (
  taskId: string,
  reassignToUid: string,
  reassignToName: string,
  reason: string,
  userId: string,
  userName: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const task = taskFromDoc(snap as AnySnap);

  const historyItem: TaskHistoryItem = {
    timestamp: new Date(),
    action: 'reassign_requested',
    performedBy: userId,
    performedByName: userName,
    details: `Request to reassign to ${reassignToName}. Reason: ${reason}`,
  };

  const updateData: Partial<Task> = {
    status: 'pending_reassignment',
    reassignRequestedTo: reassignToUid,
    reassignRequestedToName: reassignToName,
    reassignReason: reason,
    history: [...task.history, historyItem],
  };

  await updateDoc(taskRef, cleanObject(updateData));

  await logActivity({
    userId,
    userName,
    action: 'task_reassign_requested',
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
  });
};

export const approveReassignment = async (
  taskId: string,
  userId: string,
  userName: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const task = taskFromDoc(snap as AnySnap);

  const targetUid = task.reassignRequestedTo;
  const targetName = task.reassignRequestedToName;

  if (!targetUid || !targetName) throw new Error('Reassignment details missing');

  const historyItem: TaskHistoryItem = {
    timestamp: new Date(),
    action: 'reassign_approved',
    performedBy: userId,
    performedByName: userName,
    details: `Approved reassignment to ${targetName}`,
  };

  const updateData: Partial<Task> = {
    status: 'pending_acceptance',
    assignedTo: targetUid,
    assignedToName: targetName,
    history: [...task.history, historyItem],
  };

  const clearedFields = {
    reassignRequestedTo: null,
    reassignRequestedToName: null,
    reassignReason: null,
  };

  await updateDoc(taskRef, cleanObject({
    ...updateData,
    ...clearedFields,
  }));

  await logActivity({
    userId,
    userName,
    action: 'task_reassign_approved',
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
  });
};

export const rejectReassignment = async (
  taskId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Task not found');
  const task = taskFromDoc(snap as AnySnap);

  const historyItem: TaskHistoryItem = {
    timestamp: new Date(),
    action: 'reassign_rejected',
    performedBy: userId,
    performedByName: userName,
    details: `Rejected reassignment request. Reason: ${reason}`,
  };

  const updateData: Partial<Task> = {
    status: 'accepted',
    history: [...task.history, historyItem],
  };

  const clearedFields = {
    reassignRequestedTo: null,
    reassignRequestedToName: null,
    reassignReason: null,
  };

  await updateDoc(taskRef, cleanObject({
    ...updateData,
    ...clearedFields,
  }));

  await logActivity({
    userId,
    userName,
    action: 'task_reassign_rejected',
    entityType: 'task',
    entityId: taskId,
    entityName: task.title,
  });
};

export const getTasks = async (constraints: QueryConstraint[] = []): Promise<Task[]> => {
  const snap = await getDocs(query(tasksColRef(), ...constraints));
  const tasks = snap.docs.map(taskFromDoc);
  return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

// ─── Re-exports for convenience ───────────────────────────────────────────────
export {
  doc,
  onSnapshot,
  where,
  orderBy,
  limit,
  query,
  writeBatch,
  serverTimestamp,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
};
