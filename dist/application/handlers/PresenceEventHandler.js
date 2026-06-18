"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceEventHandler = void 0;
/**
 * Application Handler: Presence Event (HC-SR04)
 *
 * Receives MQTT payload from `nexbell/telemetry/presence`.
 * When presence is detected (payload === '1'), notifies the backend.
 */
class PresenceEventHandler {
    constructor(http) {
        this.http = http;
    }
    async handle(payload) {
        const detected = payload.trim() === '1';
        if (detected) {
            try {
                await this.http.reportPresence();
            }
            catch (err) {
                console.error('[PresenceHandler] Failed to report presence to backend:', err);
            }
        }
        // '0' = clear — no backend action required for cleared state
    }
}
exports.PresenceEventHandler = PresenceEventHandler;
