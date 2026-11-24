import { ConflictException } from "@nestjs/common";
import { extractRevitPreview, isRevitFamilyFile, PREVIEW_EXTRACT_MAX_BYTES, thumbnailStorageKey } from "./revit-preview";
import { folderName, normalizedFolderName } from "./files";

type FolderScope = {
  name: string;
  parentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  excludeId?: string;
};

type FolderRow = { id: string; name: string; parentId: string | null; entityType: string | null; entityId: string | null };

type FolderFindManyArgs = {
  where?: {
    parentId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    id?: { not?: string };
  };
  select?: object;
};

export async function assertUniqueFolderName(
  folders: { findMany: (args: FolderFindManyArgs) => Promise<FolderRow[]> },
  input: FolderScope,
) {
  const name = folderName(input.name);
  const key = normalizedFolderName(name);
  const parentId = input.parentId || null;
  const entityType = input.entityType || null;
  const entityId = input.entityId || null;
  const siblings = await folders.findMany({
    where: {
      parentId,
      entityType,
      entityId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, name: true, parentId: true, entityType: true, entityId: true },
  });
  if (siblings.some((row) => normalizedFolderName(row.name) === key)) {
    throw new ConflictException(`A folder named "${name}" already exists here`);
  }
  return name;
}

type StorageLike = {
  get: (key: string) => Promise<Buffer>;
  put: (key: string, body: Buffer, contentType: string) => Promise<unknown>;
  head?: (key: string, bytes: number) => Promise<{ size: number }>;
};

type VersionLike = { id: string; version: number; fileName: string; storageKey: string; documentId: string };

/** Best-effort: extract a Revit preview PNG and year, store the PNG next to the file, and persist sourceInfo. Never throws. */
export async function attachRevitPreview(
  storage: StorageLike,
  versions: { update: (args: { where: { id: string }; data: { thumbnailKey?: string; sourceInfo?: Record<string, string> } }) => Promise<unknown> },
  version: VersionLike,
  file?: Buffer,
) {
  if (!isRevitFamilyFile(version.fileName)) return version;
  try {
    let buffer = file;
    if (!buffer) {
      if (storage.head) {
        const { size } = await storage.head(version.storageKey, 1);
        if (size > PREVIEW_EXTRACT_MAX_BYTES) return version;
      }
      buffer = await storage.get(version.storageKey);
      if (buffer.length > PREVIEW_EXTRACT_MAX_BYTES) return version;
    }
    const extracted = extractRevitPreview(buffer);
    const sourceInfo = {
      ...(extracted.revitYear ? { revitYear: extracted.revitYear } : {}),
      ...(extracted.revitBuild ? { revitBuild: extracted.revitBuild } : {}),
    };
    const thumbnailKey = extracted.png ? thumbnailStorageKey(version.storageKey, version.version) : undefined;
    if (extracted.png && thumbnailKey) {
      await storage.put(thumbnailKey, extracted.png, "image/png");
    }
    if (!thumbnailKey && !Object.keys(sourceInfo).length) return version;
    await versions.update({
      where: { id: version.id },
      data: {
        ...(thumbnailKey ? { thumbnailKey } : {}),
        ...(Object.keys(sourceInfo).length ? { sourceInfo } : {}),
      },
    });
    return { ...version, thumbnailKey: thumbnailKey || null, sourceInfo };
  } catch {
    return version;
  }
}

export function isLibraryModelName(fileName?: string | null) {
  return /\.(rfa|rvt|rte|rft|ifc)$/i.test(fileName || "");
}

export function latestVersion<T extends { version: number }>(versions: T[]) {
  return [...versions].sort((a, b) => b.version - a.version)[0];
}

export const COMPANY_LIBRARY_FOLDERS = ["Reliance", "Micron", "STT", "Veritus"] as const;
