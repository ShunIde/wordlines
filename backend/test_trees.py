"""Tests for tree building, using a small database made up here (no dump needed).

Run with: python backend/test_trees.py
"""

import json
import os
import sqlite3
import tempfile
import unittest

from import_dump import INDEXES, SCHEMA, loose_key
from trees import Trees

LANGUAGES = {
    "la": {"name": "Latin", "families": [["ine", "Indo-European"]], "extinct": True, "reconstructed": False},
    "pl": {"name": "Polish", "families": [["ine", "Indo-European"]], "extinct": False, "reconstructed": False},
    "ro": {"name": "Romanian", "families": [["ine", "Indo-European"]], "extinct": False, "reconstructed": False},
    "it": {"name": "Italian", "families": [["ine", "Indo-European"]], "extinct": False, "reconstructed": False},
    "en": {"name": "English", "families": [["ine", "Indo-European"]], "extinct": False, "reconstructed": False},
    "enm": {"name": "Middle English", "families": [["ine", "Indo-European"]], "extinct": True, "reconstructed": False},
    "ang": {"name": "Old English", "families": [["ine", "Indo-European"]], "extinct": True, "reconstructed": False},
    "ine-pro": {"name": "Proto-Indo-European", "families": [["ine", "Indo-European"]], "extinct": True, "reconstructed": True},
    "gem-pro": {"name": "Proto-Germanic", "families": [["ine", "Indo-European"]], "extinct": True, "reconstructed": True},
    "nan": {"name": "Hokkien", "families": [["sit", "Sino-Tibetan"]], "extinct": False, "reconstructed": False},
}

# (id, lang, word, pos, etymology number, gloss)
ENTRIES = [
    (1, "la", "thea", "noun", None, "tea"),
    (2, "la", "herba", "noun", None, "grass"),
    (3, "ine-pro", "gʰreh₁-", "root", None, "to grow"),
    (4, "la", "pater", "noun", None, "father"),
    (5, "la", "patrem", "noun", None, "accusative singular of pater"),
    (6, "ine-pro", "ph₂tḗr", "noun", None, "father"),
    (7, "gem-pro", "hertô", "noun", None, "heart"),
    (8, "ine-pro", "ḱḗr", "noun", None, "heart"),
    (10, "ang", "sunne", "noun", None, "sun"),
    (11, "ang", "sunu", "noun", None, "son"),
    (12, "enm", "sone", "noun", None, "sun; son"),
    (13, "gem-pro", "sunnǭ", "noun", None, "sun"),
    (14, "gem-pro", "sunuz", "noun", None, "son"),
    (15, "en", "watch", "noun", 1, "a timepiece"),
    (16, "en", "watch", "verb", 2, "to look at"),
    (17, "en", "bank", "noun", 1, "an institution"),
    (18, "en", "bank", "verb", 1, "to deal with a bank"),
    (19, "en", "bank", "noun", 2, "a river's edge"),
    (20, "en", "bank", "name", 3, "a surname"),
]

# (parent lang, parent, child lang, child, rel, source, entry id)
EDGES = [
    # Latin thea, whose Descendants list holds the split phrase "herba thea" -> Polish herbata.
    ("nan", "茶", "la", "thea", "der", "etym", 1),
    ("la", "thea", "la", "herba", "inh", "desc", 1),
    ("la", "herba", "pl", "herbata", "bor", "desc", 1),
    ("la", "thea", "pl", "herbata", "bor", "desc", 1),
    ("pl", "herbata", "ro", "herbată", "bor", "desc", 1),
    ("ine-pro", "gʰreh₁-", "la", "herba", "der", "etym", 2),
    ("la", "herba", "ro", "iarbă", "inh", "desc", 2),
    # A proto-language page spelling the root differently is not a contradiction.
    ("ine-pro", "ḱḗr", "gem-pro", "hertô", "inh", "desc", 8),
    ("ine-pro", "kerd", "gem-pro", "hertô", "inh", "etym", 7),
    # Neither is a stated parent that's only an inflected form of the listing word.
    ("ine-pro", "ph₂tḗr", "la", "pater", "inh", "etym", 4),
    ("la", "pater", "it", "padre", "inh", "desc", 4),
    ("la", "patrem", "it", "padre", "inh", "etym", 4),
    # Homonyms: Old English sunne's list claims Middle English sone, whose page says sunu.
    ("gem-pro", "sunnǭ", "ang", "sunne", "inh", "etym", 10),
    ("gem-pro", "sunuz", "ang", "sunu", "inh", "etym", 11),
    ("ang", "sunne", "enm", "sone", "inh", "desc", 10),
    ("ang", "sunu", "enm", "sone", "inh", "etym", 12),
    # watch and bank: separate histories per etymology.
    ("enm", "wacche", "en", "watch", "inh", "etym", 15),
    ("enm", "wacchen", "en", "watch", "inh", "etym", 16),
    ("enm", "banke", "en", "bank", "inh", "etym", 17),
    ("enm", "bank", "en", "bank", "inh", "etym", 19),
]


class TreesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        db = os.path.join(cls.dir.name, "test.db")
        con = sqlite3.connect(db)
        con.executescript(SCHEMA)
        con.executemany("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?)",
                        [(i, lang, w, loose_key(w), pos, num, gloss, None) for i, lang, w, pos, num, gloss in ENTRIES])
        con.executemany("INSERT OR IGNORE INTO edges VALUES (?,?,?,?,?,?,?,?,?,?)",
                        [(pl, pw, loose_key(pw), cl, cw, loose_key(cw), None, rel, src, eid)
                         for pl, pw, cl, cw, rel, src, eid in EDGES])
        con.executemany("INSERT INTO languages VALUES (?,?)", [(c, l["name"]) for c, l in LANGUAGES.items()])
        con.executescript(INDEXES)
        con.commit()
        con.close()
        languages = os.path.join(cls.dir.name, "languages.json")
        with open(languages, "w", encoding="utf-8") as f:
            json.dump(LANGUAGES, f)
        cls.trees = Trees(db, languages)

    @classmethod
    def tearDownClass(cls):
        cls.trees.con.close()
        cls.dir.cleanup()

    def words(self, lang, word, pos=None):
        out = set()

        def walk(n):
            out.add((n["lc"], n["k"]))
            for c in n["c"]:
                walk(c)

        walk(self.trees.build(lang, word, pos)["tree"])
        return out

    def test_phrase_part_stays_out_of_the_family(self):
        tea = self.words("la", "thea")
        self.assertNotIn(("la", "herba"), tea)
        self.assertNotIn(("ro", "iarbă"), tea)

    def test_descendant_of_the_phrase_stays_with_the_page_word(self):
        self.assertIn(("pl", "herbata"), self.words("la", "thea"))
        self.assertIn(("ro", "herbată"), self.words("la", "thea"))
        self.assertNotIn(("pl", "herbata"), self.words("la", "herba"))
        self.assertEqual(self.trees.build("pl", "herbata")["title"], "thea")

    def test_herb_family_is_unaffected(self):
        herb = self.words("la", "herba")
        self.assertIn(("ine-pro", "gʰreh₁-"), herb)
        self.assertIn(("ro", "iarbă"), herb)

    def test_homonym_goes_to_the_parent_its_page_states(self):
        self.assertNotIn(("enm", "sone"), self.words("ang", "sunne"))
        self.assertIn(("enm", "sone"), self.words("ang", "sunu"))

    def test_respelled_proto_root_is_kept(self):
        self.assertIn(("gem-pro", "hertô"), self.words("ine-pro", "ḱḗr"))

    def test_inflected_stated_parent_is_kept(self):
        self.assertIn(("it", "padre"), self.words("la", "pater"))

    def test_part_of_speech_picks_the_history_and_gloss(self):
        verb = self.trees.build("en", "watch", "verb")
        noun = self.trees.build("en", "watch", "noun")
        self.assertEqual((verb["title"], verb["tree"]["c"][0]["g"]), ("wacchen", "to look at"))
        self.assertEqual((noun["title"], noun["tree"]["c"][0]["g"]), ("wacche", "a timepiece"))

    def test_part_of_speech_uses_links_stated_in_another_section(self):
        self.assertEqual(self.trees.build("en", "bank", "verb")["title"], "banke")

    def test_unknown_part_of_speech_falls_back(self):
        self.assertEqual(self.trees.build("en", "watch", "adv")["title"], self.trees.build("en", "watch")["title"])

    def test_search_filters(self):
        self.assertEqual({h["lc"] for h in self.trees.search("herb")}, {"la", "pl", "ro"})
        self.assertEqual([h["lc"] for h in self.trees.search("herb", lang="la")], ["la"])
        self.assertEqual(self.trees.search("watch", pos="verb")[0]["g"], "to look at")
        self.assertEqual(self.trees.search("watch", pos="adv"), [])
        self.assertEqual(self.trees.search("watch")[0]["pos"], ["noun", "verb"])

    def test_part_of_speech_filter_skips_words_without_a_page(self):
        self.assertEqual(self.trees.search("iarb", pos="noun"), [])
        self.assertEqual([h["k"] for h in self.trees.search("iarb", lang="ro")], ["iarbă"])

    def test_languages_cover_entries_and_links(self):
        codes = {l["code"] for l in self.trees.languages()}
        self.assertLessEqual({"la", "en", "ro", "pl"}, codes)


if __name__ == "__main__":
    unittest.main()
