import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="mx-auto max-w-md rounded-xl p-6 surface">
      <h1 class="mb-4 text-2xl font-bold">{{ i18n.t('auth.registerTitle') }}</h1>

      <form class="space-y-4" (ngSubmit)="submit()">
        <label class="block text-sm font-medium">
          {{ i18n.t('auth.email') }}
          <input
            class="input mt-1"
            type="email"
            name="email"
            [(ngModel)]="email"
            autocomplete="email"
            required
          />
        </label>

        <label class="block text-sm font-medium">
          {{ i18n.t('auth.password') }}
          <input
            class="input mt-1"
            type="password"
            name="password"
            [(ngModel)]="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>

        <label class="block text-sm font-medium">
          Repetir contraseña
          <input
            class="input mt-1"
            type="password"
            name="confirmPassword"
            [(ngModel)]="confirmPassword"
            autocomplete="new-password"
            required
          />
        </label>

        @if (error) {
          <p class="text-sm" style="color: var(--danger);" role="alert">{{ error }}</p>
        }

        <button class="btn btn-primary w-full" type="submit" [disabled]="loading">
          {{ loading ? '…' : i18n.t('auth.registerAction') }}
        </button>
      </form>

      <p class="mt-4 text-sm muted">
        {{ i18n.t('auth.hasAccount') }}
        <a routerLink="/login">{{ i18n.t('nav.login') }}</a>
      </p>
    </section>
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';

  async submit(): Promise<void> {
    if (!this.email || !this.password || this.loading) return;
    if (this.password !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    this.loading = true;
    this.error = '';
    try {
      await this.auth.register(this.email, this.password);
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.error = apiErrorMessage(error, 'No se pudo crear la cuenta.');
    } finally {
      this.loading = false;
    }
  }
}
