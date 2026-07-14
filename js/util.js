// Small shared helpers: DOM, time math, colours, text, feedback.

/** Create an element with attributes/dataset/children in one call. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style") node.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);

/** "HH:MM" -> minutes since midnight. */
export const timeToMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Two sessions overlap if they share a day and their time ranges intersect. */
export function sessionsOverlap(a, b) {
  if (a.day !== b.day) return false;
  return timeToMin(a.start) < timeToMin(b.end) && timeToMin(b.start) < timeToMin(a.end);
}

// 12 botanical pigments (see tokens.css). Assigned to subjects by order.
export const PIGMENTS = Array.from({ length: 12 }, (_, i) => `var(--pig-${i + 1})`);
export const colorForIndex = (i) => PIGMENTS[i % PIGMENTS.length];

/** Lowercase + strip diacritics, for accent-insensitive search. */
export const normalize = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function debounce(fn, ms = 160) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer;
export function toast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-shown"), 2200);
}

/** Ordinal-ish label for a course number. */
export const courseLabel = (n) => (n ? `${n}º curso` : "");
export const termLabel = (t) => (t === 1 ? "1er cuat." : t === 2 ? "2º cuat." : "");
