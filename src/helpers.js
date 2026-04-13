import { ACTIVITY_FIELD_META, STATUS_OPTIONS } from './constants.js';

export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function addMonths(dateValue, months) {
  if (!dateValue || !months) return '';
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCMonth(date.getUTCMonth() + Number(months));
  return date.toISOString().slice(0, 10);
}

export function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return String(value)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyJsonArray(value) {
  return JSON.stringify(toArray(value));
}

export function boolFromInput(value) {
  return value === '1' || value === 'true' || value === 'on' || value === 'yes' ? 1 : 0;
}

export function statusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export function statusClass(status) {
  return String(status || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function formatDate(value, timeZone = 'Europe/Amsterdam') {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone
  }).format(new Date(value));
}

export function formatDateTime(value, timeZone = 'Europe/Amsterdam') {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone
  }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function csvEscape(value) {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function pdfEscape(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

export function displayValue(field, value) {
  if (field.type === 'json-array') {
    const items = Array.isArray(value) ? value : parseJsonArray(value);
    return items.length ? items.join(', ') : 'None';
  }
  if (field.type === 'boolean') {
    return Number(value) ? 'Yes' : 'No';
  }
  if (field.type === 'date') {
    return value || 'Not set';
  }
  return value || 'Not set';
}

export function normalizeFieldValue(field, value) {
  if (field.type === 'json-array') {
    return JSON.stringify(parseJsonArray(value).sort());
  }
  if (field.type === 'boolean') {
    return Number(value) ? '1' : '0';
  }
  return String(value ?? '').trim();
}

function listValue(activity, arrayKey, jsonKey) {
  const direct = activity[arrayKey];
  if (Array.isArray(direct)) {
    return direct.filter(Boolean);
  }
  return parseJsonArray(activity[jsonKey]);
}

function joinList(items, emptyLabel = 'Not set') {
  return items.length ? items.join(', ') : emptyLabel;
}

function contactValue(name, contact, emptyLabel = 'Not applicable') {
  const parts = [String(name || '').trim(), String(contact || '').trim()].filter(Boolean);
  return parts.length ? parts.join(' | ') : emptyLabel;
}

function transferDestinationsValue(activity) {
  if (!Number(activity.international_transfers)) return 'No transfers';
  const countries = listValue(activity, 'transfer_countries', 'transfer_countries_json');
  return countries.length ? countries.join(', ') : 'International transfer in scope';
}

function transferSafeguardsValue(activity) {
  if (!Number(activity.international_transfers)) return 'Not applicable';
  return joinList(listValue(activity, 'transfer_mechanisms', 'transfer_mechanisms_json'), 'Not documented');
}

const REGISTER_EXPORT_COLUMNS = [
  {
    label: 'Record',
    pdfWidth: 95,
    value: (activity) => [activity.reference_code, activity.activity_name].filter(Boolean).join(' | ')
  },
  {
    label: 'Controller name and contact details',
    pdfWidth: 100,
    value: (activity) => contactValue(activity.controller_name, activity.controller_contact_details, 'Not set')
  },
  {
    label: 'Joint controller name and contact details',
    pdfWidth: 100,
    value: (activity) => contactValue(activity.joint_controller_name, activity.joint_controller_contact_details)
  },
  {
    label: 'Controller representative name and contact details',
    pdfWidth: 100,
    value: (activity) =>
      contactValue(activity.controller_representative_name, activity.controller_representative_contact_details)
  },
  {
    label: 'Data Protection Officer name and contact details',
    pdfWidth: 98,
    value: (activity) => contactValue(activity.dpo_name, activity.dpo_contact_details)
  },
  {
    label: 'Purposes of the processing',
    pdfWidth: 138,
    value: (activity) => activity.purpose_of_processing || 'Not set'
  },
  {
    label: 'Categories of data subjects',
    pdfWidth: 84,
    value: (activity) => joinList(listValue(activity, 'data_subject_categories', 'data_subject_categories_json'))
  },
  {
    label: 'Categories of personal data',
    pdfWidth: 92,
    value: (activity) => joinList(listValue(activity, 'personal_data_categories', 'personal_data_categories_json'))
  },
  {
    label: 'Categories of recipients',
    pdfWidth: 92,
    value: (activity) => joinList(listValue(activity, 'recipient_categories', 'recipient_categories_json'))
  },
  {
    label: 'International transfers to third countries or international organisations',
    pdfWidth: 102,
    value: (activity) => transferDestinationsValue(activity)
  },
  {
    label: 'Documentation of appropriate safeguards for international transfers',
    pdfWidth: 104,
    value: (activity) => transferSafeguardsValue(activity)
  },
  {
    label: 'Retention period / envisaged time limits for erasure',
    pdfWidth: 95,
    value: (activity) => activity.retention_period || 'Not set'
  },
  {
    label: 'General description of technical and organisational security measures',
    pdfWidth: 170,
    value: (activity) => activity.security_measures || 'Not set'
  }
];

export function buildActivityCsv(activities) {
  const headers = REGISTER_EXPORT_COLUMNS.map((column) => column.label);
  const rows = activities.map((activity) => REGISTER_EXPORT_COLUMNS.map((column) => column.value(activity)));
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function buildActivityExcelXml(activities) {
  const rows = activities
    .map((activity) => {
      const cells = REGISTER_EXPORT_COLUMNS.map((column) => column.value(activity));
      return `<Row>${cells
        .map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`)
        .join('')}</Row>`;
    })
    .join('');

  const headerRow = REGISTER_EXPORT_COLUMNS.map(
    (column) => `<Cell><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`
  ).join('');

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="RoPA Register">
    <Table>
      <Row>${headerRow}</Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function buildPdfDocument(pageStreams, { pageWidth = 595, pageHeight = 842, footerBuilder } = {}) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds = [];
  const contentObjectIds = [];

  pageStreams.forEach((contentStream) => {
    const contentObjectId = addObject(
      `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`
    );
    contentObjectIds.push(contentObjectId);
    pageObjectIds.push(
      addObject(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
      )
    );
  });

  const pagesObjectId = addObject(
    `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  );

  pageObjectIds.forEach((pageObjectId, index) => {
    objects[pageObjectId - 1] = objects[pageObjectId - 1].replace('/Parent 0 0 R', `/Parent ${pagesObjectId} 0 R`);
    const footer = footerBuilder
      ? footerBuilder(index, pageObjectIds.length)
      : `BT /F1 9 Tf 50 30 Td (${pdfEscape(`Page ${index + 1} of ${pageObjectIds.length}`)}) Tj ET`;
    const existingId = contentObjectIds[index];
    const existing = objects[existingId - 1];
    const body = existing.replace(/\nendstream$/, `\n${footer}\nendstream`);
    objects[existingId - 1] = body.replace(
      /<< \/Length \d+ >>/,
      `<< /Length ${Buffer.byteLength(body.match(/stream\n([\s\S]*)\nendstream/u)?.[1] || '', 'utf8')} >>`
    );
  });

  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function pdfTextBlock(x, y, lines, fontSize, lineHeight, { textColor = '0 g' } = {}) {
  if (!lines.length) return '';
  return [
    textColor,
    'BT',
    `/F1 ${fontSize} Tf`,
    `${x} ${y} Td`,
    `${lineHeight} TL`,
    ...lines.map((line) => `(${pdfEscape(line)}) Tj T*`),
    'ET'
  ].join('\n');
}

function wrapPdfText(value, maxChars) {
  const normalized = String(value ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim());

  const segments = [];

  normalized.forEach((line) => {
    if (!line) {
      segments.push('');
      return;
    }

    const words = line.split(/\s+/).filter(Boolean);
    let currentLine = '';

    const pushWord = (word) => {
      if (word.length <= maxChars) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length <= maxChars) {
          currentLine = candidate;
        } else {
          if (currentLine) segments.push(currentLine);
          currentLine = word;
        }
        return;
      }

      if (currentLine) {
        segments.push(currentLine);
        currentLine = '';
      }

      for (let index = 0; index < word.length; index += maxChars) {
        const part = word.slice(index, index + maxChars);
        if (part.length === maxChars || index + maxChars < word.length) {
          segments.push(part);
        } else {
          currentLine = part;
        }
      }
    };

    words.forEach(pushWord);
    if (currentLine) segments.push(currentLine);
  });

  return segments.length ? segments : [''];
}

function truncatePdfLine(line, maxChars) {
  if (line.length <= maxChars) return line;
  if (maxChars <= 3) return line.slice(0, maxChars);
  return `${line.slice(0, maxChars - 3)}...`;
}

function clampPdfLines(lines, maxLines, maxChars) {
  if (lines.length <= maxLines) {
    return lines.map((line) => truncatePdfLine(line, maxChars));
  }

  const trimmed = lines.slice(0, maxLines).map((line) => truncatePdfLine(line, maxChars));
  trimmed[maxLines - 1] = truncatePdfLine(trimmed[maxLines - 1], maxChars);
  if (!trimmed[maxLines - 1].endsWith('...')) {
    trimmed[maxLines - 1] = truncatePdfLine(`${trimmed[maxLines - 1]}...`, maxChars);
  }
  return trimmed;
}

export function registerFlagLabels(activity) {
  if (!activity) return [];

  const flags = [];

  if (Number(activity.children_data)) flags.push('Children');
  if (Number(activity.special_category_data)) flags.push('Special category');
  if (Number(activity.international_transfers)) flags.push('Transfer');
  if (Number(activity.ai_involvement)) flags.push('AI');
  if (!String(activity.security_measures || '').trim()) flags.push('Missing security');

  const nextReviewDate = String(activity.next_review_date || '').trim();
  const isOverdue = Boolean(
    activity.is_overdue || (nextReviewDate && activity.status !== 'archived' && nextReviewDate < todayIsoDate())
  );
  if (isOverdue) flags.push('Overdue');

  return flags;
}

const REGISTER_PDF_COLUMNS = REGISTER_EXPORT_COLUMNS.map((column) => ({
  label: column.label,
  width: column.pdfWidth,
  value: column.value
}));

// This creates a lightweight text-first PDF without adding another dependency.
export function buildSimplePdf(title, lines) {
  const safeLines = [title, '', ...lines].map((line) => pdfEscape(line));
  const pageLineLimit = 42;
  const lineHeight = 14;
  const pageStreams = [];

  for (let index = 0; index < safeLines.length; index += pageLineLimit) {
    const pageLines = safeLines.slice(index, index + pageLineLimit);
    pageStreams.push(
      [
        'BT',
        '/F1 10 Tf',
        '50 790 Td',
        `${lineHeight} TL`,
        ...pageLines.map((line) => `(${line}) Tj T*`),
        'ET'
      ].join('\n')
    );
  }

  return buildPdfDocument(pageStreams);
}

export function buildRegisterPdf(activities, { title = 'Futurewhiz RoPA register', subtitleLines = [] } = {}) {
  const pageWidth = 1400;
  const pageHeight = 595;
  const marginX = 20;
  const marginTop = 18;
  const marginBottom = 24;
  const tableWidth = REGISTER_PDF_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const titleFontSize = 16;
  const metaFontSize = 8.4;
  const headerFontSize = 7.3;
  const rowFontSize = 6.9;
  const rowLineHeight = 8;
  const rowPaddingX = 4;
  const rowPaddingY = 4;
  const headerHeight = 24;
  const maxCellLines = 6;
  const wrappedSubtitleLines = subtitleLines.flatMap((line) => wrapPdfText(line, 120));
  const pageStreams = [];
  let rowIndex = 0;
  let pageIndex = 0;

  const buildHeaderCommands = (continued = false) => {
    const lines = continued ? [`${title} (continued)`] : [title];
    const titleBandHeight = continued ? 24 : 40;
    const titleBandTop = pageHeight - marginTop;
    const commands = [
      '0.08 0.29 0.33 rg',
      `${marginX} ${titleBandTop - titleBandHeight} ${tableWidth} ${titleBandHeight} re f`,
      pdfTextBlock(marginX + 8, titleBandTop - 18, lines, titleFontSize, 16, { textColor: '1 g' })
    ];
    const metaLines = continued ? [] : wrappedSubtitleLines;

    if (metaLines.length) {
      commands.push(
        pdfTextBlock(marginX + 8, titleBandTop - 30, metaLines, metaFontSize, 10, { textColor: '0.92 g' })
      );
    }

    const topY = continued
      ? titleBandTop - titleBandHeight - 10
      : titleBandTop - titleBandHeight - 12;

    return { commands, topY };
  };

  const drawTableHeader = (commands, topY) => {
    let x = marginX;
    commands.push('0.16 0.38 0.42 rg');
    commands.push(`${marginX} ${topY - headerHeight} ${tableWidth} ${headerHeight} re f`);
    commands.push('0.18 0.32 0.35 RG');
    commands.push('0.6 w');

    REGISTER_PDF_COLUMNS.forEach((column) => {
      commands.push(`${x} ${topY - headerHeight} ${column.width} ${headerHeight} re S`);
      commands.push(
        pdfTextBlock(x + rowPaddingX, topY - rowPaddingY - headerFontSize - 3, [column.label], headerFontSize, 9, {
          textColor: '1 g'
        })
      );
      x += column.width;
    });

    return topY - headerHeight;
  };

  while (rowIndex < activities.length || (activities.length === 0 && pageIndex === 0)) {
    const { commands, topY } = buildHeaderCommands(pageIndex > 0);
    let cursorY = drawTableHeader(commands, topY);

    if (activities.length === 0) {
      const emptyHeight = 28;
      commands.push('0.82 0.82 0.82 RG');
      commands.push('0.6 w');
      commands.push(`${marginX} ${cursorY - emptyHeight} ${tableWidth} ${emptyHeight} re S`);
      commands.push(
        pdfTextBlock(
          marginX + rowPaddingX,
          cursorY - rowPaddingY - rowFontSize - 1,
          ['No activities matched the selected filters.'],
          rowFontSize,
          rowLineHeight,
          { textColor: '0 g' }
        )
      );
      pageStreams.push(commands.filter(Boolean).join('\n'));
      break;
    }

    while (rowIndex < activities.length) {
      const activity = activities[rowIndex];
      const cellMeta = REGISTER_PDF_COLUMNS.map((column) => {
        const maxChars = Math.max(4, Math.floor((column.width - rowPaddingX * 2) / 3.8));
        const lines = clampPdfLines(wrapPdfText(column.value(activity) || '-', maxChars), maxCellLines, maxChars);
        return { width: column.width, lines };
      });

      const rowHeight = Math.max(
        24,
        Math.max(...cellMeta.map((cell) => cell.lines.length)) * rowLineHeight + rowPaddingY * 2
      );

      if (cursorY - rowHeight < marginBottom) {
        break;
      }

      if (rowIndex % 2 === 1) {
        commands.push('0.97 0.96 0.93 rg');
        commands.push(`${marginX} ${cursorY - rowHeight} ${tableWidth} ${rowHeight} re f`);
      }

      commands.push('0.77 0.77 0.74 RG');
      commands.push('0.45 w');

      let x = marginX;
      cellMeta.forEach((cell) => {
        commands.push(`${x} ${cursorY - rowHeight} ${cell.width} ${rowHeight} re S`);
        commands.push(
          pdfTextBlock(x + rowPaddingX, cursorY - rowPaddingY - rowFontSize - 1, cell.lines, rowFontSize, rowLineHeight, {
            textColor: '0.08 g'
          })
        );
        x += cell.width;
      });

      cursorY -= rowHeight;
      rowIndex += 1;
    }

    pageStreams.push(commands.filter(Boolean).join('\n'));
    pageIndex += 1;
  }

  return buildPdfDocument(pageStreams, {
    pageWidth,
    pageHeight,
    footerBuilder: (index, count) =>
      `0.25 g\nBT /F1 8 Tf ${marginX} 12 Td (${pdfEscape(`Page ${index + 1} of ${count}`)}) Tj ET`
  });
}

export function activityPdfLines(activity, attachments = [], changes = []) {
  const lines = [];

  ACTIVITY_FIELD_META.forEach((field) => {
    lines.push(`${field.label}: ${displayValue(field, activity[field.key])}`);
  });

  if (attachments.length) {
    lines.push('');
    lines.push('Attachments:');
    attachments.forEach((attachment) => {
      lines.push(`- ${attachment.attachment_type}: ${attachment.label || attachment.original_name}`);
    });
  }

  if (changes.length) {
    lines.push('');
    lines.push('Recent change log:');
    changes.slice(0, 8).forEach((change) => {
      lines.push(
        `- ${change.created_at}: ${change.actor_name || change.actor_email} changed ${change.field_name || change.event_type}`
      );
    });
  }

  return lines;
}
