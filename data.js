/*
 * Wordlines — hand-curated prototype dataset.
 *
 * Each word family is a tree. A node is created with
 *   T(word, romanization, language, familyKey, gloss, options, children)
 * options:
 *   x    : true if the language is extinct / a reconstructed proto-language
 *   rel  : how this word came from its parent — "inh" (inherited, default),
 *          "bor" (borrowed), "unc" (connection uncertain / direction unknown)
 *   d    : approximate date
 *   note : a short explanation shown in the detail panel
 *
 * Sources: Wiktionary etymology & descendant sections, Mallory & Adams,
 * Baxter & Sagart (Old Chinese). Dates are approximate; disputed links are marked.
 * In step 2 this file gets replaced by live Wiktionary data in the same shape.
 */
(function () {
  const T = (w, r, l, f, g, o = {}, c = []) => ({ w, r, l, f, g, ...o, c });

  window.WORDLINES_FAMILIES = {
    ie:   { name: "Indo-European" },
    st:   { name: "Sino-Tibetan" },
    ural: { name: "Uralic" },
    jap:  { name: "Japonic" },
    kor:  { name: "Koreanic" },
    aa:   { name: "Austroasiatic" },
    afro: { name: "Afroasiatic" },
    kart: { name: "Kartvelian" },
    turk: { name: "Turkic" },
    an:   { name: "Austronesian" },
    nc:   { name: "Niger–Congo" },
    drav: { name: "Dravidian" },
    mong: { name: "Mongolic" },
  };

  /* ------------------------------------------------------------------ HONEY */
  const honey = T("*médʰu", "", "Proto-Indo-European", "ie", "honey; mead",
    { x: 1, d: "c. 4500–2500 BCE",
      note: "One of the best-attested Indo-European roots. It meant both honey and the drink fermented from it." }, [

    T("*mətə", "", "Proto-Tocharian", "ie", "honey", { x: 1 }, [
      T("mit", "", "Tocharian B", "ie", "honey", { x: 1, d: "c. 500–800 CE",
        note: "Tocharian was the easternmost Indo-European branch, spoken in oasis cities of the Tarim Basin (today's Xinjiang) on the Silk Road." }),
      T("蜜", "*mit", "Old Chinese", "st", "honey", { x: 1, rel: "bor", d: "1st millennium BCE",
        note: "Most scholars (e.g. Pulleyblank, Mei Tsu-lin) see this as a loan from an early form of Tocharian, picked up with honey and beekeeping through the Tarim Basin. A minority propose an Iranian source instead. Chinese is not related to Indo-European, so this is a borrowing, not a cognate." }, [
        T("蜜", "mjit", "Middle Chinese", "st", "honey", { x: 1, d: "c. 600 CE" }, [
          T("蜜", "mì", "Mandarin", "st", "honey"),
          T("蜜", "mat6", "Cantonese", "st", "honey"),
          T("蜜", "bi̍t", "Hokkien", "st", "honey"),
          T("蜜", "mitsu", "Japanese", "jap", "honey; nectar", { rel: "bor",
            note: "Sino-Japanese reading, borrowed together with the Chinese character." }),
          T("밀", "mil", "Korean", "kor", "honey; wax (in compounds)", { rel: "bor",
            note: "Sino-Korean. Everyday ‘honey’ is native 꿀 kkul, but 밀 survives in words like 밀랍 millap ‘beeswax’." }),
          T("mật", "", "Vietnamese", "aa", "honey", { rel: "bor",
            note: "Sino-Vietnamese, as in mật ong ‘bee honey’." }),
        ]),
      ]),
    ]),

    T("*mádʰu", "", "Proto-Indo-Iranian", "ie", "honey; sweet drink", { x: 1 }, [
      T("मधु", "mádhu", "Sanskrit", "ie", "honey; sweet; mead", { x: 1, d: "c. 1500 BCE (Rigveda)" }, [
        T("मधु", "madhu", "Hindi", "ie", "honey (literary)", { rel: "bor",
          note: "A learned borrowing (tatsama) straight from Sanskrit. The everyday word is शहद shahad, from Arabic." }),
        T("মধু", "modhu", "Bengali", "ie", "honey", { rel: "bor",
          note: "A tatsama, borrowed directly from Sanskrit." }),
      ]),
      T("*madu", "", "Proto-Iranian", "ie", "honey; mead", { x: 1 }, [
        T("maδu", "", "Avestan", "ie", "berry wine; mead", { x: 1 }),
        T("may", "", "Middle Persian", "ie", "wine", { x: 1 }, [
          T("می", "mey", "Persian", "ie", "wine", {
            note: "The honey drink became grape wine. This is the wine of classical Persian poetry (Hafez, Khayyam)." }),
        ]),
        T("мыд", "myd", "Ossetian", "ie", "honey"),
      ]),
      T("*mete", "", "Proto-Finno-Ugric", "ural", "honey", { x: 1, rel: "bor",
        note: "Borrowed from early Indo-Iranian neighbours on the steppe. It's one of many such loans in Uralic; Finnish sata ‘hundred’ and porsas ‘piglet’ are others." }, [
        T("mesi", "", "Finnish", "ural", "nectar; honey (poetic)"),
        T("mesi", "", "Estonian", "ural", "honey"),
        T("méz", "", "Hungarian", "ural", "honey"),
      ]),
    ]),

    T("μέθυ", "méthu", "Ancient Greek", "ie", "wine; strong drink", { x: 1,
      note: "In Greek the word shifted from honey-drink to wine. Greek ‘honey’ itself is a different root, μέλι méli." }, [
      T("μεθώ", "methó", "Greek", "ie", "to get drunk", { note: "Via the ancient verb μεθύω ‘to be drunk’." }),
      T("amethyst", "", "English", "ie", "purple quartz", { rel: "bor",
        note: "Via Latin from Greek ἀμέθυστος ‘not drunk’. The stone was believed to prevent drunkenness." }),
    ]),

    T("*meduz", "", "Proto-Germanic", "ie", "mead", { x: 1 }, [
      T("medu", "", "Old English", "ie", "mead", { x: 1, note: "Beowulf's great hall is a meduheall, a ‘mead-hall’." }, [
        T("mead", "", "English", "ie", "honey wine"),
      ]),
      T("metu", "", "Old High German", "ie", "mead", { x: 1 }, [
        T("Met", "", "German", "ie", "mead"),
      ]),
      T("mede", "", "Dutch", "ie", "mead (archaic)"),
      T("mjǫðr", "", "Old Norse", "ie", "mead", { x: 1,
        note: "In Norse myth, drinking the Mead of Poetry turns anyone into a poet." }, [
        T("mjöður", "", "Icelandic", "ie", "mead"),
        T("mjöd", "", "Swedish", "ie", "mead"),
        T("mjød", "", "Danish", "ie", "mead"),
        T("mjød", "", "Norwegian", "ie", "mead"),
      ]),
    ]),

    T("*medu", "", "Proto-Balto-Slavic", "ie", "honey", { x: 1 }, [
      T("medus", "", "Lithuanian", "ie", "honey"),
      T("medus", "", "Latvian", "ie", "honey"),
      T("*medъ", "", "Proto-Slavic", "ie", "honey", { x: 1 }, [
        T("мёд", "mjod", "Russian", "ie", "honey"),
        T("медведь", "medvedʹ", "Russian", "ie", "bear", {
          note: "Literally ‘honey-eater’. It was a taboo replacement for the bear's real name, which people avoided saying." }),
        T("мед", "med", "Ukrainian", "ie", "honey"),
        T("miód", "", "Polish", "ie", "honey"),
        T("med", "", "Czech", "ie", "honey"),
        T("med", "", "Serbo-Croatian", "ie", "honey"),
        T("мед", "med", "Bulgarian", "ie", "honey"),
      ]),
    ]),

    T("*medu", "", "Proto-Celtic", "ie", "mead", { x: 1 }, [
      T("medd", "", "Welsh", "ie", "mead"),
      T("mid", "", "Old Irish", "ie", "mead", { x: 1 }),
    ]),
  ]);

  /* -------------------------------------------------------------------- TEA */
  const tea = T("荼", "*lˤa", "Old Chinese", "st", "a bitter plant; later tea", { x: 1, d: "1st millennium BCE",
    note: "Tea was first written 荼. The separate character 茶 appeared in the Tang dynasty, when tea-drinking spread across China. The reconstruction is approximate." }, [

    T("茶", "drae", "Middle Chinese", "st", "tea", { x: 1, d: "c. 600 CE" }, [
      T("茶", "chá", "Mandarin", "st", "tea", {}, [
        T("چای", "chây", "Persian", "ie", "tea", { rel: "bor",
          note: "Came overland along the Silk Road, and Persian passed it further west. The final -i may come from Chinese 茶葉 ‘tea leaves’." }, [
          T("चाय", "chāy", "Hindi", "ie", "tea", { rel: "bor" }, [
            T("chai", "", "English", "ie", "spiced milk tea", { rel: "bor",
              note: "So English ended up with both forms: tea arrived by sea, chai by land." }),
          ]),
          T("çay", "", "Turkish", "turk", "tea", { rel: "bor" }, [
            T("τσάι", "tsái", "Greek", "ie", "tea", { rel: "bor" }),
          ]),
          T("شاي", "shāy", "Arabic", "afro", "tea", { rel: "bor" }),
          T("chai", "", "Swahili", "nc", "tea", { rel: "bor",
            note: "Probably via Arabic or Hindustani traders on the Indian Ocean coast." }),
        ]),
        T("чай", "chay", "Russian", "ie", "tea", { rel: "bor",
          note: "From northern Chinese, perhaps through Mongolian or Turkic go-betweens on the caravan routes." }),
        T("цай", "tsai", "Mongolian", "mong", "tea", { rel: "bor" }),
      ]),
      T("茶", "caa4", "Cantonese", "st", "tea", {}, [
        T("chá", "", "Portuguese", "ie", "tea", { rel: "bor",
          note: "Portuguese traders in Macau took the Cantonese form. That is why Portugal says ‘cha’ while most of Western Europe says ‘te’." }),
      ]),
      T("茶", "cha", "Japanese", "jap", "tea", { rel: "bor" }),
      T("차", "cha", "Korean", "kor", "tea", { rel: "bor" }),
      T("trà", "", "Vietnamese", "aa", "tea", { rel: "bor" }),
    ]),

    T("茶", "tê", "Hokkien", "st", "tea", {
      note: "Min Chinese kept an older t- pronunciation. Hokkien was spoken in the port of Xiamen (Amoy), where Dutch merchants bought their tea." }, [
      T("teh", "", "Malay", "an", "tea", { rel: "bor" }),
      T("thee", "", "Dutch", "ie", "tea", { rel: "bor",
        note: "The Dutch East India Company dominated the 17th-century sea trade and spread the ‘te’ form around Europe." }, [
        T("tea", "", "English", "ie", "tea", { rel: "bor" }),
        T("thé", "", "French", "ie", "tea", { rel: "bor" }),
        T("Tee", "", "German", "ie", "tea", { rel: "bor" }),
        T("té", "", "Spanish", "ie", "tea", { rel: "bor" }),
        T("tè", "", "Italian", "ie", "tea", { rel: "bor" }),
        T("te", "", "Swedish", "ie", "tea", { rel: "bor" }, [
          T("tee", "", "Finnish", "ural", "tea", { rel: "bor" }),
        ]),
        T("herba thea", "", "New Latin", "ie", "tea herb", { x: 1, rel: "bor" }, [
          T("herbata", "", "Polish", "ie", "tea", { rel: "bor",
            note: "Literally ‘herb tea’. The herb- part stuck." }, [
            T("arbata", "", "Lithuanian", "ie", "tea", { rel: "bor" }),
          ]),
        ]),
      ]),
    ]),
  ]);

  /* ----------------------------------------------------------------- ORANGE */
  const orange = T("nāraṅg-", "", "Dravidian source", "drav", "orange tree", { x: 1,
    note: "The exact source is unknown. It was probably a South Indian (Dravidian) language; compare Tamil nārantam and Telugu nāriñja. Not every ‘orange’ is related: Russian апельсин means ‘apple from China’." }, [
    T("நாரத்தை", "nārattai", "Tamil", "drav", "bitter orange"),
    T("నారింజ", "nāriñja", "Telugu", "drav", "orange"),
    T("ನಾರಂಗಿ", "nāraṅgi", "Kannada", "drav", "orange"),
    T("नारङ्ग", "nāraṅga", "Sanskrit", "ie", "orange tree", { x: 1, rel: "bor" }, [
      T("*nārang", "", "Middle Persian", "ie", "orange", { x: 1, rel: "bor" }, [
        T("نارنج", "nâranj", "Persian", "ie", "bitter orange", {}, [
          T("नारंगी", "nāraṅgī", "Hindi", "ie", "orange (fruit & colour)", { rel: "bor",
            note: "From Persian نارنگی nārangi, so the word returned to India in a new form." }),
          T("ნარინჯი", "narinji", "Georgian", "kart", "bitter orange", { rel: "bor" }),
        ]),
        T("نارنج", "nāranj", "Arabic", "afro", "bitter orange", { rel: "bor",
          note: "Arabs brought the bitter orange to the Mediterranean. The sweet orange came later with Portuguese traders, and Arabic calls it برتقال burtuqāl, ‘Portugal’." }, [
          T("naranja", "", "Spanish", "ie", "orange", { rel: "bor", note: "Via Andalusian Arabic." }),
          T("laranja", "", "Portuguese", "ie", "orange", { rel: "bor" }),
          T("taronja", "", "Catalan", "ie", "orange", { rel: "bor" }),
          T("νεράντζι", "nerántzi", "Greek", "ie", "bitter orange", { rel: "bor", note: "Via Medieval Greek." }),
          T("narancia", "", "Old Italian", "ie", "orange", { x: 1, rel: "bor" }, [
            T("arancia", "", "Italian", "ie", "orange", {
              note: "una narancia was heard as un'arancia, and the n- was lost." }),
            T("narancs", "", "Hungarian", "ural", "orange", { rel: "bor" }),
          ]),
          T("orenge", "", "Old French", "ie", "orange", { x: 1, rel: "bor",
            note: "Probably via Italian or Provençal. The n- was lost (une narenge → une orenge), and the vowel was probably influenced by or ‘gold’." }, [
            T("orange", "", "French", "ie", "orange"),
            T("orange", "", "English", "ie", "orange (fruit; later the colour)", { rel: "bor",
              note: "The fruit's name came first. English only started using it for the colour in the 1500s; before that it was ‘yellow-red’." }),
            T("Orange", "", "German", "ie", "orange", { rel: "bor" }),
            T("oranje", "", "Dutch", "ie", "orange", { rel: "bor" }),
          ]),
        ]),
      ]),
    ]),
  ]);

  /* ------------------------------------------------------------------- WINE */
  const wine = T("*wóyh₁nom", "", "Proto-Indo-European", "ie", "wine", { x: 1, d: "c. 4000 BCE",
    note: "Scholars disagree on whether this is a native Indo-European word or an old Mediterranean/Near Eastern ‘travelling word’ (Wanderwort). Winemaking began in the Caucasus and Near East, so the word may have travelled with the drink." }, [
    T("wiyana-", "", "Hittite", "ie", "wine", { x: 1, d: "c. 1600 BCE" }),
    T("οἶνος", "oînos", "Ancient Greek", "ie", "wine", { x: 1,
      note: "Mycenaean Greek wrote it wo-no. The w- sound was lost later." }, [
      T("οίνος", "oínos", "Greek", "ie", "wine (formal; everyday word is κρασί)"),
      T("oenology", "", "English", "ie", "the study of wine", { rel: "bor" }),
    ]),
    T("գինի", "gini", "Armenian", "ie", "wine", { note: "Regular Armenian sound changes turned *w- into g-." }),
    T("verë", "", "Albanian", "ie", "wine"),
    T("vīnum", "", "Latin", "ie", "wine", { x: 1 }, [
      T("vino", "", "Italian", "ie", "wine"),
      T("vino", "", "Spanish", "ie", "wine"),
      T("vinho", "", "Portuguese", "ie", "wine"),
      T("vin", "", "French", "ie", "wine", {}, [
        T("vinegar", "", "English", "ie", "vinegar", { rel: "bor",
          note: "From Old French vinaigre, literally ‘sour wine’." }),
      ]),
      T("vin", "", "Romanian", "ie", "wine"),
      T("vi", "", "Catalan", "ie", "wine"),
      T("*wīną", "", "Proto-Germanic", "ie", "wine", { x: 1, rel: "bor",
        note: "Germanic tribes got wine from Roman traders, so they borrowed the word too. That's why it isn't inherited in Germanic." }, [
        T("wine", "", "English", "ie", "wine"),
        T("Wein", "", "German", "ie", "wine"),
        T("wijn", "", "Dutch", "ie", "wine"),
        T("vin", "", "Swedish", "ie", "wine", {}, [
          T("viini", "", "Finnish", "ural", "wine", { rel: "bor" }),
        ]),
        T("vin", "", "Danish", "ie", "wine"),
        T("vín", "", "Icelandic", "ie", "wine"),
      ]),
      T("*vino", "", "Proto-Slavic", "ie", "wine", { x: 1, rel: "bor",
        note: "Probably via Germanic (compare Gothic wein)." }, [
        T("вино", "vino", "Russian", "ie", "wine"),
        T("wino", "", "Polish", "ie", "wine"),
        T("víno", "", "Czech", "ie", "wine"),
        T("vino", "", "Serbo-Croatian", "ie", "wine"),
        T("вино", "vino", "Bulgarian", "ie", "wine"),
      ]),
      T("gwin", "", "Welsh", "ie", "wine", { rel: "bor" }),
      T("fíon", "", "Irish", "ie", "wine", { rel: "bor", note: "Via Old Irish fín." }),
    ]),
    T("*wayn-", "", "Proto-Semitic", "afro", "wine; vine", { x: 1, rel: "unc",
      note: "Clearly connected to the Indo-European word, but nobody knows who borrowed from whom, or whether both took it from a third, lost language." }, [
      T("יין", "yayin", "Hebrew", "afro", "wine"),
      T("ወይን", "wäyn", "Amharic", "afro", "grapes; vine"),
    ]),
    T("*ɣwino", "", "Proto-Kartvelian", "kart", "wine", { x: 1, rel: "unc",
      note: "Georgia has the oldest known evidence of winemaking (c. 6000 BCE). Some have suggested the word spread outward from the Caucasus." }, [
      T("ღვინო", "ghvino", "Georgian", "kart", "wine"),
    ]),
  ]);

  window.WORDLINES_DATA = [
    { id: "honey", title: "Honey", tree: honey,
      hook: "How a Bronze Age word for honey crossed the Silk Road into Chinese, then on to Japan, Korea and Vietnam.",
      preview: ["蜜", "mead", "мёд", "méz", "madhu"],
      featured: { l: "Mandarin", w: "蜜" } },
    { id: "tea", title: "Tea", tree: tea,
      hook: "Te or cha? The form a language uses shows whether its tea came by sea or overland.",
      preview: ["茶", "tea", "chai", "çay", "herbata"],
      featured: { l: "English", w: "tea" } },
    { id: "orange", title: "Orange", tree: orange,
      hook: "From South India to Spain via Persia and Arabia, losing an n- along the way.",
      preview: ["नारङ्ग", "naranja", "orange", "arancia"],
      featured: { l: "English", w: "orange" } },
    { id: "wine", title: "Wine", tree: wine,
      hook: "Indo-European, Semitic and Georgian all share this word, and nobody knows who had it first.",
      preview: ["vīnum", "οἶνος", "ღვინო", "יין", "wine"],
      featured: { l: "English", w: "wine" } },
  ];
})();
