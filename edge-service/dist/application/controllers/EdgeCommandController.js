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
exports.EdgeCommandController = void 0;
const MqttTopics_1 = require("../../domain/MqttTopics");
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
const http = __importStar(require("http"));
class EdgeCommandController {
    constructor(mqtt) {
        this.mqtt = mqtt;
        this.PORT = Number(process.env.EDGE_SERVICE_PORT ?? 3100);
    }
    startHttpServer() {
        const server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/api/commands/unlock') {
                this.mqtt.publish(MqttTopics_1.MqttTopics.UNLOCK_CMD, 'UNLOCK');
                console.log('[EdgeCommandController] UNLOCK published to MQTT.');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'UNLOCK_DISPATCHED' }));
            }
            else {
                res.writeHead(404);
                res.end();
            }
        });
        server.listen(this.PORT, () => {
            console.log(`[EdgeCommandController] HTTP server listening on port ${this.PORT}`);
        });
    }
}
exports.EdgeCommandController = EdgeCommandController;
