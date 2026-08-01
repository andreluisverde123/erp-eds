import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile, access } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { StorageDriver } from './storage.types';

/// Disco local — o comportamento que o sistema sempre teve. Continua sendo o
/// padrão em desenvolvimento e serve instalação em servidor único.
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(
      process.cwd(),
      configService.get<string>('STORAGE_LOCAL_ROOT') ?? 'uploads',
    );
  }

  async save(key: string, content: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async getStream(key: string): Promise<Readable> {
    const path = this.resolveKey(key);
    if (!(await this.exists(key))) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return createReadStream(path);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch {
      // Remover algo que já não existe não é erro para quem chamou.
    }
  }

  /// A key vem de dados do banco; um `../../` aqui viraria leitura de
  /// arquivo fora da pasta de uploads. O caminho final é conferido contra a
  /// raiz antes de tocar o disco.
  private resolveKey(key: string): string {
    const path = resolve(join(this.root, normalize(key)));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return path;
  }
}
