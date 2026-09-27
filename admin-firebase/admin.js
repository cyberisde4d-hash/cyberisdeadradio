import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, getDoc, deleteDoc, serverTimestamp, writeBatch, limit, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOl8WXhHyG8M2Uh9zFTwt4mClqRYO4GIc",
  authDomain: "cyberisdeadesite.firebaseapp.com",
  projectId: "cyberisdeadesite",
  storageBucket: "cyberisdeadesite.firebasestorage.app",
  messagingSenderId: "145227236840",
  appId: "1:145227236840:web:c691a4f7e31ca32cff905d",
  measurementId: "G-3QBSY750TT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const COLLECTIONS = ["articles","stations","products","hosts"];
const SETTINGS_DOCS = ["globalSocials","theme","cart","homeButtons","headerButtons","archiveTags","infoCards","access","site","share","siteTexts"];

const $ = (id) => document.getElementById(id);
const csv = (v) => String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const lines = (v) => String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
const mediaLines = (v, type) => lines(v).map(line => {
  const parts = line.split(/\s*(?:\|\||\|)\s*/);
  const src = (parts.shift() || "").trim();
  const caption = parts.join(" | ").trim();
  return caption ? {type, src, caption} : {type, src};
}).filter(item => item.src);
const mediaLinesToText = (arr, type) => (Array.isArray(arr) ? arr.filter(m => (m.type || type) === type && m.src).map(m => m.caption ? `${m.src} | ${m.caption}` : m.src).join("\n") : "");
const normalizeAdvancedMedia = (arr) => {
  const source = Array.isArray(arr) ? arr : [];
  const seen = new Set();
  return source.map(item => {
    if(!item || typeof item !== "object") return null;
    const src = String(item.src || item.url || item.href || "").trim();
    const html = String(item.html || "").trim();
    const content = String(item.content || item.text || "").trim();
    const type = String(item.type || (html ? "embed" : src ? (/youtube|vimeo|iframe|embed/i.test(src) ? "embed" : "image") : "text")).trim().toLowerCase();
    const caption = String(item.caption || item.label || item.title || "").trim();
    if(!src && !html && !content) return null;
    const key = [type, src, html, content, caption].join("|").toLowerCase();
    if(seen.has(key)) return null;
    seen.add(key);
    const out = {type};
    if(src) out.src = src;
    if(html) out.html = html;
    if(content) out.content = content;
    if(caption) out.caption = caption;
    if(item.alt) out.alt = String(item.alt);
    if(item.title) out.title = String(item.title);
    return out;
  }).filter(Boolean);
};
const contributorLines = (v) => lines(v).map(line => {
  const parts = line.split(/\s*(?:\|\||\|)\s*/);
  const name = (parts.shift() || "").trim();
  const roleOrUrl = (parts.shift() || "").trim();
  const url = (parts.shift() || "").trim();
  if(!name) return null;
  if(url) return {name, role: roleOrUrl, url};
  if(/^https?:\/\//i.test(roleOrUrl)) return {name, url: roleOrUrl};
  return roleOrUrl ? {name, role: roleOrUrl} : {name};
}).filter(Boolean);
const contributorsToText = (arr) => (Array.isArray(arr) ? arr.map(c => [c.name, c.role, c.url].filter(Boolean).join(" | ")).join("\n") : "");
const boolField = (id, fallback=false) => { const v = String($(id)?.value ?? "").trim().toLowerCase(); if(!v) return fallback; return ["true","1","yes","sim","on","ativo","active"].includes(v); };
const splitMediaList = (v) => String(v || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
const jsonSafe = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { toast("JSON inválido em um campo avançado."); throw new Error("invalid json"); } };
const slug = (v) => String(v || crypto.randomUUID()).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
const escapeHtml = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const nowFile = () => new Date().toISOString().replace(/[:.]/g,"-");
let editing = { articles:null, stations:null, products:null, hosts:null };
let panelsBuilt = false;
let currentUser = null;

const input = (name,label,type="text",extra="") => {
  if(type === "textarea") return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" ${extra}></textarea></div>`;
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" type="${type}" ${extra}></div>`;
};
function panelHTML(collectionName,label,fields){
  return `<div class="editor"><h2>Novo / Editar ${label}</h2>${fields}<div class="actions"><button id="${collectionName}_save">Salvar</button><button class="ghost" id="${collectionName}_clear">Limpar</button></div><p class="note">Cole URLs ou use a aba Mídia / Uploads para gerar URLs reais do Firebase Storage.</p></div><div class="list"><h2>${label}s salvos</h2><input class="searchbar" id="${collectionName}Search" placeholder="Buscar ${label.toLowerCase()}..."><p class="note" id="${collectionName}Count"></p><div class="cards" id="${collectionName}List"></div></div>`;
}
function toast(msg, type="ok"){
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
async function logAction(action, target="system", details={}){
  try{
    await addDoc(collection(db,"logs"), { action, target, details, email: currentUser?.email || null, uid: currentUser?.uid || null, createdAt: serverTimestamp() });
  }catch(e){ console.warn("log failed", e); }
}
function safeJSONPlaceholder(obj){ return `placeholder='${escapeHtml(JSON.stringify(obj, null, 2))}'`; }


function infoPopupEditor(id, smallDefault, titleDefault){
  return `<fieldset class="popup-editor" data-popup-editor="${id}">
    <legend>${titleDefault}</legend>
    <div class="grid2">${input(`info_${id}_small`,"Card small label")}${input(`info_${id}_title`,"Card título")}</div>
    ${input(`info_${id}_description`,"Descrição do card","textarea")}
    <div class="grid2">${input(`info_${id}_popupTitle`,"Título do popup")}${input(`info_${id}_meta`,"Meta/eyebrow do popup")}</div>
    ${input(`info_${id}_popupText`,"Texto principal do popup — um parágrafo por linha","textarea")}
    ${input(`info_${id}_extraText`,"Textos extras — um por linha","textarea")}
    ${input(`info_${id}_images`,"Imagens do popup — uma URL por linha","textarea")}
    ${input(`info_${id}_videos`,"Vídeos diretos do popup — uma URL por linha","textarea")}
    ${input(`info_${id}_embedUrl`,"Embed URL / iframe src")}
    <div class="grid2">${input(`info_${id}_buttonLabel`,"Botão principal")}${input(`info_${id}_buttonUrl`,"Link do botão principal")}</div>
    ${input(`info_${id}_socials`,"Redes sociais — JSON","textarea", safeJSONPlaceholder([{label:"Instagram",url:"https://..."}]))}
    ${input(`info_${id}_actions`,"Botões extras — JSON","textarea", safeJSONPlaceholder([{label:"Close",action:"close"},{label:"Open link",action:"link",url:"https://..."}]))}
    <div class="grid2">${input(`info_${id}_form`,"Mostrar formulário? true/false")}${input(`info_${id}_access`,"Acesso: public, login, subscriber ou locked")}</div>
  </fieldset>`;
}
const DEFAULT_INFO_POPUPS = [
  {id:"about", small:"01 / INFO", title:"About", description:"Sobre o projeto, com espaço para texto, foto e vídeo.", popupTitle:"About", meta:"Info", popupText:"Sobre o CYBERISDEAD.", extraText:"", images:"", videos:"", embedUrl:"", buttonLabel:"Close", buttonUrl:"", form:false, access:"public", socials:[], actions:[{label:"Close",action:"close"}]},
  {id:"contact", small:"02 / CONTACT", title:"Contact", description:"General inquiry para propostas, mensagens e colaborações.", popupTitle:"Contact", meta:"General inquiry", popupText:"Envie propostas, mensagens e colaborações.", extraText:"", images:"", videos:"", embedUrl:"", buttonLabel:"Submit", buttonUrl:"", form:true, access:"public", socials:[], actions:[{label:"Submit",action:"submit"},{label:"Close",action:"close"}]},
  {id:"donate", small:"03 / SUPPORT", title:"Donate", description:"Link de pagamento para apoiar o projeto diretamente.", popupTitle:"Donate", meta:"Support", popupText:"Apoie o projeto diretamente.", extraText:"", images:"", videos:"", embedUrl:"", buttonLabel:"Open donate link", buttonUrl:"", form:false, access:"public", socials:[], actions:[{label:"Open donate link",action:"donate"},{label:"Close",action:"close"}]}
];
function normalizeInfoPopupCard(card={}, fallback={}){
  const id = card.id || fallback.id || "about";
  const textFromArray = Array.isArray(card.text) ? card.text.join("\n") : "";
  const media = Array.isArray(card.media) ? card.media : [];
  return {
    id,
    small: card.small || fallback.small || "",
    title: card.title || fallback.title || id,
    description: card.description || fallback.description || "",
    popupTitle: card.popupTitle || card.title || fallback.popupTitle || fallback.title || id,
    meta: card.meta || fallback.meta || "",
    popupText: card.popupText || textFromArray || fallback.popupText || "",
    extraText: card.extraText || fallback.extraText || "",
    images: Array.isArray(card.images) ? card.images.join("\n") : (card.image ? card.image : media.filter(m=>m.type==="image").map(m=>m.src).join("\n")) || fallback.images || "",
    videos: Array.isArray(card.videos) ? card.videos.join("\n") : (card.video ? card.video : media.filter(m=>m.type==="video").map(m=>m.src).join("\n")) || fallback.videos || "",
    embedUrl: card.embedUrl || fallback.embedUrl || "",
    buttonLabel: card.buttonLabel || fallback.buttonLabel || "Close",
    buttonUrl: card.buttonUrl || card.url || card.donateUrl || fallback.buttonUrl || "",
    form: String(card.form ?? fallback.form ?? (id === "contact")),
    access: card.access || fallback.access || "public",
    socials: Array.isArray(card.socials) ? card.socials : (fallback.socials || []),
    actions: Array.isArray(card.actions) ? card.actions : (fallback.actions || [{label:"Close",action:"close"}])
  };
}
function infoPopupPayload(id){
  const socials = jsonSafe($(`info_${id}_socials`).value, []);
  const actions = jsonSafe($(`info_${id}_actions`).value, []);
  const buttonLabel = $(`info_${id}_buttonLabel`).value;
  const buttonUrl = $(`info_${id}_buttonUrl`).value;
  const normalizedActions = actions.length ? actions : [{label: buttonLabel || "Close", action: buttonUrl ? "link" : "close", url: buttonUrl || ""}];
  return {
    id,
    small:$(`info_${id}_small`).value,
    title:$(`info_${id}_title`).value,
    description:$(`info_${id}_description`).value,
    popupTitle:$(`info_${id}_popupTitle`).value,
    meta:$(`info_${id}_meta`).value,
    popupText:$(`info_${id}_popupText`).value,
    extraText:$(`info_${id}_extraText`).value,
    images:lines($(`info_${id}_images`).value),
    videos:lines($(`info_${id}_videos`).value),
    embedUrl:$(`info_${id}_embedUrl`).value,
    buttonLabel,
    buttonUrl,
    donateUrl: id === "donate" ? buttonUrl : "",
    form:String($(`info_${id}_form`).value).toLowerCase()==="true",
    access:$(`info_${id}_access`).value || "public",
    socials,
    actions: normalizedActions
  };
}
function fillInfoPopupFields(card){
  const c = normalizeInfoPopupCard(card, DEFAULT_INFO_POPUPS.find(x=>x.id===card.id)||{});
  const set=(suffix,val)=>{const el=$(`info_${c.id}_${suffix}`); if(el) el.value = val ?? "";};
  set("small",c.small); set("title",c.title); set("description",c.description); set("popupTitle",c.popupTitle); set("meta",c.meta);
  set("popupText",c.popupText); set("extraText",c.extraText); set("images",c.images); set("videos",c.videos); set("embedUrl",c.embedUrl);
  set("buttonLabel",c.buttonLabel); set("buttonUrl",c.buttonUrl); set("form",c.form); set("access",c.access);
  set("socials",JSON.stringify(c.socials||[],null,2)); set("actions",JSON.stringify(c.actions||[],null,2));
}

function buildPanels(){
  const required = ["dashboardHomePanel","articlesPanel","stationsPanel","productsPanel","hostsPanel","settingsPanel","websiteBuilderPanel","siteMetaPanel","siteTextsPanel","sharePanel","themePanel","cartPanel","homeButtonsPanel","headerButtonsPanel","archiveTagsPanel","infoCardsPanel","accessPanel","membershipPanel","membershipPopupPanel","memberContentPanel","memberCalendarPanel","memberCommentsPanel","mediaPanel","backupPanel","logsPanel","importPanel"];
  if(!required.every(id => $(id))) return;

  $("dashboardHomePanel").innerHTML = `<div class="box"><h2>Dashboard</h2><div class="stats" id="dashboardStats"></div><div class="toolbar"><button id="refreshDashboardBtn">Atualizar</button><button class="ghost" data-tab-jump="media">Abrir mídia</button><button class="ghost" data-tab-jump="backup">Abrir backup</button></div><div id="dashboardRecent" class="cards"></div></div>`;

  $("articlesPanel").innerHTML = panelHTML("articles","Artigo", `
    ${input("articles_title","Título")}
    ${input("articles_subtitle","Subtítulo / linha fina","textarea")}
    ${input("articles_kicker","Kicker / chamada editorial")}
    ${input("articles_category","Categoria")}
    <div class="grid3">${input("articles_year","Ano")}${input("articles_date","Data","date")}${input("articles_issue","Edição")}</div>
    <div class="grid3">${input("articles_author","Autoria")}${input("articles_mainAuthor","Autor principal")}${input("articles_readingTime","Tempo de leitura")}</div>
    ${input("articles_contributors","Contributors — nome | função | link por linha","textarea", `placeholder="Fulano | Fotografia | https://...&#10;Beltrano | Texto | https://..."`)}
    ${input("articles_credits","Créditos / ficha técnica","textarea")}
    <div class="grid2">${input("articles_tags","Tags separadas por vírgula")}${input("articles_featured","Destaque: true/false", "text", `placeholder="false"`)}</div>
    ${input("articles_excerpt","Resumo","textarea")}
    ${input("articles_color","Fundo/Cor CSS ou URL de imagem")}
    ${input("articles_cover","Capa URL")}<div class="url-preview" id="articles_coverPreview"></div>
    ${input("articles_embedUrl","Vídeo/Embed URL")}
    ${input("articles_slug","Slug / URL manual")}
    ${input("articles_hosts","Hosts relacionados — IDs ou nomes separados por vírgula")}
    <fieldset><legend>Acesso</legend><div class="grid2">${input("articles_status","Status: draft, published ou archived")}${input("articles_access","Acesso: public, login, subscriber ou locked")}</div>${input("articles_lockedMessage","Mensagem quando bloqueado")}</fieldset>
    ${input("articles_body","Texto — um parágrafo por linha","textarea")}
    ${input("articles_media","Mídias do popup — JSON avançado opcional","textarea", safeJSONPlaceholder([{type:"image",src:"assets/uploads/img.jpg",caption:"Legenda"},{type:"embed",src:"https://www.youtube.com/embed/...",caption:"Embed"}]))}
    <fieldset><legend>Flipbook / scans / pages</legend>
      <div class="grid3">${input("articles_flipbookEnabled","Flipbook: auto, on ou off", "text", `placeholder="auto"`)}${input("articles_flipbookMode","Modo revista: horizontal ou vertical", "text", `placeholder="horizontal"`)}${input("articles_flipbookPageTurn","Page-turn animation: on/off", "text", `placeholder="on"`)}</div>
      <div class="grid3">${input("articles_flipbookSwipe","Swipe mobile: on/off", "text", `placeholder="on"`)}${input("articles_flipbookZoom","Zoom: on/off", "text", `placeholder="on"`)}${input("articles_flipbookFullscreen","Fullscreen: on/off", "text", `placeholder="on"`)}</div>
      <div class="grid3">${input("articles_flipbookThumbnails","Thumbnails: on/off", "text", `placeholder="on"`)}${input("articles_flipbookLazy","Lazy loading scans: on/off", "text", `placeholder="on"`)}${input("articles_flipbookPreload","Preload de páginas: número", "number", `placeholder="2" min="0" max="12"`)}</div>
      ${input("articles_scans","Scans / pages — uma URL por linha ou URL | legenda","textarea", `placeholder="https://site.com/page-01.jpg | Capa&#10;https://site.com/page-02.jpg | Página 02"`)}
      ${input("articles_thumbnails","Thumbnails das páginas — uma URL por linha","textarea")}
      <div class="grid2">${input("articles_scanArchiveUrl","Arquivo / scan download URL")}${input("articles_extraLink","Link extra do artigo")}</div>
    </fieldset>
    <fieldset><legend>SEO / Preview social</legend>
      ${input("articles_seoTitle","SEO title / social title")}
      ${input("articles_seoDescription","SEO description / social description","textarea")}
      ${input("articles_seoImage","SEO image / social preview image URL")}<div class="url-preview" id="articles_seoImagePreview"></div>
    </fieldset>
    <fieldset><legend>Opções visuais do popup do artigo</legend>
      <div class="grid2">
        ${input("articles_mediaGap","Padding entre blocos em px", "number", `placeholder="12" min="0" max="80"`)}
        ${input("articles_textStyle","Estilo tipográfico: default, serif, sans, mono, large ou compact", "text", `placeholder="default"`)}
      </div>
      <div class="grid2">
        ${input("articles_iframeResponsive","Iframe YouTube responsivo no mobile: on ou off", "text", `placeholder="on"`)}
        ${input("articles_imageLightbox","Zoom/lightbox nas imagens: on ou off", "text", `placeholder="on"`)}
      </div>
      <div class="grid2">
        ${input("articles_galleryMode","Galeria horizontal: off, images ou all", "text", `placeholder="off"`)}
        ${input("articles_embedAutoplay","Autoplay opcional em embeds: on ou off", "text", `placeholder="off"`)}
      </div>
      ${input("articles_mediaTransition","Transição entre mídias: none, fade ou slide", "text", `placeholder="fade"`)}
      <p class="hint">Essas opções afetam só o popup do artigo selecionado. Deixe vazio para manter o visual padrão.</p>
    </fieldset>
  `);

  $("livePanel").innerHTML = `<p class="help">Controla os logos do Must Watch e a transmissão contínua. Vazio = automático (todas as séries com a capa do último episódio).</p><fieldset><legend>Transmissão</legend><div class="grid2">${input("live_enabled","Ao vivo ligado? true/false")}${input("live_autoplay","Tocar sozinho ao abrir? true/false")}</div><p class="hint">Navegadores só liberam áudio após o primeiro toque — o site tenta sozinho e engata no primeiro gesto do visitante.</p></fieldset><fieldset><legend>No ar agora (clique Editar para ajustar)</legend><div class="cards" id="liveOnAirList"><p class="note">Carregando…</p></div></fieldset><fieldset><legend>Estações no ar</legend><div class="hp-list" id="live_stationsRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="live_stationsRows">＋ Adicionar estação</button></div><p class="hint">Série tem que ser igual ao campo Série do episódio. Logo quadrado. Áudio override troca o som sem trocar o episódio. Ordem define a sequência. Visível false esconde.</p></fieldset><div class="actions"><button id="saveLiveBtn">Salvar Ao Vivo</button><button class="ghost" id="previewLiveBtn" type="button">Pré-visualizar resultado</button><button class="ghost" id="reloadLiveBtn" type="button">Recarregar</button></div><div id="livePreviewResult" style="margin-top:10px"></div></div><div class="list"><h2>Preview JSON</h2><pre id="livePreview" class="preview-code"></pre></div>`;

  $("orderPanel").innerHTML = `<div class="editor wide-editor"><h2>Ordem do conteúdo</h2><p class="help">Arraste pelas alças, use ↑ ↓, fixe destaques e salve. Vale para episódios, estações e seções do site.</p><fieldset><legend>Episódios (ordem + destaque)</legend><div class="ord-list" id="orderEpisodes"></div><div class="actions"><button id="newEpisodeBtn" type="button">＋ Novo episódio</button><button id="saveEpisodeOrderBtn">Salvar ordem dos episódios</button></div></fieldset><fieldset><legend>Index / Matérias (lista separada de episódios e estações)</legend><div class="ord-list" id="orderArticles"></div><div class="actions"><button id="saveArticleOrderBtn">Salvar ordem do Index</button></div></fieldset><fieldset><legend>Estações / Séries</legend><div class="ord-list" id="orderSeries"></div><div class="actions"><button id="saveSeriesOrderBtn">Salvar ordem das estações</button></div></fieldset><fieldset><legend>Seções da página</legend><div class="ord-list" id="orderSections"></div><div class="actions"><button class="ghost" id="newSectionBtn" type="button">＋ Nova seção</button><button id="saveSectionsOrderBtn">Salvar ordem das seções</button></div></fieldset></div><div class="list"><h2>Como aparece no site</h2><pre id="orderPreview" class="preview-code"></pre><h2 style="margin-top:14px">Preview do site em tempo real</h2><div class="actions"><button class="ghost" type="button" data-preview-device="desktop">Desktop</button><button class="ghost" type="button" data-preview-device="mobile">Mobile</button><button class="ghost" id="reloadSitePreviewBtn" type="button">Recarregar preview</button></div><div class="preview-frame-wrap"><iframe id="sitePreviewFrame" src="../radio" title="Preview do site"></iframe></div></div>`;

  $("stationsPanel").innerHTML = panelHTML("stations","Episódio", `
    <div class="grid2">${input("stations_id","ID")}${input("stations_hostId","Host principal ID")}</div>
    <fieldset><legend>Série / Estação</legend>${input("stations_series","Série (ex: A1TRAX) — mesma série = mesma estação no site")}<div class="grid2"><div class="field"><label for="stations_seriesRenameFrom">Renomear série (de)</label><select id="stations_seriesRenameFrom"></select></div>${input("stations_seriesRenameTo","Renomear série (para)")}</div><div class="actions"><button class="ghost" id="stations_renameSeriesBtn" type="button">Aplicar renomeação em massa</button></div><p class="hint">Renomeia a série em todos os episódios de uma vez (batch no Firestore).</p></fieldset>
    ${input("stations_relatedHosts","Hosts relacionados — IDs ou nomes separados por vírgula")}
    <fieldset><legend>Acesso</legend><div class="grid2">${input("stations_status","Status: draft, published ou archived")}${input("stations_access","Acesso: public, login, subscriber ou locked")}</div>${input("stations_lockedMessage","Mensagem quando bloqueado")}</fieldset>
    ${input("stations_title","Título visual")}${input("stations_kicker","Kicker")}${input("stations_name","Nome")}${input("stations_type","Tipo")}
<div class="grid2">
  <label><input type="checkbox" id="stations_featured"> Fixar no topo</label>
  ${input("stations_featuredOrder","Posição no topo")}
</div>
    ${input("stations_desc","Descrição curta","textarea")}
    <div class="grid2">${input("stations_audio","Áudio URL")}${input("stations_video","Vídeo/Embed URL")}</div><div class="url-preview" id="stations_audioPreview"></div>
    ${input("stations_cover","Capa URL")}<div class="url-preview" id="stations_coverPreview"></div>
    <div class="grid2">${input("stations_background","Background URL")}<div class="url-preview" id="stations_backgroundPreview"></div>${input("stations_backgroundType","Tipo do background: image ou video")}</div>
    ${input("stations_genres","Gêneros separados por vírgula")}${input("stations_tracklist","Tracklist — uma faixa por linha","textarea")}
    ${input("stations_episodeDescription","Descrição completa","textarea")}${input("stations_links","Links — JSON","textarea", safeJSONPlaceholder([{label:"Spotify Playlist",url:"https://..."}]))}
  `);

  $("productsPanel").innerHTML = panelHTML("products","Produto", `
    <div class="grid2">${input("products_id","ID")}${input("products_price","Preço","number",'step="0.01"')}</div>
    ${input("products_name","Nome")}${input("products_type","Tipo")}${input("products_desc","Descrição","textarea")}
    ${input("products_color","Cor fallback CSS ou URL de imagem principal")}
    ${input("products_images","Imagens separadas por vírgula")}
    ${input("products_checkoutUrl","Checkout URL específico do produto")}
    <fieldset><legend>Acesso</legend><div class="grid2">${input("products_status","Status: draft, published ou archived")}${input("products_access","Acesso: public, login, subscriber ou locked")}</div>${input("products_lockedMessage","Mensagem quando bloqueado")}</fieldset>
  `);

  $("hostsPanel").innerHTML = panelHTML("hosts","Host", `
    <div class="grid2">${input("hosts_id","ID")}${input("hosts_name","Nome")}</div>
    ${input("hosts_photo","Foto URL")}${input("hosts_bio","Bio","textarea")}${input("hosts_episodes","IDs de episódios separados por vírgula")}${input("hosts_socials","Redes — JSON","textarea", safeJSONPlaceholder([{label:"Instagram",url:"https://..."}]))}
  `);

  $("settingsPanel").innerHTML = `<div class="editor"><h2>Configurações globais</h2>${input("settings_siteName","Nome do site")}${input("settings_siteDescription","Descrição SEO","textarea")}${input("settings_favicon","Favicon URL")}${input("settings_logo","Logo URL")}${input("settings_analytics","Analytics / scripts externos","textarea")}${input("settings_socials","Redes globais — JSON","textarea", safeJSONPlaceholder([{label:"Instagram",url:"https://..."}]))}<button id="saveSettingsBtn">Salvar configurações</button><p class="note">Salva no Firestore em settings/globalSocials e settings/site.</p></div><div class="list"><h2>Dados atuais</h2><pre id="settingsPreview" class="preview-code"></pre></div>`;



  $("websiteBuilderPanel").classList.add("single");
  $("websiteBuilderPanel").innerHTML = `
    <div class="builder-shell">
      <aside class="builder-sidebar box">
        <div class="builder-headline">
          <p class="eyebrow">No-code / Visual Design</p>
          <h2>Website Builder</h2>
          <p class="help">Crie páginas, adicione blocos, edite conteúdo e design visual sem mexer no código. Salva em Firestore: <b>builderPages</b>.</p>
        </div>
        <div class="actions builder-top-actions">
          <button id="builderNewPageBtn" type="button">Nova página</button>
          <button class="ghost" id="builderCreateHomeBtn" type="button">Criar Home editável</button>
          <button class="ghost" id="builderCreateMemberBtn" type="button">Criar Member Area editável</button>
          <button class="ghost" id="builderLoadPagesBtn" type="button">Recarregar</button>
          <button class="danger" id="builderDeletePageBtn" type="button">Excluir página</button>
        </div>
        <div class="field"><label>Páginas salvas</label><select id="builderPageSelect"></select></div>
        <fieldset><legend>Configurações da página</legend>
          <div class="grid3">
            ${input("builder_pageId","ID da página")}
            ${input("builder_title","Título")}
            ${input("builder_slug","Slug / URL")}
          </div>
          <div class="grid3">
            ${input("builder_status","Status: draft ou published")}
            ${input("builder_showInNav","Mostrar no menu? true/false")}
            ${input("builder_replaceSite","Página substitui seções padrão? true/false")}
          </div>
          ${input("builder_description","Descrição SEO","textarea")}
          <div class="grid3">
            ${input("builder_bg","Fundo da página")}
            ${input("builder_color","Cor do texto")}
            ${input("builder_maxWidth","Largura máxima ex: 1280px")}
          </div>
        </fieldset>
        <fieldset><legend>Adicionar / editar bloco</legend>
          <div class="grid3">
            <div class="field"><label for="builder_blockType">Tipo</label><select id="builder_blockType">
              <option value="hero">Hero</option><option value="text">Texto</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="embed">Embed/Iframe</option><option value="gallery">Galeria</option><option value="button">Botão</option><option value="grid">Grid/Colunas</option><option value="articles">Lista de artigos</option><option value="stations">Lista de rádio</option><option value="products">Lista de produtos</option><option value="hosts">Lista de hosts</option><option value="membership">Membership CTA</option><option value="spacer">Espaçador</option><option value="html">HTML custom</option>
            </select></div>
            ${input("builder_blockLabel","Nome interno")}
            ${input("builder_blockAccess","Acesso: public, login, subscriber")}
          </div>
          ${input("builder_blockTitle","Título do bloco")}
          ${input("builder_blockText","Texto / descrição","textarea")}
          <div class="grid2">${input("builder_blockMedia","Imagem/Vídeo/Embed URL")}${input("builder_blockAlt","Alt / legenda")}</div>
          <div class="grid2">${input("builder_blockButtonLabel","Texto do botão")}${input("builder_blockButtonUrl","URL / ação do botão")}</div>
          <fieldset><legend>Navegação / ação do botão</legend>
            <div class="grid3">
              <div class="field"><label for="builder_buttonAction">Ação</label><select id="builder_buttonAction"><option value="link">Link/URL</option><option value="builderPage">Página do Builder</option><option value="section">Seção da página</option><option value="memberArea">Member Area</option><option value="membershipPopup">Abrir Membership</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="download">Download</option></select></div>
              <div class="field"><label for="builder_buttonPageTarget">Página interna</label><select id="builder_buttonPageTarget"></select></div>
              ${input("builder_buttonSection","ID da seção / âncora")}
            </div>
            <div class="grid3">
              ${input("builder_buttonNewTab","Abrir em nova aba? true/false")}
              ${input("builder_buttonRel","Rel opcional")}
              ${input("builder_buttonClass","Classe CSS extra")}
            </div>
            <p class="note">Para vincular uma página criada no Builder, escolha ação “Página do Builder” e selecione a página interna. Para seções use latest, radio, shop, about, community etc.</p>
          </fieldset>
          ${input("builder_blockItems","Itens / galeria / links — um por linha ou JSON","textarea", `placeholder="https://imagem.jpg | Legenda&#10;Título | Texto | https://link.com"`)}
          ${input("builder_blockHtml","HTML customizado opcional","textarea", `placeholder="<div>Seu HTML seguro aqui</div>"`)}
          <fieldset><legend>Design visual do bloco</legend>
            <div class="grid3">${input("builder_styleBackground","Background")}${input("builder_styleColor","Cor texto")}${input("builder_styleAlign","Alinhamento: left, center, right")}</div>
            <div class="grid3">${input("builder_stylePadding","Padding ex: 48px 24px")}${input("builder_styleMargin","Margin")}${input("builder_styleMinHeight","Altura mínima")}</div>
            <div class="grid3">${input("builder_styleFontSize","Tamanho fonte")}${input("builder_styleRadius","Radius")}${input("builder_styleBorder","Borda")}</div>
            <div class="grid3">${input("builder_styleColumns","Colunas")}${input("builder_styleGap","Gap")}${input("builder_styleMaxWidth","Max width")}</div>
            <div class="grid3">${input("builder_styleDisplay","Display: block, grid, flex")}${input("builder_styleJustify","Justify content")}${input("builder_styleAlignItems","Align items")}</div>
            <div class="grid3">${input("builder_styleWidth","Width")}${input("builder_styleHeight","Height")}${input("builder_styleOpacity","Opacity")}</div>
            <div class="grid3">${input("builder_styleShadow","Box shadow")}${input("builder_styleTransform","Transform")}${input("builder_styleZIndex","Z-index")}</div>
          </fieldset>
          <div class="actions">
            <button id="builderAddBlockBtn" type="button">Adicionar bloco</button>
            <button class="ghost" id="builderUpdateBlockBtn" type="button">Atualizar bloco</button>
            <button class="ghost" id="builderClearBlockBtn" type="button">Limpar bloco</button>
          </div>
        </fieldset>
      </aside>
      <main class="builder-workspace">
        <div class="builder-toolbar box">
          <div>
            <p class="eyebrow">Preview ao vivo</p>
            <strong id="builderEditingLabel">Nenhuma página selecionada</strong>
          </div>
          <div class="actions">
            <button class="ghost" data-builder-device="desktop" type="button">Desktop</button>
            <button class="ghost" data-builder-device="tablet" type="button">Tablet</button>
            <button class="ghost" data-builder-device="mobile" type="button">Mobile</button>
            <button class="ghost" id="builderExportBtn" type="button">Exportar JSON</button>
            <button id="builderSavePageBtn" type="button">Salvar / publicar</button>
          </div>
        </div>
        <div class="builder-main-grid">
          <section class="builder-canvas-wrap box">
            <div id="builderCanvas" class="builder-canvas builder-device-desktop"></div>
          </section>
          <aside class="builder-layers box">
            <h2>Layers / Blocos</h2>
            <div id="builderBlocksList" class="builder-blocks-list"></div>
            <h2>JSON da página</h2>
            <textarea id="builderJson" class="builder-json" spellcheck="false"></textarea>
            <div class="actions"><button class="ghost" id="builderImportJsonBtn" type="button">Aplicar JSON</button></div>
          </aside>
        </div>
      </main>
    </div>`;


  $("siteTextsPanel").innerHTML = `<div class="editor wide-editor"><h2>Textos do Site</h2><p class="help">Edite textos visíveis da home/radio/archive e metadados da aba do navegador. Salva grátis no Firestore em settings/siteTexts.</p><fieldset><legend>Aba do navegador / topo</legend><div class="grid2">${input("siteTexts_browserTitle","Título da aba do navegador")}${input("siteTexts_issueText","Texto central do topo / Issue")}</div></fieldset><fieldset><legend>Hero / Rádio</legend><div class="grid2">${input("siteTexts_liveNow","LIVE NOW / ...")}${input("siteTexts_broadcastLabel","Broadcast label")}</div><div class="grid2">${input("siteTexts_broadcastValue","Broadcast value")}${input("siteTexts_transmittingLabel","Transmitting label")}</div><div class="grid2">${input("siteTexts_radioTypeLabel","Fallback tipo do painel: Talk/Radio/etc")}${input("siteTexts_nowTransmittingLabel","Mini player label")}</div><div class="grid2">${input("siteTexts_episodeLinksLabel","Episode links label")}${input("siteTexts_genresLabel","Genres label")}</div><div class="grid2">${input("siteTexts_episodeOptionsLabel","Episode options label")}${input("siteTexts_currentHostSocialsLabel","Current host socials label")}</div>${input("siteTexts_noHostLinksLabel","No host links label")}</fieldset><fieldset><legend>Texto rolando / ticker</legend>${input("siteTexts_tickerText","Texto rolando — use separador —","textarea")}</fieldset><fieldset><legend>Latest / Archive</legend><div class="grid2">${input("siteTexts_latestTitle","Título Latest / Archive")}${input("siteTexts_latestButtonLabel","Botão Ver Mais")}</div><div class="grid2">${input("siteTexts_latestLessLabel","Botão Ver Menos")}${input("siteTexts_itemsLabel","Items label")}</div>${input("siteTexts_latestDescription","Descrição Latest / Archive","textarea")}<div class="grid3">${input("siteTexts_showingPrefix","Showing prefix")}${input("siteTexts_allLabel","All label")}${input("siteTexts_ofLabel","Of label")}</div></fieldset><fieldset><legend>Schedule / Radio Grid</legend><div class="grid2">${input("siteTexts_scheduleTitle","Título Schedule")}${input("siteTexts_episodesLabel","Episodes label")}</div>${input("siteTexts_scheduleDescription","Descrição Schedule","textarea")}</fieldset><fieldset><legend>Popups / botões gerais</legend><div class="grid3">${input("siteTexts_closeLabel","Close")}${input("siteTexts_saveLabel","Save")}${input("siteTexts_savedLabel","Saved")}</div><div class="grid3">${input("siteTexts_shareLabel","Share")}${input("siteTexts_copyLinkLabel","Copy link")}${input("siteTexts_downloadEpisodeLabel","Download episode")}</div>${input("siteTexts_tracklistLabel","Tracklist")}</fieldset><fieldset><legend>Avançado</legend>${input("siteTexts_custom","JSON extra opcional","textarea", safeJSONPlaceholder({customKey:"custom value"}))}</fieldset><div class="actions"><button id="saveSiteTextsBtn">Salvar Textos do Site</button><button class="ghost" id="resetSiteTextsBtn" type="button">Recarregar salvos</button></div><p class="note">Depois de salvar, recarregue a home. Este pacote já instala o leitor de settings/siteTexts no index.html.</p></div><div class="list"><h2>Preview JSON</h2><pre id="siteTextsPreview" class="preview-code"></pre></div>`;



  $("siteMetaPanel").innerHTML = `<div class="editor wide-editor"><h2>Site Meta / Compartilhamento</h2><p class="help">Controle nome do site, favicon/ícone e prévia externa em redes sociais. Use URLs públicas de imagem. Para WhatsApp/Instagram/X atualizarem, talvez precise limpar cache da plataforma depois de salvar.</p><fieldset><legend>Identidade do site</legend><div class="grid2">${input("siteMeta_siteName","Nome do site / aba do navegador")}${input("siteMeta_titleSuffix","Sufixo do título")}</div>${input("siteMeta_siteDescription","Descrição principal / SEO","textarea")}<div class="grid2">${input("siteMeta_favicon","Favicon URL .ico/.png/.svg")}${input("siteMeta_appIcon","Ícone do app / PWA URL")}</div><div class="grid2">${input("siteMeta_themeColor","Cor do navegador mobile")}${input("siteMeta_canonicalUrl","URL canônica do site")}</div>${input("siteMeta_proxyUrl","Proxy de mídia (ex: https://xxx.workers.dev/?url=)")}</fieldset><fieldset><legend>Capa de link / Open Graph</legend>${input("siteMeta_ogTitle","Título quando compartilhar")}${input("siteMeta_ogDescription","Descrição quando compartilhar","textarea")}${input("siteMeta_ogImage","Imagem/capa de compartilhamento URL")}<div class="url-preview" id="siteMeta_ogImagePreview"></div><div class="grid2">${input("siteMeta_twitterCard","Twitter card: summary_large_image")}${input("siteMeta_locale","Locale: pt_BR")}</div></fieldset><fieldset><legend>Texto de compartilhamento interno</legend>${input("siteMeta_shareTitle","Título padrão do botão share")}${input("siteMeta_shareText","Texto padrão do botão share","textarea")}<div class="grid2">${input("siteMeta_keywords","Keywords SEO separadas por vírgula")}${input("siteMeta_author","Autor / projeto")}</div></fieldset><div class="actions"><button id="saveSiteMetaBtn">Salvar Site Meta</button><button class="ghost" id="siteMetaPreviewBtn" type="button">Atualizar preview</button></div><p class="note">Salva em Firestore: settings/site. O site aplica automaticamente no carregamento.</p></div><div class="list"><h2>Preview externo</h2><div class="share-preview-card"><div id="siteMetaPreviewImg" class="share-preview-img"></div><div class="share-preview-body"><b id="siteMetaPreviewTitle">CYBERISDEAD</b><p id="siteMetaPreviewDesc">Preview da descrição do link.</p><small id="siteMetaPreviewUrl">cyberisdeadesite.web.app</small></div></div><pre id="siteMetaPreview" class="preview-code"></pre></div>`;


  $("sharePanel").innerHTML = `<div class="editor wide-editor"><h2>Share / Popup de Compartilhamento</h2><p class="help">Edite todos os textos e botões do popup de share. Instagram Stories em site estático funciona como atalho: copia o link/texto e tenta abrir o app do Instagram no celular.</p><fieldset><legend>Textos gerais</legend><div class="grid2">${input("share_articleTitle","Título do popup de artigo")}${input("share_episodeTitle","Título do popup de episódio")}</div><div class="grid2">${input("share_articleMeta","Meta do popup de artigo")}${input("share_episodeMeta","Meta do popup de episódio")}</div>${input("share_introText","Texto curto abaixo do título","textarea")}<div class="grid2">${input("share_copyLabel","Texto do botão copiar link")}${input("share_copiedLabel","Feedback depois de copiar")}</div></fieldset><fieldset><legend>Botões ativos</legend><div class="grid3">${input("share_enableTwitter","X/Twitter: true/false")}${input("share_enableTumblr","Tumblr: true/false")}${input("share_enableWhatsApp","WhatsApp: true/false")}${input("share_enableInstagram","Instagram: true/false")}${input("share_enableInstagramStories","Instagram Stories: true/false")}${input("share_enableNative","Share nativo: true/false")}</div></fieldset><fieldset><legend>Labels dos botões</legend><div class="grid3">${input("share_twitterLabel","Label X/Twitter")}${input("share_tumblrLabel","Label Tumblr")}${input("share_whatsappLabel","Label WhatsApp")}${input("share_instagramLabel","Label Instagram")}${input("share_instagramStoriesLabel","Label Instagram Stories")}${input("share_nativeLabel","Label Share nativo")}</div></fieldset><fieldset><legend>Instagram Stories</legend>${input("share_instagramStoriesText","Texto que será copiado antes de abrir Stories","textarea")}<div class="grid2">${input("share_instagramStoriesUrl","URL fallback do Instagram")}${input("share_openInstagramApp","Tentar abrir app no celular: true/false")}</div><p class="hint">Por limitação do navegador, não dá para postar automaticamente no Stories sem app/API paga. O botão copia o texto/link e abre o Instagram para você colar.</p></fieldset><fieldset><legend>Links customizados extras</legend>${input("share_customButtons","Botões extras — JSON","textarea", safeJSONPlaceholder([{label:"Telegram",url:"https://t.me/share/url?url={{url}}&text={{text}}"}]))}</fieldset><div class="actions"><button id="saveShareBtn">Salvar Share</button><button class="ghost" id="resetShareBtn" type="button">Recarregar salvos</button></div><p class="note">Salva no Firestore em settings/share.</p></div><div class="list"><h2>Preview JSON</h2><pre id="sharePreview" class="preview-code"></pre></div>`;

  $("themePanel").innerHTML = `<div class="editor wide-editor"><h2>Visual / Theme</h2><p class="help">Controle visual global sem mexer no código. Para deixar o fundo mais visível, aumente Opacidade/Brilho e reduza Overlay escuro.</p><fieldset><legend>Background dinâmico — Desktop</legend><div class="grid3">${input("theme_bgOpacity","Opacidade do background","number",'step="0.01" min="0" max="1" placeholder="0.62"')}${input("theme_bgBrightness","Brilho do background","number",'step="0.01" min="0" max="2" placeholder="0.78"')}${input("theme_bgContrast","Contraste","number",'step="0.01" min="0" max="2" placeholder="1.08"')}</div><div class="grid3">${input("theme_bgGrayscale","Preto e branco do fundo","number",'step="0.01" min="0" max="1" placeholder="1"')}${input("theme_bgBlur","Blur em px","number",'step="1" min="0" placeholder="0"')}${input("theme_noiseOpacity","Opacidade do noise","number",'step="0.01" min="0" max="1" placeholder="0.045"')}</div>${input("theme_overlay","Overlay CSS do fundo","textarea",'placeholder="linear-gradient(to right,rgba(0,0,0,.68),rgba(0,0,0,.28),rgba(0,0,0,.66)),linear-gradient(to top,rgba(0,0,0,.66),transparent 55%)"')}<p class="note">Dica: overlay mais transparente = imagem do fundo mais aparente.</p></fieldset><fieldset><legend>Background — Mobile opcional</legend><div class="grid3">${input("theme_mobileBgOpacity","Opacidade mobile","number",'step="0.01" min="0" max="1" placeholder="0.54"')}${input("theme_mobileBgBrightness","Brilho mobile","number",'step="0.01" min="0" max="2" placeholder="0.72"')}${input("theme_mobileBgBlur","Blur mobile px","number",'step="1" min="0" placeholder="0"')}</div></fieldset><fieldset><legend>Cores principais</legend><div class="grid2">${input("theme_textColor","Cor do texto")}${input("theme_mutedColor","Cor secundária")}</div><div class="grid2">${input("theme_lineColor","Cor das linhas")}${input("theme_buttonColor","Cor dos botões")}</div><div class="grid2">${input("theme_buttonTextColor","Texto dos botões")}${input("theme_siteBackground","Background base")}</div></fieldset><fieldset><legend>Cards de gêneros — capas do último episódio</legend><p class="help">Esses controles mudam apenas os cards do popup Genres. A capa vem automaticamente do último episódio relacionado ao gênero.</p><div class="grid3">${input("theme_genreCardCoverOpacity","Opacidade da capa","number",'step="0.01" min="0" max="1" placeholder="0.28"')}${input("theme_genreCardCoverHoverOpacity","Opacidade no hover","number",'step="0.01" min="0" max="1" placeholder="0.5"')}${input("theme_genreCardCoverPosition","Posição da capa CSS","text",'placeholder="center"')}</div><div class="grid3">${input("theme_genreCardCoverBrightness","Brilho da capa","number",'step="0.01" min="0" max="2" placeholder="0.88"')}${input("theme_genreCardCoverHoverBrightness","Brilho no hover","number",'step="0.01" min="0" max="2" placeholder="0.72"')}${input("theme_genreCardCoverContrast","Contraste da capa","number",'step="0.01" min="0" max="2" placeholder="1.05"')}</div>${input("theme_genreCardCoverGrayscale","Preto e branco da capa 0 a 1","number",'step="0.01" min="0" max="1" placeholder="1"')}${input("theme_genreCardCoverOverlay","Overlay CSS normal","textarea",'placeholder="linear-gradient(to bottom,rgba(255,255,255,.64),rgba(255,255,255,.9))"')}${input("theme_genreCardCoverHoverOverlay","Overlay CSS hover","textarea",'placeholder="linear-gradient(to bottom,rgba(0,0,0,.18),rgba(0,0,0,.72))"')}</fieldset><fieldset><legend>Layout</legend><div class="grid2">${input("theme_heroHeight","Altura da home/hero CSS")}${input("theme_globalSpacing","Espaçamento global CSS")}</div><div class="grid2">${input("theme_cardMinWidth","Largura mínima dos cards CSS")}${input("theme_popupWidth","Largura dos popups CSS")}</div></fieldset><div class="actions"><button id="saveThemeBtn">Salvar visual</button><button id="themePresetVisibleBtn" type="button" class="ghost">Preset fundo mais visível</button><button id="themePresetDarkBtn" type="button" class="ghost">Preset mais escuro</button></div></div><div class="list"><h2>Preview Visual</h2><div class="theme-live-preview"><div class="theme-preview-bg"></div><div class="theme-preview-shade"></div><div class="theme-preview-card"><span>PREVIEW</span><b>BACKGROUND MAIS VISÍVEL</b><small>O site aplica isso automaticamente pelo Firestore.</small></div></div><pre id="themePreview" class="preview-code"></pre></div>`;

  $("cartPanel").innerHTML = `<div class="editor"><h2>Cart</h2><p class="help">Conecte Finalizar Pedido a Shopify, Stripe, Mercado Pago, Gumroad, Bandcamp ou qualquer URL.</p>${input("cart_checkoutUrl","Link de checkout final")}${input("cart_checkoutLabel","Texto do botão checkout")}${input("cart_checkoutNote","Texto abaixo do checkout","textarea")}<fieldset><legend>Visual do Cart</legend><div class="grid2">${input("cart_width","Largura CSS")}${input("cart_background","Background")}</div><div class="grid2">${input("cart_textColor","Cor do texto")}${input("cart_lineColor","Cor das linhas")}</div><div class="grid2">${input("cart_buttonBackground","Background do botão")}${input("cart_buttonText","Texto do botão")}</div></fieldset><button id="saveCartBtn">Salvar cart</button></div><div class="list"><h2>Preview Cart</h2><pre id="cartPreview" class="preview-code"></pre></div>`;

  $("homeButtonsPanel").innerHTML = jsonPanel("homeButtons","Botões Home / Rodapé","Edite label, URL, popup e exigência de login/assinatura.","homeButtons_items","homeButtonsPreview",[{label:"Genres",type:"popup",url:"",popupTitle:"Genres",popupText:"Texto do popup",access:"public"}]);
  $("headerButtonsPanel").innerHTML = jsonPanel("headerButtons","Botões Header","Controle os botões do cabeçalho. Use type system para radio/account/cart.","headerButtons_items","headerButtonsPreview",[{label:"Latest",type:"link",url:"#latest",access:"public"},{label:"Radio",type:"system",system:"radio"}]);
  $("archiveTagsPanel").innerHTML = jsonPanel("archiveTags","Tags Latest / Archive","Edite, remova ou crie os botões de filtro do Latest / Archive. O campo category precisa bater com a categoria dos artigos/episódios. Use visible:false para esconder sem apagar.","archiveTags_items","archiveTagsPreview",[{label:"All",category:"All",visible:true,order:1},{label:"Essay",category:"Essay",visible:true,order:2},{label:"Radio",category:"Radio",visible:true,order:3},{label:"Cinema",category:"Cinema",visible:true,order:4},{label:"Scene",category:"Scene",visible:true,order:5},{label:"Music",category:"Music",visible:true,order:6},{label:"Visual",category:"Visual",visible:true,order:7},{label:"Archive",category:"Archive",visible:true,order:8},{label:"Design",category:"Design",visible:true,order:9}]);
  $("infoCardsPanel").innerHTML = `
    <div class="editor wide-editor">
      <h2>Popups About / Contact / Donate</h2>
      <p class="help">Edite os três popups principais sem mexer no código. Use URLs externas de imagens/vídeos; não depende de Storage.</p>
      ${infoPopupEditor("about","01 / INFO","About")}
      ${infoPopupEditor("contact","02 / CONTACT","Contact")}
      ${infoPopupEditor("donate","03 / SUPPORT","Donate")}
      <div class="actions"><button id="saveInfoCardsBtn">Salvar popups</button><button class="ghost" id="resetInfoCardsBtn" type="button">Recarregar salvos</button></div>
      <p class="note">Salva no Firestore em settings/infoCards. Campos de mídia aceitam uma URL por linha.</p>
    </div>
    <div class="list"><h2>Preview JSON</h2><pre id="infoCardsPreview" class="preview-code"></pre></div>`;

  $("accessPanel").innerHTML = `<div class="editor wide-editor"><h2>Acesso / Assinatura</h2><p class="help">Controle bloqueio global, assinatura e quem pode abrir cards, episódios, matérias e produtos.</p><fieldset><legend>Bloqueio global</legend><div class="grid2">${input("access_lockAllCards","Bloquear todos os cards? true/false")}${input("access_defaultAccess","Acesso padrão: public, login, subscriber ou locked")}</div>${input("access_lockedMessage","Mensagem geral de bloqueio","textarea")}</fieldset><fieldset><legend>Assinantes</legend>${input("access_subscriberEmails","Emails pagantes/liberados — separados por vírgula","textarea")}${input("access_subscriberUids","UIDs Firebase liberados — separados por vírgula","textarea")}</fieldset><fieldset><legend>Textos da assinatura</legend>${input("access_subscriptionTitle","Título do popup")}${input("access_subscriptionText","Texto do popup","textarea")}${input("access_subscribeUrl","Link de assinatura/pagamento")}</fieldset><button id="saveAccessBtn">Salvar acesso</button></div><div class="list"><h2>Preview</h2><pre id="accessPreview" class="preview-code"></pre></div>`;

  $("membershipPanel").innerHTML = `<div class="editor wide-editor"><h2>Membership / Planos</h2><p class="help">Controle a base da assinatura: planos, preços, URLs de checkout, liberação manual de assinantes e texto da área de membros.</p><fieldset><legend>Planos de assinatura</legend>${input("membership_plans","Planos — JSON editável","textarea", safeJSONPlaceholder([{id:"apoie",name:"APOIE CYBERISDEAD",price:"R$ 3,90",period:"/ mês",checkoutUrl:"https://...",active:true,benefits:["Calendário","Perfil","Badges"]}]))}</fieldset><fieldset><legend>Assinantes liberados manualmente</legend>${input("membership_subscribers","Assinantes — JSON","textarea", safeJSONPlaceholder([{email:"pessoa@email.com",tier:"supporter",status:"active",since:"2026-05-31"}]))}</fieldset><fieldset><legend>Configurações da Member Area</legend><div class="grid2">${input("membership_dashboardTitle","Título da dashboard")}${input("membership_lockedTitle","Título para visitante bloqueado")}</div>${input("membership_lockedText","Texto para visitante sem assinatura","textarea")}${input("membership_cancelText","Texto sobre cancelamento","textarea")}</fieldset><div class="actions"><button id="saveMembershipBtn">Salvar Membership</button><button class="ghost" id="reloadMembershipBtn" type="button">Recarregar</button></div><p class="note">Salva em Firestore: settings/membership.</p></div><div class="list"><h2>Preview JSON</h2><pre id="membershipPreview" class="preview-code"></pre></div>`;

  $("memberContentPanel").innerHTML = `<div class="editor wide-editor"><h2>Member Content</h2><p class="help">Cadastre conteúdos exclusivos da área de membros: feed, vault, magazine, vídeos, downloads, links e arquivos.</p><fieldset><legend>Novo conteúdo exclusivo</legend><div class="grid2">${input("memberContent_id","ID / slug")}${input("memberContent_type","Tipo: feed, magazine, vault, video, download, link")}</div>${input("memberContent_title","Título")}${input("memberContent_description","Descrição","textarea")}<div class="grid2">${input("memberContent_tier","Plano mínimo: apoie, supporter, premium, inner")}${input("memberContent_status","Status: draft, published, archived")}</div><div class="grid2">${input("memberContent_cover","Capa URL")}${input("memberContent_url","URL principal / arquivo / vídeo")}</div>${input("memberContent_body","Texto / notas — um parágrafo por linha","textarea")}${input("memberContent_tags","Tags separadas por vírgula")}</fieldset><div class="actions"><button id="saveMemberContentBtn">Salvar conteúdo</button><button class="ghost" id="clearMemberContentBtn" type="button">Limpar</button></div><p class="note">Salva em Firestore: memberContent.</p></div><div class="list"><h2>Conteúdos salvos</h2><div class="cards" id="memberContentList"></div></div>`;

  $("memberCalendarPanel").innerHTML = `<div class="editor wide-editor"><h2>Calendar / Programação</h2><p class="help">Crie eventos para o calendário da plataforma e conteúdos semanais exclusivos.</p><fieldset><legend>Novo evento</legend><div class="grid2">${input("memberCalendar_id","ID / slug")}${input("memberCalendar_date","Data","date")}</div><div class="grid2">${input("memberCalendar_time","Horário")}${input("memberCalendar_tier","Plano mínimo")}</div>${input("memberCalendar_title","Título")}${input("memberCalendar_description","Descrição","textarea")}<div class="grid2">${input("memberCalendar_url","Link / transmissão")}${input("memberCalendar_status","Status: draft, published, archived")}</div></fieldset><div class="actions"><button id="saveMemberCalendarBtn">Salvar evento</button><button class="ghost" id="clearMemberCalendarBtn" type="button">Limpar</button></div><p class="note">Salva em Firestore: memberCalendar.</p></div><div class="list"><h2>Eventos salvos</h2><div class="cards" id="memberCalendarList"></div></div>`;

  $("memberCommentsPanel").innerHTML = `<div class="editor wide-editor"><h2>Comments / Rádio</h2><p class="help">Gerencie comentários dos membros para episódios da rádio. Você pode aprovar, ocultar ou excluir comentários.</p><fieldset><legend>Filtro</legend><div class="grid2">${input("memberComments_episodeId","Filtrar por episódio ID")}${input("memberComments_status","Status: pending, approved, hidden")}</div></fieldset><div class="actions"><button id="loadMemberCommentsBtn">Carregar comentários</button><button class="ghost" id="seedCommentBtn" type="button">Criar comentário teste</button></div><p class="note">Salva em Firestore: memberComments.</p></div><div class="list"><h2>Comentários</h2><div class="cards" id="memberCommentsList"></div></div>`;


  $("mediaPanel").innerHTML = `<div class="editor"><h2>Mídia / Uploads</h2><p class="help">Upload real no Firebase Storage com preview, progresso e URL copiável.</p><div id="dropzone" class="dropzone"><input id="mediaFile" type="file" accept="image/*,video/*,audio/*" multiple><p>Arraste arquivos aqui ou selecione no botão acima.</p></div><div class="grid2">${input("mediaFolder","Pasta destino")}${input("mediaTag","Tag / uso")}</div><div class="progress"><span id="uploadProgress"></span></div><p id="uploadStatus" class="note"></p><button id="refreshMediaBtn" class="ghost">Atualizar biblioteca</button></div><div class="list"><h2>Biblioteca de mídia</h2><div id="mediaLibrary" class="media-grid"></div></div>`;

  $("homepagePanel").innerHTML = `<div class="editor wide-editor"><h2>Homepage — Seções do site</h2><p class="help">Tudo que aparece nas áreas da home/rádio. Deixe uma lista vazia para usar o conteúdo automático (últimos episódios, gêneros, matérias).</p>
  <fieldset><legend>Barra ao vivo + Títulos das seções</legend><div class="grid2">${input("hp_liveLabel","Etiqueta ao vivo (ex: LIVE NOW)")}${input("hp_liveChannel","Canal (ex: CYBERISDEAD)")}</div><div class="grid2">${input("hp_mustWatchTitle","Título Must Watch")}${input("hp_mixtapesTitle","Título Mixtapes")}</div><div class="grid2">${input("hp_newsTitle","Título News & Events")}${input("hp_eventsTitle","Título Upcoming Events")}</div></fieldset>
  <fieldset><legend>Hero destaque (slides)</legend><p class="hint">Tudo do banner passa por aqui: textos, imagens, vídeo, botão, episódio e tempo de cada slide.</p><div class="hp-list" id="hp_heroRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_heroRows">＋ Adicionar slide</button></div></fieldset>
  <fieldset><legend>Spotlight Hero — comportamento e visual</legend><div class="grid3">${input("hp_heroEnabled","Hero ligado? true/false")}${input("hp_heroAutoplay","Troca sozinho? true/false")}${input("hp_heroDuration","Duração de cada slide (ms)")}</div><div class="grid3">${input("hp_heroAnimation","Animação: fade, slide, zoom ou none")}${input("hp_heroCardPos","Cartão: bottom-right, bottom-left, top-right, top-left")}${input("hp_heroHeight","Altura desktop (ex: 560px)")}</div><div class="grid3">${input("hp_heroHeightMobile","Altura mobile (ex: 260px)")}${input("hp_heroFit","Imagem: cover ou contain")}${input("hp_heroPosition","Posição da imagem (ex: center 20%)")}</div></fieldset>
  <fieldset><legend>Must Watch</legend><div class="hp-list" id="hp_mustWatchRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_mustWatchRows">＋ Adicionar item</button></div></fieldset>
  <fieldset><legend>Infinite Mixtapes</legend><p class="hint">Vazio = automático: 1 mix por gênero cadastrado (capa do último episódio, toca o mais recente). Preencha para curadoria manual.</p><div class="hp-list" id="hp_mixtapesRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_mixtapesRows">＋ Adicionar mix</button></div></fieldset>
  <fieldset><legend>News</legend><div class="hp-list" id="hp_newsRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_newsRows">＋ Adicionar notícia</button></div></fieldset>
  <fieldset><legend>Upcoming Events</legend><div class="hp-list" id="hp_eventsRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_eventsRows">＋ Adicionar evento</button></div></fieldset>
  <fieldset><legend>Banner Supporter</legend><div class="grid2">${input("hp_supTitle","Título")}${input("hp_supButton","Texto do botão")}</div>${input("hp_supText","Texto","textarea")}<div class="grid2">${input("hp_supUrl","Link do botão")}${input("hp_supImage","Imagem de fundo URL")}</div></fieldset>
  <fieldset><legend>Banner Donate</legend><div class="grid2">${input("hp_donTitle","Título")}${input("hp_donButton","Texto do botão")}</div>${input("hp_donText","Texto","textarea")}<div class="grid2">${input("hp_donUrl","Link do botão")}${input("hp_donImage","Imagem de fundo URL")}</div></fieldset>
  <fieldset><legend>Channels (rodapé)</legend><div class="hp-list" id="hp_channelsRows"></div><div class="actions"><button class="ghost" type="button" data-hp-add="hp_channelsRows">＋ Adicionar canal</button></div></fieldset>
  <div class="actions"><button id="saveHomepageBtn">Salvar Homepage</button><button class="ghost" id="reloadHomepageBtn" type="button">Recarregar</button></div></div><div class="list"><h2>Preview JSON</h2><pre id="homepagePreview" class="preview-code"></pre></div>`;

  $("backupPanel").innerHTML = `<div class="editor"><h2>Backup</h2><p class="help">Exporte e restaure dados do Firestore. Antes de restaurar, salve uma cópia do JSON atual.</p><div class="actions"><button id="exportBackupBtn">Exportar backup JSON</button><button class="ghost" id="createSnapshotBtn">Salvar snapshot no Firestore</button></div><div class="actions"><button class="ghost" data-export-coll="articles" type="button">Baixar articles.json</button><button class="ghost" data-export-coll="stations" type="button">Baixar stations.json</button><button class="ghost" data-export-coll="products" type="button">Baixar products.json</button><button class="ghost" data-export-coll="hosts" type="button">Baixar hosts.json</button></div><textarea id="backupImport" placeholder="Cole aqui um backup JSON para restaurar"></textarea><button class="danger" id="restoreBackupBtn">Restaurar backup colado</button></div><div class="list"><h2>Preview backup</h2><pre id="backupPreview" class="preview-code"></pre></div>`;

  $("logsPanel").innerHTML = `<div class="box wide"><h2>Logs</h2><div class="toolbar"><button id="refreshLogsBtn">Atualizar logs</button><button class="ghost" id="clearLocalErrorsBtn">Limpar erros locais</button></div><div id="logsList" class="cards"></div></div>`;

  $("importPanel").innerHTML = `<div class="box wide"><h2>Importar JSON atual para Firestore</h2><p class="note">Use para copiar seus arquivos data/*.json atuais para o Firestore.</p><div class="import-grid"><button data-import="articles">Importar artigos</button><button data-import="stations">Importar episódios</button><button data-import="products">Importar produtos</button><button data-import="hosts">Importar hosts</button><button data-import="globalSocials">Importar redes globais</button></div><p id="importMessage" class="note"></p></div>`;

  bindButtons();
  panelsBuilt = true;
}
function jsonPanel(docId,title,help,fieldId,previewId,example){ return `<div class="editor wide-editor"><h2>${title}</h2><p class="help">${help}</p>${input(fieldId,"Itens — JSON","textarea",safeJSONPlaceholder(example))}<button id="save${docId[0].toUpperCase()+docId.slice(1)}Btn">Salvar</button></div><div class="list"><h2>Preview</h2><pre id="${previewId}" class="preview-code"></pre></div>`; }
function bindButtons(){
  COLLECTIONS.forEach(c=>{ $(`${c}_save`).onclick = () => saveItem(c); $(`${c}_clear`).onclick = () => clearForm(c); const s=$(`${c}Search`); if(s) s.oninput=debounce(()=>loadList(c,s.value),250); });
  $("saveSettingsBtn").onclick = saveSettings; if($("saveSiteMetaBtn")) $("saveSiteMetaBtn").onclick = saveSiteMeta; if($("saveSiteTextsBtn")) $("saveSiteTextsBtn").onclick = saveSiteTexts; if($("resetSiteTextsBtn")) $("resetSiteTextsBtn").onclick = loadSiteTexts; if($("siteMetaPreviewBtn")) $("siteMetaPreviewBtn").onclick = updateSiteMetaPreview; const ogp=$("siteMeta_ogImage"); if(ogp) ogp.oninput=updateSiteMetaPreview; $("saveThemeBtn").onclick = saveTheme; $("saveCartBtn").onclick = saveCart;
  if($("themePresetVisibleBtn")) $("themePresetVisibleBtn").onclick = () => setThemePreset("visible");
  if($("themePresetDarkBtn")) $("themePresetDarkBtn").onclick = () => setThemePreset("dark");
  ["theme_bgOpacity","theme_bgBrightness","theme_bgContrast","theme_bgGrayscale","theme_bgBlur","theme_noiseOpacity","theme_overlay","theme_genreCardCoverOpacity","theme_genreCardCoverBrightness","theme_genreCardCoverOverlay"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("input",()=>applyThemePreview()); });
  $("saveHomeButtonsBtn").onclick = saveHomeButtons; $("saveHeaderButtonsBtn").onclick = saveHeaderButtons; if($("saveArchiveTagsBtn")) $("saveArchiveTagsBtn").onclick = saveArchiveTags; if($("saveShareBtn")) $("saveShareBtn").onclick = saveShare; if($("resetShareBtn")) $("resetShareBtn").onclick = loadShare; $("saveInfoCardsBtn").onclick = saveInfoCards; if($("resetInfoCardsBtn")) $("resetInfoCardsBtn").onclick = loadInfoCards; $("saveAccessBtn").onclick = saveAccess;
  if($("saveMembershipBtn")) $("saveMembershipBtn").onclick = saveMembership;
  if($("reloadMembershipBtn")) $("reloadMembershipBtn").onclick = loadMembership;
  if($("saveEpisodeOrderBtn")) $("saveEpisodeOrderBtn").onclick = ()=>saveOrderPatch({stationOrder: orderReadIds("orderEpisodes")}, "episodes");
  if($("newEpisodeBtn")) $("newEpisodeBtn").onclick = ()=>{ activateTab("stations"); clearForm("stations"); window.scrollTo({top:0, behavior:"smooth"}); toast("Pronto para criar: preencha e salve."); };
  if($("saveSeriesOrderBtn")) $("saveSeriesOrderBtn").onclick = ()=>saveOrderPatch({seriesOrder: orderReadIds("orderSeries")}, "series");
  if($("saveArticleOrderBtn")) $("saveArticleOrderBtn").onclick = ()=>saveOrderPatch({articleOrder: orderReadIds("orderArticles")}, "articles");
  if($("saveSectionsOrderBtn")) $("saveSectionsOrderBtn").onclick = ()=>{
    const titles = {};
    document.querySelectorAll("#orderSections [data-sec-title]").forEach(el=>{ if(el.value.trim()) titles[el.dataset.secTitle] = el.value.trim(); });
    const descs = {};
    document.querySelectorAll("#orderSections [data-sec-desc]").forEach(el=>{ if(el.value.trim()) descs[el.dataset.secDesc] = el.value.trim(); });
    const secLimits = {};
    document.querySelectorAll("#orderSections [data-sec-limit]").forEach(el=>{ const n = Number(el.value); if(n > 0) secLimits[el.dataset.secLimit] = Math.floor(n); });
    const hidden = [...document.querySelectorAll("#orderSections .ord-row")].filter(r=>r.dataset.secHidden==="1").map(r=>r.dataset.orderId);
    const customs = [...document.querySelectorAll('#orderSections [data-custom="1"]')].map(row=>{
      const g = k => row.querySelector(`[data-csec-k="${k}"]`)?.value.trim() || '';
      return {id: row.querySelector('[data-csec-k="id"]')?.value.trim() || row.dataset.orderId, title: g('title'), subtitle: g('subtitle'), kind: g('kind') || 'texto', image: g('image'), text: g('text'), linkLabel: g('linkLabel'), linkUrl: g('linkUrl'), episodeId: g('episodeId'), items: g('items')};
    }).filter(c=>c.id);
    saveOrderPatch({sectionsOrder: orderReadIds("orderSections"), sectionTitles: titles, sectionDescs: descs, sectionsHidden: hidden, customSections: customs}, "sections");
    reloadSitePreview();
  };
  if($("newSectionBtn")) $("newSectionBtn").onclick = ()=>{
    const box = $("orderSections"); if(!box) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = customSectionRow({});
    box.appendChild(tmp.firstChild);
    box.lastChild.scrollIntoView({behavior:"smooth", block:"center"});
  };
  if($("reloadSitePreviewBtn")) $("reloadSitePreviewBtn").onclick = ()=>reloadSitePreview();
  document.querySelectorAll("[data-preview-device]").forEach(b=>b.onclick=()=>{
    const fr = $("sitePreviewFrame"); if(!fr) return;
    fr.style.maxWidth = b.dataset.previewDevice === "mobile" ? "390px" : "100%";
  });
  if(!window.__auraOrdBound){ window.__auraOrdBound = true; let dragEl = null;
    document.addEventListener("click", (e)=>{
      const up = e.target.closest?.("[data-ord-up]"); if(up){ const r=up.closest(".ord-row"); if(r&&r.previousElementSibling&&r.previousElementSibling.hasAttribute("data-order-id")) r.parentNode.insertBefore(r, r.previousElementSibling); return; }
      const down = e.target.closest?.("[data-ord-down]"); if(down){ const r=down.closest(".ord-row"); const n=r?.nextElementSibling; if(r&&n&&n.hasAttribute("data-order-id")) r.parentNode.insertBefore(n, r); return; }
      const ed = e.target.closest?.("[data-order-edit]"); if(ed){ const [c,id]=String(ed.dataset.orderEdit).split(":"); activateTab(c); editItem(c,id); return; }
      const cdel = e.target.closest?.("[data-csec-del]"); if(cdel){ if(confirm("Excluir esta seção?")) cdel.closest(".ord-row")?.remove(); return; }
      const ft = e.target.closest?.("[data-order-feat]"); if(ft){ toggleFeaturedOrder(ft.dataset.orderFeat); return; }
      const sh = e.target.closest?.("[data-sec-hide]"); if(sh){ const r=sh.closest(".ord-row"); const hidden=r?.dataset.secHidden==="1"; if(r) r.dataset.secHidden = hidden?"0":"1"; sh.textContent = hidden?"Ocultar":"Mostrar"; const sm=r?.querySelector("small"); if(sm){ const id=r.dataset.orderId; sm.textContent = `id: ${id}${hidden?"":" · OCULTA"}`; } return; }
      const se = e.target.closest?.("[data-sec-edit]"); if(se){ activateTab(se.dataset.secEdit); window.scrollTo({top:0, behavior:"smooth"}); return; }
    });
    document.addEventListener("dragstart", (e)=>{ const r=e.target.closest?.(".ord-row"); if(!r) return; dragEl=r; e.dataTransfer.effectAllowed="move"; try{e.dataTransfer.setData("text/plain", r.dataset.orderId);}catch(err){} });
    document.addEventListener("dragover", (e)=>{ const list=e.target.closest?.(".ord-list"); if(!list||!dragEl) return; e.preventDefault(); const r=e.target.closest?.(".ord-row"); if(!r||r===dragEl) return; const rect=r.getBoundingClientRect(); const after=(e.clientY-rect.top)>rect.height/2; r.parentNode.insertBefore(dragEl, after?r.nextSibling:r); });
    document.addEventListener("dragend", ()=>{ dragEl=null; });
  }
  if($("reloadMembershipBtn")) $("reloadMembershipBtn").onclick = loadMembership;
  if($("saveHomepageBtn")) $("saveHomepageBtn").onclick = saveHomepage;
  if($("reloadHomepageBtn")) $("reloadHomepageBtn").onclick = loadHomepage;
  if($("saveLiveBtn")) $("saveLiveBtn").onclick = saveLive;
  if($("previewLiveBtn")) $("previewLiveBtn").onclick = previewLiveResult;
  if($("reloadLiveBtn")) $("reloadLiveBtn").onclick = loadLive;
  if(!window.__auraHpBound){ window.__auraHpBound = true; document.addEventListener("click", (e)=>{
    const add = e.target.closest?.("[data-hp-add]"); if(add){ const box=$(add.dataset.hpAdd); if(box){ const empty=box.querySelector("p.note"); if(empty) empty.remove(); const tmp=document.createElement("div"); tmp.innerHTML=hpRow({}, HP_SCHEMAS[add.dataset.hpAdd]||[]); box.appendChild(tmp.firstChild); } return; }
    const del = e.target.closest?.("[data-hp-del]"); if(del){ del.closest("[data-hp-row]")?.remove(); return; }
    const up = e.target.closest?.("[data-hp-up]"); if(up){ const row=up.closest("[data-hp-row]"); const prev=row?.previousElementSibling; if(row&&prev&&prev.hasAttribute("data-hp-row")) row.parentNode.insertBefore(row, prev); return; }
    const down = e.target.closest?.("[data-hp-down]"); if(down){ const row=down.closest("[data-hp-row]"); const next=row?.nextElementSibling; if(row&&next&&next.hasAttribute("data-hp-row")) row.parentNode.insertBefore(next, row); return; }
    const upl = e.target.closest?.("[data-hp-upload]"); if(upl){ uploadLiveLogo(upl); return; }
  }); }
  if($("saveMemberContentBtn")) $("saveMemberContentBtn").onclick = saveMemberContent;
  if($("clearMemberContentBtn")) $("clearMemberContentBtn").onclick = clearMemberContent;
  if($("saveMemberCalendarBtn")) $("saveMemberCalendarBtn").onclick = saveMemberCalendar;
  if($("clearMemberCalendarBtn")) $("clearMemberCalendarBtn").onclick = clearMemberCalendar;
  if($("loadMemberCommentsBtn")) $("loadMemberCommentsBtn").onclick = loadMemberComments;
  if($("seedCommentBtn")) $("seedCommentBtn").onclick = seedMemberComment;
  $("refreshDashboardBtn").onclick = loadDashboard; $("refreshMediaBtn").onclick = loadMediaLibrary; $("exportBackupBtn").onclick = exportBackup; $("createSnapshotBtn").onclick = createSnapshot; $("restoreBackupBtn").onclick = restoreBackup; $("refreshLogsBtn").onclick = loadLogs;
  $("clearLocalErrorsBtn").onclick = () => { localStorage.removeItem("auraLocalErrors"); loadLogs(); };
  document.querySelectorAll("[data-import]").forEach(b=> b.onclick = () => importJson(b.dataset.import));
  document.querySelectorAll("[data-export-coll]").forEach(b=> b.onclick = () => exportCollection(b.dataset.exportColl));
  if($("stations_renameSeriesBtn")) $("stations_renameSeriesBtn").onclick = renameSeries;
  setupLinkHelper("stations_links", "Links — JSON");
  setupLinkHelper("hosts_socials", "Redes — JSON");
  setupLinkHelper("settings_socials", "Redes globais — JSON");
  installStationImagePreviews();
  refreshSeriesDatalist();
  if(!window.__auraTabJumpBound){ window.__auraTabJumpBound = true; document.addEventListener("click", (e)=>{ const j = e.target.closest?.("[data-tab-jump]"); if(j) activateTab(j.dataset.tabJump); }); }
  document.querySelectorAll("[data-tab-jump]").forEach(b=> b.onclick = () => activateTab(b.dataset.tabJump));
  setupBuilder();
  setupUpload();
}
function debounce(fn,ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; }


function installStationImagePreviews(){
  const pairs = [
    {input:"articles_cover", preview:"articles_coverPreview", type:"image", label:"Preview da capa do artigo"},
    {input:"stations_cover", preview:"stations_coverPreview", type:"image", label:"Preview da capa"},
    {input:"stations_audio", preview:"stations_audioPreview", type:"audio", label:"Preview do áudio"},
    {input:"stations_background", preview:"stations_backgroundPreview", typeField:"stations_backgroundType", label:"Preview do fundo"}
  ];
  const render = ({input, preview, type, typeField, label}) => {
    const field = $(input);
    const box = $(preview);
    if(!field || !box) return;
    const url = String(field.value || "").trim();
    const chosenType = String(typeField && $(typeField) ? $(typeField).value : type || "image").toLowerCase();
    if(!url){ box.innerHTML = `<small>${label}: cole uma URL para visualizar.</small>`; return; }
    if(chosenType === "audio"){ box.innerHTML = `<small>${label}</small><audio src="${escapeHtml(url)}" controls preload="metadata" style="width:100%"></audio>`; return; }
    const isVideo = chosenType.includes("video") || /\.(mp4|webm|mov)(\?|$)/i.test(url);
    box.innerHTML = isVideo
      ? `<small>${label}</small><video src="${escapeHtml(url)}" muted controls playsinline></video>`
      : `<small>${label}</small><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}">`;
  };
  pairs.forEach(pair=>{
    const field = $(pair.input);
    const typeField = pair.typeField ? $(pair.typeField) : null;
    if(field){ field.oninput = () => render(pair); field.onchange = () => render(pair); }
    if(typeField){ typeField.oninput = () => render(pair); typeField.onchange = () => render(pair); }
    render(pair);
  });
}


/* =========================
   CYBERISDEAD WEBSITE BUILDER V1
   Safe module: adds Firestore-powered visual pages without changing existing CMS collections.
   ========================= */
const BUILDER_COLLECTION = "builderPages";
let builderState = {
  pages: [],
  currentPage: null,
  blocks: [],
  selectedBlockId: null,
  device: "desktop"
};
const builderDefaultPage = () => ({
  id: "home",
  title: "Home Builder",
  slug: "home",
  status: "draft",
  showInNav: false,
  replaceSite: false,
  description: "Página visual criada no CYBERISDEAD Website Builder.",
  style: { background: "", color: "", maxWidth: "1280px" },
  blocks: [
    { id: crypto.randomUUID(), type: "hero", label: "Hero inicial", access: "public", content: { title: "CYBERISDEAD BUILDER", text: "Edite este bloco visualmente pelo admin.", buttonLabel: "Explorar", buttonUrl: "#latest" }, style: { padding: "72px 18px", align: "left", minHeight: "360px", border: "1px solid #333", background: "rgba(0,0,0,.55)", color: "#fff" } },
    { id: crypto.randomUUID(), type: "grid", label: "Grid inicial", access: "public", content: { title: "Blocos editáveis", text: "Crie seções, duplique, mova, edite design e publique." }, items: [{title:"Design",text:"Cores, espaçamento, bordas e responsivo."},{title:"Conteúdo",text:"Textos, imagens, vídeos, embeds e botões."},{title:"CMS",text:"Listas de artigos, rádio, produtos e membership."}], style: { padding: "32px 18px", columns: "3", gap: "8px" } }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
function builderBool(v){ return ["true","1","yes","sim","on","published"].includes(String(v ?? "").trim().toLowerCase()); }
function builderVal(id){ return $(id)?.value ?? ""; }
function builderSet(id, value){ const el=$(id); if(el) el.value = value ?? ""; }
function builderNormalizeLineItems(value){
  const raw = String(value || "").trim();
  if(!raw) return [];
  try{ const parsed = JSON.parse(raw); if(Array.isArray(parsed)) return parsed; }catch{}
  return raw.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{
    const parts = line.split(/\s*(?:\|\||\|)\s*/).map(x=>x.trim());
    if(parts.length >= 3) return {title:parts[0], text:parts[1], url:parts[2]};
    if(parts.length === 2) return {src:parts[0], caption:parts[1], title:parts[0], text:parts[1]};
    return {src:parts[0], title:parts[0], text:""};
  });
}
function builderStyleFromFields(){
  return {
    background: builderVal("builder_styleBackground"), color: builderVal("builder_styleColor"), align: builderVal("builder_styleAlign"),
    padding: builderVal("builder_stylePadding"), margin: builderVal("builder_styleMargin"), minHeight: builderVal("builder_styleMinHeight"),
    fontSize: builderVal("builder_styleFontSize"), radius: builderVal("builder_styleRadius"), border: builderVal("builder_styleBorder"),
    columns: builderVal("builder_styleColumns"), gap: builderVal("builder_styleGap"), maxWidth: builderVal("builder_styleMaxWidth"),
    display: builderVal("builder_styleDisplay"), justify: builderVal("builder_styleJustify"), alignItems: builderVal("builder_styleAlignItems"),
    width: builderVal("builder_styleWidth"), height: builderVal("builder_styleHeight"), opacity: builderVal("builder_styleOpacity"),
    shadow: builderVal("builder_styleShadow"), transform: builderVal("builder_styleTransform"), zIndex: builderVal("builder_styleZIndex")
  };
}
function builderContentFromFields(){
  return {
    title: builderVal("builder_blockTitle"), text: builderVal("builder_blockText"), media: builderVal("builder_blockMedia"), alt: builderVal("builder_blockAlt"),
    buttonLabel: builderVal("builder_blockButtonLabel"), buttonUrl: builderVal("builder_blockButtonUrl"), html: builderVal("builder_blockHtml"),
    action: builderVal("builder_buttonAction") || "link", pageTarget: builderVal("builder_buttonPageTarget"), section: builderVal("builder_buttonSection"),
    newTab: builderVal("builder_buttonNewTab"), rel: builderVal("builder_buttonRel"), buttonClass: builderVal("builder_buttonClass")
  };
}
function builderBlockFromFields(existingId){
  return {
    id: existingId || crypto.randomUUID(),
    type: builderVal("builder_blockType") || "text",
    label: builderVal("builder_blockLabel") || builderVal("builder_blockTitle") || "Bloco",
    access: builderVal("builder_blockAccess") || "public",
    content: builderContentFromFields(),
    items: builderNormalizeLineItems(builderVal("builder_blockItems")),
    style: builderStyleFromFields(),
    updatedAt: new Date().toISOString()
  };
}
function builderPageFromFields(){
  const id = (builderVal("builder_pageId") || slug(builderVal("builder_title") || "page")).trim();
  return {
    ...(builderState.currentPage || {}),
    id,
    title: builderVal("builder_title") || id,
    slug: slug(builderVal("builder_slug") || id),
    status: builderVal("builder_status") || "draft",
    showInNav: builderBool(builderVal("builder_showInNav")),
    replaceSite: builderBool(builderVal("builder_replaceSite")),
    description: builderVal("builder_description"),
    style: { background: builderVal("builder_bg"), color: builderVal("builder_color"), maxWidth: builderVal("builder_maxWidth") || "1280px" },
    blocks: builderState.blocks,
    updatedAt: new Date().toISOString()
  };
}
function builderFillPage(page){
  builderState.currentPage = page;
  builderState.blocks = Array.isArray(page.blocks) ? structuredClone(page.blocks) : [];
  builderSet("builder_pageId", page.id || ""); builderSet("builder_title", page.title || ""); builderSet("builder_slug", page.slug || page.id || "");
  builderSet("builder_status", page.status || "draft"); builderSet("builder_showInNav", String(!!page.showInNav)); builderSet("builder_replaceSite", String(!!page.replaceSite));
  builderSet("builder_description", page.description || ""); builderSet("builder_bg", page.style?.background || ""); builderSet("builder_color", page.style?.color || ""); builderSet("builder_maxWidth", page.style?.maxWidth || "1280px");
  builderState.selectedBlockId = null;
  builderRenderAll();
}

function builderSafeUrl(url=""){
  const raw = String(url || "").trim();
  if(!raw) return "#";
  if(raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
  if(/^mailto:/i.test(raw) || /^tel:/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
  return raw;
}
function builderButtonHref(content={}){
  const action = String(content.action || "link").trim();
  const url = String(content.buttonUrl || "").trim();
  const pageTarget = String(content.pageTarget || "").trim();
  const section = String(content.section || "").trim().replace(/^#/, "");
  if(action === "builderPage") return pageTarget ? `?builder=${encodeURIComponent(pageTarget)}` : builderSafeUrl(url || "#");
  if(action === "section") return section ? `#${encodeURIComponent(section)}` : builderSafeUrl(url || "#");
  if(action === "memberArea") return "./admin-firebase/member-area.html";
  if(action === "membershipPopup") return "#membership";
  if(action === "email") return url.startsWith("mailto:") ? url : `mailto:${url}`;
  if(action === "whatsapp"){
    if(/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(url)) return url;
    const clean = url.replace(/[^0-9+]/g, "");
    return clean ? `https://wa.me/${clean.replace(/^\+/, "")}` : "https://wa.me/";
  }
  return builderSafeUrl(url || "#");
}
function builderButtonAttrs(content={}){
  const href = builderButtonHref(content);
  const action = String(content.action || "link").trim();
  const extraClass = String(content.buttonClass || "").replace(/[^a-zA-Z0-9_\-\s]/g, "").trim();
  const classes = ["builder-public-button", extraClass].filter(Boolean).join(" ");
  const newTab = builderBool(content.newTab) || action === "download" || /^https?:\/\//i.test(href);
  const rel = String(content.rel || (newTab ? "noopener noreferrer" : "")).replace(/[<>\"]/g, "").trim();
  const target = newTab ? ` target="_blank"` : "";
  const relAttr = rel ? ` rel="${escapeHtml(rel)}"` : "";
  const download = action === "download" ? " download" : "";
  const dataAction = action === "membershipPopup" ? " data-open-membership-popup=\"1\"" : "";
  return { href, attrs: `class="${escapeHtml(classes)}" href="${escapeHtml(href)}"${target}${relAttr}${download}${dataAction}` };
}
function builderUpdatePageTargetOptions(){
  const select = $("builder_buttonPageTarget");
  if(!select) return;
  const current = select.value;
  const pages = Array.isArray(builderState.pages) ? builderState.pages : [];
  const active = builderState.currentPage ? [builderState.currentPage] : [];
  const merged = [...active, ...pages];
  const seen = new Set();
  const options = merged.filter(p => p && p.id && !seen.has(p.id) && seen.add(p.id));
  select.innerHTML = `<option value="">Selecionar página</option>` + options.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title || p.id)}${p.slug ? ` — /${escapeHtml(p.slug)}` : ""}</option>`).join("");
  if(current && [...select.options].some(o => o.value === current)) select.value = current;
}
function builderTemplateHomePage(){
  const page = builderDefaultPage();
  page.id = "home";
  page.title = "Home";
  page.slug = "home";
  page.status = "draft";
  page.showInNav = true;
  page.replaceSite = false;
  page.description = "Home editável criada no Website Builder.";
  page.blocks = [
    { id: crypto.randomUUID(), type:"hero", label:"Hero Home", access:"public", content:{ title:"CYBERISDEAD", text:"Rádio, magazine, arquivo, comunidade e loja em uma plataforma independente.", buttonLabel:"Ver Latest", buttonUrl:"#latest", action:"section", section:"latest" }, style:{ padding:"96px 18px", minHeight:"520px", border:"1px solid #333", background:"rgba(0,0,0,.45)", color:"#fff", align:"left" } },
    { id: crypto.randomUUID(), type:"grid", label:"Atalhos", access:"public", content:{ title:"Navegação", text:"Crie caminhos claros para o público circular pelo site." }, items:[{title:"Radio", text:"Abrir transmissões", url:"#radio"},{title:"Magazine", text:"Ler artigos", url:"#latest"},{title:"Shop", text:"Ver produtos", url:"#shop"}], style:{ padding:"32px 18px", columns:"3", gap:"8px", border:"1px solid #333" } },
    { id: crypto.randomUUID(), type:"membership", label:"Membership CTA", access:"public", content:{ title:"Membership", text:"Assine para acessar conteúdo exclusivo, comunidade, calendário e vault.", buttonLabel:"Abrir Membership", action:"membershipPopup" }, style:{ padding:"48px 18px", border:"1px solid #333", align:"center" } }
  ];
  return page;
}
function builderTemplateMemberPage(){
  return {
    id:"member-area", title:"Member Area", slug:"member-area", status:"draft", showInNav:false, replaceSite:false,
    description:"Member Area editável criada no Website Builder.", style:{ background:"#000", color:"#fff", maxWidth:"1280px" },
    blocks:[
      { id: crypto.randomUUID(), type:"hero", label:"Hero Member", access:"subscriber", content:{ title:"MEMBER AREA", text:"Área exclusiva para assinantes com feed, salvos, calendário, vault e comunidade.", buttonLabel:"Ver conteúdo", buttonUrl:"#member-content", action:"section", section:"member-content" }, style:{ padding:"72px 18px", minHeight:"420px", border:"1px solid #333", background:"rgba(0,0,0,.65)" } },
      { id: crypto.randomUUID(), type:"grid", label:"Benefícios", access:"subscriber", content:{ title:"Acesso exclusivo", text:"Organize tudo que o assinante pode acessar." }, items:[{title:"Feed",text:"Posts e atualizações"},{title:"Vault",text:"Arquivos e downloads"},{title:"Calendário",text:"Programação e eventos"}], style:{ padding:"32px 18px", columns:"3", gap:"8px" } },
      { id: crypto.randomUUID(), type:"button", label:"Voltar Home", access:"public", content:{ title:"Voltar ao site", text:"Navegação rápida para a página principal.", buttonLabel:"Abrir Home", action:"builderPage", pageTarget:"home" }, style:{ padding:"24px 18px", align:"center" } }
    ],
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
}

function builderClearBlockFields(){
  ["builder_blockLabel","builder_blockAccess","builder_blockTitle","builder_blockText","builder_blockMedia","builder_blockAlt","builder_blockButtonLabel","builder_blockButtonUrl","builder_buttonSection","builder_buttonNewTab","builder_buttonRel","builder_buttonClass","builder_blockItems","builder_blockHtml","builder_styleBackground","builder_styleColor","builder_styleAlign","builder_stylePadding","builder_styleMargin","builder_styleMinHeight","builder_styleFontSize","builder_styleRadius","builder_styleBorder","builder_styleColumns","builder_styleGap","builder_styleMaxWidth","builder_styleDisplay","builder_styleJustify","builder_styleAlignItems","builder_styleWidth","builder_styleHeight","builder_styleOpacity","builder_styleShadow","builder_styleTransform","builder_styleZIndex"].forEach(id=>builderSet(id,""));
  builderSet("builder_blockAccess","public"); builderSet("builder_buttonAction","link"); builderUpdatePageTargetOptions(); builderState.selectedBlockId=null;
}
function builderFillBlockFields(block){
  builderState.selectedBlockId = block.id;
  builderSet("builder_blockType", block.type || "text"); builderSet("builder_blockLabel", block.label || ""); builderSet("builder_blockAccess", block.access || "public");
  builderSet("builder_blockTitle", block.content?.title || ""); builderSet("builder_blockText", block.content?.text || ""); builderSet("builder_blockMedia", block.content?.media || ""); builderSet("builder_blockAlt", block.content?.alt || "");
  builderSet("builder_blockButtonLabel", block.content?.buttonLabel || ""); builderSet("builder_blockButtonUrl", block.content?.buttonUrl || ""); builderSet("builder_blockHtml", block.content?.html || "");
  builderSet("builder_buttonAction", block.content?.action || "link"); builderUpdatePageTargetOptions(); builderSet("builder_buttonPageTarget", block.content?.pageTarget || ""); builderSet("builder_buttonSection", block.content?.section || ""); builderSet("builder_buttonNewTab", block.content?.newTab || ""); builderSet("builder_buttonRel", block.content?.rel || ""); builderSet("builder_buttonClass", block.content?.buttonClass || "");
  builderSet("builder_blockItems", Array.isArray(block.items) ? JSON.stringify(block.items,null,2) : "");
  const st=block.style||{}; builderSet("builder_styleBackground", st.background || ""); builderSet("builder_styleColor", st.color || ""); builderSet("builder_styleAlign", st.align || ""); builderSet("builder_stylePadding", st.padding || ""); builderSet("builder_styleMargin", st.margin || ""); builderSet("builder_styleMinHeight", st.minHeight || ""); builderSet("builder_styleFontSize", st.fontSize || ""); builderSet("builder_styleRadius", st.radius || ""); builderSet("builder_styleBorder", st.border || ""); builderSet("builder_styleColumns", st.columns || ""); builderSet("builder_styleGap", st.gap || ""); builderSet("builder_styleMaxWidth", st.maxWidth || ""); builderSet("builder_styleDisplay", st.display || ""); builderSet("builder_styleJustify", st.justify || ""); builderSet("builder_styleAlignItems", st.alignItems || ""); builderSet("builder_styleWidth", st.width || ""); builderSet("builder_styleHeight", st.height || ""); builderSet("builder_styleOpacity", st.opacity || ""); builderSet("builder_styleShadow", st.shadow || ""); builderSet("builder_styleTransform", st.transform || ""); builderSet("builder_styleZIndex", st.zIndex || "");
}
function builderInlineStyle(style={}){
  const map = { background:"background", color:"color", align:"text-align", padding:"padding", margin:"margin", minHeight:"min-height", fontSize:"font-size", radius:"border-radius", border:"border", maxWidth:"max-width", gap:"gap", display:"display", justify:"justify-content", alignItems:"align-items", width:"width", height:"height", opacity:"opacity", shadow:"box-shadow", transform:"transform", zIndex:"z-index" };
  return Object.entries(map).map(([k,css])=> style[k] ? `${css}:${String(style[k]).replace(/[;<>]/g,"")}` : "").filter(Boolean).join(";");
}
function builderRenderBlock(block, interactive=false){
  const c=block.content||{}, st=block.style||{}, items=Array.isArray(block.items)?block.items:[];
  const attrs = interactive ? ` data-builder-block="${escapeHtml(block.id)}"` : "";
  const baseStyle = builderInlineStyle(st);
  const title = c.title ? `<h2>${escapeHtml(c.title)}</h2>` : "";
  const text = c.text ? `<p>${escapeHtml(c.text).replace(/\n/g,"<br>")}</p>` : "";
  const btn = c.buttonLabel ? builderButtonAttrs(c) : null;
  const button = btn ? `<a ${btn.attrs}>${escapeHtml(c.buttonLabel)}</a>` : "";
  if(block.type === "image") return `<section class="builder-public-block builder-public-image" style="${baseStyle}"${attrs}>${title}${c.media?`<img src="${escapeHtml(c.media)}" alt="${escapeHtml(c.alt||c.title||'')}"/>`:""}${text}${button}</section>`;
  if(block.type === "video") return `<section class="builder-public-block builder-public-video" style="${baseStyle}"${attrs}>${title}${c.media?`<video src="${escapeHtml(c.media)}" controls playsinline></video>`:""}${text}${button}</section>`;
  if(block.type === "embed") return `<section class="builder-public-block builder-public-embed" style="${baseStyle}"${attrs}>${title}<div class="builder-embed-wrap">${c.media?`<iframe src="${escapeHtml(c.media)}" loading="lazy" allowfullscreen></iframe>`:""}</div>${text}${button}</section>`;
  if(block.type === "gallery") return `<section class="builder-public-block builder-public-gallery" style="${baseStyle}"${attrs}>${title}${text}<div class="builder-public-gallery-grid">${items.map(it=>`<figure>${it.src?`<img src="${escapeHtml(it.src)}" alt="${escapeHtml(it.caption||it.title||'')}"/>`:""}<figcaption>${escapeHtml(it.caption||it.title||"")}</figcaption></figure>`).join("")}</div>${button}</section>`;
  if(block.type === "button") return `<section class="builder-public-block builder-public-cta" style="${baseStyle}"${attrs}>${title}${text}${button}</section>`;
  if(block.type === "grid") return `<section class="builder-public-block builder-public-grid-block" style="${baseStyle}"${attrs}>${title}${text}<div class="builder-public-grid" style="grid-template-columns:repeat(${Math.max(1, Number(st.columns||3)||3)},1fr);gap:${escapeHtml(st.gap||'8px')}">${items.map(it=>`<article><h3>${escapeHtml(it.title||'Item')}</h3><p>${escapeHtml(it.text||it.caption||'')}</p>${it.url?`<a href="${escapeHtml(it.url)}">Abrir</a>`:""}</article>`).join("")}</div>${button}</section>`;
  if(["articles","stations","products","hosts"].includes(block.type)) return `<section class="builder-public-block builder-public-cms" style="${baseStyle}"${attrs}>${title || `<h2>${escapeHtml(block.type)}</h2>`}${text}<p class="builder-public-muted">Este bloco puxa ${escapeHtml(block.type)} no site público.</p>${button}</section>`;
  if(block.type === "membership") return `<section class="builder-public-block builder-public-membership" style="${baseStyle}"${attrs}>${title || "<h2>Membership</h2>"}${text}${button || `<button class="membership-approved-open builder-public-button" type="button">Abrir membership</button>`}</section>`;
  if(block.type === "spacer") return `<div class="builder-public-spacer" style="height:${escapeHtml(st.minHeight||'48px')};${baseStyle}"${attrs}></div>`;
  if(block.type === "html") return `<section class="builder-public-block builder-public-html" style="${baseStyle}"${attrs}>${c.html || ""}</section>`;
  return `<section class="builder-public-block builder-public-text" style="${baseStyle}"${attrs}>${title}${text}${button}</section>`;
}
function builderRenderAll(){
  const canvas=$("builderCanvas"), list=$("builderBlocksList"), jsonBox=$("builderJson"), label=$("builderEditingLabel");
  if(!canvas) return;
  const page = builderPageFromFields();
  if(label) label.textContent = `${page.title || "Página"} / ${page.status}`;
  canvas.className = `builder-canvas builder-device-${builderState.device}`;
  canvas.style.background = page.style?.background || "#000";
  canvas.style.color = page.style?.color || "#fff";
  canvas.innerHTML = `<div class="builder-page-frame" style="max-width:${escapeHtml(page.style?.maxWidth||'1280px')}">${builderState.blocks.map(b=>builderRenderBlock(b,true)).join("") || `<div class="builder-empty">Adicione o primeiro bloco.</div>`}</div>`;
  if(list) list.innerHTML = builderState.blocks.map((b,i)=>`<article class="builder-layer ${builderState.selectedBlockId===b.id?'active':''}" data-layer-id="${escapeHtml(b.id)}"><small>${i+1}. ${escapeHtml(b.type)}</small><b>${escapeHtml(b.label||b.content?.title||'Bloco')}</b><div class="row"><button class="ghost" data-builder-edit="${escapeHtml(b.id)}">Editar</button><button class="ghost" data-builder-up="${escapeHtml(b.id)}">↑</button><button class="ghost" data-builder-down="${escapeHtml(b.id)}">↓</button><button class="ghost" data-builder-copy="${escapeHtml(b.id)}">Duplicar</button><button class="danger" data-builder-remove="${escapeHtml(b.id)}">Excluir</button></div></article>`).join("") || `<p class="note">Nenhum bloco nesta página.</p>`;
  if(jsonBox) jsonBox.value = JSON.stringify(page,null,2);
}
async function loadBuilderPages(){
  const select=$("builderPageSelect"); if(!select) return;
  try{
    const snap = await getDocs(collection(db, BUILDER_COLLECTION));
    builderState.pages = snap.docs.map(d=>({id:d.id,...d.data()}));
    select.innerHTML = builderState.pages.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.title || p.id)} — ${escapeHtml(p.status || 'draft')}</option>`).join("");
    builderUpdatePageTargetOptions();
    if(builderState.pages.length && !builderState.currentPage) builderFillPage(builderState.pages[0]);
    if(!builderState.pages.length){ const page=builderDefaultPage(); builderFillPage(page); select.innerHTML = `<option value="${escapeHtml(page.id)}">${escapeHtml(page.title)} — draft</option>`; builderUpdatePageTargetOptions(); }
  }catch(e){
    console.error("Builder load failed", e);
    const page = builderDefaultPage();
    builderFillPage(page);
    select.innerHTML = `<option value="${escapeHtml(page.id)}">${escapeHtml(page.title)} — local</option>`;
    toast("Website Builder abriu em modo local. Publique firestore.rules para carregar/salvar no Firestore.", "error");
  }
}
async function saveBuilderPage(){
  const page=builderPageFromFields();
  if(!page.id){ toast("Informe um ID para a página.","error"); return; }
  await setDoc(doc(db, BUILDER_COLLECTION, page.id), {...page, blocks: builderState.blocks, updatedAt: serverTimestamp()}, {merge:true});
  await logAction("save", BUILDER_COLLECTION, {id:page.id, blocks:builderState.blocks.length});
  builderState.currentPage = page;
  toast("Página salva no Website Builder.");
  await loadBuilderPages();
}
async function deleteBuilderPage(){
  const id=builderVal("builder_pageId");
  if(!id || !confirm("Excluir esta página do Website Builder?")) return;
  await deleteDoc(doc(db, BUILDER_COLLECTION, id));
  await logAction("delete", BUILDER_COLLECTION, {id});
  builderState.currentPage=null; builderState.blocks=[]; builderFillPage(builderDefaultPage()); await loadBuilderPages(); toast("Página excluída.");
}
function setupBuilder(){
  if(!$("websiteBuilderPanel")) return;
  $("builderNewPageBtn")?.addEventListener("click",()=>builderFillPage({...builderDefaultPage(), id:`page-${Date.now()}`, slug:`page-${Date.now()}`, title:"Nova página", blocks:[]}));
  $("builderCreateHomeBtn")?.addEventListener("click",()=>{ builderFillPage(builderTemplateHomePage()); toast("Template Home carregado. Ajuste e clique em Salvar/Publicar."); });
  $("builderCreateMemberBtn")?.addEventListener("click",()=>{ builderFillPage(builderTemplateMemberPage()); toast("Template Member Area carregado. Ajuste e clique em Salvar/Publicar."); });
  $("builderLoadPagesBtn")?.addEventListener("click",loadBuilderPages);
  $("builderSavePageBtn")?.addEventListener("click",saveBuilderPage);
  $("builderDeletePageBtn")?.addEventListener("click",deleteBuilderPage);
  $("builderPageSelect")?.addEventListener("change", async e=>{ const id=e.target.value; const snap=await getDoc(doc(db,BUILDER_COLLECTION,id)); if(snap.exists()) builderFillPage({id:snap.id,...snap.data()}); });
  $("builderAddBlockBtn")?.addEventListener("click",()=>{ builderState.blocks.push(builderBlockFromFields()); builderClearBlockFields(); builderRenderAll(); });
  $("builderUpdateBlockBtn")?.addEventListener("click",()=>{ if(!builderState.selectedBlockId){ toast("Selecione um bloco para atualizar.","error"); return; } const idx=builderState.blocks.findIndex(b=>b.id===builderState.selectedBlockId); if(idx>=0) builderState.blocks[idx]=builderBlockFromFields(builderState.selectedBlockId); builderRenderAll(); });
  $("builderClearBlockBtn")?.addEventListener("click",()=>{ builderClearBlockFields(); builderRenderAll(); });
  $("builderImportJsonBtn")?.addEventListener("click",()=>{ try{ const p=JSON.parse(builderVal("builderJson")); builderFillPage(p); toast("JSON aplicado no editor. Clique em Salvar para publicar."); }catch(e){ toast("JSON inválido.","error"); } });
  $("builderExportBtn")?.addEventListener("click",async()=>{ try{ await navigator.clipboard.writeText(builderVal("builderJson")); toast("JSON copiado."); }catch{ toast("Copie manualmente pelo campo JSON."); } });
  document.querySelectorAll("[data-builder-device]").forEach(btn=>btn.onclick=()=>{ builderState.device=btn.dataset.builderDevice; builderRenderAll(); });
  ["builder_pageId","builder_title","builder_slug","builder_status","builder_showInNav","builder_replaceSite","builder_description","builder_bg","builder_color","builder_maxWidth","builder_blockType","builder_blockLabel","builder_blockTitle","builder_blockText","builder_blockMedia","builder_blockAlt","builder_blockButtonLabel","builder_blockButtonUrl","builder_buttonAction","builder_buttonPageTarget","builder_buttonSection","builder_buttonNewTab","builder_buttonRel","builder_buttonClass","builder_styleBackground","builder_styleColor","builder_styleAlign","builder_stylePadding","builder_styleMargin","builder_styleMinHeight","builder_styleFontSize","builder_styleRadius","builder_styleBorder","builder_styleColumns","builder_styleGap","builder_styleMaxWidth","builder_styleDisplay","builder_styleJustify","builder_styleAlignItems","builder_styleWidth","builder_styleHeight","builder_styleOpacity","builder_styleShadow","builder_styleTransform","builder_styleZIndex"].forEach(id=>$(id)?.addEventListener("input",builderRenderAll));
  document.addEventListener("click", event=>{
    const edit=event.target.closest?.("[data-builder-edit],[data-builder-remove],[data-builder-copy],[data-builder-up],[data-builder-down],[data-builder-block]");
    if(!edit) return;
    const id=edit.dataset.builderEdit || edit.dataset.builderRemove || edit.dataset.builderCopy || edit.dataset.builderUp || edit.dataset.builderDown || edit.dataset.builderBlock;
    const idx=builderState.blocks.findIndex(b=>b.id===id); if(idx<0) return;
    if(edit.dataset.builderRemove){ if(confirm("Excluir bloco?")){ builderState.blocks.splice(idx,1); builderRenderAll(); } return; }
    if(edit.dataset.builderCopy){ const copy=structuredClone(builderState.blocks[idx]); copy.id=crypto.randomUUID(); copy.label=(copy.label||"Bloco")+" copy"; builderState.blocks.splice(idx+1,0,copy); builderRenderAll(); return; }
    if(edit.dataset.builderUp){ if(idx>0){ [builderState.blocks[idx-1],builderState.blocks[idx]]=[builderState.blocks[idx],builderState.blocks[idx-1]]; builderRenderAll(); } return; }
    if(edit.dataset.builderDown){ if(idx<builderState.blocks.length-1){ [builderState.blocks[idx+1],builderState.blocks[idx]]=[builderState.blocks[idx],builderState.blocks[idx+1]]; builderRenderAll(); } return; }
    builderFillBlockFields(builderState.blocks[idx]); builderRenderAll();
  });
  if(!builderState.currentPage) builderFillPage(builderDefaultPage());
}

function activateTab(name){ document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab === name)); document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden")); const panel = $(`${name}Panel`); if(panel) panel.classList.remove("hidden"); }
function bootAdmin(){ if(!panelsBuilt) buildPanels(); document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => { activateTab(btn.dataset.tab); document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); const scrollTarget = btn.dataset.tabScroll; if(scrollTarget){ setTimeout(()=>{ const el = $(scrollTarget); if(el){ el.scrollIntoView({behavior:"smooth", block:"center"}); el.classList.add("tab-flash"); setTimeout(()=>el.classList.remove("tab-flash"), 1600); } }, 120); } }); activateTab(document.querySelector(".tab.active")?.dataset.tab || "dashboardHome"); const tf = $("tabFilter"); if(tf && !tf.dataset.bound){ tf.dataset.bound = "1"; const tc = $("tabCount"); const paint = () => { const q = tf.value.trim().toLowerCase(); let n = 0; document.querySelectorAll(".tab").forEach(b=>{ const show = !q || b.textContent.toLowerCase().includes(q); b.style.display = show ? "" : "none"; if(show) n++; }); if(tc) tc.textContent = n + " aba(s)"; }; tf.addEventListener("input", paint); paint(); } }


// ADMIN ACCESS CONTROL — libera somente usuários com role admin no Firestore
// Para adicionar novos admins: Authentication cria o usuário + Firestore/users/{UID} com role: "admin".
const ADMIN_EMAILS = [
  "aura1000x@gmail.com",
  "cyberisde4d@gmail.com",
  "cyberisdead4d@gmail.com",
  "cyberisdead2015@gmail.com",
  "luankeditor@gmail.com"
];
function normalizeEmail(email){
  return String(email || "").trim().toLowerCase();
}
function userDocIsAdmin(data){
  if(!data) return false;
  const role = String(data.role || data.userRole || data.type || "").trim().toLowerCase();
  const email = normalizeEmail(data.email);
  return role === "admin"
    || data.isAdmin === true
    || data.admin === true
    || data.owner === true
    || ADMIN_EMAILS.includes(email);
}

async function getUserRole(user){

  if(!user) return null;

  console.log("LOGIN USER:", user.uid, user.email);

  if(ADMIN_EMAILS.includes(normalizeEmail(user.email))){
    return "admin";
  }

  const ids = [user.uid, user.email].filter(Boolean);

  const collectionsToCheck = ["users", "admins", "profiles"];

  for(const collectionName of collectionsToCheck){

    for(const id of ids){

      try{

        const snap = await getDoc(doc(db, collectionName, id));

        if(snap.exists()){

          const data = snap.data();

          console.log("USUARIO ENCONTRADO:", collectionName, id, data);

          const role = String(
            data.role || data.userRole || data.type || ""
          ).trim().toLowerCase();

          if(role === "admin") return "admin";

          if(role === "host") return "host";

        }

      }catch(error){

        console.warn(
          "Role check failed:",
          collectionName,
          id,
          error
        );

      }

    }

  }

  return null;

}

async function isAllowedAdmin(user){
  if(!user) return false;
  if(ADMIN_EMAILS.includes(normalizeEmail(user.email))) return true;

  

  const ids = [user.uid, user.email].filter(Boolean);
  const collectionsToCheck = ["users", "admins", "profiles"];
  for(const collectionName of collectionsToCheck){
    for(const id of ids){
      try{
        const snap = await getDoc(doc(db, collectionName, id));
        if(snap.exists() && userDocIsAdmin(snap.data())) return true;
      }catch(error){
        console.warn("Admin permission check failed:", collectionName, id, error);
      }
    }
  }
  return false;
}
function setAdminUi(isAllowed){
  $("loginScreen")?.classList.toggle("hidden", !!isAllowed);
  $("dashboard")?.classList.toggle("hidden", !isAllowed);
}

const loginBtn = $("loginBtn"), logoutBtn = $("logoutBtn"), loginMessage = $("loginMessage"), openMemberAreaBtn = $("openMemberAreaBtn");

function markMemberAreaAdminPreview(){
  localStorage.setItem("cyberisdead_admin", "true");
  localStorage.setItem("cyberisdead_is_admin", "true");
  localStorage.setItem("cyberisdead_user_role", "admin");
  localStorage.setItem("cyberisdead_subscription_active", "true");
  localStorage.setItem("cyberisdead_member_preview_from_admin", "true");
  localStorage.setItem("cyberisdead_member_preview_email", currentUser?.email || "admin");
}
function openMemberAreaAsAdmin(event){
  if(!currentUser){
    event?.preventDefault?.();
    toast("Faça login como admin antes de abrir a Member Area.", "error");
    return;
  }
  markMemberAreaAdminPreview();
  const url = "./member-area.html?adminPreview=1";
  const opened = window.open(url, "_blank", "noopener");
  if(!opened){
    window.location.href = url;
  }
}
if(openMemberAreaBtn){
  openMemberAreaBtn.addEventListener("click", (event) => {
    if(!currentUser){
      event.preventDefault();
      toast("Faça login como admin antes de abrir a Member Area.", "error");
      return;
    }
    markMemberAreaAdminPreview();
  });
}
document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("#dashboardMemberAreaBtn,[data-open-member-area]");
  if(!trigger) return;
  event.preventDefault();
  openMemberAreaAsAdmin(event);
});

if(loginBtn){ loginBtn.onclick = async () => { if(loginMessage) loginMessage.textContent = "Entrando..."; const email = String($("email")?.value || "").trim(); const password = String($("password")?.value || ""); if(!email || !password){ if(loginMessage) loginMessage.textContent = "Preencha email e senha."; return; } try { await signInWithEmailAndPassword(auth, email, password); if(loginMessage) loginMessage.textContent = "Login realizado."; } catch(e){ console.error("Erro no login:", e); if(loginMessage) loginMessage.textContent = e?.message || "Erro ao entrar."; } }; }
if(logoutBtn){ logoutBtn.onclick = async () => { await logAction("logout","auth"); return signOut(auth); }; }
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  setAdminUi(false);
  if(!user) return;

  try{
    const role = await getUserRole(user);

if(!role){
  localStorage.removeItem("cyberisdead_admin");
  localStorage.removeItem("cyberisdead_is_admin");
  localStorage.removeItem("cyberisdead_user_role");

  if(loginMessage) loginMessage.textContent = "Usuário sem permissão.";
  await signOut(auth);
  return;
}

localStorage.setItem("cyberisdead_user_role", role);

if(role === "host"){
  window.location.href = "../host-admin/index.html";
  return;
}

    localStorage.setItem("cyberisdead_admin", "true");
    localStorage.setItem("cyberisdead_is_admin", "true");
    localStorage.setItem("cyberisdead_user_role", "admin");
    if($("adminUserEmail")) $("adminUserEmail").textContent = user.email || "";
    if($("statusbarUser")) $("statusbarUser").textContent = user.email || "admin";
    setAdminUi(true);
    bootAdmin();
    await logAction("login","auth");
    try{
      await refreshAll();
    }catch(refreshError){
      console.warn("Admin entrou, mas algum painel não carregou:", refreshError);
      if(loginMessage) loginMessage.textContent = "Login realizado. Alguns painéis podem precisar de regras atualizadas.";
      toast("Login OK. Se algum painel falhar, publique firestore:rules.", "error");
    }
  }catch(e){
    console.error("Erro ao validar/carregar admin:", e);
    setAdminUi(false);
    if(loginMessage) loginMessage.textContent = "Erro ao validar permissão de admin. Confira se seu email está em ADMIN_EMAILS e se firestore:rules foi publicado.";
    toast("Erro ao validar permissão de admin.", "error");
  }
});

async function refreshAll(){ await Promise.all([loadDashboard(), ...COLLECTIONS.map(c=>loadList(c)), loadSettings(), loadSiteMeta(), loadSiteTexts(), loadShare(), loadTheme(), loadCart(), loadHomeButtons(), loadHeaderButtons(), loadArchiveTags(), loadInfoCards(), loadAccess(), loadMembership(), loadHomepage(), loadLive(), loadOrderTab(), loadMemberContentList(), loadMemberCalendarList(), loadMemberComments(), loadMediaLibrary(), loadLogs(), loadBuilderPages()]); }
async function loadDashboard(){ const box=$("dashboardStats"); const recent=$("dashboardRecent"); if(!box) return; const counts={}; for(const c of COLLECTIONS){ try{ const snap=await getDocs(collection(db,c)); counts[c]=snap.size; }catch{ counts[c]="?"; } } box.innerHTML = `<button class="stat" data-tab-jump="articles"><b>${counts.articles}</b><span>Artigos</span></button><button class="stat" data-tab-jump="stations"><b>${counts.stations}</b><span>Episódios</span></button><button class="stat" data-tab-jump="products"><b>${counts.products}</b><span>Produtos</span></button><button class="stat" data-tab-jump="hosts"><b>${counts.hosts}</b><span>Hosts</span></button>`; if(recent) recent.innerHTML = `<article class="card"><h3>Status Firebase</h3><p>Login ativo: ${escapeHtml(currentUser?.email || "")}</p><span class="badge">Firestore conectado</span></article><article class="card"><h3>Visualizar Member Area</h3><p>Abre a área de membros com acesso de admin, sem liberar para usuários comuns.</p><div class="row"><a id="dashboardMemberAreaBtn" class="admin-member-link" data-open-member-area href="./member-area.html?adminPreview=1" target="_blank" rel="noopener">Ver Member Area</a></div></article><article class="card"><h3>Próximos passos</h3><p>Use Mídia para uploads, Backup para exportar dados e Logs para auditoria.</p></article>`; }
function viewUrlFor(c, item, id){
  if(c==="stations") return `/radio#episode-${encodeURIComponent(id)}`;
  if(c==="hosts") return `/radio#host-${encodeURIComponent(id)}`;
  if(c==="articles"){ const s=String(item.slug||item.title||id).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); return `/#article-${s}`; }
  if(c==="products") return `/#product-${encodeURIComponent(id)}`;
  return null;
}
async function loadList(c, term=""){ const box = $(`${c}List`); if(!box) return; box.innerHTML = "Carregando..."; try{ const snap = await getDocs(collection(db,c)); 
const cards=[];
const docs = snap.docs.sort((a,b)=>{
  const da = a.data().createdAt?.seconds || 0;
  const db = b.data().createdAt?.seconds || 0;
  return db - da;
});
docs.forEach(d => { const item = d.data(); const text = `${d.id} ${item.title||""} ${item.name||""} ${item.excerpt||""} ${item.desc||""} ${item.bio||""} ${item.type||""} ${item.series||""} ${(item.genres||[]).join(" ")}`.toLowerCase(); if(term && !text.includes(term.toLowerCase())) return; const status = String(item.status||"published"); const badge = status === "published" ? `<span class="badge">PUBLICADO</span>` : status === "draft" ? `<span class="badge">RASCUNHO</span>` : `<span class="badge">${escapeHtml(status.toUpperCase())}</span>`; const view = viewUrlFor(c,item,d.id); cards.push(`<article class="card"><small>${escapeHtml(d.id)}</small><h3>${escapeHtml(item.title || item.name || item.id || "Sem título")}</h3><p>${escapeHtml(item.excerpt || item.desc || item.bio || item.type || "")}</p><p>${badge}${item.series?` <span class="badge">SÉRIE: ${escapeHtml(item.series)}</span>`:""}</p><div class="row"><button class="ghost" data-edit="${c}:${d.id}">Editar</button><button class="ghost" data-toggle="${c}:${d.id}">${status==="published"?"Despublicar":"Publicar"}</button><button class="ghost" data-clone="${c}:${d.id}">Duplicar</button>${view?`<a class="ghost" href="${escapeHtml(view)}" target="_blank" rel="noopener">Ver no site</a>`:""}<button class="danger" data-del="${c}:${d.id}">Excluir</button></div></article>`); }); const countEl = $(`${c}Count`); if(countEl) countEl.textContent = cards.length ? `${cards.length} item(ns)` : ""; box.innerHTML = cards.join("") || `<p class="note">Nenhum item salvo ainda.</p>`; document.querySelectorAll(`[data-edit^='${c}:']`).forEach(b => b.onclick = () => editItem(c,b.dataset.edit.split(":")[1])); document.querySelectorAll(`[data-del^='${c}:']`).forEach(b => b.onclick = () => delItem(c,b.dataset.del.split(":")[1])); document.querySelectorAll(`[data-toggle^='${c}:']`).forEach(b => b.onclick = () => toggleStatus(c,b.dataset.toggle.split(":")[1])); document.querySelectorAll(`[data-clone^='${c}:']`).forEach(b => b.onclick = () => cloneItem(c,b.dataset.clone.split(":")[1])); if(c==="stations") refreshSeriesDatalist(); }catch(e){ box.innerHTML = `<p class="error">Erro ao carregar: ${escapeHtml(e.message)}</p>`; } }

const normGenreKeyAdmin = (g) => String(g || "").trim().toLowerCase();
const uniqGenresAdmin = (arr) => { const seen = new Map(); (Array.isArray(arr) ? arr : []).forEach(g => { const k = normGenreKeyAdmin(g); if(k && !seen.has(k)) seen.set(k, String(g).trim()); }); return [...seen.values()]; };
function getPayload(c){
  if(c==="articles") {
    const advancedMedia = normalizeAdvancedMedia(jsonSafe($("articles_media").value,[]));
    const scans = mediaLines($("articles_scans")?.value || "", "scan");
    const thumbnails = lines($("articles_thumbnails")?.value || "");
    const embedUrl = $("articles_embedUrl").value.trim();
    const title=$("articles_title").value;
    const seo = { title: $("articles_seoTitle")?.value || title, description: $("articles_seoDescription")?.value || $("articles_excerpt")?.value || "", image: $("articles_seoImage")?.value || $("articles_cover")?.value || "" };
    const flipbook = { enabled: $("articles_flipbookEnabled")?.value || "auto", mode: $("articles_flipbookMode")?.value || "horizontal", pageTurn: $("articles_flipbookPageTurn")?.value || "on", swipe: $("articles_flipbookSwipe")?.value || "on", zoom: $("articles_flipbookZoom")?.value || "on", fullscreen: $("articles_flipbookFullscreen")?.value || "on", thumbnails: $("articles_flipbookThumbnails")?.value || "on", lazy: $("articles_flipbookLazy")?.value || "on", preload: Number($("articles_flipbookPreload")?.value || 2) || 0, pages: scans, thumbnailPages: thumbnails };
    const articleSettings = { mediaGap: $("articles_mediaGap")?.value || "", textStyle: $("articles_textStyle")?.value || "default", iframeResponsive: $("articles_iframeResponsive")?.value || "on", imageLightbox: $("articles_imageLightbox")?.value || "on", galleryMode: $("articles_galleryMode")?.value || "off", embedAutoplay: $("articles_embedAutoplay")?.value || "off", mediaTransition: $("articles_mediaTransition")?.value || "fade" };
    return {
      title,
      subtitle: $("articles_subtitle")?.value || "",
      kicker: $("articles_kicker")?.value || "",
      category:$("articles_category").value, year:$("articles_year").value, date:$("articles_date").value, issue: $("articles_issue")?.value || "",
      author: $("articles_author")?.value || "", mainAuthor: $("articles_mainAuthor")?.value || "", readingTime: $("articles_readingTime")?.value || "",
      contributors: contributorLines($("articles_contributors")?.value || ""), credits: $("articles_credits")?.value || "", tags: csv($("articles_tags")?.value || ""), featured: boolField("articles_featured", false),
      excerpt:$("articles_excerpt").value, color:$("articles_color").value, cover:$("articles_cover").value, embedUrl, slug:$("articles_slug").value || slug(title), hosts:csv($("articles_hosts").value),
      status:$("articles_status").value || "published", access:$("articles_access").value || "public", lockedMessage:$("articles_lockedMessage").value, body:lines($("articles_body").value),
      popupImages:[], popupEmbeds:[], media:advancedMedia,
      scans, pages: scans, thumbnails, scanArchiveUrl: $("articles_scanArchiveUrl")?.value || "", extraLink: $("articles_extraLink")?.value || "", seo, flipbook, articleSettings, updatedAt:serverTimestamp()
    };
  }
  if(c==="stations") { const cover=$("stations_cover").value.trim(); const bgUrl=$("stations_background").value.trim() || cover; const bgType=String($("stations_backgroundType").value || "image").toLowerCase().includes("video") ? "video" : "image"; return { id:$("stations_id").value, series:$("stations_series").value.trim(), hostId:$("stations_hostId").value, relatedHosts:csv($("stations_relatedHosts").value), status:$("stations_status").value || "published", access:$("stations_access").value || "public", lockedMessage:$("stations_lockedMessage").value, title:$("stations_title").value, kicker:$("stations_kicker").value, name:$("stations_name").value, type:$("stations_type").value, featured:$("stations_featured")?.checked || false, featuredOrder:Number($("stations_featuredOrder")?.value || 0), desc:$("stations_desc").value, audio:$("stations_audio").value, video:$("stations_video").value, cover, background:{type:bgType, src:bgUrl}, backgroundUrl:bgUrl, backgroundType:bgType, genres:uniqGenresAdmin(csv($("stations_genres").value)), tracklist:lines($("stations_tracklist").value), episodeDescription:$("stations_episodeDescription").value, links:jsonSafe($("stations_links").value,[]), updatedAt:serverTimestamp() }; }
  if(c==="products") { const name=$("products_name").value.trim(); const id=($("products_id").value || slug(name || "produto")).trim(); return { id, name, type:$("products_type").value, price:Number(String($("products_price").value || "0").replace(",",".")) || 0, desc:$("products_desc").value, color:$("products_color").value, images:splitMediaList($("products_images").value), checkoutUrl:$("products_checkoutUrl").value, status:$("products_status").value || "published", access:$("products_access").value || "public", lockedMessage:$("products_lockedMessage").value, updatedAt:serverTimestamp() }; }
  if(c==="hosts") return { id:$("hosts_id").value, name:$("hosts_name").value, photo:$("hosts_photo").value, bio:$("hosts_bio").value, episodes:csv($("hosts_episodes").value), socials:jsonSafe($("hosts_socials").value,[]), updatedAt:serverTimestamp() };
}
async function saveItem(c){
  try{
    const data = getPayload(c);
    
    if(c==="stations" && !editing[c]){
    data.createdAt = serverTimestamp();
  }

    const id = editing[c] || data.id || `${slug(data.title || data.name)}-${Date.now()}`;if(id) await setDoc(doc(db,c,id), data, {merge:true}); else await addDoc(collection(db,c), data); await logAction("save",c,{id}); editing[c]=null; clearForm(c); await loadList(c); await loadDashboard(); toast("Salvo no Firestore.");
  }catch(e){
    console.error("saveItem failed", e);
    if(e?.message !== "invalid json") toast(`Erro ao salvar: ${e?.message || e}`, "error");
  }
}
async function editItem(c,id){ const s = await getDoc(doc(db,c,id)); if(!s.exists()) return; editing[c]=id; const x=s.data(); Object.entries(x).forEach(([k,v])=>{ const el=$(`${c}_${k}`); if(!el) return; if(el.type === "checkbox"){ el.checked = Boolean(v); return; } el.value = Array.isArray(v) ? v.join(k==="tracklist"||k==="body"?"\n":", ") : typeof v === "object" ? JSON.stringify(v,null,2) : v; }); if(c==="stations"){ if(x.background){ $("stations_background").value=x.background.src||""; $("stations_backgroundType").value=x.background.type||"image"; } const feat=$("stations_featured"); if(feat) feat.checked = Boolean(x.featured); } if(c==="articles"){
    if($("articles_contributors")) $("articles_contributors").value = contributorsToText(x.contributors);
    if($("articles_tags")) $("articles_tags").value = Array.isArray(x.tags) ? x.tags.join(", ") : (x.tags || "");
    if($("articles_featured")) $("articles_featured").value = String(!!x.featured);
    if($("articles_media")) $("articles_media").value = JSON.stringify(normalizeAdvancedMedia(Array.isArray(x.media) ? x.media : []),null,2);
    const scans = Array.isArray(x.scans) ? x.scans : (Array.isArray(x.pages) ? x.pages : []);
    if($("articles_scans")) $("articles_scans").value = mediaLinesToText(scans,"scan") || scans.map(p => p?.caption ? `${p.src} | ${p.caption}` : (p?.src || p)).join("\n");
    if($("articles_thumbnails")) $("articles_thumbnails").value = Array.isArray(x.thumbnails) ? x.thumbnails.join("\n") : (Array.isArray(x.flipbook?.thumbnailPages) ? x.flipbook.thumbnailPages.join("\n") : "");
    const fb=x.flipbook||{}; ["Enabled","Mode","PageTurn","Swipe","Zoom","Fullscreen","Thumbnails","Lazy","Preload"].forEach(k=>{ const el=$("articles_flipbook"+k); if(el){ const key=k.charAt(0).toLowerCase()+k.slice(1); el.value = fb[key] ?? ""; } });
    const seo=x.seo||{}; if($("articles_seoTitle")) $("articles_seoTitle").value = seo.title || x.seoTitle || ""; if($("articles_seoDescription")) $("articles_seoDescription").value = seo.description || x.seoDescription || ""; if($("articles_seoImage")) $("articles_seoImage").value = seo.image || x.seoImage || "";
    const st=x.articleSettings||{}; ["mediaGap","textStyle","iframeResponsive","imageLightbox","galleryMode","embedAutoplay","mediaTransition"].forEach(k=>{ const el=$("articles_"+k); if(el) el.value = st[k] || ""; });
  } installStationImagePreviews(); window.scrollTo({top:0,behavior:"smooth"}); }
async function delItem(c,id){ if(!confirm("Excluir este item?")) return; try{ await deleteDoc(doc(db,c,id)); await logAction("delete",c,{id}); await loadList(c); await loadDashboard(); toast("Excluído."); }catch(e){ console.error("delItem failed", e); toast(`Erro ao excluir: ${e?.message || e}`, "error"); } }
async function toggleStatus(c,id){ try{ const s = await getDoc(doc(db,c,id)); if(!s.exists()) return; const cur = String(s.data().status || "published"); const next = cur === "published" ? "draft" : "published"; await setDoc(doc(db,c,id), {status: next, updatedAt: serverTimestamp()}, {merge:true}); await logAction("status", c, {id, status: next}); await loadList(c); toast(next === "published" ? "Publicado." : "Movido para rascunho."); }catch(e){ console.error("toggleStatus failed", e); toast(`Erro ao alternar status: ${e?.message || e}`, "error"); } }
async function cloneItem(c,id){ try{ const s = await getDoc(doc(db,c,id)); if(!s.exists()) return; const x = s.data(); const base = String(x.title || x.name || id); const newId = `${slug(base)}-copy-${Date.now()}`; const {createdAt, updatedAt, ...rest} = x; await setDoc(doc(db,c,newId), {...rest, title: x.title ? `${x.title} (cópia)` : x.title, name: x.name ? `${x.name} (cópia)` : x.name, status: "draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp()}, {merge:true}); await logAction("clone", c, {from:id, to:newId}); await loadList(c); await loadDashboard(); toast("Duplicado como rascunho."); }catch(e){ console.error("cloneItem failed", e); toast(`Erro ao duplicar: ${e?.message || e}`, "error"); } }
function clearForm(c){ editing[c]=null; document.querySelectorAll(`#${c}Panel input,#${c}Panel textarea,#${c}Panel select`).forEach(el=>{ if(el.type === "checkbox"){ el.checked = false; return; } if(el.tagName === "SELECT"){ el.selectedIndex = 0; return; } el.value=""; }); if(c==="stations" || c==="articles") installStationImagePreviews(); }

async function refreshSeriesDatalist(){
  try{
    const snap = await getDocs(collection(db,"stations"));
    const seriesSet = new Map(); const genreSet = new Map();
    snap.forEach(d=>{ const x=d.data(); const s=String(x.series||"").trim(); if(s && ![...seriesSet.keys()].some(k=>k.toLowerCase()===s.toLowerCase())) seriesSet.set(s,s); (Array.isArray(x.genres)?x.genres:[]).forEach(g=>{ const v=String(g||"").trim(); const k=v.toLowerCase(); if(v && !genreSet.has(k)) genreSet.set(k,v); }); });
    const seriesSel = $("stations_seriesRenameFrom");
    if(seriesSel){ const cur = seriesSel.value; seriesSel.innerHTML = `<option value="">Selecionar série…</option>` + [...seriesSet.values()].sort((a,b)=>a.localeCompare(b)).map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(""); if(cur && [...seriesSel.options].some(o=>o.value===cur)) seriesSel.value = cur; }
    let seriesDl = $("stations_seriesList");
    if(!seriesDl){ const inp = $("stations_series"); if(inp){ seriesDl = document.createElement("datalist"); seriesDl.id = "stations_seriesList"; inp.after(seriesDl); inp.setAttribute("list","stations_seriesList"); } }
    if(seriesDl) seriesDl.innerHTML = [...seriesSet.values()].sort((a,b)=>a.localeCompare(b)).map(s=>`<option value="${escapeHtml(s)}">`).join("");
    let genreDl = $("stations_genresList");
    if(!genreDl){ const inp = $("stations_genres"); if(inp){ genreDl = document.createElement("datalist"); genreDl.id = "stations_genresList"; inp.after(genreDl); inp.setAttribute("list","stations_genresList"); } }
    if(genreDl) genreDl.innerHTML = [...genreSet.values()].sort((a,b)=>a.localeCompare(b)).map(g=>`<option value="${escapeHtml(g)}">`).join("");
  }catch(e){ console.warn("datalist refresh failed", e); }
}
async function renameSeries(){
  const from = $("stations_seriesRenameFrom")?.value || "";
  const to = String($("stations_seriesRenameTo")?.value || "").trim();
  if(!from){ toast("Selecione a série de origem.", "error"); return; }
  if(!to){ toast("Digite o novo nome da série.", "error"); return; }
  if(from === to){ toast("Os nomes são iguais.", "error"); return; }
  if(!confirm(`Renomear a série "${from}" para "${to}" em todos os episódios?`)) return;
  try{
    const snap = await getDocs(collection(db,"stations"));
    const batch = writeBatch(db);
    let n = 0;
    snap.forEach(d=>{ if(String(d.data().series||"") === from){ batch.set(doc(db,"stations",d.id), {series: to, updatedAt: serverTimestamp()}, {merge:true}); n++; } });
    if(!n){ toast("Nenhum episódio com essa série.", "error"); return; }
    await batch.commit();
    await logAction("rename-series","stations",{from,to,count:n});
    $("stations_seriesRenameTo").value = "";
    await loadList("stations"); await refreshSeriesDatalist(); await loadDashboard();
    toast(`Série renomeada em ${n} episódio(s).`);
  }catch(e){ console.error("renameSeries failed", e); toast(`Erro ao renomear: ${e?.message || e}`, "error"); }
}
function setupLinkHelper(textareaId, label){
  const ta = $(textareaId);
  if(!ta || ta.dataset.linkHelperBound) return;
  ta.dataset.linkHelperBound = "1";
  const wrap = document.createElement("div");
  wrap.className = "actions";
  wrap.innerHTML = `<button class="ghost" type="button">＋ Adicionar link</button><span class="json-status"></span>`;
  ta.after(wrap);
  const [btn, status] = [wrap.querySelector("button"), wrap.querySelector(".json-status")];
  const read = () => { try{ const v = JSON.parse(ta.value || "[]"); return Array.isArray(v) ? v : []; }catch{ return null; } };
  const paint = () => { const ok = read() !== null; status.textContent = ta.value.trim() === "" ? "vazio" : (ok ? "JSON válido" : "JSON inválido"); status.className = "json-status " + (ta.value.trim() === "" ? "" : ok ? "pill-ok" : "pill-err"); };
  btn.onclick = () => { const arr = read() || []; arr.push({label:"", url:""}); ta.value = JSON.stringify(arr, null, 2); paint(); ta.focus(); };
  ta.addEventListener("input", paint); paint();
}
async function exportCollection(c){
  try{
    toast(`Exportando ${c}...`);
    const snap = await getDocs(collection(db,c));
    const items = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const blob = new Blob([JSON.stringify({items}, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${c}-${nowFile()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 8000);
    await logAction("export", c, {count: items.length});
    toast(`${items.length} item(ns) exportado(s).`);
  }catch(e){ console.error("exportCollection failed", e); toast(`Erro ao exportar: ${e?.message || e}`, "error"); }
}
function hpRow(item, fields){
  return `<div class="hp-row" data-hp-row>${fields.map(([k,l,tp,extra])=> tp==="textarea"
    ? `<div class="field"><label>${l}</label><textarea data-hp-k="${k}">${escapeHtml(item[k]||'')}</textarea></div>`
    : `<div class="field"><label>${l}</label><input data-hp-k="${k}"${k==="series"?' list="stations_seriesList"':''} value="${escapeHtml(item[k]||'')}">${extra==="upload"?`<div class="actions" style="margin-top:6px"><input type="file" data-hp-file="${k}" accept="image/*"><button class="ghost" type="button" data-hp-upload>Enviar logo</button></div>`:""}</div>`).join('')}<div class="actions"><button class="ghost" type="button" data-hp-up>↑</button><button class="ghost" type="button" data-hp-down>↓</button><button class="danger" type="button" data-hp-del>Remover</button></div></div>`;
}
const HP_SCHEMAS = {
  hp_heroRows: [["badge","Selo (ex: LIVE NOW)"],["title","Título"],["subtitle","Subtítulo","textarea"],["image","Imagem URL"],["videoUrl","Vídeo URL"],["ctaLabel","Texto do botão"],["ctaLink","Link do botão"],["episodeId","Episódio ID (toca ao clicar, opcional)"],["durationMs","Duração deste slide em ms (vazio = padrão)"]],
  hp_mustWatchRows: [["badge","Selo (ex: UK)"],["title","Título"],["subtitle","Subtítulo"],["cover","Capa URL"],["videoUrl","Vídeo URL"],["genres","Gêneros (vírgula)"],["episodeId","Episódio ID"]],
  hp_mixtapesRows: [["title","Título"],["subtitle","Subtítulo"],["cover","Capa URL"],["audioUrl","Áudio URL"],["episodeId","Episódio ID"]],
  hp_newsRows: [["title","Título"],["category","Categoria"],["excerpt","Resumo","textarea"],["cover","Capa URL"],["date","Data"],["url","Link"]],
  hp_eventsRows: [["title","Título"],["venue","Local"],["date","Data"],["time","Horário"],["cover","Capa URL"],["url","Link"],["description","Descrição","textarea"]],
  hp_channelsRows: [["name","Nome do canal"],["badge","Selo"],["url","Link"]],
  live_stationsRows: [["series","Série (igual ao episódio)"],["title","Título exibido"],["logo","Logo URL quadrado","","upload"],["audioUrl","Áudio/stream override (opcional)"],["episodeId","Tocar episódio ID fixo (opcional)"],["order","Ordem"],["visible","Visível? true/false"]]
};
function hpGetRows(boxId){ return [...document.querySelectorAll(`#${boxId} [data-hp-row]`)].map(row=>{ const o={}; row.querySelectorAll('[data-hp-k]').forEach(el=>o[el.dataset.hpK]=el.value); return o; }); }
function hpSetRows(boxId, items){ const box=$(boxId); if(!box) return; const fields=HP_SCHEMAS[boxId]||[]; box.innerHTML=(items||[]).map(it=>hpRow(it,fields)).join('') || `<p class="note">Vazio — usa conteúdo automático do site.</p>`; }
function homepageDataFromFields(){
  return {
    liveLabel:$("hp_liveLabel")?.value||"", liveChannel:$("hp_liveChannel")?.value||"",
    mustWatchTitle:$("hp_mustWatchTitle")?.value||"", mixtapesTitle:$("hp_mixtapesTitle")?.value||"",
    newsTitle:$("hp_newsTitle")?.value||"", eventsTitle:$("hp_eventsTitle")?.value||"",
    heroConfig:{enabled:String($("hp_heroEnabled")?.value ?? "true").toLowerCase()!=="false", autoplay:String($("hp_heroAutoplay")?.value ?? "true").toLowerCase()!=="false", durationMs:Number($("hp_heroDuration")?.value || 6000) || 6000, animation:$("hp_heroAnimation")?.value||"fade", cardPos:$("hp_heroCardPos")?.value||"bottom-right", height:$("hp_heroHeight")?.value||"", heightMobile:$("hp_heroHeightMobile")?.value||"", fit:$("hp_heroFit")?.value||"cover", position:$("hp_heroPosition")?.value||""},
    hero:hpGetRows("hp_heroRows"), mustWatch:hpGetRows("hp_mustWatchRows"), mixtapes:hpGetRows("hp_mixtapesRows"),
    news:hpGetRows("hp_newsRows"), events:hpGetRows("hp_eventsRows"), channels:hpGetRows("hp_channelsRows"),
    supporter:{title:$("hp_supTitle")?.value||"", text:$("hp_supText")?.value||"", button:$("hp_supButton")?.value||"", url:$("hp_supUrl")?.value||"", image:$("hp_supImage")?.value||""},
    donate:{title:$("hp_donTitle")?.value||"", text:$("hp_donText")?.value||"", button:$("hp_donButton")?.value||"", url:$("hp_donUrl")?.value||"", image:$("hp_donImage")?.value||""},
    updatedAt:serverTimestamp()
  };
}
function fillHomepageFields(data={}){
  const set=(id,v)=>{ const el=$(id); if(el) el.value=v??""; };
  set("hp_liveLabel",data.liveLabel); set("hp_liveChannel",data.liveChannel);
  const hc = data.heroConfig || {};
  set("hp_heroEnabled", hc.enabled !== false ? "true" : "false");
  set("hp_heroAutoplay", hc.autoplay !== false ? "true" : "false");
  set("hp_heroDuration", hc.durationMs ?? 6000);
  set("hp_heroAnimation", hc.animation || "fade");
  set("hp_heroCardPos", hc.cardPos || "bottom-right");
  set("hp_heroHeight", hc.height || "");
  set("hp_heroHeightMobile", hc.heightMobile || "");
  set("hp_heroFit", hc.fit || "cover");
  set("hp_heroPosition", hc.position || "");
  set("hp_mustWatchTitle",data.mustWatchTitle); set("hp_mixtapesTitle",data.mixtapesTitle);
  set("hp_newsTitle",data.newsTitle); set("hp_eventsTitle",data.eventsTitle);
  set("hp_supTitle",data.supporter?.title); set("hp_supText",data.supporter?.text); set("hp_supButton",data.supporter?.button); set("hp_supUrl",data.supporter?.url); set("hp_supImage",data.supporter?.image);
  set("hp_donTitle",data.donate?.title); set("hp_donText",data.donate?.text); set("hp_donButton",data.donate?.button); set("hp_donUrl",data.donate?.url); set("hp_donImage",data.donate?.image);
  hpSetRows("hp_heroRows",data.hero); hpSetRows("hp_mustWatchRows",data.mustWatch); hpSetRows("hp_mixtapesRows",data.mixtapes);
  hpSetRows("hp_newsRows",data.news); hpSetRows("hp_eventsRows",data.events); hpSetRows("hp_channelsRows",data.channels);
  const prev=$("homepagePreview"); if(prev) prev.textContent=JSON.stringify({...data,updatedAt:"serverTimestamp()"},null,2);
}
async function loadHomepage(){
  if(!$("homepagePanel")) return;
  try{ const snap=await getDoc(doc(db,"settings","homepage")); fillHomepageFields(snap.exists()?snap.data():{}); }
  catch(e){ console.warn("homepage load failed", e); fillHomepageFields({}); }
}
function liveVisibleVal(v){ return !["false","0","não","nao","off","no","hide","esconder"].includes(String(v ?? "true").trim().toLowerCase()); }
function liveNormKey(v){ return String(v||"").trim().toLowerCase(); }
async function uploadLiveLogo(btn){
  const row = btn.closest("[data-hp-row]");
  if(!row) return;
  const fileInp = row.querySelector('input[type="file"][data-hp-file="logo"]');
  const urlInp = row.querySelector('[data-hp-k="logo"]');
  const file = fileInp && fileInp.files && fileInp.files[0];
  if(!file){ toast("Escolha o arquivo do logo primeiro.", "error"); return; }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Enviando…";
  try{
    const safe = String(file.name || "logo.png").replace(/[^a-zA-Z0-9.\-_]+/g, "-");
    const r = ref(storage, `live-logos/${Date.now()}-${safe}`);
    await uploadBytesResumable(r, file);
    const url = await getDownloadURL(r);
    if(urlInp) urlInp.value = url;
    await logAction("upload", "live-logos", {file: safe});
    toast("Logo no ar (Storage). Salve a linha.");
  }catch(e){
    console.error("uploadLiveLogo failed", e);
    toast("Falha no upload: " + (e?.message || e), "error");
  }
  btn.disabled = false;
  btn.textContent = orig;
}
async function previewLiveResult(){
  const box = $("livePreviewResult");
  try{
    const snap = await getDocs(collection(db,"stations"));
    const eps = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const rows = hpGetRows("live_stationsRows").map(r=>({series:String(r.series||"").trim(), title:String(r.title||"").trim(), logo:String(r.logo||"").trim(), audioUrl:String(r.audioUrl||"").trim(), episodeId:String(r.episodeId||"").trim(), order:r.order, visible:liveVisibleVal(r.visible)}));
    let savedN = 0;
    try{ const saved = await getDoc(doc(db,"settings","live")); if(saved.exists()) savedN = (saved.data().stations||[]).length; }catch(e){}
    const head = `<p class="note">Salvo no Firestore: ${savedN} linha(s) | No formulário agora: ${rows.length} linha(s).${savedN !== rows.length ? " Clique SALVAR AO VIVO para valer o formulário." : ""}</p>`;
    const fmt = (ok,txt)=>`<p class="${ok?"success":"error"}">${ok?"[OK]":"[--]"} ${escapeHtml(txt)}</p>`;
    if(!rows.length){
      const seen = new Map();
      eps.forEach(s=>{ const k=liveNormKey(s.series||s.name||""); if(k&&!seen.has(k)) seen.set(k,s); });
      box.innerHTML = head + fmt(true, `Modo automático: ${seen.size} série(s) do Firestore vão aparecer (capa do episódio). Para capa própria, preencha as linhas acima e SALVE.`) + [...seen.entries()].map(([k,s])=>fmt(true, `${s.series||s.name} → capa do episódio + toca o mais recente`)).join("");
      return;
    }
    const logoStatus = (ok,txt)=>`<p class="${ok?"success":"error"}">${ok?"[OK]":"[--]"} ${escapeHtml(txt)}</p>`;
    box.innerHTML = head + rows.map((r,i)=>{
      if(!r.series) return logoStatus(false, `Linha ${i+1} sem série — será ignorada no save.`);
      const match = eps.filter(s=>liveNormKey(s.series||s.name||"")===liveNormKey(r.series));
      const epPlay = r.episodeId ? eps.find(s=>s.id===r.episodeId) : null;
      const logo = r.logo ? "logo próprio" : (match.length ? "capa do último episódio" : "SEM CAPA");
      const play = r.audioUrl ? "stream override" : r.episodeId ? (epPlay ? `episódio ${r.episodeId}` : `ERRO: episódio ${r.episodeId} não existe`) : match.length ? "último episódio da série" : "SEM ÁUDIO";
      const ok = (match.length > 0 || r.logo) && (r.audioUrl || r.episodeId ? (r.episodeId ? !!epPlay : true) : match.length > 0);
      return logoStatus(ok, `${r.series||"?"} → ${match.length} episódio(s) na base | ${logo} | toca: ${play}`) + (r.logo ? `<p data-live-logo-check="${i}">Testando logo…</p>` : "");
    }).join("");
    rows.forEach((r,i)=>{
      if(!r.logo) return;
      const el = box.querySelector(`[data-live-logo-check="${i}"]`);
      if(!el) return;
      const variants = (()=>{
        try{
          const u = new URL(r.logo);
          if(!/(^|\.)media\.tumblr\.com$/i.test(u.hostname)) return [r.logo];
          const parts = u.pathname.split('/').filter(Boolean);
          const noSize = parts.filter(p=>!/^s\d+x\d+$/i.test(p));
          const base = `https://${u.hostname}/${noSize.join('/')}`;
          const cands = [r.logo, base];
          ['s1280x1920','s640x960','s400x600'].forEach(sz=>{ const v=[...noSize]; v.splice(2,0,sz); cands.push(`https://${u.hostname}/${v.join('/')}`); });
          return [...new Set(cands)];
        }catch(e){ return [r.logo]; }
      })();
      let vi = 0;
      const attempt = () => {
        if(vi >= variants.length){ el.className = "error"; el.textContent = `[ERRO] Logo NÃO abre em nenhuma variante (${r.series}). Reenvie a imagem.`; return; }
        const src = variants[vi++];
        let done = false;
        const fin = ok => {
          if(done) return; done = true;
          if(ok){
            el.className = "success"; el.textContent = `[OK] Logo abre (${r.series})`;
            if(src !== r.logo){
              const anyRow = [...document.querySelectorAll(`#live_stationsRows [data-hp-k="logo"]`)][i];
              if(anyRow && anyRow.value !== src){ anyRow.value = src; el.textContent += ` — URL corrigida para variante válida. SALVE.`; }
            }
          } else attempt();
        };
        try{
          const img = new Image();
          img.onload = ()=>fin(true);
          img.onerror = ()=>fin(false);
          setTimeout(()=>fin(false), 6000);
          img.src = src;
        }catch(e){ fin(false); }
      };
      attempt();
    });
  }catch(e){ box.innerHTML = `<p class="error">Erro: ${escapeHtml(e?.message || e)}</p>`; }
}
function liveDataFromFields(){
  return {
    enabled: String($("live_enabled")?.value ?? "true").toLowerCase() !== "false",
    autoplay: String($("live_autoplay")?.value ?? "true").toLowerCase() !== "false",
    stations: hpGetRows("live_stationsRows").map(r=>({series:String(r.series||"").trim(), title:String(r.title||"").trim(), logo:String(r.logo||"").trim(), audioUrl:String(r.audioUrl||"").trim(), episodeId:String(r.episodeId||"").trim(), order:Number(r.order ?? 999) || 0, visible:liveVisibleVal(r.visible)})).filter(r=>r.series),
    updatedAt: serverTimestamp()
  };
}
function fillLiveFields(data={}){
  const set=(id,v)=>{ const el=$(id); if(el) el.value=v??""; };
  set("live_enabled", data.enabled !== false ? "true" : "false");
  set("live_autoplay", data.autoplay !== false ? "true" : "false");
  const box=$("live_stationsRows");
  if(box){ box.innerHTML=(data.stations||[]).map(st=>{ const tmp=document.createElement("div"); tmp.innerHTML=hpRow({series:st.series||"",title:st.title||"",logo:st.logo||"",audioUrl:st.audioUrl||"",episodeId:st.episodeId||"",order:(st.order??""),visible:(st.visible!==false?"true":"false")}, HP_SCHEMAS.live_stationsRows); box.appendChild(tmp.firstChild); }); if(!(data.stations||[]).length) box.innerHTML=`<p class="note">Vazio — automático (todas as séries).</p>`; }
  const prev=$("livePreview"); if(prev) prev.textContent=JSON.stringify({...data,updatedAt:"serverTimestamp()"},null,2);
}
async function loadLiveOnAir(){
  const box = $("liveOnAirList");
  if(!box) return;
  box.innerHTML = `<p class="note">Carregando…</p>`;
  try{
    const [snapS, snapL] = await Promise.all([getDocs(collection(db,"stations")), getDoc(doc(db,"settings","live"))]);
    const eps = snapS.docs.map(d=>({id:d.id, ...d.data()}));
    const ovs = (snapL.exists() && Array.isArray(snapL.data().stations)) ? snapL.data().stations : [];
    const byKey = new Map(ovs.map(o=>[liveNormKey(o.series), o]));
    const groups = new Map();
    eps.forEach(s=>{ const raw=String(s.series||s.name||"").trim(); const k=liveNormKey(raw); if(!k) return; if(!groups.has(k)) groups.set(k,{key:raw, items:[]}); groups.get(k).items.push(s); });
    const normLiveNormKey = k => liveNormKey(k);
    ovs.forEach(o=>{ const k=liveNormKey(o.series); if(k && !groups.has(k)) groups.set(k, {key:String(o.series||"").trim(), items:[]}); });
    const cards = [...groups.values()].map(g=>{
      const ov = byKey.get(normLiveNormKey(g.key));
      const latest = [...g.items].sort((a,b)=>((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))[0];
      const logo = (ov && ov.logo) ? ov.logo : (latest?.cover || "");
      const title = (ov && ov.title) || g.key;
      const badge = ov ? "MANUAL" : "AUTO";
      return `<article class="card"><small>${escapeHtml(badge)} · ${g.items.length} episódio(s)</small><h3>${escapeHtml(title)}</h3>${logo?`<img src="${escapeHtml(logo)}" alt="" style="width:100%;height:90px;object-fit:cover;background:#111" onerror="this.style.display='none'">`:`<p class="note">Sem capa</p>`}<div class="row"><button class="ghost" data-live-edit-station="${escapeHtml(g.key)}">Editar</button></div></article>`;
    });
    box.innerHTML = cards.join("") || `<p class="note">Nenhuma estação no ar.</p>`;
    box.querySelectorAll("[data-live-edit-station]").forEach(b=>b.onclick=()=>liveEditStation(b.dataset.liveEditStation));
  }catch(e){ box.innerHTML = `<p class="error">Erro: ${escapeHtml(e?.message || e)}</p>`; }
}
function liveEditStation(key){
  const box = $("live_stationsRows");
  if(!box) return;
  const norm = liveNormKey(key);
  let target = [...box.querySelectorAll("[data-hp-row]")].find(row=>{
    const inp = row.querySelector('[data-hp-k="series"]');
    return inp && liveNormKey(inp.value) === norm;
  });
  if(!target){
    const tmp = document.createElement("div");
    tmp.innerHTML = hpRow({series:key, title:"", logo:"", audioUrl:"", episodeId:"", order:"", visible:"true"}, HP_SCHEMAS.live_stationsRows);
    target = tmp.firstChild;
    const empty = box.querySelector("p.note");
    if(empty) empty.remove();
    box.appendChild(target);
    toast("Linha criada — preencha e salve.");
  } else {
    toast("Linha existente localizada.");
  }
  target.scrollIntoView({behavior:"smooth", block:"center"});
  target.classList.add("tab-flash");
  setTimeout(()=>target.classList.remove("tab-flash"), 1600);
}
async function loadLive(){
  if(!$("livePanel")) return;
  try{ const snap=await getDoc(doc(db,"settings","live")); fillLiveFields(snap.exists()?snap.data():{}); }
  catch(e){ console.warn("live load failed", e); fillLiveFields({}); }
  loadLiveOnAir();
}
async function saveLive(){
  const data=liveDataFromFields();
  await setDoc(doc(db,"settings","live"), data, {merge:true});
  await logAction("save","settings/live");
  fillLiveFields({...data, updatedAt:"serverTimestamp()"});
  loadLiveOnAir();
  toast("Ao Vivo salvo.");
}
async function saveHomepage(){
  const data=homepageDataFromFields();
  await setDoc(doc(db,"settings","homepage"), data, {merge:true});
  await logAction("save","settings/homepage");
  fillHomepageFields({...data, updatedAt:"serverTimestamp()"});
  toast("Homepage salva.");
}
function customSectionRow(def={}){
  const id = def.id || `custom-${Date.now()}`;
  const g = k => escapeHtml(def[k] || '');
  const kind = def.kind || 'texto';
  return `<div class="ord-row csec-row" draggable="true" data-order-id="${escapeHtml(id)}" data-custom="1"><span class="ord-grip">☰</span><span class="ord-copy" style="grid-column:1/-1"><strong>NOVA SEÇÃO · ${escapeHtml(def.title||id)}</strong><small>id: ${escapeHtml(id)}</small></span>
  <div class="field"><label>ID</label><input data-csec-k="id" value="${escapeHtml(id)}"></div>
  <div class="field"><label>Título</label><input data-csec-k="title" value="${g('title')}"></div>
  <div class="field"><label>Subtítulo</label><input data-csec-k="subtitle" value="${g('subtitle')}"></div>
  <div class="field"><label>Tipo: texto, banner, hero, episodios ou links</label><input data-csec-k="kind" list="csecKinds" value="${escapeHtml(kind)}"></div>
  <div class="field"><label>Imagem URL</label><input data-csec-k="image" value="${g('image')}"></div>
  <div class="field"><label>Texto (um parágrafo por linha)</label><textarea data-csec-k="text">${g('text')}</textarea></div>
  <div class="field"><label>Botão texto</label><input data-csec-k="linkLabel" value="${g('linkLabel')}"></div>
  <div class="field"><label>Botão link</label><input data-csec-k="linkUrl" value="${g('linkUrl')}"></div>
  <div class="field"><label>Episódio ID (toca ao clicar, p/ hero)</label><input data-csec-k="episodeId" value="${g('episodeId')}"></div>
  <div class="field"><label>Itens (IDs de episódio ou Rótulo | URL por linha)</label><textarea data-csec-k="items">${g('items')}</textarea></div>
  <span class="ord-actions" style="grid-column:1/-1"><button class="ghost" type="button" data-sec-hide="${escapeHtml(id)}">Ocultar</button><button class="ghost" type="button" data-ord-up>↑</button><button class="ghost" type="button" data-ord-down>↓</button><button class="danger" type="button" data-csec-del>Excluir seção</button></span></div>`;
}
function orderRow(id, thumb, title, sub, extra){
  return `<div class="ord-row" draggable="true" data-order-id="${escapeHtml(id)}"><span class="ord-grip">☰</span>${thumb?`<span class="ord-thumb" style="background-image:url('${escapeHtml(thumb)}')"></span>`:`<span class="ord-thumb"></span>`}<span class="ord-copy"><strong>${escapeHtml(title||id)}</strong><small>${escapeHtml(sub||'')}</small></span><span class="ord-actions">${extra||''}<button class="ghost" type="button" data-ord-up>↑</button><button class="ghost" type="button" data-ord-down>↓</button></span></div>`;
}
function orderReadIds(boxId){ return [...document.querySelectorAll(`#${boxId} [data-order-id]`)].map(el=>el.dataset.orderId); }
const ORDER_SECTIONS = [["spotlight","Spotlight / Hero"],["latest","Latest / Archive"],["index","Index"],["mustwatch","Stations (Must Watch)"],["radio","DJ Mixes (Schedule)"],["shop","Shop"],["about","About"],["hpBanners","Banners"],["channelsStrip","Channels"]];
async function loadOrderTab(){
  try{
    const [snapS, snapA, snapO] = await Promise.all([getDocs(collection(db,"stations")), getDocs(collection(db,"articles")), getDoc(doc(db,"settings","order"))]);
    const saved = snapO.exists() ? snapO.data() : {};
    const eps = snapS.docs.map(d=>({id:d.id, ...d.data()}));
    const arts = snapA.docs.map(d=>({id:d.id, ...d.data()}));
    const artById = new Map(arts.map(a=>[a.id, a]));
    const artOrder = Array.isArray(saved.articleOrder) ? saved.articleOrder.filter(id=>artById.has(id)) : [];
    artOrder.push(...arts.map(a=>a.id).filter(id=>!artOrder.includes(id)));
    const ab = $("orderArticles");
    if(ab) ab.innerHTML = artOrder.map(id=>{ const x = artById.get(id); return orderRow(id, x.cover||"", x.title||id, `${x.category||""}`, `<button class="ghost" type="button" data-order-edit="articles:${escapeHtml(id)}">Editar</button>`); }).join("") || `<p class="note">Sem matérias.</p>`;
    const byId = new Map(eps.map(e=>[e.id, e]));
    const epOrder = Array.isArray(saved.stationOrder) ? saved.stationOrder.filter(id=>byId.has(id)) : [];
    epOrder.push(...eps.map(e=>e.id).filter(id=>!epOrder.includes(id)));
    const eb = $("orderEpisodes");
    if(eb) eb.innerHTML = epOrder.map(id=>{ const x = byId.get(id); const feat = x.featured ? " · FIXADO" : ""; return orderRow(id, x.cover||"", x.name||x.title||id, `${x.series||""}${feat}`, `${x.featured?`<span class="badge">FIXADO</span>`:""}<button class="ghost" type="button" data-order-feat="${escapeHtml(id)}">${x.featured?"Desfixar":"Fixar"}</button><button class="ghost" type="button" data-order-edit="stations:${escapeHtml(id)}">Editar</button>`); }).join("") || `<p class="note">Sem episódios.</p>`;
    const seen = new Map();
    eps.forEach(s=>{ const k = liveNormKey(s.series||s.name||""); if(k && !seen.has(k)) seen.set(k, String(s.series||s.name||"").trim()); });
    const srOrder = Array.isArray(saved.seriesOrder) ? saved.seriesOrder.filter(k=>seen.has(liveNormKey(k))) : [];
    srOrder.push(...[...seen.keys()].filter(k=>!srOrder.some(x=>liveNormKey(x)===k)).map(k=>seen.get(k)));
    const sb = $("orderSeries");
    if(sb) sb.innerHTML = srOrder.map(name=>{ const k = liveNormKey(name); const n = eps.filter(s=>liveNormKey(s.series||s.name||"")===k).length; const cov = (eps.find(s=>liveNormKey(s.series||s.name||"")===k && s.cover)||{}).cover || ""; return orderRow(name, cov, seen.get(k)||name, `${n} episódio(s)`); }).join("") || `<p class="note">Sem séries.</p>`;
    const secSaved = Array.isArray(saved.sectionsOrder) ? [...saved.sectionsOrder] : [];
    secSaved.push(...ORDER_SECTIONS.map(s=>s[0]).filter(id=>!secSaved.includes(id)));
    const customsPre = Array.isArray(saved.customSections) ? saved.customSections.map(c=>String(c.id||'')).filter(id=>id && !secSaved.includes(id)) : [];
    secSaved.push(...customsPre);
    const secTitles = (saved.sectionTitles && typeof saved.sectionTitles === "object") ? saved.sectionTitles : {};
    const secDescs = (saved.sectionDescs && typeof saved.sectionDescs === "object") ? saved.sectionDescs : {};
    const secLimits = (saved.sectionLimits && typeof saved.sectionLimits === "object") ? saved.sectionLimits : {};
    const secHidden = Array.isArray(saved.sectionsHidden) ? saved.sectionsHidden : [];
    const customs = new Map((Array.isArray(saved.customSections) ? saved.customSections : []).map(c=>[String(c.id||''), c]));
    const SEC_CONTENT_TABS = {spotlight:"homepage", latest:"articles", index:"articles", mustwatch:"live", radio:"stations", shop:"products", about:"infoCards", hpBanners:"homepage", channelsStrip:"homepage"};
    const cb = $("orderSections");
    if(cb) cb.innerHTML = secSaved.map(id=>{
      if(customs.has(id)) return customSectionRow(customs.get(id));
      const lb = (ORDER_SECTIONS.find(s=>s[0]===id)||[])[1] || id; const hidden = secHidden.includes(id); return `<div class="ord-row" draggable="true" data-order-id="${escapeHtml(id)}"${hidden?` data-sec-hidden="1"`:''}><span class="ord-grip">☰</span><span class="ord-copy"><strong>${escapeHtml(lb)}</strong><small>id: ${escapeHtml(id)}${hidden?" · OCULTA":""}</small></span><span class="ord-actions" style="grid-column:1/-1"><input data-sec-title="${escapeHtml(id)}" value="${escapeHtml(secTitles[id]||"")}" placeholder="Título" style="flex:2;min-width:120px"><input data-sec-desc="${escapeHtml(id)}" value="${escapeHtml(secDescs[id]||"")}" placeholder="Descrição" style="flex:3;min-width:160px"><input data-sec-limit="${escapeHtml(id)}" value="${escapeHtml(secLimits[id]??"")}" placeholder="Qtd" type="number" min="1" style="max-width:70px"><button class="ghost" type="button" data-sec-edit="${SEC_CONTENT_TABS[id]||"homepage"}">Conteúdo</button><input data-sec-limit="${escapeHtml(id)}" value="${escapeHtml(secLimits[id]??"")}" placeholder="Qtd" type="number" min="1" style="max-width:70px"><button class="ghost" type="button" data-sec-edit="${SEC_CONTENT_TABS[id]||"homepage"}">Conteúdo</button><button class="ghost" type="button" data-sec-hide="${escapeHtml(id)}">${hidden?"Mostrar":"Ocultar"}</button><button class="ghost" type="button" data-ord-up>↑</button><button class="ghost" type="button" data-ord-down>↓</button></span></div>`; }).join("") + `<datalist id="csecKinds"><option value="texto"></option><option value="banner"></option><option value="hero"></option><option value="episodios"></option><option value="links"></option></datalist>`;
    const pv = $("orderPreview");
    if(pv) pv.textContent = JSON.stringify({stationOrder: orderReadIds("orderEpisodes"), seriesOrder: orderReadIds("orderSeries"), sectionsOrder: orderReadIds("orderSections")}, null, 2);
  }catch(e){ console.warn("order load failed", e); }
}
function reloadSitePreview(){ const fr = $("sitePreviewFrame"); if(!fr) return; fr.src = "../radio?t=" + Date.now(); }
async function saveOrderPatch(patch, what){
  await setDoc(doc(db,"settings","order"), {...patch, updatedAt:serverTimestamp()}, {merge:true});
  await logAction("save","settings/order",{what});
  await loadOrderTab();
  toast("Ordem salva.");
}
async function toggleFeaturedOrder(id){
  try{
    const s = await getDoc(doc(db,"stations",id));
    if(!s.exists()) return;
    const cur = !!s.data().featured;
    await setDoc(doc(db,"stations",id), cur ? {featured:false, updatedAt:serverTimestamp()} : {featured:true, featuredOrder:Date.now(), updatedAt:serverTimestamp()}, {merge:true});
    await loadOrderTab();
    toast(cur ? "Destaque removido." : "Fixado no topo.");
  }catch(e){ toast("Erro: " + (e?.message || e), "error"); }
}
async function saveSettings(){ const items=jsonSafe($("settings_socials").value,[]); await setDoc(doc(db,"settings","globalSocials"), {items, updatedAt:serverTimestamp()}); await setDoc(doc(db,"settings","site"), { siteName:$("settings_siteName").value, siteDescription:$("settings_siteDescription").value, favicon:$("settings_favicon").value, logo:$("settings_logo").value, analytics:$("settings_analytics").value, updatedAt:serverTimestamp() }, {merge:true}); await logAction("save","settings/site"); await loadSettings(); toast("Configurações salvas."); }
async function loadSettings(){ const el=$("settingsPreview"); if(!el) return; const social=await getDoc(doc(db,"settings","globalSocials")); const site=await getDoc(doc(db,"settings","site")); const payload={site:site.exists()?site.data():{}, globalSocials:social.exists()?social.data():{items:[]}}; el.textContent=JSON.stringify(payload,null,2); if(social.exists()) $("settings_socials").value=JSON.stringify(social.data().items||[],null,2); if(site.exists()) Object.entries(site.data()).forEach(([k,v])=>{ const f=$("settings_"+k); if(f) f.value=v??""; }); }


function siteTextsDataFromFields(){
  return {
    browserTitle: $("siteTexts_browserTitle")?.value || "CYBERISDEAD",
    issueText: $("siteTexts_issueText")?.value || "ISSUE 001 / EDITORIAL TRANSMISSION",
    liveNow: $("siteTexts_liveNow")?.value || "LIVE NOW / CYBERISDEAD RADIO",
    broadcastLabel: $("siteTexts_broadcastLabel")?.value || "BROADCAST:",
    broadcastValue: $("siteTexts_broadcastValue")?.value || "EDITORIAL TRANSMISSION",
    transmittingLabel: $("siteTexts_transmittingLabel")?.value || "TRANSMITTING",
    radioTypeLabel: $("siteTexts_radioTypeLabel")?.value || "TALK",
    nowTransmittingLabel: $("siteTexts_nowTransmittingLabel")?.value || "NOW TRANSMITTING",
    episodeLinksLabel: $("siteTexts_episodeLinksLabel")?.value || "EPISODE LINKS",
    genresLabel: $("siteTexts_genresLabel")?.value || "GENRES",
    episodeOptionsLabel: $("siteTexts_episodeOptionsLabel")?.value || "EPISODE OPTIONS",
    currentHostSocialsLabel: $("siteTexts_currentHostSocialsLabel")?.value || "CURRENT HOST SOCIALS",
    noHostLinksLabel: $("siteTexts_noHostLinksLabel")?.value || "NO HOST LINKS",
    tickerText: $("siteTexts_tickerText")?.value || "NEW ESSAYS — UNDERGROUND CULTURE — RADIO NOTES — CINEMA LOG — VISUAL ARCHIVE — FIELD RECORDINGS —",
    latestTitle: $("siteTexts_latestTitle")?.value || "LATEST / ARCHIVE",
    latestDescription: $("siteTexts_latestDescription")?.value || "Destaque editorial e arquivo completo organizado por categoria, do mais recente ao mais antigo.",
    latestButtonLabel: $("siteTexts_latestButtonLabel")?.value || "VER MAIS",
    latestLessLabel: $("siteTexts_latestLessLabel")?.value || "VER MENOS",
    showingPrefix: $("siteTexts_showingPrefix")?.value || "SHOWING",
    allLabel: $("siteTexts_allLabel")?.value || "ALL",
    ofLabel: $("siteTexts_ofLabel")?.value || "OF",
    itemsLabel: $("siteTexts_itemsLabel")?.value || "ITEMS",
    scheduleTitle: $("siteTexts_scheduleTitle")?.value || "SCHEDULE",
    scheduleDescription: $("siteTexts_scheduleDescription")?.value || "Transmissões, mixtapes e episódios.",
    episodesLabel: $("siteTexts_episodesLabel")?.value || "EPISODES",
    closeLabel: $("siteTexts_closeLabel")?.value || "CLOSE",
    saveLabel: $("siteTexts_saveLabel")?.value || "SAVE",
    savedLabel: $("siteTexts_savedLabel")?.value || "SAVED",
    shareLabel: $("siteTexts_shareLabel")?.value || "SHARE",
    copyLinkLabel: $("siteTexts_copyLinkLabel")?.value || "COPY LINK",
    downloadEpisodeLabel: $("siteTexts_downloadEpisodeLabel")?.value || "DOWNLOAD EPISODE",
    tracklistLabel: $("siteTexts_tracklistLabel")?.value || "TRACKLIST",
    custom: jsonSafe($("siteTexts_custom")?.value || "{}", {})
  };
}

function updateSiteTextsPreview(data=siteTextsDataFromFields()){
  const el = $("siteTextsPreview");
  if(el) el.textContent = JSON.stringify(data, null, 2);
}
async function saveSiteTexts(){
  const data = {...siteTextsDataFromFields(), updatedAt:serverTimestamp()};
  await setDoc(doc(db,"settings","siteTexts"), data, {merge:true});
  await logAction("save","settings/siteTexts");
  updateSiteTextsPreview(data);
  toast("Textos do site salvos.");
}
async function loadSiteTexts(){
  if(!$("siteTextsPreview")) return;
  const snap = await getDoc(doc(db,"settings","siteTexts"));
  const defaults = siteTextsDataFromFields();
  const data = snap.exists() ? {...defaults, ...snap.data()} : defaults;
  Object.entries(data).forEach(([k,v])=>{
    const f = $("siteTexts_"+k);
    if(f) f.value = (Array.isArray(v) || (v && typeof v === "object")) ? JSON.stringify(v,null,2) : String(v ?? "");
  });
  updateSiteTextsPreview(data);
}

function siteMetaDataFromFields(){
  return {
    siteName:$("siteMeta_siteName")?.value || "",
    titleSuffix:$("siteMeta_titleSuffix")?.value || "",
    siteDescription:$("siteMeta_siteDescription")?.value || "",
    favicon:$("siteMeta_favicon")?.value || "",
    appIcon:$("siteMeta_appIcon")?.value || "",
    themeColor:$("siteMeta_themeColor")?.value || "",
    canonicalUrl:$("siteMeta_canonicalUrl")?.value || "",
    proxyUrl:$("siteMeta_proxyUrl")?.value || "",
    ogTitle:$("siteMeta_ogTitle")?.value || "",
    ogDescription:$("siteMeta_ogDescription")?.value || "",
    ogImage:$("siteMeta_ogImage")?.value || "",
    twitterCard:$("siteMeta_twitterCard")?.value || "summary_large_image",
    locale:$("siteMeta_locale")?.value || "pt_BR",
    shareTitle:$("siteMeta_shareTitle")?.value || "",
    shareText:$("siteMeta_shareText")?.value || "",
    keywords:$("siteMeta_keywords")?.value || "",
    author:$("siteMeta_author")?.value || ""
  };
}
function updateSiteMetaPreview(data = siteMetaDataFromFields()){
  const img = $("siteMetaPreviewImg");
  const title = $("siteMetaPreviewTitle");
  const desc = $("siteMetaPreviewDesc");
  const url = $("siteMetaPreviewUrl");
  const preview = $("siteMetaPreview");
  const imgPreview = $("siteMeta_ogImagePreview");
  const image = data.ogImage || data.appIcon || data.favicon || "";
  if(img) img.style.backgroundImage = image ? `url('${String(image).replace(/'/g,"%27")}')` : "linear-gradient(135deg,#111,#777,#ddd)";
  if(imgPreview) imgPreview.innerHTML = image ? `<small>Preview da capa de compartilhamento</small><img src="${escapeHtml(image)}" alt="Preview share">` : `<small>Cole uma URL para visualizar a capa de compartilhamento.</small>`;
  if(title) title.textContent = data.ogTitle || data.siteName || "CYBERISDEAD";
  if(desc) desc.textContent = data.ogDescription || data.siteDescription || "Preview da descrição do link.";
  if(url) url.textContent = data.canonicalUrl || location.hostname;
  if(preview) preview.textContent = JSON.stringify(data,null,2);
}
async function saveSiteMeta(){
  const data = {...siteMetaDataFromFields(), updatedAt:serverTimestamp()};
  await setDoc(doc(db,"settings","site"), data, {merge:true});
  await logAction("save","settings/siteMeta");
  await loadSiteMeta();
  toast("Site Meta salvo.");
}
async function loadSiteMeta(){
  if(!$("siteMetaPreview")) return;
  const s = await getDoc(doc(db,"settings","site"));
  const data = s.exists() ? s.data() : {};
  Object.entries(data).forEach(([k,v])=>{ const f=$("siteMeta_"+k); if(f) f.value = v ?? ""; });
  if(!$("siteMeta_twitterCard")?.value) $("siteMeta_twitterCard").value = "summary_large_image";
  if(!$("siteMeta_locale")?.value) $("siteMeta_locale").value = "pt_BR";
  updateSiteMetaPreview({...siteMetaDataFromFields(), ...data});
}


function shareDataFromFields(){
  return {
    articleTitle:$("share_articleTitle")?.value || "Share article",
    episodeTitle:$("share_episodeTitle")?.value || "Share episode",
    articleMeta:$("share_articleMeta")?.value || "Share / Article",
    episodeMeta:$("share_episodeMeta")?.value || "Share / Radio",
    introText:$("share_introText")?.value || "",
    copyLabel:$("share_copyLabel")?.value || "Copy link",
    copiedLabel:$("share_copiedLabel")?.value || "Copied",
    enableTwitter:String($("share_enableTwitter")?.value || "true").toLowerCase() !== "false",
    enableTumblr:String($("share_enableTumblr")?.value || "true").toLowerCase() !== "false",
    enableWhatsApp:String($("share_enableWhatsApp")?.value || "true").toLowerCase() !== "false",
    enableInstagram:String($("share_enableInstagram")?.value || "true").toLowerCase() !== "false",
    enableInstagramStories:String($("share_enableInstagramStories")?.value || "true").toLowerCase() !== "false",
    enableNative:String($("share_enableNative")?.value || "true").toLowerCase() !== "false",
    twitterLabel:$("share_twitterLabel")?.value || "X / Twitter",
    tumblrLabel:$("share_tumblrLabel")?.value || "Tumblr",
    whatsappLabel:$("share_whatsappLabel")?.value || "WhatsApp",
    instagramLabel:$("share_instagramLabel")?.value || "Instagram",
    instagramStoriesLabel:$("share_instagramStoriesLabel")?.value || "Instagram Stories",
    nativeLabel:$("share_nativeLabel")?.value || "Share",
    instagramStoriesText:$("share_instagramStoriesText")?.value || "Veja no CYBERISDEAD: {{title}} {{url}}",
    instagramStoriesUrl:$("share_instagramStoriesUrl")?.value || "https://www.instagram.com/",
    openInstagramApp:String($("share_openInstagramApp")?.value || "true").toLowerCase() !== "false",
    customButtons:jsonSafe($("share_customButtons")?.value || "[]", [])
  };
}
function updateSharePreview(data=shareDataFromFields()){
  const el=$("sharePreview"); if(el) el.textContent=JSON.stringify(data,null,2);
}
async function saveShare(){
  const data={...shareDataFromFields(), updatedAt:serverTimestamp()};
  await setDoc(doc(db,"settings","share"), data, {merge:true});
  await logAction("save","settings/share");
  updateSharePreview(data);
  toast("Share salvo.");
}
async function loadShare(){
  if(!$("sharePreview")) return;
  const snap=await getDoc(doc(db,"settings","share"));
  const data=snap.exists()?snap.data():{};
  const defaults={articleTitle:"Share article",episodeTitle:"Share episode",articleMeta:"Share / Article",episodeMeta:"Share / Radio",copyLabel:"Copy link",copiedLabel:"Copied",enableTwitter:true,enableTumblr:true,enableWhatsApp:true,enableInstagram:true,enableInstagramStories:true,enableNative:true,twitterLabel:"X / Twitter",tumblrLabel:"Tumblr",whatsappLabel:"WhatsApp",instagramLabel:"Instagram",instagramStoriesLabel:"Instagram Stories",nativeLabel:"Share",instagramStoriesText:"Veja no CYBERISDEAD: {{title}} {{url}}",instagramStoriesUrl:"https://www.instagram.com/",openInstagramApp:true,customButtons:[]};
  const merged={...defaults,...data};
  Object.entries(merged).forEach(([k,v])=>{ const f=$("share_"+k); if(f) f.value = Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v,null,2) : String(v ?? ""); });
  updateSharePreview(merged);
}

function numOrBlank(id){ return $(id).value === "" ? "" : Number($(id).value); }
function themeDataFromFields(){
  return {
    bgOpacity:numOrBlank("theme_bgOpacity"),
    bgBrightness:numOrBlank("theme_bgBrightness"),
    bgContrast:numOrBlank("theme_bgContrast"),
    bgGrayscale:numOrBlank("theme_bgGrayscale"),
    bgBlur:numOrBlank("theme_bgBlur"),
    mobileBgOpacity:numOrBlank("theme_mobileBgOpacity"),
    mobileBgBrightness:numOrBlank("theme_mobileBgBrightness"),
    mobileBgBlur:numOrBlank("theme_mobileBgBlur"),
    overlay:$("theme_overlay")?.value || "",
    textColor:$("theme_textColor")?.value || "",
    mutedColor:$("theme_mutedColor")?.value || "",
    lineColor:$("theme_lineColor")?.value || "",
    buttonColor:$("theme_buttonColor")?.value || "",
    buttonTextColor:$("theme_buttonTextColor")?.value || "",
    siteBackground:$("theme_siteBackground")?.value || "",
    heroHeight:$("theme_heroHeight")?.value || "",
    globalSpacing:$("theme_globalSpacing")?.value || "",
    cardMinWidth:$("theme_cardMinWidth")?.value || "",
    popupWidth:$("theme_popupWidth")?.value || "",
    noiseOpacity:numOrBlank("theme_noiseOpacity"),
    genreCardCoverOpacity:numOrBlank("theme_genreCardCoverOpacity"),
    genreCardCoverHoverOpacity:numOrBlank("theme_genreCardCoverHoverOpacity"),
    genreCardCoverBrightness:numOrBlank("theme_genreCardCoverBrightness"),
    genreCardCoverHoverBrightness:numOrBlank("theme_genreCardCoverHoverBrightness"),
    genreCardCoverContrast:numOrBlank("theme_genreCardCoverContrast"),
    genreCardCoverGrayscale:numOrBlank("theme_genreCardCoverGrayscale"),
    genreCardCoverPosition:$("theme_genreCardCoverPosition")?.value || "",
    genreCardCoverOverlay:$("theme_genreCardCoverOverlay")?.value || "",
    genreCardCoverHoverOverlay:$("theme_genreCardCoverHoverOverlay")?.value || ""
  };
}
function applyThemePreview(data = themeDataFromFields()){
  const bg = document.querySelector('.theme-preview-bg');
  const shade = document.querySelector('.theme-preview-shade');
  if(bg){
    bg.style.opacity = data.bgOpacity || .62;
    bg.style.filter = `brightness(${data.bgBrightness || .78}) contrast(${data.bgContrast || 1.08}) grayscale(${data.bgGrayscale === '' ? 1 : data.bgGrayscale}) blur(${data.bgBlur || 0}px)`;
  }
  if(shade){ shade.style.background = data.overlay || 'linear-gradient(to right,rgba(0,0,0,.68),rgba(0,0,0,.28),rgba(0,0,0,.66)),linear-gradient(to top,rgba(0,0,0,.66),transparent 55%)'; }
}
async function saveTheme(){ const data = { ...themeDataFromFields(), updatedAt:serverTimestamp() }; await setDoc(doc(db,"settings","theme"), data, {merge:true}); await logAction("save","settings/theme"); await loadTheme(); toast("Visual salvo."); }
async function loadTheme(){ const el=$("themePreview"); if(!el) return; const s=await getDoc(doc(db,"settings","theme")); if(s.exists()){ const x=s.data(); el.textContent=JSON.stringify(x,null,2); Object.entries(x).forEach(([k,v])=>{const field=$("theme_"+k); if(field) field.value = v ?? "";}); applyThemePreview(x); } else { el.textContent="Ainda sem visual salvo. Use o preset para deixar o fundo mais visível."; applyThemePreview(); } }
function setThemePreset(type="visible"){
  const visible = {
    bgOpacity:.68, bgBrightness:.82, bgContrast:1.08, bgGrayscale:1, bgBlur:0, noiseOpacity:.04,
    mobileBgOpacity:.58, mobileBgBrightness:.76, mobileBgBlur:0,
    overlay:'linear-gradient(to right,rgba(0,0,0,.64),rgba(0,0,0,.22),rgba(0,0,0,.62)),linear-gradient(to top,rgba(0,0,0,.62),transparent 58%)'
  };
  const dark = {
    bgOpacity:.42, bgBrightness:.48, bgContrast:1.08, bgGrayscale:1, bgBlur:0, noiseOpacity:.045,
    mobileBgOpacity:.42, mobileBgBrightness:.48, mobileBgBlur:0,
    overlay:'linear-gradient(to right,rgba(0,0,0,.88),rgba(0,0,0,.48),rgba(0,0,0,.82)),linear-gradient(to top,rgba(0,0,0,.84),transparent 55%)'
  };
  const data = type === "dark" ? dark : visible;
  Object.entries(data).forEach(([k,v])=>{ const field=$("theme_"+k); if(field) field.value = v; });
  applyThemePreview({...themeDataFromFields(), ...data});
}
async function saveCart(){ const data = { checkoutUrl:$("cart_checkoutUrl").value, checkoutLabel:$("cart_checkoutLabel").value, checkoutNote:$("cart_checkoutNote").value, width:$("cart_width").value, background:$("cart_background").value, textColor:$("cart_textColor").value, lineColor:$("cart_lineColor").value, buttonBackground:$("cart_buttonBackground").value, buttonText:$("cart_buttonText").value, updatedAt:serverTimestamp() }; await setDoc(doc(db,"settings","cart"), data, {merge:true}); await logAction("save","settings/cart"); await loadCart(); toast("Cart salvo."); }
async function loadCart(){ const el=$("cartPreview"); if(!el) return; const s=await getDoc(doc(db,"settings","cart")); if(s.exists()){ const x=s.data(); el.textContent=JSON.stringify(x,null,2); Object.entries(x).forEach(([k,v])=>{const field=$("cart_"+k); if(field) field.value = v ?? "";}); } else el.textContent="Ainda sem configuração do carrinho salva."; }
async function saveJsonSetting(docId, fieldId, previewId){ const items = jsonSafe($(fieldId).value, []); await setDoc(doc(db,"settings",docId), {items, updatedAt:serverTimestamp()}, {merge:true}); await logAction("save","settings/"+docId); await loadJsonSetting(docId, fieldId, previewId); toast("Salvo no Firestore."); }
async function loadJsonSetting(docId, fieldId, previewId){ const preview=$(previewId); if(!preview) return; const s=await getDoc(doc(db,"settings",docId)); if(s.exists()){ const data=s.data(); preview.textContent=JSON.stringify(data,null,2); const field=$(fieldId); if(field) field.value=JSON.stringify(data.items||[],null,2); }else preview.textContent="Ainda sem configuração salva."; }
async function saveHomeButtons(){ return saveJsonSetting("homeButtons","homeButtons_items","homeButtonsPreview"); } async function loadHomeButtons(){ return loadJsonSetting("homeButtons","homeButtons_items","homeButtonsPreview"); }
async function saveHeaderButtons(){ return saveJsonSetting("headerButtons","headerButtons_items","headerButtonsPreview"); } async function loadHeaderButtons(){ return loadJsonSetting("headerButtons","headerButtons_items","headerButtonsPreview"); }
async function saveArchiveTags(){ return saveJsonSetting("archiveTags","archiveTags_items","archiveTagsPreview"); } async function loadArchiveTags(){ return loadJsonSetting("archiveTags","archiveTags_items","archiveTagsPreview"); }
async function saveInfoCards(){
  const items = ["about","contact","donate"].map(infoPopupPayload);
  await setDoc(doc(db,"settings","infoCards"), {items, updatedAt:serverTimestamp()}, {merge:true});
  await logAction("save","settings/infoCards",{count:items.length});
  await loadInfoCards();
  toast("Popups About / Contact / Donate salvos.");
}
async function loadInfoCards(){
  const preview=$("infoCardsPreview"); if(!preview) return;
  const snap = await getDoc(doc(db,"settings","infoCards"));
  const items = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : DEFAULT_INFO_POPUPS;
  const merged = DEFAULT_INFO_POPUPS.map(def => normalizeInfoPopupCard(items.find(x=>x.id===def.id) || {}, def));
  merged.forEach(fillInfoPopupFields);
  preview.textContent = JSON.stringify({items: merged}, null, 2);
}
function accessPayload(){ return { lockAllCards:String($("access_lockAllCards").value).toLowerCase()==="true", defaultAccess:$("access_defaultAccess").value || "public", lockedMessage:$("access_lockedMessage").value, subscriberEmails:csv($("access_subscriberEmails").value), subscriberUids:csv($("access_subscriberUids").value), subscriptionTitle:$("access_subscriptionTitle").value, subscriptionText:$("access_subscriptionText").value, subscribeUrl:$("access_subscribeUrl").value, updatedAt:serverTimestamp() }; }
async function saveAccess(){ await setDoc(doc(db,"settings","access"), accessPayload(), {merge:true}); await logAction("save","settings/access"); await loadAccess(); toast("Acesso salvo."); }
async function loadAccess(){ const preview=$("accessPreview"); if(!preview) return; const s=await getDoc(doc(db,"settings","access")); if(s.exists()){ const x=s.data(); preview.textContent=JSON.stringify(x,null,2); Object.entries(x).forEach(([k,v])=>{const field=$("access_"+k); if(field) field.value=Array.isArray(v)?v.join(", "): (v ?? "");}); }else preview.textContent="Ainda sem regras de acesso salvas."; }

async function compressImage(file){ if(!file.type.startsWith("image/")) return file; const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); }); const max=1800; const scale=Math.min(1, max/Math.max(img.width,img.height)); const canvas=document.createElement("canvas"); canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale); const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0,canvas.width,canvas.height); return await new Promise(res=>canvas.toBlob(blob=>res(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {type:"image/jpeg"})), "image/jpeg", .82));
}


/* MEMBER AREA ADMIN PANELS — Membership / Content / Calendar / Comments */
function membershipDefaults(){
  return {
    plans:[
      {id:"apoie",name:"APOIE CYBERISDEAD",price:"R$ 3,90",period:"/ mês",checkoutUrl:"",active:true,benefits:["Calendário da plataforma","Perfil de assinante","Emotes personalizados","Badges de assinante","Comentários da rádio","Shoutout nos episódios"]},
      {id:"supporter",name:"CYBERISDEAD SUPPORTER",price:"R$ 8,90",period:"/ mês",checkoutUrl:"",active:true,benefits:["Tudo do Apoie","Magazine digital","Acesso antecipado","Gravações ao vivo","Vault / downloads","Feed exclusivo","Chave Bandcamp"]},
      {id:"premium",name:"CYBERISDEAD PREMIUM",price:"R$ 14,90",period:"/ mês",checkoutUrl:"",active:true,benefits:["Tudo do Supporter","Vídeos exclusivos","1 ingresso grátis por ano","Early access a merch","Descontos permanentes"]},
      {id:"inner",name:"O CÍRCULO INTERNO",price:"R$ 59,90",period:"/ mês",checkoutUrl:"",active:true,limit:15,benefits:["Tudo do Premium","1 merch físico por ciclo","Aula / consultoria mensal","Contato direto com o projeto"]}
    ],
    subscribers:[],
    dashboardTitle:"MEMBER AREA",
    lockedTitle:"VOCÊ PRECISA DE UMA ASSINATURA ATIVA.",
    lockedText:"A Member Area é exclusiva para assinantes. Escolha um plano para liberar a dashboard.",
    cancelText:"O cancelamento fica nas configurações do perfil do assinante."
  };
}
function membershipDataFromFields(){
  const defaults = membershipDefaults();
  return {
    plans: jsonSafe($("membership_plans")?.value || "[]", defaults.plans),
    subscribers: jsonSafe($("membership_subscribers")?.value || "[]", []),
    dashboardTitle: $("membership_dashboardTitle")?.value || defaults.dashboardTitle,
    lockedTitle: $("membership_lockedTitle")?.value || defaults.lockedTitle,
    lockedText: $("membership_lockedText")?.value || defaults.lockedText,
    cancelText: $("membership_cancelText")?.value || defaults.cancelText,
    updatedAt: serverTimestamp()
  };
}
function fillMembershipFields(data={}){
  const defaults = membershipDefaults();
  const merged = {...defaults, ...data};
  if($("membership_plans")) $("membership_plans").value = JSON.stringify(merged.plans || defaults.plans, null, 2);
  if($("membership_subscribers")) $("membership_subscribers").value = JSON.stringify(merged.subscribers || [], null, 2);
  if($("membership_dashboardTitle")) $("membership_dashboardTitle").value = merged.dashboardTitle || defaults.dashboardTitle;
  if($("membership_lockedTitle")) $("membership_lockedTitle").value = merged.lockedTitle || defaults.lockedTitle;
  if($("membership_lockedText")) $("membership_lockedText").value = merged.lockedText || defaults.lockedText;
  if($("membership_cancelText")) $("membership_cancelText").value = merged.cancelText || defaults.cancelText;
  const prev = $("membershipPreview");
  if(prev) prev.textContent = JSON.stringify({...merged, updatedAt:"serverTimestamp()"}, null, 2);
}
async function loadMembership(){
  if(!$("membershipPanel")) return;
  try{
    const snap = await getDoc(doc(db,"settings","membership"));
    fillMembershipFields(snap.exists() ? snap.data() : membershipDefaults());
  }catch(e){
    console.warn("membership load failed", e);
    fillMembershipFields(membershipDefaults());
  }
}
async function saveMembership(){
  const data = membershipDataFromFields();
  await setDoc(doc(db,"settings","membership"), data, {merge:true});
  await logAction("save","settings/membership");
  fillMembershipFields({...data, updatedAt:"serverTimestamp()"});
  toast("Membership salvo.");
}

function memberContentPayload(){
  const title = $("memberContent_title")?.value || "";
  return {
    id: $("memberContent_id")?.value || slug(title || "member-content"),
    type: $("memberContent_type")?.value || "feed",
    title,
    description: $("memberContent_description")?.value || "",
    tier: $("memberContent_tier")?.value || "supporter",
    status: $("memberContent_status")?.value || "published",
    cover: $("memberContent_cover")?.value || "",
    url: $("memberContent_url")?.value || "",
    body: lines($("memberContent_body")?.value || ""),
    tags: csv($("memberContent_tags")?.value || ""),
    updatedAt: serverTimestamp()
  };
}
async function saveMemberContent(){
  const data = memberContentPayload();
  await setDoc(doc(db,"memberContent",data.id), data, {merge:true});
  await logAction("save","memberContent",{id:data.id});
  clearMemberContent();
  await loadMemberContentList();
  toast("Conteúdo de membro salvo.");
}
function clearMemberContent(){
  document.querySelectorAll("#memberContentPanel input,#memberContentPanel textarea").forEach(el=>el.value="");
}
async function loadMemberContentList(){
  const box = $("memberContentList");
  if(!box) return;
  box.innerHTML = "Carregando...";
  try{
    const snap = await getDocs(collection(db,"memberContent"));
    const cards = [];
    snap.forEach(d=>{
      const x = d.data();
      cards.push(`<article class="card"><small>${escapeHtml(x.type || "content")} / ${escapeHtml(x.tier || "")}</small><h3>${escapeHtml(x.title || d.id)}</h3><p>${escapeHtml(x.description || x.url || "")}</p><div class="row"><button class="ghost" data-edit-member-content="${escapeHtml(d.id)}">Editar</button><button class="danger" data-del-member-content="${escapeHtml(d.id)}">Excluir</button></div></article>`);
    });
    box.innerHTML = cards.join("") || `<p class="note">Nenhum conteúdo exclusivo salvo ainda.</p>`;
    document.querySelectorAll("[data-edit-member-content]").forEach(btn=>btn.onclick=()=>editMemberContent(btn.dataset.editMemberContent));
    document.querySelectorAll("[data-del-member-content]").forEach(btn=>btn.onclick=()=>deleteMemberContent(btn.dataset.delMemberContent));
  }catch(e){
    box.innerHTML = `<p class="error">Erro ao carregar memberContent: ${escapeHtml(e.message)}</p>`;
  }
}
async function editMemberContent(id){
  const snap = await getDoc(doc(db,"memberContent",id));
  if(!snap.exists()) return;
  const x = snap.data();
  const set=(id,val)=>{ const el=$(id); if(el) el.value = Array.isArray(val) ? val.join(id==="memberContent_body" ? "\n" : ", ") : (val ?? ""); };
  set("memberContent_id", snap.id); set("memberContent_type", x.type); set("memberContent_title", x.title); set("memberContent_description", x.description); set("memberContent_tier", x.tier); set("memberContent_status", x.status); set("memberContent_cover", x.cover); set("memberContent_url", x.url); set("memberContent_body", x.body); set("memberContent_tags", x.tags);
}
async function deleteMemberContent(id){
  if(confirm("Excluir conteúdo de membro?")){
    await deleteDoc(doc(db,"memberContent",id));
    await loadMemberContentList();
    toast("Conteúdo excluído.");
  }
}

function memberCalendarPayload(){
  const title = $("memberCalendar_title")?.value || "";
  return {
    id: $("memberCalendar_id")?.value || slug(`${$("memberCalendar_date")?.value || ""}-${title || "evento"}`),
    date: $("memberCalendar_date")?.value || "",
    time: $("memberCalendar_time")?.value || "",
    tier: $("memberCalendar_tier")?.value || "apoie",
    title,
    description: $("memberCalendar_description")?.value || "",
    url: $("memberCalendar_url")?.value || "",
    status: $("memberCalendar_status")?.value || "published",
    updatedAt: serverTimestamp()
  };
}
async function saveMemberCalendar(){
  const data = memberCalendarPayload();
  await setDoc(doc(db,"memberCalendar",data.id), data, {merge:true});
  await logAction("save","memberCalendar",{id:data.id});
  clearMemberCalendar();
  await loadMemberCalendarList();
  toast("Evento salvo.");
}
function clearMemberCalendar(){
  document.querySelectorAll("#memberCalendarPanel input,#memberCalendarPanel textarea").forEach(el=>el.value="");
}
async function loadMemberCalendarList(){
  const box = $("memberCalendarList");
  if(!box) return;
  box.innerHTML = "Carregando...";
  try{
    const snap = await getDocs(collection(db,"memberCalendar"));
    const cards = [];
    snap.forEach(d=>{
      const x = d.data();
      cards.push(`<article class="card"><small>${escapeHtml(x.date || "")} ${escapeHtml(x.time || "")} / ${escapeHtml(x.tier || "")}</small><h3>${escapeHtml(x.title || d.id)}</h3><p>${escapeHtml(x.description || x.url || "")}</p><div class="row"><button class="ghost" data-edit-member-calendar="${escapeHtml(d.id)}">Editar</button><button class="danger" data-del-member-calendar="${escapeHtml(d.id)}">Excluir</button></div></article>`);
    });
    box.innerHTML = cards.join("") || `<p class="note">Nenhum evento salvo ainda.</p>`;
    document.querySelectorAll("[data-edit-member-calendar]").forEach(btn=>btn.onclick=()=>editMemberCalendar(btn.dataset.editMemberCalendar));
    document.querySelectorAll("[data-del-member-calendar]").forEach(btn=>btn.onclick=()=>deleteMemberCalendar(btn.dataset.delMemberCalendar));
  }catch(e){
    box.innerHTML = `<p class="error">Erro ao carregar calendário: ${escapeHtml(e.message)}</p>`;
  }
}
async function editMemberCalendar(id){
  const snap = await getDoc(doc(db,"memberCalendar",id));
  if(!snap.exists()) return;
  const x = snap.data();
  ["id","date","time","tier","title","description","url","status"].forEach(k=>{ const el=$("memberCalendar_"+k); if(el) el.value = x[k] ?? (k==="id" ? snap.id : ""); });
}
async function deleteMemberCalendar(id){
  if(confirm("Excluir evento?")){
    await deleteDoc(doc(db,"memberCalendar",id));
    await loadMemberCalendarList();
    toast("Evento excluído.");
  }
}

async function loadMemberComments(){
  const box = $("memberCommentsList");
  if(!box) return;
  box.innerHTML = "Carregando...";
  try{
    const snap = await getDocs(collection(db,"memberComments"));
    const episodeFilter = String($("memberComments_episodeId")?.value || "").trim().toLowerCase();
    const statusFilter = String($("memberComments_status")?.value || "").trim().toLowerCase();
    const cards = [];
    snap.forEach(d=>{
      const x = d.data();
      if(episodeFilter && String(x.episodeId || "").toLowerCase() !== episodeFilter) return;
      if(statusFilter && String(x.status || "").toLowerCase() !== statusFilter) return;
      cards.push(`<article class="card"><small>${escapeHtml(x.episodeId || "episode")} / ${escapeHtml(x.status || "pending")}</small><h3>${escapeHtml(x.name || x.email || d.id)}</h3><p>${escapeHtml(x.text || x.comment || "")}</p><div class="row"><button class="ghost" data-comment-approve="${escapeHtml(d.id)}">Aprovar</button><button class="ghost" data-comment-hide="${escapeHtml(d.id)}">Ocultar</button><button class="danger" data-comment-delete="${escapeHtml(d.id)}">Excluir</button></div></article>`);
    });
    box.innerHTML = cards.join("") || `<p class="note">Nenhum comentário encontrado.</p>`;
    document.querySelectorAll("[data-comment-approve]").forEach(btn=>btn.onclick=()=>updateMemberComment(btn.dataset.commentApprove,"approved"));
    document.querySelectorAll("[data-comment-hide]").forEach(btn=>btn.onclick=()=>updateMemberComment(btn.dataset.commentHide,"hidden"));
    document.querySelectorAll("[data-comment-delete]").forEach(btn=>btn.onclick=()=>deleteMemberComment(btn.dataset.commentDelete));
  }catch(e){
    box.innerHTML = `<p class="error">Erro ao carregar comentários: ${escapeHtml(e.message)}</p>`;
  }
}
async function updateMemberComment(id,status){
  await setDoc(doc(db,"memberComments",id), {status, updatedAt:serverTimestamp()}, {merge:true});
  await loadMemberComments();
  toast("Comentário atualizado.");
}
async function deleteMemberComment(id){
  if(confirm("Excluir comentário?")){
    await deleteDoc(doc(db,"memberComments",id));
    await loadMemberComments();
    toast("Comentário excluído.");
  }
}
async function seedMemberComment(){
  await addDoc(collection(db,"memberComments"), {episodeId:$("memberComments_episodeId")?.value || "demo-episode", name:"Comentário teste", email:"demo@cyberisdead", text:"Comentário de teste para validar o painel.", status:"pending", createdAt:serverTimestamp()});
  await loadMemberComments();
  toast("Comentário teste criado.");
}

function setupUpload(){ const inputFile=$("mediaFile"), drop=$("dropzone"); if(!inputFile || !drop) return; inputFile.onchange = () => uploadFiles([...inputFile.files]); ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag");})); ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag");})); drop.addEventListener("drop", e=> uploadFiles([...e.dataTransfer.files])); }
async function uploadFiles(files){ const folder=($("mediaFolder")?.value || "uploads").replace(/^\/+|\/+$/g,""); const tag=$("mediaTag")?.value || ""; for(const raw of files){ const file=await compressImage(raw); const path=`${folder}/${Date.now()}-${slug(file.name)}`; const task=uploadBytesResumable(ref(storage,path), file, {contentType:file.type, customMetadata:{tag}}); await new Promise((resolve,reject)=>{ task.on("state_changed", snap=>{ const p=Math.round((snap.bytesTransferred/snap.totalBytes)*100); if($("uploadProgress")) $("uploadProgress").style.width=p+"%"; if($("uploadStatus")) $("uploadStatus").textContent=`Enviando ${file.name}: ${p}%`; }, reject, resolve); }); const url=await getDownloadURL(task.snapshot.ref); await addDoc(collection(db,"media"), {name:file.name,path,url,type:file.type,size:file.size,tag,createdAt:serverTimestamp(),createdBy:currentUser?.email||null}); await logAction("upload","media",{path,url}); await navigator.clipboard?.writeText(url).catch(()=>{}); toast("Upload concluído e URL copiada."); } if($("uploadProgress")) $("uploadProgress").style.width="0"; await loadMediaLibrary(); }
async function loadMediaLibrary(){ const box=$("mediaLibrary"); if(!box) return; box.innerHTML="Carregando mídia..."; try{ const snap=await getDocs(collection(db,"media")); const items=[]; snap.forEach(d=>{ const m=d.data(); const isImg=String(m.type||"").startsWith("image/"); const isVid=String(m.type||"").startsWith("video/"); const preview=isImg?`<img src="${escapeHtml(m.url)}" alt="">`:isVid?`<video src="${escapeHtml(m.url)}" muted></video>`:`<div class="badge">${escapeHtml(m.type||"file")}</div>`; items.push(`<article class="media-card">${preview}<small>${escapeHtml(m.name||d.id)}</small><input readonly value="${escapeHtml(m.url||"")}"><div class="row"><button data-copy-url="${escapeHtml(m.url||"")}">Copiar</button><button class="danger" data-media-del="${d.id}" data-path="${escapeHtml(m.path||"")}">Excluir</button></div></article>`); }); box.innerHTML=items.join("")||"<p class='note'>Nenhuma mídia enviada ainda.</p>"; document.querySelectorAll("[data-copy-url]").forEach(b=>b.onclick=()=>{navigator.clipboard?.writeText(b.dataset.copyUrl);toast("URL copiada.");}); document.querySelectorAll("[data-media-del]").forEach(b=>b.onclick=()=>deleteMedia(b.dataset.mediaDel,b.dataset.path)); }catch(e){ box.innerHTML=`<p class="error">Erro ao carregar mídia: ${escapeHtml(e.message)}</p>`; } }
async function deleteMedia(id,path){ if(!confirm("Excluir esta mídia?")) return; try{ if(path) await deleteObject(ref(storage,path)).catch(()=>{}); await deleteDoc(doc(db,"media",id)); await logAction("delete","media",{id,path}); await loadMediaLibrary(); toast("Mídia excluída."); }catch(e){ toast(e.message,"error"); } }

async function collectBackup(){ const data={ exportedAt:new Date().toISOString(), collections:{}, settings:{} }; for(const c of [...COLLECTIONS,"media"]){ const snap=await getDocs(collection(db,c)); data.collections[c]=[]; snap.forEach(d=>data.collections[c].push({id:d.id,data:d.data()})); } for(const id of SETTINGS_DOCS.concat(["site"])){ const s=await getDoc(doc(db,"settings",id)); if(s.exists()) data.settings[id]=s.data(); } return data; }
async function exportBackup(){ const data=await collectBackup(); const text=JSON.stringify(data,null,2); $("backupPreview").textContent=text; const blob=new Blob([text],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`aura-backup-${nowFile()}.json`; a.click(); await logAction("export","backup"); }
async function createSnapshot(){ const data=await collectBackup(); await addDoc(collection(db,"backups"), {data, createdAt:serverTimestamp(), createdBy:currentUser?.email||null}); await logAction("snapshot","backup"); toast("Snapshot salvo no Firestore."); }
async function restoreBackup(){ try{ const raw=$("backupImport").value.trim(); if(!raw) return toast("Cole um JSON de backup primeiro."); let backup; try{ backup=JSON.parse(raw); }catch{ return toast("Backup inválido: JSON malformado.", "error"); } if(!confirm("Restaurar backup pode sobrescrever dados. Continuar?")) return; const batch=writeBatch(db); Object.entries(backup.collections||{}).forEach(([c,items])=>{ (items||[]).forEach(item=> batch.set(doc(db,c,item.id), {...item.data, updatedAt:serverTimestamp()}, {merge:true})); }); Object.entries(backup.settings||{}).forEach(([id,data])=> batch.set(doc(db,"settings",id), {...data, updatedAt:serverTimestamp()}, {merge:true})); await batch.commit(); await logAction("restore","backup"); await refreshAll(); toast("Backup restaurado."); }catch(e){ console.error("restoreBackup failed", e); toast(`Erro ao restaurar: ${e?.message || e}`, "error"); } }
async function loadLogs(){ const box=$("logsList"); if(!box) return; try{ const q=query(collection(db,"logs"), orderBy("createdAt","desc"), limit(60)); const snap=await getDocs(q); const rows=[]; snap.forEach(d=>{ const l=d.data(); rows.push(`<article class="card"><small>${escapeHtml(l.email||"system")}</small><h3>${escapeHtml(l.action||"")} / ${escapeHtml(l.target||"")}</h3><p>${escapeHtml(JSON.stringify(l.details||{}))}</p></article>`); }); box.innerHTML=rows.join("")||"<p class='note'>Sem logs ainda.</p>"; }catch(e){ box.innerHTML=`<p class="error">Logs exigem índice/permissão nas rules.ules. ${escapeHtml(e.message)}</p>`; } }

async function importJson(name){ try{ const map={articles:"/data/articles.json",stations:"/data/stations.json",products:"/data/products.json",hosts:"/data/hosts.json",globalSocials:"/data/globalSocials.json"}; $("importMessage").textContent = `Importando ${name}...`; const res = await fetch(map[name]); if(!res.ok) throw new Error(`HTTP ${res.status} em ${map[name]}`); const json = await res.json(); const items=json.items || []; if(name==="globalSocials"){ await setDoc(doc(db,"settings","globalSocials"), {items, updatedAt:serverTimestamp()}); } else { const batch=writeBatch(db); items.forEach((item,i)=> batch.set(doc(db,name,item.id || slug(item.title || item.name || `item-${i}`)), {...item, updatedAt:serverTimestamp()})); await batch.commit(); } await logAction("import",name,{count:items.length}); $("importMessage").textContent = `Importado: ${name}`; await refreshAll(); }catch(e){ console.error("importJson failed", e); $("importMessage").textContent = `Erro ao importar ${name}: ${e?.message || e}`; toast(`Erro ao importar: ${e?.message || e}`, "error"); } }
window.addEventListener("error", e=>{ const list=JSON.parse(localStorage.getItem("auraLocalErrors")||"[]"); list.unshift({message:e.message,source:e.filename,line:e.lineno,time:new Date().toISOString()}); localStorage.setItem("auraLocalErrors",JSON.stringify(list.slice(0,20))); });


document.addEventListener("click", (event) => { if(event.target && event.target.id === "dashboardMemberAreaBtn") openMemberAreaAsAdmin(); });
