import { ExtractionService } from './extraction.service';

describe('ExtractionService', () => {
  const service = new ExtractionService({
    get: (key: string) => (key === 'processing.maxTextChars' ? 2_000_000 : undefined),
  } as never);

  it('extrae texto UTF-8 de un TXT', async () => {
    const text = await service.extract(Buffer.from('Hola mundo'), 'text/plain', 'notas.txt');
    expect(text).toBe('Hola mundo');
  });

  it('extrae texto de Markdown', async () => {
    const text = await service.extract(Buffer.from('# Título\n\nContenido'), 'text/markdown', 'doc.md');
    expect(text).toContain('# Título');
  });

  it('quita el BOM UTF-8 al inicio', async () => {
    const text = await service.extract(Buffer.from('\uFEFFHola'), 'text/plain', 'bom.txt');
    expect(text).toBe('Hola');
  });

  it('rechaza un formato no admitido', async () => {
    await expect(
      service.extract(Buffer.from('binario'), 'application/octet-stream', 'archivo.bin'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('rechaza un TXT vacío', async () => {
    await expect(service.extract(Buffer.from('   '), 'text/plain', 'vacio.txt')).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    });
  });

  it('respeta el límite configurado de caracteres', async () => {
    const limited = new ExtractionService({
      get: (key: string) => (key === 'processing.maxTextChars' ? 10 : undefined),
    } as never);
    await expect(limited.extract(Buffer.from('a'.repeat(50)), 'text/plain', 'largo.txt')).resolves.toHaveLength(10);
  });
});
