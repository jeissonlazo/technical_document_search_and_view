import { Component, inject, input, output } from '@angular/core';
import type { DocumentStatus, SearchHit } from '@docs/shared';
import { I18nService } from '../../../core/i18n.service';
import { DocumentIconComponent } from '../../../shared/document/document-icon.component';

export type SearchViewMode = 'list' | 'grid' | 'details';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [DocumentIconComponent],
  template: `
    @if (loading()) {
      <div class="space-y-2 p-4">
        @for (item of skeletons; track item) {
          <div class="h-16 animate-pulse rounded-lg" style="background: var(--surface-muted);"></div>
        }
      </div>
    } @else if (results().length === 0) {
      <div class="p-8 text-center">
        <p class="muted">{{ i18n.t('search.empty') }}</p>
      </div>
    } @else {
      <div class="p-3">
        @if (viewMode() === 'list') {
          <div class="grid gap-2 sm:grid-cols-2">
            @for (hit of results(); track hit.id) {
              <button
                type="button"
                class="result-card"
                [class.result-selected]="selectedId() === hit.id"
                (click)="hitSelected.emit(hit)"
              >
                <app-document-icon
                  [mime]="hit.mime"
                  [title]="hit.title"
                  [filename]="hit.originalFilename"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ hit.title }}</span>
                  <span class="mt-0.5 block truncate text-xs muted">
                    {{ hit.author || categoryLabel(hit) || hit.originalFilename || '—' }}
                  </span>
                </span>
              </button>
            }
          </div>
        } @else if (viewMode() === 'grid') {
          <div class="grid gap-3 sm:grid-cols-2">
            @for (hit of results(); track hit.id) {
              <button
                type="button"
                class="result-card result-card-grid"
                [class.result-selected]="selectedId() === hit.id"
                (click)="hitSelected.emit(hit)"
              >
                <app-document-icon
                  size="lg"
                  [mime]="hit.mime"
                  [title]="hit.title"
                  [filename]="hit.originalFilename"
                />
                <span class="mt-2 block w-full truncate text-sm font-medium">{{ hit.title }}</span>
                <span class="mt-1 block w-full truncate text-xs muted">
                  {{ hit.author || categoryLabel(hit) || '—' }}
                </span>
                <span class="mt-2 flex w-full items-center justify-between gap-2">
                  <span class="text-xs muted">{{ typeLabel(hit) }}</span>
                  @if (hit.status) {
                    <span class="badge">{{ statusLabel(hit.status) }}</span>
                  }
                </span>
              </button>
            }
          </div>
        } @else {
          <div class="divide-y" style="border-color: var(--border);">
            @for (hit of results(); track hit.id) {
              <button
                type="button"
                class="result-row"
                [class.result-selected]="selectedId() === hit.id"
                (click)="hitSelected.emit(hit)"
              >
                <app-document-icon
                  [mime]="hit.mime"
                  [title]="hit.title"
                  [filename]="hit.originalFilename"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ hit.title }}</span>
                  <span class="mt-0.5 block truncate text-xs muted">
                    {{ hit.author || '—' }} · {{ categoryLabel(hit) }} · v{{ hit.version || '—' }}
                  </span>
                </span>
                <span class="text-xs muted">{{ formatDate(hit.createdAt) }}</span>
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class SearchResultsComponent {
  readonly i18n = inject(I18nService);
  protected readonly skeletons = [1, 2, 3, 4, 5];

  readonly results = input.required<SearchHit[]>();
  readonly loading = input(false);
  readonly viewMode = input<SearchViewMode>('list');
  readonly selectedId = input<string | null>(null);
  readonly hitSelected = output<SearchHit>();

  statusLabel(status: DocumentStatus): string {
    return this.i18n.t(`status.${status}`);
  }

  typeLabel(hit: SearchHit): string {
    const mime = hit.mime ?? '';
    const extension = this.extension(hit).toLowerCase();
    if (mime.includes('pdf') || extension === 'pdf') return 'PDF';
    if (mime.includes('markdown') || extension === 'md' || extension === 'markdown') return 'Markdown';
    if (mime.includes('wordprocessingml') || extension === 'docx') return 'Word';
    return 'Texto';
  }

  categoryLabel(hit: SearchHit): string {
    if (hit.categories?.length) return hit.categories.join(', ');
    return hit.category || '—';
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

  private extension(hit: SearchHit): string {
    const name = hit.originalFilename || hit.title;
    const extension = name.split('.').pop();
    return extension && extension !== name ? extension.toUpperCase().slice(0, 4) : '';
  }
}
