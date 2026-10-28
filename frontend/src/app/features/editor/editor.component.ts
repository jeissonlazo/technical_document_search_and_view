import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { SseService } from '../../core/sse.service';
import { EditorMetadataPanelComponent } from './components/editor-metadata-panel.component';
import { MarkdownEditorComponent } from './components/markdown-editor.component';
import {
  EMPTY_DRAFT_METADATA,
  draftStats,
  markdownFile,
  markdownFilename,
  toUploadMetadata,
  type DraftMetadata,
  type DraftStatus,
} from './editor.models';

/**
 * Pantalla de creación de documentos Markdown: el editor ocupa el área
 * principal y la ficha del documento acompaña a un costado. Al publicar, el
 * Markdown se envía como archivo `.md` por el mismo pipeline de carga.
 */
@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [MarkdownEditorComponent, EditorMetadataPanelComponent],
  template: `
    <section class="space-y-5">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('editor.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('editor.subtitle') }}</p>
      </div>

      <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <app-markdown-editor [(markdown)]="markdown" [stats]="stats()" />

        <app-editor-metadata-panel
          class="xl:sticky xl:top-6"
          [(metadata)]="metadata"
          [mode]="mode()"
          [status]="status()"
          [filename]="filename()"
          [busy]="busy()"
          [processing]="processing()"
          [dirty]="dirty()"
          [canSave]="canSave()"
          [documentId]="documentId()"
          [message]="error()"
          (save)="save()"
          (download)="download()"
          (newDraft)="newDraft()"
        />
      </div>
    </section>
  `,
})
export class EditorComponent {
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  readonly i18n = inject(I18nService);

  readonly markdown = signal('');
  readonly metadata = signal<DraftMetadata>({ ...EMPTY_DRAFT_METADATA });
  readonly status = signal<DraftStatus>('IDLE');
  readonly documentId = signal<string | null>(null);
  readonly error = signal('');

  readonly stats = computed(() => draftStats(this.markdown()));
  readonly filename = computed(() => markdownFilename(this.metadata().title));
  readonly busy = computed(() => this.status() === 'PUBLISHING');
  readonly processing = computed(() => this.status() === 'PROCESSING' || this.status() === 'RECEIVED');
  readonly mode = computed<'create' | 'update'>(() => (this.documentId() ? 'update' : 'create'));

  /** Huella del último contenido guardado: sirve para saber si hay cambios. */
  private readonly savedFingerprint = signal<string | null>(null);
  readonly dirty = computed(() => this.savedFingerprint() !== this.fingerprint());

  readonly canSave = computed(
    () =>
      this.metadata().title.trim().length > 0 &&
      this.markdown().trim().length > 0 &&
      !this.busy() &&
      !this.processing() &&
      // Un documento ya publicado solo se puede guardar si cambió algo.
      (this.mode() === 'create' || this.dirty()),
  );

  /** Estable entre reintentos para que el API no duplique el documento. */
  private publishKey = crypto.randomUUID();
  private sseWasConnected = false;

  constructor() {
    effect(() => {
      const connected = this.sse.connected();
      const event = this.sse.lastEvent();

      if (!connected) {
        this.sseWasConnected = false;
        return;
      }

      if (!this.sseWasConnected) {
        this.sseWasConnected = true;
        untracked(() => void this.reconcileStatus());
      }

      if (!event || event.documentId !== this.documentId()) return;

      untracked(() => {
        this.status.set(event.status);
        if (event.status === 'ERROR') {
          this.error.set(event.message ?? this.i18n.t('editor.processFailed'));
        }
      });
    });
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;

    const previousStatus = this.status();
    const documentId = this.documentId();
    const file = markdownFile(this.markdown(), this.metadata().title);
    const metadata = toUploadMetadata(this.metadata());

    this.error.set('');
    this.status.set('PUBLISHING');

    try {
      const document = documentId
        ? await this.api.updateDocument(documentId, file, metadata)
        : await this.api.uploadDocument(file, metadata, undefined, this.publishKey);

      this.documentId.set(document.id);
      this.status.set(document.status);
      this.savedFingerprint.set(this.fingerprint());
      // El siguiente documento necesita una clave distinta.
      if (!documentId) this.publishKey = crypto.randomUUID();
    } catch (error) {
      const status = httpStatus(error);

      if (status === 404 && documentId) {
        this.forgetDocument();
        this.error.set(this.i18n.t('editor.missingDocument'));
        return;
      }

      // Si el backend responde que sigue procesando, el estado local estaba
      // desactualizado: se refleja el estado real en lugar del anterior.
      this.status.set(status === 409 ? 'PROCESSING' : previousStatus);

      this.error.set(
        apiErrorMessage(
          error,
          this.i18n.t(documentId ? 'editor.updateFailed' : 'editor.publishFailed'),
        ),
      );
    }
  }

  download(): void {
    const markdown = this.markdown();
    if (!markdown.trim()) return;

    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = markdownFilename(this.metadata().title);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  newDraft(): void {
    if (this.busy()) return;

    const hasContent = this.markdown().trim().length > 0 || this.metadata().title.trim().length > 0;
    if (hasContent && !window.confirm(this.i18n.t('editor.confirmNew'))) return;

    this.markdown.set('');
    this.metadata.set({ ...EMPTY_DRAFT_METADATA, categories: [] });
    this.forgetDocument();
    this.error.set('');
  }

  /** Vuelve al modo borrador: el próximo guardado crea un documento. */
  private forgetDocument(): void {
    this.documentId.set(null);
    this.status.set('IDLE');
    this.savedFingerprint.set(null);
    this.publishKey = crypto.randomUUID();
  }

  private fingerprint(): string {
    const metadata = this.metadata();
    return JSON.stringify([
      this.markdown(),
      metadata.title,
      metadata.description,
      metadata.author,
      metadata.version,
      metadata.tags,
      metadata.categories,
    ]);
  }

  /** EventSource reconecta pero no reproduce eventos perdidos. */
  private async reconcileStatus(): Promise<void> {
    const id = this.documentId();
    if (!id) return;

    const status = this.status();
    if (status === 'INDEXED' || status === 'ERROR') return;

    try {
      const document = await this.api.getDocument(id);
      this.status.set(document.status);
      if (document.status === 'ERROR') {
        this.error.set(document.errorMessage ?? this.i18n.t('editor.processFailed'));
      }
    } catch {
      // Se conserva el último estado conocido.
    }
  }
}

function httpStatus(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}
