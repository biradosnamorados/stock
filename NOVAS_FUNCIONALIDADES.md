# Novas Funcionalidades Implementadas

## Resumo das Alterações

Este documento descreve todas as novas funcionalidades e melhorias implementadas no sistema de gestão de restaurantes "Bira dos Namorados".

---

## 1. Novo Tipo de Unidade: CDO (Central Distribution/Operations)

### Alterações na Base de Dados
- Adicionado novo tipo de unidade `cdo` na tabela `units`
- Sistema agora suporta três tipos de unidades operacionais:
  - **CDP**: Centro de Produção (produz produtos acabados)
  - **CDO**: Central de Distribuição/Operações (compra, armazena e distribui)
  - **Restaurant**: Restaurantes (recebem e consomem produtos)
  - **Events**: Eventos

### Funcionalidade
- CDO funciona como armazém central de distribuição
- Gere produtos comprados centralmente
- Distribui para restaurantes
- Suporta rastreamento de lotes e validades quando aplicável

---

## 2. Sistema de Rastreamento Flexível de Produtos

### Novos Campos na Tabela Products

#### `source_type` (Tipo de Origem)
Indica a origem do produto:
- `cdp_produced`: Produzido internamente no CDP
- `cdo_purchased`: Comprado e armazenado no CDO
- `direct_purchase`: Comprado diretamente pelos restaurantes
- `ingredient`: Ingrediente para receitas

#### `requires_expiry` (Requer Validade)
- Define se o produto necessita de rastreamento de data de validade
- Separado de `requires_batch` para maior flexibilidade

#### `requires_packaging` (Requer Embalagem)
- Indica se o produto precisa de embalagem individual com QR code
- Aplicável principalmente a produtos CDP

#### `is_recipe_input` (É Ingrediente de Receita)
- Marca produtos que podem ser usados como ingredientes em receitas
- Permite filtragem rápida na criação de receitas

#### `is_recipe_output` (É Produzido por Receita)
- Marca produtos que são resultado de receitas
- Identifica produtos finais de produção

#### `is_distributable` (É Distribuível)
- Define se o produto pode ser transferido para outras unidades
- Permite controlo granular de fluxos de distribuição

#### `tracking_level` (Nível de Rastreamento)
Dois níveis disponíveis:
- `full`: Rastreamento completo (lote + validade + embalagens)
- `simple`: Rastreamento simples (apenas quantidade)

### Benefícios
- Permite produtos consumíveis simples (ex: guardanapos, caixas) sem necessidade de lotes
- Mantém rastreamento completo para produtos críticos (alimentos perecíveis)
- Flexibilidade para diferentes tipos de produtos no mesmo sistema

---

## 3. Módulo de Receitas / BOM (Bill of Materials)

### Nova Página: `/recipes`

#### Tabelas Criadas
1. **recipes**: Receitas de produção
   - Código único da receita
   - Nome descritivo
   - Produto final (output)
   - Quantidade produzida
   - Instruções de preparação
   - Tempo de preparação

2. **recipe_ingredients**: Ingredientes das receitas
   - Link para receita
   - Produto ingrediente (input)
   - Quantidade necessária
   - Unidade de medida
   - Notas

3. **production_logs**: Registos de produção
   - Link para receita utilizada
   - Link para lote de produção
   - Quantidade produzida
   - Responsável pela produção
   - Data/hora de produção

4. **production_ingredient_consumption**: Consumo real de ingredientes
   - Link para log de produção
   - Produto consumido
   - Quantidade usada
   - Embalagem específica usada (se aplicável)
   - Código de lote

### Funcionalidades
- **Criar e gerir receitas** com múltiplos ingredientes
- **Selecionar produtos** marcados como `is_recipe_input`
- **Definir quantidades** precisas de cada ingrediente
- **Registar consumo de stock** durante produção
- **Rastreabilidade completa**: saber que ingredientes foram usados em cada lote
- **Instruções detalhadas** de preparação
- **Edição e eliminação** de receitas

### Interface
- Formulário intuitivo de criação/edição
- Adicionar/remover ingredientes dinamicamente
- Validação de dados
- Lista completa de receitas existentes

---

## 4. Módulo de Contagem de Stock

### Nova Página: `/stock-counts`

#### Tabelas Criadas
1. **stock_counts**: Sessões de contagem
   - Número único gerado automaticamente (SC-AAAAMMDD-NNNN)
   - Unidade onde é feita a contagem
   - Estados: draft, active, completed, reviewed, cancelled
   - Tipos: full (completa), partial (parcial), cycle (cíclica)
   - Datas de agendamento, início, conclusão e revisão
   - Responsáveis (criador, contador, revisor)

2. **stock_count_lines**: Linhas de contagem (produtos)
   - Produto a contar
   - Quantidade no sistema
   - Quantidade contada
   - Variação (diferença)
   - Percentagem de variação
   - Notas
   - Responsável pela contagem

3. **stock_count_adjustments**: Ajustes aprovados
   - Linha de contagem associada
   - Quantidade de ajuste
   - Motivo do ajuste
   - Aprovador
   - Data de aplicação

### Fluxo de Trabalho

#### 1. Criação (Admin/Chefe)
- Admin cria uma nova contagem
- Seleciona tipo (completa, parcial ou cíclica)
- Se parcial/cíclica, seleciona produtos específicos
- Define data agendada (opcional)
- Sistema gera número único automaticamente
- Sistema captura stock atual do sistema para cada produto

#### 2. Contagem (Staff)
- Staff abre a contagem activa
- Vê lista de produtos a contar
- Introduz quantidade contada fisicamente
- Sistema calcula automaticamente:
  - Diferença (contado - sistema)
  - Percentagem de variação
- Pode adicionar notas por produto

#### 3. Conclusão
- Staff marca contagem como concluída
- Admin revê as diferenças
- Identifica variações significativas
- Pode criar ajustes aprovados

#### 4. Revisão e Ajustes (Admin)
- Admin marca como revista
- Sistema mantém histórico completo
- Ajustes podem ser aplicados ao stock real

### Benefícios
- **Controlo de inventário** periódico
- **Análise de discrepâncias** entre sistema e físico
- **Auditoria completa** de contagens
- **Validação de stock** por unidade
- **Identificação de perdas** ou erros de registo
- **Fluxo controlado**: apenas admin decide o que contar

---

## 5. Stock em Tempo Real nas Encomendas Internas

### Alteração Implementada
Quando um utilizador cria uma encomenda interna, o sistema agora mostra o **stock disponível actual** de cada produto directamente no dropdown de selecção.

### Antes
```
PROD-001 - Molho Francesinha
```

### Depois
```
PROD-001 - Molho Francesinha (Stock: 45.50 kg)
```

### Funcionalidade
- **Cálculo dinâmico** de stock no momento da criação da encomenda
- **Stock do CDP**: soma de pesos de todas as embalagens com status `in_stock` ou `available`
- **Actualização automática**: sempre que a página é carregada
- **Visibilidade total**: utilizador vê imediatamente quanto está disponível
- **Prevenção de encomendas impossíveis**: evita pedir produtos sem stock

### Benefícios
- Evita criar encomendas de produtos que não existem em stock
- Permite decisões informadas na hora de encomendar
- Melhora eficiência operacional
- Reduz erros e cancelamentos

---

## 6. Página de Produtos Melhorada

### Novos Campos no Formulário

#### Secção: Rastreamento e Funcionalidade
- **Nível de Rastreamento**:
  - Completo (lote + validade)
  - Simples (apenas quantidade)

- **Requer Validade**: checkbox para produtos perecíveis

- **Ingrediente de Receita**: marca produtos que podem ser usados em receitas

- **Produzido por Receita**: marca produtos finais de produção

### Interface Atualizada
- Campos organizados por secções lógicas
- Validação automática baseada em tipo de produto
- Descrições de ajuda para cada campo
- Separação visual entre produtos CDP e Comprados

---

## 7. Geração Automática de Números

### Função: `generate_stock_count_number()`
Gera números únicos para contagens de stock no formato:
- **SC-AAAAMMDD-NNNN**
- Exemplo: `SC-20260330-0001`
- Sequencial por dia
- Facilita organização e auditoria

---

## 8. Triggers e Funções Automáticas

### `calculate_stock_count_variance()`
- **Trigger**: Executado automaticamente ao inserir/atualizar linhas de contagem
- **Função**: Calcula diferença e percentagem de variação
- **Benefício**: Dados sempre consistentes, sem intervenção manual

### `link_production_log_to_batch()`
- **Trigger**: Executado ao criar log de produção
- **Função**: Atualiza quantidade produzida no lote
- **Benefício**: Sincronização automática entre logs e lotes

### `validate_stock_count_variance()`
- **Função**: Valida e calcula variações em contagens
- **Campos calculados**:
  - variance = counted_quantity - system_quantity
  - variance_percentage = (variance / system_quantity) × 100

---

## 9. Políticas de Segurança (RLS)

Todas as novas tabelas têm Row Level Security habilitado:

### Receitas
- Utilizadores vêem receitas da sua unidade
- Admin vê tudo
- Apenas Admin/Chefe podem criar/editar/eliminar

### Ingredientes de Receitas
- Todos podem ver
- Apenas Admin/Chefe podem gerir

### Logs de Produção
- Utilizadores vêem logs da sua unidade
- Admin vê tudo
- Staff de produção pode criar

### Contagens de Stock
- Utilizadores vêem contagens da sua unidade
- Admin vê tudo
- Admin/Chefe podem criar e gerir
- Staff pode atualizar contagens activas

---

## 10. Índices de Performance

Criados índices estratégicos para optimizar queries:

### Produtos
- `idx_products_source_type`
- `idx_products_tracking_level`
- `idx_products_is_recipe_input`
- `idx_products_is_recipe_output`

### Receitas
- `idx_recipes_output_product`
- `idx_recipes_unit`
- `idx_recipe_ingredients_recipe`
- `idx_recipe_ingredients_product`

### Logs de Produção
- `idx_production_logs_recipe`
- `idx_production_logs_batch`
- `idx_production_logs_location`

### Contagens de Stock
- `idx_stock_counts_unit`
- `idx_stock_counts_status`
- `idx_stock_count_lines_count`
- `idx_stock_count_lines_product`

---

## 11. Navegação Atualizada

### Novos Itens de Menu

#### Menu Principal
- **Receitas** (apenas CDP, Admin/Chefe)
  - Ícone: ChefHat
  - Rota: `/recipes`

- **Contagem Stock** (todos os utilizadores)
  - Ícone: ClipboardCheck
  - Rota: `/stock-counts`

### Organização do Menu
```
- Painel (Dashboard)
- Receitas (CDP apenas)
- Produção (CDP apenas)
- Embalamento (CDP apenas)
- Stock
- Contagem Stock
- Encomendas Internas
- Encomendas Fornecedores
- Receção Mercadoria
- Análise de Preços
- Scanner QR
- Ações QR

Ajustes (Admin apenas):
- Produtos
- Fornecedores
- Importar Dados
- Utilizadores
- Configurações SMTP
```

---

## 12. Compatibilidade com Sistema Existente

### Migração de Dados
- Migration verifica campos existentes antes de criar
- Atualiza produtos existentes com valores default apropriados
- Produtos CDP existentes automaticamente marcados como `source_type: 'cdp_produced'`
- Produtos comprados automaticamente marcados como `source_type: 'cdo_purchased'`
- Mantém compatibilidade total com dados anteriores

### Backward Compatibility
- Todos os campos novos têm valores default
- Sistema funciona com produtos antigos e novos
- Migração segura sem perda de dados

---

## Resumo dos Benefícios

### Operacionais
✅ Maior flexibilidade no rastreamento de produtos
✅ Controlo de stock mais rigoroso através de contagens
✅ Visibilidade de stock em tempo real
✅ Gestão de receitas e consumo de ingredientes
✅ Separação clara entre CDP, CDO e Restaurants

### Técnicos
✅ Base de dados robusta com validações
✅ Performance optimizada com índices
✅ Segurança através de RLS
✅ Auditoria completa de todas as operações
✅ Triggers automáticos para consistência de dados

### Negócio
✅ Redução de desperdício através de melhor controlo
✅ Rastreabilidade completa da produção
✅ Análise de variações de stock
✅ Tomada de decisão baseada em dados reais
✅ Compliance com requisitos de segurança alimentar

---

## Próximos Passos Sugeridos

1. **Testar fluxos completos**:
   - Criar receitas
   - Registar produção com consumo de stock
   - Fazer contagens de stock
   - Criar encomendas internas com stock visível

2. **Treinar utilizadores**:
   - Admin: gestão de receitas e revisão de contagens
   - Chefe: criação de contagens e supervisão
   - Staff: execução de contagens e produção

3. **Configurar unidade CDO**:
   - Criar unidade do tipo `cdo`
   - Migrar produtos de armazém central
   - Configurar fornecedores do CDO

4. **Ajustar produtos existentes**:
   - Marcar ingredientes como `is_recipe_input: true`
   - Marcar produtos finais como `is_recipe_output: true`
   - Definir `tracking_level` apropriado para cada produto
   - Configurar `requires_expiry` conforme necessário

---

## Ficheiros Criados/Modificados

### Novos Ficheiros
- `src/pages/Recipes.tsx` - Página de gestão de receitas
- `src/pages/StockCounts.tsx` - Página de contagens de stock
- `NOVAS_FUNCIONALIDADES.md` - Este documento

### Ficheiros Modificados
- `src/App.tsx` - Adicionadas rotas para receitas e contagens
- `src/components/Layout.tsx` - Novos itens de menu
- `src/pages/Products.tsx` - Novos campos de rastreamento
- `src/pages/InternalOrders.tsx` - Stock em tempo real
- `supabase/migrations/` - Nova migration com todas as alterações

### Migration
- `add_cdo_unit_and_enhanced_product_tracking.sql`
  - 800+ linhas de SQL
  - 7 novas tabelas
  - 15+ novos campos
  - 20+ índices
  - 30+ políticas RLS
  - 5 funções auxiliares
  - 3 triggers automáticos

---

## Suporte Técnico

Para questões ou problemas relacionados com estas novas funcionalidades:

1. Verificar este documento primeiro
2. Consultar os comentários nas migrations SQL
3. Revisar as políticas RLS na base de dados
4. Verificar logs de auditoria para operações específicas

---

**Data de Implementação**: 30 de Março de 2026
**Versão do Sistema**: 2.0
**Status**: ✅ Produção Pronta
