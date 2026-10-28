import { Component, inject, input } from '@angular/core';
import {
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmBadge } from '@spartan-ng/helm/badge';
import type { DocumentDetail } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-viewer-metadata',
  standalone: true,
  imports: [HlmCard, HlmCardContent, HlmCardHeader, HlmCardTitle, HlmBadge],
  template: `
    <aside hlmCard size="sm" class="h-fit lg:sticky lg:top-6">
      <div hlmCardHeader>
        <h2 hlmCardTitle class="text-xs font-semibold uppercase tracking-wide muted">
          {{ i18n.t('viewer.metadata') }}
        </h2>
      </div>

      <div hlmCardContent>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.author') }}</dt>
            <dd class="text-right">{{ document().author || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.category') }}</dt>
            <dd class="text-right">{{ document().category || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.version') }}</dt>
            <dd>{{ document().version || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.type') }}</dt>
            <dd>{{ typeLabel() }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.size') }}</dt>
            <dd>{{ formatSize(document().size) }}</dd>
          </div>
          @if (pageCount() !== null) {
            <div class="flex justify-between gap-3">
              <dt class="muted">{{ i18n.t('viewer.pages') }}</dt>
              <dd>{{ pageCount() }}</dd>
            </div>
          }
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.uploaded') }}</dt>
            <dd>{{ formatDate(document().createdAt) }}</dd>
          </div>
          @if (document().indexedAt) {
            <div class="flex justify-between gap-3">
              <dt class="muted">{{ i18n.t('viewer.indexed') }}</dt>
              <dd>{{ formatDate(document().indexedAt) }}</dd>
            </div>
          }
          <div class="flex justify-between gap-3">
            <dt class="muted">{{ i18n.t('viewer.tracking') }}</dt>
            <dd class="break-all text-right text-xs">{{ document().trackingId }}</dd>
          </div>
        </dl>

        @if (document().tags.length) {
          <div class="mt-4">
            <p class="text-xs font-semibold uppercase tracking-wide muted">
              {{ i18n.t('viewer.tags') }}
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              @for (tag of document().tags; track tag) {
                <span hlmBadge variant="secondary">{{ tag }}</span>
              }
            </div>
          </div>
        }

        @if (document().description) {
          <div class="mt-4 border-t pt-3" style="border-color: var(--border);">
            <p class="text-xs font-semibold uppercase tracking-wide muted">
              {{ i18n.t('viewer.description') }}
            </p>
            <p class="mt-1 text-sm">{{ document().description }}</p>
          </div>
        }

        @if (document().status === 'ERROR' && document().errorMessage) {
          <p class="mt-3 text-sm" style="color: var(--danger);">{{ document().errorMessage }}</p>
        }
      </div>
    </aside>
  `,
})
export class ViewerMetadataComponent {
  readonly i18n = inject(I18nService);

  readonly document = input.required<DocumentDetail>();
  readonly pageCount = input<number | null>(null);

  typeLabel(): string {
    const mime = this.document().mime;
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('markdown')) return 'Markdown';
    if (mime.includes('wordprocessingml')) return 'Word';
    return 'Texto';
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  formatDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(this.i18n.lang(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
