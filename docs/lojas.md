# Bira Gestão — publicação nas lojas (não listada)

App interna da equipa. Mesmo processo da Bira Reservas: compila na nuvem (GitHub Actions → iOS → Run workflow),
vai para o TestFlight e depois pede-se à Apple a **distribuição não listada**.

## Antes da primeira compilação
1. **App Store Connect → Apps → + → Nova app**
   - Plataforma: iOS · Nome: **Bira Gestão** · Idioma principal: Português (Portugal)
   - Bundle ID: **pt.biradosnamorados.gestao** (se não aparecer na lista, criar em developer.apple.com → Identifiers → +)
   - SKU: `bira-gestao`
2. **Segredos no GitHub** (repositório `stock` → Settings → Secrets and variables → Actions) — os mesmos 3 da Bira Reservas:
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_BASE64`.
   (Ou passá-los para segredos da organização `biradosnamorados`, para servirem às duas apps.)
3. GitHub → Actions → **iOS** → Run workflow. Ao fim de ~15 min a compilação aparece no TestFlight.

## App Store (App Store Connect → Bira Gestão → Distribuição)

**Nome:** Bira Gestão
**Subtítulo (30):** Gestão interna do Bira
**Categoria:** Negócios (secundária: Comida e bebida)
**Classificação etária:** 4+ (responder "Nenhum" a tudo)
**URL de suporte:** https://biradosnamorados.pt/
**URL de privacidade:** https://biradosnamorados.pt/politica-privacidade/
**Copyright:** 2026 Bira dos Namorados, Lda

**Texto promocional (170):**
Fecho de caixa, stock, encomendas, receção de mercadoria e HACCP do Bira dos Namorados, num só sítio. Uso exclusivo da equipa.

**Descrição:**
A app interna da equipa do Bira dos Namorados para o dia a dia dos restaurantes e do centro de produção.

- Fecho de caixa: importa o fecho do POS, fotos dos talões do TPA e valores da máquina de trocos
- Leitura do QR das etiquetas: abrir, gastar ou registar desperdício de cada embalagem
- Stock, contagens e pedidos internos ao centro de produção
- Encomendas a fornecedores e receção de mercadoria com foto da fatura
- Registos HACCP e tarefas obrigatórias
- Produção, receitas e etiquetas no centro de produção

Acesso reservado à equipa do Bira dos Namorados: é preciso uma conta fornecida pela gestão.

**Palavras-chave (100):** restaurante,gestão,stock,caixa,HACCP,encomendas,fornecedores,Bira,Braga,staff

**Capturas:** iPhone 6,3" (1206×2622) e iPad 13" — tirar do simulador ou do TestFlight com a conta de demonstração.

### Informações para a revisão da Apple (App Review)
- **Início de sessão obrigatório:** Sim
- **Utilizador:** appreview.gestao@biradosnamorados.pt (criar em Ajustes → Utilizadores: unidade **BN Eventos**, equipa Sala, nível Gerente — assim não vê dados reais de Braga nem do CDP)
- **Palavra-passe:** (a que definir)
- **Notas:**
  This is an internal staff app for Bira dos Namorados restaurants (Braga, Portugal). Employees use it for end-of-day cash closing, stock, internal orders, supplier deliveries (with invoice photos), food-safety (HACCP) records and scanning QR labels on food packages. The camera is used to scan QR labels and photograph invoices and card-terminal receipts. Please sign in with the demo account above (email + password). We are requesting Unlisted App Distribution for this app.

### Privacidade da app (App Store Connect → Privacidade da app)
Recolhe dados: **Sim**. Nenhum é usado para rastreamento (tracking).
| Tipo | Ligado à identidade | Finalidade |
| --- | --- | --- |
| Informações de contacto → Endereço de email | Sim | Funcionalidade da app |
| Informações de contacto → Nome | Sim | Funcionalidade da app |
| Identificadores → ID do utilizador | Sim | Funcionalidade da app |
| Fotos ou vídeos | Sim | Funcionalidade da app |

(Email e nome são os da conta do colaborador; as fotos são de faturas, talões e fechos de caixa.)

### Distribuição não listada
1. Submeter a versão para revisão (Distribuição → + Versão → escolher a compilação → Enviar para revisão).
2. Logo a seguir, o titular da conta pede a distribuição não listada em https://developer.apple.com/contact/request/unlisted-app/ (indicar o Apple ID da app, em Informações da app).
3. Depois de aprovada, a app só se instala pelo link que a Apple dá; não aparece em pesquisas.

## Atualizações
- A app traz os ecrãs lá dentro (como a Bira Reservas). O **site** (stock.biradosnamorados.pt) atualiza logo a cada publicação;
  a **app** só recebe as mudanças numa nova compilação (GitHub Actions → iOS) e nova versão na App Store.
- Regras e dados no Supabase (acessos, grelha, funções do servidor) valem logo para o site e para a app.
