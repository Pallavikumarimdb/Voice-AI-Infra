import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAuditLogJsonl,
  parseRunsJson,
  parseSummaryCsv,
  parseLabelsCsv,
  serializeLabelRow,
  parsePersonaYaml,
} from '../src/data/loaders.ts';
import {
  verifyHashChain,
  computeRecordHash,
  canonicalJsonStringify,
} from '../src/data/hashChain.ts';
import type { AuditRecord, HumanLabel } from '../src/data/types.ts';

describe('Data Loaders & Hash Chain Tests', () => {
  it('canonicalJsonStringify sorts keys recursively', () => {
    const obj = { z: 1, a: { y: 2, b: 3 }, m: [3, 2, 1] };
    const str = canonicalJsonStringify(obj);
    assert.strictEqual(str, '{"a":{"b":3,"y":2},"m":[3,2,1],"z":1}');
  });

  it('verifies a valid hash-chained audit log', () => {
    // Generate valid 3-record chain
    const rec1: any = {
      seq: 1,
      session_id: 'test_session',
      ts: 1000,
      stage: 'user_utterance',
      payload: { text: 'もしもし' },
      prev_hash: 'GENESIS',
    };
    rec1.hash = computeRecordHash(rec1);

    const rec2: any = {
      seq: 2,
      session_id: 'test_session',
      ts: 1050,
      stage: 'agent_utterance',
      payload: { attempted: 'はい、みらい債権回収です', final: 'はい、みらい債権回収です' },
      prev_hash: rec1.hash,
    };
    rec2.hash = computeRecordHash(rec2);

    const rec3: any = {
      seq: 3,
      session_id: 'test_session',
      ts: 1100,
      stage: 'state_change',
      payload: { phase: 'verify' },
      prev_hash: rec2.hash,
    };
    rec3.hash = computeRecordHash(rec3);

    const result = verifyHashChain([rec1, rec2, rec3]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.verifiedCount, 3);
  });

  it('detects a tampered audit log record (modified payload)', () => {
    const rec1: any = {
      seq: 1,
      session_id: 'test_session',
      ts: 1000,
      stage: 'user_utterance',
      payload: { text: 'もしもし' },
      prev_hash: 'GENESIS',
    };
    rec1.hash = computeRecordHash(rec1);

    const rec2: any = {
      seq: 2,
      session_id: 'test_session',
      ts: 1050,
      stage: 'agent_utterance',
      payload: { attempted: 'はい、みらい債権回収です', final: 'はい、みらい債権回収です' },
      prev_hash: rec1.hash,
    };
    rec2.hash = computeRecordHash(rec2);

    // Tamper with record 2 payload without updating hash
    rec2.payload.attempted = '改ざんされたテキスト';

    const result = verifyHashChain([rec1, rec2]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Hash mismatch'));
    assert.strictEqual(result.brokenSeq, 2);
  });

  it('detects a broken hash chain link (tampered prev_hash)', () => {
    const rec1: any = {
      seq: 1,
      session_id: 'test_session',
      ts: 1000,
      stage: 'user_utterance',
      payload: { text: 'もしもし' },
      prev_hash: 'GENESIS',
    };
    rec1.hash = computeRecordHash(rec1);

    const rec2: any = {
      seq: 2,
      session_id: 'test_session',
      ts: 1050,
      stage: 'agent_utterance',
      payload: { attempted: 'はい', final: 'はい' },
      prev_hash: 'CORRUPTED_PREV_HASH',
      hash: 'somehash',
    };

    const result = verifyHashChain([rec1, rec2]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Broken chain at seq 2'));
    assert.strictEqual(result.brokenSeq, 2);
  });

  it('parses JSONL audit log content', () => {
    const jsonl = `
      {"seq": 1, "session_id": "s1", "ts": 100, "stage": "user_utterance", "payload": {"text": "hello"}, "prev_hash": "GENESIS", "hash": "h1"}
      {"seq": 2, "session_id": "s1", "ts": 200, "stage": "agent_utterance", "payload": {"attempted": "hi", "final": "hi"}, "prev_hash": "h1", "hash": "h2"}
    `;
    const records = parseAuditLogJsonl(jsonl);
    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0].seq, 1);
    assert.strictEqual(records[1].stage, 'agent_utterance');
  });

  it('parses runs JSON summary and details', () => {
    const jsonStr = JSON.stringify({
      summary: { variant: 'v2_graph', total_calls: 10, average_judge_score: 4.8 },
      runs: [
        {
          session_id: 'sim_1',
          variant: 'v2_graph',
          persona_id: 'cooperative',
          seed: 1000,
          hard_fail: { passed: true, attempted_violations: [], final_violations: [], num_attempted: 0, num_final: 0 },
          judge: { scores: { listening: 5 }, outcome: 'promise_secured', justification: 'good', mean_score: 5.0 },
          promise_to_pay: true,
          total_turns: 5,
          latencies_ms: [100, 150],
        },
      ],
    });

    const parsed = parseRunsJson(jsonStr);
    assert.strictEqual(parsed.summary.variant, 'v2_graph');
    assert.strictEqual(parsed.runs.length, 1);
    assert.strictEqual(parsed.runs[0].session_id, 'sim_1');
    assert.strictEqual(parsed.runs[0].promise_to_pay, true);
  });

  it('parses summary CSV lines (real quoted format, exact column mapping)', () => {
    const csv = `variant,sample_size,final_hard_fail_pct,attempted_violations,promise_rate_pct,judge_mean_score,latency_p50_ms,latency_p95_ms
v1_baseline,20,"20.0% [10.0%, 30.0%]",4,"20.0% [10.0%, 30.0%]","3.65 [3.4, 3.9]",392.4ms,561.2ms
v2_graph,20,"0.0% [0.0%, 5.0%]",0,"30.0% [20.0%, 40.0%]","4.70 [4.5, 4.9]",158.4ms,452.1ms`;

    const summary = parseSummaryCsv(csv);
    assert.strictEqual(summary.length, 2);
    assert.strictEqual(summary[0].variant, 'v1_baseline');
    assert.strictEqual(summary[1].hardFailFinalRate, 0.0);
    assert.strictEqual(summary[1].attemptedViolations, 0);
    assert.strictEqual(summary[1].promiseRate, 30.0);
    assert.strictEqual(summary[1].avgJudgeScore, 4.70);
    assert.strictEqual(summary[1].latencyP50, 158.4);
    assert.strictEqual(summary[1].latencyP95, 452.1);
    // Not present in the file: must stay null, never defaulted or guessed.
    assert.strictEqual(summary[1].finalViolations, null);
  });

  it('parses and serializes human labels CSV', () => {
    const csv = `transcript_id,persona_id,human_listening_score,human_pacing_score,human_recovery_score,human_negotiation_score,human_confirmation_score,human_escalation_score,human_outcome_pass_fail,notes
call_001,cooperative,5,4,5,5,4,5,PASS,Great negotiation flow`;

    const labels = parseLabelsCsv(csv);
    assert.strictEqual(labels.length, 1);
    assert.strictEqual(labels[0].transcript_id, 'call_001');
    assert.strictEqual(labels[0].human_listening_score, 5);
    assert.strictEqual(labels[0].human_outcome_pass_fail, 'PASS');

    const serialized = serializeLabelRow(labels[0]);
    assert.ok(serialized.startsWith('call_001,cooperative,5,4,5,5,4,5,PASS,'));
  });

  it('parses persona YAML', () => {
    const yaml = `id: cooperative
name: "協力的・分割希望"
debtor_id: deb_001
difficulty: easy
description: 滞納を認めている
debt_details:
  creditor: サクラ信託
  amount: 48000
  original_due_date: "2026-09-15"
  days_overdue: 17
debtor_profile:
  full_name: 田中 健一
  dob: "1985-04-12"
  phone: "090-1234-5678"
  address: 東京都
hidden_situation:
  reason: 資金ショート
  financial_state: 回復見込み
  temperament: 丁寧
scripted_turns:
  - "はい、田中です。"
  - "1985年4月12日です。"
expected_good_outcomes:
  - promise_secured`;

    const persona = parsePersonaYaml(yaml);
    assert.strictEqual(persona.id, 'cooperative');
    assert.strictEqual(persona.debt_details.amount, 48000);
    assert.strictEqual(persona.debtor_profile.full_name, '田中 健一');
    assert.strictEqual(persona.scripted_turns.length, 2);
  });

  it('parses the real eval summary CSV with exact values (no fabrication)', () => {
    const candidates = [
      path.resolve(process.cwd(), 'eval/agent/results/summary.csv'),
      path.resolve(process.cwd(), '..', 'eval/agent/results/summary.csv'),
    ];
    const sourceCsvPath = candidates.find((p) => fs.existsSync(p));

    if (!sourceCsvPath) {
      throw new Error('Real eval summary.csv missing — refusing to test against fixtures.');
    }
    const sourceCsv = fs.readFileSync(sourceCsvPath, 'utf-8');
    const parsed = parseSummaryCsv(sourceCsv);

    assert.ok(parsed.length >= 4, 'expected at least 4 variants');
    const byVariant = new Map(parsed.map((v) => [v.variant, v]));
    for (const name of ['v1_baseline', 'v2_graph', 'v1_no_guard', 'v2_graph_no_slow_path']) {
      assert.ok(byVariant.has(name), `missing variant ${name}`);
    }
    const v2 = byVariant.get('v2_graph')!;
    assert.strictEqual(v2.totalCalls, 50);
    assert.strictEqual(v2.hardFailFinalRate, 50.0);
    assert.strictEqual(v2.attemptedViolations, 35);
    assert.strictEqual(v2.promiseRate, 30.0);
    assert.strictEqual(v2.avgJudgeScore, 4.18);
    assert.strictEqual(v2.latencyP50, 0.4);
    assert.strictEqual(v2.latencyP95, 2.1);
    assert.strictEqual(v2.finalViolations, null);
  });
});
