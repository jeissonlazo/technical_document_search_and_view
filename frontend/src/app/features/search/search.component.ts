import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import DOMPurify from 'dompurify';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import type { SearchFacets, SearchHit } from '@docs/shared';
import { ApiService } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';

const EMPTY_FACETS: SearchFacets = { categories: [], tags: [], authors: [] };

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('search.title') }}</h1>
        <p class="mt-1 text-sm muted">Búsqueda de texto completo con filtros y fragmentos resaltados.</p>
      </div>

      <div class="rounded-xl p-5 surface">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            class="input"
            type="search"
            name="q"
            [placeholder]="i18n.t('search.placeholder')"
            [(ngModel)]="query"
            (ngModelChange)="onQueryInput($event)"
            (keyup.enter)="run(1)"
          />
          <button type="button" class="btn btn-primary" (click)="run(1)">
            {{ i18n.t('search.action') }}
          </button>
        </div>

        <details class="mt-4" open>
          <summary class="cursor-pointer text-sm font-semibold">{{ i18n.t('search.filters') }}</summary>
          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <label class="block text-sm font-medium">
              {{ i18n.t('search.category') }}
              <select class="input mt-1" name="category" [(ngModel)]="category" (change)="run(1)">
                <option value="">Todas</option>
                @for (facet of facets().categories; track facet.value) {
                  <option [value]="facet.value">{{ facet.value }} ({{ facet.count }})</option>
                }
              </select>
            </label>
            <label class="block text-sm font-medium">
              {{ i18n.t('search.author') }}
              <input class="input mt-1" name="author" [(ngModel)]="author" (change)="run(1)" />
            </label>
            <label class="block text-sm font-medium">
              {{ i18n.t('search.tags') }}
              <input class="input mt-1" name="tags" [(ngModel)]="tags" (change)="run(1)" />
            </label>
          </div>
        </details>

        @if (error()) {
          <p class="mt-3 text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
        }
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm muted">{{ total() }} {{ i18n.t('search.results') }}</p>
        <button type="button" class="btn" (click)="clearFilters()">Limpiar filtros</button>
      </div>

      @if (loading()) {
        <div class="space-y-2">
          @for (item of skeletons; track item) {
            <div class="h-24 animate-pulse rounded-xl" style="background: var(--surface-muted);"></div>
          }
        </div>
      } @else if (results().length === 0) {
        <div class="rounded-xl p-8 text-center surface">
          <p class="muted">{{ i18n.t('search.empty') }}</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (hit of results(); track hit.id) {
            <article class="rounded-xl p-5 surface">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <h2 class="text-lg font-semibold">
                  <a [routerLink]="['/documents', hit.id]">{{ hit.title }}</a>
                </h2>
                @if (hit.score !== null) {
                  <span class="badge">score {{ hit.score.toFixed(2) }}</span>
                }
              </div>

              <p class="mt-1 text-xs muted">
                @if (hit.category) { <span>{{ hit.category }}</span> }
                @if (hit.author) { <span> · {{ hit.author }}</span> }
                @if (hit.version) { <span> · v{{ hit.version }}</span> }
                @if (hit.tags.length) { <span> · {{ hit.tags.join(', ') }}</span> }
              </p>

              @if (snippet(hit)) {
                <p class="mt-3 text-sm leading-6" [innerHTML]="safeSnippet(hit)"></p>
              }
            </article>
          }
        </div>

        <div class="flex items-center justify-center gap-3">
          <button type="button" class="btn" [disabled]="page() <= 1" (click)="goPage(page() - 1)">
            {{ i18n.t('search.previous') }}
          </button>
          <span class="text-sm muted">{{ page() }} / {{ totalPages() }}</span>
          <button
            type="button"
            class="btn"
            [disabled]="page() >= totalPages()"
            (click)="goPage(page() + 1)"
          >
            {{ i18n.t('search.next') }}
          </button>
        </div>
      }
    </section>
  `,
})
export class SearchComponent {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly searchTerms = new Subject<string>();
  readonly i18n = inject(I18nService);

  query = '';
  category = '';
  author = '';
  tags = '';
  readonly skeletons = [1, 2, 3];

  readonly results = signal<SearchHit[]>([]);
  readonly facets = signal<SearchFacets>(EMPTY_FACETS);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.searchTerms
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.run(1));
  }

  onQueryInput(value: string): void {
    this.query = value;
    if (value.trim().length >= 2) {
      this.searchTerms.next(value.trim());
    }
  }

  async run(page = 1): Promise<void> {
    if (!this.query.trim()) return;

    this.loading.set(true);
    this.error.set('');
    try {
      const response = await this.api.search({
        q: this.query.trim(),
        page,
        pageSize: 20,
        category: this.category || undefined,
        author: this.author || undefined,
        tags: this.tags ? this.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
        sort: 'relevance',
      });
      this.results.set(response.items);
      this.facets.set(response.facets);
      this.total.set(response.total);
      this.page.set(response.page);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo completar la búsqueda.'));
    } finally {
      this.loading.set(false);
    }
  }

  goPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    void this.run(page);
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / 20));
  }

  clearFilters(): void {
    this.category = '';
    this.author = '';
    this.tags = '';
    void this.run(1);
  }

  snippet(hit: SearchHit): string {
    return hit.highlight.content?.[0] ?? hit.highlight.title?.[0] ?? hit.description ?? '';
  }

  safeSnippet(hit: SearchHit): SafeHtml {
    const clean = DOMPurify.sanitize(this.snippet(hit), {
      ALLOWED_TAGS: ['em', 'mark', 'b', 'strong', 'br'],
      ALLOWED_ATTR: [],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
