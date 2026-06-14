import server from "../dist/server/server.js";

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const request = new Request(url.toString(), {
    method: req.method,
    headers: new Headers(req.headers),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
  });

  const response = await server.fetch(request);

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));

  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
}
