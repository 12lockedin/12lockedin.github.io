// In-memory app state + per-programme persistence in localStorage.

const PREFIX = "cuaderno:v1:";

export const store = {
  catalog: null,        // { programmes: [...] }
  availability: new Set(),
  programme: null,      // { plan, centro, type, name, campus }
  plan: null,           // full plan JSON { subjects: [...] }
  selection: {},        // { [subjectCode]: { groupId?, reducedId? } }
  active: null,         // subject code currently being edited in the planner
  activeDim: null,      // "main" | "reduced" | null — dimension being swapped
  view: "uni",
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

/**
 * Split a subject's groups into the two enrolment dimensions. Masters (and
 * grado subjects taught in a single dimension) have everything under `mag`,
 * so the planner degrades to the classic one-group-per-subject behaviour.
 */
export function groupsByKind(subject) {
  const mag = subject.groups.filter((g) => g.kind !== "reducido");
  const red = subject.groups.filter((g) => g.kind === "reducido");
  // A subject taught only in reduced groups is single-dimension too.
  return mag.length ? { mag, red } : { mag: red, red: [] };
}

/** The group chosen for one dimension (falls back to the first; null if opted out). */
function pick(groups, id) {
  if (!groups.length) return null;
  if (id === "") return null; // explicit "sin reducido"
  return groups.find((g) => g.id === id) || groups[0];
}

/** The 1–2 group objects currently chosen for a subject. */
export function chosenGroups(subject) {
  if (!subject || !subject.groups.length) return [];
  const { mag, red } = groupsByKind(subject);
  const sel = store.selection[subject.code] || {};
  return [pick(mag, sel.groupId), red.length ? pick(red, sel.reducedId) : null].filter(Boolean);
}

/** Default selection for a subject: first group of each dimension. */
export function defaultSelection(subject) {
  const { mag, red } = groupsByKind(subject);
  const sel = { groupId: mag[0].id };
  if (red.length) sel.reducedId = red[0].id;
  return sel;
}
