export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function validateAuditUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required." };
  }
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, error: "URL is required." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: "That doesn't look like a valid URL. Use the full address, e.g. https://example.com/page",
    };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "URL must use HTTPS." };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { valid: false, error: "Localhost URLs cannot be audited." };
  }
  if (IP_RE.test(host)) {
    return { valid: false, error: "IP addresses cannot be audited \u2014 use a domain name." };
  }
  if (!host.includes(".")) {
    return { valid: false, error: "Hostname must include a domain (e.g. example.com)." };
  }

  return { valid: true };
}
