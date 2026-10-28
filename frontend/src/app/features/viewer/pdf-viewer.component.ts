import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
  signal,
} from '@angular/core';

interface PdfPageLike {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  streamTextContent: () => unknown;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}

interface PdfDocumentLike {
  numPages: number;
  getPage: (page: number) => Promise<PdfPageLike>;
}

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  template: `
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn" [disabled]="page() <= 1" (click)="previous()">←</button>
        <input
          class="input w-16 text-center"
          type="number"
          min="1"
          [max]="pages()"
          [value]="page()"
          (change)="goToPage($event)"
          aria-label="Página"
        />
        <span class="text-sm">/ {{ pages() }}</span>
        <button type="button" class="btn" [disabled]="page() >= pages()" (click)="next()">→</button>
        <button type="button" class="btn" (click)="zoomOut()">−</button>
        <span class="text-sm">{{ (scale() * 100).toFixed(0) }}%</span>
        <button type="button" class="btn" (click)="zoomIn()">+</button>
        @if (loading()) { <span class="text-sm muted">Cargando PDF…</span> }
      </div>

      @if (error()) {
        <p class="text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
      }

      <div class="overflow-auto rounded-lg" style="background: var(--surface-muted);">
        <div class="pdf-page">
          <canvas #canvas class="block"></canvas>
          <div #textLayer class="textLayer"></div>
        </div>
      </div>
    </div>
  `,
})
export class PdfViewerComponent implements AfterViewInit {
  @Input({ required: true }) src!: string;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('textLayer') textLayerRef!: ElementRef<HTMLDivElement>;

  readonly page = signal(1);
  readonly pages = signal(1);
  readonly scale = signal(1.2);
  readonly loading = signal(true);
  readonly error = signal('');

  private pdf: PdfDocumentLike | null = null;

  async ngAfterViewInit(): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
      const task = pdfjs.getDocument({ url: this.src, withCredentials: true } as any);
      this.pdf = (await task.promise) as unknown as PdfDocumentLike;
      this.pages.set(this.pdf?.numPages ?? 1);
      await this.render();
    } catch {
      this.error.set('No se pudo cargar el PDF.');
    } finally {
      this.loading.set(false);
    }
  }

  async previous(): Promise<void> {
    if (this.page() > 1) {
      this.page.update((value) => value - 1);
      await this.render();
    }
  }

  async next(): Promise<void> {
    if (this.page() < this.pages()) {
      this.page.update((value) => value + 1);
      await this.render();
    }
  }

  async goToPage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const requested = Number(input.value);
    if (!Number.isFinite(requested)) {
      input.value = String(this.page());
      return;
    }

    const nextPage = Math.min(this.pages(), Math.max(1, Math.trunc(requested)));
    this.page.set(nextPage);
    input.value = String(nextPage);
    await this.render();
  }

  async zoomIn(): Promise<void> {
    this.scale.update((value) => Math.min(2.5, value + 0.2));
    await this.render();
  }

  async zoomOut(): Promise<void> {
    this.scale.update((value) => Math.max(0.6, value - 0.2));
    await this.render();
  }

  private async render(): Promise<void> {
    if (!this.pdf) return;
    const page = await this.pdf.getPage(this.page());
    const viewport = page.getViewport({ scale: this.scale() });
    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;

    const textLayerElement = this.textLayerRef.nativeElement;
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
  }
}
