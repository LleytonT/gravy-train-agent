/**
 * Deterministic URL normalization so the same listing from two boards
 * collapses to one content hash when the underlying job URL matches.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "mc_cid",
  "mc_eid",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "li_fat_id",
  "trk",
  "trkEmail",
  "refId",
  "ePID",
  "sp_source",
  "sp_mid",
  "sp_rid",
  "fromEmail",
  "midToken",
  "midSig",
  "lipi",
  "lici",
  "rcm",
  "s",
  "si",
  "vjk",
  "advn",
  "adid",
  "xk",
  "from",
  "sharedKey",
]);

export function canonicalizeJobUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key) && !key.toLowerCase().startsWith("utm_"))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of kept) {
    url.searchParams.append(key, value);
  }

  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  url.pathname = path || "/";

  // Prefer https for stable hashing when the host is the same.
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  return url.toString();
}
