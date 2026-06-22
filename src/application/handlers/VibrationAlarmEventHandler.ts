import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';

/**
 * Application Handler: Vibration Alarm Event
 *
 * Receives MQTT payload from `nexbell/alarms/vibration`.
 * Triggers a tampering alarm on the backend when physical manipulation
 * or impacts are detected on the door.
 */
export class VibrationAlarmEventHandler {
  constructor(private readonly http: NexBellHttpClient) {}

  async handle(payload: string): Promise<void> {
    console.log(`[VibrationAlarmHandler] Vibration event received: ${payload}`);

    try {
      await this.http.reportTampering('SW420_VIBRATION');
    } catch (err) {
      console.error('[VibrationAlarmHandler] Failed to report tampering to backend:', err);
    }
  }
}
