
(() => {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  let deferredPrompt = null;

  const state = {
    items: [],
    savedKey: "vlaeba_proforma_last",
    seqKey: "vlaeba_proforma_seq",
    banksKey: "vlaeba_banks",
    qrKey: "vlaeba_qr_img"
  };

  const fmt = (n) => {
    const cur = $("#currency").value;
    const map = {PEN: "es-PE", USD: "en-US", EUR: "de-DE"};
    const sym = {PEN:"S/ ", USD:"$ ", EUR:"€ "}[cur] || "";
    if (isNaN(n)) n = 0;
    return sym + new Intl.NumberFormat(map[cur] || "es-PE", {minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
  };

  function newItem(i){ return { idx:i, code:"", desc:"", qty:1, unit:"NIU", pu:0, dscto:0 }; }

  function redraw(){
    const tbody = $("#itemsBody"); tbody.innerHTML = "";
    state.items.forEach((it, i) => {
      it.idx = i+1;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.idx}</td>
        <td><input value="${it.code||""}"></td>
        <td class="col-desc"><textarea rows="2">${it.desc||""}</textarea></td>
        <td><input class="num" type="number" min="0" step="0.01" value="${it.qty}"></td>
        <td>
          <select>
            <option>NIU</option><option>PZA</option><option>CJ</option><option>KG</option><option>LT</option>
            <option>MT</option><option>PAR</option><option>HRS</option><option>SERV</option>
          </select>
        </td>
        <td><input class="num" type="number" step="0.01" value="${it.pu}"></td>
        <td><input class="num" type="number" min="0" max="1" step="0.01" value="${it.dscto}"></td>
        <td class="importe"></td>
        <td class="no-print"><button title="Eliminar">✕</button></td>`;
      const [code, desc, qty, unit, pu, ds, imp, delbtn] = [
        tr.children[1].firstChild, tr.children[2].firstChild, tr.children[3].firstChild,
        tr.children[4].firstChild, tr.children[5].firstChild, tr.children[6].firstChild,
        tr.children[7], tr.children[8].firstChild
      ];
      code.addEventListener("input", e=>it.code = e.target.value);
      desc.addEventListener("input", e=>it.desc = e.target.value);
      qty.addEventListener("input", e=>{it.qty = parseFloat(e.target.value||0); recalc();});
      unit.value = it.unit || "NIU";
      unit.addEventListener("change", e=>it.unit = e.target.value);
      pu.addEventListener("input", e=>{it.pu = parseFloat(e.target.value||0); recalc();});
      ds.addEventListener("input", e=>{it.dscto = parseFloat(e.target.value||0); recalc();});
      delbtn.addEventListener("click", ()=>{ state.items.splice(i,1); redraw(); recalc(); });
      tr.dataset.index = i;
      $("#itemsBody").appendChild(tr);
    });
    recalc();
  }

  function calcItem(it){
    const q = parseFloat(it.qty)||0, pu = parseFloat(it.pu)||0, ds = parseFloat(it.dscto)||0;
    return q * pu * (1 - ds);
  }

  function recalc(){
    const rows = $$("#itemsBody tr");
    let subtotal = 0;
    rows.forEach((tr, i) => {
      const it = state.items[i];
      const importe = calcItem(it);
      subtotal += importe;
      tr.querySelector(".importe").textContent = fmt(importe);
    });
    const igvPct = parseFloat($("#igv").value||0);
    const igvAmt = subtotal * igvPct;
    const otros = parseFloat($("#otros").value||0);
    $("#subtotal").textContent = fmt(subtotal);
    $("#igvAmt").textContent = fmt(igvAmt);
    $("#total").textContent = fmt(subtotal + igvAmt + otros);
    buildWaLink();
  }

  function addRow(){ state.items.push(newItem(state.items.length+1)); redraw(); }
  function clearItems(){ state.items = []; for(let i=0;i<10;i++) addRow(); }

  function todayISO(){
    const d = new Date();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function loadDefault(){
    $("#pfDate").value = todayISO();
    $("#pfValidity").value = 7;
    $("#currency").value = "PEN";
    $("#igv").value = 0.18;
    $("#otros").value = 0;
    seqEnsure();
    if(!$("#pfNumber").value) $("#pfNumber").value = genNumber();
    clearItems();
    loadBanks();
    loadQr();
  }

  function genNumber(){
    const year = new Date().getFullYear();
    const seq = seqNext();
    return `VLA-${year}-${String(seq).padStart(4,'0')}`;
  }
  function seqEnsure(){
    if(!localStorage.getItem(state.seqKey)){
      localStorage.setItem(state.seqKey, JSON.stringify({year:new Date().getFullYear(), seq:0}));
    }
  }
  function seqNext(){
    const obj = JSON.parse(localStorage.getItem(state.seqKey) || '{"year":0,"seq":0}');
    const year = new Date().getFullYear();
    if (obj.year !== year){ obj.year = year; obj.seq = 0; }
    obj.seq += 1;
    localStorage.setItem(state.seqKey, JSON.stringify(obj));
    return obj.seq;
  }

  function save(){
    const data = {
      pfNumber: $("#pfNumber").value,
      pfDate: $("#pfDate").value,
      pfValidity: $("#pfValidity").value,
      currency: $("#currency").value,
      client: {
        name: $("#clName").value, id: $("#clId").value, address: $("#clAddress").value,
        contact: $("#clContact").value, contact2: $("#clContact2").value
      },
      cond: {
        val: $("#condValidez").value, ent: $("#condEntrega").value, lug: $("#condLugar").value,
        pag: $("#condPago").value, obs: $("#condObs").value
      },
      igv: parseFloat($("#igv").value||0),
      otros: parseFloat($("#otros").value||0),
      items: state.items
    };
    localStorage.setItem(state.savedKey, JSON.stringify(data));
    alert("Proforma guardada localmente.");
  }
  function load(){
    const raw = localStorage.getItem(state.savedKey);
    if(!raw){ alert("No hay una proforma guardada."); return; }
    const data = JSON.parse(raw);
    $("#pfNumber").value = data.pfNumber || "";
    $("#pfDate").value = data.pfDate || todayISO();
    $("#pfValidity").value = data.pfValidity || 7;
    $("#currency").value = data.currency || "PEN";
    $("#clName").value = data.client?.name || "";
    $("#clId").value = data.client?.id || "";
    $("#clAddress").value = data.client?.address || "";
    $("#clContact").value = data.client?.contact || "";
    $("#clContact2").value = data.client?.contact2 || "";
    $("#condValidez").value = data.cond?.val || "";
    $("#condEntrega").value = data.cond?.ent || "";
    $("#condLugar").value = data.cond?.lug || "";
    $("#condPago").value = data.cond?.pag || "";
    $("#condObs").value = data.cond?.obs || "";
    $("#igv").value = data.igv ?? 0.18;
    $("#otros").value = data.otros ?? 0;
    state.items = data.items || [];
    redraw();
  }
  function exportJSON(){
    const raw = localStorage.getItem(state.savedKey);
    if(!raw){ alert("Guarda la proforma antes de exportar."); return; }
    const blob = new Blob([raw], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ($("#pfNumber").value || "proforma") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = (e) => {
      try{ localStorage.setItem(state.savedKey, e.target.result); load(); alert("Proforma importada."); }
      catch(err){ alert("Archivo inválido."); }
    };
    reader.readAsText(file);
  }

  // Banks management
  function bankRow(b={bank:"", acct:"", cci:"", currency:"PEN"}){
    const div = document.createElement("div");
    div.className = "bank";
    div.innerHTML = `
      <div class="row"><span>Banco</span><input value="${b.bank}"></div>
      <div class="row"><span>Cuenta</span><input value="${b.acct}" placeholder="N° de cuenta"></div>
      <div class="row"><span>CCI</span><input value="${b.cci}" placeholder="Código interbancario"></div>
      <div class="row"><span>Moneda</span>
        <select>
          <option ${b.currency==="PEN"?"selected":""}>PEN</option>
          <option ${b.currency==="USD"?"selected":""}>USD</option>
          <option ${b.currency==="EUR"?"selected":""}>EUR</option>
        </select>
      </div>
      <div class="row"><span></span><button class="no-print" data-del>Eliminar</button></div>`;
    div.querySelector("[data-del]").addEventListener("click", ()=>{ div.remove(); });
    return div;
  }
  function loadBanks(){
    const list = $("#banksList"); list.innerHTML = "";
    const arr = JSON.parse(localStorage.getItem(state.banksKey) || "[]");
    if (arr.length === 0){
      // Provide one blank row
      list.appendChild(bankRow());
    } else {
      arr.forEach(b=> list.appendChild(bankRow(b)));
    }
  }
  function saveBanks(){
    const list = $("#banksList");
    const rows = $$(".bank", list);
    const arr = rows.slice(0,3).map(div => {
      const inputs = $$("input, select", div);
      return {bank: inputs[0].value.trim(), acct: inputs[1].value.trim(), cci: inputs[2].value.trim(), currency: inputs[3].value};
    }).filter(b => b.bank || b.acct || b.cci);
    localStorage.setItem(state.banksKey, JSON.stringify(arr));
    alert("Bancos guardados.");
  }

  // QR Image storage
  function loadQr(){
    const data = localStorage.getItem(state.qrKey);
    const img = $("#qrImg");
    if (data){ img.src = data; $("#qrNote").textContent = "QR listo para impresión."; }
    else { img.removeAttribute("src"); $("#qrNote").textContent = "Sube un QR (Yape / Plin / pasarela) o genera un enlace de WhatsApp."; }
  }
  function saveQrFromFile(file){
    const reader = new FileReader();
    reader.onload = e => {
      localStorage.setItem(state.qrKey, e.target.result);
      loadQr();
    };
    reader.readAsDataURL(file);
  }
  function clearQr(){ localStorage.removeItem(state.qrKey); loadQr(); }

  // WhatsApp link helpers
  function buildWaLink(){
    const num = $("#pfNumber").value || "VLA";
    const totalTxt = $("#total").textContent;
    const currency = $("#currency").value;
    const cliente = $("#clName").value || "";
    const txt = `Hola, soy ${cliente}. Solicito pago de la proforma ${num}. Total ${totalTxt}. Por favor confirmar.`;
    // Perú: +51 992437312
    const phone = "51992437312";
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(txt);
    $("#waLink").value = url;
    return url;
  }

  // PWA install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#installBtn").disabled = false;
  });

  function install(){
    if (deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(()=> deferredPrompt = null);
    } else {
      alert("Para instalar: Usa el menú del navegador ► Añadir a pantalla de inicio.");
    }
  }

  // Wire events
  window.addEventListener("DOMContentLoaded", () => {
    $("#addRowBtn").addEventListener("click", addRow);
    $("#clearItemsBtn").addEventListener("click", clearItems);
    $("#printBtn").addEventListener("click", () => window.print());
    $("#saveBtn").addEventListener("click", save);
    $("#loadBtn").addEventListener("click", load);
    $("#exportBtn").addEventListener("click", exportJSON);
    $("#newBtn").addEventListener("click", () => { loadDefault(); $("#pfNumber").value = genNumber(); recalc(); });
    $("#importFile").addEventListener("change", (e)=>{
      if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value = "";
    });
    $("#currency").addEventListener("change", recalc);
    $("#igv").addEventListener("input", recalc);
    $("#otros").addEventListener("input", recalc);

    // Banks
    $("#addBankBtn").addEventListener("click", () => {
      const list = $("#banksList");
      if ($$(".bank", list).length >= 3){ alert("Máximo 3 bancos."); return; }
      list.appendChild(bankRow());
    });
    $("#saveBanksBtn").addEventListener("click", saveBanks);

    // QR
    $("#qrFile").addEventListener("change", (e)=>{ if(e.target.files[0]) saveQrFromFile(e.target.files[0]); e.target.value = ""; });
    $("#clearQrBtn").addEventListener("click", clearQr);
    $("#waBtn").addEventListener("click", () => { const url = buildWaLink(); window.open(url, "_blank"); });
    $("#copyWaBtn").addEventListener("click", () => { const url = buildWaLink(); navigator.clipboard?.writeText(url); alert("Enlace WhatsApp copiado."); });

    // Install
    $("#installBtn").addEventListener("click", install);
    $("#installBtn").disabled = true;

    loadDefault();
  });

  // PWA SW register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
})();
