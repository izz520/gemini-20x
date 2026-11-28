/**
 * g1-ultra · Shadowrocket 响应改写 + 远程诊断
 *
 * 诊断结果会 POST 到 webhook，不用再去翻 App 里的实时日志。
 * 日志里依然有 [g1] 前缀的输出，两套都保留。
 */
"use strict";

/* ============ 0. 开关 ============ */
var DIAG = true;
var REPORT_URL = "https://webhook.site/bad67ff2-2c22-4d6d-bfba-ecb841296843";

/* ============ 1. 字符串替换（换号后改这里） ============ */
var REPLACE = [
  // 大佬那套：Ultra 的 iOS SKU 去掉后缀，指向同容量的另一定价档
  ["g1.ios.20tb.m.v2", "g1.ios.20tb.m"],
  ["g1.ios.30tb.ai.pro.m", "g1.ios.30tb.m"]
];

/* ============ 2. 正则替换（改价格用） ============ */
var REGEX = [
  // ["\"price_amount_micros\":[0-9]+", "\"price_amount_micros\":1450000000"]
];

/* ============ 3. 上报 ============ */
function report(text) {
  try {
    if (typeof $httpClient === "undefined") {
      console.log("[g1] 无 $httpClient，跳过上报");
      return;
    }
    $httpClient.post({
      url: REPORT_URL,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: text
    }, function (err, resp, data) {
      console.log("[g1] report -> " + (err ? ("err " + err) : (resp && resp.status)));
    });
  } catch (e) {
    console.log("[g1] report exception " + e);
  }
}

/* ============ 4. 主逻辑 ============ */
var body = $response && $response.body;
var url = ($request && $request.url) || "?";

if (!body || typeof body !== "string") {
  console.log("[g1] 无 body " + url);
  $done({});
} else {
  console.log("[g1] 命中 " + url + "  body=" + body.length + "B");

  var summary = ["URL: " + url, "BODY: " + body.length + "B"];

  if (DIAG) {
    var ids = {}, list = body.match(/g1\.[a-z0-9._]{2,40}/g) || [];
    for (var k = 0; k < list.length; k++) ids[list[k]] = 1;

    var pr = body.match(/[¥$€]\s?[0-9][0-9,.]*/g) || [];
    var seen = {}, uniqPrice = [];
    for (var j = 0; j < pr.length; j++) {
      if (!seen[pr[j]]) { seen[pr[j]] = 1; uniqPrice.push(pr[j]); }
    }

    var idStr = Object.keys(ids).join(",") || "(无)";
    var prStr = uniqPrice.slice(0, 20).join(",") || "(无)";

    console.log("[g1] productIds: " + idStr);
    console.log("[g1] prices: " + prStr);

    summary.push("IDS: " + idStr);
    summary.push("PRICES: " + prStr);

    // iOS IAP 产品：把每个 g1.ios.* 前后 260 字符切出来，用于配对价格
    if (/g1\.ios\./.test(body)) {
      var re2 = /g1\.ios\.[a-z0-9._]+/g, seen2 = {}, seg, m2, parts = [];
      while ((m2 = re2.exec(body)) !== null) {
        if (seen2[m2[0]]) continue;
        seen2[m2[0]] = 1;
        seg = body.slice(Math.max(0, m2.index - 180), Math.min(body.length, m2.index + 300));
        parts.push("### " + m2[0] + "\n" + seg);
      }
      summary.push("IAP-SEGMENTS:");
      summary.push(parts.join("\n\n").slice(0, 14000));
    }
  }

  var hits = 0, i;

  for (i = 0; i < REPLACE.length; i++) {
    var from = REPLACE[i][0], to = REPLACE[i][1];
    if (body.indexOf(from) !== -1) {
      var n = body.split(from).length - 1;
      body = body.split(from).join(to);
      hits += n;
      console.log("[g1] " + from + " -> " + to + " x" + n);
    }
  }

  for (i = 0; i < REGEX.length; i++) {
    var rx = new RegExp(REGEX[i][0], "g");
    var m = body.match(rx);
    if (m) {
      body = body.replace(rx, REGEX[i][1]);
      hits += m.length;
      console.log("[g1] /" + REGEX[i][0] + "/ x" + m.length);
    }
  }

  summary.push("HITS: " + hits);
  console.log(hits ? "[g1] 共替换 " + hits + " 处" : "[g1] 未命中任何规则");

  if (DIAG) report(summary.join("\n"));

  $done(hits ? { body: body } : {});
}
