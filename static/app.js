
const $ = (id) => document.getElementById(id);
let state = null;

const deviceVisuals = [
  { match: ["tv", "stream"], icon: "📺", vampire: "The Phantom Screen" },
  { match: ["gaming", "console", "playstation", "xbox"], icon: "🎮", vampire: "The Idle Boss" },
  { match: ["monitor", "desktop", "computer"], icon: "🖥️", vampire: "The Glow Ghost" },
  { match: ["air-conditioner", "aircon", "air con"], icon: "❄️", vampire: "The Cold Drainer" },
  { match: ["charger", "adapter", "cable"], icon: "🔌", vampire: "The Socket Leech" },
  { match: ["kitchen", "toaster", "microwave", "kettle"], icon: "🍳", vampire: "The Counter Creeper" },
  { match: ["printer"], icon: "🖨️", vampire: "The Paper Phantom" },
];

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function visualFor(name) {
  const lower = name.toLowerCase();
  const found = deviceVisuals.find(v => v.match.some(word => lower.includes(word)));
  return found || { icon: "⚡", vampire: "The Quiet Drainer" };
}

function render() {
  const devices = state.devices || [];
  const doneCount = devices.filter(d => d.done).length;
  const total = devices.length;
  const left = total - doneCount;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  $("streak").textContent = state.stats.streak;
  $("bestStreak").textContent = state.stats.best_streak;
  $("missionsCompleted").textContent = state.stats.missions_completed;
  $("kwhSaved").textContent = Number(state.stats.estimated_kwh_saved).toFixed(2);
  $("vampiresDefeated").textContent = state.stats.vampires_defeated;
  $("progressText").textContent = `${doneCount} / ${total}`;
  $("progressBar").style.width = `${pct}%`;

  $("level").textContent = state.stats.level;
  $("xpNow").textContent = state.stats.xp_into_level;
  $("xpNext").textContent = state.stats.xp_to_next;
  $("xpBar").style.width = `${Math.min(100, (state.stats.xp_into_level / state.stats.xp_to_next) * 100)}%`;

  $("statusNudge").textContent =
    state.completed ? "Mission complete. House secured for tonight." :
    left === 0 ? "Everything is checked. Complete your mission." :
    left === 1 ? "Only 1 energy vampire left tonight." :
    `${left} energy vampires left tonight.`;

  $("deviceList").innerHTML = devices.map(d => {
    const v = visualFor(d.name);
    return `
      <div class="device ${d.done ? "done" : ""}">
        <div class="device-icon">${v.icon}</div>
        <div class="device-main">
          <div class="device-topline">
            <div class="device-name">${escapeHtml(d.name)}</div>
            <span class="watts">~${Number(d.standby_watts).toFixed(1)}W</span>
          </div>
          <span class="device-room">${escapeHtml(d.room)}</span>
          <span class="vampire-name">${v.vampire}</span>
        </div>
        <button class="check-btn" onclick="toggleDevice(${d.id}, ${!d.done})">
          ${d.done ? "✓" : "○"}
        </button>
      </div>
    `;
  }).join("");

  $("completeBtn").disabled = state.completed || total === 0 || doneCount !== total;
  $("completeBtn").innerHTML = state.completed
    ? `<span>Mission Cleared</span><b>✓</b>`
    : `<span>Complete Night Mission</span><b>⚔</b>`;

  renderWeekly();
  renderManager();
  renderHouse(doneCount, total);
  renderImpact();
  renderBadges();
}

function renderWeekly() {
  const target = $("weeklyChart");
  const weekly = state.weekly || [];
  target.innerHTML = weekly.map(row => {
    const d = new Date(`${row.day}T00:00:00`);
    const label = d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
    const today = row.day === state.day;
    return `
      <div class="day-column ${today ? "today-column" : ""}">
        <div class="day-bar ${row.completed ? "done" : ""}" title="${row.kwh_saved} kWh">
          ${row.completed ? "✓" : ""}
        </div>
        <span class="day-label ${today ? "today" : ""}">${label}</span>
        <span class="day-creature ${today ? "show" : ""}" aria-hidden="true">${today ? "🧛" : ""}</span>
      </div>
    `;
  }).join("");
}

function renderHouse(doneCount, total) {
  const devices = state.devices || [];
  const left = Math.max(0, total - doneCount);
  const grid = $("houseWindows");

  // One window per tracked device. Adding/removing devices changes the house automatically.
  grid.innerHTML = devices.map((device, index) => `
    <span
      class="window ${device.done ? "" : "on"}"
      title="${escapeHtml(device.name)} — ${device.done ? "switched off" : "still awake"}"
      aria-label="${escapeHtml(device.name)} ${device.done ? "switched off" : "still awake"}"
    ></span>
  `).join("");

  // Adjust the grid so different household sizes still fit neatly inside the house.
  let cols = 3;
  let size = 22;
  if (total <= 2) {
    cols = Math.max(1, total);
    size = 24;
  } else if (total <= 6) {
    cols = 3;
    size = 22;
  } else if (total <= 8) {
    cols = 4;
    size = 18;
  } else if (total <= 12) {
    cols = 4;
    size = 16;
  } else {
    cols = 5;
    size = 13;
  }

  grid.style.setProperty("--window-cols", cols);
  grid.style.setProperty("--window-size", `${size}px`);

  $("houseCount").textContent = left === 1 ? "1 awake" : `${left} awake`;

  if (total === 0) {
    $("houseHeadline").textContent = "No devices tracked";
    $("houseStatus").textContent = "Add household devices to build your nightly mission.";
  } else if (left === 0) {
    $("houseHeadline").textContent = "House secured";
    $("houseStatus").textContent = "Every tracked device is switched off for the night.";
  } else if (left <= 2) {
    $("houseHeadline").textContent = "Almost quiet";
    $("houseStatus").textContent = `${left} ${left === 1 ? "window is" : "windows are"} still glowing.`;
  } else {
    $("houseHeadline").textContent = "Energy vampires awake";
    $("houseStatus").textContent = "Switch off devices to darken the house.";
  }
}

function renderImpact() {
  const devices = state.devices || [];
  const totalWatts = devices.reduce((sum, d) => sum + Number(d.standby_watts || 0), 0);
  const tonight = (totalWatts * Number(state.overnight_hours || 8)) / 1000;

  $("tonightImpactLabel").textContent = state.completed
    ? "Saved tonight"
    : "Tonight's potential";

  $("tonightPotential").textContent = `${tonight.toFixed(3)} kWh`;
  $("weekPotential").textContent = `${(tonight * 7).toFixed(2)} kWh`;
  $("monthPotential").textContent = `${(tonight * 30).toFixed(2)} kWh`;
}

function renderBadges() {
  const stats = state.stats || {};
  const badges = [
    {
      icon: "⚔️",
      name: "First Hunt",
      hint: "Clear 1 mission",
      unlocked: Number(stats.missions_completed) >= 1
    },
    {
      icon: "🔥",
      name: "On a Roll",
      hint: "Reach a 3-night streak",
      unlocked: Number(stats.best_streak) >= 3 || Number(stats.streak) >= 3
    },
    {
      icon: "🛡️",
      name: "Night Guardian",
      hint: "Reach a 7-night streak",
      unlocked: Number(stats.best_streak) >= 7 || Number(stats.streak) >= 7
    },
    {
      icon: "⚡",
      name: "Power Saver",
      hint: "Avoid an est. 1 kWh",
      unlocked: Number(stats.estimated_kwh_saved) >= 1
    }
  ];

  $("badgeGrid").innerHTML = badges.map(b => `
    <div class="badge ${b.unlocked ? "unlocked" : "locked"}">
      <div class="badge-icon">${b.icon}</div>
      <b>${b.name}</b>
      <small>${b.unlocked ? "Unlocked" : b.hint}</small>
    </div>
  `).join("");
}

function renderManager() {
  const devices = state.devices || [];
  $("managerDeviceCount").textContent = `${devices.length} ${devices.length === 1 ? "device" : "devices"}`;

  if (!devices.length) {
    $("managerDeviceList").innerHTML = `
      <div class="empty-manager-state">
        No active devices yet. Add one above to build your nightly quest.
      </div>
    `;
    return;
  }

  $("managerDeviceList").innerHTML = devices.map(d => {
    const v = visualFor(d.name);
    return `
      <div class="manager-device-row">
        <div class="manager-device-icon">${v.icon}</div>
        <div>
          <b>${escapeHtml(d.name)}</b>
          <small>${escapeHtml(d.room)} · ~${Number(d.standby_watts).toFixed(1)}W</small>
        </div>
        <button class="remove-device-btn" onclick="removeDevice(${d.id}, '${escapeJs(d.name)}')">
          Remove
        </button>
      </div>
    `;
  }).join("");
}

async function removeDevice(id, name) {
  const ok = confirm(`Remove ${name} from future nightly missions?`);
  if (!ok) return;
  await request(`/api/device/${id}`, { method: "DELETE" });
  await loadState();
}

async function loadState() {
  state = await request("/api/state");
  render();
}

async function toggleDevice(id, done) {
  await request(`/api/toggle/${id}`, {
    method: "POST",
    body: JSON.stringify({ done })
  });
  await loadState();
}

$("completeBtn").addEventListener("click", async () => {
  try {
    const result = await request("/api/complete", { method: "POST" });
    $("victoryKwh").textContent = `${Number(result.kwh_saved_today).toFixed(3)} kWh`;
    $("victoryText").textContent = "Every active device on tonight's list was checked. Your streak is protected.";
    $("victoryModal").classList.add("show");
    launchConfetti();
    await loadState();
  } catch (err) {
    alert(err.message);
  }
});

$("closeVictory").addEventListener("click", () => {
  $("victoryModal").classList.remove("show");
});
$("victoryModal").addEventListener("click", (e) => {
  if (e.target.id === "victoryModal") $("victoryModal").classList.remove("show");
});

$("openManager").addEventListener("click", () => {
  $("managerModal").classList.add("show");
});
$("closeManager").addEventListener("click", () => {
  $("managerModal").classList.remove("show");
});
$("managerModal").addEventListener("click", (e) => {
  if (e.target.id === "managerModal") $("managerModal").classList.remove("show");
});

function selectedDevicePreset() {
  const select = $("deviceType");
  const option = select.options[select.selectedIndex];
  return {
    name: option.value,
    watts: Number(option.dataset.watts || 2)
  };
}

function syncDevicePresetUI() {
  const preset = selectedDevicePreset();
  const isOther = preset.name === "Other";
  const useCustom = $("useCustomEstimate").checked;

  $("customNameWrap").classList.toggle("hidden-field", !isOther);
  $("customWattsWrap").classList.toggle("hidden-field", !useCustom);

  if (!useCustom) {
    $("deviceWatts").value = preset.watts;
  }

  const shownWatts = useCustom
    ? Number($("deviceWatts").value || preset.watts)
    : preset.watts;

  $("presetWattsDisplay").textContent = `~${shownWatts.toFixed(1)}W`;
}

$("deviceType").addEventListener("change", syncDevicePresetUI);
$("useCustomEstimate").addEventListener("change", syncDevicePresetUI);
$("deviceWatts").addEventListener("input", syncDevicePresetUI);

$("addDeviceForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const preset = selectedDevicePreset();
  const isOther = preset.name === "Other";
  const customName = $("customDeviceName").value.trim();
  const name = isOther ? customName : preset.name;

  if (isOther && !customName) {
    alert("Please enter a name for the other device.");
    $("customDeviceName").focus();
    return;
  }

  const watts = $("useCustomEstimate").checked
    ? Number($("deviceWatts").value || preset.watts)
    : preset.watts;

  await request("/api/device", {
    method: "POST",
    body: JSON.stringify({
      name,
      room: $("deviceRoom").value,
      standby_watts: watts
    })
  });

  $("deviceType").selectedIndex = 0;
  $("customDeviceName").value = "";
  $("deviceRoom").value = "";
  $("useCustomEstimate").checked = false;
  $("deviceWatts").value = "4";
  syncDevicePresetUI();

  await loadState();
});

$("resetBtn").addEventListener("click", async () => {
  const ok = confirm("Reset today's checklist and completion?");
  if (!ok) return;
  await request("/api/reset-today", { method: "POST" });
  await loadState();
});

function launchConfetti() {
  const layer = $("confettiLayer");
  layer.innerHTML = "";
  const colors = ["#73f59b", "#d2ff72", "#ffd96f", "#ffffff", "#34d877"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
    piece.style.animationDelay = `${Math.random() * .35}s`;
    piece.style.setProperty("--drift", `${-80 + Math.random() * 160}px`);
    layer.appendChild(piece);
  }

  setTimeout(() => { layer.innerHTML = ""; }, 4500);
}

function escapeJs(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

syncDevicePresetUI();

loadState().catch(err => {
  console.error(err);
  alert("Could not load Standby Slayer. Make sure Flask is running.");
});
