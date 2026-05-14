import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";

/**
 * Supabase Auth only: sign-in, profile, session UI.
 * Coins/skins/trails stay in localStorage (ShopAdapter) — no `player_progress` sync.
 */

function displayNameFromUser(user) {
  const meta = user?.user_metadata ?? {};
  const v = meta.username ?? meta.display_name ?? meta.full_name ?? meta.name;
  return typeof v === "string" ? v : "";
}

/** @param {import("@supabase/supabase-js").User | null | undefined} user */
function previewFromUser(user) {
  if (!user) return null;
  const email = user.email ?? "";
  const phone = user.phone ?? "";
  const displayName = displayNameFromUser(user);
  return {
    email,
    phone,
    displayName: displayName ? displayName : null,
  };
}

export class AuthProgressSync {
  /** @param {{ refreshAuthUi?: () => void }} game */
  constructor(game) {
    this.game = game;
    /** @type {null | import("@supabase/supabase-js").Session} */
    this.session = null;
  }

  isConfigured() {
    return isSupabaseConfigured();
  }

  getSignedInPreview() {
    return previewFromUser(this.session?.user);
  }

  getLeaderboardHandle() {
    const p = this.getSignedInPreview();
    const name = p?.displayName?.trim();
    if (name) return name.slice(0, 18);
    const email = p?.email?.trim();
    if (email && email.includes("@")) {
      return email.split("@")[0].slice(0, 18);
    }
    return null;
  }

  async init() {
    if (!isSupabaseConfigured()) {
      console.info(
        "[Neon Runner] Supabase auth is off: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example), save, then restart the Vite dev server."
      );
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    const {
      data: { session },
    } = await client.auth.getSession();
    await this.#applySession(session, "INITIAL_SESSION");
    client.auth.onAuthStateChange(async (_event, sess) => {
      await this.#applySession(sess, "AUTH_STATE");
    });
  }

  /** No-op: shop progress is not synced to the cloud. */
  schedulePush() {}

  /** No-op: shop progress is not synced to the cloud. */
  async flushNowIfSignedIn() {}

  #authUiMessage(err) {
    const raw = err && typeof err === "object" && "message" in err ? String(err.message) : String(err ?? "");
    const lower = raw.toLowerCase();
    if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch")) {
      return "Could not reach Supabase (network). Check the project URL or your connection.";
    }
    return raw || "Something went wrong.";
  }

  async signInWithEmail(email, password) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Account sign-in is not configured." };
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, message: this.#authUiMessage(error) };
    await this.#applySession(data.session ?? null, "SIGNED_IN");
    return { ok: true };
  }

  async signUpWithEmail(email, password, username) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Account sign-up is not configured." };
    const trimmed = typeof username === "string" ? username.trim() : "";
    if (!trimmed) return { ok: false, message: "Enter a username." };
    const userMeta = { username: trimmed, display_name: trimmed };
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: userMeta },
    });
    if (error) return { ok: false, message: this.#authUiMessage(error) };
    if (data?.session) {
      await this.#applySession(data.session, "SIGNED_IN");
    }
    if (data?.user && !data.session) {
      return {
        ok: true,
        message: "Account created. Check your email to verify your account, then sign in.",
      };
    }
    return { ok: true };
  }

  async updateDisplayName(name) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Account sign-in is not configured." };
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { ok: false, message: "Enter a username." };
    if (trimmed.length < 3) return { ok: false, message: "Username must be at least 3 characters." };
    if (trimmed.length > 32) return { ok: false, message: "Username must be 32 characters or fewer." };
    const { error } = await client.auth.updateUser({
      data: { username: trimmed, display_name: trimmed },
    });
    if (error) return { ok: false, message: this.#authUiMessage(error) };
    const {
      data: { session },
    } = await client.auth.getSession();
    await this.#applySession(session ?? null, "USER_UPDATED");
    return { ok: true };
  }

  async updatePassword(password) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Account sign-in is not configured." };
    const p = String(password ?? "");
    if (p.length < 6) return { ok: false, message: "Password must be at least 6 characters." };
    const { error } = await client.auth.updateUser({ password: p });
    if (error) return { ok: false, message: this.#authUiMessage(error) };
    return { ok: true };
  }

  async signOut() {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    await this.#applySession(null, "SIGNED_OUT");
  }

  /**
   * @param {import("@supabase/supabase-js").Session | null} session
   * @param {string} [authEvent]
   */
  async #applySession(session, _authEvent = "INITIAL_SESSION") {
    this.session = session;
    this.game.refreshAuthUi?.();
  }
}
