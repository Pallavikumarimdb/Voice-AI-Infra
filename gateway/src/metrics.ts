import client from 'prom-client';

// Collect default Node.js runtime metrics
client.collectDefaultMetrics({ prefix: 'voice_gateway_' });

export const metrics = {
  droppedFrames: new client.Counter({
    name: 'gateway_audio_dropped_frames_total',
    help: 'Total number of audio frames dropped due to backpressure',
    labelNames: ['session'],
  }),

  queueDepth: new client.Gauge({
    name: 'gateway_queue_depth',
    help: 'Queue depth by processing stage',
    labelNames: ['stage'], // 'stt', 'mt'
  }),

  e2eLatency: new client.Histogram({
    name: 'e2e_latency_seconds',
    help: 'End-to-end latency across stage boundaries',
    labelNames: ['boundary'], // 'capture_to_partial', 'capture_to_final', 'final_to_translated'
    buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.2, 1.8, 2.5, 4.0, 8.0],
  }),

  activeSessions: new client.Gauge({
    name: 'active_sessions',
    help: 'Total number of currently active client sessions',
  }),

  mtRequestDuration: new client.Histogram({
    name: 'mt_request_duration_seconds',
    help: 'Wall-clock time spent making MT translation HTTP requests',
    buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0, 5.0],
  }),

  agentTurnLatency: new client.Histogram({
    name: 'agent_turn_latency_seconds',
    help: 'Agent turn latency across processing stages',
    labelNames: ['stage'], // 'classify', 'llm_fast', 'llm_slow', 'guard'
    buckets: [0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 1.0, 1.5, 2.5],
  }),

  agentComplianceBlocks: new client.Counter({
    name: 'agent_compliance_blocks_total',
    help: 'Total compliance blocks triggered',
    labelNames: ['rule'],
  }),

  agentEscalations: new client.Counter({
    name: 'agent_escalations_total',
    help: 'Total escalations to human collector',
    labelNames: ['reason'],
  }),

  agentCalls: new client.Counter({
    name: 'agent_calls_total',
    help: 'Total agent calls by outcome',
    labelNames: ['outcome'],
  }),

  agentTokens: new client.Counter({
    name: 'agent_llm_tokens_total',
    help: 'Total agent LLM tokens',
    labelNames: ['type'], // 'prompt', 'completion'
  }),

  ttsFirstAudio: new client.Histogram({
    name: 'tts_first_audio_seconds',
    help: 'Time from text dispatch to first synthesized audio chunk',
    buckets: [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0],
  }),

  turnEndToAgentAudio: new client.Histogram({
    name: 'turn_end_to_agent_audio_seconds',
    help: 'Full latency from caller speech finalization to first agent audio byte',
    buckets: [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0],
  }),

  register: client.register,
};
