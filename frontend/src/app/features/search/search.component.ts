import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import DOMPurify from 'dompurify';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import type { DocumentStatus, SearchFacets, SearchHit } from '@docs/shared';
import { ApiService, type DocumentDetail } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { DocumentIconComponent } from '../../shared/document/document-icon.component';
import { SearchResultsComponent } from './components/search-results.component';

const EMPTY_FACETS: SearchFacets = { categories: [], tags: [], authors: [] };
type ViewMode = 'list' | 'grid' | 'details';
type SortMode = 'relevance' | 'title' | 'date';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule, RouterLink, SearchResultsComponent, DocumentIconComponent],
  template: `
    <section class="space-y-5">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('search.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('search.subtitle') }}</p>
      </div>

      <div class="flex flex-col gap-2 rounded-xl p-3 surface sm:flex-row">
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

      <div class="grid gap-4 lg:grid-cols-12">
        <aside class="h-fit rounded-xl p-4 surface lg:sticky lg:top-6 lg:col-span-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold">{{ i18n.t('search.filters') }}</h2>
            <button
              type="button"
              class="text-xs"
              style="color: var(--accent); background: none; border: 0; cursor: pointer;"
              (click)="clearFilters()"
            >
              {{ i18n.t('search.clear') }}
            </button>
          </div>

          <div class="mt-5">
            <p class="text-xs font-semibold uppercase tracking-wide muted break-all">
              {{ i18n.t('search.category') }}
            </p>
            <div class="mt-2 space-y-2">
              @for (facet of facets().categories; track facet.value) {
                <label class="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    [checked]="category === facet.value"
                    (change)="toggleCategory(facet.value)"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ facet.value }}</span>
                  <span class="text-xs muted">{{ facet.count }}</span>
                </label>
              }
              @if (facets().categories.length === 0) {
                <p class="text-xs muted">{{ i18n.t('search.noFacets') }}</p>
              }
            </div>
          </div>

          <div class="mt-5">
            <label class="block text-xs font-semibold uppercase tracking-wide muted">
              {{ i18n.t('search.author') }}
              <input
                class="input mt-2 w-full"
                name="author"
                [(ngModel)]="author"
                (change)="run(1)"
              />
            </label>
          </div>

          <div class="mt-4">
            <label class="block text-xs font-semibold uppercase tracking-wide muted">
              {{ i18n.t('search.tags') }}
              <input
                class="input mt-2 w-full"
                name="tags"
                [(ngModel)]="tags"
                (change)="run(1)"
              />
            </label>
          </div>

          @if (error()) {
            <p class="mt-4 text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
          }
        </aside>

        <div class="min-w-0 rounded-xl surface lg:col-span-5">
          <div class="border-b p-4" style="border-color: var(--border);">
            @if (category || author || tags) {
              <div class="mb-3 flex flex-wrap gap-2">
                <span class="text-xs muted">{{ i18n.t('search.applied') }}:</span>
                @if (category) {
                  <button type="button" class="badge" (click)="clearCategory()">
                    {{ category }} ×
                  </button>
                }
                @if (author) {
                  <button type="button" class="badge" (click)="clearAuthor()">
                    {{ author }} ×
                  </button>
                }
                @if (tags) {
                  <button type="button" class="badge" (click)="clearTags()">
                    {{ tags }} ×
                  </button>
                }
              </div>
            }

            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm">
                  <span class="font-semibold">{{ total() }}</span>
                  {{ resultsLabel() }}
                  @if (query) {
                    <span class="muted"> {{ i18n.t('search.for') }} «{{ query }}»</span>
                  }
                </p>
                @if (responseTime() !== null) {
                  <p class="mt-0.5 text-xs muted">
                    {{ i18n.t('search.responded') }} {{ responseTime()!.toFixed(2) }} s
                  </p>
                }
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1 text-xs muted">
                  {{ i18n.t('search.sort') }}
                  <select
                    class="input py-1 text-xs"
                    [ngModel]="sortMode"
                    (ngModelChange)="onSortChange($event)"
                  >
                    <option value="relevance">{{ i18n.t('search.sortRelevance') }}</option>
                    <option value="title">{{ i18n.t('search.sortTitle') }}</option>
                    <option value="date">{{ i18n.t('search.sortDate') }}</option>
                  </select>
                </label>

                <label class="flex items-center gap-1 text-xs muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  {{ i18n.t('search.view') }}
                  <select
                    class="input py-1 text-xs"
                    [ngModel]="viewMode"
                    (ngModelChange)="onViewChange($event)"
                  >
                    <option value="list">{{ i18n.t('search.viewList') }}</option>
                    <option value="grid">{{ i18n.t('search.viewIcons') }}</option>
                    <option value="details">{{ i18n.t('search.viewDetails') }}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <app-search-results
            [results]="results()"
            [loading]="loading()"
            [viewMode]="viewMode"
            [selectedId]="selected()?.id ?? null"
            (hitSelected)="selectHit($event)"
          />

          @if (!loading() && results().length > 0) {
            <div class="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs muted" style="border-color: var(--border);">
              <span>
                {{ i18n.t('search.showing') }} {{ showingStart() }}–{{ showingEnd() }}
                {{ i18n.t('search.of') }} {{ total() }}
              </span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="btn px-2 py-1"
                  [disabled]="page() <= 1"
                  (click)="goPage(page() - 1)"
                >
                  ‹
                </button>
                @for (item of pageNumbers(); track $index) {
                  @if (item === 'ellipsis') {
                    <span class="px-1">…</span>
                  } @else {
                    <button
                      type="button"
                      class="btn px-2 py-1"
                      [class.btn-primary]="page() === item"
                      (click)="goPage(item)"
                    >
                      {{ item }}
                    </button>
                  }
                }
                <button
                  type="button"
                  class="btn px-2 py-1"
                  [disabled]="page() >= totalPages()"
                  (click)="goPage(page() + 1)"
                >
                  ›
                </button>
              </div>
            </div>

            <div class="border-t px-3 py-2 text-xs muted" style="border-color: var(--border);">
              {{ results().length }} {{ elementsLabel() }}
              @if (selected(); as hit) {
                · 1 {{ i18n.t('search.selected') }}: {{ hit.title }}
              }
            </div>
          }
        </div>

        <aside class="min-w-0 lg:col-span-4">
          <div class="rounded-xl p-5 surface lg:sticky lg:top-6">
            @if (selected(); as hit) {
              <div class="flex flex-col items-center text-center">
                <app-document-icon
                  size="xl"
                  [mime]="hit.mime"
                  [title]="hit.title"
                  [filename]="hit.originalFilename"
                />
                <h2 class="mt-4 break-words text-lg font-semibold">
                  {{ detail()?.title ?? hit.title }}
                </h2>
                @if (statusLabel(detail()?.status ?? hit.status); as status) {
                  <span class="badge mt-2" [class.badge-ok]="(detail()?.status ?? hit.status) === 'INDEXED'">
                    {{ status }}
                  </span>
                }
              </div>

              <div class="mt-4 flex gap-2">
                <a
                  class="btn btn-primary flex-1 text-center"
                  [routerLink]="['/documents', hit.id]"
                  [queryParams]="query ? { q: query } : {}"
                >
                  {{ i18n.t('search.openViewer') }}
                </a>
                <a
                  class="btn flex-1 text-center"
                  [href]="contentUrl(hit)"
                  [attr.download]="downloadName(hit)"
                >
                  {{ i18n.t('search.download') }}
                </a>
              </div>

              @if (previewLoading()) {
                <p class="mt-4 text-sm muted">{{ i18n.t('search.previewLoading') }}</p>
              } @else {
                <dl class="mt-5 space-y-2 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.author') }}</dt>
                    <dd class="text-right">{{ detail()?.author ?? hit.author ?? '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.category') }}</dt>
                    <dd class="text-right">{{ detail()?.category ?? hit.category ?? '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.version') }}</dt>
                    <dd>{{ detail()?.version ?? hit.version ?? '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.type') }}</dt>
                    <dd>{{ typeLabel(hit) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.size') }}</dt>
                    <dd>{{ formatSize(detail()?.size ?? hit.size) }}</dd>
                  </div>
                  @if (pageCount() !== null) {
                    <div class="flex justify-between gap-4">
                      <dt class="muted">{{ i18n.t('search.pages') }}</dt>
                      <dd>
                        {{ pageCount() }}
                        {{ pageCount() === 1 ? i18n.t('search.pageSingular') : i18n.t('search.pagesUnit') }}
                      </dd>
                    </div>
                  }
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.uploaded') }}</dt>
                    <dd>{{ formatDate(detail()?.createdAt ?? hit.createdAt) }}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="muted">{{ i18n.t('search.tracking') }}</dt>
                    <dd class="break-all text-right text-xs">{{ detail()?.trackingId ?? hit.id }}</dd>
                  </div>
                </dl>

                @if ((detail()?.tags ?? hit.tags).length) {
                  <div class="mt-4">
                    <p class="text-xs font-semibold uppercase tracking-wide muted">
                      {{ i18n.t('search.tags') }}
                    </p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      @for (tag of (detail()?.tags ?? hit.tags); track tag) {
                        <span class="badge">{{ tag }}</span>
                      }
                    </div>
                  </div>
                }

                @if (snippet(hit)) {
                  <div class="mt-4 border-t pt-3" style="border-color: var(--border);">
                    <p class="text-xs font-semibold uppercase tracking-wide muted">
                      {{ i18n.t('search.match') }}
                    </p>
                    <p class="mt-2 text-sm leading-6 break-all" [innerHTML]="safeSnippet(hit)"></p>
                  </div>
                }
              }
            } @else {
              <div class="py-10 text-center">
                <span class="doc-icon doc-icon-xl doc-icon-empty">DOC</span>
                <p class="mt-4 text-sm font-medium">{{ i18n.t('search.preview') }}</p>
                <p class="mt-1 text-xs muted">{{ i18n.t('search.previewEmpty') }}</p>
              </div>
            }
          </div>
        </aside>
      </div>
    </section>
  `,
})
export class SearchComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchTerms = new Subject<string>();
  readonly i18n = inject(I18nService);

  query = '';
  category = '';
  author = '';
  tags = '';
  sortMode: SortMode = 'relevance';
  viewMode: ViewMode = 'list';
  readonly pageSize = 12;

  readonly results = signal<SearchHit[]>([]);
  readonly facets = signal<SearchFacets>(EMPTY_FACETS);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly responseTime = signal<number | null>(null);
  readonly selected = signal<SearchHit | null>(null);
  readonly detail = signal<DocumentDetail | null>(null);
  readonly previewLoading = signal(false);
  readonly pageCount = signal<number | null>(null);

  constructor() {
    this.searchTerms
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.run(1));
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.query = params.get('q') ?? '';
    this.category = params.get('category') ?? '';
    this.author = params.get('author') ?? '';
    this.tags = params.get('tags') ?? '';

    const view = params.get('view');
    if (view === 'list' || view === 'grid' || view === 'details') this.viewMode = view;
    const sort = params.get('sort');
    if (sort === 'relevance' || sort === 'title' || sort === 'date') this.sortMode = sort;

    const initialPage = Number(params.get('page') ?? 1);
    if (this.query.trim()) {
      void this.run(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1, false);
    }
  }

  onQueryInput(value: string): void {
    this.query = value;
    if (value.trim().length >= 2) {
      this.searchTerms.next(value.trim());
    }
  }

  async run(page = 1, syncUrl = true): Promise<void> {
    if (!this.query.trim()) return;

    this.loading.set(true);
    this.error.set('');
    const started = performance.now();
    try {
      const response = await this.api.search({
        q: this.query.trim(),
        page,
        pageSize: this.pageSize,
        category: this.category || undefined,
        author: this.author || undefined,
        tags: this.tags ? this.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
        sort: this.sortMode,
      });
      this.results.set(response.items);
      this.facets.set(response.facets);
      this.total.set(response.total);
      this.page.set(response.page);
      this.responseTime.set((performance.now() - started) / 1000);
      this.ensureSelection();
      if (syncUrl) this.syncUrl();
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo completar la búsqueda.'));
    } finally {
      this.loading.set(false);
    }
  }

  selectHit(hit: SearchHit): void {
    this.selected.set(hit);
    this.detail.set(null);
    this.pageCount.set(null);
    this.previewLoading.set(true);

    void this.api
      .getDocument(hit.id)
      .then((detail) => {
        if (this.selected()?.id === hit.id) {
          this.detail.set(detail);
          if (detail.mime.includes('pdf')) void this.loadPageCount(hit);
        }
      })
      .catch(() => {
        // El preview cae a los datos del hit si falla el detalle.
      })
      .finally(() => {
        if (this.selected()?.id === hit.id) this.previewLoading.set(false);
      });
  }

  toggleCategory(value: string): void {
    this.category = this.category === value ? '' : value;
    void this.run(1);
  }

  clearCategory(): void {
    this.category = '';
    void this.run(1);
  }

  clearAuthor(): void {
    this.author = '';
    void this.run(1);
  }

  clearTags(): void {
    this.tags = '';
    void this.run(1);
  }

  clearFilters(): void {
    this.category = '';
    this.author = '';
    this.tags = '';
    void this.run(1);
  }

  onSortChange(value: string): void {
    this.sortMode = value as SortMode;
    void this.run(1);
  }

  onViewChange(value: string): void {
    this.viewMode = value as ViewMode;
    this.syncUrl();
  }

  goPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    void this.run(page);
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize));
  }

  showingStart(): number {
    return this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1;
  }

  showingEnd(): number {
    return Math.min(this.page() * this.pageSize, this.total());
  }

  pageNumbers(): Array<number | 'ellipsis'> {
    const total = this.totalPages();
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

    const current = this.page();
    const pages = new Set<number>([1, total, current, current - 1, current + 1]);
    if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
    if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));

    const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const output: Array<number | 'ellipsis'> = [];
    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) output.push('ellipsis');
      output.push(page);
    });
    return output;
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

  resultsLabel(): string {
    return this.total() === 1 ? this.i18n.t('search.resultSingular') : this.i18n.t('search.results');
  }

  elementsLabel(): string {
    return this.results().length === 1
      ? this.i18n.t('search.elementSingular')
      : this.i18n.t('search.elements');
  }

  typeLabel(hit: SearchHit): string {
    const mime = this.detail()?.mime ?? hit.mime ?? '';
    const name = hit.originalFilename || hit.title;
    const extension = (name.split('.').pop() ?? '').toLowerCase();
    if (mime.includes('pdf') || extension === 'pdf') return 'PDF';
    if (mime.includes('markdown') || extension === 'md' || extension === 'markdown') return 'Markdown';
    if (mime.includes('wordprocessingml') || extension === 'docx') return 'Word';
    return 'Texto';
  }

  formatSize(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '—';
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

  statusLabel(status?: DocumentStatus): string {
    return status ? this.i18n.t(`status.${status}`) : '—';
  }

  contentUrl(hit: SearchHit): string {
    return this.detail()?.contentUrl ?? `/api/documents/${hit.id}/content`;
  }

  downloadName(hit: SearchHit): string {
    return this.detail()?.originalFilename ?? hit.originalFilename ?? hit.title;
  }

  private async loadPageCount(hit: SearchHit): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs?v=20261028';
      const task = pdfjs.getDocument({
        url: this.contentUrl(hit),
        withCredentials: true,
      });
      const pdf = await task.promise;
      if (this.selected()?.id === hit.id) this.pageCount.set(pdf.numPages);
      await pdf.destroy();
    } catch {
      // El conteo de páginas es opcional; el preview conserva el resto de metadatos.
    }
  }

  private ensureSelection(): void {
    const items = this.results();
    if (!items.length) {
      this.selected.set(null);
      this.detail.set(null);
      return;
    }

    const current = this.selected();
    const next = (current && items.find((hit) => hit.id === current.id)) || items[0];
    if (next) this.selectHit(next);
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.query.trim() || null,
        category: this.category || null,
        author: this.author || null,
        tags: this.tags || null,
        page: this.page() > 1 ? this.page() : null,
        sort: this.sortMode !== 'relevance' ? this.sortMode : null,
        view: this.viewMode !== 'list' ? this.viewMode : null,
      },
      replaceUrl: true,
    });
  }
}
