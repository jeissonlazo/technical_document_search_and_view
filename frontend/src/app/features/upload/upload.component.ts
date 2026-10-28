import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import type { DocumentStatus } from '@docs/shared';
import { ApiService, type UploadMetadata } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { SseService } from '../../core/sse.service';
import { UploadAlertStackComponent } from './components/upload-alert-stack.component';
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { UploadMetadataFormComponent } from './components/upload-metadata-form.component';
import { UploadQueueComponent } from './components/upload-queue.component';
import {
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  type QueueItem,
  type UploadAlert,
  type UploadAlertKind,
} from './upload.models';

const ALERT_AUTO_DISMISS_MS = 6000;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    UploadAlertStackComponent,
    UploadDropzoneComponent,
    UploadMetadataFormComponent,
    UploadQueueComponent,
  ],
  template: `
    <section class="space-y-5">
      <app-upload-alert-stack [alerts]="alerts()" (dismiss)="dismissAlert($event)" />

      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('upload.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('upload.subtitle') }}</p>
      </div>

      <div class="grid gap-5 lg:grid-cols-[4fr_6fr]">
        <div class="space-y-5">
          <input
            #fileInput
            class="hidden"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx"
            (change)="onFilesSelected($event)"
          />

          <app-upload-dropzone
            [dragActive]="dragActive()"
            (browse)="fileInput.click()"
            (filesDropped)="addFiles($event)"
            (dragActiveChange)="dragActive.set($event)"
          />

          @if (error()) {
            <p class="text-sm" style="color: var(--danger);" role="alert" aria-live="polite">
              {{ error() }}
            </p>
          }

          <app-upload-metadata-form [metadata]="metadata" />
        </div>

        <app-upload-queue
          [queue]="queue()"
          [loading]="loading()"
          [canStart]="metadata.title.trim().length > 0"
          (clear)="clearQueue()"
          (retry)="retry($event)"
          (remove)="removeFile($event)"
          (start)="start()"
        />
      </div>
    </section>
  `,
})
export class UploadComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  readonly i18n = inject(I18nService);

  readonly queue = signal<QueueItem[]>([]);
  readonly alerts = signal<UploadAlert[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly dragActive = signal(false);
  readonly maxFiles = MAX_FILES;
  private sseWasConnected = false;
  private alertSequence = 0;
  private readonly alertTimers = new Map<number, ReturnType<typeof setTimeout>>();

  metadata: UploadMetadata = {
    title: '',
    description: '',
    author: '',
    category: '',
    categories: [],
    version: '',
    tags: '',
  };

  constructor() {
    effect(() => {
      const connected = this.sse.connected();
      const event = this.sse.lastEvent();

      if (!connected) {
        this.sseWasConnected = false;
        return;
      }

      if (!this.sseWasConnected) {
        this.sseWasConnected = true;
        // EventSource reconecta, pero no reproduce eventos perdidos. Una sola
        // consulta de los documentos activos evita depender de polling.
        untracked(() => void this.reconcileActiveDocuments());
      }

      if (!event) return;

      untracked(() => {
        const current = this.queue().find((item) => item.documentId === event.documentId);
        if (current && current.status !== event.status) {
          this.notifyStatus(event.status, current.file.name, event.message, event.stage);
        }

        this.queue.update((items) =>
          items.map((item) =>
            item.documentId === event.documentId
              ? {
                  ...item,
                  status: event.status,
                  error: event.status === 'ERROR' ? (event.message ?? item.error) : item.error,
                }
              : item,
          ),
        );
      });
    });
  }

  private async reconcileActiveDocuments(): Promise<void> {
    const items = this.queue();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.documentId || item.status === 'INDEXED' || item.status === 'ERROR') continue;

      try {
        const document = await this.api.getDocument(item.documentId);
        const previousStatus = item.status;
        this.patch(index, {
          status: document.status,
          error: document.status === 'ERROR' ? (document.errorMessage ?? item.error) : undefined,
        });
        if (previousStatus !== document.status) {
          this.notifyStatus(document.status, item.file.name, document.errorMessage);
        }
      } catch {
        // Se conserva el último estado conocido.
      }
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  async start(): Promise<void> {
    if (this.loading() || !this.metadata.title.trim()) return;
    this.loading.set(true);
    this.error.set('');

    const total = this.queue().length;
    for (let index = 0; index < total; index += 1) {
      const item = this.queue()[index];
      if (item.status !== 'PENDING') continue;

      this.patch(index, { status: 'UPLOADING', progress: 0, error: undefined });
      try {
        const document = await this.api.uploadDocument(
          item.file,
          this.metadata,
          (progress) => {
            this.patch(index, { progress });
          },
          item.idempotencyKey,
        );
        this.patch(index, {
          status: document.status,
          documentId: document.id,
          progress: 100,
        });
        this.pushAlert(
          'uploaded',
          this.i18n.t('upload.alertUploadedTitle'),
          `${item.file.name} · ${this.i18n.t('upload.alertUploadedMessage')}`,
        );
      } catch (error) {
        const message = apiErrorMessage(error, 'No se pudo subir el archivo.');
        this.patch(index, {
          status: 'ERROR',
          progress: 0,
          error: message,
        });
        this.pushAlert(
          'error',
          this.i18n.t('upload.alertErrorTitle'),
          `${item.file.name} · ${message}`,
        );
      }
    }

    this.loading.set(false);
  }

  async retry(index: number): Promise<void> {
    const item = this.queue()[index];
    if (!item) return;

    if (!item.documentId) {
      this.patch(index, { status: 'PENDING', error: undefined, progress: 0 });
      return;
    }

    try {
      const document = await this.api.retryDocument(item.documentId);
      this.patch(index, { status: document.status, error: undefined });
      this.pushAlert(
        'retry',
        this.i18n.t('upload.alertRetryTitle'),
        `${item.file.name} · ${this.i18n.t('upload.alertRetryMessage')}`,
      );
    } catch (error) {
      const message = apiErrorMessage(error, 'No se pudo reintentar.');
      this.patch(index, { error: message });
      this.pushAlert(
        'error',
        this.i18n.t('upload.alertErrorTitle'),
        `${item.file.name} · ${message}`,
      );
    }
  }

  removeFile(index: number): void {
    if (this.loading()) return;
    this.queue.update((items) => items.filter((_, current) => current !== index));
  }

  clearQueue(): void {
    if (this.loading()) return;
    this.queue.set([]);
  }

  addFiles(files: File[]): void {
    if (!files.length) return;

    this.error.set('');
    const items: QueueItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!/\.(pdf|txt|md|markdown|docx)$/i.test(file.name)) {
        errors.push(`Formato no admitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name} supera los 25 MB.`);
        continue;
      }
      items.push({ file, status: 'PENDING', progress: 0, idempotencyKey: crypto.randomUUID() });
    }

    const remaining = MAX_FILES - this.queue().length;
    if (items.length > remaining) {
      errors.push(`Solo puedes agregar ${MAX_FILES} archivos por lote.`);
      items.splice(Math.max(0, remaining));
    }

    if (items.length) {
      this.queue.update((current) => [...current, ...items]);
      if (!this.metadata.title) {
        this.metadata = {
          ...this.metadata,
          title: items[0].file.name.replace(/\.[^.]+$/, ''),
        };
      }
    }

    if (errors.length) this.error.set(errors.join(' '));
  }

  private patch(index: number, patch: Partial<QueueItem>): void {
    this.queue.update((items) =>
      items.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    );
  }

  dismissAlert(id: number): void {
    this.clearAlertTimer(id);
    this.alerts.update((alerts) => alerts.filter((alert) => alert.id !== id));
  }

  ngOnDestroy(): void {
    for (const timer of this.alertTimers.values()) clearTimeout(timer);
    this.alertTimers.clear();
  }

  private notifyStatus(
    status: DocumentStatus,
    filename: string,
    message?: string | null,
    stage?: string,
  ): void {
    let kind: UploadAlertKind;
    let title: string;
    let description: string;

    if (status === 'INDEXED') {
      kind = 'indexed';
      title = this.i18n.t('upload.alertIndexedTitle');
      description = this.i18n.t('upload.alertIndexedMessage');
    } else if (status === 'ERROR') {
      kind = 'error';
      title = this.i18n.t('upload.alertErrorTitle');
      description = message || this.i18n.t('upload.alertErrorMessage');
    } else if (stage === 'retry') {
      kind = 'retry';
      title = this.i18n.t('upload.alertRetryTitle');
      description = this.i18n.t('upload.alertRetryMessage');
    } else {
      kind = 'processing';
      title = this.i18n.t('upload.alertProcessingTitle');
      description = this.i18n.t('upload.alertProcessingMessage');
    }

    this.pushAlert(kind, title, `${filename} · ${description}`);
  }

  private pushAlert(kind: UploadAlertKind, title: string, message: string): void {
    this.alertSequence += 1;
    const alert: UploadAlert = {
      id: this.alertSequence,
      kind,
      title,
      message,
    };

    this.alerts.update((alerts) => {
      const next = [alert, ...alerts];
      for (const dropped of next.slice(5)) this.clearAlertTimer(dropped.id);
      return next.slice(0, 5);
    });

    const timer = setTimeout(() => this.dismissAlert(alert.id), ALERT_AUTO_DISMISS_MS);
    this.alertTimers.set(alert.id, timer);
  }

  private clearAlertTimer(id: number): void {
    const timer = this.alertTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.alertTimers.delete(id);
    }
  }
}
