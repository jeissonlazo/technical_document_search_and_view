import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AuthUser } from '@docs/shared';
import { SessionStore } from './session.store';

interface AuthResponse {
  user: AuthUser;
  csrfToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(SessionStore);

  readonly user = this.store.user.asReadonly();
  readonly csrfToken = this.store.csrfToken.asReadonly();

  async loadMe(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<AuthResponse>('/api/auth/me', { withCredentials: true }),
      );
      this.apply(response);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(
        '/api/auth/login',
        { email, password },
        { withCredentials: true },
      ),
    );
    this.apply(response);
    return response.user;
  }

  async register(email: string, password: string): Promise<AuthUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(
        '/api/auth/register',
        { email, password },
        { withCredentials: true },
      ),
    );
    this.apply(response);
    return response.user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}, { withCredentials: true }));
    } finally {
      this.clear();
    }
  }

  clear(): void {
    this.store.user.set(null);
    this.store.csrfToken.set(null);
  }

  private apply(response: AuthResponse): void {
    this.store.user.set(response.user);
    this.store.csrfToken.set(response.csrfToken);
  }
}
