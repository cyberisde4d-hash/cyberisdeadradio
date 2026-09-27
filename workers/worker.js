/* ============================================================================
 * cyber-proxy — Worker Cloudflare (CYBERISDEAD / AURA ARCHIVE)
 * Rotas: GET / | GET /api/diag | POST /api/upload-cover | POST /api/upload-audio
 * Convenção de erros (sem vazar segredos/cookies):
 *   tumblr:<status> <msg>   — erro da API Tumblr (ex: tumblr:401 Unauthorized)
 *   substack:<etapa> (...)  — falha numa etapa Substack (create|partes|transcode|
 *                              processando|rss|url-final)
 *   rede:<erro>             — falha de rede/fetch/resposta + erros de rota/método
 *   req:<erro>              — requisição inválida (campo ausente)
 *   limite:<erro>           — arquivo > 90MB (memória do plano free)
 * Deploy: colar este arquivo inteiro no editor do dashboard (Settings → Variables
 * precisa de TUMBLR_CONSUMER_KEY, TUMBLR_CONSUMER_SECRET, TUMBLR_TOKEN,
 * TUMBLR_TOKEN_SECRET, SUBSTACK_COOKIE (substack.sid), SUBSTACK_LLI,
 * SUBSTACK_POST_ID). Todos passam por trim() antes de usar.
 * ========================================================================== */

const TUMBLR_API = "https://api.tumblr.com";
const TUMBLR_BLOG = "cyberisdead";
const SUBSTACK_BASE = "https://cyberisdeadesite.substack.com";
const SUBSTACK_API = "https://api.substack.com";
const MAX_BYTES = 90 * 1024 * 1024;
const SUBSTACK_UA = "Mozilla/5.0";
const SUBSTACK_REFERER = "https://cyberisdeadesite.substack.com/";

/* ---- Bloco 1: segredos (trim) + HTTP helpers + CORS ---------------------- */

function S(env) {
  const t = (v) => String(v ?? "").trim();
  return {
    consumerKey: t(env.TUMBLR_CONSUMER_KEY),
    consumerSecret: t(env.TUMBLR_CONSUMER_SECRET),
    token: t(env.TUMBLR_TOKEN),
    tokenSecret: t(env.TUMBLR_TOKEN_SECRET),
    sid: t(env.SUBSTACK_COOKIE),
    lli: t(env.SUBSTACK_LLI),
    postId: t(env.SUBSTACK_POST_ID),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function subHeaders(s) {
  return {
    Cookie: `substack.sid=${s.sid}; substack.lli=${s.lli}`,
    "User-Agent": SUBSTACK_UA,
    Referer: SUBSTACK_REFERER,
  };
}

/* ---- Bloco 2: OAuth 1.0a (RFC 5849, HMAC-SHA1) ---------------------------- */

function pctEncode(str) {
  return encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildBaseString(method, baseUrl, params) {
  const sorted = Object.keys(params)
    .map((k) => [pctEncode(k), pctEncode(params[k])])
    .sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1
    )
    .map((p) => p[0] + "=" + p[1])
    .join("&");
  return (
    method.toUpperCase() + "&" + pctEncode(baseUrl) + "&" + pctEncode(sorted)
  );
}

function nonceHex(n = 16) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function oauthSignature({ method, baseUrl, params, consumerSecret, tokenSecret }) {
  const key = pctEncode(consumerSecret) + "&" + pctEncode(tokenSecret || "");
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    k,
    new TextEncoder().encode(buildBaseString(method, baseUrl, params))
  );
  const bytes = new Uint8Array(sig);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function oauthAuthHeader(method, baseUrl, extraParams, secrets) {
  const oauth = {
    oauth_consumer_key: secrets.consumerKey,
    oauth_token: secrets.token,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: nonceHex(),
    oauth_version: "1.0",
  };
  const signature = await oauthSignature({
    method,
    baseUrl,
    params: { ...extraParams, ...oauth },
    consumerSecret: secrets.consumerSecret,
    tokenSecret: secrets.tokenSecret,
  });
  const all = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(all)
      .map((k) => pctEncode(k) + '="' + pctEncode(all[k]) + '"')
      .join(", ")
  );
}

// GET assinado. extraParams entram na query E na assinatura.
async function tumblrGet(path, extraParams, secrets) {
  const baseUrl = TUMBLR_API + path;
  const auth = await oauthAuthHeader("GET", baseUrl, extraParams, secrets);
  const qs = new URLSearchParams(extraParams).toString();
  return fetch(qs ? baseUrl + "?" + qs : baseUrl, {
    headers: { Authorization: auth, "User-Agent": SUBSTACK_UA },
  });
}

/* ---- Bloco 3: GET /api/diag (não posta nada, não vaza segredos) ----------- */

async function handleDiag(env) {
  const s = S(env);
  const out = { ok: false, tumblr: { ok: false }, substack: { ok: false } };

  // Presença/tamanho dos segredos (NUNCA valores) — detecta nome errado ou vazio.
  out.env = {
    tumblr: {
      TUMBLR_CONSUMER_KEY: s.consumerKey.length,
      TUMBLR_CONSUMER_SECRET: s.consumerSecret.length,
      TUMBLR_TOKEN: s.token.length,
      TUMBLR_TOKEN_SECRET: s.tokenSecret.length,
    },
    substack: {
      SUBSTACK_COOKIE: s.sid.length,
      SUBSTACK_LLI: s.lli.length,
      SUBSTACK_POST_ID: s.postId.length,
    },
  };

  try {
    const res = await tumblrGet("/v2/user/info", {}, s);
    const body = await safeJson(res);
    if (res.ok && body?.response?.user) {
      out.tumblr = { ok: true, user: body.response.user.name };
    } else {
      out.tumblr = {
        ok: false,
        status: res.status,
        code: body?.meta?.status ?? body?.errors?.[0]?.code ?? res.status,
        error: body?.meta?.msg ?? body?.errors?.[0]?.title ?? "tumblr:falha",
      };
    }
  } catch (e) {
    out.tumblr = { ok: false, code: "rede", error: "rede:" + e.message };
  }

  try {
    const res = await fetch(
      SUBSTACK_BASE + "/api/v1/subscription/podcast_rss_url?section_id",
      { headers: subHeaders(s) }
    );
    const body = await safeJson(res);
    out.substack =
      res.ok && body?.podcast_rss_url
        ? { ok: true }
        : { ok: false, status: res.status };
  } catch (e) {
    out.substack = { ok: false, code: "rede" };
  }

  out.ok = out.tumblr.ok === true && out.substack.ok === true;
  return json(out);
}

/* ---- Bloco 4: POST /api/upload-cover (foto → Tumblr) ---------------------- */

async function handleUploadCover(req, env) {
  const s = S(env);
  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, message: "req:form multipart inválido" }, 400);
  }
  const file = form.get("cover");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json(
      { ok: false, message: 'req:campo "cover" ausente (envie multipart)' },
      400
    );
  }
  if (file.size > MAX_BYTES) {
    return json(
      {
        ok: false,
        message: `limite:arquivo de ${(file.size / 1048576).toFixed(1)}MB excede o máximo de 90MB do Worker — envie imagem menor`,
      },
      413
    );
  }

  try {
    // Multipart: assinatura OAuth cobre SÓ os params oauth (corpo excluído).
    const baseUrl = `${TUMBLR_API}/v2/blog/${TUMBLR_BLOG}/post`;
    const auth = await oauthAuthHeader("POST", baseUrl, {}, s);
    const fd = new FormData();
    fd.append("type", "photo");
    fd.append("data", file, file.name || "cover.jpg");

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: auth },
      body: fd,
    });
    const body = await safeJson(res);
    if (!res.ok || body?.meta?.status !== 201) {
      const st = body?.meta?.status ?? res.status;
      const msg = body?.meta?.msg ?? body?.errors?.[0]?.title ?? res.statusText;
      return json({ ok: false, message: `tumblr:${st} ${msg}` }, 502);
    }
    // id_string: IDs do Tumblr excedem Number.MAX_SAFE_INTEGER — nunca usar
    // response.id numérico (JSON arredonda, ex: ...300 vira ...256 e o GET dá 404).
    const postId = body.response?.id_string ?? String(body.response?.id ?? "");

    // Resolve a URL direta da foto (mesma estratégia U3: GET por id).
    const pr = await tumblrGet(
      `/v2/blog/${TUMBLR_BLOG}/posts`,
      postId ? { id: String(postId) } : { limit: "1" },
      s
    );
    const pj = await safeJson(pr);
    const photo =
      pj?.response?.posts?.[0]?.photos?.[0]?.original_size?.url || null;
    if (!photo) {
      return json(
        { ok: false, message: `tumblr:sem URL de foto no post ${postId ?? "?"}` },
        502
      );
    }
    return json({ ok: true, coverUrl: photo });
  } catch (e) {
    return json({ ok: false, message: "rede:" + e.message }, 502);
  }
}

/* ---- Bloco 5: POST /api/upload-audio (áudio → Substack) ------------------- */

async function handleUploadAudio(req, env) {
  const s = S(env);
  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, message: "req:form multipart inválido" }, 400);
  }
  const file = form.get("audio");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json(
      { ok: false, message: 'req:campo "audio" ausente (envie multipart)' },
      400
    );
  }
  if (file.size > MAX_BYTES) {
    return json(
      {
        ok: false,
        message: `limite:arquivo de ${(file.size / 1048576).toFixed(1)}MB excede o máximo de 90MB do Worker — converta WAV para MP3`,
      },
      413
    );
  }
  if (!s.postId) {
    return json(
      { ok: false, message: "substack:create (SUBSTACK_POST_ID ausente)" },
      500
    );
  }

  try {
    const fileName = file.name || "audio.mp3";
    const fileSize = file.size;
    const fileType =
      typeof file.type === "string" && file.type.startsWith("audio/")
        ? file.type
        : "audio/mpeg";

    // Etapa create
    const createQs = new URLSearchParams({
      filetype: fileType,
      fileSize: String(fileSize),
      fileName,
      post_id: s.postId,
    }).toString();
    const createRes = await fetch(
      `${SUBSTACK_BASE}/api/v1/audio/upload?${createQs}`,
      { method: "POST", headers: subHeaders(s) }
    );
    const created = await safeJson(createRes);
    const uploadId = created?.mediaUpload?.id;
    const multipartId = created?.multipartUploadId;
    const urls = created?.multipartUploadUrls;
    if (!createRes.ok || !uploadId || !multipartId || !Array.isArray(urls) || !urls.length) {
      return json(
        { ok: false, message: `substack:create (status ${createRes.status})` },
        502
      );
    }

    // Etapa partes
    const buf = await file.arrayBuffer();
    const partSize = Math.ceil(fileSize / urls.length);
    const etags = [];
    for (let i = 0; i < urls.length; i++) {
      const start = i * partSize;
      const end = Math.min(fileSize, start + partSize);
      let put;
      try {
        put = await fetch(urls[i], {
          method: "PUT",
          headers: { "Content-Length": String(end - start) },
          body: buf.slice(start, end),
        });
      } catch (e) {
        return json(
          { ok: false, message: `rede:parte ${i + 1}/${urls.length} (${e.message})` },
          502
        );
      }
      const etag = put.headers.get("etag");
      if (!put.ok || !etag) {
        return json(
          { ok: false, message: `substack:partes (parte ${i + 1}/${urls.length}, status ${put.status})` },
          502
        );
      }
      etags.push(etag);
    }

    // Etapa transcode
    const tc = await fetch(`${SUBSTACK_BASE}/api/v1/audio/upload/${uploadId}/transcode`, {
      method: "POST",
      headers: { ...subHeaders(s), "Content-Type": "application/json" },
      body: JSON.stringify({
        duration: null,
        multipart_upload_etags: etags,
        multipart_upload_id: multipartId,
      }),
    });
    if (!tc.ok) {
      return json(
        { ok: false, message: `substack:transcode (status ${tc.status})` },
        502
      );
    }

    // Poll com timeout (não trava o Worker): ~3 min máx.
    const t0 = Date.now();
    let status = null;
    for (let attempt = 1; attempt <= 36; attempt++) {
      await sleep(5000);
      if (Date.now() - t0 > 170000) break;
      const st = await fetch(`${SUBSTACK_BASE}/api/v1/audio/upload/${uploadId}`, {
        headers: subHeaders(s),
      });
      status = await safeJson(st);
      if (status?.uploaded_at) break;
    }
    if (!status?.uploaded_at) {
      return json(
        {
          ok: false,
          message: "substack:processando (transcode em andamento; tente de novo em 1 min)",
        },
        504
      );
    }

    // Etapa rss → token
    const rss = await fetch(
      `${SUBSTACK_BASE}/api/v1/subscription/podcast_rss_url?section_id`,
      { headers: subHeaders(s) }
    );
    const rssBody = await safeJson(rss);
    const token = rssBody?.podcast_rss_url?.split("/private/")[1]?.replace(".rss", "");
    if (!token) {
      return json({ ok: false, message: "substack:rss (sem token)" }, 502);
    }

    // Etapa url-final (307 → location)
    const src = await fetch(
      `${SUBSTACK_API}/api/v1/audio/upload/${uploadId}/src?token=${encodeURIComponent(token)}`,
      { headers: subHeaders(s), redirect: "manual" }
    );
    const audioUrl = src.headers.get("location");
    if (src.status !== 307 || !audioUrl) {
      return json(
        { ok: false, message: `substack:url-final (status ${src.status})` },
        502
      );
    }
    return json({ ok: true, audioUrl });
  } catch (e) {
    return json({ ok: false, message: "rede:" + e.message }, 502);
  }
}

/* ---- Bloco 6: roteador ---------------------------------------------------- */

async function handleRequest(req, env) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  const url = new URL(req.url);
  try {
    if (url.pathname === "/" && req.method === "GET") {
      return new Response("URL inválida", { status: 400, headers: corsHeaders() });
    }
    if (url.pathname === "/api/diag" && req.method === "GET") {
      return handleDiag(env);
    }
    if (url.pathname === "/api/upload-cover" && req.method === "POST") {
      return handleUploadCover(req, env);
    }
    if (url.pathname === "/api/upload-audio" && req.method === "POST") {
      return handleUploadAudio(req, env);
    }
    return json({ ok: false, message: "rede:rota inexistente" }, 404);
  } catch (e) {
    return json({ ok: false, message: "rede:" + e.message }, 500);
  }
}

if (typeof addEventListener !== "undefined") {
  // Service-worker syntax: segredos chegam como globais → env = globalThis.
  addEventListener("fetch", (event) => {
    event.respondWith(
      handleRequest(event.request, globalThis).catch((e) =>
        json({ ok: false, message: "rede:" + e.message }, 500)
      )
    );
  });
}

// Worker Module-format alternativo (se o dashboard usar `export default`):
// export default { async fetch(req, env) { return handleRequest(req, env); } };

// Exportação guardada — só para teste local em Node, ignorada no Worker.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    S,
    pctEncode,
    buildBaseString,
    oauthSignature,
    oauthAuthHeader,
    MAX_BYTES,
  };
}
