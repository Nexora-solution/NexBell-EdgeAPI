/**
 * Application Service: Video Stream Buffer
 *
 * Receives raw binary JPEG frames published by the ESP32S3 on
 * `nexbell/telemetry/video` while the camera stream is active, and keeps
 * the most recent frame in memory. This is groundwork for exposing an
 * HTTP endpoint (MJPEG/snapshot) that the web frontend can consume —
 * that endpoint itself is built in a later package.
 */
export class VideoStreamService {
  private latestFrame: Buffer | null = null;
  private lastFrameAt: number = 0;
  private frameCount = 0;

  onFrame(payload: Buffer): void {
    this.latestFrame = payload;
    this.lastFrameAt = Date.now();
    this.frameCount += 1;

    if (this.frameCount % 50 === 0) {
      console.log(`[VideoStream] Received ${this.frameCount} frames so far (latest: ${payload.length} bytes).`);
    }
  }

  getLatestFrame(): Buffer | null {
    return this.latestFrame;
  }

  /** Timestamp (ms) of the latest frame — lets the MJPEG endpoint send only new frames. */
  getLastFrameAt(): number {
    return this.lastFrameAt;
  }

  /**
   * True if a frame arrived within the last `maxAgeMs` milliseconds. 5s balances
   * two needs: long enough that a brief stall during live audio doesn't hide the
   * video, short enough that it turns off reasonably fast when the visitor leaves.
   */
  isLive(maxAgeMs = 5000): boolean {
    return this.latestFrame !== null && (Date.now() - this.lastFrameAt) <= maxAgeMs;
  }
}
