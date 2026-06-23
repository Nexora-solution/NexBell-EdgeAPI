import * as mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';

type MessageHandler = (payload: string) => void;

/**
 * Infrastructure: MQTT Broker Client
 *
 * Connects to the Eclipse Mosquitto broker and dispatches inbound messages
 * to registered handlers. Provides a typed publish helper for downstream
 * commands (e.g. UNLOCK).
 */
export class MqttBrokerClient {
  private client!: MqttClient;
  private readonly subscriptions = new Map<string, MessageHandler>();

  constructor(private readonly brokerUrl: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const clientId = process.env.MQTT_CLIENT_ID ?? `nexbell-edge-${Date.now()}`;
      console.log(`[MQTT] Connecting to ${this.brokerUrl} as ${clientId} ...`);

      this.client = mqtt.connect(this.brokerUrl, {
        clientId,
        clean: true,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
      });

      this.client.on('connect', () => {
        console.log('[MQTT] Connected to broker.');
        resolve();
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Connection error:', err.message);
        reject(err);
      });

      this.client.on('message', (topic: string, messageBuffer: Buffer) => {
        const payload = messageBuffer.toString();
        const handler = this.subscriptions.get(topic);
        if (handler) {
          handler(payload);
        } else {
          console.warn(`[MQTT] No handler registered for topic: ${topic}`);
        }
      });

      this.client.on('offline', () => console.warn('[MQTT] Client offline — broker unreachable.'));
      this.client.on('reconnect', () => console.log('[MQTT] Attempting reconnect...'));
    });
  }

  subscribe(topic: string, handler: MessageHandler): void {
    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to subscribe to ${topic}:`, err.message);
      } else {
        console.log(`[MQTT] Subscribed: ${topic}`);
        this.subscriptions.set(topic, handler);
      }
    });
  }

  publish(topic: string, payload: string): void {
    this.client.publish(topic, payload, (err) => {
      if (err) console.error(`[MQTT] Publish error on ${topic}:`, err.message);
      else console.log(`[MQTT] Published to ${topic}: ${payload}`);
    });
  }
}
