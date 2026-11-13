"""Value normalisation shared by every rule.

Everything that compares two values goes through here, so a document cell and
an item-database value are always read the same way.
"""
import re
import unicodedata

GAMES = ("pc", "mobile")

E_NOTATION = re.compile(r"^\s*[+-]?\d+(\.\d+)?[eE][+-]?\d+\s*$")
INT_TEXT = re.compile(r"^\s*[+-]?\d+(\.0+)?\s*$")
QTY_SUFFIX = re.compile(r"\s*[xX×]\s*([\d,]+)\s*$")
# "(ผูกมัด)" = bound; optional in names (Dalif 2026-11-13) -> ignored when comparing names
BOUND_TAG = re.compile(r"\(\s*ผูกมัด\s*\)")


def text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).replace("\t", " ").strip()


def to_int(v):
    """Return an exact int, or None when the cell is not a whole number.

    E-notation text (e.g. "7.03688E+13") is rejected on purpose: the digits
    after the 6th were already lost when the sheet rounded the number.
    """
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v.is_integer() and abs(v) <= 2 ** 53:
            return int(v)
        return None
    s = text(v).replace(",", "")
    if INT_TEXT.match(s):
        return int(s.split(".")[0])
    return None


def is_e_notation(v):
    return isinstance(v, str) and bool(E_NOTATION.match(v))


# words people write in an id cell when the item has no number yet
NO_ID_WORDS = {"new", "ใหม่", "tbd", "n/a", "na", "รอเลข", "รอ", "?"}


def is_no_id(v):
    return text(v).lower() in NO_ID_WORDS


def yes_no(v):
    s = text(v).lower()
    if "bind" in s or "bound" in s or "ผูก" in s:       # Character / Account bind, "Charactor Binding"
        return False
    if s in ("yes", "y", "true", "1", "ใช่", "tradable", "trade"):
        return True
    if s in ("no", "n", "false", "0", "ไม่", "bind", "bound", "character bind", "account bind",
             "char bind", "ผูกตัว"):
        return False
    return None


def yn(b):
    return "Yes" if b else "No"


def name_key(v):
    """Loose identity key for an item name.

    Ignores case, spacing, punctuation and a trailing quantity "x300", so
    "MP Potion (Lv. 3) x300" and "mp potion (lv.3)" give the same key.
    """
    s = BOUND_TAG.sub(" ", unicodedata.normalize("NFKC", text(v)).lower())
    s = QTY_SUFFIX.sub("", s)
    for rx, rep in _NAME_UNITS:      # "(15 นาที)" == "(15 min)"
        s = rx.sub(rep, s)
    return re.sub(r"[^0-9a-z฀-๿]", "", s)


_NAME_UNITS = [
    (re.compile(r"นาที|minutes?|mins?\.?"), "min"),
    (re.compile(r"ชั่วโมง|ชม\.?|hours?|hrs?\.?"), "hr"),
    (re.compile(r"วัน|days?"), "day"),
]


def qty_in_name(v):
    m = QTY_SUFFIX.search(unicodedata.normalize("NFKC", text(v)))
    return int(m.group(1).replace(",", "")) if m else None


_UNITS = [
    (re.compile(r"^(ถาวร|permanent|perm|unlimited|ไม่จำกัด)$"), None),
]
_PERIOD = re.compile(
    r"^(\d+(?:\.\d+)?)\s*(days?|d|วัน|hours?|hrs?\.?|h|ชั่วโมง|ชม\.?|minutes?|mins?\.?|m|นาที)$"
)


def period_key(v):
    """Canonical period token: 'perm', '7d', '2h', '15m'. None if unreadable."""
    s = unicodedata.normalize("NFKC", text(v)).lower().strip()
    if not s:
        return None
    for rx, _ in _UNITS:
        if rx.match(s):
            return "perm"
    m = _PERIOD.match(s)
    if not m:
        return None
    n = m.group(1).rstrip("0").rstrip(".") if "." in m.group(1) else m.group(1)
    u = m.group(2)
    if u.startswith(("d", "วัน")):
        return n + "d"
    if u.startswith(("h", "ชั่วโมง", "ชม")):
        return n + "h"
    return n + "m"


def col_letter(i):
    """0-based column index -> 'A', 'B', ... 'AA'."""
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def option_matches_qty(option, qty):
    """ItemOption carries the count either plainly (x300 -> 300) or in its low
    bits with a value above it: Raid Energy Capsule 50/100 x1 = 50<<16 | 1,
    Penetration Potion x5 = 50<<8 | 5 (= 12805)."""
    return option == qty or (option & 0xFFFF) == qty or (option & 0xFF) == qty


def full_name_key(v):
    """Like name_key but keeps the quantity: 'Protection of Veradrix x5' != '... x10'."""
    s = BOUND_TAG.sub(" ", unicodedata.normalize("NFKC", text(v)).lower())
    s = re.sub(r"\s*[x×]\s*([\d,]+)\s*$", lambda m: "x" + m.group(1).replace(",", ""), s)
    return re.sub(r"[^0-9a-z฀-๿]", "", s)


# ---- ItemKind layout, decoded from 1,500+ real items (docs/item-number-decoding.md) ----
BIND_CHAR = 0x1000        # bound (Itemmove = No), type 1
BIND_OTHER = 0x80000      # bound (Itemmove = No), type 2 — never together with 0x1000
BIND_BITS = BIND_CHAR | BIND_OTHER
EXPIRY_BIT = 0x1000000    # set only on items that have a time limit (not every timed item has it)
UPGRADE_SHIFT, UPGRADE_MASK = 13, 0x1F   # +N enhancement level, bits 13-17
UPGRADE_IN_NAME = re.compile(r"\+\s*(\d{1,2})|upgrade\s*\(\s*(\d{1,2})\s*/", re.I)


def kind_fields(kind, index):
    """Split ItemKind - ItemIndex into the parts we understand. None if not decodable."""
    if kind is None or index is None or kind < index:
        return None
    m = kind - index
    return {
        "mask": m,
        "bound": bool(m & BIND_BITS),
        "bind": "0x1000" if m & BIND_CHAR else ("0x80000" if m & BIND_OTHER else ""),
        "upgrade": (m >> UPGRADE_SHIFT) & UPGRADE_MASK,
        "expiry": bool(m & EXPIRY_BIT),
        "high": m >> 32,
    }


_PLUS_N = re.compile(r"\+\s*(\d{1,2})(?!\d)")
_SLASH_N = re.compile(r"\(\s*(\d{1,2})\s*/\s*15\s*\)")


def upgrade_in_name(name):
    """'+20' wins over '(13/15)'; other '(4 / 5)' counters (Extreme / Divine level) are ignored."""
    s = unicodedata.normalize("NFKC", text(name))
    m = _PLUS_N.search(s) or _SLASH_N.search(s)
    return int(m.group(1)) if m else None


KNOWN_FLAG_BITS = BIND_BITS | (UPGRADE_MASK << UPGRADE_SHIFT) | EXPIRY_BIT


def flag_residual(mask):
    """Part of ItemKind - ItemIndex that is NOT bind / +N / expiry (unknown high flags)."""
    return mask & ~KNOWN_FLAG_BITS


_UPGRADE_TOKENS = re.compile(r"\(\s*chaos\s*upgrade\s*\+?\s*\d{1,2}\s*\)|\+\s*\d{1,2}\b|(?:chaos\s*)?upgrade\s*\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)\]?", re.I)


def strip_upgrade(name):
    """'Arcana of Chaos +14' -> 'Arcana of Chaos' (the +N is stored in ItemKind)."""
    return _UPGRADE_TOKENS.sub(" ", unicodedata.normalize("NFKC", text(name)))


def variant_key(kf):
    """Which version of an item this ItemKind is: bind type, expiry flag and unknown high flags.
    Items differing here are different products (bound / tradable / timed / event versions)."""
    return (kf["mask"] & BIND_BITS, kf["expiry"], flag_residual(kf["mask"]))


def describe_kind(kf):
    parts = ["ผูกตัว" if kf["bound"] else "เทรดได้"]
    if kf["upgrade"]:
        parts.append("+%d" % kf["upgrade"])
    if kf["expiry"]:
        parts.append("มีวันหมดอายุ")
    return " ".join(parts)


# a value written in brackets inside a name, e.g. "Penetration Potion (100) x5" or "Force Gem Package (2,000)"
VALUE_IN_NAME = re.compile(r"\(\s*\d[\d,]*\s*\)")


def has_value(name):
    return bool(VALUE_IN_NAME.search(unicodedata.normalize("NFKC", text(name))))


def without_value(name):
    return VALUE_IN_NAME.sub(" ", unicodedata.normalize("NFKC", text(name)))


# "Necklace of Agent Yul Chaos Upgrade (13/15)" — accessory upgrade level 1..15 (Dalif 2026-11-12):
# same ItemIndex for every level, ItemKind carries the level in bits 13-17.
CHAOS_UPGRADE = re.compile(r"chaos\s*upgrade\s*\(?\s*(\d{1,2})\s*/\s*(\d{1,2})", re.I)
UPGRADE_BITS = UPGRADE_MASK << UPGRADE_SHIFT


def chaos_upgrade_in_name(name):
    """(level, max) from 'Chaos Upgrade (N/15)', else None."""
    m = CHAOS_UPGRADE.search(unicodedata.normalize("NFKC", text(name)))
    return (int(m.group(1)), int(m.group(2))) if m else None


def kind_with_upgrade(kind, index, level):
    """The ItemKind this item should have at upgrade `level` (other flags kept)."""
    return index + (((kind - index) & ~UPGRADE_BITS) | ((level & UPGRADE_MASK) << UPGRADE_SHIFT))
