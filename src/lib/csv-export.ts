import { format } from 'date-fns';

export interface LabelData {
  product_name: string;
  code_short: string;
  package_code: string;
  batch: string;
  production_date: string;
  expiry_date: string;
  weight: string;
  internal_code: string;
  qr_value: string;
}

export function generateLabelCSV(labels: LabelData[]): string {
  const headers = [
    'product_name',
    'code_short',
    'package_code',
    'batch',
    'production_date',
    'expiry_date',
    'weight',
    'internal_code',
    'qr_value'
  ];

  const csvRows = [headers.join(',')];

  labels.forEach(label => {
    const row = [
      escapeCsvValue(label.product_name),
      escapeCsvValue(label.code_short),
      escapeCsvValue(label.package_code),
      escapeCsvValue(label.batch),
      escapeCsvValue(label.production_date),
      escapeCsvValue(label.expiry_date),
      escapeCsvValue(label.weight),
      escapeCsvValue(label.internal_code),
      escapeCsvValue(label.qr_value)
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

function escapeCsvValue(value: string): string {
  if (!value) return '';

  const stringValue = String(value);

  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function downloadCSV(csvContent: string, filename: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export function formatLabelDate(dateString: string | null): string {
  if (!dateString) return '';
  try {
    return format(new Date(dateString), 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

export function formatWeight(weight: number | null, unit: string | null): string {
  if (weight === null || weight === undefined) return '';
  return `${weight} ${unit || 'kg'}`;
}
