/*
小黑盒签到 v3.0@cjy进行修改

小黑盒签到及日常任务，日收益166H币左右（可抵0.16元）

自行捉包
heybox_id在请求参数中
cookie里面只需要pkey和x_xhh_tokenid
把这三个拼接起来，格式如下。（多账号换行或&隔开）

export BLACKBOX_COOKIE="heybox_id#pkey=xxxxxx;x_xhh_tokenid=xxxxxx&heybox_id#pkey=xxxxxx;x_xhh_tokenid=xxxxxx"

每天运行两次

cron: 3 3 9,21 * * *
*/

const axios = require("axios");

const cookie = process.env.BLACKBOX_COOKIE;
const HKEY_SERVER = "http://47.120.39.109:9900/hkey";

const BASE_APP_REFERER = "http://api.maxjia.com/";
const API_HOST = "api.xiaoheihe.cn";
const DATA_HOST = "data.xiaoheihe.cn";
const USER_AGENT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML like Gecko) Chrome/41.0.2272.118 Safari/537.36 ApiMaxJia/1.0";
const REPORT_USER_AGENT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 Safari/537.36 ApiMaxJia/1.0";

const DEVICE_QUERY =
  "&imei=4187fb55b1be198a&device_info=XiaoMi%2013%E7%A7%81%E4%BA%BA%E8%AE%A2%E5%88%B6%E7%89%88";
const APP_VERSION = "1.3.347";
const APP_BUILD = "916";
const SIGN_APP_VERSION = "1.3.332";
const SIGN_APP_BUILD = "871";
const COMMON_QUERY =
  `&os_type=Android&x_os_type=Android&x_client_type=mobile&os_version=9&version=${APP_VERSION}&build=${APP_BUILD}&_time=`;
const SIGN_COMMON_QUERY =
  `&os_type=Android&x_os_type=Android&x_client_type=mobile&os_version=9&version=${SIGN_APP_VERSION}&build=${SIGN_APP_BUILD}&_time=`;
const APP_QUERY = "&dw=428&channel=heybox_xiaomi&x_app=heybox";
const TASK_ACTIONS = [
  {
    label: "分享贴子任务",
    taskName: "shareArticle",
    titlePattern: /(分享|发布|发帖).*(帖子|贴子|内容)|发布内容|发帖/,
  },
  {
    label: "分享游戏详情任务",
    taskName: "shareGameDetail",
    titlePattern: /(分享|前往).*(游戏详情|发布内容)|游戏详情/,
  },
  {
    label: "分享游戏评价任务",
    taskName: "shareGameComment",
    titlePattern: /(分享|发表|发布).*(游戏评价|评论)|游戏评价|评论/,
  },
  {
    label: "游戏榜单停留10s任务",
    taskName: "visitGameRank",
    titlePattern: /(游戏榜单|榜单|前往榜单).*(10s|停留10秒|停留10s)|停留10s|visitGameRank/,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTaskState(taskList, taskAction) {
  const groups = taskList?.result?.task_list ?? [];
  for (const group of groups) {
    for (const task of group.tasks ?? []) {
      if (typeof task.title === "string" && taskAction.titlePattern.test(task.title)) {
        return task.state;
      }
    }
  }
  return null;
}

function dumpTaskList(taskList) {
  const groups = taskList?.result?.task_list ?? [];
  for (const group of groups) {
    console.log(`【${group.title}】`);
    for (const task of group.tasks ?? []) {
      console.log(`  - ${task.title} -> ${task.state}`);
    }
  }
}

function getBoxElectricityText(data) {
  const directBattery = data?.result?.user?.battery ?? data?.user?.battery;
  if (directBattery !== undefined && directBattery !== null) {
    return String(directBattery);
  }

  const keyPattern = /(盒电|电量|电力|battery|electric|electricity|power|charge|energy)/i;
  const excludeKeyPattern = /(charging|charge_url|url|icon|image|avatar|cover|title|desc|description|time|created|updated)/i;
  const values = [];
  const seen = new Set();

  function walk(value, path = "") {
    if (value === null || value === undefined || values.length >= 20) {
      return;
    }

    if (typeof value !== "object") {
      if (
        keyPattern.test(path) &&
        !excludeKeyPattern.test(path) &&
        (typeof value === "number" ||
          typeof value === "boolean" ||
          (typeof value === "string" && value.trim() !== "" && value.length <= 50))
      ) {
        const normalizedPath = path.replace(/^result\./, "");
        const text = `${normalizedPath}: ${value}`;
        if (!seen.has(text)) {
          seen.add(text);
          values.push(text);
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key);
    }
  }

  walk(data);
  return values.length ? values.join("；") : "未找到盒电字段";
}

function getSignInStatusText(signResult) {
  if (!signResult) {
    return "签到失败";
  }
  if (signResult.result?.state === "ignore") {
    return "今日已签到过";
  }
  if (signResult.msg === "请重新登录") {
    return "cookie过期";
  }
  return "签到成功";
}

async function sendQingLongNotify(title, content) {
  const candidates = [
    "./sendNotify",
    "./sendNotify.js",
    "/ql/scripts/sendNotify",
    "/ql/scripts/sendNotify.js",
    "/ql/data/scripts/sendNotify",
    "/ql/data/scripts/sendNotify.js",
  ];

  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      const notifyFn =
        typeof mod === "function"
          ? mod
          : typeof mod.sendNotify === "function"
            ? mod.sendNotify
            : typeof mod.default === "function"
              ? mod.default
              : null;

      if (notifyFn) {
        await Promise.resolve(notifyFn(title, content));
        return true;
      }
    } catch (error) {
      // ignore missing notification modules and keep probing common paths
    }
  }

  return false;
}

async function refreshTaskList(account, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const taskList = await getTaskList(account);
    if (taskList?.result?.task_list) {
      return taskList;
    }
    if (attempt < retries) {
      await sleep(1000);
    }
  }
  return null;
}

async function runTaskWithVerify(account, taskAction, accountNo) {
  const before = await refreshTaskList(account);
  if (!before) {
    console.log(`账号${accountNo} -> 获取任务列表失败，跳过${taskAction.label}`);
    return "获取任务列表失败";
  }

  const beforeState = getTaskState(before, taskAction);
  if (beforeState === null) {
    console.log(`账号${accountNo} -> ${taskAction.label}不在当前任务列表`);
    return "不在当前任务列表";
  }
  if (beforeState === "finish") {
    console.log(`账号${accountNo} -> ${taskAction.label}已完成`);
    return "已完成";
  }

  const result = await doTask(account, taskAction.taskName);
  if (result && result.msg !== undefined && result.msg !== "") {
    console.log(result);
  }

  for (let retry = 0; retry < 3; retry++) {
    await sleep(1200);
    const after = await refreshTaskList(account);
    if (!after) {
      continue;
    }

    const afterState = getTaskState(after, taskAction);
    if (afterState === "finish") {
      console.log(`账号${accountNo} -> ${taskAction.label}完成`);
      return "完成";
    }
  }

  console.log(`账号${accountNo} -> ${taskAction.label}未确认完成`);
  const after = await refreshTaskList(account);
  if (after) {
    dumpTaskList(after);
  }
  return "未确认完成";
}

function formatSecondsTimestamp(seconds) {
  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function getHkey(heyboxId, type, taskName = "null") {
  const body = {
    heyboxId,
    type,
    taskName,
  };
  const options = {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 5000,
  };

  try {
    const response = await axios.post(HKEY_SERVER, body, options);
    return response.data;
  } catch (error) {
    console.error(`Error: 获取hkey失败 type=${type} taskName=${taskName}`);
    return null;
  }
}

async function follow(account) {
  const [heyboxId, accountCookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 3);
  if (!hkeyInfo) {
    return null;
  }
  const { hkey, timestamp } = hkeyInfo;

  const options = {
    headers: {
      Referer: BASE_APP_REFERER,
      "User-Agent": USER_AGENT,
      Host: API_HOST,
      Connection: "Keep-Alive",
      Accept: "*/*",
      Cookie: accountCookie,
    },
    timeout: 5000,
  };

  try {
    const response = await axios.post(
      `https://api.xiaoheihe.cn/bbs/app/profile/follow/user?heybox_id=${heyboxId}` +
        `${DEVICE_QUERY}&nonce=l7iQ8IQMHzj3hSydLxxsQMSzjnCvkiY3&hkey=${hkey}` +
        `${COMMON_QUERY}${timestamp}${APP_QUERY}`,
      "following_id=12318034",
      options,
    );
    return response.data;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function getTaskList(account) {
  const [heyboxId, accountCookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 2);
  if (!hkeyInfo) {
    return null;
  }
  const { hkey, timestamp } = hkeyInfo;

  const options = {
    headers: {
      Referer: BASE_APP_REFERER,
      "User-Agent": USER_AGENT,
      Host: API_HOST,
      Connection: "Keep-Alive",
      Accept: "*/*",
      Cookie: accountCookie,
    },
    timeout: 5000,
  };

  try {
    const response = await axios.get(
      `https://api.xiaoheihe.cn/task/list_v2/?heybox_id=${heyboxId}` +
        `${DEVICE_QUERY}&nonce=tb6e1k7WqQCIHToyzWzI8Ogq9d0EIgpb&hkey=${hkey}` +
        `${COMMON_QUERY}${timestamp}${APP_QUERY}`,
      options,
    );
    return response.data;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function getSignIn(account) {
  const [heyboxId, accountCookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 1);
  if (!hkeyInfo) {
    return null;
  }
  const { hkey, timestamp } = hkeyInfo;

  const options = {
    headers: {
      Referer: BASE_APP_REFERER,
      "User-Agent": USER_AGENT,
      Host: API_HOST,
      Connection: "Keep-Alive",
      Accept: "*/*",
      Cookie: accountCookie,
    },
    timeout: 5000,
  };

  try {
    const response = await axios.get(
      `https://api.xiaoheihe.cn/task/sign_v3/sign?heybox_id=${heyboxId}` +
        `${DEVICE_QUERY}&nonce=tb6e1k7WqQCIHToyzWzI8Ogq9d0EIgpb&hkey=${hkey}` +
        `${SIGN_COMMON_QUERY}${timestamp}${APP_QUERY}`,
      options,
    );
    return response.data;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function doTask(account, taskName) {
  const [heyboxId, accountCookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 5, taskName);
  if (!hkeyInfo) {
    return null;
  }

  const time = hkeyInfo.timestamp;
  const hkey = hkeyInfo.hkey;
  const postData = hkeyInfo.data;
  const postKey = hkeyInfo.key;
  const postSid = hkeyInfo.sid;

  const body = new URLSearchParams();
  body.append("data", postData);
  body.append("key", postKey);
  body.append("sid", postSid);

  const options = {
    headers: {
      Referer: BASE_APP_REFERER,
      "User-Agent": REPORT_USER_AGENT,
      Cookie: accountCookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Host: DATA_HOST,
      Connection: "Keep-Alive",
      "Accept-Encoding": "gzip",
    },
    timeout: 5000,
  };

  try {
    const response = await axios.post(
      `https://data.xiaoheihe.cn/account/data_report/?type=104&time_=${time}` +
        `&session_id=77ee4fea-46d9-4a53-b5ce-5df9cf056b7e&heybox_id=${heyboxId}` +
        `${DEVICE_QUERY}&nonce=fSz04CwxvcWzG737aFNKKxNeGZDFOqJ1&hkey=${hkey}` +
        `${COMMON_QUERY}${time}${APP_QUERY}`,
      body,
      options,
    );
    return response.data;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function main() {
  if (!cookie) {
    console.error("BLACKBOX_COOKIE 未设置");
    return;
  }

  const accounts = cookie.includes("&") ? cookie.split("&") : [cookie];
  console.log(`找到${accounts.length}个账号`);
  const notifyBlocks = [];

  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index];
    const accountNo = index + 1;
    const accountLines = [];

    await follow(account);

    console.log("--开始做签到任务--");
    const signResult = await getSignIn(account);
    const signStatus = getSignInStatusText(signResult);
    console.log(`账号${accountNo} -> ${signStatus}${signStatus === "签到成功" ? "！" : signStatus === "今日已签到过" ? "！" : ""}`);
    accountLines.push(`签到: ${signStatus}`);

    const taskList = await refreshTaskList(account);
    if (!taskList) {
      console.log(`账号${accountNo} -> 获取任务列表失败`);
      accountLines.push("任务列表: 获取失败");
      notifyBlocks.push(accountLines.join("\n"));
      console.log();
      continue;
    }

    const username = taskList.result?.user?.username ?? `账号${accountNo}`;
    console.log(username);
    accountLines.push(`用户: ${username}`);
    const boxElectricityText = getBoxElectricityText(taskList);
    dumpTaskList(taskList);

    for (const taskAction of TASK_ACTIONS) {
      console.log(`--开始做${taskAction.label}--`);
      const taskStatus = await runTaskWithVerify(account, taskAction, accountNo);
      accountLines.push(`${taskAction.label}: ${taskStatus}`);
    }

    const finalTaskList = (await refreshTaskList(account)) ?? taskList;
    const finalUser = finalTaskList.result?.user;
    if (finalUser?.level_info) {
      const coin = finalUser.level_info.coin;
      const level = finalUser.level_info.level;
      const finalUsername = finalUser.username ?? username;
      const coinValue = Number.isFinite(Number(coin)) ? Number(coin) / 1000 : "未知";
      const summary = `${finalUsername} 当前盒币 => ${coin} ≈ ${coinValue}￥ 当前等级 => ${level}`;
      console.log(summary);
      console.log(`盒电: ${boxElectricityText}`);
      accountLines.push(`盒币: ${coin} ≈ ${coinValue}￥`);
      accountLines.push(`等级: ${level}`);
      accountLines.push(`盒电: ${boxElectricityText}`);
    }
    const finalBoxElectricityText = getBoxElectricityText(finalTaskList);
    if (finalBoxElectricityText !== boxElectricityText) {
      console.log(`最终盒电: ${finalBoxElectricityText}`);
      accountLines.push(`最终盒电: ${finalBoxElectricityText}`);
    }

    notifyBlocks.push(accountLines.join("\n"));
    console.log();
  }

  const notifyContent = notifyBlocks.join("\n\n");
  if (notifyContent) {
    const sent = await sendQingLongNotify("小黑盒签到任务结果", notifyContent);
    if (sent) {
      console.log("已发送青龙通知");
    } else {
      console.log("未找到可用的青龙通知脚本，已跳过通知");
    }
  }
}

main();
