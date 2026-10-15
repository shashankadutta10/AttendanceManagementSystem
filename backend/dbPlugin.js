import { getDb } from './dbManager.js';
import { startManagedCloudflareTunnel } from './networkManager.js';
import { handleConfigRoute } from './routes/configRoutes.js';
import { handleRecordsRoute } from './routes/recordsRoutes.js';
import { handleAdminRoute } from './routes/adminRoutes.js';

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
      if (data.length > 50 * 1024 * 1024) { // 50MB limit
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

function handleMiddlewares(middlewares) {
  middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // Only intercept /api routes
    if (!pathname.startsWith('/api')) {
      return next();
    }

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin, Authorization, Accept');

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const isLaptop = isRequestFromLaptop(req);
    const helpers = { readJsonBody, sendJson };

    try {
      // 1. Config Routes: /api/config
      if (pathname === '/api/config') {
        return await handleConfigRoute(req, res, pathname, method, isLaptop, helpers);
      }

      // 2. Records Routes: /api/records, /api/records/*
      if (pathname === '/api/records' || pathname.startsWith('/api/records/')) {
        return await handleRecordsRoute(req, res, pathname, method, isLaptop, helpers);
      }

      // 3. Admin & System Routes: /api/status, /api/admin/*, /api/website/*
      if (
        pathname === '/api/status' ||
        pathname.startsWith('/api/admin/') ||
        pathname.startsWith('/api/website/')
      ) {
        return await handleAdminRoute(req, res, pathname, method, isLaptop, helpers);
      }

      // Unknown route
      return sendJson(res, 404, { ok: false, error: `Route ${method} ${pathname} not found` });
    } catch (err) {
      console.error("[Backend Server] API Error:", err);
      return sendJson(res, 500, { ok: false, error: err.message || "Internal server error" });
    }
  });
}

export function attendanceBackendPlugin() {
  // Ensure database file is initialized on server startup
  getDb();

  return {
    name: 'attendance-backend-plugin',
    configureServer(server) {
      handleMiddlewares(server.middlewares);
      startManagedCloudflareTunnel().catch((err) => {
        console.warn('[Direct Website] Background start deferred:', err?.message || err);
      });
    },
    configurePreviewServer(server) {
      handleMiddlewares(server.middlewares);
      startManagedCloudflareTunnel().catch((err) => {
        console.warn('[Direct Website] Background start deferred:', err?.message || err);
      });
    },
  };
}
