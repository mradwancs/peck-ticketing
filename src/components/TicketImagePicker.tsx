"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_TICKET_ATTACHMENTS,
  prepareTicketImages,
  type PreparedTicketImage,
} from "@/lib/ticketAttachments";
import styles from "./TicketImagePicker.module.css";

type TicketImagePickerProps = {
  value: PreparedTicketImage[];
  onChange: (images: PreparedTicketImage[]) => void;
  existingCount?: number;
  disabled?: boolean;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
};

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

export default function TicketImagePicker({
  value,
  onChange,
  existingCount = 0,
  disabled = false,
  label = "Add photos",
  onBusyChange,
}: TicketImagePickerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const totalCount = existingCount + value.length;
  const remainingSlots = Math.max(0, MAX_TICKET_ATTACHMENTS - totalCount);
  const controlsDisabled = disabled || processing || remainingSlots === 0;

  useEffect(() => {
    const currentUrls = value.map((image) => image.previewUrl);
    for (const previousUrl of previewUrlsRef.current) {
      if (!currentUrls.includes(previousUrl)) URL.revokeObjectURL(previousUrl);
    }
    previewUrlsRef.current = currentUrls;
  }, [value]);

  useEffect(() => {
    return () => {
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || remainingSlots === 0) return;

    setProcessing(true);
    onBusyChange?.(true);
    setPickerError(null);

    try {
      const result = await prepareTicketImages(
        Array.from(fileList),
        remainingSlots
      );
      if (result.images.length > 0) onChange([...value, ...result.images]);
      if (result.errors.length > 0) setPickerError(result.errors.join(" "));
    } finally {
      setProcessing(false);
      onBusyChange?.(false);
    }
  }

  function removeImage(imageId: string) {
    onChange(value.filter((image) => image.id !== imageId));
    setPickerError(null);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.headingRow}>
        <div>
          <div className={styles.label}>{label}</div>
          <div className={styles.hint}>
            Up to {MAX_TICKET_ATTACHMENTS} photos · automatically compressed
          </div>
        </div>
        <span className={styles.count}>
          {totalCount}/{MAX_TICKET_ATTACHMENTS}
        </span>
      </div>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.cameraButton}
          onClick={() => cameraInputRef.current?.click()}
          disabled={controlsDisabled}
        >
          <span aria-hidden="true">📷</span>
          {processing ? "Preparing…" : "Take a picture"}
        </button>
        <button
          type="button"
          className={styles.galleryButton}
          onClick={() => galleryInputRef.current?.click()}
          disabled={controlsDisabled}
        >
          <span aria-hidden="true">▧</span>
          Choose photos
        </button>

        <input
          ref={cameraInputRef}
          type="file"
          hidden
          accept={ACCEPTED_TYPES}
          capture="environment"
          aria-hidden="true"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
          tabIndex={-1}
        />
        <input
          ref={galleryInputRef}
          type="file"
          hidden
          accept={ACCEPTED_TYPES}
          multiple
          aria-hidden="true"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
          tabIndex={-1}
        />
      </div>

      {remainingSlots === 0 ? (
        <div className={styles.limitMessage}>The five-photo limit has been reached.</div>
      ) : null}
      {pickerError ? <div className={styles.error}>{pickerError}</div> : null}

      {value.length > 0 ? (
        <div className={styles.previewGrid}>
          {value.map((image) => (
            <div key={image.id} className={styles.previewCard}>
              {/* Browser-created preview URLs do not benefit from Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.previewImage}
                src={image.previewUrl}
                alt={`Preview of ${image.originalName}`}
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeImage(image.id)}
                disabled={disabled || processing}
                aria-label={`Remove ${image.originalName}`}
              >
                ×
              </button>
              <div className={styles.fileName} title={image.originalName}>
                {image.originalName}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
