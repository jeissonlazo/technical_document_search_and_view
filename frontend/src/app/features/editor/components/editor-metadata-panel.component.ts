import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideFileDown, lucideFilePlus2, lucideFileText, lucideUpload } from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import type { DocumentStatus } from '@docs/shared';
import { I18nService } from '../../../core/i18n.service';
import { DocumentStatusBadgeComponent } from '../../../shared/document/document-status-badge.component';
import { CategoryComboboxComponent } from '../../../shared/document/category-combobox.component';
import type { DraftMetadata, DraftStatus } from '../editor.models';

/**
 * Panel lateral del editor: ficha del documento y acciones de publicación.
 * Mantiene el formulario sin estado propio; cada cambio se emite como un
 * objeto nuevo para que la pantalla conserve el estado.
 */
@Component({
  selector: 'app-editor-metadata-panel',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmBadge,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmCardDescription,
    HlmCardHeader,
    HlmCardTitle,
    HlmInput,
    HlmTextarea,
    CategoryComboboxComponent,
    DocumentStatusBadgeComponent,
  ],
  template: `
    <div hlmCard size="sm">
      <div hlmCardHeader>
        <h2 hlmCardTitle>{{ i18n.t('upload.metadata') }}</h2>
        <p hlmCardDescription class="mt-1 text-xs">{{ i18n.t('editor.metadataHint') }}</p>
      </div>

      <div hlmCardContent class="space-y-4">
        <label class="block text-sm font-medium">
          {{ i18n.t('upload.titleField') }} *
          <input
            hlmInput
            class="mt-1 w-full"
            name="draftTitle"
            required
            maxlength="300"
            [ngModel]="metadata().title"
            (ngModelChange)="patch('title', $event)"
          />
        </label>

        <label class="block text-sm font-medium">
          {{ i18n.t('upload.author') }}
          <input
            hlmInput
            class="mt-1 w-full"
            name="draftAuthor"
            maxlength="200"
            [ngModel]="metadata().author"
            (ngModelChange)="patch('author', $event)"
          />
        </label>

        <label class="block text-sm font-medium">
          {{ i18n.t('upload.version') }}
          <input
            hlmInput
            class="mt-1 w-full"
            name="draftVersion"
            maxlength="80"
            [ngModel]="metadata().version"
            (ngModelChange)="patch('version', $event)"
          />
        </label>

        <app-category-combobox
          controlId="editor-category"
          [categories]="metadata().categories"
          (categoriesChange)="patch('categories', $event)"
        />

        <label class="block text-sm font-medium">
          {{ i18n.t('upload.tags') }}
          <input
            hlmInput
            class="mt-1 w-full"
            name="draftTags"
            maxlength="500"
            [ngModel]="metadata().tags"
            (ngModelChange)="patch('tags', $event)"
          />
        </label>

        <label class="block text-sm font-medium">
          {{ i18n.t('upload.description') }}
          <textarea
            hlmTextarea
            class="mt-1 w-full"
            name="draftDescription"
            rows="3"
            maxlength="2000"
            [ngModel]="metadata().description"
            (ngModelChange)="patch('description', $event)"
          ></textarea>
        </label>

        <div class="rounded-lg border p-3 text-xs" style="border-color: var(--border);">
          <div class="flex items-center gap-2">
            <ng-icon [svg]="lucideFileText" class="shrink-0" />
            <span class="truncate font-mono" [title]="filename()">{{ filename() }}</span>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="muted">{{ i18n.t('editor.status') }}</span>
            @if (documentStatus(); as docStatus) {
              <app-document-status-badge [status]="docStatus" />
            } @else if (status() === 'PUBLISHING') {
              <span hlmBadge variant="outline" class="badge-warn">{{ i18n.t('upload.uploading') }}</span>
            } @else {
              <span hlmBadge variant="outline">{{ i18n.t('editor.draft') }}</span>
            }
          </div>
        </div>

        @if (message()) {
          <p class="text-xs" role="status" aria-live="polite" style="color: var(--danger);">
            {{ message() }}
          </p>
        }

        @if (documentId(); as id) {
          <a hlmBtn variant="outline" size="sm" class="w-full" [routerLink]="['/documents', id]">
            {{ i18n.t('editor.openViewer') }}
          </a>
        }
      </div>

      <div class="flex flex-col gap-2 border-t px-4 pt-4 pb-4" style="border-color: var(--border);">
        <button
          hlmBtn
          type="button"
          class="w-full"
          [disabled]="busy() || !canPublish()"
          (click)="publish.emit()"
        >
          <ng-icon [svg]="lucideUpload" />
          {{ busy() ? i18n.t('upload.uploading') : i18n.t('editor.publish') }}
        </button>

        <div class="flex w-full gap-2">
          <button
            hlmBtn
            type="button"
            variant="outline"
            size="sm"
            class="flex-1"
            [disabled]="busy()"
            (click)="download.emit()"
          >
            <ng-icon [svg]="lucideFileDown" />
            {{ i18n.t('editor.download') }}
          </button>
          <button
            hlmBtn
            type="button"
            variant="ghost"
            size="sm"
            class="flex-1"
            [disabled]="busy()"
            (click)="newDraft.emit()"
          >
            <ng-icon [svg]="lucideFilePlus2" />
            {{ i18n.t('editor.new') }}
          </button>
        </div>

        <p class="text-xs muted">{{ i18n.t('editor.publishHint') }}</p>
      </div>
    </div>
  `,
})
export class EditorMetadataPanelComponent {
  readonly i18n = inject(I18nService);

  readonly metadata = model.required<DraftMetadata>();
  readonly status = input.required<DraftStatus>();
  readonly filename = input.required<string>();
  readonly busy = input(false);
  readonly canPublish = input(false);
  readonly documentId = input<string | null>(null);
  readonly message = input('');

  readonly publish = output<void>();
  readonly download = output<void>();
  readonly newDraft = output<void>();

  readonly lucideFileText = lucideFileText;
  readonly lucideUpload = lucideUpload;
  readonly lucideFileDown = lucideFileDown;
  readonly lucideFilePlus2 = lucideFilePlus2;

  /** `IDLE` y `PUBLISHING` no son estados del documento en el API. */
  readonly documentStatus = computed<DocumentStatus | null>(() => {
    const status = this.status();
    return status === 'IDLE' || status === 'PUBLISHING' ? null : status;
  });

  patch<K extends keyof DraftMetadata>(key: K, value: DraftMetadata[K]): void {
    this.metadata.set({ ...this.metadata(), [key]: value });
  }
}
