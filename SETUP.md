#  Bira dos Namorados - Sistema de Gestão de Stock

Sistema completo de gestão de stock, foodcost e preços de fornecedores para restaurante com duas lojas independentes.

## Funcionalidades Implementadas

### Autenticação
- Sistema de login com email/password via Supabase
- Controlo de acesso baseado em funções (Admin / Utilizador de Loja)
- Administradores têm acesso a todas as lojas
- Utilizadores de loja só acedem à sua loja

### Estrutura de Lojas
- Duas lojas independentes: Braga e Porto
- Stock separado por loja
- Fornecedores independentes por loja
- Encomendas e receções próprias

### Módulos Implementados

#### 1. Dashboard
- Visão geral com estatísticas principais
- Total de produtos
- Items com stock baixo
- Encomendas pendentes
- Alertas não lidos

#### 2. Produtos (Admin apenas)
- Criar, editar e eliminar produtos
- Definir unidade (kg, L, un, g, ml)
- Categorizar produtos
- Pesquisa de produtos

#### 3. Fornecedores
- Gestão de fornecedores por loja
- Informação de contacto (email, telefone)
- Admin pode gerir fornecedores de todas as lojas
- Utilizadores de loja gerem apenas os seus fornecedores

#### 4. Stock
- Separação por localização (Cozinha / Sala)
- Quantidade atual e stock mínimo
- Alertas visuais para stock baixo
- Filtros por localização
- Histórico de alterações (estrutura criada)

#### 5. Fichas Técnicas (Placeholder)
- Estrutura de base de dados criada
- Interface placeholder para desenvolvimento futuro

#### 6. Encomendas (Placeholder)
- Estrutura de base de dados criada
- Interface placeholder para desenvolvimento futuro

#### 7. Receções (Placeholder)
- Estrutura de base de dados criada
- Interface placeholder para desenvolvimento futuro

#### 8. Importação CSV Winrest (Placeholder)
- Estrutura de base de dados criada
- Interface placeholder para desenvolvimento futuro

#### 9. Alertas (Placeholder)
- Estrutura de base de dados criada
- Interface placeholder para desenvolvimento futuro

## Base de Dados

### Tabelas Criadas
1. **stores** - Lojas (Braga, Porto)
2. **profiles** - Perfis de utilizadores com funções
3. **suppliers** - Fornecedores por loja
4. **categories** - Categorias de produtos
5. **products** - Produtos
6. **product_suppliers** - Preços por fornecedor e loja
7. **stock** - Stock por produto, loja e localização
8. **stock_history** - Histórico de alterações de stock
9. **technical_sheets** - Fichas técnicas
10. **technical_sheet_ingredients** - Ingredientes das fichas técnicas
11. **orders** - Encomendas
12. **order_items** - Items das encomendas
13. **receptions** - Receções
14. **reception_items** - Items das receções
15. **sales_imports** - Importações de vendas CSV
16. **sales_import_items** - Items das importações
17. **alerts** - Sistema de alertas

### Segurança (RLS)
- Row Level Security ativado em todas as tabelas
- Admins acedem a todos os dados
- Utilizadores de loja só acedem aos dados da sua loja
- Políticas específicas por operação (SELECT, INSERT, UPDATE, DELETE)

## Design

### Cores do Bira
- Vermelho: #F20519
- Azul: #048ABF
- Verde: #038C5A
- Amarelo: #F2B705
- Cinza: #F2F2F2

### Características
- Interface responsiva (mobile, tablet, desktop)
- Design limpo e profissional
- Gradientes nas cores do Bira
- Navegação lateral com menu colapsável
- Estados de hover e transições suaves

## Próximos Passos

### Para Completar
1. **Fichas Técnicas Completas**
   - Interface para criar/editar fichas
   - Lista de ingredientes com quantidades
   - Cálculo automático de custo
   - Cálculo de foodcost

2. **Encomendas Completas**
   - Criar encomendas por fornecedor
   - Ver stock atual vs quantidade a encomendar
   - Gerar PDF
   - Enviar email ao fornecedor
   - Sugestões baseadas em consumo médio

3. **Receções Completas**
   - Conferir quantidades recebidas
   - Atualizar stock automaticamente
   - Atualizar preços (admin apenas)
   - Escolher localização (cozinha/sala)

4. **Importação CSV Winrest**
   - Upload de ficheiro CSV
   - Parse do formato: Data;Artigo;Quantidade
   - Associar artigos a fichas técnicas
   - Baixa automática de stock por ingrediente
   - Modo de simulação
   - Possibilidade de desfazer
   - Alertas de inconsistências

5. **Sistema de Alertas**
   - Alertas automáticos para:
     - Stock abaixo do mínimo
     - Preços não atualizados há X dias
     - Produtos sem ficha técnica
     - CSV de vendas não recebido
     - Desvios de stock
   - Marcar como lido
   - Filtrar por tipo/severidade

6. **Dashboard Avançado**
   - Gráficos de consumo
   - Top produtos consumidos
   - Evolução de preços
   - Comparação entre lojas (admin)
   - Desvios entre stock teórico e real

## Configuração Inicial

### 1. Criar Utilizador Admin
Execute na base de dados após criar conta:
```sql
INSERT INTO profiles (id, email, full_name, role, store_id)
VALUES (
  'USER_ID_FROM_AUTH',
  'admin@bira.pt',
  'Administrador',
  'admin',
  NULL
);
```

### 2. Criar Utilizadores de Loja
```sql
-- Para Braga
INSERT INTO profiles (id, email, full_name, role, store_id)
VALUES (
  'USER_ID_FROM_AUTH',
  'braga@bira.pt',
  'Utilizador Braga',
  'store_user',
  (SELECT id FROM stores WHERE code = 'BRG')
);

-- Para Porto
INSERT INTO profiles (id, email, full_name, role, store_id)
VALUES (
  'USER_ID_FROM_AUTH',
  'porto@bira.pt',
  'Utilizador Porto',
  'store_user',
  (SELECT id FROM stores WHERE code = 'PRT')
);
```

### 3. Adicionar Categorias de Exemplo
```sql
INSERT INTO categories (name) VALUES
  ('Carnes'),
  ('Peixes'),
  ('Legumes'),
  ('Bebidas'),
  ('Condimentos');
```

## Estrutura de Ficheiros

```
src/
├── lib/
│   ├── supabase.ts          # Cliente Supabase
│   ├── database.types.ts    # Types TypeScript da BD
│   ├── auth.tsx             # Contexto de autenticação
│   └── utils.ts             # Utilitários (formatação, CSV parse)
├── components/
│   └── Layout.tsx           # Layout principal com navegação
├── pages/
│   ├── Login.tsx            # Página de login
│   ├── Dashboard.tsx        # Dashboard principal
│   ├── Products.tsx         # Gestão de produtos
│   ├── Suppliers.tsx        # Gestão de fornecedores
│   ├── Stock.tsx            # Gestão de stock
│   ├── TechnicalSheets.tsx  # Fichas técnicas (placeholder)
│   ├── Orders.tsx           # Encomendas (placeholder)
│   ├── Receptions.tsx       # Receções (placeholder)
│   ├── SalesImport.tsx      # Import CSV (placeholder)
│   └── Alerts.tsx           # Alertas (placeholder)
└── App.tsx                  # Componente principal
```

## Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Base de Dados**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **Icons**: Lucide React

## Estado Atual

O projeto está funcional com:
- Autenticação completa
- Gestão de produtos (admin)
- Gestão de fornecedores
- Visualização e edição de stock
- Dashboard com estatísticas
- Layout responsivo
- Estrutura de BD completa para todos os módulos

Os módulos marcados como "placeholder" têm a estrutura de BD criada e estão prontos para desenvolvimento das interfaces e lógica de negócio.
