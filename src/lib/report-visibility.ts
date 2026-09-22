import type { UserRole } from '../services/auth.service.js';

/**
 * Report states a client is allowed to receive.
 *
 * Per BUILD_ROADMAP.md Phase 14, only an approved report may be delivered. The
 * QA agent already refuses to deliver on its own, but that is worth nothing if
 * the read endpoints hand out drafts, so the same rule is stated once here and
 * applied wherever a report leaves the system.
 */
export const DELIVERABLE_REPORT_STATUSES = ['APPROVED', 'DELIVERED'] as const;

/**
 * May this caller receive this report?
 *
 * The owner sees every draft, because reviewing them is their job. A client
 * sees a report only once the owner has approved it.
 */
export function canReceiveReport(role: UserRole, reportStatus: string): boolean {
  if (role === 'OWNER') return true;
  return (DELIVERABLE_REPORT_STATUSES as readonly string[]).includes(reportStatus);
}
