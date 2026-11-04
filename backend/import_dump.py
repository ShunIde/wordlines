"""Import a Wiktextract (kaikki.org) dump into a SQLite database of etymology links.

Usage:
    python backend/import_dump.py                      # default language subset
    python backend/import_dump.py --langs en la grc    # extra languages (proto-languages are always kept)
    python backend/import_dump.py --all                # every language

The database holds three tables:
    languages  code -> name
    entries    one row per (word, language, part of speech, etymology) in the imported languages
    edges      parent -> child links, from two sources:
                 etym        the entry's direct ancestor, from its etymology templates
                 etym-chain  further ancestors listed in the same etymology ("from X, from Y, from Z")
                 desc        the entry's Descendants section (these may point at words in any language)

Words are stored without the leading "*" of reconstructions. `*_key` columns hold a loose form
(no diacritics, casefolded) because links often spell a word with marks its page title drops
(Latin mēl lives on the page "mel").
"""

import argparse
import gzip
import json
import os
import sqlite3
import sys
import time
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DUMP = os.path.join(ROOT, "data", "raw-wiktextract-data.jsonl.gz")
DEFAULT_DB = os.path.join(ROOT, "data", "wordlines.db")

# Proto-languages (codes ending in "-pro") are always imported: their Descendants sections are
# what connect words across languages.
DEFAULT_LANGS = ["en", "enm", "ang", "la", "grc"]

# Etymology template name -> link type.
LINEAGE = {
    "inh": "inh", "inh+": "inh", "inh-lite": "inh",
    "bor": "bor", "bor+": "bor", "bor-lite": "bor", "lbor": "bor", "slbor": "bor", "obor": "bor", "ubor": "bor",
    "der": "der", "der+": "der", "der-lite": "der", "uder": "der",
}
# Templates that end the "from X, from Y" chain: after them the etymology is about parts, not ancestors.
CHAIN_BREAKERS = {
    "af", "affix", "compound", "com", "suffix", "suf", "prefix", "pre", "confix", "con", "blend",
    "doublet", "dbt", "clipping", "clip", "abbrev", "surf", "calque", "cal", "clq", "pcal", "sl",
    "bf", "back-form", "coin", "onomatopoeic", "onom", "univ", "short for", "ellipsis", "contraction",
}
# `etymon` template keyword -> link type.
ETYMON_KEYWORDS = {
    "inh": "inh", "bor": "bor", "lbor": "bor", "slbor": "bor", "obor": "bor", "ubor": "bor",
    "learned": "bor", "der": "der", "uder": "der",
}
# Descendant tags -> link type. Untagged descendants are inherited.
BORROWED_TAGS = {"borrowed", "learned borrowing", "learned", "semi-learned borrowing", "semi-learned",
                 "orthographic borrowing", "unadapted borrowing"}
SKIPPED_TAGS = {"calque", "partial calque", "semantic loan"}


def clean(word):
    return unicodedata.normalize("NFC", word.strip().lstrip("*"))


def strip_marks(word):
    decomposed = unicodedata.normalize("NFD", clean(word))
    return unicodedata.normalize("NFC", "".join(c for c in decomposed if not unicodedata.combining(c)))


def loose_key(word):
    return strip_marks(word).casefold()


def first_gloss(rec):
    for sense in rec.get("senses", []):
        if sense.get("glosses"):
            return sense["glosses"][0]
    return None


def romanization(rec):
    for form in rec.get("forms", []):
        if "romanization" in form.get("tags", []):
            return form.get("form")
    return None


def etymon_parent(args):
    """Parse {{etymon|LANG|:KEYWORD|lang:term<...>}}. Returns (rel, lang, term) for a single-term etymon."""
    keyword = (args.get("2") or "").lstrip(":")
    rel = ETYMON_KEYWORDS.get(keyword)
    terms = []
    i = 3
    while str(i) in args and not args[str(i)].startswith(":"):
        terms.append(args[str(i)])
        i += 1
    if not rel or len(terms) != 1 or ":" not in terms[0]:
        return None
    lang, term = terms[0].split(":", 1)
    term = term.split("<", 1)[0]
    return (rel, lang, term) if term else None


def ancestor_chain(rec):
    """Ancestors named in the etymology, nearest first, as [(rel, lang, term)].

    Consecutive lineage templates only form a chain when the text between them says so: "X, from Y"
    is a chain, but "X + Y" is a compound (both are parts, neither is the other's ancestor), and
    anything else ("X and Y", a new sentence) ends the chain.
    """
    lang = rec["lang_code"]
    text = rec.get("etymology_text") or ""
    chain = []
    etymon = None
    end = 0  # where the previous chain link's expansion ends in `text`
    for t in rec.get("etymology_templates", []):
        name, args = t.get("name"), t.get("args", {})
        if name == "etymon" and etymon is None and args.get("1") == lang:
            etymon = etymon_parent(args)
        elif name in CHAIN_BREAKERS:
            break
        elif name in LINEAGE and args.get("1") == lang:
            src, term = args.get("2"), clean(args.get("3") or "")
            if not src or not term or term == "-":
                continue
            expansion = t.get("expansion") or ""
            at = text.find(expansion, end) if expansion else -1
            if chain:
                between = text[end:at] if at >= 0 else ""
                if "+" in between:
                    if len(chain) == 1:
                        return []  # the word itself is a compound: it has no single parent
                    chain.pop()  # the previous link was one part of a compound
                    end = -1
                    break
                if at < 0 or "from" not in between.lower():
                    break
            if not chain and at > 0 and text[:at].rstrip().endswith("+"):
                return []  # "X + Y" where only Y is a lineage template: still a compound
            if at >= 0:
                end = at + len(expansion)
            if chain and (chain[-1][1], loose_key(chain[-1][2])) == (src, loose_key(term)):
                continue
            chain.append((LINEAGE[name], src, term))
    # The last link may still be the first part of a compound ("..., from X + Y" with Y not a lineage
    # template). end == -1 means a compound was already found and handled above.
    if chain and end >= 0 and text[end:end + 40].lstrip().startswith("+"):
        chain.pop()
        if not chain:
            return []
    # `etymon` is the newer, more precise template: prefer its link type for the direct parent.
    if etymon:
        rel, src, term = etymon
        if not chain:
            chain = [(rel, src, clean(term))]
        elif (chain[0][1], loose_key(chain[0][2])) == (src, loose_key(term)):
            chain[0] = (rel, chain[0][1], chain[0][2])
    return chain


def descendant_rel(item):
    tags = set(item.get("tags", [])) | set(item.get("raw_tags", []))
    if tags & SKIPPED_TAGS:
        return None
    if tags & BORROWED_TAGS:
        return "bor"
    if "uncertain" in tags:
        return "unc"
    return "inh"


def descendant_edges(parent_lang, parent_word, items, languages, out):
    for item in items:
        code, word = item.get("lang_code"), item.get("word")
        if code and code != "unknown" and item.get("lang"):
            languages.setdefault(code, item["lang"])
        if not word or not code or code == "unknown":
            # Grouping line such as "Italo-Romance:" — its children belong to the current parent.
            descendant_edges(parent_lang, parent_word, item.get("descendants", []), languages, out)
            continue
        rel = descendant_rel(item)
        if rel is None:
            continue
        word = clean(word)
        out.append((parent_lang, parent_word, code, word, rel, "desc", item.get("roman")))
        descendant_edges(code, word, item.get("descendants", []), languages, out)


SCHEMA = """
CREATE TABLE languages (code TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    lang_code TEXT NOT NULL,
    word TEXT NOT NULL,
    word_key TEXT NOT NULL,
    pos TEXT,
    etym_num INTEGER,
    gloss TEXT,
    roman TEXT
);
CREATE TABLE edges (
    parent_lang TEXT NOT NULL,
    parent_word TEXT NOT NULL,
    parent_key TEXT NOT NULL,
    child_lang TEXT NOT NULL,
    child_word TEXT NOT NULL,
    child_key TEXT NOT NULL,
    child_roman TEXT,           -- romanization given alongside the child word, if any
    rel TEXT NOT NULL,          -- inh | bor | der | unc
    source TEXT NOT NULL,       -- etym | etym-chain | desc
    entry_id INTEGER NOT NULL,  -- the entry whose page stated this link
    UNIQUE (parent_lang, parent_key, child_lang, child_key, rel, source)
);
"""

INDEXES = """
CREATE INDEX entries_word ON entries (lang_code, word);
CREATE INDEX entries_key ON entries (word_key, lang_code);
CREATE INDEX edges_child ON edges (child_lang, child_key);
CREATE INDEX edges_parent ON edges (parent_lang, parent_key);
CREATE INDEX edges_child_key ON edges (child_key);
"""


def wanted(code, langs):
    return langs is None or code in langs or code.endswith("-pro")


def run(dump, db, langs):
    tmp = db + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;" + SCHEMA)

    languages = {}
    entry_rows, edge_rows = [], []
    entry_id = 0
    lines = 0
    started = time.time()

    def flush():
        con.executemany("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?)", entry_rows)
        con.executemany(
            "INSERT OR IGNORE INTO edges VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(pl, pw, loose_key(pw), cl, cw, loose_key(cw), roman, rel, src, eid)
             for pl, pw, cl, cw, rel, src, roman, eid in edge_rows],
        )
        entry_rows.clear()
        edge_rows.clear()

    try:
        with gzip.open(dump, "rt", encoding="utf-8") as f:
            for line in f:
                lines += 1
                if lines % 500_000 == 0:
                    print(f"  {lines:,} lines, {entry_id:,} entries kept, {time.time() - started:.0f}s", flush=True)
                rec = json.loads(line)
                code, word = rec.get("lang_code"), rec.get("word")
                if not code or not word or not wanted(code, langs):
                    continue
                languages.setdefault(code, rec.get("lang") or code)
                entry_id += 1
                word = clean(word)
                entry_rows.append((entry_id, code, word, loose_key(word), rec.get("pos"),
                                   rec.get("etymology_number"), first_gloss(rec), romanization(rec)))

                child_lang, child_word = code, word
                for i, (rel, src, term) in enumerate(ancestor_chain(rec)):
                    edge_rows.append((src, term, child_lang, child_word, rel,
                                      "etym" if i == 0 else "etym-chain", None, entry_id))
                    child_lang, child_word = src, term

                desc = []
                descendant_edges(code, word, rec.get("descendants", []), languages, desc)
                edge_rows.extend(row + (entry_id,) for row in desc)

                if len(entry_rows) >= 20_000:
                    flush()
    except EOFError:
        print("warning: dump ended early (truncated file?); keeping what was read", file=sys.stderr)

    flush()
    con.executemany("INSERT INTO languages VALUES (?,?)", languages.items())
    print("building indexes...", flush=True)
    con.executescript(INDEXES)
    con.commit()
    counts = {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("languages", "entries", "edges")}
    con.close()
    os.replace(tmp, db)
    print(f"done in {time.time() - started:.0f}s: {lines:,} lines read, "
          f"{counts['entries']:,} entries, {counts['edges']:,} edges, {counts['languages']:,} languages -> {db}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dump", default=DEFAULT_DUMP, help="path to raw-wiktextract-data.jsonl.gz")
    p.add_argument("--db", default=DEFAULT_DB, help="SQLite file to (re)create")
    p.add_argument("--langs", nargs="+", default=DEFAULT_LANGS,
                   help=f"language codes to import besides proto-languages (default: {' '.join(DEFAULT_LANGS)})")
    p.add_argument("--all", action="store_true", help="import every language")
    a = p.parse_args()
    run(a.dump, a.db, None if a.all else set(a.langs))


if __name__ == "__main__":
    main()
