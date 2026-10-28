import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { I18nService } from './core/i18n.service';
import { SseService } from './core/sse.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen">
      <header class="border-b" style="border-color: var(--border); background: var(--surface);">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <a routerLink="/search" class="text-lg font-bold">{{ i18n.t('app.name') }}</a>

          @if (auth.user(); as user) {
            <nav class="flex items-center gap-2 text-sm">
              <a
                routerLink="/search"
                routerLinkActive="font-semibold"
                class="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {{ i18n.t('nav.search') }}
              </a>
              <a
                routerLink="/upload"
                routerLinkActive="font-semibold"
                class="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {{ i18n.t('nav.upload') }}
              </a>
              <a
                routerLink="/settings"
                routerLinkActive="font-semibold"
                class="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {{ i18n.t('nav.settings') }}
              </a>
            </nav>

            <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
              @if (sse.connected()) {
                <span class="badge badge-ok">SSE</span>
              }
              <span class="muted hidden sm:inline">{{ user.email }}</span>
              <button type="button" class="btn" (click)="i18n.toggle()">
                {{ i18n.lang() === 'es' ? 'EN' : 'ES' }}
              </button>
              <button type="button" class="btn" (click)="theme.toggle()">
                {{ theme.theme() === 'light' ? '🌙' : '☀️' }}
              </button>
              <button type="button" class="btn" (click)="logout()">
                {{ i18n.t('nav.logout') }}
              </button>
            </div>
          } @else {
            <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
              <button type="button" class="btn" (click)="i18n.toggle()">
                {{ i18n.lang() === 'es' ? 'EN' : 'ES' }}
              </button>
              <button type="button" class="btn" (click)="theme.toggle()">
                {{ theme.theme() === 'light' ? '🌙' : '☀️' }}
              </button>
              <a class="btn" routerLink="/login">{{ i18n.t('nav.login') }}</a>
              <a class="btn btn-primary" routerLink="/register">{{ i18n.t('nav.register') }}</a>
            </div>
          }
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-4 py-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly theme = inject(ThemeService);
  readonly sse = inject(SseService);

  constructor() {
    effect(() => {
      if (this.auth.user()) {
        this.sse.connect();
      } else {
        this.sse.disconnect();
      }
    });
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigate(['/login'], { replaceUrl: true });
    }
  }
}
