// Leitura do PDF "Fecho cego / Apuramento de Métodos de Pagamento" do POS.
//
// O PDF tem cada texto duplicado: uma cópia normal e outra espelhada (escala horizontal
// negativa). Usamos só as cópias normais e agrupamos por linha (coordenada y).
// Cada linha de método tem: nome + Teórico + Apurado + Diferença,
// ou só nome + Apurado quando o POS envia o fecho cego sem o teórico.

export type PaymentFamily = 'dinheiro' | 'cartoes' | 'comissoes' | 'plataformas' | 'outro';

export interface ParsedLine {
  payment_method: string;
  family: PaymentFamily;
  theoretical: number | null; // null quando o PDF só traz o apurado (fecho cego)
  declared: number;
}

export interface ParsedFecho {
  date: string | null;          // AAAA-MM-DD
  lines: ParsedLine[];          // somadas por método (vários turnos/caixas)
  totalTheoretical: number | null;
  totalDeclared: number | null;
  shifts: number;
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  mirrored: boolean;
}

const NUM_RE = /^-?\d{1,3}(?:[ .]?\d{3})*(?:[.,]\d{2})$/;

function toNumber(s: string): number {
  const clean = s.replace(/€/g, '').replace(/\s/g, '').trim();
  // formato do POS: 1234.56 (ponto decimal). Aceita também 1.234,56.
  if (/,\d{2}$/.test(clean)) return Number(clean.replace(/\./g, '').replace(',', '.'));
  return Number(clean.replace(/,/g, ''));
}

export function familyFor(method: string): PaymentFamily {
  const m = method.toLowerCase();
  if (m.includes('comiss')) return 'comissoes';
  if (/(numer[aá]rio|cash|dinheiro|cashmatic)/.test(m)) return 'dinheiro';
  if (/(uber|glovo|bolt|takeaway|just ?eat)/.test(m)) return 'plataformas';
  if (/(multibanco|visa|master|cart[aã]o|tpa|amex|mb ?way|d[eé]bito|cr[eé]dito|maestro)/.test(m)) return 'cartoes';
  return 'outro';
}

export function cleanMethodName(label: string): string {
  return label.replace(/^\s*\d+\.\s*/, '').trim();
}

export function parseFechoItems(items: TextItem[]): ParsedFecho {
  const normal = items.filter((i) => !i.mirrored && i.str.trim() !== '');

  // agrupar por linha (y arredondado)
  const rows = new Map<number, TextItem[]>();
  for (const it of normal) {
    const key = Math.round(it.y);
    const near = [...rows.keys()].find((k) => Math.abs(k - key) <= 2);
    const k = near ?? key;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k)!.push(it);
  }

  const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x));

  let date: string | null = null;
  let shifts = 0;
  let totalTheoretical: number | null = null;
  let totalDeclared: number | null = null;
  const byMethod = new Map<string, ParsedLine>();

  for (const row of ordered) {
    const texts = row.map((r) => r.str.trim());
    const label = texts.filter((t) => !NUM_RE.test(t) && t !== '€').join(' ').trim();
    const nums = texts.filter((t) => NUM_RE.test(t)).map(toNumber);

    const dm = label.match(/Dia\s+(\d{4}-\d{2}-\d{2})/);
    if (dm && !date) date = dm[1];
    if (/^Turno\s+\d+/i.test(label)) shifts++;

    if (!nums.length || !label) continue;

    // com teórico: [teórico, apurado, diferença]; só apurado: [apurado]
    const theo = nums.length >= 3 ? nums[0] : null;
    const decl = nums.length >= 3 ? nums[1] : nums[nums.length - 1];

    if (/^Total\s+Dia/i.test(label)) {
      totalTheoretical = theo;
      totalDeclared = decl;
      continue;
    }
    if (/^Total/i.test(label)) continue;

    const name = cleanMethodName(label);
    const key = name.toLowerCase();
    const prev = byMethod.get(key);
    if (prev) {
      prev.theoretical = theo == null && prev.theoretical == null ? null : round2((prev.theoretical ?? 0) + (theo ?? 0));
      prev.declared = round2(prev.declared + decl);
    } else {
      byMethod.set(key, { payment_method: name, family: familyFor(name), theoretical: theo, declared: decl });
    }
  }

  return { date, lines: [...byMethod.values()], totalTheoretical, totalDeclared, shifts };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Lê o ficheiro PDF no browser (pdf.js carregado só quando é preciso)
export async function parseFechoPdf(file: File): Promise<ParsedFecho> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const offset = (p - 1) * 10000; // páginas seguintes ficam "abaixo"
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] - offset, mirrored: it.transform[0] < 0 });
    }
  }
  return parseFechoItems(items);
}
