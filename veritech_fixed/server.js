// Vercel serverless entry point
// This file imports the built SSR server after `npm run build`
import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the built server
const { default: server } = await import(
  join(__dirname, "dist/server/server.js")
);

export default async function handler(req, res) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = new URL(req.url, `${protocol}://${host}`);

  const request = new Request(url.toString(), {
    method: req.method,
    headers: new Headers(req.headers),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
  });

  const response = await server.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") {
      res.setHeader(key, value);
    }
  });

  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
}
