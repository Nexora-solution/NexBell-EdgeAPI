import { v4 as uuidv4 } from 'uuid';
import type { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';
import type { MqttBrokerClient }  from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics }              from '../../domain/MqttTopics';

interface CameraPayload {
  visitId: number;
  image: string;   // Base64-encoded JPEG
}

/**
 * Application Service: Camera Evidence Handler (OV2640)
 *
 * Flow:
 *  1. ESP32S3 fires nexbell/telemetry/camera with a JSON payload:
 *       { "visitId": 42, "image": "<base64 JPEG>" }
 *  2. This handler parses the JSON and decodes Base64 → Node.js Buffer.
 *  3. Calls _uploadToStorage() to simulate saving the binary file.
 *     (Replace with real MinIO / S3 / GCS SDK call for production.)
 *  4. POSTs the resulting photo URL to the Spring Boot backend:
 *       POST /api/intercom/visit-requests/{visitId}/evidence
 *       body: { photoUrl: "...", audioUrl: null }
 *  5. Optionally publishes a trigger back to the ESP32S3 for subsequent
 *     auto-captures via triggerCapture().
 */
export class CameraEvidenceService {
  constructor(
    private readonly http: NexBellHttpClient,
    private readonly mqtt: MqttBrokerClient,
  ) {}

  /**
   * Called when a message arrives on `nexbell/telemetry/camera`.
   * rawPayload must be a JSON string conforming to CameraPayload.
   */
  async onFrame(rawPayload: string): Promise<void> {
    let parsed: CameraPayload;

    try {
      parsed = JSON.parse(rawPayload) as CameraPayload;
    } catch {
      console.error('[CameraEvidence] Failed to parse camera payload JSON.');
      return;
    }

    const { visitId, image } = parsed;

    if (!visitId || !image) {
      console.warn('[CameraEvidence] Payload missing visitId or image field.');
      return;
    }

    console.log(`[CameraEvidence] Received frame for visitId=${visitId} (Base64 length=${image.length})`);

    // ── 1. Decode Base64 → binary Buffer ──────────────────────────────
    const jpegBuffer = Buffer.from(image, 'base64');
    console.log(`[CameraEvidence] Decoded to ${jpegBuffer.length} bytes JPEG.`);

    // ── 2. Upload to object storage ───────────────────────────────────
    const photoUrl = await this._uploadToStorage(visitId, jpegBuffer);

    // ── 3. Attach evidence to visit request in backend ────────────────
    try {
      await this.http.attachPhotoEvidence(visitId, photoUrl);
      console.log(`[CameraEvidence] Photo evidence attached for visitId=${visitId}: ${photoUrl}`);
    } catch (err) {
      console.error(`[CameraEvidence] Failed to POST evidence for visitId=${visitId}:`, err);
    }
  }

  /**
   * Triggers the ESP32S3 to take a photo for a given visit request.
   * Publishes the visitId as a plain string to the capture trigger topic.
   */
  triggerCapture(visitId: number): void {
    this.mqtt.publish(MqttTopics.CAMERA_TRIGGER, String(visitId));
    console.log(`[CameraEvidence] Capture triggered for visitId=${visitId}`);
  }

  /**
   * Simulated upload to object storage.
   *
   * Replace this stub with a real MinIO / AWS S3 / GCS SDK call:
   * ─── MinIO example ───────────────────────────────────────────────────
   *   const minioClient = new Minio.Client({ endPoint: 'localhost', port: 9000, ... });
   *   const objectName  = `photos/${visitId}/${uuidv4()}.jpg`;
   *   await minioClient.putObject('nexbell-photos', objectName, jpegBuffer);
   *   return `http://localhost:9000/nexbell-photos/${objectName}`;
   * ─────────────────────────────────────────────────────────────────────
   */
  private async _uploadToStorage(visitId: number, buffer: Buffer): Promise<string> {
    const objectKey   = `photos/${visitId}/${uuidv4()}.jpg`;
    const bucketUrl   = process.env.STORAGE_BUCKET_URL ?? 'http://localhost:9000/nexbell-photos';
    const presignedUrl = `${bucketUrl}/${objectKey}?X-Amz-Signature=${uuidv4()}&X-Amz-Expires=3600`;

    console.log(`[CameraEvidence] Simulated upload: ${buffer.length} bytes → ${presignedUrl}`);
    return presignedUrl;
  }
}
