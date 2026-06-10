import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
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
} from 'firebase/firestore';
import { db } from './firebase';
import type { User, Client, Summary, Payment, ActivityLog } from '../types';

// ─── Lazy Collection References ───────────────────────────────────────────────
// Use functions to avoid crash when db is null (Firebase not yet configured)
const usersColRef    = () => collection(db, 'users');
const clientsColRef  = () => collection(db, 'clients');
const summariesColRef= () => collection(db, 'summaries');
const paymentsColRef = () => collection(db, 'payments');
const logsColRef     = () => collection(db, 'activityLogs');

// Named exports kept for AddSummaryPage (uses addDoc(paymentsCol, ...))
// These are proxy objects; actual collection() call is deferred to function-call time
export const paymentsCol = { toString: () => 'payments' };

// ─── Converters ───────────────────────────────────────────────────────────────
const toDate = (val: Timestamp | Date | undefined): Date =>
  val instanceof Timestamp ? val.toDate() : val instanceof Date ? val : new Date();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  documents: snap.data().documents || [],
} as Summary);

export const paymentFromDoc = (snap: AnySnap): Payment => ({
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
} as Payment);

export const activityLogFromDoc = (snap: AnySnap): ActivityLog => ({
  id: snap.id, ...snap.data(), createdAt: toDate(snap.data().createdAt),
} as ActivityLog);

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
  try {
    const snap = await getDocs(query(usersColRef(), ...constraints));
    console.log("DEBUG getUsers: snap size =", snap.size);
    snap.docs.forEach(d => console.log("DEBUG getUsers doc:", d.id, d.data()));
    const users = snap.docs.map(userFromDoc);
    return users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (err: any) {
    console.error("DEBUG getUsers error:", err);
    throw err;
  }
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
  const constraints = [where('whatsappNumber', '==', number)];
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

export const createClient = async (data: Omit<Client, 'id' | 'createdAt'>): Promise<string> => {
  const ref = await addDoc(clientsColRef(), cleanObject({ ...data, createdAt: serverTimestamp() }));
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
  await updateDoc(doc(db, 'summaries', id), cleanObject(data));
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
  updateDoc,
  getDoc,
};
