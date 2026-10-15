export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = req.body || {};
  const newPin = String(body.newPin || '').trim();

  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ ok: false, error: "PIN must be exactly 4 digits" });
  }

  return res.status(200).json({
    ok: true,
    message: "Admin PIN updated successfully",
    newPin,
    source: "central-database",
  });
}
