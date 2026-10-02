import React from 'react';

interface HUDProps {
  queueDepth: number;
  gpuUtil: number;
  rtf: number;
  mode?: 'translate' | 'agent';
  lastCaptureToFinalMs?: number;
  lastMtDurationMs?: number;
  agentTurnLatencyMs?: number;
  ttsFirstAudioMs?: number;
  totalRoundTripMs?: number;
  agentVerified?: boolean;
  promiseCaptured?: string | null;
}

export const LatencyHUD: React.FC<HUDProps> = ({
  queueDepth,
  gpuUtil,
  rtf,
  mode = 'agent',
  lastCaptureToFinalMs,
  lastMtDurationMs,
  agentTurnLatencyMs,
  ttsFirstAudioMs,
  totalRoundTripMs,
  agentVerified,
  promiseCaptured,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '12px 16px',
        background: '#161b22',
        borderRadius: '6px',
        border: '1px solid #30363d',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        alignItems: 'center',
      }}
    >
      <div>
        <span style={{ color: '#8b949e' }}>Queue: </span>
        <span style={{ color: queueDepth > 32768 ? '#f85149' : '#3fb950', fontWeight: 'bold' }}>
          {(queueDepth / 1024).toFixed(1)} KB
        </span>
      </div>

      <div>
        <span style={{ color: '#8b949e' }}>RTF: </span>
        <span style={{ color: rtf > 1.0 ? '#f85149' : '#3fb950', fontWeight: 'bold' }}>
          {rtf.toFixed(2)}
        </span>
      </div>

      {mode === 'translate' && (
        <div>
          <span style={{ color: '#8b949e' }}>GPU Util: </span>
          <span style={{ color: '#e3b341', fontWeight: 'bold' }}>
            {gpuUtil}%
          </span>
        </div>
      )}

      {lastCaptureToFinalMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>ASR: </span>
          <span style={{ color: lastCaptureToFinalMs > 1200 ? '#f85149' : '#58a6ff' }}>
            {lastCaptureToFinalMs}ms
          </span>
        </div>
      )}

      {mode === 'translate' && lastMtDurationMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>MT Latency: </span>
          <span style={{ color: lastMtDurationMs > 800 ? '#f85149' : '#58a6ff' }}>
            {lastMtDurationMs}ms
          </span>
        </div>
      )}

      {mode === 'agent' && agentTurnLatencyMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>LLM Turn: </span>
          <span style={{ color: agentTurnLatencyMs > 600 ? '#f85149' : '#58a6ff', fontWeight: 'bold' }}>
            {agentTurnLatencyMs}ms
          </span>
        </div>
      )}

      {mode === 'agent' && ttsFirstAudioMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>TTS First Audio: </span>
          <span style={{ color: ttsFirstAudioMs > 300 ? '#f85149' : '#58a6ff' }}>
            {ttsFirstAudioMs}ms
          </span>
        </div>
      )}

      {totalRoundTripMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>Total E2E: </span>
          <span style={{ color: totalRoundTripMs > 1500 ? '#f85149' : '#3fb950', fontWeight: 'bold' }}>
            {totalRoundTripMs}ms
          </span>
        </div>
      )}

      {mode === 'agent' && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: agentVerified ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)',
              color: agentVerified ? '#3fb950' : '#d29922',
              border: `1px solid ${agentVerified ? '#3fb950' : '#d29922'}`,
            }}
          >
            {agentVerified ? '✓ Identity Verified' : '⚠ Unverified'}
          </span>

          {promiseCaptured && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: 'rgba(88, 166, 255, 0.15)',
                color: '#58a6ff',
                border: '1px solid #58a6ff',
              }}
            >
              ★ Promise: {promiseCaptured}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
