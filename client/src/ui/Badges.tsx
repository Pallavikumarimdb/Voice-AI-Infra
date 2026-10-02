import React from 'react';

export interface HardFailBadgeProps {
  passed: boolean;
  numViolations?: number;
  label?: string;
}

export const HardFailBadge: React.FC<HardFailBadgeProps> = ({ passed, numViolations, label }) => {
  const text = label || (passed ? '✓ Passed (0 Violations)' : `✗ ${numViolations ? `${numViolations} Violations` : 'Hard-Fail Hit'}`);
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: passed ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)',
        color: passed ? '#3fb950' : '#f85149',
        border: `1px solid ${passed ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {text}
    </span>
  );
};

export interface ComplianceBadgeProps {
  blocked: boolean;
  rule?: string;
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({ blocked, rule }) => {
  if (!blocked) {
    return <span style={{ color: '#8b949e' }}>—</span>;
  }
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: 'rgba(210, 153, 34, 0.15)',
        color: '#d29922',
        border: '1px solid rgba(210, 153, 34, 0.3)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      🛡️ {rule ? `Guard Intercepted [${rule}]` : 'Guard Intercepted'}
    </span>
  );
};

export interface LatencyBadgeProps {
  latencyMs: number;
  thresholdMs?: number;
}

export const LatencyBadge: React.FC<LatencyBadgeProps> = ({ latencyMs, thresholdMs = 500 }) => {
  const isHigh = latencyMs > thresholdMs;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.75rem',
        color: '#8b949e',
      }}
    >
      <span>Latency:</span>
      <span style={{ color: isHigh ? '#f85149' : '#58a6ff', fontWeight: 600 }}>
        {latencyMs.toFixed(1)}ms
      </span>
    </div>
  );
};

export interface HashChainBadgeProps {
  valid: boolean;
  verifiedCount?: number;
  brokenSeq?: number;
  error?: string;
}

export const HashChainBadge: React.FC<HashChainBadgeProps> = ({ valid, verifiedCount, brokenSeq, error }) => {
  if (valid) {
    return (
      <span
        style={{
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '0.8rem',
          fontWeight: 600,
          background: 'rgba(63, 185, 80, 0.15)',
          color: '#3fb950',
          border: '1px solid rgba(63, 185, 80, 0.4)',
        }}
      >
        ✓ SHA-256 Hash Chain Intact ({verifiedCount ?? 0}/{verifiedCount ?? 0} records)
      </span>
    );
  }
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: 600,
        background: 'rgba(248, 81, 73, 0.2)',
        color: '#f85149',
        border: '1px solid rgba(248, 81, 73, 0.5)',
      }}
    >
      ⚠ Broken Chain at seq {brokenSeq}: {error || 'Hash mismatch'}
    </span>
  );
};

export interface SourceBadgeProps {
  source: string;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source }) => {
  const isLive = source.toLowerCase() === 'live';
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: isLive ? 'rgba(56, 139, 253, 0.15)' : 'rgba(139, 148, 158, 0.15)',
        color: isLive ? '#58a6ff' : '#c9d1d9',
        display: 'inline-block',
      }}
    >
      {source.toUpperCase()}
    </span>
  );
};
