import { Injectable, signal } from '@angular/core';
import type { DocumentStatusEvent } from '@docs/shared';

@Injectable({ providedIn: 'root' })
export class SseService {
  private source: EventSource | null = null;

  readonly connected = signal(false);
  readonly lastEvent = signal<DocumentStatusEvent | null>(null);

  connect(): void {
    if (this.source) return;

    const source = new EventSource('/api/events', { withCredentials: true });
    source.onopen = () => this.connected.set(true);
    source.onerror = () => this.connected.set(false);
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as DocumentStatusEvent | { type: string };
        if ('type' in event && event.type === 'document.status') {
          this.lastEvent.set(event as DocumentStatusEvent);
        }
      } catch {
        // Ignorar mensajes que no sean JSON.
      }
    };

    this.source = source;
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
    this.connected.set(false);
  }
}
