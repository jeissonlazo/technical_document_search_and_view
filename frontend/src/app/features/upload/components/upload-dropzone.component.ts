import { Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../../core/i18n.service';

@Component({
  selector: 'app-upload-dropzone',
  standalone: true,
  template: `
    <button
      type="button"
      class="dropzone w-full rounded-xl p-8 text-center"
      [class.dropzone-active]="dragActive()"
      (click)="browse.emit()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <span
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style="background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </span>

      <span class="mt-4 block text-lg font-semibold">
        {{ i18n.t(dragActive() ? 'upload.dropActive' : 'upload.dropTitle') }}
      </span>
      <span class="mt-1 block text-sm muted">{{ i18n.t('upload.dropHint') }}</span>
      <span class="btn mt-4 inline-flex">{{ i18n.t('upload.browse') }}</span>
      <span class="mt-3 block text-xs muted">{{ i18n.t('upload.formats') }}</span>
    </button>
  `,
})
export class UploadDropzoneComponent {
  readonly i18n = inject(I18nService);

  readonly dragActive = input(false);
  readonly browse = output<void>();
  readonly filesDropped = output<File[]>();
  readonly dragActiveChange = output<boolean>();

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragActiveChange.emit(true);
  }

  onDragLeave(event: DragEvent): void {
    const current = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget;
    if (current && related instanceof Node && current.contains(related)) return;
    this.dragActiveChange.emit(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActiveChange.emit(false);
    this.filesDropped.emit(Array.from(event.dataTransfer?.files ?? []));
  }
}
