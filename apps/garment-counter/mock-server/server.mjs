// Local mock of the Jetson + EC2 backends for testing the Garment Counter
// without real hardware. Zero dependencies — uses Node's built-in http server.
//
// Run:  node mock-server/server.mjs   (from the garment-counter app folder)
// Then in the app Settings set BOTH the Camera (Jetson) URL and the
// Cloud (EC2) URL to:  http://localhost:4000
//
// Behavior:
//  - GET  /transaction/            starts a transaction; begins emitting
//                                   detections every ~1.2s with rising cloth_id
//  - POST /transaction/            stops the active transaction (status=0)
//  - GET  /transaction/check/:id/  reports whether a Before Wash exists
//  - GET  /single_cloth/           returns the latest detection (or {})
//  - POST /single_cloth/           corrects the latest cloth's category
//  - POST /move_cloth/             resolves a discrepancy (mismatch_resolved)
//  - GET  /cloth_count/single_transaction/?uniq_id=X   items for a session
//  - GET  /cloth_count/before_wash/?trans_id=X         before-wash items by order
//  - GET  /orders/summary/                             per-order dashboard rollup
//  - GET  /transaction/history/?operator_name=X        session history
//
// Toggle a scripted After-Wash discrepancy by starting an "After Wash"
// transaction — the mock deliberately emits one fewer shirt than Before Wash.

import { createServer } from 'node:http';

const PORT = 4000;
const CATEGORIES = ['shirts', 'pants', 'towels'];

/** In-memory state. */
const state = {
  clothId: 0,
  latest: null,
  itemsByUniqId: new Map(), // uniqId -> DetectionEvent[]
  beforeWashByOrder: new Map(), // trans_id -> uniqId (completed Before Wash)
  active: null, // { transId, uniqId, type, operatorName } | null
  emitTimer: null,
  history: [], // TransactionSummary-like
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Allow the Vite dev origin to call us.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function emitDetection() {
  if (!state.active) return;
  state.clothId += 1;
  const { transId, uniqId, type, operatorName } = state.active;

  // Rotate categories; for After Wash, "lose" one shirt so a discrepancy shows.
  const idx = state.clothId % CATEGORIES.length;
  let clothType = CATEGORIES[idx];
  if (type === 'After Wash' && clothType === 'shirts' && state.clothId % 6 === 0) {
    clothType = 'pants'; // misclassify -> fewer shirts than before wash
  }

  const detection = {
    cloth_id: state.clothId,
    cloth_type: clothType,
    file_path: `mock/${state.clothId}.jpg`,
    date: new Date().toISOString(),
    ismodified: false,
    wash_type: type,
    trans_id: transId,
    operator_name: operatorName,
    uniq_id: uniqId,
    status: 'ok',
    confidence: 60 + ((state.clothId * 7) % 40), // 60..99, some below 70
  };
  state.latest = detection;
  const list = state.itemsByUniqId.get(uniqId) ?? [];
  list.push(detection);
  state.itemsByUniqId.set(uniqId, list);
  console.log(`  + detection #${state.clothId} ${clothType} (${detection.confidence}%)`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') return json(res, 204, {});

  // --- Jetson: start transaction ---
  if (req.method === 'GET' && path === '/transaction/') {
    const transId = url.searchParams.get('id') ?? '';
    const type = url.searchParams.get('type') ?? 'Before Wash';
    const uniqId = url.searchParams.get('uniq_id') ?? '';
    const operatorName = url.searchParams.get('operator_name') ?? '';

    if (state.active) return json(res, 409, { detail: 'transaction already running' });

    state.active = { transId, uniqId, type, operatorName };
    state.latest = null;
    state.clothId = 0; // reset per transaction so ids start at 1
    state.history.unshift({
      trans_id: transId,
      uniq_id: uniqId,
      type,
      operator_name: operatorName,
      date: new Date().toISOString(),
    });
    clearInterval(state.emitTimer);
    state.emitTimer = setInterval(emitDetection, 1200);
    console.log(`START ${type} order=${transId} uniq=${uniqId}`);
    return json(res, 200, { success: true });
  }

  // --- Jetson: stop transaction ---
  if (req.method === 'POST' && path === '/transaction/') {
    clearInterval(state.emitTimer);
    state.emitTimer = null;
    if (state.active?.type === 'Before Wash') {
      state.beforeWashByOrder.set(state.active.transId, state.active.uniqId);
    }
    console.log(`STOP  order=${state.active?.transId}`);
    state.active = null;
    return json(res, 200, { success: true });
  }

  // --- EC2: Before Wash existence check ---
  if (req.method === 'GET' && path.startsWith('/transaction/check/')) {
    const transId = decodeURIComponent(path.split('/').filter(Boolean)[2] ?? '');
    return json(res, 200, { exists: state.beforeWashByOrder.has(transId) });
  }

  // --- EC2: transaction history ---
  if (req.method === 'GET' && path === '/transaction/history/') {
    return json(res, 200, state.history);
  }

  // --- Mock detection image ---
  // Serves a generated SVG for any /mock/<id>.jpg path the detections point to,
  // so the Last Detection panel shows a real (placeholder) picture.
  if (req.method === 'GET' && path.startsWith('/mock/')) {
    const label = decodeURIComponent(path.replace(/^\/mock\//, '').replace(/\.jpg$/i, ''));
    // color the tile by the id so successive detections look different
    const hue = (parseInt(label, 10) * 47) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
      <rect width="240" height="240" fill="hsl(${hue},55%,45%)"/>
      <text x="50%" y="45%" font-family="sans-serif" font-size="28" fill="white"
            text-anchor="middle">garment</text>
      <text x="50%" y="62%" font-family="sans-serif" font-size="40" font-weight="bold"
            fill="white" text-anchor="middle">#${label}</text>
    </svg>`;
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(svg);
    return;
  }

  // --- EC2: latest detection ---
  if (req.method === 'GET' && path === '/single_cloth/') {
    return json(res, 200, state.latest ?? {});
  }

  // --- EC2: correct latest cloth ---
  if (req.method === 'POST' && path === '/single_cloth/') {
    const body = JSON.parse((await readBody(req)) || '{}');
    if (state.latest && state.latest.cloth_id === body.cloth_id) {
      state.latest.cloth_type = body.category;
      state.latest.ismodified = true;
    }
    console.log(`CORRECT cloth=${body.cloth_id} -> ${body.category}`);
    return json(res, 200, { success: true });
  }

  // --- EC2: move cloth (discrepancy resolution) ---
  if (req.method === 'POST' && path === '/move_cloth/') {
    const body = JSON.parse((await readBody(req)) || '{}');
    console.log(`MOVE cloth=${body.cloth_id} -> ${body.target_category}`);
    return json(res, 200, { mismatch_resolved: true, new_status: 'balanced' });
  }

  // --- EC2: items for a session ---
  if (req.method === 'GET' && path === '/cloth_count/single_transaction/') {
    const uniqId = url.searchParams.get('uniq_id') ?? '';
    return json(res, 200, state.itemsByUniqId.get(uniqId) ?? []);
  }

  // --- EC2: Before Wash items for an order (by trans_id) ---
  // The iPad knows the order id but not the prior Before Wash session's
  // uniq_id, so this resolves it server-side.
  if (req.method === 'GET' && path === '/cloth_count/before_wash/') {
    const transId = url.searchParams.get('trans_id') ?? '';
    const bwUniqId = state.beforeWashByOrder.get(transId);
    const items = bwUniqId ? (state.itemsByUniqId.get(bwUniqId) ?? []) : [];
    return json(res, 200, items);
  }

  // --- EC2: per-order dashboard summary ---
  // Groups all sessions by order and reports Before/After category counts plus
  // whether they mismatch. Used by the Orders Dashboard.
  if (req.method === 'GET' && path === '/orders/summary/') {
    const byOrder = new Map();
    // history is newest-first; walk oldest-first so latest session per phase wins
    for (const h of [...state.history].reverse()) {
      const entry = byOrder.get(h.trans_id) ?? {
        transId: h.trans_id,
        operatorName: h.operator_name,
        beforeUniqId: null,
        afterUniqId: null,
        date: h.date,
      };
      if (h.type === 'Before Wash') entry.beforeUniqId = h.uniq_id;
      if (h.type === 'After Wash') entry.afterUniqId = h.uniq_id;
      entry.date = h.date;
      byOrder.set(h.trans_id, entry);
    }

    const countByType = (uniqId) => {
      const out = {};
      for (const it of state.itemsByUniqId.get(uniqId) ?? []) {
        out[it.cloth_type] = (out[it.cloth_type] ?? 0) + 1;
      }
      return out;
    };

    const summary = [...byOrder.values()].map((o) => {
      const before = o.beforeUniqId ? countByType(o.beforeUniqId) : {};
      const after = o.afterUniqId ? countByType(o.afterUniqId) : {};
      const cats = new Set([...Object.keys(before), ...Object.keys(after)]);
      let mismatch = false;
      if (o.beforeUniqId && o.afterUniqId) {
        for (const c of cats) {
          if ((before[c] ?? 0) !== (after[c] ?? 0)) mismatch = true;
        }
      }
      return {
        trans_id: o.transId,
        operator_name: o.operatorName,
        date: o.date,
        before_total: Object.values(before).reduce((a, b) => a + b, 0),
        after_total: Object.values(after).reduce((a, b) => a + b, 0),
        before_by_category: before,
        after_by_category: after,
        has_before: Boolean(o.beforeUniqId),
        has_after: Boolean(o.afterUniqId),
        mismatch,
      };
    });
    return json(res, 200, summary);
  }

  return json(res, 404, { detail: `no mock route for ${req.method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`Mock Jetson+EC2 server listening on http://localhost:${PORT}`);
  console.log('Set BOTH the Camera and Cloud URLs to this address in Settings.');
});
