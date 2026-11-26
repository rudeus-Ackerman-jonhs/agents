(function () {
  var MV = (window.MV = window.MV || {});

  function fail(e) {
    if (e && e.name === "AbortError") throw e;
    if (e instanceof TypeError)
      throw new Error("Requête bloquée avant d’atteindre le serveur (réseau, CORS, ou page ouverte depuis Drive). Déploie la page en HTTPS puis réessaie.");
    throw e;
  }

  async function req(url, opts) {
    try {
      var r = await fetch(url, opts);
      if (r.ok) return r;
      var t = await r.text(), m = t;
      try {
        var j = JSON.parse(t);
        m = (j.error && (j.error.message || j.error)) || j.message || t;
      } catch (e) {}
      throw new Error("Erreur " + r.status + " : " + String(typeof m === "string" ? m : JSON.stringify(m)).slice(0, 300));
    } catch (e) {
      return fail(e);
    }
  }

  async function sse(r, onData) {
    var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
    while (true) {
      var c = await rd.read();
      if (c.done) break;
      buf += dec.decode(c.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf("data:") !== 0) continue;
        var d = l.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try { onData(JSON.parse(d)); } catch (e) {}
      }
    }
  }

  function openai(id, name, base, models, link, pick) {
    var self = {
      id: id, name: name, link: link, models: models,
      async list(k) {
        var r = await req(base + "/models", { headers: k ? { Authorization: "Bearer " + k } : {} });
        var j = await r.json();
        var ids = (j.data || []).map(function (x) { return String(x.id); });
        return pick(ids);
      },
      async test(k) {
        if (id === "openrouter") {
          await req(base + "/auth/key", { headers: { Authorization: "Bearer " + k } });
          return { msg: "Clé valide" };
        }
        var l = await self.list(k);
        return { msg: "Clé valide · " + l.length + " modèles", list: l };
      },
      async stream(k, model, msgs, signal, onDelta) {
        var r = await req(base + "/chat/completions", {
          method: "POST", signal: signal,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
          body: JSON.stringify({ model: model, messages: msgs, stream: true })
        });
        await sse(r, function (x) {
          var d = x.choices && x.choices[0] && x.choices[0].delta;
          if (d && d.content) onDelta(d.content);
        });
      }
    };
    return self;
  }

  var GB = "https://generativelanguage.googleapis.com/v1beta";
  var gemini = {
    id: "gemini", name: "Google Gemini", link: "https://aistudio.google.com/apikey",
    models: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
    async list(k) {
      var r = await req(GB + "/models?pageSize=200&key=" + encodeURIComponent(k));
      var j = await r.json();
      return (j.models || [])
        .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf("generateContent") > -1; })
        .map(function (m) { return m.name.replace(/^models\//, ""); })
        .filter(function (n) { return /gemini|gemma/i.test(n); });
    },
    async test(k) {
      var l = await gemini.list(k);
      return { msg: "Clé valide · " + l.length + " modèles", list: l };
    },
    async stream(k, model, msgs, signal, onDelta) {
      var contents = msgs.map(function (m) {
        return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
      });
      var r = await req(GB + "/models/" + model + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(k), {
        method: "POST", signal: signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: contents })
      });
      await sse(r, function (x) {
        var p = x.candidates && x.candidates[0] && x.candidates[0].content && x.candidates[0].content.parts;
        (p || []).forEach(function (t) { if (t.text) onDelta(t.text); });
      });
    }
  };

  MV.providers = {
    openrouter: openai("openrouter", "OpenRouter", "https://openrouter.ai/api/v1",
      ["openrouter/free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "inclusionai/ling-3.2-flash:free"],
      "https://openrouter.ai/keys",
      function (ids) { return ["openrouter/free"].concat(ids.filter(function (i) { return /:free$/.test(i); })); }),
    groq: openai("groq", "Groq", "https://api.groq.com/openai/v1",
      ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
      "https://console.groq.com/keys",
      function (ids) { return ids.filter(function (i) { return !/whisper|guard|tts|orpheus/i.test(i); }); }),
    gemini: gemini
  };
})();
