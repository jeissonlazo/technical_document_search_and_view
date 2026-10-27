import { Injectable, signal } from '@angular/core';
import type { AuthUser } from '@docs/shared';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly user = signal<AuthUser | null>(null);
  readonly csrfToken = signal<string | null>(null);
}
