import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { api } from '../auth/api';

interface PendingPayment {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  senderName: string | null;
  senderBank: string | null;
  reference: string | null;
  confirmedAt: string | null;
  project: { id: string; name: string; projectType: string };
}

const rupiah = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

/**
 * The owner's verification queue.
 *
 * Approving here is what releases an order into the analysis pipeline, which
 * spends real money — so each row shows exactly what to look for on the bank
 * statement before deciding.
 */
export const Payments: React.FC = () => {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setPayments(await api<PendingPayment[]>('/api/projects/payments/pending'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (projectId: string) => {
    setBusyId(projectId);
    setNotice(null);
    try {
      const result = await api<{ queued: boolean; notReady?: unknown }>(
        `/api/projects/${projectId}/payment/approve`,
        { method: 'POST' }
      );
      setNotice(
        result.queued
          ? 'Payment approved. The analysis has started.'
          : 'Payment approved, but the order is incomplete so the analysis did not start. Open the order to see what is missing.'
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (projectId: string) => {
    const reason = prompt('Why can this transfer not be confirmed?');
    if (!reason) return;

    setBusyId(projectId);
    setNotice(null);
    try {
      await api(`/api/projects/${projectId}/payment/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setNotice('Payment rejected. The client can submit again.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <span className="spinner"></span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1>Payments to verify</h1>
        <p className="text-muted mt-2">
          Match each transfer against your bank statement. Approving starts the
          analysis, which spends API budget.
        </p>
      </div>

      {notice && (
        <Card className="mb-6">
          <p className="text-sm">{notice}</p>
        </Card>
      )}

      {error && (
        <Card title="Something went wrong" className="mb-6">
          <p className="text-muted">{error}</p>
        </Card>
      )}

      {payments.length === 0 ? (
        <Card title="Nothing to verify">
          <p className="text-muted">
            Transfers confirmed by clients will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {payments.map((p) => (
            <Card key={p.id} title={p.project.name}>
              <div className="flex flex-col gap-2 mb-6">
                <div className="flex justify-between border-b border-border-subtle pb-2">
                  <span className="text-muted">Amount to look for</span>
                  <span className="font-semibold text-success">{rupiah(p.amount)}</span>
                </div>
                <div className="flex justify-between border-b border-border-subtle pb-2 pt-2">
                  <span className="text-muted">Sender</span>
                  <span className="font-semibold">
                    {p.senderName ?? '—'} ({p.senderBank ?? '—'})
                  </span>
                </div>
                <div className="flex justify-between border-b border-border-subtle pb-2 pt-2">
                  <span className="text-muted">Reference</span>
                  <span className="font-semibold">{p.reference ?? '—'}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-muted">Confirmed by client</span>
                  <span className="font-semibold">
                    {p.confirmedAt ? new Date(p.confirmedAt).toLocaleString('id-ID') : '—'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  className="text-sm text-primary cursor-pointer"
                  style={{ background: 'none', border: 'none' }}
                  onClick={() => navigate(`/projects/${p.projectId}`)}
                >
                  View order
                </button>
                <div className="flex gap-4">
                  <Button
                    variant="danger"
                    onClick={() => reject(p.projectId)}
                    isLoading={busyId === p.projectId}
                  >
                    Cannot confirm
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => approve(p.projectId)}
                    isLoading={busyId === p.projectId}
                  >
                    Approve &amp; start analysis
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
