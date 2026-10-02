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
      className="glass-panel"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        padding: '10px 18px',
        alignItems: 'center',
        fontSize: '0.8rem',
      }}
    >
      {/* Pipeline Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 600 }}>
          Telemetry
        </span>
        <span style={{ height: '14px', width: '1px', background: 'var(--border-subtle)' }} />
      </div>

      {/* Audio Queue Depth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Queue:</span>
        <span
          className="mono-nums"
          style={{
            fontWeight: 600,
            color: queueDepth > 32768 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
          }}
        >
          {(queueDepth / 1024).toFixed(1)} KB
        </span>
      </div>

      {/* Real-Time Factor (RTF) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>RTF:</span>
        <span
          className="mono-nums"
          style={{
            fontWeight: 600,
            color: rtf > 1.0 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
          }}
        >
          {rtf.toFixed(2)}x
        </span>
      </div>

      {/* GPU Util (if translate) */}
      {mode === 'translate' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>GPU:</span>
          <span className="mono-nums" style={{ color: '#fbbf24', fontWeight: 600 }}>
            {gpuUtil}%
          </span>
        </div>
      )}

      {/* ASR Chunk Latency */}
      {lastCaptureToFinalMs !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>ASR:</span>
          <span
            className="mono-nums"
            style={{
              fontWeight: 600,
              color: lastCaptureToFinalMs > 800 ? 'var(--accent-rose)' : '#60a5fa',
            }}
          >
            {lastCaptureToFinalMs}ms
          </span>
        </div>
      )}

      {/* MT Duration */}
      {mode === 'translate' && lastMtDurationMs !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>MT:</span>
          <span
            className="mono-nums"
            style={{
              fontWeight: 600,
              color: lastMtDurationMs > 600 ? 'var(--accent-rose)' : '#60a5fa',
            }}
          >
            {lastMtDurationMs}ms
          </span>
        </div>
      )}

      {/* Agent LLM Turn */}
      {mode === 'agent' && agentTurnLatencyMs !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>LLM Reasoning:</span>
          <span
            className="mono-nums"
            style={{
              fontWeight: 600,
              color: agentTurnLatencyMs > 600 ? 'var(--accent-rose)' : '#a78bfa',
            }}
          >
            {agentTurnLatencyMs}ms
          </span>
        </div>
      )}

      {/* TTS First Audio */}
      {mode === 'agent' && ttsFirstAudioMs !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>TTS TTFB:</span>
          <span
            className="mono-nums"
            style={{
              fontWeight: 600,
              color: ttsFirstAudioMs > 300 ? 'var(--accent-rose)' : '#38bdf8',
            }}
          >
            {ttsFirstAudioMs}ms
          </span>
        </div>
      )}

      {/* Total Roundtrip E2E */}
      {totalRoundTripMs !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>E2E:</span>
          <span
            className="mono-nums"
            style={{
              fontWeight: 700,
              color: totalRoundTripMs > 1200 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            }}
          >
            {totalRoundTripMs}ms
          </span>
        </div>
      )}

      {/* Right side badges: identity / promise status */}
      {mode === 'agent' && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: agentVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.12)',
              color: agentVerified ? '#34d399' : '#fbbf24',
              border: `1px solid ${agentVerified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            }}
          >
            {agentVerified ? '✓ Identity Verified' : '○ Auth Pending'}
          </span>

          {promiseCaptured && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.35)',
              }}
            >
              ★ Commitment: {promiseCaptured}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

