import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '../../core/i18n.service';

export interface PdfMatchInfo {
  current: number;
  total: number;
}

interface PdfPageLike {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  streamTextContent: () => unknown;
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}

interface PdfDocumentLike {
  numPages: number;
  getPage: (page: number) => Promise<PdfPageLike>;
}

export interface PdfMatchItem {
  page: number;
  excerpt: string;
}

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  template: `
    <div class="space-y-3">
      @if (error()) {
        <div class="rounded-lg border p-4" style="border-color: var(--danger);">
          <p class="text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
          <a class="btn mt-2 inline-flex" [href]="src" download>Descargar PDF</a>
        </div>
      }

      <div
        #scrollContainer
        class="pdf-scroll rounded-lg"
        (scroll)="onScroll()"
      >
        @for (pageNumber of pageNumbers(); track pageNumber) {
          <div class="pdf-page" [attr.data-page]="pageNumber">
            <canvas #canvas class="block"></canvas>
            <div #textLayer class="textLayer"></div>
          </div>
        }
        @if (loading()) {
          <p class="py-6 text-center text-sm muted">{{ i18n.t('viewer.loading') }}</p>
        }
      </div>

      <div class="flex flex-wrap items-center justify-center gap-2 border-t pt-3" style="border-color: var(--border);">
        <button type="button" class="btn px-2 py-1" [disabled]="page() <= 1" (click)="previous()">←</button>
        <input
          class="input text-center"
          style="width: 4.5rem;"
          type="number"
          min="1"
          [max]="pages()"
          [value]="page()"
          (change)="goToPage($event)"
          [attr.aria-label]="i18n.t('viewer.page')"
        />
        <span class="text-xs muted">/ {{ pages() }}</span>
        <button type="button" class="btn px-2 py-1" [disabled]="page() >= pages()" (click)="next()">→</button>
        <span class="mx-1 text-xs muted">|</span>
        <button type="button" class="btn px-2 py-1" (click)="zoomOut()">−</button>
        <span class="text-xs muted">{{ (scale() * 100).toFixed(0) }}%</span>
        <button type="button" class="btn px-2 py-1" (click)="zoomIn()">+</button>
      </div>
    </div>
  `,
})
export class PdfViewerComponent implements AfterViewInit, OnChanges {
  readonly i18n = inject(I18nService);

  @Input({ required: true }) src!: string;
  @Input() query = '';
  @Output() readonly matchesChange = new EventEmitter<PdfMatchInfo>();
  @Output() readonly matchesListChange = new EventEmitter<PdfMatchItem[]>();
  @Output() readonly pageCountChange = new EventEmitter<number>();
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChildren('canvas') private canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('textLayer') private textLayerRefs!: QueryList<ElementRef<HTMLDivElement>>;

  readonly page = signal(1);
  readonly pages = signal(1);
  readonly scale = signal(1.0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly matches = signal<PdfMatchItem[]>([]);
  readonly currentMatch = signal(0);

  private pdf: PdfDocumentLike | null = null;
  private matchPages: number[] = [];
  private rendering = false;

  async ngAfterViewInit(): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs?v=20261028';
      const task = pdfjs.getDocument({ url: this.src, withCredentials: true } as any);
      this.pdf = (await task.promise) as unknown as PdfDocumentLike;
      this.pages.set(this.pdf?.numPages ?? 1);
      this.pageCountChange.emit(this.pages());
      await this.fitInitialScale();
      await this.countMatches();
      await this.renderAllPages();
    } catch (error) {
      console.error('No se pudo cargar el PDF', error);
      this.error.set('No se pudo cargar el PDF. Verifica que el archivo siga disponible o descárgalo.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['query'] && !changes['query'].firstChange && this.pdf) {
      void this.refreshMatches();
    }
  }

  async next(): Promise<void> {
    if (this.page() < this.pages()) {
      this.scrollToPage(this.page() + 1);
    }
  }

  async previous(): Promise<void> {
    if (this.page() > 1) {
      this.scrollToPage(this.page() - 1);
    }
  }

  async goToPage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const requested = Number(input.value);
    if (!Number.isFinite(requested)) {
      input.value = String(this.page());
      return;
    }

    this.scrollToPage(requested);
  }

  async goToPageNumber(pageNumber: number): Promise<void> {
    if (!Number.isFinite(pageNumber)) return;
    this.scrollToPage(pageNumber);
  }

  async nextMatch(): Promise<void> {
    if (this.matches().length === 0) return;
    const next = this.currentMatch() >= this.matches().length ? 1 : this.currentMatch() + 1;
    this.goToMatchIndex(next - 1);
  }

  async previousMatch(): Promise<void> {
    if (this.matches().length === 0) return;
    const previous = this.currentMatch() <= 1 ? this.matches().length : this.currentMatch() - 1;
    this.goToMatchIndex(previous - 1);
  }

  async zoomIn(): Promise<void> {
    this.scale.update((value) => Math.min(2.5, value + 0.2));
    await this.renderAllPages();
  }

  async zoomOut(): Promise<void> {
    this.scale.update((value) => Math.max(0.6, value - 0.2));
    await this.renderAllPages();
  }

  onScroll(): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const pages = Array.from(container.querySelectorAll<HTMLElement>('.pdf-page'));
    let current = 1;
    for (let index = 0; index < pages.length; index += 1) {
      if (pages[index].offsetTop - container.scrollTop <= 24) current = index + 1;
    }
    if (current !== this.page()) this.page.set(current);
  }

  goToMatchIndex(index: number): void {
    const match = this.matches()[index];
    if (!match) return;

    this.currentMatch.set(index + 1);
    this.scrollToPage(match.page);
    this.emitMatches();

    // Marca visualmente la coincidencia actual de la página.
    setTimeout(() => {
      const pageElement = this.pageElement(match.page);
      const hits = pageElement?.querySelectorAll<HTMLElement>('.pdf-hit');
      hits?.forEach((hit) => hit.classList.remove('pdf-hit-current'));
      hits?.[0]?.classList.add('pdf-hit-current');
    }, 250);
  }

  pageNumbers(): number[] {
    return Array.from({ length: this.pages() }, (_, index) => index + 1);
  }

  private async fitInitialScale(): Promise<void> {
    if (!this.pdf) return;

    const containerWidth = this.scrollContainer?.nativeElement?.clientWidth ?? 0;
    if (!containerWidth) return;

    const firstPage = await this.pdf.getPage(1);
    const baseWidth = firstPage.getViewport({ scale: 1 }).width;
    const availableWidth = Math.max(240, containerWidth - 32);
    const fitScale = Math.min(1.2, Math.max(0.55, availableWidth / baseWidth));
    this.scale.set(Number(fitScale.toFixed(2)));
  }

  private async refreshMatches(): Promise<void> {
    await this.countMatches();
    await this.renderAllPages();
  }

  private async countMatches(): Promise<void> {
    this.matches.set([]);
    this.matchPages = [];
    this.currentMatch.set(0);
    const needle = this.query.trim();

    if (needle && this.pdf) {
      const matchItems: PdfMatchItem[] = [];
      const lowerNeedle = needle.toLowerCase();

      for (let pageNumber = 1; pageNumber <= this.pages(); pageNumber += 1) {
        const page = await this.pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const lowerText = text.toLowerCase();
        let index = 0;

        while ((index = lowerText.indexOf(lowerNeedle, index)) !== -1) {
          this.matchPages.push(pageNumber);
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + needle.length + 70);
          const excerpt =
            `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
          matchItems.push({ page: pageNumber, excerpt });
          index += Math.max(1, needle.length);
        }
      }

      this.matches.set(matchItems);
      this.currentMatch.set(matchItems.length ? 1 : 0);
    }

    this.matchesListChange.emit(this.matches());
    this.emitMatches();
  }

  private emitMatches(): void {
    this.matchesChange.emit({
      current: this.currentMatch(),
      total: this.matches().length,
    });
  }

  private scrollToPage(pageNumber: number): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const target = Math.min(this.pages(), Math.max(1, Math.trunc(pageNumber)));
    const pageElement = this.pageElement(target);
    if (pageElement) {
      container.scrollTo({ top: pageElement.offsetTop - 8, behavior: 'smooth' });
    }
    this.page.set(target);
  }

  private pageElement(pageNumber: number): HTMLElement | null {
    return (
      this.scrollContainer?.nativeElement.querySelector<HTMLElement>(
        `.pdf-page[data-page="${pageNumber}"]`,
      ) ?? null
    );
  }

  private async renderAllPages(): Promise<void> {
    if (!this.pdf || this.rendering) return;
    this.rendering = true;
    try {
      // Espera a que Angular materialice los canvas del @for.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const canvases = this.canvasRefs.toArray();
      const textLayers = this.textLayerRefs.toArray();

      for (let index = 0; index < this.pages(); index += 1) {
        const pageNumber = index + 1;
        const page = await this.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: this.scale() });
        const canvas = canvases[index]?.nativeElement;
        const textLayerElement = textLayers[index]?.nativeElement;
        if (!canvas || !textLayerElement) continue;

        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;

        textLayerElement.innerHTML = '';
        textLayerElement.style.width = `${viewport.width}px`;
        textLayerElement.style.height = `${viewport.height}px`;
        textLayerElement.style.setProperty('--scale-factor', String(this.scale()));

        const pdfjs = await import('pdfjs-dist');
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent() as never,
          container: textLayerElement,
          viewport: viewport as never,
        });
        await textLayer.render();
        this.highlightTextLayer(textLayerElement);
      }
    } finally {
      this.rendering = false;
    }
  }

  private highlightTextLayer(textLayerElement: HTMLDivElement): void {
    const needle = this.query.trim().toLowerCase();
    if (!needle) return;

    textLayerElement.querySelectorAll<HTMLSpanElement>('span').forEach((span) => {
      if ((span.textContent ?? '').toLowerCase().includes(needle)) {
        span.classList.add('pdf-hit');
      }
    });
  }
}
