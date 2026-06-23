import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { MqttBrokerClient } from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics } from '../../domain/MqttTopics';

/**
 * Application Controller: Live Audio Gateway
 *
 * Bridges a live, bidirectional audio conversation between the web
 * frontend (portero) and the ESP32S3 (visitor) over WebSocket <-> MQTT.
 * This is intentionally separate from the evidence-recording pipeline
 * (AudioOrchestrationService) — audio here flows as raw 16kHz/16-bit PCM
 * binary frames in both directions, with no Base64/JSON envelope and no
 * fixed duration, for as long as at least one web client stays connected.
 *
 * Visitor mic  → ESP32 (nexbell/audio/chunk)    → Edge → WebSocket → Web
 * Portero mic  → Web (WebSocket binary frame)   → Edge → nexbell/audio/playback → ESP32 speaker
 *
 * The ESP32's mic is only told to start/stop streaming based on whether
 * any web client is connected, so it isn't transmitting audio nobody is
 * listening to.
 */
export class LiveAudioGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private micActive = false;

  // Diagnostics: rate-limited counters so we can see in the logs whether
  // audio is actually flowing in each direction, without flooding the console.
  private visitorChunksInLastSecond = 0;
  private porteroChunksInLastSecond = 0;
  private lastDiagnosticLog = 0;

  constructor(private readonly mqtt: MqttBrokerClient, httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/audio' });
    this._wireWebSocketServer();
    this._wireMqttIncoming();
  }

  private _wireWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[LiveAudio] Web client connected.');
      this.clients.add(ws);
      this._ensureMicStarted();

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary) return; // ignore any stray text frames (e.g. control pings from the browser)
        this.mqtt.publishBytes(MqttTopics.AUDIO_PLAYBACK, data);
        this.porteroChunksInLastSecond++;
        this._logDiagnosticsIfDue();
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[LiveAudio] Web client disconnected.');
        this._stopMicIfNoClients();
      });

      ws.on('error', (err: Error) => {
        console.error('[LiveAudio] WebSocket client error:', err.message);
      });
    });
  }

  /** Relays each raw audio chunk arriving from the ESP32 mic to every connected web client. */
  private _wireMqttIncoming(): void {
    this.mqtt.subscribeBinary(MqttTopics.AUDIO_CHUNK, (frame: Buffer) => {
      this.visitorChunksInLastSecond++;
      this._logDiagnosticsIfDue();

      if (this.clients.size === 0) return; // nobody to send to — this alone isn't an error
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(frame);
        }
      }
    });
  }

  private _logDiagnosticsIfDue(): void {
    const now = Date.now();
    if (now - this.lastDiagnosticLog < 1000) return;
    console.log(
      `[LiveAudio] last 1s — from ESP32 mic: ${this.visitorChunksInLastSecond} chunk(s), ` +
      `from portero mic: ${this.porteroChunksInLastSecond} chunk(s), connected web clients: ${this.clients.size}`
    );
    this.visitorChunksInLastSecond = 0;
    this.porteroChunksInLastSecond = 0;
    this.lastDiagnosticLog = now;
  }

  private _ensureMicStarted(): void {
    if (this.micActive) return;
    this.micActive = true;
    this.mqtt.publish(MqttTopics.AUDIO_START, 'START');
    console.log('[LiveAudio] First client connected — starting ESP32 mic stream.');
  }

  private _stopMicIfNoClients(): void {
    if (!this.micActive || this.clients.size > 0) return;
    this.micActive = false;
    this.mqtt.publish(MqttTopics.AUDIO_START, 'STOP');
    console.log('[LiveAudio] No clients left — stopping ESP32 mic stream.');
  }
}
