import * as net from 'net';
import type { VideoStreamService } from '../../application/services/VideoStreamService';

/**
 * Infrastructure: Video TCP Receiver
 *
 * Listens for the ESP32's direct TCP video connection (out of the MQTT broker)
 * and reassembles the length-prefixed JPEG frames it sends:
 *
 *     [ 4 bytes: length (big-endian) ][ JPEG bytes ] [ 4 bytes ][ JPEG ] ...
 *
 * Each complete frame is handed to the VideoStreamService, which the HTTP
 * MJPEG endpoint then serves to the browser.
 */
const MAX_FRAME_BYTES = 200_000; // sanity cap to resync if the stream desyncs

export class VideoTcpReceiver {
  private readonly server: net.Server;

  constructor(
    private readonly videoStream: VideoStreamService,
    private readonly port: number,
  ) {
    this.server = net.createServer((socket) => this._handleConnection(socket));
  }

  start(): void {
    this.server.on('error', (err: Error) => console.error('[VideoTCP] Server error:', err.message));
    this.server.listen(this.port, () => {
      console.log(`[VideoTCP] Listening for ESP32 video on TCP ${this.port}.`);
    });
  }

  private _handleConnection(socket: net.Socket): void {
    console.log(`[VideoTCP] ESP32 video connected from ${socket.remoteAddress}.`);
    socket.setNoDelay(true);

    let buffer = Buffer.alloc(0);
    let expectedLen = -1; // -1 = waiting for the 4-byte length header

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Parse as many complete frames as the buffer currently holds.
      for (;;) {
        if (expectedLen < 0) {
          if (buffer.length < 4) break;
          expectedLen = buffer.readUInt32BE(0);
          buffer = buffer.subarray(4);
          if (expectedLen <= 0 || expectedLen > MAX_FRAME_BYTES) {
            console.warn('[VideoTCP] Frame length out of range — resetting connection.');
            socket.destroy();
            return;
          }
        }
        if (buffer.length < expectedLen) break;
        const frame = Buffer.from(buffer.subarray(0, expectedLen)); // copy out
        buffer = buffer.subarray(expectedLen);
        expectedLen = -1;
        this.videoStream.onFrame(frame);
      }
    });

    socket.on('close', () => console.log('[VideoTCP] ESP32 video disconnected.'));
    socket.on('error', (err: Error) => console.error('[VideoTCP] Socket error:', err.message));
  }
}
