import type { SupabaseClient } from "@supabase/supabase-js";

export const TICKET_ATTACHMENT_BUCKET = "ticket-attachments";
export const MAX_TICKET_ATTACHMENTS = 5;

const MAX_SOURCE_FILE_SIZE = 25 * 1024 * 1024;
const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type PreparedTicketImage = {
  id: string;
  file: File;
  originalName: string;
  previewUrl: string;
  width: number;
  height: number;
};

export type PrepareImagesResult = {
  images: PreparedTicketImage[];
  errors: string[];
};

export type UploadImagesResult = {
  uploadedCount: number;
  errors: string[];
};

function safeJpegName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "photo";
  const safeBase = baseName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return `${safeBase || "photo"}.jpg`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("This photo could not be compressed."));
      },
      "image/jpeg",
      quality
    );
  });
}

async function compressImage(file: File): Promise<PreparedTicketImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name}: choose a JPEG, PNG, or WebP image.`);
  }

  if (file.size > MAX_SOURCE_FILE_SIZE) {
    throw new Error(`${file.name}: the original photo is larger than 25 MB.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name}: this browser could not read the photo.`);
  }

  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(`${file.name}: image compression is unavailable.`);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let compressed = await canvasToJpeg(canvas, JPEG_QUALITY);
  if (compressed.size > MAX_UPLOAD_FILE_SIZE) {
    compressed = await canvasToJpeg(canvas, 0.68);
  }

  if (compressed.size > MAX_UPLOAD_FILE_SIZE) {
    throw new Error(`${file.name}: the compressed photo is still larger than 5 MB.`);
  }

  const compressedFile = new File([compressed], safeJpegName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return {
    id: crypto.randomUUID(),
    file: compressedFile,
    originalName: file.name,
    previewUrl: URL.createObjectURL(compressedFile),
    width,
    height,
  };
}

export async function prepareTicketImages(
  files: File[],
  availableSlots: number
): Promise<PrepareImagesResult> {
  const images: PreparedTicketImage[] = [];
  const errors: string[] = [];
  const selectedFiles = files.slice(0, Math.max(0, availableSlots));

  if (files.length > selectedFiles.length) {
    errors.push(
      `Only ${availableSlots} more ${availableSlots === 1 ? "photo" : "photos"} can be added.`
    );
  }

  for (const file of selectedFiles) {
    try {
      images.push(await compressImage(file));
    } catch (error: unknown) {
      errors.push(
        error instanceof Error ? error.message : `${file.name}: upload failed.`
      );
    }
  }

  return { images, errors };
}

export function releasePreparedTicketImages(images: PreparedTicketImage[]) {
  for (const image of images) URL.revokeObjectURL(image.previewUrl);
}

export async function uploadTicketImages(
  supabase: SupabaseClient,
  ticketId: string,
  userId: string,
  images: PreparedTicketImage[]
): Promise<UploadImagesResult> {
  let uploadedCount = 0;
  const errors: string[] = [];

  for (const image of images) {
    const attachmentId = crypto.randomUUID();
    const storagePath = `${ticketId}/${userId}/${attachmentId}.jpg`;

    const { error: storageError } = await supabase.storage
      .from(TICKET_ATTACHMENT_BUCKET)
      .upload(storagePath, image.file, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (storageError) {
      errors.push(`${image.originalName}: ${storageError.message}`);
      continue;
    }

    const { error: metadataError } = await supabase
      .from("ticket_attachments")
      .insert({
        id: attachmentId,
        ticket_id: ticketId,
        uploader_id: userId,
        storage_path: storagePath,
        file_name: image.file.name,
        mime_type: image.file.type,
        file_size: image.file.size,
        width: image.width,
        height: image.height,
      });

    if (metadataError) {
      await supabase.storage.from(TICKET_ATTACHMENT_BUCKET).remove([storagePath]);
      errors.push(`${image.originalName}: ${metadataError.message}`);
      continue;
    }

    uploadedCount += 1;
  }

  return { uploadedCount, errors };
}
