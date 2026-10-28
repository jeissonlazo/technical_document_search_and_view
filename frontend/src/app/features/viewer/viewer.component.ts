import { Location } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
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
  imports: [PdfViewerComponent, DocxViewerComponent],
  template: `
    <section class="space-y-4">
      <button
        type="button"
        class="text-sm"
        style="background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0;"
        (click)="goBack()"
      >
        ← {{ i18n.t('viewer.back') }}
      </button>

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
                  <dt class="muted">{{ i18n.t('viewer.description') }}</dt>
                  <dd>{{ doc.description }}</dd>
                </div>
              }
              @if (doc.author) {
                <div><dt class="muted">{{ i18n.t('viewer.author') }}</dt><dd>{{ doc.author }}</dd></div>
              }
              @if (doc.category) {
                <div><dt class="muted">{{ i18n.t('viewer.category') }}</dt><dd>{{ doc.category }}</dd></div>
              }
              @if (doc.version) {
                <div><dt class="muted">{{ i18n.t('viewer.version') }}</dt><dd>{{ doc.version }}</dd></div>
              }
              @if (doc.tags.length) {
                <div><dt class="muted">{{ i18n.t('viewer.tags') }}</dt><dd>{{ doc.tags.join(', ') }}</dd></div>
              }
              <div><dt class="muted">{{ i18n.t('viewer.checksum') }}</dt><dd class="break-all text-xs">{{ doc.checksum }}</dd></div>
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
            <article class="markdown-body max-w-none p-4" [innerHTML]="markdownHtml()"></article>
          } @else {
            <div class="flex justify-end">
              <button type="button" class="btn" (click)="copyText()">
                {{ i18n.t('viewer.copy') }}
              </button>
            </div>
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
  private readonly router = inject(Router);
  private readonly location = inject(Location);
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
        const source = (await this.api.getText(id)).replace(/^\uFEFF/, '');
        const html = await marked.parse(source);
        const clean = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'a', 'p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
          ],
          ALLOWED_ATTR: ['href', 'title'],
        });
        this.markdownHtml.set(this.sanitizer.bypassSecurityTrustHtml(clean));
      } else if (this.format(doc) === 'text') {
        this.text.set((await this.api.getText(id)).replace(/^\uFEFF/, ''));
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

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/search']);
    }
  }

  async copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
    } catch {
      // El navegador puede bloquear el portapapeles.
    }
  }
}
