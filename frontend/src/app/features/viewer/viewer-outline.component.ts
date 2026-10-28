import { Component, inject, input, output } from '@angular/core';
import {
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { I18nService } from '../../core/i18n.service';
import type { PdfMatchItem } from './pdf-viewer.component';
import type { ViewerTocItem } from './viewer.models';

@Component({
  selector: 'app-viewer-outline',
  standalone: true,
  imports: [HlmCard, HlmCardContent, HlmCardHeader, HlmCardTitle, HlmBadge, HlmButton],
  template: `
    <aside hlmCard size="sm" class="h-fit lg:sticky lg:top-6">
      <div hlmCardHeader>
        <h2 hlmCardTitle class="text-xs font-semibold uppercase tracking-wide muted">
          {{ i18n.t('viewer.contents') }}
        </h2>
      </div>

      <div hlmCardContent>
        <nav class="max-h-[40vh] space-y-1 overflow-auto">
          @for (section of toc(); track section.id) {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="h-auto w-full justify-start py-1.5 text-left text-sm"
              [style.padding-left.rem]="0.5 + section.level * 0.5"
              (click)="sectionSelected.emit(section.id)"
            >
              {{ section.label }}
            </button>
          }
          @if (toc().length === 0) {
            <p class="text-xs muted">{{ i18n.t('viewer.fullDocument') }}</p>
          }
        </nav>

        @if (showMatches() && query() && matches().length) {
          <div class="mt-4 border-t pt-3" style="border-color: var(--border);">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide muted">
                {{ i18n.t('viewer.matchesList') }}
              </h3>
              <span class="text-xs muted">{{ matches().length }}</span>
            </div>
            <div class="mt-2 max-h-[40vh] space-y-1 overflow-auto">
              @for (match of matches(); track $index; let index = $index) {
                <button
                  hlmBtn
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="h-auto w-full items-start justify-start gap-2 whitespace-normal py-1.5 text-left text-xs"
                  [style.background]="matchIndex() === index ? 'var(--surface-muted)' : 'transparent'"
                  (click)="matchSelected.emit(index)"
                >
                  <span hlmBadge variant="secondary" class="flex-none">
                    {{ i18n.t('viewer.page') }} {{ match.page }}
                  </span>
                  <span class="min-w-0">{{ match.excerpt }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </aside>
  `,
})
export class ViewerOutlineComponent {
  readonly i18n = inject(I18nService);

  readonly toc = input.required<ViewerTocItem[]>();
  readonly matches = input<PdfMatchItem[]>([]);
  readonly matchIndex = input(0);
  readonly query = input('');
  readonly showMatches = input(false);

  readonly sectionSelected = output<string>();
  readonly matchSelected = output<number>();
}
