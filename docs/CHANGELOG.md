# Changelog — CYBERISDEAD / AURA ARCHIVE

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/). Datas do `git log` (`main`).

## [Unreleased]
### Added
- Documentação técnica (`docs/DOCUMENTACAO_TECNICA.md`): arquitetura, CMS duplo, backend, functions, Firestore, regras, deploy, dívidas técnicas.
- Este changelog (`docs/CHANGELOG.md`).
- Índice da documentação (`docs/README.md`) com regra de sincronia fonte→deploy.
- `public/radio/membership.js` (espelho de `membership.js` da raiz — corrige `<script src="./membership.js">` quebrado em `public/radio/index.html:6868`).
- Backups pré-sync em `admin-firebase/*.pre-sync-bak` (ignorados no git).
- `docs/TESTES_UPLOADS_INFRA_2026-09-27.md`: checkpoints C/U/I/B/E2E + log dos testes de 2026-09-27 (reverificado: C1 400, C4 200, C5 200/200, C6 503).
- `workers/worker.js`: código-fonte do Worker `cyber-proxy` versionado no repo (`GET /api/diag`, trim em todos os segredos, erros prefixados `tumblr:|substack:|rede:|req:|limite:`, shape `{ok, coverUrl|audioUrl, message}` preservado).

### Changed
- Reorganização segura (mantém `public/` como deploy, sem mudar rotas):
  - Toda a documentação da raiz movida para `docs/` (10 arquivos + 2 READMEs de `public/admin-firebase/`).
  - `admin-firebase/` consolidado com `public/admin-firebase/` (sync deploy→fonte: `admin.js`, `admin.css`, `index.html`; importados `member-area.html`, `membership-admin.js`, `manifest.webmanifest`, `sw.js`).
  - `data/*.json` restaurados a partir de `public/data/` (fonte Decap exigida por `config.yml`).
  - `.gitignore`: ignora `backend/uploads/`, `backend/.env` explícito e `*.pre-sync-bak`.
- `docs/DOCUMENTACAO_TECNICA.md` atualizada com a nova organização e a regra de sincronia.
- Mantidos na raiz por exigência do Firebase/Git: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `.gitignore`, `functions/` (ver `docs/README.md`).

### Fixed
- Referência quebrada `./membership.js` na página do rádio (arquivo não existia em `public/radio/`).
- Fonte Decap `data/*.json` ausente no worktree (estava `D` no git status).

### Known issues (mapeadas na documentação, ainda sem fix)
- `index.html` raiz espelhado manualmente em `public/index.html` — deploy usa só `public/` (`firebase.json`).
- Coleções `membershipPlans/memberContent/calendarEvents/comments` sem regra no `firestore.rules` (caem no deny-all).
- Coleções `membershipPlans/memberContent/calendarEvents/comments` sem regra no `firestore.rules` (caem no deny-all).
- `storage.rules` com 3 admin e-mails vs 5 no `firestore.rules`.
- Proxies de áudio/imagem sem allowlist/rate-limit; `backend/uploads/` com arquivo ~550 MB.
- Stripe/Mercado Pago/Resend/Algolia/backup automático documentados mas não implementados em `functions/index.js` (só `audioProxy`).

## [0.3.0] — 2026-05-23
### Added
- `config.yml` na raiz como fallback do Decap (`c1e9277 add root decap config fallback`).
- `admin/config.yml` + `admin/index.html` (Decap CMS `^3.1.2`, backend `github`, `local_backend: true`).
- Coleções Decap: `articles`, `episodes` (`data/stations.json`), `shop` (`data/products.json`), `hosts`, `settings` (`globalSocials`, `infoContent`).

## [0.2.0] — 2026-05-23
### Added
- Configuração Decap GitHub backend (`07b5aeb configure decap github backend`).
- `media_folder: assets/uploads`, `public_folder: /assets/uploads`.

## [0.1.0] — 2026-05-23
### Added
- Site base com Decap CMS (`da26138 site com decap cms`): `index.html`, `data/*.json`, `firebase.json`.

## Notas de releases anteriores (arquivos avulsos, sem data Git — consolidados aqui)

### Backend layers finais (`RELEASE_NOTES.md`)
- Upload real Firebase Storage (preview, progresso, URL copiável, delete) + biblioteca `media`.
- Dashboard com contadores/status; busca instantânea; status/acesso por conteúdo; slug editável.
- Backup JSON + snapshot Firestore + restauração; logs (login, save, delete, upload, import, export, restore).
- `firestore.rules` + `storage.rules`; admin responsivo; `admin.js` validado com `node --check`.

### Fase 1 (`README_FASE1.txt`)
- `public/index.html`, `public/admin-firebase/*`, `firebase.json` alinhados para deploy só-Hosting (sem Storage/Functions/Blaze).

### Info Popups (`README_INFO_POPUPS.txt`)
- Aba Info Popups no admin (About/Contact/Donate editáveis sem código); site lê `settings/infoCards`.

### Theme Background (`README_THEME_UPDATE.txt`)
- Controles de background no admin (presets claro/escuro); site lê `settings/theme`; player inalterado.

### Enterprise backend — estrutura (`SETUP_ENTERPRISE_BACKEND.md`, `ROADMAP_PRODUCTION.md`)
- Previsto (requer config externa): Stripe/MP checkout, Resend, Algolia, domínio/DNS, billing, `admins/{UID}`.
- Futuro: SSR Next.js, analytics visual, Cloud Tasks/Pub-Sub, Cloudflare, Sentry, Playwright.
- Estado atual do código: backend Express (Tumblr/Substack/proxies) + `audioProxy` funcionais; demais itens são esqueleto/docs.
