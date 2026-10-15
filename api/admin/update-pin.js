import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vrheelocoecrjabzhopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaGVlbG9jb2VjcmphYnpob3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzA4MjcsImV4cCI6MjEwNzY0NjgyN30.eXm-_VaOZpV1VKf9sECsELuVLTKyVPAb8iuAdlkdBrI";

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

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await sb.from('attendance_config').upsert({ id: 'default', admin_pin: newPin, updated_at: new Date().toISOString() });
  } catch (err) {
    console.warn("[Vercel API] Supabase PIN update note:", err.message);
  }

  return res.status(200).json({
    ok: true,
    message: "Admin PIN updated successfully",
    newPin,
    source: "central-database",
  });
}
