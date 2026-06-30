#!/usr/bin/env python3
"""
Data harvester for the schedule planner.

It downloads the public timetable pages of the institutional schedule system
and writes static JSON files that the web app consumes directly. There is no
live network access from the browser (cross-origin requests are blocked), so
this script is the bridge: run it offline / in CI, commit the JSON, ship it.

Usage
-----
    python scrape.py catalog
        Rebuild ``data/catalog.json`` (every degree and master + campus).

    python scrape.py plan <plan> <centro> [--kind grado|master]
        Scrape one programme into ``data/plans/<plan>-<centro>.json``.

    python scrape.py all [--only grado|master] [--limit N]
        Rebuild the catalogue, then scrape every programme in it.

Politeness: a short delay is inserted between requests and failures are
retried with backoff, so a full run is slow on purpose.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
import time
from pathlib import Path

import requests

import parse as P

# --- Configuration ----------------------------------------------------------
HOST = os.environ.get("HORARIOS_HOST", "https://aplicaciones.uc3m.es")
BASE = f"{HOST}/horarios-web/publicacion"
YEAR = os.environ.get("HORARIOS_YEAR", "2026")
REQUEST_DELAY = float(os.environ.get("HORARIOS_DELAY", "0.4"))  # seconds between hits
TIMEOUT = 40
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PLANS_DIR = DATA / "plans"

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT})


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(url: str, retries: int = 3) -> str:
    """GET a URL as decoded text, with retries and a courtesy delay."""
    last = None
    for attempt in range(retries):
        try:
            resp = _session.get(url, timeout=TIMEOUT)
            resp.raise_for_status()
            # The pages declare utf-8 in their meta tag but send a misleading
            # latin-1 Content-Type header; forcing utf-8 avoids mojibake (e.g.
            # "Administración" → "AdministraciÃ³n"). Chardet guesses unreliably here.
            resp.encoding = "utf-8"
            time.sleep(REQUEST_DELAY)
            return resp.text
        except requests.RequestException as exc:  # network / HTTP error
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def _rebuild_plans_index() -> None:
    """List every harvested ``<plan>-<centro>.json`` so the app knows what exists."""
    keys = sorted(
        p.stem for p in PLANS_DIR.glob("*.json") if p.name != "index.json"
    )
    _write_json(PLANS_DIR / "index.json", {"generatedAt": _now(), "plans": keys})


# --- Catalogue --------------------------------------------------------------
def scrape_catalog() -> dict:
    print("· catálogo: grados", flush=True)
    grados = P.parse_catalog_index(fetch(f"{BASE}/principal.page"), kind="grado")
    print(f"  {len(grados)} entradas de grado")
    print("· catálogo: másteres", flush=True)
    masters = P.parse_catalog_index(fetch(f"{BASE}/{YEAR}/postgrado.page"), kind="master")
    print(f"  {len(masters)} entradas de máster")

    programmes = grados + masters
    programmes.sort(key=lambda p: (p["type"], P._clean(p["name"]).lower()))
    payload = {"year": YEAR, "generatedAt": _now(), "count": len(programmes), "programmes": programmes}
    _write_json(DATA / "catalog.json", payload)
    print(f"✓ data/catalog.json ({len(programmes)} entradas)")
    return payload


# --- One programme ----------------------------------------------------------
def _programme_url(plan: int, centro: int, kind: str) -> str:
    page = "master.page" if kind == "master" else "plan.page"
    return f"{BASE}/{YEAR}/{page}?plan={plan}&centro={centro}"


def _subject_url(plan: int, centro: int, code: str, term) -> str:
    valor = term if term in (1, 2) else 1
    return (
        f"{BASE}/{YEAR}/porCentroPlanAsignatura.tt?"
        f"plan={plan}&centro={centro}&asignatura={code}&tipoPer=C&valorPer={valor}"
    )


def _cursogrupo_url(plan: int, centro: int, course: int, group: str, term: int) -> str:
    return (
        f"{BASE}/{YEAR}/porCentroPlanCursoGrupo.tt?"
        f"plan={plan}&centro={centro}&curso={course}&grupo={group}&tipoPer=C&valorPer={term}"
    )


def scrape_plan(plan: int, centro: int, kind: str = "master", name: str | None = None) -> dict:
    """Scrape one programme. Masters and grados use different source pages."""
    return _scrape_grado(plan, centro, name) if kind == "grado" else _scrape_master(plan, centro, name)


def _scrape_master(plan: int, centro: int, name: str | None) -> dict:
    """Masters expose a per-subject list; each subject page holds all its groups."""
    print(f"· plan {plan} centro {centro} (master)", flush=True)
    programme = P.parse_programme(fetch(_programme_url(plan, centro, "master")))
    prog_name = name or programme["name"]
    subjects_out = []
    for subj in programme["subjects"]:
        url = _subject_url(plan, centro, subj["code"], subj["term"])
        try:
            sessions = P.parse_timetable(fetch(url))
        except RuntimeError as exc:
            print(f"  ! {subj['code']} {subj['name']}: {exc}")
            sessions = []
        groups = P.group_sessions(sessions)
        subjects_out.append(
            {
                "code": subj["code"],
                "name": subj["name"],
                "course": subj["course"],
                "term": subj["term"],
                "groups": groups,
            }
        )
        print(f"  · {subj['code']} {subj['name'][:42]:42} {len(groups)} grupos")

    return _finish_plan(plan, centro, "master", prog_name, subjects_out)


def _scrape_grado(plan: int, centro: int, name: str | None) -> dict:
    """Grados are organised by enrolment group; we aggregate every group's
    timetable back into the same subject -> groups -> sessions shape."""
    print(f"· plan {plan} centro {centro} (grado)", flush=True)
    html = fetch(_programme_url(plan, centro, "grado"))
    prog_name = name or P.parse_programme(html)["name"]
    mgroups = P.parse_matricula_groups(html)
    print(f"  {len(mgroups)} grupos de matrícula a recorrer")

    subjects: dict[str, dict] = {}
    for mg in mgroups:
        url = _cursogrupo_url(plan, centro, mg["course"], mg["group"], mg["term"])
        try:
            sessions = P.parse_timetable(fetch(url))
        except RuntimeError as exc:
            print(f"  ! curso{mg['course']} grupo{mg['group']} c{mg['term']}: {exc}")
            continue
        for s in sessions:
            code = s["code"]
            if not code:
                continue
            subj = subjects.setdefault(
                code,
                {"code": code, "name": s["name"] or code, "course": mg["course"], "term": mg["term"], "_g": {}},
            )
            if (not subj["name"] or subj["name"] == code) and s["name"]:
                subj["name"] = s["name"]
            bucket = subj["_g"].setdefault(s["group"], [])
            item = {k: s[k] for k in ("day", "start", "end", "room", "type", "slots")}
            if not any(e["day"] == item["day"] and e["start"] == item["start"]
                       and e["end"] == item["end"] and e["room"] == item["room"] for e in bucket):
                bucket.append(item)

    subjects_out = []
    for subj in subjects.values():
        groups = []
        for gid, items in subj["_g"].items():
            items.sort(key=lambda x: (x["day"], x["start"]))
            groups.append({"id": gid, "sessions": items})
        groups.sort(key=lambda g: P._group_sort_key(g["id"]))
        subjects_out.append({"code": subj["code"], "name": subj["name"], "course": subj["course"], "term": subj["term"], "groups": groups})
    subjects_out.sort(key=lambda s: (s["course"] or 0, s["term"] or 0, s["name"]))
    print(f"  → {len(subjects_out)} asignaturas reconstruidas")
    return _finish_plan(plan, centro, "grado", prog_name, subjects_out)


def _finish_plan(plan: int, centro: int, kind: str, name: str, subjects_out: list[dict]) -> dict:
    payload = {
        "plan": plan,
        "centro": centro,
        "type": kind,
        "name": name,
        "year": YEAR,
        "generatedAt": _now(),
        "subjects": subjects_out,
    }
    # Most 2026/2027 schedules are still "en construcción": the programme lists
    # subjects but no timetables. Don't pollute data/ with empty plans — leave
    # them as "sin datos aún" until they publish.
    total_groups = sum(len(s["groups"]) for s in subjects_out)
    if total_groups == 0:
        print(f"  ∅ plan {plan}-{centro}: sin horarios publicados todavía, se omite")
        return payload
    _write_json(PLANS_DIR / f"{plan}-{centro}.json", payload)
    _rebuild_plans_index()
    print(f"✓ data/plans/{plan}-{centro}.json ({len(subjects_out)} asignaturas)")
    return payload


# --- Everything -------------------------------------------------------------
def scrape_all(only: str | None = None, limit: int | None = None) -> None:
    catalog = scrape_catalog()
    progs = catalog["programmes"]
    if only:
        progs = [p for p in progs if p["type"] == only]
    # Deduplicate by (plan, centro) — a programme can repeat across campuses lines.
    seen: set[tuple[int, int]] = set()
    todo = []
    for p in progs:
        key = (p["plan"], p["centro"])
        if key not in seen:
            seen.add(key)
            todo.append(p)
    if limit:
        todo = todo[:limit]
    print(f"\n{len(todo)} programas por scrapear\n")
    for i, p in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}]", end=" ")
        try:
            scrape_plan(p["plan"], p["centro"], p["type"], p["name"])
        except Exception as exc:  # keep going; one bad programme shouldn't stop the batch
            print(f"  !! {p['plan']}-{p['centro']} falló: {exc}")
    _rebuild_plans_index()


def scrape_refresh() -> None:
    """Rebuild the catalogue and re-scrape only the programmes already present.

    This keeps shipped data fresh without expanding coverage (and without
    hammering the source) — ideal for a scheduled job.
    """
    catalog = scrape_catalog()
    lut = {(p["plan"], p["centro"]): p for p in catalog["programmes"]}
    idx_path = PLANS_DIR / "index.json"
    keys = json.loads(idx_path.read_text(encoding="utf-8"))["plans"] if idx_path.exists() else []
    print(f"\nrefrescando {len(keys)} programas ya descargados\n")
    for i, key in enumerate(keys, 1):
        plan, centro = (int(x) for x in key.split("-"))
        meta = lut.get((plan, centro))
        print(f"[{i}/{len(keys)}]", end=" ")
        try:
            scrape_plan(plan, centro, meta["type"] if meta else "master", meta["name"] if meta else None)
        except Exception as exc:
            print(f"  !! {key} falló: {exc}")
    _rebuild_plans_index()


# --- CLI --------------------------------------------------------------------
def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Schedule data harvester")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("catalog", help="rebuild data/catalog.json")

    sp = sub.add_parser("plan", help="scrape one programme")
    sp.add_argument("plan", type=int)
    sp.add_argument("centro", type=int)
    sp.add_argument("--kind", choices=["grado", "master"], default="master")
    sp.add_argument("--name", default=None)

    sa = sub.add_parser("all", help="rebuild catalogue and scrape every programme")
    sa.add_argument("--only", choices=["grado", "master"], default=None)
    sa.add_argument("--limit", type=int, default=None)

    sub.add_parser("refresh", help="rebuild catalogue and re-scrape only programmes already present")

    args = ap.parse_args(argv)
    if args.cmd == "catalog":
        scrape_catalog()
    elif args.cmd == "plan":
        scrape_plan(args.plan, args.centro, args.kind, args.name)
    elif args.cmd == "all":
        scrape_all(args.only, args.limit)
    elif args.cmd == "refresh":
        scrape_refresh()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
