import { Readable } from 'stream';
import { UnrecoverableError } from 'bullmq';
import { AppError } from '../common/app-error';
import { DocumentProcessor } from './document.processor';

describe('DocumentProcessor', () => {
  const document = {
    id: 'doc-1',
    userId: 'user-1',
    title: 'Manual',
    description: null,
    author: null,
    category: null,
    version: null,
    tags: [],
    status: 'RECEIVED',
    mime: 'text/plain',
    objectKey: 'documents/user-1/doc-1/original.txt',
    normalizedTextKey: 'documents/user-1/doc-1/normalized.txt',
    createdAt: new Date('2026-10-28T00:00:00.000Z'),
  };

  let prisma: {
    document: { findUnique: jest.Mock; update: jest.Mock };
  };
  let storage: { get: jest.Mock; put: jest.Mock };
  let extraction: { extract: jest.Mock };
  let search: { indexDocument: jest.Mock };
  let events: { publish: jest.Mock };
  let processor: DocumentProcessor;

  beforeEach(() => {
    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    storage = {
      get: jest.fn((key: string) => {
        if (key === document.normalizedTextKey) {
          return Promise.reject(new Error('normalized no existe'));
        }
        return Promise.resolve({
          body: Readable.from([Buffer.from('contenido de prueba')]),
        });
      }),
      put: jest.fn().mockResolvedValue(undefined),
    };
    extraction = {
      extract: jest.fn().mockResolvedValue('contenido de prueba'),
    };
    search = {
      indexDocument: jest.fn().mockResolvedValue(undefined),
    };
    events = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    processor = new DocumentProcessor(
      prisma as never,
      extraction as never,
      search as never,
      events as never,
      storage as never,
      { get: () => 60_000 } as never,
    );
  });

  it('no reprocesa un documento ya indexado', async () => {
    prisma.document.findUnique.mockResolvedValue({ ...document, status: 'INDEXED' });

    await processor.process(job(0));

    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('mantiene PROCESSING en un fallo transitorio con intentos restantes', async () => {
    search.indexDocument.mockRejectedValue(
      new AppError('SEARCH_ENGINE_UNAVAILABLE', 'Elasticsearch no disponible', 503, true),
    );

    await expect(processor.process(job(0))).rejects.toBeInstanceOf(AppError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: expect.objectContaining({ status: 'PROCESSING' }),
    });
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'PROCESSING', stage: 'retry' }),
    );
  });

  it('marca ERROR en el último intento transitorio', async () => {
    search.indexDocument.mockRejectedValue(
      new AppError('SEARCH_ENGINE_UNAVAILABLE', 'Elasticsearch no disponible', 503, true),
    );

    await expect(processor.process(job(3))).rejects.toBeInstanceOf(AppError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: expect.objectContaining({
        status: 'ERROR',
        errorCode: 'SEARCH_ENGINE_UNAVAILABLE',
      }),
    });
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ERROR', retryable: true }),
    );
  });

  it('marca ERROR y no reintenta un fallo permanente', async () => {
    search.indexDocument.mockRejectedValue(
      new AppError('INDEXING_FAILED', 'Documento rechazado', 500, false),
    );

    await expect(processor.process(job(0))).rejects.toBeInstanceOf(UnrecoverableError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: expect.objectContaining({ status: 'ERROR', errorCode: 'INDEXING_FAILED' }),
    });
  });

  it('reutiliza normalized.txt en un reintento', async () => {
    storage.get.mockImplementation((key: string) => {
      if (key === document.normalizedTextKey) {
        return Promise.resolve({ body: Readable.from([Buffer.from('texto ya normalizado')]) });
      }
      return Promise.reject(new Error('no debería leer el original'));
    });

    await processor.process(job(1));

    expect(extraction.extract).not.toHaveBeenCalled();
    expect(search.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1' }),
      'texto ya normalizado',
    );
  });

  it('indexa y publica INDEXED en el camino feliz', async () => {
    await processor.process(job(0));

    expect(storage.get).toHaveBeenCalledWith(document.objectKey);
    expect(extraction.extract).toHaveBeenCalled();
    expect(search.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1', userId: 'user-1' }),
      'contenido de prueba',
    );
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: expect.objectContaining({ status: 'INDEXED' }),
    });
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'INDEXED', stage: 'indexing' }),
    );
  });
});

function job(attemptsMade: number) {
  return {
    data: { documentId: 'doc-1' },
    attemptsMade,
    opts: { attempts: 4 },
  } as never;
}
