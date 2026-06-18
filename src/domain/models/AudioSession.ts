/**
 * Domain model representing an active audio recording session.
 * Aggregates raw Base64 audio chunks from the ESP32S3 INMP441 microphone
 * until the recording window closes.
 */
export interface AudioChunk {
  id: number;
  seq: number;
  data: string; // Base64-encoded raw PCM bytes
}

export class AudioSession {
  private readonly _visitId: number;
  private readonly _chunks: AudioChunk[] = [];
  private readonly _startedAt: Date;

  constructor(visitId: number) {
    this._visitId   = visitId;
    this._startedAt = new Date();
  }

  get visitId(): number { return this._visitId; }
  get chunkCount(): number { return this._chunks.length; }

  addChunk(chunk: AudioChunk): void {
    this._chunks.push(chunk);
  }

  /** Return the ordered, decoded raw PCM bytes as a single Buffer. */
  assembleBuffer(): Buffer {
    const ordered = [...this._chunks].sort((a, b) => a.seq - b.seq);
    const parts   = ordered.map((c) => Buffer.from(c.data, 'base64'));
    return Buffer.concat(parts);
  }

  durationMs(): number {
    return Date.now() - this._startedAt.getTime();
  }
}
