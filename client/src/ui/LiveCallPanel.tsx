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
  const [configTab, setConfigTab] = useState<'prompt' | 'context' | 'guardrails'>('prompt');
  const [callSeconds, setCallSeconds] = useState(0);

  // Auto-scroll ref for captions container
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

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

  // Call duration timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (state === 'streaming') {
      setCallSeconds(0);
      interval = setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state]);

  // Auto-scroll chat on new captions
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [entries]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
        if (msg.type === 'error') {
          console.error('[LiveCallPanel] Gateway error:', msg);
          setError(msg.message || msg.code || 'Voice pipeline service error');
          sessionManagerRef.current?.stop();
          setIsAgentSpeaking(false);
          return;
        }
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
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Bar: Domain Persona Pills + Language Switcher + Studio Drawer Toggle */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          gap: '12px',
        }}
      >
        {/* Left: Domain Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginRight: '4px' }}>
            Domain
          </span>
          {(Object.keys(DOMAIN_PRESETS[agentLanguage]) as DomainType[]).map((dKey) => {
            const preset = DOMAIN_PRESETS[agentLanguage][dKey];
            const isSelected = activeDomain === dKey;
            return (
              <button
                key={dKey}
                onClick={() => handleSelectDomain(dKey)}
                disabled={state !== 'idle'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                  fontSize: '0.82rem',
                  fontWeight: isSelected ? 600 : 500,
                  boxShadow: isSelected ? '0 2px 10px rgba(99, 102, 241, 0.2)' : 'none',
                }}
              >
                <span>{preset.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Language switch & Persona Studio drawer button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Language Switch */}
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectLanguage('ja')}
              disabled={state !== 'idle'}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: agentLanguage === 'ja' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                color: agentLanguage === 'ja' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: agentLanguage === 'ja' ? 600 : 500,
                cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>🇯🇵</span>
              <span>JA</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectLanguage('en')}
              disabled={state !== 'idle'}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: agentLanguage === 'en' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                color: agentLanguage === 'en' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: agentLanguage === 'en' ? 600 : 500,
                cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>🇺🇸</span>
              <span>EN</span>
            </button>
          </div>

          {/* Drawer Trigger */}
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isConfigOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              border: isConfigOpen ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-subtle)',
              color: isConfigOpen ? '#ffffff' : 'var(--text-secondary)',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            <span>⚙️</span>
            <span>Agent Parameters</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{isConfigOpen ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Studio Drawer */}
      {isConfigOpen && (
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            animation: 'fadeIn 0.2s ease-in-out',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Drawer Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
            <button
              onClick={() => setConfigTab('prompt')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: configTab === 'prompt' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                color: configTab === 'prompt' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: configTab === 'prompt' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              Prompt & Initial Greeting
            </button>
            <button
              onClick={() => setConfigTab('context')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: configTab === 'context' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                color: configTab === 'context' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: configTab === 'context' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              Target Contact & Scenario
            </button>
            <button
              onClick={() => setConfigTab('guardrails')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: configTab === 'guardrails' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                color: configTab === 'guardrails' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: configTab === 'guardrails' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              Guardrails & Safety ({activeGuardrails.length})
            </button>
          </div>

          {/* Drawer Content */}
          {configTab === 'prompt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Opening Utterance / First Greeting:
                </label>
                <input
                  type="text"
                  value={customGreeting}
                  onChange={(e) => setCustomGreeting(e.target.value)}
                  disabled={state !== 'idle'}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 14px',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  System Instructions & Persona Guidance:
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  disabled={state !== 'idle'}
                  rows={4}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '10px 14px',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: '1.5',
                  }}
                />
              </div>
            </div>
          )}

          {configTab === 'context' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Target Contact Name:
                </label>
                <input
                  type="text"
                  value={targetSubject}
                  onChange={(e) => setTargetSubject(e.target.value)}
                  disabled={state !== 'idle'}
                  placeholder="e.g. Alex Johnson / 山田 太郎"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 14px',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Scenario Parameters / Details:
                </label>
                <input
                  type="text"
                  value={targetContext}
                  onChange={(e) => setTargetContext(e.target.value)}
                  disabled={state !== 'idle'}
                  placeholder="e.g. Balance: $350.00 • Creditor: Apex"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 14px',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>
          )}

          {configTab === 'guardrails' && (
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
                Regulated pipeline filters intercept unauthorized disclosures, PII leaks, and enforce civil communication.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {activeGuardrails.map((rule, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#a7f3d0',
                    }}
                  >
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hero Call Command Console */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left side: Call action button & Live Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <button
            onClick={handleToggle}
            style={{
              padding: '12px 28px',
              borderRadius: '12px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.95rem',
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#ffffff',
              background:
                state === 'streaming'
                  ? 'var(--danger-gradient)'
                  : state === 'connecting'
                  ? 'linear-gradient(135deg, #d97706, #b45309)'
                  : 'var(--primary-gradient)',
              boxShadow:
                state === 'streaming'
                  ? '0 6px 24px rgba(244, 63, 94, 0.4)'
                  : '0 6px 24px rgba(99, 102, 241, 0.35)',
            }}
          >
            {state === 'streaming' ? (
              <>
                <span style={{ fontSize: '1rem' }}>🛑</span>
                <span>End Call</span>
              </>
            ) : state === 'connecting' ? (
              <>
                <span style={{ fontSize: '1rem' }}>⏳</span>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '1rem' }}>📞</span>
                <span>{currentPreset.actionText}</span>
              </>
            )}
          </button>

          {/* Session Status Pill */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {state === 'streaming' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} className="pulse-active" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.02em' }}>
                    LIVE SESSION
                  </span>
                  <span className="mono-nums" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    ({formatDuration(callSeconds)})
                  </span>
                </div>
              ) : state === 'connecting' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fbbf24' }}>
                    CONNECTING PIPELINE...
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-dim)' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    STANDBY
                  </span>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              {isAgentSpeaking ? (
                <span style={{ color: '#818cf8', fontWeight: 500 }}>
                  Agent is speaking • Barge-in armed (&lt;25ms cutoff)
                </span>
              ) : state === 'streaming' ? (
                <span>Streaming mic audio at 16,000 Hz</span>
              ) : (
                <span>Click start to initiate real-time conversational agent</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Live Soundwave Equalizer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            height: '36px',
            padding: '0 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className={`wave-bar ${state === 'streaming' && (isAgentSpeaking || Math.random() > 0.3) ? 'speaking' : ''}`}
              style={{
                height: state === 'streaming' ? '14px' : '4px',
                opacity: state === 'streaming' ? 1 : 0.25,
              }}
            />
          ))}
        </div>

        {/* Right side: Contact Context & Inspect link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>
              {targetSubject}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              {targetContext}
            </div>
          </div>

          {lastCompletedSessionId && (
            <button
              onClick={() => onInspectCall(lastCompletedSessionId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <span>Inspect Call Telemetry</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {/* Latency & Telemetry Ribbon */}
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

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '12px 18px',
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '10px',
            color: '#fda4af',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Two Column Grid: Left Live Stream vs Right State Machine & Event Audit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(340px, 1fr)', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Column: Live Audio & Teleprompter Feed */}
        <div
          className="glass-panel"
          style={{
            minHeight: '480px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Teleprompter Header */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                Conversation Teleprompter
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {entries.length} {entries.length === 1 ? 'Turn' : 'Turns'}
              </span>
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Domain: {currentPreset.title}
            </span>
          </div>

          {/* Teleprompter Body */}
          <div
            ref={chatScrollRef}
            style={{
              padding: '16px 20px',
              flex: 1,
              maxHeight: '520px',
              overflowY: 'auto',
            }}
          >
            {entries.length === 0 ? (
              <div
                style={{
                  padding: '56px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '16px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.6rem',
                  }}
                >
                  🎙️
                </div>

                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                    Ready to Start Voice Conversation
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', maxWidth: '420px', lineHeight: '1.5' }}>
                    Press <strong>{currentPreset.actionText}</strong> and speak through your microphone in {agentLanguage === 'ja' ? 'Japanese' : 'English'}.
                  </div>
                </div>

                {/* Quick prompt hints */}
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '440px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
                    Sample Utterances to Test:
                  </span>
                  {activeDomain === 'collections' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        💬 {agentLanguage === 'ja' ? '「山田太郎です。生年月日は1988年4月15日です。」' : '"Yes, this is Alex. My date of birth is April 15, 1988."'}
                      </div>
                      <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        💬 {agentLanguage === 'ja' ? '「今月は厳しいので、来月15日に2万円支払います。」' : '"I can pay $200 on the 15th of next month."'}
                      </div>
                    </div>
                  )}
                  {activeDomain === 'screening' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        💬 {agentLanguage === 'ja' ? '「Reactと分散システムの開発経験が6年あります。」' : '"I have 6 years of experience building distributed systems in React and TypeScript."'}
                      </div>
                    </div>
                  )}
                  {activeDomain === 'kyc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        💬 {agentLanguage === 'ja' ? '「電話番号は090-1234-5678、暗証番号は4821です。」' : '"My registered phone is 555-0199 and security PIN is 4821."'}
                      </div>
                    </div>
                  )}
                  {activeDomain === 'custom' && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      💬 {agentLanguage === 'ja' ? '「サービスの詳細とお見積りについて教えてください。」' : '"Tell me about your enterprise voice AI services."'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Captions entries={entries} />
            )}
          </div>
        </div>

        {/* Right Column: Workflow State Machine & Compliance Audit Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 1: Workflow State Machine */}
          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                Workflow State Machine
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                }}
              >
                {currentPreset.title}
              </span>
            </div>

            {/* Collections Stepper */}
            {activeDomain === 'collections' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 4 Pipeline Stages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'greet', title: '1. Greeting & Disclose Identity', isDone: callPhase !== 'greet', isCurrent: callPhase === 'greet' },
                    { key: 'verify', title: '2. Debtor DOB Verification', isDone: identityVerified, isCurrent: callPhase === 'verify' },
                    { key: 'disclose', title: '3. Debt Disclosure & Hardship', isDone: disclosureDone || callPhase === 'close', isCurrent: callPhase === 'disclose' },
                    { key: 'close', title: '4. Promise to Pay / Escalation', isDone: Boolean(promiseCaptured), isCurrent: callPhase === 'close' },
                  ].map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        background: step.isDone
                          ? 'rgba(16, 185, 129, 0.08)'
                          : step.isCurrent
                          ? 'rgba(99, 102, 241, 0.12)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: step.isDone
                          ? '1px solid rgba(16, 185, 129, 0.25)'
                          : step.isCurrent
                          ? '1px solid rgba(99, 102, 241, 0.4)'
                          : '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: step.isCurrent ? 600 : 400, color: step.isDone ? '#a7f3d0' : step.isCurrent ? '#fff' : 'var(--text-secondary)' }}>
                        {step.title}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: step.isDone ? 'rgba(16, 185, 129, 0.2)' : step.isCurrent ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          color: step.isDone ? '#34d399' : step.isCurrent ? '#a5b4fc' : 'var(--text-tertiary)',
                        }}
                      >
                        {step.isDone ? '✓ DONE' : step.isCurrent ? 'ACTIVE' : 'PENDING'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Sub-metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '6px' }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Stop Contact</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: stopContact ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                      {stopContact ? 'TRIGGERED' : 'CLEAR'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>Promise Captured</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: promiseCaptured ? '#60a5fa' : 'var(--text-dim)' }}>
                      {promiseCaptured || 'None'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Screening Stepper */}
            {activeDomain === 'screening' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { title: '1. Candidate Greeting & Context', isDone: screeningStage !== 'intro', isCurrent: screeningStage === 'intro' },
                  { title: '2. Stack & Architecture Interview', isDone: screeningStage === 'expectations' || screeningStage === 'qualified', isCurrent: screeningStage === 'experience' },
                  { title: '3. Compensation & Mode Verification', isDone: screeningStage === 'qualified', isCurrent: screeningStage === 'expectations' },
                  { title: '4. First-Round Qualification Verdict', isDone: screeningQualified, isCurrent: screeningStage === 'qualified' },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: step.isDone
                        ? 'rgba(16, 185, 129, 0.08)'
                        : step.isCurrent
                        ? 'rgba(99, 102, 241, 0.12)'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: step.isDone
                        ? '1px solid rgba(16, 185, 129, 0.25)'
                        : step.isCurrent
                        ? '1px solid rgba(99, 102, 241, 0.4)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: step.isDone ? '#a7f3d0' : step.isCurrent ? '#fff' : 'var(--text-secondary)' }}>
                      {step.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: step.isDone ? 'rgba(16, 185, 129, 0.2)' : step.isCurrent ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        color: step.isDone ? '#34d399' : step.isCurrent ? '#a5b4fc' : 'var(--text-tertiary)',
                      }}
                    >
                      {step.isDone ? '✓ DONE' : step.isCurrent ? 'ACTIVE' : 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* KYC Stepper */}
            {activeDomain === 'kyc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { title: '1. Customer Inbound Greeting', isDone: true, isCurrent: !identityVerified },
                  { title: '2. 4-Digit Security PIN Verification', isDone: identityVerified, isCurrent: !identityVerified },
                  { title: '3. Authenticated Account Inquiry', isDone: kycResolved, isCurrent: identityVerified && !kycResolved },
                  { title: '4. Case Resolution & Wrap-up', isDone: kycResolved, isCurrent: kycResolved },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: step.isDone
                        ? 'rgba(16, 185, 129, 0.08)'
                        : step.isCurrent
                        ? 'rgba(99, 102, 241, 0.12)'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: step.isDone
                        ? '1px solid rgba(16, 185, 129, 0.25)'
                        : step.isCurrent
                        ? '1px solid rgba(99, 102, 241, 0.4)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: step.isDone ? '#a7f3d0' : step.isCurrent ? '#fff' : 'var(--text-secondary)' }}>
                      {step.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: step.isDone ? 'rgba(16, 185, 129, 0.2)' : step.isCurrent ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        color: step.isDone ? '#34d399' : step.isCurrent ? '#a5b4fc' : 'var(--text-tertiary)',
                      }}
                    >
                      {step.isDone ? '✓ AUTH' : step.isCurrent ? 'ACTIVE' : 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Stepper */}
            {activeDomain === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Mode</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a5b4fc' }}>Custom Enterprise Agent</div>
                </div>
                <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Active Rules</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>{activeGuardrails.length} Enforced</div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Streaming Compliance & Safety Audit Feed */}
          <div
            className="glass-panel"
            style={{
              padding: '18px 20px',
              maxHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                  Safety & Intercept Audit
                </span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Real-time</span>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {eventsFeed.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
                  No intercept events yet. Guardrails armed.
                </div>
              ) : (
                eventsFeed.map((ev, index) => {
                  let badgeBg = 'rgba(255, 255, 255, 0.04)';
                  let badgeColor = 'var(--text-secondary)';
                  let borderColor = 'var(--border-subtle)';

                  if (ev.type === 'compliance_block') {
                    badgeBg = 'rgba(244, 63, 94, 0.12)';
                    badgeColor = 'var(--accent-rose)';
                    borderColor = 'rgba(244, 63, 94, 0.3)';
                  } else if (ev.type === 'identity_verified' || ev.type === 'candidate_qualified' || ev.type === 'promise_to_pay') {
                    badgeBg = 'rgba(16, 185, 129, 0.12)';
                    badgeColor = 'var(--accent-emerald)';
                    borderColor = 'rgba(16, 185, 129, 0.3)';
                  } else if (ev.type === 'interrupt') {
                    badgeBg = 'rgba(245, 158, 11, 0.12)';
                    badgeColor = 'var(--accent-amber)';
                    borderColor = 'rgba(245, 158, 11, 0.3)';
                  } else if (ev.type === 'escalate' || ev.type === 'stop_contact') {
                    badgeBg = 'rgba(168, 85, 247, 0.12)';
                    badgeColor = 'var(--accent-purple)';
                    borderColor = 'rgba(168, 85, 247, 0.3)';
                  }

                  return (
                    <div
                      key={index}
                      style={{
                        padding: '8px 12px',
                        background: badgeBg,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 700, color: badgeColor, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                          {ev.type}
                        </span>
                        <span className="mono-nums" style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem' }}>{ev.time}</span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', lineHeight: '1.4' }}>{ev.text}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

