"""Find item tables inside a promotion/event sheet.

A sheet can hold many tables (one per pack/bundle). Each table starts with a
header row that has an item-name column plus ItemKind or ItemIndex. The
pack/promotion name is taken from a "Product Name" cell, or else the closest
text above the header.
"""
import re
import unicodedata

from .normalize import col_letter, is_no_id, text, to_int, yes_no

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
    "#": "amount",
    "durations": "period",
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


PLACEHOLDER = ("-", "—", "–", "ว่าง")
NOT_AN_ITEM = re.compile(r"^\s*ตัวอักษร\s*\S{1,2}\s*$")


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
            # a section banner merged across the row ("ทุกครั้งที่ซื้อจะได้ Item ด้านบน แถมสุ่ม…"): its text lands
            # in whatever column the merge starts (often ItemKind) -> it ends this table, it is not an item
            filled = [x for x in vals.values() if text(x)]
            if (len(filled) == 1 and to_int(filled[0]) is None and not text(vals.get("name"))
                    and not text(vals.get("display_name")) and not is_no_id(filled[0])
                    and text(filled[0]) not in PLACEHOLDER):
                head = t["pack"].split(" · ")[0]
                label = (head + " · " if t["pack"] and not t["pack"].startswith("ตาราง ") else "") \
                    + text(filled[0])[:60]
                last_pack = label             # a header right after it starts a new table with this name
                t["pack"] = label             # rows that follow without a new header keep going under it
                keep.append(t)
                continue
            if any(text(row[ci]).lower() == "total" for ci in range(t["lo"], min(t["hi"] + 1, len(row)))):
                continue
            keep.append(t)
            if text(vals.get("kind")) in PLACEHOLDER + ("",) and text(vals.get("index")) in PLACEHOLDER + ("",) \
                    and (text(vals.get("kind")) or text(vals.get("index"))):
                continue                       # gacha cost line ("Limited Orb x1" with "-") or "ว่าง" slot
            # Event Pass sheets put the bind type ("Account bind") in a column called "Option"
            if "option" in m and yes_no(vals.get("option")) is False and to_int(vals.get("option")) is None:
                if text(vals.get("itemmove")) == "":
                    vals["itemmove"] = vals["option"]
                    m = dict(m, itemmove=m["option"])
                vals["option"] = None
            for nf in ("name", "display_name"):
                # a name cell sometimes carries the description on the next lines
                if isinstance(vals.get(nf), str) and "\n" in vals[nf].strip():
                    vals[nf] = vals[nf].strip().splitlines()[0].strip()
            if NOT_AN_ITEM.match(text(vals.get("name"))):
                continue                       # e.g. "ตัวอักษร Y" letter-collect labels
            disps = {f: (text(disp[ci]) if ci < len(disp) else text(vals[f])) for f, ci in m.items()}
            cells = {f: col_letter(ci) + str(ri + 1) for f, ci in m.items()}
            if not any(text(vals.get(f)) for f in ("kind", "index", "name", "option", "display_name")):
                continue                       # unfilled template row (only default Yes/No left)
            if not any(text(vals.get(f)) for f in ("kind", "index", "name")):
                notes.append({"sheet": name, "row": ri + 1,
                              "message": "มีข้อมูลใต้หัวตาราง แต่ไม่มี ItemKind / ItemIndex / ชื่อไอเทม"})
                continue
            rows.append({"sheet": name, "pack": t["pack"], "row": ri + 1, "table": t["table"],
                         "values": vals, "display": disps, "cells": cells, "columns": sorted(m)})
        tables = keep + new
    return rows, notes


REFERENCE_SHEETS = re.compile(r"^\s*(data\s*item|appendix|item\s*list|item\s*code)\s*$", re.I)


def is_reference_sheet(name):
    """Lookup sheets inside a plan (e.g. 'Data Item', 'Appendix') — not part of what QA checks."""
    return bool(REFERENCE_SHEETS.match(text(name)))


def parse_workbook(workbook, include_reference=False):
    """workbook = {"source": str, "sheets": [{"name", "values", "display"?}]}"""
    all_rows, notes = [], []
    for sh in workbook.get("sheets", []):
        if not include_reference and is_reference_sheet(sh.get("name", "")):
            continue
        r, n = parse_sheet(sh.get("name", "Sheet"), sh.get("values") or [], sh.get("display"))
        if not r and not n:
            continue
        all_rows.extend(r)
        notes.extend(n)
    return all_rows, notes
