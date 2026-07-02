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
import type { User, Client, Summary, Payment, ActivityLog, EditRequest, ClientEditRequest, Tag } from '../types';

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
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
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
  return tags.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const createTag = async (data: Omit<Tag, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(tagsColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
};

export const updateTag = async (id: string, data: Partial<Tag>): Promise<void> => {
  await updateDoc(doc(db, 'tags', id), cleanObject(data));
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
