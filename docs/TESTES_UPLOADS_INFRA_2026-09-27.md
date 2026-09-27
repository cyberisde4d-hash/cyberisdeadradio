# Documento de Testes — Uploads (Tumblr / Substack) + Infra

Projeto: aura_archive_decap_cms · Data: 2026-09-27
Escopo: conexão, upload, interface (host-admin) e backend (Worker + Firebase).

> Arquivado em `docs/` em 2026-09-27. Fonte: documento recebido no chat (transcrição integral abaixo).

## 1. CHECKPOINTS DE CONEXÃO

| # | Teste | Como executar | Esperado |
|---|---|---|---|
| C1 | Worker no ar | GET https://cyber-proxy.cyberisde4d.workers.dev/ | 400 URL inválida (prova que responde) |
| C2 | Rota /api/upload-cover existe | POST multipart teste | ≠ 404 (ROTA, não erro de negócio) |
| C3 | Segredos Tumblr presentes | Upload real de 1px | avança além de 401 (201 ou erro de conteúdo) |
| C4 | Firestore acessível (leitura pública) | GET REST settings/live com API key pública | 200 + doc |
| C5 | Firebase Hosting servindo radio/host-admin | GET /radio/ e /host-admin/ | 200 |
| C6 | Backend Render (legado) | GET /api/test | 200 (se vivo) / 503 (se suspenso — esperado hoje) |

## 2. CHECKPOINTS DE UPLOAD (Tumblr foto / Substack áudio via Worker)

| # | Teste | Como executar | Esperado |
|---|---|---|---|
| U1 | OAuth Tumblr válido | GET assinado /v2/user/info com as 4 chaves | 200 + user.name = cyberisdead |
| U2 | POST foto multipart (OAuth só c/ params oauth) | POST /v2/blog/cyberisdead/post type=photo + gif 1px | 201 Created + response.id |
| U3 | GET do post recém-criado | GET /v2/blog/cyberisdead/posts?id=<id> | 200 + photos[0].original_size.url |
| U4 | Worker /api/upload-cover fim a fim | POST cover=\<gif 1px> no Worker | {ok:true, coverUrl} |
| U5 | Link da capa abre no navegador | GET na coverUrl retornada | 200 image/* |
| U6 | Substack: create upload | POST api/v1/audio/upload?... com cookies (via Worker) | mediaUpload.id + multipartUploadUrls[] |
| U7 | Substack: partes + transcode + poll | PUT partes → POST transcode → poll uploaded_at | uploaded_at preenchido |
| U8 | Substack: URL final | token do RSS + GET /src sem redirect | header location com mp3 |
| U9 | Worker /api/upload-audio fim a fim (mp3 ≤90MB) | POST audio=\<mp3> no Worker | {ok:true, audioUrl} |

## 3. CHECKPOINTS DE INTERFACE (host-admin)

| # | Teste | Como executar | Esperado |
|---|---|---|---|
| I1 | Campo Backend URL | Abrir host-admin → etapa Áudio | mostra valor padrão Worker; trocar salva em localStorage |
| I2 | Upload capa | Escolher imagem → sai sozinho | pill Enviando capa… → Capa pronta + URL no campo + preview renderiza |
| I3 | Upload áudio | Escolher MP3 → Enviar | pill carrega → Áudio pronto + player toca preview |
| I4 | Arquivo > 90MB | Tentar WAV 1h | mensagem pedindo MP3, sem travar |
| I5 | Erro do Worker visível | Forçar falha (ex: segredo errado) | toast/status mostra a mensagem real (não genérica) |
| I6 | Publicar episódio | Preencher + Publicar | doc em stations com audio/cover e toast de sucesso |

## 4. CHECKPOINTS DE BACKEND/WORKER

| # | Teste | Como executar | Esperado |
|---|---|---|---|
| B1 | Proxy GET ?url= imagem | GET Worker com URL de imagem | 200 + content-type image/* |
| B2 | Proxy GET ?url= áudio com Range | GET com Range: bytes=0-1023 | 206 + content-range |
| B3 | CORS | OPTIONS em qualquer rota | Access-Control-Allow-Origin: * |
| B4 | Segredos aplicados | Deploy após salvar secrets | novo deploy ativo (id muda no dashboard) |
| B5 | Versão do código | preview do editor == arquivo final entregue | contém archive-upload, upload-cover, upload-audio, hmacBytes com trim |

## 5. CHECKPOINTS FINAIS (ponta a ponta)

| # | Teste | Esperado |
|---|---|---|
| E2E-1 | Host de outro país abre host-admin, envia capa+áudio MP3, publica | capa e áudio com URLs https, preview OK |
| E2E-2 | Abrir /radio, tocar o episódio novo | áudio toca sem erro, capa aparece |
| E2E-3 | Firebase deploy hosting | firebase deploy --only hosting sem erro + Ctrl+F5 carrega novo |

## 6. LOG DOS TESTES JÁ REALIZADOS

| Data/hora (UTC) | Teste | Resultado |
|---|---|---|
| 2026-09-27 | GET /api/test Render | 503 — backend suspenso (causa raiz da queda) |
| 2026-09-27 | Direto Substack /upload/\<id> (truncada) | 400 (URL incompleta, esperado) |
| 2026-09-27 | Direto Substack /src?token= completa | 206 áudio OK |
| 2026-09-27 | Via Worker ?url= (imagem Tumblr válida) | 200 image/jpeg |
| 2026-09-27 | Via Worker ?url= (áudio Substack completo) | 206 áudio OK |
| 2026-09-27 | Logo Tumblr TRACK ID (todas variantes, c/ e s/ referer) | 404 — objeto apagado no Tumblr |
| 2026-09-27 | Logo Tumblr novo (692de1ca…pnj) direto + referer site | 200 image/jpeg |
| 2026-09-27 | GET OAuth /v2/user/info chaves do .env | 200 user=cyberisdead — chaves válidas |
| 2026-09-27 | POST foto multipart (2 variantes assinatura) | 201 Created ×2 (ids 828923556649992192, 828923557199413248 — apagar no Tumblr) |
| 2026-09-27 | POST /archive-upload Worker (rota antiga) | b is not iterable → corrigido (hex + ArrayBuffer) |
| 2026-09-27 | POST /archive-upload após fix | archive 403 InvalidAccessKeyId → conta IA nova sem S3 ativo |
| 2026-09-27 | PUT S3 IA direto (Python, SigV4 própria) | 403 InvalidAccessKeyId — confirma: problema na conta/chaves IA, não no Worker |
| 2026-09-27 | Worker /upload → Catbox (multipart manual) | catbox 520 — Catbox recusa egresso Cloudflare |
| 2026-09-27 | Catbox direto (curl) | 200 + URL — Catbox vivo, só bloqueia o Worker |
| 2026-09-27 | 0x0.st | uploads desligados (spam) — descartado |
| 2026-09-27 | archive.org S3 CORS (OPTIONS) | access-control-allow-origin: * — liberado p/ browser |
| 2026-09-27 | Syntax check admin.js (renewals) | OK (node --check) |
| 2026-09-27 | Syntax check radio/index.html (módulo) | OK (node --check) |
| 2026-09-27 | Syntax check host-admin (módulo) | OK (node --check) |
| 2026-09-27 | Syntax check backend/server.js | OK (node --check) |
| 2026-09-27 | Backend local npm start + /api/test | 200 API CYBERISDEAD funcionando |
| 2026-09-27 | Firestore REST público settings/live | 200 + linha TRACK ID lida |
| 2026-09-27 | Firestore REST stations (9 docs) | 200 — séries/áudios/capas conferidos |
| 2026-09-27 | Produção contém audioOverride, seenKeys, resolveCover, renewal-4+ | confirmado via fetch do HTML (deploy em dia) |
| PENDENTE | Worker /api/upload-cover fim a fim | aguardando segredos Tumblr corretos + Deploy |
| PENDENTE | Worker /api/upload-audio fim a fim | aguardando teste com MP3 real após cover OK |
| PENDENTE | E2E-1/E2E-2/E2E-3 | após PENDENTEs acima |
| 2026-09-27 16:45 | C1 Worker no ar (reverificação) | 400 — Worker responde ✅ |
| 2026-09-27 16:45 | C4 Firestore REST settings/live (reverificação) | 200 ✅ — ⚠️ `stations[0].logo` ainda aponta p/ URL Tumblr apagada (`tumblr_pzhcetb3Pv1wph9p0o1_1280.jpg`, 404) |
| 2026-09-27 16:45 | C5 Hosting /radio/ e /host-admin/ (reverificação) | 200 + conteúdo ✅ |
| 2026-09-27 16:45 | C6 Backend Render /api/test (reverificação) | 503 — suspenso (esperado) ✅ |
| 2026-09-27 16:45 | U4 Worker /api/upload-cover (gif 1px/43B) | ❌ `tumblr post: 401 Unauthorized (code 1008)` — segredos Tumblr do Worker inválidos. C2 ✅ (rota existe, ≠404), C3 ❌ |
| 2026-09-27 16:45 | U9 Worker /api/upload-audio (mp3 8,9MB) | ❌ `"Not authorized" is not valid JSON` — cookies Substack do Worker rejeitados. Rota existe (≠404), falha em U6 |
| 2026-09-27 16:45 | U5 | N/A — sem coverUrl (U4 falhou) |
| 2026-09-27 17:06 | FIX Worker: `workers/worker.js` criado (diag + trim + prefixos) | `node --check` OK |
| 2026-09-27 17:06 | FIX: assinatura OAuth1 (base-string RFC 5849 §3.4.1.2) | OK — byte a byte igual ao RFC |
| 2026-09-27 17:06 | FIX: HMAC-SHA1 (conferência cruzada JS × Python stdlib) | OK — `wPkvxykrw+BTdCcGqKr+3I+PsiM=` nas duas |
| 2026-09-27 17:06 | FIX: `S()` trim em TUMBLR_* + SUBSTACK_* | OK |
| 2026-09-27 17:06 | FIX item 4: host-admin exibe `result.message` | Confirmado (`host-admin:297,348`) — nenhuma mudança no fluxo |
| PENDENTE | Colar `workers/worker.js` no dashboard + redigitar segredos + Deploy | depois: U4, U9, `/api/diag`, E2E-1/2/3 |
| 2026-09-27 17:09 | Re-teste GET `/api/diag` | 400 "URL inválida" — código novo AINDA NÃO publicado (rota não existe no Worker live) |
| 2026-09-27 17:09 | Re-teste U4 (gif 1px) | ❌ idêntico: `tumblr post: 401 code 1008` em formato ANTIGO (sem prefixo `tumblr:`) — confirma Worker antigo + segredos ainda inválidos. U9 pulado (mesmo código/segredos, resultado seria o mesmo) |
| 2026-09-27 17:12 | Segredos recebidos: diag direto (equivale `/api/diag`) | Tumblr: ✅ OK user=cyberisdead (4 chaves VÁLIDAS) · Substack: ❌ rss 404 + create-upload 403 "Not authorized" — cookies `sid/lli` MORTOS, precisa login novo |
| 2026-09-27 17:12 | U2 direto (POST foto 1px c/ chaves válidas) | 201 Created id_string=828929858784608256 (post de teste — apagar no Tumblr) |
| 2026-09-27 17:12 | U3/U5 direto (GET post + abrir URL) | ✅ `https://64.media.tumblr.com/...gif` → 200 image/gif 43B |
| 2026-09-27 17:12 | BUG real achado e corrigido em `workers/worker.js` | IDs Tumblr > 2^53: `response.id` numérico arredonda (...300→...256) e o GET dá 404 — agora usa `id_string` |
| PENDENTE | Dashboard: colar `workers/worker.js` + segredos Tumblr (válidos) + cookies Substack NOVOS + Deploy | depois: U4, U9, `/api/diag` live, E2E-1/2/3 |
| 2026-09-27 17:35 | Pós-deploy: GET `/api/diag` | ✅ código novo NO AR — `tumblr:{ok:false,status:401}` (segredos do dashboard ainda divergem dos válidos) · `substack:{ok:false,status:404}` (cookies mortos, esperado) |
| 2026-09-27 17:35 | Pós-deploy: U4 (gif 1px) | Formato novo ✅ `tumblr:401 Unauthorized` — falta corrigir os 4 valores no dashboard |
| 2026-09-27 17:35 | Pós-deploy: U9 (mp3 8,9MB) | `substack:create (SUBSTACK_POST_ID ausente)` — falta cadastrar `SUBSTACK_POST_ID=216787416` (+ cookies novos) |
| 2026-09-27 17:43 | Alteração: `/api/diag` agora retorna `env` com TAMANHO dos segredos (nunca valores) | Detecta nome errado/vazio no dashboard. Esperado: Tumblr 50/50/50/50; após colar o bloco, Redeploy e chamar `/api/diag` de novo |

## 7. RISCOS CONHECIDOS

- Worker free: arquivos ≤ ~90MB (memória 128MB) — WAV de 1h precisa virar MP3.
- Substack transcode pode levar minutos — poll atual cobre ~3min; se estourar, retorna substack ainda processando e o host tenta de novo.
- Segredos colados com espaço quebram OAuth — código faz trim, mas redigitar é mais seguro.
- Chaves expostas neste chat: considerar regenerar Tumblr tokens + IA keys ao final.
