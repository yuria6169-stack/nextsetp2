"use strict";

const STORAGE = {
  plan: "nextSet.plan.v1",
  plans: "nextSet.plans.v2",
  selectedPlan: "nextSet.selectedPlan.v2",
  workout: "nextSet.workout.v1",
  settings: "nextSet.settings.v1",
  history: "nextSet.history.v1"
};

const DEFAULT_PLAN = {
  id: cryptoId(),
  name: "力量训练 A",
  exercises: [
    { id: cryptoId(), name: "杠铃深蹲", sets: 4, reps: "8", weight: "60", rest: 120 },
    { id: cryptoId(), name: "卧推", sets: 4, reps: "8", weight: "45", rest: 90 },
    { id: cryptoId(), name: "坐姿划船", sets: 3, reps: "12", weight: "40", rest: 75 }
  ]
};

const initialPlans = loadPlans();
const restoredWorkout = load(STORAGE.workout, null);
const requestedPlanId = restoredWorkout?.planId || load(STORAGE.selectedPlan, initialPlans[0].id);
const initialPlan = initialPlans.find(plan => plan.id === requestedPlanId) || initialPlans[0];

const state = {
  screen: "home",
  plans: initialPlans,
  selectedPlanId: initialPlan.id,
  plan: initialPlan,
  workout: restoredWorkout,
  settings: load(STORAGE.settings, { shortcutName: "组间提醒", shortcutReady: false }),
  history: load(STORAGE.history, []),
  ticker: null
};

function cryptoId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch { return clone(fallback); }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function normalizePlan(plan) {
  const source = plan && typeof plan === "object" ? plan : DEFAULT_PLAN;
  return {
    id: source.id || cryptoId(),
    name: String(source.name || "我的训练"),
    exercises: Array.isArray(source.exercises) ? source.exercises.map(item => ({
      id: item.id || cryptoId(),
      name: String(item.name || "未命名动作"),
      sets: clamp(Number(item.sets) || 1, 1, 20),
      reps: String(item.reps ?? "10"),
      weight: String(item.weight ?? ""),
      rest: clamp(Number(item.rest) || 60, 10, 900)
    })) : []
  };
}
function loadPlans() {
  const stored = load(STORAGE.plans, null);
  if (Array.isArray(stored) && stored.length) return stored.map(normalizePlan);
  const legacy = load(STORAGE.plan, null);
  return [normalizePlan(legacy || DEFAULT_PLAN)];
}
function persistPlans() {
  save(STORAGE.plans, state.plans);
  save(STORAGE.selectedPlan, state.selectedPlanId);
  save(STORAGE.plan, state.plan);
}
function setSelectedPlan(plan) {
  state.selectedPlanId = plan.id;
  state.plan = plan;
  persistPlans();
}
function replaceSelectedPlan(plan) {
  const index = state.plans.findIndex(item => item.id === state.selectedPlanId);
  const normalized = normalizePlan({ ...plan, id: state.selectedPlanId });
  if (index >= 0) state.plans[index] = normalized;
  else state.plans.push(normalized);
  state.plan = normalized;
}
function hasActiveWorkout() { return Boolean(state.workout && state.workout.status !== "complete"); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatTime(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function totalSets() { return state.plan.exercises.reduce((sum, item) => sum + Number(item.sets || 0), 0); }
function totalMinutes() {
  const rest = state.plan.exercises.reduce((sum, item) => sum + Math.max(0, Number(item.sets || 0) - 1) * Number(item.rest || 0), 0);
  return Math.max(15, Math.round(rest / 60 + totalSets() * 1.2));
}

function headerMarkup(title, eyebrow, right = "") {
  return `<header class="topbar"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${right}</header>`;
}

function nav(active) {
  return `<nav class="bottom-nav">
    <button class="nav-btn ${active === "home" ? "active" : ""}" data-action="go-home"><span>◆</span>冒险营地</button>
    <button class="nav-btn ${active === "setup" ? "active" : ""}" data-action="go-setup"><span>⌁</span>计时魔法</button>
  </nav>`;
}

function render() {
  clearInterval(state.ticker);
  state.ticker = null;
  const app = document.querySelector("#app");
  const screens = {
    home: renderHome,
    edit: renderEdit,
    setup: renderSetup,
    workout: renderWorkout,
    rest: renderRest,
    summary: renderSummary
  };
  app.innerHTML = (screens[state.screen] || renderHome)();
  if (state.screen === "rest") startTicker();
}

function renderHome() {
  const active = hasActiveWorkout();
  return `<main class="shell">
    ${headerMarkup("今天练哪个？", "NEXT SET · 选择你的冒险", `<button class="icon-btn" data-action="new-plan" aria-label="新建计划">＋</button>`)}
    <section class="plan-picker" aria-label="训练计划列表">
      ${state.plans.map((plan, index) => `<button class="plan-choice ${plan.id === state.selectedPlanId ? "selected" : ""}" data-action="select-plan" data-plan-id="${plan.id}">
        <span class="plan-gem">${index + 1}</span>
        <span class="plan-choice-copy"><strong>${escapeHtml(plan.name)}</strong><small>${plan.exercises.length} 个动作</small></span>
        <span class="plan-check">${plan.id === state.selectedPlanId ? "◆" : "◇"}</span>
      </button>`).join("")}
    </section>
    <div class="plan-toolbar"><span>${active ? "冒险进行中 · 当前计划已锁定" : `已保存 ${state.plans.length} 个训练计划`}</span><button data-action="edit-plan">编辑当前计划</button></div>
    <section class="hero">
      <div class="pixel-sun" aria-hidden="true"></div>
      <div class="pixel-cloud cloud-one" aria-hidden="true"></div>
      <div class="pixel-cloud cloud-two" aria-hidden="true"></div>
      <div class="pixel-slime" aria-hidden="true"></div>
      <div class="level-badge">LV. ${Math.max(1, state.history.length + 1)}</div>
      <div class="eyebrow">${active ? "冒险进行中" : "今日任务"}</div>
      <div class="hero-title">${escapeHtml(state.plan.name)}</div>
      <div class="hero-meta">${state.plan.exercises.length} 个动作 · ${totalSets()} 组 · 约 ${totalMinutes()} 分钟</div>
      <button class="primary" data-action="${active ? "resume-workout" : "start-workout"}">${active ? "继续闯关" : "开始冒险"} →</button>
    </section>

    ${state.settings.shortcutReady ? "" : `<section class="card setup-status" style="margin-top:12px" data-action="go-setup">
      <div class="status-dot"></div>
      <div><strong>先学会计时魔法</strong><p class="muted small">设置一次，切到游戏后也会响铃</p></div>
    </section>`}

    <div class="section-head"><h2>今日关卡</h2><button data-action="edit-plan">编辑任务</button></div>
    <section class="list">
      ${state.plan.exercises.map((item, index) => `<article class="exercise-row">
        <div class="index">${index + 1}</div>
        <div><strong>${escapeHtml(item.name)}</strong><div class="meta">${item.sets} 组 × ${escapeHtml(item.reps)} 次 · ${escapeHtml(item.weight || "—")} kg · 休 ${item.rest} 秒</div></div>
        <div class="chevron">›</div>
      </article>`).join("")}
    </section>
    ${nav("home")}
  </main>`;
}

function renderEdit() {
  return `<main class="shell">
    ${headerMarkup("编辑训练存档", `第 ${state.plans.findIndex(item => item.id === state.selectedPlanId) + 1}/${state.plans.length} 个计划`, `<button class="text-btn accent" data-action="save-plan">完成</button>`)}
    <div class="form-grid">
      <div class="field"><label for="plan-name">计划名称</label><input id="plan-name" data-plan-name value="${escapeHtml(state.plan.name)}" maxlength="30"></div>
      <div class="section-head"><h2>动作</h2><span class="muted small">${state.plan.exercises.length} 项</span></div>
      <div class="list" id="exercise-editor">
        ${state.plan.exercises.map((item, index) => editCard(item, index)).join("")}
      </div>
      <button class="add-btn" data-action="add-exercise">＋ 添加动作</button>
      <div class="spacer"></div>
      ${state.plans.length > 1 ? `<button class="danger-btn" data-action="delete-plan">删除这个训练计划</button><div class="spacer"></div>` : ""}
      <button class="secondary" data-action="cancel-edit">取消</button>
    </div>
  </main>`;
}

function editCard(item, index) {
  return `<article class="edit-card" data-exercise-id="${item.id}">
    <div class="edit-card-head"><strong>动作 ${index + 1}</strong><button data-action="remove-exercise" data-id="${item.id}">删除</button></div>
    <div class="field"><label>名称</label><input data-field="name" value="${escapeHtml(item.name)}" maxlength="30"></div>
    <div class="spacer"></div>
    <div class="triple">
      <div class="field"><label>组数</label><input type="number" inputmode="numeric" min="1" max="20" data-field="sets" value="${item.sets}"></div>
      <div class="field"><label>次数</label><input inputmode="numeric" data-field="reps" value="${escapeHtml(item.reps)}" maxlength="8"></div>
      <div class="field"><label>重量 kg</label><input inputmode="decimal" data-field="weight" value="${escapeHtml(item.weight)}" maxlength="8"></div>
    </div>
    <div class="spacer"></div>
    <div class="field"><label>组间休息（秒）</label><input type="number" inputmode="numeric" min="10" max="900" data-field="rest" value="${item.rest}"></div>
  </article>`;
}

function renderSetup() {
  const name = escapeHtml(state.settings.shortcutName);
  return `<main class="shell">
    ${headerMarkup("计时魔法", "召唤 iPhone 系统计时器")}
    <section class="card setup-status">
      <div class="status-dot ${state.settings.shortcutReady ? "on" : ""}"></div>
      <div><strong>${state.settings.shortcutReady ? "计时魔法已习得" : "需要首次学习"}</strong><p class="muted small">完成后，玩游戏时系统也会响铃</p></div>
    </section>

    <div class="section-head"><h2>新手教程 · 只需一次</h2></div>
    <section class="steps">
      <div class="step">打开 iPhone 自带的 <strong>“快捷指令”</strong> App，点击右上角“＋”。</div>
      <div class="step">把快捷指令命名为 <strong>“${name}”</strong>。</div>
      <div class="step">添加操作 <strong>“从输入中获取数字”</strong>，再添加 <strong>“开始计时”</strong>，让计时时长使用刚才的数字，单位选择“秒”。</div>
      <div class="step">在最后搜索并添加 <strong>“打开 App”</strong>。如果 App 列表能找到“下一组”，就选中它；找不到则跳过这一步。</div>
      <div class="step">保存后返回这里，点击下方按钮测试 10 秒计时。</div>
    </section>
    <div class="spacer"></div>
    <button class="primary" data-action="test-shortcut">测试 10 秒系统计时器</button>
    <div class="spacer"></div>
    <button class="secondary" data-action="mark-shortcut-ready">${state.settings.shortcutReady ? "重新确认已设置" : "我已设置完成"}</button>
    <p class="muted small" style="margin-top:14px;line-height:1.6">说明：新版不再回跳 Safari。如果“打开 App”里能选到“下一组”，快捷指令会直接回到主屏幕 App；如果选不到，计时器仍会正常启动，但需要从 App 切换器手动回来。</p>
    ${nav("setup")}
  </main>`;
}

function currentExercise() { return state.plan.exercises[state.workout.exerciseIndex]; }
function completedSetsBeforeCurrent() {
  const before = state.plan.exercises.slice(0, state.workout.exerciseIndex).reduce((sum, item) => sum + Number(item.sets), 0);
  return before + state.workout.setIndex;
}

function renderWorkout() {
  if (!state.workout) return renderHome();
  const item = currentExercise();
  if (!item) return renderSummary();
  const completed = completedSetsBeforeCurrent();
  const progress = totalSets() ? (completed / totalSets()) * 100 : 0;
  return `<main class="shell workout-shell">
    <header class="workout-head"><button class="icon-btn" data-action="leave-workout" aria-label="返回">‹</button><strong>${escapeHtml(state.plan.name)}</strong><button class="text-btn danger" data-action="end-workout">结束</button></header>
    <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
    <section class="workout-main">
      <div class="set-label">关卡 ${state.workout.exerciseIndex + 1}/${state.plan.exercises.length} · 第 ${state.workout.setIndex + 1}/${item.sets} 波</div>
      <h1 class="exercise-name">${escapeHtml(item.name)}</h1>
      <div class="set-stats">
        <div class="stat"><span>攻击次数</span><strong>${escapeHtml(item.reps)}</strong></div>
        <div class="stat"><span>装备重量</span><strong>${escapeHtml(item.weight || "—")} <small>kg</small></strong></div>
      </div>
      <div class="workout-actions" style="margin-top:auto">
        <button class="primary" data-action="complete-set">本波完成 · 营火休息 ${item.rest} 秒</button>
        <button class="secondary" data-action="skip-set">跳过本组</button>
      </div>
    </section>
  </main>`;
}

function renderRest() {
  const workout = state.workout;
  if (!workout?.restEndsAt) return renderWorkout();
  const remaining = Math.ceil((workout.restEndsAt - Date.now()) / 1000);
  const over = remaining < 0;
  const preparing = remaining >= 0 && remaining <= 10;
  const elapsed = Math.max(0, workout.restDuration - Math.max(0, remaining));
  const pct = clamp((elapsed / workout.restDuration) * 100, 0, 100);
  const next = nextSetLabel();
  return `<main class="shell workout-shell">
    <header class="workout-head"><button class="icon-btn" data-action="leave-workout" aria-label="返回">‹</button><strong>营火休息</strong><button class="text-btn danger" data-action="end-workout">结束</button></header>
    <section class="rest-center">
      <div class="timer-ring ${over ? "over" : ""}" style="--progress:${over ? 100 : pct}%">
        <div class="timer-value" id="timer-value">${over ? `+${formatTime(-remaining)}` : formatTime(remaining)}</div>
        <div class="timer-note" id="timer-note">${over ? "营火熄灭，继续冒险！" : "计时精灵守护中"}</div>
      </div>
      <div class="ranger-stage ${preparing ? "ready" : ""} ${over ? "hurry" : ""}" aria-hidden="true">
        <div class="ranger-sprite"></div>
        <div class="ranger-campfire"></div>
        <span class="ranger-spark ranger-spark-one"></span>
        <span class="ranger-spark ranger-spark-two"></span>
      </div>
      <p class="next-copy">下一组：<strong>${escapeHtml(next)}</strong></p>
      <div class="inline-actions">
        <button class="secondary" data-action="add-rest">＋30 秒</button>
        <button class="primary" data-action="start-next">进入下一波</button>
      </div>
    </section>
  </main>`;
}

function renderSummary() {
  const workout = state.workout;
  const duration = workout ? Math.max(1, Math.round((Date.now() - workout.startedAt) / 60000)) : 0;
  return `<main class="shell">
    ${headerMarkup("冒险通关！", "肌肉经验到账")}
    <section class="card" style="text-align:center;padding:30px 18px">
      <div class="summary-number">${workout?.completedSets || 0}</div>
      <div class="muted">完成组数</div>
      <div class="summary-grid">
        <div class="stat"><span>训练时长</span><strong>${duration} 分钟</strong></div>
        <div class="stat"><span>动作数量</span><strong>${workout?.completedExercises || 0}</strong></div>
      </div>
      <button class="primary" data-action="finish-summary">完成</button>
    </section>
  </main>`;
}

function startWorkout() {
  if (!state.plan.exercises.length) return toast("请先添加至少一个动作");
  if (!state.settings.shortcutReady) {
    state.screen = "setup";
    render();
    toast("请先完成后台提醒设置");
    return;
  }
  state.workout = { status: "active", planId: state.plan.id, planName: state.plan.name, exerciseIndex: 0, setIndex: 0, completedSets: 0, completedExercises: 0, startedAt: Date.now(), restEndsAt: null, restDuration: 0 };
  save(STORAGE.workout, state.workout);
  state.screen = "workout";
  render();
}

function advanceSet(skipRest = false) {
  const item = currentExercise();
  state.workout.completedSets += 1;
  const wasLastSet = state.workout.setIndex + 1 >= Number(item.sets);
  const wasLastExercise = state.workout.exerciseIndex + 1 >= state.plan.exercises.length;
  if (wasLastSet) {
    state.workout.completedExercises += 1;
    if (wasLastExercise) {
      state.workout.status = "complete";
      save(STORAGE.workout, state.workout);
      state.screen = "summary";
      render();
      return;
    }
    state.workout.exerciseIndex += 1;
    state.workout.setIndex = 0;
  } else {
    state.workout.setIndex += 1;
  }

  if (skipRest) {
    state.workout.restEndsAt = null;
    state.screen = "workout";
  } else {
    state.workout.restDuration = Number(item.rest) || 60;
    state.workout.restEndsAt = Date.now() + state.workout.restDuration * 1000;
    state.screen = "rest";
  }
  save(STORAGE.workout, state.workout);
  render();
  if (!skipRest) launchShortcut(state.workout.restDuration);
}

function nextSetLabel() {
  const item = currentExercise();
  return `${item.name} · 第 ${state.workout.setIndex + 1}/${item.sets} 组`;
}

function launchShortcut(seconds) {
  const shortcut = encodeURIComponent(state.settings.shortcutName || "组间提醒");
  const url = `shortcuts://run-shortcut?name=${shortcut}&input=text&text=${encodeURIComponent(String(seconds))}`;
  setTimeout(() => { window.location.href = url; }, 120);
}

function startTicker() {
  const update = () => {
    if (!state.workout?.restEndsAt) return;
    const remaining = Math.ceil((state.workout.restEndsAt - Date.now()) / 1000);
    const value = document.querySelector("#timer-value");
    const note = document.querySelector("#timer-note");
    const ring = document.querySelector(".timer-ring");
    if (!value || !ring) return;
    if (remaining < 0) {
      value.textContent = `+${formatTime(-remaining)}`;
      note.textContent = "营火熄灭，继续冒险！";
      ring.classList.add("over");
      document.querySelector(".ranger-stage")?.classList.add("hurry");
      ring.style.setProperty("--progress", "100%");
    } else {
      value.textContent = formatTime(remaining);
      if (remaining <= 10) document.querySelector(".ranger-stage")?.classList.add("ready");
      const elapsed = state.workout.restDuration - remaining;
      ring.style.setProperty("--progress", `${clamp((elapsed / state.workout.restDuration) * 100, 0, 100)}%`);
    }
  };
  update();
  state.ticker = setInterval(update, 250);
}

function capturePlanForm() {
  const planName = document.querySelector("[data-plan-name]");
  if (planName) state.plan.name = planName.value.trim() || "我的训练";
  document.querySelectorAll("[data-exercise-id]").forEach(card => {
    const item = state.plan.exercises.find(exercise => exercise.id === card.dataset.exerciseId);
    if (!item) return;
    card.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      if (["sets", "rest"].includes(field)) item[field] = Number(input.value);
      else item[field] = input.value.trim();
    });
  });
}

function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "go-home") { state.screen = "home"; render(); }
  if (action === "go-setup") { state.screen = "setup"; render(); }
  if (action === "select-plan") {
    if (hasActiveWorkout() && button.dataset.planId !== state.selectedPlanId) return toast("请先结束当前训练，再切换计划");
    const plan = state.plans.find(item => item.id === button.dataset.planId);
    if (plan) {
      setSelectedPlan(plan);
      render();
      toast(`今天练：${plan.name}`);
    }
  }
  if (action === "new-plan") {
    if (hasActiveWorkout()) return toast("请先结束当前训练，再新建计划");
    const plan = normalizePlan({
      id: cryptoId(),
      name: `训练计划 ${state.plans.length + 1}`,
      exercises: [{ id: cryptoId(), name: "新动作", sets: 3, reps: "10", weight: "", rest: 90 }]
    });
    state.plans.push(plan);
    setSelectedPlan(plan);
    state.editBackup = clone(plan);
    state.screen = "edit";
    render();
  }
  if (action === "edit-plan") {
    if (hasActiveWorkout()) return toast("训练进行中，当前计划已锁定");
    state.editBackup = clone(state.plan);
    state.screen = "edit";
    render();
  }
  if (action === "cancel-edit") {
    if (state.editBackup) replaceSelectedPlan(state.editBackup);
    persistPlans();
    state.screen = "home";
    render();
  }
  if (action === "save-plan") {
    capturePlanForm();
    state.plan.exercises.forEach(item => {
      item.name = item.name || "未命名动作";
      item.sets = clamp(Number(item.sets) || 1, 1, 20);
      item.rest = clamp(Number(item.rest) || 60, 10, 900);
    });
    persistPlans();
    state.screen = "home";
    render();
    toast("训练计划已保存");
  }
  if (action === "delete-plan") {
    if (state.plans.length <= 1) return toast("至少保留一个训练计划");
    if (!window.confirm(`确定删除“${state.plan.name}”吗？`)) return;
    state.plans = state.plans.filter(item => item.id !== state.selectedPlanId);
    setSelectedPlan(state.plans[0]);
    state.screen = "home";
    render();
    toast("训练计划已删除");
  }
  if (action === "add-exercise") {
    capturePlanForm();
    state.plan.exercises.push({ id: cryptoId(), name: "新动作", sets: 3, reps: "10", weight: "", rest: 90 });
    render();
    setTimeout(() => document.querySelector("[data-exercise-id]:last-child input")?.focus(), 50);
  }
  if (action === "remove-exercise") {
    capturePlanForm();
    state.plan.exercises = state.plan.exercises.filter(item => item.id !== button.dataset.id);
    render();
  }
  if (action === "start-workout") startWorkout();
  if (action === "resume-workout") { state.screen = state.workout.restEndsAt ? "rest" : "workout"; render(); }
  if (action === "leave-workout") { state.screen = "home"; render(); }
  if (action === "complete-set") advanceSet(false);
  if (action === "skip-set") advanceSet(true);
  if (action === "start-next") { state.workout.restEndsAt = null; save(STORAGE.workout, state.workout); state.screen = "workout"; render(); }
  if (action === "add-rest") {
    state.workout.restEndsAt += 30000;
    state.workout.restDuration += 30;
    save(STORAGE.workout, state.workout);
    launchShortcut(Math.max(1, Math.ceil((state.workout.restEndsAt - Date.now()) / 1000)));
  }
  if (action === "end-workout") {
    state.workout.status = "complete";
    save(STORAGE.workout, state.workout);
    state.screen = "summary";
    render();
  }
  if (action === "finish-summary") {
    state.history.unshift({ date: new Date().toISOString(), plan: state.workout?.planName || state.plan.name, sets: state.workout?.completedSets || 0 });
    state.history = state.history.slice(0, 30);
    save(STORAGE.history, state.history);
    state.workout = null;
    localStorage.removeItem(STORAGE.workout);
    state.screen = "home";
    render();
  }
  if (action === "test-shortcut") launchShortcut(10);
  if (action === "mark-shortcut-ready") {
    state.settings.shortcutReady = true;
    save(STORAGE.settings, state.settings);
    render();
    toast("后台提醒已启用");
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.screen === "rest") render();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

if (state.workout && state.workout.status !== "complete") {
  state.screen = state.workout.restEndsAt ? "rest" : "home";
}
render();
