// Auth module — thin wrapper over supabase.auth + a custom event bus.
// Loaded after the Supabase SDK and config.js.

(function initAuth() {
  const cfg = window.STUDY_PULSE_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.warn("[auth] Supabase SDK or config missing; auth disabled.");
    window.StudyPulseAuth = makeNoopAuth();
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    }
  });

  const listeners = new Set();
  let session = null;
  let initialized = false;

  function emit(event, payload) {
    listeners.forEach((fn) => {
      try { fn(event, payload); } catch (err) { console.error("[auth] listener error", err); }
    });
  }

  client.auth.onAuthStateChange((event, newSession) => {
    session = newSession;
    emit(event, newSession);
  });

  // Resolve the current session once at startup
  client.auth.getSession().then(({ data }) => {
    session = data.session;
    initialized = true;
    emit("INITIAL", session);
  });

  window.StudyPulseAuth = {
    client,
    onChange(fn) {
      listeners.add(fn);
      if (initialized) fn("INITIAL", session);
      return () => listeners.delete(fn);
    },
    getSession() { return session; },
    getUser() { return session?.user || null; },
    isSignedIn() { return Boolean(session?.user); },
    async sendMagicLink(email, { redirectTo, shouldCreateUser = true } = {}) {
      const target = redirectTo || `${window.location.origin}${window.location.pathname}`;
      return client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: target,
          shouldCreateUser
        }
      });
    },
    async signOut() {
      return client.auth.signOut();
    }
  };

  function makeNoopAuth() {
    return {
      client: null,
      onChange() { return () => {}; },
      getSession() { return null; },
      getUser() { return null; },
      isSignedIn() { return false; },
      async sendMagicLink() { return { error: new Error("Supabase not configured") }; },
      async signOut() { return { error: null }; }
    };
  }
})();
