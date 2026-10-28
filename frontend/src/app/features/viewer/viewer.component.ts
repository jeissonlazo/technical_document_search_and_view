import { Location } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ApiService, type DocumentDetail } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { DocxViewerComponent } from './docx-viewer.component';
import { PdfViewerComponent, type PdfMatchInfo } from './pdf-viewer.component';

interface TocItem {
  id: string;
  label: string;
  level: number;
}

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [PdfViewerComponent, DocxViewerComponent],
  template: `
    <section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="text-sm"
          style="background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0;"
          (click)="goBack()"
        >
          ← {{ i18n.t('viewer.back') }}
        </button>

        @if (document(); as doc) {
          <h1 class="min-w-0 max-w-full truncate text-lg font-semibold">{{ doc.title }}</h1>
          <span
            class="badge"
            [class.badge-ok]="doc.status === 'INDEXED'"
            [class.badge-error]="doc.status === 'ERROR'"
          >
            {{ i18n.t('status.' + doc.status) }}
          </span>

          <div class="ml-auto flex flex-wrap items-center gap-2">
            @if (query) {
              <div class="flex items-center gap-1 rounded-lg border px-2 py-1" style="border-color: var(--border);">
                <span class="text-xs muted">
                  {{ i18n.t('viewer.matches') }} {{ matchLabel() }}
                </span>
                <button
                  type="button"
                  class="px-1"
                  style="background: none; border: 0; color: var(--fg); cursor: pointer;"
                  [disabled]="matchCount() === 0"
                  (click)="previousMatch()"
                  [attr.aria-label]="i18n.t('viewer.previousMatch')"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="px-1"
                  style="background: none; border: 0; color: var(--fg); cursor: pointer;"
                  [disabled]="matchCount() === 0"
                  (click)="nextMatch()"
                  [attr.aria-label]="i18n.t('viewer.nextMatch')"
                >
                  ↓
                </button>
              </div>
            }
            <button type="button" class="btn" (click)="copyLink()">
              {{ i18n.t('viewer.copyLink') }}
            </button>
            <a
              class="btn"
              [href]="doc.contentUrl"
              [attr.download]="doc.originalFilename ?? doc.title"
            >
              {{ i18n.t('viewer.download') }}
            </a>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="rounded-xl p-8 text-center surface">
          <p class="muted">{{ i18n.t('viewer.loading') }}</p>
        </div>
      } @else if (error()) {
        <div class="rounded-xl p-8 surface">
          <p style="color: var(--danger);" role="alert">{{ error() }}</p>
        </div>
      } @else {
        @if (document(); as doc) {
          <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,7fr)_minmax(0,3fr)]">
            <aside class="h-fit rounded-xl p-4 surface lg:sticky lg:top-6">
              <h2 class="text-xs font-semibold uppercase tracking-wide muted">
                {{ i18n.t('viewer.contents') }}
              </h2>
              <nav class="mt-3 max-h-[70vh] space-y-1 overflow-auto">
                @for (section of toc(); track section.id) {
                  <button
                    type="button"
                    class="block w-full rounded px-2 py-1.5 text-left text-sm"
                    [style.padding-left.rem]="0.5 + section.level * 0.5"
                    (click)="scrollToSection(section.id)"
                  >
                    {{ section.label }}
                  </button>
                }
                @if (toc().length === 0) {
                  <p class="text-xs muted">{{ i18n.t('viewer.fullDocument') }}</p>
                }
              </nav>
            </aside>

            <div class="min-w-0 rounded-xl p-4 surface">
              @if (format(doc) === 'pdf') {
                <app-pdf-viewer
                  #pdfViewer
                  [src]="doc.contentUrl"
                  [query]="query"
                  (matchesChange)="onPdfMatches($event)"
                  (pageCountChange)="onPageCount($event)"
                />
              } @else if (format(doc) === 'docx') {
                <app-docx-viewer [src]="doc.contentUrl" />
              } @else if (format(doc) === 'markdown') {
                <article
                  #content
                  class="markdown-body max-w-none px-2 py-1"
                  [innerHTML]="markdownHtml()"
                ></article>
              } @else {
                <div class="mb-2 flex justify-end">
                  <button type="button" class="btn" (click)="copyText()">
                    {{ i18n.t('viewer.copy') }}
                  </button>
                </div>
                <pre
                  #content
                  id="text-content"
                  class="max-h-[75vh] overflow-auto whitespace-pre-wrap p-2 text-sm"
                  [innerHTML]="textHtml()"
                ></pre>
              }
            </div>

            <aside class="h-fit rounded-xl p-4 surface lg:sticky lg:top-6">
              <h2 class="text-xs font-semibold uppercase tracking-wide muted">
                {{ i18n.t('viewer.metadata') }}
              </h2>
              <dl class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.author') }}</dt>
                  <dd class="text-right">{{ doc.author || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.category') }}</dt>
                  <dd class="text-right">{{ doc.category || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.version') }}</dt>
                  <dd>{{ doc.version || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.type') }}</dt>
                  <dd>{{ typeLabel(doc) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.size') }}</dt>
                  <dd>{{ formatSize(doc.size) }}</dd>
                </div>
                @if (pageCount() !== null) {
                  <div class="flex justify-between gap-3">
                    <dt class="muted">{{ i18n.t('viewer.pages') }}</dt>
                    <dd>{{ pageCount() }}</dd>
                  </div>
                }
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.uploaded') }}</dt>
                  <dd>{{ formatDate(doc.createdAt) }}</dd>
                </div>
                @if (doc.indexedAt) {
                  <div class="flex justify-between gap-3">
                    <dt class="muted">{{ i18n.t('viewer.indexed') }}</dt>
                    <dd>{{ formatDate(doc.indexedAt) }}</dd>
                  </div>
                }
                <div class="flex justify-between gap-3">
                  <dt class="muted">{{ i18n.t('viewer.tracking') }}</dt>
                  <dd class="break-all text-right text-xs">{{ doc.trackingId }}</dd>
                </div>
              </dl>

              @if (doc.tags.length) {
                <div class="mt-4">
                  <p class="text-xs font-semibold uppercase tracking-wide muted">
                    {{ i18n.t('viewer.tags') }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    @for (tag of doc.tags; track tag) {
                      <span class="badge">{{ tag }}</span>
                    }
                  </div>
                </div>
              }

              @if (doc.description) {
                <div class="mt-4 border-t pt-3" style="border-color: var(--border);">
                  <p class="text-xs font-semibold uppercase tracking-wide muted">
                    {{ i18n.t('viewer.description') }}
                  </p>
                  <p class="mt-1 text-sm">{{ doc.description }}</p>
                </div>
              }

              @if (doc.status === 'ERROR' && doc.errorMessage) {
                <p class="mt-3 text-sm" style="color: var(--danger);">{{ doc.errorMessage }}</p>
              }
            </aside>
          </div>
        }
      }
    </section>
  `,
})
export class ViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly i18n = inject(I18nService);

  @ViewChild('pdfViewer') private pdfViewer?: PdfViewerComponent;
  @ViewChild('content') private contentRef?: ElementRef<HTMLElement>;

  readonly document = signal<DocumentDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly markdownHtml = signal<SafeHtml | null>(null);
  readonly textHtml = signal<SafeHtml | null>(null);
  readonly toc = signal<TocItem[]>([]);
  readonly matchCount = signal(0);
  readonly matchIndex = signal(0);
  readonly pageCount = signal<number | null>(null);

  query = '';

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Documento no encontrado.');
      this.loading.set(false);
      return;
    }

    this.query = (this.route.snapshot.queryParamMap.get('q') ?? '').trim();

    try {
      const doc = await this.api.getDocument(id);
      this.document.set(doc);

      if (this.format(doc) === 'markdown') {
        const source = (await this.api.getText(id)).replace(/^\uFEFF/, '');
        await this.renderMarkdown(source);
      } else if (this.format(doc) === 'text') {
        this.renderText((await this.api.getText(id)).replace(/^\uFEFF/, ''));
      }
    } catch (error) {
      this.error.set(apiErrorMessage(error, this.i18n.t('viewer.error')));
    } finally {
      this.loading.set(false);
    }
  }

  format(doc: DocumentDetail): 'pdf' | 'docx' | 'markdown' | 'text' {
    if (doc.mime.includes('pdf')) return 'pdf';
    if (doc.mime.includes('wordprocessingml')) return 'docx';
    if (doc.mime.includes('markdown')) return 'markdown';
    return 'text';
  }

  matchLabel(): string {
    if (this.matchCount() === 0) return `0 ${this.i18n.t('viewer.of')} 0`;
    return `${this.matchIndex() + 1} ${this.i18n.t('viewer.of')} ${this.matchCount()}`;
  }

  onPdfMatches(info: PdfMatchInfo): void {
    this.matchCount.set(info.total);
    this.matchIndex.set(Math.max(0, info.current - 1));
  }

  onPageCount(count: number): void {
    this.pageCount.set(count);
  }

  previousMatch(): void {
    if (this.formatOfCurrent() === 'pdf') {
      void this.pdfViewer?.previousMatch();
      return;
    }
    this.moveMatch(-1);
  }

  nextMatch(): void {
    if (this.formatOfCurrent() === 'pdf') {
      void this.pdfViewer?.nextMatch();
      return;
    }
    this.moveMatch(1);
  }

  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // El navegador puede bloquear el portapapeles.
    }
  }

  async copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.contentRef?.nativeElement.textContent ?? '');
    } catch {
      // El navegador puede bloquear el portapapeles.
    }
  }

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/search']);
    }
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

  typeLabel(doc: DocumentDetail): string {
    const format = this.format(doc);
    if (format === 'pdf') return 'PDF';
    if (format === 'markdown') return 'Markdown';
    if (format === 'docx') return 'Word';
    return 'Texto';
  }

  private formatOfCurrent(): 'pdf' | 'docx' | 'markdown' | 'text' | null {
    const doc = this.document();
    return doc ? this.format(doc) : null;
  }

  private async renderMarkdown(source: string): Promise<void> {
    const html = await marked.parse(source);
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'a', 'p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
      ],
      ALLOWED_ATTR: ['href', 'title'],
    });

    const container = document.createElement('div');
    container.innerHTML = clean;
    const sections = this.buildToc(container);
    const count = this.highlightContainer(container, this.query);
    const finalHtml = DOMPurify.sanitize(container.innerHTML, {
      ALLOWED_TAGS: [
        'a', 'p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'mark',
      ],
      ALLOWED_ATTR: ['href', 'title', 'id', 'class'],
    });

    this.toc.set(sections);
    this.matchCount.set(count);
    this.matchIndex.set(0);
    this.markdownHtml.set(this.sanitizer.bypassSecurityTrustHtml(finalHtml));
    setTimeout(() => this.focusCurrentMatch(), 0);
  }

  private renderText(source: string): void {
    const container = document.createElement('div');
    container.textContent = source;
    const count = this.highlightContainer(container, this.query);
    const finalHtml = DOMPurify.sanitize(container.innerHTML, {
      ALLOWED_TAGS: ['mark'],
      ALLOWED_ATTR: ['class'],
    });

    this.toc.set([]);
    this.matchCount.set(count);
    this.matchIndex.set(0);
    this.textHtml.set(this.sanitizer.bypassSecurityTrustHtml(finalHtml));
    setTimeout(() => this.focusCurrentMatch(), 0);
  }

  private buildToc(container: HTMLElement): TocItem[] {
    const sections: TocItem[] = [];
    const headings = Array.from(container.querySelectorAll('h1, h2, h3'));

    headings.forEach((heading, index) => {
      const id = `section-${index}`;
      heading.id = id;
      sections.push({
        id,
        label: heading.textContent?.trim() || `Sección ${index + 1}`,
        level: Number(heading.tagName.slice(1)) - 1,
      });
    });

    return sections;
  }

  private highlightContainer(container: HTMLElement, query: string): number {
    const needle = query.trim();
    if (!needle) return 0;

    const regex = new RegExp(escapeRegExp(needle), 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    let count = 0;
    for (const node of nodes) {
      const text = node.nodeValue ?? '';
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
      regex.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = match[0];
        fragment.appendChild(mark);
        count += 1;
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.parentNode?.replaceChild(fragment, node);
    }

    return count;
  }

  private focusCurrentMatch(): void {
    const marks = this.contentRef?.nativeElement.querySelectorAll<HTMLElement>('mark.search-hit');
    if (!marks?.length) return;
    this.focusMark(Math.min(this.matchIndex(), marks.length - 1), marks);
  }

  private moveMatch(delta: number): void {
    const marks = this.contentRef?.nativeElement.querySelectorAll<HTMLElement>('mark.search-hit');
    if (!marks?.length) return;
    const next = (this.matchIndex() + delta + marks.length) % marks.length;
    this.focusMark(next, marks);
  }

  private focusMark(index: number, marks: NodeListOf<HTMLElement>): void {
    marks.forEach((mark, current) => {
      mark.classList.toggle('search-hit-current', current === index);
    });
    this.matchIndex.set(index);
    marks[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
