import { getDb, saveDb } from '../dbManager.js';

export async function handleRecordsRoute(req, res, pathname, method, isLaptop, { readJsonBody, sendJson }) {
  // 1. GET/HEAD /api/records - Retrieve All Attendance Records (Central DB)
  if (pathname === '/api/records' && (method === 'GET' || method === 'HEAD')) {
    const db = getDb();
    return sendJson(res, 200, {
      ok: true,
      records: db.records,
      total: db.records.length,
      lastUpdated: new Date().toISOString(),
    }, method);
  }

  // 2. POST /api/records - Submit New Attendance Record (Students on iOS/Android or Laptop)
  if (pathname === '/api/records' && method === 'POST') {
    const body = await readJsonBody(req);
    if (!body || !body.studentName) {
      return sendJson(res, 400, { ok: false, error: "Missing required student attendance details" });
    }

    const db = getDb();
    const allowedRadius = db.config?.radius ? Number(db.config.radius) : 150;
    const submittedDistance = body.distanceMeters !== undefined && body.distanceMeters !== null
      ? Number(body.distanceMeters)
      : null;

    // Security check: Distance to geofence
    if (submittedDistance !== null && Number.isFinite(submittedDistance) && submittedDistance > allowedRadius) {
      console.warn(`[Database] ⚠️ Attendance REJECTED for ${body.studentName}: distance ${submittedDistance}m exceeds radius ${allowedRadius}m in central database.`);
      return sendJson(res, 403, {
        ok: false,
        error: `Location unverified: Distance (${submittedDistance}m) is greater than the allowed radius (${allowedRadius}m) in the central database. Attendance cannot be registered.`,
      });
    }

    const ua = req.headers?.['user-agent'] || '';
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && ua.includes('Mobile'));
    const record = {
      ...body,
      id: body.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      submittedAt: new Date().toISOString(),
      submittedFromIp: req.socket?.remoteAddress || 'unknown',
      deviceType: isIos
        ? 'iPhone (iOS)'
        : ua.includes('Android')
          ? 'Android'
          : isLaptop
            ? 'Host Laptop'
            : 'Desktop/Web',
    };

    // Prepend to central database
    db.records = [record, ...db.records];
    saveDb(db);
    console.log(`[Database] ✓ Attendance RECORDED: ${record.studentName} (${record.studentId}) from ${record.deviceType}. Total records: ${db.records.length}`);
    return sendJson(res, 201, { ok: true, record, total: db.records.length });
  }

  // 3. POST /api/records/bulk - Merge historical or offline queued records into central DB
  if (pathname === '/api/records/bulk' && method === 'POST') {
    const body = await readJsonBody(req);
    const incoming = Array.isArray(body.records) ? body.records : [];
    const db = getDb();
    const existingIds = new Set(db.records.map((r) => r.id));
    let addedCount = 0;

    for (const item of incoming) {
      if (item && item.id && !existingIds.has(item.id)) {
        db.records.push(item);
        existingIds.add(item.id);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      db.records.sort((a, b) => (b.submittedAt || b.timestamp || '').localeCompare(a.submittedAt || a.timestamp || ''));
      saveDb(db);
      console.log(`[Database] Merged ${addedCount} historical records into central database.`);
    }
    return sendJson(res, 200, { ok: true, added: addedCount, total: db.records.length });
  }

  // 4. DELETE /api/records/:id - Delete single attendance record (Admin only)
  if (pathname.startsWith('/api/records/') && method === 'DELETE') {
    const incomingPin = String(req.headers['x-admin-pin'] || '').trim();
    const db = getDb();
    const expectedPin = String(db.adminPin || '0310').trim();
    const isAuthorized = isLaptop || incomingPin === expectedPin;

    if (!isAuthorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized: Admin PIN required to delete records" });
    }

    const id = pathname.replace('/api/records/', '').trim();
    const initialCount = db.records.length;
    db.records = db.records.filter((r) => r.id !== id);
    saveDb(db);
    console.log(`[Database] Record ${id} deleted. Remaining: ${db.records.length}`);
    return sendJson(res, 200, { ok: true, deleted: initialCount !== db.records.length });
  }

  // 5. POST /api/records/clear - Clear all records (Admin only)
  if (pathname === '/api/records/clear' && method === 'POST') {
    const body = await readJsonBody(req);
    const incomingPin = String(req.headers['x-admin-pin'] || body.adminPin || body.pin || '').trim();
    const db = getDb();
    const expectedPin = String(db.adminPin || '0310').trim();
    const isAuthorized = isLaptop || incomingPin === expectedPin;

    if (!isAuthorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized: Admin PIN required to clear records" });
    }

    db.records = [];
    saveDb(db);
    console.log(`[Database] Master logs CLEARED by Admin`);
    return sendJson(res, 200, { ok: true, message: "All records cleared" });
  }

  return sendJson(res, 404, { ok: false, error: `Route ${method} ${pathname} not found` });
}
