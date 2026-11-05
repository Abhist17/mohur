// Mohur logging JSON-RPC proxy - dependency-free.
// Forwards JSON-RPC to UPSTREAM and logs ONLY: time, source IP, whether that IP is a Tor exit, method.
// GET /log returns the last 500 entries (feeds the dashboard's Privacy screen).
//
//   UPSTREAM=https://sepolia.base.org PORT=8787 node proxy/server.mjs
//   (expose it with any tunnel; the source IP is taken from x-forwarded-for when TRUST_PROXY=1)
import http from "node:http";

const UPSTREAM = process.env.UPSTREAM || "https://sepolia.base.org";
const PORT = Number(process.env.PORT || 8787);
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const TOR_LIST = "https://check.torproject.org/torbulkexitlist";

const entries = [];
let torExits = new Set();

async function refreshTor() {
  try {
    const r = await fetch(TOR_LIST);
    const txt = await r.text();
    torExits = new Set(txt.split("\n").map((s) => s.trim()).filter(Boolean));
    console.log(`tor exit list: ${torExits.size} addresses`);
  } catch (e) {
    console.warn("could not refresh tor exit list:", e.message);
  }
}
refreshTor();
setInterval(refreshTor, 30 * 60 * 1000);

function sourceIp(req) {
  const fwd = TRUST_PROXY && req.headers["x-forwarded-for"];
  const ip = (fwd ? String(fwd).split(",")[0] : req.socket.remoteAddress) || "?";
  return ip.replace(/^::ffff:/, "").trim();
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    if (req.method === "GET" && req.url?.startsWith("/log")) {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      return res.end(JSON.stringify({ upstream: new URL(UPSTREAM).host, entries: entries.slice(0, 500) }));
    }
    if (req.method !== "POST") return res.writeHead(404, cors).end();

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    const ip = sourceIp(req);
    let methods = "?";
    try {
      const j = JSON.parse(body);
      methods = Array.isArray(j) ? j.map((x) => x.method).join(",") : j.method;
    } catch {}
    entries.unshift({ t: Date.now(), ip, tor: torExits.has(ip), method: methods });
    if (entries.length > 2000) entries.length = 2000;

    try {
      const up = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body });
      const text = await up.text();
      res.writeHead(up.status, { ...cors, "content-type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "upstream error" } }));
    }
  })
  .listen(PORT, () => console.log(`mohur proxy on :${PORT} -> ${UPSTREAM}`));
