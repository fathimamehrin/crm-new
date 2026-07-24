/**
 * ─── Commission Engine ──────────────────────────────────────────────────────
 *
 * This is the SINGLE place to change commission business logic.
 *
 * Current model (standard CRM practice):
 *   - Eligible payments:  status === 'paid', paid within the target month,
 *                         on a client whose assignedAgent === the staff member's userId.
 *   - Commission earned:  sum(eligiblePaymentAmounts) × (commissionRate / 100)
 *
 * To change the model later, only update `calculateCommissionEarned()` below.
 * The salary sync, UI, and record creation logic do NOT need to change.
 *
 * Pay-structure rules:
 *   fixed       → baseSalary only, commission is always 0
 *   commission  → 0 base, commission earned from eligible payments
 *   hybrid      → baseSalary + commission earned from eligible payments
 */

import { getDocs, query, collection, where } from 'firebase/firestore';
import { db } from './firebase';
import type { User } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommissionInput {
  user: User;
  /** Target month in 'YYYY-MM' format, e.g. '2026-07' */
  month: string;
}

export interface CommissionResult {
  baseSalary: number;
  commissionEarned: number;
  totalAmount: number;
  /** Breakdown details for display in the salary dashboard */
  breakdown: {
    eligiblePaymentsTotal: number;
    commissionRate: number;
    clientCount: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns [startDate, endDate) for a given 'YYYY-MM' month string. */
function getMonthDateRange(month: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed
  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIdx + 1, 1, 0, 0, 0, 0); // exclusive
  return { start, end };
}

// ─── Core Commission Calculation ──────────────────────────────────────────────

/**
 * Calculates commission earned by a staff member for a given month.
 *
 * CHANGE THIS FUNCTION to update the commission business rule.
 * Everything else (salary sync, UI totals) will automatically reflect the change.
 *
 * Current rule:
 *   commission = sum of `paid` payment amounts on clients assigned to this user
 *                 in the target month × (commissionRate%)
 */
async function calculateCommissionEarned(userId: string, commissionRate: number, month: string): Promise<{
  commissionEarned: number;
  eligiblePaymentsTotal: number;
  clientCount: number;
}> {
  // Step 1: Find all clients assigned to this staff member
  const clientsSnap = await getDocs(
    query(collection(db, 'clients'), where('assignedAgent', '==', userId))
  );
  const clientIds = clientsSnap.docs.map(d => d.id);

  if (clientIds.length === 0) {
    return { commissionEarned: 0, eligiblePaymentsTotal: 0, clientCount: 0 };
  }

  // Step 2: Get date range for target month
  const { start, end } = getMonthDateRange(month);

  // Step 3: Fetch paid payments for those clients within the target month.
  // Firestore `in` supports max 30 elements per query; chunk if needed.
  const CHUNK_SIZE = 30;
  let eligiblePaymentsTotal = 0;
  const clientsWithPayment = new Set<string>();

  for (let i = 0; i < clientIds.length; i += CHUNK_SIZE) {
    const chunk = clientIds.slice(i, i + CHUNK_SIZE);
    const paymentsSnap = await getDocs(
      query(
        collection(db, 'payments'),
        where('clientId', 'in', chunk),
        where('status', '==', 'paid')
      )
    );

    for (const docSnap of paymentsSnap.docs) {
      const data = docSnap.data();
      // Filter by month client-side (Firestore timestamps)
      const createdAt: Date = data.createdAt?.toDate?.() ?? new Date(data.createdAt);
      if (createdAt >= start && createdAt < end) {
        eligiblePaymentsTotal += data.amount ?? 0;
        clientsWithPayment.add(data.clientId);
      }
    }
  }

  // Step 4: Apply commission rate
  const commissionEarned = parseFloat(
    ((eligiblePaymentsTotal * commissionRate) / 100).toFixed(2)
  );

  return {
    commissionEarned,
    eligiblePaymentsTotal,
    clientCount: clientsWithPayment.size,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes the full salary breakdown for a user for a given month.
 * This is the main entry point called by the salary sync logic.
 */
export async function computeSalary(input: CommissionInput): Promise<CommissionResult> {
  const { user, month } = input;

  const payStructure = user.payStructure ?? 'fixed';
  const baseSalary = user.baseSalary ?? 0;
  const commissionRate = user.commissionRate ?? 0;

  // Fixed salary: no commission calculated, skip the DB query entirely
  if (payStructure === 'fixed') {
    return {
      baseSalary,
      commissionEarned: 0,
      totalAmount: baseSalary,
      breakdown: { eligiblePaymentsTotal: 0, commissionRate: 0, clientCount: 0 },
    };
  }

  // Commission or Hybrid: calculate from paid payments
  const { commissionEarned, eligiblePaymentsTotal, clientCount } =
    await calculateCommissionEarned(user.id, commissionRate, month);

  const effectiveBase = payStructure === 'hybrid' ? baseSalary : 0;
  const totalAmount = parseFloat((effectiveBase + commissionEarned).toFixed(2));

  return {
    baseSalary: effectiveBase,
    commissionEarned,
    totalAmount,
    breakdown: { eligiblePaymentsTotal, commissionRate, clientCount },
  };
}
