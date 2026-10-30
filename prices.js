/* Finds yen prices in Tesseract.js "blocks" output. Shared by the app and the tests. */
(function (root) {
  var UNIT = /^\s*(ml|mL|ML|l|L|g|kg|mg|kcal|cal|cm|mm|m|%|個|本|枚|袋|入|食|粒|品|点|名|人|回|分|時|日|月|年|号|歳|才|件|cc)/;
  var DIGITISH = /[0-9０-９,，.．\\¥￥]$/;
  var DIGITISH_START = /^[0-9０-９,，.．円]/;

  function toAscii(s) {
    return s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[，]/g, ",").replace(/[．]/g, ".").replace(/[￥]/g, "¥").replace(/\\/g, "¥");
  }

  function taxOf(text) {
    text = text.replace(/\s+/g, "");
    if (/税込|税込み|内税|込\b/.test(text)) return "incl";
    if (/税抜|税別|本体|外税|抜/.test(text)) return "excl";
    return "unknown";
  }

  function buildLine(words) {
    // Join words, gluing pieces of one number back together when the gap is small.
    var str = "", spans = [];
    var h = 0;
    words.forEach(function (w) { h = Math.max(h, w.bbox.y1 - w.bbox.y0); });
    words.forEach(function (w, i) {
      var t = toAscii(w.text || "");
      if (i > 0) {
        var prev = words[i - 1];
        var gap = w.bbox.x0 - prev.bbox.x1;
        var glue = DIGITISH.test(toAscii(prev.text || "")) && DIGITISH_START.test(t) && gap < h * 0.45;
        if (!glue) str += " ";
      }
      spans.push({ start: str.length, end: str.length + t.length, w: w });
      str += t;
    });
    return { text: str, spans: spans, height: h };
  }

  function bboxFor(spans, a, b) {
    var box = null;
    spans.forEach(function (s) {
      if (s.end <= a || s.start >= b) return;
      var bb = s.w.bbox;
      if (!box) box = { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, conf: s.w.confidence };
      else {
        box.x0 = Math.min(box.x0, bb.x0); box.y0 = Math.min(box.y0, bb.y0);
        box.x1 = Math.max(box.x1, bb.x1); box.y1 = Math.max(box.y1, bb.y1);
        box.conf = Math.min(box.conf, s.w.confidence);
      }
    });
    return box;
  }

  var RE = /(¥\s*)?(\d{1,3}(?:[,.]\d{3})+|\d+)(\s*円)?/g;

  function find(data) {
    var out = [];
    var blocks = (data && data.blocks) || [];
    blocks.forEach(function (b) {
      var lines = [];
      (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { if (l.words && l.words.length) lines.push(l); }); });
      lines.forEach(function (l, li) {
        var line = buildLine(l.words);
        var s = line.text, m;
        RE.lastIndex = 0;
        while ((m = RE.exec(s))) {
          var pre = !!m[1], yenSuffix = !!m[3], num = m[2];
          var start = m.index, end = m.index + m[0].length;
          var before = s.charAt(start - 1), after = s.slice(end);
          if (/[\/:\-0-9]/.test(before) || /^[\/:\-]\d/.test(after)) continue;       // dates, times, ranges
          var grouped = /[,.]/.test(num);
          if (!grouped && /^\.\d/.test(after)) continue;                              // decimals are not yen
          var digits = num.replace(/[,.]/g, "");
          if (digits.length >= 8) continue;                                           // barcodes, JAN codes
          var unit = !yenSuffix && UNIT.exec(after);
          if (unit && !(grouped && unit[1] === "g")) continue;                        // 450g, 1000ml (a big 円 can read as g)
          var yen = parseInt(digits, 10);
          if (!(yen >= 10 && yen <= 9999999)) continue;
          if (digits.length > 1 && digits.charAt(0) === "0") continue;
          var box = bboxFor(line.spans, start + (m[1] ? m[1].length : 0), end);
          if (!box) continue;
          var tax = taxOf(s);
          if (tax === "unknown" && li > 0) tax = taxOf(buildLine(lines[li - 1].words).text);
          out.push({
            yen: yen, tax: tax,
            strong: pre || yenSuffix || grouped,
            conf: box.conf, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1
          });
        }
      });
    });
    // Bare numbers only count when they are among the largest text in view (the big sticker price).
    var maxH = 0;
    out.forEach(function (p) { maxH = Math.max(maxH, p.y1 - p.y0); });
    return out.filter(function (p) {
      if (p.strong) return true;
      return (p.y1 - p.y0) >= maxH * 0.7 && p.yen >= 50;
    });
  }

  root.YenPrices = { find: find };
  if (typeof module !== "undefined") module.exports = root.YenPrices;
})(typeof self !== "undefined" ? self : this);
