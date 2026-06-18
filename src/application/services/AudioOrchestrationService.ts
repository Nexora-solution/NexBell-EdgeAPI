import { v4 as uuidv4 }             from 'uuid';
import { AudioSession, type AudioChunk } from '../../domain/models/AudioSession';
import type { NexBellHttpClient }    from '../../infrastructure/http/NexBellHttpClient';
import type { MqttBrokerClient }     from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics }                from '../../domain/MqttTopics';

/**
 * Application Service: Audio Orchestration (INMP441)
 *
 * Responsibilities:
 *  1. Receive raw I2S PCM audio chunks published by the ESP32S3.
 *  2. Aggregate them into an AudioSession domain model.
 *  3. On `nexbell/audio/done`, assemble the full buffer and simulate
 *     uploading it to object storage (returns a pre-signed URL).
 *  4. Call the backend to attach the audio URL as evidence on the visit request.
 *  5. Trigger a new recording on the ESP32S3 by publishing to `nexbell/audio/start`.
 */
export class AudioOrchestrationService {
  /** Active recording sessions keyed by visitRequestId */
  private readonly sessions = new Map<number, AudioSession>();

  constructor(
    private readonly http:  NexBellHttpClient,
    private readonly mqtt:  MqttBrokerClient,
  ) {}

  /**
   * Called when a chunk arrives on `nexbell/audio/chunk`.
   * Payload is a JSON envelope: { id, seq, data }
   */
  onChunk(rawPayload: string): void {
    try {
      const chunk = JSON.parse(rawPayload) as AudioChunk;
      const visitId = chunk.id;

      if (!this.sessions.has(visitId)) {
        // First chunk for this visit — create a new session
        this.sessions.set(visitId, new AudioSession(visitId));
        console.log(`[AudioOrchestration] New session started for visitId=${visitId}`);
      }

      this.sessions.get(visitId)!.addChunk(chunk);
    } catch (err) {
      console.error('[AudioOrchestration] Failed to parse chunk:', err);
    }
  }

  /**
   * Called when `nexbell/audio/done` arrives.
   * Payload is JSON: { id: <visitRequestId> }
   */
  async onDone(rawPayload: string): Promise<void> {
    try {
      const { id: visitId } = JSON.parse(rawPayload) as { id: number };
      const session = this.sessions.get(visitId);

      if (!session) {
        console.warn(`[AudioOrchestration] No session found for visitId=${visitId}`);
        return;
      }

      console.log(`[AudioOrchestration] Assembling ${session.chunkCount} chunks for visitId=${visitId}`);
      const audioBuffer = session.assembleBuffer();

      // Simulate upload to object storage and generate a pre-signed URL
      const audioUrl = await this._uploadToStorage(visitId, audioBuffer);

      // Attach evidence on the backend
      await this.http.attachAudioEvidence(visitId, audioUrl);

      // Clean up session
      this.sessions.delete(visitId);
      console.log(`[AudioOrchestration] Session for visitId=${visitId} completed.`);

    } catch (err) {
      console.error('[AudioOrchestration] Failed to process done event:', err);
    }
  }

  /**
   * Triggers a new recording session on the ESP32S3 for a given visit request.
   * The backend (or a doorbell press handler) calls this to start audio capture.
   */
  startRecordingFor(visitRequestId: number): void {
    const payload = String(visitRequestId);
    this.mqtt.publish(MqttTopics.AUDIO_START, payload);
    console.log(`[AudioOrchestration] Recording triggered for visitId=${visitRequestId}`);
  }

  /**
   * Simulates uploading audio bytes to an object storage bucket
   * (e.g. MinIO, AWS S3, GCS) and returns a temporary pre-signed URL.
   *
   * In production: replace with actual AWS SDK / GCS client call.
   */
  private async _uploadToStorage(visitId: number, buffer: Buffer): Promise<string> {
    const objectKey = `audio/${visitId}/${uuidv4()}.pcm`;
    const bucketUrl = process.env.STORAGE_BUCKET_URL ?? 'http://localhost:9000/nexbell-audio';
    const presignedUrl = `${bucketUrl}/${objectKey}?X-Amz-Signature=${uuidv4()}&X-Amz-Expires=3600`;

    console.log(`[AudioOrchestration] Simulated upload: ${buffer.length} bytes → ${presignedUrl}`);
    return presignedUrl;
  }
}
