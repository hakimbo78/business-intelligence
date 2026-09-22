import { describe, it, expect } from 'vitest';
import {
  canReceiveReport,
  DELIVERABLE_REPORT_STATUSES,
} from '@/lib/report-visibility.js';

describe('Who may receive a report', () => {
  it('should let the owner see every draft', () => {
    for (const status of ['DRAFT', 'REVIEW', 'NEEDS_REVISION', 'APPROVED', 'DELIVERED']) {
      expect(canReceiveReport('OWNER', status)).toBe(true);
    }
  });

  it('should keep unapproved work away from the client', () => {
    // The QA agent refusing to deliver counts for nothing if the read
    // endpoints hand out drafts anyway.
    expect(canReceiveReport('CLIENT', 'DRAFT')).toBe(false);
    expect(canReceiveReport('CLIENT', 'REVIEW')).toBe(false);
    expect(canReceiveReport('CLIENT', 'NEEDS_REVISION')).toBe(false);
  });

  it('should release a report to the client once the owner approves', () => {
    expect(canReceiveReport('CLIENT', 'APPROVED')).toBe(true);
    expect(canReceiveReport('CLIENT', 'DELIVERED')).toBe(true);
  });

  it('should refuse a status it does not recognise', () => {
    // A new status must be added deliberately, not inherited by default.
    expect(canReceiveReport('CLIENT', 'SOMETHING_NEW')).toBe(false);
  });

  it('should list only the two deliverable states', () => {
    expect([...DELIVERABLE_REPORT_STATUSES]).toEqual(['APPROVED', 'DELIVERED']);
  });
});
