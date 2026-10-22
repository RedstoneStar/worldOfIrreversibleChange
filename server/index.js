// 24/7 Server for "World of Irreversible Change" (Ren & Sora).
// Zero external npm dependencies—runs natively on Node 20+ and Hugging Face Spaces (port 7860).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldSimulation } from './sim/worldState.js';
import { setAiConfig, getAiStatus, testAiConnection } from './sim/mind.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');

const PORT = Number(process.env.PORT || 7860);
const fresh = process.argv.includes('--fresh');

const sim = new WorldSimulation({ fresh });
const sseClients = new Set();

// Continuous 24/7 background simulation loop (5 ticks/sec, broadcast every 200ms for smooth 60fps client tracking)
let lastTickMs = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTickMs) / 1000;
  lastTickMs = now;
  sim.tick(dt);

  if (sseClients.size > 0) {
    const payload = `data: ${JSON.stringify(sim.snapshot())}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }
}, 200);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32768) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // 1. Live Server-Sent Events stream
  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify(sim.snapshot())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // 2. Current state snapshot
  if (req.method === 'GET' && pathname === '/api/state') {
    return sendJson(res, 200, sim.snapshot());
  }

  // 2b. Health check / keep-alive ping for 24/7 host monitoring
  if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/ping')) {
    return sendJson(res, 200, { status: 'ok', time: sim.clock.label(), clients: sseClients.size });
  }

  // 3. Visitor Lantern Offering (harmless environmental blessing)
  if (req.method === 'POST' && pathname === '/api/lantern') {
    try {
      const body = await readJsonBody(req);
      const lantern = sim.addFloatingLantern({
        x: body.x,
        y: body.y,
        message: body.message,
        from: body.from,
      });
      return sendJson(res, 200, { ok: true, lantern });
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid lantern payload' });
    }
  }

  // 4. Configure & Test Free AI API Keys (Gemini / Groq / Cloud toggle)
  if (req.method === 'POST' && pathname === '/api/ai-config') {
    try {
      const body = await readJsonBody(req);
      setAiConfig(body);
      const testRes = await testAiConnection();
      return sendJson(res, 200, { ok: testRes.ok, ai: getAiStatus(), error: testRes.error || '' });
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid config payload' });
    }
  }

  // 4b. Full World Reset (wipes characters, memories, structures, paths, and optionally generates a new terrain seed)
  if (req.method === 'POST' && pathname === '/api/reset') {
    try {
      const body = await readJsonBody(req);
      const snap = sim.resetWorld({ newSeed: Boolean(body.newSeed) });
      const payload = `data: ${JSON.stringify(snap)}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(payload);
        } catch {
          sseClients.delete(client);
        }
      }
      return sendJson(res, 200, { ok: true, state: snap });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  // 5. Serve shared ES modules (/shared/*)
  if (req.method === 'GET' && pathname.startsWith('/shared/')) {
    const rel = pathname.slice('/shared/'.length);
    const filePath = path.resolve(SHARED_DIR, rel);
    if (!filePath.startsWith(SHARED_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  // 6. Serve public frontend files
  if (req.method === 'GET') {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

process.on('SIGINT', () => {
  sim.saveToDisk();
  process.exit(0);
});
process.on('SIGTERM', () => {
  sim.saveToDisk();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ World of Irreversible Change is alive at http://localhost:${PORT}`);
  console.log(`   Founders: Ren & Sora | Time: ${sim.clock.label()}`);
});
