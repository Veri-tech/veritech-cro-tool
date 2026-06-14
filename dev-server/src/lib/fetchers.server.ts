// Server-only API fetchers for client integrations.
// Reads encrypted manual_credentials from client_integrations and calls
// the respective vendor APIs. Returns shape consumed by buildAuditPrompt.
import { decryptJSON } from "./crypto.server";
import type { AnalyticsData } from "./claude";

type Json = Record<string, any>;

// ---------- Google service-account → OAuth2 access token (RS256 JWT) ----------
async function googleAccessToken(saJson: string, scope: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64url = (s: string | Buffer) =>
    (Buffer.isBuffer(s) ? s : Buffer.from(s))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  // Sign with the PEM private key via node:crypto
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign(sa.private_key);
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth token failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Google OAuth response missing access_token");
  return j.access_token;
}

// ---------- GA4 (Data API) ----------
export async function fetchGa4Last30(
  encryptedCreds: string,
): Promise<NonNullable<AnalyticsData["ga4"]> | null> {
  try {
    const creds = decryptJSON<any>(encryptedCreds);
    const propertyId = String(creds.ga4PropertyId).replace(/^properties\//, "");
    const token = await googleAccessToken(
      creds.serviceAccountJson,
      "https://www.googleapis.com/auth/analytics.readonly",
    );
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "sessionConversionRate" },
            { name: "bounceRate" },
          ],
        }),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Json;
    const row = j.rows?.[0]?.metricValues ?? [];
    const num = (i: number) => Number(row[i]?.value ?? 0);
    return {
      sessions: Math.round(num(0)),
      users: Math.round(num(1)),
      conversion_rate: +num(2).toFixed(2),
      bounce_rate: +(num(3) * 100).toFixed(2),
    };
  } catch {
    return null;
  }
}

// ---------- GSC (Search Console) ----------
export async function fetchGscLast30(
  encryptedCreds: string,
  pageUrl?: string,
): Promise<NonNullable<AnalyticsData["gsc"]> | null> {
  try {
    const creds = decryptJSON<any>(encryptedCreds);
    const token = await googleAccessToken(
      creds.serviceAccountJson,
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    const end = new Date();
    const start = new Date(Date.now() - 30 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const body: Json = {
      startDate: fmt(start),
      endDate: fmt(end),
      rowLimit: 1,
    };
    if (pageUrl) {
      body.dimensionFilterGroups = [
        { filters: [{ dimension: "page", operator: "equals", expression: pageUrl }] },
      ];
    }
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(creds.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Json;
    const r = j.rows?.[0];
    if (!r) return { clicks: 0, impressions: 0, avg_ctr: 0, avg_position: 0 };
    return {
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      avg_ctr: +(((r.ctr ?? 0) as number) * 100).toFixed(2),
      avg_position: +((r.position ?? 0) as number).toFixed(2),
    };
  } catch {
    return null;
  }
}

// ---------- Semrush domain overview ----------
export async function fetchSemrushDomain(
  encryptedCreds: string,
  domain: string,
): Promise<{ rank: number | null; organic_keywords: number | null; organic_traffic: number | null } | null> {
  try {
    const creds = decryptJSON<any>(encryptedCreds);
    const url = `https://api.semrush.com/?type=domain_ranks&key=${encodeURIComponent(creds.apiKey)}&export_columns=Rk,Or,Ot&domain=${encodeURIComponent(domain)}&database=us`;
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok || txt.toLowerCase().includes("error")) return null;
    const lines = txt.trim().split("\n");
    if (lines.length < 2) return null;
    const vals = lines[1].split(";");
    return {
      rank: vals[0] ? Number(vals[0]) : null,
      organic_keywords: vals[1] ? Number(vals[1]) : null,
      organic_traffic: vals[2] ? Number(vals[2]) : null,
    };
  } catch {
    return null;
  }
}

// ---------- DataForSEO fallback (domain rank overview) ----------
export async function fetchDataForSeoDomain(
  encryptedCreds: string,
  domain: string,
): Promise<{ rank: number | null; organic_keywords: number | null; organic_traffic: number | null } | null> {
  try {
    const creds = decryptJSON<any>(encryptedCreds);
    const auth = "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
    const r = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live",
      {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify([{ target: domain, location_code: 2840, language_code: "en" }]),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as Json;
    const item = j.tasks?.[0]?.result?.[0]?.items?.[0]?.metrics?.organic ?? null;
    if (!item) return null;
    return {
      rank: item.pos_1 ?? null,
      organic_keywords: item.count ?? null,
      organic_traffic: item.etv ?? null,
    };
  } catch {
    return null;
  }
}

// ---------- Aggregator used by runAudit ----------
export async function gatherAnalyticsForAudit(
  clientId: string,
  pageUrl: string,
  domain: string,
): Promise<AnalyticsData | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("client_integrations")
    .select("provider, manual_credentials, status")
    .eq("client_id", clientId)
    .eq("auth_method", "manual")
    .in("provider", ["google", "gsc", "semrush", "dataforseo"]);

  if (!rows || rows.length === 0) return null;

  const byProvider = new Map<string, string>();
  for (const r of rows) {
    if (r.manual_credentials && r.status === "active") {
      byProvider.set(r.provider as string, r.manual_credentials as string);
    }
  }

  const [ga4, gsc] = await Promise.all([
    byProvider.has("google") ? fetchGa4Last30(byProvider.get("google")!) : Promise.resolve(null),
    byProvider.has("gsc") ? fetchGscLast30(byProvider.get("gsc")!, pageUrl) : Promise.resolve(null),
  ]);

  // Try Semrush, fall back to DataForSEO
  let competitive: Awaited<ReturnType<typeof fetchSemrushDomain>> = null;
  if (byProvider.has("semrush")) {
    competitive = await fetchSemrushDomain(byProvider.get("semrush")!, domain);
  }
  if (!competitive && byProvider.has("dataforseo")) {
    competitive = await fetchDataForSeoDomain(byProvider.get("dataforseo")!, domain);
  }

  const out: AnalyticsData = {};
  if (ga4) out.ga4 = ga4;
  if (gsc) out.gsc = gsc;
  // competitive is not part of AnalyticsData; we stash it via an extension
  if (competitive) (out as any).competitive = competitive;

  return Object.keys(out).length ? out : null;
}
