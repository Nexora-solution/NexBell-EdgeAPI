import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';
import type { CameraEvidenceService } from '../services/CameraEvidenceService';

/** Safety net: stop the camera stream if no presence update arrives within this window. */
const PRESENCE_TIMEOUT_MS = 20_000;

/** Grace period after a "clear" before actually stopping — absorbs brief presence flicker. */
const CLEAR_GRACE_MS = 2_000;

/**
 * Application Handler: Presence Event (HC-SR04)
 *
 * Receives MQTT payload from `nexbell/telemetry/presence`.
 *  - '1' (detected): reports presence to the backend and starts the camera stream.
 *  - '0' (cleared): stops the camera stream.
 *  - Safety timeout: if no message refreshes the state within PRESENCE_TIMEOUT_MS
 *    (e.g. a '0' message is lost over MQTT QoS 0), the stream is stopped anyway.
 */
export class PresenceEventHandler {
  private streaming = false;
  private clearTimeout: NodeJS.Timeout | null = null;
  private graceTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly http: NexBellHttpClient,
    private readonly camera: CameraEvidenceService,
  ) {}

  async handle(payload: string): Promise<void> {
    const detected = payload.trim() === '1';

    if (detected) {
      // A fresh "presence" cancels any pending grace stop and refreshes the
      // safety timeout — the visitor is (still) there.
      this._cancelGrace();
      this._refreshTimeout();

      if (!this.streaming) {
        this.streaming = true;
        this.camera.startStream();
        console.log('[PresenceHandler] Presence detected — camera stream started.');
      }

      try {
        await this.http.reportPresence();
      } catch (err) {
        console.error('[PresenceHandler] Failed to report presence to backend:', err);
      }
      return;
    }

    // '0' = clear — don't kill the stream instantly. Wait a short grace period;
    // if presence comes back within it (brief sensor flicker), we keep streaming
    // and the camera never blinks off. Only a sustained clear actually stops it.
    if (this.streaming && !this.graceTimeout) {
      this.graceTimeout = setTimeout(() => {
        this.graceTimeout = null;
        this._stopStream('presence cleared (after grace)');
      }, CLEAR_GRACE_MS);
    }
  }

  private _refreshTimeout(): void {
    if (this.clearTimeout) clearTimeout(this.clearTimeout);
    this.clearTimeout = setTimeout(() => {
      this._stopStream('safety timeout (no presence update received)');
    }, PRESENCE_TIMEOUT_MS);
  }

  private _cancelGrace(): void {
    if (this.graceTimeout) {
      clearTimeout(this.graceTimeout);
      this.graceTimeout = null;
    }
  }

  private _stopStream(reason: string): void {
    this._cancelGrace();
    if (this.clearTimeout) {
      clearTimeout(this.clearTimeout);
      this.clearTimeout = null;
    }
    if (this.streaming) {
      this.streaming = false;
      this.camera.stopStream();
      console.log(`[PresenceHandler] Camera stream stopped (${reason}).`);
    }
  }
}
