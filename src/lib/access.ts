// Modelo de acessos: Unidade + Equipa + Nível. As áreas vêm da grelha (access_rules) + exceções.
export const LEVELS = [
  { value: 'colaborador', label: 'Colaborador', hint: 'O trabalho do dia a dia da sua equipa.' },
  { value: 'responsavel', label: 'Responsável', hint: 'Colaborador + gestão da sua equipa (ex.: validar fechos, encomendar a fornecedores).' },
  { value: 'gerente', label: 'Gerente', hint: 'Toda a operação da sua unidade, incluindo os utilizadores dessa unidade.' },
  { value: 'admin', label: 'Admin', hint: 'Tudo, em todas as unidades, incluindo configurações.' },
] as const;

export const levelLabel = (v: string | null | undefined) => LEVELS.find((l) => l.value === v)?.label ?? '—';

// Áreas, agrupadas como no menu
export const AREA_GROUPS: { name: string; areas: { code: string; label: string }[] }[] = [
  { name: 'Início', areas: [
    { code: 'dashboard', label: 'Painel' },
    { code: 'scanner', label: 'Ler QR' },
  ] },
  { name: 'Caixa', areas: [
    { code: 'cash_closing', label: 'Fecho de caixa (cego)' },
    { code: 'cash_closing_manage', label: 'Fecho – ver teórico, validar, histórico, gorjetas' },
    { code: 'uber', label: 'Uber Eats' },
  ] },
  { name: 'Encomendas', areas: [
    { code: 'internal_orders', label: 'Pedidos ao CDP / CDO' },
    { code: 'purchase_orders', label: 'Encomendar a fornecedores' },
    { code: 'goods_receipts', label: 'Receber mercadoria e faturas' },
  ] },
  { name: 'Stock', areas: [
    { code: 'stock', label: 'Stock' },
    { code: 'stock_counts', label: 'Contagem de stock' },
    { code: 'price_analysis', label: 'Análise de preços' },
  ] },
  { name: 'Produção', areas: [
    { code: 'recipes', label: 'Receitas' },
    { code: 'production', label: 'Produção' },
    { code: 'packaging', label: 'Embalamento e etiquetas' },
  ] },
  { name: 'Qualidade', areas: [
    { code: 'haccp', label: 'HACCP' },
    { code: 'mandatory_tasks', label: 'Tarefas obrigatórias' },
  ] },
  { name: 'Ajustes', areas: [
    { code: 'products', label: 'Produtos' },
    { code: 'suppliers', label: 'Fornecedores' },
    { code: 'users', label: 'Utilizadores' },
    { code: 'access_rules', label: 'Níveis de acesso' },
    { code: 'cashmatic_settings', label: 'Máquina de trocos' },
    { code: 'smtp_settings', label: 'Email (SMTP)' },
    { code: 'import', label: 'Importar dados' },
  ] },
];

export const ADMIN_ONLY = new Set(['access_rules', 'cashmatic_settings', 'smtp_settings', 'import']);
