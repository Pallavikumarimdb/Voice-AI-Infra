import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from '../session/SessionManager';
import { GatewayMessage, AgentConfig } from '@voice/protocol';
import { Captions, CaptionEntry } from './Captions';
import { LatencyHUD } from './LatencyHUD';

export type DomainType = 'collections' | 'screening' | 'kyc' | 'custom';
export type AgentLanguage = 'ja' | 'en';

interface DomainPreset {
  id: DomainType;
  title: string;
  badge: string;
  actionText: string;
  targetLabel: string;
  contextDesc: string;
  greeting: string;
  instructions: string;
  guardrails: string[];
}

const DOMAIN_PRESETS: Record<AgentLanguage, Record<DomainType, DomainPreset>> = {
  ja: {
    collections: {
      id: 'collections',
      title: 'Collections & AR',
      badge: '💼 債権回収',
      actionText: 'Start Call (債権回収)',
      targetLabel: '山田 太郎 (Taro Yamada)',
      contextDesc: 'Debt: ¥48,000 • Creditor: みらいファイナンス',
      greeting: 'もしもし、山田太郎様のお電話でお間違いないでしょうか？私、みらい債権回収センターのAIオペレーターでございます。',
      instructions: 'Maintain polite Japanese Keigo (です・ます). Strictly verify debtor identity with Date of Birth before disclosing amount. If debtor mentions financial hardship, offer structured installment plans up to 6 months.',
      guardrails: ['DOB Verification Required', 'Calling Hours (08:00-21:00 JST)', 'Third-Party Disclosure Ban', 'Civility Filter']
    },
    screening: {
      id: 'screening',
      title: 'Candidate Screening',
      badge: '🎯 採用スクリーニング',
      actionText: 'Start Call (採用選考)',
      targetLabel: '佐藤 健一 (Kenichi Sato)',
      contextDesc: 'Role: Senior Full-Stack Engineer • Level: Lead',
      greeting: '佐藤様、本日は面談のお時間をいただきありがとうございます。AI採用アシスタントとして、ご経歴と転職のご希望条件について数点お伺いいたします。',
      instructions: 'Conduct a professional, warm 5-minute first-round screening interview. Ask about: 1) Recent experience with React & distributed systems, 2) Preferred working model (remote vs hybrid), 3) Expected compensation range. Validate answers concisely.',
      guardrails: ['Anti-Discrimination Guard', 'Salary Range Cap Check', 'Strict NDA & Privacy', 'Civility Filter']
    },
    kyc: {
      id: 'kyc',
      title: 'Customer KYC & Support',
      badge: '🛡️ 本人確認・サポート',
      actionText: 'Start Call (本人確認)',
      targetLabel: '鈴木 一郎 (Ichiro Suzuki)',
      contextDesc: 'Account: ACC-88219 • Security Tier: 2',
      greeting: 'お電話ありがとうございます。カスタマーサポートAIでございます。お手続きの前にご本人様確認を実施させていただきます。',
      instructions: 'Authenticate customer by confirming registered phone number and 4-digit security PIN. Assist with account inquiry once authenticated. Never reveal plaintext PIN or sensitive billing data unverified.',
      guardrails: ['2-Factor PIN Authentication', 'PII Masking Guard', 'Fraud Suspicion Auto-Flag', 'Civility Filter']
    },
    custom: {
      id: 'custom',
      title: 'Custom Enterprise Agent',
      badge: '⚡ カスタム',
      actionText: 'Start Call (カスタムAI)',
      targetLabel: 'Target Contact',
      contextDesc: 'Custom Scenario & Enterprise Parameters',
      greeting: 'お電話ありがとうございます。AIアシスタントでございます。どのようなご用件でしょうか。',
      instructions: 'Act as a professional enterprise voice agent. Follow customer instructions, maintain high empathy, and protect customer data.',
      guardrails: ['Custom Regulatory Guard', 'PII Protection', 'Civility Filter']
    }
  },
  en: {
    collections: {
      id: 'collections',
      title: 'Collections & AR',
      badge: '💼 Collections (AR)',
      actionText: 'Start Call (Collections)',
      targetLabel: 'Alex Johnson',
      contextDesc: 'Balance: $350.00 • Creditor: Apex Capital Services',
      greeting: 'Hello, this is Accounts Management calling for Alex Johnson. Am I speaking with Alex?',
      instructions: 'Maintain professional, empathetic tone. Strictly verify identity before disclosing balance. Offer 3 to 6-month installment plans if hardship is mentioned.',
      guardrails: ['FDCPA Compliance Verified', 'Calling Hours (08:00-21:00 Local)', 'Third-Party Disclosure Ban', 'Civility & Anti-Harassment']
    },
    screening: {
      id: 'screening',
      title: 'Candidate Screening',
      badge: '🎯 Candidate Screening',
      actionText: 'Start Call (Screening)',
      targetLabel: 'Alex Johnson',
      contextDesc: 'Role: Senior Software Engineer • Level: Lead',
      greeting: 'Hello Alex, thank you for making time to speak today! I am your AI recruiting assistant conducting your first-round interview for the Senior Software Engineer position.',
      instructions: 'Conduct a warm, professional 5-minute first-round interview. Inquire about: 1) System architecture & modern tech stacks, 2) Preferred work mode (remote/hybrid), 3) Expected salary range. Validate answers concisely.',
      guardrails: ['Equal Opportunity / EEOC Guard', 'Compensation Fairness Cap', 'Strict NDA & Privacy', 'Civility Filter']
    },
    kyc: {
      id: 'kyc',
      title: 'Customer KYC & Support',
      badge: '🛡️ Customer KYC & Support',
      actionText: 'Start Call (KYC)',
      targetLabel: 'John Smith',
      contextDesc: 'Account: ACC-88219 • Security Tier: Level 2',
      greeting: 'Thank you for calling Customer Support. I am your AI verification specialist. Am I speaking with John Smith?',
      instructions: 'Authenticate customer by confirming registered phone number and 4-digit PIN. Assist with account inquiries once verified. Never disclose sensitive billing info unverified.',
      guardrails: ['Two-Factor PIN Authentication', 'PII Data Masking', 'Suspicious Activity Detection', 'Civility Filter']
    },
    custom: {
      id: 'custom',
      title: 'Custom Enterprise Agent',
      badge: '⚡ Custom Agent',
      actionText: 'Start Call (Custom Agent)',
      targetLabel: 'Target Contact',
      contextDesc: 'Enterprise Custom Workflow',
      greeting: 'Hello! Thank you for calling. I am your enterprise voice AI assistant. How may I assist you today?',
      instructions: 'Act as a professional enterprise voice agent. Follow customer instructions, maintain high empathy, and protect customer data.',
      guardrails: ['Enterprise Compliance Guard', 'PII Data Protection', 'Civility Filter']
    }
  }
};

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

  // Dynamic Domain & Agent Configuration state
  const [agentLanguage, setAgentLanguage] = useState<AgentLanguage>('ja');
  const [activeDomain, setActiveDomain] = useState<DomainType>('collections');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [customGreeting, setCustomGreeting] = useState(DOMAIN_PRESETS.ja.collections.greeting);
  const [customInstructions, setCustomInstructions] = useState(DOMAIN_PRESETS.ja.collections.instructions);
  const [targetContext, setTargetContext] = useState(DOMAIN_PRESETS.ja.collections.contextDesc);
  const [targetSubject, setTargetSubject] = useState(DOMAIN_PRESETS.ja.collections.targetLabel);
  const [activeGuardrails, setActiveGuardrails] = useState<string[]>(DOMAIN_PRESETS.ja.collections.guardrails);

  // Domain-specific state indicators
  const [callPhase, setCallPhase] = useState('greet');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [disclosureDone, setDisclosureDone] = useState(false);
  const [stopContact, setStopContact] = useState(false);
  const [promiseCaptured, setPromiseCaptured] = useState<string | null>(null);

  // Candidate Screening indicators
  const [screeningQualified, setScreeningQualified] = useState(false);
  const [screeningStage, setScreeningStage] = useState('intro');

  // KYC indicators
  const [kycResolved, setKycResolved] = useState(false);

  // Streaming Compliance & Event Feed
  const [eventsFeed, setEventsFeed] = useState<Array<{ type: string; rule?: string; text?: string; time: string }>>([]);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const captureTimestampsRef = useRef<Map<number, number>>(new Map());

  // Handle switching preset
  const handleSelectDomain = (domain: DomainType) => {
    setActiveDomain(domain);
    const preset = DOMAIN_PRESETS[agentLanguage][domain];
    setCustomGreeting(preset.greeting);
    setCustomInstructions(preset.instructions);
    setTargetContext(preset.contextDesc);
    setTargetSubject(preset.targetLabel);
    setActiveGuardrails(preset.guardrails);
  };

  // Handle switching language
  const handleSelectLanguage = (lang: AgentLanguage) => {
    setAgentLanguage(lang);
    const preset = DOMAIN_PRESETS[lang][activeDomain];
    setCustomGreeting(preset.greeting);
    setCustomInstructions(preset.instructions);
    setTargetContext(preset.contextDesc);
    setTargetSubject(preset.targetLabel);
    setActiveGuardrails(preset.guardrails);
  };

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
                setEventsFeed((prev) => [{ type: 'identity_verified', text: 'Identity verified successfully', time: timeStr }, ...prev]);
              } else if (ev.type === 'promise_to_pay') {
                const amt = ev.payload?.amount ? `¥${ev.payload.amount.toLocaleString()}` : '';
                const date = ev.payload?.date || '';
                setPromiseCaptured(`${amt} on ${date}`.trim());
                setCallPhase('close');
                setEventsFeed((prev) => [{ type: 'promise_to_pay', text: `Promise recorded: ${amt} on ${date}`, time: timeStr }, ...prev]);
              } else if (ev.type === 'compliance_block') {
                setEventsFeed((prev) => [{ type: 'compliance_block', rule: ev.payload?.rule || 'compliance_rule', text: ev.payload?.text || 'Guard intercepted unauthorized disclosure', time: timeStr }, ...prev]);
              } else if (ev.type === 'escalate') {
                setEventsFeed((prev) => [{ type: 'escalate', text: `Escalated to human supervisor: ${ev.payload?.reason || ''}`, time: timeStr }, ...prev]);
              } else if (ev.type === 'stop_contact') {
                setStopContact(true);
                setEventsFeed((prev) => [{ type: 'stop_contact', text: 'Stop contact requested; added to suppress list', time: timeStr }, ...prev]);
              } else if (ev.type === 'candidate_qualified') {
                setScreeningQualified(true);
                setScreeningStage('qualified');
                setEventsFeed((prev) => [{ type: 'candidate_qualified', text: 'Candidate successfully qualified for next round', time: timeStr }, ...prev]);
              } else if (ev.type === 'state_change') {
                if (ev.payload?.stage) {
                  setScreeningStage(ev.payload.stage);
                }
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
          setEventsFeed((prev) => [{ type: 'interrupt', text: 'Barge-in: User spoke during agent playback (<25ms cutoff)', time: timeStr }, ...prev]);

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
      setScreeningQualified(false);
      setScreeningStage('intro');
      setKycResolved(false);
      setCallPhase('greet');
      setEventsFeed([]);

      // Prepare agent config
      const agentConfig: AgentConfig = {
        domain: activeDomain,
        language: agentLanguage,
        instructions: customInstructions,
        greeting: customGreeting,
        guardrails: activeGuardrails,
        context: {
          targetSubject,
          contextDesc: targetContext,
          candidateName: targetSubject,
          customerName: targetSubject,
          debtorName: targetSubject,
        }
      };

      sessionManagerRef.current?.start(agentLanguage, agentLanguage, 'agent', agentConfig);
    } else {
      sessionManagerRef.current?.stop();
      setIsAgentSpeaking(false);
    }
  };

  const currentPreset = DOMAIN_PRESETS[agentLanguage][activeDomain];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* Agent Studio & Domain Configurator Card */}
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          marginBottom: '20px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(31, 111, 235, 0.08)',
            borderBottom: isConfigOpen ? '1px solid #30363d' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f6fc' }}>
              ⚙️ Agent Studio: Domain & Instructions Configurator
            </span>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d' }}>
              Active: {currentPreset.badge}
            </span>
          </div>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {isConfigOpen ? 'Hide Studio Configuration ▲' : 'Customize Instructions & Rules ▼'}
          </button>
        </div>

        {/* Domain Presets & Voice Language Bar */}
        <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', borderBottom: isConfigOpen ? '1px solid #21262d' : 'none' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#8b949e', marginRight: '6px' }}>Domain Preset:</span>
            {(Object.keys(DOMAIN_PRESETS[agentLanguage]) as DomainType[]).map((dKey) => {
              const preset = DOMAIN_PRESETS[agentLanguage][dKey];
              const isSelected = activeDomain === dKey;
              return (
                <button
                  key={dKey}
                  onClick={() => handleSelectDomain(dKey)}
                  disabled={state !== 'idle'}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid #1f6feb' : '1px solid #30363d',
                    background: isSelected ? 'rgba(31, 111, 235, 0.15)' : '#21262d',
                    color: isSelected ? '#58a6ff' : '#c9d1d9',
                    cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {preset.badge}
                </button>
              );
            })}
          </div>

          {/* Voice Language Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>Voice Language:</span>
            <div style={{ display: 'inline-flex', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => handleSelectLanguage('ja')}
                disabled={state !== 'idle'}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: agentLanguage === 'ja' ? '#1f6feb' : 'transparent',
                  color: agentLanguage === 'ja' ? '#ffffff' : '#8b949e',
                  fontWeight: agentLanguage === 'ja' ? 600 : 400,
                  cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🇯🇵</span>
                <span>日本語</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectLanguage('en')}
                disabled={state !== 'idle'}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: agentLanguage === 'en' ? '#238636' : 'transparent',
                  color: agentLanguage === 'en' ? '#ffffff' : '#8b949e',
                  fontWeight: agentLanguage === 'en' ? 600 : 400,
                  cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🇺🇸</span>
                <span>English</span>
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Configuration Body */}
        {isConfigOpen && (
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#c9d1d9', marginBottom: '6px' }}>
                System Instructions & Domain Guidance:
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                disabled={state !== 'idle'}
                rows={4}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#c9d1d9', marginTop: '12px', marginBottom: '6px' }}>
                Opening Utterance / Initial Greeting:
              </label>
              <input
                type="text"
                value={customGreeting}
                onChange={(e) => setCustomGreeting(e.target.value)}
                disabled={state !== 'idle'}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#c9d1d9', marginBottom: '6px' }}>
                  Target Contact & Scenario Context:
                </label>
                <input
                  type="text"
                  value={targetSubject}
                  onChange={(e) => setTargetSubject(e.target.value)}
                  disabled={state !== 'idle'}
                  placeholder="Target Name / Person"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#f0f6fc',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                  }}
                />
                <input
                  type="text"
                  value={targetContext}
                  onChange={(e) => setTargetContext(e.target.value)}
                  disabled={state !== 'idle'}
                  placeholder="Scenario Context / Details"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#f0f6fc',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#c9d1d9', marginBottom: '6px' }}>
                  Active Regulatory & Safety Guardrails:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activeGuardrails.map((rule, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#8b949e' }}>
                      <span style={{ color: '#3fb950', fontWeight: 'bold' }}>✓</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
          {state === 'streaming' ? 'End Call' : state === 'connecting' ? 'Connecting...' : currentPreset.actionText}
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.85rem', color: '#8b949e' }}>
          <span>Subject: <strong style={{ color: '#f0f6fc' }}>{targetSubject}</strong></span>
          <span>•</span>
          <span>Context: <strong style={{ color: '#c9d1d9' }}>{targetContext}</strong></span>
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
              Inspect Call in Inspector →
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
          <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', fontSize: '0.85rem', fontWeight: 600, color: '#f0f6fc', display: 'flex', justifyContent: 'space-between' }}>
            <span>Live Conversation Stream</span>
            <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>Domain: {currentPreset.title}</span>
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#484f58' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎙️</div>
              <div>Click <strong>{currentPreset.actionText}</strong> to begin.</div>
              <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>Speak in Japanese or English to test real-time ASR, agent reasoning, and sub-25ms barge-in.</div>
            </div>
          ) : (
            <div style={{ padding: '16px', maxHeight: '480px', overflowY: 'auto' }}>
              <Captions entries={entries} />
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Domain State Indicators & Streaming Compliance Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Dynamic Domain State Indicators Card */}
          <div
            style={{
              padding: '16px',
              background: '#161b22',
              borderRadius: '8px',
              border: '1px solid #30363d',
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f0f6fc', marginBottom: '12px' }}>
              Workflow State Machine ({currentPreset.title})
            </div>

            {activeDomain === 'collections' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Phase</div>
                  <div style={{ color: '#f0f6fc', fontWeight: 600 }}>{callPhase.toUpperCase()}</div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Identity Verified</div>
                  <div style={{ color: identityVerified ? '#3fb950' : '#8b949e', fontWeight: 600 }}>
                    {identityVerified ? '✓ VERIFIED' : 'PENDING'}
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Disclosure Done</div>
                  <div style={{ color: disclosureDone ? '#3fb950' : '#8b949e', fontWeight: 600 }}>
                    {disclosureDone ? 'COMPLETED' : 'NO'}
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Stop Contact</div>
                  <div style={{ color: stopContact ? '#f85149' : '#3fb950', fontWeight: 600 }}>
                    {stopContact ? 'TRIGGERED' : 'CLEAR'}
                  </div>
                </div>
              </div>
            )}

            {activeDomain === 'screening' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Screening Stage</div>
                  <div style={{ color: '#f0f6fc', fontWeight: 600 }}>{screeningStage.toUpperCase()}</div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Qualification</div>
                  <div style={{ color: screeningQualified ? '#3fb950' : '#d29922', fontWeight: 600 }}>
                    {screeningQualified ? '✓ QUALIFIED' : 'EVALUATING'}
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Anti-Bias Guard</div>
                  <div style={{ color: '#3fb950', fontWeight: 600 }}>ACTIVE</div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Handoff Recruiter</div>
                  <div style={{ color: screeningQualified ? '#58a6ff' : '#8b949e', fontWeight: 600 }}>
                    {screeningQualified ? 'READY' : 'PENDING'}
                  </div>
                </div>
              </div>
            )}

            {activeDomain === 'kyc' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>KYC Authentication</div>
                  <div style={{ color: identityVerified ? '#3fb950' : '#d29922', fontWeight: 600 }}>
                    {identityVerified ? '✓ AUTHENTICATED' : 'IN PROGRESS'}
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Fraud Scan</div>
                  <div style={{ color: '#3fb950', fontWeight: 600 }}>CLEAR</div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px', gridColumn: 'span 2' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Inquiry Status</div>
                  <div style={{ color: kycResolved ? '#3fb950' : '#58a6ff', fontWeight: 600 }}>
                    {kycResolved ? 'RESOLVED' : 'ACTIVE INQUIRY'}
                  </div>
                </div>
              </div>
            )}

            {activeDomain === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Custom Agent</div>
                  <div style={{ color: '#58a6ff', fontWeight: 600 }}>ACTIVE</div>
                </div>
                <div style={{ padding: '8px', background: '#21262d', borderRadius: '4px' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>Guardrails</div>
                  <div style={{ color: '#3fb950', fontWeight: 600 }}>{activeGuardrails.length} ENFORCED</div>
                </div>
              </div>
            )}
          </div>

          {/* Streaming Compliance & Safety Ticker */}
          <div
            style={{
              padding: '16px',
              background: '#161b22',
              borderRadius: '8px',
              border: '1px solid #30363d',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f0f6fc' }}>
                Streaming Compliance & Events
              </span>
              <span style={{ fontSize: '0.7rem', color: '#8b949e' }}>Real-time</span>
            </div>

            {eventsFeed.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#8b949e', fontStyle: 'italic', padding: '12px 0' }}>
                No events recorded yet. Guards active.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {eventsFeed.map((ev, index) => {
                  let badgeBg = '#21262d';
                  let badgeColor = '#c9d1d9';

                  if (ev.type === 'compliance_block') {
                    badgeBg = 'rgba(248, 81, 73, 0.15)';
                    badgeColor = '#f85149';
                  } else if (ev.type === 'identity_verified' || ev.type === 'candidate_qualified' || ev.type === 'promise_to_pay') {
                    badgeBg = 'rgba(63, 185, 80, 0.15)';
                    badgeColor = '#3fb950';
                  } else if (ev.type === 'interrupt') {
                    badgeBg = 'rgba(210, 153, 34, 0.15)';
                    badgeColor = '#d29922';
                  } else if (ev.type === 'escalate' || ev.type === 'stop_contact') {
                    badgeBg = 'rgba(163, 113, 247, 0.15)';
                    badgeColor = '#a371f7';
                  }

                  return (
                    <div
                      key={index}
                      style={{
                        padding: '8px 10px',
                        background: badgeBg,
                        border: `1px solid ${badgeColor}33`,
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, color: badgeColor, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {ev.type}
                        </span>
                        <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>{ev.time}</span>
                      </div>
                      <div style={{ color: '#f0f6fc' }}>{ev.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
