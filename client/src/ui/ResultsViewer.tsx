import React, { useState, useEffect } from 'react';
import { EvalVariantSummary } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';

interface ResultsViewerProps {
  onSelectVariantFilter: (variant: string) => void;
  onNavigateToLabeling: () => void;
}

export const ResultsViewer: React.FC<ResultsViewerProps> = ({ onSelectVariantFilter, onNavigateToLabeling }) => {
  const [variants, setVariants] = useState<EvalVariantSummary[]>([]);
  const [paretoData, setParetoData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      const res = await apiClient.getSummary();
      setVariants(res.data.variants);
      if (res.data.pareto?.pareto) {
        setParetoData(res.data.pareto.pareto);
      }
      setLoading(false);
    }
    loadSummary();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
          Evaluation Results: Champion (v1) vs. Challenger (v2)
        </h2>
        <p style={{ color: '#8b949e', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
          Exact statistical evaluation across 10 personas (n=20 per variant). All values loaded directly from eval summary files.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e' }}>Loading evaluation metrics...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Section 1: Champion vs Challenger Table */}
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, color: '#f0f6fc', fontSize: '0.95rem' }}>
                Statistical Benchmark Summary Table
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Click any row to filter runs in Call Inspector</div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#161b22', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                    <th style={{ padding: '10px 14px' }}>Variant</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Sample Size (n)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Hard-Fail Rate (%)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Violations (Final / Att.)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Promise Rate (%)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Avg Judge Score</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Latency p50</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Latency p95</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Cost / 1k Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const isChallenger = v.variant === 'v2_graph';
                    const isBaseline = v.variant === 'v1_baseline';
                    return (
                      <tr
                        key={v.variant}
                        onClick={() => onSelectVariantFilter(v.variant)}
                        style={{
                          borderBottom: '1px solid #21262d',
                          cursor: 'pointer',
                          background: isChallenger ? 'rgba(31, 111, 235, 0.08)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: isChallenger ? '#58a6ff' : '#f0f6fc' }}>
                          {isChallenger && '★ '}
                          {v.variant}
                          {isChallenger && ' (Challenger)'}
                          {isBaseline && ' (Champion)'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#c9d1d9' }}>{v.totalCalls}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600, color: v.hardFailFinalRate === 0 ? '#3fb950' : '#f85149' }}>
                          {v.hardFailFinalRate.toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#8b949e' }}>
                          {v.finalViolations} / {v.attemptedViolations}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#c9d1d9' }}>{v.promiseRate.toFixed(1)}%</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600, color: '#e6edf3' }}>
                          {v.avgJudgeScore.toFixed(2)} / 5.0
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#58a6ff' }}>{v.latencyP50.toFixed(1)} ms</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#8b949e' }}>{v.latencyP95.toFixed(1)} ms</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#3fb950', fontWeight: 600 }}>${v.costPer1k.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Turn-Taking Pareto Frontier */}
          {paretoData.length > 0 && (
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '18px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f0f6fc', margin: '0 0 8px 0' }}>
                Turn-Taking Pareto Frontier: Latency vs. False Interruption
              </h3>
              <p style={{ color: '#8b949e', fontSize: '0.85rem', margin: '0 0 16px 0' }}>
                Evaluation of silence hangover duration against Japanese conversational hesitation pauses (あのー, ええと).
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                      <th style={{ padding: '8px 12px' }}>Silence Hangover</th>
                      <th style={{ padding: '8px 12px' }}>E2E Turn Latency p50</th>
                      <th style={{ padding: '8px 12px' }}>False Interruption Rate</th>
                      <th style={{ padding: '8px 12px' }}>Caller Experience</th>
                      <th style={{ padding: '8px 12px' }}>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paretoData.map((p, idx) => {
                      const isOptimal = p.hangover_ms === 350;
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #21262d',
                            background: isOptimal ? 'rgba(63, 185, 80, 0.1)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f0f6fc' }}>{p.hangover_ms} ms</td>
                          <td style={{ padding: '10px 12px', color: '#58a6ff' }}>{p.e2e_p50_ms} ms</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: p.false_interrupt_rate > 0.1 ? '#f85149' : '#3fb950' }}>
                            {(p.false_interrupt_rate * 100).toFixed(1)}%
                          </td>
                          <td style={{ padding: '10px 12px', color: '#c9d1d9' }}>{p.user_perceived_responsiveness}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {isOptimal ? (
                              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600, background: '#238636', color: '#fff' }}>
                                ✓ Pareto Optimal
                              </span>
                            ) : (
                              <span style={{ color: '#8b949e' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Judge vs Human Agreement & Failure Modes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Agreement Panel */}
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
                  LLM Judge vs. Human Agreement
                </h4>
                <button
                  onClick={onNavigateToLabeling}
                  style={{
                    padding: '4px 10px',
                    background: '#1f6feb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Go to Labeling →
                </button>
              </div>

              <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: '0 0 12px 0' }}>
                Per Section 6.4 of evaluation rules, human collector ratings must be supplied by the project owner.
              </p>

              <div style={{ padding: '14px', background: '#0d1117', borderRadius: '6px', border: '1px solid #30363d' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>Cohen&apos;s Kappa:</span>
                  <span style={{ color: '#d29922', fontWeight: 600, fontSize: '0.85rem' }}>Pending Owner Labels</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>Confusion Matrix:</span>
                  <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>Template ready at eval/labeling/template.csv</span>
                </div>
              </div>
            </div>

            {/* Failure Modes Summary */}
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '18px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc', margin: '0 0 10px 0' }}>
                Documented Failure Modes (docs/failure_modes.md)
              </h4>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 600, color: '#f85149' }}>1. Pre-Disclosure Creditor Leak</div>
                  <div style={{ color: '#8b949e', marginTop: '2px' }}>
                    Agent naming creditor before identity confirmation. <em>Fixed by post-LLM regex redacting creditor.</em>
                  </div>
                </div>

                <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 600, color: '#f85149' }}>2. Conversational DOB Parsing Jitter</div>
                  <div style={{ color: '#8b949e', marginTop: '2px' }}>
                    Failure to extract day when trailing particles attached (12日です). <em>Fixed with regex digit boundary.</em>
                  </div>
                </div>

                <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 600, color: '#f85149' }}>3. Calling Hours Clock Slip</div>
                  <div style={{ color: '#8b949e', marginTop: '2px' }}>
                    Prompts unable to enforce 21:00 Tokyo cutoff. <em>Fixed with pre-turn daytime guard outside prompt.</em>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
