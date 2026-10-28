import { Component, computed, inject, input, output } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmProgress, HlmProgressIndicator } from '@spartan-ng/helm/progress';
import { I18nService } from '../../../core/i18n.service';
import { DocumentIconComponent } from '../../../shared/document/document-icon.component';
import { DocumentStatusBadgeComponent } from '../../../shared/document/document-status-badge.component';
import type { QueueItem } from '../upload.models';

@Component({
  selector: 'app-upload-queue',
  standalone: true,
  imports: [
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
          <div class="max-h-[55vh] space-y-3 overflow-auto pr-1">
            @for (item of queue(); track $index; let i = $index) {
              <article
                class="rounded-lg border p-3"
                [style.border-color]="item.status === 'ERROR' ? 'var(--danger)' : 'var(--border)'"
              >
                <div class="flex items-start gap-3">
                  <app-document-icon
                    size="sm"
                    [title]="item.file.name"
                    [filename]="item.file.name"
                  />

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium" [title]="item.file.name">
                      {{ item.file.name }}
                    </p>
                    <p class="mt-0.5 text-xs muted">
                      {{ formatSize(item.file.size) }} · {{ fileKind(item.file.name) }}
                    </p>
                  </div>

                  <app-document-status-badge [status]="item.status" />
                </div>

                @if (item.status !== 'PENDING') {
                  <div class="mt-3 flex items-center gap-2">
                    <div hlmProgress [value]="item.progress" [max]="100">
                      <div hlmProgressIndicator></div>
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
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="retry.emit(i)">
                        {{ i18n.t('upload.retry') }}
                      </button>
                    }
                    @if (canRemove(item)) {
                      <button hlmBtn variant="ghost" size="sm" type="button" (click)="remove.emit(i)">
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
  readonly loading = input(false);
  readonly canStart = input(false);

  readonly clear = output<void>();
  readonly retry = output<number>();
  readonly remove = output<number>();
  readonly start = output<void>();

  readonly indexedCount = computed(
    () => this.queue().filter((item) => item.status === 'INDEXED').length,
  );
  readonly failedCount = computed(
    () => this.queue().filter((item) => item.status === 'ERROR').length,
  );
  readonly pendingCount = computed(
    () =>
      this.queue().filter((item) =>
        ['PENDING', 'UPLOADING', 'RECEIVED', 'PROCESSING'].includes(item.status),
      ).length,
  );

  canRemove(item: QueueItem): boolean {
    return item.status === 'PENDING' || item.status === 'ERROR';
  }

  hasPending(): boolean {
    return this.queue().some((item) => item.status === 'PENDING');
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
