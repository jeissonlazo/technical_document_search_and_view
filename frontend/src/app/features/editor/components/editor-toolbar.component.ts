import { Component, inject, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import {
  lucideBold,
  lucideCode,
  lucideHeading1,
  lucideHeading2,
  lucideHeading3,
  lucideItalic,
  lucideLink2,
  lucideList,
  lucideListOrdered,
  lucideMinus,
  lucidePilcrow,
  lucideRedo2,
  lucideRemoveFormatting,
  lucideSquareCode,
  lucideStrikethrough,
  lucideTable,
  lucideTextQuote,
  lucideUnderline,
  lucideUndo2,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { I18nService } from '../../../core/i18n.service';
import type { EditorCommand, EditorToolbarState } from '../editor.models';

interface ToolbarItem {
  key: string;
  icon: string;
  labelKey: string;
  command: EditorCommand;
  /** Clave de `EditorToolbarState.active` que marca el botón como activo. */
  activeKey?: string;
}

/**
 * Barra de formato del editor. No conoce la instancia de TipTap: solo refleja
 * el estado recibido y emite la acción solicitada.
 */
@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  imports: [NgIcon, HlmButton],
  template: `
    <div
      class="flex flex-wrap items-center gap-1"
      role="toolbar"
      [attr.aria-label]="i18n.t('editor.toolbarLabel')"
    >
      @for (group of groups; track $index) {
        <div class="flex items-center gap-0.5">
          @for (item of group; track item.key) {
            <button
              hlmBtn
              type="button"
              size="icon-sm"
              [variant]="isActive(item) ? 'secondary' : 'ghost'"
              [disabled]="isDisabled(item)"
              [attr.aria-pressed]="item.activeKey ? isActive(item) : null"
              [attr.aria-label]="i18n.t(item.labelKey)"
              [title]="i18n.t(item.labelKey)"
              (click)="command.emit(item.command)"
            >
              <ng-icon [svg]="item.icon" />
            </button>
          }
        </div>
        @if (!$last) {
          <span class="mx-1 h-5 w-px" style="background: var(--border);" aria-hidden="true"></span>
        }
      }
    </div>

    @if (state().active.has('table')) {
      <div
        class="mt-2 flex flex-wrap items-center gap-1 border-t pt-2 text-xs"
        style="border-color: var(--border);"
      >
        <span class="mr-1 muted">{{ i18n.t('editor.table') }}</span>
        @for (action of tableActions; track action.key) {
          <button hlmBtn type="button" variant="ghost" size="xs" (click)="command.emit(action.command)">
            {{ i18n.t(action.labelKey) }}
          </button>
        }
      </div>
    }
  `,
})
export class EditorToolbarComponent {
  readonly i18n = inject(I18nService);

  readonly state = input.required<EditorToolbarState>();
  readonly command = output<EditorCommand>();

  readonly groups: ToolbarItem[][] = [
    [
      { key: 'undo', icon: lucideUndo2, labelKey: 'editor.undo', command: { type: 'undo' } },
      { key: 'redo', icon: lucideRedo2, labelKey: 'editor.redo', command: { type: 'redo' } },
    ],
    [
      {
        key: 'h1',
        icon: lucideHeading1,
        labelKey: 'editor.h1',
        command: { type: 'heading', level: 1 },
        activeKey: 'h1',
      },
      {
        key: 'h2',
        icon: lucideHeading2,
        labelKey: 'editor.h2',
        command: { type: 'heading', level: 2 },
        activeKey: 'h2',
      },
      {
        key: 'h3',
        icon: lucideHeading3,
        labelKey: 'editor.h3',
        command: { type: 'heading', level: 3 },
        activeKey: 'h3',
      },
      {
        key: 'paragraph',
        icon: lucidePilcrow,
        labelKey: 'editor.paragraph',
        command: { type: 'paragraph' },
        activeKey: 'paragraph',
      },
    ],
    [
      {
        key: 'bold',
        icon: lucideBold,
        labelKey: 'editor.bold',
        command: { type: 'bold' },
        activeKey: 'bold',
      },
      {
        key: 'italic',
        icon: lucideItalic,
        labelKey: 'editor.italic',
        command: { type: 'italic' },
        activeKey: 'italic',
      },
      {
        key: 'underline',
        icon: lucideUnderline,
        labelKey: 'editor.underline',
        command: { type: 'underline' },
        activeKey: 'underline',
      },
      {
        key: 'strike',
        icon: lucideStrikethrough,
        labelKey: 'editor.strike',
        command: { type: 'strike' },
        activeKey: 'strike',
      },
      {
        key: 'code',
        icon: lucideCode,
        labelKey: 'editor.code',
        command: { type: 'code' },
        activeKey: 'code',
      },
      {
        key: 'codeBlock',
        icon: lucideSquareCode,
        labelKey: 'editor.codeBlock',
        command: { type: 'codeBlock' },
        activeKey: 'codeBlock',
      },
    ],
    [
      {
        key: 'blockquote',
        icon: lucideTextQuote,
        labelKey: 'editor.blockquote',
        command: { type: 'blockquote' },
        activeKey: 'blockquote',
      },
      {
        key: 'bulletList',
        icon: lucideList,
        labelKey: 'editor.bulletList',
        command: { type: 'bulletList' },
        activeKey: 'bulletList',
      },
      {
        key: 'orderedList',
        icon: lucideListOrdered,
        labelKey: 'editor.orderedList',
        command: { type: 'orderedList' },
        activeKey: 'orderedList',
      },
      {
        key: 'horizontalRule',
        icon: lucideMinus,
        labelKey: 'editor.horizontalRule',
        command: { type: 'horizontalRule' },
      },
    ],
    [
      {
        key: 'link',
        icon: lucideLink2,
        labelKey: 'editor.link',
        command: { type: 'link' },
        activeKey: 'link',
      },
      {
        key: 'table',
        icon: lucideTable,
        labelKey: 'editor.insertTable',
        command: { type: 'table' },
        activeKey: 'table',
      },
      {
        key: 'clear',
        icon: lucideRemoveFormatting,
        labelKey: 'editor.clear',
        command: { type: 'clear' },
      },
    ],
  ];

  readonly tableActions: { key: string; labelKey: string; command: EditorCommand }[] = [
    { key: 'rowAdd', labelKey: 'editor.rowAdd', command: { type: 'rowAdd' } },
    { key: 'columnAdd', labelKey: 'editor.columnAdd', command: { type: 'columnAdd' } },
    { key: 'rowRemove', labelKey: 'editor.rowRemove', command: { type: 'rowRemove' } },
    { key: 'columnRemove', labelKey: 'editor.columnRemove', command: { type: 'columnRemove' } },
    { key: 'tableRemove', labelKey: 'editor.tableRemove', command: { type: 'tableRemove' } },
  ];

  isActive(item: ToolbarItem): boolean {
    return item.activeKey ? this.state().active.has(item.activeKey) : false;
  }

  isDisabled(item: ToolbarItem): boolean {
    if (item.command.type === 'undo') return !this.state().canUndo;
    if (item.command.type === 'redo') return !this.state().canRedo;
    return false;
  }
}
