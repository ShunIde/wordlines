"""Build word-family trees from data/wordlines.db in the shape app.js draws.

A node is {w, r, l, f, g, x, rel, c} (the same fields as T() in data.js), plus
    lc      language code
    k       the word as used in URLs (no leading "*")
    target  true on the word that was asked for

The database holds a graph, not a tree: the same link is often stated on both pages, and Wiktionary
sometimes lists a word under several spellings of its parent (English "free" appears under Middle
English fre, free, freo, vre...). Each word gets exactly one parent here, picked by how directly the
link was stated (see SOURCE_RANK).
"""

import json
import os
import sqlite3
from collections import deque
from functools import lru_cache

from import_dump import loose_key, strip_marks

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "wordlines.db")
LANGUAGES = os.path.join(ROOT, "data", "languages.json")

MAX_NODES = 700
MAX_DEPTH = 40

# A link stated on the child's own etymology beats one from a parent's Descendants list, which beats
# one inferred from a later word's "from X, from Y" chain.
SOURCE_RANK = {"etym": 0, "desc": 1, "etym-chain": 2}
REL_RANK = {"inh": 0, "bor": 1, "unc": 2, "der": 3}
# app.js knows inherited / borrowed / uncertain. "der" (derived, route not stated) is shown as uncertain.
REL_OUT = {"inh": "inh", "bor": "bor", "unc": "unc", "der": "unc"}

# Wiktionary family code -> family key that styles.css has a colour for. A language is grouped under
# the first of these found in its family chain, so speculative groupings above them (Serbi-Mongolic
# above Mongolic) are ignored. Other languages are grouped under the top of their chain.
FAMILY_KEYS = {
    "ine": "ie", "sit": "st", "urj": "ural", "jpx": "jap", "qfa-kor": "kor", "aav": "aa", "afa": "afro",
    "ccs": "kart", "trk": "turk", "map": "an", "nic": "nc", "dra": "drav", "xgn": "mong",
}
# Wiktionary's placeholders for languages without a (known) family.
UNCLASSIFIED = {"qfa-not", "qfa-unc", "qfa-und", "qfa-iso", "qfa-dis", "qfa-mch"}


class Trees:
    def __init__(self, db=DB, languages=LANGUAGES):
        self.con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, check_same_thread=False)
        with open(languages, encoding="utf-8") as f:
            self.langs = json.load(f)
        self.db_lang_names = dict(self.con.execute("SELECT code, name FROM languages"))
        self.page_spellings = lru_cache(maxsize=100_000)(self._page_spellings)

    # ---------------------------------------------------------------- words
    def _page_spellings(self, lang, key):
        # No DISTINCT: it makes SQLite walk every word in the language through the entries_word index.
        rows = self.con.execute("SELECT word FROM entries WHERE word_key = ? AND lang_code = ?", (key, lang))
        return frozenset(strip_marks(word) for word, in rows)

    def word_id(self, lang, word):
        """The form that identifies a word within its language.

        Marks are ignored, because links often spell a word with marks its page title drops (Latin mēl
        lives on the page "mel"). Case is kept, because it can separate words: English "cia" is not
        "CIA". A link in a case no page uses (Old English "september") goes to the page when only one
        spelling exists.
        """
        pages = self.page_spellings(lang, loose_key(word))
        return next(iter(pages)) if len(pages) == 1 else strip_marks(word)

    # ------------------------------------------------------------ languages
    def lang(self, code):
        info = self.langs.get(code)
        if info:
            return info
        return {"name": self.db_lang_names.get(code, code), "families": [],
                "extinct": code.endswith("-pro"), "reconstructed": code.endswith("-pro")}

    def family(self, code):
        """(key, name) of the family a language is grouped and coloured under."""
        chain = self.lang(code)["families"]
        for fam, name in chain:
            if fam in FAMILY_KEYS:
                return FAMILY_KEYS[fam], name
        if not chain or chain[-1][0] in UNCLASSIFIED:
            return "other", "Other or unclassified"
        return tuple(chain[-1])

    def family_key(self, code):
        return self.family(code)[0]

    # ---------------------------------------------------------------- graph
    def parents(self, lang, key):
        # The *_key columns ignore case, so each query also returns the word's case variants.
        rows = self.con.execute(
            "SELECT parent_lang, parent_word, rel, source, entry_id, child_word FROM edges "
            "WHERE child_lang = ? AND child_key = ?", (lang, loose_key(key))).fetchall()
        rows = [(p_lang, self.word_id(p_lang, p_word), p_word, rel, source, entry_id)
                for p_lang, p_word, rel, source, entry_id, c_word in rows if self.word_id(lang, c_word) == key]
        rows = [r for r in rows if (r[0], r[1]) != (lang, key)]
        rows.sort(key=lambda r: (SOURCE_RANK[r[4]], REL_RANK.get(r[3], 9), r[5]))
        return rows

    def children(self, lang, key):
        rows = self.con.execute(
            "SELECT child_lang, child_word, child_roman, rel, source, parent_word FROM edges "
            "WHERE parent_lang = ? AND parent_key = ?", (lang, loose_key(key))).fetchall()
        return [(c_lang, self.word_id(c_lang, c_word), c_word, c_roman, rel, source)
                for c_lang, c_word, c_roman, rel, source, p_word in rows if self.word_id(lang, p_word) == key]

    def exists(self, lang, key):
        return bool(key in self.page_spellings(lang, loose_key(key)) or self.parents(lang, key) or self.children(lang, key))

    def entry_info(self, lang, key):
        """(display word, gloss, romanization) from the word's own entry, if it was imported."""
        rows = self.con.execute(
            "SELECT word, gloss, roman FROM entries WHERE word_key = ? AND lang_code = ? "
            "ORDER BY gloss IS NULL, pos = 'name', COALESCE(etym_num, 0), id", (loose_key(key), lang))
        return next((row for row in rows if self.word_id(lang, row[0]) == key), (None, None, None))

    # ----------------------------------------------------------------- tree
    def build(self, lang, word):
        """Return {"tree", "title", "truncated", "families"} for the family of (lang, word), or None."""
        target = (lang, self.word_id(lang, word))
        if not self.exists(*target):
            return None

        # 1. Walk up to the oldest ancestor. The lineage stated on one page ("from X, from Y, from Z")
        #    is followed first: those links share an entry_id, and they keep homonyms apart (Old English
        #    frēo "free" must lead to *frī, not to frēo "woman"). Past the end of a stated chain, only
        #    take links into another language: a same-language "parent" is a derivation, not an ancestor.
        up = [target]
        up_parent = {}
        display = {target: word}
        seen = {target}
        node = target
        chain_entry = None
        while len(up) < MAX_DEPTH:
            options = []
            for p_lang, p_key, p_word, rel, source, entry_id in self.parents(*node):
                if (p_lang, p_key) in seen:
                    continue
                in_chain = source != "desc" and entry_id == chain_entry
                if not in_chain and (p_lang == node[0] or (rel == "der" and node != target)):
                    continue
                options.append((not in_chain, SOURCE_RANK[source], REL_RANK.get(rel, 9), entry_id,
                                (p_lang, p_key), p_word, rel, source))
            if not options:
                break
            *_, entry_id, parent, p_word, rel, source = min(options)
            chain_entry = entry_id if source != "desc" else None
            display.setdefault(parent, p_word)
            up_parent[node] = (parent, rel)
            seen.add(parent)
            up.append(parent)
            node = parent
        root = up[-1]

        # 2. Collect the family breadth first, outward from the target's path (target, parent, ...,
        #    root), so that when a family is too big, the words kept are the ones nearest the target.
        order = list(reversed(up))
        found = set(up)
        bfs_parent = dict(up_parent)
        roman = {}
        queue = deque(up)
        truncated = False
        while queue:
            node = queue.popleft()
            for c_lang, c_key, c_word, c_roman, rel, _ in self.children(*node):
                child = (c_lang, c_key)
                if c_roman:
                    roman.setdefault(child, c_roman)
                if child in found:
                    continue
                if len(found) >= MAX_NODES:
                    truncated = True
                    continue
                found.add(child)
                display.setdefault(child, c_word)
                bfs_parent[child] = (node, rel)
                order.append(child)
                queue.append(child)

        # 3. Give every word one parent: the best-ranked link from inside the family. The target's
        #    path keeps the links it was found by. Any word whose chosen parents loop back on
        #    themselves falls back to the link it was found through, which always leads to the root.
        parent_of = {}
        for node in order[1:]:
            if node in up_parent:
                parent_of[node] = up_parent[node]
                continue
            parent_of[node] = next((((p_lang, p_key), rel) for p_lang, p_key, _, rel, _, _ in self.parents(*node)
                                    if (p_lang, p_key) in found), bfs_parent[node])
        changed = True
        while changed:
            changed = False
            for node in order[1:]:
                walk, p = {node}, parent_of[node][0]
                while p != root:
                    if p in walk:
                        if parent_of[node] != bfs_parent[node]:
                            parent_of[node] = bfs_parent[node]
                            changed = True
                        break
                    walk.add(p)
                    p = parent_of[p][0]

        # 4. Assemble nodes.
        kids = {}
        for node in order[1:]:
            kids.setdefault(parent_of[node][0], []).append(node)

        def make(node, rel):
            n_lang, n_key = node
            info = self.lang(n_lang)
            e_word, gloss, e_roman = self.entry_info(n_lang, n_key)
            w = display.get(node) or e_word or n_key
            if info["reconstructed"]:
                w = "*" + w.lstrip("*")
            out = {
                "w": w,
                "r": roman.get(node) or e_roman or "",
                "l": info["name"],
                "f": self.family_key(n_lang),
                "g": gloss or "",
                "lc": n_lang,
                "k": w.lstrip("*"),
                "c": [],
            }
            if info["extinct"]:
                out["x"] = 1
            if rel:
                out["rel"] = REL_OUT.get(rel, "unc")
            if node == target:
                out["target"] = True
            out["c"] = [make(child, parent_of[child][1]) for child in kids.get(node, [])]
            return out

        tree = make(root, None)
        sort_children(tree)

        families = {}
        for node in found:
            key, name = self.family(node[0])
            families.setdefault(key, {"name": name})
        return {"title": tree["w"], "tree": tree, "truncated": truncated, "families": families}

    # --------------------------------------------------------------- search
    def search(self, text, limit=9):
        key = loose_key(text)
        if not key:
            return []
        typed = strip_marks(text)
        hits = {}

        def add(lang, k, word, gloss, exact):
            word_id = self.word_id(lang, word)
            hit = hits.get((lang, word_id))
            if hit is None:
                info = self.lang(lang)
                hits[(lang, word_id)] = {"lc": lang, "k": word.lstrip("*"), "w": ("*" if info["reconstructed"] else "") + word.lstrip("*"),
                                         "l": info["name"], "f": self.family_key(lang), "x": int(info["extinct"]),
                                         "g": gloss or "", "exact": exact, "same_case": word_id == typed}
            elif gloss and not hit["g"]:
                hit["g"] = gloss

        upper = key + "￿"
        for lang, k, word, gloss in self.con.execute(
                "SELECT lang_code, word_key, word, gloss FROM entries WHERE word_key >= ? AND word_key < ? "
                "ORDER BY length(word_key), gloss IS NULL LIMIT 200", (key, upper)):
            add(lang, k, word, gloss, k == key)
        for lang, k, word in self.con.execute(
                "SELECT DISTINCT child_lang, child_key, child_word FROM edges WHERE child_key >= ? AND child_key < ? "
                "ORDER BY length(child_key) LIMIT 200", (key, upper)):
            add(lang, k, word, None, k == key)

        ranked = sorted(hits.values(), key=lambda h: (not h["exact"], not h["same_case"], h["x"], not h["g"], len(h["k"]), h["l"]))
        for h in ranked:
            del h["exact"], h["same_case"]
        return ranked[:limit]


def sort_children(node):
    """Bigger branches first, then by language name, so the tree reads top-down from the main lines."""
    sizes = {}

    def size(n):
        s = 1 + sum(size(c) for c in n["c"])
        sizes[id(n)] = s
        return s

    size(node)

    def sort(n):
        n["c"].sort(key=lambda c: (-sizes[id(c)], c["l"], c["w"]))
        for c in n["c"]:
            sort(c)

    sort(node)
