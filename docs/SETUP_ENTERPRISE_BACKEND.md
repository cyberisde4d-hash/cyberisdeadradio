# AURA Enterprise Backend Setup

Este pacote adiciona a estrutura para:

- Stripe Checkout
- Mercado Pago Checkout
- API própria
- Cloud Functions
- Firebase Storage com otimização automática de imagem
- Logs
- Analytics events
- Backup automático
- Busca indexada via Algolia
- Email transacional via Resend
- Firestore Rules
- Storage Rules
- PWA/offline básico
- Cache HTTP
- GitHub Actions
- Rate limit simples
- Estrutura de assinantes/admins

## 1. Instalar

```bash
npm --prefix functions install
```

## 2. Configurar projeto Firebase

Copie `.firebaserc.example` para `.firebaserc` e coloque seu project id.

```bash
cp .firebaserc.example .firebaserc
```

## 3. Configurar segredos

Stripe:

```bash
firebase functions:config:set stripe.secret="sk_live_xxx"
```

Mercado Pago:

```bash
firebase functions:config:set mercadopago.token="APP_USR_xxx"
```

Resend:

```bash
firebase functions:config:set resend.key="re_xxx" email.from="AURA <noreply@seudominio.com>"
```

Algolia:

```bash
firebase functions:config:set algolia.appid="APP_ID" algolia.key="ADMIN_KEY" algolia.index="aura_content"
```

## 4. Criar primeiro admin

No Firestore, crie:

```txt
admins/{UID_DO_SEU_USUARIO}
```

com qualquer campo, por exemplo:

```json
{ "role": "owner", "email": "voce@email.com" }
```

Sem isso, as regras bloqueiam escrita.

## 5. Deploy

```bash
firebase deploy --only firestore:rules,storage
firebase deploy --only functions
firebase deploy --only hosting
```

## 6. Testes rápidos

API health:

```txt
https://SEU_SITE.web.app/api/health
```

Stripe checkout:

```txt
POST /api/payments/stripe/create-checkout
```

Mercado Pago:

```txt
POST /api/payments/mercadopago/create-preference
```

## Avisos importantes

Pagamentos reais só funcionam com contas Stripe/Mercado Pago configuradas.

Email real só funciona com domínio validado no Resend.

Busca indexada só funciona com Algolia configurado.

SSR/SEO server-side completo exige migrar o frontend para Next.js/Nuxt/SvelteKit ou usar Cloud Functions para renderizar HTML dinâmico. Este pacote prepara API, SEO base, cache e rotas, mas não converte automaticamente o site inteiro para SSR.
