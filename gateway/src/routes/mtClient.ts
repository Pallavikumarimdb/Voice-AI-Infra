import { metrics } from '../metrics';

export interface TranslateRequest {
  uttId: number;
  text: string;
  srcLang: string;
  tgtLang: string;
  context: string[];
}

export interface TranslateResponse {
  translation: string;
  ttft_ms?: number;
  decode_ms?: number;
  tokensOut?: number;
}

export class MTClient {
  private serviceUrl: string;
  private timeoutMs: number;

  constructor(serviceUrl: string = process.env.MT_SERVICE_URL || 'http://localhost:8002/translate', timeoutMs = 5000) {
    this.serviceUrl = serviceUrl;
    this.timeoutMs = timeoutMs;
  }

  async translate(req: TranslateRequest): Promise<TranslateResponse | null> {
    const timer = metrics.mtRequestDuration.startTimer();
    metrics.queueDepth.inc({ stage: 'mt' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MT service returned status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as TranslateResponse;
      return data;
    } catch (err) {
      console.error(`[MTClient] Error translating utterance ${req.uttId}:`, err);
      return null;
    } finally {
      clearTimeout(timeoutId);
      timer();
      metrics.queueDepth.dec({ stage: 'mt' });
    }
  }
}
