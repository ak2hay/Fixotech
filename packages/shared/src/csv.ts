/** RFC 4180 CSV (quoted fields, embedded commas/newlines, "" escapes). Detects `;` or tab separators from the header. */
export function parseCsv(text: string, separator?: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.slice(0, source.search(/\r?\n/) === -1 ? undefined : source.search(/\r?\n/));
  const sep = separator || ([",", ";", "\t"].map((char) => [char, firstLine.split(char).length] as const).sort((a, b) => b[1] - a[1])[0][0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/** Rows as objects keyed by normalised header (lower-case, non-alphanumerics collapsed to `_`). */
export function csvRecords(text: string, separator?: string) {
  const [header, ...rows] = parseCsv(text, separator);
  if (!header) return [];
  const keys = header.map((name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, (row[index] ?? "").trim()])) as Record<string, string>);
}

/** "1,23,456.78", "(1,200.00)", "1200 Dr", "₹ 5,000" → number; blank → 0. */
export function parseAmount(value: string | undefined | null) {
  if (!value) return 0;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text) || /\bcr\.?$/i.test(text) || text.startsWith("-");
  const digits = text.replace(/[^0-9.]/g, "");
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return 0;
  return negative ? -amount : amount;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Indian bank and Zoho exports: dd/mm/yyyy, dd-mm-yy, dd-Mon-yyyy, yyyy-mm-dd. Returns UTC midnight or null. */
export function parseIndianDate(value: string | undefined | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  }
  match = /^(\d{1,2})[ /-]([A-Za-z]{3})[a-z]*[ /-](\d{2,4})$/.exec(text);
  if (match && MONTHS[match[2].toLowerCase()] !== undefined) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(Date.UTC(year, MONTHS[match[2].toLowerCase()], Number(match[1])));
  }
  return null;
}
