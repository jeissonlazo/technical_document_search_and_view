import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideBraces, lucideClipboardCopy, lucidePenLine } from '@ng-icons/lucide';
import { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard, HlmCardContent, HlmCardDescription, HlmCardHeader, HlmCardTitle } from '@spartan-ng/helm/card';
import { I18nService } from '../../../core/i18n.service';
import type { DraftStats, EditorCommand, EditorToolbarState, EditorView } from '../editor.models';
import { EditorToolbarComponent } from './editor-toolbar.component';

const EMPTY_TOOLBAR_STATE: EditorToolbarState = { active: new Set(), canUndo: false, canRedo: false };

/**
 * Área de trabajo del editor: monta TipTap, la barra de formato y la vista de
 * Markdown sin procesar. El Markdown es la única fuente de verdad hacia afuera.
 */
@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [NgIcon, HlmButton, HlmCard, HlmCardContent, HlmCardDescription, HlmCardHeader, HlmCardTitle, EditorToolbarComponent],
  template: `
    <div hlmCard>
      <div hlmCardHeader class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 hlmCardTitle>{{ i18n.t('editor.workspace') }}</h2>
          <p hlmCardDescription class="mt-1 text-xs">{{ i18n.t('editor.workspaceHint') }}</p>
        </div>

        <div
          class="flex items-center gap-0.5 rounded-md border p-0.5"
          style="border-color: var(--border);"
          role="group"
          [attr.aria-label]="i18n.t('editor.view')"
        >
          <button
            hlmBtn
            type="button"
            size="xs"
            [variant]="view() === 'edit' ? 'secondary' : 'ghost'"
            [attr.aria-pressed]="view() === 'edit'"
            (click)="view.set('edit')"
          >
            <ng-icon [svg]="lucidePenLine" />
            {{ i18n.t('editor.viewEdit') }}
          </button>
          <button
            hlmBtn
            type="button"
            size="xs"
            [variant]="view() === 'markdown' ? 'secondary' : 'ghost'"
            [attr.aria-pressed]="view() === 'markdown'"
            (click)="view.set('markdown')"
          >
            <ng-icon [svg]="lucideBraces" />
            {{ i18n.t('editor.viewMarkdown') }}
          </button>
        </div>
      </div>

      <div hlmCardContent class="space-y-3">
        <app-editor-toolbar [state]="toolbarState()" (command)="run($event)" />

        <div class="rounded-lg border" style="border-color: var(--border);">
          <!-- El editor permanece montado entre vistas para no perder el historial. -->
          <div #host [hidden]="view() !== 'edit'" class="focus-within:ring-2" style="border-radius: inherit;"></div>

          @if (view() === 'markdown') {
            <pre
              class="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed"
            >{{ markdown() || i18n.t('editor.markdownEmpty') }}</pre>
          }
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs muted">
          <span>
            {{ stats().words }} {{ i18n.t('editor.words') }} · {{ stats().characters }}
            {{ i18n.t('editor.characters') }} · {{ stats().headings }} {{ i18n.t('editor.headings') }} ·
            {{ stats().readingMinutes }} {{ i18n.t('editor.readingMinutes') }}
          </span>

          <button hlmBtn type="button" variant="ghost" size="xs" (click)="copyMarkdown()">
            <ng-icon [svg]="lucideClipboardCopy" />
            {{ copied() ? i18n.t('editor.copied') : i18n.t('editor.copyMarkdown') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class MarkdownEditorComponent {
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  readonly markdown = model.required<string>();
  readonly stats = input.required<DraftStats>();
  readonly editable = input(true);

  readonly view = signal<EditorView>('edit');
  readonly toolbarState = signal<EditorToolbarState>(EMPTY_TOOLBAR_STATE);
  readonly copied = signal(false);

  readonly lucidePenLine = lucidePenLine;
  readonly lucideBraces = lucideBraces;
  readonly lucideClipboardCopy = lucideClipboardCopy;

  private readonly editor = signal<Editor | null>(null);
  /** Último texto que el editor produjo: evita devolverle su propio contenido. */
  private lastSynced = '';
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.mount());

    // Cambios externos (por ejemplo, un documento nuevo) se empujan al editor.
    effect(() => {
      const value = this.markdown();
      const editor = this.editor();
      if (!editor || value === this.lastSynced) return;

      untracked(() => {
        this.lastSynced = value;
        editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
      });
    });

    effect(() => {
      const editable = this.editable();
      const editor = this.editor();
      if (!editor || editor.isEditable === editable) return;
      untracked(() => editor.setEditable(editable, false));
    });

    this.destroyRef.onDestroy(() => {
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.editor()?.destroy();
    });
  }

  run(command: EditorCommand): void {
    const editor = this.editor();
    if (!editor) return;

    const chain = editor.chain().focus();

    switch (command.type) {
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
      case 'heading':
        chain.toggleHeading({ level: command.level }).run();
        break;
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'code':
        chain.toggleCode().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'horizontalRule':
        chain.setHorizontalRule().run();
        break;
      case 'link':
        this.applyLink(editor);
        break;
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'rowAdd':
        chain.addRowAfter().run();
        break;
      case 'columnAdd':
        chain.addColumnAfter().run();
        break;
      case 'rowRemove':
        chain.deleteRow().run();
        break;
      case 'columnRemove':
        chain.deleteColumn().run();
        break;
      case 'tableRemove':
        chain.deleteTable().run();
        break;
      case 'clear':
        chain.unsetAllMarks().clearNodes().run();
        break;
    }
  }

  async copyMarkdown(): Promise<void> {
    const markdown = this.markdown();
    if (!markdown.trim()) return;

    try {
      await navigator.clipboard.writeText(markdown);
      this.copied.set(true);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // El navegador puede negar el portapapeles sin HTTPS ni permiso.
    }
  }

  private mount(): void {
    const editor = new Editor({
      element: this.host().nativeElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true },
        }),
        Placeholder.configure({
          placeholder: () => this.i18n.t('editor.placeholder'),
          includeChildren: true,
        }),
        TableKit.configure({ table: { resizable: false } }),
        Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      ],
      content: this.markdown(),
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'markdown-body tiptap-prose',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': this.i18n.t('editor.workspace'),
        },
      },
      onUpdate: ({ editor: instance }) => this.syncFromEditor(instance),
      onTransaction: () => this.refreshToolbar(),
    });

    this.editor.set(editor);
    this.syncFromEditor(editor);
    this.refreshToolbar();

    setTimeout(() => {
      if (!editor.isDestroyed) editor.commands.focus('start');
    });
  }

  private syncFromEditor(editor: Editor): void {
    const markdown = editor.getMarkdown();
    this.lastSynced = markdown;
    if (markdown !== this.markdown()) this.markdown.set(markdown);
  }

  private refreshToolbar(): void {
    const editor = this.editor();
    if (!editor || editor.isDestroyed) return;

    const active = new Set<string>();
    if (editor.isActive('bold')) active.add('bold');
    if (editor.isActive('italic')) active.add('italic');
    if (editor.isActive('underline')) active.add('underline');
    if (editor.isActive('strike')) active.add('strike');
    if (editor.isActive('code')) active.add('code');
    if (editor.isActive('codeBlock')) active.add('codeBlock');
    if (editor.isActive('blockquote')) active.add('blockquote');
    if (editor.isActive('bulletList')) active.add('bulletList');
    if (editor.isActive('orderedList')) active.add('orderedList');
    if (editor.isActive('link')) active.add('link');
    if (editor.isActive('table')) active.add('table');
    if (editor.isActive('paragraph')) active.add('paragraph');
    if (editor.isActive('heading', { level: 1 })) active.add('h1');
    if (editor.isActive('heading', { level: 2 })) active.add('h2');
    if (editor.isActive('heading', { level: 3 })) active.add('h3');

    this.toolbarState.set({
      active,
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    });
  }

  private applyLink(editor: Editor): void {
    const previous = editor.getAttributes('link')['href'] as string | undefined;
    const answer = window.prompt(this.i18n.t('editor.linkPrompt'), previous ?? 'https://');
    if (answer === null) return;

    const href = answer.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }
}
