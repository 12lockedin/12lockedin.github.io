// In-memory app state + per-programme persistence in localStorage.

const PREFIX = "cuaderno:v1:";

export const store = {
  catalog: null,        // { programmes: [...] }
  availability: new Set(),
  programme: null,      // { plan, centro, type, name, campus }
  plan: null,           // full plan JSON { subjects: [...] }
  selection: {},        // { [subjectCode]: { groupId } }
  active: null,         // subject code currently being edited in the planner
  view: "catalog",
};

const keyFor = (p) => `${PREFIX}${p.plan}-${p.centro}`;

/** Load a previously saved subject selection for the active programme. */
export function loadSelection() {
  if (!store.programme) return {};
  try {
    const raw = localStorage.getItem(keyFor(store.programme));
    return raw ? JSON.parse(raw).selection || {} : {};
  } catch {
    return {};
  }
}

export function saveSelection() {
  if (!store.programme) return;
  try {
    localStorage.setItem(
      keyFor(store.programme),
      JSON.stringify({ selection: store.selection, savedAt: new Date().toISOString() })
    );
  } catch {
    /* storage may be full or blocked; selections simply won't persist */
  }
}

/** Remember the last programme so we can offer to resume on next visit. */
export function rememberProgramme() {
  try {
    localStorage.setItem(PREFIX + "last", JSON.stringify(store.programme));
  } catch {}
}

export function recallProgramme() {
  try {
    const raw = localStorage.getItem(PREFIX + "last");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Find a subject by code in the loaded plan. */
export const subjectByCode = (code) =>
  store.plan?.subjects.find((s) => s.code === code) || null;

/** The group object currently chosen for a subject (falls back to the first). */
export function chosenGroup(subject) {
  if (!subject || !subject.groups.length) return null;
  const id = store.selection[subject.code]?.groupId;
  return subject.groups.find((g) => g.id === id) || subject.groups[0];
}
