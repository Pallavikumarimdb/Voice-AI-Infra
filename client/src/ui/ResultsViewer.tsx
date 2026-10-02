import React, { useState, useEffect } from 'react';
import { EvalVariantSummary } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';
import { PageHeader, Badge } from './primitives.tsx';

interface ResultsViewerProps {
  onSelectVariantFilter: (variant: string) => void;
  onNavigateToLabeling: () => void;
}

export const ResultsViewer: React.FC<ResultsViewerProps> = ({ onSelectVariantFilter, onNavigateToLabeling }) => {
  const [variants, setVariants] = useState<EvalVariantSummary[]>([]);
  const [paretoData, setParetoData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getSummary();
        setVariants(res.variants);
        if (res.pareto?.pareto) setParetoData(res.pareto.pareto);
      } catch (err: any) {
        setError(err?.message || 'Failed to load evaluation results.');
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const best = variants.find((v) => v.variant === 'v2_graph');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Measure · Eval suite"
        title="Champion vs challenger"
        desc="Values rendered exactly as stored in the eval summary files. Click a row to open its runs."
        right={best ? <Badge tone="success" dot>v2_graph · {best.avgJudgeScore.toFixed(2)} / 5</Badge> : undefined}
      />

      {loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading evaluation metrics…</div>
      ) : error ? (
        <div className="card card-pad" style={{ textAlign: 'center', borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }}>
          <div style={{ fontWeight: 650, color: 'var(--danger)' }}>Could not load evaluation results</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{error}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {variants.length > 0 && (
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Variants</div>
                <div className="stat-value">{variants.length}</div>
                <div className="stat-sub">n = {variants[0]?.totalCalls} per variant</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best hard-fail rate</div>
                <div className="stat-value">{Math.min(...variants.map((v) => v.hardFailFinalRate)).toFixed(1)}%</div>
                <div className="stat-sub">Final violations</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best judge mean</div>
                <div className="stat-value">{Math.max(...variants.map((v) => v.avgJudgeScore)).toFixed(2)}</div>
                <div className="stat-sub">Out of 5.0</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best p50 latency</div>
                <div className="stat-value mono">{Math.min(...variants.map((v) => v.latencyP50)).toFixed(0)} ms</div>
                <div className="stat-sub">End-to-end turn</div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th style={{ textAlign: 'right' }}>n</th>
                  <th style={{ textAlign: 'right' }}>Hard-fail %</th>
                  <th style={{ textAlign: 'right' }}>Viol (fin / att)</th>
                  <th style={{ textAlign: 'right' }}>Promise %</th>
                  <th style={{ textAlign: 'right' }}>Judge</th>
                  <th style={{ textAlign: 'right' }}>p50</th>
                  <th style={{ textAlign: 'right' }}>p95</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variant} onClick={() => onSelectVariantFilter(v.variant)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="mono" style={{ fontWeight: 650 }}>{v.variant}</span>{' '}
                      {v.variant === 'v2_graph' && <Badge tone="info">Challenger</Badge>}
                      {v.variant === 'v1_baseline' && <Badge tone="neutral">Champion</Badge>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.totalCalls}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: v.hardFailFinalRate === 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {v.hardFailFinalRate.toFixed(1)}%
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{v.finalViolations ?? '—'} / {v.attemptedViolations}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.promiseRate.toFixed(1)}%</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>{v.avgJudgeScore.toFixed(2)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.latencyP50.toFixed(0)} ms</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>{v.latencyP95.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paretoData.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">Turn-taking tradeoff</h3>
                  <p className="card-sub">Silence hangover vs false interruptions (Japanese hesitation pauses).</p>
                </div>
                <Badge tone="success">Optimal · 350 ms</Badge>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr><th>Hangover</th><th style={{ textAlign: 'right' }}>p50 latency</th><th style={{ textAlign: 'right' }}>False interrupt</th><th>Experience</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {paretoData.map((p, idx) => (
                      <tr key={idx}>
                        <td className="mono" style={{ fontWeight: 650 }}>{p.hangover_ms} ms</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p.e2e_p50_ms} ms</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 650, color: p.false_interrupt_rate > 0.1 ? 'var(--danger)' : 'var(--success)' }}>
                          {(p.false_interrupt_rate * 100).toFixed(1)}%
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.user_perceived_responsiveness}</td>
                        <td>{p.hangover_ms === 350 ? <Badge tone="success">Pareto optimal</Badge> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Judge ↔ human agreement</h3>
                <button className="btn btn-sm" onClick={onNavigateToLabeling}>Label</button>
              </div>
              <div className="card-pad" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Human labels are still pending from the project owner. Template is ready at
                <span className="mono" style={{ display: 'block', marginTop: 6 }}>eval/labeling/template.csv</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="card-title">Known failure modes</h3><Badge tone="neutral">docs/failure_modes.md</Badge></div>
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {[
                  ['Pre-disclosure leak', 'Creditor named before ID check — fixed by post-LLM redaction.'],
                  ['DOB parsing jitter', 'Trailing particles dropped the day — fixed with digit-boundary regex.'],
                  ['Calling-hours slip', '21:00 JST cutoff ignored in prompt — fixed with pre-turn guard.'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <div style={{ fontWeight: 650 }}>{t}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
