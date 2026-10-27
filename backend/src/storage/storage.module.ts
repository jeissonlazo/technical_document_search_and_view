import { Global, Module } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';
import { OBJECT_STORAGE } from './storage.types';

@Global()
@Module({
  providers: [
    R2StorageService,
    {
      provide: OBJECT_STORAGE,
      useExisting: R2StorageService,
    },
  ],
  exports: [OBJECT_STORAGE, R2StorageService],
})
export class StorageModule {}
