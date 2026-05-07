// Storage helpers with dual backend:
// - Production (Manus): Uses the Biz-provided storage proxy
// - Local/Docker: Uses local filesystem with Express static serving

import { ENV } from './_core/env';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── Configuration ───────────────────────────────────────────────────────────

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig | null {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    return null; // Fall back to local storage
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function isLocalStorage(): boolean {
  return getStorageConfig() === null;
}

// ─── Local Filesystem Storage ────────────────────────────────────────────────

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), 'uploads');

function ensureLocalDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLocalFilePath(relKey: string): string {
  return path.join(LOCAL_STORAGE_DIR, normalizeKey(relKey));
}

function getLocalUrl(relKey: string): string {
  return `/uploads/${normalizeKey(relKey)}`;
}

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = getLocalFilePath(key);
  ensureLocalDir(filePath);

  const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, buffer);

  return { key, url: getLocalUrl(key) };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: getLocalUrl(key) };
}

// ─── Remote (Forge API) Storage ──────────────────────────────────────────────

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function remotePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig()!;
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(config.baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(config.apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function remoteGet(relKey: string): Promise<{ key: string; url: string }> {
  const config = getStorageConfig()!;
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(config.baseUrl, key, config.apiKey),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (isLocalStorage()) {
    return localPut(relKey, data, contentType);
  }
  return remotePut(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (isLocalStorage()) {
    return localGet(relKey);
  }
  return remoteGet(relKey);
}

/**
 * Returns the local storage directory path.
 * Used by the Express server to serve static files when running locally.
 */
export function getLocalStorageDir(): string {
  return LOCAL_STORAGE_DIR;
}

export { isLocalStorage };
