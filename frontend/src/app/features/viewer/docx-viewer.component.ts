import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-docx-viewer',
  standalone: true,
  template: `
    <div class="space-y-2">
      @if (loading()) {
        <p class="text-sm muted">Cargando DOCX…</p>
      }
      @if (error()) {
        <p class="text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
      }
      <div #container class="max-h-[75vh] overflow-auto rounded-lg" style="background: var(--surface-muted);"></div>
    </div>
  `,
})
export class DocxViewerComponent implements AfterViewInit {
  @Input({ required: true }) src!: string;
  @ViewChild('container') containerRef!: ElementRef<HTMLElement>;

  private readonly http = inject(HttpClient);
  readonly loading = signal(true);
  readonly error = signal('');

  async ngAfterViewInit(): Promise<void> {
    try {
      const buffer = await firstValueFrom(
        this.http.get(this.src, { responseType: 'arraybuffer' }),
      );
      const docx = await import('docx-preview');
      await docx.renderAsync(buffer, this.containerRef.nativeElement, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
      } as any);
    } catch {
      this.error.set('No se pudo mostrar el documento Word.');
    } finally {
      this.loading.set(false);
    }
  }
}
