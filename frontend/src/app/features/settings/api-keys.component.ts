import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, type ApiKeyRecord } from '../../core/api.service';
import { apiErrorMessage } from '../../core/api-error';
import { I18nService } from '../../core/i18n.service';
import { ApiKeyFormComponent } from './components/api-key-form.component';
import { ApiKeyTableComponent } from './components/api-key-table.component';

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [ApiKeyFormComponent, ApiKeyTableComponent],
  template: `
    <section class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold">{{ i18n.t('apiKeys.title') }}</h1>
        <p class="mt-1 text-sm muted">{{ i18n.t('apiKeys.subtitle') }}</p>
      </div>

      <app-api-key-form
        [(name)]="name"
        [createdKey]="createdKey()"
        (create)="create()"
        (copy)="copy($event)"
      />

      @if (error()) {
        <p class="text-sm" style="color: var(--danger);" role="alert">{{ error() }}</p>
      }

      <app-api-key-table [keys]="keys()" (revoke)="revoke($event)" />
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
      this.keys.update((keys) => [result.apiKey, ...keys]);
      this.name = '';
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo crear la API key.'));
    }
  }

  async revoke(id: string): Promise<void> {
    try {
      await this.api.revokeApiKey(id);
      this.keys.update((keys) => keys.filter((key) => key.id !== id));
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
