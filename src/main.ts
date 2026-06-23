/**
 * NexBell Edge Service — Main entry point
 *
 * Wires the DDD layers together:
 *   Infrastructure → Application → Domain
 */
import 'dotenv/config';
import { MqttBrokerClient }         from './infrastructure/mqtt/MqttBrokerClient';
import { NexBellHttpClient }         from './infrastructure/http/NexBellHttpClient';
import { PresenceEventHandler }      from './application/handlers/PresenceEventHandler';
import { DoorAlarmEventHandler }     from './application/handlers/DoorAlarmEventHandler';
import { AudioOrchestrationService } from './application/services/AudioOrchestrationService';
import { CameraEvidenceService }     from './application/services/CameraEvidenceService';
import { VideoStreamService }        from './application/services/VideoStreamService';
import { EdgeCommandController }     from './application/controllers/EdgeCommandController';
import { LiveAudioGateway }          from './application/controllers/LiveAudioGateway';
import { BellEventHandler }          from './application/handlers/BellEventHandler';
import { VibrationAlarmEventHandler } from './application/handlers/VibrationAlarmEventHandler';
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
  const cameraService   = new CameraEvidenceService(httpClient, mqttClient);
  const videoStreamService = new VideoStreamService();
  const presenceHandler  = new PresenceEventHandler(httpClient, cameraService);
  const doorHandler      = new DoorAlarmEventHandler(httpClient);
  const audioService     = new AudioOrchestrationService(httpClient, mqttClient);
  const bellHandler      = new BellEventHandler(httpClient, cameraService);
  const vibrationHandler = new VibrationAlarmEventHandler(httpClient);

  // ── Connect MQTT and wire subscriptions ───────────────────────────
  await mqttClient.connect();

  // ── Command Controller HTTP Server ────────────────────────────────
  const commandController = new EdgeCommandController(mqttClient);
  const httpServer = commandController.startHttpServer();

  // ── Live Audio Gateway (WebSocket <-> MQTT bridge) ────────────────
  // Note: AudioOrchestrationService (above) is the older evidence-recording
  // pipeline (Base64/JSON, fixed 5s window). The firmware no longer speaks
  // that protocol — audio/chunk now carries raw PCM binary — so this
  // service is currently unwired. The live conversation path below is
  // intentionally separate and replaces it for real-time use.
  new LiveAudioGateway(mqttClient, httpServer);

  mqttClient.subscribe(MqttTopics.PRESENCE, (payload) => {
    presenceHandler.handle(payload);
  });

  mqttClient.subscribe(MqttTopics.DOOR_ALARM, (payload) => {
    doorHandler.handle(payload);
  });

  mqttClient.subscribeBinary(MqttTopics.VIDEO_STREAM, (frame) => {
    videoStreamService.onFrame(frame);
  });

  mqttClient.subscribe(MqttTopics.BELL_BUTTON, (payload) => {
    bellHandler.handle(payload);
  });

  mqttClient.subscribe(MqttTopics.VIBRATION_ALARM, (payload) => {
    vibrationHandler.handle(payload);
  });

  console.log('[EdgeService] Ready. Listening to MQTT topics.');
}

main().catch((err) => {
  console.error('[EdgeService] Fatal error:', err);
  process.exit(1);
});
