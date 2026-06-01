#!/usr/bin/env node
/**
 * parse-inventory.js
 * Walks the Kirstin Kennedy images folder, parses every image filename
 * using the hallmark metadata conventions, and writes inventory.csv
 * and parse-errors.txt.
 *
 * Usage:  node scripts/parse-inventory.js [images-folder]
 * Default images folder: /mnt/c/Users/Assay Surface/Desktop/Kirstin Kennedy
 */

import path from 'path';
import fs   from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGES_ROOT = process.argv[2] ||
  '/mnt/c/Users/Assay Surface/Desktop/Kirstin Kennedy';
const OUT_CSV    = path.join(__dirname, 'inventory.csv');
const OUT_ERRORS = path.join(__dirname, 'parse-errors.txt');

// ─── Mark types ─────────────────────────────────────────────────────────────
// Listed longest / most-specific first so the first match wins.
const RAW_MARK_TYPES = [
  'britannia standard mark',
  'britannia standard',          // normalises → 'britannia standard mark'
  'britannia hallmark',
  'sterling sponsor mark',
  'duty and sterling marks',
  'date letter and duty mark',
  'duty drawback mark',
  'additional mark',
  'standard mark',
  'sponsor mark',
  'sponsors mark',               // normalises → 'sponsor mark'
  'sponsor',                     // normalises → 'sponsor mark'
  "maker's mark",
  'townmark',
  'date letter',
  'dateletter',                  // normalises → 'date letter'
  'stirling mark',               // normalises → 'sterling mark' (common typo)
  'sterling mark',
  'hallmarks',                   // normalises → 'hallmark'
  'hallmark',
  'lion passant',
  'britannia mark',
  'britannia',                   // normalises → 'britannia mark'
  'duty mark',
  'assay mark',
];

function normalizeMarkType(mt) {
  mt = mt.toLowerCase().trim();
  if (mt === 'dateletter')         return 'date letter';
  if (mt === 'sponsors mark')      return 'sponsor mark';
  if (mt === 'sponsor')            return 'sponsor mark';
  if (mt === 'britannia standard') return 'britannia standard mark';
  if (mt === 'britannia')          return 'britannia mark';
  if (mt === 'stirling mark')      return 'sterling mark';
  if (mt === 'hallmarks')          return 'hallmark';
  return mt;
}

// Pre-compile regexes for each mark type (longest-first order retained).
// Each regex matches the mark type as a whole word/phrase: preceded by start,
// space, or underscore; followed by end, space, or underscore.
const MARK_REGEXES = RAW_MARK_TYPES.map(mt => {
  const escaped = mt
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex special chars
    .replace(/'/g, "['\u2019]");              // accept curly apostrophe too
  return {
    raw: mt,
    // Prefix: start of string, space, underscore, or comma
    // Suffix: NOT followed by a letter (allows year glued directly to mark type,
    //         e.g. "sterling mark1631-32", while blocking "hallmark" in "hallmarks")
    re: new RegExp(`(?:^|[\\s_,])(${escaped})(?![a-zA-Z])`, 'gi'),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slug(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getCentury(year) {
  // returns e.g. '17th-century'
  const c = Math.floor((year - 1) / 100) + 1;
  const ord = [,'st','nd','rd'][c % 10] && c % 100 < 11 || c % 100 > 13
    ? [,'st','nd','rd'][c % 10] || 'th'
    : 'th';
  return `${c}${ord}-century`;
}

// ─── Suffix detection ────────────────────────────────────────────────────────
// Checks the END of the base string (without extension).
// Returns { imageType, imageIndex, stripped } where stripped has the suffix removed.
function detectSuffix(base) {
  let imageType  = 'primary';
  let imageIndex = 0;
  let working    = base;

  // _image N  (or -image N, space image N)
  let m = working.match(/[_ ]image[_ ](\d+)$/i);
  if (m) {
    imageIndex = parseInt(m[1], 10);
    working    = working.slice(0, -m[0].length);
    return { imageType, imageIndex, stripped: working };
  }

  // dimensions / dimension / dims / dim / measured
  // Accept underscore, space, or hyphen as the separator before keyword.
  const dimRe = /[_ \-](?:dimensions?|dims?|measured)(\s*\(\d+\))?$/i;
  m = working.match(dimRe);
  if (m) {
    imageType = 'dimensions';
    working   = working.slice(0, -m[0].length);
    return { imageType, imageIndex, stripped: working };
  }

  // _detail_N or _detail N
  m = working.match(/[_ ]detail[_ ](\d+)$/i);
  if (m) {
    imageIndex = parseInt(m[1], 10);
    working    = working.slice(0, -m[0].length);
    return { imageType, imageIndex, stripped: working };
  }

  return { imageType, imageIndex, stripped: working };
}

// ─── Year extraction ─────────────────────────────────────────────────────────
// Finds the LAST year range/year in the string.
// Returns { yearRange, yearStart, before, after } or null.
// NOTE: uses (?<![0-9]) / (?![0-9]) instead of \b because underscore is a
// word character in JS regex, so \b fails for patterns like _1732-33.
function extractYear(s) {
  // c.YYYY
  let m = s.match(/(?<![0-9])c\.(\d{4})(?![0-9])/i);
  if (m) {
    return {
      yearRange : `c.${m[1]}`,
      yearStart : parseInt(m[1], 10),
      before    : s.slice(0, m.index),
      after     : s.slice(m.index + m[0].length),
    };
  }

  // YYYY[_-]YY{1,4}  — 4-digit start year followed by 1-4 digit end
  // Uses global match; keep the LAST occurrence (closest to the end)
  const rangeRe = /(?<![0-9])(\d{4})[_\-](\d{1,4})(?![0-9])/g;
  let last = null, match;
  while ((match = rangeRe.exec(s)) !== null) last = match;
  if (last) {
    return {
      yearRange : `${last[1]}-${last[2]}`,
      yearStart : parseInt(last[1], 10),
      before    : s.slice(0, last.index),
      after     : s.slice(last.index + last[0].length),
    };
  }

  // Single 4-digit year in plausible range (1400–2030)
  const singleRe = /(?<![0-9])(1[4-9]\d{2}|20[0-2]\d)(?![0-9])/g;
  last = null;
  while ((match = singleRe.exec(s)) !== null) last = match;
  if (last) {
    return {
      yearRange : last[1],
      yearStart : parseInt(last[1], 10),
      before    : s.slice(0, last.index),
      after     : s.slice(last.index + last[0].length),
    };
  }

  return null;
}

// ─── Mark type detection ─────────────────────────────────────────────────────
// Searches `s` for a recognised mark type, returning the RIGHTMOST match
// of the FIRST (most-specific) pattern that matches.
function findMarkType(s) {
  for (const { raw, re } of MARK_REGEXES) {
    re.lastIndex = 0;             // reset because re has 'g' flag
    let last = null, m;
    while ((m = re.exec(s)) !== null) last = m;
    if (last) {
      const startOffset = /^[_ ]/.test(last[0]) ? 1 : 0;
      return {
        mark      : normalizeMarkType(last[1]),
        markStart : last.index + startOffset,
        markEnd   : last.index + startOffset + last[1].length,
      };
    }
  }
  return null;
}

// ─── Parse one filename ───────────────────────────────────────────────────────
function parseFilename(filename, collection, filepath, fallbackYearRange) {
  const extMatch = filename.match(/\.(jpg|jpeg|png)$/i);
  if (!extMatch) return { error: `Not an image: ${filename}` };

  const base = filename.slice(0, -extMatch[0].length);

  // 1. Detect suffix (dimensions / image N / etc.)
  const { imageType, imageIndex, stripped } = detectSuffix(base);

  // 2. Extract year
  let yearInfo = extractYear(stripped);

  if (!yearInfo && fallbackYearRange) {
    // Use folder year; no year found in filename
    const fm = fallbackYearRange.match(/(\d{4})[_\-](\d{4})/);
    if (fm) {
      yearInfo = {
        yearRange : `${fm[1]}-${fm[2]}`,
        yearStart : parseInt(fm[1], 10),
        before    : stripped,   // whole string is pre-year content
        after     : '',
        fromFolder: true,
      };
    }
  }

  // 3. Find mark type in the full stripped string (handles both orderings:
  //    [object mark year] and [object year mark] as seen in KK work files).
  const markResult = findMarkType(stripped);
  if (!markResult) {
    return {
      error    : `No recognised mark type`,
      filepath,
      collection,
    };
  }

  // 4. Extract object name.
  //    Standard ordering:  [object] [mark type] [year]  → object before mark
  //    Reverse ordering:   [object] [year] [mark type]  → object before year
  //    (Reverse ordering appears in some KK work files.)
  const yearStartPos = yearInfo && !yearInfo.fromFolder
    ? yearInfo.before.length   // position where the year begins in `stripped`
    : Infinity;

  const objectRaw = yearStartPos < markResult.markStart
    ? stripped.slice(0, yearStartPos)   // year before mark → object is pre-year
    : stripped.slice(0, markResult.markStart);  // standard ordering

  const objectName = objectRaw
    .replace(/[_ ]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!objectName) {
    return {
      error    : `Could not determine object name`,
      filepath,
      collection,
    };
  }

  const yearRange = yearInfo ? yearInfo.yearRange : '';
  const yearStart = yearInfo ? yearInfo.yearStart : '';

  // 5. Build IDs
  const collSlug  = slug(collection);
  const objSlug   = slug(objectName);
  const markSlug  = slug(markResult.mark);
  const yearStr   = yearStart ? String(yearStart) : 'unknown';
  const groupId   = `${collSlug}-${objSlug}-${markSlug}-${yearStr}`;
  const cloudinaryRef = `hallmarks/${groupId}-${imageIndex}`;

  return {
    filepath,
    collection,
    object_name    : objectName,
    mark_type      : markResult.mark,
    year_range     : yearRange,
    year_start     : yearStart,
    image_type     : imageType,
    image_index    : imageIndex,
    group_id       : groupId,
    cloudinary_ref : cloudinaryRef,
  };
}

// ─── Walk the images directory ────────────────────────────────────────────────
function walkDir(dir, results, errors) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    errors.push({ file: path.relative(IMAGES_ROOT, dir), error: `Cannot read directory: ${e.message}` });
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results, errors);
    } else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) {
      const rel = path.relative(IMAGES_ROOT, fullPath);
      const parts = rel.split(path.sep);

      let collection, fallbackYear;

      if (parts[0] === 'KK work') {
        // Use "Goldsmiths Company" as the collection (parts[1])
        collection  = parts.length > 1 ? parts[1] : 'KK work';
        // Look for a year-range folder anywhere in the path hierarchy
        fallbackYear = parts.find(p => /^\d{4}[_\-]\d{4}$/.test(p)) || null;
      } else {
        collection  = parts[0];
        fallbackYear = null;
      }

      const result = parseFilename(entry.name, collection, fullPath, fallbackYear);
      if (result.error) {
        errors.push({ file: rel, error: result.error });
      } else {
        results.push(result);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const results = [];
const errors  = [];

if (!fs.existsSync(IMAGES_ROOT)) {
  console.error(`Images folder not found: ${IMAGES_ROOT}`);
  process.exit(1);
}

walkDir(IMAGES_ROOT, results, errors);

// Detect cloudinary_ref collisions within the parsed rows
const refMap = new Map();
for (const r of results) {
  const key = r.cloudinary_ref;
  if (!refMap.has(key)) refMap.set(key, []);
  refMap.get(key).push(path.relative(IMAGES_ROOT, r.filepath));
}
const collisionCount = [...refMap.values()].filter(v => v.length > 1).length;
for (const [ref, files] of refMap) {
  if (files.length > 1) {
    errors.push({
      file  : files.join(' | '),
      error : `Duplicate cloudinary_ref "${ref}" — these ${files.length} files share the same group+index; edit image_index in CSV to resolve`,
    });
  }
}

// ── Write CSV ────────────────────────────────────────────────────────────────
const CSV_COLS = [
  'filepath','collection','object_name','mark_type',
  'year_range','year_start','image_type','image_index',
  'group_id','cloudinary_ref',
];
const csvEsc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const csvRows = [
  CSV_COLS.join(','),
  ...results.map(r => CSV_COLS.map(c => csvEsc(r[c])).join(',')),
];
fs.writeFileSync(OUT_CSV, csvRows.join('\n') + '\n', 'utf8');

// ── Write errors ──────────────────────────────────────────────────────────────
const errorLines = errors.map(e => `${e.file}\n  → ${e.error}`);
fs.writeFileSync(OUT_ERRORS, errorLines.join('\n\n') + (errorLines.length ? '\n' : ''), 'utf8');

// ── Summary ───────────────────────────────────────────────────────────────────
const parseErrCount = errors.filter(e => !e.error.startsWith('Duplicate')).length;
const totalScanned  = results.length + parseErrCount;

console.log(`\nSummary`);
console.log(`  Total files scanned      : ${totalScanned}`);
console.log(`  Successfully parsed      : ${results.length}`);
console.log(`  Parse errors             : ${parseErrCount}`);
console.log(`  Cloudinary ref conflicts : ${collisionCount}`);
console.log(`\nOutput`);
console.log(`  ${OUT_CSV}`);
console.log(`  ${OUT_ERRORS}`);
