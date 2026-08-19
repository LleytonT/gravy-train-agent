/**
 * Telegram document ingest — résumé parse and Connections.csv stash.
 */

import { inflateRawSync } from "node:zlib";

export type DownloadedTelegramFile = {
  bytes: Buffer;
  fileName: string | null;
  mediaType: string | null;
};

export type AttachmentFetch = (
  fileId: string,
) => Promise<DownloadedTelegramFile | null>;

export async function downloadTelegramBotFile(
  fileId: string,
): Promise<DownloadedTelegramFile | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !fileId) return null;
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = (await metaRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = meta.result?.file_path;
  if (!meta.ok || !filePath) return null;
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  );
  if (!fileRes.ok) return null;
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  const fileName = filePath.split("/").pop() ?? null;
  return { bytes, fileName, mediaType: fileRes.headers.get("content-type") };
}

export function looksLikeConnectionsCsv(
  fileName: string | null | undefined,
  text: string,
): boolean {
  const name = fileName?.toLowerCase() ?? "";
  if (name.includes("connection") && name.endsWith(".csv")) return true;
  const header = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return (
    header.includes("first name") &&
    header.includes("last name") &&
    (header.includes("email") || header.includes("company"))
  );
}

export function extractDocumentText(
  bytes: Buffer,
  fileName?: string | null,
  mediaType?: string | null,
): string {
  const name = (fileName ?? "").toLowerCase();
  const type = (mediaType ?? "").toLowerCase();
  if (
    name.endsWith(".docx") ||
    type.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
  ) {
    return extractDocxText(bytes);
  }
  if (name.endsWith(".pdf") || type.includes("application/pdf")) {
    return extractPdfText(bytes);
  }
  return bytes.toString("utf8").replace(/\u0000/g, "").trim();
}

function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];
  const paren = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = paren.exec(raw))) {
    const inner = match[0].slice(1, -1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\(.)/g, "$1");
    if (/[A-Za-z]{3,}/.test(decoded)) chunks.push(decoded);
  }
  const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length >= 40) return joined;
  return bytes.toString("utf8").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
}

function extractDocxText(bytes: Buffer): string {
  const xml = readZipEntry(bytes, "word/document.xml");
  if (!xml) return "";
  return xml
    .toString("utf8")
    .replace(/<w:p[\s>]/g, "\n$&")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readZipEntry(buf: Buffer, name: string): Buffer | null {
  let offset = 0;
  const nameBuf = Buffer.from(name, "utf8");
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const flags = buf.readUInt16LE(offset + 6);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const fileName = buf.subarray(offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart > buf.length) return null;
    if (fileName.equals(nameBuf)) {
      if ((flags & 0x8) !== 0 && compSize === 0) {
        return null;
      }
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) {
        try {
          return inflateRawSync(data);
        } catch {
          return null;
        }
      }
      return null;
    }
    offset = dataStart + (compSize || 1);
  }
  return null;
}
