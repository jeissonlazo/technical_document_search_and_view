import { Component, computed, input } from '@angular/core';

type IconSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-document-icon',
  standalone: true,
  template: `<span [class]="classes()">{{ extension() }}</span>`,
})
export class DocumentIconComponent {
  readonly mime = input<string | null | undefined>(undefined);
  readonly title = input<string | null | undefined>(undefined);
  readonly filename = input<string | null | undefined>(undefined);
  readonly size = input<IconSize>('md');

  readonly extension = computed(() => {
    const name = this.filename() || this.title() || '';
    const extension = name.split('.').pop();
    if (extension && extension !== name) return extension.toUpperCase().slice(0, 4);

    const mime = this.mime() ?? '';
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('markdown')) return 'MD';
    if (mime.includes('wordprocessingml')) return 'DOCX';
    if (mime.includes('text/plain')) return 'TXT';
    return 'DOC';
  });

  readonly classes = computed(() => {
    const mime = this.mime() ?? '';
    const extension = this.extension().toLowerCase();
    const tone = mime.includes('pdf') || extension === 'pdf'
      ? 'doc-icon-pdf'
      : mime.includes('markdown') || extension === 'md' || extension === 'markdown'
        ? 'doc-icon-md'
        : mime.includes('wordprocessingml') || extension === 'docx'
          ? 'doc-icon-docx'
          : 'doc-icon-txt';

    const sizeClass =
      this.size() === 'lg'
        ? 'doc-icon-lg'
        : this.size() === 'xl'
          ? 'doc-icon-xl'
          : this.size() === 'sm'
            ? 'doc-icon-sm'
            : '';

    return ['doc-icon', tone, sizeClass].filter(Boolean).join(' ');
  });
}
