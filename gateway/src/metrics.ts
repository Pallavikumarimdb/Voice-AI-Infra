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

  register: client.register,
};
