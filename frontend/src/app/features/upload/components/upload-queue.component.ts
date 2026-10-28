import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmProgress, HlmProgressIndicator } from '@spartan-ng/helm/progress';
import type { UploadMetadata } from '../../../core/api.service';
import { I18nService } from '../../../core/i18n.service';
import { DocumentIconComponent } from '../../../shared/document/document-icon.component';
import { DocumentStatusBadgeComponent } from '../../../shared/document/document-status-badge.component';
import { UploadFileMetadataComponent } from './upload-file-metadata.component';
import type { FileMetadata, QueueFilter, QueueItem } from '../upload.models';

interface IndexedQueueItem {
  item: QueueItem;
  index: number;
}

@Component({
  selector: 'app-upload-queue',
  standalone: true,
  imports: [
    HlmBadge,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmCardDescription,
    HlmCardHeader,
    HlmCardTitle,
    HlmProgress,
    HlmProgressIndicator,
    DocumentIconComponent,
    DocumentStatusBadgeComponent,
    UploadFileMetadataComponent,
  ],
  template: `
    <div hlmCard class="lg:sticky lg:top-6">
      <div hlmCardHeader class="flex flex-row items-start justify-between gap-2">
        <div>
          <h2 hlmCardTitle>{{ i18n.t('upload.queue') }}</h2>
          <p hlmCardDescription class="mt-1 text-xs">
            {{ queue().length }} / 20 {{ i18n.t('upload.files') }}
          </p>
        </div>
        @if (queue().length) {
          <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="loading()" (click)="clear.emit()">
            {{ i18n.t('upload.clear') }}
          </button>
        }
      </div>

      <div hlmCardContent>
        @if (queue().length === 0) {
          <div class="py-8 text-center">
            <p class="text-sm font-medium">{{ i18n.t('upload.empty') }}</p>
            <p class="mt-1 text-xs muted">{{ i18n.t('upload.emptyHint') }}</p>
          </div>
        } @else {
          @if (failedCount() > 0) {
            <div class="mb-3 rounded-lg border p-3 text-sm" style="border-color: var(--danger); color: var(--danger);">
              {{ failedCount() }} {{ i18n.t('upload.failedBanner') }}
            </div>
          }

          <div class="mb-3 flex flex-wrap gap-2">
            <button hlmBtn [variant]="filter() === 'all' ? 'default' : 'outline'" size="sm" type="button" (click)="filter.set('all')">
              {{ i18n.t('upload.filterAll') }} {{ queue().length }}
            </button>
            <button hlmBtn [variant]="filter() === 'error' ? 'default' : 'outline'" size="sm" type="button" (click)="filter.set('error')">
              {{ i18n.t('upload.filterError') }} {{ failedCount() }}
            </button>
            <button hlmBtn [variant]="filter() === 'active' ? 'default' : 'outline'" size="sm" type="button" (click)="filter.set('active')">
              {{ i18n.t('upload.filterActive') }} {{ activeCount() }}
            </button>
            <button hlmBtn [variant]="filter() === 'missing' ? 'default' : 'outline'" size="sm" type="button" (click)="filter.set('missing')">
              {{ i18n.t('upload.filterMissing') }} {{ missingCount() }}
            </button>
          </div>

          <div class="max-h-[55vh] space-y-3 overflow-auto pr-1">
            @for (entry of filteredItems(); track entry.item.idempotencyKey) {
              <article
                class="rounded-lg border p-3"
                [style.border-color]="entry.item.status === 'ERROR' ? 'var(--danger)' : 'var(--border)'"
              >
                <div class="flex items-start gap-3">
                  <app-document-icon
                    size="sm"
                    [title]="entry.item.file.name"
                    [filename]="entry.item.file.name"
                  />

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium" [title]="entry.item.file.name">
                      {{ entry.item.metadata.title || entry.item.file.name }}
                    </p>
                    <p class="mt-0.5 text-xs muted">
                      {{ formatSize(entry.item.file.size) }} · {{ fileKind(entry.item.file.name) }}
                    </p>
                    <span
                      hlmBadge
                      variant="outline"
                      class="mt-1"
                      [class.badge-ok]="metadataState(entry.item) === 'own'"
                      [class.badge-warn]="metadataState(entry.item) === 'shared'"
                      [class.badge-error]="metadataState(entry.item) === 'missing'"
                    >
                      {{ metadataLabel(entry.item) }}
                    </span>
                  </div>

                  <app-document-status-badge [status]="entry.item.status" />
                </div>

                @if (entry.item.status !== 'PENDING') {
                  <div class="mt-3 flex items-center gap-2">
                    <div hlmProgress [value]="entry.item.progress" [max]="100">
                      <div hlmProgressIndicator></div>
                    </div>
                    <span class="text-xs muted">{{ entry.item.progress }}%</span>
                  </div>
                }

                @if (entry.item.error) {
                  <p class="mt-2 text-xs" style="color: var(--danger);">{{ entry.item.error }}</p>
                }

                <div class="mt-2 flex flex-wrap justify-end gap-2">
                  @if (entry.item.status === 'PENDING' || entry.item.status === 'ERROR') {
                    <button hlmBtn variant="outline" size="sm" type="button" (click)="toggleMetadata(entry.index)">
                      {{ i18n.t('upload.metadataAction') }}
                    </button>
                  }
                  @if (entry.item.status === 'ERROR') {
                    <button hlmBtn variant="outline" size="sm" type="button" (click)="retry.emit(entry.index)">
                      {{ i18n.t('upload.retry') }}
                    </button>
                  }
                  @if (canRemove(entry.item)) {
                    <button hlmBtn variant="ghost" size="sm" type="button" (click)="remove.emit(entry.index)">
                      {{ i18n.t('upload.remove') }}
                    </button>
                  }
                </div>

                @if (expandedIndex() === entry.index) {
                  <app-upload-file-metadata
                    [filename]="entry.item.file.name"
                    [metadata]="entry.item.metadata"
                    [sharedMetadata]="sharedMetadata()"
                    (metadataChange)="fileMetadataChange.emit({ index: entry.index, metadata: $event })"
                    (closed)="expandedIndex.set(null)"
                  />
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
            hlmBtn
            class="w-full"
            type="button"
            [disabled]="loading() || !hasPending() || !canStart()"
            (click)="start.emit()"
          >
            {{ loading() ? i18n.t('upload.uploading') : i18n.t('upload.start') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class UploadQueueComponent {
  readonly i18n = inject(I18nService);

  readonly queue = input.required<QueueItem[]>();
  readonly sharedMetadata = input.required<UploadMetadata>();
  readonly loading = input(false);
  readonly canStart = input(false);

  readonly clear = output<void>();
  readonly retry = output<number>();
  readonly remove = output<number>();
  readonly start = output<void>();
  readonly fileMetadataChange = output<{ index: number; metadata: FileMetadata }>();

  readonly filter = signal<QueueFilter>('all');
  readonly expandedIndex = signal<number | null>(null);

  readonly filteredItems = computed<IndexedQueueItem[]>(() => {
    const entries = this.queue().map((item, index) => ({ item, index }));
    switch (this.filter()) {
      case 'error':
        return entries.filter((entry) => entry.item.status === 'ERROR');
      case 'active':
        return entries.filter((entry) => entry.item.status !== 'ERROR');
      case 'missing':
        return entries.filter((entry) => !this.isComplete(entry.item));
      default:
        return entries;
    }
  });

  readonly indexedCount = computed(
    () => this.queue().filter((item) => item.status === 'INDEXED').length,
  );
  readonly failedCount = computed(
    () => this.queue().filter((item) => item.status === 'ERROR').length,
  );
  readonly activeCount = computed(
    () => this.queue().filter((item) => item.status !== 'ERROR').length,
  );
  readonly pendingCount = computed(
    () =>
      this.queue().filter((item) =>
        ['PENDING', 'UPLOADING', 'RECEIVED', 'PROCESSING'].includes(item.status),
      ).length,
  );
  readonly missingCount = computed(
    () => this.queue().filter((item) => !this.isComplete(item)).length,
  );

  canRemove(item: QueueItem): boolean {
    return item.status === 'PENDING' || item.status === 'ERROR';
  }

  hasPending(): boolean {
    return this.queue().some((item) => item.status === 'PENDING');
  }

  toggleMetadata(index: number): void {
    this.expandedIndex.update((current) => (current === index ? null : index));
  }

  metadataState(item: QueueItem): 'shared' | 'own' | 'missing' {
    if (!this.isComplete(item)) return 'missing';
    return item.metadata.useShared ? 'shared' : 'own';
  }

  metadataLabel(item: QueueItem): string {
    const state = this.metadataState(item);
    if (state === 'missing') return this.i18n.t('upload.missingMetadata');
    return state === 'shared'
      ? this.i18n.t('upload.sharedMetadata')
      : this.i18n.t('upload.ownMetadata');
  }

  isComplete(item: QueueItem): boolean {
    const author = item.metadata.useShared
      ? (this.sharedMetadata().author ?? '')
      : item.metadata.author;
    return Boolean(item.metadata.title.trim() && author.trim());
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
}
