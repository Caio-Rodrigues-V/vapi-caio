import * as XLSX from 'xlsx';

export async function prepareImportFile(file: File): Promise<File> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') return file;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('A planilha não possui uma aba válida.');

  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
  return new File([csv], file.name.replace(/\.(xlsx|xls)$/i, '.csv'), {
    type: 'text/csv;charset=utf-8',
  });
}
