import { NexBellHttpClient } from '../../infrastructure/http/NexBellHttpClient';

export class BellEventHandler {
  constructor(
    private httpClient: NexBellHttpClient,
    private cameraService: any // Tipado como any temporalmente o CameraEvidenceService
  ) {}

  public async handle(payload: string): Promise<void> {
    console.log('[BellEventHandler] Bell button pressed. Triggering visit request...');
    
    try {
      const visitId = await this.httpClient.createVisitRequest('Unknown Visitor', 1);
      console.log(`[BellEventHandler] Successfully notified backend. Created visitId: ${visitId}`);
      
      // ¡Iniciar el streaming de video automáticamente!
      this.cameraService.startStream();
      
      // Stop the stream after 30 seconds to save data/bandwidth (optional)
      setTimeout(() => {
        this.cameraService.stopStream();
      }, 30000);
    } catch (err) {
      console.error('[BellEventHandler] Error notifying backend:', err);
    }
  }
}
