# CYBERISDEAD / AURA ARCHIVE — Documentação Técnica

> Projeto: site editorial + rádio + loja + CMS duplo (Decap + Firebase) + backend Express + Cloud Function.
> Stack: HTML/CSS/JS vanilla (sem build), Firebase (Hosting, Firestore, Auth, Storage, Functions), Node/Express, Decap CMS 3.x.
> Repositório analisado em `C:\Users\luan\Downloads\aura_archive_decap_cms` — branch `main`.

## 1. Visão geral

O projeto é um sistema editorial independente com três frentes públicas e duas frentes de edição:

| Frente | Entrada | Descrição |
|---|---|---|
| Shop/Home pública | `index.html:569` + `public/index.html` (cópia de deploy) | Vitrine fullscreen, modal de produto, carrinho, conta, share, i18n (11 locales), tema dark/light |
| Rádio | `public/radio/index.html` (~460 KB) | Player/arquivo de episódios (stations) |
| Stream embed | `public/stream/index.html:23` | iframe para `https://cyberisdead-live.onrender.com` |
| Host admin | `public/host-admin/index.html` (~307 KB) | Painel de hosts/episódios |
| Membership | `membership.js:1` | Planos, calendário, feed de membros, comentários |
| CMS Git (Decap) | `admin/index.html:9`, `admin/config.yml:1`, `config.yml:1` | Edita `data/*.json` via commit no GitHub |
| CMS Firebase | `admin-firebase/index.html:1`, `admin-firebase/admin.js:1` | CRUD direto no Firestore + Storage + backup/logs |
| Backend Express | `backend/server.js:1` | Upload cover (Tumblr), upload áudio (Substack), proxies de áudio/imagem |
| Cloud Function | `functions/index.js:4` | `audioProxy` (stream de áudio com CORS aberto) |

Arquitetura (lógico):

```
[Decap CMS /admin] --commit--> [GitHub data/*.json] --deploy--> [Firebase Hosting /public]
[Firebase Admin /admin-firebase] --SDK--> [Firestore + Storage]
[Shop index.html] --Firestore SDK v10.12.2--> [Firestore settings/* + articles/stations/products/hosts]
[Shop/Rádio] --fetch--> [/data/*.json fallback] + [INLINE_PRODUCTS / INLINE_SOCIALS / INLINE_INFO]
[Membership.js] --> [membershipPlans, calendarEvents, memberContent, comments]
[Backend Express :3000] --> [Tumblr API, Substack API] + [/api/audio-proxy, /api/image-proxy]
[Cloud Function audioProxy] --> [stream genérico de áudio]
```

## 2. Estrutura de pastas

```
docs/                           # TODA a documentação (índice em docs/README.md) — não vai para o Hosting
index.html                      # home/shop canônica (raiz, ~122 KB) → espelhar em public/index.html
public/index.html               # cópia de deploy da home (idêntica à raiz)
public/radio/index.html         # app rádio (+ public/radio/membership.js, espelho de membership.js)
public/stream/index.html        # iframe live
public/host-admin/index.html    # admin de hosts
public/data/*.json              # conteúdo de deploy (espelho de data/)
public/admin-firebase/          # painel Firebase publicado (espelho de admin-firebase/)
admin/                          # Decap CMS publicado em /admin (index.html + config.yml)
admin-firebase/                 # FONTE do painel Firebase (consolidada com o deploy: admin.js, admin.css, index.html, member-area.html, membership-admin.js, manifest, sw.js)
config.yml / admin/config.yml   # backend github `cyberisde4d-hash/aura-archive-cms`, branch main, local_backend true (idênticos)
data/*.json                     # FONTE Decap (restaurada; espelho de deploy em public/data/)
backend/server.js               # Express 4 + multer + axios + tumblr.js
backend/uploads/                # temporários multer — IGNORADO no git (.gitignore); contém arquivo de ~550 MB (ver §10)
functions/index.js              # audioProxy (firebase-functions v2 onRequest)
membership.js                   # módulo membership standalone (raiz = fonte; deploy em public/radio/membership.js)
firebase.json:2                 # hosting.public = "public", headers no-cache para *.html (MANTER NA RAIZ)
firestore.rules / firestore.indexes.json / storage.rules / cors.json / .firebaserc / .gitignore  # MANTER NA RAIZ (Firebase/Git exigem)
```

Regra de sincronia: edite sempre a FONTE e copie para o espelho em `public/` antes de `firebase deploy --only hosting`.
Ver tabela completa em `docs/README.md`.

Detalhe relevante: `firebase.json` publica só `public/`. A `index.html` da raiz **não vai para o Hosting** a menos que seja copiada para `public/` antes do deploy. Hoje as duas estão sincronizadas (hash igual), mas é cópia manual — ver `docs/README_FASE1.txt:4`.

## 3. Frontend público (`index.html`)

### 3.1 Layout e estilo
- Single-file: `<style>` (~540 linhas) + HTML + `<script type="module">`.
- Topbar fixa (`index.html:65`): toggle tema, Prev/Next, botão RADIO (`/radio`), seletor país, Account, Cart.
- Vitrine: `.shop-stage` + `.product-track` com `translate3d` (`index.html:116`), 1 slide por viewport, setas laterais e contador.
- Modal produto (`index.html:214`): galeria + thumbs + título/descrição/preço/estoque + size/variant + qty + Buy/Add/Save/Share + notas shipping/returns.
- Drawer carrinho (`index.html:285`), painel share (`index.html:323`), modal auth (`index.html:345`), toast (`index.html:359`).
- Tema: `html[data-shop-theme="light"]` (`index.html:365`) sobrescreve variáveis e componentes; persistência em `localStorage cid_shop_theme_v2`; default `light` (`index.html:856`).
- Quantidade escondida por CSS em 3 camadas (`index.html:526,535,544`): `#qtyLabel`, `.qty-row`, `.cart-qty`, `.cart-meta`, `#cartCount` com `display:none!important`. O JS ainda mantém `qty` interno — checkout/link externo assume quantidade 1.
- Responsivo: `<=760px` esconde setas e empilha modal; `<=430px` compacta pills (`index.html:489,513`).

### 3.2 Dados: Firestore-first com fallback inline
Ordem de leitura no boot (funções em `index.html:833+`):
1. `getSettingDoc(name)` lê `settings/*` (`site`, `theme`, `cart`, `share`, `siteTexts`, `globalSocials`, `homeButtons`, `headerButtons`, `infoCards`, `access`).
2. Coleções `articles`, `stations`, `products`, `hosts` via `getDocs`/`onSnapshot`.
3. Fallbacks embutidos se Firestore falhar: `INLINE_PRODUCTS` (9 produtos: zine, tee, poster, digital-pack, longsleeve, sticker, cassette, photo-print, bundle), `INLINE_SOCIALS` (9 redes), `INLINE_INFO` (about/contact/donate).
4. `applySiteIdentity()` (`index.html:739`): aplica título, meta/OG/Twitter, canonical, favicon a partir de `settings/site`.
5. `applyThemeSettings()` (`index.html:772`): injeta CSS vars e `<style id="adminThemeStyle">`.
6. `applyHeaderButtons()` (`index.html:811`): até 4 botões custom do admin, respeita `buttonIsVisible()` (login/hidden).

### 3.3 Loja / carrinho / conta
- Estado em `localStorage`: `cid_cart_v6`, `cid_saved_v6`, `cid_history_v6`; locale em `cid_country_v2` (default forçado `en-US`/`USD` em `index.html:847`).
- Preço/estoque: `modalPrice`, `modalStock`; total em `#cartTotal` (`R$ 0,00` inicial).
- `Buy now` usa `siteSettings.checkoutUrl` ou WhatsApp; `Add to cart` persiste local; checkout copia pedido / abre link externo (pagamento real **não** implementado no front — depende de Stripe/Shopify/MP externo, cf. `README-CMS.md:21`).
- Auth Firebase Email/Senha (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`); Saved/History por usuário + fallback local.
- Share: Web Share API quando disponível + links X/WhatsApp/Telegram + copiar URL (`shareOptions`, `copyShare`).
- i18n: dicionário `I18N` (`index.html:878`) para `pt-BR, en-US, en-GB, es-ES, fr-FR, ...` (11 options no `countrySelect`, `index.html:579`). `selectedLocale()`/`localeShort()` + `settingText(key)` com fallback `key_locale → key_lang → key`.

### 3.4 Firebase client
- SDK modular via CDN `firebasejs/10.12.2` (`index.html:668`): `firebase-app`, `firestore`, `auth`.
- `firebaseConfig` hardcoded para projeto `cyberisdeadesite` (`index.html:672`, repetido em `membership.js:4` e `admin-firebase/admin.js:6`).

## 4. CMS duplo (conceito central — não remover um sem migrar o outro)

### 4.1 Decap CMS (Git-based)
- `admin/index.html` carrega `decap-cms@^3.1.2`; `admin/config.yml` e `config.yml` (raiz, fallback — commit `c1e9277`) definem:
  - `backend.name: github`, repo `cyberisde4d-hash/aura-archive-cms`, branch `main`, `local_backend: true`.
  - `media_folder: assets/uploads`, `public_folder: /assets/uploads`.
  - Collections `articles → data/articles.json`, `episodes → data/stations.json`, `shop → data/products.json`, `hosts → data/hosts.json`, `settings → data/globalSocials.json + data/infoContent.json` (schemas em `config.yml:11`).
- Fluxo: edita JSON no GitHub → deploy Hosting serve `public/data/*.json`.
- Teste local documentado em `README-CMS.txt:9`: `python -m http.server 8888` + `npx decap-server` → `http://localhost:8888/admin/`.
- Produção exige login Git (Git Gateway/Netlify Identity); no Firebase Hosting puro o Decap só commita no GitHub, não escreve no Firestore.

### 4.2 Firebase Admin (`admin-firebase/`)
- Login Email/Senha (`admin-firebase/index.html:11`), gate em `admin.js:796 isAllowedAdmin()` (lista `ADMIN_EMAILS` + doc `admins/{uid}` + `users/{uid}.role`).
- Abas (`admin-firebase/index.html:23`): Dashboard, Articles+Flipbook, Stations, Products, Hosts, Settings, Site Meta, Textos do Site, Share, Theme, Cart, Home/Header Buttons, Archive Tags, Info Popups, Access, Media, Backup, Logs, Import.
- CRUD genérico: `buildPanels()` (`admin.js:182`), `loadList/saveItem/editItem/delItem` (`admin.js:899,928,929,941`), `getPayload()` (`admin.js:901`), slug automático (`admin.js:71`).
- Settings granular: `saveSettings/loadSettings` (`admin.js:944`), site meta (`admin.js:1044`), site texts (`admin.js:990`), share (`admin.js:1092`), theme (`admin.js:1110`), cart/home/header/tags/infoCards/access.
- Mídia: upload Storage com preview/progresso/URL copiável/delete + biblioteca `media` no Firestore (`RELEASE_NOTES.md:4`).
- Backup: export JSON + snapshot Firestore + restore (`RELEASE_NOTES.md:7`); Import de JSON.
- Logs: `logAction()` (`admin.js:92`) grava `logs` (login, save, delete, upload, import, export, restore).
- Dashboard: contadores por coleção + status Firebase (`admin.js:898`).
- Builder: páginas/blocos/templates em `builderPages/builderBlocks/builderAssets/builderTemplates/builderSettings/builderHistory` (`admin.js:485+`, rules `firestore.rules:40`).
- Publicado em `public/admin-firebase/` como espelho da fonte. Fonte e deploy consolidados (sync deploy→fonte; originais preservados em `admin-firebase/*.pre-sync-bak`).

## 5. Backend Express (`backend/`)

- `backend/package.json:1`: `type: module`, deps `express ^4.21.2, multer ^2.4.0, axios ^1.20.0, cors ^2.8.6, dotenv ^18.0.3, tumblr.js ^5.0.1`. Start: `node server.js`.
- Env (`backend/.env`, 8 chaves — **não commitar valores**): `SUBSTACK_PUBLICATION, SUBSTACK_POST_ID, SUBSTACK_COOKIE, SUBSTACK_LLI, TUMBLR_CONSUMER_KEY, TUMBLR_CONSUMER_SECRET, TUMBLR_TOKEN, TUMBLR_TOKEN_SECRET`.
- Rotas (`backend/server.js`):
  - `POST /api/upload-cover` (`server.js:33`): multer `cover` → `client.createPost("cyberisdead")` → relê último post → regex `64.media.tumblr.com` → `{ ok, coverUrl }`; limpa temp em `finally`.
  - `POST /api/upload-audio` (`server.js:118`): multer `audio` → Substack multipart (`/api/v1/audio/upload` → PUT nas `multipartUploadUrls` com ETag → `/transcode` → polling até 60×5s → extrai `token` do RSS privado → `GET /api/v1/audio/upload/:id/src` espera 307 → `{ ok, audioUrl }`).
  - `GET /api/test`, `/api/substack-config`, `/api/substack-rss-test`, `/api/substack-audio-url/:uploadId` (`server.js:444,459,474,518`): diagnósticos.
  - `GET /api/audio-proxy?url=` (`server.js:617`): stream com `Range` repassado, força `audio/mpeg`, `Accept-Ranges`, `Cache-Control: public,max-age=3600`.
  - `GET /api/image-proxy?url=` (`server.js:707`): `arraybuffer` até 15 MB, valida `image/*`, `Cache-Control: public,max-age=86400`, CORS `*`.
- Sem auth/rate-limit no Express; CORS aberto (`server.js:19`); uploads sem limite de tamanho no multer (limite só existe nas Storage Rules).

## 6. Cloud Functions (`functions/`)

- `functions/package.json:11`: Node 24, `firebase-admin ^13.6.0`, `firebase-functions ^7.0.0`.
- `functions/index.js:4`: única exportação `audioProxy = onRequest(...)` — valida `?url`, `axios.get(responseType: stream, User-Agent: Mozilla/5.0)`, força `Content-Type: audio/mpeg`, `Access-Control-Allow-Origin: *`, pipe. Sem validação de host, sem Range, sem cache — versão simplificada do `/api/audio-proxy` do backend.
- Docs (`SETUP_ENTERPRISE_BACKEND.md`, `ROADMAP_PRODUCTION.md`) citam Stripe/MP/Resend/Algolia/backup diário como **estrutura planejada, não implementada** neste `index.js`.

## 7. Dados — Firestore

Coleções de conteúdo (leitura pública, escrita admin — `firestore.rules:31`):
- `articles`: ensaios/materiais (title, category, year, date, excerpt, color, media[], body[]).
- `stations`: episódios rádio (id, hostId, title, kicker, name, type, desc, audio, video, cover, background{type,src}, links[], genres[], tracklist[], episodeDescription, download, shareUrl).
- `products`: loja (id, name, type, price, color, desc, images[]) — 9 itens seed em `public/data/products.json`.
- `hosts`: (id, name, photo, bio, episodes[], socials[]).
- `settings/{globalSocials, theme, cart, homeButtons, headerButtons, archiveTags, infoCards, access, site, share, siteTexts}` (`admin.js:21`): identidade, tema, checkout, textos i18n, botões, popups About/Contact/Donate.
- `media`: biblioteca de uploads; `logs`: auditoria; `backups`: snapshots; `builder*`: builder visual.
- Membership (`membership.js:282`): `membershipPlans, calendarEvents, memberContent, comments` (+ `fallbackPlans` com 4 tiers R$ 3,90–59,90).
- Índices (`firestore.indexes.json`): 7 compostos (articles status+createdAt; stations hostId+createdAt; products type+createdAt; membershipPlans active+sortOrder; memberContent status+createdAt; calendarEvents status+date; comments status+createdAt).
- Seed Git equivalente em `public/data/*.json` (articles ~3,5 KB, stations ~4,6 KB, products ~3,2 KB, hosts ~1,4 KB).

## 8. Auth, regras e segurança

Firestore (`firestore.rules:4`): `isAdmin() = adminEmail() || adminUidDoc() || userRoleAdmin()`.
- `adminEmail`: 5 e-mails hardcoded (`aura1000x@, cyberisde4d@, cyberisdead4d@, cyberisdead2015@, luankeditor@`).
- `adminUidDoc`: existência de `admins/{uid}` (criação manual — `SETUP_ENTERPRISE_BACKEND.md:63`).
- `userRoleAdmin`: `users/{uid}` com `role==admin` ou `isAdmin/admin/owner==true`.
- Leitura pública em conteúdo/settings/mídia; `logs/backups/builderHistory` só admin; `admins` leitura self-or-admin; `users` self-create/read/update; catch-all final nega tudo (`firestore.rules:56`).

Storage (`storage.rules:5`): apenas 3 e-mails (`cyberisdead2015@, luankeditor@, aura1000x@`) podem escrever/deletar, limite 25 MB; leitura pública. **Divergente do Firestore (5 vs 3 e-mails)** — sincronizar.

Pontos de atenção (não ignorar):
1. API keys Firebase expostas no client — esperado para web, mas segurança real depende das Rules.
2. `backend/.env` contém `SUBSTACK_COOKIE/LLI` e segredos Tumblr — nunca commitar; `.gitignore:66` já ignora `.env`, mas o arquivo existe no disco local.
3. Membership: coleções `membershipPlans/memberContent/calendarEvents/comments` **sem `match` explícito** nas rules → caem no `deny` final. O front faz fallback local (`membership.js:194,211`), mas leitura/escrita online falhará até adicionar regras ou Cloud Function. `comments` aceita `status: pending` sem moderação server-side.
4. Proxies (`/api/audio-proxy`, `/api/image-proxy`, `audioProxy`) sem allowlist — risco de SSRF/abuso; adicionar validação de host + rate limit (roadmap já prevê — `ROADMAP_PRODUCTION.md:18`).
5. `backend/uploads/` com arquivo de 550 MB + CORS Storage restrito a 3 origens (`cors.json:3`).

## 9. Configuração e deploy

| Item | Arquivo | Valor |
|---|---|---|
| Hosting root | `firebase.json:3` | `public` |
| Cache HTML | `firebase.json:13` | `no-cache, max-age=0` |
| Projeto exemplo | `.firebaserc.example:3` | `COLOQUE-SEU-PROJECT-ID-AQUI` (copiar para `.firebaserc`) |
| Projeto real (client) | `index.html:675` | `cyberisdeadesite` |
| Functions runtime | `functions/package.json:12` | Node 24 |
| CORS Storage | `cors.json` | `cyberisdeadesite.web.app`, `firebaseapp.com`, `localhost:8080` |

Comandos (cf. `README-CMS.md:20`, `SETUP_ENTERPRISE_BACKEND.md:79`):
```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions
npm --prefix functions install
# Decap local:
npx decap-server & python -m http.server 8888  # -> http://localhost:8888/admin/
```
Ordem segura: `firestore:rules,storage` → `functions` → `hosting`. Primeiro admin exige `admins/{UID}` manual.

## 10. Dívidas técnicas e próximos passos

1. Unificar `index.html` raiz ⇄ `public/index.html` (hoje cópia manual) ou mudar `firebase.json` para multi-site.
2. (Resolvido) `admin-firebase/` consolidado com `public/admin-firebase/` — manter a regra de sincronia fonte→deploy.
3. Restaurar `data/*.json` deletados ou remover a pasta `data/` e oficializar `public/data/` como fonte Decap (ajustar `config.yml file:`).
4. Adicionar rules para membership + moderação de `comments`.
5. Sincronizar listas de admin entre `firestore.rules` e `storage.rules`; mover para `admins/` + Custom Claims.
6. Allowlist + rate-limit nos proxies; limite de tamanho no multer; remover arquivo 550 MB de `backend/uploads/`.
7. Implementar de fato Stripe/MP/Resend/Algolia/backup agendado (hoje só docs) ou remover do roadmap.
8. Migrar segredos para Secret Manager (`functions:config` é legado) e rotacionar `SUBSTACK_*`/Tumblr.
9. PWA (`sw.js`, `manifest`) só no admin — decidir se loja terá offline.
10. Testes: `node --check` no admin (cf. `RELEASE_NOTES.md:16`); falta E2E (Playwright no roadmap).

---
*Gerado por leitura estática do worktree (sem execução de deploy). Para validar, rode os comandos do §9 em staging antes de produção.*
