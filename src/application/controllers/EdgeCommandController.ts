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

export class EdgeCommandController {
  private readonly PORT = Number(process.env.EDGE_SERVICE_PORT ?? 3100);

  constructor(private readonly mqtt: MqttBrokerClient) {}

  startHttpServer(): void {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/commands/unlock') {
        this.mqtt.publish(MqttTopics.UNLOCK_CMD, 'UNLOCK');
        console.log('[EdgeCommandController] UNLOCK published to MQTT.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UNLOCK_DISPATCHED' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(this.PORT, () => {
      console.log(`[EdgeCommandController] HTTP server listening on port ${this.PORT}`);
    });
  }
}
