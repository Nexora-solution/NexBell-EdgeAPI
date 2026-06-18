"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioSession = void 0;
class AudioSession {
    constructor(visitId) {
        this._chunks = [];
        this._visitId = visitId;
        this._startedAt = new Date();
    }
    get visitId() { return this._visitId; }
    get chunkCount() { return this._chunks.length; }
    addChunk(chunk) {
        this._chunks.push(chunk);
    }
    /** Return the ordered, decoded raw PCM bytes as a single Buffer. */
    assembleBuffer() {
        const ordered = [...this._chunks].sort((a, b) => a.seq - b.seq);
        const parts = ordered.map((c) => Buffer.from(c.data, 'base64'));
        return Buffer.concat(parts);
    }
    durationMs() {
        return Date.now() - this._startedAt.getTime();
    }
}
exports.AudioSession = AudioSession;
