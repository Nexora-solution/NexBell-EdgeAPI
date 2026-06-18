"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttBrokerClient = void 0;
const mqtt = __importStar(require("mqtt"));
/**
 * Infrastructure: MQTT Broker Client
 *
 * Connects to the Eclipse Mosquitto broker and dispatches inbound messages
 * to registered handlers. Provides a typed publish helper for downstream
 * commands (e.g. UNLOCK).
 */
class MqttBrokerClient {
    constructor(brokerUrl) {
        this.brokerUrl = brokerUrl;
        this.subscriptions = new Map();
    }
    connect() {
        return new Promise((resolve, reject) => {
            const clientId = process.env.MQTT_CLIENT_ID ?? `nexbell-edge-${Date.now()}`;
            console.log(`[MQTT] Connecting to ${this.brokerUrl} as ${clientId} ...`);
            this.client = mqtt.connect(this.brokerUrl, { clientId, clean: true });
            this.client.on('connect', () => {
                console.log('[MQTT] Connected to broker.');
                resolve();
            });
            this.client.on('error', (err) => {
                console.error('[MQTT] Connection error:', err.message);
                reject(err);
            });
            this.client.on('message', (topic, messageBuffer) => {
                const payload = messageBuffer.toString();
                const handler = this.subscriptions.get(topic);
                if (handler) {
                    handler(payload);
                }
                else {
                    console.warn(`[MQTT] No handler registered for topic: ${topic}`);
                }
            });
            this.client.on('offline', () => console.warn('[MQTT] Client offline — broker unreachable.'));
            this.client.on('reconnect', () => console.log('[MQTT] Attempting reconnect...'));
        });
    }
    subscribe(topic, handler) {
        this.client.subscribe(topic, (err) => {
            if (err) {
                console.error(`[MQTT] Failed to subscribe to ${topic}:`, err.message);
            }
            else {
                console.log(`[MQTT] Subscribed: ${topic}`);
                this.subscriptions.set(topic, handler);
            }
        });
    }
    publish(topic, payload) {
        this.client.publish(topic, payload, (err) => {
            if (err)
                console.error(`[MQTT] Publish error on ${topic}:`, err.message);
            else
                console.log(`[MQTT] Published to ${topic}: ${payload}`);
        });
    }
}
exports.MqttBrokerClient = MqttBrokerClient;
