import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, type ApiKeyRecord } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('apiKeys.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('apiKeys.subtitle') }}</p>
      </div>

      <div class="rounded-xl p-5 surface">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            class="input"
            name="name"
            [placeholder]="i18n.t('apiKeys.name')"
            [(ngModel)]="name"
          />
          <button type="button" class="btn btn-primary" [disabled]="!name.trim()" (click)="create()">
            {{ i18n.t('apiKeys.create') }}
          </button>
        </div>

        @if (createdKey(); as key) {
          <div class="mt-4 rounded-lg border p-4" style="border-color: var(--accent);">
            <p class="text-sm font-semibold">{{ i18n.t('apiKeys.once') }}</p>
            <code class="mt-2 block break-all rounded p-2 text-xs" style="background: var(--surface-muted);">{{ key }}</code>
            <button type="button" class="btn mt-2" (click)="copy(key)">{{ i18n.t('apiKeys.copy') }}</button>
          </div>
        }

        @if (error()) {
          <p class="mt-3 text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
        }
      </div>

      <div class="rounded-xl p-5 surface">
        @if (keys().length === 0) {
          <p class="text-sm muted">{{ i18n.t('apiKeys.empty') }}</p>
        } @else {
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b" style="border-color: var(--border);">
                <th class="py-2 pr-3">Nombre</th>
                <th class="py-2 pr-3">Prefijo</th>
                <th class="py-2 pr-3">Creada</th>
                <th class="py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (key of keys(); track key.id) {
                <tr class="border-b" style="border-color: var(--border);">
                  <td class="py-2 pr-3">{{ key.name }}</td>
                  <td class="py-2 pr-3"><code>{{ key.prefix }}…</code></td>
                  <td class="py-2 pr-3">{{ key.createdAt }}</td>
                  <td class="py-2">
                    <button type="button" class="btn" (click)="revoke(key.id)">
                      {{ i18n.t('apiKeys.revoke') }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </section>
  `,
})
export class ApiKeysComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly i18n = inject(I18nService);

  readonly keys = signal<ApiKeyRecord[]>([]);
  readonly createdKey = signal<string | null>(null);
  readonly error = signal('');
  name = '';

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async create(): Promise<void> {
    if (!this.name.trim()) return;
    this.error.set('');
    try {
      const result = await this.api.createApiKey(this.name.trim());
      this.createdKey.set(result.key);
      this.name = '';
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo crear la API key.'));
    }
  }

  async revoke(id: string): Promise<void> {
    try {
      await this.api.revokeApiKey(id);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo revocar la API key.'));
    }
  }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // El navegador puede bloquear el portapapeles.
    }
  }

  private async load(): Promise<void> {
    try {
      this.keys.set(await this.api.listApiKeys());
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudieron cargar las API keys.'));
    }
  }
}
