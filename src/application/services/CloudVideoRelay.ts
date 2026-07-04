import type { VideoStreamService } from './VideoStreamService';
import type { CloudSignalRClient } from '../../infrastructure/ws/CloudSignalRClient';

/**
 * Application Service: Cloud Video Relay
 *
 * Listens for new JPEG frames from the VideoStreamService and relays them
 * to the cloud hub via the CloudSignalRClient. Implements rate limiting
 * to send only 8–10 FPS (one frame every ~100–125ms) regardless of how
 * fast the ESP32 is pushing.
 *
 * The relay is IDLE by default and must be activated/deactivated by the
 * IntercomButtonHandler when a call session starts/ends.
 */
export class CloudVideoRelay {
  private active = false;
  private targetGroup: string = 'doorman';
  private lastSentAt = 0;
  private readonly minIntervalMs = 110; // ~9 FPS
  private framesSent = 0;
  private lastLogAt = 0;

  constructor(
    videoStream: VideoStreamService,
    private readonly cloud: CloudSignalRClient,
    private readonly deviceId: string,
  ) {
    // Hook into every frame arriving from the ESP32 (via TCP).
    videoStream.addFrameListener((frame) => this._onFrame(frame));
  }

  /** Start relaying video to the given group ('resident' or 'doorman'). */
  start(targetGroup: string): void {
    this.active = true;
    this.targetGroup = targetGroup;
    this.framesSent = 0;
    console.log(`[CloudVideoRelay] Relaying video to group "${targetGroup}" (${this.deviceId}).`);
  }

  /** Stop relaying video. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    console.log(`[CloudVideoRelay] Stopped. Sent ${this.framesSent} frames total.`);
  }

  isActive(): boolean {
    return this.active;
  }

  private _onFrame(frame: Buffer): void {
    if (!this.active || !this.cloud.isConnected()) return;

    // Rate limit: skip this frame if too soon after the last one.
    const now = Date.now();
    if (now - this.lastSentAt < this.minIntervalMs) return;
    this.lastSentAt = now;

    // Convert to base64 and send.
    const base64 = frame.toString('base64');
    this.cloud.publishFrame(base64, this.targetGroup);
    this.framesSent++;

    // Diagnostic log every 5 seconds.
    if (now - this.lastLogAt >= 5000) {
      console.log(`[CloudVideoRelay] Sent ${this.framesSent} frames (latest: ${frame.length} bytes, target: ${this.targetGroup}).`);
      this.lastLogAt = now;
    }
  }
}
