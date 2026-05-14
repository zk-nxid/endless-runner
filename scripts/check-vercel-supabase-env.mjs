/**
 * On Vercel, fail the build if Supabase client env is missing from process.env.
 * (Vite inlines these at build time; an empty bundle silently shows the Account hint.)
 */
const URL_KEYS = ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
const ANON_KEYS = [
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function firstNonEmpty(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

if (process.env.VERCEL === "1") {
  const url = firstNonEmpty(URL_KEYS);
  const anon = firstNonEmpty(ANON_KEYS);
  if (!url || !anon) {
    console.error("\n[Vercel] Supabase env missing for this build.");
    console.error("Add to Project → Settings → Environment Variables (Production + Preview as needed), then redeploy.");
    console.error(`Need one of each — URL: ${URL_KEYS.join(", ")}`);
    console.error(`Anon key: ${ANON_KEYS.join(", ")}\n`);
    process.exit(1);
  }
}
