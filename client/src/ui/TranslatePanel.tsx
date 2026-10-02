import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from '../session/SessionManager';
import { GatewayMessage } from '@voice/protocol';
import { Captions, CaptionEntry } from './Captions';
import { LatencyHUD } from './LatencyHUD';

export const TranslatePanel: React.FC = () => {
  const [state, setState] = useState<SessionState>('idle');
  const [srcLang, setSrcLang] = useState('ja');
  const [tgtLang, setTgtLang] = useState('en');
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const [hudData, setHudData] = useState({ queueDepth: 0, gpuUtil: 0, rtf: 0.35 });
  const [asrCommitMs, setAsrCommitMs] = useState<number | undefined>();
  const [mtDurationMs, setMtDurationMs] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);

  useEffect(() => {
    const gatewayProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const gatewayHost = window.location.hostname || 'localhost';
    const gatewayUrl = `${gatewayProtocol}//${gatewayHost}:8443/session`;

    sessionManagerRef.current = new SessionManager(gatewayUrl, {
      onStateChange: (newState) => setState(newState),
      onError: (err) => setError(err),
      onMessage: (msg: GatewayMessage) => {
        if (msg.type === 'hud') {
          setHudData({
            queueDepth: msg.queueDepth,
            gpuUtil: msg.gpuUtil,
            rtf: msg.rtf,
          });
        } else if (msg.type === 'partial') {
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], partialText: msg.text };
              return updated;
            } else {
              return [...prev, { uttId: msg.uttId, partialText: msg.text }];
            }
          });
        } else if (msg.type === 'final') {
          if (msg.tCapture && msg.tFinal) {
            setAsrCommitMs(msg.tFinal - msg.tCapture);
          }
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], finalText: msg.text, partialText: undefined };
              return updated;
            } else {
              return [...prev, { uttId: msg.uttId, finalText: msg.text }];
            }
          });
        } else if (msg.type === 'translated') {
          if (msg.ttftMs && msg.decodeMs) {
            setMtDurationMs(Math.round(msg.ttftMs + msg.decodeMs));
          }
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], translation: msg.translation };
              return updated;
            } else {
              return [...prev, { uttId: msg.uttId, translation: msg.translation }];
            }
          });
        }
      },
    });

    return () => {
      sessionManagerRef.current?.stop();
    };
  }, []);

  const handleToggle = () => {
    if (state === 'idle') {
      setError(null);
      sessionManagerRef.current?.start(srcLang, tgtLang, 'translate');
    } else {
      sessionManagerRef.current?.stop();
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            Streaming Voice Translation Engine
          </h2>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
            }}
          >
            vLLM Batched
          </span>
        </div>
        <p style={{ color: 'var(--text-tertiary)', margin: 0, fontSize: '0.85rem' }}>
          Sub-500ms Japanese ↔ English speech-to-text (faster-whisper) + continuous-batched translation
        </p>
      </header>

      {/* Control Bar */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleToggle}
            style={{
              background: state === 'streaming' ? 'var(--danger-gradient)' : 'var(--primary-gradient)',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
              boxShadow: state === 'streaming' ? '0 4px 16px rgba(244, 63, 94, 0.35)' : '0 4px 16px rgba(99, 102, 241, 0.35)',
            }}
          >
            {state === 'streaming' ? '🛑 Stop Recording' : state === 'connecting' ? '⏳ Connecting...' : '🎙️ Start Speaking'}
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>SOURCE:</span>
            <select
              value={srcLang}
              onChange={(e) => setSrcLang(e.target.value)}
              disabled={state !== 'idle'}
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#fff',
                border: '1px solid var(--border-medium)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
              }}
            >
              <option value="ja">Japanese (日本語)</option>
              <option value="en">English</option>
            </select>

            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600, marginLeft: '8px' }}>TARGET:</span>
            <select
              value={tgtLang}
              onChange={(e) => setTgtLang(e.target.value)}
              disabled={state !== 'idle'}
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#fff',
                border: '1px solid var(--border-medium)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
              }}
            >
              <option value="en">English</option>
              <option value="ja">Japanese (日本語)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: state === 'streaming' ? '#10b981' : state === 'connecting' ? '#fbbf24' : 'var(--text-dim)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: state === 'streaming' ? '#34d399' : state === 'connecting' ? '#fbbf24' : 'var(--text-secondary)' }}>
            {state.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Latency HUD */}
      <LatencyHUD
        queueDepth={hudData.queueDepth}
        gpuUtil={hudData.gpuUtil}
        rtf={hudData.rtf}
        mode="translate"
        lastCaptureToFinalMs={asrCommitMs}
        lastMtDurationMs={mtDurationMs}
      />

      {error && (
        <div style={{ padding: '12px 18px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '10px', color: '#fda4af', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Captions Display */}
      <div className="glass-panel" style={{ minHeight: '360px', padding: '16px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🌐</div>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Translation Feed Inactive</div>
            <div style={{ fontSize: '0.82rem' }}>Click &quot;Start Speaking&quot; to begin streaming. Live partial captions and commit translations will render in real time.</div>
          </div>
        ) : (
          <Captions entries={entries} />
        )}
      </div>
    </div>
  );
};
