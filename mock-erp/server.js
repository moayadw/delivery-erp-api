// A tiny fake ERP that behaves like a very small Odoo:
//  - accepts deliveries and receipts over HTTP
//  - idempotent: the same externalId never creates a duplicate
//  - fails on purpose some of the time (FAIL_RATE) so you can watch retries work
//  - GET /state shows everything the "ERP" holds
const http = require('http');
const PORT = Number(process.env.PORT || 4000);
const FAIL_RATE = Number(process.env.FAIL_RATE ?? 0.3);
const DELAY_MS = Number(process.env.DELAY_MS ?? 300);
const deliveries = new Map();
const receipts = new Map();
let deliverySeq = 1000;
let documentSeq = 5000;
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body, null, 2)); };
const readJson = (req) => new Promise((resolve, reject) => {
  let data = ''; req.on('data', (c) => (data += c));
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
});
const server = http.createServer(async (req, res) => {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  if (req.method === 'GET' && req.url === '/state') {
    return send(res, 200, {
      deliveries: [...deliveries.entries()].map(([externalId, d]) => ({ externalId, ...d })),
      receipts: [...receipts.entries()].map(([externalId, r]) => ({ externalId, ...r })),
    });
  }
  if (req.method === 'POST' && (req.url === '/deliveries' || req.url === '/receipts')) {
    if (Math.random() < FAIL_RATE) { console.log(`[mock-erp] ${req.url} -> 503 (simulated failure)`); return send(res, 503, { error: 'ERP temporarily unavailable' }); }
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    if (!body.externalId) return send(res, 400, { error: 'externalId is required' });
    if (req.url === '/deliveries') {
      let d = deliveries.get(body.externalId); const duplicate = !!d;
      if (!d) { d = { reference: `PICK/${++deliverySeq}`, title: body.title, deliveryDate: body.deliveryDate }; deliveries.set(body.externalId, d); }
      console.log(`[mock-erp] delivery ${d.reference} ${duplicate ? '(already existed)' : '(created)'}`);
      return send(res, 200, { reference: d.reference, duplicate });
    }
    let r = receipts.get(body.externalId); const duplicate = !!r;
    if (!r) { r = { documentNumber: `DOC-${++documentSeq}`, deliveryReference: body.deliveryReference, type: body.type, amount: body.amount, fileName: body.fileName }; receipts.set(body.externalId, r); }
    console.log(`[mock-erp] receipt ${r.documentNumber} ${duplicate ? '(already existed)' : '(created)'}`);
    return send(res, 200, { documentNumber: r.documentNumber, duplicate });
  }
  send(res, 404, { error: 'Not found' });
});
server.listen(PORT, () => console.log(`[mock-erp] listening on http://localhost:${PORT}  (fail rate ${FAIL_RATE * 100}%)`));
