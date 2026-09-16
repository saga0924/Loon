// MiMotion Loon脚本｜cron定时使用，读取插件#!input输入框
let loginToken, accessToken, userId;
const huamiBase = "https://account-cn.huami.com";

// 通知推送
function sendNotify(title, body) {
  console.log(`【${title}】${body}`);
  $notification.post(title, body, "");
}

// 读取插件页面输入框的账号密码
async function getConfig() {
  const username = $persistentStore.read("username");
  const password = $persistentStore.read("password");
  const targetStep = $persistentStore.read("targetStep");
  if (!username || !password || !targetStep) {
    throw new Error("⚠️请到插件页面填写 Zepp账号、密码、目标步数！");
  }
  return { username, password, targetStep };
}

// 获取login_token
async function getLoginToken(cfg) {
  const req = {
    url: `${huamiBase}/v1/client/login`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16 like Mac OS X) AppleWebKit/605.1.15"
    },
    body: `account=${encodeURIComponent(cfg.username)}&password=${encodeURIComponent(cfg.password)}&client_id=huawei&grant_type=password`
  };
  const resp = await $http.post(req);
  const data = JSON.parse(resp.body);
  if(data.code !== 200) throw new Error(`登录失败:${data.message}`);
  loginToken = data.data.login_token;
}

// 获取access_token
async function getAccessToken() {
  const req = {
    url: `${huamiBase}/v1/client/app_tokens`,
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({login_token: loginToken, app_name: "com.huami.miband"})
  };
  const resp = await $http.post(req);
  const data = JSON.parse(resp.body);
  accessToken = data.data.access_token;
  userId = data.data.user_id;
}

// 提交步数
async function submitStep(cfg) {
  const now = Date.now();
  const start = now - 3600 * 1000 * 2;
  const stepData = {
    user_id: userId,
    steps: cfg.targetStep,
    distance: Math.round(cfg.targetStep * 0.72),
    calories: Math.round(cfg.targetStep * 0.045),
    start_time: Math.floor(start/1000),
    end_time: Math.floor(now/1000),
    time_zone: "Asia/Shanghai"
  };
  const req = {
    url: "https://api-mifit-cn.huami.com/v1/activity/sport",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST",
    body: JSON.stringify(stepData)
  };
  const resp = await $http.post(req);
  const res = JSON.parse(resp.body);
  if(res.code === 200) {
    sendNotify("MiMotion✅提交成功", `本次提交步数：${cfg.targetStep}`);
  } else {
    throw new Error(`提交接口返回:${res.message}`);
  }
}

(async function main(){
  try {
    const cfg = await getConfig();
    await getLoginToken(cfg);
    await getAccessToken();
    await submitStep(cfg);
  } catch(e) {
    sendNotify("MiMotion❌执行失败", String(e.message));
    console.error("错误详情", e);
  } finally {
    $done();
  }
})();
