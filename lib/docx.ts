/**
 * Convert the plain-text tailored CV / cover letter into a .docx download.
 * The AI output is plain text with blank-line-separated sections, so a few
 * heuristics recover structure: first line of a CV = name, short lines
 * followed by content = section headers, "•"/"-" lines = bullets.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";

const FONT = "Calibri";
const SECTION_HEADERS =
  /^(profile|summary|professional summary|experience|work experience|employment|education|skills|technical skills|certifications?|projects?|publications?|awards?|interests|references)\b/i;

interface RunOpts {
  size: number;
  bold?: boolean;
  italics?: boolean;
}

// Markdown links "[text](url)" or bare URLs/domains → clickable Word links
const LINK_PATTERN =
  /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|((?:https?:\/\/|www\.)[^\s)\]]+|\b(?:github|linkedin)\.com\/[^\s)\]]+)/g;

function runsFromText(text: string, opts: RunOpts): Array<TextRun | ExternalHyperlink> {
  const children: Array<TextRun | ExternalHyperlink> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_PATTERN.lastIndex = 0;
  while ((m = LINK_PATTERN.exec(text)) !== null) {
    if (m.index! > last) {
      children.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...opts }));
    }
    const label = m[1] ?? m[3];
    const url = m[2] ?? (m[3].startsWith("http") ? m[3] : `https://${m[3]}`);
    children.push(
      new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: label, font: FONT, ...opts, style: "Hyperlink" })],
      }),
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length || children.length === 0) {
    children.push(new TextRun({ text: text.slice(last), font: FONT, ...opts }));
  }
  return children;
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: runsFromText(text, { size: 21 }),
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    children: runsFromText(text, { size: 21 }),
    spacing: { after: 60 },
  });
}

function header(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 24, bold: true })],
    spacing: { before: 240, after: 80 },
  });
}

// Right-tab position for a US-letter/A4 page with 0.6" margins (in twips).
const RIGHT_TAB = 9800;
const PAGE_MARGIN = 860;

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
// "May 2024 – Present", "July 2023 - Dec. 2023", "2021 – 2022", "In Development 2025"
const TRAILING_DATES = new RegExp(
  `^(.*?)\\s{1,}((?:${MONTH}\\s+\\d{4}|\\d{4}|In Development \\d{4})\\s*[–—-]?\\s*(?:Present|Current|${MONTH}\\s*\\d{4}|\\d{4})?)$`,
);
// "ML Engineer / Data Scientist   Oxford, UK"
const TRAILING_LOCATION = /^(.*?)\s{1,}([A-Z][A-Za-z.\- ]+,\s*(?:UK|USA|United Kingdom|United States|[A-Z][A-Za-z]+))$/;

function cleanContactGlyphs(line: string): string {
  // PDF extraction turns icon-font glyphs (phone/mail/link icons) into # § etc.
  return line
    .replace(/[-]/g, "·")
    .replace(/\s[#§]\s/g, "  ·  ")
    .replace(/\s{3,}/g, "  ·  ")
    .replace(/(·\s*)+/g, "·  ")
    .replace(/·\s*$/, "")
    .trim();
}

/** Left text + right-aligned text on one line via a right tab stop. */
function splitLine(left: string, right: string, opts: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    children: [
      new TextRun({ text: left, font: FONT, size: 21, bold: opts.bold, italics: opts.italics }),
      new TextRun({ text: `\t${right}`, font: FONT, size: 21, italics: true }),
    ],
    spacing: { before: opts.bold ? 120 : 0, after: 40 },
  });
}

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, smallCaps: true })],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: "444444" },
    },
    spacing: { before: 240, after: 100 },
  });
}

export function cvToDocx(text: string): Document {
  const lines = text.replace(/\r/g, "").split("\n");
  const paragraphs: Paragraph[] = [];

  let seenFirstSection = false;
  let inDatedSection = false; // Experience / Education / Projects
  let lastWasDateLine = false;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ spacing: { after: 20 } }));
      lastWasDateLine = false;
      return;
    }

    if (i === 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line, font: FONT, size: 36, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
        }),
      );
      return;
    }

    // Section headers ("Profile", "Experience", "EDUCATION", …)
    if (line.length <= 40 && (SECTION_HEADERS.test(line) || /^[A-Z\s&]+$/.test(line))) {
      seenFirstSection = true;
      inDatedSection = /experience|employment|education|projects?|certifications?/i.test(line);
      lastWasDateLine = false;
      paragraphs.push(sectionHeader(line));
      return;
    }

    // Everything between the name and the first section header is the
    // location/contact block — centred, small, icon glyphs cleaned.
    if (!seenFirstSection) {
      paragraphs.push(
        new Paragraph({
          children: runsFromText(cleanContactGlyphs(line), { size: 20 }),
          alignment: AlignmentType.CENTER,
          spacing: { after: 30 },
        }),
      );
      return;
    }

    if (/^[•\-*]\s+/.test(line)) {
      lastWasDateLine = false;
      paragraphs.push(bullet(line.replace(/^[•\-*]\s+/, "")));
      return;
    }

    if (inDatedSection && !lastWasDateLine && line.length <= 120) {
      // "Employer   May 2024 – Present" → bold employer, dates right-aligned
      const dm = line.match(TRAILING_DATES);
      if (dm && dm[1].trim().length > 1) {
        paragraphs.push(splitLine(dm[1].trim(), dm[2].trim(), { bold: true }));
        lastWasDateLine = true;
        return;
      }
    }

    if (inDatedSection && lastWasDateLine && line.length <= 120) {
      // "Role title   Oxford, UK" → italic role, location right-aligned
      const lm = line.match(TRAILING_LOCATION);
      lastWasDateLine = false;
      if (lm && lm[1].trim().length > 1) {
        paragraphs.push(splitLine(lm[1].trim(), lm[2].trim(), { italics: true }));
        return;
      }
      paragraphs.push(body(line));
      return;
    }

    lastWasDateLine = false;
    paragraphs.push(body(line));
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
          },
        },
        children: paragraphs,
      },
    ],
  });
}

export function coverLetterToDocx(text: string): Document {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map(
      (para) =>
        new Paragraph({
          children: para
            .split("\n")
            .flatMap((line, i) => [
              ...(i > 0 ? [new TextRun({ break: 1 })] : []),
              new TextRun({ text: line, font: FONT, size: 22 }),
            ]),
          spacing: { after: 200, line: 300 },
        }),
    );
  return new Document({ sections: [{ children: paragraphs }] });
}

export function statementToDocx(text: string): Document {
  const lines = text.replace(/\r/g, "").split("\n");
  const paragraphs: Paragraph[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ spacing: { after: 40 } }));
    } else if (/^[•\-*]\s+/.test(line)) {
      paragraphs.push(bullet(line.replace(/^[•\-*]\s+/, "")));
    } else if (line.length <= 90 && /:$/.test(line)) {
      // Criterion/section headings ("Leadership and communication:")
      paragraphs.push(header(line));
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line, font: FONT, size: 22 })],
          spacing: { after: 160, line: 300 },
        }),
      );
    }
  }
  return new Document({ sections: [{ children: paragraphs }] });
}

export async function docxBuffer(doc: Document): Promise<Buffer> {
  return Packer.toBuffer(doc);
}

export function safeFilename(...parts: Array<string | null | undefined>): string {
  return (
    parts
      .filter(Boolean)
      .join("-")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "document"
  );
}
