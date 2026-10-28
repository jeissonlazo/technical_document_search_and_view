import { DocumentsService } from './documents.service';
import type { CreateDocumentDto } from './documents.dto';

describe('DocumentsService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, number | string> = {
        'limits.maxFileSizeBytes': 25 * 1024 * 1024,
        'limits.maxBatchFiles': 20,
        'limits.maxBatchTotalBytes': 100 * 1024 * 1024,
        'r2.bucket': 'test-bucket',
      };
      return values[key];
    }),
  };

  let tx: {
    document: { create: jest.Mock };
    outboxEvent: { create: jest.Mock };
  };
  let prisma: {
    document: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: { put: jest.Mock; delete: jest.Mock };
  let outbox: { dispatchDocument: jest.Mock };
  let service: DocumentsService;

  beforeEach(() => {
    tx = {
      document: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date('2026-10-28T00:00:00.000Z'),
          updatedAt: new Date('2026-10-28T00:00:00.000Z'),
          indexedAt: null,
          errorCode: null,
          errorMessage: null,
        })),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue(undefined) },
    };
    prisma = {
      document: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    outbox = { dispatchDocument: jest.fn().mockResolvedValue(undefined) };
    service = new DocumentsService(
      prisma as never,
      config as never,
      outbox as never,
      storage as never,
    );
  });

  it('rechaza una carga sin archivo', async () => {
    await expect(service.create('user-1', undefined, dto())).rejects.toMatchObject({
      code: 'FILE_REQUIRED',
      status: 422,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rechaza una extensión no admitida', async () => {
    await expect(
      service.create('user-1', file({ originalname: 'malware.exe' }), dto()),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rechaza un PDF con firma inválida', async () => {
    await expect(
      service.create(
        'user-1',
        file({ originalname: 'roto.pdf', mimetype: 'application/pdf', buffer: Buffer.from('no es pdf') }),
        dto(),
      ),
    ).rejects.toMatchObject({ code: 'FILE_CORRUPTED' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('crea un documento en PROCESSING y encola la indexación', async () => {
    const result = await service.create(
      'user-1',
      file({ originalname: 'notas.txt' }),
      dto({ title: '  Notas técnicas  ', tags: 'uno, dos, uno' }),
    );

    expect(result.status).toBe('PROCESSING');
    expect(result.trackingId).toBe(result.id);
    expect(result.title).toBe('Notas técnicas');
    expect(result.tags).toEqual(['uno', 'dos']);
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('/original.txt'),
      expect.any(Buffer),
      'text/plain',
    );
    expect(tx.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PROCESSING', title: 'Notas técnicas' }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: { documentId: result.id },
    });
    expect(outbox.dispatchDocument).toHaveBeenCalledWith(result.id);
  });

  it('rechaza un lote sin archivos', async () => {
    await expect(service.createBatch('user-1', [], '[]')).rejects.toMatchObject({
      code: 'FILE_REQUIRED',
    });
  });

  it('rechaza un lote con cantidad de metadatos distinta a los archivos', async () => {
    await expect(
      service.createBatch('user-1', [file({ originalname: 'uno.txt' })], '[]'),
    ).rejects.toMatchObject({
      code: 'INVALID_METADATA',
      status: 422,
    });
  });
});

function dto(overrides: Partial<CreateDocumentDto> = {}): CreateDocumentDto {
  return { title: 'Documento de prueba', ...overrides } as CreateDocumentDto;
}

function file(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const buffer = overrides.buffer ?? Buffer.from('contenido');
  return {
    fieldname: 'file',
    originalname: 'notas.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  } as Express.Multer.File;
}
