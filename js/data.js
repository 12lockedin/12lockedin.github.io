// Loading of the static JSON the harvester produces. All requests are
// same-origin GETs, so the app must be served over http(s) — opening
// index.html via file:// will fail here (handled with a friendly message).

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-cache" });
  } catch (err) {
    const e = new Error("network");
    e.code = url.startsWith("file:") || location.protocol === "file:" ? "file" : "network";
    throw e;
  }
  if (res.status === 404) {
    const e = new Error("not-found");
    e.code = "not-found";
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export const loadCatalog = () => getJSON("data/catalog.json");

/** Set of "plan-centro" keys that have been harvested (for availability hints). */
export async function loadAvailability() {
  try {
    const idx = await getJSON("data/plans/index.json");
    return new Set(idx.plans || []);
  } catch {
    return new Set(); // index is optional; absence just means "unknown"
  }
}

export const loadPlan = (plan, centro) => getJSON(`data/plans/${plan}-${centro}.json`);
