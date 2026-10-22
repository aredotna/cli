import { extname } from "node:path";
import type { Connectable } from "../api/types";

export const IMAGE_SIZES = [
  "original",
  "large",
  "medium",
  "small",
  "square",
] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export const DOWNLOAD_TYPES = [
  "Image",
  "Attachment",
  "Text",
  "Link",
  "Embed",
  "Channel",
  "PendingBlock",
] as const;
export type DownloadType = (typeof DOWNLOAD_TYPES)[number];
export type LinkFormat = "webloc" | "url";
export type DownloadTarget =
  | { kind: "fetch"; filename: string; url: string }
  | { kind: "text"; filename: string; content: string };

/** Keep names portable, bounded in UTF-8 bytes, and confined to one directory. */
export function safeFilename(value: string): string {
  const clean = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  let result = "";
  for (const char of clean) {
    if (Buffer.byteLength(result + char) > 150) break;
    result += char;
  }
  result = result.replace(/[. ]+$/g, "");
  if (!result || /^\.+$/.test(result)) return "untitled";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)
    ? `_${result}`
    : result;
}

export function escapeMarkup(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function httpUrl(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Expected an HTTP(S) URL without credentials");
  }
  return url.href;
}

export function arenaUrl(item: Connectable): string {
  return item.type === "Channel"
    ? `https://www.are.na/${encodeURIComponent(item.owner.slug)}/${encodeURIComponent(item.slug)}`
    : `https://www.are.na/block/${item.id}`;
}

export function urlShortcut(url: string, format: LinkFormat): string {
  const safeUrl = httpUrl(url);
  return format === "url"
    ? `[InternetShortcut]\r\nURL=${safeUrl}\r\n`
    : `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${escapeMarkup(safeUrl)}</string></dict></plist>\n`;
}

// Mirrors the API's Scraper::ContentTypes, which picks the first listed extension.
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "image/webp": "webp",
};

const TRANSLITERATIONS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ð: "d",
  Ð: "D",
  ł: "l",
  Ł: "L",
  þ: "th",
  Þ: "TH",
};

/** Rails' `String#parameterize`: ASCII-transliterated, hyphenated, lowercase. */
export function parameterize(value: string): string {
  return value
    .replace(/[ßæÆœŒøØđĐðÐłŁþÞ]/g, (char) => TRANSLITERATIONS[char]!)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Rails' `String#truncate`, which counts the omission toward the length. */
function truncateWithOmission(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

/** The API's `Block#generated_title`. */
function generatedTitle(item: Connectable): string {
  if (item.title?.trim()) return item.title;
  const content =
    item.type === "Text"
      ? item.content.markdown
      : item.type === "Link"
        ? item.content?.markdown
        : undefined;
  const text = [content, item.description?.markdown].find((value) =>
    value?.trim(),
  );
  if (!text) return "Untitled";
  return escapeMarkup(truncateWithOmission(text.replace(/<[^>]*>/g, ""), 25));
}

/**
 * The API's GraphQL `file_name`, so exports are named like Are.na's web
 * channel export (`<position>_<file_name>.<extension>`).
 */
export function blockFileName(item: Connectable): string {
  return truncateWithOmission(parameterize(generatedTitle(item)), 50);
}

export function itemKey(item: Connectable): string {
  return `${item.type === "Channel" ? "channel" : "block"}-${item.id}`;
}

function resizedImageExtension(
  url: string,
  contentType: string | undefined,
): string {
  const parsed = new URL(url);
  const explicit = extname(parsed.pathname).slice(1).toLowerCase();
  if (/^(jpe?g|png|gif|webp|avif|tiff?)$/.test(explicit)) return explicit;
  // images.are.na's default (non-WebP) response is JPEG, except animated GIFs.
  // Its path is an opaque transform token, not a usable filename.
  if (parsed.hostname === "images.are.na")
    return contentType === "image/gif" ? "gif" : "jpg";
  return IMAGE_EXTENSIONS[contentType ?? ""] ?? "jpg";
}

/** `position` is the 1-based index in the channel's manual order. */
export function resolveTarget(
  item: Connectable,
  position: number,
  options: { size: ImageSize; linkFormat: LinkFormat },
): DownloadTarget | null {
  const stem = `${position}_${blockFileName(item)}`;
  switch (item.type) {
    case "Image": {
      const url =
        options.size === "original"
          ? item.image.src
          : item.image[options.size]?.src;
      if (!url) throw new Error(`No ${options.size} image is available`);
      const extension =
        options.size === "original"
          ? (IMAGE_EXTENSIONS[item.image.content_type ?? ""] ??
            (extname(item.image.filename ?? "")
              .slice(1)
              .toLowerCase() ||
              "jpg"))
          : resizedImageExtension(url, item.image.content_type);
      return {
        kind: "fetch",
        url: httpUrl(url),
        filename: `${stem}.${extension}`,
      };
    }
    case "Attachment": {
      const extension = safeFilename(
        item.attachment.file_extension?.trim() || "bin",
      ).toLowerCase();
      return {
        kind: "fetch",
        url: httpUrl(item.attachment.url),
        filename: `${stem}.${extension}`,
      };
    }
    case "Text":
      return {
        kind: "text",
        content: item.content.markdown ?? item.content.plain ?? "",
        filename: `${stem}.txt`,
      };
    case "Link":
    case "Embed":
      return {
        kind: "text",
        content: urlShortcut(
          item.source?.url || arenaUrl(item),
          options.linkFormat,
        ),
        filename: `${stem}.${options.linkFormat}`,
      };
    case "Channel":
      return {
        kind: "text",
        content: urlShortcut(arenaUrl(item), options.linkFormat),
        filename: `${position}_${safeFilename(item.slug)}.${options.linkFormat}`,
      };
    case "PendingBlock":
      return null;
  }
}
