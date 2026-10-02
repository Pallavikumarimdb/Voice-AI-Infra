import React from 'react';

export interface CaptionEntry {
  uttId: number;
  partialText?: string;
  finalText?: string;
  translation?: string;
  agentText?: string;
  agentNode?: string;
  interrupted?: boolean;
}

interface CaptionsProps {
  entries: CaptionEntry[];
}

export const Captions: React.FC<CaptionsProps> = ({ entries }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px' }}>
      {entries.map((entry) => (
        <div
          key={entry.uttId}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '12px',
            padding: '14px 16px',
            border: '1px solid var(--border-subtle)',
            transition: 'border-color 0.2s ease',
          }}
        >
          {/* Turn Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              className="mono-nums"
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-tertiary)',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              TURN #{entry.uttId}
            </span>

            {entry.interrupted && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--accent-rose)',
                  background: 'rgba(244, 63, 94, 0.12)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>⚡</span>
                <span>Barge-in Cutoff</span>
              </span>
            )}
          </div>

          {/* Caller Utterance Bubble */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                flexShrink: 0,
                color: 'var(--text-secondary)',
                marginTop: '2px',
              }}
            >
              👤
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '3px' }}>
                Caller
              </div>
              <div
                style={{
                  fontSize: '0.95rem',
                  lineHeight: '1.5',
                  color: entry.finalText ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontStyle: entry.finalText ? 'normal' : 'italic',
                }}
              >
                {entry.finalText || entry.partialText || 'Listening...'}
              </div>
            </div>
          </div>

          {/* Committed Translation (Translate Mode) */}
          {entry.translation && (
            <div
              style={{
                marginLeft: '36px',
                padding: '8px 12px',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                borderRadius: '8px',
                color: 'var(--accent-cyan)',
                fontSize: '0.9rem',
                lineHeight: '1.4',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#38bdf8', marginBottom: '2px' }}>
                ↳ TRANSLATION
              </div>
              <div>{entry.translation}</div>
            </div>
          )}

          {/* Agent Utterance Bubble */}
          {entry.agentText && (
            <div
              style={{
                marginLeft: '12px',
                background: entry.interrupted
                  ? 'rgba(244, 63, 94, 0.05)'
                  : 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.06) 100%)',
                border: `1px solid ${entry.interrupted ? 'rgba(244, 63, 94, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                    }}
                  >
                    🤖
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a5b4fc' }}>
                    Voice AI Agent
                  </span>
                </div>

                {entry.agentNode && (
                  <span
                    className="mono-nums"
                    style={{
                      fontSize: '0.68rem',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-secondary)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    node: {entry.agentNode}
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: '0.95rem',
                  lineHeight: '1.5',
                  color: entry.interrupted ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textDecoration: entry.interrupted ? 'line-through' : 'none',
                  opacity: entry.interrupted ? 0.75 : 1.0,
                }}
              >
                {entry.agentText}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

