import { getDb, saveDb } from '../dbManager.js';
import { getLocalIpAddresses, getCurrentCloudflareUrl, startManagedCloudflareTunnel } from '../networkManager.js';

export async function handleAdminRoute(req, res, pathname, method, isLaptop, { readJsonBody, sendJson }) {
  // 1. GET/HEAD /api/status - Live Health, Database & Cloudflare Link Status
  if (pathname === '/api/status' && (method === 'GET' || method === 'HEAD')) {
    const db = getDb();
    const network = getLocalIpAddresses();
    return sendJson(res, 200, {
      ok: true,
      status: 'healthy',
      recordCount: db.records.length,
      lastUpdated: new Date().toISOString(),
      isLaptop,
      adminPin: isLaptop ? db.adminPin : undefined,
      directWebsiteUrl: getCurrentCloudflareUrl(),
      wifiIp: network.wifiIp,
      hotspotIp: network.hotspotIp,
      networkIps: network.all,
    }, method);
  }

  // 2. POST /api/admin/verify-pin - Security PIN check
  if (pathname === '/api/admin/verify-pin' && method === 'POST') {
    const body = await readJsonBody(req);
    const db = getDb();
    const pin = String(body.pin || '').trim();
    const expectedPin = String(db.adminPin || '0310').trim();

    const isValid = pin === expectedPin;

    if (isValid) {
      return sendJson(res, 200, { ok: true, valid: true });
    }
    return sendJson(res, 401, { ok: false, valid: false, error: "Incorrect security PIN" });
  }

  // 3. POST /api/admin/update-pin - Change Security PIN
  if (pathname === '/api/admin/update-pin' && method === 'POST') {
    const body = await readJsonBody(req);
    const incomingPin = String(req.headers['x-admin-pin'] || body.currentPin || '').trim();
    const db = getDb();
    const expectedPin = String(db.adminPin || '0310').trim();

    const isCurrentValid = isLaptop || incomingPin === expectedPin;

    if (!isCurrentValid) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized: Correct current PIN required to change PIN" });
    }

    const newPin = String(body.newPin || '').trim();
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return sendJson(res, 400, { ok: false, error: "PIN must be exactly 4 digits" });
    }

    db.adminPin = newPin;
    saveDb(db);
    console.log(`[Database] Admin PIN updated successfully to: ${newPin}`);
    return sendJson(res, 200, { ok: true, message: "PIN updated", newPin });
  }

  // 4. POST /api/website/reconnect - Refresh / reconnect live Cloudflare direct website link
  if (pathname === '/api/website/reconnect' && method === 'POST') {
    const cloudflareUrl = await startManagedCloudflareTunnel(true);
    const network = getLocalIpAddresses();
    return sendJson(res, 200, {
      ok: Boolean(cloudflareUrl),
      directWebsiteUrl: cloudflareUrl,
      wifiIp: network.wifiIp,
      hotspotIp: network.hotspotIp,
    });
  }

  return sendJson(res, 404, { ok: false, error: `Route ${method} ${pathname} not found` });
}
