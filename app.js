(() => {
  "use strict";

  const DATA = window.WORDLINES_DATA;
  const FAMILIES = window.WORDLINES_FAMILIES;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[*ʰ₁]/g, "").trim();
  const slug = (s) => norm(s).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const famName = (f) => (FAMILIES[f] || { name: f }).name;
  const REL = { inh: "inherited", bor: "borrowed", unc: "uncertain link" };
  const quoted = (g) => (g ? `“${esc(g)}”` : "");

  // Served by backend/server.py: search and trees come from the Wiktionary database.
  // Opened as a file: only the hand-curated families in data.js are available.
  const LIVE = location.protocol.startsWith("http");
  const liveTarget = (lc, k, pos) => `w/${lc}/${k}${pos ? `?pos=${pos}` : ""}`;
  const targetOf = (n) => (n.ds.live ? liveTarget(n.lc, n.k) : n.id);

  /* ------------------------------------------------------------ indexing */
  const byId = new Map();
  const all = [];
  function indexDataset(ds) {
    ds.nodes = [];
    const walk = (n, parent, depth) => {
      n.ds = ds; n.parent = parent; n.depth = depth;
      n.rel = parent ? n.rel || "inh" : null;
      n.c = n.c || [];
      const base = `${ds.id}.${slug(n.l)}.${slug(n.r || n.w) || "x"}`;
      let id = base, k = 2;
      while (byId.has(id)) id = `${base}-${k++}`;
      n.id = id;
      byId.set(id, n); ds.nodes.push(n);
      if (!ds.live) all.push(n);
      n.c.forEach((ch) => walk(ch, n, depth + 1));
    };
    walk(ds.tree, null, 0);
    ds.featuredNode = ds.nodes.find((n) => n.target)
      || ds.nodes.find((n) => n.l === ds.featured.l && n.w === ds.featured.w) || ds.tree;
  }
  DATA.forEach(indexDataset);

  const liveCache = new Map();
  let liveCount = 0;
  async function loadLive(lc, k, pos) {
    const key = liveTarget(lc, k, pos);
    if (!liveCache.has(key)) {
      const posParam = pos ? `&pos=${encodeURIComponent(pos)}` : "";
      liveCache.set(key, fetch(`/api/tree?lang=${encodeURIComponent(lc)}&word=${encodeURIComponent(k)}${posParam}`).then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        Object.assign(FAMILIES, data.families);
        const ds = { id: `live${++liveCount}`, live: true, title: data.title, truncated: data.truncated, tree: data.tree, featured: {} };
        indexDataset(ds);
        return ds;
      }).catch((err) => { liveCache.delete(key); throw err; }));
    }
    return liveCache.get(key);
  }

  const ancestors = (n) => { const a = []; for (let p = n; p; p = p.parent) a.push(p); return a; };
  const pathFromRoot = (n) => ancestors(n).reverse();
  const isAncestor = (a, b) => { for (let p = b.parent; p; p = p.parent) if (p === a) return true; return false; };

  /** "cognate" if both words descend from their nearest shared ancestor purely by inheritance. */
  function relation(a, b) {
    const A = new Set(ancestors(a));
    let lca = b; while (!A.has(lca)) lca = lca.parent;
    const pure = (n) => { for (let p = n; p !== lca; p = p.parent) if (p.rel !== "inh") return false; return true; };
    return { kind: pure(a) && pure(b) ? "cognate" : "loan", lca };
  }

  /* --------------------------------------------------------------- state */
  const state = { target: null, focus: null, livingOnly: false, zoom: 1 };

  /* -------------------------------------------------------------- search */
  const q = $("#q"), results = $("#results"), fLang = $("#f-lang"), fPos = $("#f-pos");
  let hits = [], active = -1;

  // Part-of-speech codes in the database that are worth filtering by, with their labels.
  const POS = {
    noun: "noun", verb: "verb", adj: "adjective", adv: "adverb", name: "proper noun", pron: "pronoun",
    prep: "preposition", conj: "conjunction", intj: "interjection", num: "numeral", det: "determiner",
    particle: "particle", prefix: "prefix", suffix: "suffix", phrase: "phrase", root: "root",
  };
  const posLabel = (p) => POS[p] || p.replace(/_/g, " ");
  const posPill = (list) => list.slice(0, 2).map(posLabel).join(" · ") + (list.length > 2 ? ` +${list.length - 2}` : "");

  /* Filters. The language is the one remembered between visits: a part of speech left on from an
     earlier search would quietly hide most results. Opened as a file, the data has no parts of speech. */
  const LANG_KEY = "wordlines-search-language";
  const loadLanguage = () => { try { return localStorage.getItem(LANG_KEY) || ""; } catch (e) { return ""; } };
  const saveLanguage = (v) => { try { if (v) localStorage.setItem(LANG_KEY, v); else localStorage.removeItem(LANG_KEY); } catch (e) {} };
  let langFilter = loadLanguage();

  const markFilters = () => {
    fLang.classList.toggle("on", !!fLang.value);
    fPos.classList.toggle("on", !!fPos.value);
  };
  const options = (list) => list.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");

  async function initFilters() {
    let groups;
    if (LIVE) {
      $("#f-pos-wrap").hidden = false;
      fPos.insertAdjacentHTML("beforeend", options(Object.entries(POS)));
      try {
        const res = await fetch("/api/languages");
        if (!res.ok) throw new Error(`languages failed: ${res.status}`);
        const langs = await res.json();
        const byName = [...langs].sort((a, b) => a.name.localeCompare(b.name));
        groups = [["Most words", langs.slice(0, 12)], ["A–Z", byName]]
          .map(([label, list]) => [label, list.map((l) => [l.code, l.name])]);
      } catch (e) {
        groups = [];
      }
    } else {
      groups = [["A–Z", [...new Set(all.map((n) => n.l))].sort((a, b) => a.localeCompare(b)).map((l) => [l, l])]];
    }
    fLang.insertAdjacentHTML("beforeend", groups.map(([label, list]) => `<optgroup label="${esc(label)}">${options(list)}</optgroup>`).join(""));
    fLang.value = langFilter;
    if (fLang.value !== langFilter) { // the remembered language isn't available
      fLang.value = "";
      langFilter = "";
      if (groups.length) saveLanguage(""); // keep it if the list just failed to load this time
      if (q.value.trim()) renderResults();
    }
    markFilters();
  }
  function setLanguage(v) {
    if (v === langFilter) return;
    langFilter = v;
    saveLanguage(v);
    if (q.value.trim()) renderResults();
  }
  fLang.addEventListener("change", () => { markFilters(); setLanguage(fLang.value); });
  fPos.addEventListener("change", () => { markFilters(); if (q.value.trim()) renderResults(); });
  results.addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear-filters]")) return;
    e.stopPropagation(); // the button is about to be replaced, which would read as a click outside the search
    fLang.value = fPos.value = "";
    markFilters();
    langFilter = "";
    saveLanguage("");
    renderResults();
    q.focus();
  });

  function search(text) {
    const nq = norm(text);
    if (!nq) return [];
    const scored = [];
    for (const n of all) {
      if (langFilter && n.l !== langFilter) continue;
      let s = 99;
      for (const f of [norm(n.w), norm(n.r)]) {
        if (!f) continue;
        if (f === nq) s = Math.min(s, 0);
        else if (f.startsWith(nq)) s = Math.min(s, 1);
        else if (nq.length > 1 && f.includes(nq)) s = Math.min(s, 3);
      }
      if (s === 99 && nq.length > 2 && norm(n.l).startsWith(nq)) s = 5;
      if (s === 99 && nq.length > 2 && norm(n.g).split(/[^\p{L}]+/u).includes(nq)) s = 4;
      if (s < 99) scored.push([s, n.x ? 1 : 0, n]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].l.localeCompare(b[2].l));
    return scored.slice(0, 9).map((r) => ({ ...r[2], target: r[2].id, extra: `${r[2].ds.title} family` }));
  }

  let searchSeq = 0;
  async function liveSearch(text) {
    const pos = fPos.value;
    const params = new URLSearchParams({ q: text });
    if (langFilter) params.set("lang", langFilter);
    if (pos) params.set("pos", pos);
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return (await res.json()).map((h) => ({ ...h, target: liveTarget(h.lc, h.k, pos), extra: posPill(h.pos) }));
  }

  async function renderResults() {
    const text = q.value.trim();
    if (!text) { closeResults(); return; }
    const seq = ++searchSeq;
    let found, failed = false;
    if (LIVE) {
      try { found = await liveSearch(text); } catch (e) { found = []; failed = true; }
      if (seq !== searchSeq) return; // a newer keystroke already answered
    } else {
      found = search(text);
    }
    hits = found;
    active = hits.length ? 0 : -1;
    const langName = langFilter ? fLang.selectedOptions[0]?.textContent || langFilter : "";
    const filtered = fPos.value || langName;
    const noMatch = `No ${esc(fPos.value ? posLabel(fPos.value) : "word")}${langName ? ` in ${esc(langName)}` : ""} matches this search.`;
    const empty = failed
      ? "Couldn't reach the Wordlines server. Is <code>backend/server.py</code> still running?"
      : filtered
        ? `${noMatch}<button class="link-btn" data-clear-filters>Clear filters</button>`
        : LIVE
        ? "No match in the imported Wiktionary data. Try another spelling, or import more languages."
        : `No match in this prototype yet. It currently covers the <b>honey</b>, <b>tea</b>, <b>orange</b> and <b>wine</b> word families, about ${all.length} words in total.`;
    results.innerHTML = hits.length
      ? hits.map((n, i) => `
        <li role="option" id="opt-${i}" data-target="${esc(n.target)}" aria-selected="${i === active}">
          <span class="dot fam-${n.f}${n.x ? " hollow" : ""}"></span>
          <span class="rw">${esc(n.w)}${n.r ? `<span class="r">${esc(n.r)}</span>` : ""}</span>
          <span class="rm">${esc(n.l)}${n.x ? " †" : ""}${n.g ? ` · ${quoted(n.g)}` : ""}</span>
          ${n.extra ? `<span class="rds">${esc(n.extra)}</span>` : ""}
        </li>`).join("")
      : `<li class="empty">${empty}</li>`;
    results.hidden = false;
    q.setAttribute("aria-expanded", "true");
    q.setAttribute("aria-activedescendant", active >= 0 ? `opt-${active}` : "");
  }
  function closeResults() { searchSeq++; results.hidden = true; q.setAttribute("aria-expanded", "false"); hits = []; active = -1; }
  function moveActive(d) {
    if (!hits.length) return;
    active = (active + d + hits.length) % hits.length;
    [...results.children].forEach((li, i) => li.setAttribute("aria-selected", i === active));
    results.children[active].scrollIntoView({ block: "nearest" });
    q.setAttribute("aria-activedescendant", `opt-${active}`);
  }

  q.addEventListener("input", renderResults);
  q.addEventListener("focus", () => q.value.trim() && renderResults());
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); go(hits[active].target); }
    else if (e.key === "Escape") { closeResults(); q.blur(); }
  });
  document.addEventListener("click", (e) => { if (!$("#search").contains(e.target)) closeResults(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); q.focus(); q.select();
    }
  });

  /* ------------------------------------------------------------- routing */
  function go(id) {
    closeResults();
    const h = "#" + encodeURIComponent(id);
    if (location.hash === h) route(); else location.hash = h;
  }
  let routeSeq = 0;
  async function route() {
    const seq = ++routeSeq;
    closeResults();
    const id = decodeURIComponent(location.hash.slice(1));
    let n = byId.get(id);
    const live = id.match(/^w\/([^/]+)\/(.+?)(?:\?pos=([a-z_]+))?$/);
    if (!n && live && LIVE) {
      q.value = live[2];
      q.blur();
      document.body.classList.add("loading");
      let ds = null, failed = false;
      try { ds = await loadLive(live[1], live[2], live[3]); } catch (e) { failed = true; }
      document.body.classList.remove("loading");
      if (seq !== routeSeq) return; // the user navigated elsewhere while this loaded
      if (!ds) {
        showLanding();
        q.focus();
        renderNotice(failed ? "Couldn't reach the Wordlines server. Is <code>backend/server.py</code> still running?"
          : `No etymology data for <b>${esc(live[2])}</b> yet.`);
        return;
      }
      n = ds.featuredNode;
    }
    if (!n) { showLanding(); return; }
    q.value = n.w;
    q.blur();
    showResult(n);
  }
  function renderNotice(html) {
    results.innerHTML = `<li class="empty">${html}</li>`;
    results.hidden = false;
  }
  window.addEventListener("hashchange", route);
  $("#home").addEventListener("click", () => { history.pushState("", "", location.pathname + location.search); q.value = ""; showLanding(); });

  /* ------------------------------------------------------------ landing */
  function renderLanding() {
    $("#stories").innerHTML = DATA.map((ds) => `
      <button class="story" data-target="${esc(ds.featuredNode.id)}">
        <h3>${esc(ds.title)}</h3>
        <p>${esc(ds.hook)}</p>
        <div class="pv">${ds.preview.map((w) => `<span>${esc(w)}</span>`).join("")}</div>
        <span class="go">Explore ${ds.nodes.length} words →</span>
      </button>`).join("");
    const tries = [["蜜", "Mandarin"], ["mead", "English"], ["chai", "English"], ["méz", "Hungarian"], ["naranja", "Spanish"], ["ღვინო", "Georgian"]];
    $("#try").innerHTML = "<span>Try:</span>" + tries.map(([w, l]) => {
      const n = all.find((x) => x.w === w && x.l === l);
      return n ? `<button class="chip fam-${n.f}" data-target="${esc(n.id)}"><span class="dot"></span>${esc(w)} <span class="muted">${esc(l)}</span></button>` : "";
    }).join("");
  }
  function showLanding() {
    document.body.classList.remove("has-result");
    $("#landing").hidden = false; $("#result").hidden = true; $("#try").hidden = false;
    state.target = null;
    document.title = "Wordlines";
  }

  /* ------------------------------------------------------------- result */
  function showResult(n) {
    const newTarget = state.target !== n;
    state.target = n; state.focus = n;
    document.body.classList.add("has-result");
    $("#landing").hidden = true; $("#result").hidden = false; $("#try").hidden = true;
    document.title = `${n.w} · Wordlines`;
    renderSummary(); renderJourney(); renderTree(newTarget); renderDetail(); renderRelated();
    if (newTarget) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function livingStats(t) {
    const living = t.ds.nodes.filter((n) => !n.x && n !== t);
    const cognate = [], loan = [];
    for (const n of living) (relation(t, n).kind === "cognate" ? cognate : loan).push(n);
    const langs = (arr) => new Set(arr.map((n) => n.l).filter((l) => l !== t.l));
    const cogL = langs(cognate);
    const loanL = new Set([...langs(loan)].filter((l) => !cogL.has(l)));
    const fams = new Map();
    for (const n of t.ds.nodes) if (!n.x) fams.set(n.f, (fams.get(n.f) || 0) + 1);
    return { living, cognate, loan, total: cogL.size + loanL.size, cogL, loanL, fams };
  }

  function renderSummary() {
    const t = state.target, root = t.ds.tree, s = livingStats(t);
    const famSorted = [...s.fams].sort((a, b) => b[1] - a[1]);
    const rootLine = t === root
      ? `This is the <b>oldest traceable form</b> of the word${root.d ? ` · ${esc(root.d)}` : ""}.`
      : `Oldest traceable ancestor: <button class="link-btn" data-focus="${esc(root.id)}">${esc(root.w)}</button> <b>${esc(root.l)}</b> ${quoted(root.g)}${root.d ? ` · ${esc(root.d)}` : ""}`;
    $("#summary").innerHTML = `
      <div class="sum-main fam-${t.f}">
        <div class="eyebrow"><span class="dot${t.x ? " hollow" : ""}"></span>${esc(t.l)}${t.x ? " (extinct)" : ""} · ${esc(famName(t.f))}</div>
        <h1 class="big-word">${esc(t.w)}${t.r ? `<span class="big-roman">${esc(t.r)}</span>` : ""}</h1>
        ${t.g ? `<p class="gloss">${quoted(t.g)}</p>` : ""}
        <div class="root-line">${rootLine}</div>
      </div>
      <div class="sum-stats">
        <div class="stat-big"><span class="num">${s.total}</span><span class="lbl">other living languages have a word related to this one</span></div>
        <div class="stat-row">
          <div class="stat"><span class="n">${s.cogL.size}</span>share a true cognate</div>
          <div class="stat"><span class="n">${s.loanL.size}</span>are linked only by borrowing</div>
          <div class="stat"><span class="n">${s.fams.size}</span>language ${s.fams.size === 1 ? "family" : "families"}</div>
        </div>
        <div>
          <div class="fambar" aria-hidden="true">${famSorted.map(([f, c]) => `<span class="fam-${f}" style="flex:${c}" title="${esc(famName(f))}"></span>`).join("")}</div>
          <div class="famlegend" style="margin-top:10px">${famSorted.map(([f, c]) => `<span class="fam-${f}"><span class="dot"></span><b>${esc(famName(f))}</b> ${c}</span>`).join("")}</div>
        </div>
      </div>`;
  }

  const arrow = `<svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 6h29m-5-4.5L30 6l-5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function renderJourney() {
    const t = state.target, path = pathFromRoot(t);
    $("#steps").innerHTML = path.map((n, i) => `
      ${i ? `<li class="hop ${n.rel}" aria-label="${REL[n.rel]}">${arrow}<span>${n.rel === "inh" ? "inherited" : n.rel === "bor" ? "borrowed" : "uncertain"}</span></li>` : ""}
      <li class="step fam-${n.f}${n === t ? " is-target" : ""}">
        <button data-focus="${esc(n.id)}"><span class="sw">${esc(n.w)}${n.r ? `<i>${esc(n.r)}</i>` : ""}</span><span class="sl">${esc(n.l)}${n.x ? " †" : ""}</span></button>
      </li>`).join("");
  }

  /* ---------------------------------------------------------------- tree */
  const ctx = document.createElement("canvas").getContext("2d");
  function textW(str, font) { ctx.font = font; return ctx.measureText(str).width; }
  function labelW(n, isTarget) {
    let w = textW(n.w, `600 ${isTarget ? 15 : 13.5}px Inter, sans-serif`);
    if (n.r) w += 5 + textW(n.r, "italic 12px Inter, sans-serif");
    w += 7 + textW(n.l + (n.x ? " †" : ""), "11.5px Inter, sans-serif");
    return w + 4;
  }
  const comb = (a, b) => (a === "unc" || b === "unc" ? "unc" : a === "bor" || b === "bor" ? "bor" : "inh");

  /** Build the displayed tree; in living-only mode, extinct intermediates are collapsed into their children's edges. */
  function build(n, keep) {
    const kids = n.c.flatMap((c) => build(c, keep));
    if (state.livingOnly && n.x && n.parent && !keep.has(n))
      return kids.map((k) => ({ ...k, rel: comb(n.rel, k.rel), via: [n, ...k.via] }));
    return [{ node: n, rel: n.rel, children: kids, via: [] }];
  }

  const ROW = 30;
  let treeGeom = null;
  function renderTree(recenter) {
    const t = state.target, keep = new Set(pathFromRoot(t));
    const [root] = build(t.ds.tree, keep);
    const nodes = [];
    let leaves = 0;
    (function lay(d, depth) {
      d.depth = depth; nodes.push(d);
      if (!d.children.length) d.yi = leaves++;
      else { d.children.forEach((c) => lay(c, depth + 1)); d.yi = (d.children[0].yi + d.children[d.children.length - 1].yi) / 2; }
    })(root, 0);

    nodes.forEach((d) => { d.lw = labelW(d.node, d.node === t); d.leaf = !d.children.length; });
    const internal = nodes.filter((d) => !d.leaf);
    const maxInternal = internal.length ? Math.max(...internal.map((d) => d.lw)) : 0;
    const colW = Math.min(340, Math.max(170, maxInternal + 40));
    const mL = (root.leaf ? 0 : root.lw) + 28, mT = 30;
    nodes.forEach((d) => { d.x = mL + d.depth * colW; d.y = mT + d.yi * ROW; });
    const W = Math.max(...nodes.map((d) => (d.leaf ? d.x + 14 + d.lw : d.x + 12))) + 24;
    const H = mT + Math.max(0, leaves - 1) * ROW + 26;

    const links = [];
    for (const d of nodes) for (const c of d.children) {
      const onPath = keep.has(d.node) && keep.has(c.node);
      const mx = (d.x + c.x) / 2;
      const via = c.via.length ? ` via ${c.via.map((v) => v.l).join(", ")}` : "";
      links.push({ onPath, svg: `<path class="link ${c.rel}${onPath ? " path" : ""}" d="M${d.x},${d.y}C${mx},${d.y} ${mx},${c.y} ${c.x},${c.y}"><title>${esc(REL[c.rel] + via)}</title></path>` });
    }
    links.sort((a, b) => a.onPath - b.onPath); // draw highlighted path last (on top)

    const nodeSvg = nodes.map((d) => {
      const n = d.node, isT = n === t, onPath = keep.has(n);
      const tx = d.leaf ? 12 : -10, ty = d.leaf ? 4.5 : -9;
      const cls = `node fam-${n.f}${n.x ? " extinct" : ""}${onPath ? " onpath" : ""}${isT ? " target" : ""}${n === state.focus ? " focus" : ""}`;
      return `<g class="${cls}" data-focus="${esc(n.id)}" transform="translate(${d.x},${d.y})" tabindex="0" role="button" aria-label="${esc(`${n.w} ${n.r || ""}, ${n.l}`)}">
        <circle class="halo" r="14"/>${isT ? `<circle class="ring" r="11.5"/>` : ""}
        <circle class="dot-c" r="${isT ? 7 : onPath ? 6 : 5}"/>
        <text x="${tx}" y="${ty}" text-anchor="${d.leaf ? "start" : "end"}"><tspan class="w">${esc(n.w)}</tspan>${n.r ? `<tspan class="r" dx="5">${esc(n.r)}</tspan>` : ""}<tspan class="l" dx="7">${esc(n.l)}${n.x ? " †" : ""}</tspan></text>
      </g>`;
    }).join("");

    const z = state.zoom;
    $("#tree-scroll").innerHTML = `<svg width="${W * z}" height="${H * z}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Family tree of ${esc(t.ds.title)} words">
      <g>${links.map((l) => l.svg).join("")}</g><g>${nodeSvg}</g></svg>`;
    $("#tree-title").textContent = t.ds.live
      ? `The ${t.ds.title} family tree${t.ds.truncated ? ` (first ${t.ds.nodes.length} words)` : ""}`
      : `The ${t.ds.title.toLowerCase()} family tree`;
    treeGeom = { pos: new Map(nodes.map((d) => [d.node, d])), W, H };
    $("#zreset").textContent = Math.round(z * 100) + "%";
    if (recenter) scrollTreeTo(t, false);
  }

  function scrollTreeTo(n, smooth = true) {
    const d = treeGeom && treeGeom.pos.get(n);
    if (!d) return;
    const sc = $("#tree-scroll"), z = state.zoom;
    const x = d.x * z, y = d.y * z;
    const visible = x > sc.scrollLeft + 60 && x < sc.scrollLeft + sc.clientWidth - 160 && y > sc.scrollTop + 30 && y < sc.scrollTop + sc.clientHeight - 30;
    if (visible) return;
    // keep as much of the left (ancestor) side visible as possible while showing the node and its label
    const left = Math.max(0, Math.min(x - 80, x + 240 - sc.clientWidth));
    sc.scrollTo({ left, top: y - sc.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
  }

  function setFocus(n) {
    if (!n) return;
    if (state.livingOnly && treeGeom && !treeGeom.pos.has(n)) { state.livingOnly = false; $("#living").checked = false; renderTree(false); }
    state.focus = n;
    document.querySelectorAll(".node.focus").forEach((g) => g.classList.remove("focus"));
    const g = document.querySelector(`.node[data-focus="${CSS.escape(n.id)}"]`);
    if (g) g.classList.add("focus");
    renderDetail();
    scrollTreeTo(n);
    if (window.matchMedia("(max-width: 980px)").matches) $("#detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $("#living").addEventListener("change", (e) => { state.livingOnly = e.target.checked; renderTree(true); });

  /** Zoom keeping the point under (clientX, clientY) in place; with no point, the middle of the view. */
  function setZoom(z, clientX, clientY) {
    const sc = $("#tree-scroll"), svg = sc.querySelector("svg");
    const box = sc.getBoundingClientRect(), old = state.zoom;
    const ax = clientX === undefined ? sc.clientWidth / 2 : clientX - box.left - sc.clientLeft;
    const ay = clientY === undefined ? sc.clientHeight / 2 : clientY - box.top - sc.clientTop;
    const cx = (sc.scrollLeft + ax) / old, cy = (sc.scrollTop + ay) / old;
    state.zoom = Math.min(1.6, Math.max(0.4, z));
    svg.setAttribute("width", treeGeom.W * state.zoom);
    svg.setAttribute("height", treeGeom.H * state.zoom);
    sc.scrollLeft = cx * state.zoom - ax;
    sc.scrollTop = cy * state.zoom - ay;
    $("#zreset").textContent = Math.round(state.zoom * 100) + "%";
  }
  const zoomStep = (d) => setZoom((Math.round(state.zoom * 10) + d) / 10);
  $("#zin").addEventListener("click", () => zoomStep(1));
  $("#zout").addEventListener("click", () => zoomStep(-1));
  $("#zreset").addEventListener("click", () => setZoom(1));

  // Wheel and double-click zoom. Shift+wheel is left to the browser, which scrolls sideways.
  (() => {
    const sc = $("#tree-scroll");
    sc.addEventListener("wheel", (e) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      setZoom(state.zoom * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY); // ctrlKey: trackpad pinch
    }, { passive: false });
    sc.addEventListener("dblclick", (e) => {
      if (!e.target.closest(".node")) setZoom(state.zoom * (e.shiftKey ? 1 / 1.5 : 1.5), e.clientX, e.clientY);
    });
  })();

  // drag-to-pan
  (() => {
    const sc = $("#tree-scroll");
    let drag = null;
    sc.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(".node")) return;
      drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
      sc.classList.add("dragging");
    });
    window.addEventListener("pointermove", (e) => { if (drag) { sc.scrollLeft = drag.l - (e.clientX - drag.x); sc.scrollTop = drag.t - (e.clientY - drag.y); } });
    window.addEventListener("pointerup", () => { drag = null; sc.classList.remove("dragging"); });
  })();

  /* -------------------------------------------------------------- detail */
  function renderDetail() {
    const n = state.focus, t = state.target;
    let relHtml = "";
    if (n !== t) {
      const tw = `<b>${esc(t.w)}</b>`;
      if (isAncestor(n, t)) relHtml = `An <b>ancestor</b> of ${tw}.`;
      else if (isAncestor(t, n)) {
        const r = relation(t, n);
        relHtml = r.kind === "cognate" ? `A <b>descendant</b> of ${tw}.` : `Comes from ${tw}, but <b>through borrowing</b>.`;
      } else {
        const r = relation(t, n);
        relHtml = r.kind === "cognate"
          ? `A <b>true cognate</b> of ${tw}. Both were inherited from ${esc(r.lca.l)} <i>${esc(r.lca.w)}</i>.`
          : `<b>Related through borrowing</b> to ${tw}. They meet at ${esc(r.lca.l)} <i>${esc(r.lca.w)}</i>.`;
      }
    }
    const p = n.parent;
    $("#detail").innerHTML = `
      <div class="kicker">${n === t ? "Your word" : "Selected word"}</div>
      <div>
        <h2 class="dw">${esc(n.w)}${n.r ? `<i>${esc(n.r)}</i>` : ""}</h2>
      </div>
      <div class="dl fam-${n.f}"><span class="dot${n.x ? " hollow" : ""}"></span><b>${esc(n.l)}</b> · ${esc(famName(n.f))}</div>
      ${n.g ? `<p class="dg">${quoted(n.g)}</p>` : ""}
      <div class="badges">
        ${n.x ? `<span class="badge">${n.l.startsWith("Proto-") ? "Reconstructed †" : "Extinct †"}</span>` : `<span class="badge living">● Living language</span>`}
        ${n.d ? `<span class="badge">${esc(n.d)}</span>` : ""}
        ${p ? `<span class="badge ${n.rel}">${REL[n.rel]}</span>` : `<span class="badge">root of the family</span>`}
      </div>
      ${relHtml ? `<div class="relation">${relHtml}</div>` : ""}
      ${p ? `<div class="from">${n.rel === "bor" ? "Borrowed from" : n.rel === "unc" ? "Connected to" : "Inherited from"} <button class="link-btn" data-focus="${esc(p.id)}">${esc(p.w)}</button> (${esc(p.l)})</div>` : ""}
      ${n.note ? `<p class="note">${esc(n.note)}</p>` : ""}
      ${n.c.length ? `<div><div class="sub">Gave rise to</div><div class="kids">${n.c.map((c) => `<button class="chip fam-${c.f}" data-focus="${esc(c.id)}"><span class="dot${c.x ? " hollow" : ""}"></span>${esc(c.w)} <span class="muted">${esc(c.l)}</span></button>`).join("")}</div></div>` : ""}
      ${n !== t ? `<button class="btn primary" data-target="${esc(targetOf(n))}">Make this my word →</button>` : ""}`;
  }

  /* ------------------------------------------------------------- related */
  function renderRelated() {
    const t = state.target, s = livingStats(t);
    const sortFn = (a, b) => famName(a.f).localeCompare(famName(b.f)) || a.l.localeCompare(b.l);
    const chip = (n) => `<button class="chip fam-${n.f}" data-focus="${esc(n.id)}" title="${esc(n.l)}${n.g ? `: “${esc(n.g)}”` : ""}"><span class="dot"></span>${esc(n.w)}${n.r ? ` <i class="muted">${esc(n.r)}</i>` : ""} <span class="muted">· ${esc(n.l)}</span></button>`;
    $("#related").innerHTML = `
      <div class="card-head"><h2>Related words alive today</h2><p>Click any word to find it in the tree</p></div>
      <div class="rel-cols">
        <div class="rel-col">
          <h3><span class="line-sample"></span>True cognates <span class="count">${s.cognate.length}</span></h3>
          <p>Inherited from the same ancestor as <b>${esc(t.w)}</b>, with no borrowing along the way.</p>
          <div class="rel-chips">${s.cognate.sort(sortFn).map(chip).join("") || `<span class="muted" style="font-size:14px">None. Every relative of this word is connected through borrowing.</span>`}</div>
        </div>
        <div class="rel-col">
          <h3><span class="line-sample bor"></span>Linked by borrowing <span class="count">${s.loan.length}</span></h3>
          <p>Connected to <b>${esc(t.w)}</b>, but at least one language on the way took the word from another.</p>
          <div class="rel-chips">${s.loan.sort(sortFn).map(chip).join("") || `<span class="muted" style="font-size:14px">None.</span>`}</div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------ global clicks */
  document.addEventListener("click", (e) => {
    const tgt = e.target.closest("[data-target]");
    if (tgt) { go(tgt.dataset.target); return; }
    const f = e.target.closest("[data-focus]");
    if (f) setFocus(byId.get(f.dataset.focus));
  });
  document.addEventListener("keydown", (e) => {
    const g = e.target.closest && e.target.closest(".node");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setFocus(byId.get(g.dataset.focus)); }
  });

  /* --------------------------------------------------------------- theme */
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = isDark ? "light" : "dark";
    try { localStorage.setItem("wordlines-theme", root.dataset.theme); } catch (e) {}
  });

  /* ---------------------------------------------------------------- boot */
  renderLanding();
  initFilters();
  const start = () => route();
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start, start);
  window.addEventListener("resize", () => { if (state.target) scrollTreeTo(state.focus, false); });
})();
