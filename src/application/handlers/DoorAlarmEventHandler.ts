import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';

/**
 * Application Handler: Door State Event (MC38)
 *
 * Receives MQTT payload from `nexbell/alarms/door`.
 * The MC38 magnetic sensor is a read-only door-state sensor: it reports
 * whether the door is physically OPEN or CLOSED. Both states are forwarded
 * to the backend so the dashboard can display the live door status.
 * It does NOT actuate anything and is no longer treated as a tampering alarm.
 */
export class DoorAlarmEventHandler {
  constructor(private readonly http: NexBellHttpClient) {}

  async handle(payload: string): Promise<void> {
    const state = payload.trim().toUpperCase(); // 'OPEN' or 'CLOSED'
    console.log(`[DoorStateHandler] Door state received: ${state}`);

    if (state !== 'OPEN' && state !== 'CLOSED') {
      console.warn(`[DoorStateHandler] Ignoring unknown door state: ${state}`);
      return;
    }

    try {
      await this.http.reportDoorState(state);
    } catch (err) {
      console.error('[DoorStateHandler] Failed to report door state to backend:', err);
    }
  }
}
