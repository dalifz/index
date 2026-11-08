"""Find item tables inside a promotion/event sheet.

A sheet can hold many tables (one per pack/bundle). Each table starts with a
header row that has an item-name column plus ItemKind or ItemIndex. The
pack/promotion name is taken from a "Product Name" cell, or else the closest
text above the header.
"""
import re
import unicodedata

from .normalize import col_letter, text

ALIASES = {
    "itemkind": "kind",
    "kind": "kind",
    "itemindex": "index",
    "index": "index",
    "itemoption": "option",
    "option": "option",
    "durationindex": "duration",
    "duration": "duration",
    "durationidx": "duration",
    "stackable": "stackable",
    "stack": "stackable",
    "itemmove": "itemmove",
    "move": "itemmove",
    "itemname": "name",
    "name": "name",
    "amount": "amount",
    "amt": "amount",
    "amountea": "amount_ea",
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
    "itemmove": "Itemmove",
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


def _header_map(row):
    m = {}
    for i, v in enumerate(row):
        f = ALIASES.get(_hkey(v))
        if f and f not in m:
            m[f] = i
    if "name" in m and ("kind" in m or "index" in m):
        return m
    return None


def _is_blank(row):
    return not any(text(v) for v in row)


def parse_sheet(name, values, display=None):
    """Return (rows, notes).

    rows: list of dicts {sheet, pack, row, cells{field: addr}, values{field: raw},
          display{field: str}}
    notes: problems that stop part of the sheet from being read.
    """
    display = display or []
    rows, notes = [], []
    header, header_row = None, -1
    last_pack, pending_title = "", ""
    for ri, row in enumerate(values):
        row = list(row or [])
        disp = list(display[ri]) if ri < len(display) and display[ri] else []
        # pack name label: "Product Name | <value>"
        for ci, v in enumerate(row):
            if _hkey(v) in PACK_LABELS:
                nxt = next((text(x) for x in row[ci + 1:] if text(x)), "")
                if nxt:
                    last_pack = nxt
        hm = _header_map(row)
        if hm:
            header, header_row = hm, ri
            pack = last_pack or pending_title
            last_pack, pending_title = "", ""
            current_pack = pack or "(ไม่มีชื่อแพ็ค)"
            continue
        if _is_blank(row):
            if header is not None and ri > header_row:
                header = None
            continue
        if header is None:
            # remember the latest free text line as a fallback table title
            first = next((text(v) for v in row if text(v)), "")
            if first and not any(_hkey(v) in ALIASES for v in row):
                pending_title = first
            continue
        if any(text(v).lower() == "total" for v in row):
            header = None
            continue
        vals, cells, disps = {}, {}, {}
        for f, ci in header.items():
            vals[f] = row[ci] if ci < len(row) else None
            disps[f] = text(disp[ci]) if ci < len(disp) else text(vals[f])
            cells[f] = col_letter(ci) + str(ri + 1)
        if not any(text(vals.get(f)) for f in ("kind", "index", "name")):
            notes.append({"sheet": name, "row": ri + 1,
                          "message": "มีข้อมูลใต้หัวตาราง แต่ไม่มี ItemKind / ItemIndex / ชื่อไอเทม"})
            continue
        rows.append({"sheet": name, "pack": current_pack, "row": ri + 1,
                     "values": vals, "display": disps, "cells": cells,
                     "columns": sorted(header)})
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
