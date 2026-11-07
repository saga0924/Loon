/*
 * 出去走走 · 提交抓包 v3 (诊断版)
 * 记录发往镜像站的每一个请求, 包含 body 诊断信息.
 * 只记录, 不修改请求. 日志含密码明文, 外发前请涂掉密码值.
 */

try {
  const url = $request.url || "";
  const method = $request.method || "";
  const headers = $request.headers || {};

  let body = "";
  let bodyInfo = "";
  if (typeof $request.body === "string") {
    body = $request.body;
    bodyInfo = "body=string len=" + body.length;
  } else if ($request.body != null) {
    try { body = JSON.stringify($request.body); } catch (e) { body = String($request.body); }
    bodyInfo = "body=object len=" + body.length;
  } else {
    bodyInfo = "body=null";
  }

  let bytesInfo = "bodyBytes=none";
  if (!body && $request.bodyBytes) {
    try {
      const bytes = new Uint8Array($request.bodyBytes);
      bytesInfo = "bodyBytes len=" + bytes.length;
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      try { body = decodeURIComponent(escape(s)); } catch (e2) { body = s; }
    } catch (e) {
      bytesInfo = "bodyBytes error: " + e;
    }
  }

  console.log("[CQZZ-CAPTURE-V3] ================================");
  console.log("[CQZZ-CAPTURE-V3] " + method + " " + url);
  console.log("[CQZZ-CAPTURE-V3] " + bodyInfo + " | " + bytesInfo);
  console.log("[CQZZ-CAPTURE-V3] Content-Type: " + (headers["Content-Type"] || headers["content-type"] || ""));
  console.log("[CQZZ-CAPTURE-V3] Content-Length: " + (headers["Content-Length"] || headers["content-length"] || ""));
  console.log("[CQZZ-CAPTURE-V3] BODY: " + body);
  console.log("[CQZZ-CAPTURE-V3] ================================");
  if (/\/king\//.test(url)) {
    $notification.post("🎯 V3 抓到 king 请求", method + " 已记入日志 (含诊断)", url.slice(0, 110));
  }
} catch (e) {
  console.log("[CQZZ-CAPTURE-V3] error: " + e);
}

$done({});
