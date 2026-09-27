
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const DOC_REF = doc(db, "settings", "membershipPopup");

const DEFAULT_MEMBERSHIP_POPUP = {
  "headerText": "CYBERISDEAD / MEMBERSHIP ACCESS",
  "hero": {
    "eyebrow": "BECOME A MEMBER",
    "title": "APOIE CYBERISDEAD",
    "description": "Assine para financiar o projeto e liberar uma área exclusiva com perfil, badges, calendário, feed, magazine, vault, vídeos, downloads, descontos e comentários da rádio.",
    "imageUrl": "",
    "imageAlt": "Membership visual"
  },
  "plans": [
    {
      "badge": "🥉 APOIE",
      "price": "R$ 3,90",
      "period": "/ mês",
      "description": "Mantenha a engrenagem funcionando.",
      "benefits": [
        "Calendário da plataforma",
        "Perfil de assinante",
        "Emotes personalizados",
        "Badges de assinante",
        "Comentários da rádio",
        "Shoutout nos episódios"
      ],
      "buttonLabel": "ASSINAR",
      "buttonUrl": ""
    },
    {
      "badge": "🥈 SUPPORTER",
      "price": "R$ 8,90",
      "period": "/ mês",
      "description": "Acesso ao cofre digital e ao som.",
      "benefits": [
        "Tudo do plano Apoie",
        "Magazine digital",
        "Acesso antecipado",
        "Gravações ao vivo",
        "Vault / downloads",
        "Feed exclusivo",
        "Chave Bandcamp"
      ],
      "buttonLabel": "ASSINAR",
      "buttonUrl": ""
    },
    {
      "badge": "🥇 PREMIUM",
      "price": "R$ 14,90",
      "period": "/ mês",
      "description": "Bastidores, vídeos e vantagens reais.",
      "benefits": [
        "Tudo do Supporter",
        "Vídeos exclusivos",
        "1 ingresso grátis por ano",
        "Early access a merch",
        "Descontos permanentes"
      ],
      "buttonLabel": "ASSINAR",
      "buttonUrl": ""
    },
    {
      "badge": "🏴 CÍRCULO INTERNO",
      "price": "R$ 59,90",
      "period": "/ mês",
      "description": "15 vagas. Máxima proximidade.",
      "benefits": [
        "Tudo do Premium",
        "1 merch físico por ciclo",
        "Aula / consultoria mensal",
        "Contato direto com o projeto"
      ],
      "buttonLabel": "ASSINAR",
      "buttonUrl": ""
    }
  ],
  "purposeBlocks": [
    {
      "eyebrow": "O NOSSO PROPÓSITO",
      "title": "Tudo serve para financiar o projeto.",
      "text": "Manter o site ativo, remunerar hosts convidados, financiar a sobrevivência em turnês futuras, produzir produtos físicos como pôsteres, adesivos, roupas, magazine, vinil e outros materiais, melhorar a qualidade do site, desenvolver o aplicativo e investir nos equipamentos que fazem tudo acontecer."
    },
    {
      "eyebrow": "BASE SÓLIDA",
      "title": "Este espaço precisa continuar vivo.",
      "text": "Precisamos construir uma base sólida que ajude a manter o projeto. A criação deste site foi um dos nossos maiores esforços, e esperamos que você esteja gostando. Ao se tornar membro, você ajuda a manter este espaço para artistas e coletivos sem limite nenhum."
    }
  ],
  "flowBlocks": [
    {
      "title": "LOGIN → PAGAMENTO → ACESSO",
      "text": "Com pagamento ativo, a Member Area é liberada."
    },
    {
      "title": "CANCELAMENTO",
      "text": "Cancelar fica nas configurações do perfil do assinante."
    }
  ]
};

let state = structuredClone(DEFAULT_MEMBERSHIP_POPUP);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function normalizeConfig(data) {
  const base = clone(DEFAULT_MEMBERSHIP_POPUP);
  const cfg = {...base, ...(data || {})};
  cfg.hero = {...base.hero, ...(data?.hero || {})};
  cfg.plans = Array.isArray(data?.plans) && data.plans.length ? data.plans.map(p => ({
    badge: p.badge || "",
    price: p.price || "",
    period: p.period || "",
    description: p.description || "",
    benefits: Array.isArray(p.benefits) ? p.benefits : String(p.benefits || "").split("\n").filter(Boolean),
    buttonLabel: p.buttonLabel || "ASSINAR",
    buttonUrl: p.buttonUrl || ""
  })) : base.plans;
  cfg.purposeBlocks = Array.isArray(data?.purposeBlocks) && data.purposeBlocks.length ? data.purposeBlocks : base.purposeBlocks;
  cfg.flowBlocks = Array.isArray(data?.flowBlocks) && data.flowBlocks.length ? data.flowBlocks : base.flowBlocks;
  return cfg;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function renderPanel() {
  const panel = document.getElementById("membershipPopupPanel");
  if(!panel) return;
  panel.innerHTML = `
    <div class="mp-admin-head">
      <div>
        <p class="eyebrow">Membership Popup</p>
        <h2>Popup de planos editável</h2>
        <p class="mp-help">Edite todos os textos, planos, valores, vantagens, URLs dos botões e a imagem do popup. Salva em <b>settings/membershipPopup</b> no Firestore.</p>
      </div>
      <div class="mp-actions">
        <button class="ghost" id="mpReload">Recarregar</button>
        <button class="ghost" id="mpReset">Restaurar padrão</button>
        <button id="mpSave">Salvar popup</button>
      </div>
    </div>

    <div class="mp-grid">
      <section class="mp-card">
        <h3>Topo / Hero</h3>
        <label>Texto da barra superior<input id="mpHeaderText" value="${escapeHtml(state.headerText)}"></label>
        <label>Eyebrow<input id="mpHeroEyebrow" value="${escapeHtml(state.hero.eyebrow)}"></label>
        <label>Título<input id="mpHeroTitle" value="${escapeHtml(state.hero.title)}"></label>
        <label>Descrição<textarea id="mpHeroDescription">${escapeHtml(state.hero.description)}</textarea></label>
        <label>URL da imagem / card visual<input id="mpHeroImageUrl" value="${escapeHtml(state.hero.imageUrl)}"></label>
        <label>Alt da imagem<input id="mpHeroImageAlt" value="${escapeHtml(state.hero.imageAlt)}"></label>
      </section>

      <section class="mp-card">
        <div class="mp-row-title">
          <h3>Assinaturas / Planos</h3>
          <button class="ghost" id="mpAddPlan">Adicionar plano</button>
        </div>
        <div id="mpPlans"></div>
      </section>

      <section class="mp-card">
        <div class="mp-row-title">
          <h3>Blocos de propósito / descrições extras</h3>
          <button class="ghost" id="mpAddPurpose">Adicionar descrição</button>
        </div>
        <div id="mpPurposeBlocks"></div>
      </section>

      <section class="mp-card">
        <div class="mp-row-title">
          <h3>Rodapé do popup</h3>
          <button class="ghost" id="mpAddFlow">Adicionar bloco</button>
        </div>
        <div id="mpFlowBlocks"></div>
      </section>

      <section class="mp-card mp-wide">
        <h3>JSON avançado opcional</h3>
        <p class="mp-help">Use somente se quiser copiar/colar a estrutura inteira do popup.</p>
        <textarea id="mpJson">${escapeHtml(JSON.stringify(state, null, 2))}</textarea>
        <div class="mp-actions"><button class="ghost" id="mpApplyJson">Aplicar JSON no formulário</button></div>
      </section>
    </div>
  `;
  renderPlans();
  renderPurpose();
  renderFlow();
  bindPanel();
}

function renderPlans() {
  const root = document.getElementById("mpPlans");
  if(!root) return;
  root.innerHTML = state.plans.map((plan, index) => `
    <article class="mp-subcard" data-plan="${index}">
      <div class="mp-row-title">
        <h4>Plano ${index + 1}</h4>
        <div>
          <button class="ghost mpMovePlanUp" data-index="${index}">↑</button>
          <button class="ghost mpMovePlanDown" data-index="${index}">↓</button>
          <button class="ghost mpRemovePlan" data-index="${index}">Remover</button>
        </div>
      </div>
      <label>Nome / badge<input data-field="badge" data-index="${index}" value="${escapeHtml(plan.badge)}"></label>
      <label>Valor<input data-field="price" data-index="${index}" value="${escapeHtml(plan.price)}"></label>
      <label>Período<input data-field="period" data-index="${index}" value="${escapeHtml(plan.period)}"></label>
      <label>Descrição<textarea data-field="description" data-index="${index}">${escapeHtml(plan.description)}</textarea></label>
      <label>Vantagens / benefícios — uma por linha<textarea data-field="benefits" data-index="${index}">${escapeHtml((plan.benefits || []).join("\n"))}</textarea></label>
      <label>Texto do botão<input data-field="buttonLabel" data-index="${index}" value="${escapeHtml(plan.buttonLabel)}"></label>
      <label>URL do botão / checkout<input data-field="buttonUrl" data-index="${index}" value="${escapeHtml(plan.buttonUrl)}"></label>
    </article>
  `).join("");
}

function renderPurpose() {
  const root = document.getElementById("mpPurposeBlocks");
  if(!root) return;
  root.innerHTML = state.purposeBlocks.map((block, index) => `
    <article class="mp-subcard" data-purpose="${index}">
      <div class="mp-row-title">
        <h4>Descrição ${index + 1}</h4>
        <button class="ghost mpRemovePurpose" data-index="${index}">Remover</button>
      </div>
      <label>Eyebrow<input data-purpose-field="eyebrow" data-index="${index}" value="${escapeHtml(block.eyebrow)}"></label>
      <label>Título<input data-purpose-field="title" data-index="${index}" value="${escapeHtml(block.title)}"></label>
      <label>Texto<textarea data-purpose-field="text" data-index="${index}">${escapeHtml(block.text)}</textarea></label>
    </article>
  `).join("");
}

function renderFlow() {
  const root = document.getElementById("mpFlowBlocks");
  if(!root) return;
  root.innerHTML = state.flowBlocks.map((block, index) => `
    <article class="mp-subcard" data-flow="${index}">
      <div class="mp-row-title">
        <h4>Bloco ${index + 1}</h4>
        <button class="ghost mpRemoveFlow" data-index="${index}">Remover</button>
      </div>
      <label>Título<input data-flow-field="title" data-index="${index}" value="${escapeHtml(block.title)}"></label>
      <label>Texto<textarea data-flow-field="text" data-index="${index}">${escapeHtml(block.text)}</textarea></label>
    </article>
  `).join("");
}

function collectStateFromForm() {
  state.headerText = document.getElementById("mpHeaderText")?.value || "";
  state.hero.eyebrow = document.getElementById("mpHeroEyebrow")?.value || "";
  state.hero.title = document.getElementById("mpHeroTitle")?.value || "";
  state.hero.description = document.getElementById("mpHeroDescription")?.value || "";
  state.hero.imageUrl = document.getElementById("mpHeroImageUrl")?.value || "";
  state.hero.imageAlt = document.getElementById("mpHeroImageAlt")?.value || "";

  document.querySelectorAll("[data-field]").forEach(input => {
    const i = Number(input.dataset.index);
    const field = input.dataset.field;
    if(!state.plans[i]) return;
    if(field === "benefits") {
      state.plans[i].benefits = input.value.split("\n").map(v => v.trim()).filter(Boolean);
    } else {
      state.plans[i][field] = input.value;
    }
  });

  document.querySelectorAll("[data-purpose-field]").forEach(input => {
    const i = Number(input.dataset.index);
    const field = input.dataset.purposeField;
    if(state.purposeBlocks[i]) state.purposeBlocks[i][field] = input.value;
  });

  document.querySelectorAll("[data-flow-field]").forEach(input => {
    const i = Number(input.dataset.index);
    const field = input.dataset.flowField;
    if(state.flowBlocks[i]) state.flowBlocks[i][field] = input.value;
  });

  document.getElementById("mpJson").value = JSON.stringify(state, null, 2);
}

function bindPanel() {
  const panel = document.getElementById("membershipPopupPanel");
  if(!panel || panel.dataset.bound === "1") return;
  panel.dataset.bound = "1";

  panel.addEventListener("input", event => {
    if(event.target.matches("input, textarea") && event.target.id !== "mpJson") collectStateFromForm();
  });

  panel.addEventListener("click", async event => {
    const target = event.target;
    if(target.id === "mpSave") {
      collectStateFromForm();
      await saveConfig();
    }
    if(target.id === "mpReload") {
      await loadConfig();
    }
    if(target.id === "mpReset") {
      if(confirm("Restaurar o popup para o padrão?")) {
        state = clone(DEFAULT_MEMBERSHIP_POPUP);
        renderPanel();
      }
    }
    if(target.id === "mpApplyJson") {
      try {
        state = normalizeConfig(JSON.parse(document.getElementById("mpJson").value));
        renderPanel();
      } catch(err) {
        alert("JSON inválido: " + err.message);
      }
    }
    if(target.id === "mpAddPlan") {
      collectStateFromForm();
      state.plans.push({badge:"NOVO PLANO", price:"R$ 0,00", period:"/ mês", description:"Descrição do plano.", benefits:["Nova vantagem"], buttonLabel:"ASSINAR", buttonUrl:""});
      renderPanel();
    }
    if(target.classList.contains("mpRemovePlan")) {
      collectStateFromForm();
      state.plans.splice(Number(target.dataset.index), 1);
      renderPanel();
    }
    if(target.classList.contains("mpMovePlanUp")) {
      collectStateFromForm();
      const i = Number(target.dataset.index);
      if(i > 0) [state.plans[i-1], state.plans[i]] = [state.plans[i], state.plans[i-1]];
      renderPanel();
    }
    if(target.classList.contains("mpMovePlanDown")) {
      collectStateFromForm();
      const i = Number(target.dataset.index);
      if(i < state.plans.length - 1) [state.plans[i+1], state.plans[i]] = [state.plans[i], state.plans[i+1]];
      renderPanel();
    }
    if(target.id === "mpAddPurpose") {
      collectStateFromForm();
      state.purposeBlocks.push({eyebrow:"NOVA DESCRIÇÃO", title:"Novo título", text:"Novo texto."});
      renderPanel();
    }
    if(target.classList.contains("mpRemovePurpose")) {
      collectStateFromForm();
      state.purposeBlocks.splice(Number(target.dataset.index), 1);
      renderPanel();
    }
    if(target.id === "mpAddFlow") {
      collectStateFromForm();
      state.flowBlocks.push({title:"NOVO BLOCO", text:"Novo texto."});
      renderPanel();
    }
    if(target.classList.contains("mpRemoveFlow")) {
      collectStateFromForm();
      state.flowBlocks.splice(Number(target.dataset.index), 1);
      renderPanel();
    }
  });
}

async function loadConfig() {
  try {
    const snap = await getDoc(DOC_REF);
    state = normalizeConfig(snap.exists() ? snap.data() : DEFAULT_MEMBERSHIP_POPUP);
    renderPanel();
    console.log("[Membership Popup Admin] carregado.");
  } catch(err) {
    console.warn("[Membership Popup Admin] usando padrão/local:", err);
    try {
      const local = localStorage.getItem("cyberisdead_membership_popup_config");
      state = normalizeConfig(local ? JSON.parse(local) : DEFAULT_MEMBERSHIP_POPUP);
    } catch(e) {
      state = clone(DEFAULT_MEMBERSHIP_POPUP);
    }
    renderPanel();
  }
}

async function saveConfig() {
  try {
    await setDoc(DOC_REF, {...state, updatedAt: serverTimestamp()}, {merge:true});
    localStorage.setItem("cyberisdead_membership_popup_config", JSON.stringify(state));
    alert("Membership Popup salvo no Firestore.");
  } catch(err) {
    localStorage.setItem("cyberisdead_membership_popup_config", JSON.stringify(state));
    alert("Não consegui salvar no Firestore, mas salvei localmente neste navegador. Erro: " + err.message);
  }
}

function installStyles() {
  if(document.getElementById("membershipPopupAdminStyles")) return;
  const style = document.createElement("style");
  style.id = "membershipPopupAdminStyles";
  style.textContent = `
    #membershipPopupPanel .mp-admin-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
    #membershipPopupPanel .mp-help{font-size:12px;line-height:18px;color:#666;text-transform:none;max-width:760px}
    #membershipPopupPanel .mp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #membershipPopupPanel .mp-grid{display:grid;gap:12px}
    #membershipPopupPanel .mp-card{border:1px solid #222;background:#fff;color:#000;padding:14px;display:grid;gap:10px}
    #membershipPopupPanel .mp-wide{grid-column:1/-1}
    #membershipPopupPanel .mp-row-title{display:flex;justify-content:space-between;gap:10px;align-items:center}
    #membershipPopupPanel h2,#membershipPopupPanel h3,#membershipPopupPanel h4{margin:0;text-transform:uppercase}
    #membershipPopupPanel label{display:grid;gap:5px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#555}
    #membershipPopupPanel input,#membershipPopupPanel textarea{width:100%;border:1px solid #000;background:#fff;color:#000;padding:9px;font:inherit;font-size:13px;text-transform:none;border-radius:0}
    #membershipPopupPanel textarea{min-height:92px;resize:vertical}
    #membershipPopupPanel #mpJson{min-height:260px;font-family:monospace;font-size:12px}
    #membershipPopupPanel .mp-subcard{border:1px solid #999;padding:10px;margin:10px 0;display:grid;gap:8px}
    #membershipPopupPanel button{border:1px solid #000;background:#000;color:#fff;padding:9px 12px;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
    #membershipPopupPanel button.ghost{background:#fff;color:#000}
    #membershipPopupPanel button:hover{filter:invert(1)}
  `;
  document.head.appendChild(style);
}

function boot() {
  installStyles();
  loadConfig();
}

if(document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, {once:true});
} else {
  boot();
}
