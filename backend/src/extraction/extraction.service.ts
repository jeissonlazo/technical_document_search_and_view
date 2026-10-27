import { Injectable } from '@nestjs/common';
import { extname } from 'path';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { AppError } from '../common/app-error';

const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS ?? 2_000_000);

@Injectable()
export class ExtractionService {
  async extract(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const extension = extname(filename).toLowerCase();

    if (extension === '.pdf') {
      return this.extractPdf(buffer);
    }

    if (extension === '.docx') {
      return this.extractDocx(buffer);
    }

    if (extension === '.txt' || extension === '.md' || extension === '.markdown') {
      return this.extractText(buffer);
    }

    throw new AppError(
      'UNSUPPORTED_FILE_TYPE',
      'El formato no está admitido. Sube TXT, PDF, Markdown o DOCX.',
      415,
      false,
      { mime },
    );
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new AppError('FILE_CORRUPTED', 'El PDF está dañado o no se puede leer.', 422, false);
    }

    try {
      const data = await pdfParse(buffer);
      const text = normalize(data.text);
      if (!text) {
        throw new AppError(
          'NO_EXTRACTABLE_TEXT',
          'No encontramos texto seleccionable en el PDF. Esta versión no incluye OCR.',
          422,
          false,
        );
      }
      return text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('password') || message.includes('encrypt')) {
        throw new AppError(
          'PASSWORD_PROTECTED',
          'El PDF está protegido con contraseña. Sube una copia desbloqueada.',
          422,
          false,
        );
      }
      throw new AppError('FILE_CORRUPTED', 'El PDF está dañado o no se puede leer.', 422, false);
    }
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new AppError('DOCX_CORRUPTED', 'El documento Word está dañado o no se puede leer.', 422, false);
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = normalize(result.value);
      if (!text) {
        throw new AppError(
          'DOCX_EXTRACTION_FAILED',
          'No se pudo extraer texto del documento Word.',
          422,
          false,
        );
      }
      return text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'DOCX_EXTRACTION_FAILED',
        'No se pudo extraer texto del documento Word.',
        422,
        false,
      );
    }
  }

  private extractText(buffer: Buffer): string {
    const text = buffer.toString('utf8');
    if (text.includes('\uFFFD')) {
      throw new AppError(
        'UNSUPPORTED_ENCODING',
        'El archivo no está en UTF-8. Guarda el texto en UTF-8 y vuelve a intentarlo.',
        422,
        false,
      );
    }

    const normalized = normalize(text);
    if (!normalized) {
      throw new AppError('EMPTY_FILE', 'El archivo está vacío.', 422, false);
    }
    return normalized;
  }
}

function normalize(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
