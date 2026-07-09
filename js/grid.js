// Renders the weekly timetable board from a prepared view-model.
import { el, timeToMin } from "./util.js";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const HOUR_PX = 56;

const pct = (min, startMin, range) => ((min - startMin) / range) * 100;

/**
 * @param model { days:[0,1,..], startHour, endHour, placed:[], ghosts:[], active }
 * @param handlers { onBlockClick(code), onGhostClick(code, groupId), onBackground() }
 */
export function renderBoard(board, model, handlers) {
  const { days, startHour, endHour, placed, ghosts } = model;
  const startMin = startHour * 60;
  const range = (endHour - startHour) * 60;

  board.replaceChildren();
  const tt = el("div", {
    class: "tt",
    style: `--days:${days.length}; --grid-h:${(endHour - startHour) * HOUR_PX}px; --hour:${HOUR_PX}px;`,
  });
  tt.addEventListener("click", (e) => {
    if (e.target === tt || e.target.classList.contains("tt__col") || e.target.classList.contains("tt__gutter")) {
      handlers.onBackground();
    }
  });

  // Header row
  tt.append(el("div", { class: "tt__corner mono", style: "font-size:var(--fs-xs);color:var(--ink-faint)" }, "h"));
  for (const d of days) tt.append(el("div", { class: "tt__dayhead" }, WEEKDAYS[d]));

  // Hour gutter
  const gutter = el("div", { class: "tt__gutter" });
  for (let h = startHour; h <= endHour; h++) {
    // Keep the first/last labels fully on-canvas instead of bleeding past the edge.
    const shift = h === startHour ? "0" : h === endHour ? "-100%" : "-50%";
    gutter.append(
      el(
        "div",
        { class: "tt__hourlabel", style: `top:${pct(h * 60, startMin, range)}%; transform:translateY(${shift})` },
        `${String(h).padStart(2, "0")}:00`
      )
    );
  }
  tt.append(gutter);

  // Day columns
  for (const d of days) {
    const col = el("div", { class: "tt__col", dataset: { day: d } });

    for (const s of placed.filter((p) => p.day === d)) {
      const cls = ["block"];
      if (s.conflict) cls.push("block--conflict");
      if (s.active) cls.push("is-active");
      if (s.dimmed) cls.push("is-dimmed");
      col.append(
        el(
          "div",
          {
            class: cls.join(" "),
            style: `top:${pct(timeToMin(s.start), startMin, range)}%; height:${pct(timeToMin(s.end), startMin, range) - pct(timeToMin(s.start), startMin, range)}%; --c:${s.color};`,
            title: `${s.name} · Grupo ${s.group}${s.kindLabel ? " (" + s.kindLabel + ")" : ""} · ${s.start}–${s.end}${s.room ? " · " + s.room : ""}`,
            onclick: (e) => { e.stopPropagation(); handlers.onBlockClick(s.code, s.dim); },
          },
          [
            el("div", { class: "block__name" }, s.name),
            el("div", { class: "block__meta" }, [
              el("span", { class: "block__grp" }, `Gr. ${s.group}`),
              `  ${s.start}–${s.end}`,
              s.room ? el("div", {}, s.room) : null,
            ]),
          ]
        )
      );
    }

    // Ghosts (alternative groups for the active subject), stacked if coincident.
    const dayGhosts = ghosts.filter((g) => g.day === d);
    dayGhosts.forEach((g, i) => {
      const coincident = dayGhosts.filter((o) => o.start === g.start);
      const idx = coincident.indexOf(g);
      const n = coincident.length;
      const leftPct = n > 1 ? 6 + idx * (84 / n) : 6;
      const widthPct = n > 1 ? 84 / n - 2 : 88;
      col.append(
        el(
          "div",
          {
            class: "ghost" + (g.clash ? " ghost--clash" : ""),
            style: `top:${pct(timeToMin(g.start), startMin, range)}%; height:${pct(timeToMin(g.end), startMin, range) - pct(timeToMin(g.start), startMin, range)}%; left:${leftPct}%; right:auto; width:${widthPct}%;`,
            title: `Cambiar a Grupo ${g.group}${g.english ? " (en inglés)" : ""}${g.clash ? " (se solaparía)" : ""}`,
            onclick: (e) => { e.stopPropagation(); handlers.onGhostClick(g.code, g.group, g.dim); },
          },
          [
            el("div", { class: "ghost__cta" }, "cambiar a"),
            el("div", { class: "ghost__grp" }, `Grupo ${g.group}${g.english ? " · EN" : ""}`),
            el("div", { class: "ghost__meta" }, `${g.start}–${g.end}`),
          ]
        )
      );
    });

    tt.append(col);
  }

  board.append(tt);
}
