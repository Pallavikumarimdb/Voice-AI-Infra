import React, { useState, useEffect } from 'react';
import { HumanLabel, CallDetail } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';

interface LabelingScreenProps {
  onInspectCall?: (id: string) => void;
}

const CRITERIA = [
  { key: 'human_listening_score', label: '1. 傾聴と受け止め (Listening & Acknowledgement)' },
  { key: 'human_pacing_score', label: '2. 威圧感のないペース・丁寧な口調 (Pacing & Tone)' },
  { key: 'human_recovery_score', label: '3. 雑談・脱線からの復帰 (Recovery Off-Script)' },
  { key: 'human_negotiation_score', label: '4. 承認条件内の現実的な提案 (Negotiation Quality)' },
  { key: 'human_confirmation_score', label: '5. 復唱による明確な確認 (Clarity of Confirmation)' },
  { key: 'human_escalation_score', label: '6. 適切な出口処理・エスカレーション (Appropriate Escalation)' },
] as const;

export const LabelingScreen: React.FC<LabelingScreenProps> = () => {
  const [labels, setLabels] = useState<HumanLabel[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCall, setActiveCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Form State
  const [scores, setScores] = useState<Record<string, number>>({
    human_listening_score: 5,
    human_pacing_score: 5,
    human_recovery_score: 4,
    human_negotiation_score: 5,
    human_confirmation_score: 5,
    human_escalation_score: 5,
  });
  const [outcome, setOutcome] = useState<'PASS' | 'FAIL'>('PASS');
  const [notes, setNotes] = useState('');

  // Load labels template and initial call
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await apiClient.getLabels();
      setLabels(res.data);

      if (res.data.length > 0) {
        // Load the first transcript details
        loadTranscript(res.data[0]);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  async function loadTranscript(label: HumanLabel) {
    // Determine sample call ID corresponding to persona
    const callRes = await apiClient.getCalls();
    const matchingCall = callRes.data.find(
      (c) => c.persona === label.persona_id || c.id.includes(label.persona_id)
    ) || callRes.data[0];

    if (matchingCall) {
      const detailRes = await apiClient.getCallDetail(matchingCall.id);
      setActiveCall(detailRes.data);
    }

    // Populate existing scores if labeled
    if (label.human_listening_score) {
      setScores({
        human_listening_score: label.human_listening_score,
        human_pacing_score: label.human_pacing_score,
        human_recovery_score: label.human_recovery_score,
        human_negotiation_score: label.human_negotiation_score,
        human_confirmation_score: label.human_confirmation_score,
        human_escalation_score: label.human_escalation_score,
      });
      setOutcome(label.human_outcome_pass_fail);
      setNotes(label.notes);
    } else {
      setScores({
        human_listening_score: 5,
        human_pacing_score: 5,
        human_recovery_score: 4,
        human_negotiation_score: 5,
        human_confirmation_score: 5,
        human_escalation_score: 5,
      });
      setOutcome('PASS');
      setNotes('');
    }
  }

  const handleSelectTranscript = (idx: number) => {
    setSelectedIndex(idx);
    setSaveStatus(null);
    loadTranscript(labels[idx]);
  };

  const handleSave = async () => {
    const current = labels[selectedIndex];
    if (!current) return;

    const updated: HumanLabel = {
      transcript_id: current.transcript_id,
      persona_id: current.persona_id,
      human_listening_score: scores.human_listening_score,
      human_pacing_score: scores.human_pacing_score,
      human_recovery_score: scores.human_recovery_score,
      human_negotiation_score: scores.human_negotiation_score,
      human_confirmation_score: scores.human_confirmation_score,
      human_escalation_score: scores.human_escalation_score,
      human_outcome_pass_fail: outcome,
      notes,
    };

    const res = await apiClient.saveLabel(updated);
    if (res.success) {
      setSaveStatus('✓ Label recorded successfully to CSV');
      // Update local array
      const updatedLabels = [...labels];
      updatedLabels[selectedIndex] = updated;
      setLabels(updatedLabels);

      // Auto advance to next unlabeled
      if (selectedIndex < labels.length - 1) {
        setTimeout(() => {
          handleSelectTranscript(selectedIndex + 1);
        }, 600);
      }
    }
  };

  const completedCount = labels.filter((l) => l.human_listening_score > 0).length;

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
            Human Collector Labeling & Rubric Scoring
          </h2>
          <p style={{ color: '#8b949e', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
            Rate agent transcripts against the 6 Japanese debt-collection criteria to validate LLM Judge agreement.
          </p>
        </div>

        {/* Progress Badge */}
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              padding: '6px 14px',
              borderRadius: '16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: completedCount > 0 ? 'rgba(63, 185, 80, 0.15)' : 'rgba(139, 148, 158, 0.15)',
              color: completedCount > 0 ? '#3fb950' : '#c9d1d9',
              border: '1px solid #30363d',
            }}
          >
            Labeled: {completedCount} / {labels.length} transcripts
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e' }}>Loading labeling set...</div>
      ) : labels.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e', background: '#161b22', borderRadius: '8px' }}>
          No transcripts found in labeling template.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1.4fr) minmax(360px, 1fr)', gap: '20px', alignItems: 'start' }}>
          {/* Column 1: Transcript Selector List */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px', maxHeight: '720px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>
              Select Transcript
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {labels.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isDone = item.human_listening_score > 0;
                return (
                  <button
                    key={item.transcript_id || idx}
                    onClick={() => handleSelectTranscript(idx)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? '#1f6feb' : 'transparent',
                      color: isSelected ? '#fff' : '#c9d1d9',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>{item.transcript_id}</span>
                    <span style={{ fontSize: '0.75rem', color: isSelected ? '#fff' : isDone ? '#3fb950' : '#8b949e' }}>
                      {isDone ? '✓ Labeled' : item.persona_id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 2: Unbiased Transcript Viewer (Scores & Variant Hidden!) */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '16px', maxHeight: '720px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #30363d', paddingBottom: '8px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f0f6fc' }}>
                Transcript: {labels[selectedIndex]?.transcript_id} (Target Persona: {labels[selectedIndex]?.persona_id})
              </div>
              <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                Model & Judge Hidden (Blind Review)
              </span>
            </div>

            {/* Conversation turns */}
            {activeCall?.auditLog && activeCall.auditLog.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeCall.auditLog
                  .filter((r) => r.stage === 'user_utterance' || r.stage === 'agent_utterance')
                  .map((record, rIdx) => {
                    const isCaller = record.stage === 'user_utterance';
                    return (
                      <div
                        key={rIdx}
                        style={{
                          padding: '10px 14px',
                          background: isCaller ? '#0d1117' : 'rgba(56, 139, 253, 0.08)',
                          border: `1px solid ${isCaller ? '#30363d' : 'rgba(56, 139, 253, 0.25)'}`,
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: isCaller ? '#8b949e' : '#58a6ff', fontWeight: 600, marginBottom: '2px' }}>
                          {isCaller ? '👤 Caller' : '🤖 Voice Agent'}
                        </div>
                        <div style={{ color: '#f0f6fc', fontSize: '0.9rem', lineHeight: '1.4' }}>
                          {isCaller ? record.payload?.text : record.payload?.final || record.payload?.attempted}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: '0.9rem', textAlign: 'center', padding: '24px' }}>
                Loading conversation turns...
              </div>
            )}
          </div>

          {/* Column 3: Rating Form */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '18px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f6fc', margin: '0 0 16px 0' }}>
              Collector Evaluation Rubric (1-5)
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {CRITERIA.map((criterion) => (
                <div key={criterion.key}>
                  <div style={{ fontSize: '0.8rem', color: '#c9d1d9', marginBottom: '6px', fontWeight: 500 }}>
                    {criterion.label}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        onClick={() => setScores({ ...scores, [criterion.key]: score })}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: '4px',
                          border: '1px solid #30363d',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          background: scores[criterion.key] === score ? '#1f6feb' : '#0d1117',
                          color: scores[criterion.key] === score ? '#fff' : '#8b949e',
                        }}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Overall Decision */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: '#c9d1d9', marginBottom: '6px', fontWeight: 600 }}>
                  Overall Call Quality Decision
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setOutcome('PASS')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #30363d',
                      cursor: 'pointer',
                      fontWeight: 600,
                      background: outcome === 'PASS' ? '#238636' : '#0d1117',
                      color: outcome === 'PASS' ? '#fff' : '#8b949e',
                    }}
                  >
                    ✓ PASS
                  </button>
                  <button
                    onClick={() => setOutcome('FAIL')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #30363d',
                      cursor: 'pointer',
                      fontWeight: 600,
                      background: outcome === 'FAIL' ? '#da3633' : '#0d1117',
                      color: outcome === 'FAIL' ? '#fff' : '#8b949e',
                    }}
                  >
                    ✗ FAIL
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#c9d1d9', marginBottom: '4px' }}>Auditor Notes</div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional commentary on negotiation or phrasing..."
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '8px',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1f6feb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginTop: '8px',
                }}
              >
                Save Rating & Advance →
              </button>

              {saveStatus && (
                <div style={{ fontSize: '0.8rem', color: '#3fb950', textAlign: 'center' }}>
                  {saveStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
