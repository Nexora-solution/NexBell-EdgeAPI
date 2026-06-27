import type { MqttBrokerClient } from '../../infrastructure/mqtt/MqttBrokerClient';
import { MqttTopics }            from '../../domain/MqttTopics';

/**
 * Application Controller: Downstream Door Command Gateway
 *
 * This controller is the integration point for the Spring Boot backend's
 * `IoTHttpCommandGateway.send()`. When the backend decides to unlock the door,
 * it calls the edge service's REST endpoint (see below). This class then
 * publishes the UNLOCK command to the ESP32S3 via MQTT.
 *
 * Spring Boot IoTHttpCommandGateway should be updated to call:
 *   POST http://edge-service:3100/api/commands/unlock
 *
 * This tiny HTTP server is started by this controller.
 */
import * as http from 'http';
import type { VideoStreamService } from '../services/VideoStreamService';

export class EdgeCommandController {
  private readonly PORT = Number(process.env.EDGE_SERVICE_PORT ?? 3100);

  constructor(
    private readonly mqtt: MqttBrokerClient,
    private readonly videoStream: VideoStreamService,
  ) {}

  /** Starts the HTTP server and returns it, so other transports (e.g. WebSocket) can attach to the same port. */
  startHttpServer(): http.Server {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/commands/unlock') {
        this.mqtt.publish(MqttTopics.UNLOCK_CMD, 'UNLOCK');
        console.log('[EdgeCommandController] UNLOCK published to MQTT.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UNLOCK_DISPATCHED' }));
      } else if (req.method === 'POST' && req.url === '/api/commands/capture') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.action === 'START_VIDEO') {
              this.mqtt.publish(MqttTopics.CAMERA_TRIGGER, "START_VIDEO");
              console.log(`[EdgeCommandController] START_VIDEO published.`);
            } else if (data.action === 'STOP_VIDEO') {
              this.mqtt.publish(MqttTopics.CAMERA_TRIGGER, "STOP_VIDEO");
              console.log(`[EdgeCommandController] STOP_VIDEO published.`);
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid action, expected START_VIDEO or STOP_VIDEO' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'CAPTURE_DISPATCHED' }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
      } else if (req.method === 'GET' && req.url === '/video-stream/status') {
        // Is the camera actively sending frames right now? (used by the web for
        // the doorbell alert and the live-view indicator)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end(JSON.stringify({ live: this.videoStream.isLive() }));
      } else if (req.method === 'GET' && req.url === '/video-stream') {
        // MJPEG stream straight to the browser <img>. Event-driven: each frame
        // is sent as soon as a NEW one arrives over TCP (no duplicate frames,
        // minimal latency).
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          'Connection': 'close',
        });
        let lastSent = 0;
        const timer = setInterval(() => {
          const ts = this.videoStream.getLastFrameAt();
          if (ts === lastSent) return;
          const frame = this.videoStream.getLatestFrame();
          if (frame && frame.length > 0) {
            res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');
            lastSent = ts;
          }
        }, 10);
        const stop = () => clearInterval(timer);
        req.on('close', stop);
        res.on('error', stop);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(this.PORT, () => {
      console.log(`[EdgeCommandController] HTTP server listening on port ${this.PORT}`);
    });

    return server;
  }
}
