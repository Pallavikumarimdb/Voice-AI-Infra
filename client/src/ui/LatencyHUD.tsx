import React from 'react';

interface HUDProps {
  queueDepth: number;
  gpuUtil: number;
  rtf: number;
  lastCaptureToFinalMs?: number;
  lastMtDurationMs?: number;
}

export const LatencyHUD: React.FC<HUDProps> = ({
  queueDepth,
  gpuUtil,
  rtf,
  lastCaptureToFinalMs,
  lastMtDurationMs,
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
      }}
    >
      <div>
        <span style={{ color: '#8b949e' }}>Channel Queue: </span>
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

      <div>
        <span style={{ color: '#8b949e' }}>GPU Util: </span>
        <span style={{ color: '#e3b341', fontWeight: 'bold' }}>
          {gpuUtil}%
        </span>
      </div>

      {lastCaptureToFinalMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>ASR Commit Latency: </span>
          <span style={{ color: lastCaptureToFinalMs > 1500 ? '#f85149' : '#58a6ff' }}>
            {lastCaptureToFinalMs}ms
          </span>
        </div>
      )}

      {lastMtDurationMs !== undefined && (
        <div>
          <span style={{ color: '#8b949e' }}>MT Latency: </span>
          <span style={{ color: lastMtDurationMs > 800 ? '#f85149' : '#58a6ff' }}>
            {lastMtDurationMs}ms
          </span>
        </div>
      )}
    </div>
  );
};
