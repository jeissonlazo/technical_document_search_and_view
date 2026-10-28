import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmBadge } from '@spartan-ng/helm/badge';
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import type { UploadMetadata } from '../../../core/api.service';
import { I18nService } from '../../../core/i18n.service';

@Component({
  selector: 'app-upload-metadata-form',
  standalone: true,
  imports: [
    FormsModule,
    HlmBadge,
    HlmCard,
    HlmCardContent,
    HlmCardDescription,
    HlmCardHeader,
    HlmCardTitle,
    HlmInput,
    HlmTextarea,
  ],
  template: `
    <div hlmCard>
      <div hlmCardHeader class="flex flex-row items-start justify-between gap-2">
        <div>
          <h2 hlmCardTitle>{{ i18n.t('upload.metadata') }}</h2>
          <p hlmCardDescription class="mt-1 text-xs">
            {{ i18n.t('upload.metadataHint') }}
          </p>
        </div>
        <span hlmBadge variant="outline">{{ i18n.t('upload.required') }}</span>
      </div>

      <div hlmCardContent>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="block text-sm font-medium md:col-span-2">
            {{ i18n.t('upload.titleField') }} *
            <input
              hlmInput
              class="mt-1 w-full"
              name="title"
              [(ngModel)]="metadata.title"
              required
            />
          </label>

          <label class="block text-sm font-medium">
            {{ i18n.t('upload.author') }}
            <input hlmInput class="mt-1 w-full" name="author" [(ngModel)]="metadata.author" />
          </label>

          <label class="block text-sm font-medium">
            {{ i18n.t('upload.category') }}
            <input hlmInput class="mt-1 w-full" name="category" [(ngModel)]="metadata.category" />
          </label>

          <label class="block text-sm font-medium">
            {{ i18n.t('upload.version') }}
            <input hlmInput class="mt-1 w-full" name="version" [(ngModel)]="metadata.version" />
          </label>

          <label class="block text-sm font-medium">
            {{ i18n.t('upload.tags') }}
            <input hlmInput class="mt-1 w-full" name="tags" [(ngModel)]="metadata.tags" />
          </label>

          <label class="block text-sm font-medium md:col-span-2">
            {{ i18n.t('upload.description') }}
            <textarea
              hlmTextarea
              class="mt-1 w-full"
              name="description"
              rows="3"
              [(ngModel)]="metadata.description"
            ></textarea>
          </label>
        </div>
      </div>
    </div>
  `,
})
export class UploadMetadataFormComponent {
  readonly i18n = inject(I18nService);

  @Input({ required: true }) metadata!: UploadMetadata;
}
