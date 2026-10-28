import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, HlmButton, HlmInput],
  template: `
    <section class="mx-auto max-w-md rounded-xl p-6 surface">
      <h1 class="mb-4 text-2xl font-bold">{{ i18n.t('auth.loginTitle') }}</h1>

      <form class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label for="login-email" class="block text-sm font-medium">
            {{ i18n.t('auth.email') }}
          </label>
          <input
            id="login-email"
            hlmInput
            class="mt-1 w-full"
            type="email"
            name="email"
            [(ngModel)]="email"
            autocomplete="email"
            required
          />
        </div>

        <div>
          <label for="login-password" class="block text-sm font-medium">
            {{ i18n.t('auth.password') }}
          </label>
          <div class="relative mt-1">
            <input
              id="login-password"
              hlmInput
              class="w-full pr-11"
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              [(ngModel)]="password"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5"
              style="background: transparent; border: 0; color: var(--muted); cursor: pointer;"
              [attr.aria-label]="i18n.t(showPassword() ? 'auth.hidePassword' : 'auth.showPassword')"
              [attr.aria-pressed]="showPassword()"
              (click)="showPassword.update((visible) => !visible)"
            >
              @if (showPassword()) {
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m3 3 18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17.4 17.4 0 0 1-3.4 4.6" />
                  <path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.4-.9" />
                </svg>
              } @else {
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              }
            </button>
          </div>
        </div>

        @if (error()) {
          <p class="text-sm" style="color: var(--danger);" role="alert" aria-live="polite">
            {{ error() }}
          </p>
        }

        <button hlmBtn class="w-full" type="submit" [disabled]="loading()">
          {{ loading() ? '…' : i18n.t('auth.loginAction') }}
        </button>
      </form>

      <p class="mt-4 text-sm muted">
        {{ i18n.t('auth.noAccount') }}
        <a routerLink="/register">{{ i18n.t('nav.register') }}</a>
      </p>
    </section>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  async submit(): Promise<void> {
    if (!this.email || !this.password || this.loading()) return;

    this.loading.set(true);
    this.error.set('');

    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/search');
    } catch (error) {
      this.error.set(loginErrorMessage(error, this.i18n));
    } finally {
      this.loading.set(false);
    }
  }
}

function loginErrorMessage(error: unknown, i18n: I18nService): string {
  const status = (error as { status?: number } | null)?.status;
  const message = apiErrorMessage(error, '');

  if (message && !message.startsWith('Http failure response')) {
    return message;
  }
  if (status === 401) {
    return i18n.t('auth.invalidCredentials');
  }
  return i18n.t('auth.loginFailed');
}
