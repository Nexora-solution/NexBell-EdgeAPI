import dgram from 'dgram';
import type { CloudSignalRClient } from '../../infrastructure/ws/CloudSignalRClient';

// Must match the firmware Config.h and the LiveAudioGateway ports.
const EDGE_AUDIO_PORT  = Number(process.env.EDGE_AUDIO_PORT ?? 3101);
const ESP32_AUDIO_PORT = Number(process.env.ESP32_AUDIO_PORT ?? 3102);

/**
 * Application Service: Cloud Audio Relay
 *
 * Bridges the bidirectional audio path between the ESP32 (via UDP) and the
 * cloud hub (via WebSocket).
 *
 *   UPLOAD (visitor voice):
 *     ESP32 mic → UDP :3101 → this service → CloudSignalRClient → Hub → Web/App
 *
 *   DOWNLOAD (resident/portero voice):
 *     Web/App → Hub → CloudSignalRClient → this service → UDP :3102 → ESP32 speaker
 *
 * This service shares the same UDP ports as the LiveAudioGateway (which
 * handles direct WebSocket clients on the LAN). Both can coexist: the
 * LiveAudioGateway sends to LAN WebSocket clients, this relay sends to
 * the cloud hub.
 */
export class CloudAudioRelay {
  private active = false;
  private targetGroup: string = 'doorman';
  private readonly udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private esp32Address: string | null = null;
  private chunksUp = 0;
  private chunksDown = 0;
  private lastLogAt = 0;

  constructor(
    private readonly cloud: CloudSignalRClient,
    private readonly deviceId: string,
  ) {
    // Listen for ESP32 mic audio arriving via UDP.
    this.udp.on('message', (frame: Buffer, rinfo) => {
      this.esp32Address = rinfo.address;
      if (!this.active || !this.cloud.isConnected()) return;

      // Relay to cloud hub as base64.
      const base64 = frame.toString('base64');
      this.cloud.publishAudio(base64, this.targetGroup);
      this.chunksUp++;
      this._logIfDue();
    });

    this.udp.on('error', (err) => {
      console.error('[CloudAudioRelay] UDP error:', err.message);
    });

    // Bind to a different port to not conflict with LiveAudioGateway (which
    // binds to EDGE_AUDIO_PORT). Instead, we share the ESP32's incoming
    // data by listening on the LiveAudioGateway's callback.
    // Actually, we'll hook into the existing LiveAudioGateway instead.
    // See the wiring in main.ts — we receive ESP32 mic data via a callback.

    // Listen for audio coming FROM the cloud hub (portero/resident voice).
    this.cloud.on('receiveAudioFromCloud', (msg: any) => {
      if (!this.active || !this.esp32Address) return;
      try {
        const pcmBytes = Buffer.from(msg.data, 'base64');
        this.udp.send(pcmBytes, ESP32_AUDIO_PORT, this.esp32Address);
        this.chunksDown++;
        this._logIfDue();
      } catch (err) {
        console.error('[CloudAudioRelay] Error forwarding audio to ESP32:', err);
      }
    });
  }

  /** Feed ESP32 mic audio into this relay (called by LiveAudioGateway hook). */
  feedMicAudio(frame: Buffer): void {
    if (!this.active || !this.cloud.isConnected()) return;
    const base64 = frame.toString('base64');
    this.cloud.publishAudio(base64, this.targetGroup);
    this.chunksUp++;
    this._logIfDue();
  }

  /** Remember the ESP32's IP (learned from its UDP packets). */
  setEsp32Address(address: string): void {
    this.esp32Address = address;
  }

  start(targetGroup: string): void {
    this.active = true;
    this.targetGroup = targetGroup;
    this.chunksUp = 0;
    this.chunksDown = 0;
    console.log(`[CloudAudioRelay] Active for group "${targetGroup}".`);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    console.log(`[CloudAudioRelay] Stopped (up: ${this.chunksUp}, down: ${this.chunksDown}).`);
  }

  isActive(): boolean {
    return this.active;
  }

  private _logIfDue(): void {
    const now = Date.now();
    if (now - this.lastLogAt < 5000) return;
    console.log(`[CloudAudioRelay] last 5s — up: ${this.chunksUp}, down: ${this.chunksDown}, esp32: ${this.esp32Address ?? 'unknown'}`);
    this.lastLogAt = now;
  }
}
