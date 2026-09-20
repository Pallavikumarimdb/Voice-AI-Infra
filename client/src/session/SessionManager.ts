import { WORKLET_CODE } from '../audio/worklet';
import { packAudioFrame, GatewayMessage } from '@voice/protocol';

export type SessionState = 'idle' | 'connecting' | 'streaming' | 'reconnecting';

export interface SessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onMessage: (msg: GatewayMessage) => void;
  onError: (err: string) => void;
}

export class SessionManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private state: SessionState = 'idle';
  private seq = 0;
  private gatewayUrl: string;
  private callbacks: SessionCallbacks;

  constructor(gatewayUrl: string, callbacks: SessionCallbacks) {
    this.gatewayUrl = gatewayUrl;
    this.callbacks = callbacks;
  }

  private setState(state: SessionState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  async start(srcLang = 'ja', tgtLang = 'en'): Promise<void> {
    if (this.state !== 'idle') return;

    this.setState('connecting');
    this.seq = 0;

    try {
      this.ws = new WebSocket(this.gatewayUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = async () => {
        // Send start control message
        this.ws?.send(
          JSON.stringify({
            type: 'start',
            srcLang,
            tgtLang,
            sampleRate: 16000,
          })
        );
        await this.initAudioCapture();
        this.setState('streaming');
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data) as GatewayMessage;
            this.callbacks.onMessage(msg);
          }
        } catch (e) {
          console.error('[Client] Error parsing gateway message:', e);
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError('Gateway WebSocket connection error');
      };

      this.ws.onclose = () => {
        if (this.state === 'streaming') {
          console.warn('[Client] Connection lost unexpectedly.');
          this.stop();
        }
      };
    } catch (err: any) {
      this.callbacks.onError(err.message || 'Failed to connect');
      this.stop();
    }
  }

  private async initAudioCapture(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(workletUrl);

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');

    this.workletNode.port.onmessage = (e) => {
      if (this.state === 'streaming' && this.ws?.readyState === WebSocket.OPEN) {
        const { pcm16, tCapture } = e.data;
        const pcmArray = new Int16Array(pcm16);
        const frame = packAudioFrame(pcmArray, this.seq++, tCapture);
        this.ws.send(frame);
      }
    };

    source.connect(this.workletNode);
  }

  stop(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
        this.ws.close();
      }
      this.ws = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.setState('idle');
  }
}
