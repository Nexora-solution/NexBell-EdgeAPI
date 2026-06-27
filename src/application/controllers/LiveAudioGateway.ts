import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import dgram from 'dgram';
import type { MqttBrokerClient } from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics } from '../../domain/MqttTopics';

// UDP ports for the live-voice media plane (must match the ESP32 firmware Config.h).
const EDGE_AUDIO_PORT  = Number(process.env.EDGE_AUDIO_PORT ?? 3101);  // here we receive the ESP32 mic
const ESP32_AUDIO_PORT = Number(process.env.ESP32_AUDIO_PORT ?? 3102); // there the ESP32 receives the portero

/**
 * Application Controller: Live Audio Gateway
 *
 * Bridges a live, bidirectional audio conversation between the web frontend
 * (portero) and the ESP32S3 (visitor).
 *
 *   Visitor mic → ESP32 ──UDP──► Edge ──WebSocket──► Web
 *   Portero mic → Web ──WebSocket──► Edge ──UDP──► ESP32 speaker
 *
 * The audio MEDIA travels over a direct UDP socket between the ESP32 and this
 * service — it no longer goes through the MQTT broker. That removes the broker
 * hop and PubSubClient overhead (much lower latency) and frees MQTT/WiFi for
 * the video stream. Only the CONTROL signal (start/stop the ESP32 mic) still
 * uses MQTT, since it's a rare, reliability-oriented message.
 *
 * Raw 16 kHz / 16-bit PCM frames flow in both directions, no Base64/JSON.
 */
export class LiveAudioGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private readonly udp = dgram.createSocket('udp4');
  private micActive = false;

  // Learned from the ESP32's incoming mic packets — where to send portero audio.
  private esp32Address: string | null = null;

  // Diagnostics: rate-limited counters so we can see audio flowing each way.
  private visitorChunksInLastSecond = 0;
  private porteroChunksInLastSecond = 0;
  private lastDiagnosticLog = 0;

  constructor(private readonly mqtt: MqttBrokerClient, httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/audio' });
    this._wireUdp();
    this._wireWebSocketServer();
  }

  /** UDP socket: receives the ESP32 mic and learns where to send portero audio. */
  private _wireUdp(): void {
    this.udp.on('message', (frame: Buffer, rinfo) => {
      // Remember the ESP32's address so we can send the portero's voice back.
      this.esp32Address = rinfo.address;

      this.visitorChunksInLastSecond++;
      this._logDiagnosticsIfDue();

      if (this.clients.size === 0) return; // nobody listening — not an error
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(frame);
      }
    });

    this.udp.on('error', (err: Error) => {
      console.error('[LiveAudio] UDP socket error:', err.message);
    });

    this.udp.bind(EDGE_AUDIO_PORT, () => {
      console.log(`[LiveAudio] UDP audio socket listening on ${EDGE_AUDIO_PORT} (ESP32 mic in).`);
    });
  }

  private _wireWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[LiveAudio] Web client connected.');
      this.clients.add(ws);
      this._ensureMicStarted();

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary) return; // ignore stray text frames (e.g. control pings)
        // Portero voice → ESP32 speaker over UDP (only once we know its address).
        if (this.esp32Address) {
          this.udp.send(data, ESP32_AUDIO_PORT, this.esp32Address);
        }
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

  private _logDiagnosticsIfDue(): void {
    const now = Date.now();
    if (now - this.lastDiagnosticLog < 1000) return;
    console.log(
      `[LiveAudio] last 1s — from ESP32 mic: ${this.visitorChunksInLastSecond} pkt(s), ` +
      `from portero mic: ${this.porteroChunksInLastSecond} pkt(s), web clients: ${this.clients.size}, ` +
      `esp32: ${this.esp32Address ?? 'unknown'}`
    );
    this.visitorChunksInLastSecond = 0;
    this.porteroChunksInLastSecond = 0;
    this.lastDiagnosticLog = now;
  }

  private _ensureMicStarted(): void {
    if (this.micActive) return;
    this.micActive = true;
    this.mqtt.publish(MqttTopics.AUDIO_START, 'START'); // control stays on MQTT
    console.log('[LiveAudio] First client connected — starting ESP32 mic stream.');
  }

  private _stopMicIfNoClients(): void {
    if (!this.micActive || this.clients.size > 0) return;
    this.micActive = false;
    this.mqtt.publish(MqttTopics.AUDIO_START, 'STOP');
    console.log('[LiveAudio] No clients left — stopping ESP32 mic stream.');
  }
}
