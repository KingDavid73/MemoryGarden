const DB_NAME = "memory-garden";
const DB_VERSION = 1;
const STORE_NAME = "garden-state";
const STATE_KEY = "main";
const MAX_PLOTS = 7;

const genericPrompts = [
  "What thought has been quietly returning to you this week?",
  "Is there something unfinished that deserves a gentler second look?",
  "What gave you a small amount of energy today?",
  "What are you learning about the way you spend your attention?",
  "Name something you want to remember from this part of your life.",
  "What feels different now than it did a month ago?",
  "Is there a question you have been trying to answer too quickly?",
];

const elements = {
  gardenName: document.querySelector("#garden-name"),
  gardenYear: document.querySelector("#garden-year"),
  threadCount: document.querySelector("#thread-count"),
  threadListButton: document.querySelector("#thread-list-button"),
  threadListDialog: document.querySelector("#thread-list-dialog"),
  threadList: document.querySelector("#thread-list"),
  plots: document.querySelector("#plots"),
  birdMessage: document.querySelector("#bird-message"),
  speechCard: document.querySelector("#speech-card"),
  birdButton: document.querySelector("#bird-button"),
  usePromptButton: document.querySelector("#use-prompt-button"),
  archiveButton: document.querySelector("#archive-button"),
  ringsButton: document.querySelector("#rings-button"),
  treeRingsTree: document.querySelector("#tree-rings-tree"),
  threadDialog: document.querySelector("#thread-dialog"),
  ringsDialog: document.querySelector("#rings-dialog"),
  archiveDialog: document.querySelector("#archive-dialog"),
  threadDate: document.querySelector("#thread-date"),
  threadTitle: document.querySelector("#thread-title"),
  threadPlantPortrait: document.querySelector("#thread-plant-portrait"),
  threadPlantArt: document.querySelector("#thread-plant-art"),
  threadGrowthLabel: document.querySelector("#thread-growth-label"),
  entryStream: document.querySelector("#entry-stream"),
  entryForm: document.querySelector("#entry-form"),
  entryInput: document.querySelector("#entry-input"),
  saveStatus: document.querySelector("#save-status"),
  tagsToggle: document.querySelector("#tags-toggle"),
  tagEditor: document.querySelector("#tag-editor"),
  tagList: document.querySelector("#tag-list"),
  tagInput: document.querySelector("#tag-input"),
  addTagButton: document.querySelector("#add-tag-button"),
  harvestButton: document.querySelector("#harvest-button"),
  removeThreadButton: document.querySelector("#remove-thread-button"),
  threadActions: document.querySelector("#thread-actions"),
  ringsList: document.querySelector("#rings-list"),
  nextGardenName: document.querySelector("#next-garden-name"),
  cancelArchiveButton: document.querySelector("#cancel-archive-button"),
  confirmArchiveButton: document.querySelector("#confirm-archive-button"),
  toast: document.querySelector("#toast"),
};

let db;
let state;
let openThreadId = null;
let suggestionText = "";
let typeTimer = null;
let toastTimer = null;
let stateNormalizationChanged = false;

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createInitialState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    activeGardenId: uid("garden"),
    gardens: [
      {
        id: null,
        name: "My first garden",
        createdAt: now,
        archivedAt: null,
      },
    ],
    threads: [],
  };
}

function normalizeState(value) {
  const normalized = value || createInitialState();
  stateNormalizationChanged = false;

  if (!normalized.gardens[0].id) {
    normalized.gardens[0].id = normalized.activeGardenId;
    stateNormalizationChanged = true;
  }

  if (normalized.plotLayoutVersion !== 7) {
    for (const garden of normalized.gardens) {
      const usedPlots = new Set();
      const threads = normalized.threads
        .filter(
          (thread) =>
            thread.gardenId === garden.id && thread.status === "active",
        )
        .sort(
          (a, b) =>
            (a.plotIndex ?? Number.MAX_SAFE_INTEGER) -
              (b.plotIndex ?? Number.MAX_SAFE_INTEGER) ||
            new Date(a.createdAt) - new Date(b.createdAt),
        );

      for (const thread of threads) {
        const plotIsAvailable =
          Number.isInteger(thread.plotIndex) &&
          thread.plotIndex >= 0 &&
          thread.plotIndex < MAX_PLOTS &&
          !usedPlots.has(thread.plotIndex);

        if (plotIsAvailable) {
          usedPlots.add(thread.plotIndex);
          continue;
        }

        const openPlot = Array.from(
          { length: MAX_PLOTS },
          (_, index) => index,
        ).find((index) => !usedPlots.has(index));

        if (openPlot !== undefined) {
          thread.plotIndex = openPlot;
          usedPlots.add(openPlot);
        }
      }
    }

    normalized.plotLayoutVersion = 7;
    stateNormalizationChanged = true;
  }

  return normalized;
}

function removeVerificationFixture(value) {
  if (value.verificationFixtureRemoved) return false;

  const syntheticBodies = new Set([
    "I keep returning to the idea of making more time for drawing and noticing birds in the neighborhood.",
    "Today I made a tiny sketch and felt more present while doing it.",
  ]);
  const fixtureThreads = value.threads.filter(
    (thread) =>
      thread.entries.length === 2 &&
      thread.entries.every((entry) => syntheticBodies.has(entry.body)),
  );
  const fixtureThreadIds = new Set(fixtureThreads.map((thread) => thread.id));
  const fixtureGardenIds = new Set(
    fixtureThreads.map((thread) => thread.gardenId),
  );

  value.threads = value.threads.filter(
    (thread) => !fixtureThreadIds.has(thread.id),
  );
  value.gardens = value.gardens.filter(
    (garden) =>
      !(
        fixtureGardenIds.has(garden.id) &&
        garden.archivedAt &&
        !value.threads.some((thread) => thread.gardenId === garden.id)
      ),
  );

  const currentGarden = value.gardens.find(
    (garden) => garden.id === value.activeGardenId,
  );
  if (currentGarden?.name === "Summer clearing") {
    currentGarden.name = "Current garden";
  }

  value.verificationFixtureRemoved = true;
  return true;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readState() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveState() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function activeGarden() {
  return state.gardens.find((garden) => garden.id === state.activeGardenId);
}

function activeThreads() {
  return state.threads.filter(
    (thread) =>
      thread.gardenId === state.activeGardenId && thread.status === "active",
  );
}

function threadById(id) {
  return state.threads.find((thread) => thread.id === id);
}

function growthStage(thread) {
  return Math.min(4, Math.max(1, thread.entries.length));
}

function isDormant(thread) {
  const lastVisit = new Date(thread.updatedAt).getTime();
  return Date.now() - lastVisit > 1000 * 60 * 60 * 24 * 21;
}

function plantClassName(thread, baseClass) {
  const dormantClass = isDormant(thread) ? " dormant" : "";
  return `${baseClass} family-${thread.plantFamily} stage-${growthStage(thread)}${dormantClass}`;
}

function growthLabel(thread) {
  if (isDormant(thread)) return "Resting and ready for attention";
  return [
    "A newly planted seed",
    "Sending up its first leaves",
    "Growing into itself",
    "In full bloom",
  ][growthStage(thread) - 1];
}

function formatDate(value, withTime = false) {
  const options = withTime
    ? {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    : { month: "long", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function renderGarden() {
  const garden = activeGarden();
  const threads = activeThreads();
  elements.gardenName.textContent = garden.name;
  elements.gardenYear.textContent = new Date(garden.createdAt).getFullYear();
  elements.threadCount.textContent = threads.length;
  elements.plots.replaceChildren();

  for (let plotIndex = 0; plotIndex < MAX_PLOTS; plotIndex += 1) {
    const thread = threads.find((item) => item.plotIndex === plotIndex);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plot plot-${plotIndex} ${thread ? "planted" : "empty"}`;

    if (thread) {
      button.setAttribute("aria-label", `Open ${thread.title}`);
      const plant = document.createElement("span");
      plant.className = plantClassName(thread, "plant");
      button.append(plant);

      const label = document.createElement("span");
      label.className = "plot-label";
      label.textContent = thread.title;
      button.append(label);
      button.addEventListener("click", () => openThread(thread.id));
    } else {
      button.setAttribute("aria-label", `Plant a thought in plot ${plotIndex + 1}`);
      button.addEventListener("click", () => plantThread(plotIndex));
    }

    elements.plots.append(button);
  }

  renderThreadList();
}

function renderThreadList() {
  const threads = [...activeThreads()].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  );
  elements.threadList.replaceChildren();

  if (!threads.length) {
    const empty = document.createElement("p");
    empty.className = "thread-list-empty";
    empty.textContent = "Plant your first thought and it will appear here.";
    elements.threadList.append(empty);
    return;
  }

  for (const thread of threads) {
    const button = document.createElement("button");
    button.className = "thread-list-item";
    button.type = "button";

    const plantWrap = document.createElement("span");
    plantWrap.className = "thread-list-plant-wrap";
    const plant = document.createElement("span");
    plant.className = plantClassName(thread, "thread-plant-art");
    plantWrap.append(plant);

    const copy = document.createElement("span");
    copy.className = "thread-list-copy";
    const title = document.createElement("strong");
    title.textContent = thread.title;
    const meta = document.createElement("span");
    const entryCount = thread.entries.length;
    meta.textContent = `Tended ${formatDate(thread.updatedAt)} · ${entryCount} ${
      entryCount === 1 ? "entry" : "entries"
    }`;
    copy.append(title, meta);

    button.append(plantWrap, copy);
    button.addEventListener("click", () => {
      elements.threadListDialog.close();
      openThread(thread.id);
    });
    elements.threadList.append(button);
  }
}

function plantThread(plotIndex, initialPrompt = "") {
  const now = new Date().toISOString();
  const thread = {
    id: uid("thread"),
    gardenId: state.activeGardenId,
    plotIndex,
    title: "A new thought",
    createdAt: now,
    updatedAt: now,
    status: "active",
    plantFamily: plotIndex % 3,
    tags: [],
    entries: [],
  };
  state.threads.push(thread);
  saveState();
  renderGarden();
  openThread(thread.id, initialPrompt);
}

function nextEmptyPlot() {
  const occupied = new Set(activeThreads().map((thread) => thread.plotIndex));
  for (let index = 0; index < MAX_PLOTS; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
}

function openThread(id, initialPrompt = "") {
  const thread = threadById(id);
  if (!thread) return;
  openThreadId = id;
  elements.threadDate.textContent = `Planted ${formatDate(thread.createdAt)}`;
  elements.threadTitle.value = thread.title;
  elements.threadPlantArt.className = plantClassName(
    thread,
    "thread-plant-art",
  );
  elements.threadPlantPortrait.className =
    `thread-plant-portrait growth-stage-${growthStage(thread)}` +
    (isDormant(thread) ? " dormant" : "");
  elements.threadGrowthLabel.textContent = growthLabel(thread);
  resizeThreadTitle();
  elements.entryInput.value = "";
  elements.entryInput.placeholder = initialPrompt
    ? `Sprig suggests: ${initialPrompt}`
    : "Let the thought arrive as it is…";
  elements.tagEditor.hidden = true;
  elements.threadActions.hidden = thread.status !== "active";
  elements.entryForm.hidden = thread.status !== "active";
  renderEntries(thread);
  renderTags(thread);
  elements.threadDialog.showModal();
  window.setTimeout(() => {
    (initialPrompt || thread.entries.length
      ? elements.entryInput
      : elements.threadTitle
    ).focus();
  }, 100);
}

function resizeThreadTitle() {
  elements.threadTitle.style.height = "auto";
  elements.threadTitle.style.height = `${elements.threadTitle.scrollHeight}px`;
}

function renderEntries(thread) {
  elements.entryStream.replaceChildren();
  if (thread.entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-thread";
    empty.textContent =
      "This patch of soil is ready. Your first note will plant the seed.";
    elements.entryStream.append(empty);
    return;
  }

  for (const entry of thread.entries) {
    const article = document.createElement("article");
    article.className = "entry";
    const time = document.createElement("time");
    time.dateTime = entry.createdAt;
    time.textContent = formatDate(entry.createdAt, true);
    const body = document.createElement("p");
    body.textContent = entry.body;
    article.append(time, body);
    elements.entryStream.append(article);
  }
}

function renderTags(thread) {
  elements.tagList.replaceChildren();
  for (const tag of thread.tags) {
    const item = document.createElement("span");
    item.className = `tag ${tag.source === "ai" ? "ai" : ""}`;
    item.append(document.createTextNode(tag.name));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${tag.name} tag`);
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      thread.tags = thread.tags.filter((candidate) => candidate.name !== tag.name);
      await saveState();
      renderTags(thread);
    });
    item.append(remove);
    elements.tagList.append(item);
  }
}

async function submitEntry(event) {
  event.preventDefault();
  const thread = threadById(openThreadId);
  const body = elements.entryInput.value.trim();
  if (!thread || !body) return;

  const now = new Date().toISOString();
  thread.entries.push({ id: uid("entry"), createdAt: now, body });
  thread.updatedAt = now;
  if (
    thread.title === "A new thought" &&
    body.length > 0
  ) {
    thread.title =
      body.split(/[.!?\n]/)[0].trim().slice(0, 55) || "A new thought";
    elements.threadTitle.value = thread.title;
  }

  elements.entryInput.value = "";
  elements.saveStatus.textContent = "Saved locally · noticing themes…";
  await saveState();
  renderEntries(thread);
  renderGarden();
  analyzeEntry(thread, body);
}

async function analyzeEntry(thread, body) {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: body,
        existingTags: thread.tags.map((tag) => tag.name),
      }),
    });
    if (!response.ok) throw new Error("Theme analysis unavailable");
    const data = await response.json();
    const existing = new Set(thread.tags.map((tag) => tag.name.toLowerCase()));
    for (const name of data.tags || []) {
      const clean = String(name).trim().slice(0, 30);
      if (clean && !existing.has(clean.toLowerCase())) {
        thread.tags.push({ name: clean, source: "ai" });
        existing.add(clean.toLowerCase());
      }
    }
    await saveState();
    if (openThreadId === thread.id) renderTags(thread);
    elements.saveStatus.textContent = "Saved locally · themes updated";
  } catch {
    elements.saveStatus.textContent = "Saved locally · theme check skipped";
  }
}

async function addTag() {
  const thread = threadById(openThreadId);
  const name = elements.tagInput.value.trim().slice(0, 30);
  if (!thread || !name) return;
  if (!thread.tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
    thread.tags.push({ name, source: "user" });
    await saveState();
    renderTags(thread);
  }
  elements.tagInput.value = "";
  elements.tagInput.focus();
}

async function updateThreadTitle() {
  const thread = threadById(openThreadId);
  if (!thread) return;
  thread.title = elements.threadTitle.value.trim() || "A new thought";
  thread.updatedAt = new Date().toISOString();
  await saveState();
  renderGarden();
}

async function harvestThread() {
  const thread = threadById(openThreadId);
  if (!thread) return;
  thread.status = "harvested";
  thread.updatedAt = new Date().toISOString();
  await saveState();
  elements.threadDialog.close();
  renderGarden();
  showToast("Thread harvested. It remains part of this garden.");
}

async function removeThread() {
  const thread = threadById(openThreadId);
  if (!thread) return;
  const confirmed = window.confirm(
    "Dig up this plant? The thread will be removed from the garden.",
  );
  if (!confirmed) return;
  thread.status = "removed";
  thread.updatedAt = new Date().toISOString();
  await saveState();
  elements.threadDialog.close();
  renderGarden();
  showToast("The plot is open again.");
}

function collectGardenThemes(gardenId) {
  const counts = new Map();
  state.threads
    .filter((thread) => thread.gardenId === gardenId && thread.status !== "removed")
    .flatMap((thread) => thread.tags)
    .forEach((tag) => {
      const key = tag.name.toLowerCase();
      counts.set(key, { name: tag.name, count: (counts.get(key)?.count || 0) + 1 });
    });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => item.name);
}

function renderRings() {
  const archived = state.gardens
    .filter((garden) => garden.archivedAt)
    .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  elements.ringsList.replaceChildren();

  if (archived.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-rings";
    empty.textContent =
      "Your first ring will appear when you choose to archive this garden.";
    elements.ringsList.append(empty);
    return;
  }

  for (const garden of archived) {
    const threads = state.threads.filter(
      (thread) => thread.gardenId === garden.id && thread.status !== "removed",
    );
    const themes = garden.themes || collectGardenThemes(garden.id);
    const details = document.createElement("details");
    details.className = "ring-entry";
    const summary = document.createElement("summary");
    summary.textContent = garden.name;
    const meta = document.createElement("div");
    meta.className = "ring-meta";
    meta.textContent =
      `${formatDate(garden.createdAt)} – ${formatDate(garden.archivedAt)} · ` +
      `${threads.length} ${threads.length === 1 ? "thread" : "threads"}`;
    const themeList = document.createElement("div");
    themeList.className = "ring-themes";
    if (themes.length) {
      for (const theme of themes) {
        const pill = document.createElement("span");
        pill.textContent = theme;
        themeList.append(pill);
      }
    } else {
      const pill = document.createElement("span");
      pill.textContent = "A quiet season";
      themeList.append(pill);
    }
    const threadList = document.createElement("div");
    threadList.className = "ring-threads";
    for (const thread of threads) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = thread.title;
      button.addEventListener("click", () => {
        elements.ringsDialog.close();
        openThread(thread.id);
      });
      threadList.append(button);
    }
    details.append(summary, meta, themeList, threadList);
    elements.ringsList.append(details);
  }
}

async function archiveGarden() {
  const garden = activeGarden();
  const now = new Date().toISOString();
  garden.archivedAt = now;
  garden.themes = collectGardenThemes(garden.id);

  const nextGarden = {
    id: uid("garden"),
    name: elements.nextGardenName.value.trim() || "A fresh garden",
    createdAt: now,
    archivedAt: null,
  };
  state.gardens.push(nextGarden);
  state.activeGardenId = nextGarden.id;
  await saveState();
  elements.archiveDialog.close();
  elements.nextGardenName.value = "A fresh garden";
  renderGarden();
  requestSuggestion();
  showToast("A new garden has begun. The last one is now a tree ring.");
}

function contextualFallback() {
  const threads = activeThreads();
  if (threads.length) {
    const oldest = [...threads].sort(
      (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt),
    )[0];
    return `Would you like to return to “${oldest.title}” and notice what has changed?`;
  }
  return genericPrompts[Math.floor(Math.random() * genericPrompts.length)];
}

async function requestSuggestion() {
  elements.speechCard.classList.remove("done");
  elements.birdMessage.textContent = "";
  typeSuggestion("Let me look around the garden…");

  const threads = activeThreads();
  const context = threads.slice(0, 8).map((thread) => ({
    title: thread.title,
    tags: thread.tags.map((tag) => tag.name),
    lastUpdated: thread.updatedAt,
  }));

  try {
    const response = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: context }),
    });
    if (!response.ok) throw new Error("Suggestion unavailable");
    const data = await response.json();
    typeSuggestion(data.suggestion || contextualFallback());
  } catch {
    typeSuggestion(contextualFallback());
  }
}

function typeSuggestion(text) {
  suggestionText = text;
  window.clearInterval(typeTimer);
  elements.speechCard.classList.remove("done");
  elements.birdMessage.textContent = "";
  let index = 0;
  typeTimer = window.setInterval(() => {
    index += 1;
    elements.birdMessage.textContent = text.slice(0, index);
    if (index >= text.length) {
      window.clearInterval(typeTimer);
      elements.speechCard.classList.add("done");
    }
  }, 14);
}

function useSuggestion() {
  const plotIndex = nextEmptyPlot();
  if (plotIndex === null) {
    showToast("Every plot is growing. Harvest a thread to open some space.");
    return;
  }
  plantThread(plotIndex, suggestionText);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(
    () => elements.toast.classList.remove("visible"),
    3500,
  );
}

function openTreeRings() {
  renderRings();
  elements.ringsDialog.showModal();
}

function bindEvents() {
  elements.entryForm.addEventListener("submit", submitEntry);
  elements.threadTitle.addEventListener("change", updateThreadTitle);
  elements.threadTitle.addEventListener("input", resizeThreadTitle);
  elements.tagsToggle.addEventListener("click", () => {
    elements.tagEditor.hidden = !elements.tagEditor.hidden;
  });
  elements.addTagButton.addEventListener("click", addTag);
  elements.tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    }
  });
  elements.harvestButton.addEventListener("click", harvestThread);
  elements.removeThreadButton.addEventListener("click", removeThread);
  elements.ringsButton.addEventListener("click", openTreeRings);
  elements.treeRingsTree.addEventListener("click", openTreeRings);
  elements.archiveButton.addEventListener("click", () => {
    elements.archiveDialog.showModal();
  });
  elements.cancelArchiveButton.addEventListener("click", () =>
    elements.archiveDialog.close(),
  );
  elements.confirmArchiveButton.addEventListener("click", archiveGarden);
  elements.birdButton.addEventListener("click", requestSuggestion);
  elements.usePromptButton.addEventListener("click", useSuggestion);
  elements.threadListButton.addEventListener("click", () => {
    renderThreadList();
    elements.threadListDialog.showModal();
  });
}

async function initialize() {
  try {
    db = await openDatabase();
    const storedState = await readState();
    state = normalizeState(storedState);
    const verificationFixtureRemoved = removeVerificationFixture(state);
    if (!storedState || stateNormalizationChanged || verificationFixtureRemoved) {
      await saveState();
    }
    bindEvents();
    renderGarden();
    requestSuggestion();

    if (
      !window.Capacitor?.isNativePlatform?.() &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  } catch (error) {
    console.error(error);
    document.body.innerHTML =
      "<main style='padding:3rem;font-family:system-ui'><h1>Memory Garden could not open its local storage.</h1><p>Please allow site storage and refresh.</p></main>";
  }
}

initialize();
