import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, existsSync } from "fs";
import { copyFile, mkdir, open, readFile, rm, stat, writeFile } from "fs/promises";
import nodemailer from "nodemailer";
import path from "path";
import { Readable } from "stream";
import { Prisma } from "@fixotec/db";
import { PrismaService } from "./prisma.service";

function repoRoot() {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.resolve(current, "..");
  }
  return path.resolve(process.cwd(), "../..");
}

function isDecimal(value: unknown): value is { toNumber: () => number } {
  return Boolean(value && typeof value === "object" && (value as { constructor?: { name?: string } }).constructor?.name === "Decimal");
}

export function toPlain<T>(value: T): T {
  if (typeof value === "bigint") {
    return (value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()) as T;
  }
  if (isDecimal(value)) return value.toNumber() as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map((item) => toPlain(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toPlain(item)])) as T;
  }
  return value;
}

export type Tx = Prisma.TransactionClient;

const SECRET_KEYS = /^(passwordHash|mfaSecret|mfaRecoveryCodes|token|tokenHash|secret|accountNo)$/i;

/** Removes secrets before a snapshot is written to the audit log. */
function redact(value: unknown): unknown {
  const plain = toPlain(value);
  if (Array.isArray(plain)) return plain.map(redact);
  if (plain && typeof plain === "object") {
    return Object.fromEntries(Object.entries(plain as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEYS.test(key) ? "[redacted]" : redact(item)]));
  }
  return plain;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: { actorId?: string | null; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; ip?: string }, tx?: Tx) {
    return (tx || this.prisma).auditLog.create({
      data: {
        actorId: input.actorId || undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before === undefined || input.before === null ? undefined : (redact(input.before) as Prisma.InputJsonValue),
        after: input.after === undefined || input.after === null ? undefined : (redact(input.after) as Prisma.InputJsonValue),
        ip: input.ip || undefined,
      },
    });
  }
}

@Injectable()
export class NumberService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the business transaction so a rolled-back create does not consume a number (gap-free invoice series). */
  async next(key: string, tx?: Tx) {
    const row = await (tx || this.prisma).numberSequence.update({ where: { key }, data: { next: { increment: 1 } } }).catch((error: { code?: string }) => {
      if (error?.code === "P2025") throw new InternalServerErrorException(`Number sequence ${key} is not configured`);
      throw error;
    });
    return `${row.prefix}${String(row.next - 1).padStart(row.pad, "0")}`;
  }
}

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  record(entityType: string, entityId: string, fromStatus: string | null, toStatus: string, actorId?: string, comment?: string, tx?: Tx) {
    return (tx || this.prisma).workflowEvent.create({
      data: { entityType, entityId, fromStatus, toStatus, actorId, comment },
    });
  }
}

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async usersWithRole(roleKey: string) {
    return this.prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: roleKey } } } },
    });
  }

  async push(userIds: Array<string | null | undefined>, title: string, body: string, entityType?: string, entityId?: string) {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, title, body, entityType, entityId, channel: "IN_APP" })),
    });
    if (!process.env.SMTP_HOST) return;
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    for (const user of users) {
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || "Fixotec <noreply@fixotec.local>",
          to: user.email,
          subject: title,
          text: body,
        });
        await this.prisma.notification.updateMany({
          where: { userId: user.id, title, entityId: entityId || undefined },
          data: { emailStatus: "SENT" },
        });
      } catch (error) {
        this.logger.warn(`Email failed for ${user.email}: ${(error as Error).message}`);
      }
    }
  }
}

/** Storage keys are relative POSIX paths built from safe segments; anything else is a programming or injection error. */
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function assertStorageKey(key: string) {
  if (key.length > 400 || !STORAGE_KEY.test(key) || key.split("/").some((part) => part === "." || part === "..")) {
    throw new BadRequestException("Invalid file reference");
  }
  return key;
}

/** Reduces an uploaded file name to a safe single path segment (keeps the extension). */
export function safeFileName(name: string, fallback = "file") {
  const base = path.basename(String(name || "").replace(/\\/g, "/"));
  const cleaned = base.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^[._-]+/, "").slice(-120);
  return cleaned || fallback;
}

/** RFC 6266 / 5987 attachment header: ASCII fallback plus UTF-8 name, immune to header injection. */
export function contentDisposition(fileName: string, disposition: "attachment" | "inline" = "attachment") {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;\r\n]/g, "_").slice(0, 150) || "download";
  const encoded = encodeURIComponent(fileName.slice(0, 200)).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger("Storage");
  private client: S3Client | null | undefined;

  root() {
    return path.resolve(process.env.STORAGE_ROOT || path.join(repoRoot(), "storage"));
  }

  private s3() {
    if (process.env.STORAGE_DRIVER !== "s3") return null;
    if (this.client !== undefined) return this.client;
    if (!process.env.S3_BUCKET || !process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
      throw new InternalServerErrorException("S3 storage is selected but not configured");
    }
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    });
    return this.client;
  }

  /** Resolves a key under the storage root and refuses anything that would escape it. */
  private localPath(key: string) {
    const root = this.root();
    const full = path.resolve(root, ...assertStorageKey(key).split("/"));
    if (full !== root && !full.startsWith(root + path.sep)) throw new BadRequestException("Invalid file reference");
    return full;
  }

  async put(key: string, body: Buffer, mimeType: string) {
    assertStorageKey(key);
    const client = this.s3();
    if (client) {
      await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: mimeType }));
      return { driver: "s3" as const };
    }
    const full = this.localPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { driver: "local" as const };
  }

  /** Stores a file that is already on disk (large uploads) without loading it into memory. */
  async putFile(key: string, filePath: string, size: number, mimeType: string) {
    assertStorageKey(key);
    const client = this.s3();
    if (client) {
      await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: createReadStream(filePath), ContentLength: size, ContentType: mimeType }));
      return { driver: "s3" as const };
    }
    const full = this.localPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await copyFile(filePath, full);
    return { driver: "local" as const };
  }

  async get(key: string) {
    assertStorageKey(key);
    const client = this.s3();
    try {
      if (client) {
        const result = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
        const bytes = await result.Body?.transformToByteArray();
        if (!bytes) throw new Error("Empty object");
        return Buffer.from(bytes);
      }
      return await readFile(this.localPath(key));
    } catch (error) {
      throw this.missing(key, error);
    }
  }

  /** Readable stream of an object, so multi-hundred-MB CAD models are never buffered. */
  async stream(key: string): Promise<{ body: Readable; size?: number }> {
    assertStorageKey(key);
    const client = this.s3();
    try {
      if (client) {
        const result = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
        if (!result.Body) throw new Error("Empty object");
        return { body: result.Body as Readable, size: result.ContentLength };
      }
      const full = this.localPath(key);
      const info = await stat(full);
      return { body: createReadStream(full), size: info.size };
    } catch (error) {
      throw this.missing(key, error);
    }
  }

  /** Size and the first bytes of an object; used to verify files that were uploaded straight to S3. */
  async head(key: string, bytes: number) {
    assertStorageKey(key);
    const client = this.s3();
    try {
      if (client) {
        const meta = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
        const part = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }));
        const head = Buffer.from((await part.Body?.transformToByteArray()) || []);
        return { size: Number(meta.ContentLength || 0), head };
      }
      const full = this.localPath(key);
      const handle = await open(full, "r");
      try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return { size: (await handle.stat()).size, head: buffer.subarray(0, bytesRead) };
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw this.missing(key, error);
    }
  }

  async remove(key: string) {
    assertStorageKey(key);
    const client = this.s3();
    if (client) {
      await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })).catch(() => undefined);
      return;
    }
    await rm(this.localPath(key), { force: true });
  }

  /** Presigned PUT for direct browser-to-bucket uploads; null when files are stored on local disk. */
  async presignPut(key: string, mimeType: string, size: number, expiresIn = 3600) {
    assertStorageKey(key);
    const client = this.s3();
    if (!client) return null;
    return getSignedUrl(client, new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: mimeType, ContentLength: size }), { expiresIn });
  }

  async createMultipart(key: string, mimeType: string) {
    assertStorageKey(key);
    const client = this.s3();
    if (!client) return null;
    const result = await client.send(new CreateMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: mimeType }));
    if (!result.UploadId) throw new InternalServerErrorException("Object storage did not start a multipart upload");
    return result.UploadId;
  }

  async presignPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600) {
    assertStorageKey(key);
    const client = this.s3();
    if (!client) throw new InternalServerErrorException("Object storage is not configured");
    return getSignedUrl(client, new UploadPartCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
  }

  async completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    assertStorageKey(key);
    const client = this.s3();
    if (!client) throw new InternalServerErrorException("Object storage is not configured");
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    assertStorageKey(key);
    const client = this.s3();
    if (!client) return;
    await client.send(new AbortMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId })).catch(() => undefined);
  }

  private missing(key: string, error: unknown) {
    if (error instanceof BadRequestException) return error;
    this.logger.warn(`Missing object ${key}: ${(error as Error).message}`);
    return new NotFoundException("File not found");
  }
}

@Injectable()
export class DomainEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(name: string, payload: unknown, tx?: Tx) {
    await (tx || this.prisma).domainEvent.create({
      data: { name, payload: payload as Prisma.InputJsonValue, status: "PROCESSED" },
    });
  }
}
