import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from '../session/SessionManager';
import { GatewayMessage } from '@voice/protocol';
import { Captions, CaptionEntry } from './Captions';
import { LatencyHUD } from './LatencyHUD';

interface LiveCallPanelProps {
  onInspectCall: (sessionId: string) => void;
}

export const LiveCallPanel: React.FC<LiveCallPanelProps> = ({ onInspectCall }) => {
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const [hudData, setHudData] = useState({ queueDepth: 0, gpuUtil: 0, rtf: 0.35 });
  const [asrCommitMs, setAsrCommitMs] = useState<number | undefined>();
  const [agentTurnLatencyMs, setAgentTurnLatencyMs] = useState<number | undefined>();
  const [ttsFirstAudioMs, setTtsFirstAudioMs] = useState<number | undefined>();
  const [totalRoundTripMs, setTotalRoundTripMs] = useState<number | undefined>();
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent call state indicators
  const [callPhase, setCallPhase] = useState('greet');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [disclosureDone, setDisclosureDone] = useState(false);
  const [stopContact, setStopContact] = useState(false);
  const [promiseCaptured, setPromiseCaptured] = useState<string | null>(null);

  // Streaming Compliance Event Feed
  const [eventsFeed, setEventsFeed] = useState<Array<{ type: string; rule?: string; text?: string; time: string }>>([]);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
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
          if (currentSessionIdRef.current) {
            setLastCompletedSessionId(currentSessionIdRef.current);
          }
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
        } else if (msg.type === 'agent_text') {
          currentSessionIdRef.current = msg.sessionId;
          if (msg.metrics?.llmMs) {
            setAgentTurnLatencyMs(msg.metrics.llmMs);
          }

          // Process brain events
          if (msg.events) {
            for (const ev of msg.events) {
              const timeStr = new Date().toLocaleTimeString();
              if (ev.type === 'identity_verified') {
                setIdentityVerified(true);
                setCallPhase('disclose');
                setEventsFeed((prev) => [{ type: 'identity_verified', text: 'Identity confirmed by DOB match', time: timeStr }, ...prev]);
              } else if (ev.type === 'promise_to_pay') {
                const amt = ev.payload?.amount ? `¥${ev.payload.amount.toLocaleString()}` : '';
                const date = ev.payload?.date || '';
                setPromiseCaptured(`${amt} on ${date}`.trim());
                setCallPhase('close');
                setEventsFeed((prev) => [{ type: 'promise_to_pay', text: `Promise recorded: ${amt} on ${date}`, time: timeStr }, ...prev]);
              } else if (ev.type === 'compliance_block') {
                setEventsFeed((prev) => [{ type: 'compliance_block', rule: ev.payload?.rule || 'compliance_rule', text: ev.payload?.text || 'Guard intercepted illegal phrasing', time: timeStr }, ...prev]);
              } else if (ev.type === 'escalate') {
                setEventsFeed((prev) => [{ type: 'escalate', text: `Escalated to human collector: ${ev.payload?.reason || ''}`, time: timeStr }, ...prev]);
              } else if (ev.type === 'stop_contact') {
                setStopContact(true);
                setEventsFeed((prev) => [{ type: 'stop_contact', text: 'Debtor requested stop contact; added to suppress list', time: timeStr }, ...prev]);
              }
            }
          }

          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], agentText: msg.text };
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
          const timeStr = new Date().toLocaleTimeString();
          setEventsFeed((prev) => [{ type: 'interrupt', text: 'Barge-in: Caller spoke during agent playback', time: timeStr }, ...prev]);

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
      setLastCompletedSessionId(null);
      setIdentityVerified(false);
      setDisclosureDone(false);
      setStopContact(false);
      setPromiseCaptured(null);
      setCallPhase('greet');
      setEventsFeed([]);
      sessionManagerRef.current?.start('ja', 'ja', 'agent');
    } else {
      sessionManagerRef.current?.stop();
      setIsAgentSpeaking(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Top Banner & Control Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '16px 20px',
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
          {state === 'streaming' ? 'End Call' : state === 'connecting' ? 'Connecting...' : 'Start Call (債権回収)'}
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.85rem', color: '#8b949e' }}>
          <span>Target Debtor: <strong>山田 太郎 (Taro Yamada)</strong></span>
          <span>•</span>
          <span>Debt: <strong>¥48,000 (みらいファイナンス)</strong></span>
          {isAgentSpeaking && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#58a6ff', fontWeight: 600, marginLeft: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#58a6ff' }} />
              Agent Speaking (Barge-in active)...
            </span>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
          {lastCompletedSessionId && (
            <button
              onClick={() => onInspectCall(lastCompletedSessionId)}
              style={{
                padding: '6px 14px',
                background: '#1f6feb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Inspect This Call in Inspector →
            </button>
          )}

          <span
            style={{
              fontWeight: 'bold',
              fontSize: '0.85rem',
              color: state === 'streaming' ? '#3fb950' : state === 'connecting' ? '#d29922' : '#8b949e',
            }}
          >
            {state.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Latency HUD */}
      <div style={{ marginBottom: '20px' }}>
        <LatencyHUD
          queueDepth={hudData.queueDepth}
          gpuUtil={hudData.gpuUtil}
          rtf={hudData.rtf}
          mode="agent"
          lastCaptureToFinalMs={asrCommitMs}
          agentTurnLatencyMs={agentTurnLatencyMs}
          ttsFirstAudioMs={ttsFirstAudioMs}
          totalRoundTripMs={totalRoundTripMs}
          agentVerified={identityVerified}
          promiseCaptured={promiseCaptured}
        />
      </div>

      {error && (
        <div style={{ padding: '12px', marginBottom: '16px', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: '6px', color: '#ff7b72', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Two Column Grid: Left Live Captions vs Right State Indicators & Compliance Event Stream */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)', gap: '20px', alignItems: 'start' }}>
        {/* Left Column: Live Captions */}
        <div
          style={{
            minHeight: '380px',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', fontSize: '0.85rem', fontWeight: 600, color: '#f0f6fc' }}>
            Live Conversation Stream
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#484f58' }}>
              Click &quot;Start Call&quot; to speak. Speak your name and birthday (e.g. &quot;はい、山田です。1985年3月15日です&quot;) to verify identity.
            </div>
          ) : (
            <Captions entries={entries} />
          )}
        </div>

        {/* Right Column: State Indicator & Compliance Event Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: State Machine Indicators */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f6fc', margin: '0 0 12px 0' }}>
              Real-Time Agent State Indicators
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
              <div style={{ background: '#0d1117', padding: '8px', borderRadius: '4px' }}>
                <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Current Phase</div>
                <div style={{ fontWeight: 600, color: '#58a6ff' }}>{callPhase}</div>
              </div>

              <div style={{ background: '#0d1117', padding: '8px', borderRadius: '4px' }}>
                <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Identity Verified</div>
                <div style={{ fontWeight: 600, color: identityVerified ? '#3fb950' : '#d29922' }}>
                  {identityVerified ? '✓ Verified' : '⚠ Pending'}
                </div>
              </div>

              <div style={{ background: '#0d1117', padding: '8px', borderRadius: '4px' }}>
                <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Disclosure Done</div>
                <div style={{ fontWeight: 600, color: disclosureDone ? '#3fb950' : '#8b949e' }}>
                  {disclosureDone ? '✓ Completed' : '— Pending'}
                </div>
              </div>

              <div style={{ background: '#0d1117', padding: '8px', borderRadius: '4px' }}>
                <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Stop Contact Flag</div>
                <div style={{ fontWeight: 600, color: stopContact ? '#f85149' : '#3fb950' }}>
                  {stopContact ? 'ACTIVE (Suppressed)' : 'None'}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Streaming Compliance Event Feed */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px', minHeight: '260px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
                Streaming Compliance Event Feed
              </h4>
              <span style={{ fontSize: '0.7rem', color: '#3fb950' }}>● Live Guard</span>
            </div>

            {eventsFeed.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#484f58', fontSize: '0.8rem' }}>
                No compliance events triggered yet. Asking for debt amount before verification will trigger a guard event here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {eventsFeed.map((ev, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      background: ev.type === 'compliance_block' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(56, 139, 253, 0.08)',
                      border: `1px solid ${ev.type === 'compliance_block' ? 'rgba(248, 81, 73, 0.3)' : 'rgba(56, 139, 253, 0.2)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, color: ev.type === 'compliance_block' ? '#f85149' : '#58a6ff' }}>
                        {ev.type === 'compliance_block' ? `🛡️ Block [${ev.rule}]` : ev.type}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#8b949e' }}>{ev.time}</span>
                    </div>
                    <div style={{ color: '#c9d1d9', fontSize: '0.75rem' }}>{ev.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
