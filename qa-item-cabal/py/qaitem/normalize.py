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


def yes_no(v):
    s = text(v).lower()
    if s in ("yes", "y", "true", "1", "ใช่"):
        return True
    if s in ("no", "n", "false", "0", "ไม่"):
        return False
    return None


def yn(b):
    return "Yes" if b else "No"


def name_key(v):
    """Loose identity key for an item name.

    Ignores case, spacing, punctuation and a trailing quantity "x300", so
    "MP Potion (Lv. 3) x300" and "mp potion (lv.3)" give the same key.
    """
    s = unicodedata.normalize("NFKC", text(v)).lower()
    s = QTY_SUFFIX.sub("", s)
    return re.sub(r"[^0-9a-z฀-๿]", "", s)


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
    s = unicodedata.normalize("NFKC", text(v)).lower()
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


def upgrade_in_name(name):
    m = UPGRADE_IN_NAME.search(unicodedata.normalize("NFKC", text(name)))
    return int(m.group(1) or m.group(2)) if m else None
