import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';

/**
 * Application Handler: Presence Event (HC-SR04)
 *
 * Receives MQTT payload from `nexbell/telemetry/presence`.
 * When presence is detected (payload === '1'), notifies the backend.
 */
export class PresenceEventHandler {
  constructor(private readonly http: NexBellHttpClient) {}

  async handle(payload: string): Promise<void> {
    const detected = payload.trim() === '1';

    if (detected) {
      try {
        await this.http.reportPresence();
      } catch (err) {
        console.error('[PresenceHandler] Failed to report presence to backend:', err);
      }
    }
    // '0' = clear — no backend action required for cleared state
  }
}
