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
const MAX_FILES = 20;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="space-y-5">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('upload.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('upload.subtitle') }}</p>
      </div>

      <div class="grid gap-5 lg:grid-cols-[6fr_5fr]">
        <div class="space-y-5">
          <input
            #fileInput
            class="hidden"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx"
            (change)="onFilesSelected($event)"
          />

          <button
            type="button"
            class="dropzone w-full rounded-xl p-8 text-center"
            [class.dropzone-active]="dragActive()"
            (click)="fileInput.click()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
          >
            <span
              class="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style="background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </span>

            <span class="mt-4 block text-lg font-semibold">
              {{ i18n.t(dragActive() ? 'upload.dropActive' : 'upload.dropTitle') }}
            </span>
            <span class="mt-1 block text-sm muted">{{ i18n.t('upload.dropHint') }}</span>
            <span class="btn mt-4 inline-flex">{{ i18n.t('upload.browse') }}</span>
            <span class="mt-3 block text-xs muted">{{ i18n.t('upload.formats') }}</span>
          </button>

          @if (error()) {
            <p class="text-sm" style="color: var(--danger);" role="alert" aria-live="polite">
              {{ error() }}
            </p>
          }

          <div class="rounded-xl p-5 surface">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-lg font-semibold">{{ i18n.t('upload.metadata') }}</h2>
                <p class="mt-1 text-xs muted">{{ i18n.t('upload.metadataHint') }}</p>
              </div>
              <span class="badge">{{ i18n.t('upload.required') }}</span>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <label class="block text-sm font-medium md:col-span-2">
                {{ i18n.t('upload.titleField') }} *
                <input class="input mt-1 w-full" name="title" [(ngModel)]="metadata.title" required />
              </label>

              <label class="block text-sm font-medium">
                {{ i18n.t('upload.author') }}
                <input class="input mt-1 w-full" name="author" [(ngModel)]="metadata.author" />
              </label>

              <label class="block text-sm font-medium">
                {{ i18n.t('upload.category') }}
                <input class="input mt-1 w-full" name="category" [(ngModel)]="metadata.category" />
              </label>

              <label class="block text-sm font-medium">
                {{ i18n.t('upload.version') }}
                <input class="input mt-1 w-full" name="version" [(ngModel)]="metadata.version" />
              </label>

              <label class="block text-sm font-medium">
                {{ i18n.t('upload.tags') }}
                <input class="input mt-1 w-full" name="tags" [(ngModel)]="metadata.tags" />
              </label>

              <label class="block text-sm font-medium md:col-span-2">
                {{ i18n.t('upload.description') }}
                <textarea
                  class="input mt-1 w-full"
                  name="description"
                  rows="3"
                  [(ngModel)]="metadata.description"
                ></textarea>
              </label>
            </div>
          </div>
        </div>

        <aside>
          <div class="rounded-xl p-5 surface lg:sticky lg:top-6">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-lg font-semibold">{{ i18n.t('upload.queue') }}</h2>
                <p class="mt-1 text-xs muted">
                  {{ queue().length }} / {{ maxFiles }} {{ i18n.t('upload.files') }}
                </p>
              </div>
              @if (queue().length) {
                <button
                  type="button"
                  class="text-xs"
                  style="color: var(--muted); background: none; border: 0; cursor: pointer;"
                  [disabled]="loading()"
                  (click)="clearQueue()"
                >
                  {{ i18n.t('upload.clear') }}
                </button>
              }
            </div>

            @if (queue().length === 0) {
              <div class="mt-5 py-8 text-center">
                <p class="text-sm font-medium">{{ i18n.t('upload.empty') }}</p>
                <p class="mt-1 text-xs muted">{{ i18n.t('upload.emptyHint') }}</p>
              </div>
            } @else {
              <div class="mt-4 max-h-[55vh] space-y-3 overflow-auto pr-1">
                @for (item of queue(); track $index; let i = $index) {
                  <article
                    class="rounded-lg border p-3"
                    [style.border-color]="item.status === 'ERROR' ? 'var(--danger)' : 'var(--border)'"
                  >
                    <div class="flex items-start gap-3">
                      <span class="file-type">{{ fileExtension(item.file.name) }}</span>

                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium" [title]="item.file.name">
                          {{ item.file.name }}
                        </p>
                        <p class="mt-0.5 text-xs muted">
                          {{ formatSize(item.file.size) }} · {{ fileKind(item.file.name) }}
                        </p>
                      </div>

                      <span
                        class="badge"
                        [class.badge-ok]="item.status === 'INDEXED'"
                        [class.badge-error]="item.status === 'ERROR'"
                        [class.badge-warn]="item.status !== 'INDEXED' && item.status !== 'ERROR'"
                      >
                        {{ statusLabel(item.status) }}
                      </span>
                    </div>

                    @if (item.status !== 'PENDING') {
                      <div class="mt-3 flex items-center gap-2">
                        <div
                          class="h-1.5 flex-1 overflow-hidden rounded"
                          style="background: var(--surface-muted);"
                        >
                          <div
                            class="h-full rounded"
                            [style.background]="item.status === 'ERROR' ? 'var(--danger)' : 'var(--accent)'"
                            [style.width.%]="item.progress"
                          ></div>
                        </div>
                        <span class="text-xs muted">{{ item.progress }}%</span>
                      </div>
                    }

                    @if (item.error) {
                      <p class="mt-2 text-xs" style="color: var(--danger);">{{ item.error }}</p>
                    }

                    @if (item.status === 'ERROR' || canRemove(item)) {
                      <div class="mt-2 flex justify-end gap-2">
                        @if (item.status === 'ERROR') {
                          <button type="button" class="btn text-xs" (click)="retry(i)">
                            {{ i18n.t('upload.retry') }}
                          </button>
                        }
                        @if (canRemove(item)) {
                          <button
                            type="button"
                            class="text-xs"
                            style="color: var(--muted); background: none; border: 0; cursor: pointer;"
                            (click)="removeFile(i)"
                          >
                            {{ i18n.t('upload.remove') }}
                          </button>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            }

            <div class="mt-4 border-t pt-4" style="border-color: var(--border);">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs muted">
                <span>
                  {{ i18n.t('upload.summary') }}: {{ indexedCount() }} {{ i18n.t('upload.indexed') }} ·
                  {{ failedCount() }} {{ i18n.t('upload.failed') }} · {{ pendingCount() }}
                  {{ i18n.t('upload.pending') }}
                </span>
                <span>{{ queue().length }} {{ i18n.t('upload.files') }}</span>
              </div>

              <button
                type="button"
                class="btn btn-primary w-full"
                [disabled]="loading() || !hasPendingFiles() || !metadata.title.trim()"
                (click)="start()"
              >
                {{ loading() ? i18n.t('upload.uploading') : i18n.t('upload.start') }}
              </button>
            </div>
          </div>
        </aside>
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

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const current = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget;
    if (current && related instanceof Node && current.contains(related)) return;
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
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

  canRemove(item: QueueItem): boolean {
    return item.status === 'PENDING' || item.status === 'ERROR';
  }

  hasPendingFiles(): boolean {
    return this.queue().some((item) => item.status === 'PENDING');
  }

  statusLabel(status: QueueStatus): string {
    if (status === 'PENDING') return this.i18n.lang() === 'es' ? 'Pendiente' : 'Pending';
    if (status === 'UPLOADING') return this.i18n.lang() === 'es' ? 'Subiendo' : 'Uploading';
    return this.i18n.t(`status.${status}`);
  }

  fileExtension(name: string): string {
    const extension = name.split('.').pop();
    return extension && extension !== name ? extension.toUpperCase().slice(0, 4) : 'FILE';
  }

  fileKind(name: string): string {
    const extension = name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') return this.i18n.t('upload.kindPdf');
    if (extension === 'md' || extension === 'markdown') return this.i18n.t('upload.kindMarkdown');
    if (extension === 'txt') return this.i18n.t('upload.kindText');
    if (extension === 'docx') return this.i18n.t('upload.kindWord');
    return this.i18n.t('upload.kindFile');
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
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

  private addFiles(files: File[]): void {
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
        this.metadata.title = items[0].file.name.replace(/\.[^.]+$/, '');
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
