import { redirectToLogin } from "@fixotec/ui";
import { API_URL, ApiError, api } from "./api";

/** Files above this go through the large-file path (direct to S3, or streamed to the API). */
export const SMALL_UPLOAD_BYTES = 24 * 1024 * 1024;
export const CAD_CATEGORIES = ["CAD", "BIM", "DRAWING"];

type Presign = { mode: "s3"; url: string; headers: Record<string, string>; ticket: string } | { mode: "multipart"; path: string; maxBytes: number };

export type UploadMeta = { title?: string; category?: string; entityType?: string; entityId?: string; audiences?: string; notes?: string; documentId?: string };

function send(method: string, url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress?: (fraction: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      if (xhr.status === 401) redirectToLogin("expired");
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText);
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

/**
 * Uploads a document (or a new version when `documentId` is set). Small files use the regular multipart route;
 * large ones and every CAD/BIM file use a presigned S3 PUT, or the streamed /documents/large route on local storage.
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
  if (file.size > plan.maxBytes) throw new ApiError(`File is larger than ${Math.round(plan.maxBytes / 1048576)} MB`, 413);
  return JSON.parse(await send("POST", `${API_URL}/api/v1${plan.path}`, form, {}, onProgress));
}
