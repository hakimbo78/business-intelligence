import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { api } from '../auth/api';

export interface PaymentRecord {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT' | 'AWAITING_CONFIRMATION' | 'APPROVED' | 'REJECTED';
  senderName?: string | null;
  senderBank?: string | null;
  reference?: string | null;
  rejectedReason?: string | null;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface PaymentInstructions {
  payment: PaymentRecord;
  bankDetails: BankDetails | null;
  payable: boolean;
}

const rupiah = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

const STATUS_LABEL: Record<PaymentRecord['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting your transfer',
  AWAITING_CONFIRMATION: 'We are checking your transfer',
  APPROVED: 'Paid',
  REJECTED: 'We could not find your transfer',
};

/**
 * The client's view of an unpaid order.
 *
 * Analysis only begins once the owner has matched the transfer against their
 * bank statement, so this screen is explicit about that wait rather than
 * implying the money moves through the app.
 */
export const PaymentPanel: React.FC<{
  instructions: PaymentInstructions;
  onConfirmed: () => void;
}> = ({ instructions, onConfirmed }) => {
  const { payment, bankDetails, payable } = instructions;
  const [form, setForm] = useState({ senderName: '', senderBank: '', reference: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/projects/${payment.projectId}/payment/confirm`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  if (payment.status === 'AWAITING_CONFIRMATION') {
    return (
      <Card title="Payment received — being verified">
        <p className="text-muted">
          Thank you. We are matching your transfer of{' '}
          <strong>{rupiah(payment.amount)}</strong> against our bank statement.
          Your analysis starts as soon as it is confirmed.
        </p>
        <p className="text-xs text-muted mt-4">
          Sent by {payment.senderName} via {payment.senderBank}
          {payment.reference ? ` · ref ${payment.reference}` : ''}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title={`Payment required — ${rupiah(payment.amount)}`}>
        <p className="text-muted mb-4">
          {STATUS_LABEL[payment.status]}. Your analysis begins once we have
          confirmed the transfer.
        </p>

        {payment.status === 'REJECTED' && payment.rejectedReason && (
          <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>
            {payment.rejectedReason}. Please check the details and submit again.
          </p>
        )}

        {payable && bankDetails ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between border-b border-border-subtle pb-2">
              <span className="text-muted">Bank</span>
              <span className="font-semibold">{bankDetails.bankName}</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle pb-2 pt-2">
              <span className="text-muted">Account number</span>
              <span className="font-semibold">{bankDetails.accountNumber}</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle pb-2 pt-2">
              <span className="text-muted">Account holder</span>
              <span className="font-semibold">{bankDetails.accountHolder}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-muted">Amount</span>
              <span className="font-semibold text-success">{rupiah(payment.amount)}</span>
            </div>
          </div>
        ) : (
          // Better to say this plainly than to show a client a blank account.
          <p className="text-sm" style={{ color: 'var(--warning)' }}>
            Payment details are not set up yet. Please contact us to arrange payment.
          </p>
        )}
      </Card>

      {payable && (
        <Card title="I have transferred the money">
          <p className="text-muted mb-4">
            Tell us who sent it so we can find it on our statement.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                name="senderName"
                label="Sender name"
                placeholder="Name on the sending account"
                onChange={handleChange}
                required
              />
              <Input
                name="senderBank"
                label="Sender bank"
                placeholder="e.g. BCA"
                onChange={handleChange}
                required
              />
            </div>
            <Input
              name="reference"
              label="Transfer reference (optional)"
              placeholder="Reference number from your receipt"
              onChange={handleChange}
            />
            {error && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" isLoading={submitting}>
                Confirm transfer
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};
