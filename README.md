# NexBell Edge Service

Protocol bridge between the ESP32S3 firmware (MQTT) and the Spring Boot backend (REST HTTP).

## Architecture

```
ESP32S3 ──MQTT──► Mosquitto Broker ──MQTT──► Edge Service ──HTTP──► Spring Boot Backend
                                              │
                                              └──HTTP (port 3100)◄── Spring Boot Backend
                                                 (receives UNLOCK commands)
```

## DDD Layer Structure

```
src/
├── domain/
│   ├── MqttTopics.ts              # Topic registry (single source of truth)
│   └── models/
│       └── AudioSession.ts        # Audio session aggregate
├── application/
│   ├── handlers/
│   │   ├── PresenceEventHandler.ts  # HC-SR04 → POST /api/security/iot/presence
│   │   └── DoorAlarmEventHandler.ts # MC38 → POST /api/security/alarms/tampering
│   ├── services/
│   │   └── AudioOrchestrationService.ts # INMP441 chunk aggregation + storage upload
│   └── controllers/
│       └── EdgeCommandController.ts # Receives unlock from backend, publishes MQTT
└── infrastructure/
    ├── mqtt/
    │   └── MqttBrokerClient.ts    # Eclipse Mosquitto client wrapper
    └── http/
        └── NexBellHttpClient.ts   # Axios REST client for Spring Boot backend
```

## Quick Start

```bash
cd edge-service
npm install
cp .env.example .env
# Edit .env with your broker URL and backend URL
npm run dev
```

## MQTT → REST Mapping

| MQTT Topic                   | Trigger                | REST Call                                      |
|------------------------------|------------------------|------------------------------------------------|
| `nexbell/telemetry/presence` | HC-SR04 detects person | `POST /api/security/iot/presence`              |
| `nexbell/alarms/door`        | MC38 door opened       | `POST /api/security/alarms/tampering`          |
| `nexbell/audio/done`         | INMP441 recording done | `POST /api/intercom/visit-requests/{id}/evidence` |
| Backend unlock intent        | IoTHttpCommandGateway  | Publish `UNLOCK` to `nexbell/commands/unlock`  |

## Running with Docker (Mosquitto)

```yaml
# docker-compose.yml snippet
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

  edge-service:
    build: ./edge-service
    environment:
      MQTT_BROKER_URL: mqtt://mosquitto:1883
      BACKEND_BASE_URL: http://backend:8080
    depends_on:
      - mosquitto
```
