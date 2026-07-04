import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';
import type { CameraEvidenceService } from '../services/CameraEvidenceService';
import type { CloudSignalRClient } from '../../infrastructure/ws/CloudSignalRClient';
import type { CloudVideoRelay } from '../services/CloudVideoRelay';
import type { CloudAudioRelay } from '../services/CloudAudioRelay';
import type { MqttBrokerClient } from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics } from '../../domain/MqttTopics';

/**
 * Handles physical intercom button presses (GPIO 1 / 14).
 * Coordinates starting the video stream, enabling the audio relays,
 * and notifying the cloud hub. Enforces a 60-second maximum call duration.
 */
export class IntercomButtonHandler {
  private callTimeout: NodeJS.Timeout | null = null;
  private readonly CALL_MAX_DURATION_MS = 60_000; // 60 seconds

  constructor(
    private readonly http: NexBellHttpClient,
    private readonly mqtt: MqttBrokerClient,
    private readonly cameraService: CameraEvidenceService,
    private readonly cloud: CloudSignalRClient,
    private readonly videoRelay: CloudVideoRelay,
    private readonly audioRelay: CloudAudioRelay,
    private readonly deviceId: string,
  ) {}

  /**
   * Called when a button is pressed.
   * @param target 'resident' (mobile app) or 'doorman' (web app)
   */
  handle(target: 'resident' | 'doorman'): void {
    console.log(`[IntercomButton] Pressed for target: ${target}. Starting call session.`);

    // 1. Notify the cloud so it can send push notifications/SSE alerts
    this.cloud.notifyButton(target);

    // 2. Start video stream from ESP32
    this.cameraService.startStream();

    // 3. Start audio capture on ESP32 (tell it to send UDP packets)
    this.mqtt.publish(MqttTopics.AUDIO_START, 'START');

    // 4. Activate cloud relays
    this.videoRelay.start(target);
    this.audioRelay.start(target);

    // 5. Set timeout to end call after 60 seconds
    if (this.callTimeout) clearTimeout(this.callTimeout);
    this.callTimeout = setTimeout(() => {
      this.endCall();
    }, this.CALL_MAX_DURATION_MS);
  }

  endCall(): void {
    console.log('[IntercomButton] 60-second call timeout reached. Ending session.');
    this.videoRelay.stop();
    this.audioRelay.stop();
    this.cameraService.stopStream();
    this.mqtt.publish(MqttTopics.AUDIO_START, 'STOP');
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
  }
}
