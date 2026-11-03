"""Build data/languages.json: name, family (with the families above it) and extinct status for every Wiktionary language code.

Usage:
    python backend/fetch_languages.py

Sources (both official APIs, a few dozen requests in total):
  - Wiktionary's language and family data modules, fetched raw. Each entry looks like
        m["en"] = { "English", 1860, "gmw-ang", ... }
    i.e. name, Wikidata item number, family code (for an etymology-only language such as
    "Late Latin", the third field is its parent language instead).
  - Wikidata, for whether a language is extinct (Wiktionary doesn't record this).
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "languages.json")
USER_AGENT = "Wordlines/0.1 (https://github.com/ShunIde/wordlines)"
WIKI = "https://en.wiktionary.org/w/index.php?action=raw&title="
API = "https://en.wiktionary.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"

# Wikidata classes (P31) that mark a language as no longer spoken.
EXTINCT_CLASSES = {
    "Q45762",     # dead language
    "Q38058796",  # extinct language
    "Q436240",    # ancient language
    "Q1747471",   # historical language
}
# Stage names that are historical even when Wikidata has no entry (e.g. etymology-only languages).
HISTORICAL_NAME = re.compile(r"^(Proto-|Pre-|Old |Middle |Ancient |Classical |Late |Early |Medieval |Archaic )")

_SEP = r',\s*(?:--[^\n]*\n\s*)*'  # a comma, then any "-- comment" lines
ENTRY = re.compile(r'^m\["([^"]+)"\]\s*=\s*\{\s*"([^"]*)"' + _SEP + r'(nil|\d+|"[^"]*")(?:' + _SEP + r'(nil|"[^"]*"))?', re.M)
RECONSTRUCTED = re.compile(r'^m\["([^"]+)"\]\s*=\s*\{(?:(?!^\}).)*?type\s*=\s*"[^"]*reconstructed', re.M | re.S)


def get(url, data=None, headers=None, attempts=4):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode("utf-8")
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
            time.sleep(5 * (attempt + 1))


def module_titles(prefix):
    q = urllib.parse.urlencode({"action": "query", "list": "allpages", "apnamespace": 828,
                                "apprefix": prefix, "aplimit": 500, "format": "json"})
    return [p["title"] for p in json.loads(get(f"{API}?{q}"))["query"]["allpages"]]


def parse(title):
    text = get(WIKI + urllib.parse.quote(title))
    out = {}
    for code, name, qid, third in ENTRY.findall(text):
        out[code] = {
            "name": name,
            "qid": f"Q{qid}" if qid.isdigit() else None,
            "parent": third.strip('"') if third and third != "nil" else None,
        }
    for code in RECONSTRUCTED.findall(text):
        if code in out:
            out[code]["reconstructed"] = True
    return out


def extinct_qids(qids):
    found = set()
    qids = sorted(qids)
    for i in range(0, len(qids), 200):
        values = " ".join(f"wd:{q}" for q in qids[i:i + 200])
        classes = " ".join(f"wd:{c}" for c in EXTINCT_CLASSES)
        query = f"SELECT DISTINCT ?l WHERE {{ VALUES ?l {{ {values} }} VALUES ?c {{ {classes} }} ?l wdt:P31 ?c . }}"
        body = urllib.parse.urlencode({"query": query}).encode()
        res = json.loads(get(SPARQL, body, {"Accept": "application/sparql-results+json",
                                             "Content-Type": "application/x-www-form-urlencoded"}))
        found.update(b["l"]["value"].rsplit("/", 1)[1] for b in res["results"]["bindings"])
    return found


def main():
    lang_titles = (["Module:languages/data/2", "Module:languages/data/exceptional"]
                   + module_titles("languages/data/3/"))
    languages, etym, families = {}, {}, {}
    for t in lang_titles:
        print("fetching", t)
        languages.update(parse(t))
    print("fetching Module:etymology languages/data")
    etym = parse("Module:etymology languages/data")
    print("fetching Module:families/data")
    families = parse("Module:families/data")

    def family_chain(fam):
        """The family and every family above it, nearest first."""
        chain = []
        while fam and fam not in chain:
            chain.append(fam)
            fam = families[fam]["parent"] if fam in families else None
        return chain

    def language_of(code, seen=()):
        """Resolve an etymology-only language to the full language it belongs to."""
        if code in languages or code not in etym or code in seen:
            return code
        parent = etym[code]["parent"]
        return language_of(parent, seen + (code,)) if parent else code

    print("querying Wikidata for extinct languages")
    qids = {v["qid"] for v in list(languages.values()) + list(etym.values()) if v["qid"]}
    dead = extinct_qids(qids)

    names = {v["name"] for v in list(languages.values()) + list(etym.values())}
    out = {}
    for code, info in list(languages.items()) + list(etym.items()):
        base = language_of(code)
        base_info = languages.get(base, {})
        fam_code = base_info.get("parent") if base in languages else base if base in families else None
        chain = family_chain(fam_code)
        reconstructed = bool(info.get("reconstructed") or base_info.get("reconstructed"))
        qid = info["qid"] or base_info.get("qid")
        # "Middle English" is a stage of English; "Middle Watut" is a living language of its own.
        stage = HISTORICAL_NAME.match(info["name"])
        stage_of_language = bool(stage) and info["name"][stage.end():] in names
        extinct = reconstructed or qid in dead or stage_of_language
        out[code] = {
            "name": info["name"],
            "families": [[f, families[f]["name"] if f in families else f] for f in chain],
            "extinct": extinct,
            "reconstructed": reconstructed,
        }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f"wrote {len(out):,} languages ({sum(v['extinct'] for v in out.values()):,} extinct) -> {OUT}")


if __name__ == "__main__":
    main()
