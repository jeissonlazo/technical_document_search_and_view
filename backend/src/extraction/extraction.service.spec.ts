import { ExtractionService } from './extraction.service';

describe('ExtractionService', () => {
  const service = new ExtractionService();

  it('extrae texto UTF-8 de un TXT', async () => {
    const text = await service.extract(Buffer.from('Hola mundo'), 'text/plain', 'notas.txt');
    expect(text).toBe('Hola mundo');
  });

  it('extrae texto de Markdown', async () => {
    const text = await service.extract(Buffer.from('# Título\n\nContenido'), 'text/markdown', 'doc.md');
    expect(text).toContain('# Título');
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
});
