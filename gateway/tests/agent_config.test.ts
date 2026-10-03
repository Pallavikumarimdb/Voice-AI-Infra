import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeAgentConfig } from '../src/agentConfig.ts';

describe('Agent config sanitizer (brain selection)', () => {
  it('defaults to the template brain', () => {
    const cfg = sanitizeAgentConfig({});
    assert.strictEqual(cfg.llm?.provider, 'template');
  });

  it('passes through allowlisted providers and safe model ids', () => {
    assert.strictEqual(
      sanitizeAgentConfig({ llm: { provider: 'local', model: 'qwen3:1.7b' } }).llm?.provider,
      'local'
    );
    assert.strictEqual(
      sanitizeAgentConfig({ llm: { provider: 'openai', model: 'gpt-4o-mini' } }).llm?.model,
      'gpt-4o-mini'
    );
  });

  it('rejects unknown providers and unsafe model ids', () => {
    const cfg = sanitizeAgentConfig({ llm: { provider: 'evil', model: 'x; rm -rf /' } });
    assert.strictEqual(cfg.llm?.provider, 'template');
    assert.strictEqual(cfg.llm?.model, '');
  });

  it('caps greeting and instruction lengths', () => {
    const cfg = sanitizeAgentConfig({ greeting: 'x'.repeat(600), instructions: 'y'.repeat(5000) });
    assert.ok((cfg.greeting || '').length <= 500);
    assert.ok((cfg.instructions || '').length <= 4000);
  });
});
