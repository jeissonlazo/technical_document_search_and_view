import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ApiService, type DocumentDetail } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { DocxViewerComponent } from './docx-viewer.component';
import { PdfViewerComponent } from './pdf-viewer.component';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [RouterLink, PdfViewerComponent, DocxViewerComponent],
  template: `
    <section class="space-y-4">
      <a routerLink="/search" class="text-sm">← {{ i18n.t('viewer.back') }}</a>

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
        <header class="rounded-xl p-5 surface">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-2xl font-bold">{{ doc.title }}</h1>
              <p class="mt-1 text-sm muted">
                {{ doc.mime }} · {{ (doc.size / 1024).toFixed(0) }} KB ·
                {{ doc.createdAt }}
              </p>
            </div>
            <span
              class="badge"
              [class.badge-ok]="doc.status === 'INDEXED'"
              [class.badge-error]="doc.status === 'ERROR'"
            >
              {{ i18n.t('status.' + doc.status) }}
            </span>
          </div>

          <details class="mt-4">
            <summary class="cursor-pointer text-sm font-semibold">{{ i18n.t('viewer.metadata') }}</summary>
            <dl class="mt-3 grid gap-2 text-sm md:grid-cols-2">
              @if (doc.description) {
                <div class="md:col-span-2">
                  <dt class="muted">Descripción</dt>
                  <dd>{{ doc.description }}</dd>
                </div>
              }
              @if (doc.author) {
                <div><dt class="muted">Autor</dt><dd>{{ doc.author }}</dd></div>
              }
              @if (doc.category) {
                <div><dt class="muted">Categoría</dt><dd>{{ doc.category }}</dd></div>
              }
              @if (doc.version) {
                <div><dt class="muted">Versión</dt><dd>{{ doc.version }}</dd></div>
              }
              @if (doc.tags.length) {
                <div><dt class="muted">Etiquetas</dt><dd>{{ doc.tags.join(', ') }}</dd></div>
              }
              <div><dt class="muted">SHA-256</dt><dd class="break-all text-xs">{{ doc.checksum }}</dd></div>
            </dl>
          </details>

          @if (doc.status === 'ERROR' && doc.errorMessage) {
            <p class="mt-3 text-sm" style="color: var(--danger);">{{ doc.errorMessage }}</p>
          }
        </header>

        <div class="rounded-xl p-3 surface">
          @if (format(doc) === 'pdf') {
            <app-pdf-viewer [src]="doc.contentUrl" />
          } @else if (format(doc) === 'docx') {
            <app-docx-viewer [src]="doc.contentUrl" />
          } @else if (format(doc) === 'markdown') {
            <article class="prose max-w-none p-4" [innerHTML]="markdownHtml()"></article>
          } @else {
            <pre class="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 text-sm">{{ text() }}</pre>
          }
        </div>
        }
      }
    </section>
  `,
})
export class ViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly i18n = inject(I18nService);

  readonly document = signal<DocumentDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly markdownHtml = signal<SafeHtml | null>(null);
  readonly text = signal('');

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Documento no encontrado.');
      this.loading.set(false);
      return;
    }

    try {
      const doc = await this.api.getDocument(id);
      this.document.set(doc);

      if (this.format(doc) === 'markdown') {
        const source = await this.api.getText(id);
        const html = await marked.parse(source);
        const clean = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'a', 'p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4',
            'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
          ],
          ALLOWED_ATTR: ['href', 'title'],
        });
        this.markdownHtml.set(this.sanitizer.bypassSecurityTrustHtml(clean));
      } else if (this.format(doc) === 'text') {
        this.text.set(await this.api.getText(id));
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
}
