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
import { CameraEvidenceService }     from './application/services/CameraEvidenceService';
import { EdgeCommandController }     from './application/controllers/EdgeCommandController';
import { MqttTopics }                from './domain/MqttTopics';
import os                            from 'os';

const MQTT_BROKER_URL  = process.env.MQTT_BROKER_URL  ?? 'mqtt://localhost:1883';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? 'http://localhost:8080';

async function main() {
  console.log('[EdgeService] Starting NexBell Edge Service...');

  // Extract MQTT broker host to print for firmware configuration
  let brokerHost = 'localhost';
  try {
    const url = new URL(MQTT_BROKER_URL);
    brokerHost = url.hostname;
  } catch (e) {
    const match = MQTT_BROKER_URL.match(/mqtt(?:s)?:\/\/([^:/]+)/);
    if (match) {
      brokerHost = match[1];
    }
  }

  if (brokerHost === 'localhost' || brokerHost === '127.0.0.1') {
    const interfaces = os.networkInterfaces();
    const localIps: string[] = [];
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
  } else {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  Copy/paste the MQTT host into nexbell_firmware:       │');
    const line = `  #define MQTT_BROKER_HOST   "${brokerHost}"`;
    const paddedLine = line.padEnd(54, ' ');
    console.log(`│${paddedLine}│`);
    console.log('└────────────────────────────────────────────────────────┘\n');
  }

  // ── Infrastructure ────────────────────────────────────────────────
  const httpClient  = new NexBellHttpClient(BACKEND_BASE_URL);
  const mqttClient  = new MqttBrokerClient(MQTT_BROKER_URL);

  // ── Application handlers ──────────────────────────────────────────
  const presenceHandler = new PresenceEventHandler(httpClient);
  const doorHandler     = new DoorAlarmEventHandler(httpClient);
  const audioService    = new AudioOrchestrationService(httpClient, mqttClient);
  const cameraService   = new CameraEvidenceService(httpClient, mqttClient);

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

  mqttClient.subscribe(MqttTopics.CAMERA_FRAME, (payload) => {
    cameraService.onFrame(payload);
  });

  console.log('[EdgeService] Ready. Listening to MQTT topics.');
}

main().catch((err) => {
  console.error('[EdgeService] Fatal error:', err);
  process.exit(1);
});
