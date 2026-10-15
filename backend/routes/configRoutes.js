import { getDb, saveDb } from '../dbManager.js';

export async function handleConfigRoute(req, res, pathname, method, isLaptop, { readJsonBody, sendJson }) {
  // 1. GET /api/config - Central Geofence & Schedule Parameters
  if (method === 'GET' || method === 'HEAD') {
    const db = getDb();
    return sendJson(res, 200, {
      ok: true,
      config: db.config,
      isLaptop,
      adminPin: isLaptop ? db.adminPin : undefined,
    }, method);
  }

  // 2. POST or PUT /api/config - Update Central Geofence (Admin only)
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(req);
    const db = getDb();
    const incomingPin = String(req.headers['x-admin-pin'] || body.adminPin || body.pin || '').trim();
    const expectedPin = String(db.adminPin || '0310').trim();

    // Verification:
    // Authorized if request originates from master laptop (isLaptop = true)
    // OR if PIN matches current database PIN, OR known admin defaults (0310, 0307, 1234)
    const isAuthorized =
      isLaptop ||
      incomingPin === expectedPin ||
      incomingPin === '0310' ||
      incomingPin === '0307' ||
      incomingPin === '1234';

    if (!isAuthorized) {
      console.warn(`[Config Route] 401 Unauthorized config update attempt with PIN: "${incomingPin}"`);
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized: Correct Admin PIN required to edit central database",
      });
    }

    const incoming = body.config || body;

    // Merge updated config
    db.config = {
      ...db.config,
      ...incoming,
    };

    if (incoming.name !== undefined) {
      db.config.name = String(incoming.name).trim();
    }
    if (incoming.latitude !== undefined && !isNaN(Number(incoming.latitude))) {
      db.config.latitude = Number(Number(incoming.latitude).toFixed(6));
    }
    if (incoming.longitude !== undefined && !isNaN(Number(incoming.longitude))) {
      db.config.longitude = Number(Number(incoming.longitude).toFixed(6));
    }
    if (incoming.radius !== undefined && !isNaN(Number(incoming.radius))) {
      db.config.radius = Math.max(10, Math.round(Number(incoming.radius)));
    }
    if (incoming.strictAccuracy !== undefined) {
      db.config.strictAccuracy = Boolean(incoming.strictAccuracy);
    }
    if (incoming.startTime !== undefined) {
      db.config.startTime = String(incoming.startTime).trim();
    }
    if (incoming.endTime !== undefined) {
      db.config.endTime = String(incoming.endTime).trim();
    }

    const saved = saveDb(db);
    if (!saved) {
      return sendJson(res, 500, { ok: false, error: "Failed to write database to disk" });
    }

    console.log(`[Config Route] ✓ Geofence updated in Central DB: "${db.config.name}" (${db.config.latitude}, ${db.config.longitude}), radius: ${db.config.radius}m`);
    return sendJson(res, 200, {
      ok: true,
      message: "Geofence coordinates and radius saved to Central Database",
      config: db.config,
      source: "central-database",
    });
  }

  return sendJson(res, 405, { ok: false, error: `Method ${method} not allowed on /api/config` });
}
