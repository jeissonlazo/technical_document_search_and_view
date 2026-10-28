import { Component, computed, inject, input } from '@angular/core';
import { HlmBadge } from '@spartan-ng/helm/badge';
import type { DocumentStatus } from '@docs/shared';
import { I18nService } from '../../core/i18n.service';

export type DisplayStatus = DocumentStatus | 'PENDING' | 'UPLOADING';

@Component({
  selector: 'app-document-status-badge',
  standalone: true,
  imports: [HlmBadge],
  template: `<span hlmBadge variant="outline" [class]="toneClass()">{{ labelText() }}</span>`,
})
export class DocumentStatusBadgeComponent {
  private readonly i18n = inject(I18nService);

  readonly status = input.required<DisplayStatus>();
  readonly label = input<string | undefined>(undefined);

  readonly labelText = computed(() => {
    const explicit = this.label();
    if (explicit) return explicit;

    if (this.status() === 'PENDING') return this.i18n.lang() === 'es' ? 'Pendiente' : 'Pending';
    if (this.status() === 'UPLOADING') return this.i18n.lang() === 'es' ? 'Subiendo' : 'Uploading';
    return this.i18n.t(`status.${this.status()}`);
  });

  readonly toneClass = computed(() => {
    if (this.status() === 'INDEXED') return 'badge-ok';
    if (this.status() === 'ERROR') return 'badge-error';
    return 'badge-warn';
  });
}
