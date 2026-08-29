(() => {
  "use strict";

  const DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const SESSIONS_BEFORE_LONG_BREAK = 4;
  const STORAGE_KEY = "focusflow.state.v1";
  const RING_CIRCUMFERENCE = 2 * Math.PI * 100;

  const todayStr = () => new Date().toISOString().slice(0, 10);

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      saved = null;
    }
    const defaults = {
      tasks: [],
      activeTaskId: null,
      mode: "work",
      secondsLeft: DURATIONS.work,
      running: false,
      sessionIndex: 0,
      history: {},
      lastActiveDate: todayStr(),
      currentStreak: 0,
      dailyGoal: 4,
    };
    return Object.assign(defaults, saved || {});
  }

  let state = loadState();
  let tickHandle = null;

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // ---- streak bookkeeping ----
  function ensureTodayEntry() {
    const t = todayStr();
    if (!state.history[t]) state.history[t] = 0;
  }

  function recomputeStreak() {
    let streak = 0;
    let cursor = new Date();
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      const count = state.history[key] || 0;
      if (count > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    state.currentStreak = streak;
  }

  // ---- DOM refs ----
  const el = {
    modeTabs: document.querySelectorAll(".mode-tab"),
    ringProgress: document.getElementById("ring-progress"),
    timeDisplay: document.getElementById("time-display"),
    currentTaskDisplay: document.getElementById("current-task-display"),
    startBtn: document.getElementById("start-btn"),
    resetBtn: document.getElementById("reset-btn"),
    skipBtn: document.getElementById("skip-btn"),
    sessionDots: document.getElementById("session-dots"),
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskList: document.getElementById("task-list"),
    emptyState: document.getElementById("empty-state"),
    pomoToday: document.getElementById("pomo-today"),
    streakCount: document.getElementById("streak-count"),
    goalProgressText: document.getElementById("goal-progress-text"),
    goalFill: document.getElementById("goal-fill"),
    goalInc: document.getElementById("goal-inc"),
    goalDec: document.getElementById("goal-dec"),
    clearDataBtn: document.getElementById("clear-data-btn"),
    celebrateOverlay: document.getElementById("celebrate-overlay"),
    celebrateTitle: document.getElementById("celebrate-title"),
    celebrateSub: document.getElementById("celebrate-sub"),
    celebrateContinue: document.getElementById("celebrate-continue"),
    confettiCanvas: document.getElementById("confetti-canvas"),
  };

  el.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // ---- rendering ----
  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function modeColor(mode) {
    if (mode === "work") return getCss("--accent");
    if (mode === "short") return getCss("--accent-2");
    return getCss("--accent-3");
  }

  function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function render() {
    // mode tabs
    el.modeTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    // timer
    el.timeDisplay.textContent = formatTime(state.secondsLeft);
    const total = DURATIONS[state.mode];
    const frac = 1 - state.secondsLeft / total;
    el.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - frac));
    el.ringProgress.style.stroke = modeColor(state.mode);

    el.startBtn.textContent = state.running ? "Pause" : "Start";

    const activeTask = state.tasks.find((t) => t.id === state.activeTaskId);
    el.currentTaskDisplay.textContent = activeTask ? activeTask.text : "No task selected";

    // session dots
    el.sessionDots.innerHTML = "";
    for (let i = 0; i < SESSIONS_BEFORE_LONG_BREAK; i++) {
      const dot = document.createElement("span");
      dot.className = "dot" + (i < state.sessionIndex % SESSIONS_BEFORE_LONG_BREAK ? " filled" : "");
      el.sessionDots.appendChild(dot);
    }

    // tasks
    el.taskList.innerHTML = "";
    el.emptyState.style.display = state.tasks.length ? "none" : "block";
    state.tasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item" + (task.id === state.activeTaskId ? " active" : "") + (task.done ? " done" : "");
      li.dataset.id = task.id;

      const check = document.createElement("button");
      check.className = "task-check";
      check.type = "button";
      check.textContent = task.done ? "✓" : "";
      check.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleDone(task.id);
      });

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;

      const pomos = document.createElement("span");
      pomos.className = "task-pomos";
      pomos.textContent = task.pomos ? `🍅 ${task.pomos}` : "";

      const del = document.createElement("button");
      del.className = "task-delete";
      del.type = "button";
      del.textContent = "✕";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteTask(task.id);
      });

      li.addEventListener("click", () => setActiveTask(task.id));

      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(pomos);
      li.appendChild(del);
      el.taskList.appendChild(li);
    });

    // streak / pomo counters
    ensureTodayEntry();
    const completedToday = state.history[todayStr()] || 0;
    el.pomoToday.textContent = `${completedToday} pomodoros today`;
    el.streakCount.textContent = state.currentStreak;

    // daily goal bar
    el.goalProgressText.textContent = `${completedToday} / ${state.dailyGoal} 🍅`;
    const pct = Math.min(100, (completedToday / state.dailyGoal) * 100);
    el.goalFill.style.width = `${pct}%`;
    el.goalFill.classList.toggle("complete", completedToday >= state.dailyGoal);
  }

  // ---- task actions ----
  function addTask(text) {
    state.tasks.push({ id: uid(), text, done: false, pomos: 0 });
    if (!state.activeTaskId) state.activeTaskId = state.tasks[state.tasks.length - 1].id;
    save();
    render();
  }

  function toggleDone(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;
    save();
    render();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (state.activeTaskId === id) {
      const next = state.tasks.find((t) => !t.done);
      state.activeTaskId = next ? next.id : null;
    }
    save();
    render();
  }

  function setActiveTask(id) {
    state.activeTaskId = id;
    save();
    render();
  }

  // ---- timer actions ----
  function setMode(mode, resetTime = true) {
    state.mode = mode;
    if (resetTime) state.secondsLeft = DURATIONS[mode];
    save();
    render();
  }

  function startPause() {
    state.running = !state.running;
    if (state.running) {
      tickHandle = setInterval(tick, 1000);
    } else {
      clearInterval(tickHandle);
    }
    save();
    render();
  }

  function resetTimer() {
    state.running = false;
    clearInterval(tickHandle);
    state.secondsLeft = DURATIONS[state.mode];
    save();
    render();
  }

  function skip() {
    state.running = false;
    clearInterval(tickHandle);
    completeSession(true);
  }

  function tick() {
    state.secondsLeft--;
    if (state.secondsLeft <= 0) {
      clearInterval(tickHandle);
      state.running = false;
      completeSession(false);
      return;
    }
    render();
  }

  function completeSession(skipped) {
    if (state.mode === "work" && !skipped) {
      // credit the pomodoro
      const t = todayStr();
      ensureTodayEntry();
      state.history[t] = (state.history[t] || 0) + 1;
      recomputeStreak();

      const activeTask = state.tasks.find((tk) => tk.id === state.activeTaskId);
      if (activeTask) activeTask.pomos = (activeTask.pomos || 0) + 1;

      state.sessionIndex++;
      const nextMode = state.sessionIndex % SESSIONS_BEFORE_LONG_BREAK === 0 ? "long" : "short";
      if (state.history[t] === state.dailyGoal) {
        celebrate("Daily goal reached! 🎯", `You hit ${state.dailyGoal} pomodoros today. Keep going or rest easy.`);
      } else {
        celebrate("Pomodoro complete!", nextMode === "long" ? "Time for a long break." : "Take a short break.");
      }
      setMode(nextMode);
    } else if (state.mode !== "work" && !skipped) {
      celebrate("Break's over!", "Ready for another focus session?");
      setMode("work");
    } else {
      // skipped manually, no celebration/credit
      if (state.mode === "work") {
        state.sessionIndex++;
        const nextMode = state.sessionIndex % SESSIONS_BEFORE_LONG_BREAK === 0 ? "long" : "short";
        setMode(nextMode);
      } else {
        setMode("work");
      }
    }
    save();
    render();
  }

  // ---- celebration + confetti ----
  function celebrate(title, sub) {
    el.celebrateTitle.textContent = title;
    el.celebrateSub.textContent = sub;
    el.celebrateOverlay.classList.add("show");
    fireConfetti();
    playChime();
  }

  el.celebrateContinue.addEventListener("click", () => {
    el.celebrateOverlay.classList.remove("show");
  });

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.4);
      });
    } catch (e) {
      // audio not available, ignore
    }
  }

  function fireConfetti() {
    const canvas = el.confettiCanvas;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#ff6b6b", "#4dd4c0", "#ffd166", "#8ea6ff"];
    const particles = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 3,
      speedX: -2 + Math.random() * 4,
      rotation: Math.random() * 360,
      rotationSpeed: -8 + Math.random() * 16,
    }));

    let frame = 0;
    const maxFrames = 150;

    function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(step);
  }

  // ---- events ----
  el.modeTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.running = false;
      clearInterval(tickHandle);
      setMode(btn.dataset.mode);
    });
  });

  el.startBtn.addEventListener("click", startPause);
  el.resetBtn.addEventListener("click", resetTimer);
  el.skipBtn.addEventListener("click", skip);

  el.taskForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = el.taskInput.value.trim();
    if (!text) return;
    addTask(text);
    el.taskInput.value = "";
    el.taskInput.focus();
  });

  el.goalInc.addEventListener("click", () => {
    state.dailyGoal = Math.min(16, state.dailyGoal + 1);
    save();
    render();
  });

  el.goalDec.addEventListener("click", () => {
    state.dailyGoal = Math.max(1, state.dailyGoal - 1);
    save();
    render();
  });

  el.clearDataBtn.addEventListener("click", () => {
    if (!confirm("Reset all tasks, timer progress, and streak data? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    clearInterval(tickHandle);
    render();
  });

  window.addEventListener("resize", () => {
    if (el.celebrateOverlay.classList.contains("show")) return;
  });

  // ---- init ----
  ensureTodayEntry();
  recomputeStreak();
  state.running = false; // never auto-resume a running timer across reloads
  save();
  render();
})();
