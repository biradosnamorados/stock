# Configuração SMTP para Edge Functions

As credenciais SMTP precisam ser configuradas como secrets no Supabase.

## Configurar via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/lxqwramtqdwyylztrtsy/settings/functions

2. Na seção "Secrets", adicione os seguintes secrets:

```
SMTP_HOST=obrien.servidorpt.pt
SMTP_PORT=465
SMTP_USER_BRAGA=restaurantebraga@biradosnamorados.pt
SMTP_PASS_BRAGA=#$restaurantebraga$#
SMTP_USER_PORTO=restauranteporto@biradosnamorados.pt
SMTP_PASS_PORTO=#$restauranteporto$#
```

3. Clique em "Save" para cada secret adicionado

4. Aguarde alguns segundos para os secrets serem aplicados

5. Teste o envio de email novamente

## Verificar se os secrets foram configurados

Após configurar, os secrets estarão disponíveis para todas as Edge Functions através de `Deno.env.get()`.

**IMPORTANTE:** Os secrets configurados no Supabase Dashboard são diferentes das variáveis de ambiente locais no arquivo `.env`. O arquivo `.env` é apenas para desenvolvimento local.
