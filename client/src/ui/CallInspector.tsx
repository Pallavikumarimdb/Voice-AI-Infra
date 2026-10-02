import React, { useState, useEffect, useRef } from 'react';
import { CallDetail } from '../data/types.ts';
import { HashChainBadge, HardFailBadge, ComplianceBadge, LatencyBadge, SourceBadge } from './Badges.tsx';

interface CallInspectorProps {
  call: CallDetail;
  onBack: () => void;
}

export const CallInspector: React.FC<CallInspectorProps> = ({ call, onBack }) => {
  const [revealHiddenFacts, setRevealHiddenFacts] = useState(false);
  const [tamperedDemo, setTamperedDemo] = useState(false);
  const [playingState, setPlayingState] = useState<{
    turnIdx: number;
    speaker: 'user' | 'agent';
  } | null>(null);
  const [isPlayingFullCall, setIsPlayingFullCall] = useState(false);
  const fullCallCancelRef = useRef(false);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Group or process turns from audit log
  const auditRecords = call.auditLog || [];

  // Group into turn blocks
  const turns: Array<{
    turnNumber: number;
    userText?: string;
    agentAttempted?: string;
    agentFinal?: string;
    phase?: string;
    ruleBlocked?: string;
    toolCalls: Array<{ tool: string; args: any; result: any }>;
    latencyMs?: number;
    timestamp?: number;
    stateChange?: any;
  }> = [];

  let currentTurnNumber = 1;
  let activeTurn: (typeof turns)[0] = {
    turnNumber: currentTurnNumber,
    toolCalls: [],
  };

  for (const record of auditRecords) {
    if (record.stage === 'user_utterance') {
      const turnNum = record.payload?.turn || currentTurnNumber;
      if (activeTurn.userText || activeTurn.agentFinal) {
        turns.push(activeTurn);
        currentTurnNumber = turnNum;
        activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
      }
      activeTurn.userText = record.payload?.text;
      activeTurn.timestamp = record.ts;
    } else if (record.stage === 'agent_utterance') {
      activeTurn.agentAttempted = record.payload?.attempted;
      activeTurn.agentFinal = record.payload?.final;
      activeTurn.phase = record.payload?.phase;
      activeTurn.latencyMs = record.payload?.latency_ms;
      if (record.payload?.attempted && record.payload?.final && record.payload.attempted !== record.payload.final) {
        activeTurn.ruleBlocked = record.payload?.rule_violation || 'compliance_rewrite';
      }
      turns.push(activeTurn);
      currentTurnNumber++;
      activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
    } else if (record.stage === 'compliance_block') {
      activeTurn.ruleBlocked = record.payload?.rule || 'compliance_block';
      activeTurn.agentAttempted = record.payload?.attempted;
      activeTurn.agentFinal = record.payload?.final || record.payload?.text;
      activeTurn.phase = 'compliance_guard';
      turns.push(activeTurn);
      currentTurnNumber++;
      activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
    } else if (record.stage === 'tool_call') {
      activeTurn.toolCalls.push({
        tool: record.payload?.tool || 'unknown_tool',
        args: record.payload?.args || {},
        result: record.payload?.result || {},
      });
    } else if (record.stage === 'state_change') {
      activeTurn.stateChange = record.payload;
    }
  }
  if (activeTurn.userText || activeTurn.agentFinal || activeTurn.ruleBlocked) {
    turns.push(activeTurn);
  }

  // Simulated hash chain status or tampered fixture
  const effectiveHashChain = tamperedDemo
    ? { valid: false, error: 'Hash mismatch at seq 4: stored hash != recomputed digest', verifiedCount: 3, brokenSeq: 4 }
    : call.hashChain;

  const playUtterance = (text: string, turnIdx: number, speaker: 'user' | 'agent', onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported by your browser.');
      return;
    }
    window.speechSynthesis.cancel();
    setPlayingState({ turnIdx, speaker });

    const utterance = new SpeechSynthesisUtterance(text);
    const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(text);
    utterance.lang = hasJapanese ? 'ja-JP' : 'en-US';
    if (speaker === 'user') {
      utterance.pitch = 0.92;
      utterance.rate = 1.0;
    } else {
      utterance.pitch = 1.15;
      utterance.rate = 1.05;
    }

    utterance.onend = () => {
      setPlayingState(null);
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      setPlayingState(null);
      setIsPlayingFullCall(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopPlayback = () => {
    fullCallCancelRef.current = true;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingState(null);
    setIsPlayingFullCall(false);
  };

  const playFullCall = () => {
    if (isPlayingFullCall) {
      stopPlayback();
      return;
    }

    const playlist: Array<{ turnIdx: number; speaker: 'user' | 'agent'; text: string }> = [];
    turns.forEach((t, idx) => {
      if (t.userText && t.userText.trim()) {
        playlist.push({ turnIdx: idx, speaker: 'user', text: t.userText });
      }
      const agentText = t.agentFinal || t.agentAttempted;
      if (agentText && agentText.trim()) {
        playlist.push({ turnIdx: idx, speaker: 'agent', text: agentText });
      }
    });

    if (playlist.length === 0) return;

    fullCallCancelRef.current = false;
    setIsPlayingFullCall(true);

    let step = 0;
    const playNext = () => {
      if (fullCallCancelRef.current || step >= playlist.length) {
        setIsPlayingFullCall(false);
        setPlayingState(null);
        return;
      }
      const item = playlist[step];
      step++;
      playUtterance(item.text, item.turnIdx, item.speaker, () => {
        setTimeout(() => {
          if (!fullCallCancelRef.current) playNext();
        }, 350);
      });
    };

    playNext();
  };

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{
            padding: '6px 14px',
            background: '#21262d',
            color: '#c9d1d9',
            border: '1px solid #30363d',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          ← Back to Call List
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setTamperedDemo((prev) => !prev)}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #30363d',
              background: tamperedDemo ? 'rgba(248, 81, 73, 0.2)' : '#161b22',
              color: tamperedDemo ? '#f85149' : '#8b949e',
              cursor: 'pointer',
            }}
          >
            {tamperedDemo ? 'Reset Hash Chain' : 'Test Tampered Fixture'}
          </button>

          <HashChainBadge
            valid={effectiveHashChain.valid}
            verifiedCount={effectiveHashChain.verifiedCount}
            brokenSeq={effectiveHashChain.brokenSeq}
            error={effectiveHashChain.error}
          />
        </div>
      </div>

      {/* Call Summary Banner */}
      <div
        style={{
          padding: '16px 20px',
          background: '#161b22',
          borderRadius: '8px',
          border: '1px solid #30363d',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', textTransform: 'uppercase' }}>Session ID</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f0f6fc', fontFamily: 'monospace' }}>{call.id}</div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', textTransform: 'uppercase' }}>Variant & Source</div>
          <div style={{ fontSize: '0.95rem', color: '#e6edf3', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <SourceBadge source={call.source} />
            <span style={{ fontWeight: 600 }}>{call.variant}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', textTransform: 'uppercase' }}>Persona Target</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#58a6ff' }}>{call.personaId}</div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', textTransform: 'uppercase' }}>Final Outcome</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: call.runData?.promise_to_pay ? '#3fb950' : '#e6edf3' }}>
            {call.runData?.promise_to_pay ? '★ Promise Secured' : call.runData?.judge?.outcome || 'Completed'}
          </div>
        </div>

        {call.runData?.hard_fail && (
          <div>
            <div style={{ fontSize: '0.75rem', color: '#8b949e', textTransform: 'uppercase', marginBottom: '2px' }}>Hard-Fail Result</div>
            <HardFailBadge passed={call.runData.hard_fail.passed} numViolations={call.runData.hard_fail.num_final} />
          </div>
        )}
      </div>

      {/* Main Grid: Left Timeline (65%) vs Right Side Panel (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Turn-by-Turn Timeline */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
              Turn-by-Turn Execution Timeline
            </h3>
            {turns.length > 0 && (
              <button
                onClick={isPlayingFullCall ? stopPlayback : playFullCall}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: isPlayingFullCall ? 'rgba(248, 81, 73, 0.2)' : 'rgba(56, 139, 253, 0.15)',
                  color: isPlayingFullCall ? '#f85149' : '#58a6ff',
                  border: `1px solid ${isPlayingFullCall ? 'rgba(248, 81, 73, 0.4)' : 'rgba(56, 139, 253, 0.4)'}`,
                  cursor: 'pointer',
                }}
              >
                {isPlayingFullCall ? '⏹ Stop Audio' : '▶ Play Full Call (Synced Audio)'}
              </button>
            )}
          </div>

          {turns.length === 0 ? (
            <div style={{ padding: '32px', background: '#161b22', borderRadius: '8px', color: '#8b949e', textAlign: 'center' }}>
              No turns recorded for this call.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {turns.map((turn, idx) => {
                const hasBlock = Boolean(turn.ruleBlocked);
                const isUserPlaying = playingState?.turnIdx === idx && playingState?.speaker === 'user';
                const isAgentPlaying = playingState?.turnIdx === idx && playingState?.speaker === 'agent';

                return (
                  <div
                    key={idx}
                    style={{
                      background: hasBlock ? 'rgba(210, 153, 34, 0.05)' : '#161b22',
                      border: `1px solid ${hasBlock ? 'rgba(210, 153, 34, 0.4)' : '#30363d'}`,
                      borderRadius: '8px',
                      padding: '16px',
                    }}
                  >
                    {/* Turn Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: '#21262d',
                            color: '#f0f6fc',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            fontFamily: 'monospace',
                          }}
                        >
                          Turn #{turn.turnNumber}
                        </span>

                        {turn.phase && (
                          <span
                            style={{
                              background: 'rgba(56, 139, 253, 0.15)',
                              color: '#58a6ff',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            phase: {turn.phase}
                          </span>
                        )}

                        {hasBlock && <ComplianceBadge blocked={true} rule={turn.ruleBlocked} />}
                      </div>

                      {turn.latencyMs !== undefined && <LatencyBadge latencyMs={turn.latencyMs} />}
                    </div>

                    {/* Caller Speech */}
                    {turn.userText !== undefined && (
                      <div
                        style={{
                          marginBottom: '12px',
                          padding: '8px',
                          borderLeft: isUserPlaying ? '4px solid #58a6ff' : '3px solid #30363d',
                          background: isUserPlaying ? 'rgba(56, 139, 253, 0.08)' : 'transparent',
                          borderRadius: '4px',
                          transition: 'all 0.2s ease',
                          boxShadow: isUserPlaying ? '0 0 8px rgba(88, 166, 255, 0.25)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>👤 Caller / Debtor</div>
                          {turn.userText && (
                            <button
                              onClick={() => {
                                if (isUserPlaying) {
                                  stopPlayback();
                                } else {
                                  playUtterance(turn.userText!, idx, 'user');
                                }
                              }}
                              title="Play caller audio"
                              style={{
                                background: isUserPlaying ? 'rgba(56, 139, 253, 0.2)' : 'transparent',
                                border: '1px solid #30363d',
                                color: isUserPlaying ? '#58a6ff' : '#8b949e',
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              {isUserPlaying ? '🔊 Playing...' : '▶ Audio'}
                            </button>
                          )}
                        </div>
                        <div style={{ color: '#f0f6fc', fontSize: '0.95rem', lineHeight: '1.4' }}>
                          {turn.userText || <span style={{ color: '#8b949e', fontStyle: 'italic' }}>[Call initiated]</span>}
                        </div>
                      </div>
                    )}

                    {/* Agent Speech & Guard Diff */}
                    {(turn.agentFinal || turn.agentAttempted) && (
                      <div
                        style={{
                          padding: '8px',
                          borderLeft: isAgentPlaying ? '4px solid #3fb950' : `3px solid ${hasBlock ? '#d29922' : '#238636'}`,
                          background: isAgentPlaying ? 'rgba(63, 185, 80, 0.08)' : 'transparent',
                          borderRadius: '4px',
                          transition: 'all 0.2s ease',
                          boxShadow: isAgentPlaying ? '0 0 8px rgba(63, 185, 80, 0.25)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>🤖 Agent Response</div>
                          <button
                            onClick={() => {
                              const agentText = turn.agentFinal || turn.agentAttempted || '';
                              if (isAgentPlaying) {
                                stopPlayback();
                              } else if (agentText) {
                                playUtterance(agentText, idx, 'agent');
                              }
                            }}
                            title="Play agent audio"
                            style={{
                              background: isAgentPlaying ? 'rgba(63, 185, 80, 0.2)' : 'transparent',
                              border: '1px solid #30363d',
                              color: isAgentPlaying ? '#3fb950' : '#8b949e',
                              cursor: 'pointer',
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {isAgentPlaying ? '🔊 Playing...' : '▶ Audio'}
                          </button>
                        </div>

                        {/* Guard Diff: Attempted vs Final */}
                        {hasBlock && turn.agentAttempted && turn.agentAttempted !== turn.agentFinal ? (
                          <div style={{ marginBottom: '8px', marginTop: '4px' }}>
                            <div
                              style={{
                                padding: '8px 12px',
                                background: 'rgba(248, 81, 73, 0.1)',
                                border: '1px dashed rgba(248, 81, 73, 0.4)',
                                borderRadius: '4px',
                                marginBottom: '6px',
                                textDecoration: 'line-through',
                                color: '#ff7b72',
                                fontSize: '0.9rem',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>Attempted (Blocked): </span>
                              {turn.agentAttempted}
                            </div>
                            <div
                              style={{
                                padding: '8px 12px',
                                background: 'rgba(63, 185, 80, 0.1)',
                                border: '1px solid rgba(63, 185, 80, 0.3)',
                                borderRadius: '4px',
                                color: '#3fb950',
                                fontSize: '0.95rem',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>Safe Guard Override: </span>
                              {turn.agentFinal}
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: '#e6edf3', fontSize: '0.95rem', lineHeight: '1.4', marginTop: '4px' }}>
                            {turn.agentFinal || turn.agentAttempted}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool Calls */}
                    {turn.toolCalls.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {turn.toolCalls.map((tc, tIdx) => (
                          <details
                            key={tIdx}
                            style={{
                              background: '#0d1117',
                              border: '1px solid #30363d',
                              borderRadius: '4px',
                              padding: '6px 10px',
                              fontSize: '0.8rem',
                              fontFamily: 'monospace',
                              marginBottom: '4px',
                            }}
                          >
                            <summary style={{ cursor: 'pointer', color: '#58a6ff', fontWeight: 600 }}>
                              🔧 Tool Call: {tc.tool}()
                            </summary>
                            <div style={{ marginTop: '6px', color: '#c9d1d9' }}>
                              <div>
                                <strong>Args:</strong> {JSON.stringify(tc.args)}
                              </div>
                              <div>
                                <strong>Result:</strong> {JSON.stringify(tc.result)}
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Metadata Panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Structured Human Handoff Record */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc', margin: '0 0 12px 0' }}>
              Structured Handoff Summary
            </h4>
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ color: '#8b949e' }}>Target Debtor: </span>
                <span style={{ color: '#f0f6fc', fontWeight: 600 }}>
                  {call.persona?.debtor_profile?.full_name || '田中 健一'}
                </span>
              </div>

              <div>
                <span style={{ color: '#8b949e' }}>Identity Verification: </span>
                <span style={{ color: call.runData?.hard_fail?.passed ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  {call.runData?.hard_fail?.passed ? '✓ Verified' : '✗ Unverified'}
                </span>
              </div>

              {call.runData?.promise_to_pay && (
                <div style={{ background: 'rgba(63, 185, 80, 0.1)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(63, 185, 80, 0.3)' }}>
                  <div style={{ fontWeight: 600, color: '#3fb950' }}>★ Promise to Pay Recorded</div>
                  <div style={{ color: '#c9d1d9', fontSize: '0.8rem', marginTop: '2px' }}>
                    Agreed monthly installment terms recorded.
                  </div>
                </div>
              )}

              <div>
                <span style={{ color: '#8b949e' }}>Action Recommendation: </span>
                <div style={{ marginTop: '4px', padding: '8px', background: '#0d1117', borderRadius: '4px', color: '#58a6ff', fontSize: '0.8rem' }}>
                  {call.runData?.promise_to_pay
                    ? 'PAYMENT_MONITORING: Monitor payment schedule. SMS notification dispatched.'
                    : 'FOLLOW_UP: Outbound contact required within statutory calling hours.'}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: LLM-as-Judge Evaluation */}
          {call.runData?.judge && (
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
                  LLM-as-Judge Evaluation
                </h4>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: 'rgba(56, 139, 253, 0.15)',
                    color: '#58a6ff',
                  }}
                >
                  Score: {call.runData.judge.mean_score.toFixed(2)} / 5.0
                </span>
              </div>

              {/* 6 Rubric Criteria Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', marginBottom: '12px' }}>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>傾聴と受け止め</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.listening_and_acknowledgement || 5} / 5</div>
                </div>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>威圧感のないペース</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.pacing_and_tone || 5} / 5</div>
                </div>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>脱線からの復帰</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.recovery_off_script || 4} / 5</div>
                </div>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>承認条件内の提案</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.negotiation_quality || 5} / 5</div>
                </div>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>復唱による確認</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.clarity_of_confirmation || 5} / 5</div>
                </div>
                <div style={{ background: '#0d1117', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>適切な出口処理</div>
                  <div style={{ fontWeight: 600, color: '#f0f6fc' }}>{call.runData.judge.scores?.appropriate_escalation || 5} / 5</div>
                </div>
              </div>

              {call.runData.judge.justification && (
                <div style={{ fontSize: '0.8rem', color: '#8b949e', borderTop: '1px solid #30363d', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#c9d1d9' }}>Judge Rationale: </span>
                  {call.runData.judge.justification}
                </div>
              )}
            </div>
          )}

          {/* Card 3: Persona Hidden Facts (Unbiased Reveal Toggle) */}
          {call.persona && (
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
                  Persona Ground Truth
                </h4>
                <button
                  onClick={() => setRevealHiddenFacts((prev) => !prev)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.75rem',
                    background: '#21262d',
                    color: '#58a6ff',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {revealHiddenFacts ? 'Hide Facts' : 'Reveal Hidden Facts 👁️'}
                </button>
              </div>

              <div style={{ fontSize: '0.85rem' }}>
                <div style={{ color: '#8b949e', marginBottom: '6px' }}>
                  <strong>Description: </strong>
                  {call.persona.description}
                </div>

                {revealHiddenFacts ? (
                  <div style={{ background: '#0d1117', padding: '10px', borderRadius: '6px', border: '1px solid #30363d', marginTop: '8px' }}>
                    <div style={{ color: '#f0f6fc', fontWeight: 600, marginBottom: '4px' }}>Hidden Facts (Concealed from Agent):</div>
                    <div style={{ color: '#c9d1d9', fontSize: '0.8rem', marginBottom: '4px' }}>
                      <strong>Reason: </strong> {call.persona.hidden_situation?.reason}
                    </div>
                    <div style={{ color: '#c9d1d9', fontSize: '0.8rem', marginBottom: '4px' }}>
                      <strong>Financial State: </strong> {call.persona.hidden_situation?.financial_state}
                    </div>
                    <div style={{ color: '#c9d1d9', fontSize: '0.8rem' }}>
                      <strong>Temperament: </strong> {call.persona.hidden_situation?.temperament}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '8px', background: '#0d1117', borderRadius: '4px', color: '#8b949e', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '6px' }}>
                    Hidden facts concealed so you can evaluate the agent unbiased. Click &quot;Reveal Hidden Facts&quot; to inspect.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
