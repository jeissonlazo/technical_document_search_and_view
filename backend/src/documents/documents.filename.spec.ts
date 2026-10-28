import { AppError } from '../common/app-error';
import { validateFilename } from './documents.service';

describe('validateFilename', () => {
  it('acepta nombres normales y Unicode', () => {
    expect(validateFilename('manual.pdf')).toBe('manual.pdf');
    expect(validateFilename('  guía técnica.md  ')).toBe('guía técnica.md');
  });

  it('rechaza rutas y separadores', () => {
    expect(() => validateFilename('../evil.txt')).toThrow(AppError);
    expect(() => validateFilename('carpeta\\archivo.txt')).toThrow(AppError);
    expect(() => validateFilename('/etc/passwd')).toThrow(AppError);
  });

  it('rechaza nombres reservados de Windows', () => {
    expect(() => validateFilename('CON.txt')).toThrow(AppError);
    expect(() => validateFilename('LPT1.md')).toThrow(AppError);
  });

  it('rechaza caracteres de control y especiales', () => {
    expect(() => validateFilename('bad:name.txt')).toThrow(AppError);
    expect(() => validateFilename('bad\u0000name.txt')).toThrow(AppError);
  });

  it('recorta espacios y rechaza nombres que terminan en punto', () => {
    expect(validateFilename('archivo.txt ')).toBe('archivo.txt');
    expect(() => validateFilename('archivo.txt.')).toThrow(AppError);
  });

  it('rechaza nombres demasiado largos o vacíos', () => {
    expect(() => validateFilename('a'.repeat(201))).toThrow(AppError);
    expect(() => validateFilename('   ')).toThrow(AppError);
  });
});
