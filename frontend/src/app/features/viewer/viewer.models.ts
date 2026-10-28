export interface ViewerTocItem {
  id: string;
  label: string;
  level: number;
}

export type ViewerFormat = 'pdf' | 'docx' | 'markdown' | 'text';
