import { createClient } from "@supabase/supabase-js";

let singleton = null;

function readConfig() {
  let url = "";
  let anonKey = "";
  try {
    url = String(
      import.meta.env.VITE_SUPABASE_URL ??
        import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
        "",
    ).trim();
    anonKey = String(
      import.meta.env.VITE_SUPABASE_ANON_KEY ??
        import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        "",
    ).trim();
  } catch {
    /* import.meta.env unavailable outside Vite */
  }
  const w = typeof window !== "undefined" ? window.__NR_SUPABASE__ : null;
  if (w && typeof w === "object") {
    if (!url) url = String(w.url ?? "").trim();
    if (!anonKey) anonKey = String(w.anonKey ?? "").trim();
  }
  return { url, anonKey };
}

function credentialsAreUsable(url, anonKey) {
  if (!url || !anonKey) return false;
  if (/YOUR_PROJECT_REF|example\.supabase/i.test(url)) return false;
  if (/your_anon_public_key_here|^replace_me/i.test(anonKey)) return false;
  return true;
}

/**
 * Singleton Supabase client. Returns null if URL/anon key are not configured.
 */
export function getSupabaseClient() {
  if (singleton) return singleton;
  const { url, anonKey } = readConfig();
  if (!credentialsAreUsable(url, anonKey)) return null;
  singleton = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "nr-supabase-auth",
    },
  });
  return singleton;
}

export function isSupabaseConfigured() {
  const { url, anonKey } = readConfig();
  return credentialsAreUsable(url, anonKey);
}
