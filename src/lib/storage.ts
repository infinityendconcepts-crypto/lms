import "server-only";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const STORAGE_ROOT =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads");

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);
const VIDEO = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const DOC = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "md",
  "rtf",
  "odt",
  "ods",
  "odp",
  "tex",
  "json",
  "xml",
  "html",
  "epub",
]);
const ARCHIVE = new Set(["zip", "rar", "7z", "tar", "gz"]);

const ALLOWED = new Set([...IMAGE, ...VIDEO, ...AUDIO, ...DOC, ...ARCHIVE]);
const BLOCKED = new Set(["exe", "sh", "bat", "cmd", "js", "mjs", "php", "py", "dll", "dmg", "app"]);

export type FileKind = "image" | "video" | "audio" | "document" | "archive";

export function extensionOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function kindFor(name: string): FileKind {
  const ext = extensionOf(name);
  if (IMAGE.has(ext)) return "image";
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  if (ARCHIVE.has(ext)) return "archive";
  return "document";
}

export function assertAllowed(file: { name: string; size: number; type: string }) {
  const ext = extensionOf(file.name);
  if (!ext || BLOCKED.has(ext) || !ALLOWED.has(ext)) {
    throw new Error(`Unsupported file type ".${ext || "?"}". Allowed: documents, PDFs, images, audio, video, archives.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
  }
}

export async function saveUpload(file: File) {
  assertAllowed(file);
  await mkdir(STORAGE_ROOT, { recursive: true });
  const ext = extensionOf(file.name);
  const storageKey = `${new Date().getFullYear()}/${randomUUID()}.${ext}`;
  const target = path.join(STORAGE_ROOT, storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(target, bytes);
  return {
    storageKey,
    size: bytes.byteLength,
    name: file.name.slice(0, 200),
    mimeType: file.type || guessMime(ext),
    kind: kindFor(file.name),
  };
}

export function resolveStoragePath(storageKey: string) {
  const target = path.resolve(STORAGE_ROOT, storageKey);
  if (!target.startsWith(path.resolve(STORAGE_ROOT) + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return target;
}

export async function removeUpload(storageKey: string) {
  await unlink(resolveStoragePath(storageKey)).catch(() => null);
}

function guessMime(ext: string) {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
