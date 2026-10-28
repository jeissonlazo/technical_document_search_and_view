import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideCheckCircle2,
  lucideLoaderCircle,
  lucideRotateCcw,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import { I18nService } from '../../../core/i18n.service';
import type { UploadAlert, UploadAlertKind } from '../upload.models';

@Component({
  selector: 'app-upload-alert-stack',
  standalone: true,
  imports: [NgIcon, HlmAlertImports, HlmButton],
  providers: [
    provideIcons({
      lucideAlertCircle,
      lucideCheckCircle2,
      lucideLoaderCircle,
      lucideRotateCcw,
      lucideUpload,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed bottom-5 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      @for (alert of alerts(); track alert.id) {
        <hlm-alert [class]="alertClass(alert.kind)" [variant]="alert.kind === 'error' ? 'destructive' : 'default'">
          <ng-icon [name]="iconName(alert.kind)" [class.animate-spin]="alert.kind === 'processing'" />
          <h4 hlmAlertTitle>{{ alert.title }}</h4>
          <p hlmAlertDescription>{{ alert.message }}</p>
          <div hlmAlertAction>
            <button
              hlmBtn
              variant="ghost"
              size="icon-sm"
              type="button"
              (click)="dismiss.emit(alert.id)"
              [attr.aria-label]="i18n.t('upload.alertDismiss')"
            >
              ×
            </button>
          </div>
        </hlm-alert>
      }
    </div>
  `,
})
export class UploadAlertStackComponent {
  readonly i18n = inject(I18nService);
  readonly alerts = input.required<UploadAlert[]>();
  readonly dismiss = output<number>();

  iconName(kind: UploadAlertKind): string {
    switch (kind) {
      case 'uploaded':
        return 'lucideUpload';
      case 'processing':
        return 'lucideLoaderCircle';
      case 'indexed':
        return 'lucideCheckCircle2';
      case 'retry':
        return 'lucideRotateCcw';
      case 'error':
        return 'lucideAlertCircle';
    }
  }

  alertClass(kind: UploadAlertKind): string {
    switch (kind) {
      case 'uploaded':
        return 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-50';
      case 'processing':
        return 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50';
      case 'indexed':
        return 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50';
      case 'retry':
        return 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-50';
      case 'error':
        return 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50';
    }
  }
}
