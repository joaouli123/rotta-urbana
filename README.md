# Rotta Urbana

App nativo de mobilidade urbana (corridas) para **Sinop/MT** — passageiro, motorista e admin.
Frontend **Expo / React Native** + backend **Supabase** (Postgres + Auth + RLS + Realtime + Storage + Edge Functions).

---

## Arquitetura

```
Expo App (React Native)                 Supabase (nuvem)
├─ src/contexts/AuthContext     ─────►   Auth (e-mail/senha, JWT)
├─ src/services/*               ─────►   PostgREST (RPC + tabelas, RLS)
│   ├─ rides / drivers          ─────►   Postgres + PostGIS (matching geoespacial)
│   ├─ payments                 ─────►   API Node/Express no Coolify (Mercado Pago)
│   └─ geo (Mapbox HTTP)        ─────►   Realtime (status de corrida / localização)
└─ src/components/RouteMap      ─────►   Mapbox (mapa nativo @rnmapbox/maps)
```

- **Banco:** projeto Supabase `zqgqwmxledxtcuvyyvia`, Postgres 17 + PostGIS.
- **Admin web:** Node/Express hospedado no **Coolify** → https://rottaurbana.com.br (usa o mesmo Supabase).
- **Modelo de negócio:** o motorista escolhe entre assinatura diária/semanal/mensal ou comissão por corrida.
  As assinaturas são cobradas pelo Mercado Pago. Nas corridas pagas pelo checkout Mercado Pago, o
  Split 1:1 envia automaticamente a comissão para a plataforma e o restante para a conta Mercado Pago
  conectada do motorista.

## Como rodar

```bash
npm install --legacy-peer-deps      # peer deps do Expo 54 + React 19
npx expo start                      # bundler

# Telas SEM mapa nativo rodam no Expo Go. O mapa Mapbox (@rnmapbox/maps) é
# nativo e precisa de um DEV BUILD:
npx expo prebuild --clean
npx expo run:android                # ou run:ios (precisa de macOS)
# ou: eas build --profile development -p android
```

### Credenciais de teste (criadas por `scripts/seed-users.mjs`)
| Papel | E-mail | Senha |
|------|--------|-------|
| Admin | admin@rottaurbana.app | Admin@12345 |
| Passageiro | passageiro@rottaurbana.app | Senha@12345 |
| Motorista (verificado) | motorista@rottaurbana.app | Senha@12345 |

## Variáveis de ambiente (`.env`)

`.env` está **gitignorado** (contém segredos). Veja `.env.example` para o template.
- **CLIENT** (`EXPO_PUBLIC_*`, vão pro app): URL Supabase, chave *publishable*, token Mapbox **público (pk.)**.
- **SERVER/CLI** (nunca vão pro app): senha do banco, chave *secret*, access token, tokens de pagamento.

> Segurança: o token Mapbox já é um `pk.` (público, correto para app). Recomendado ainda **rotacionar** as chaves que foram compartilhadas em texto.

## Banco de dados (migrations em `supabase/migrations/`)

Boas práticas aplicadas: tipos `enum` reais, `numeric` para dinheiro, `timestamptz`, PKs `uuid`,
FKs com `ON DELETE`, `CHECK`/`NOT NULL`, índices em FKs/colunas de filtro, índice **GiST** geoespacial,
`updated_at` por trigger, e **RLS em todas as tabelas**.

Destaques de segurança (RLS):
- usuário **não muda o próprio papel** (anti escalonamento);
- motorista **não se auto-verifica** nem aprova documentos;
- passageiro/motorista só veem um ao outro via uma corrida compartilhada;
- `anon` **sem acesso** ao schema `public` (todas as funções/tabelas exigem login);
- `confirm_payment` é **server-only** (só `service_role`, via webhook).

Aplicar/atualizar na nuvem:
```bash
export SUPABASE_ACCESS_TOKEN=...    # do .env
npx supabase db push --linked -p "<DB_PASSWORD>" --include-seed
npx supabase functions deploy --use-api
node --env-file=.env scripts/seed-users.mjs
node --env-file=.env scripts/e2e-test.mjs    # teste end-to-end (25 checagens)
```

## Admin web (Coolify)

Painel completo em `railway-admin/` (Express + Supabase secret key), publicado pelo Coolify no domínio oficial:
**https://rottaurbana.com.br/console-ru-7f3a9c/login** — login com a conta admin.

- **KPIs:** passageiros, motoristas (online/verificados/pendentes), corridas (hoje/mês, por status),
  receita de assinaturas, tarifas do mês, assinaturas ativas, suporte aberto + gráfico 14 dias.
- **Gestão:** aprovar/suspender motoristas, ver corridas, ativar/renovar assinaturas, confirmar pagamentos,
  responder suporte, e **editar preços/planos e a chave PIX da plataforma** (tudo configurável).

Deploy/atualização:
O serviço é o diretório `railway-admin/` por compatibilidade histórica de nome; ele roda no Coolify,
não no Railway. O deploy ocorre quando o Coolify detecta o push da branch configurada (normalmente `main`).
Configure os secrets no ambiente do serviço Coolify (Node 22).

## Pagamentos

**Corrida (passageiro → motorista):** a opção padrão é Mercado Pago. O passageiro conclui o checkout
com Pix ou cartão e o Mercado Pago faz o Split 1:1 usando `marketplace_fee`: a comissão configurada
no plano Por Corrida fica na plataforma e o restante é atribuído ao motorista. O webhook confirma o
pagamento e atualiza `fare_paid`; o relatório do motorista mostra o valor líquido aprovado.

PIX direto, dinheiro e cartão na maquininha continuam disponíveis como alternativas manuais. Nesses
métodos o app não consegue realizar repasse automático.

**Assinatura (motorista → plataforma):** diária, semanal ou mensal (valores no admin), pelo checkout
hospedado do Mercado Pago. O motorista paga com cartão ou Pix, e as cobranças recorrentes são
sincronizadas por `subscription_preapproval`, `subscription_authorized_payment` e `payment` no webhook.
No Coolify, configure `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`,
`MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
`MERCADOPAGO_SPLIT_REDIRECT_URI=https://rottaurbana.com.br/api/mercadopago/oauth/callback`,
`MP_SPLIT_ENCRYPTION_KEY` (32 bytes em hex) e `PUBLIC_APP_URL=https://rottaurbana.com.br`.
O webhook deve apontar para `https://rottaurbana.com.br/api/mercadopago/webhook`.
Cada motorista autoriza a própria conta em **Plano & Mensalidade → Conectar Mercado Pago**.
Os tokens ficam criptografados no backend; o app nunca coleta nem armazena dados brutos do cartão.

O banco usa `mercadopago_driver_accounts` para as autorizações e `ride_payments` para conciliação
idempotente, incluindo comissão, valor líquido, checkout, webhook e reembolso.

## Categorias de corrida (Economy / Comfort / Black) e elegibilidade

As 3 categorias vivem em `fare_config` (uma linha cada) com **preço** (base, **por km**, por min, mínimo)
e **regras de elegibilidade do veículo** — tudo editável no admin:
- `min_year` (ano mínimo), `min_fipe_value` (valor FIPE mínimo em R$), `allowed_vehicle_types`
  (ex.: sedan,suv), `min_seats`, `require_colors` (ex.: preto,branco para o Black).

No cadastro, o motorista busca o carro na **Tabela FIPE** (`src/services/fipe.ts`, Parallelum v2) — marca →
modelo → ano → **valor + código FIPE** são salvos no veículo. A função SQL `vehicle_qualifies()` calcula
em quais categorias o veículo se encaixa (um carro Black também atende economy/comfort). `nearby_drivers` e
`accept_ride` **filtram por categoria**: um motorista só aceita corrida de uma categoria que seu carro atende.
`my_categories()` mostra ao motorista o que ele pode rodar. Assim você configura "como escolher os carros do
Black" só ajustando ano/valor FIPE/cor no painel — sem código.

## Mapbox — “posso usar? como funciona o limite grátis?”

**Sim, pode** — e para um app de corridas é ótimo. Limite gratuito (por mês, antes de cobrar):

| Serviço | Grátis/mês | Usado para |
|--------|-----------|-----------|
| Maps SDK Mobile (carregamento do mapa) | **25.000 usuários ativos (MAU)** | mostrar o mapa |
| Directions API | **100.000 requisições** | traçar a rota origem→destino |
| Geocoding (temporário) | **100.000 requisições** | buscar/converter endereços |

Na prática: enquanto você tiver **até ~25 mil usuários ativos/mês**, o mapa é **grátis**. Cada corrida usa
~1–2 chamadas de Directions/Geocoding, então dezenas de milhares de corridas/mês cabem no plano gratuito.
Passou do limite, é cobrado por excedente (pay-as-you-go) — sem surpresa de plano fixo.

**Importante (segurança do token):**
- O app usa o token **público `pk.`** em `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` (correto e seguro de embarcar).
  O `@rnmapbox/maps` atual **não exige** token de download `sk.`.
- O mapa nativo **não roda no Expo Go** (precisa de dev build). As chamadas HTTP (rota/geocoding em
  `src/services/geo.ts`) funcionam em qualquer lugar; o componente `src/components/RouteMap.tsx` mostra um
  placeholder no Expo Go e o mapa real no build nativo.

## Scripts úteis (`scripts/`)
- `seed-users.mjs` — cria/atualiza usuários demo e deixa o motorista verificado com veículo.
- `e2e-test.mjs` — testa todo o fluxo + segurança RLS contra o banco real.
- `admin-sql.mjs` — roda SQL no projeto via Management API (`node --env-file=.env scripts/admin-sql.mjs arquivo.sql`).
