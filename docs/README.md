# Documentação — CYBERISDEAD / AURA ARCHIVE

Toda a documentação do projeto mora nesta pasta (`docs/`). Ela **não** é publicada no Firebase Hosting (`firebase.json` serve só `public/`).

## Índice

| Arquivo | Conteúdo |
|---|---|
| `DOCUMENTACAO_TECNICA.md` | Documentação técnica completa: arquitetura, frontend, CMS duplo, backend, functions, Firestore, regras, deploy, dívidas técnicas |
| `CHANGELOG.md` | Histórico de mudanças (Keep a Changelog) |
| `README-CMS.md` / `README-CMS.txt` | Instalação e uso do CMS (Decap + Firebase) |
| `README_FASE1.txt` | Notas da Fase 1 (deploy só-Hosting) |
| `README_INFO_POPUPS.txt` | Notas da atualização Info Popups |
| `README_THEME_UPDATE.txt` | Notas da atualização Theme Background |
| `RELEASE_NOTES.md` | Release das camadas finais de backend |
| `ROADMAP_PRODUCTION.md` | Roadmap de produção (estrutura vs config externa vs futuro) |
| `SETUP_ENTERPRISE_BACKEND.md` | Setup do backend enterprise (segredos, primeiro admin, deploy) |
| `TESTES_UPLOADS_INFRA_2026-09-27.md` | Testes de uploads (Tumblr/Substack) + infra: checkpoints C/U/I/B/E2E, log de 2026-09-27 |
| `admin-firebase-README_FIX.txt` | Fix validado do admin (antes em `public/admin-firebase/`) |
| `admin-firebase-README_RESTAURADO.txt` | Restauração da base correta do admin |

## Por que `.gitignore`, `firebase.json`, `firestore.rules` etc. continuam na raiz?

Ferramentas do Firebase exigem esses arquivos no root do projeto:

- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` — lidos pelo `firebase-tools` na raiz.
- `.gitignore` — lido pelo Git na raiz.
- `functions/` — o deploy de Cloud Functions espera a pasta na raiz (cf. `firebase.json:22`).

Mover qualquer um deles quebra o deploy. Por isso a reorganização mantém esses arquivos na raiz e concentra em `docs/` apenas a documentação.

## Regra de sincronia (fontes canônicas vs cópias de deploy)

| Fonte canônica (editar aqui) | Cópia de deploy (não editar direto) |
|---|---|
| `index.html` (raiz) | `public/index.html` |
| `admin-firebase/` | `public/admin-firebase/` |
| `data/*.json` | `public/data/*.json` |
| `membership.js` (raiz) | `public/radio/membership.js` |
| `admin/config.yml` + `config.yml` (idênticos) | — |

Após editar uma fonte, copie para o espelho em `public/` e rode `firebase deploy --only hosting`.
