import React from 'react';
import { Badge } from './primitives.tsx';

interface HUDProps {
  queueDepth: number;
  gpuUtil: number | null;
  rtf: number | null;
  mode?: 'translate' | 'agent';
  lastCaptureToFinalMs?: number;
  lastMtDurationMs?: number;
  agentTurnLatencyMs?: number;
  ttsFirstAudioMs?: number;
  totalRoundTripMs?: number;
  agentVerified?: boolean;
  promiseCaptured?: string | null;
}

const Metric: React.FC<{ label: string; value: string | null; danger?: boolean }> = ({ label, value, danger }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ fontSize: 11.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{label}</span>
    <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: value === null ? 'var(--text-dim)' : danger ? 'var(--danger)' : 'var(--text)' }}>
      {value ?? '—'}
    </span>
  </div>
);

export const LatencyHUD: React.FC<HUDProps> = ({
  queueDepth, gpuUtil, rtf, mode = 'agent',
  lastCaptureToFinalMs, lastMtDurationMs, agentTurnLatencyMs,
  ttsFirstAudioMs, totalRoundTripMs, agentVerified, promiseCaptured,
}) => {
  return (
    <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center' }}>
      <Metric label="Queue" value={`${(queueDepth / 1024).toFixed(1)} KB`} danger={queueDepth > 32768} />
      <Metric label="RTF" value={rtf === null ? null : `${rtf.toFixed(2)}x`} danger={rtf !== null && rtf > 1.0} />
      {mode === 'translate' && <Metric label="GPU" value={gpuUtil === null ? null : `${gpuUtil}%`} />}
      {lastCaptureToFinalMs !== undefined && <Metric label="ASR" value={`${lastCaptureToFinalMs} ms`} danger={lastCaptureToFinalMs > 800} />}
      {mode === 'translate' && lastMtDurationMs !== undefined && <Metric label="MT" value={`${lastMtDurationMs} ms`} danger={lastMtDurationMs > 600} />}
      {mode === 'agent' && agentTurnLatencyMs !== undefined && <Metric label="LLM" value={`${agentTurnLatencyMs} ms`} danger={agentTurnLatencyMs > 600} />}
      {mode === 'agent' && ttsFirstAudioMs !== undefined && <Metric label="TTS TTFB" value={`${ttsFirstAudioMs} ms`} danger={ttsFirstAudioMs > 300} />}
      {totalRoundTripMs !== undefined && <Metric label="E2E" value={`${totalRoundTripMs} ms`} danger={totalRoundTripMs > 1200} />}

      {mode === 'agent' && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Badge tone={agentVerified ? 'success' : 'warning'} dot>{agentVerified ? 'Verified' : 'Auth pending'}</Badge>
          {promiseCaptured && <Badge tone="info">{promiseCaptured}</Badge>}
        </div>
      )}
    </div>
  );
};
