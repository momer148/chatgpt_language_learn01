const STORAGE_KEY = "study-pulse-state-v1";
const PALETTE_KEY = "study-pulse-palette";
const WELCOME_KEY = "study-pulse-welcomed";
const PALETTES = ["peach", "sage", "lilac", "sky"];

function loadPalette() {
  const stored = localStorage.getItem(PALETTE_KEY);
  return PALETTES.includes(stored) ? stored : "peach";
}

function applyPalette(name) {
  const palette = PALETTES.includes(name) ? name : "peach";
  document.documentElement.setAttribute("data-palette", palette);
  localStorage.setItem(PALETTE_KEY, palette);
}

applyPalette(loadPalette());
const MS_PER_DAY = 86400000;

const defaultState = {
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Flashcards",
      type: "Vocabulary",
      time: "09:00",
      duration: 60,
      notes: "Run your spaced-repetition flashcards for today.",
      linkTab: "vocab",
      pinned: true
    },
    {
      id: crypto.randomUUID(),
      title: "Grammar drilling",
      type: "Grammar",
      time: "10:30",
      duration: 60,
      notes: "Work through your current Grammatik Aktiv unit."
    },
    {
      id: crypto.randomUUID(),
      title: "Reading block",
      type: "Reading",
      time: "15:00",
      duration: 60,
      notes: "Read one article or chapter and collect useful phrases."
    },
    {
      id: crypto.randomUUID(),
      title: "Listening block",
      type: "Listening",
      time: "18:30",
      duration: 60,
      notes: "Listen once for gist, then once for detail."
    }
  ],
  vocab: sampleVocabWords(),
  vocabFolders: [
    {
      id: crypto.randomUUID(),
      name: "Core"
    },
    {
      id: crypto.randomUUID(),
      name: "Exam B1"
    },
    {
      id: crypto.randomUUID(),
      name: "Daily Verbs"
    }
  ],
  sampleVocabSeeded: true,
  sampleVocabVersion: 2,
  grammar: [
    {
      id: crypto.randomUUID(),
      book: "Grammatik Aktiv",
      unit: "Current unit",
      exercises: "1-4",
      due: todayKey(),
      notes: "Mark difficult questions and repeat them tomorrow.",
      done: false
    }
  ],
  mediaLogs: [],
  completions: {},
  notifications: {}
};

function sampleVocabWords() {
  return [
    sampleVocabWord("die Entscheidung", "decision", "Ich habe eine wichtige Entscheidung getroffen.", "Core", "Nouns"),
    sampleVocabWord("die Voraussetzung", "requirement / prerequisite", "Gute Vorbereitung ist eine wichtige Voraussetzung.", "Exam B1", "Nouns"),
    sampleVocabWord("die Herausforderung", "challenge", "Diese Aufgabe ist eine echte Herausforderung.", "Exam B1", "Nouns"),
    sampleVocabWord("die Gelegenheit", "opportunity", "Ich nutze jede Gelegenheit zum Sprechen.", "Core", "Nouns"),
    sampleVocabWord("der Unterschied", "difference", "Der Unterschied ist nicht sehr gross.", "Core", "Nouns"),
    sampleVocabWord("sich bewerben", "to apply", "Sie bewirbt sich um eine neue Stelle.", "Daily Verbs", "Work"),
    sampleVocabWord("vereinbaren", "to arrange / agree", "Wir vereinbaren einen Termin fuer morgen.", "Daily Verbs", "Appointments"),
    sampleVocabWord("verschieben", "to postpone / move", "Kannst du den Termin auf Freitag verschieben?", "Daily Verbs", "Appointments"),
    sampleVocabWord("teilnehmen", "to participate", "Ich nehme jede Woche am Kurs teil.", "Daily Verbs", "Separable verbs"),
    sampleVocabWord("vermeiden", "to avoid", "Ich versuche, diesen Fehler zu vermeiden.", "Daily Verbs", "Exam verbs"),
    sampleVocabWord("zuverlaessig", "reliable", "Mein Kollege ist sehr zuverlaessig.", "Exam B1", "Adjectives"),
    sampleVocabWord("ausfuehrlich", "detailed", "Bitte erklaeren Sie das ausfuehrlich.", "Exam B1", "Adjectives"),
    sampleVocabWord("trotzdem", "nevertheless", "Es regnet, trotzdem gehen wir spazieren.", "Core", "Connectors"),
    sampleVocabWord("deshalb", "therefore", "Ich habe morgen eine Pruefung, deshalb lerne ich heute.", "Core", "Connectors"),
    sampleVocabWord("waehrend", "during / while", "Waehrend der Fahrt hoere ich einen Podcast.", "Core", "Connectors")
  ];
}

function sampleVocabWord(word, meaning, sentence, folder, topic) {
  return {
    id: crypto.randomUUID(),
    word,
    meaning,
    sentence,
    folder,
    topic,
    due: todayKey(),
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    lastReviewed: null,
    sample: true
  };
}

let state = loadState();
let activeReviewId = null;
let reviewRevealed = false;
let reviewQueueIds = [];
const reviewSessions = {};
function getReviewSession(folder) {
  if (!reviewSessions[folder]) {
    reviewSessions[folder] = {
      folder,
      seen: 0,
      grades: { again: 0, hard: 0, good: 0, easy: 0 },
      wordGrades: {},
      filter: null
    };
  }
  return reviewSessions[folder];
}

function buildReviewQueue(folder, filter) {
  if (!filter) {
    return dueVocab(folder).map((word) => word.id);
  }
  return state.vocab
    .filter((word) => folder === "all" || (word.folder || "General") === folder)
    .filter((word) => word.lastGrade === filter)
    .map((word) => word.id);
}

function toggleReviewFilter(grade) {
  if (!reviewSession) return;
  reviewSession.filter = reviewSession.filter === grade ? null : grade;
  syncReviewSession(reviewSession);
  reviewQueueIds = buildReviewQueue(reviewSession.folder, reviewSession.filter);
  activeReviewId = reviewQueueIds[0] || null;
  reviewRevealed = false;
  renderFlashcard();
}
let reviewSession = getReviewSession("all");
let timer = {
  id: null,
  taskId: null,
  remaining: 0
};

const els = {
  tabs: document.querySelectorAll(".nav-tab"),
  panels: document.querySelectorAll(".panel"),
  todayDate: document.querySelector("#today-date"),
  statMinutes: document.querySelector("#stat-minutes"),
  statDone: document.querySelector("#stat-done"),
  statVocab: document.querySelector("#stat-vocab"),
  todayTasks: document.querySelector("#today-tasks"),
  plannerList: document.querySelector("#planner-list"),
  nextTask: document.querySelector("#next-task"),
  progressBars: document.querySelector("#progress-bars"),
  miniReview: document.querySelector("#mini-review"),
  reviewBox: document.querySelector("#review-box"),
  flashcardBox: document.querySelector("#flashcard-box"),
  flashcardProgress: document.querySelector("#flashcard-progress"),
  flashcardFolderLabel: document.querySelector("#flashcard-folder-label"),
  flashcardFolderSelect: document.querySelector("#flashcard-folder-select"),
  vocabList: document.querySelector("#vocab-list"),
  grammarList: document.querySelector("#grammar-list"),
  mediaList: document.querySelector("#media-list"),
  notificationStatus: document.querySelector("#notification-status"),
  timerLabel: document.querySelector("#timer-label"),
  timerDisplay: document.querySelector("#timer-display"),
  vocabSearch: document.querySelector("#vocab-search"),
  vocabFolderFilter: document.querySelector("#vocab-folder-filter"),
  vocabFolderOptions: document.querySelector("#vocab-folder-options"),
  vocabImport: document.querySelector("#vocab-import"),
  vocabAddToggle: document.querySelector("#vocab-add-toggle"),
  vocabAddHint: document.querySelector("#vocab-add-toggle .vocab-add-hint"),
  vocabForm: document.querySelector("#vocab-form"),
  resetFolderProgress: document.querySelector("#reset-folder-progress"),
  bulkToggle: document.querySelector("#bulk-load-toggle"),
  bulkPanel: document.querySelector("#bulk-load"),
  bulkTbody: document.querySelector("#bulk-tbody"),
  bulkSave: document.querySelector("#bulk-save"),
  bulkCancel: document.querySelector("#bulk-cancel"),
  welcome: document.querySelector("#welcome"),
  welcomeForm: document.querySelector("#welcome-form"),
  welcomeName: document.querySelector("#welcome-name"),
  welcomeNameField: document.querySelector("#welcome-name-field"),
  welcomeEmail: document.querySelector("#welcome-email"),
  welcomeStatus: document.querySelector("#welcome-status"),
  welcomeSubmitLabel: document.querySelector("#welcome-submit-label"),
  welcomeSkip: document.querySelector("#welcome-skip"),
  welcomeTitle: document.querySelector("#welcome-title"),
  welcomeSub: document.querySelector("#welcome-sub"),
  welcomeWord: document.querySelector("#welcome-word"),
  welcomeTime: document.querySelector("#welcome-time"),
  welcomeSegTrack: document.querySelector(".welcome-seg-track"),
  welcomeSegBtns: document.querySelectorAll(".welcome-seg-btn")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  setDefaultDates();
  bindNavigation();
  bindForms();
  bindActions();
  bindPalettePicker();
  bindWelcome();
  bindSync();
  registerServiceWorker();
  updateNotificationStatus();
  render();
  setInterval(checkDueNotifications, 30000);
}

const BULK_COLUMNS = ["word", "meaning", "sentence", "folder", "topic", "due"];
const BULK_ROW_COUNT = 15;

function buildBulkRows() {
  if (!els.bulkTbody) return;
  els.bulkTbody.innerHTML = Array.from({ length: BULK_ROW_COUNT }).map(() => {
    const cells = BULK_COLUMNS.map((col) => `<td><input type="text" data-bulk-col="${col}" spellcheck="false"></td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
}

function bindBulkLoad() {
  if (!els.bulkToggle || !els.bulkPanel || !els.bulkTbody) return;
  els.bulkToggle.addEventListener("click", () => {
    const open = els.bulkToggle.getAttribute("aria-expanded") === "true";
    if (open) {
      els.bulkPanel.hidden = true;
      els.bulkToggle.setAttribute("aria-expanded", "false");
    } else {
      buildBulkRows();
      els.bulkPanel.hidden = false;
      els.bulkToggle.setAttribute("aria-expanded", "true");
      const first = els.bulkTbody.querySelector("input");
      if (first) first.focus();
    }
  });
  if (els.bulkCancel) {
    els.bulkCancel.addEventListener("click", () => {
      els.bulkPanel.hidden = true;
      els.bulkToggle.setAttribute("aria-expanded", "false");
    });
  }
  if (els.bulkSave) {
    els.bulkSave.addEventListener("click", saveBulkRows);
  }
  els.bulkTbody.addEventListener("paste", handleBulkPaste);
}

function handleBulkPaste(event) {
  const text = event.clipboardData?.getData("text");
  if (!text) return;
  if (!text.includes("\t") && !text.includes("\n")) return;
  const target = event.target;
  if (!target || target.tagName !== "INPUT") return;
  event.preventDefault();
  const rows = Array.from(els.bulkTbody.children);
  const startRow = rows.indexOf(target.closest("tr"));
  const startCol = Array.from(target.closest("tr").children).indexOf(target.closest("td"));
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  lines.forEach((line, rOff) => {
    const tr = els.bulkTbody.children[startRow + rOff];
    if (!tr) return;
    const cells = line.split("\t");
    cells.forEach((value, cOff) => {
      const td = tr.children[startCol + cOff];
      if (!td) return;
      const input = td.querySelector("input");
      if (input) input.value = value;
    });
  });
}

function saveBulkRows() {
  const rows = Array.from(els.bulkTbody.children);
  const newWords = [];
  rows.forEach((tr) => {
    const inputs = tr.querySelectorAll("input");
    const data = {};
    inputs.forEach((input) => {
      data[input.dataset.bulkCol] = input.value;
    });
    if (!String(data.word || "").trim()) return;
    const entry = createVocabEntry(data);
    state.vocab.push(entry);
    newWords.push(entry);
  });
  if (newWords.length === 0) {
    window.alert("Nothing to save — at least one row needs a word.");
    return;
  }
  els.bulkPanel.hidden = true;
  els.bulkToggle.setAttribute("aria-expanded", "false");
  syncVocabUpsert(newWords);
  saveAndRender();
}

function bindPalettePicker() {
  const grid = document.querySelector("#palette-grid");
  if (!grid) return;
  const setActive = (active) => {
    grid.querySelectorAll(".palette-card").forEach((card) => {
      card.setAttribute("data-active", String(card.dataset.palette === active));
    });
  };
  setActive(loadPalette());
  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".palette-card");
    if (!card) return;
    const choice = card.dataset.palette;
    applyPalette(choice);
    setActive(choice);
    window.StudyPulseDb?.upsertProfile?.({ palette: choice });
  });
}

const PENDING_NAME_KEY = "study-pulse-pending-name";

function bindWelcome() {
  if (!els.welcome) return;
  setWelcomeMode("returning");
  // Surface any auth redirect errors from the URL hash (expired/invalid links).
  if (window.location.hash && window.location.hash.includes("error")) {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errCode = params.get("error_code");
    const errDesc = params.get("error_description");
    if (errCode || errDesc) {
      showWelcome();
      const friendly = errCode === "otp_expired"
        ? "That magic link expired or was replaced by a newer one. Request a fresh one below."
        : (errDesc ? decodeURIComponent(errDesc.replace(/\+/g, " ")) : "Sign-in failed.");
      setWelcomeStatus(friendly, "error");
      // Clear the hash so reloading doesn't re-show it.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }
  els.welcomeSegBtns.forEach((btn) => {
    btn.addEventListener("click", () => setWelcomeMode(btn.dataset.mode));
  });
  els.welcomeForm.addEventListener("submit", handleWelcomeSubmit);
  if (els.welcomeSkip) {
    els.welcomeSkip.addEventListener("click", () => {
      localStorage.setItem(WELCOME_KEY, "true");
      hideWelcome();
    });
  }

  const auth = window.StudyPulseAuth;
  if (auth) {
    auth.onChange((event, session) => {
      const welcomed = localStorage.getItem(WELCOME_KEY) === "true";
      if (session?.user) {
        localStorage.setItem(WELCOME_KEY, "true");
        hideWelcome();
        claimPendingName(session.user);
      } else if (event === "INITIAL" && !welcomed) {
        showWelcome();
      } else if (event === "SIGNED_OUT") {
        // Stay on the app; user can re-sign-in via Settings later.
      }
    });
  } else {
    const welcomed = localStorage.getItem(WELCOME_KEY) === "true";
    if (!welcomed) showWelcome();
  }
}

function showWelcome() {
  els.welcome.hidden = false;
  document.body.style.overflow = "hidden";
  startWelcomeWord();
  startWelcomeClock();
}

function hideWelcome() {
  els.welcome.hidden = true;
  document.body.style.overflow = "";
}

function setWelcomeMode(mode) {
  els.welcome.dataset.mode = mode;
  els.welcomeSegBtns.forEach((b) => b.setAttribute("data-active", String(b.dataset.mode === mode)));
  if (els.welcomeSegTrack) els.welcomeSegTrack.dataset.pos = mode === "new" ? "1" : "0";
  if (mode === "new") {
    els.welcomeTitle.innerHTML = "Open a <em>file.</em>";
    els.welcomeSub.textContent = "Tell us your name and we'll email a magic link.";
    if (els.welcomeNameField) els.welcomeNameField.hidden = false;
  } else {
    els.welcomeTitle.innerHTML = "Welcome <em>back.</em>";
    els.welcomeSub.textContent = "Sign in to sync across your devices.";
    if (els.welcomeNameField) els.welcomeNameField.hidden = true;
  }
  setWelcomeStatus("", null);
}

function setWelcomeStatus(text, state) {
  if (!els.welcomeStatus) return;
  els.welcomeStatus.textContent = text || "";
  if (state) {
    els.welcomeStatus.setAttribute("data-state", state);
  } else {
    els.welcomeStatus.removeAttribute("data-state");
  }
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const auth = window.StudyPulseAuth;
  if (!auth || !auth.client) {
    setWelcomeStatus("Auth isn't configured. You can keep using the app locally.", "error");
    return;
  }
  const email = (els.welcomeEmail.value || "").trim().toLowerCase();
  const name = (els.welcomeName.value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setWelcomeStatus("That doesn't look like an email.", "error");
    return;
  }
  const submitBtn = els.welcomeForm.querySelector(".welcome-submit");
  submitBtn.setAttribute("data-busy", "true");
  submitBtn.disabled = true;
  setWelcomeStatus("Sending magic link…", null);
  if (name) localStorage.setItem(PENDING_NAME_KEY, name);
  const { error } = await auth.sendMagicLink(email);
  submitBtn.removeAttribute("data-busy");
  submitBtn.disabled = false;
  if (error) {
    setWelcomeStatus(error.message || "Couldn't send the link. Try again.", "error");
    return;
  }
  setWelcomeStatus(`Check ${email} — click the link to sign in.`, "success");
  if (els.welcomeSubmitLabel) els.welcomeSubmitLabel.textContent = "Resend magic link";
}

// =====================================================================
// SYNC — bridges local state with Supabase via window.StudyPulseDb
// =====================================================================
let syncInitialized = false;

function bindSync() {
  const db = window.StudyPulseDb;
  const auth = window.StudyPulseAuth;
  if (!db || !auth) return;
  bindAccountSurface();
  auth.onChange(async (event, session) => {
    renderAccountSurface(session);
    if (session?.user && !syncInitialized) {
      syncInitialized = true;
      await initialSync();
      db.subscribeRealtime({
        vocab: handleRemoteVocabChange,
        task: handleRemoteTaskChange,
        completion: handleRemoteCompletionChange,
        grammar: handleRemoteGrammarChange,
        media: handleRemoteMediaChange,
        session: handleRemoteSessionChange
      });
    } else if (event === "SIGNED_OUT") {
      syncInitialized = false;
      db.teardownRealtime();
    }
  });
  if (db.onVocabStamped) {
    db.onVocabStamped((stampMap) => {
      let touched = false;
      state.vocab.forEach((w) => {
        if (stampMap.has(w.id)) {
          w.serverUpdatedAt = stampMap.get(w.id);
          touched = true;
        }
      });
      if (touched) saveState();
    });
  }
}

function mergeById(local, remote) {
  const map = new Map(local.map((x) => [x.id, x]));
  remote.forEach((rw) => {
    const existing = map.get(rw.id);
    const localStamp = existing?.serverUpdatedAt || "";
    const remoteStamp = rw.serverUpdatedAt || "";
    if (!existing || remoteStamp >= localStamp) {
      map.set(rw.id, rw);
    }
  });
  return Array.from(map.values());
}

async function initialSync() {
  const db = window.StudyPulseDb;
  if (!db?.isActive?.()) return;
  // Push everything local-only to server (idempotent upserts).
  if (state.vocab.length) await db.pushVocab(state.vocab);
  if (state.tasks.length) await db.pushTasks(state.tasks);
  if (state.grammar.length) await db.pushGrammar(state.grammar);
  if (state.mediaLogs.length) await db.pushMedia(state.mediaLogs);
  // Push existing completions
  Object.entries(state.completions || {}).forEach(([day, byTask]) => {
    Object.entries(byTask || {}).forEach(([taskId, done]) => {
      if (done) db.pushCompletion(taskId, day, true);
    });
  });
  Object.values(reviewSessions).forEach((s) => db.pushReviewSession(s));

  // Pull server state and merge.
  const [remoteWords, remoteTasks, remoteGrammar, remoteMedia, remoteCompletions, remoteSessions] = await Promise.all([
    db.pullVocab(),
    db.pullTasks(),
    db.pullGrammar(),
    db.pullMedia(),
    db.pullCompletions(),
    db.pullReviewSessions()
  ]);
  state.vocab = mergeById(state.vocab, remoteWords);
  state.tasks = mergeById(state.tasks, remoteTasks);
  state.grammar = mergeById(state.grammar, remoteGrammar);
  state.mediaLogs = mergeById(state.mediaLogs, remoteMedia);

  // Completions: union local + remote (both indicate "done").
  Object.entries(remoteCompletions).forEach(([day, byTask]) => {
    state.completions[day] = state.completions[day] || {};
    Object.entries(byTask).forEach(([taskId, done]) => {
      if (done) state.completions[day][taskId] = true;
    });
  });

  // Review sessions per folder
  Object.entries(remoteSessions).forEach(([folder, sess]) => {
    reviewSessions[folder] = sess;
  });

  // Fetch profile and apply.
  const profile = await db.fetchProfile();
  if (profile) {
    state.profile = state.profile || {};
    if (profile.display_name) state.profile.displayName = profile.display_name;
    if (profile.palette && PALETTES.includes(profile.palette)) {
      applyPalette(profile.palette);
      const grid = document.querySelector("#palette-grid");
      if (grid) {
        grid.querySelectorAll(".palette-card").forEach((c) => {
          c.setAttribute("data-active", String(c.dataset.palette === profile.palette));
        });
      }
    }
  }
  saveAndRender();
}

function handleRemoteVocabChange(change) {
  if (change.kind === "delete") {
    state.vocab = state.vocab.filter((w) => w.id !== change.id);
  } else if (change.kind === "upsert") {
    const rw = change.word;
    const idx = state.vocab.findIndex((w) => w.id === rw.id);
    if (idx >= 0) {
      const local = state.vocab[idx];
      if ((rw.serverUpdatedAt || "") < (local.serverUpdatedAt || "")) return;
      state.vocab[idx] = rw;
    } else {
      state.vocab.push(rw);
    }
  }
  saveAndRender();
}

function handleRemoteTaskChange(change) {
  if (change.kind === "delete") {
    state.tasks = state.tasks.filter((t) => t.id !== change.id);
  } else if (change.kind === "upsert") {
    const rt = change.task;
    const idx = state.tasks.findIndex((t) => t.id === rt.id);
    if (idx >= 0) {
      const local = state.tasks[idx];
      if ((rt.serverUpdatedAt || "") < (local.serverUpdatedAt || "")) return;
      // Preserve local pinned flag if server didn't set it (e.g. older device)
      state.tasks[idx] = { ...local, ...rt };
    } else {
      state.tasks.push(rt);
    }
  }
  saveAndRender();
}

function handleRemoteCompletionChange(change) {
  const { taskId, day } = change;
  if (change.kind === "delete" || !change.done) {
    if (state.completions[day]) {
      delete state.completions[day][taskId];
      if (!Object.keys(state.completions[day]).length) delete state.completions[day];
    }
  } else {
    state.completions[day] = state.completions[day] || {};
    state.completions[day][taskId] = true;
  }
  saveAndRender();
}

function handleRemoteGrammarChange(change) {
  if (change.kind === "delete") {
    state.grammar = state.grammar.filter((d) => d.id !== change.id);
  } else if (change.kind === "upsert") {
    const rd = change.drill;
    const idx = state.grammar.findIndex((d) => d.id === rd.id);
    if (idx >= 0) {
      const local = state.grammar[idx];
      if ((rd.serverUpdatedAt || "") < (local.serverUpdatedAt || "")) return;
      state.grammar[idx] = rd;
    } else {
      state.grammar.push(rd);
    }
  }
  saveAndRender();
}

function handleRemoteMediaChange(change) {
  if (change.kind === "delete") {
    state.mediaLogs = state.mediaLogs.filter((m) => m.id !== change.id);
  } else if (change.kind === "upsert") {
    const rm = change.log;
    const idx = state.mediaLogs.findIndex((m) => m.id === rm.id);
    if (idx >= 0) {
      const local = state.mediaLogs[idx];
      if ((rm.serverUpdatedAt || "") < (local.serverUpdatedAt || "")) return;
      state.mediaLogs[idx] = rm;
    } else {
      state.mediaLogs.unshift(rm);
    }
  }
  saveAndRender();
}

function handleRemoteSessionChange(change) {
  if (change.kind === "delete") {
    delete reviewSessions[change.folder];
    if (reviewSession?.folder === change.folder) reviewSession = getReviewSession(change.folder);
  } else if (change.kind === "upsert") {
    reviewSessions[change.folder] = change.session;
    if (reviewSession?.folder === change.folder) reviewSession = reviewSessions[change.folder];
  }
  renderFlashcard();
}

function bindAccountSurface() {
  const signOutBtn = document.querySelector("#account-action");
  const showWelcomeBtn = document.querySelector("#account-show-welcome");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      await window.StudyPulseAuth?.signOut?.();
    });
  }
  if (showWelcomeBtn) {
    showWelcomeBtn.addEventListener("click", () => {
      showWelcome();
    });
  }
  renderAccountSurface(window.StudyPulseAuth?.getSession?.());
}

function renderAccountSurface(session) {
  const title = document.querySelector("#account-title");
  const detail = document.querySelector("#account-detail");
  const signOutBtn = document.querySelector("#account-action");
  const signInRow = document.querySelector("#account-signin-row");
  if (!title) return;
  if (session?.user) {
    const name = state.profile?.displayName || session.user.email || "Signed in";
    title.textContent = `Signed in as ${name}`;
    detail.textContent = `${session.user.email} — your data is syncing across devices.`;
    if (signOutBtn) signOutBtn.hidden = false;
    if (signInRow) signInRow.hidden = true;
  } else {
    title.textContent = "Local-only";
    detail.textContent = "Sign in to back up your data and sync across devices. Your data is currently saved only on this device.";
    if (signOutBtn) signOutBtn.hidden = true;
    if (signInRow) signInRow.hidden = false;
  }
}

// Convenience push helpers used by mutation entry points.
function syncVocabUpsert(words) {
  const list = Array.isArray(words) ? words : [words];
  if (!list.length) return;
  window.StudyPulseDb?.pushVocab?.(list);
}
function syncVocabDelete(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  window.StudyPulseDb?.softDeleteVocab?.(list);
}
function syncTaskUpsert(tasks) {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  if (!list.length) return;
  window.StudyPulseDb?.pushTasks?.(list);
}
function syncTaskDelete(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  window.StudyPulseDb?.softDeleteTasks?.(list);
}
function syncCompletion(taskId, day, done) {
  window.StudyPulseDb?.pushCompletion?.(taskId, day, done);
}
function syncGrammarUpsert(items) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  window.StudyPulseDb?.pushGrammar?.(list);
}
function syncGrammarDelete(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  window.StudyPulseDb?.softDeleteGrammar?.(list);
}
function syncMediaUpsert(items) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  window.StudyPulseDb?.pushMedia?.(list);
}
function syncReviewSession(session) {
  if (!session) return;
  window.StudyPulseDb?.pushReviewSession?.(session);
}
function syncReviewSessionDelete(folder) {
  if (!folder) return;
  window.StudyPulseDb?.deleteReviewSession?.(folder);
}

async function claimPendingName(user) {
  const auth = window.StudyPulseAuth;
  if (!auth?.client) return;
  const name = localStorage.getItem(PENDING_NAME_KEY);
  if (!name) return;
  await auth.client
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id);
  localStorage.removeItem(PENDING_NAME_KEY);
  state.profile = state.profile || {};
  state.profile.displayName = name;
  saveState();
}

const WELCOME_WORDS = ["vocabulary.", "grammar.", "fluency.", "listening.", "reading."];
function startWelcomeWord() {
  if (!els.welcomeWord) return;
  let i = 0;
  const tick = () => {
    els.welcomeWord.textContent = WELCOME_WORDS[i % WELCOME_WORDS.length];
    i += 1;
  };
  tick();
  setInterval(tick, 2400);
}

function startWelcomeClock() {
  if (!els.welcomeTime) return;
  const tick = () => {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    els.welcomeTime.textContent = `live · ${time}`;
  };
  tick();
  setInterval(tick, 1000);
}

function setDefaultDates() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = todayKey();
  });
}

function bindNavigation() {
  els.tabs.forEach((tab) => {
    if (!tab.dataset.tab) return;
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.jump));
  });
}

function bindForms() {
  document.querySelector("#task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const task = {
      id: crypto.randomUUID(),
      title: data.title.trim(),
      type: data.type,
      time: data.time,
      duration: Number(data.duration),
      notes: data.notes.trim()
    };
    state.tasks.push(task);
    syncTaskUpsert([task]);
    event.currentTarget.reset();
    event.currentTarget.time.value = "09:00";
    event.currentTarget.duration.value = "60";
    saveAndRender();
  });

  document.querySelector("#vocab-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const entry = createVocabEntry(data);
    state.vocab.push(entry);
    syncVocabUpsert([entry]);
    event.currentTarget.reset();
    setDefaultDates();
    saveAndRender();
  });

  document.querySelector("#grammar-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const drill = {
      id: crypto.randomUUID(),
      book: data.book.trim(),
      unit: data.unit.trim(),
      exercises: data.exercises.trim(),
      due: data.due || todayKey(),
      notes: data.notes.trim(),
      done: false
    };
    state.grammar.push(drill);
    syncGrammarUpsert([drill]);
    event.currentTarget.reset();
    event.currentTarget.book.value = "Grammatik Aktiv";
    setDefaultDates();
    saveAndRender();
  });

  document.querySelector("#media-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const log = {
      id: crypto.randomUUID(),
      type: data.type,
      minutes: Number(data.minutes),
      title: data.title.trim(),
      notes: data.notes.trim(),
      date: todayKey()
    };
    state.mediaLogs.unshift(log);
    syncMediaUpsert([log]);
    event.currentTarget.reset();
    event.currentTarget.minutes.value = "30";
    saveAndRender();
  });
}

function bindActions() {
  document.querySelector("#mobile-more-trigger").addEventListener("click", toggleMobileMenu);
  document.querySelector("#mobile-enable-notifications").addEventListener("click", () => {
    closeMobileMenu();
    requestNotifications();
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.completeTask) toggleTaskDone(button.dataset.completeTask);
    if (button.dataset.deleteTask) deleteTask(button.dataset.deleteTask);
    if (button.dataset.deleteWord) deleteWord(button.dataset.deleteWord);
    if (button.dataset.deleteGrammar) deleteGrammar(button.dataset.deleteGrammar);
    if (button.dataset.toggleGrammar) toggleGrammar(button.dataset.toggleGrammar);
    if (button.dataset.startVocabReview) {
      let target = button.dataset.startVocabReview;
      if (target === "__select__") {
        target = document.querySelector("#review-folder")?.value || "all";
      }
      startVocabReview(target);
    }
    if (button.dataset.reviewReveal) revealReview();
    if (button.dataset.reviewGrade) gradeReview(button.dataset.reviewGrade);
    if (button.dataset.startTask) startTimer(button.dataset.startTask);
    if (button.dataset.jump) {
      switchTab(button.dataset.jump);
      closeMobileMenu();
    }
  });

  document.querySelector("#enable-notifications").addEventListener("click", requestNotifications);
  document.querySelector("#settings-enable-notifications").addEventListener("click", requestNotifications);
  document.querySelector("#test-notification").addEventListener("click", sendTestNotification);
  document.querySelector("#timer-start").addEventListener("click", () => {
    const next = nextUndoneTask();
    if (next) startTimer(next.id);
  });
  document.querySelector("#timer-stop").addEventListener("click", stopTimer);
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("change", importData);
  document.querySelector("#reset-data").addEventListener("click", resetData);
  els.vocabSearch.addEventListener("input", renderVocabList);
  els.vocabFolderFilter.addEventListener("change", () => {
    reviewSession.folder = els.vocabFolderFilter.value;
    renderReview();
    renderVocabList();
  });
  els.reviewBox.addEventListener("change", (event) => {
    const select = event.target;
    if (!select || select.id !== "review-folder") return;
    if (els.vocabFolderFilter) els.vocabFolderFilter.value = select.value;
    reviewSession.folder = select.value;
    renderReview();
    renderVocabList();
  });
  els.vocabImport.addEventListener("change", importVocabFile);
  bindBulkLoad();
  document.querySelectorAll(".view-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      els.vocabList.dataset.view = view;
      document.querySelectorAll(".view-toggle-btn").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.view === view));
      });
      try { localStorage.setItem("study-pulse-vocab-view", view); } catch (_) {}
      renderVocabList();
    });
  });
  const savedView = localStorage.getItem("study-pulse-vocab-view");
  if (savedView === "table" || savedView === "cards") {
    els.vocabList.dataset.view = savedView;
    document.querySelectorAll(".view-toggle-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.view === savedView));
    });
  }
  if (els.vocabAddToggle && els.vocabForm) {
    els.vocabAddToggle.addEventListener("click", () => {
      const open = els.vocabAddToggle.getAttribute("aria-expanded") === "true";
      els.vocabAddToggle.setAttribute("aria-expanded", String(!open));
      els.vocabForm.hidden = open;
      if (els.vocabAddHint) els.vocabAddHint.textContent = open ? "Tap to expand" : "Tap to collapse";
    });
  }
  if (els.resetFolderProgress) {
    els.resetFolderProgress.addEventListener("click", resetReviewFolderProgress);
  }
  if (els.flashcardFolderSelect) {
    els.flashcardFolderSelect.addEventListener("change", (event) => {
      const select = event.target;
      if (!select || select.id !== "flashcard-folder") return;
      if (els.vocabFolderFilter) els.vocabFolderFilter.value = select.value;
      startVocabReview(select.value);
    });
  }
  if (els.flashcardProgress) {
    els.flashcardProgress.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;
      toggleReviewFilter(chip.dataset.filter);
    });
  }
}

function switchTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  els.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tabName));
  closeMobileMenu();
}

function toggleMobileMenu() {
  const menu = document.querySelector("#mobile-more-menu");
  const trigger = document.querySelector("#mobile-more-trigger");
  const isOpen = !menu.hidden;
  menu.hidden = isOpen;
  trigger.setAttribute("aria-expanded", String(!isOpen));
}

function closeMobileMenu() {
  const menu = document.querySelector("#mobile-more-menu");
  const trigger = document.querySelector("#mobile-more-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function render() {
  els.todayDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());

  renderStats();
  renderTodayTasks();
  renderPlanner();
  renderNextTask();
  renderVocabFolders();
  renderReview();
  renderFlashcard();
  renderVocabList();
  renderGrammar();
  renderMedia();
  renderProgress();
  updateTimerDisplay();
  updateNotificationStatus();
}

function renderStats() {
  const today = todayKey();
  const done = state.completions[today] || {};
  const completedTasks = state.tasks.filter((task) => done[task.id]);
  const minutes = completedTasks.reduce((sum, task) => sum + Number(task.duration || 0), 0);
  const dueWords = dueVocab().length;

  els.statMinutes.textContent = minutes;
  els.statDone.textContent = `${completedTasks.length}/${state.tasks.length}`;
  els.statVocab.textContent = dueWords;
}

function renderTodayTasks() {
  const tasks = sortedTasks();
  if (!tasks.length) {
    els.todayTasks.innerHTML = emptyState("No tasks scheduled", "Add a study block in Planner.");
    return;
  }
  els.todayTasks.innerHTML = tasks.map(taskTemplate).join("");
}

function renderPlanner() {
  const tasks = sortedTasks();
  els.plannerList.innerHTML = tasks.length
    ? tasks.map((task) => plannerTaskTemplate(task)).join("")
    : emptyState("No routine yet", "Add vocab, grammar, reading, or listening blocks.");
}

function renderNextTask() {
  const next = nextUndoneTask();
  if (!next) {
    els.nextTask.innerHTML = "<strong>All tasks done</strong><p>Your daily routine is complete.</p>";
    return;
  }
  els.nextTask.innerHTML = `
    <span class="pill time">${escapeHtml(next.time)} - ${next.duration} min</span>
    <strong>${escapeHtml(next.title)}</strong>
    <p>${escapeHtml(next.notes || next.type)}</p>
    <div class="review-actions">
      <button class="primary-button" data-start-task="${next.id}" type="button">Start this block</button>
      <button class="secondary-button" data-complete-task="${next.id}" type="button">Mark done</button>
    </div>
  `;
}

function renderReview() {
  const folder = els.vocabFolderFilter?.value || "all";
  const due = dueVocab(folder);
  const dueAll = dueVocab().length;
  const folders = vocabFolderNames();
  const folderPicker = `
    <label class="review-folder-picker">
      <span>Folder</span>
      <select id="review-folder" aria-label="Folder to review">
        <option value="all"${folder === "all" ? " selected" : ""}>All folders</option>
        ${folders.map((name) => `<option value="${escapeHtml(name)}"${name === folder ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
      </select>
    </label>
  `;
  if (!due.length) {
    const html = `
      <strong>No words due</strong>
      <p>Add words or come back when reviews are due.</p>
      ${folderPicker}
      <div class="review-actions">
        <button class="secondary-button" data-start-vocab-review="__select__" type="button">Start review</button>
      </div>
    `;
    els.reviewBox.innerHTML = html;
    els.miniReview.innerHTML = `
      <strong>${dueAll} due today</strong>
      <p>Your flashcards are caught up.</p>
      <div class="review-actions">
        <button class="secondary-button" data-jump="vocab" type="button">Open vocab</button>
      </div>
    `;
    return;
  }

  const folderLabel = folder === "all" ? "All folders" : folder;
  const card = `
    <span class="pill">${escapeHtml(folderLabel)}</span>
    <strong>${due.length} word${due.length === 1 ? "" : "s"} due</strong>
    <p>Review uses spaced repetition and reschedules each card from your answer.</p>
    ${folderPicker}
    <div class="review-actions">
      <button class="primary-button" data-start-vocab-review="__select__" type="button">Start review</button>
    </div>
  `;
  els.reviewBox.innerHTML = card;
  els.miniReview.innerHTML = `
    <strong>${dueAll} due today</strong>
    <p>${escapeHtml(due[0].word)} is next.</p>
    <div class="review-actions">
      <button class="primary-button" data-start-vocab-review="all" type="button">Start review</button>
    </div>
  `;
}

function renderVocabFolders() {
  const current = els.vocabFolderFilter.value || "all";
  const folders = vocabFolderNames();
  els.vocabFolderFilter.innerHTML = [
    `<option value="all">All folders</option>`,
    ...folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)
  ].join("");
  els.vocabFolderFilter.value = folders.includes(current) ? current : "all";
  els.vocabFolderOptions.innerHTML = folders
    .map((folder) => `<option value="${escapeHtml(folder)}"></option>`)
    .join("");
}

function renderFlashcard() {
  if (!els.flashcardBox) return;
  const folder = reviewSession.folder || "all";
  const folderLabel = folder === "all" ? "All folders" : folder;
  const active = state.vocab.find((word) => word.id === activeReviewId);
  const grades = reviewSession.grades || {};
  const activeFilter = reviewSession.filter || null;
  els.flashcardFolderLabel.textContent = folderLabel;
  if (els.flashcardFolderSelect) {
    const folderNames = vocabFolderNames();
    els.flashcardFolderSelect.innerHTML = `
      <label>
        <span>Folder</span>
        <select id="flashcard-folder" aria-label="Folder to review">
          <option value="all"${folder === "all" ? " selected" : ""}>All folders</option>
          ${folderNames.map((name) => `<option value="${escapeHtml(name)}"${name === folder ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  els.flashcardProgress.innerHTML = `
    <button class="progress-chip is-left" type="button" disabled><strong>${reviewQueueIds.length}</strong><span>left</span></button>
    <button class="progress-chip is-reviewed" type="button" disabled><strong>${reviewSession.seen}</strong><span>reviewed</span></button>
    <button class="progress-chip is-again ${activeFilter === "again" ? "is-selected" : ""}" data-filter="again" type="button" aria-pressed="${activeFilter === "again"}"><strong>${grades.again || 0}</strong><span>Again</span></button>
    <button class="progress-chip is-hard ${activeFilter === "hard" ? "is-selected" : ""}" data-filter="hard" type="button" aria-pressed="${activeFilter === "hard"}"><strong>${grades.hard || 0}</strong><span>Hard</span></button>
    <button class="progress-chip is-good ${activeFilter === "good" ? "is-selected" : ""}" data-filter="good" type="button" aria-pressed="${activeFilter === "good"}"><strong>${grades.good || 0}</strong><span>Good</span></button>
  `;

  if (!active) {
    const due = dueVocab(folder);
    els.flashcardBox.innerHTML = `
      <div class="flashcard-empty">
        <strong>${due.length ? "Ready to start" : "Review complete"}</strong>
        <p>${due.length ? `${due.length} cards are due in ${folderLabel}.` : "No more cards are due in this session."}</p>
        <div class="review-actions">
          ${due.length ? `<button class="primary-button" data-start-vocab-review="${escapeHtml(folder)}" type="button">Start review</button>` : ""}
          <button class="secondary-button" data-jump="vocab" type="button">Back to vocab</button>
        </div>
      </div>
    `;
    return;
  }

  els.flashcardBox.innerHTML = `
    <article class="flashcard ${reviewRevealed ? "is-revealed" : ""}">
      <div class="task-meta">
        <span class="pill">${escapeHtml(active.folder || "General")}</span>
        <span class="pill">${escapeHtml(active.topic || "General")}</span>
        <span class="pill time">Interval ${formatInterval(active.interval)}</span>
      </div>
      <h4>${escapeHtml(active.word)}</h4>
      ${
        reviewRevealed
          ? `<div class="flashcard-answer">
              <p><b>Meaning</b><span>${escapeHtml(active.meaning)}</span></p>
              <p><b>Sentence</b><span>${escapeHtml(active.sentence)}</span></p>
            </div>`
          : `<p class="flashcard-prompt">Recall the meaning and example sentence.</p>`
      }
      <div class="review-actions grade-actions">
        ${
          reviewRevealed
            ? `<button class="danger-button" data-review-grade="again" type="button">Again</button>
               <button class="secondary-button" data-review-grade="hard" type="button">Hard</button>
               <button class="primary-button" data-review-grade="good" type="button">Good</button>
               <button class="secondary-button" data-review-grade="easy" type="button">Easy</button>`
            : `<button class="primary-button" data-review-reveal="true" type="button">Reveal answer</button>`
        }
      </div>
    </article>
  `;
}

function renderVocabList() {
  const query = els.vocabSearch.value.trim().toLowerCase();
  const folder = els.vocabFolderFilter.value || "all";
  const words = state.vocab
    .filter((item) => folder === "all" || (item.folder || "General") === folder)
    .filter((item) => [item.word, item.meaning, item.topic, item.folder].join(" ").toLowerCase().includes(query))
    .sort((a, b) => a.due.localeCompare(b.due));

  const view = els.vocabList.dataset.view === "table" ? "table" : "cards";
  if (!words.length) {
    els.vocabList.innerHTML = emptyState("No matching words", "Add a word or adjust the search.");
    return;
  }
  if (view === "table") {
    els.vocabList.innerHTML = vocabTableTemplate(words);
  } else {
    els.vocabList.innerHTML = words.map(wordTemplate).join("");
  }
}

function vocabTableTemplate(words) {
  const rows = words.map((word) => `
    <tr>
      <td class="vocab-table-word">${escapeHtml(word.word)}</td>
      <td>${escapeHtml(word.meaning || "")}</td>
      <td class="vocab-table-sentence">${escapeHtml(word.sentence || "")}</td>
      <td>${escapeHtml(word.folder || "General")}</td>
      <td>${escapeHtml(word.topic || "General")}</td>
      <td>${escapeHtml(formatDate(word.due))}</td>
      <td>${escapeHtml(formatInterval(word.interval))}</td>
      <td class="vocab-table-actions"><button class="danger-button" data-delete-word="${word.id}" type="button">Delete</button></td>
    </tr>
  `).join("");
  return `
    <table class="vocab-table">
      <thead>
        <tr>
          <th>Word</th>
          <th>Meaning</th>
          <th>Sentence</th>
          <th>Folder</th>
          <th>Topic</th>
          <th>Due</th>
          <th>Interval</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderGrammar() {
  const drills = [...state.grammar].sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  els.grammarList.innerHTML = drills.length
    ? drills.map(grammarTemplate).join("")
    : emptyState("No grammar drills", "Add units from your book as you plan them.");
}

function renderMedia() {
  els.mediaList.innerHTML = state.mediaLogs.length
    ? state.mediaLogs.slice(0, 12).map(logTemplate).join("")
    : emptyState("No logs yet", "Track the articles, chapters, podcasts, or videos you use.");
}

function renderProgress() {
  const today = startOfDay(new Date());
  const days = [...Array(7)].map((_, index) => {
    const date = new Date(today.getTime() - (6 - index) * MS_PER_DAY);
    const key = toDateKey(date);
    const done = state.completions[key] || {};
    const taskMinutes = state.tasks
      .filter((task) => done[task.id])
      .reduce((sum, task) => sum + Number(task.duration || 0), 0);
    const mediaMinutes = state.mediaLogs
      .filter((log) => log.date === key)
      .reduce((sum, log) => sum + Number(log.minutes || 0), 0);
    return {
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
      minutes: taskMinutes + mediaMinutes
    };
  });

  const max = Math.max(60, ...days.map((day) => day.minutes));
  els.progressBars.innerHTML = days.map((day) => `
    <div class="progress-row">
      <div><span>${day.label}</span><span>${day.minutes} min</span></div>
      <span class="progress-track"><span class="progress-fill" style="width: ${(day.minutes / max) * 100}%"></span></span>
    </div>
  `).join("");
}

function taskTemplate(task) {
  const done = Boolean((state.completions[todayKey()] || {})[task.id]);
  return `
    <article class="task-item ${done ? "is-done" : ""}">
      <div>
        <div class="task-meta">
          <span class="pill time">${escapeHtml(task.time)}</span>
          <span class="pill">${escapeHtml(task.type)}</span>
          <span class="pill">${task.duration} min</span>
          ${done ? '<span class="pill status">Done</span>' : ""}
        </div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.notes || "")}</p>
      </div>
      <div class="button-row">
        <button class="secondary-button" data-start-task="${task.id}" type="button">Start</button>
        <button class="primary-button" data-complete-task="${task.id}" type="button">${done ? "Undo" : "Done"}</button>
      </div>
    </article>
  `;
}

function plannerTaskTemplate(task) {
  return `
    <article class="task-item">
      <div>
        <div class="task-meta">
          <span class="pill time">${escapeHtml(task.time)}</span>
          <span class="pill">${escapeHtml(task.type)}</span>
          <span class="pill">${task.duration} min</span>
          ${task.pinned ? '<span class="pill status">Pinned</span>' : ""}
        </div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.notes || "")}</p>
      </div>
      ${task.pinned ? "" : `<button class="danger-button" data-delete-task="${task.id}" type="button">Delete</button>`}
    </article>
  `;
}

function wordTemplate(word) {
  return `
    <article class="word-item">
      <div>
        <div class="task-meta">
          <span class="pill">${escapeHtml(word.folder || "General")}</span>
          <span class="pill">${escapeHtml(word.topic || "General")}</span>
          <span class="pill time">Due ${formatDate(word.due)}</span>
        </div>
        <h4>${escapeHtml(word.word)} - ${escapeHtml(word.meaning)}</h4>
        <p>${escapeHtml(word.sentence)}</p>
      </div>
      <footer>
        <span class="pill">${formatInterval(word.interval)}</span>
        <button class="danger-button" data-delete-word="${word.id}" type="button">Delete</button>
      </footer>
    </article>
  `;
}

function grammarTemplate(drill) {
  return `
    <article class="task-item ${drill.done ? "is-done" : ""}">
      <div>
        <div class="task-meta">
          <span class="pill">${escapeHtml(drill.book)}</span>
          <span class="pill time">Due ${formatDate(drill.due)}</span>
          ${drill.done ? '<span class="pill status">Done</span>' : ""}
        </div>
        <h4>${escapeHtml(drill.unit)}</h4>
        <p>${escapeHtml(drill.exercises ? `Exercises ${drill.exercises}. ` : "")}${escapeHtml(drill.notes || "")}</p>
      </div>
      <div class="button-row">
        <button class="primary-button" data-toggle-grammar="${drill.id}" type="button">${drill.done ? "Undo" : "Done"}</button>
        <button class="danger-button" data-delete-grammar="${drill.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function logTemplate(log) {
  return `
    <article class="log-item">
      <div class="task-meta">
        <span class="pill">${escapeHtml(log.type)}</span>
        <span class="pill">${log.minutes} min</span>
        <span class="pill time">${formatDate(log.date)}</span>
      </div>
      <h4>${escapeHtml(log.title)}</h4>
      <p>${escapeHtml(log.notes || "")}</p>
    </article>
  `;
}

function toggleTaskDone(id) {
  const today = todayKey();
  state.completions[today] ||= {};
  state.completions[today][id] = !state.completions[today][id];
  const done = Boolean(state.completions[today][id]);
  if (!done) delete state.completions[today][id];
  syncCompletion(id, today, done);
  saveAndRender();
}

function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || task.pinned) return;
  syncTaskDelete([id]);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  Object.values(state.completions).forEach((day) => delete day[id]);
  saveAndRender();
}

function deleteWord(id) {
  syncVocabDelete([id]);
  state.vocab = state.vocab.filter((word) => word.id !== id);
  if (activeReviewId === id) activeReviewId = null;
  saveAndRender();
}

function deleteGrammar(id) {
  syncGrammarDelete([id]);
  state.grammar = state.grammar.filter((drill) => drill.id !== id);
  saveAndRender();
}

function toggleGrammar(id) {
  let mutated = null;
  state.grammar = state.grammar.map((drill) => {
    if (drill.id !== id) return drill;
    mutated = { ...drill, done: !drill.done };
    return mutated;
  });
  if (mutated) syncGrammarUpsert([mutated]);
  saveAndRender();
}

function revealReview() {
  reviewRevealed = true;
  renderReview();
  renderFlashcard();
}

function gradeReview(grade) {
  const word = state.vocab.find((item) => item.id === activeReviewId);
  if (!word) return;
  scheduleWord(word, grade);
  syncVocabUpsert([word]);
  syncReviewSession(reviewSession);
  reviewSession.grades ||= { again: 0, hard: 0, good: 0, easy: 0 };
  reviewSession.wordGrades ||= {};
  const previousGrade = reviewSession.wordGrades[word.id];
  if (previousGrade && previousGrade !== grade) {
    reviewSession.grades[previousGrade] = Math.max(0, (reviewSession.grades[previousGrade] || 0) - 1);
  }
  if (!previousGrade) {
    reviewSession.seen += 1;
  }
  if (previousGrade !== grade) {
    reviewSession.grades[grade] = (reviewSession.grades[grade] || 0) + 1;
  }
  reviewSession.wordGrades[word.id] = grade;
  reviewQueueIds = reviewQueueIds.filter((id) => id !== word.id);
  if (grade === "again") reviewQueueIds.push(word.id);
  activeReviewId = reviewQueueIds[0] || null;
  reviewRevealed = false;
  saveAndRender();
}

function resetReviewFolderProgress() {
  const folder = reviewSession.folder || "all";
  const label = folder === "all" ? "all folders" : folder;
  const affected = state.vocab.filter((word) => folder === "all" || (word.folder || "General") === folder);
  if (!affected.length) return;
  const ok = window.confirm(`Reset review progress for ${affected.length} word${affected.length === 1 ? "" : "s"} in ${label}? They will all become due today and lose their interval, ease, and streak.`);
  if (!ok) return;
  const today = todayKey();
  affected.forEach((word) => {
    word.interval = 0;
    word.ease = 2.5;
    word.repetitions = 0;
    word.lapses = 0;
    word.lastReviewed = null;
    word.lastGrade = null;
    word.due = today;
  });
  syncVocabUpsert(affected);
  saveState();
  startVocabReview(folder, { force: true });
}

function startVocabReview(folder = "all", { force = false } = {}) {
  if (force) {
    syncReviewSessionDelete(folder);
    delete reviewSessions[folder];
  }
  reviewSession = getReviewSession(folder);
  reviewQueueIds = buildReviewQueue(folder, reviewSession.filter);
  activeReviewId = reviewQueueIds[0] || null;
  reviewRevealed = false;
  switchTab("flashcards");
  renderFlashcard();
}

function scheduleWord(word, grade) {
  const previousInterval = Number(word.interval) || 0;
  const previousEase = Number(word.ease) || 2.5;
  const repetitions = Number(word.repetitions) || 0;
  let interval = 1;
  let ease = previousEase;
  let nextRepetitions = repetitions + 1;

  if (grade === "again") {
    interval = 0;
    ease = Math.max(1.3, previousEase - 0.2);
    nextRepetitions = 0;
    word.lapses = (Number(word.lapses) || 0) + 1;
  } else if (grade === "hard") {
    interval = Math.max(1, Math.ceil(Math.max(1, previousInterval) * 1.2));
    ease = Math.max(1.3, previousEase - 0.15);
  } else if (grade === "easy") {
    interval = repetitions === 0 ? 4 : Math.ceil(Math.max(1, previousInterval) * (previousEase + 0.35));
    ease = previousEase + 0.15;
  } else {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.ceil(Math.max(1, previousInterval) * previousEase);
  }

  word.interval = Math.min(interval, 365);
  word.ease = Number(ease.toFixed(2));
  word.repetitions = nextRepetitions;
  word.lastReviewed = todayKey();
  word.lastGrade = grade;
  word.due = toDateKey(new Date(Date.now() + word.interval * MS_PER_DAY));
}

function startTimer(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.linkTab) {
    switchTab(task.linkTab);
    return;
  }
  stopTimer(false);
  timer.taskId = task.id;
  timer.remaining = Number(task.duration) * 60;
  els.timerLabel.textContent = task.title;
  timer.id = setInterval(() => {
    timer.remaining = Math.max(0, timer.remaining - 1);
    updateTimerDisplay();
    if (timer.remaining === 0) {
      stopTimer(false);
      notify("Study block complete", `${task.title} is finished. Mark it done when you are ready.`);
    }
  }, 1000);
  updateTimerDisplay();
}

function stopTimer(clearLabel = true) {
  if (timer.id) clearInterval(timer.id);
  timer.id = null;
  timer.taskId = null;
  timer.remaining = 0;
  if (clearLabel) els.timerLabel.textContent = "No timer running";
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timer.remaining / 60).toString().padStart(2, "0");
  const seconds = (timer.remaining % 60).toString().padStart(2, "0");
  els.timerDisplay.textContent = `${minutes}:${seconds}`;
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  await Notification.requestPermission();
  updateNotificationStatus();
}

function updateNotificationStatus() {
  const status = !("Notification" in window)
    ? "Notifications unavailable"
    : Notification.permission === "granted"
      ? "Notifications enabled"
      : Notification.permission === "denied"
        ? "Notifications blocked"
        : "Notifications not enabled";
  els.notificationStatus.textContent = status;
}

function checkDueNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = todayKey();
  state.notifications[today] ||= {};

  sortedTasks().forEach((task) => {
    const alreadyDone = Boolean((state.completions[today] || {})[task.id]);
    if (task.time === current && !state.notifications[today][task.id] && !alreadyDone) {
      notify(`Time for ${task.title}`, `${task.duration} minutes - ${task.notes || task.type}`);
      state.notifications[today][task.id] = true;
      saveState();
    }
  });
}

function sendTestNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    requestNotifications();
    return;
  }
  notify("Study Pulse test", "Notifications are working in this browser.");
}

function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  navigator.serviceWorker?.ready
    .then((registration) => registration.showNotification(title, { body, icon: "icon.svg" }))
    .catch(() => new Notification(title, { body }));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-pulse-backup-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      state = normalizeState(incoming);
      saveAndRender();
    } catch {
      alert("That file could not be imported.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function importVocabFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = readWorkbookRows(file, reader.result);
      const entries = rows
        .map(rowToVocabEntry)
        .filter(Boolean);

      if (!entries.length) {
        alert("No vocabulary rows were found.");
        return;
      }

      state.vocab.push(...entries);
      syncVocabUpsert(entries);
      saveAndRender();
      alert(`${entries.length} word${entries.length === 1 ? "" : "s"} imported.`);
    } catch {
      alert("That vocabulary file could not be imported.");
    } finally {
      event.target.value = "";
    }
  };

  if (file.name.toLowerCase().endsWith(".csv")) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function readWorkbookRows(file, result) {
  if (file.name.toLowerCase().endsWith(".csv") && !window.XLSX) {
    return parseCsv(String(result));
  }

  if (!window.XLSX) {
    throw new Error("Excel parser unavailable");
  }

  const workbook = window.XLSX.read(result, {
    type: file.name.toLowerCase().endsWith(".csv") ? "string" : "array",
    cellDates: true
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(",").map((value) => value.trim()));
  const headers = rows.shift()?.map(normalizeHeader) || [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function rowToVocabEntry(row) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
  const word = getFirstValue(normalized, ["word", "wort", "term", "front"]);
  const meaning = getFirstValue(normalized, ["meaning", "bedeutung", "definition", "translation", "back"]);
  if (!word || !meaning) return null;

  return createVocabEntry({
    word,
    meaning,
    sentence: getFirstValue(normalized, ["sentence", "satz", "example", "beispiel"]),
    folder: getFirstValue(normalized, ["folder", "deck", "category", "gruppe"]),
    topic: getFirstValue(normalized, ["topic", "tag", "theme", "thema"]),
    due: normalizeDueDate(getFirstValue(normalized, ["due", "reviewfrom", "date"]))
  });
}

function createVocabEntry(data) {
  const folder = String(data.folder || "").trim() || "General";
  ensureVocabFolder(folder);
  return {
    id: crypto.randomUUID(),
    word: String(data.word || "").trim(),
    meaning: String(data.meaning || "").trim(),
    sentence: String(data.sentence || "").trim(),
    folder,
    topic: String(data.topic || "").trim() || "General",
    due: normalizeDueDate(data.due) || todayKey(),
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    lastReviewed: null
  };
}

function ensureVocabFolder(name) {
  const cleanName = String(name || "").trim() || "General";
  state.vocabFolders ||= [];
  if (!state.vocabFolders.some((folder) => folder.name.toLowerCase() === cleanName.toLowerCase())) {
    state.vocabFolders.push({ id: crypto.randomUUID(), name: cleanName });
  }
}

function vocabFolderNames() {
  const wordFolders = state.vocab.map((word) => word.folder || "General");
  const names = new Set(wordFolders.length ? wordFolders : (state.vocabFolders || []).map((folder) => folder.name));
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function resetData() {
  state = structuredClone(defaultState);
  saveAndRender();
}

function dueVocab(folder = "all") {
  const today = todayKey();
  return state.vocab
    .filter((word) => folder === "all" || (word.folder || "General") === folder)
    .filter((word) => !word.due || word.due <= today)
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}

function sortedTasks() {
  return [...state.tasks].sort((a, b) => a.time.localeCompare(b.time));
}

function nextUndoneTask() {
  const done = state.completions[todayKey()] || {};
  return sortedTasks().find((task) => !done[task.id]) || null;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    const normalized = normalizeState(JSON.parse(saved));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(value) {
  const vocab = Array.isArray(value.vocab) ? value.vocab.map(normalizeVocabWord) : [];
  if (value.sampleVocabVersion !== 2) {
    sampleVocabWords().forEach((sampleWord) => {
      const existing = vocab.find((word) => word.word.toLowerCase() === sampleWord.word.toLowerCase());
      if (existing) {
        Object.assign(existing, {
          meaning: sampleWord.meaning,
          sentence: sampleWord.sentence,
          folder: sampleWord.folder,
          topic: sampleWord.topic,
          due: todayKey(),
          interval: 0,
          ease: 2.5,
          repetitions: 0,
          lapses: 0,
          lastReviewed: null,
          sample: true
        });
      } else {
        vocab.push(sampleWord);
      }
    });
  }
  const folderNames = new Set([
    ...(Array.isArray(value.vocabFolders) ? value.vocabFolders.map((folder) => folder.name) : []),
    ...vocab.map((word) => word.folder || "General")
  ]);
  const tasks = Array.isArray(value.tasks) ? value.tasks.slice() : [];
  const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let flashcardsTask = tasks.find((t) => t.id === "task-flashcards") ||
                       tasks.find((t) => t.pinned && t.linkTab === "vocab") ||
                       tasks.find((t) => t.title === "Vocab review" || t.title === "Flashcards");
  if (flashcardsTask) {
    if (!isUuid(flashcardsTask.id)) {
      const oldId = flashcardsTask.id;
      flashcardsTask.id = crypto.randomUUID();
      // Carry over any completions stored against the old non-UUID id.
      if (value.completions && typeof value.completions === "object") {
        Object.values(value.completions).forEach((day) => {
          if (day && typeof day === "object" && day[oldId]) {
            day[flashcardsTask.id] = day[oldId];
            delete day[oldId];
          }
        });
      }
    }
    flashcardsTask.title = "Flashcards";
    flashcardsTask.linkTab = "vocab";
    flashcardsTask.pinned = true;
    if (!flashcardsTask.type) flashcardsTask.type = "Vocabulary";
    if (!flashcardsTask.duration) flashcardsTask.duration = 60;
    if (!flashcardsTask.time) flashcardsTask.time = "09:00";
  } else {
    tasks.unshift({
      id: crypto.randomUUID(),
      title: "Flashcards",
      type: "Vocabulary",
      time: "09:00",
      duration: 60,
      notes: "Run your spaced-repetition flashcards for today.",
      linkTab: "vocab",
      pinned: true
    });
  }
  // Ensure every task has a UUID for server sync.
  tasks.forEach((t) => {
    if (!isUuid(t.id)) {
      const oldId = t.id;
      t.id = crypto.randomUUID();
      if (value.completions && typeof value.completions === "object") {
        Object.values(value.completions).forEach((day) => {
          if (day && typeof day === "object" && day[oldId]) {
            day[t.id] = day[oldId];
            delete day[oldId];
          }
        });
      }
    }
  });
  return {
    tasks,
    vocab,
    vocabFolders: [...folderNames].filter(Boolean).map((name) => ({ id: crypto.randomUUID(), name })),
    grammar: Array.isArray(value.grammar) ? value.grammar : [],
    mediaLogs: Array.isArray(value.mediaLogs) ? value.mediaLogs : [],
    completions: value.completions && typeof value.completions === "object" ? value.completions : {},
    notifications: value.notifications && typeof value.notifications === "object" ? value.notifications : {},
    sampleVocabSeeded: true,
    sampleVocabVersion: 2
  };
}

function normalizeVocabWord(word) {
  return {
    id: word.id || crypto.randomUUID(),
    word: word.word || "",
    meaning: word.meaning || "",
    sentence: word.sentence || "",
    folder: word.folder || word.deck || word.topic || "General",
    topic: word.topic || "General",
    due: normalizeDueDate(word.due) || todayKey(),
    interval: Number(word.interval) || 0,
    ease: Number(word.ease) || 2.5,
    repetitions: Number(word.repetitions) || 0,
    lapses: Number(word.lapses) || 0,
    lastReviewed: word.lastReviewed || null
  };
}

function saveAndRender() {
  saveState();
  render();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(key) {
  if (!key) return "not set";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function formatInterval(interval) {
  const days = Number(interval) || 0;
  if (!days) return "Learning";
  return `${days} day${days === 1 ? "" : "s"}`;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getFirstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeDueDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toDateKey(parsed);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
