import React from 'react';

export interface CaptionEntry {
  uttId: number;
  partialText?: string;
  finalText?: string;
  translation?: string;
}

interface CaptionsProps {
  entries: CaptionEntry[];
}

export const Captions: React.FC<CaptionsProps> = ({ entries }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      {entries.map((entry) => (
        // Keyed by uttId so React diffs the text node rather than remounting the DOM node
        <div
          key={entry.uttId}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '4px' }}>
            Utterance #{entry.uttId}
          </div>

          {/* Original Speech (Final or Partial) */}
          <div style={{ fontSize: '1.15rem', lineHeight: '1.5' }}>
            {entry.finalText ? (
              <span style={{ color: '#f0f6fc' }}>{entry.finalText}</span>
            ) : (
              <span style={{ color: '#8b949e', fontStyle: 'italic' }}>
                {entry.partialText || '...'}
              </span>
            )}
          </div>

          {/* Committed Translation */}
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
        </div>
      ))}
    </div>
  );
};
