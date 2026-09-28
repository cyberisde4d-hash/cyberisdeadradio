// backend/tumblr-oauth.js — fluxo OAuth 1.0a (HMAC-SHA1) para obter TUMBLR_TOKEN + TUMBLR_TOKEN_SECRET.
// Tumblr exige as 4 credenciais no upload; consumer key/secret sozinhos sempre dão 401.
// Uso (RODE LOCAL, nunca commite o .env com valores):
//   1) Preencha backend/.env com TUMBLR_CONSUMER_KEY + TUMBLR_CONSUMER_SECRET
//   2) Copie o "OAuth consumer callback" do app em tumblr.com/oauth/apps e rode:
//      node tumblr-oauth.js request --callback <URL-do-app>
//      (ou grave TUMBLR_CALLBACK_URL no .env e rode sem flag)
//      -> salva o oauth_token_secret exibido e abre a URL de authorize no navegador
//   3) Autorize LOGADO como o DONO do blog -> o Tumblr redireciona para o callback
//      com ?oauth_token=...&oauth_verifier=... na barra de endereco; copie o verifier
//   4) node tumblr-oauth.js access --token <oauth_token> --secret <oauth_token_secret> --verifier <VERIFIER>
//      -> imprime TUMBLR_TOKEN + TUMBLR_TOKEN_SECRET (cole no .env e nas Variables do Worker + Deploy)
// Endpoints (doc oficial): POST request_token, GET authorize (navegador), POST access_token.
// "oob"/PIN só funciona se o app permitir; este app barra oob (400 Disallowed oauth_callback),
// por isso o callback precisa ser EXATAMENTE o registrado no app.
import "dotenv/config";
import crypto from "node:crypto";
import axios from "axios";

const REQUEST_TOKEN_URL = "https://www.tumblr.com/oauth/request_token";
const AUTHORIZE_URL = "https://www.tumblr.com/oauth/authorize";
const ACCESS_TOKEN_URL = "https://www.tumblr.com/oauth/access_token";
const UA = "CYBERISDEAD-tumblr-oauth/1.0";

function pctEncode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function nonceHex(n = 16) {
  return crypto.randomBytes(n).toString("hex");
}

function baseString(method, baseUrl, params) {
  const sorted = Object.keys(params)
    .map((k) => [pctEncode(k), pctEncode(params[k])])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map((p) => `${p[0]}=${p[1]}`)
    .join("&");
  return `${method.toUpperCase()}&${pctEncode(baseUrl)}&${pctEncode(sorted)}`;
}

function sign({ method, baseUrl, params, consumerSecret, tokenSecret }) {
  const key = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret || "")}`;
  return crypto.createHmac("sha1", key).update(baseString(method, baseUrl, params)).digest("base64");
}

function authHeader({ method, baseUrl, oauth, consumerSecret, tokenSecret }) {
  const signature = sign({ method, baseUrl, params: oauth, consumerSecret, tokenSecret });
  const all = { ...oauth, oauth_signature: signature };
  return "OAuth " + Object.keys(all).map((k) => `${pctEncode(k)}="${pctEncode(all[k])}"`).join(", ");
}

function parseForm(body) {
  const out = {};
  for (const part of String(body || "").split("&")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

function consumerFromEnv() {
  const consumerKey = String(process.env.TUMBLR_CONSUMER_KEY || "").trim();
  const consumerSecret = String(process.env.TUMBLR_CONSUMER_SECRET || "").trim();
  const missing = [];
  if (!consumerKey) missing.push("TUMBLR_CONSUMER_KEY");
  if (!consumerSecret) missing.push("TUMBLR_CONSUMER_SECRET");
  if (missing.length) {
    console.error(`req:${missing.join(",")} ausente(s) no backend/.env — preencha consumer key/secret antes.`);
    process.exit(1);
  }
  return { consumerKey, consumerSecret };
}

async function requestToken(callback) {
  const { consumerKey, consumerSecret } = consumerFromEnv();
  if (!callback) {
    console.error("req:callback ausente — o Tumblr deste app barrou 'oob' (400 Disallowed oauth_callback).");
    console.error("Copie o 'OAuth consumer callback' do app em tumblr.com/oauth/apps e rode:");
    console.error("  node tumblr-oauth.js request --callback <URL-do-app>");
    console.error("Ou grave TUMBLR_CALLBACK_URL no backend/.env (valor EXATO do app).");
    process.exit(1);
  }
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonceHex(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    oauth_callback: callback,
  };
  const { data } = await axios.post(REQUEST_TOKEN_URL, null, {
    headers: { Authorization: authHeader({ method: "POST", baseUrl: REQUEST_TOKEN_URL, oauth, consumerSecret, tokenSecret: "" }), "User-Agent": UA },
  });
  const p = parseForm(data);
  if (!p.oauth_token || !p.oauth_token_secret) throw new Error("request_token sem oauth_token/secret: " + String(data).slice(0, 200));
  console.log("1) Guarde este oauth_token_secret (necessario no passo 4):");
  console.log(`   oauth_token=${p.oauth_token}`);
  console.log(`   oauth_token_secret=${p.oauth_token_secret}`);
  console.log("2) Abra no navegador LOGADO como o DONO do blog e autorize:");
  console.log(`   ${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(p.oauth_token)}`);
  console.log("3) Apos autorizar, o Tumblr redireciona para o callback com ?oauth_token=...&oauth_verifier=... — copie o verifier da URL e rode:");
  console.log(`   node tumblr-oauth.js access --token ${p.oauth_token} --secret ${p.oauth_token_secret} --verifier <VERIFIER>`);
  return p;
}

async function accessToken({ token, secret, verifier }) {
  if (!token || !secret || !verifier) {
    console.error("Uso: node tumblr-oauth.js access --token <oauth_token> --secret <oauth_token_secret> --verifier <PIN>");
    process.exit(1);
  }
  const { consumerKey, consumerSecret } = consumerFromEnv();
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_token: token,
    oauth_nonce: nonceHex(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    oauth_verifier: verifier,
  };
  const { data } = await axios.post(ACCESS_TOKEN_URL, null, {
    headers: { Authorization: authHeader({ method: "POST", baseUrl: ACCESS_TOKEN_URL, oauth, consumerSecret, tokenSecret: secret }), "User-Agent": UA },
  });
  const p = parseForm(data);
  if (!p.oauth_token || !p.oauth_token_secret) throw new Error("access_token sem oauth_token/secret: " + String(data).slice(0, 200));
  console.log("OK — cole estes 2 valores (nunca commite):");
  console.log(`TUMBLR_TOKEN=${p.oauth_token}`);
  console.log(`TUMBLR_TOKEN_SECRET=${p.oauth_token_secret}`);
  console.log("Depois: backend/.env + Variables do Worker (TUMBLR_TOKEN, TUMBLR_TOKEN_SECRET) + Deploy. Teste: GET /api/diag deve dar tumblr.ok=true.");
  return p;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Usuário costuma colar placeholders com < > — remove e dá trim.
// O valor final precisa ser EXATAMENTE o "OAuth consumer callback" do app.
function cleanCallback(v) {
  let s = String(v ?? "").trim();
  if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1).trim();
  return s;
}

const cmd = process.argv[2];
const callbackArg = cleanCallback(arg("--callback") || process.env.TUMBLR_CALLBACK_URL);
try {
  if (cmd === "request") await requestToken(callbackArg);
  else if (cmd === "access") await accessToken({ token: arg("--token"), secret: arg("--secret"), verifier: arg("--verifier") });
  else {
    console.log("Uso:");
    console.log("  node tumblr-oauth.js request --callback <URL-do-app>");
    console.log("  node tumblr-oauth.js access --token <t> --secret <s> --verifier <VERIFIER>");
    process.exit(1);
  }
} catch (e) {
  const detail = e.response ? ` (HTTP ${e.response.status}: ${String(e.response.data).slice(0, 300)})` : "";
  console.error("Erro OAuth Tumblr: " + (e.message || e) + detail);
  if (e.response?.status === 401) console.error("401 aqui = consumer key/secret errados. Redigite o .env sem espacos.");
  if (e.response?.status === 400 && /callback/i.test(String(e.response.data))) console.error("400 oauth_callback = o valor enviado diverge do 'OAuth consumer callback' registrado no app. Copie o valor EXATO de tumblr.com/oauth/apps (ou grave TUMBLR_CALLBACK_URL no .env).");
  process.exit(1);
}
