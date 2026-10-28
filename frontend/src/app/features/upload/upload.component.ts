import { Component, effect, inject, signal, untracked } from '@angular/core';
import { ApiService, type UploadMetadata } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { SseService } from '../../core/sse.service';
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { UploadMetadataFormComponent } from './components/upload-metadata-form.component';
import { UploadQueueComponent } from './components/upload-queue.component';
import { MAX_FILES, MAX_FILE_SIZE_BYTES, type QueueItem } from './upload.models';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [UploadDropzoneComponent, UploadMetadataFormComponent, UploadQueueComponent],
  template: `
    <section class="space-y-5">
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
export class UploadComponent {
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  readonly i18n = inject(I18nService);

  readonly queue = signal<QueueItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly dragActive = signal(false);
  readonly maxFiles = MAX_FILES;

  metadata: UploadMetadata = {
    title: '',
    description: '',
    author: '',
    category: '',
    version: '',
    tags: '',
  };

  constructor() {
    effect(() => {
      const event = this.sse.lastEvent();
      if (!event) return;

      untracked(() => {
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
      } catch (error) {
        this.patch(index, {
          status: 'ERROR',
          progress: 0,
          error: apiErrorMessage(error, 'No se pudo subir el archivo.'),
        });
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
    } catch (error) {
      this.patch(index, { error: apiErrorMessage(error, 'No se pudo reintentar.') });
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
}
