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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      {entries.map((entry) => (
        <div
          key={entry.uttId}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            padding: '14px 16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>
              Utterance #{entry.uttId}
            </span>
            {entry.interrupted && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#f85149',
                  background: 'rgba(248, 81, 73, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                }}
              >
                ⚡ Barge-in Cutoff
              </span>
            )}
          </div>

          {/* Caller Speech */}
          <div style={{ fontSize: '1.15rem', lineHeight: '1.5' }}>
            <span style={{ fontSize: '0.85rem', color: '#8b949e', marginRight: '8px' }}>
              👤 Caller:
            </span>
            {entry.finalText ? (
              <span style={{ color: '#f0f6fc' }}>{entry.finalText}</span>
            ) : (
              <span style={{ color: '#8b949e', fontStyle: 'italic' }}>
                {entry.partialText || '...'}
              </span>
            )}
          </div>

          {/* Committed Translation (Translate Mode) */}
          {entry.translation && (
            <div
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
                color: '#58a6ff',
                fontSize: '1.05rem',
                fontWeight: 500,
              }}
            >
              ↳ {entry.translation}
            </div>
          )}

          {/* Agent Voice Response (Agent Mode) */}
          {entry.agentText && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                background: entry.interrupted ? 'rgba(248, 81, 73, 0.05)' : 'rgba(56, 139, 253, 0.08)',
                border: `1px solid ${entry.interrupted ? 'rgba(248, 81, 73, 0.3)' : 'rgba(56, 139, 253, 0.25)'}`,
                borderRadius: '6px',
                textDecoration: entry.interrupted ? 'line-through' : 'none',
                opacity: entry.interrupted ? 0.75 : 1.0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#58a6ff' }}>
                  🤖 Voice Agent
                </span>
                {entry.agentNode && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#c9d1d9',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    node: {entry.agentNode}
                  </span>
                )}
              </div>
              <div style={{ color: '#e6edf3', fontSize: '1.05rem', lineHeight: '1.5' }}>
                {entry.agentText}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
