import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { STORAGE_DRIVER, type ByteRange, type StorageDriver } from './storage.types';

/// Fachada usada pelos módulos de domínio: eles não sabem (nem precisam
/// saber) se o arquivo foi parar no disco ou num bucket.
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  /// Gera o nome final do arquivo e o grava. O nome NUNCA vem do cliente
  /// (só a extensão): nome original é dado não confiável e já foi vetor de
  /// path traversal em muita aplicação.
  async saveUpload(
    folder: string,
    file: Express.Multer.File,
  ): Promise<{ key: string; fileUrl: string }> {
    const key = `${folder}/${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await this.driver.save(key, file.buffer, file.mimetype);
    return { key, fileUrl: `/uploads/${key}` };
  }

  getStream(key: string, range?: ByteRange) {
    return this.driver.getStream(key, range);
  }

  exists(key: string) {
    return this.driver.exists(key);
  }

  remove(key: string) {
    return this.driver.remove(key);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): StorageDriver =>
        configService.get<string>('STORAGE_DRIVER') === 's3'
          ? new S3StorageDriver(configService)
          : new LocalStorageDriver(configService),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
