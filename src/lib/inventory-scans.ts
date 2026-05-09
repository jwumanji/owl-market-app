import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";

export const INVENTORY_SCAN_BUCKET = "inventory-scans";

const MAX_SCAN_SIZE_BYTES = 15 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function safePathSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

export async function ensureInventoryScanBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.getBucket(INVENTORY_SCAN_BUCKET);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(INVENTORY_SCAN_BUCKET, {
    public: true,
    fileSizeLimit: MAX_SCAN_SIZE_BYTES,
    allowedMimeTypes: Array.from(IMAGE_CONTENT_TYPES),
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

export async function uploadInventoryScan(
  supabase: SupabaseClient,
  file: File | null,
  {
    certificationNumber,
    side,
  }: {
    certificationNumber?: string | null;
    side: "front" | "back";
  }
) {
  if (!file) return null;

  if (!IMAGE_CONTENT_TYPES.has(file.type)) {
    throw new Error(`${file.name} must be a JPEG, PNG, WEBP, or GIF image.`);
  }

  if (file.size > MAX_SCAN_SIZE_BYTES) {
    throw new Error(`${file.name} is larger than 15 MB.`);
  }

  await ensureInventoryScanBucket(supabase);

  const id = safePathSegment(certificationNumber ?? "") || crypto.randomUUID();
  const ext = extensionFor(file);
  const path = `psa/${id}-${side}-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(INVENTORY_SCAN_BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(INVENTORY_SCAN_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

