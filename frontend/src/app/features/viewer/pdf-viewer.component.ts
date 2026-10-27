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
        <span class="text-sm">{{ page() }} / {{ pages() }}</span>
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
        <canvas #canvas class="mx-auto block"></canvas>
      </div>
    </div>
  `,
})
export class PdfViewerComponent implements AfterViewInit {
  @Input({ required: true }) src!: string;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

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
  }
}
