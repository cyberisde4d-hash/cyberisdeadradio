import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOl8WXhHyG8M2Uh9zFTwt4mClqRYO4GIc",
  authDomain: "cyberisdeadesite.firebaseapp.com",
  projectId: "cyberisdeadesite",
  storageBucket: "cyberisdeadesite.firebasestorage.app",
  messagingSenderId: "145227236840",
  appId: "1:145227236840:web:c691a4f7e31ca32cff905d",
  measurementId: "G-3QBSY750TT"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const norm = (v) => String(v || "").trim().toLowerCase();
const storage = {
  get(key, fallback){ try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback} },
  set(key, value){ try{localStorage.setItem(key, JSON.stringify(value))}catch{} }
};

let allContent = [];
let allComments = [];
let feedLimit = 6;
let activeFilter = "all";
let activeQuery = "";

const fallbackPlans = [
  {tier:"apoie", icon:"🥉", title:"APOIE CYBERISDEAD", price:"R$ 3,90 / mês", subtitle:"Mantenha a engrenagem funcionando e faça parte da base.", sortOrder:1, active:true, checkoutUrl:"", benefits:["Calendário da Plataforma","Perfil de Assinante Exclusivo","Emotes Personalizados","Distintivos de Assinante","Interação na Rádio","Shoutout no final dos episódios"]},
  {tier:"supporter", icon:"🥈", title:"CYBERISDEAD SUPPORTER", price:"R$ 8,90 / mês", subtitle:"Para os verdadeiros. Acesso ao cofre digital e ao som.", sortOrder:2, featured:true, active:true, checkoutUrl:"", benefits:["Tudo do plano Apoie","CYBERISDEAD MAGAZINE digital","Acesso Antecipado","Gravações ao Vivo","Downloads Atualizados","Feed Exclusivo","Chave do Bandcamp"]},
  {tier:"premium", icon:"🥇", title:"CYBERISDEAD PREMIUM", price:"R$ 14,90 / mês", subtitle:"Acesso profundo aos bastidores e vantagens reais.", sortOrder:3, active:true, checkoutUrl:"", benefits:["Tudo do Supporter","Vídeos Exclusivos","1 ingresso grátis por ano","Early Access a Merch","Descontos permanentes no merch"]},
  {tier:"circulo", icon:"🏴", title:"O CÍRCULO INTERNO", price:"R$ 59,90 / mês", subtitle:"Apenas 15 vagas. O nível máximo de proximidade.", sortOrder:4, active:true, checkoutUrl:"", benefits:["Tudo do Premium","1 Merch Físico Garantido por ciclo","Consultoria / Aula Particular mensal","Acesso direto aos bastidores"]}
];

async function getAll(col){
  try{
    const snap = await getDocs(collection(db,col));
    return snap.docs.map(d => ({id:d.id,...d.data()}));
  }catch(e){
    console.warn("membership load failed", col, e);
    return [];
  }
}

function injectMembershipUI(){
  const section = $("membership");
  if(!section || $("membershipTools")) return;

  const plans = $("membershipPlans");
  plans?.insertAdjacentHTML("afterend", `
    <div class="membership-checkout-panel" id="membershipCheckoutPanel" hidden>
      <div>
        <small>subscription preview</small>
        <b id="checkoutPlanName">Plano</b>
        <span id="checkoutPlanPrice">R$ 0 / mês</span>
      </div>
      <div class="membership-recurring-total">
        <span>Recurring total</span>
        <strong id="checkoutRecurringTotal">R$ 0 / mês</strong>
      </div>
      <a id="checkoutRealLink" href="#" target="_blank" rel="noopener">Continuar assinatura</a>
      <button type="button" data-close-checkout>×</button>
    </div>
  `);

  const feed = $("membershipFeed");
  feed?.insertAdjacentHTML("beforebegin", `
    <div class="membership-tools" id="membershipTools">
      <form class="membership-search" id="membershipSearchForm">
        <input id="membershipSearchInput" type="search" placeholder="Buscar no feed, vault, magazine, vídeos..." autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <div class="membership-filters" id="membershipFilters">
        <button data-member-filter="all" class="active">All</button>
        <button data-member-filter="feed">Feed</button>
        <button data-member-filter="magazine">Magazine</button>
        <button data-member-filter="vault">Vault</button>
        <button data-member-filter="video">Videos</button>
        <button data-member-filter="download">Downloads</button>
      </div>
    </div>
  `);

  section.insertAdjacentHTML("beforeend", `
    <article class="membership-comments-box" id="membershipCommentsBox">
      <div class="membership-box-head"><span>Radio Comments</span><small>supporter interaction</small></div>
      <form class="membership-comment-form" id="membershipCommentForm">
        <div class="grid2">
          <input name="authorName" placeholder="Nome / Apelido" required>
          <input name="plan" placeholder="Plano / badge" value="supporter">
        </div>
        <textarea name="text" placeholder="Comentário para a rádio / episódio" required></textarea>
        <input name="attachmentUrl" placeholder="Imagem, áudio ou link opcional">
        <div class="membership-form-actions">
          <button type="submit">Enviar comentário</button>
          <span class="membership-form-response" id="membershipCommentResponse"></span>
        </div>
      </form>
      <div class="membership-comments-list" id="membershipCommentsList"></div>
    </article>
  `);
}

function savedIds(){
  return storage.get("cyberisdead_saved_member_content", []);
}
function toggleSaved(id){
  const ids = new Set(savedIds());
  ids.has(id) ? ids.delete(id) : ids.add(id);
  storage.set("cyberisdead_saved_member_content", [...ids]);
  renderFeed(allContent);
}

function renderPlans(items){
  const el = $("membershipPlans");
  if(!el) return;
  const plans = (items.length ? items : fallbackPlans).filter(p => p.active !== false).sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
  el.innerHTML = plans.map(p => {
    const benefits = Array.isArray(p.benefits) ? p.benefits : [];
    const url = p.checkoutUrl || p.url || "";
    return `<article class="membership-plan ${p.featured ? "featured" : ""}">
      <div class="membership-plan-top"><span>${esc(p.icon || "")}</span><small>${esc(p.tier || "")}</small></div>
      <h3>${esc(p.title || "Plano")}</h3>
      <strong>${esc(p.price || "")}</strong>
      <p>${esc(p.subtitle || p.description || "")}</p>
      <ul>${benefits.map(b => `<li>${esc(b)}</li>`).join("")}</ul>
      <button class="membership-cta" type="button" data-plan-checkout="${esc(url)}" data-plan-name="${esc(p.title || "Plano")}" data-plan-price="${esc(p.price || "")}">${url ? "Assinar" : "Em breve"}</button>
    </article>`;
  }).join("");
}

function renderCalendar(items){
  const el = $("membershipCalendar");
  if(!el) return;
  const rows = items.filter(i => (i.status || "published") === "published").sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).slice(0,8);
  el.innerHTML = rows.length ? rows.map(i => `<article class="membership-item calendar">
    <small>${esc([i.date,i.time,i.type].filter(Boolean).join(" / "))}</small>
    <b>${esc(i.title || "")}</b>
    <p>${esc(i.description || "")}</p>
    ${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">Abrir</a>` : ""}
  </article>`).join("") : `<p class="membership-empty">Calendário em atualização.</p>`;
}

function contentMatches(item){
  const t = norm(item.type || "");
  const hay = norm([item.title,item.excerpt,item.body,item.type,item.minimumPlan,(item.tags||[]).join(" ")].join(" "));
  const filterOk = activeFilter === "all" || t.includes(activeFilter) || (activeFilter === "download" && item.downloadUrl);
  const queryOk = !activeQuery || hay.includes(activeQuery);
  return filterOk && queryOk;
}

function renderFeed(items){
  const el = $("membershipFeed");
  if(!el) return;
  allContent = Array.isArray(items) ? items : allContent;
  const saved = new Set(savedIds());
  const rows = allContent.filter(i => (i.status || "published") === "published").filter(contentMatches);
  const page = rows.slice(0, feedLimit);
  el.innerHTML = page.length ? page.map(i => {
    const tags = Array.isArray(i.tags) ? i.tags.slice(0,4) : [];
    const id = esc(i.id || i.title || crypto.randomUUID());
    return `<article class="membership-item ${i.cover ? "has-cover" : ""}" data-member-item="${id}">
      ${i.cover ? `<div class="membership-item-cover" style="background-image:url('${esc(i.cover)}')"></div>` : ""}
      <small>${esc([i.type,i.minimumPlan].filter(Boolean).join(" / "))}</small>
      <b>${esc(i.title || "")}</b>
      <p>${esc(i.excerpt || i.body || "")}</p>
      ${tags.length ? `<div class="membership-tags">${tags.map(t=>`<span>${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="membership-item-actions">
        ${i.downloadUrl ? `<a href="${esc(i.downloadUrl)}" target="_blank" rel="noopener">Download</a>` : ""}
        ${i.mediaUrl ? `<a href="${esc(i.mediaUrl)}" target="_blank" rel="noopener">Open Media</a>` : ""}
        <button type="button" data-save-member="${id}">${saved.has(i.id) ? "Saved" : "Save"}</button>
      </div>
    </article>`;
  }).join("") : `<p class="membership-empty">Nenhum conteúdo encontrado.</p>`;
  if(rows.length > feedLimit){
    el.insertAdjacentHTML("beforeend", `<button class="membership-loadmore" type="button" data-load-more-members>More</button>`);
  }
}

function renderComments(){
  const el = $("membershipCommentsList");
  if(!el) return;
  const local = storage.get("cyberisdead_local_member_comments", []);
  const rows = [...local, ...allComments].slice(0,12);
  el.innerHTML = rows.length ? rows.map(c => `<article class="member-comment">
    <div><b>${esc(c.authorName || "Membro")}</b><small>${esc(c.plan || c.badge || "supporter")}</small></div>
    <p>${esc(c.text || c.message || "")}</p>
    ${c.attachmentUrl ? `<a href="${esc(c.attachmentUrl)}" target="_blank" rel="noopener">Attachment</a>` : ""}
  </article>`).join("") : `<p class="membership-empty">Seja o primeiro a comentar.</p>`;
}

async function submitComment(form){
  const response = $("membershipCommentResponse");
  const data = Object.fromEntries(new FormData(form).entries());
  if(!data.authorName || !data.text){
    response.textContent = "Preencha nome e comentário.";
    response.className = "membership-form-response error";
    return;
  }
  response.textContent = "Enviando...";
  response.className = "membership-form-response loading";
  const payload = {...data, target:"radio", source:"membership", status:"pending", createdAt:serverTimestamp()};
  try{
    await addDoc(collection(db,"comments"), payload);
    response.textContent = "Comentário enviado.";
    response.className = "membership-form-response success";
    form.reset();
    allComments = await getAll("comments");
  }catch(e){
    const local = storage.get("cyberisdead_local_member_comments", []);
    local.unshift({...data, createdAt:Date.now()});
    storage.set("cyberisdead_local_member_comments", local);
    response.textContent = "Salvo localmente. Ajuste as rules para publicar online.";
    response.className = "membership-form-response success";
  }
  renderComments();
}

function bindMembershipUI(){
  document.addEventListener("submit", e => {
    if(e.target?.id === "membershipSearchForm"){
      e.preventDefault();
      activeQuery = norm($("membershipSearchInput")?.value || "");
      feedLimit = 6;
      renderFeed(allContent);
    }
    if(e.target?.id === "membershipCommentForm"){
      e.preventDefault();
      submitComment(e.target);
    }
  });

  document.addEventListener("input", e => {
    if(e.target?.id === "membershipSearchInput"){
      activeQuery = norm(e.target.value);
      feedLimit = 6;
      renderFeed(allContent);
    }
  });

  document.addEventListener("click", e => {
    const filter = e.target.closest("[data-member-filter]");
    if(filter){
      activeFilter = filter.dataset.memberFilter || "all";
      feedLimit = 6;
      document.querySelectorAll("[data-member-filter]").forEach(b=>b.classList.toggle("active", b === filter));
      renderFeed(allContent);
    }

    const more = e.target.closest("[data-load-more-members]");
    if(more){
      feedLimit += 6;
      renderFeed(allContent);
    }

    const save = e.target.closest("[data-save-member]");
    if(save) toggleSaved(save.dataset.saveMember);

    const checkout = e.target.closest("[data-plan-checkout]");
    if(checkout){
      const panel = $("membershipCheckoutPanel");
      const url = checkout.dataset.planCheckout || "";
      $("checkoutPlanName").textContent = checkout.dataset.planName || "Plano";
      $("checkoutPlanPrice").textContent = checkout.dataset.planPrice || "";
      $("checkoutRecurringTotal").textContent = checkout.dataset.planPrice || "";
      const link = $("checkoutRealLink");
      link.href = url || "#";
      link.textContent = url ? "Continuar assinatura" : "Checkout ainda não configurado";
      link.toggleAttribute("aria-disabled", !url);
      panel.hidden = false;
      panel.scrollIntoView({behavior:"smooth", block:"center"});
    }

    if(e.target.closest("[data-close-checkout]")){
      $("membershipCheckoutPanel").hidden = true;
    }
  });
}

async function bootMembership(){
  injectMembershipUI();
  bindMembershipUI();
  const [plans, calendar, content, comments] = await Promise.all([
    getAll("membershipPlans"),
    getAll("calendarEvents"),
    getAll("memberContent"),
    getAll("comments")
  ]);
  allComments = comments.filter(c => c.status !== "hidden");
  renderPlans(plans);
  renderCalendar(calendar);
  renderFeed(content);
  renderComments();
}

bootMembership();
