/*
 * 出去走走 · 抓包 V5 (全量请求 + king 接口响应体)
 * ------------------------------------------------------------
 * 目的: 找出 Authorization 令牌的来源.
 *  - 请求方向: 记录发往镜像站的每个请求 (方法/地址/头/body).
 *  - 响应方向: 记录 /king/ 接口和 bushu 页面的响应头与响应体 (截断 600 字).
 * 只记录, 不修改. 日志可能含令牌/密码, 外发前注意.
 */

const TAG = "[CQZZ-V5]";

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

try {
  if (typeof $response !== "undefined" && $response) {
    const url = ($request && $request.url) || "";
    if (/\/king\/|\/bushu\//.test(url)) {
      const rbody = bodyToString($response.body, null);
      console.log(TAG + " RESPONSE " + ($response.status || "") + " " + url);
      console.log(TAG + " RESP-HEADERS: " + JSON.stringify($response.headers || {}));
      console.log(TAG + " RESP-BODY: " + rbody.slice(0, 600));
      if (/\/king\//.test(url)) {
        $notification.post("📥 V5 抓到 king 响应", "响应体已记入日志", url.slice(0, 100));
      }
    }
    $done({});
  } else {
    const url = $request.url || "";
    const method = $request.method || "";
    const body = bodyToString($request.body, $request.bodyBytes);
    console.log(TAG + " ================================");
    console.log(TAG + " " + method + " " + url);
    console.log(TAG + " HEADERS: " + JSON.stringify($request.headers || {}));
    if (body) console.log(TAG + " BODY: " + body.slice(0, 300));
    console.log(TAG + " ================================");
    $done({});
  }
} catch (e) {
  console.log(TAG + " error: " + e);
  $done({});
}
