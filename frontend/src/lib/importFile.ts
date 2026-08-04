import * as XLSX from 'xlsx';

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function prepareImportFile(file: File): Promise<File> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') return file;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('A planilha não possui uma aba válida.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });

  const csv = rows
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');

  return new File([csv], file.name.replace(/\.(xlsx|xls)$/i, '.csv'), {
    type: 'text/csv;charset=utf-8',
  });
}
