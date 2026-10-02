/**
 * Typed Data Loaders for Reviewer UI.
 * Parses JSONL audit logs, simulation runs JSON, summary CSV, and labeling CSV.
 */

import type {
  AuditRecord,
  CallRun,
  EvalVariantSummary,
  HumanLabel,
  PersonaDefinition,
  CallSummaryItem,
} from './types.ts';

/**
 * Parses raw JSONL string into AuditRecord array.
 */
export function parseAuditLogJsonl(content: string): AuditRecord[] {
  if (!content) return [];
  const lines = content.split('\n');
  const records: AuditRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      records.push(parsed as AuditRecord);
    } catch (err: any) {
      console.warn(`[Loader] Invalid JSONL line ${i + 1}: ${err.message}`);
    }
  }

  return records;
}

/**
 * Parses simulation runs JSON into typed summaries and individual call runs.
 */
export function parseRunsJson(data: string | { summary?: any; runs?: any[] }): {
  summary: any;
  runs: CallRun[];
} {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const summary = parsed.summary || {};
  const rawRuns = Array.isArray(parsed.runs) ? parsed.runs : [];

  const runs: CallRun[] = rawRuns.map((r: any) => ({
    session_id: r.session_id,
    variant: r.variant || summary.variant || 'unknown',
    persona_id: r.persona_id || 'unknown',
    seed: r.seed ?? 1000,
    hard_fail: {
      passed: Boolean(r.hard_fail?.passed),
      attempted_violations: Array.isArray(r.hard_fail?.attempted_violations) ? r.hard_fail.attempted_violations : [],
      final_violations: Array.isArray(r.hard_fail?.final_violations) ? r.hard_fail.final_violations : [],
      num_attempted: r.hard_fail?.num_attempted ?? (r.hard_fail?.attempted_violations?.length || 0),
      num_final: r.hard_fail?.num_final ?? (r.hard_fail?.final_violations?.length || 0),
    },
    judge: {
      scores: r.judge?.scores || {},
      outcome: r.judge?.outcome || 'unknown',
      justification: r.judge?.justification || '',
      mean_score: r.judge?.mean_score ?? 0,
    },
    promise_to_pay: Boolean(r.promise_to_pay),
    total_turns: r.total_turns ?? (r.latencies_ms?.length || 0),
    latencies_ms: Array.isArray(r.latencies_ms) ? r.latencies_ms : [],
  }));

  return { summary, runs };
}

/**
 * Parses eval summary CSV into typed array of variant summary metrics.
 */
export function parseSummaryCsv(csvContent: string): EvalVariantSummary[] {
  if (!csvContent) return [];
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const results: EvalVariantSummary[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());

    results.push({
      variant: cols[0] || '',
      totalCalls: parseInt(cols[1] || '0', 10),
      hardFailFinalRate: parseFloat(cols[2] || '0'),
      attemptedViolations: parseInt(cols[3] || '0', 10),
      finalViolations: parseInt(cols[4] || '0', 10),
      promiseRate: parseFloat(cols[5] || '0'),
      avgJudgeScore: parseFloat(cols[6] || '0'),
      latencyP50: parseFloat(cols[7] || '0'),
      latencyP95: parseFloat(cols[8] || '0'),
      costPer1k: parseFloat(cols[9] || '0'),
    });
  }

  return results;
}

/**
 * Parses labeling CSV into typed HumanLabel records.
 */
export function parseLabelsCsv(csvContent: string): HumanLabel[] {
  if (!csvContent) return [];
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const labels: HumanLabel[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    labels.push({
      transcript_id: cols[0] || '',
      persona_id: cols[1] || '',
      human_listening_score: parseInt(cols[2] || '0', 10),
      human_pacing_score: parseInt(cols[3] || '0', 10),
      human_recovery_score: parseInt(cols[4] || '0', 10),
      human_negotiation_score: parseInt(cols[5] || '0', 10),
      human_confirmation_score: parseInt(cols[6] || '0', 10),
      human_escalation_score: parseInt(cols[7] || '0', 10),
      human_outcome_pass_fail: (cols[8]?.toUpperCase() === 'FAIL' ? 'FAIL' : 'PASS') as 'PASS' | 'FAIL',
      notes: cols[9] || '',
    });
  }

  return labels;
}

/**
 * Serializes a HumanLabel object into a CSV row.
 */
export function serializeLabelRow(label: HumanLabel): string {
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    label.transcript_id,
    label.persona_id,
    label.human_listening_score || '',
    label.human_pacing_score || '',
    label.human_recovery_score || '',
    label.human_negotiation_score || '',
    label.human_confirmation_score || '',
    label.human_escalation_score || '',
    label.human_outcome_pass_fail || '',
    escapeCsv(label.notes || ''),
  ].join(',');
}

/**
 * Lightweight parser for persona YAML text.
 */
export function parsePersonaYaml(yamlText: string): PersonaDefinition {
  const getField = (field: string): string => {
    const match = yamlText.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
  };

  const getSubField = (parent: string, sub: string): string => {
    const blockMatch = yamlText.match(new RegExp(`^${parent}:\\s*\\n((?:[ \\t]+.+\\n?)+)`, 'm'));
    if (!blockMatch) return '';
    const subMatch = blockMatch[1].match(new RegExp(`^[ \\t]+${sub}:\\s*(.+)$`, 'm'));
    return subMatch ? subMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  };

  const getListField = (field: string): string[] => {
    const blockMatch = yamlText.match(new RegExp(`^${field}:\\s*\\n((?:[ \\t]*-[ \\t].+\\n?)+)`, 'm'));
    if (!blockMatch) return [];
    const lines = blockMatch[1].trim().split('\n');
    return lines.map((l) => l.replace(/^[ \t]*-[ \t]*/, '').replace(/^["']|["']$/g, '').trim()).filter(Boolean);
  };

  return {
    id: getField('id'),
    name: getField('name'),
    debtor_id: getField('debtor_id'),
    difficulty: getField('difficulty'),
    description: getField('description'),
    debt_details: {
      creditor: getSubField('debt_details', 'creditor'),
      amount: parseInt(getSubField('debt_details', 'amount') || '0', 10),
      original_due_date: getSubField('debt_details', 'original_due_date'),
      days_overdue: parseInt(getSubField('debt_details', 'days_overdue') || '0', 10),
    },
    debtor_profile: {
      full_name: getSubField('debtor_profile', 'full_name'),
      dob: getSubField('debtor_profile', 'dob'),
      phone: getSubField('debtor_profile', 'phone'),
      address: getSubField('debtor_profile', 'address'),
    },
    hidden_situation: {
      reason: getSubField('hidden_situation', 'reason'),
      financial_state: getSubField('hidden_situation', 'financial_state'),
      temperament: getSubField('hidden_situation', 'temperament'),
    },
    scripted_turns: getListField('scripted_turns'),
    expected_good_outcomes: getListField('expected_good_outcomes'),
  };
}

/**
 * Transforms simulation runs and audit logs into a unified call list.
 */
export function buildCallSummaryItem(run: CallRun, source: 'live' | 'sim' = 'sim'): CallSummaryItem {
  return {
    id: run.session_id,
    source,
    variant: run.variant,
    persona: run.persona_id,
    outcome: run.judge?.outcome || (run.promise_to_pay ? 'promise_secured' : 'unresolved'),
    hardFailPassed: run.hard_fail.passed,
    hasComplianceBlock: run.hard_fail.num_attempted > 0,
    hasEscalation: run.judge?.outcome?.includes('escalat') || false,
    totalTurns: run.total_turns,
    timestamp: Date.now(),
    promiseSecured: run.promise_to_pay,
  };
}
