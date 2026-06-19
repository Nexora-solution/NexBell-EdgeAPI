"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
const CameraEvidenceService_1 = require("./application/services/CameraEvidenceService");
const EdgeCommandController_1 = require("./application/controllers/EdgeCommandController");
const MqttTopics_1 = require("./domain/MqttTopics");
const os_1 = __importDefault(require("os"));
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? 'http://localhost:8080';
async function main() {
    console.log('[EdgeService] Starting NexBell Edge Service...');
    // Extract MQTT broker host to print for firmware configuration
    let brokerHost = 'localhost';
    try {
        const url = new URL(MQTT_BROKER_URL);
        brokerHost = url.hostname;
    }
    catch (e) {
        const match = MQTT_BROKER_URL.match(/mqtt(?:s)?:\/\/([^:/]+)/);
        if (match) {
            brokerHost = match[1];
        }
    }
    if (brokerHost === 'localhost' || brokerHost === '127.0.0.1') {
        const interfaces = os_1.default.networkInterfaces();
        const localIps = [];
        for (const devName in interfaces) {
            const iface = interfaces[devName];
            if (iface) {
                for (const alias of iface) {
                    if (alias.family === 'IPv4' && !alias.internal) {
                        localIps.push(alias.address);
                    }
                }
            }
        }
        if (localIps.length > 0) {
            console.log('\n┌────────────────────────────────────────────────────────┐');
            console.log('│  Copy/paste the MQTT host into nexbell_firmware:       │');
            localIps.forEach(ip => {
                // Pad the IP string so it matches the box width
                const line = `  #define MQTT_BROKER_HOST   "${ip}"`;
                const paddedLine = line.padEnd(54, ' ');
                console.log(`│${paddedLine}│`);
            });
            console.log('└────────────────────────────────────────────────────────┘\n');
        }
    }
    else {
        console.log('\n┌────────────────────────────────────────────────────────┐');
        console.log('│  Copy/paste the MQTT host into nexbell_firmware:       │');
        const line = `  #define MQTT_BROKER_HOST   "${brokerHost}"`;
        const paddedLine = line.padEnd(54, ' ');
        console.log(`│${paddedLine}│`);
        console.log('└────────────────────────────────────────────────────────┘\n');
    }
    // ── Infrastructure ────────────────────────────────────────────────
    const httpClient = new NexBellHttpClient_1.NexBellHttpClient(BACKEND_BASE_URL);
    const mqttClient = new MqttBrokerClient_1.MqttBrokerClient(MQTT_BROKER_URL);
    // ── Application handlers ──────────────────────────────────────────
    const presenceHandler = new PresenceEventHandler_1.PresenceEventHandler(httpClient);
    const doorHandler = new DoorAlarmEventHandler_1.DoorAlarmEventHandler(httpClient);
    const audioService = new AudioOrchestrationService_1.AudioOrchestrationService(httpClient, mqttClient);
    const cameraService = new CameraEvidenceService_1.CameraEvidenceService(httpClient, mqttClient);
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
    mqttClient.subscribe(MqttTopics_1.MqttTopics.CAMERA_FRAME, (payload) => {
        cameraService.onFrame(payload);
    });
    console.log('[EdgeService] Ready. Listening to MQTT topics.');
}
main().catch((err) => {
    console.error('[EdgeService] Fatal error:', err);
    process.exit(1);
});
