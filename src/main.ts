/**
 * NexBell Edge Service — Main entry point
 *
 * Wires the DDD layers together:
 *   Infrastructure → Application → Domain
 */
import { MqttBrokerClient }         from './infrastructure/mqtt/MqttBrokerClient';
import { NexBellHttpClient }         from './infrastructure/http/NexBellHttpClient';
import { PresenceEventHandler }      from './application/handlers/PresenceEventHandler';
import { DoorAlarmEventHandler }     from './application/handlers/DoorAlarmEventHandler';
import { AudioOrchestrationService } from './application/services/AudioOrchestrationService';
import { EdgeCommandController }     from './application/controllers/EdgeCommandController';
import { MqttTopics }                from './domain/MqttTopics';

const MQTT_BROKER_URL  = process.env.MQTT_BROKER_URL  ?? 'mqtt://localhost:1883';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? 'http://localhost:8080';

async function main() {
  console.log('[EdgeService] Starting NexBell Edge Service...');

  // ── Infrastructure ────────────────────────────────────────────────
  const httpClient  = new NexBellHttpClient(BACKEND_BASE_URL);
  const mqttClient  = new MqttBrokerClient(MQTT_BROKER_URL);

  // ── Application handlers ──────────────────────────────────────────
  const presenceHandler = new PresenceEventHandler(httpClient);
  const doorHandler     = new DoorAlarmEventHandler(httpClient);
  const audioService    = new AudioOrchestrationService(httpClient, mqttClient);

  // ── Connect MQTT and wire subscriptions ───────────────────────────
  await mqttClient.connect();

  // ── Command Controller HTTP Server ────────────────────────────────
  const commandController = new EdgeCommandController(mqttClient);
  commandController.startHttpServer();

  mqttClient.subscribe(MqttTopics.PRESENCE, (payload) => {
    presenceHandler.handle(payload);
  });

  mqttClient.subscribe(MqttTopics.DOOR_ALARM, (payload) => {
    doorHandler.handle(payload);
  });

  mqttClient.subscribe(MqttTopics.AUDIO_CHUNK, (payload) => {
    audioService.onChunk(payload);
  });

  mqttClient.subscribe(MqttTopics.AUDIO_DONE, (payload) => {
    audioService.onDone(payload);
  });

  console.log('[EdgeService] Ready. Listening to MQTT topics.');
}

main().catch((err) => {
  console.error('[EdgeService] Fatal error:', err);
  process.exit(1);
});
