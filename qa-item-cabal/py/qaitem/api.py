"""JSON-in / JSON-out entry points.

The web page (Pyodide), the CLI and the GitHub Action all call these, so the
same Python code decides every result everywhere.
"""
import csv
import io
import json
from datetime import datetime, timezone

from .checker import RULES, Checker, summarize
from .db import ItemDB, clean_item
from .normalize import name_key, period_key, text, yn
from .sheet import parse_workbook

ENGINE_VERSION = "2.0.0"


def check_workbook(bundle, workbook):
    """bundle: item DB bundle (dict or JSON). workbook: {"source", "sheets": [...]}."""
    db = ItemDB.from_bundle(bundle)
    if isinstance(workbook, str):
        workbook = json.loads(workbook)
    rows, notes = parse_workbook(workbook)
    findings = Checker(db).check_rows(rows)
    order = {"error": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: (f["sheet"], f["row"], order[f["severity"]]))
    return {
        "engine": ENGINE_VERSION,
        "game": db.game,
        "source": workbook.get("source", ""),
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "db": db.stats(),
        "summary": summarize(rows, findings),
        "findings": findings,
        "notes": notes,
        "rows": [{"sheet": r["sheet"], "pack": r["pack"], "row": r["row"],
                  "item": text(r["values"].get("name")) or text(r["values"].get("display_name")),
                  "values": {k: text(x) for k, x in r["values"].items()}} for r in rows],
    }


def check_workbook_json(bundle_json, workbook_json):
    return json.dumps(check_workbook(bundle_json, workbook_json), ensure_ascii=False)


REPORT_COLUMNS = [("severity", "ระดับ"), ("sheet", "ชีท"), ("pack", "กิจกรรม / โปรโมชั่น"),
                  ("row", "แถว"), ("cell", "เซลล์"), ("item", "ไอเทม"), ("field", "ช่อง"),
                  ("value", "ค่าในเอกสาร"), ("expected", "ควรเป็น"), ("rule", "กฎ"),
                  ("message", "รายละเอียด")]
SEVERITY_TH = {"error": "ผิด", "warn": "น่าสงสัย", "info": "ข้อมูล"}


def report_csv(result, include_info=False):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["เอกสาร", result.get("source", "")])
    w.writerow(["เกม", result.get("game", "").upper(), "ตรวจเมื่อ", result.get("checked_at", "")])
    w.writerow([])
    w.writerow([label for _, label in REPORT_COLUMNS])
    for f in result["findings"]:
        if f["severity"] == "info" and not include_info:
            continue
        row = [SEVERITY_TH.get(f[k], f[k]) if k == "severity" else f.get(k, "") for k, _ in REPORT_COLUMNS]
        # stop spreadsheet formula injection
        row = ["'" + str(c) if str(c)[:1] in "=+-@" else c for c in row]
        w.writerow(row)
    return "﻿" + buf.getvalue()


def report_csv_json(result_json, include_info=False):
    return report_csv(json.loads(result_json), include_info)


# ---- adding items ---------------------------------------------------------
def item_identity(it):
    """Stable identity of a library row: numbers + loose name."""
    it = clean_item(it)
    return (it["kind"], it["index"], it["option"], it["duration"], name_key(it["name"]))


def validate_item(bundle, raw, original=None):
    """Check a new or edited item before it goes into the database.

    original: the library row being edited (it is left out of the comparison,
    so the item is not "already in the database" or "different from history"
    against its own old values).
    Returns {"ok": bool, "item": cleaned, "errors": [...], "warnings": [...]}.
    """
    if isinstance(bundle, str):
        bundle = json.loads(bundle)
    if isinstance(raw, str):
        raw = json.loads(raw)
    if isinstance(original, str):
        original = json.loads(original) if original else None
    if original:
        key = item_identity(original)
        bundle = dict(bundle, items=[i for i in bundle.get("items", []) if item_identity(i) != key])
    db = ItemDB.from_bundle(bundle)
    it = clean_item(raw)
    errors, warnings = [], []
    for fld in ("kind", "index", "option"):
        if it[fld] is None:
            errors.append("%s ต้องเป็นเลขจำนวนเต็ม" % fld)
    if it["duration"] is None:
        if text(raw.get("duration")):
            errors.append("duration ต้องเป็นเลขจำนวนเต็ม")
        else:
            warnings.append("ไม่มี DurationIndex (เอกสารต้นทางไม่มีคอลัมน์นี้)")
    if it["itemmove"] is None:
        errors.append("Trade (Itemmove) ต้องเป็น Yes หรือ No")
    if not it["name"]:
        errors.append("ต้องมี Item Name")
    if errors:
        return {"ok": False, "item": it, "errors": errors, "warnings": warnings}

    # run the same row checks the document checker uses
    # only check the fields this item actually has (source sheets may lack some columns)
    cols = [k for k in ("kind", "index", "option", "duration", "itemmove",
                        "name", "display_name", "period") if it[k] not in (None, "")]
    row = {"sheet": "ฟอร์มเพิ่มไอเทม", "pack": "-", "row": 1, "columns": cols,
           "values": {k: (yn(it[k]) if k == "itemmove" else it[k]) for k in cols},
           "cells": {}}
    row["display"] = {k: text(x) for k, x in row["values"].items()}
    for fd in Checker(db).check_row(row):
        if fd["code"] in ("UNKNOWN_ITEM", "NEW_VARIANT"):
            continue
        (errors if fd["severity"] == "error" else warnings).append(fd["rule"] + ": " + fd["message"])
    dup = [c for c in db.by_index.get(it["index"], [])
           if c["kind"] == it["kind"] and c["option"] == it["option"] and c["duration"] == it["duration"]
           and name_key(c["name"]) == name_key(it["name"])]
    if dup:
        errors.append("มีไอเทมนี้ในฐานข้อมูลอยู่แล้ว")
    if it["period"] and period_key(it["period"]) is None:
        warnings.append("อ่าน Period ไม่ออก ใช้รูปแบบ เช่น 7 Days, 1 Day, Permanent, ถาวร")
    return {"ok": not errors, "item": it, "errors": errors, "warnings": warnings}


def validate_item_json(bundle_json, raw_json, original_json=None):
    return json.dumps(validate_item(bundle_json, raw_json, original_json), ensure_ascii=False)


def rule_catalogue():
    return RULES
