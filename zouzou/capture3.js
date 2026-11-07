/*
 * 出去走走 · 抓包 V4 (完整请求头 + 页面 Set-Cookie)
 * ------------------------------------------------------------
 * 目的: 对比浏览器真实提交与脚本提交的差异.
 *  - http-request 时: 打印完整请求头 (JSON) 和 body.
 *  - http-response 时 (打开 bushu 页面): 打印响应头里的 Set-Cookie.
 * 只记录, 不修改. 日志含密码/Cookie 值, 外发前请把值涂掉 (保留名字).
 */

const TAG = "[CQZZ-V4]";

function dumpHeaders(h) {
  try { return JSON.stringify(h || {}); } catch (e) { return String(h); }
}

try {
  if (typeof $response !== "undefined" && $response) {
    // ---- 响应方向: 只关心页面下发的 Set-Cookie ----
    const rh = $response.headers || {};
    let setCookie = "";
    Object.keys(rh).forEach(function (k) {
      if (/^set-cookie$/i.test(k)) setCookie = rh[k];
    });
    const url = ($request && $request.url) || "";
    if (setCookie) {
      console.log(TAG + " RESPONSE " + url);
      console.log(TAG + " Set-Cookie: " + setCookie);
      $notification.post("🍪 V4 抓到页面 Cookie", "已记入日志", url.slice(0, 100));
    }
    $done({});
  } else {
    // ---- 请求方向: 完整请求头 + body ----
    const url = $request.url || "";
    const method = $request.method || "";
    let body = "";
    if (typeof $request.body === "string") body = $request.body;
    else if ($request.body != null) { try { body = JSON.stringify($request.body); } catch (e) { body = String($request.body); } }
    if (!body && $request.bodyBytes) {
      try {
        const bytes = new Uint8Array($request.bodyBytes);
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        try { body = decodeURIComponent(escape(s)); } catch (e2) { body = s; }
      } catch (e) {}
    }
    console.log(TAG + " ================================");
    console.log(TAG + " " + method + " " + url);
    console.log(TAG + " HEADERS: " + dumpHeaders($request.headers));
    console.log(TAG + " BODY: " + body);
    console.log(TAG + " ================================");
    if (/\/king\//.test(url)) {
      $notification.post("🎯 V4 抓到 king 请求", "完整请求头已记入日志", url.slice(0, 100));
    }
    $done({});
  }
} catch (e) {
  console.log(TAG + " error: " + e);
  $done({});
}
