import { createHash } from 'crypto';
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
    document: { create: jest.Mock; update: jest.Mock };
    outboxEvent: { create: jest.Mock };
  };
  let prisma: {
    document: { findUnique: jest.Mock; findFirst: jest.Mock };
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
        update: jest.fn(),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue(undefined) },
    };
    prisma = {
      document: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
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

  it('crea un documento en PROCESSING y normaliza categorías múltiples', async () => {
    const result = await service.create(
      'user-1',
      file({ originalname: 'notas.txt' }),
      dto({
        title: '  Notas técnicas  ',
        tags: 'uno, dos, uno',
        categories: JSON.stringify(['Arquitectura', 'Pruebas', 'Arquitectura']),
      }),
    );

    expect(result.status).toBe('PROCESSING');
    expect(result.trackingId).toBe(result.id);
    expect(result.title).toBe('Notas técnicas');
    expect(result.tags).toEqual(['uno', 'dos']);
    expect(result.categories).toEqual(['Arquitectura', 'Pruebas']);
    expect(result.category).toBe('Arquitectura');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('/original.txt'),
      expect.any(Buffer),
      'text/plain',
    );
    expect(tx.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'PROCESSING',
        title: 'Notas técnicas',
        category: 'Arquitectura',
        categories: ['Arquitectura', 'Pruebas'],
      }),
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

  describe('update', () => {
    beforeEach(() => {
      prisma.document.findFirst = jest.fn().mockResolvedValue(existing());
      tx.document.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing(),
        ...data,
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      }));
    });

    it('rechaza un documento de otro usuario', async () => {
      prisma.document.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.update('user-1', 'doc-1', file(), dto()),
      ).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND', status: 404 });

      expect(storage.put).not.toHaveBeenCalled();
    });

    it('rechaza actualizar mientras el documento se está procesando', async () => {
      prisma.document.findFirst = jest.fn().mockResolvedValue(existing({ status: 'PROCESSING' }));

      await expect(
        service.update('user-1', 'doc-1', file(), dto()),
      ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });

      expect(storage.put).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('no reprocesa cuando el contenido y los metadatos no cambian', async () => {
      const current = existing();
      prisma.document.findFirst = jest.fn().mockResolvedValue(current);

      const result = await service.update(
        'user-1',
        'doc-1',
        file({ buffer: Buffer.from('contenido') }),
        dto({ title: current.title, categories: JSON.stringify(current.categories) }),
      );

      expect(result.status).toBe('INDEXED');
      expect(storage.put).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(tx.document.update).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(outbox.dispatchDocument).not.toHaveBeenCalled();
    });

    it('reemplaza el contenido, invalida el texto normalizado y reencola', async () => {
      const current = existing();

      const result = await service.update(
        'user-1',
        'doc-1',
        file({
          originalname: 'manual-v2.md',
          mimetype: 'text/markdown',
          buffer: Buffer.from('# Nueva version'),
        }),
        dto({ title: 'Manual v2' }),
      );

      expect(storage.delete).toHaveBeenCalledWith(current.normalizedTextKey);
      expect(storage.put).toHaveBeenCalledWith(
        `documents/user-1/doc-1/original.md`,
        expect.any(Buffer),
        'text/markdown',
      );
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { documentId: 'doc-1' } });
      expect(outbox.dispatchDocument).toHaveBeenCalledWith('doc-1');

      expect(tx.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          title: 'Manual v2',
          status: 'PROCESSING',
          indexedAt: null,
          objectKey: 'documents/user-1/doc-1/original.md',
          size: Buffer.byteLength('# Nueva version'),
        }),
      });
      expect(result.status).toBe('PROCESSING');
    });

    it('solo reindexa cuando cambian los metadatos', async () => {
      const current = existing();

      const result = await service.update(
        'user-1',
        'doc-1',
        file({ buffer: Buffer.from('contenido') }),
        dto({ title: 'Titulo corregido' }),
      );

      // El texto normalizado se conserva: el worker lo reutiliza.
      expect(storage.delete).not.toHaveBeenCalled();
      // El contenido no cambió: no se vuelve a escribir el original.
      expect(storage.put).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { documentId: 'doc-1' } });
      expect(tx.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          title: 'Titulo corregido',
          checksum: current.checksum,
          status: 'PROCESSING',
        }),
      });
      expect(result.status).toBe('PROCESSING');
    });

    it('permite actualizar sin archivo para corregir metadatos', async () => {
      await service.update('user-1', 'doc-1', undefined, dto({ title: 'Solo metadatos' }));

      expect(storage.put).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { documentId: 'doc-1' } });
    });

    it('rechaza un formato no admitido', async () => {
      await expect(
        service.update('user-1', 'doc-1', file({ originalname: 'script.exe' }), dto()),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', status: 415 });

      expect(storage.put).not.toHaveBeenCalled();
      expect(tx.document.update).not.toHaveBeenCalled();
    });

    it('rechaza un archivo vacío', async () => {
      await expect(
        service.update('user-1', 'doc-1', file({ buffer: Buffer.alloc(0) }), dto()),
      ).rejects.toMatchObject({ code: 'EMPTY_FILE', status: 422 });
    });
  });
});

interface ExistingDocument {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  author: string | null;
  category: string | null;
  categories: string[];
  version: string | null;
  tags: string[];
  originalFilename: string;
  idempotencyKey: string | null;
  status: string;
  checksum: string;
  mime: string;
  size: number;
  bucket: string;
  objectKey: string;
  normalizedTextKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  indexedAt: Date | null;
}

function existing(overrides: Partial<ExistingDocument> = {}): ExistingDocument {
  return {
    id: 'doc-1',
    userId: 'user-1',
    title: 'Documento de prueba',
    description: null,
    author: null,
    category: null,
    categories: [],
    version: null,
    tags: [],
    originalFilename: 'notas.txt',
    idempotencyKey: null,
    status: 'INDEXED',
    checksum: createHash('sha256').update('contenido').digest('hex'),
    mime: 'text/plain',
    size: 9,
    bucket: 'test-bucket',
    objectKey: 'documents/user-1/doc-1/original.txt',
    normalizedTextKey: 'documents/user-1/doc-1/normalized.txt',
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2026-10-28T00:00:00.000Z'),
    updatedAt: new Date('2026-10-28T00:00:00.000Z'),
    indexedAt: new Date('2026-10-28T00:00:10.000Z'),
    ...overrides,
  };
}

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
