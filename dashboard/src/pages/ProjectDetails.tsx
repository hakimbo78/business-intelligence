import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

interface FinancialScenario {
  scenarioName: 'CONSERVATIVE' | 'BASE' | 'UPSIDE';
  effectiveCustomersPerDay: number;
  monthlyRevenue: number;
  operatingProfit: number;
  paybackPeriodMonths: number;
  isViable: boolean;
}

/** Mirrors StructuredReport in src/agents/report.agent.ts. */
interface ReportContent {
  projectMeta?: { projectName?: string; businessName?: string; targetArea?: string };
  disclaimer?: string;
  synthesis?: {
    executiveSummary?: string;
    methodology?: string;
    assumptions?: string[];
    validationChecklist?: string[];
  };
  candidates?: { totalIdentified?: number; shortlistedCount?: number };
  analysis?: {
    demand?: { demandSignal?: string; confidence?: string };
    competition?: { densityLevel?: string };
    marketGap?: { overallRecommendation?: string; summary?: string };
    financial?: { scenarios?: FinancialScenario[] };
    scoring?: { overallScore?: number };
  };
}

/** Mirrors ReportRecord returned by GET /api/projects/:id/report. */
interface ReportData {
  id: string;
  projectId: string;
  version: string;
  status: string;
  createdAt: string;
  contentJson: ReportContent;
}

const POLL_INTERVAL_MS = 5000;

export const ProjectDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Read by the poller without making it a dependency, so the interval is
  // created once per project instead of being torn down on every state change.
  const hasReport = useRef(false);
  hasReport.current = report !== null;

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/report`);
      if (res.ok) {
        setReport(await res.json());
      } else {
        // 404 simply means generation is still in progress.
        setReport(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReport();
    const interval = setInterval(() => {
      if (!hasReport.current) fetchReport();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchReport]);

  const runAction = async (action: 'approve' | 'reject', body?: unknown) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/projects/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Request failed with status ${res.status}`);
      }
      await fetchReport();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => runAction('approve');

  const handleReject = () => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    return runAction('reject', { reason });
  };

  if (loading) {
    return <div className="flex justify-center py-8"><span className="spinner"></span></div>;
  }

  const content = report?.contentJson;
  const baseScenario = content?.analysis?.financial?.scenarios?.find(
    (s) => s.scenarioName === 'BASE'
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <button className="text-sm text-primary mb-2 cursor-pointer" onClick={() => navigate('/')}>
            ← Back to Projects
          </button>
          <h1>Analysis Report</h1>
          <p className="text-muted mt-2">Project ID: {id}</p>
        </div>

        {report?.status === 'REVIEW' && (
          <div className="flex gap-4">
            <Button variant="danger" onClick={handleReject} isLoading={actionLoading}>Reject</Button>
            <Button variant="primary" onClick={handleApprove} isLoading={actionLoading}>Approve Report</Button>
          </div>
        )}

        {report?.status === 'APPROVED' && (
          <Button variant="secondary">Download PDF</Button>
        )}
      </div>

      {actionError && (
        <Card title="Action failed" className="mb-6">
          <p className="text-muted">{actionError}</p>
        </Card>
      )}

      {!report ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <span className="spinner mb-4" style={{ width: '2em', height: '2em' }}></span>
          <h3>AI is working...</h3>
          <p className="text-muted mt-2">Your report is currently being generated by our multi-agent system. This can take a few minutes as we analyze the market, competitors, and financial viability.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card title="Executive Summary">
            <p>{content?.synthesis?.executiveSummary || 'No summary available.'}</p>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card title="Financial Viability (Base scenario)">
              {baseScenario ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between border-b border-border-subtle pb-2">
                    <span className="text-muted">Estimated Revenue/mo</span>
                    <span className="font-semibold text-success">
                      Rp {baseScenario.monthlyRevenue.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border-subtle pb-2 pt-2">
                    <span className="text-muted">Operating Profit/mo</span>
                    <span className="font-semibold">
                      Rp {baseScenario.operatingProfit.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-muted">Payback Period</span>
                    <span className="font-semibold">
                      {baseScenario.isViable
                        ? `${baseScenario.paybackPeriodMonths} months`
                        : 'Not viable'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted">DATA NOT AVAILABLE</p>
              )}
            </Card>

            <Card title="Market Gap Analysis">
              <p className="text-sm">
                {content?.analysis?.marketGap?.summary || 'No analysis available.'}
              </p>
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <span className="text-xs text-muted block mb-1">Overall recommendation</span>
                <span className="font-semibold">
                  {content?.analysis?.marketGap?.overallRecommendation ?? 'DATA NOT AVAILABLE'}
                </span>
              </div>
              <div className="mt-4">
                <span className="text-xs text-muted block mb-1">Overall score</span>
                <span className="font-semibold">
                  {content?.analysis?.scoring?.overallScore ?? 'DATA NOT AVAILABLE'} / 100
                </span>
              </div>
            </Card>
          </div>

          <Card title="Field Validation Checklist">
            {content?.synthesis?.validationChecklist?.length ? (
              <ul>
                {content.synthesis.validationChecklist.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">DATA NOT AVAILABLE</p>
            )}
          </Card>

          {content?.disclaimer && (
            <Card title="Disclaimer">
              <p className="text-xs text-muted">{content.disclaimer}</p>
            </Card>
          )}

          <Card title="Raw Output (Debug)">
            <pre className="text-xs bg-[rgba(0,0,0,0.3)] p-4 rounded-md overflow-auto max-h-96">
              {JSON.stringify(content, null, 2)}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
};
