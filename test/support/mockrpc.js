// A stand-in Soroban RPC serving one fixture's chain, and failing the ways
// a real one can. `calls` counts requests, so a test can prove none were made.
import http from 'node:http';

export async function serveChain(chain) {
  const state = { calls: 0 };
  const latest = chain.latestLedger;
  const byKey = new Map(chain.entries.map((e) => [e.key, e]));
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      state.calls++;
      if (chain.fail === 'hang') return; // never answer
      const { method, params } = JSON.parse(body);
      let result;
      if (method === 'getLatestLedger') result = { sequence: latest, closeTime: String(chain.closeTime), protocolVersion: 29 };
      else if (method === 'getLedgerEntries') {
        const entries = params.keys.filter((k) => byKey.has(k)).map((k) => ({ ...byKey.get(k) }));
        // An entry for some other key, with the same shape and a value that would verify.
        if (chain.fail === 'badlayout') for (const e of entries) e.xdr = chain.decoys?.[e.key] ?? e.xdr;
        if (chain.fail === 'truncated') for (const e of entries) e.xdr = Buffer.from(e.xdr, 'base64').subarray(0, -12).toString('base64');
        if (chain.fail === 'trailing') for (const e of entries) e.xdr = Buffer.concat([Buffer.from(e.xdr, 'base64'), Buffer.alloc(4)]).toString('base64');
        if (chain.fail === 'shape') for (const e of entries) if (chain.shapes?.[e.key]) e.xdr = chain.shapes[e.key];
        result = { entries, latestLedger: latest };
      } else if (method === 'getLedgers') {
        const seq = params.startLedger;
        result = { ledgers: [{ sequence: seq, ledgerCloseTime: String(chain.closeTime - (latest - seq) * 5) }] };
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } }));
        return;
      }
      const reply = { jsonrpc: '2.0', id: 1, result };
      if (chain.fail === 'http500') { res.writeHead(500); res.end(JSON.stringify(reply)); return; }
      if (chain.fail === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>502 Bad Gateway</html>'); return; }
      if (chain.fail === 'jsonrpc') reply.error = { code: -32603, message: 'internal error' };
      if (chain.fail === 'noresult') delete reply.result;
      if (chain.fail === 'after1' && state.calls > 1) { res.writeHead(503); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  if (chain.fail === 'refused') {
    await close(server);
    return { url, state, close: async () => {} };
  }
  return { url, state, close: () => close(server) };
}

function close(server) {
  server.closeAllConnections();
  return new Promise((r) => server.close(r));
}
