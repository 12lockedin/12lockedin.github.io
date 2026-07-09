// Application controller: view routing, catalogue, subject picker, planner.
import { loadCatalog, loadAvailability, loadPlan } from "./data.js";
import {
  store, loadSelection, saveSelection, rememberProgramme,
  subjectByCode, groupsByKind, chosenGroups, defaultSelection,
} from "./store.js";
import { renderBoard } from "./grid.js";
import {
  el, qs, timeToMin, sessionsOverlap, colorForIndex,
  normalize, debounce, toast, termLabel, courseLabel,
} from "./util.js";

const VIEWS = ["catalog", "subjects", "planner"];
let catalogFilter = "all";

// --- View routing -----------------------------------------------------------
function show(view) {
  store.view = view;
  for (const v of VIEWS) qs(`#view-${v}`).classList.toggle("hidden", v !== view);
  const order = { catalog: 0, subjects: 1, planner: 2 };
  document.querySelectorAll(".step").forEach((s) => {
    const i = order[s.dataset.step];
    s.classList.toggle("is-active", s.dataset.step === view);
    s.classList.toggle("is-done", i < order[view]);
    s.classList.toggle("is-clickable", i < order[view]);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- 1 · Catalogue ----------------------------------------------------------
function renderCatalog() {
  const list = qs("#proglist");
  const term = normalize(qs("#catalogSearch").value);
  const items = store.catalog.programmes.filter((p) => {
    if (catalogFilter !== "all" && p.type !== catalogFilter) return false;
    if (term && !normalize(`${p.name} ${p.campus}`).includes(term)) return false;
    return true;
  });

  qs("#catalogCount").textContent = `${items.length} titulaciones`;
  qs("#catalogEmpty").classList.toggle("hidden", items.length > 0);

  list.replaceChildren(
    ...items.map((p) => {
      const available = !store.availability.size || store.availability.has(`${p.plan}-${p.centro}`);
      return el(
        "button",
        {
          class: "prog" + (available ? "" : " is-unavailable"),
          role: "listitem",
          onclick: () => selectProgramme(p),
        },
        [
          el("div", { class: "prog__top" }, [
            el("span", { class: `badge badge--${p.type}` }, p.type === "master" ? "Máster" : "Grado"),
            el("span", { class: "prog__name" }, p.name),
          ]),
          el("div", { class: "prog__meta" }, [
            el("span", {}, p.campus),
            el("span", {}, "·"),
            el("span", { class: "mono" }, `plan ${p.plan}`),
            available ? null : el("span", { class: "badge badge--soft" }, "sin datos aún"),
          ]),
        ]
      );
    })
  );
}

async function selectProgramme(p) {
  toast(`Cargando ${p.name}…`);
  try {
    const plan = await loadPlan(p.plan, p.centro);
    store.programme = p;
    store.plan = plan;
    store.selection = loadSelection();
    store.active = null;
    rememberProgramme();
    renderSubjects();
    show("subjects");
  } catch (err) {
    if (err.code === "not-found") {
      toast("Los horarios de esta titulación aún no están descargados.");
    } else if (err.code === "file") {
      alert(
        "La app necesita ejecutarse desde un servidor web local (no abriendo el archivo directamente).\n\n" +
        "Arráncalo con:\n    python -m http.server 8000\n\ny abre http://localhost:8000"
      );
    } else {
      toast("No se pudieron cargar los datos. Revisa la consola.");
      console.error(err);
    }
  }
}

// --- 2 · Subjects -----------------------------------------------------------
function renderSubjects() {
  qs("#subjectsTitle").textContent = store.programme.name;
  qs("#subjectsSubtitle").textContent =
    `${store.programme.campus} · Marca las asignaturas que vas a matricular.`;

  const container = qs("#subjects");
  const byTerm = new Map();
  for (const s of store.plan.subjects) {
    const key = s.term || 0;
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key).push(s);
  }

  const sections = [...byTerm.keys()].sort().map((termKey) => {
    const subjects = byTerm.get(termKey).slice().sort((a, b) => (a.course || 0) - (b.course || 0) || a.name.localeCompare(b.name));
    return el("div", { class: "termgroup" }, [
      el("div", { class: "termgroup__title" }, [
        el("h3", {}, termKey ? termLabel(termKey) : "Otras"),
        el("span", { class: "rule-leaf", style: "flex:1" }),
      ]),
      el("div", { class: "subjlist" }, subjects.map(renderSubjectCard)),
    ]);
  });
  container.replaceChildren(...sections);
  updateSubjectsInfo();
}

function renderSubjectCard(s) {
  const hasGroups = s.groups.length > 0;
  const on = !!store.selection[s.code];
  const card = el(
    "div",
    {
      class: "subj" + (on ? " is-on" : "") + (hasGroups ? "" : " is-disabled"),
      style: hasGroups ? "" : "opacity:.55;cursor:not-allowed",
      onclick: hasGroups ? () => toggleSubject(s) : null,
    },
    [
      el("div", { class: "subj__check" }, on ? "✓" : ""),
      el("div", {}, [
        el("div", { class: "subj__name" }, s.name),
        el("div", { class: "subj__meta" }, [
          courseLabel(s.course),
          s.course ? " · " : "",
          hasGroups
            ? groupCountLabel(s)
            : el("span", { class: "subj__no-groups" }, "sin grupos publicados"),
          ` · ${s.code}`,
        ]),
      ]),
    ]
  );
  return card;
}

function groupCountLabel(s) {
  const { mag, red } = groupsByKind(s);
  if (!red.length) return `${mag.length} grupo${mag.length > 1 ? "s" : ""}`;
  return `${mag.length} magistral${mag.length > 1 ? "es" : ""} · ${red.length} reducido${red.length > 1 ? "s" : ""}`;
}

function toggleSubject(s) {
  if (store.selection[s.code]) delete store.selection[s.code];
  else store.selection[s.code] = defaultSelection(s);
  saveSelection();
  renderSubjects();
}

function updateSubjectsInfo() {
  const n = Object.keys(store.selection).length;
  qs("#subjectsInfo").textContent =
    n === 0 ? "Ninguna asignatura elegida" : `${n} asignatura${n > 1 ? "s" : ""} elegida${n > 1 ? "s" : ""}`;
  qs("#toPlanner").disabled = n === 0;
}

// --- 3 · Planner ------------------------------------------------------------
function selectedSubjects() {
  return Object.keys(store.selection)
    .map(subjectByCode)
    .filter((s) => s && s.groups.length);
}

function buildModel() {
  const subjects = selectedSubjects();
  const colorMap = new Map(subjects.map((s, i) => [s.code, colorForIndex(i)]));

  const placed = [];
  for (const s of subjects) {
    const dual = groupsByKind(s).red.length > 0;
    for (const g of chosenGroups(s)) {
      const dim = g.kind === "reducido" && dual ? "reduced" : "main";
      for (const sess of g.sessions) {
        placed.push({
          code: s.code, name: s.name, color: colorMap.get(s.code),
          group: g.id, dim, kindLabel: dual ? (dim === "main" ? "magistral" : "reducido") : "",
          day: sess.day, start: sess.start, end: sess.end, room: sess.room,
          conflict: false,
        });
      }
    }
  }

  // Pairwise conflicts: different subjects, or a subject's own magistral vs
  // reducido (an overlapping pair means that combination is unattendable).
  const conflicts = new Set();
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      if ((placed[i].code !== placed[j].code || placed[i].dim !== placed[j].dim) &&
          sessionsOverlap(placed[i], placed[j])) {
        placed[i].conflict = placed[j].conflict = true;
        conflicts.add(placed[i].code);
        conflicts.add(placed[j].code);
      }

  // Active-subject ghosts: alternative groups, per dimension. Clicking a block
  // fixes the dimension (swap only magistrales, or only reducidos); activating
  // from the legend (activeDim = null) shows both.
  const ghosts = [];
  if (store.active) {
    const s = subjectByCode(store.active);
    const { mag, red } = groupsByKind(s);
    const chosen = chosenGroups(s);
    for (const p of placed) p.dimmed = p.code !== store.active;
    for (const p of placed) if (p.code === store.active) p.active = true;
    const dims = [];
    if (store.activeDim !== "reduced") dims.push({ dim: "main", groups: mag });
    if (store.activeDim !== "main" && red.length) dims.push({ dim: "reduced", groups: red });
    for (const { dim, groups } of dims) {
      // A ghost clashes with anything the swap would keep on the board.
      const obstacles = placed.filter((p) => p.code !== s.code || p.dim !== dim);
      for (const g of groups) {
        if (chosen.some((c) => c.id === g.id)) continue;
        for (const sess of g.sessions) {
          const clash = obstacles.some((o) => sessionsOverlap(o, sess));
          ghosts.push({
            code: s.code, group: g.id, dim, english: !!g.english,
            day: sess.day, start: sess.start, end: sess.end, room: sess.room, clash,
          });
        }
      }
    }
  }

  // Day & time bounds.
  const all = [...placed, ...ghosts];
  let maxDay = 4;
  for (const x of all) maxDay = Math.max(maxDay, x.day);
  const days = Array.from({ length: maxDay + 1 }, (_, i) => i);

  let startHour = 8, endHour = 15;
  if (all.length) {
    const mins = all.map((x) => timeToMin(x.start));
    const maxs = all.map((x) => timeToMin(x.end));
    startHour = Math.floor(Math.min(...mins) / 60);
    endHour = Math.ceil(Math.max(...maxs) / 60);
    if (endHour - startHour < 4) endHour = startHour + 4;
  }

  return { subjects, colorMap, placed, ghosts, days, startHour, endHour, conflicts };
}

function renderPlanner() {
  const model = buildModel();
  renderBoard(qs("#board"), model, {
    onBlockClick: (code, dim) => {
      const same = store.active === code && store.activeDim === dim;
      store.active = same ? null : code;
      store.activeDim = same ? null : dim;
      renderPlanner();
    },
    onGhostClick: (code, groupId, dim) => {
      store.selection[code][dim === "reduced" ? "reducedId" : "groupId"] = groupId;
      store.active = null;
      store.activeDim = null;
      saveSelection();
      renderPlanner();
      toast(`${subjectByCode(code).name}: Grupo ${groupId}`);
    },
    onBackground: () => { if (store.active) { store.active = null; store.activeDim = null; renderPlanner(); } },
  });
  renderSide(model);
}

function renderSide(model) {
  const { subjects, colorMap, placed, conflicts } = model;
  const hours = placed.reduce((a, p) => a + (timeToMin(p.end) - timeToMin(p.start)) / 60, 0);

  const stats = el("div", { class: "side__card" }, [
    el("div", { class: "side__title" }, "Resumen"),
    el("div", { class: "summary" }, [
      el("div", { class: "stat" }, [el("div", { class: "stat__n" }, String(subjects.length)), el("div", { class: "stat__l" }, "asignaturas")]),
      el("div", { class: "stat" }, [el("div", { class: "stat__n" }, hours.toFixed(1)), el("div", { class: "stat__l" }, "h / semana")]),
      el("div", { class: "stat" + (conflicts.size ? " is-warn" : "") }, [
        el("div", { class: "stat__n" }, String(conflicts.size)),
        el("div", { class: "stat__l" }, "con solape"),
      ]),
    ]),
  ]);

  const optionLabel = (gr, prefix) => `${prefix} ${gr.id}${gr.english ? " · EN" : ""}`;

  const legend = el("div", { class: "side__card" }, [
    el("div", { class: "side__title" }, "Asignaturas · grupo"),
    el(
      "div",
      { class: "legend" },
      subjects.map((s) => {
        const { mag, red } = groupsByKind(s);
        const dual = red.length > 0;
        const chosen = chosenGroups(s);
        const isActive = store.active === s.code;
        const conflicted = conflicts.has(s.code);

        const makeSelect = (groups, key, current, extraOption) =>
          el(
            "select",
            {
              class: "legend__select",
              onclick: (e) => e.stopPropagation(),
              onchange: (e) => {
                store.selection[s.code][key] = e.target.value;
                saveSelection();
                renderPlanner();
              },
            },
            [
              ...groups.map((gr) =>
                el("option", { value: gr.id, selected: gr.id === current },
                  optionLabel(gr, dual ? (key === "groupId" ? "Magistral" : "Reducido") : "Grupo"))
              ),
              extraOption,
            ]
          );

        const chosenMain = chosen.find((g) => mag.includes(g)) || null;
        const chosenRed = chosen.find((g) => red.includes(g)) || null;
        const selects = [makeSelect(mag, "groupId", chosenMain?.id)];
        if (dual)
          selects.push(makeSelect(red, "reducedId", chosenRed?.id,
            el("option", { value: "", selected: !chosenRed }, "— sin reducido —")));

        return el(
          "div",
          {
            class: "legend__item" + (isActive ? " is-active" : ""),
            onclick: () => {
              store.active = isActive ? null : s.code;
              store.activeDim = null;
              renderPlanner();
            },
          },
          [
            el("span", { class: "legend__sw", style: `--c:${colorMap.get(s.code)}` }),
            el("div", { class: "legend__name" }, [s.name, conflicted ? el("div", { class: "legend__warn" }, "⚠ se solapa") : null]),
            el("div", { class: "legend__selects" }, selects),
          ]
        );
      })
    ),
  ]);

  const anyDual = subjects.some((s) => groupsByKind(s).red.length > 0);
  const help = el("div", { class: "side__card faint", style: "font-size:var(--fs-xs)" }, [
    el("span", { class: "hand", style: "font-size:1.1rem;color:var(--sage)" }, "consejo · "),
    "pincha un bloque del horario para ver a qué otros grupos puedes cambiarlo sin tocar el resto.",
    anyDual
      ? el("div", { style: "margin-top:.4em" },
          "Aquí cada asignatura combina un grupo magistral y uno reducido: cámbialos por separado. Si tu pareja magistral+reducido no es válida, el solape en rojo te avisará.")
      : null,
  ]);

  qs("#side").replaceChildren(stats, legend, help);
}

// --- Bootstrap --------------------------------------------------------------
function wireStaticEvents() {
  qs("#catalogSearch").addEventListener("input", debounce(renderCatalog, 120));
  qs("#catalogFilters").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    catalogFilter = btn.dataset.kind;
    document.querySelectorAll("#catalogFilters .chip").forEach((c) => c.classList.toggle("is-on", c === btn));
    renderCatalog();
  });

  qs("#backToCatalog").addEventListener("click", () => show("catalog"));
  qs("#backToSubjects").addEventListener("click", () => { store.active = null; renderSubjects(); show("subjects"); });
  qs("#toPlanner").addEventListener("click", () => {
    // Normalise selection so every subject has a valid group per dimension.
    for (const code of Object.keys(store.selection)) {
      const s = subjectByCode(code);
      if (!s || !s.groups.length) { delete store.selection[code]; continue; }
      const sel = store.selection[code];
      const { mag, red } = groupsByKind(s);
      if (!mag.some((g) => g.id === sel.groupId)) sel.groupId = mag[0].id;
      if (!red.length) delete sel.reducedId;
      else if (sel.reducedId !== "" && !red.some((g) => g.id === sel.reducedId))
        sel.reducedId = red[0].id;
    }
    saveSelection();
    store.active = null;
    store.activeDim = null;
    renderPlanner();
    show("planner");
  });

  qs("#brandHome").addEventListener("click", (e) => { e.preventDefault(); show("catalog"); });
  qs("#stepper").addEventListener("click", (e) => {
    const step = e.target.closest(".step");
    if (!step || !step.classList.contains("is-clickable")) return;
    const target = step.dataset.step;
    if (target === "subjects" && store.plan) { renderSubjects(); show("subjects"); }
    else if (target === "catalog") show("catalog");
  });
}

async function init() {
  wireStaticEvents();
  try {
    const [catalog, availability] = await Promise.all([loadCatalog(), loadAvailability()]);
    store.catalog = catalog;
    store.availability = availability;
    renderCatalog();
  } catch (err) {
    const list = qs("#proglist");
    if (err.code === "file") {
      list.replaceChildren(el("div", { class: "empty" }, [
        el("h3", {}, "Sírvelo desde un servidor local"),
        el("p", { class: "muted" }, "Abre una terminal en la carpeta del proyecto y ejecuta:"),
        el("p", { class: "mono", style: "background:var(--paper-3);padding:.6rem;border-radius:8px" }, "python -m http.server 8000"),
        el("p", { class: "muted" }, "Luego visita http://localhost:8000"),
      ]));
    } else {
      list.replaceChildren(el("div", { class: "empty" }, "No se pudo cargar el catálogo de titulaciones."));
      console.error(err);
    }
  }
}

init();
