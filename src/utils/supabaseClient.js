import { createClient } from "@supabase/supabase-js";

let cachedClient = null;
let cachedKey = null;

export function getSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  
  const localUrl = typeof window !== "undefined" ? localStorage.getItem("sa_supabase_url") || "" : "";
  const localKey = typeof window !== "undefined" ? localStorage.getItem("sa_supabase_key") || "" : "";

  const url = (localUrl || envUrl).trim();
  const key = (localKey || envKey).trim();

  return { url, key, isConfigured: Boolean(url && key) };
}

export function getSupabase() {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  const cacheId = `${url}:::${key}`;
  if (cachedClient && cachedKey === cacheId) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    cachedKey = cacheId;
    return cachedClient;
  } catch (err) {
    console.error("[Supabase] Initialization failed:", err);
    return null;
  }
}

export function saveSupabaseConfig(url, key) {
  if (typeof window !== "undefined") {
    localStorage.setItem("sa_supabase_url", url.trim());
    localStorage.setItem("sa_supabase_key", key.trim());
    cachedClient = null;
    cachedKey = null;
  }
}

export function clearSupabaseConfig() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("sa_supabase_url");
    localStorage.removeItem("sa_supabase_key");
    cachedClient = null;
    cachedKey = null;
  }
}
