import type { AgentConfig } from '@voice/protocol';

const ALLOWED_DOMAINS = ['collections', 'screening', 'kyc', 'custom'];
const ALLOWED_LANGUAGES = ['ja', 'en'];
const ALLOWED_LLM_PROVIDERS = ['template', 'local', 'openai'];
const MAX_STR_LEN = 4000;

/**
 * Validate and sanitize agent config before storing — prevents prompt
 * injection via the config channel. Unknown providers fall back to
 * 'template'; model ids are tightly capped to a safe charset.
 */
export function sanitizeAgentConfig(raw: unknown): AgentConfig {
  const rawCfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawLlm = (rawCfg.llm && typeof rawCfg.llm === 'object' ? rawCfg.llm : {}) as Record<string, unknown>;
  const llmProvider = String(rawLlm.provider || 'template');
  const llmModel = String(rawLlm.model || '').slice(0, 80);
  return {
    domain: ALLOWED_DOMAINS.includes(String(rawCfg.domain || '')) ? String(rawCfg.domain) : 'collections',
    language: ALLOWED_LANGUAGES.includes(String(rawCfg.language || '')) ? String(rawCfg.language) : 'ja',
    instructions: typeof rawCfg.instructions === 'string' ? rawCfg.instructions.slice(0, MAX_STR_LEN) : '',
    greeting: typeof rawCfg.greeting === 'string' ? rawCfg.greeting.slice(0, 500) : '',
    context: rawCfg.context && typeof rawCfg.context === 'object' ? (rawCfg.context as Record<string, unknown>) : {},
    llm: {
      provider: (ALLOWED_LLM_PROVIDERS.includes(llmProvider) ? llmProvider : 'template') as
        | 'template'
        | 'local'
        | 'openai',
      model: /^[a-zA-Z0-9._\-:]+$/.test(llmModel) ? llmModel : '',
    },
  };
}
