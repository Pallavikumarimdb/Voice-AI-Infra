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
    <div style={{ maxWidth: '940px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
          Streaming Voice Translation Pipeline
        </h2>
        <p style={{ color: '#8b949e', margin: '6px 0 0 0', fontSize: '0.85rem' }}>
          Real-time Japanese ↔ English speech-to-text (faster-whisper) + continuous-batched MT (vLLM)
        </p>
      </header>

      {/* Control Bar */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '16px',
          background: '#161b22',
          borderRadius: '8px',
          border: '1px solid #30363d',
        }}
      >
        <button
          onClick={handleToggle}
          style={{
            background: state === 'streaming' ? '#da3633' : '#238636',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          {state === 'streaming' ? 'Stop Recording' : state === 'connecting' ? 'Connecting...' : 'Start Speaking'}
        </button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#8b949e' }}>Source:</label>
          <select
            value={srcLang}
            onChange={(e) => setSrcLang(e.target.value)}
            disabled={state !== 'idle'}
            style={{
              background: '#0d1117',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              padding: '6px 12px',
              borderRadius: '4px',
            }}
          >
            <option value="ja">Japanese (日本語)</option>
            <option value="en">English</option>
          </select>

          <label style={{ fontSize: '0.85rem', color: '#8b949e', marginLeft: '12px' }}>Target:</label>
          <select
            value={tgtLang}
            onChange={(e) => setTgtLang(e.target.value)}
            disabled={state !== 'idle'}
            style={{
              background: '#0d1117',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              padding: '6px 12px',
              borderRadius: '4px',
            }}
          >
            <option value="en">English</option>
            <option value="ja">Japanese (日本語)</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
          Status:{' '}
          <span style={{ fontWeight: 'bold', color: state === 'streaming' ? '#3fb950' : state === 'connecting' ? '#d29922' : '#8b949e' }}>
            {state.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Latency HUD */}
      <div style={{ marginBottom: '24px' }}>
        <LatencyHUD
          queueDepth={hudData.queueDepth}
          gpuUtil={hudData.gpuUtil}
          rtf={hudData.rtf}
          mode="translate"
          lastCaptureToFinalMs={asrCommitMs}
          lastMtDurationMs={mtDurationMs}
        />
      </div>

      {error && (
        <div style={{ padding: '12px', marginBottom: '16px', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: '6px', color: '#ff7b72', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Captions Display */}
      <div style={{ minHeight: '340px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
            Click &quot;Start Speaking&quot; to begin streaming audio. Partial captions and commit translations will appear here in real-time.
          </div>
        ) : (
          <Captions entries={entries} />
        )}
      </div>
    </div>
  );
};
