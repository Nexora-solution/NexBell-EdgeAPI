import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';
import type { MqttBrokerClient }  from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics }              from '../../domain/MqttTopics';

/**
 * Application Service: Camera Video Trigger Service
 *
 * Flow:
 *  1. When a visit is created (e.g. Bell pressed), we trigger the ESP32 to start streaming.
 *  2. ESP32 publishes raw MJPEG binary bytes to MQTT directly.
 *  3. Cloud Backend receives bytes from MQTT and streams them to the frontend.
 */
export class CameraEvidenceService {
  constructor(
    private readonly http: NexBellHttpClient,
    private readonly mqtt: MqttBrokerClient,
  ) {}

  /**
   * Triggers the ESP32S3 to start the binary video stream.
   */
  startStream(): void {
    this.mqtt.publish(MqttTopics.CAMERA_TRIGGER, "START_VIDEO");
    console.log(`[CameraEvidence] Video stream START triggered.`);
  }

  /**
   * Triggers the ESP32S3 to stop the binary video stream.
   */
  stopStream(): void {
    this.mqtt.publish(MqttTopics.CAMERA_TRIGGER, "STOP_VIDEO");
    console.log(`[CameraEvidence] Video stream STOP triggered.`);
  }
}
