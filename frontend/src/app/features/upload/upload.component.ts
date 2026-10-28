import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DocumentStatus } from '@docs/shared';
import { ApiService, type UploadMetadata } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { SseService } from '../../core/sse.service';

type QueueStatus = DocumentStatus | 'PENDING' | 'UPLOADING';

interface QueueItem {
  file: File;
  status: QueueStatus;
  progress: number;
  idempotencyKey: string;
  documentId?: string;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('upload.title') }}</h1>
        <p class="mt-1 text-sm muted">
          PDF, TXT, Markdown y DOCX. Máximo 25 MB por archivo y 20 archivos por lote.
        </p>
      </div>

      <div class="rounded-xl p-5 surface">
        <label class="block text-sm font-medium">
          {{ i18n.t('upload.select') }}
          <input
            class="input mt-2"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx"
            (change)="onFilesSelected($event)"
          />
        </label>

        <h2 class="mt-6 text-lg font-semibold">{{ i18n.t('upload.metadata') }}</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <label class="block text-sm font-medium">
            {{ i18n.t('upload.titleField') }} *
            <input class="input mt-1" name="title" [(ngModel)]="metadata.title" required />
          </label>
          <label class="block text-sm font-medium">
            {{ i18n.t('upload.author') }}
            <input class="input mt-1" name="author" [(ngModel)]="metadata.author" />
          </label>
          <label class="block text-sm font-medium">
            {{ i18n.t('upload.category') }}
            <input class="input mt-1" name="category" [(ngModel)]="metadata.category" />
          </label>
          <label class="block text-sm font-medium">
            {{ i18n.t('upload.version') }}
            <input class="input mt-1" name="version" [(ngModel)]="metadata.version" />
          </label>
          <label class="block text-sm font-medium md:col-span-2">
            {{ i18n.t('upload.tags') }}
            <input class="input mt-1" name="tags" [(ngModel)]="metadata.tags" />
          </label>
          <label class="block text-sm font-medium md:col-span-2">
            {{ i18n.t('upload.description') }}
            <textarea class="input mt-1" name="description" rows="3" [(ngModel)]="metadata.description"></textarea>
          </label>
        </div>

        @if (error()) {
          <p class="mt-3 text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
        }

        <button
          type="button"
          class="btn btn-primary mt-4"
          [disabled]="loading() || queue().length === 0 || !metadata.title"
          (click)="start()"
        >
          {{ loading() ? '…' : i18n.t('upload.start') }}
        </button>
      </div>

      <div class="rounded-xl p-5 surface">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">{{ i18n.t('upload.queue') }}</h2>
          <p class="text-sm muted">
            {{ i18n.t('upload.summary') }}: {{ indexedCount() }} ✓ · {{ failedCount() }} ✕ ·
            {{ pendingCount() }} …
          </p>
        </div>

        @if (queue().length === 0) {
          <p class="mt-4 text-sm muted">{{ i18n.t('upload.empty') }}</p>
        } @else {
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b" style="border-color: var(--border);">
                  <th class="py-2 pr-3">Archivo</th>
                  <th class="py-2 pr-3">Estado</th>
                  <th class="py-2 pr-3">Progreso</th>
                  <th class="py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (item of queue(); track $index; let i = $index) {
                  <tr class="border-b align-top" style="border-color: var(--border);">
                    <td class="py-3 pr-3">
                      <div class="font-medium">{{ item.file.name }}</div>
                      <div class="text-xs muted">{{ (item.file.size / 1024).toFixed(0) }} KB</div>
                    </td>
                    <td class="py-3 pr-3">
                      <span
                        class="badge"
                        [class.badge-ok]="item.status === 'INDEXED'"
                        [class.badge-error]="item.status === 'ERROR'"
                      >
                        {{ statusLabel(item.status) }}
                      </span>
                      @if (item.error) {
                        <p class="mt-1 text-xs" style="color: var(--danger);">{{ item.error }}</p>
                      }
                    </td>
                    <td class="py-3 pr-3">
                      <div class="h-2 w-32 overflow-hidden rounded" style="background: var(--surface-muted);">
                        <div
                          class="h-full rounded"
                          style="background: var(--accent);"
                          [style.width.%]="item.progress"
                        ></div>
                      </div>
                      <span class="text-xs muted">{{ item.progress }}%</span>
                    </td>
                    <td class="py-3">
                      @if (item.status === 'ERROR') {
                        <button type="button" class="btn" (click)="retry(i)">{{ i18n.t('upload.retry') }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
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
    const files = Array.from(input.files ?? []);
    this.error.set('');

    const items: QueueItem[] = [];
    for (const file of files) {
      if (!/\.(pdf|txt|md|markdown|docx)$/i.test(file.name)) {
        this.error.set(`Formato no admitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        this.error.set(`${file.name} supera los 25 MB.`);
        continue;
      }
      items.push({ file, status: 'PENDING', progress: 0, idempotencyKey: crypto.randomUUID() });
    }

    if (items.length) {
      this.queue.update((current) => [...current, ...items].slice(0, 20));
      if (!this.metadata.title) {
        this.metadata.title = items[0].file.name.replace(/\.[^.]+$/, '');
      }
    }

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
        const document = await this.api.uploadDocument(item.file, this.metadata, (progress) => {
          this.patch(index, { progress });
        }, item.idempotencyKey);
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

  statusLabel(status: QueueStatus): string {
    if (status === 'PENDING') return this.i18n.lang() === 'es' ? 'Pendiente' : 'Pending';
    if (status === 'UPLOADING') return this.i18n.lang() === 'es' ? 'Subiendo' : 'Uploading';
    return this.i18n.t(`status.${status}`);
  }

  indexedCount(): number {
    return this.queue().filter((item) => item.status === 'INDEXED').length;
  }

  failedCount(): number {
    return this.queue().filter((item) => item.status === 'ERROR').length;
  }

  pendingCount(): number {
    return this.queue().filter((item) =>
      ['PENDING', 'UPLOADING', 'RECEIVED', 'PROCESSING'].includes(item.status),
    ).length;
  }

  private patch(index: number, patch: Partial<QueueItem>): void {
    this.queue.update((items) =>
      items.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    );
  }
}
