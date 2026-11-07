// ---------- 生成被试唯一编号（不再依赖 URL 的 pid 参数） ----------
function generatePid() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 兼容不支持 crypto.randomUUID 的环境（如本地 file:// 预览）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- 读取 URL 参数 / 分组逻辑 ----------
// URL 带有效的 ?group=A 或 ?group=B 时按参数分组（方便测试指定分组）；
// 不带 group 参数的干净链接（正式招募用）则由网页自动随机 50/50 分配。
// 若带了 group 参数但值既不是 A 也不是 B，视为链接有误，仍然报错提示。
const urlParams = new URLSearchParams(window.location.search);
const rawGroup = (urlParams.get("group") || "").toUpperCase();
const validGroup = !urlParams.has("group") || rawGroup === "A" || rawGroup === "B";
const entryMode = urlParams.has("group") ? "fixed" : "random";
const sessionKey = "psychExpTrialSession_v1_" + (entryMode === "fixed" ? rawGroup : "auto");
let session = null;
try { session = JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch {}
if (!session || !session.pid || !/^[0-9a-f]{64}$/.test(session.token || "")) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  session = { pid: generatePid(), token: Array.from(bytes, b => b.toString(16).padStart(2,"0")).join(""), group: entryMode === "fixed" ? rawGroup : "A", consent: false, serverStep: 0 };
  try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch {}
}
let group = session.group;
const pid = session.pid;

// ---------- 全局实验数据（走完9步后一次性写入 Supabase） ----------
const experimentData = {
  pid: pid,
  group: group,
  essay: "",
  chatHistory: [],
  duration: 0,
  timestamp: "",
  snail_responses: {},
  hou_responses: {},
  soa_responses: {},
  filler_responses: {},
  po_responses: {},
  cap_responses: {},
  offline_test_responses: {},
  offline_test_score: null,
  self_estimate: ""
};

let startTime = Date.now(); // 全流程开始时间戳，用于计算总时长

if (!validGroup) {
  // 分组参数缺失或非法，整个流程无法进行，只展示错误提示
  document.getElementById("app").style.display = "none";
  document.getElementById("topBar").style.display = "none";
  document.getElementById("groupErrorScreen").style.display = "flex";
} else {
  initExperiment();
}

function initExperiment() {
  // ---------- 步骤切换框架 ----------
  const STEP_COUNT = 9; // 第0步 ~ 第8步
  let currentStep = 0;
  let aiPending = false;
  let saving = Promise.resolve();
  let saveTimer;
  let storageFailed = false;
  let ownerAccessToken = '';
  let trialRequired = true;
  let serviceReady = false;
  const notice = document.getElementById("serviceNotice");
  const agreeBtn = document.getElementById("agreeBtn");
  const backupKey = "psychExpData_v2_" + pid;
  let localRecord = null;
  try { localRecord = JSON.parse(localStorage.getItem(backupKey) || "null"); } catch {}
  if (localRecord && localRecord.pid === pid && session.consent) {
    Object.assign(experimentData, localRecord);
    group = session.group;
    experimentData.group = group;
    startTime = localRecord.started_at ? Date.parse(localRecord.started_at) : startTime;
  }
  function persistSession() {
    try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch { storageFailed = true; }
  }
  function localSave() {
    if (!session.consent) return;
    experimentData.essay = document.getElementById("essayText").value;
    experimentData.current_step = currentStep;
    experimentData.started_at = new Date(startTime).toISOString();
    try { localStorage.setItem(backupKey, JSON.stringify(experimentData)); }
    catch { storageFailed = true; notice.textContent = "浏览器无法保存本地备份，请保持页面打开并确认最终上传成功。"; }
  }
  async function api(path, body) {
    const response = await fetch(APP_CONFIG.API_BASE + path, {
      method: body ? "POST" : "GET",
      signal: AbortSignal.timeout(75000),
      headers: { "Content-Type": "application/json", "apikey": APP_CONFIG.SUPABASE_KEY, "X-Session-Token": session.token, ...(ownerAccessToken ? {Authorization:'Bearer '+ownerAccessToken} : {}) },
      ...(body ? { body: JSON.stringify({ ...body, pid }) } : {})
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("研究服务未返回有效响应"); }
    if (!response.ok) {
      if (response.status===401 && trialRequired) {
        ownerAccessToken='';agreeBtn.disabled=true;
        document.getElementById('trialLoginForm').hidden=false;
        document.getElementById('trialAuthMessage').textContent='试跑登录已失效，请重新登录后继续。已有云端进度和本地备份保留。';
      }
      throw new Error(data.error || "研究服务暂不可用");
    }
    return data;
  }
  async function syncTo(target, record) {
    // Recover every missing checkpoint after a temporary network failure.
    for (let step = session.serverStep; step <= target; step++) {
      await api("/progress", { step, record });
      session.serverStep = step;
      persistSession();
    }
  }
  function queueSave(target) {
    if (!session.consent || session.completed) return;
    localSave();
    const snapshot = JSON.parse(JSON.stringify(experimentData));
    saving = saving.catch(() => {}).then(() => syncTo(target, snapshot)).then(() => {
      notice.textContent = storageFailed ? "进度已保存到研究服务；本地备份不可用，请保持页面打开。" : "当前进度已保存。请在同一标签页中完成任务。";
    }).catch(() => { notice.textContent = "当前进度尚未同步，请保持页面打开。最终提交时会重试；未成功上传不会标记为完成。"; });
  }
  function scheduleSave() {
    if (!session.consent || session.completed) return;
    localSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => queueSave(currentStep), 1200);
  }
  async function checkHealth() {
    try {
      const r = await fetch(APP_CONFIG.API_BASE + "/health", { headers: { apikey: APP_CONFIG.SUPABASE_KEY }, signal: AbortSignal.timeout(12000) });
      const data = await r.json();
      if (!notice.isConnected) return;
      if (!r.ok || !data.ready) throw new Error();
      serviceReady = true;
      trialRequired = data.mode !== 'study';
      document.getElementById('trialAccess').hidden = !trialRequired;
      notice.textContent = trialRequired ? (ownerAccessToken ? '本人试跑服务已连接。请阅读知情同意书后开始。' : '本人试跑服务已连接，请先登录研究者账号。') : '研究服务连接正常。请阅读知情同意书后开始。';
      agreeBtn.disabled = trialRequired && !ownerAccessToken;
    } catch {
      if (!notice.isConnected) return;
      serviceReady = false;
      notice.replaceChildren(document.createTextNode("研究服务尚未接通，暂不能开始或恢复任务。请联系研究者，或重试连接。 "));
      const retry = document.createElement("button"); retry.textContent = "重试连接";
      retry.addEventListener("click", checkHealth); notice.appendChild(retry);
      agreeBtn.disabled = true;
    }
  }
  document.getElementById('trialLoginForm').addEventListener('submit',async e=>{
    e.preventDefault();ownerAccessToken='';agreeBtn.disabled=true;
    const btn=document.getElementById('trialLoginBtn'),message=document.getElementById('trialAuthMessage');
    btn.disabled=true;message.textContent='正在验证研究者身份…';
    try {
      const r=await fetch(APP_CONFIG.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',apikey:APP_CONFIG.SUPABASE_KEY},body:JSON.stringify({email:'huangrui1008@gmail.com',password:document.getElementById('trialPassword').value})});
      const data=await r.json();if(!r.ok)throw new Error(data.error_description||data.msg||data.error||'登录失败');
      ownerAccessToken=data.access_token;
      await api('/self-test/access');
      document.getElementById('trialPassword').value='';
      document.getElementById('trialLoginForm').hidden=true;
      message.textContent='研究者身份已验证，本次记录将标记为本人试跑。';
      await checkHealth();
    } catch(error) {
      ownerAccessToken='';document.getElementById('trialPassword').value='';
      message.textContent='试跑登录失败：'+(/Invalid login credentials/i.test(error.message)?'邮箱或密码未通过验证，请使用研究者账号密码。':error.message);
    } finally {btn.disabled=false;}
  });
  document.getElementById('newTrialBtn').addEventListener('click',()=>{
    sessionStorage.removeItem(sessionKey);location.reload();
  });
  checkHealth();
  const progressFill = document.getElementById("progressFill");
  const stepLabel = document.getElementById("stepLabel");

  function goToStep(target) {
    clearTimeout(saveTimer);
    if (typeof target === "number") {
      experimentData.step_times ||= {};
      experimentData.step_times[target] ||= new Date().toISOString();
    }
    document.querySelectorAll(".step").forEach(function (el) { el.classList.remove("active"); });
    document.getElementById("step-" + target).classList.add("active");
    if (typeof target === "number") {
      currentStep = target;
      experimentData.current_step = target;
      const pct = Math.round(((currentStep + 1) / STEP_COUNT) * 100);
      progressFill.style.width = pct + "%";
      stepLabel.textContent = "第 " + (currentStep + 1) + " 步 / 共 " + STEP_COUNT + " 步";
    } else {
      progressFill.style.width = "100%";
      stepLabel.textContent = "已完成";
    }
    if (typeof target === "number") queueSave(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- 矩阵量表渲染 ----------
  function buildLikertStep(container, cfg, stateObj, onNext) {
    const wrap = document.createElement("div");
    wrap.className = "step-inner";

    const h = document.createElement("h2");
    h.className = "step-title";
    h.textContent = cfg.title;
    wrap.appendChild(h);

    const intro = document.createElement("div");
    intro.className = "step-intro";
    intro.textContent = cfg.intro;
    wrap.appendChild(intro);

    const tableWrap = document.createElement("div");
    tableWrap.className = "likert-wrap";
    const table = document.createElement("table");
    table.className = "likert-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    cfg.scale.forEach(function (label, i) {
      const th = document.createElement("th");
      th.innerHTML = (i + 1) + "<br>" + label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    cfg.questions.forEach(function (q, qi) {
      const tr = document.createElement("tr");
      tr.id = cfg.key + "-row-" + q.id;
      const tdQ = document.createElement("td");
      tdQ.className = "q-text";
      tdQ.textContent = (qi + 1) + ". " + q.text;
      tr.appendChild(tdQ);
      cfg.scale.forEach(function (label, i) {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = cfg.key + "_" + q.id;
        input.value = i + 1;
        input.checked = stateObj[q.id] === i + 1;
        input.addEventListener("change", function () {
          stateObj[q.id] = i + 1;
          scheduleSave();
          tr.classList.remove("row-missing");
          errorEl.style.display = "none";
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    const errorEl = document.createElement("div");
    errorEl.className = "validation-error";
    errorEl.textContent = "请完成全部题目后再继续。";
    wrap.appendChild(errorEl);

    const nav = document.createElement("div");
    nav.className = "step-nav";
    const btn = document.createElement("button");
    btn.className = "next-btn";
    btn.textContent = "下一步";
    btn.addEventListener("click", function () {
      const missing = cfg.questions.filter(function (q) { return !(q.id in stateObj); });
      if (missing.length > 0) {
        errorEl.style.display = "block";
        missing.forEach(function (q) {
          document.getElementById(cfg.key + "-row-" + q.id).classList.add("row-missing");
        });
        document.getElementById(cfg.key + "-row-" + missing[0].id).scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      onNext(btn);
    });
    nav.appendChild(btn);
    wrap.appendChild(nav);

    container.appendChild(wrap);
  }

  // ---------- 单选题渲染（填充任务 / 脱机测试 / 自估正确率） ----------
  function buildChoiceStep(container, cfg, stateObj, onNext) {
    const wrap = document.createElement("div");
    wrap.className = "step-inner";

    const h = document.createElement("h2");
    h.className = "step-title";
    h.textContent = cfg.title;
    wrap.appendChild(h);

    if (cfg.intro) {
      const intro = document.createElement("div");
      intro.className = "step-intro";
      intro.textContent = cfg.intro;
      wrap.appendChild(intro);
    }

    const errorEl = document.createElement("div");
    errorEl.className = "validation-error";
    errorEl.textContent = "请完成全部题目后再继续。";

    cfg.questions.forEach(function (q, qi) {
      const qBox = document.createElement("div");
      qBox.className = "choice-item";
      qBox.id = cfg.key + "-row-" + q.id;

      if (cfg.questions.length > 1) {
        const idx = document.createElement("div");
        idx.className = "choice-index";
        idx.textContent = "第 " + (qi + 1) + " 题";
        qBox.appendChild(idx);
      }

      if (q.render === "symbols") {
        const symWrap = document.createElement("div");
        symWrap.className = "filler-symbols";
        symWrap.innerHTML = "<span>" + q.left + "</span><span class=\"filler-vs\">vs</span><span>" + q.right + "</span>";
        qBox.appendChild(symWrap);
      } else {
        const qText = document.createElement("div");
        qText.className = "choice-q-text";
        qText.textContent = q.text;
        qBox.appendChild(qText);
      }

      const optWrap = document.createElement("div");
      optWrap.className = "mc-options";
      q.options.forEach(function (opt) {
        const label = document.createElement("label");
        label.className = "mc-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = cfg.key + "_" + q.id;
        input.value = opt.value;
        input.checked = stateObj[q.id] === opt.value;
        input.addEventListener("change", function () {
          stateObj[q.id] = opt.value;
          if (cfg.key === "selfest") experimentData.self_estimate = opt.value;
          scheduleSave();
          qBox.classList.remove("row-missing");
          errorEl.style.display = "none";
        });
        label.appendChild(input);
        const span = document.createElement("span");
        span.textContent = opt.label;
        label.appendChild(span);
        optWrap.appendChild(label);
      });
      qBox.appendChild(optWrap);
      wrap.appendChild(qBox);
    });

    wrap.appendChild(errorEl);

    const nav = document.createElement("div");
    nav.className = "step-nav";
    const btn = document.createElement("button");
    btn.className = "next-btn";
    btn.textContent = cfg.buttonText || "下一步";
    btn.addEventListener("click", function () {
      const missing = cfg.questions.filter(function (q) { return !(q.id in stateObj); });
      if (missing.length > 0) {
        errorEl.style.display = "block";
        missing.forEach(function (q) {
          document.getElementById(cfg.key + "-row-" + q.id).classList.add("row-missing");
        });
        document.getElementById(cfg.key + "-row-" + missing[0].id).scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      onNext(btn);
    });
    nav.appendChild(btn);
    wrap.appendChild(nav);

    container.appendChild(wrap);
  }

  // ========== 第0步：SNAIL 前测 ==========
  buildLikertStep(document.getElementById("step-0"), SNAIL_CFG, experimentData.snail_responses, function () {
    goToStep(1);
  });

  // ========== 第1步：AI对话 + 报告撰写（原有功能） ==========
  const bannerEl = document.getElementById("conditionBanner");
  const taskDescEl = document.getElementById("taskDesc");
  taskDescEl.textContent = CONFIG.TASK_DESCRIPTION;
  bannerEl.className = "condition-banner group-" + group.toLowerCase();
  bannerEl.textContent = CONFIG.BANNER_TEXT[group];

  if (!experimentData.chatHistory.length) experimentData.chatHistory.push(
    { role: "assistant", content: CONFIG.FIRST_MESSAGE[group] }
  );

  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const essayText = document.getElementById("essayText");
  const wordCountLabel = document.getElementById("wordCountLabel");
  const submitBtn = document.getElementById("submitBtn");

  function renderMessage(role, content) {
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "assistant");
    div.textContent = content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  experimentData.chatHistory.filter(m => m.role !== "system").forEach(m => renderMessage(m.role, m.content));
  essayText.value = experimentData.essay || "";

  let typingIndicator = null;
  function showTyping() {
    typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-dots";
    typingIndicator.innerHTML = "<span></span><span></span><span></span>";
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function hideTyping() {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || aiPending || currentStep !== 1 || !session.consent) return;
    aiPending = true; sendBtn.disabled = true; submitBtn.disabled = true;
    showTyping();
    try {
      clearTimeout(saveTimer);
      await saving;
      await syncTo(1, experimentData);
      const data = await api("/chat", { message: text });
      experimentData.chatHistory.push({ role: "user", content: text }, { role: "assistant", content: data.reply });
      renderMessage("user", text); renderMessage("assistant", data.reply);
      chatInput.value = ""; chatInput.style.height = "auto";
      localSave();
    } catch (err) {
      notice.textContent = "AI 回复尚未成功：" + err.message + "。本次未收到的回复不会记为真实 AI 对话。";
    } finally {
      hideTyping(); aiPending = false; sendBtn.disabled = false; updateWordCount();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener("input", function () {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  });

  function countChineseChars(str) {
    const matches = str.match(/[一-龥]/g);
    return matches ? matches.length : 0;
  }

  function updateWordCount() {
    const count = countChineseChars(essayText.value);
    if (count >= CONFIG.MIN_WORDS) {
      wordCountLabel.textContent = count > CONFIG.MAX_WORDS
        ? "已输入 " + count + " 字（已超出建议字数，可考虑精简）"
        : "已输入 " + count + " 字（已达到要求）";
      wordCountLabel.classList.add("enough");
      submitBtn.disabled = aiPending;
      submitBtn.classList.add("active");
      submitBtn.textContent = "下一步";
    } else {
      const remaining = CONFIG.MIN_WORDS - count;
      wordCountLabel.textContent = "已输入 " + count + " 字";
      wordCountLabel.classList.remove("enough");
      submitBtn.disabled = true;
      submitBtn.classList.remove("active");
      submitBtn.textContent = "还需 " + remaining + " 字";
    }
  }
  essayText.addEventListener("input", function () { updateWordCount(); scheduleSave(); });
  updateWordCount();

  submitBtn.addEventListener("click", function () {
    if (submitBtn.disabled) return;
    experimentData.essay = essayText.value;
    goToStep(2);
  });

  // ========== 第2步：操纵检验 Hou ==========
  buildLikertStep(document.getElementById("step-2"), HOU_CFG, experimentData.hou_responses, function () {
    goToStep(3);
  });

  // ========== 第3步：代理感 SoAS ==========
  buildLikertStep(document.getElementById("step-3"), SOA_CFG, experimentData.soa_responses, function () {
    goToStep(4);
  });

  // ========== 第4步：填充任务 ==========
  const fillerCfg = {
    key: "filler_responses",
    title: "图形判断",
    intro: "接下来请完成几道简单的图形判断题，判断上下两组符号是否完全相同。",
    questions: FILLER_QUESTIONS.map(function (q) {
      return {
        id: q.id,
        render: "symbols",
        left: q.left,
        right: q.right,
        options: [
          { value: "相同", label: "相同" },
          { value: "不同", label: "不同" }
        ]
      };
    })
  };
  buildChoiceStep(document.getElementById("step-4"), fillerCfg, experimentData.filler_responses, function () {
    goToStep(5);
  });

  // ========== 第5步：心理所有权 PO ==========
  buildLikertStep(document.getElementById("step-5"), PO_CFG, experimentData.po_responses, function () {
    goToStep(6);
  });

  // ========== 第6步：学习获得感 CAP ==========
  buildLikertStep(document.getElementById("step-6"), CAP_CFG, experimentData.cap_responses, function () {
    goToStep(7);
  });

  // ========== 第7步：脱机测试（自动判分，不展示对错） ==========
  const offlineCfg = {
    key: "offline_test_responses",
    title: "知识回顾测试",
    intro: "在开始下面的测试前请注意：接下来的题目请凭您对刚才写作过程的记忆和理解独立作答，请勿翻阅报告原文或查阅任何外部资料。测试约需5分钟，请一次性完成。",
    questions: OFFLINE_TEST_QUESTIONS
  };
  buildChoiceStep(document.getElementById("step-7"), offlineCfg, experimentData.offline_test_responses, function () {
    // The authoritative answer key and score stay on the server.
    goToStep(8);
  });

  // ========== 第8步：自估正确率 ==========
  const selfEstimateState = { ...(experimentData.self_estimate ? { q1: experimentData.self_estimate } : {}) };
  const selfEstimateCfg = {
    key: "selfest",
    title: "最后一个问题",
    intro: "刚才的测试已经结束，接下来最后一个问题，请凭直觉作答。",
    buttonText: "提交",
    questions: [
      {
        id: "q1",
        text: "您觉得自己刚才那10道题大概能答对几道？",
        options: [
          { value: "0-2题", label: "0-2题" },
          { value: "3-5题", label: "3-5题" },
          { value: "6-8题", label: "6-8题" },
          { value: "9-10题", label: "9-10题" }
        ]
      }
    ]
  };
  buildChoiceStep(document.getElementById("step-8"), selfEstimateCfg, selfEstimateState, async function (btn) {
    btn.disabled = true;
    btn.textContent = "提交中...";
    experimentData.self_estimate = selfEstimateState.q1;
    clearTimeout(saveTimer);
    localSave();
    try {
      await saving;
      await syncTo(8, experimentData);
      await api("/complete", { record: experimentData });
      session.completed = true; persistSession();
      experimentData.timestamp = new Date().toISOString();
      experimentData.duration = Math.round((Date.now() - startTime) / 1000);
      localSave();
      document.getElementById("submissionReceipt").textContent = "数据已成功上传。参与编号：" + pid;
      notice.textContent = "本次参与已完成，研究服务已确认收件。";
      document.getElementById('newTrialBtn').hidden = !trialRequired;
      goToStep("done");
    } catch (err) {
      notice.textContent = "尚未提交成功：" + err.message + "。请保持页面打开，点击重试提交；也可下载备份交给研究者。";
      btn.disabled = false; btn.textContent = "重试提交";
      if (!document.getElementById("downloadBackup")) {
        const backup = document.createElement("button"); backup.id = "downloadBackup"; backup.textContent = "下载本次数据备份";
        backup.addEventListener("click", () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(experimentData, null, 2)], { type: "application/json" }));
          const a = document.createElement("a"); a.href = url; a.download = "psych-exp-" + pid + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        btn.parentElement.appendChild(backup);
      }
    }
  });

  // ---------- 底部计时（每30秒更新一次） ----------
  const elapsedTimeEl = document.getElementById("elapsedTime");
  function updateElapsedTime() {
    const minutes = Math.floor((Date.now() - startTime) / 60000);
    elapsedTimeEl.textContent = "已进行 " + minutes + " 分钟";
  }
  updateElapsedTime();
  setInterval(updateElapsedTime, 30000);

  // ---------- 知情同意页交互 ----------
  agreeBtn.addEventListener("click", async function () {
    if (!serviceReady || (trialRequired && !ownerAccessToken)) return;
    agreeBtn.disabled = true; agreeBtn.textContent = "正在连接…";
    try {
      const remote = await api("/start", { entry_mode: entryMode, group: rawGroup });
      group = remote.group; session.group = group;
      experimentData.group = group;
      if (trialRequired) {experimentData.is_test=true;experimentData.test_label='researcher-self-test';}
      // A server checkpoint is used when this tab has no newer local draft.
      if ((!localRecord || remote.current_step > Number(localRecord.current_step || 0) || remote.status === "completed") && remote.record && Object.keys(remote.record).length) {
        for (const [key, value] of Object.entries(remote.record)) {
          if (value && typeof value === "object" && !Array.isArray(value) && experimentData[key]) Object.assign(experimentData[key], value);
          else experimentData[key] = value;
        }
      }
      experimentData.chatHistory = remote.chat_history;
      session.serverStep = remote.current_step; session.consent = true;
      session.completed = remote.status === "completed"; persistSession();
      bannerEl.className = "condition-banner group-" + group.toLowerCase();
      bannerEl.textContent = CONFIG.BANNER_TEXT[group];
      chatMessages.replaceChildren();
      remote.chat_history.forEach(m => renderMessage(m.role, m.content));
      essayText.value = experimentData.essay || ""; updateWordCount();
      // Restore checked answers after refreshing a partially completed session.
      for (const cfg of [SNAIL_CFG,HOU_CFG,SOA_CFG,PO_CFG,CAP_CFG,fillerCfg,offlineCfg]) {
        document.querySelectorAll('input[name^="' + cfg.key + '_"]').forEach(input => {
          const id = input.name.slice(cfg.key.length + 1);
          input.checked = String(experimentData[cfg.key]?.[id]) === input.value;
        });
      }
      if (experimentData.self_estimate) {
        selfEstimateState.q1 = experimentData.self_estimate;
        document.querySelectorAll('input[name="selfest_q1"]').forEach(input => { input.checked = input.value === selfEstimateState.q1; });
      }
      document.getElementById("topBar").style.display = "block";
      if (session.completed) {
        document.getElementById('newTrialBtn').hidden = !trialRequired;
        notice.textContent = "本次参与的数据已成功上传。";
        document.getElementById("submissionReceipt").textContent = "数据已成功上传。参与编号：" + pid;
        goToStep("done");
      } else goToStep(Math.max(remote.current_step, Number(experimentData.current_step) || 0));
    } catch (err) {
      notice.textContent = "暂不能开始或恢复：" + err.message + "。请重试或联系研究者。";
      agreeBtn.disabled = false;
    } finally { agreeBtn.textContent = session.consent ? "恢复本次参与" : "我同意参与"; }
  });
  document.getElementById("declineBtn").addEventListener("click", function () {
    goToStep("declined");
  });
}
