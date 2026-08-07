import * as XLSX from 'xlsx';

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function prepareImportFile(file: File): Promise<File> {
  try {
    const buffer = await file.arrayBuffer();
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
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n');

    return new File([csv], file.name.replace(/\.[^/.]+$/, '.csv'), {
      type: 'text/csv;charset=utf-8',
    });
  } catch (err) {
    console.warn('[importFile] Falha ao pré-processar arquivo com XLSX, usando original:', err);
    return file;
  }
}
