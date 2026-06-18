/**
 * Centralised registry of all MQTT topic strings used in the NexBell system.
 * Mirrors the topic table defined in the firmware Config.h.
 */
export const MqttTopics = {
  /** HC-SR04 publishes presence state: '1' (detected) or '0' (clear) */
  PRESENCE:     'nexbell/telemetry/presence',

  /** MC38 publishes door physical state: 'OPEN' or 'CLOSED' */
  DOOR_ALARM:   'nexbell/alarms/door',

  /** Edge service publishes unlock command to ESP32S3 */
  UNLOCK_CMD:   'nexbell/commands/unlock',

  /** Edge service publishes visit ID to trigger INMP441 recording */
  AUDIO_START:  'nexbell/audio/start',

  /** ESP32S3 publishes raw I2S audio chunk with Base64 payload */
  AUDIO_CHUNK:  'nexbell/audio/chunk',

  /** ESP32S3 publishes when recording window is complete */
  AUDIO_DONE:   'nexbell/audio/done',
} as const;
