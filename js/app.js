(function () {
  var MV = window.MV, P = MV.providers;
  var $ = function (i) { return document.getElementById(i); };
  var ids = Object.keys(P);

  function ld(k, d) {
    try { var v = localStorage.getItem("mv:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function sv(k, v) {
    try { localStorage.setItem("mv:" + k, JSON.stringify(v)); } catch (e) {}
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function toast(t) {
    var x = $("toast");
    x.textContent = t;
    x.classList.add("on");
    setTimeout(function () { x.classList.remove("on"); }, 2600);
  }

  var convs = ld("convs", []), cur = null, ctrl = null, busy = false;

  /* ---------- modèles ---------- */
  function models(p) {
    var l = ld("models:" + p, null);
    return l && l.length ? l : P[p].models;
  }
  function fillModels() {
    var p = $("prov").value, arr = models(p), sel = $("model"), c = ld("model:" + p, arr[0]);
    sel.innerHTML = "";
    arr.forEach(function (m) { var o = el("option", "", m); o.value = m; sel.appendChild(o); });
    sel.value = arr.indexOf(c) > -1 ? c : arr[0];
  }
  async function refresh(p, silent) {
    var k = ld("key:" + p, "");
    if (!k && p !== "openrouter") { if (!silent) { openSet(); toast("Ajoute d’abord ta clé " + P[p].name); } return; }
    try {
      var l = await P[p].list(k);
      if (!l.length) throw new Error("Liste vide");
      sv("models:" + p, l);
      if ($("prov").value === p) fillModels();
      if (!silent) toast(l.length + " modèles chargés");
    } catch (e) { if (!silent) toast(e.message); }
  }

  /* ---------- rendu ---------- */
  function renderList() {
    var box = $("list");
    box.innerHTML = "";
    convs.forEach(function (c) {
      var it = el("div", "item" + (cur === c ? " on" : "")), t = el("span", "", c.title), x = el("b", "", "×");
      it.appendChild(t); it.appendChild(x);
      it.onclick = function () { cur = c; closeMenu(); renderAll(); };
      x.onclick = function (e) {
        e.stopPropagation();
        convs.splice(convs.indexOf(c), 1);
        if (cur === c) cur = null;
        sv("convs", convs); renderAll();
      };
      box.appendChild(it);
    });
  }
  function row(role, content) {
    var r = el("div", "row " + role), b = el("div", "bubble");
    if (role === "ai") { r.appendChild(el("div", "av", "✦")); b.innerHTML = MV.md(content); }
    else if (role === "user") b.textContent = content;
    else { r.appendChild(el("div", "av", "!")); b.textContent = content; }
    r.appendChild(b);
    $("chat").appendChild(r);
    return b;
  }
  function renderChat() {
    var c = $("chat");
    c.innerHTML = "";
    if (!cur || !cur.msgs.length) {
      var h = el("div", "hero");
      h.appendChild(el("div", "logo", "✦"));
      h.appendChild(el("h1", "", "Comment puis-je t’aider ?"));
      h.appendChild(el("div", "mut", "Choisis un modèle gratuit en haut, puis écris ton message."));
      var ch = el("div", "chips");
      ["Explique-moi les API en simple", "Écris une fonction JavaScript de tri", "Donne-moi un plan de projet en 5 étapes"].forEach(function (s) {
        var b = el("button", "chip", s);
        b.onclick = function () { send(s); };
        ch.appendChild(b);
      });
      h.appendChild(ch);
      c.appendChild(h);
      return;
    }
    cur.msgs.forEach(function (m) { row(m.role === "assistant" ? "ai" : "user", m.content); });
    c.scrollTop = c.scrollHeight;
  }
  function renderAll() { renderList(); renderChat(); }

  /* ---------- envoi ---------- */
  function setBusy(b) { busy = b; $("send").textContent = b ? "■" : "↑"; }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    var p = $("prov").value, m = $("model").value, k = ld("key:" + p, "");
    if (!k) { openSet(); toast("Il manque la clé " + P[p].name); return; }
    if (!cur) { cur = { id: Date.now().toString(36), title: "Nouvelle discussion", msgs: [] }; convs.unshift(cur); }
    if (!cur.msgs.length) cur.title = text.slice(0, 40);
    cur.msgs.push({ role: "user", content: text });
    $("inp").value = ""; $("inp").style.height = "auto";
    renderAll();
    var chat = $("chat"), r = el("div", "row ai"), b = el("div", "bubble"), acc = "", raf = 0;
    r.appendChild(el("div", "av", "✦"));
    b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    r.appendChild(b); chat.appendChild(r); chat.scrollTop = chat.scrollHeight;
    ctrl = new AbortController(); setBusy(true);
    function paint() {
      raf = 0;
      var near = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
      b.innerHTML = MV.md(acc);
      if (near) chat.scrollTop = chat.scrollHeight;
    }
    try {
      await P[p].stream(k, m, cur.msgs.slice(), ctrl.signal, function (d) {
        acc += d;
        if (!raf) raf = requestAnimationFrame(paint);
      });
      if (!acc) throw new Error("Réponse vide du modèle. Essaie-en un autre.");
      paint();
      cur.msgs.push({ role: "assistant", content: acc });
    } catch (e) {
      if (e.name === "AbortError") {
        if (acc) { paint(); cur.msgs.push({ role: "assistant", content: acc }); } else r.remove();
        if (!acc) cur.msgs.pop();
      } else {
        cur.msgs.pop();
        r.remove();
        row("err", e.message);
        $("inp").value = text;
      }
    }
    if (raf) cancelAnimationFrame(raf);
    setBusy(false); ctrl = null; sv("convs", convs); renderList();
  }

  /* ---------- réglages ---------- */
  function openSet() { $("set").showModal(); }
  function buildKeys() {
    var box = $("keys");
    ids.forEach(function (p) {
      var d = el("div", "kb"), i = el("input"), st = el("span", "st"), r = el("div", "r"), t = el("button", "btn", "Tester la clé"), a = el("a", "", "Obtenir une clé");
      i.type = "password"; i.placeholder = "Colle ta clé " + P[p].name; i.autocomplete = "off"; i.value = ld("key:" + p, "");
      i.oninput = function () { sv("key:" + p, i.value.trim()); st.textContent = ""; };
      a.href = P[p].link; a.target = "_blank"; a.rel = "noopener noreferrer";
      t.onclick = async function () {
        var k = i.value.trim();
        if (!k) { st.className = "st er"; st.textContent = "Colle d’abord une clé."; return; }
        st.className = "st"; st.textContent = "Test en cours…";
        try {
          var res = await P[p].test(k);
          st.className = "st ok"; st.textContent = res.msg;
          if (res.list && res.list.length) { sv("models:" + p, res.list); if ($("prov").value === p) fillModels(); }
        } catch (e) { st.className = "st er"; st.textContent = e.message; }
      };
      d.appendChild(el("b", "", P[p].name)); d.appendChild(i);
      r.appendChild(t); r.appendChild(a); r.appendChild(st); d.appendChild(r);
      box.appendChild(d);
    });
  }

  /* ---------- menu mobile ---------- */
  function closeMenu() { document.body.classList.remove("open"); }

  /* ---------- init ---------- */
  ids.forEach(function (p) { var o = el("option", "", P[p].name); o.value = p; $("prov").appendChild(o); });
  $("prov").value = ld("prov", "openrouter");
  $("prov").onchange = function () { sv("prov", this.value); fillModels(); };
  $("model").onchange = function () { sv("model:" + $("prov").value, this.value); };
  $("refresh").onclick = function () { refresh($("prov").value, false); };
  $("new").onclick = function () { cur = null; closeMenu(); renderAll(); $("inp").focus(); };
  $("openSet").onclick = function () { closeMenu(); openSet(); };
  $("closeSet").onclick = function () { $("set").close(); };
  $("menu").onclick = function () { document.body.classList.add("open"); };
  $("shade").onclick = closeMenu;
  $("send").onclick = function () { if (busy && ctrl) ctrl.abort(); else send($("inp").value); };
  $("inp").addEventListener("input", function () { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 180) + "px"; });
  $("inp").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); send(this.value); }
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".copy");
    if (!b) return;
    var code = b.closest(".code").querySelector("code").textContent;
    try { navigator.clipboard.writeText(code).then(function () { b.textContent = "Copié ✓"; setTimeout(function () { b.textContent = "Copier"; }, 1500); }); } catch (x) { toast("Copie impossible"); }
  });

  buildKeys(); fillModels(); renderAll();
  if (ld("key:" + $("prov").value, "")) refresh($("prov").value, true);
})();
