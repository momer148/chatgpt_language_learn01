// Sync layer — bridges local state with Supabase.
// Load order: supabase SDK → config.js → auth.js → db.js → app.js
//
// Strategy:
// - localStorage stays as the offline cache; UI reads from `state` synchronously.
// - When signed in, every mutation triggers a push; the server's updated_at
//   becomes the source of truth for last-write-wins.
// - On sign-in, push any local-only rows (created offline), then pull everything
//   newer than the last cached serverUpdatedAt.
// - Realtime channel keeps multiple devices live without manual refresh.

(function initDb() {
  const auth = window.StudyPulseAuth;
  if (!auth || !auth.client) {
    console.warn("[db] auth missing; running in local-only mode.");
    return;
  }

  const client = auth.client;
  let listeners = new Set();
  let realtimeChannel = null;

  // ----- field mapping ------------------------------------------------
  function vocabLocalToDb(word) {
    return {
      id: word.id,
      folder: word.folder || "General",
      word: word.word,
      meaning: word.meaning || null,
      sentence: word.sentence || null,
      topic: word.topic || null,
      due: word.due || null,
      interval: Number.isFinite(word.interval) ? word.interval : 0,
      ease: Number.isFinite(word.ease) ? word.ease : 2.5,
      repetitions: Number.isFinite(word.repetitions) ? word.repetitions : 0,
      lapses: Number.isFinite(word.lapses) ? word.lapses : 0,
      last_reviewed: word.lastReviewed || null,
      last_grade: word.lastGrade || null,
      deleted_at: null
    };
  }

  function vocabDbToLocal(row) {
    return {
      id: row.id,
      folder: row.folder || "General",
      word: row.word,
      meaning: row.meaning || "",
      sentence: row.sentence || "",
      topic: row.topic || "",
      due: row.due,
      interval: row.interval ?? 0,
      ease: Number(row.ease ?? 2.5),
      repetitions: row.repetitions ?? 0,
      lapses: row.lapses ?? 0,
      lastReviewed: row.last_reviewed || null,
      lastGrade: row.last_grade || null,
      serverUpdatedAt: row.updated_at || null
    };
  }

  // ----- vocab push ---------------------------------------------------
  async function pushVocab(words) {
    if (!auth.isSignedIn() || !words?.length) return;
    const userId = auth.getUser().id;
    const rows = words.map((w) => ({ ...vocabLocalToDb(w), user_id: userId }));
    const { data, error } = await client
      .from("vocab_words")
      .upsert(rows, { onConflict: "id" })
      .select("id, updated_at");
    if (error) {
      console.error("[db] pushVocab error", error);
      return;
    }
    // Stamp returned updated_at back onto local rows so future pulls don't fight us.
    const stamp = new Map(data.map((r) => [r.id, r.updated_at]));
    notifyVocabStamped(stamp);
  }

  async function softDeleteVocab(ids) {
    if (!auth.isSignedIn() || !ids?.length) return;
    const { error } = await client
      .from("vocab_words")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) console.error("[db] softDeleteVocab error", error);
  }

  // ----- vocab pull ---------------------------------------------------
  async function pullVocab() {
    if (!auth.isSignedIn()) return [];
    const { data, error } = await client
      .from("vocab_words")
      .select("*")
      .is("deleted_at", null);
    if (error) {
      console.error("[db] pullVocab error", error);
      return [];
    }
    return data.map(vocabDbToLocal);
  }

  // ----- vocab folders -----------------------------------------------
  async function pushVocabFolders(folders) {
    if (!auth.isSignedIn() || !folders?.length) return;
    const userId = auth.getUser().id;
    const rows = folders.map((f) => ({
      id: f.id,
      user_id: userId,
      name: f.name,
      deleted_at: null
    }));
    const { error } = await client
      .from("vocab_folders")
      .upsert(rows, { onConflict: "user_id,name" });
    if (error) console.error("[db] pushVocabFolders error", error);
  }

  async function pullVocabFolders() {
    if (!auth.isSignedIn()) return [];
    const { data, error } = await client
      .from("vocab_folders")
      .select("*")
      .is("deleted_at", null);
    if (error) {
      console.error("[db] pullVocabFolders error", error);
      return [];
    }
    return data.map((row) => ({ id: row.id, name: row.name }));
  }

  // ----- profile ------------------------------------------------------
  async function upsertProfile(patch) {
    if (!auth.isSignedIn()) return;
    const userId = auth.getUser().id;
    const { error } = await client
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (error) console.error("[db] upsertProfile error", error);
  }

  async function fetchProfile() {
    if (!auth.isSignedIn()) return null;
    const userId = auth.getUser().id;
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[db] fetchProfile error", error);
      return null;
    }
    return data;
  }

  // ----- tasks --------------------------------------------------------
  function taskLocalToDb(t) {
    return {
      id: t.id,
      title: t.title || "",
      type: t.type || null,
      time: t.time || null,
      duration: Number.isFinite(t.duration) ? t.duration : null,
      notes: t.notes || null,
      link_tab: t.linkTab || null,
      pinned: Boolean(t.pinned),
      sort_order: Number.isFinite(t.sortOrder) ? t.sortOrder : 0,
      deleted_at: null
    };
  }
  function taskDbToLocal(row) {
    const out = {
      id: row.id,
      title: row.title,
      type: row.type || "",
      time: row.time || "",
      duration: row.duration ?? 60,
      notes: row.notes || "",
      pinned: Boolean(row.pinned),
      serverUpdatedAt: row.updated_at || null
    };
    if (row.link_tab) out.linkTab = row.link_tab;
    return out;
  }
  async function pushTasks(tasks) {
    if (!auth.isSignedIn() || !tasks?.length) return;
    const userId = auth.getUser().id;
    const rows = tasks.map((t) => ({ ...taskLocalToDb(t), user_id: userId }));
    const { error } = await client.from("tasks").upsert(rows, { onConflict: "id" });
    if (error) console.error("[db] pushTasks error", error);
  }
  async function softDeleteTasks(ids) {
    if (!auth.isSignedIn() || !ids?.length) return;
    const { error } = await client
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) console.error("[db] softDeleteTasks error", error);
  }
  async function pullTasks() {
    if (!auth.isSignedIn()) return [];
    const { data, error } = await client
      .from("tasks").select("*").is("deleted_at", null);
    if (error) { console.error("[db] pullTasks error", error); return []; }
    return data.map(taskDbToLocal);
  }

  // ----- task_completions --------------------------------------------
  async function pushCompletion(taskId, day, done) {
    if (!auth.isSignedIn()) return;
    const userId = auth.getUser().id;
    const { error } = await client
      .from("task_completions")
      .upsert({ user_id: userId, task_id: taskId, day, done }, { onConflict: "user_id,task_id,day" });
    if (error) console.error("[db] pushCompletion error", error);
  }
  async function pullCompletions() {
    if (!auth.isSignedIn()) return {};
    const { data, error } = await client
      .from("task_completions").select("task_id, day, done").eq("done", true);
    if (error) { console.error("[db] pullCompletions error", error); return {}; }
    const out = {};
    data.forEach((row) => {
      out[row.day] = out[row.day] || {};
      out[row.day][row.task_id] = true;
    });
    return out;
  }

  // ----- grammar_drills ----------------------------------------------
  function grammarLocalToDb(g) {
    return {
      id: g.id,
      book: g.book || null,
      unit: g.unit || null,
      exercises: g.exercises || null,
      due: g.due || null,
      notes: g.notes || null,
      done: Boolean(g.done),
      deleted_at: null
    };
  }
  function grammarDbToLocal(row) {
    return {
      id: row.id,
      book: row.book || "",
      unit: row.unit || "",
      exercises: row.exercises || "",
      due: row.due,
      notes: row.notes || "",
      done: Boolean(row.done),
      serverUpdatedAt: row.updated_at || null
    };
  }
  async function pushGrammar(items) {
    if (!auth.isSignedIn() || !items?.length) return;
    const userId = auth.getUser().id;
    const rows = items.map((g) => ({ ...grammarLocalToDb(g), user_id: userId }));
    const { error } = await client.from("grammar_drills").upsert(rows, { onConflict: "id" });
    if (error) console.error("[db] pushGrammar error", error);
  }
  async function softDeleteGrammar(ids) {
    if (!auth.isSignedIn() || !ids?.length) return;
    const { error } = await client
      .from("grammar_drills")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) console.error("[db] softDeleteGrammar error", error);
  }
  async function pullGrammar() {
    if (!auth.isSignedIn()) return [];
    const { data, error } = await client
      .from("grammar_drills").select("*").is("deleted_at", null);
    if (error) { console.error("[db] pullGrammar error", error); return []; }
    return data.map(grammarDbToLocal);
  }

  // ----- media_logs --------------------------------------------------
  function mediaLocalToDb(m) {
    return {
      id: m.id,
      type: m.type || null,
      title: m.title || null,
      source: m.source || null,
      minutes: Number.isFinite(m.minutes) ? m.minutes : null,
      notes: m.notes || null,
      logged_at: m.date || m.loggedAt || null,
      deleted_at: null
    };
  }
  function mediaDbToLocal(row) {
    return {
      id: row.id,
      type: row.type || "",
      title: row.title || "",
      source: row.source || "",
      minutes: row.minutes ?? 0,
      notes: row.notes || "",
      date: row.logged_at,
      serverUpdatedAt: row.updated_at || null
    };
  }
  async function pushMedia(items) {
    if (!auth.isSignedIn() || !items?.length) return;
    const userId = auth.getUser().id;
    const rows = items.map((m) => ({ ...mediaLocalToDb(m), user_id: userId }));
    const { error } = await client.from("media_logs").upsert(rows, { onConflict: "id" });
    if (error) console.error("[db] pushMedia error", error);
  }
  async function softDeleteMedia(ids) {
    if (!auth.isSignedIn() || !ids?.length) return;
    const { error } = await client
      .from("media_logs")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) console.error("[db] softDeleteMedia error", error);
  }
  async function pullMedia() {
    if (!auth.isSignedIn()) return [];
    const { data, error } = await client
      .from("media_logs").select("*").is("deleted_at", null);
    if (error) { console.error("[db] pullMedia error", error); return []; }
    return data.map(mediaDbToLocal);
  }

  // ----- review_sessions --------------------------------------------
  async function pushReviewSession(session) {
    if (!auth.isSignedIn() || !session?.folder) return;
    const userId = auth.getUser().id;
    const { error } = await client
      .from("review_sessions")
      .upsert({
        user_id: userId,
        folder: session.folder,
        seen: session.seen ?? 0,
        grades: session.grades || {},
        word_grades: session.wordGrades || {},
        filter: session.filter || null
      }, { onConflict: "user_id,folder" });
    if (error) console.error("[db] pushReviewSession error", error);
  }
  async function deleteReviewSession(folder) {
    if (!auth.isSignedIn() || !folder) return;
    const userId = auth.getUser().id;
    const { error } = await client
      .from("review_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("folder", folder);
    if (error) console.error("[db] deleteReviewSession error", error);
  }
  async function pullReviewSessions() {
    if (!auth.isSignedIn()) return {};
    const { data, error } = await client.from("review_sessions").select("*");
    if (error) { console.error("[db] pullReviewSessions error", error); return {}; }
    const out = {};
    data.forEach((row) => {
      out[row.folder] = {
        folder: row.folder,
        seen: row.seen ?? 0,
        grades: row.grades || { again: 0, hard: 0, good: 0, easy: 0 },
        wordGrades: row.word_grades || {},
        filter: row.filter || null
      };
    });
    return out;
  }

  // ----- realtime -----------------------------------------------------
  function subscribeRealtime(handlers) {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    if (!auth.isSignedIn()) return;
    const userId = auth.getUser().id;
    const filter = `user_id=eq.${userId}`;
    const ch = client.channel("study-pulse-sync");

    function attach(table, onUpsert, onDelete) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;
          if (payload.eventType === "DELETE" || payload.new?.deleted_at) {
            onDelete?.(row);
          } else {
            onUpsert?.(payload.new);
          }
        }
      );
    }

    if (handlers.vocab) {
      attach("vocab_words",
        (row) => handlers.vocab({ kind: "upsert", word: vocabDbToLocal(row) }),
        (row) => handlers.vocab({ kind: "delete", id: row.id })
      );
    }
    if (handlers.task) {
      attach("tasks",
        (row) => handlers.task({ kind: "upsert", task: taskDbToLocal(row) }),
        (row) => handlers.task({ kind: "delete", id: row.id })
      );
    }
    if (handlers.completion) {
      attach("task_completions",
        (row) => handlers.completion({ kind: "upsert", taskId: row.task_id, day: row.day, done: row.done }),
        (row) => handlers.completion({ kind: "delete", taskId: row.task_id, day: row.day })
      );
    }
    if (handlers.grammar) {
      attach("grammar_drills",
        (row) => handlers.grammar({ kind: "upsert", drill: grammarDbToLocal(row) }),
        (row) => handlers.grammar({ kind: "delete", id: row.id })
      );
    }
    if (handlers.media) {
      attach("media_logs",
        (row) => handlers.media({ kind: "upsert", log: mediaDbToLocal(row) }),
        (row) => handlers.media({ kind: "delete", id: row.id })
      );
    }
    if (handlers.session) {
      attach("review_sessions",
        (row) => handlers.session({ kind: "upsert", folder: row.folder, session: {
          folder: row.folder,
          seen: row.seen ?? 0,
          grades: row.grades || {},
          wordGrades: row.word_grades || {},
          filter: row.filter || null
        } }),
        (row) => handlers.session({ kind: "delete", folder: row.folder })
      );
    }

    realtimeChannel = ch.subscribe();
  }

  function teardownRealtime() {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // ----- callbacks for stamped updated_at ----------------------------
  function onVocabStamped(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function notifyVocabStamped(stampMap) {
    listeners.forEach((fn) => { try { fn(stampMap); } catch {} });
  }

  // ----- public surface -----------------------------------------------
  window.StudyPulseDb = {
    isActive() { return auth.isSignedIn(); },
    pushVocab,
    softDeleteVocab,
    pullVocab,
    pushVocabFolders,
    pullVocabFolders,
    pushTasks,
    softDeleteTasks,
    pullTasks,
    pushCompletion,
    pullCompletions,
    pushGrammar,
    softDeleteGrammar,
    pullGrammar,
    pushMedia,
    softDeleteMedia,
    pullMedia,
    pushReviewSession,
    deleteReviewSession,
    pullReviewSessions,
    fetchProfile,
    upsertProfile,
    subscribeRealtime,
    teardownRealtime,
    onVocabStamped
  };
})();
