import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import type { UploadMetadata } from '../../../core/api.service';
import { I18nService } from '../../../core/i18n.service';
import { CategoryComboboxComponent } from '../../../shared/document/category-combobox.component';
import type { FileMetadata } from '../upload.models';

@Component({
  selector: 'app-upload-file-metadata',
  standalone: true,
  imports: [FormsModule, HlmButton, HlmInput, CategoryComboboxComponent],
  template: `
    <section class="mt-3 rounded-lg border p-3" style="border-color: var(--border); background: var(--surface-muted);">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">{{ i18n.t('upload.fileMetadataTitle') }} «{{ filename() }}»</h3>
          <p class="mt-0.5 text-xs muted">{{ i18n.t('upload.titleHint') }}</p>
        </div>
        <button hlmBtn variant="ghost" size="icon-sm" type="button" (click)="closed.emit()">×</button>
      </div>

      <div class="mt-3 space-y-3">
        <label class="block text-sm font-medium">
          {{ i18n.t('upload.titleField') }} *
          <input
            hlmInput
            class="mt-1 w-full"
            name="fileTitle"
            maxlength="300"
            [ngModel]="metadata().title"
            (ngModelChange)="patch({ title: $event })"
          />
        </label>

        <label class="flex items-start gap-2 text-sm">
          <input
            class="mt-0.5"
            type="checkbox"
            [ngModel]="metadata().useShared"
            (ngModelChange)="toggleShared($event)"
          />
          <span>{{ i18n.t('upload.useSharedMetadata') }}</span>
        </label>

        <div class="grid gap-3 md:grid-cols-2">
          <label class="block text-sm font-medium">
            {{ i18n.t('upload.author') }} *
            <input
              hlmInput
              class="mt-1 w-full"
              name="fileAuthor"
              [disabled]="metadata().useShared"
              [ngModel]="effectiveAuthor()"
              (ngModelChange)="patch({ author: $event })"
            />
          </label>

          <label class="block text-sm font-medium">
            {{ i18n.t('upload.version') }}
            <input
              hlmInput
              class="mt-1 w-full"
              name="fileVersion"
              [disabled]="metadata().useShared"
              [ngModel]="effectiveVersion()"
              (ngModelChange)="patch({ version: $event })"
            />
          </label>

          <div class="md:col-span-2">
            <app-category-combobox
              controlId="file-category"
              [disabled]="metadata().useShared"
              [categories]="effectiveCategories()"
              (categoriesChange)="patch({ categories: $event })"
            />
          </div>

          <label class="block text-sm font-medium md:col-span-2">
            {{ i18n.t('upload.tags') }}
            <input
              hlmInput
              class="mt-1 w-full"
              name="fileTags"
              [disabled]="metadata().useShared"
              [ngModel]="effectiveTags()"
              (ngModelChange)="patch({ tags: $event })"
            />
          </label>
        </div>

        @if (missing()) {
          <p class="text-xs" style="color: var(--danger);" role="alert">
            {{ i18n.t('upload.missingMetadataHint') }}
          </p>
        }
      </div>
    </section>
  `,
})
export class UploadFileMetadataComponent {
  readonly i18n = inject(I18nService);

  readonly filename = input.required<string>();
  readonly metadata = input.required<FileMetadata>();
  readonly sharedMetadata = input.required<UploadMetadata>();
  readonly metadataChange = output<FileMetadata>();
  readonly closed = output<void>();

  readonly effectiveAuthor = computed(() =>
    this.metadata().useShared
      ? (this.sharedMetadata().author ?? '')
      : this.metadata().author,
  );

  readonly effectiveCategories = computed(() =>
    this.metadata().useShared
      ? (this.sharedMetadata().categories ?? [])
      : this.metadata().categories,
  );

  readonly effectiveVersion = computed(() =>
    this.metadata().useShared
      ? (this.sharedMetadata().version ?? '')
      : this.metadata().version,
  );

  readonly effectiveTags = computed(() =>
    this.metadata().useShared
      ? (this.sharedMetadata().tags ?? '')
      : this.metadata().tags,
  );

  readonly missing = computed(
    () => !this.metadata().title.trim() || !this.effectiveAuthor().trim(),
  );

  patch(patch: Partial<FileMetadata>): void {
    this.metadataChange.emit({ ...this.metadata(), ...patch });
  }

  toggleShared(useShared: boolean): void {
    if (useShared) {
      this.metadataChange.emit({ ...this.metadata(), useShared: true });
      return;
    }

    const shared = this.sharedMetadata();
    this.metadataChange.emit({
      ...this.metadata(),
      useShared: false,
      author: shared.author ?? '',
      categories: shared.categories ?? [],
      version: shared.version ?? '',
      tags: shared.tags ?? '',
    });
  }
}
