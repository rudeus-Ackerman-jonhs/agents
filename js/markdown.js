(function () {
  var MV = (window.MV = window.MV || {});
  var LI = /^\s*([-*+]|\d+\.)\s+/;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inl(s) {
    var st = [];
    s = esc(s).replace(/`([^`]+)`/g, function (m, c) {
      st.push(c);
      return "\u0001" + (st.length - 1) + "\u0001";
    });
    s = s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0001(\d+)\u0001/g, function (m, i) {
      return "<code>" + st[i] + "</code>";
    });
  }

  function cells(r) {
    return r.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
  }

  function isBlock(l) {
    return !l.trim() || /^```/.test(l) || /^#{1,4}\s/.test(l) || /^>/.test(l) || LI.test(l) || /^\s*\|.*\|\s*$/.test(l);
  }

  MV.md = function (src) {
    var L = src.replace(/\r/g, "").split("\n"), o = [], i = 0, m;
    while (i < L.length) {
      var l = L[i];
      if ((m = l.match(/^```\s*([\w+#.-]*)/))) {
        var c = [];
        i++;
        while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]);
        i++;
        o.push('<div class="code"><div class="ch"><span>' + esc(m[1] || "code") + '</span><button class="copy">Copier</button></div><pre><code>' + esc(c.join("\n")) + "</code></pre></div>");
        continue;
      }
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) {
        var n = m[1].length + 1;
        o.push("<h" + n + ">" + inl(m[2]) + "</h" + n + ">");
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { o.push("<hr>"); i++; continue; }
      if (/^>/.test(l)) {
        var q = [];
        while (i < L.length && /^>/.test(L[i])) q.push(L[i++].replace(/^>\s?/, ""));
        o.push("<blockquote>" + inl(q.join(" ")) + "</blockquote>");
        continue;
      }
      if (LI.test(l)) {
        var ol = /^\s*\d+\./.test(l), it = [];
        while (i < L.length && LI.test(L[i])) it.push("<li>" + inl(L[i++].replace(LI, "")) + "</li>");
        o.push((ol ? "<ol>" : "<ul>") + it.join("") + (ol ? "</ol>" : "</ul>"));
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}/.test(L[i + 1])) {
        var h = cells(l).map(function (x) { return "<th>" + inl(x) + "</th>"; }).join("");
        var rows = [];
        i += 2;
        while (i < L.length && /^\s*\|/.test(L[i]))
          rows.push("<tr>" + cells(L[i++]).map(function (x) { return "<td>" + inl(x) + "</td>"; }).join("") + "</tr>");
        o.push('<div class="tw"><table><tr>' + h + "</tr>" + rows.join("") + "</table></div>");
        continue;
      }
      var p = [];
      while (i < L.length && !isBlock(L[i])) p.push(L[i++]);
      if (!p.length) p.push(L[i++]);
      o.push("<p>" + inl(p.join("\n")).replace(/\n/g, "<br>") + "</p>");
    }
    return o.join("");
  };
})();
