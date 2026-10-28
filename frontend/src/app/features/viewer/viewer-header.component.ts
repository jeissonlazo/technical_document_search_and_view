import { Component, computed, inject, input, output } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import type { DocumentDetail } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { DocumentStatusBadgeComponent } from '../../shared/document/document-status-badge.component';

@Component({
  selector: 'app-viewer-header',
  standalone: true,
  imports: [HlmButton, DocumentStatusBadgeComponent],
  template: `
    <div class="flex flex-wrap items-center gap-3">
      <button hlmBtn variant="ghost" size="sm" type="button" (click)="back.emit()">
        ← {{ i18n.t('viewer.back') }}
      </button>

      <h1 class="min-w-0 max-w-full truncate text-lg font-semibold">{{ document().title }}</h1>
      <app-document-status-badge [status]="document().status" />

      <div class="ml-auto flex flex-wrap items-center gap-2">
        @if (query()) {
          <div class="flex items-center gap-1 rounded-lg border px-2 py-1" style="border-color: var(--border);">
            <span class="text-xs muted">{{ i18n.t('viewer.matches') }} {{ matchLabel() }}</span>
            <button
              hlmBtn
              variant="ghost"
              size="icon-sm"
              type="button"
              [disabled]="matchCount() === 0"
              (click)="previousMatch.emit()"
              [attr.aria-label]="i18n.t('viewer.previousMatch')"
            >
              ↑
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="icon-sm"
              type="button"
              [disabled]="matchCount() === 0"
              (click)="nextMatch.emit()"
              [attr.aria-label]="i18n.t('viewer.nextMatch')"
            >
              ↓
            </button>
          </div>
        }
        <button hlmBtn variant="outline" size="sm" type="button" (click)="copyLink.emit()">
          {{ i18n.t('viewer.copyLink') }}
        </button>
        <a
          hlmBtn
          variant="outline"
          size="sm"
          [href]="document().contentUrl"
          [attr.download]="document().originalFilename ?? document().title"
        >
          {{ i18n.t('viewer.download') }}
        </a>
      </div>
    </div>
  `,
})
export class ViewerHeaderComponent {
  readonly i18n = inject(I18nService);

  readonly document = input.required<DocumentDetail>();
  readonly query = input('');
  readonly matchCount = input(0);
  readonly matchIndex = input(0);

  readonly back = output<void>();
  readonly copyLink = output<void>();
  readonly previousMatch = output<void>();
  readonly nextMatch = output<void>();

  readonly matchLabel = computed(() => {
    const total = this.matchCount();
    if (total === 0) return `0 ${this.i18n.t('viewer.of')} 0`;
    return `${this.matchIndex() + 1} ${this.i18n.t('viewer.of')} ${total}`;
  });
}
