import React from 'react';
import { Badge } from './primitives.tsx';

export interface HardFailBadgeProps {
  passed: boolean;
  numViolations?: number;
  label?: string;
}

export const HardFailBadge: React.FC<HardFailBadgeProps> = ({ passed, numViolations, label }) => {
  const text =
    label || (passed ? 'Pass' : numViolations ? `${numViolations} violations` : 'Hard-fail');
  return <Badge tone={passed ? 'success' : 'danger'} dot>{text}</Badge>;
};

export interface ComplianceBadgeProps {
  blocked: boolean;
  rule?: string;
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({ blocked, rule }) => {
  if (!blocked) {
    return <span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>—</span>;
  }
  return <Badge tone="warning">{rule ? `Guard · ${rule}` : 'Guard intercepted'}</Badge>;
};

export interface LatencyBadgeProps {
  latencyMs: number;
  thresholdMs?: number;
}

export const LatencyBadge: React.FC<LatencyBadgeProps> = ({ latencyMs, thresholdMs = 500 }) => {
  const isHigh = latencyMs > thresholdMs;
  return (
    <span className="mono" style={{ fontSize: 12, color: isHigh ? 'var(--danger)' : 'var(--text-tertiary)' }}>
      {latencyMs.toFixed(0)} ms
    </span>
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
    return <Badge tone="success" dot>Hash chain intact · {verifiedCount ?? 0} records</Badge>;
  }
  const detail = error || 'mismatch';
  const short = detail.length > 60 ? `${detail.slice(0, 60)}…` : detail;
  return (
    <Badge tone="danger">
      <span>Broken at seq {brokenSeq}</span>
      <span
        title={detail}
        className="mono"
        style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}
      >
        {short}
      </span>
    </Badge>
  );
};

export interface SourceBadgeProps {
  source: string;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source }) => {
  const isLive = source.toLowerCase() === 'live';
  return <Badge tone={isLive ? 'info' : 'neutral'}>{source.toUpperCase()}</Badge>;
};
