"""Item database for one game (PC or Mobile).

A record is one *variant* of an item as it was given out before, e.g.
"MP Potion (Lv.3) x300, 7 days". Several variants share one ItemIndex and
differ in ItemOption / DurationIndex.
"""
import json
from collections import defaultdict

from .normalize import full_name_key, name_key, period_key, text, to_int, yes_no

ITEM_FIELDS = ("kind", "index", "option", "duration", "itemmove",
               "name", "display_name", "period")


def clean_item(raw):
    """Normalise an item dict coming from JSON, CSV or the web form."""
    it = {
        "kind": to_int(raw.get("kind")),
        "index": to_int(raw.get("index")),
        "option": to_int(raw.get("option")),
        "duration": to_int(raw.get("duration")),
        "itemmove": yes_no(raw.get("itemmove")) if not isinstance(raw.get("itemmove"), bool) else raw.get("itemmove"),
        "name": text(raw.get("name")),
        "display_name": text(raw.get("display_name")),
        "period": text(raw.get("period")),
    }
    for k in ("note", "added_by", "added_at", "source"):
        if text(raw.get(k)):
            it[k] = text(raw.get(k))
    # other spellings people used for this item in real documents
    aliases = [text(x) for x in (raw.get("aliases") or []) if text(x) and text(x) != it["name"]]
    if aliases:
        it["aliases"] = aliases
    if to_int(raw.get("seen")):
        it["seen"] = to_int(raw.get("seen"))
    return it


class ItemDB:
    def __init__(self, game, items, durations=None, rules=None, meta=None):
        self.game = game
        self.items = [clean_item(i) for i in items]
        # durations: {"12": {"period": "7 Days", "th": "7 วัน"}}
        self.durations = {}
        for k, v in (durations or {}).items():
            d = to_int(k)
            if d is not None:
                self.durations[d] = dict(v, key=period_key(v.get("period")))
        self.rules = rules or {}
        self.meta = meta or {}
        self.by_index = defaultdict(list)
        self.by_name = defaultdict(list)
        self.by_full_name = defaultdict(list)
        for it in self.items:
            if it["index"] is not None:
                self.by_index[it["index"]].append(it)
            for n in [it["name"], it["display_name"]] + it.get("aliases", []):
                k = name_key(n)
                if k and it not in self.by_name[k]:
                    self.by_name[k].append(it)
                fk = full_name_key(n)
                if fk and it not in self.by_full_name[fk]:
                    self.by_full_name[fk].append(it)

    # ---- loading -----------------------------------------------------------
    @classmethod
    def from_bundle(cls, bundle):
        if isinstance(bundle, str):
            bundle = json.loads(bundle)
        return cls(bundle["game"], bundle.get("items", []), bundle.get("durations"),
                   bundle.get("rules"), bundle.get("meta"))

    def to_bundle(self):
        return {"game": self.game, "items": self.items, "durations": {
            str(k): {kk: vv for kk, vv in v.items() if kk != "key"} for k, v in self.durations.items()},
            "rules": self.rules, "meta": self.meta}

    # ---- lookups -----------------------------------------------------------
    def known_masks(self):
        """{mask: meaning} from rules + every mask seen in the data."""
        masks = {}
        for k, v in (self.rules.get("kind_masks") or {}).items():
            masks[int(k, 0) if isinstance(k, str) else k] = v
        for it in self.items:
            if it["kind"] is not None and it["index"] is not None and it["kind"] >= it["index"]:
                masks.setdefault(it["kind"] - it["index"], "พบในฐานข้อมูล")
        return masks

    def constant(self, index, field):
        """The single value a field always has for this ItemIndex, or None."""
        vals = {it[field] for it in self.by_index.get(index, []) if it[field] not in (None, "")}
        return next(iter(vals)) if len(vals) == 1 else None

    def values(self, index, field):
        return sorted({it[field] for it in self.by_index.get(index, []) if it[field] not in (None, "")},
                      key=str)

    def stats(self):
        return {"game": self.game, "items": len(self.items), "indexes": len(self.by_index),
                "durations": len(self.durations)}
