import * as XLSX from 'xlsx';

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function prepareImportFile(file: File): Promise<File> {
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return file;

    // Check if data lines (lines 2+) use semicolon ';' while line 1 uses commas ','
    const sampleData = lines.slice(1, 10).join('\n');
    const semiCount = (sampleData.match(/;/g) || []).length;
    const commaCount = (sampleData.match(/,/g) || []).length;

    let cleanText = text;
    if (semiCount > commaCount && lines[0].includes(',') && !lines[0].includes(';')) {
      // Mismatched header line 1 with commas vs data lines with semicolons - remove line 1
      cleanText = lines.slice(1).join('\n');
    }

    const buffer = new TextEncoder().encode(cleanText);
    const workbook = XLSX.read(buffer, { type: 'array', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return file;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });

    if (!rows || rows.length === 0) return file;

    const csv = rows
      .map((row) => {
        // If a row was parsed as a single string containing semicolons, split it into separate cells
        if (row.length === 1 && typeof row[0] === 'string' && row[0].includes(';')) {
          row = row[0].split(';');
        }
        return row.map(escapeCsvCell).join(',');
      })
      .join('\n');

    return new File([csv], file.name.replace(/\.[^/.]+$/, '.csv'), {
      type: 'text/csv;charset=utf-8',
    });
  } catch (err) {
    console.warn('[importFile] Falha ao pré-processar arquivo com XLSX, usando original:', err);
    return file;
  }
}
