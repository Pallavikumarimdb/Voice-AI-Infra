import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from './session/SessionManager';
import { GatewayMessage } from '@voice/protocol';
import { Captions, CaptionEntry } from './ui/Captions';
import { LatencyHUD } from './ui/LatencyHUD';

export const App: React.FC = () => {
  const [state, setState] = useState<SessionState>('idle');
  const [mode, setMode] = useState<'agent' | 'translate'>('agent');
  const [srcLang, setSrcLang] = useState('ja');
  const [tgtLang, setTgtLang] = useState('en');
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const [hudData, setHudData] = useState({ queueDepth: 0, gpuUtil: 0, rtf: 0.35 });
  const [asrCommitMs, setAsrCommitMs] = useState<number | undefined>();
  const [mtDurationMs, setMtDurationMs] = useState<number | undefined>();
  const [agentTurnLatencyMs, setAgentTurnLatencyMs] = useState<number | undefined>();
  const [ttsFirstAudioMs, setTtsFirstAudioMs] = useState<number | undefined>();
  const [totalRoundTripMs, setTotalRoundTripMs] = useState<number | undefined>();
  const [agentVerified, setAgentVerified] = useState(false);
  const [promiseCaptured, setPromiseCaptured] = useState<string | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);
  const captureTimestampsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const gatewayProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const gatewayHost = window.location.hostname || 'localhost';
    const gatewayUrl = `${gatewayProtocol}//${gatewayHost}:8443/session`;

    sessionManagerRef.current = new SessionManager(gatewayUrl, {
      onStateChange: (newState) => {
        setState(newState);
        if (newState === 'idle') {
          setIsAgentSpeaking(false);
        }
      },
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
            captureTimestampsRef.current.set(msg.uttId, msg.tCapture);
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
        } else if (msg.type === 'agent_text') {
          if (msg.metrics?.llmMs) {
            setAgentTurnLatencyMs(msg.metrics.llmMs);
          }
          // Process brain events
          if (msg.events) {
            for (const ev of msg.events) {
              if (ev.type === 'identity_verified') {
                setAgentVerified(true);
              } else if (ev.type === 'promise_to_pay') {
                const amt = ev.payload?.amount ? `¥${ev.payload.amount.toLocaleString()}` : '';
                const date = ev.payload?.date || '';
                setPromiseCaptured(`${amt} on ${date}`.trim());
              }
            }
          }
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                agentText: msg.text,
              };
              return updated;
            } else {
              return [...prev, { uttId: msg.uttId, agentText: msg.text }];
            }
          });
        } else if (msg.type === 'agent_speech_start') {
          setIsAgentSpeaking(true);
          const tCapture = captureTimestampsRef.current.get(msg.uttId);
          if (tCapture) {
            const totalMs = Math.round(Date.now() - tCapture);
            setTotalRoundTripMs(totalMs);
            if (asrCommitMs && agentTurnLatencyMs) {
              const ttsMs = Math.max(0, totalMs - asrCommitMs - agentTurnLatencyMs);
              setTtsFirstAudioMs(ttsMs);
            }
          }
        } else if (msg.type === 'agent_speech_end') {
          setIsAgentSpeaking(false);
        } else if (msg.type === 'interrupt') {
          setIsAgentSpeaking(false);
          setEntries((prev) => {
            if (msg.uttId !== undefined) {
              const index = prev.findIndex((e) => e.uttId === msg.uttId);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = { ...updated[index], interrupted: true };
                return updated;
              }
            } else if (prev.length > 0) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], interrupted: true };
              return updated;
            }
            return prev;
          });
        } else if (msg.type === 'error') {
          console.warn('[App] Gateway error:', msg.code);
        }
      },
    });

    return () => {
      sessionManagerRef.current?.stop();
    };
  }, [asrCommitMs, agentTurnLatencyMs]);

  const handleToggle = () => {
    if (state === 'idle') {
      setError(null);
      sessionManagerRef.current?.start(srcLang, tgtLang, mode);
    } else {
      sessionManagerRef.current?.stop();
      setIsAgentSpeaking(false);
    }
  };

  return (
    <div style={{ maxWidth: '940px', margin: '0 auto', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
              Voice AI Infrastructure & Collections Agent
            </h1>
            <p style={{ color: '#8b949e', margin: '6px 0 0 0', fontSize: '0.95rem' }}>
              Real-time Japanese voice agent (faster-whisper + LangGraph + compliance guard + streaming TTS)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setMode('agent')}
              disabled={state !== 'idle'}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid #30363d',
                cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                background: mode === 'agent' ? '#1f6feb' : '#161b22',
                color: mode === 'agent' ? '#fff' : '#8b949e',
              }}
            >
              Collections Agent (日本語)
            </button>
            <button
              onClick={() => setMode('translate')}
              disabled={state !== 'idle'}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid #30363d',
                cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                background: mode === 'translate' ? '#1f6feb' : '#161b22',
                color: mode === 'translate' ? '#fff' : '#8b949e',
              }}
            >
              Voice Translator (Pipeline)
            </button>
          </div>
        </div>
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
          {state === 'streaming'
            ? 'End Call'
            : state === 'connecting'
            ? 'Connecting...'
            : mode === 'agent' ? 'Start Call (債権回収)' : 'Start Speaking'}
        </button>

        {mode === 'translate' ? (
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

            <label style={{ fontSize: '0.85rem', color: '#8b949e', marginLeft: '12px' }}>
              Target:
            </label>
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
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.85rem', color: '#8b949e' }}>
            <span>Target Debtor: <strong>山田 太郎 (Yamada Taro)</strong></span>
            <span>•</span>
            <span>Debt: <strong>¥48,000</strong></span>
            {isAgentSpeaking && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#58a6ff',
                  fontWeight: 600,
                  marginLeft: '8px',
                }}
              >
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#58a6ff' }} />
                Agent Speaking...
              </span>
            )}
          </div>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
          Status:{' '}
          <span
            style={{
              fontWeight: 'bold',
              color:
                state === 'streaming'
                  ? '#3fb950'
                  : state === 'connecting'
                  ? '#d29922'
                  : '#8b949e',
            }}
          >
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
          mode={mode}
          lastCaptureToFinalMs={asrCommitMs}
          lastMtDurationMs={mtDurationMs}
          agentTurnLatencyMs={agentTurnLatencyMs}
          ttsFirstAudioMs={ttsFirstAudioMs}
          totalRoundTripMs={totalRoundTripMs}
          agentVerified={agentVerified}
          promiseCaptured={promiseCaptured}
        />
      </div>

      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '16px',
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid #f85149',
            borderRadius: '6px',
            color: '#ff7b72',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Captions / Conversation Display */}
      <div
        style={{
          minHeight: '340px',
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>
            {mode === 'agent'
              ? 'Click "Start Call" to begin speaking with the Japanese Collections Voice Agent. Try responding cooperatively (e.g. "はい、山田です。1985年3月15日です") or challenging payment.'
              : 'Click "Start Speaking" to begin streaming audio. Partial captions and commit translations will appear here in real-time.'}
          </div>
        ) : (
          <Captions entries={entries} />
        )}
      </div>
    </div>
  );
};
