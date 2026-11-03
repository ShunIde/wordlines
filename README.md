# Wordlines

Wordlines shows where a word came from and which languages still use a relative of it. You type a word in any language and get three things:

- how many living languages have a related word
- the path from the word's oldest known ancestor down to your word
- a family tree of all its relatives

The tree tells apart words that were **inherited** (true cognates) and words that were **borrowed**. That's how it can show Chinese 蜜 *mì* "honey" as a Tocharian loan that goes back to Proto-Indo-European \*médʰu, even though Chinese isn't an Indo-European language.

> **Status: Phase 0, static demo.** All data is hand-curated and covers four word families.

## Running it

Open `index.html` in a browser. There's no build step, server or install.
An internet connection is only needed for the web fonts. Without one, the page falls back to system fonts.

## Phase 0 features

### Search
- Finds words in any script (蜜, мёд, ღვინო), with or without accents (`mez` finds *méz*), and by romanization (`chay` finds чай).
- Also matches by meaning ("honey") and by language name ("Japanese").
- Suggestions show each word's language, meaning and word family. Use ↑/↓ and Enter to pick one, and press `/` from anywhere on the page to jump to the search box.
- Each word has its own URL (e.g. `index.html#honey.mandarin.mi`), so you can bookmark and share results.

### Summary
- Shows the word, its romanization, its language and family, and its meaning.
- Shows the **oldest traceable ancestor**, with an approximate date.
- Gives a **count of other living languages** that have a related word, split into:
  - **true cognates**: both words were inherited from their nearest shared ancestor, with no borrowing on either side
  - **linked only by borrowing**: at least one step on the way was a loan
- Includes a bar and legend showing which language families the living relatives belong to.

### The word's journey
- Shows each step from the root to your word, marked *inherited*, *borrowed* or *uncertain*.

### Family tree
- An interactive tree of the whole word family:
  - solid lines are inherited links, dashed lines are borrowed and dotted lines are uncertain
  - your word's path is highlighted
  - dots are colored by language family, and hollow dots mark extinct or reconstructed languages (†)
- **Living languages only** toggle: hides extinct steps in the middle of the tree and merges their links. A merged link counts as borrowed if any step it replaces was borrowed.
- Zoom (40–160%) and drag to move around. The view opens on your word.
- Hovering a link shows its type and any hidden in-between languages.

### Detail panel
- Click any word in the tree, journey or lists to see:
  - its status (living or extinct) and approximate date
  - where it came from, and how
  - a short note on anything interesting
  - the words that came from it
- It also explains how that word relates to your search word: ancestor, descendant, true cognate, or related through borrowing (with the language where the two meet).
- **Make this my word** runs the whole analysis again from the selected word.

### Related words alive today
- Lists every living relative in two groups, *True cognates* and *Linked by borrowing*. Click any of them to find it in the tree.

### Look and accessibility
- Light and dark themes. It follows your system setting, and you can switch with the button at top right.
- Works on small screens (single column, the tree scrolls inside its card).
- Usable with the keyboard, with labels for screen readers.

## Data (Phase 0)

There are 140 hand-curated words across four families, written by hand from Wiktionary and standard etymological references:

| Family | Words | What it shows |
|---|---|---|
| Honey | 52 | PIE \*médʰu: Tocharian → Chinese → Japanese/Korean/Vietnamese; Indo-Iranian → Uralic |
| Tea | 30 | *te* (sea route, via Hokkien and Dutch) vs. *cha* (land route, via Mandarin and Persian) |
| Orange | 22 | Dravidian → Sanskrit → Persian → Arabic → European languages |
| Wine | 36 | PIE \*wóyh₁nom, with uncertain links to Semitic and Kartvelian |

Dates are approximate, and disputed connections are marked *uncertain*. The data hasn't been checked line by line against sources yet, so treat individual forms as a draft.

## Project layout

```
index.html   page structure
styles.css   styling; colors are set as variables, with light and dark themes
app.js       indexing, search, relationship logic, tree layout and drawing
data.js      word-family trees and language-family list
```

Each node in `data.js` is created with `T(word, romanization, language, family, meaning, options, children)`. The options are:
- `x`: extinct
- `rel`: how the word came from its parent, either `"inh"` (inherited), `"bor"` (borrowed) or `"unc"` (uncertain)
- `d`: approximate date
- `note`: a short explanation

## Roadmap

- **Phase 1, live data:** build word-family trees on demand from Wiktionary, using its etymology templates (`{{inh}}`, `{{bor}}`) and the Descendants sections on reconstruction pages, so any word works.
- **Later ideas:** a map with a timeline of how a word spread, and a path finder that links any two words.
