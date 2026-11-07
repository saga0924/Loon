/*
 * 出去走走 · 抓包 V6 (通知直报版)
 * ------------------------------------------------------------
 * 请求方向: 若是 /king/ 提交请求, 直接把关键信息弹通知:
 *   phone 原文 / num / Authorization 前8位 / time 头 / body 全文(日志)
 * 只记录, 不修改. 通知里不含密码.
 */

const TAG = "[CQZZ-V6]";

function bodyToString(b, bb) {
  let body = "";
  if (typeof b === "string") body = b;
  else if (b != null) { try { body = JSON.stringify(b); } catch (e) { body = String(b); } }
  if (!body && bb) {
    try {
      const bytes = new Uint8Array(bb);
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      try { body = decodeURIComponent(escape(s)); } catch (e2) { body = s; }
    } catch (e) {}
  }
  return body;
}

function getParam(body, key) {
  const m = body.match(new RegExp("(?:^|&)" + key + "=([^&]*)"));
  if (!m) return "(无)";
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

try {
  if (typeof $response !== "undefined" && $response) {
    $done({});
  } else {
    const url = $request.url || "";
    const method = $request.method || "";
    const headers = $request.headers || {};
    const body = bodyToString($request.body, $request.bodyBytes);

    console.log(TAG + " " + method + " " + url);
    console.log(TAG + " HEADERS: " + JSON.stringify(headers));
    console.log(TAG + " BODY: " + body);

    if (/\/king\/api\/step/.test(url)) {
      const phone = getParam(body, "phone");
      const num = getParam(body, "num");
      const auth = headers["Authorization"] || headers["authorization"] || "(无)";
      const tm = headers["time"] || "(无)";
      $notification.post(
        "📤 V6 抓到提交",
        "phone=[" + phone + "] num=" + num,
        "auth=" + String(auth).slice(0, 8) + "… time=" + tm + " bodyLen=" + body.length
      );
    }
    $done({});
  }
} catch (e) {
  console.log(TAG + " error: " + e);
  $done({});
}
