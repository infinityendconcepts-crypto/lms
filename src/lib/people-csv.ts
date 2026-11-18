/** Small, dependency-free CSV reader for the people import forms. */
export type CsvPerson = {
  line: number;
  name: string;
  email: string;
  role: string;
  course: string;
};

export type CsvParseResult = {
  people: CsvPerson[];
  errors: string[];
};

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function columnIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) =>
    names.includes(header.toLowerCase().replace(/[^a-z0-9]/g, ""))
  );
}

/**
 * Parses a header row plus data rows. `name`, `role` and `course` are optional;
 * `email` is required. Quoted commas and escaped quotes are supported.
 */
export function parsePeopleCsv(input: string): CsvParseResult {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return { people: [], errors: [] };

  const rows = splitCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { people: [], errors: [] };

  const headers = rows[0].map((header) => header.trim());
  const emailIndex = columnIndex(headers, ["email", "emailaddress", "mail"]);
  const nameIndex = columnIndex(headers, ["name", "fullname", "person"]);
  const roleIndex = columnIndex(headers, ["role", "staffrole", "permission"]);
  const courseIndex = columnIndex(headers, ["course", "courses", "courseid", "coursetitle"]);

  if (emailIndex < 0) {
    return { people: [], errors: ["The CSV needs an `email` column."] };
  }

  const people: CsvPerson[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const email = (cells[emailIndex] ?? "").trim();
    if (!email) {
      errors.push(`Row ${i + 1}: missing email.`);
      continue;
    }
    people.push({
      line: i + 1,
      email,
      name: nameIndex >= 0 ? (cells[nameIndex] ?? "").trim() : "",
      role: roleIndex >= 0 ? (cells[roleIndex] ?? "").trim() : "",
      course: courseIndex >= 0 ? (cells[courseIndex] ?? "").trim() : "",
    });
  }

  return { people, errors };
}
