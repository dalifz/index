"""Find item tables inside a promotion/event sheet.

A sheet can hold many tables (one per pack/bundle). Each table starts with a
header row that has an item-name column plus ItemKind or ItemIndex. The
pack/promotion name is taken from a "Product Name" cell, or else the closest
text above the header.
"""
import re
import unicodedata

from .normalize import col_letter, text, to_int

ALIASES = {
    "itemkind": "kind",
    "kind": "kind",
    "itemindex": "index",
    "index": "index",
    "itemoption": "option",
    "option": "option",
    "durationindex": "duration",
    "duration": "period",          # "Duration" column holds ถาวร / 7 วัน, not the index
    "durationidx": "duration",
    "stackable": "stackable",
    "stack": "stackable",
    "itemmove": "itemmove",
    "move": "itemmove",
    "trade": "itemmove",
    "tradable": "itemmove",
    "itemname": "name",
    "name": "name",
    "amount": "amount",
    "amt": "amount",
    "amountea": "amount_ea",
    "จำนวน": "amount",
    "displayname": "display_name",
    "itemdisplayname": "display_name",
    "period": "period",
    "ownperiod": "period",
    "ระยะเวลา": "period",
}

FIELD_LABELS = {
    "kind": "ItemKind",
    "index": "ItemIndex",
    "option": "ItemOption",
    "duration": "DurationIndex",
    "stackable": "Stackable",
    "itemmove": "Trade (Itemmove)",
    "name": "Item Name",
    "amount": "Amount",
    "amount_ea": "Amount EA",
    "display_name": "Display Name",
    "period": "Period",
}

PACK_LABELS = ("productname", "packname", "bundlename", "promotionname", "eventname")


def _hkey(v):
    s = unicodedata.normalize("NFKC", text(v)).lower()
    return re.sub(r"[\s_.\-/()]", "", s)


def _header_segments(row):
    """Item-table headers in one row -> [(lo, hi, {field: col})].

    Several tables can sit side by side (e.g. gacha sheets: main table L:AA and
    a cost table AE:AQ), so a row is cut into segments: a new segment starts
    when a field repeats or after a wide gap of non-header cells.
    """
    segs, cur, last = [], {}, None
    for i, v in enumerate(row):
        f = ALIASES.get(_hkey(v))
        if not f:
            continue
        if f in cur or (last is not None and i - last > 6):
            segs.append(cur)
            cur = {}
        cur[f] = i
        last = i
    segs.append(cur)
    out = []
    for m in segs:
        if "name" not in m and "display_name" in m:
            m["name"] = m["display_name"]      # some sheets only have "Display Name"
        if "name" in m and ("kind" in m or "index" in m):
            out.append((min(m.values()), max(m.values()), m))
    return out


def _header_map(row):
    segs = _header_segments(row)
    return segs[0][2] if segs else None


def _is_blank(row):
    return not any(text(v) for v in row)


PLACEHOLDER = ("-", "—", "–")


def parse_sheet(name, values, display=None):
    """Return (rows, notes).

    rows: list of dicts {sheet, pack, row, cells{field: addr}, values{field: raw},
          display{field: str}, columns, table}
    notes: problems that stop part of the sheet from being read.
    """
    display = display or []
    rows, notes = [], []
    tables = []          # active tables: {lo, hi, map, row, pack}
    last_pack, pending_title = "", ""
    titles = []          # recent free-text lines above the next table
    for ri, row in enumerate(values):
        row = list(row or [])
        disp = list(display[ri]) if ri < len(display) and display[ri] else []
        if _is_blank(row):
            tables = []
            continue
        new = []
        for lo, hi, m in _header_segments(row):
            tables = [t for t in tables if t["hi"] < lo or t["lo"] > hi]
            pack = last_pack or " · ".join(titles[-2:]) or ("ตาราง %s%d" % (col_letter(lo), ri + 1))
            last_pack, pending_title, titles = "", "", []
            new.append({"lo": lo, "hi": hi, "map": m, "row": ri, "pack": pack,
                        "table": "%s%d" % (col_letter(lo), ri + 1)})
        # "Product Name | <value>" labels apply to the next table found
        for ci, v in enumerate(row):
            if _hkey(v) in PACK_LABELS:
                nxt = next((text(x) for x in row[ci + 1:ci + 4] if text(x)), "")
                if nxt:
                    last_pack = nxt
        if not tables and not new:
            first = next((text(v) for v in row if text(v)), "")
            if first and not any(_hkey(v) in ALIASES for v in row) and to_int(first) is None:
                pending_title = first
                # labels such as "EV :" or "Total:" are not table titles
                if not first.rstrip().endswith(":") and len(first) <= 80:
                    titles.append(first)
            continue
        keep = []
        for t in tables:
            m = t["map"]
            vals = {f: (row[ci] if ci < len(row) else None) for f, ci in m.items()}
            if not any(text(x) for x in vals.values()):
                continue                       # this table ended
            if any(text(row[ci]).lower() == "total" for ci in range(t["lo"], min(t["hi"] + 1, len(row)))):
                continue
            keep.append(t)
            if text(vals.get("kind")) in PLACEHOLDER and text(vals.get("index")) in PLACEHOLDER + ("",):
                continue                       # gacha cost line such as "Limited Orb x1" with "-" ids
            disps = {f: (text(disp[ci]) if ci < len(disp) else text(vals[f])) for f, ci in m.items()}
            cells = {f: col_letter(ci) + str(ri + 1) for f, ci in m.items()}
            if not any(text(vals.get(f)) for f in ("kind", "index", "name")):
                notes.append({"sheet": name, "row": ri + 1,
                              "message": "มีข้อมูลใต้หัวตาราง แต่ไม่มี ItemKind / ItemIndex / ชื่อไอเทม"})
                continue
            rows.append({"sheet": name, "pack": t["pack"], "row": ri + 1, "table": t["table"],
                         "values": vals, "display": disps, "cells": cells, "columns": sorted(m)})
        tables = keep + new
    return rows, notes


def parse_workbook(workbook):
    """workbook = {"source": str, "sheets": [{"name", "values", "display"?}]}"""
    all_rows, notes, tables = [], [], 0
    for sh in workbook.get("sheets", []):
        r, n = parse_sheet(sh.get("name", "Sheet"), sh.get("values") or [], sh.get("display"))
        if not r and not n:
            continue
        all_rows.extend(r)
        notes.extend(n)
    return all_rows, notes
