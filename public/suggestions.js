const writingPrompts = [
  "What gave you a little energy today?",
  "What would you like to remember about today?",
  "What small thing are you curious about right now?",
  "What have you been making, learning, or practicing lately?",
  "What is something you want to try, without needing to be good at it?",
  "Who made your day a little easier? What did they do?",
  "What conversation has stayed with you, and why?",
  "Where do you feel most like yourself lately?",
  "What did you notice outside today that you might usually miss?",
  "What song, book, game, or artwork has stayed with you recently?",
  "What small detail made you smile today?",
  "What is taking more energy than you expected?",
  "What would make tomorrow a little gentler?",
  "What are you looking forward to, even in a small way?",
  "What have you changed your mind about recently?",
  "What question would you like to leave open for a while?",
  "What is one thing you are quietly proud of?",
  "What would you like to make more room for this week?",
  "What routine is helping you, and which one might need a change?",
  "What does rest look like for you right now?",
  "What is something you miss, and what do you miss about it?",
  "What would you tell yourself at the beginning of this month?",
  "What small step would help with a project you care about?",
  "What surprised you about yourself today?",
];

// Build an ephemeral map from explicit topics, not inferred personality traits.
function journalContext(state) {
  const visible = state.threads.filter((thread) => thread.status !== "removed" && thread.entries.length);
  const recent = (threads) => [...threads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const active = recent(visible.filter((thread) => thread.gardenId === state.activeGardenId)).slice(0, 7);
  const past = recent(visible.filter((thread) => thread.gardenId !== state.activeGardenId)).slice(0, 3);
  const topics = new Map();
  for (const thread of [...active, ...past]) {
    for (const tag of thread.tags) {
      const name = tag.name.trim().slice(0, 30);
      if (name) topics.set(name, (topics.get(name) || 0) + (thread.gardenId === state.activeGardenId ? 3 : 1));
    }
  }
  return {
    topics: [...topics].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name]) => name),
    threads: [...active, ...past].map((thread) => ({
      title: thread.title.slice(0, 80),
      tags: thread.tags.slice(0, 6).map((tag) => tag.name.slice(0, 30)),
      previousSeason: thread.gardenId !== state.activeGardenId,
      excerpts: thread.entries.slice(-2).map((entry) => entry.body.slice(0, 350)),
    })),
  };
}

// Local rules use dates and entry counts only; they never infer feelings from writing.
function gardenSuggestions(state, now = Date.now()) {
  const day = 86400000;
  const age = (date) => Math.max(0, Math.floor((now - Date.parse(date)) / day));
  const garden = state.gardens.find((item) => item.id === state.activeGardenId);
  const threads = state.threads.filter((item) => item.gardenId === garden.id && item.status === "active");
  const written = threads.filter((item) => item.entries.length);
  const allWritten = state.threads.filter((item) => item.gardenId === garden.id && item.status !== "removed" && item.entries.length);
  const suggestions = [];
  const add = (kind, text, label, threadId = null) => suggestions.push({ kind, text, label, threadId });
  if (allWritten.length && age(garden.createdAt) >= 90) {
    add("season", "This garden has held a whole season of thoughts. Would you like to preserve it as a tree ring and begin again?", "Review this season");
  }
  for (const thread of [...written].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))) {
    const days = age(thread.entries.at(-1).createdAt);
    if (days >= 7) {
      add("revisit", `It has been ${days} days since you tended “${thread.title}”. What has changed, or stayed with you?`, "Revisit this thought", thread.id);
    }
    if ((thread.entries.length >= 4 && days >= 3) || days >= 30) {
      add("harvest", `Does “${thread.title}” still have room to grow, or feel ready to harvest? You can keep its memories either way.`, "Review this plant", thread.id);
    }
  }
  if (threads.length >= 7 && written.length) {
    add("harvest", "Every bed is planted. Is there a thought you feel ready to harvest, making space for something new?", "Review this plant", written[0].id);
  }
  const unfinished = threads.find((item) => !item.entries.length);
  if (unfinished) add("revisit", "There is a planted thought waiting for its first note. What would you like to give it?", "Write its first note", unfinished.id);
  if (!threads.length && allWritten.length) {
    add("season", "Your plants have been harvested. Would you like to gather this garden into a tree ring and start a fresh season?", "Review this season");
  }
  // Keep offering fresh questions even when all beds are occupied.
  for (const text of writingPrompts) add("plant", text, "Write about this");
  if (!suggestions.length) add("revisit", "What feels different since your last note?", "Tend this thought", threads[0].id);
  return suggestions;
}

if (typeof module !== "undefined") module.exports = { gardenSuggestions, journalContext, writingPrompts };
