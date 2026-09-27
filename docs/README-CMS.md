# AURA CMS — Instalação e uso

## Estrutura
- `index.html`: home/site público.
- `admin-firebase/index.html`: entrada do painel.
- `admin-firebase/admin.css`: estilo do painel.
- `admin-firebase/admin.js`: lógica CMS, Firestore, Storage, backup e logs.
- `firestore.rules`: regras de banco.
- `storage.rules`: regras de upload.

## Coleções Firestore
- `articles`, `stations`, `products`, `hosts`: conteúdo principal.
- `settings/theme`, `settings/cart`, `settings/access`, `settings/site`, `settings/globalSocials`: configurações globais.
- `settings/homeButtons`, `settings/headerButtons`, `settings/infoCards`: botões e cards dinâmicos.
- `media`: biblioteca de mídia enviada pelo admin.
- `logs`: auditoria de ações do admin.
- `backups`: snapshots completos.
- `users`: área futura para contas/assinaturas.

## Deploy
```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## Teste recomendado
1. Abra `/admin-firebase`.
2. Faça login.
3. Crie um artigo teste.
4. Faça upload na aba Mídia.
5. Copie a URL e use como capa.
6. Exporte backup.
7. Salve Visual / Theme e recarregue a home.

## Avisos
- Pagamento real depende de Stripe, Shopify, Mercado Pago ou outro provedor externo.
- Envio de e-mail real depende de Cloud Functions, EmailJS, Resend, Brevo ou equivalente.
- As regras incluem uma lista de e-mails admin. Ajuste se trocar a conta do administrador.
