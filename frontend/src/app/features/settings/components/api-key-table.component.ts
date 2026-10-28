import { Component, inject, input, output } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard, HlmCardContent } from '@spartan-ng/helm/card';
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from '@spartan-ng/helm/table';
import type { ApiKeyRecord } from '../../../core/api.service';
import { I18nService } from '../../../core/i18n.service';

@Component({
  selector: 'app-api-key-table',
  standalone: true,
  imports: [
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
  ],
  template: `
    <div hlmCard class="mt-4">
      <div hlmCardContent>
        @if (keys().length === 0) {
          <p class="text-sm muted">{{ i18n.t('apiKeys.empty') }}</p>
        } @else {
          <div hlmTableContainer >
            <table hlmTable>
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh>Nombre</th>
                  <th hlmTh>Prefijo</th>
                  <th hlmTh>Creada</th>
                  <th hlmTh>Acción</th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (key of keys(); track key.id) {
                  <tr hlmTr>
                    <td hlmTd>{{ key.name }}</td>
                    <td hlmTd><code>{{ key.prefix }}…</code></td>
                    <td hlmTd>{{ formatDate(key.createdAt) }}</td>
                    <td hlmTd>
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="revoke.emit(key.id)">
                        {{ i18n.t('apiKeys.revoke') }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class ApiKeyTableComponent {
  readonly i18n = inject(I18nService);

  readonly keys = input.required<ApiKeyRecord[]>();
  readonly revoke = output<string>();

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(this.i18n.lang(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
