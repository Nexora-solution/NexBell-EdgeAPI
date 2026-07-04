import WebSocket from 'ws';

/**
 * Infrastructure: Cloud WebSocket Client
 *
 * Maintains a persistent outbound WebSocket connection to the Spring Boot
 * MediaHub (ws://localhost:8080/ws/media). This is the "reverse proxy" tunnel:
 * the Edge initiates the connection outward so NAT/firewall cannot block it.
 *
 * Protocol: JSON text messages over standard WebSocket.
 * Each message is a JSON object with a `type` field plus payload fields.
 *
 * No authentication — running on the local network for now.
 */
export class CloudSignalRClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private connected = false;
  private closing = false;

  // Listeners for messages coming FROM the cloud hub (e.g. portero audio).
  private readonly messageHandlers = new Map<string, (data: any) => void>();

  constructor(
    private readonly hubUrl: string,
    private readonly deviceId: string,
  ) {}

  /** Start the connection (returns once first connection succeeds or throws). */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._doConnect(resolve, reject);
    });
  }

  /** Graceful shutdown. */
  disconnect(): void {
    this.closing = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Outbound methods (Edge → Cloud) ────────────────────────────────

  /** Send a JPEG video frame (as base64) to a target group. */
  publishFrame(frameBase64: string, targetGroup: string): void {
    this._send({
      type: 'publishFrame',
      deviceId: this.deviceId,
      data: frameBase64,
      targetGroup,
    });
  }

  /** Send an audio chunk (as base64 PCM) to a target group. */
  publishAudio(audioBase64: string, targetGroup: string): void {
    this._send({
      type: 'publishAudio',
      deviceId: this.deviceId,
      data: audioBase64,
      targetGroup,
    });
  }

  /** Notify the cloud that a button was pressed (triggers push/SSE alerts). */
  notifyButton(buttonType: 'resident' | 'doorman'): void {
    this._send({
      type: 'notifyButton',
      deviceId: this.deviceId,
      buttonType,
    });
  }

  // ── Inbound events (Cloud → Edge) ──────────────────────────────────

  /** Register a handler for a specific message type from the hub. */
  on(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  // ── Internal ───────────────────────────────────────────────────────

  private _doConnect(
    onFirstConnect?: (value: void) => void,
    onFirstError?: (err: Error) => void,
  ): void {
    if (this.closing) return;

    console.log(`[CloudWS] Connecting to ${this.hubUrl} ...`);
    this.ws = new WebSocket(this.hubUrl);

    this.ws.on('open', () => {
      console.log('[CloudWS] Connected to cloud hub.');
      this.connected = true;
      this.reconnectDelay = 1000;

      // Register this Edge as the device provider for its deviceId.
      this._send({
        type: 'registerEdge',
        deviceId: this.deviceId,
      });

      if (onFirstConnect) {
        onFirstConnect();
        onFirstConnect = undefined;
        onFirstError = undefined;
      }
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const handler = this.messageHandlers.get(msg.type);
        if (handler) handler(msg);
      } catch {
        // ignore non-JSON or unknown messages
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (this.closing) return;
      console.log(`[CloudWS] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
      setTimeout(() => this._doConnect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    });

    this.ws.on('error', (err: Error) => {
      console.error('[CloudWS] WebSocket error:', err.message);
      if (onFirstError) {
        // Don't reject on first error — let the close handler reconnect.
        // Only reject if this is the very first attempt and it fails immediately.
        console.warn('[CloudWS] First connection attempt failed — will retry.');
        onFirstConnect = undefined;
        onFirstError = undefined;
        // Resolve anyway so the Edge service boots. The relay will buffer/skip
        // until the connection comes up.
      }
    });
  }

  private _send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
