import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard, HlmCardContent, HlmCardHeader, HlmCardTitle } from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { I18nService } from '../../../core/i18n.service';

@Component({
  selector: 'app-api-key-form',
  standalone: true,
  imports: [FormsModule, HlmButton, HlmCard, HlmCardContent, HlmCardHeader, HlmCardTitle, HlmInput],
  template: `
    <div hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>{{ i18n.t('apiKeys.newKey') }}</h2>
      </div>
      <div hlmCardContent>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            hlmInput
            class="w-full"
            name="name"
            [placeholder]="i18n.t('apiKeys.name')"
            [ngModel]="name"
            (ngModelChange)="nameChange.emit($event)"
          />
          <button
            hlmBtn
            type="button"
            [disabled]="!name.trim()"
            (click)="create.emit()"
          >
            {{ i18n.t('apiKeys.create') }}
          </button>
        </div>

        @if (createdKey) {
          <div class="mt-4 rounded-lg border p-4" style="border-color: var(--accent);">
            <p class="text-sm font-semibold">{{ i18n.t('apiKeys.once') }}</p>
            <code
              class="mt-2 block break-all rounded p-2 text-xs"
              style="background: var(--surface-muted);"
            >{{ createdKey }}</code>
            <button hlmBtn variant="outline" size="sm" class="mt-2" type="button" (click)="copy.emit(createdKey)">
              {{ i18n.t('apiKeys.copy') }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class ApiKeyFormComponent {
  readonly i18n = inject(I18nService);

  @Input() name = '';
  @Input() createdKey: string | null = null;
  @Output() readonly nameChange = new EventEmitter<string>();
  @Output() readonly create = new EventEmitter<void>();
  @Output() readonly copy = new EventEmitter<string>();
}
