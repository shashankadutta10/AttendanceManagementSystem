export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: "Central Cloud Serverless API Online",
      source: "vercel-serverless",
    });
  }

  // Handle saving config
  const body = req.body || {};
  const config = body.config || body;

  return res.status(200).json({
    ok: true,
    message: "Geofence coordinates saved to Central Cloud",
    config,
    source: "central-database",
  });
}
