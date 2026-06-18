"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * NexBell Edge Service — Main entry point
 *
 * Wires the DDD layers together:
 *   Infrastructure → Application → Domain
 */
const MqttBrokerClient_1 = require("./infrastructure/mqtt/MqttBrokerClient");
const NexBellHttpClient_1 = require("./infrastructure/http/NexBellHttpClient");
const PresenceEventHandler_1 = require("./application/handlers/PresenceEventHandler");
const DoorAlarmEventHandler_1 = require("./application/handlers/DoorAlarmEventHandler");
const AudioOrchestrationService_1 = require("./application/services/AudioOrchestrationService");
const EdgeCommandController_1 = require("./application/controllers/EdgeCommandController");
const MqttTopics_1 = require("./domain/MqttTopics");
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? 'http://localhost:8080';
async function main() {
    console.log('[EdgeService] Starting NexBell Edge Service...');
    // ── Infrastructure ────────────────────────────────────────────────
    const httpClient = new NexBellHttpClient_1.NexBellHttpClient(BACKEND_BASE_URL);
    const mqttClient = new MqttBrokerClient_1.MqttBrokerClient(MQTT_BROKER_URL);
    // ── Application handlers ──────────────────────────────────────────
    const presenceHandler = new PresenceEventHandler_1.PresenceEventHandler(httpClient);
    const doorHandler = new DoorAlarmEventHandler_1.DoorAlarmEventHandler(httpClient);
    const audioService = new AudioOrchestrationService_1.AudioOrchestrationService(httpClient, mqttClient);
    // ── Connect MQTT and wire subscriptions ───────────────────────────
    await mqttClient.connect();
    // ── Command Controller HTTP Server ────────────────────────────────
    const commandController = new EdgeCommandController_1.EdgeCommandController(mqttClient);
    commandController.startHttpServer();
    mqttClient.subscribe(MqttTopics_1.MqttTopics.PRESENCE, (payload) => {
        presenceHandler.handle(payload);
    });
    mqttClient.subscribe(MqttTopics_1.MqttTopics.DOOR_ALARM, (payload) => {
        doorHandler.handle(payload);
    });
    mqttClient.subscribe(MqttTopics_1.MqttTopics.AUDIO_CHUNK, (payload) => {
        audioService.onChunk(payload);
    });
    mqttClient.subscribe(MqttTopics_1.MqttTopics.AUDIO_DONE, (payload) => {
        audioService.onDone(payload);
    });
    console.log('[EdgeService] Ready. Listening to MQTT topics.');
}
main().catch((err) => {
    console.error('[EdgeService] Fatal error:', err);
    process.exit(1);
});
