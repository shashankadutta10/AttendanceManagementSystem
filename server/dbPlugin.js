import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  let wifiIp = null;
  let hotspotIp = null;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
        const lower = name.toLowerCase();
        if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless')) {
          wifiIp = net.address;
        } else if (lower.includes('hotspot') || lower.includes('local area connection* 2')) {
          hotspotIp = net.address;
        }
      }
    }
  }

  if (!wifiIp && results.length > 0) {
    wifiIp = results[0].address;
  }
  if (!hotspotIp) {
    hotspotIp = '192.168.137.1';
  }

  return { wifiIp, hotspotIp, all: results };
}

const DB_PATH = path.resolve(process.cwd(), 'data', 'attendance_db.json');

const DEFAULT_DB = {
  config: {
    name: "SHASHANKA'S HOME",
    latitude: 27.48333,
    longitude: 94.58333,
    radius: 300,
    startTime: "00:00",
    endTime: "23:59",
    strictAccuracy: false,
  },
  adminPin: "0307",
  records: [],
};

function getDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return { ...DEFAULT_DB };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      config: { ...DEFAULT_DB.config, ...(parsed.config || {}) },
      adminPin: parsed.adminPin || "1234",
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch (err) {
    console.error("[Database] Error reading database, using fallback:", err);
    return { ...DEFAULT_DB };
  }
}

function saveDb(db) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error("[Database] Error saving database to disk:", err);
    return false;
  }
}

function isRequestFromLaptop(req) {
  const host = req.headers?.host || '';
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1')
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 50 * 1024 * 1024) { // 50MB limit for high-res photo audits
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, method = 'GET') {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (method === 'HEAD') {
    res.end();
  } else {
    res.end(JSON.stringify(payload));
  }
}

export function attendanceBackendPlugin() {
  // Ensure database file is initialized on server startup
  getDb();

  return {
    name: 'attendance-backend-plugin',
    configureServer(server) {
      handleMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      handleMiddlewares(server.middlewares);
    },
  };
}

function handleMiddlewares(middlewares) {
  middlewares.use(async (req, res, next) => {
    // Only intercept requests starting with /api/
    if (!req.url || !req.url.startsWith('/api/')) {
      return next();
    }

    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const method = req.method ? req.method.toUpperCase() : 'GET';
    const isLaptop = isRequestFromLaptop(req);

    // Standard CORS headers for multi-device cross-network support
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      // 1. GET/HEAD /api/status - Server health, device role & live network info
      if (pathname === '/api/status' && (method === 'GET' || method === 'HEAD')) {
        const db = getDb();
        const network = getLocalIpAddresses();
        return sendJson(res, 200, {
          ok: true,
          serverTime: new Date().toISOString(),
          isLaptop,
          clientIp: req.socket?.remoteAddress,
          host: req.headers?.host,
          totalRecords: db.records.length,
          locationName: db.config.name,
          wifiIp: network.wifiIp,
          hotspotIp: network.hotspotIp,
          networkIps: network.all,
        }, method);
      }

      // 2. GET/HEAD /api/config - Central Geofence & Schedule Parameters
      if (pathname === '/api/config' && (method === 'GET' || method === 'HEAD')) {
        const db = getDb();
        return sendJson(res, 200, {
          ok: true,
          config: db.config,
          isLaptop,
        }, method);
      }

      // 3. POST /api/config - Update Central Geofence (Admin only)
      if (pathname === '/api/config' && method === 'POST') {
        const body = await readJsonBody(req);
        const db = getDb();
        const incomingPin = String(req.headers['x-admin-pin'] || body.adminPin || body.pin || '').trim();
        const expectedPin = String(db.adminPin || '0307').trim();

        // Enforce password check: Only authorized admin with correct PIN can edit database
        if (incomingPin !== expectedPin) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized: Correct Admin PIN required to edit database" });
        }

        const incoming = body.config || body;

        // Merge updated config
        db.config = {
          ...db.config,
          ...incoming,
        };
        if (incoming.name) {
          db.config.name = String(incoming.name).trim();
        }
        if (incoming.latitude !== undefined && !isNaN(Number(incoming.latitude))) {
          db.config.latitude = Number(Number(incoming.latitude).toFixed(6));
        }
        if (incoming.longitude !== undefined && !isNaN(Number(incoming.longitude))) {
          db.config.longitude = Number(Number(incoming.longitude).toFixed(6));
        }
        if (incoming.radius !== undefined && !isNaN(Number(incoming.radius))) {
          db.config.radius = Math.round(Number(incoming.radius));
        }
        if (incoming.strictAccuracy !== undefined) {
          db.config.strictAccuracy = Boolean(incoming.strictAccuracy);
        }
        if (incoming.startTime) {
          db.config.startTime = String(incoming.startTime).trim();
        }
        if (incoming.endTime) {
          db.config.endTime = String(incoming.endTime).trim();
        }

        const saved = saveDb(db);
        if (!saved) {
          return sendJson(res, 500, { ok: false, error: "Failed to write database to disk" });
        }

        console.log(`[Database] Geofence config saved to Central DB: "${db.config.name}" (${db.config.latitude}, ${db.config.longitude}), radius: ${db.config.radius}m`);
        return sendJson(res, 200, { ok: true, config: db.config });
      }

      // 4. GET/HEAD /api/records - Retrieve All Attendance Records (Central DB)
      if (pathname === '/api/records' && (method === 'GET' || method === 'HEAD')) {
        const db = getDb();
        return sendJson(res, 200, {
          ok: true,
          records: db.records,
          total: db.records.length,
          lastUpdated: new Date().toISOString(),
        }, method);
      }

      // 5. POST /api/records - Submit New Attendance Record (Students on iOS/Android or Laptop)
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

        // Security enforcement: Reject if distance to location is greater than central database radius
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

      // 6. POST /api/records/bulk - Merge historical local records into central DB
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
          // Sort by timestamp or submittedAt descending
          db.records.sort((a, b) => (b.submittedAt || b.timestamp || '').localeCompare(a.submittedAt || a.timestamp || ''));
          saveDb(db);
          console.log(`[Database] Merged ${addedCount} historical records into central database.`);
        }
        return sendJson(res, 200, { ok: true, added: addedCount, total: db.records.length });
      }

      // 7. DELETE /api/records/:id - Delete single attendance record (Admin only)
      if (pathname.startsWith('/api/records/') && method === 'DELETE') {
        const incomingPin = String(req.headers['x-admin-pin'] || '').trim();
        const db = getDb();
        if (incomingPin !== String(db.adminPin || '0307').trim()) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized: Admin PIN required to delete records" });
        }
        const id = pathname.replace('/api/records/', '').trim();
        const initialCount = db.records.length;
        db.records = db.records.filter((r) => r.id !== id);
        saveDb(db);
        console.log(`[Database] Record ${id} deleted. Remaining: ${db.records.length}`);
        return sendJson(res, 200, { ok: true, deleted: initialCount !== db.records.length });
      }

      // 8. POST /api/records/clear - Clear all records (Admin only)
      if (pathname === '/api/records/clear' && method === 'POST') {
        const body = await readJsonBody(req);
        const incomingPin = String(req.headers['x-admin-pin'] || body.adminPin || body.pin || '').trim();
        const db = getDb();
        if (incomingPin !== String(db.adminPin || '0307').trim()) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized: Admin PIN required to clear records" });
        }
        db.records = [];
        saveDb(db);
        console.log(`[Database] Master logs CLEARED by Admin`);
        return sendJson(res, 200, { ok: true, message: "All records cleared" });
      }

      // 9. POST /api/admin/verify-pin - Security PIN check
      if (pathname === '/api/admin/verify-pin' && method === 'POST') {
        const body = await readJsonBody(req);
        const db = getDb();
        const pin = String(body.pin || '').trim();
        const expectedPin = String(db.adminPin || '0307').trim();

        if (pin === expectedPin) {
          return sendJson(res, 200, { ok: true, valid: true });
        }
        return sendJson(res, 401, { ok: false, valid: false, error: "Incorrect security PIN" });
      }

      // 10. POST /api/admin/update-pin - Change Security PIN
      if (pathname === '/api/admin/update-pin' && method === 'POST') {
        const body = await readJsonBody(req);
        const incomingPin = String(req.headers['x-admin-pin'] || body.currentPin || '').trim();
        const db = getDb();
        if (incomingPin !== String(db.adminPin || '0307').trim()) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized: Correct current PIN required to change PIN" });
        }
        const newPin = String(body.newPin || '').trim();
        if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
          return sendJson(res, 400, { ok: false, error: "PIN must be exactly 4 digits" });
        }
        db.adminPin = newPin;
        saveDb(db);
        console.log(`[Database] Admin PIN updated successfully to: ${newPin}`);
        return sendJson(res, 200, { ok: true, message: "PIN updated" });
      }


      // Unknown API route
      return sendJson(res, 404, { ok: false, error: `Route ${method} ${pathname} not found` });
    } catch (err) {
      console.error("[Database] API Error:", err);
      return sendJson(res, 500, { ok: false, error: err.message || "Internal server error" });
    }
  });
}
