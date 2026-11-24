import { redirectToLogin } from "@fixotec/ui";
import { API_URL, ApiError, api } from "./api";

/** Files above this go through the large-file path (direct to S3/R2, or streamed to the API). */
export const SMALL_UPLOAD_BYTES = 24 * 1024 * 1024;
export const CAD_CATEGORIES = ["CAD", "BIM", "DRAWING"];

type Presign =
  | { mode: "s3"; url: string; headers: Record<string, string>; ticket: string }
  | { mode: "s3-multipart"; ticket: string; partSize: number; partCount: number; maxBytes: number }
  | { mode: "multipart"; path: string; maxBytes: number };

export type UploadMeta = { title?: string; category?: string; entityType?: string; entityId?: string; folderId?: string; audiences?: string; notes?: string; documentId?: string };

function send(method: string, url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress?: (fraction: number) => void, etag = false) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      if (xhr.status === 401) redirectToLogin("expired");
      if (xhr.status >= 200 && xhr.status < 300) {
        if (etag) {
          const tag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag") || "";
          if (!tag) return reject(new ApiError("The storage service did not return an ETag for this part", xhr.status));
          return resolve(tag.replaceAll('"', ""));
        }
        return resolve(xhr.responseText);
      }
      let message = "Upload failed";
      try {
        const data = JSON.parse(xhr.responseText) as { message?: unknown };
        if (typeof data.message === "string") message = data.message;
      } catch {
        // Not JSON (e.g. a storage error page).
      }
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload. Check your connection and try again.", 0));
    xhr.send(body);
  });
}

async function uploadMultipart(file: File, plan: Extract<Presign, { mode: "s3-multipart" }>, onProgress?: (fraction: number) => void) {
  if (file.size > plan.maxBytes) throw new ApiError(`File is larger than ${Math.round(plan.maxBytes / 1048576)} MB`, 413);
  const completed: Array<{ partNumber: number; etag: string }> = [];
  let uploaded = 0;
  const batch = 8;
  for (let start = 1; start <= plan.partCount; start += batch) {
    const partNumbers = Array.from({ length: Math.min(batch, plan.partCount - start + 1) }, (_, index) => start + index);
    const signed = await api<{ parts: Array<{ partNumber: number; url: string; headers: Record<string, string> }> }>("/documents/uploads/multipart/parts", {
      method: "POST",
      body: JSON.stringify({ ticket: plan.ticket, partNumbers }),
    });
    for (const part of signed.parts) {
      const offset = (part.partNumber - 1) * plan.partSize;
      const blob = file.slice(offset, Math.min(offset + plan.partSize, file.size));
      const etag = await send("PUT", part.url, blob, part.headers || {}, (fraction) => onProgress?.((uploaded + fraction * blob.size) / file.size), true);
      completed.push({ partNumber: part.partNumber, etag });
      uploaded += blob.size;
    }
  }
  return api("/documents/uploads/complete", { method: "POST", body: JSON.stringify({ ticket: plan.ticket, parts: completed }) });
}

/**
 * Uploads a document (or a new version when `documentId` is set). Small files use the regular multipart route;
 * large ones and every CAD/BIM file use a presigned S3/R2 PUT (or multipart for files over 64 MB),
 * or the streamed /documents/large route on local storage.
 */
export async function uploadDocument(file: File, meta: UploadMeta, onProgress?: (fraction: number) => void) {
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(meta)) if (value) form.set(key, value);
  const large = file.size > SMALL_UPLOAD_BYTES || CAD_CATEGORIES.includes(meta.category || "");
  if (!large) {
    const path = meta.documentId ? `/documents/${meta.documentId}/versions` : "/documents";
    return JSON.parse(await send("POST", `${API_URL}/api/v1${path}`, form, {}, onProgress));
  }
  const plan = await api<Presign>("/documents/uploads/presign", { method: "POST", body: JSON.stringify({ ...meta, fileName: file.name, size: file.size }) });
  if (plan.mode === "s3") {
    await send("PUT", plan.url, file, plan.headers, onProgress);
    return api("/documents/uploads/complete", { method: "POST", body: JSON.stringify({ ticket: plan.ticket }) });
  }
  if (plan.mode === "s3-multipart") return uploadMultipart(file, plan, onProgress);
  if (file.size > plan.maxBytes) throw new ApiError(`File is larger than ${Math.round(plan.maxBytes / 1048576)} MB`, 413);
  return JSON.parse(await send("POST", `${API_URL}/api/v1${plan.path}`, form, {}, onProgress));
}
