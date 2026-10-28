import type { DocumentStatus } from '@docs/shared';
import type { UploadMetadata } from '../../core/api.service';

/** Campos de la ficha del documento que acompañan al Markdown en la carga. */
export interface DraftMetadata {
  title: string;
  description: string;
  author: string;
  category: string;
  categories: string[];
  version: string;
  tags: string;
}

/** Estado de publicación de la página: borrador local o estado real del documento. */
export type DraftStatus = 'IDLE' | 'PUBLISHING' | DocumentStatus;

export interface DraftStats {
  words: number;
  characters: number;
  headings: number;
  readingMinutes: number;
}

/** Vista activa del área de trabajo del editor. */
export type EditorView = 'edit' | 'markdown';

/** Acciones que la barra de herramientas delega en el editor. */
export type EditorCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'heading'; level: 1 | 2 | 3 }
  | { type: 'paragraph' }
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'codeBlock' }
  | { type: 'blockquote' }
  | { type: 'bulletList' }
  | { type: 'orderedList' }
  | { type: 'horizontalRule' }
  | { type: 'link' }
  | { type: 'table' }
  | { type: 'rowAdd' }
  | { type: 'columnAdd' }
  | { type: 'rowRemove' }
  | { type: 'columnRemove' }
  | { type: 'tableRemove' }
  | { type: 'clear' };

/** Estado derivado del editor que la barra usa para resaltar botones. */
export interface EditorToolbarState {
  active: ReadonlySet<string>;
  canUndo: boolean;
  canRedo: boolean;
}

export const EMPTY_DRAFT_METADATA: DraftMetadata = {
  title: '',
  description: '',
  author: '',
  category: '',
  categories: [],
  version: '',
  tags: '',
};

/** Nombres reservados por Windows: el backend rechaza el archivo si el nombre coincide. */
const RESERVED_FILENAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const MAX_SLUG_LENGTH = 80;

/**
 * Convierte el título en un nombre `.md` seguro: sin acentos, espacios ni
 * caracteres que el backend considere inválidos.
 */
export function markdownFilename(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  const base = slug || 'documento';
  return `${RESERVED_FILENAMES.has(base.toUpperCase()) ? `${base}-documento` : base}.md`;
}

/** Envuelve el Markdown en un `File` que el API acepta como carga normal. */
export function markdownFile(markdown: string, title: string): File {
  return new File([markdown], markdownFilename(title), { type: 'text/markdown' });
}

/** Métricas simples del borrador para orientar al autor. */
export function draftStats(markdown: string): DraftStats {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~|]/g, ' ');

  const words = plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const characters = markdown.replace(/\s/g, '').length;
  const headings = (markdown.match(/^[ \t]{0,3}#{1,6}\s+/gm) ?? []).length;

  return {
    words,
    characters,
    headings,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)),
  };
}

/** Normaliza una lista escrita a mano (comas) sin duplicados. */
export function tagList(tags: string): string[] {
  return Array.from(
    new Set(
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

/** Traduce el borrador al contrato multipart que espera `POST /api/documents`. */
export function toUploadMetadata(metadata: DraftMetadata): UploadMetadata {
  const categories = Array.from(
    new Set(metadata.categories.map((category) => category.trim()).filter(Boolean)),
  ).slice(0, 20);

  return {
    title: metadata.title.trim(),
    description: metadata.description.trim(),
    author: metadata.author.trim(),
    category: categories[0] ?? metadata.category.trim(),
    categories,
    version: metadata.version.trim(),
    tags: tagList(metadata.tags).join(','),
  };
}
