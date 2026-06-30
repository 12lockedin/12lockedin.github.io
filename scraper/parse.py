"""
HTML parsers for the institutional timetable system.

This module turns the raw HTML of three kinds of pages into plain Python
dictionaries:

  * the catalogue index pages (list of study programmes),
  * a programme page (list of subjects of a degree / master),
  * a subject page (the weekly timetable, one cell per teaching session).

The timetable is an HTML ``<table>`` where every column is a weekday and every
row is a 15-minute slot. A session is a ``<td class="celdaConSesion">`` that
spans several rows (``rowspan``). To know *which weekday* a cell belongs to we
have to resolve the rowspans exactly like a browser does, because cells from
previous rows keep occupying their column further down the table.

The parsers are deliberately tolerant: the source markup is old and slightly
malformed in places, so we lean on class names and regular expressions rather
than on a strict structure.
"""

from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

# --- Weekday model ----------------------------------------------------------
# Column 0 of a timetable row is the hour label; columns 1..6 are the weekdays.
# We expose weekdays 0-indexed from Monday.
WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
# Map a header label (accent-stripped, lowercased) to a weekday index. Using the
# label rather than column order is robust to leading gutter cells.
DAY_NAMES = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5}

_TIME_RE = re.compile(r"(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})")
_GROUP_RE = re.compile(r"grp\.\s*([0-9A-Za-zÁÉÍÓÚáéíóúÑñ]+)", re.IGNORECASE)
_CODE_NAME_RE = re.compile(r"(\d{3,6})\s*-\s*(.+?)\s*(?:,\s*grp|$)")
# Subject type encoded in the cell CSS class (Troncal/Obligatoria/Básica/oPtativa/...).
_TYPE_BY_CLASS = {
    "tipoAsignaturaT": "Troncal",
    "tipoAsignaturaO": "Obligatoria",
    "tipoAsignaturaB": "Básica",
    "tipoAsignaturaP": "Optativa",
    "tipoAsignaturaR": "Complemento de formación",
    "masterOficial": "Máster oficial",
}


def _norm_time(t: str) -> str:
    """Zero-pad an ``H:MM`` / ``HH:MM`` string to ``HH:MM``."""
    h, m = t.split(":")
    return f"{int(h):02d}:{m}"


def _intattr(cell, name: str) -> int:
    try:
        return max(1, int(cell.get(name, 1) or 1))
    except (ValueError, TypeError):
        return 1


def _strip_accents(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _build_col_to_day(header_row) -> dict[int, int]:
    """Map each table column index to a weekday, honouring header ``colspan``.

    A day header may span several columns when that day hosts parallel groups at
    the same time, so the naive "one column per day" assumption is wrong.
    """
    mapping: dict[int, int] = {}
    col = 0
    for cell in header_row.find_all(["th", "td"], recursive=False):
        span = _intattr(cell, "colspan")
        if "cabeceraDia" in (cell.get("class") or []):
            day = DAY_NAMES.get(_strip_accents(_clean(cell.get_text())).lower())
            if day is not None:
                for c in range(col, col + span):
                    mapping[c] = day
        col += span
    return mapping


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _unmangle_href(href: str) -> str:
    """Repair query strings broken by HTML entity decoding.

    The source uses bare ``&`` in URLs, so ``&centro=`` is decoded as the cent
    sign (``&cent`` is a valid entity) and becomes ``¢ro=``. We turn that back
    into ``centro=`` so the parameters can be read.
    """
    return (href or "").replace("¢", "&cent")


def _soup(html: str) -> BeautifulSoup:
    """Build a tolerant soup from the source markup.

    The pages contain malformed comment terminators (``--!>`` instead of
    ``-->``). Python's strict HTML parser would treat everything up to the next
    valid ``-->`` as a single comment, swallowing whole tables. Normalising the
    terminator first keeps the document intact.
    """
    return BeautifulSoup(html.replace("--!>", "-->"), "html.parser")


# --- Subject timetable ------------------------------------------------------
def parse_timetable(html: str) -> list[dict]:
    """Return the list of teaching sessions found in a subject page.

    Each session is a dict::

        {
          "code": "14283", "name": "AMPLIAC DE DISEÑO Y ENSAYO MÁQUINAS",
          "group": "1", "type": "Máster oficial",
          "day": 4, "start": "09:00", "end": "10:30",
          "slots": [{"dates": "11.sep-02.oct", "room": "Aula 4.0.E04"}, ...]
        }
    """
    soup = _soup(html)
    table = soup.find("table", class_="timetable")
    if table is None:
        return []

    rows = table.find_all("tr")
    header = next((tr for tr in rows if tr.find("th", class_="cabeceraDia")), None)
    col_to_day = _build_col_to_day(header) if header else {}

    sessions: list[dict] = []
    occ: dict[int, int] = {}  # column -> rows still occupied by a cell from above

    for tr in rows:
        if tr is header:
            continue
        cells = tr.find_all(["th", "td"], recursive=False)
        if not cells:
            continue
        # Carried-over columns age by one row; freshly placed cells overwrite below.
        new_occ = {col: rows_left - 1 for col, rows_left in occ.items()}
        col = 0
        for cell in cells:
            while occ.get(col, 0) > 0:  # skip columns blocked by a rowspan above
                col += 1
            classes = cell.get("class") or []
            colspan = _intattr(cell, "colspan")
            rowspan = _intattr(cell, "rowspan")
            if "celdaConSesion" in classes:
                day = col_to_day.get(col)
                if day is not None:
                    session = _parse_session_cell(cell, day=day, classes=classes)
                    if session is not None:
                        sessions.append(session)
            if rowspan > 1:
                for c in range(col, col + colspan):
                    new_occ[c] = rowspan - 1
            col += colspan
        occ = {c: r for c, r in new_occ.items() if r > 0}

    return sessions


def _parse_session_cell(cell, day: int, classes: list[str]) -> Optional[dict]:
    if day < 0 or day >= len(WEEKDAYS):
        return None

    grp_div = cell.find("div", class_="asignaturaGrupo")
    header = _clean(grp_div.get_text(" ", strip=True)) if grp_div else _clean(
        cell.get_text(" ", strip=True)
    )

    code = name = None
    cn = _CODE_NAME_RE.search(header)
    if cn:
        code = cn.group(1)
        name = _clean(cn.group(2))

    gm = _GROUP_RE.search(header)
    group = gm.group(1) if gm else "1"

    full_text = cell.get_text(" ", strip=True)
    tm = _TIME_RE.search(full_text)
    if not tm:
        return None  # examen / reserva without an explicit time range -> skip
    start, end = _norm_time(tm.group(1)), _norm_time(tm.group(2))

    slots: list[dict] = []
    fechas_div = cell.find("div", class_="fechasSesion")
    if fechas_div:
        fechas = fechas_div.find_all("span", class_="fechas")
        aulas = fechas_div.find_all("span", class_="aulas")
        for i, f in enumerate(fechas):
            room = _clean(aulas[i].get_text(strip=True)) if i < len(aulas) else ""
            slots.append({"dates": _clean(f.get_text(strip=True)).rstrip(":"), "room": room})

    stype = next((_TYPE_BY_CLASS[c] for c in classes if c in _TYPE_BY_CLASS), None)
    rooms = [s["room"] for s in slots if s["room"]]

    return {
        "code": code,
        "name": name,
        "group": group,
        "type": stype,
        "day": day,
        "start": start,
        "end": end,
        "room": rooms[0] if rooms else "",
        "slots": slots,
    }


def group_sessions(sessions: list[dict]) -> list[dict]:
    """Collapse a flat session list into ``[{id, sessions:[...]}, ...]`` by group."""
    by_group: dict[str, list[dict]] = {}
    for s in sessions:
        by_group.setdefault(s["group"], []).append(
            {
                "day": s["day"],
                "start": s["start"],
                "end": s["end"],
                "room": s["room"],
                "type": s["type"],
                "slots": s["slots"],
            }
        )
    groups = []
    for gid, items in by_group.items():
        items.sort(key=lambda x: (x["day"], x["start"]))
        groups.append({"id": gid, "sessions": items})
    groups.sort(key=lambda g: (_group_sort_key(g["id"])))
    return groups


def _group_sort_key(gid: str):
    return (0, int(gid)) if gid.isdigit() else (1, gid)


# --- Programme page (list of subjects) --------------------------------------
def parse_programme(html: str) -> dict:
    """Return ``{"name": <programme name>, "subjects": [...]}`` for a plan page.

    Every subject is ``{code, name, course, term}`` where ``term`` is the
    semester taken from the ``valorPer`` query parameter of its link.
    """
    soup = _soup(html)

    name = ""
    app_name = soup.find(id="nombreApp")
    if app_name:
        txt = _clean(app_name.get_text(" ", strip=True))
        name = re.sub(r"^.*?Horarios de\s*", "", txt).strip()

    subjects: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for div in soup.find_all("div", class_="asignatura"):
        text = _clean(div.get_text(" ", strip=True)).lstrip("► ").strip()
        m = re.match(r"(\d{3,6})\s*-\s*(.+?)\s*,\s*curso\s*(\d+)", text)
        if not m:
            m2 = re.match(r"(\d{3,6})\s*-\s*(.+)", text)
            if not m2:
                continue
            code, sname, course = m2.group(1), _clean(m2.group(2)), None
        else:
            code, sname, course = m.group(1), _clean(m.group(2)), int(m.group(3))

        term = None
        link = div.find_next("a", class_="enlaceCuatr")
        if link and link.get("href"):
            tm = re.search(r"asignatura=(\d+).*?valorPer=(\d+)", link["href"])
            if tm:
                if tm.group(1) != code:
                    continue  # link belongs to another subject; skip mismatched pairing
                term = int(tm.group(2))
        key = (code, str(term))
        if key in seen:
            continue
        seen.add(key)
        subjects.append({"code": code, "name": sname, "course": course, "term": term})
    return {"name": name, "subjects": subjects}


# --- Programme page: enrolment groups (grados) ------------------------------
def parse_matricula_groups(html: str) -> list[dict]:
    """For a grado plan page, list its enrolment-group timetables.

    Grado pages don't expose a per-subject list; they are organised by
    *grupo de matrícula* (course + group), each linking to a full weekly
    timetable. Returns ``[{course, group, term}, ...]`` deduplicated.
    """
    soup = _soup(html)
    out: list[dict] = []
    seen: set[tuple[int, str, int]] = set()
    for a in soup.find_all("a", href=True):
        href = _unmangle_href(a["href"])
        if "porCentroPlanCursoGrupo" not in href:
            continue
        m = re.search(r"curso=(\d+).*?grupo=([0-9A-Za-z]+).*?valorPer=(\d+)", href)
        if not m:
            continue
        course, group, term = int(m.group(1)), m.group(2), int(m.group(3))
        key = (course, group, term)
        if key in seen:
            continue
        seen.add(key)
        out.append({"course": course, "group": group, "term": term})
    return out


# --- Catalogue index (list of programmes) -----------------------------------
def parse_catalog_index(html: str, kind: str) -> list[dict]:
    """Parse ``principal.page`` (grados) or ``postgrado.page`` (masters).

    Returns ``[{type, plan, centro, name, campus}, ...]`` — one entry per
    programme *and* campus, since the same plan may be taught in several.
    """
    soup = _soup(html)
    out: list[dict] = []
    for li in soup.find_all("li", class_="plan"):
        links = [a for a in li.find_all("a", href=True) if re.search(r"plan=\d+", a["href"])]
        if not links:
            continue
        # Programme name = li text minus the campus labels and the "(plan NNN)" hint.
        raw = li.get_text(" ", strip=True)
        for a in links:
            raw = raw.replace(a.get_text(strip=True), " ")
        name = _clean(re.sub(r"\(?\s*[Pp]lan[: ]\s*\d+\s*\)?", "", raw))
        for a in links:
            mm = re.search(r"plan=(\d+).*?centro=(\d+)", _unmangle_href(a["href"]))
            if not mm:
                continue
            out.append(
                {
                    "type": kind,
                    "plan": int(mm.group(1)),
                    "centro": int(mm.group(2)),
                    "name": name,
                    "campus": _clean(a.get_text(strip=True)),
                }
            )
    return out
