"""Check parsed document rows against the item database and the number rules.

Warn-only: nothing here edits the document. Each finding says where the
problem is (sheet, pack, row, cell), what the document has, what it should be,
and why.

Severity:
  error -> wrong for sure (database or a rule Dalif confirmed)
  warn  -> suspicious, a person should look
  info  -> worth knowing, not a mistake
"""
import re
from collections import Counter

from .normalize import (describe_kind, flag_residual, full_name_key, kind_fields, strip_upgrade, upgrade_in_name, is_e_notation, option_matches_qty, name_key, period_key, qty_in_name, text,
                        to_int, yes_no, yn)
from .sheet import FIELD_LABELS

# Rule catalogue: code -> (default severity when confirmed, title)
RULES = {
    "NUMBER_E":        "เลขถูกปัดเป็น E-notation",
    "NUMBER_DISPLAY_E": "เลขแสดงเป็น E-notation",
    "NUMBER":          "ช่องตัวเลขอ่านไม่ได้",
    "YES_NO":          "ต้องเป็น Yes หรือ No",
    "MISSING":         "ช่องสำคัญว่าง",
    "UNKNOWN_ITEM":    "ไม่พบไอเทมในฐานข้อมูล",
    "INDEX_NAME":      "ItemIndex กับชื่อไอเทมไม่ตรงกัน",
    "NAME":            "ชื่อไม่ตรงกับฐานข้อมูล",
    "KIND":            "ItemKind ไม่ตรงกับฐานข้อมูล",
    "KIND_STRUCT":     "ItemKind ไม่ได้สร้างจาก ItemIndex",
    "KIND_FLAG":       "ItemKind มี flag ที่ไม่เคยพบ",
    "KIND_VARIANT":    "ItemKind แบบนี้ยังไม่เคยเห็นสำหรับไอเทมนี้",
    "NO_ID":           "ไม่มีเลขไอเทม",
    "BIND_BIT":        "ItemKind กับ Itemmove ขัดกัน",
    "UPGRADE":         "ระดับตีบวกใน ItemKind ไม่ตรงกับชื่อ",
    "STACKABLE":       "Stackable ไม่ตรงกับฐานข้อมูล",
    "ITEMMOVE":        "Itemmove ไม่ตรงกับฐานข้อมูล",
    "QTY_OPTION":      "จำนวนในชื่อไม่ตรงกับ ItemOption",
    "PERIOD":          "Period ไม่ตรงกับ DurationIndex",
    "DURATION_UNKNOWN": "DurationIndex ไม่มีในตาราง",
    "DISPLAY_NAME":    "Item Name กับ Display Name ไม่ตรงกัน",
    "AMOUNT":          "Amount ไม่ถูกต้อง",
    "DUPLICATE":       "ไอเทมซ้ำในแพ็คเดียวกัน",
    "NEW_VARIANT":     "รูปแบบใหม่ที่ยังไม่เคยใช้",
    "LIBRARY_DIFF":    "ไม่ตรงกับคลังไอเทม (ให้ recheck)",
    "MISSING_COLUMN":  "ตารางไม่มีคอลัมน์ที่ต้องตรวจ",
}

# Rules that are errors only after Dalif confirms them (rules.json "confirmed").
NEEDS_CONFIRM = {"KIND_STRUCT", "BIND_BIT", "QTY_OPTION", "DISPLAY_NAME", "PERIOD"}
ALWAYS_ERROR = {"NUMBER_E", "NUMBER", "YES_NO", "INDEX_NAME", "KIND", "STACKABLE",
                "ITEMMOVE", "AMOUNT", "MISSING"}
# "(1 Day)", "(30 Days)", "(15 min)", "(2 hr)", "(7 วัน)" written inside an item name
TIME_IN_NAME = re.compile(
    r"(?:\(\s*|\s)(\d+\s*(?:days?|d|วัน|hours?|hrs?|h|ชั่วโมง|ชม|minutes?|mins?|นาที))\.?\s*(?:\)|$)", re.I)
ALWAYS_INFO = {"NEW_VARIANT"}

NUMERIC = ("kind", "index", "option", "duration")
REQUIRED_COLUMNS = ("kind", "index", "option", "duration", "stackable", "itemmove", "name", "period")


class Checker:
    def __init__(self, db):
        self.db = db
        self.confirmed = set((db.rules or {}).get("confirmed", []))
        self.masks = db.known_masks()
        self.residuals = {flag_residual(m) for m in self.masks if m >= 0} | {0}

    def severity(self, code):
        if code in ALWAYS_INFO:
            return "info"
        if code in ALWAYS_ERROR:
            return "error"
        if code in NEEDS_CONFIRM:
            return "error" if code in self.confirmed else "warn"
        return "warn"

    # ------------------------------------------------------------------
    def check_rows(self, rows):
        findings = []
        seen = Counter()
        tables_reported = set()
        for r in rows:
            missing = [f for f in REQUIRED_COLUMNS if f not in r["columns"]]
            tkey = (r["sheet"], r["pack"])
            if missing and tkey not in tables_reported:
                tables_reported.add(tkey)
                findings.append(self._f(r, "MISSING_COLUMN", None, "",
                                        "เพิ่มคอลัมน์ " + ", ".join(FIELD_LABELS[f] for f in missing),
                                        "ตารางนี้ไม่มีคอลัมน์ " + ", ".join(FIELD_LABELS[f] for f in missing)
                                        + " จึงตรวจช่องนั้นไม่ได้"))
            findings.extend(self.check_row(r))
            ident = (r["sheet"], r.get("table", r["pack"]), to_int(r["values"].get("index")),
                     to_int(r["values"].get("option")), to_int(r["values"].get("duration")))
            if ident[2] is not None:
                seen[ident] += 1
                if seen[ident] == 2:
                    findings.append(self._f(r, "DUPLICATE", "index", r["values"].get("index"), "",
                                            "ไอเทมเดียวกัน (ItemIndex, ItemOption, DurationIndex ซ้ำ) อยู่ในแพ็คนี้มากกว่า 1 แถว"))
        return findings

    def _f(self, r, code, field, value, expected, message):
        return {
            "severity": self.severity(code),
            "code": code,
            "rule": RULES[code],
            "sheet": r["sheet"],
            "pack": r["pack"],
            "row": r["row"],
            "cell": r["cells"].get(field, "แถว %d" % r["row"]) if field else "แถว %d" % r["row"],
            "field": FIELD_LABELS.get(field, "") if field else "",
            "item": text(r["values"].get("name")) or text(r["values"].get("display_name")),
            "value": text(value),
            "expected": text(expected),
            "message": message,
        }

    def check_row(self, r):
        v, d, db = r["values"], r["display"], self.db
        out = []
        f = lambda *a: out.append(self._f(r, *a))  # noqa: E731
        cols = set(r["columns"])

        # 1. numbers must be exact whole numbers
        n = {}
        for fld in NUMERIC:
            if fld not in cols:
                n[fld] = None
                continue
            raw = v.get(fld)
            if text(raw) == "":
                n[fld] = None
                if fld in ("kind", "index"):
                    if text(v.get("name")) or text(v.get("display_name")):
                        if fld == "kind" or text(v.get("kind")) == "":
                            f("NO_ID", fld, "", "ใส่ " + FIELD_LABELS[fld],
                              "แถวนี้ไม่มี %s ถ้าเป็นรางวัลที่ไม่ใช่ไอเทม (เช่น Title) ข้ามได้" % FIELD_LABELS[fld])
                    else:
                        f("MISSING", fld, "", "ใส่ " + FIELD_LABELS[fld], FIELD_LABELS[fld] + " ว่าง")
                continue
            if is_e_notation(raw):
                n[fld] = None
                f("NUMBER_E", fld, raw, self._expected_from_db(fld, v),
                  "ค่าถูกเก็บเป็นข้อความแบบ E (%s) เลขหลักท้ายหายไปแล้ว ต้องพิมพ์เลขเต็มใหม่" % text(raw))
                continue
            n[fld] = to_int(raw)
            if n[fld] is None:
                f("NUMBER", fld, raw, "เลขจำนวนเต็ม", FIELD_LABELS[fld] + " ต้องเป็นเลขจำนวนเต็ม")
            elif is_e_notation(d.get(fld)):
                f("NUMBER_DISPLAY_E", fld, d.get(fld), str(n[fld]),
                  "ค่าในเซลล์ถูกต้อง แต่แสดงเป็น E ถ้ามีคนก๊อปไปใช้จะได้เลขผิด ให้ตั้ง Format เป็น Number ไม่มีทศนิยม")

        stack = move = None
        for fld in ("stackable", "itemmove"):
            if fld in cols and text(v.get(fld)) != "":
                b = yes_no(v.get(fld))
                if b is None:
                    f("YES_NO", fld, v.get(fld), "Yes / No", FIELD_LABELS[fld] + " ต้องเป็น Yes หรือ No")
                if fld == "stackable":
                    stack = b
                else:
                    move = b

        kind, idx, opt, dur = n["kind"], n["index"], n["option"], n["duration"]
        name = text(v.get("name"))
        dname = text(v.get("display_name"))
        nk = name_key(name)

        # 2. identity: ItemIndex <-> name
        cands = db.by_index.get(idx, []) if idx is not None else []
        name_hits = db.by_name.get(nk, []) if nk else []
        if not name_hits and dname:
            name_hits = db.by_name.get(name_key(dname), [])
        other_idx = sorted({h["index"] for h in name_hits if h["index"] != idx})
        if idx is not None and not cands:
            if other_idx:
                f("INDEX_NAME", "index", idx, " / ".join(map(str, other_idx)),
                  "ItemIndex %s ไม่มีในฐานข้อมูล %s แต่ชื่อ \"%s\" ใช้ ItemIndex %s"
                  % (idx, db.game.upper(), name, " / ".join(map(str, other_idx))))
            else:
                f("UNKNOWN_ITEM", "index", idx, "",
                  "ไม่พบ ItemIndex %s และชื่อนี้ในฐานข้อมูล %s ถ้าเป็นไอเทมใหม่ ให้ admin ตรวจแล้วเพิ่มเข้าฐานข้อมูล"
                  % (idx, db.game.upper()))
        elif cands:
            # container items (e.g. costume GiftBox 33558006) share one ItemIndex and pick
            # the content with ItemOption -> compare names with the same option first
            same_opt = [c for c in cands if opt is not None and c["option"] == opt]
            named = same_opt or cands
            # the +N in a name lives in ItemKind, so "Belt +14" and "Belt +15" are one item
            kf_doc = kind_fields(kind, idx)
            key = (lambda x: name_key(strip_upgrade(x))) if (kf_doc and kf_doc["upgrade"]) else name_key
            db_names = set()
            for c in named:
                for x in [c["name"], c["display_name"]] + c.get("aliases", []):
                    db_names.add(key(x))
            db_names.discard("")
            name_ok = (key(name) in db_names) or bool(dname and key(dname) in db_names)
            container = len({name_key(c["name"]) for c in cands}) > 1 and not same_opt and opt is not None
            kinds = db.values(idx, "kind")
            identity_broken = False
            if name and not name_ok and container and not other_idx:
                # a box that picks its content by ItemOption, with an option we have never seen
                identity_broken = True
                f("UNKNOWN_ITEM", "option", opt, "",
                  "ItemIndex %s เป็นกล่องที่ใช้ ItemOption เลือกของข้างใน ยังไม่เคยเห็น ItemOption %s (\"%s\") "
                  "ในคลัง ถ้าเป็นของใหม่ ให้ admin เพิ่มเข้าคลัง" % (idx, opt, name))
            elif name and not name_ok:
                identity_broken = True
                real = sorted({c["name"] for c in named if c["name"]})
                hit_kinds = {h["kind"] for h in name_hits}
                if other_idx and kind is not None and kind in hit_kinds and kind not in kinds:
                    # ItemKind and name agree on another item -> the ItemIndex is the wrong cell
                    f("INDEX_NAME", "index", idx, " / ".join(map(str, other_idx)),
                      "ItemKind %s และชื่อ \"%s\" เป็นของ ItemIndex %s แต่ใส่ ItemIndex %s (ซึ่งคือ \"%s\")"
                      % (kind, name, " / ".join(map(str, other_idx)), idx, " / ".join(real[:3])))
                elif kind is not None and kind in kinds:
                    # ItemKind and ItemIndex agree -> the name is the wrong cell
                    f("NAME" if not other_idx else "INDEX_NAME", "name", name, " / ".join(real[:3]),
                      "ItemKind %s กับ ItemIndex %s คือ \"%s\" แต่ชื่อในเอกสารเป็น \"%s\""
                      % (kind, idx, " / ".join(real[:3]), name))
                elif other_idx:
                    f("INDEX_NAME", "index", idx, " / ".join(map(str, other_idx)),
                      "ItemIndex %s ในฐานข้อมูลคือ \"%s\" แต่ชื่อในเอกสาร \"%s\" ใช้ ItemIndex %s — เลขหรือชื่อผิดอย่างใดอย่างหนึ่ง"
                      % (idx, " / ".join(real[:3]), name, " / ".join(map(str, other_idx))))
                else:
                    f("NAME", "name", name, " / ".join(real[:3]),
                      "ชื่อไม่ตรงกับไอเทม ItemIndex %s ในฐานข้อมูล" % idx)
            # ItemKind must be one the database knows for this index
            if not identity_broken and kind is not None and kinds and kind not in kinds:
                kf = kind_fields(kind, idx)
                if kf and kf["mask"] & 0xFFF == 0 and flag_residual(kf["mask"]) in self.residuals:
                    # a clean ItemKind (bind / +N / expiry) we just have not seen for this item yet
                    f("KIND_VARIANT", "kind", kind, " / ".join(map(str, kinds)),
                      "ไอเทมนี้ในคลังเคยใช้ ItemKind %s แต่เอกสารนี้เป็นแบบ %s ให้ recheck ว่าตั้งใจ"
                      % (" / ".join(map(str, kinds)), describe_kind(kf)))
                else:
                    f("KIND", "kind", kind, " / ".join(map(str, kinds)),
                      "ItemKind ของ ItemIndex %s ในฐานข้อมูลคือ %s" % (idx, " / ".join(map(str, kinds))))
            for fld, val in (("stackable", stack), ("itemmove", move)):
                ref = db.constant(idx, fld)
                if val is not None and ref is not None and val != ref:
                    f(fld.upper(), fld, yn(val), yn(ref),
                      "ไอเทมนี้ในฐานข้อมูลเป็น %s = %s ทุกครั้ง" % (FIELD_LABELS[fld], yn(ref)))
            # new option/duration combination
            if opt is not None and dur is not None and not any(
                    c["option"] == opt and c["duration"] == dur for c in cands):
                f("NEW_VARIANT", "option", opt, "",
                  "ยังไม่เคยมี ItemOption %s + DurationIndex %s สำหรับไอเทมนี้ในฐานข้อมูล (ไม่ได้แปลว่าผิด)" % (opt, dur))

        # 2b. library: the exact same item name (quantity included) is already in the
        # database -> every number should be the same as last time
        out.extend(self._library_diff(r, n, stack, move, name, dname, out))

        # 3. ItemKind is ItemIndex plus flag bits (skip when the identity is already wrong)
        if kind is not None and idx is not None and not any(
                x["code"] in ("INDEX_NAME", "KIND") for x in out):
            mask = kind - idx
            if mask < 0:
                f("KIND_STRUCT", "kind", kind, "",
                  "ItemKind ควรเท่ากับ ItemIndex + flag แต่ %s - %s = %s" % (kind, idx, mask))
            else:
                if mask & 0xFFF or flag_residual(mask) not in self.residuals:
                    f("KIND_FLAG", "kind", kind, "",
                      "ItemKind - ItemIndex = %s (0x%X) ไม่เคยพบใน %s ตรวจว่าก๊อปเลขมาถูกตัวไหม"
                      % (mask, mask, db.game.upper()))
                kf = kind_fields(kind, idx)
                if move is not None and kf["bound"] == move:  # bound but movable, or free but No
                    f("BIND_BIT", "itemmove", yn(move), yn(not kf["bound"]),
                      "ItemKind %s flag ผูกตัว (0x1000 หรือ 0x80000) แต่ Itemmove = %s"
                      % ("มี" if kf["bound"] else "ไม่มี", yn(move)))
                # +N enhancement level lives in ItemKind bits 13-17
                n_name = upgrade_in_name(name) if kf["upgrade"] else None
                if kf["upgrade"] and n_name is not None and n_name != kf["upgrade"]:
                    f("UPGRADE", "kind", kind, "",
                      "ItemKind บอกตีบวก +%d แต่ชื่อไอเทมเขียน +%d ให้ recheck ItemKind หรือชื่อ"
                      % (kf["upgrade"], n_name))

        # 4. quantity written in the name must match ItemOption for stackable items
        q = qty_in_name(name) or qty_in_name(dname)
        # ItemOption = (value << 16) | count for some items, e.g. Raid Energy Capsule 50/100 x1 = 3276801
        if q is not None and stack and opt is not None and not option_matches_qty(opt, q)                 and not any(x["code"] == "LIBRARY_DIFF" and x["field"] == "ItemOption" for x in out):
            f("QTY_OPTION", "option", opt, q,
              "ชื่อไอเทมบอก x%s แต่ ItemOption = %s — ItemOption ส่วนใหญ่คือจำนวน ให้ recheck" % (q, opt))

        # 5. DurationIndex <-> Period
        if dur is not None and "period" in cols:
            per = text(v.get("period"))
            ref = db.durations.get(dur)
            if ref is None:
                if db.durations:
                    f("DURATION_UNKNOWN", "duration", dur, "",
                      "DurationIndex %s ไม่มีในตารางระยะเวลาของ %s" % (dur, db.game.upper()))
            elif per:
                pk = period_key(per)
                # DurationIndex can be the effect time written in the name, e.g.
                # "Blessing Bead (1 Day)" = DurationIndex 9 while Own Period is 7 Days
                in_name = {period_key(t) for t in TIME_IN_NAME.findall(name + " " + dname)}
                if pk != ref.get("key") and ref.get("key") not in in_name:
                    thai = any("฀" <= ch <= "๿" for ch in per)
                    want = (ref.get("th") if thai and ref.get("th") else ref.get("period"))
                    f("PERIOD", "period", per, want,
                      "DurationIndex %s หมายถึง %s แต่ Period เขียน %s และชื่อไอเทมก็ไม่ได้ระบุเวลานี้" % (dur, want, per))
            else:
                f("MISSING", "period", "", ref.get("period"), "Period ว่าง")

        # 6. Item Name vs Display Name
        if name and dname and name_key(name) != name_key(dname):
            f("DISPLAY_NAME", "display_name", dname, name,
              "Display Name ไม่ตรงกับ Item Name (ไม่นับจำนวน xN)")

        # 7. Amount
        if "amount" in cols and text(v.get("amount")) != "":
            a = to_int(v.get("amount"))
            if a is None or a < 1:
                f("AMOUNT", "amount", v.get("amount"), "เลขจำนวนเต็ม ≥ 1", "Amount ต้องเป็นเลขจำนวนเต็มตั้งแต่ 1")
        return out

    def _library_diff(self, r, n, stack, move, name, dname, already):
        keys = {full_name_key(name), full_name_key(dname)} - {""}
        lib = [it for k in keys for it in self.db.by_full_name.get(k, [])]
        # bound / tradable and timed / permanent versions are different products
        kf = kind_fields(n["kind"], n["index"])
        if kf and kf["mask"] & 0xFFF == 0:
            def same_kind(it):
                k2 = kind_fields(it["kind"], it["index"])
                return k2 is None or (k2["bound"], k2["expiry"]) == (kf["bound"], kf["expiry"])
            lib = [it for it in lib if same_kind(it)]
        if not lib:
            return []
        doc = dict(n, stackable=stack, itemmove=move)
        if any(all(doc[f] is None or doc[f] == it[f] for f in ("kind", "index", "option", "duration"))
               for it in lib):
            return []                      # matches one known version exactly
        done = {x["field"] for x in already if x["severity"] != "info"}
        found = []
        for f in ("index", "kind", "option", "duration", "stackable", "itemmove"):
            vals = {it[f] for it in lib if it[f] is not None}
            if doc[f] is None or not vals or doc[f] in vals or FIELD_LABELS[f] in done:
                continue
            show = (lambda x: yn(x)) if f in ("stackable", "itemmove") else str
            want = " / ".join(sorted(show(x) for x in vals))
            found.append(self._f(r, "LIBRARY_DIFF", f, show(doc[f]), want,
                                 "\"%s\" ในคลังไอเทมใช้ %s = %s แต่เอกสารนี้ใส่ %s ให้ recheck"
                                 % (lib[0]["name"], FIELD_LABELS[f], want, show(doc[f]))))
        return found

    def _expected_from_db(self, fld, v):
        idx = to_int(v.get("index"))
        if idx is None and fld == "index":
            hits = self.db.by_name.get(name_key(v.get("name")), [])
            return " / ".join(sorted({str(h["index"]) for h in hits}))
        if idx is not None:
            return " / ".join(map(str, self.db.values(idx, fld)))
        return ""


def summarize(rows, findings):
    by_row = {}
    for fd in findings:
        k = (fd["sheet"], fd["row"])
        rank = {"error": 3, "warn": 2, "info": 1}[fd["severity"]]
        by_row[k] = max(by_row.get(k, 0), rank)
    counts = Counter(fd["severity"] for fd in findings)
    row_status = Counter()
    for r in rows:
        rank = by_row.get((r["sheet"], r["row"]), 0)
        row_status[{3: "error", 2: "warn", 1: "ok", 0: "ok"}[rank]] += 1
    return {
        "rows": len(rows),
        "rows_error": row_status["error"],
        "rows_warn": row_status["warn"],
        "rows_ok": row_status["ok"],
        "errors": counts["error"],
        "warnings": counts["warn"],
        "infos": counts["info"],
        "sheets": sorted({r["sheet"] for r in rows}),
        "packs": len({(r["sheet"], r["pack"]) for r in rows}),
    }
