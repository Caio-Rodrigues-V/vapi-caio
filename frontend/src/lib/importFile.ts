import * as XLSX from 'xlsx';

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function prepareImportFile(file: File): Promise<File> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // 1. Process Excel files (.xlsx / .xls) with SheetJS
  if (extension === 'xlsx' || extension === 'xls') {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (sheet) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: '',
          blankrows: false,
        });

        if (rows && rows.length > 0) {
          const csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
          return new File([csv], file.name.replace(/\.(xlsx|xls)$/i, '.csv'), {
            type: 'text/csv;charset=utf-8',
          });
        }
      }
    } catch (err) {
      console.warn('[importFile] Falha ao processar arquivo Excel:', err);
    }
  }

  // 2. Process text / CSV files (.csv / .txt): normalize delimiters and encodings
  try {
    const text = await file.text();
    const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (rawLines.length === 0) return file;

    // Detect delimiter across first 10 lines
    const sample = rawLines.slice(0, 10).join('\n');
    const semiCount = (sample.match(/;/g) || []).length;
    const tabCount = (sample.match(/\t/g) || []).length;
    const commaCount = (sample.match(/,/g) || []).length;

    let delimiter = ',';
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    const normalizedRows: string[][] = [];

    for (const line of rawLines) {
      if (delimiter === ';') {
        normalizedRows.push(line.split(';'));
      } else if (delimiter === '\t') {
        normalizedRows.push(line.split('\t'));
      } else {
        if (line.includes(';') && !line.includes(',')) {
          normalizedRows.push(line.split(';'));
        } else {
          normalizedRows.push(line.split(','));
        }
      }
    }

    const csvContent = normalizedRows
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n');

    return new File([csvContent], file.name.replace(/\.[^/.]+$/, '.csv'), {
      type: 'text/csv;charset=utf-8',
    });
  } catch (err) {
    console.warn('[importFile] Erro ao pré-processar arquivo CSV:', err);
    return file;
  }
}
