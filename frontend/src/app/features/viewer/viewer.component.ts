import { Location } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { ApiService, type DocumentDetail } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { DocxViewerComponent } from './docx-viewer.component';
import {
  PdfViewerComponent,
  type PdfMatchInfo,
  type PdfMatchItem,
} from './pdf-viewer.component';
import { ViewerHeaderComponent } from './viewer-header.component';
import { ViewerMetadataComponent } from './viewer-metadata.component';
import { ViewerOutlineComponent } from './viewer-outline.component';
import type { ViewerFormat, ViewerTocItem } from './viewer.models';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [
    PdfViewerComponent,
    DocxViewerComponent,
    ViewerHeaderComponent,
    ViewerOutlineComponent,
    ViewerMetadataComponent,
    HlmButton,
    HlmCard,
  ],
  template: `
    <section class="space-y-4">
      @if (document(); as doc) {
        <app-viewer-header
          [document]="doc"
          [query]="query"
          [matchCount]="matchCount()"
          [matchIndex]="matchIndex()"
          (back)="goBack()"
          (copyLink)="copyLink()"
          (previousMatch)="previousMatch()"
          (nextMatch)="nextMatch()"
        />
      } @else {
        <button hlmBtn variant="ghost" size="sm" type="button" (click)="goBack()">
          ← {{ i18n.t('viewer.back') }}
        </button>
      }

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
            <app-viewer-outline
              [toc]="toc()"
              [matches]="pdfMatches()"
              [matchIndex]="matchIndex()"
              [query]="query"
              [showMatches]="format(doc) === 'pdf'"
              (sectionSelected)="scrollToSection($event)"
              (matchSelected)="goToPdfMatch($event)"
            />

            <div hlmCard class="min-w-0">
              @if (format(doc) === 'pdf') {
                <app-pdf-viewer
                  #pdfViewer
                  [src]="doc.contentUrl"
                  [query]="query"
                  (matchesChange)="onPdfMatches($event)"
                  (matchesListChange)="onPdfMatchList($event)"
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
                  <button hlmBtn variant="outline" size="sm" type="button" (click)="copyText()">
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

            <app-viewer-metadata [document]="doc" [pageCount]="pageCount()" />
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
  readonly toc = signal<ViewerTocItem[]>([]);
  readonly matchCount = signal(0);
  readonly matchIndex = signal(0);
  readonly pageCount = signal<number | null>(null);
  readonly pdfMatches = signal<PdfMatchItem[]>([]);

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

  format(doc: DocumentDetail): ViewerFormat {
    if (doc.mime.includes('pdf')) return 'pdf';
    if (doc.mime.includes('wordprocessingml')) return 'docx';
    if (doc.mime.includes('markdown')) return 'markdown';
    return 'text';
  }

  onPdfMatches(info: PdfMatchInfo): void {
    this.matchCount.set(info.total);
    this.matchIndex.set(Math.max(0, info.current - 1));
  }

  onPdfMatchList(matches: PdfMatchItem[]): void {
    this.pdfMatches.set(matches);
  }

  goToPdfMatch(index: number): void {
    this.pdfViewer?.goToMatchIndex(index);
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

  private formatOfCurrent(): ViewerFormat | null {
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

  private buildToc(container: HTMLElement): ViewerTocItem[] {
    const sections: ViewerTocItem[] = [];
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
