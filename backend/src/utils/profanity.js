// src/utils/profanity.js
//
// Censors offensive words in user-written text by replacing them with '#'
// characters of the same length ("This is sh!t" -> "This is ####").
//
// Each word is matched on a normalized copy so common disguises are still
// caught: leetspeak (sh1t, @ss), stretched letters (fuuuck), and symbols or
// dots inside a word (f.u.c.k, f*ck). Only the offending word is masked; the
// rest of the text, spacing and punctuation stay as written.

// Whole-word matches only. Words with innocent meanings are deliberately left
// out (e.g. "leche" — leche flan, "hayop" — animal, "puta" is kept but
// "putahe" — a dish — is not affected because matching here is exact).
const EXACT_ROOTS = [
  // English
  'ass', 'asshole', 'bastard', 'bitch', 'bollocks', 'cock', 'crap', 'cunt', 'damn',
  'dick', 'douche', 'fag', 'faggot', 'motherfucker', 'nigga', 'nigger', 'piss',
  'prick', 'pussy', 'retard', 'slut', 'twat', 'wanker', 'whore', 'wtf', 'stfu',
  // Filipino / Taglish / regional
  'gago', 'gaga', 'gagu', 'tanga', 'tangina', 'tanginamo', 'putangina', 'putanginamo',
  'puta', 'putang', 'pota', 'potangina', 'bobo', 'boba', 'ulol', 'ulul', 'tarantado',
  'tarantada', 'lintik', 'pakyu', 'pakshet', 'punyeta', 'kupal', 'hinayupak', 'inutil',
  'pokpok', 'kantot', 'kantutan', 'tite', 'titi', 'puke', 'pekpek', 'burat', 'bilat',
  'jakol', 'salsal', 'bwisit', 'buwisit', 'ogag', 'engot', 'tangamo', 'yawa', 'pisti',
  'pakingshet', 'shet',
];

// Matched at the START of a word too, to catch suffixes:
// "fucking", "bullshitting", "putanginaaa", "gagong".
const PREFIX_ROOTS = [
  'fuck', 'fuk', 'fck', 'fcuk', 'phuck', 'shit', 'bullshit', 'bitch', 'motherfuck',
  'asshole', 'dumbass', 'jackass', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'nigg',
  'putangina', 'tangina', 'putragis', 'kingina', 'tarantad', 'hinayupak', 'kantot',
  'punyeta', 'ulol', 'gago',
];

// Clean words that merely start with a prefix root.
const SAFE_WORDS = new Set([
  'dickens', 'dickinson', 'niggle', 'niggles', 'niggling', 'shitake', 'pussycat', 'pussywillow',
]);

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '+': 't' };

const collapse = w => w.replace(/(.)\1+/g, '$1');

const EXACT = new Set(EXACT_ROOTS);
// Stretched-letter versions ("fuuuck", "gaaago"). Only roots that stay at
// least 4 letters long after collapsing are used, so "ass" -> "as" can never
// turn ordinary words like "as" into matches.
const COLLAPSED_EXACT = new Set(EXACT_ROOTS.map(collapse).filter(r => r.length >= 4));
const COLLAPSED_PREFIX = PREFIX_ROOTS.map(collapse).filter(r => r.length >= 4);

function normalizeWord(word) {
  let out = '';
  for (const raw of word.toLowerCase().normalize('NFKD')) {
    const ch = LEET[raw] ?? raw;
    if (ch >= 'a' && ch <= 'z') out += ch;
  }
  return out;
}

export function isProfane(word) {
  const norm = normalizeWord(word);
  if (norm.length < 3 || SAFE_WORDS.has(norm)) return false;
  if (EXACT.has(norm) || PREFIX_ROOTS.some(root => norm.startsWith(root))) return true;
  const coll = collapse(norm);
  if (coll === norm || SAFE_WORDS.has(coll)) return false;
  return COLLAPSED_EXACT.has(coll) || COLLAPSED_PREFIX.some(root => coll.startsWith(root));
}

// "f***", "sh*t", "b*tch": visible letters plus asterisks that fit a root.
function isSymbolMasked(word) {
  if (!word.includes('*')) return false;
  const shape = word.toLowerCase().replace(/[^a-z*]/g, '');
  if (shape.replace(/\*/g, '').length === 0) return false;
  const pattern = new RegExp('^' + shape.replace(/\*/g, '[a-z]') + '$');
  return [...EXACT_ROOTS, ...PREFIX_ROOTS].some(root => root.length >= 3 && pattern.test(root));
}

// Tokens are runs of letters/digits plus the symbols people use to dodge
// filters (f*ck, sh!t, a$$, f.u.c.k).
const TOKEN = /[\p{L}\p{N}@$!*+.]+/gu;

/**
 * Masks offensive words in `text`.
 * @returns {{ text: string, flagged: boolean, count: number }}
 */
export function censorText(text) {
  let count = 0;
  const censored = String(text ?? '').replace(TOKEN, token => {
    // Sentence punctuation attached to a word ("great." / "wow!") isn't part of it.
    const core = token.replace(/^[.!]+|[.!]+$/g, '');
    if (!core) return token;
    const dotless = core.replace(/[*.]/g, '');
    const bad = isProfane(core) || (dotless !== core && isProfane(dotless)) || isSymbolMasked(core);
    if (!bad) return token;
    count += 1;
    const start = token.indexOf(core);
    return token.slice(0, start) + '#'.repeat(core.length) + token.slice(start + core.length);
  });
  return { text: censored, flagged: count > 0, count };
}
