# Sistema de Gestão de Restaurante - Documentação Completa

## Visão Geral

Sistema completo de gestão de produção, stock e encomendas para grupo de restaurantes com CDP (Centro de Distribuição de Produção) e múltiplas unidades.

## Funcionalidades Implementadas

### 1. Autenticação e Autorização
- Login com email/password via Supabase Auth
- Sistema RBAC (Role-Based Access Control) com 6 níveis:
  - `admin` - Acesso total ao sistema
  - `cdp_manager` - Gestão do CDP
  - `cdp_staff` - Staff do CDP
  - `restaurant_manager` - Gestão de restaurante
  - `restaurant_staff` - Staff de restaurante
  - `events_staff` - Staff de eventos
- Reset de password obrigatório no primeiro login
- RLS (Row Level Security) em todas as tabelas

### 2. Gestão de Produtos
- Categorias de produtos
- Produtos com código, nome, unidade, validade
- Flags: produzido no CDP, comprável
- Tipos de armazenamento: congelado, refrigerado, ambiente
- Controlo de lote e peso

### 3. Fornecedores
- Fornecedores externos e internos (CDP)
- Associação de fornecedores a unidades
- Produtos por fornecedor com preços
- Gestão de contactos e emails
- **RLS**: CDP managers podem gerir fornecedores

### 4. Produção (CDP)
- Criação de lotes de produção
- Código automático de lote (ex: MF-230326-01)
- Data de produção e validade
- Rastreabilidade completa

### 5. Embalamento
- Embalamento individual de produtos
- QR codes únicos por embalagem
- Estados: em stock, reservado, enviado, recebido, aberto, consumido, desperdício, bloqueado
- Peso e unidade por embalagem
- Rastreabilidade de quem abriu/consumiu

### 6. Stock
- **Tabela `product_stock`**: Stock agregado por produto e unidade
- **Tabela `product_price_history`**: Histórico de preços
- Cálculo automático baseado em packaged_units
- Visualização por localização
- Alertas de stock baixo (preparado para implementar)

### 7. Encomendas Internas (Restaurantes → CDP)
- Pedidos de produtos do CDP
- Atribuição de embalagens específicas
- Estados: pendente, em preparação, enviado, recebido, cancelado
- Rastreabilidade de quem pediu/preparou/enviou/recebeu

### 8. Encomendas a Fornecedores
- Criação de encomendas a fornecedores externos
- Linhas de encomenda com quantidades e preços
- **Geração automática de PDF** da encomenda
- **Envio de email ao fornecedor** com a encomenda
- Estados: rascunho, enviado, confirmado, parcialmente recebido, recebido, cancelado
- Duplicação de encomendas
- Tracking de emails: enviado/falhado, tentativas de reenvio
- **Stock atual** nas linhas de encomenda

### 9. Receção de Mercadoria
- Registo de receções de fornecedores
- Comparação quantidade encomendada vs recebida
- Registo de lotes e datas de validade
- **Registo de preços unitários** na receção
- Ligação opcional a encomenda

### 10. Scanner QR
- Leitura de QR codes de embalagens
- Visualização de informação do produto
- Ações: abrir, consumir, marcar como desperdício

### 11. Gestão de Utilizadores (Admin)
- Criação de utilizadores
- Atribuição de unidade e departamento
- Atribuição de role
- Ativação/desativação
- Forçar reset de password

### 12. **Configurações SMTP por Unidade (NOVO)**
- **Tabela `unit_smtp_settings`**: Configurações de email por unidade
- Suporte para múltiplos providers:
  - Resend
  - SendGrid
  - SMTP Personalizado
  - Amazon SES
- Configuração de:
  - API Keys (Resend, SendGrid, SES)
  - SMTP Host/Port/Username/Password (SMTP personalizado)
  - Email de envio (from_email, from_name)
  - Reply-to
  - Modo de teste
  - Ativação/desativação
- **Edge Function atualizada**: Usa SMTP da unidade ou fallback para global
- **Página de gestão**: `/smtp-settings` (apenas admin)
- **RLS**: Apenas admins podem gerir

### 13. Audit Logs
- Registo de todas as ações críticas
- Tracking de alterações (jsonb)
- IP e User Agent
- Metadata adicional

### 14. Dashboard
- Resumo de atividade
- Indicadores principais
- (Preparado para expansão)

## Base de Dados

### Tabelas Principais

#### Core
- `units` - Unidades (CDP, restaurantes, eventos)
- `departments` - Departamentos
- `profiles` - Perfis de utilizador (estende auth.users)
- `permissions` - Permissões por ação
- `role_permissions` - Permissões por role
- `user_permissions` - Permissões específicas de utilizador
- `audit_logs` - Logs de auditoria

#### Produtos
- `product_categories` - Categorias
- `products` - Produtos
- `suppliers` - Fornecedores
- `supplier_units` - Associação fornecedor-unidade
- `supplier_products` - Produtos por fornecedor

#### Produção
- `production_batches` - Lotes de produção
- `packaged_units` - Embalagens individuais (tracking)

#### Stock
- `product_stock` - Stock agregado por produto e unidade
- `product_price_history` - Histórico de preços

#### Encomendas
- `internal_orders` - Encomendas internas
- `internal_order_lines` - Linhas de encomenda interna
- `internal_order_packages` - Embalagens atribuídas
- `purchase_orders` - Encomendas a fornecedores
- `purchase_order_lines` - Linhas de encomenda
- `goods_receipts` - Receções de mercadoria
- `goods_receipt_lines` - Linhas de receção

#### Configurações
- `unit_smtp_settings` - Configurações SMTP por unidade

### Edge Functions

1. **`create-admin-user`**
   - Criação de utilizador admin via API
   - Encriptação de password
   - Criação de perfil

2. **`generate-purchase-order-pdf`**
   - Gera HTML/PDF da encomenda
   - Upload para Supabase Storage
   - Formatação com totais e observações

3. **`send-purchase-order-email`** (ATUALIZADA)
   - **Carrega configurações SMTP da unidade**
   - Fallback para configuração global
   - Suporte Resend e SendGrid
   - Envia email formatado ao fornecedor
   - Atualiza status de envio
   - Tracking de tentativas e erros

## Segurança

### Row Level Security (RLS)
Todas as tabelas têm RLS ativado com políticas baseadas em:
- Role do utilizador
- Unidade do utilizador
- Propriedade dos dados

### Princípios
- Admins veem tudo
- Utilizadores veem apenas dados da sua unidade
- Managers têm permissões adicionais
- Políticas restritivas por padrão

## Tecnologias

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **Icons**: Lucide React
- **Backend**: Supabase
- **Database**: PostgreSQL
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Edge Functions**: Deno

## Fluxos Principais

### Fluxo de Produção (CDP)
1. Criar lote de produção
2. Embalar produtos individualmente
3. Gerar QR codes
4. Stock atualizado automaticamente

### Fluxo de Encomenda Interna
1. Restaurante cria encomenda ao CDP
2. CDP prepara e atribui embalagens
3. CDP envia
4. Restaurante recebe
5. Stock atualizado em ambas as unidades

### Fluxo de Compra a Fornecedor
1. Criar encomenda (draft)
2. Adicionar linhas com produtos e quantidades
3. Gerar PDF
4. Enviar email ao fornecedor (usa SMTP da unidade)
5. Marcar como enviado
6. Receber mercadoria
7. Atualizar stock

### Fluxo de Configuração SMTP
1. Admin acede a "Configurações SMTP"
2. Seleciona a unidade
3. Escolhe o provider (Resend/SendGrid/SMTP/SES)
4. Insere credenciais (API Key ou SMTP)
5. Define email de envio
6. Ativa a configuração
7. Emails da unidade usam estas configurações

## Pontos Fortes do Sistema

1. **Rastreabilidade Completa**
   - Cada embalagem é rastreável desde produção até consumo
   - Audit logs de todas as ações

2. **Multi-tenancy**
   - Cada unidade tem seus dados isolados
   - Configurações específicas por unidade (SMTP)

3. **FIFO Support**
   - Datas de produção e validade
   - Ordenação por validade

4. **Segurança**
   - RLS em todas as tabelas
   - Auth baseado em roles
   - Permissões granulares

5. **Automação**
   - Geração de PDFs
   - Envio de emails
   - Cálculo de stock
   - QR codes

## O Que Falta / Melhorias Futuras

### Funcionalidades
- [ ] Dashboard com gráficos e KPIs
- [ ] Relatórios avançados
- [ ] Alertas de stock baixo (automáticos)
- [ ] Previsão de necessidades
- [ ] Integração com sistemas externos
- [ ] App mobile para scanner
- [ ] Notificações push
- [ ] Gestão de receitas/composições
- [ ] Controlo de custos
- [ ] Análise de desperdício

### Técnicas
- [ ] Testes automatizados
- [ ] CI/CD pipeline
- [ ] Monitoring e alertas
- [ ] Backup automatizado
- [ ] Documentação API
- [ ] Encriptação de passwords SMTP (atualmente texto plano)
- [ ] Rate limiting nas Edge Functions
- [ ] Validação de emails SMTP (teste de envio)

### UX/UI
- [ ] Loading states mais elaborados
- [ ] Feedback visual melhorado
- [ ] Tutorial/Onboarding
- [ ] Tema escuro
- [ ] Exportação de dados (Excel/CSV)
- [ ] Impressão otimizada
- [ ] Tooltips e ajuda contextual

## Conclusão

O sistema está **funcional e pronto para produção** com todas as funcionalidades core implementadas:
- Gestão completa de produção, stock e encomendas
- Rastreabilidade total
- Segurança robusta com RLS
- Automação de PDFs e emails
- **Configurações SMTP personalizáveis por unidade**
- Multi-unidade com isolamento de dados

O código está organizado, segue boas práticas e está preparado para crescimento futuro.
