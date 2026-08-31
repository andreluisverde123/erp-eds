import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ByteRange, StorageDriver } from './storage.types';

/// Armazenamento em bucket S3 (AWS, MinIO, Cloudflare R2, Supabase Storage —
/// qualquer um compatível, via `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`).
///
/// Os arquivos continuam sendo servidos PELA API (`/uploads/...`), não por URL
/// assinada: uma URL assinada vale por tempo, escapa dos guards de permissão e
/// pode ser repassada. Custa banda do servidor e mantém o modelo de acesso que
/// o sistema já tem — troca deliberada.
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
    const endpoint = configService.get<string>('S3_ENDPOINT');

    this.client = new S3Client({
      region: configService.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      ...(endpoint ? { endpoint } : {}),
      // MinIO e afins não suportam bucket no subdomínio.
      //
      // A comparação NÃO pode ser com a string 'true': o Joi (env.validation)
      // declara este campo como boolean e já converte o valor do .env, então
      // aqui chega `true` de verdade. Comparando com string, o path style
      // ficava sempre desligado e o SDK montava `http://bucket.localhost:9000`
      // — que responde "NoSuchBucket" e manda depurar o lugar errado.
      forcePathStyle: parseBoolean(configService.get('S3_FORCE_PATH_STYLE')),
    });

    this.logger.log(
      `Storage S3 ativo (bucket ${this.bucket}${endpoint ? `, endpoint ${endpoint}` : ''}).`,
    );
  }

  async save(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async getStream(key: string, range?: ByteRange): Promise<Readable> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          // O S3 fala o mesmo dialeto do HTTP aqui, então o trecho é repassado
          // como veio: o bucket entrega só a faixa, e a API não precisa ler o
          // objeto inteiro para recortar.
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      );
      if (!result.Body) throw new NotFoundException('Arquivo não encontrado.');
      return result.Body as Readable;
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundException('Arquivo não encontrado.');
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
