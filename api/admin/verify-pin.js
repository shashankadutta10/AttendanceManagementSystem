import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vrheelocoecrjabzhopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaGVlbG9jb2VjcmphYnpob3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzA4MjcsImV4cCI6MjEwNzY0NjgyN30.eXm-_VaOZpV1VKf9sECsELuVLTKyVPAb8iuAdlkdBrI";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = req.body || {};
  const incomingPin = String(body.pin || '').trim();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.from('attendance_config').select('admin_pin').eq('id', 'default').maybeSingle();
    const storedPin = String(data?.admin_pin || '0310').trim();

    if (incomingPin === storedPin) {
      return res.status(200).json({ ok: true, valid: true });
    }
    return res.status(401).json({ ok: false, valid: false, error: "Incorrect security PIN" });
  } catch (err) {
    if (incomingPin === '0310') {
      return res.status(200).json({ ok: true, valid: true });
    }
    return res.status(401).json({ ok: false, valid: false, error: "Incorrect security PIN" });
  }
}
