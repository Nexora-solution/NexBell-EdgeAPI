import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';

/**
 * Application Handler: Door Alarm Event (MC38)
 *
 * Receives MQTT payload from `nexbell/alarms/door`.
 * Any OPEN state triggers a tampering alarm on the backend, as an unexpected
 * door open without a prior unlock command is treated as forced entry.
 */
export class DoorAlarmEventHandler {
  constructor(private readonly http: NexBellHttpClient) {}

  async handle(payload: string): Promise<void> {
    const state = payload.trim().toUpperCase(); // 'OPEN' or 'CLOSED'
    console.log(`[DoorAlarmHandler] Door state received: ${state}`);

    if (state === 'OPEN') {
      try {
        await this.http.reportTampering();
      } catch (err) {
        console.error('[DoorAlarmHandler] Failed to report tampering to backend:', err);
      }
    }
    // CLOSED state logged, no backend action required
  }
}
