import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

type Link = { kind: "github" | "linkedin" | "website"; url: string };
type Source = Link & {
  status: "scraped" | "unavailable" | "blocked";
  characters: number;
  note: string | null;
};

class SourceError extends Error {
  constructor(message: string, public blocked = false) {
    super(message);
  }
}

function publicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    // Restrict outbound IPv6 to global unicast, excluding documentation ranges.
    return /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
  }
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function fetchPublicText(rawUrl: string, redirects = 0): Promise<string> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443")) {
    throw new SourceError("Only public HTTPS links without credentials are supported.", true);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") && isIP(hostname) === 0) {
    throw new SourceError("This is not a public website.", true);
  }
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new SourceError("Private or local network links cannot be read.", true);
  }
  const destination = addresses[0]!;
  const response = await new Promise<{
    status: number; location?: string; contentType: string; body: string;
  }>((resolve, reject) => {
    // Pin the validated DNS address so redirects and DNS rebinding cannot reach
    // private services. HTTPS still validates the original hostname certificate.
    const req = request(url, {
      family: destination.family,
      headers: {
        "User-Agent": "InstantPitch/1.0 (public portfolio text analyzer)",
        Accept: "text/html, text/plain, application/json",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(10000),
      lookup: (_host, _options, callback) => {
        callback(null, destination.address, destination.family);
      },
    }, (res) => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400) {
        res.resume();
        resolve({ status, location: res.headers.location, contentType: "", body: "" });
        return;
      }
      const contentType = res.headers["content-type"] ?? "";
      if (!/text\/|application\/(xhtml\+xml|json)/i.test(contentType)) {
        res.resume();
        reject(new SourceError("This link is not a readable webpage."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_500_000) {
          res.destroy(new SourceError("This webpage is too large to analyze."));
        } else {
          chunks.push(chunk);
        }
      });
      res.on("error", reject);
      res.on("end", () => resolve({
        status, contentType, body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });
  if (response.status >= 300 && response.status < 400 && response.location) {
    if (redirects >= 3) throw new SourceError("This link redirects too many times.");
    return fetchPublicText(new URL(response.location, url).href, redirects + 1);
  }
  if (response.status === 401 || response.status === 403 || response.status === 999) {
    throw new SourceError("This site requires sign-in or blocks automated access.", true);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`The webpage returned HTTP ${response.status}.`);
  }
  return response.body;
}

function cleanText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(?:p|div|li|h[1-6]|br|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, (entity) =>
      ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity.toLowerCase()] ?? " ")
    .replace(/&#(\d+);/g, (_match, value: string) =>
      String.fromCodePoint(Math.min(Number(value), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) =>
      String.fromCodePoint(Math.min(parseInt(value, 16), 0x10ffff)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
    .slice(0, 14000);
}

export async function extractPortfolioSource(link: Link): Promise<{
  source: Source; text: string;
}> {
  try {
    const page = await fetchPublicText(link.url);
    const text = cleanText(page);
    if (text.length < 100) throw new SourceError("Not enough readable text was found on this page.");
    if (link.kind === "linkedin" && /authwall|join linkedin|sign in to view/i.test(page)) {
      throw new SourceError("LinkedIn restricts public profile access. The analysis will use your resume and other accessible links.", true);
    }
    return {
      source: { ...link, status: "scraped", characters: text.length, note: null },
      text,
    };
  } catch (error) {
    const known = error instanceof SourceError;
    return {
      source: {
        ...link,
        status: known && error.blocked ? "blocked" : "unavailable",
        characters: 0,
        note: known ? error.message : "This page could not be reached. The analysis will use your resume and other accessible links.",
      },
      text: "",
    };
  }
}
