import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(SessionStore);
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const csrf = store.csrfToken();

  const cloned = request.clone({
    withCredentials: true,
    setHeaders: isWrite && csrf ? { 'X-CSRF-Token': csrf } : {},
  });

  return next(cloned).pipe(
    catchError((error) => {
      if (error?.status === 401) {
        store.user.set(null);
        store.csrfToken.set(null);
      }
      return throwError(() => error);
    }),
  );
};
