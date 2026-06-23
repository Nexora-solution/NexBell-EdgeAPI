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

  /** Edge service publishes "START"/"STOP" to toggle the ESP32S3's live mic stream */
  AUDIO_START:  'nexbell/audio/start',

  /** ESP32S3 publishes raw PCM audio chunks continuously while the mic stream is active (no Base64/JSON) */
  AUDIO_CHUNK:  'nexbell/audio/chunk',

  /** Legacy: ESP32S3 published this when a fixed-duration evidence recording finished. No longer sent by the firmware. */
  AUDIO_DONE:      'nexbell/audio/done',

  /** Edge service publishes raw PCM audio chunks from the portero's mic for the ESP32S3 to play back */
  AUDIO_PLAYBACK:  'nexbell/audio/playback',

  /** Timbre presionado en la placa */
  BELL_BUTTON:     'nexbell/alarms/bell',

  /** Sensor de vibración detecta golpes/manipulación */
  VIBRATION_ALARM: 'nexbell/alarms/vibration',

  /** ESP32S3 publishes a JPEG frame as Base64 JSON after a capture trigger */
  CAMERA_FRAME:    'nexbell/telemetry/camera',

  /** ESP32S3 publishes raw binary JPEG frames continuously while streaming is active */
  VIDEO_STREAM:    'nexbell/telemetry/video',

  /** Edge service publishes a visitId to trigger OV2640 photo capture */
  CAMERA_TRIGGER:  'nexbell/commands/capture',
} as const;
