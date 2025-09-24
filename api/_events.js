// Simple in-memory SSE client registry
const clients = new Set();

export function registerClient(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
    res.end();
  });
}

export function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload, ts: Date.now() });
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      // best-effort
    }
  }
}


