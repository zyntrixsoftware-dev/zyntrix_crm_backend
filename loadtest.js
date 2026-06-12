/**
 * loadtest.js — concurrent load tester with keep-alive pooling (no deps, Node 18+).
 *
 * Keeps `CONCURRENCY` connections in flight and REUSES them (keep-alive) to send
 * TOTAL requests — this is the meaningful "sustained concurrency" measurement,
 * and avoids the flood of brand-new sockets that causes client/Cloudflare errors.
 *
 * Usage (run from your PC, NOT the server; use WSL/Linux for high numbers):
 *   node loadtest.js
 *   URL=https://api.zyntrixsoftware.com/ CONCURRENCY=1000 TOTAL=20000 node loadtest.js
 *   URL=.../api/lms/dashboard TOKEN=eyJ... CONCURRENCY=500 TOTAL=10000 node loadtest.js
 *
 *   CONCURRENCY = connections held open at once (the "load")
 *   TOTAL       = total requests to push through them (keep > concurrency so sockets reuse)
 */
const http = require("http");
const https = require("https");

const URL_STR     = process.env.URL || process.argv[2] || "https://api.zyntrixsoftware.com/";
const TOTAL       = parseInt(process.env.TOTAL || process.argv[3] || "10000", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || process.argv[4] || "1000", 10);
const METHOD      = (process.env.METHOD || "GET").toUpperCase();
const TOKEN       = process.env.TOKEN || "";
const BODY        = process.env.BODY || "";

const u   = new URL(URL_STR);
const lib = u.protocol === "https:" ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: CONCURRENCY, maxFreeSockets: CONCURRENCY });

const headers = {};
if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
if (METHOD !== "GET" && BODY) headers["Content-Type"] = "application/json";

let sent = 0, done = 0, errors = 0;
const codes = {};
const lat = [];
const t0 = Date.now();

function oneRequest() {
  return new Promise((resolve) => {
    const s = performance.now();
    const req = lib.request(URL_STR, { method: METHOD, headers, agent }, (res) => {
      res.on("data", () => {});                 // drain
      res.on("end", () => {
        codes[res.statusCode] = (codes[res.statusCode] || 0) + 1;
        lat.push(performance.now() - s); done++; resolve();
      });
    });
    req.on("error", (e) => {
      errors++; codes[e.code || "ERR"] = (codes[e.code || "ERR"] || 0) + 1;
      lat.push(performance.now() - s); done++; resolve();
    });
    if (METHOD !== "GET" && BODY) req.write(BODY);
    req.end();
  });
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];
}

async function run() {
  console.log(`\nLoad test  ->  ${METHOD} ${URL_STR}`);
  console.log(`Concurrency: ${CONCURRENCY} (kept open, reused)   Total requests: ${TOTAL}${TOKEN ? "   (auth)" : ""}\n`);
  async function worker() { while (sent < TOTAL) { sent++; await oneRequest(); } }
  const iv = setInterval(() => process.stdout.write(`\r  ${done}/${TOTAL} done`), 250);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, TOTAL) }, worker));
  clearInterval(iv);

  const secs = (Date.now() - t0) / 1000;
  const ok = Object.entries(codes).filter(([k]) => /^2\d\d$/.test(k)).reduce((a, [, n]) => a + n, 0);
  const avg = lat.reduce((a, b) => a + b, 0) / (lat.length || 1);
  console.log(`\n\n────────── Results ──────────`);
  console.log(`Requests    : ${done}   (success ${ok}, errors ${errors})`);
  console.log(`Time        : ${secs.toFixed(2)} s`);
  console.log(`Throughput  : ${(done / secs).toFixed(0)} req/s   (successful ${(ok / secs).toFixed(0)}/s)`);
  console.log(`Status codes:`, codes);
  console.log(`Latency (ms): avg ${avg.toFixed(0)} | p50 ${pct(lat,50).toFixed(0)} | p95 ${pct(lat,95).toFixed(0)} | p99 ${pct(lat,99).toFixed(0)} | max ${Math.max(...lat).toFixed(0)}`);
  console.log(`─────────────────────────────\n`);
}
run();
