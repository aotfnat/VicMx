import * as store from "./store.js";
import { VEHICLE_CLASSES, getTemplate } from "./schedules.js";
import { decodeVin } from "./vin.js";
import * as push from "./push.js";

const appEl = document.getElementById("app");
const APP_VERSION = "1.0.0";

let currentTab = "upcoming"; // per-vehicle-detail tab state, reset on navigation

// ------------------------------------------------------------------ utils

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMiles(n) {
  if (n == null) return "—";
  return Math.round(n).toLocaleString() ;
}

function fmtMoney(n) {
  if (n == null) return "";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function statusLabel(status) {
  return { overdue: "Overdue", dueSoon: "Due soon", ok: "On track", asNeeded: "As needed" }[status] || status;
}

function taskDueText(status) {
  const parts = [];
  if (status.nextDueMileage != null) parts.push(`at ${fmtMiles(status.nextDueMileage)} mi`);
  if (status.nextDueDate) parts.push(`by ${fmtDate(status.nextDueDate)}`);
  if (!parts.length) return "Inspect as needed";
  return "Due " + parts.join(" or ");
}

function navigate(hash) {
  currentTab = "upcoming";
  window.location.hash = hash;
}

// ------------------------------------------------------------------ toast

function toast(message) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

// ------------------------------------------------------------------ modal

function openModal(innerHtml, onMount) {
  closeModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop);
}

function closeModal() {
  const existing = document.getElementById("modal-backdrop");
  if (existing) existing.remove();
}

// =============================================================== RENDERING

function render() {
  const hash = window.location.hash || "#/";
  const vehicleMatch = hash.match(/^#\/vehicle\/([^/]+)/);

  if (hash.startsWith("#/settings")) {
    renderSettings();
  } else if (vehicleMatch) {
    renderVehicleDetail(vehicleMatch[1]);
  } else {
    renderDashboard();
  }
  window.scrollTo(0, 0);
}

function topbar({ title, back, actions }) {
  return `
    <div class="topbar">
      ${back ? `<button class="back-btn" data-action="back" aria-label="Back">&larr;</button>` : ""}
      ${title}
      <div style="flex:1"></div>
      ${actions || ""}
    </div>
  `;
}

// -------------------------------------------------------------- dashboard

function renderDashboard() {
  const vehicles = store.listVehicles();
  const allReminders = store.getAllReminders();
  const overdueCount = allReminders.reduce((n, r) => n + r.reminders.taskAlerts.filter((a) => a.status.status === "overdue").length, 0);
  const dueSoonCount = allReminders.reduce((n, r) => n + r.reminders.taskAlerts.filter((a) => a.status.status === "dueSoon").length, 0);
  const staleCount = allReminders.filter((r) => r.reminders.mileageStale).length;

  let banner = "";
  if (overdueCount || dueSoonCount || staleCount) {
    const bits = [];
    if (overdueCount) bits.push(`<strong>${overdueCount} overdue</strong>`);
    if (dueSoonCount) bits.push(`<strong>${dueSoonCount} due soon</strong>`);
    if (staleCount) bits.push(`<strong>${staleCount} vehicle${staleCount > 1 ? "s" : ""}</strong> need${staleCount > 1 ? "" : "s"} a mileage update`);
    banner = `<div class="reminder-banner ${overdueCount ? "overdue" : ""}">⏰ <span>${bits.join(" &middot; ")}. Open a vehicle to take care of it.</span></div>`;
  }

  const cards = vehicles.length
    ? vehicles.map((v) => vehicleCard(v)).join("")
    : `<div class="empty-state">
        <div class="gauge-big">⏲️</div>
        <h2>No vehicles yet</h2>
        <p class="helper-text">Add your first vehicle and GearLog will start you off with a standard maintenance schedule you can customize.</p>
      </div>`;

  appEl.innerHTML = `
    ${topbar({
      title: `<div class="brand"><span class="gauge-dot"></span>GearLog<small>SHOP LOG</small></div>`,
      actions: `<button class="icon-btn" data-action="goto-settings" aria-label="Settings">⚙️</button>`,
    })}
    <main>
      ${banner}
      ${cards}
      <div class="fab-row">
        <button class="btn btn-primary btn-block" data-action="add-vehicle">+ Add vehicle</button>
      </div>
    </main>
  `;
  wireGlobalActions();
  push.syncPushJobs();
}

function vehicleCard(v) {
  const reminders = store.getReminders(v.id);
  const overdue = reminders.taskAlerts.filter((a) => a.status.status === "overdue").length;
  const dueSoon = reminders.taskAlerts.filter((a) => a.status.status === "dueSoon").length;

  const chips = [];
  if (overdue) chips.push(`<span class="chip overdue"><span class="dot"></span>${overdue} overdue</span>`);
  if (dueSoon) chips.push(`<span class="chip dueSoon"><span class="dot"></span>${dueSoon} due soon</span>`);
  if (!overdue && !dueSoon) chips.push(`<span class="chip ok"><span class="dot"></span>All caught up</span>`);
  if (reminders.mileageStale) chips.push(`<span class="chip stale">Mileage not updated in ${reminders.daysSinceMileage}d</span>`);

  return `
    <div class="vehicle-card" data-action="open-vehicle" data-id="${v.id}">
      <div class="tag-punch"></div>
      <div class="vehicle-card-top">
        <div>
          <div class="vehicle-name">${esc(v.nickname)}</div>
          <div class="vehicle-sub">${esc([v.year, v.make, v.model].filter(Boolean).join(" "))}</div>
        </div>
        <div class="odometer">${fmtMiles(v.currentMileage)}<span class="unit">MI</span></div>
      </div>
      <div class="status-row">${chips.join("")}</div>
    </div>
  `;
}

// ---------------------------------------------------------- vehicle detail

function renderVehicleDetail(id) {
  const v = store.getVehicle(id);
  if (!v) {
    navigate("#/");
    return;
  }
  const reminders = store.getReminders(id);

  let banner = "";
  if (reminders.mileageStale) {
    banner = `<div class="reminder-banner">🛣️ <span>You haven't logged mileage in <strong>${reminders.daysSinceMileage} days</strong>. A current reading keeps due-dates accurate.</span></div>`;
  }

  appEl.innerHTML = `
    ${topbar({
      back: true,
      title: `<h1>${esc(v.nickname)}</h1>`,
      actions: `<button class="icon-btn" data-action="edit-vehicle" data-id="${v.id}" aria-label="Edit vehicle">✎</button>`,
    })}
    <main>
      <div class="panel" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <div class="vehicle-sub">${esc([v.year, v.make, v.model, v.trim].filter(Boolean).join(" "))}</div>
            <div class="odometer" style="margin-top:8px;">${fmtMiles(v.currentMileage)}<span class="unit">MI</span></div>
          </div>
          <button class="btn btn-secondary" data-action="log-mileage" data-id="${v.id}">Log mileage</button>
        </div>
      </div>
      ${banner}
      <div class="tabs">
        <div class="tab ${currentTab === "upcoming" ? "active" : ""}" data-action="tab" data-tab="upcoming">Upcoming</div>
        <div class="tab ${currentTab === "history" ? "active" : ""}" data-action="tab" data-tab="history">History</div>
        <div class="tab ${currentTab === "info" ? "active" : ""}" data-action="tab" data-tab="info">Info</div>
      </div>
      <div id="tab-content"></div>
    </main>
  `;
  renderTabContent(v);
  wireGlobalActions();
  wireVehicleDetailActions(v);
  push.syncPushJobs();
}

function renderTabContent(v) {
  const el = document.getElementById("tab-content");
  if (currentTab === "upcoming") el.innerHTML = upcomingTabHtml(v);
  else if (currentTab === "history") el.innerHTML = historyTabHtml(v);
  else el.innerHTML = infoTabHtml(v);
}

function upcomingTabHtml(v) {
  const tasks = store.listTasks(v.id).filter((t) => t.active);
  const withStatus = tasks.map((t) => ({ task: t, status: store.computeTaskStatus(t) }));
  const order = { overdue: 0, dueSoon: 1, ok: 2, asNeeded: 3 };
  withStatus.sort((a, b) => order[a.status.status] - order[b.status.status]);

  const rows = withStatus.length
    ? withStatus.map(({ task, status }) => taskRowHtml(task, status)).join("")
    : `<div class="empty-state"><p class="helper-text">No maintenance tasks yet.</p></div>`;

  return `
    ${rows}
    <div class="fab-row">
      <button class="btn btn-secondary btn-block" data-action="add-task" data-id="${v.id}">+ Add custom task</button>
    </div>
  `;
}

function taskRowHtml(task, status) {
  return `
    <div class="task-row">
      <div class="task-row-top">
        <div>
          <div class="task-name">${esc(task.name)}</div>
          <div class="task-category">${esc(task.category)}</div>
        </div>
        <span class="chip ${status.status}"><span class="dot"></span>${statusLabel(status.status)}</span>
      </div>
      <div class="task-meta">${taskDueText(status)}${task.lastDoneDate ? ` &middot; last done ${fmtDate(task.lastDoneDate)}${task.lastDoneMileage != null ? ` at ${fmtMiles(task.lastDoneMileage)} mi` : ""}` : ""}</div>
      ${task.notes ? `<div class="task-notes">${esc(task.notes)}</div>` : ""}
      <div class="task-actions">
        <button class="btn btn-primary btn-sm" data-action="complete-task" data-id="${task.id}">Mark done</button>
        <button class="btn btn-secondary btn-sm" data-action="edit-task" data-id="${task.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-task" data-id="${task.id}">Delete</button>
      </div>
    </div>
  `;
}

function historyTabHtml(v) {
  const logs = store.listLogs(v.id);
  const rows = logs.length
    ? logs.map((l) => logRowHtml(l)).join("")
    : `<div class="empty-state"><p class="helper-text">Nothing logged yet. Completed tasks and one-off repairs will show up here.</p></div>`;
  return `
    ${rows}
    <div class="fab-row">
      <button class="btn btn-secondary btn-block" data-action="log-unscheduled" data-id="${v.id}">+ Log unscheduled maintenance</button>
    </div>
  `;
}

function logRowHtml(l) {
  return `
    <div class="log-row ${l.type}">
      <div class="log-row-top">
        <div class="log-title">${esc(l.title)}</div>
        <div class="log-date">${fmtDate(l.date)}</div>
      </div>
      <div class="log-meta">${l.mileage != null ? `${fmtMiles(l.mileage)} mi` : ""}${l.cost != null ? ` &middot; ${fmtMoney(l.cost)}` : ""}${l.type === "unscheduled" ? ` &middot; Unscheduled` : ""}</div>
      ${l.notes ? `<div class="log-notes">${esc(l.notes)}</div>` : ""}
      <div class="task-actions">
        <button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${l.id}">Delete entry</button>
      </div>
    </div>
  `;
}

function infoTabHtml(v) {
  const cls = VEHICLE_CLASSES.find((c) => c.id === v.vehicleClass);
  return `
    <div class="panel">
      <div class="field"><label>Nickname</label><div>${esc(v.nickname)}</div></div>
      <div class="field-row">
        <div class="field"><label>Year</label><div>${esc(v.year) || "—"}</div></div>
        <div class="field"><label>Make</label><div>${esc(v.make) || "—"}</div></div>
        <div class="field"><label>Model</label><div>${esc(v.model) || "—"}</div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Trim</label><div>${esc(v.trim) || "—"}</div></div>
        <div class="field"><label>VIN</label><div>${esc(v.vin) || "—"}</div></div>
      </div>
      <div class="field"><label>Vehicle type</label><div>${esc(cls ? cls.label : "—")}</div></div>
      <div class="field"><label>Added</label><div>${fmtDate(v.createdAt)}</div></div>
    </div>
    <div class="fab-row">
      <button class="btn btn-secondary btn-block" data-action="edit-vehicle" data-id="${v.id}">Edit vehicle details</button>
    </div>
    <div class="fab-row">
      <button class="btn btn-danger btn-block" data-action="delete-vehicle" data-id="${v.id}">Delete this vehicle</button>
    </div>
  `;
}

// -------------------------------------------------------------- settings

function renderSettings() {
  const s = store.getSettings();
  appEl.innerHTML = `
    ${topbar({ back: true, title: `<h1>Settings</h1>` })}
    <main>
      <div class="section-title">Reminders</div>
      <div class="panel">
        <div class="field">
          <label>Remind me to log mileage after (days)</label>
          <input type="number" id="set-mileage-days" value="${s.mileageReminderDays}" min="1" />
        </div>
        <div class="field">
          <label>"Due soon" window (miles)</label>
          <input type="number" id="set-due-miles" value="${s.dueSoonMiles}" min="0" />
        </div>
        <div class="field">
          <label>"Due soon" window (days)</label>
          <input type="number" id="set-due-days" value="${s.dueSoonDays}" min="0" />
        </div>
        <button class="btn btn-primary btn-block" data-action="save-settings">Save reminder settings</button>
      </div>

      <div class="section-title">Notifications (while app is open)</div>
      <div class="panel">
        <p class="helper-text">Shows a browser notification for overdue/due-soon items when you open GearLog.</p>
        <button class="btn btn-secondary btn-block" data-action="enable-notifications">Enable browser notifications</button>
      </div>

      <div class="section-title">Background reminders (optional)</div>
      <div class="panel">
        <p class="helper-text">
          Connects to a small push relay you host yourself (see the <code>gearlog-push</code> project) so date-based reminders — mileage nudges and month-interval tasks — can reach you even when GearLog isn't open. It checks twice a day. Mileage-only intervals still need the app opened to evaluate, since only your device knows your mileage.
          Only a device token and short reminder text ever leave your device.
        </p>
        <div class="field"><label>Push server URL</label><input id="f-push-url" placeholder="https://gearlog-push.yourname.workers.dev" value="${esc(s.pushWorkerUrl)}" /></div>
        <div class="field"><label>VAPID public key</label><input id="f-vapid-key" placeholder="From `npm run vapid` in gearlog-push" value="${esc(s.vapidPublicKey)}" /></div>
        <div class="field">
          <label>Notification wording</label>
          <div class="pill-select" id="f-detail-pills">
            <div class="pill ${s.notificationDetail === "specific" ? "selected" : ""}" data-detail="specific">Specific (vehicle + task names)</div>
            <div class="pill ${s.notificationDetail === "generic" ? "selected" : ""}" data-detail="generic">Generic (no names)</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-block" data-action="save-push-config" style="margin-bottom:10px;">Save push config</button>
        <button class="btn btn-primary btn-block" data-action="toggle-push">${push.isPushEnabled() ? "Disable background reminders on this device" : "Enable background reminders on this device"}</button>
      </div>

      <div class="section-title">Backup</div>
      <div class="panel">
        <p class="helper-text">Export everything — vehicles, schedules, and history — to a JSON file you control. Import it back here or on another device/browser.</p>
        <div class="fab-row" style="margin-top:0;">
          <button class="btn btn-primary" data-action="export-data">Export backup</button>
          <button class="btn btn-secondary" data-action="import-data">Import backup</button>
        </div>
      </div>

      <div class="section-title">App</div>
      <div class="panel">
        <p class="helper-text">Version ${APP_VERSION}. GearLog works offline once installed; use this if you've heard there's an update and want it right away.</p>
        <button class="btn btn-secondary btn-block" data-action="check-updates">Check for updates</button>
      </div>

      <div class="section-title">Danger zone</div>
      <div class="panel">
        <p class="helper-text">Permanently erase every vehicle, schedule, and log entry stored in this browser. Export a backup first if you're not sure.</p>
        <button class="btn btn-danger btn-block" data-action="wipe-data">Erase all data</button>
      </div>
    </main>
  `;
  wireGlobalActions();

  document.querySelector('[data-action="save-settings"]').addEventListener("click", () => {
    store.updateSettings({
      mileageReminderDays: Number(document.getElementById("set-mileage-days").value) || 14,
      dueSoonMiles: Number(document.getElementById("set-due-miles").value) || 0,
      dueSoonDays: Number(document.getElementById("set-due-days").value) || 0,
    });
    toast("Reminder settings saved.");
  });

  document.querySelector('[data-action="enable-notifications"]').addEventListener("click", async () => {
    if (!("Notification" in window)) { toast("This browser doesn't support notifications."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") { toast("Notifications enabled."); checkAndFireNotifications(); }
    else toast("Notifications not enabled.");
  });

  let selectedDetail = s.notificationDetail;
  document.querySelectorAll("#f-detail-pills .pill").forEach((el) =>
    el.addEventListener("click", () => {
      selectedDetail = el.dataset.detail;
      document.querySelectorAll("#f-detail-pills .pill").forEach((p) => p.classList.toggle("selected", p === el));
    })
  );

  document.querySelector('[data-action="save-push-config"]').addEventListener("click", () => {
    store.updateSettings({
      pushWorkerUrl: document.getElementById("f-push-url").value.trim(),
      vapidPublicKey: document.getElementById("f-vapid-key").value.trim(),
      notificationDetail: selectedDetail,
    });
    toast("Push config saved.");
    push.syncPushJobs();
  });

  document.querySelector('[data-action="toggle-push"]').addEventListener("click", async () => {
    try {
      if (push.isPushEnabled()) {
        await push.disablePush();
        toast("Background reminders disabled on this device.");
      } else {
        await push.enablePush();
        toast("Background reminders enabled on this device.");
      }
      renderSettings();
    } catch (e) {
      toast(e.message || "Couldn't update background reminders.");
    }
  });

  document.querySelector('[data-action="export-data"]').addEventListener("click", () => {
    const json = store.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gearlog-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded.");
  });

  document.querySelector('[data-action="import-data"]').addEventListener("click", openImportModal);

  document.querySelector('[data-action="check-updates"]').addEventListener("click", checkForUpdates);

  document.querySelector('[data-action="wipe-data"]').addEventListener("click", () => {
    if (confirm("This deletes all vehicles, schedules, and logs from this browser. This can't be undone. Continue?")) {
      store.wipeAllData();
      toast("All data erased.");
      navigate("#/");
    }
  });
}

// ============================================================ ACTION WIRING

function wireGlobalActions() {
  appEl.querySelectorAll('[data-action="back"]').forEach((el) => el.addEventListener("click", () => history.back()));
  appEl.querySelectorAll('[data-action="goto-settings"]').forEach((el) => el.addEventListener("click", () => navigate("#/settings")));
  appEl.querySelectorAll('[data-action="add-vehicle"]').forEach((el) => el.addEventListener("click", openAddVehicleModal));
  appEl.querySelectorAll('[data-action="open-vehicle"]').forEach((el) =>
    el.addEventListener("click", () => navigate(`#/vehicle/${el.dataset.id}`))
  );
}

function wireVehicleDetailActions(v) {
  appEl.querySelectorAll('[data-action="tab"]').forEach((el) =>
    el.addEventListener("click", () => {
      currentTab = el.dataset.tab;
      renderVehicleDetail(v.id);
    })
  );
  const editBtn = appEl.querySelector('[data-action="edit-vehicle"]');
  if (editBtn) editBtn.addEventListener("click", () => openEditVehicleModal(store.getVehicle(v.id)));

  const mileageBtn = appEl.querySelector('[data-action="log-mileage"]');
  if (mileageBtn) mileageBtn.addEventListener("click", () => openLogMileageModal(v.id));

  const addTaskBtn = appEl.querySelector('[data-action="add-task"]');
  if (addTaskBtn) addTaskBtn.addEventListener("click", () => openTaskModal(v.id));

  const logUnschedBtn = appEl.querySelector('[data-action="log-unscheduled"]');
  if (logUnschedBtn) logUnschedBtn.addEventListener("click", () => openUnscheduledLogModal(v.id));

  const deleteVehicleBtn = appEl.querySelector('[data-action="delete-vehicle"]');
  if (deleteVehicleBtn)
    deleteVehicleBtn.addEventListener("click", () => {
      if (confirm(`Delete ${v.nickname} and all of its history? This can't be undone.`)) {
        store.deleteVehicle(v.id);
        toast("Vehicle deleted.");
        navigate("#/");
      }
    });

  appEl.querySelectorAll('[data-action="complete-task"]').forEach((el) =>
    el.addEventListener("click", () => openCompleteTaskModal(el.dataset.id, v.id))
  );
  appEl.querySelectorAll('[data-action="edit-task"]').forEach((el) =>
    el.addEventListener("click", () => openTaskModal(v.id, store.getTask(el.dataset.id)))
  );
  appEl.querySelectorAll('[data-action="delete-task"]').forEach((el) =>
    el.addEventListener("click", () => {
      if (confirm("Delete this task and its history entries logged against it?")) {
        store.deleteTask(el.dataset.id);
        toast("Task deleted.");
        renderVehicleDetail(v.id);
      }
    })
  );
  appEl.querySelectorAll('[data-action="delete-log"]').forEach((el) =>
    el.addEventListener("click", () => {
      if (confirm("Delete this log entry?")) {
        store.deleteLog(el.dataset.id);
        toast("Entry deleted.");
        renderVehicleDetail(v.id);
      }
    })
  );
}

// =============================================================== MODALS

function classPillsHtml(selected) {
  return VEHICLE_CLASSES.map(
    (c) => `<div class="pill ${c.id === selected ? "selected" : ""}" data-class="${c.id}">${esc(c.label)}</div>`
  ).join("");
}

function openAddVehicleModal() {
  let selectedClass = "gas-standard";
  openModal(
    `
    <div class="modal-header"><h2>Add vehicle</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field">
      <label>VIN (optional — auto-fills details below)</label>
      <div style="display:flex; gap:8px;">
        <input id="f-vin" maxlength="17" placeholder="17-character VIN" style="flex:1;" />
        <button class="btn btn-secondary" id="btn-vin-lookup" type="button">Look up</button>
      </div>
      <div class="field-hint">Uses the free NHTSA vehicle database. It fills in year/make/model, not the maintenance schedule.</div>
    </div>
    <div class="field"><label>Nickname</label><input id="f-nickname" placeholder="e.g. The Silverado" /></div>
    <div class="field-row">
      <div class="field"><label>Year</label><input id="f-year" inputmode="numeric" /></div>
      <div class="field"><label>Make</label><input id="f-make" /></div>
      <div class="field"><label>Model</label><input id="f-model" /></div>
    </div>
    <div class="field"><label>Trim (optional)</label><input id="f-trim" /></div>
    <div class="field"><label>Current mileage</label><input id="f-mileage" type="number" inputmode="numeric" min="0" /></div>
    <div class="field">
      <label>Vehicle type (used to pick a starting maintenance schedule)</label>
      <div class="pill-select" id="f-class-pills">${classPillsHtml(selectedClass)}</div>
    </div>
    <div class="field-hint" style="margin-bottom:14px;">GearLog seeds a standard schedule for this type. You can edit, remove, or add tasks afterward to match your owner's manual exactly.</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save-vehicle">Add vehicle</button>
    </div>
  `,
    (modal) => {
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelectorAll("#f-class-pills .pill").forEach((el) =>
        el.addEventListener("click", () => {
          selectedClass = el.dataset.class;
          modal.querySelectorAll("#f-class-pills .pill").forEach((p) => p.classList.toggle("selected", p === el));
        })
      );
      modal.querySelector("#btn-vin-lookup").addEventListener("click", async () => {
        const vin = modal.querySelector("#f-vin").value;
        try {
          toast("Looking up VIN…");
          const info = await decodeVin(vin);
          modal.querySelector("#f-year").value = info.year;
          modal.querySelector("#f-make").value = info.make;
          modal.querySelector("#f-model").value = info.model;
          modal.querySelector("#f-trim").value = info.trim;
          if (!modal.querySelector("#f-nickname").value) {
            modal.querySelector("#f-nickname").value = `${info.year} ${info.make} ${info.model}`.trim();
          }
          toast("VIN decoded.");
        } catch (e) {
          toast(e.message || "Couldn't decode that VIN.");
        }
      });
      modal.querySelector("#btn-save-vehicle").addEventListener("click", () => {
        const nickname = modal.querySelector("#f-nickname").value.trim();
        const year = modal.querySelector("#f-year").value.trim();
        const make = modal.querySelector("#f-make").value.trim();
        const model = modal.querySelector("#f-model").value.trim();
        const trim = modal.querySelector("#f-trim").value.trim();
        const vin = modal.querySelector("#f-vin").value.trim();
        const mileage = modal.querySelector("#f-mileage").value;
        if (!make || !model) { toast("Add at least a make and model."); return; }
        const vehicle = store.addVehicle({ nickname, year, make, model, trim, vin, vehicleClass: selectedClass, currentMileage: mileage });
        store.seedTasksFromTemplate(vehicle.id, getTemplate(selectedClass));
        closeModal();
        toast(`${vehicle.nickname} added.`);
        navigate(`#/vehicle/${vehicle.id}`);
      });
    }
  );
}

function openEditVehicleModal(v) {
  openModal(
    `
    <div class="modal-header"><h2>Edit vehicle</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field"><label>Nickname</label><input id="f-nickname" value="${esc(v.nickname)}" /></div>
    <div class="field-row">
      <div class="field"><label>Year</label><input id="f-year" value="${esc(v.year)}" /></div>
      <div class="field"><label>Make</label><input id="f-make" value="${esc(v.make)}" /></div>
      <div class="field"><label>Model</label><input id="f-model" value="${esc(v.model)}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Trim</label><input id="f-trim" value="${esc(v.trim)}" /></div>
      <div class="field"><label>VIN</label><input id="f-vin" maxlength="17" value="${esc(v.vin)}" /></div>
    </div>
    <div class="field">
      <label>Vehicle type</label>
      <div class="pill-select" id="f-class-pills">${classPillsHtml(v.vehicleClass)}</div>
      <div class="field-hint">Changing this does not touch your existing tasks — it only affects nothing retroactively. Add tasks manually if you switch types.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save">Save changes</button>
    </div>
  `,
    (modal) => {
      let selectedClass = v.vehicleClass;
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelectorAll("#f-class-pills .pill").forEach((el) =>
        el.addEventListener("click", () => {
          selectedClass = el.dataset.class;
          modal.querySelectorAll("#f-class-pills .pill").forEach((p) => p.classList.toggle("selected", p === el));
        })
      );
      modal.querySelector("#btn-save").addEventListener("click", () => {
        store.updateVehicle(v.id, {
          nickname: modal.querySelector("#f-nickname").value.trim() || v.nickname,
          year: modal.querySelector("#f-year").value.trim(),
          make: modal.querySelector("#f-make").value.trim(),
          model: modal.querySelector("#f-model").value.trim(),
          trim: modal.querySelector("#f-trim").value.trim(),
          vin: modal.querySelector("#f-vin").value.trim(),
          vehicleClass: selectedClass,
        });
        closeModal();
        toast("Vehicle updated.");
        renderVehicleDetail(v.id);
      });
    }
  );
}

function openLogMileageModal(vehicleId) {
  const v = store.getVehicle(vehicleId);
  openModal(
    `
    <div class="modal-header"><h2>Log mileage</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field"><label>Current odometer reading</label><input id="f-mileage" type="number" inputmode="numeric" min="${v.currentMileage}" value="${v.currentMileage}" /></div>
    <div class="field"><label>Date</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save">Save</button>
    </div>
  `,
    (modal) => {
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelector("#btn-save").addEventListener("click", () => {
        const mileage = Number(modal.querySelector("#f-mileage").value);
        const date = modal.querySelector("#f-date").value;
        if (!mileage && mileage !== 0) { toast("Enter a mileage."); return; }
        store.updateMileage(vehicleId, mileage, date ? new Date(date).toISOString() : undefined);
        closeModal();
        toast("Mileage updated.");
        renderVehicleDetail(vehicleId);
      });
    }
  );
}

function openTaskModal(vehicleId, task) {
  const isEdit = !!task;
  openModal(
    `
    <div class="modal-header"><h2>${isEdit ? "Edit task" : "Add custom task"}</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field"><label>Task name</label><input id="f-name" value="${esc(task?.name || "")}" placeholder="e.g. Replace battery" /></div>
    <div class="field"><label>Category</label><input id="f-category" value="${esc(task?.category || "General")}" /></div>
    <div class="field-row">
      <div class="field"><label>Interval (miles, optional)</label><input id="f-int-miles" type="number" min="0" value="${task?.intervalMiles ?? ""}" /></div>
      <div class="field"><label>Interval (months, optional)</label><input id="f-int-months" type="number" min="0" value="${task?.intervalMonths ?? ""}" /></div>
    </div>
    <div class="field-hint" style="margin-top:-6px; margin-bottom:14px;">Leave both blank for an "inspect as needed" task with no due date.</div>
    <div class="field"><label>Notes</label><textarea id="f-notes" placeholder="Torque specs, part numbers, preferred fluid, shop notes…">${esc(task?.notes || "")}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save">${isEdit ? "Save changes" : "Add task"}</button>
    </div>
  `,
    (modal) => {
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelector("#btn-save").addEventListener("click", () => {
        const name = modal.querySelector("#f-name").value.trim();
        if (!name) { toast("Give the task a name."); return; }
        const payload = {
          name,
          category: modal.querySelector("#f-category").value.trim() || "General",
          intervalMiles: modal.querySelector("#f-int-miles").value,
          intervalMonths: modal.querySelector("#f-int-months").value,
          notes: modal.querySelector("#f-notes").value,
        };
        if (isEdit) store.updateTask(task.id, {
          ...payload,
          intervalMiles: payload.intervalMiles === "" ? null : Number(payload.intervalMiles),
          intervalMonths: payload.intervalMonths === "" ? null : Number(payload.intervalMonths),
        });
        else store.addTask(vehicleId, { ...payload, isCustom: true });
        closeModal();
        toast(isEdit ? "Task updated." : "Task added.");
        renderVehicleDetail(vehicleId);
      });
    }
  );
}

function openCompleteTaskModal(taskId, vehicleId) {
  const task = store.getTask(taskId);
  const v = store.getVehicle(vehicleId);
  openModal(
    `
    <div class="modal-header"><h2>Mark done: ${esc(task.name)}</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field"><label>Date completed</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <div class="field"><label>Mileage at completion</label><input id="f-mileage" type="number" min="0" value="${v.currentMileage}" /></div>
    <div class="field"><label>Cost (optional)</label><input id="f-cost" type="number" min="0" step="0.01" placeholder="0.00" /></div>
    <div class="field"><label>Notes for this service (optional)</label><textarea id="f-notes" placeholder="Parts used, shop, torque values…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save">Save</button>
    </div>
  `,
    (modal) => {
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelector("#btn-save").addEventListener("click", () => {
        store.addLog(vehicleId, {
          taskId: task.id,
          title: task.name,
          date: new Date(modal.querySelector("#f-date").value || Date.now()).toISOString(),
          mileage: modal.querySelector("#f-mileage").value,
          cost: modal.querySelector("#f-cost").value,
          notes: modal.querySelector("#f-notes").value,
        });
        closeModal();
        toast("Logged. Next due date recalculated.");
        renderVehicleDetail(vehicleId);
      });
    }
  );
}

function openUnscheduledLogModal(vehicleId) {
  const v = store.getVehicle(vehicleId);
  openModal(
    `
    <div class="modal-header"><h2>Log unscheduled maintenance</h2><button class="modal-close" data-action="close">&times;</button></div>
    <div class="field"><label>What did you do?</label><input id="f-title" placeholder="e.g. Replaced alternator" /></div>
    <div class="field"><label>Date</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <div class="field"><label>Mileage</label><input id="f-mileage" type="number" min="0" value="${v.currentMileage}" /></div>
    <div class="field"><label>Cost (optional)</label><input id="f-cost" type="number" min="0" step="0.01" placeholder="0.00" /></div>
    <div class="field"><label>Notes (optional)</label><textarea id="f-notes" placeholder="What broke, symptoms, parts, shop…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-save">Save entry</button>
    </div>
  `,
    (modal) => {
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelector("#btn-save").addEventListener("click", () => {
        const title = modal.querySelector("#f-title").value.trim();
        if (!title) { toast("Describe what you did."); return; }
        store.addLog(vehicleId, {
          title,
          date: new Date(modal.querySelector("#f-date").value || Date.now()).toISOString(),
          mileage: modal.querySelector("#f-mileage").value,
          cost: modal.querySelector("#f-cost").value,
          notes: modal.querySelector("#f-notes").value,
        });
        closeModal();
        toast("Logged.");
        renderVehicleDetail(vehicleId);
      });
    }
  );
}

function openImportModal() {
  openModal(
    `
    <div class="modal-header"><h2>Import backup</h2><button class="modal-close" data-action="close">&times;</button></div>
    <p class="helper-text">Choose a GearLog backup file (.json). Merge adds anything new without touching what's already here; Replace wipes current data first.</p>
    <div class="field"><label>Backup file</label><input id="f-file" type="file" accept="application/json,.json" /></div>
    <div class="field">
      <label>Import mode</label>
      <div class="pill-select" id="f-mode-pills">
        <div class="pill selected" data-mode="merge">Merge</div>
        <div class="pill" data-mode="replace">Replace everything</div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-primary" id="btn-import">Import</button>
    </div>
  `,
    (modal) => {
      let mode = "merge";
      modal.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener("click", closeModal));
      modal.querySelectorAll("#f-mode-pills .pill").forEach((el) =>
        el.addEventListener("click", () => {
          mode = el.dataset.mode;
          modal.querySelectorAll("#f-mode-pills .pill").forEach((p) => p.classList.toggle("selected", p === el));
        })
      );
      modal.querySelector("#btn-import").addEventListener("click", () => {
        const file = modal.querySelector("#f-file").files[0];
        if (!file) { toast("Choose a file first."); return; }
        if (mode === "replace" && !confirm("This replaces all current data with the backup. Continue?")) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            store.importData(reader.result, mode);
            closeModal();
            toast("Backup imported.");
            navigate("#/");
          } catch (e) {
            toast(e.message || "Couldn't read that file.");
          }
        };
        reader.readAsText(file);
      });
    }
  );
}

// ======================================================== NOTIFICATIONS

function checkAndFireNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const all = store.getAllReminders();
  all.forEach(({ vehicle, reminders }) => {
    const overdue = reminders.taskAlerts.filter((a) => a.status.status === "overdue");
    if (overdue.length) {
      new Notification(`${vehicle.nickname}: ${overdue.length} overdue`, {
        body: overdue.map((a) => a.task.name).join(", "),
        tag: `gearlog-${vehicle.id}-overdue`,
      });
    }
    if (reminders.mileageStale) {
      new Notification(`${vehicle.nickname}: log mileage`, {
        body: `It's been ${reminders.daysSinceMileage} days since the last reading.`,
        tag: `gearlog-${vehicle.id}-mileage`,
      });
    }
  });
}

// ============================================================ SW / UPDATES

function checkForUpdates() {
  if (!("serviceWorker" in navigator)) { toast("Service workers aren't supported in this browser."); return; }
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) { toast("No installed service worker yet."); return; }
    toast("Checking for updates…");
    reg.update().then(() => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        toast("You're on the latest version.");
      }
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            toast("An update is ready — tap Settings > Check for updates, or reload.");
          }
        });
      });
    }).catch(() => { /* offline-first fallback: app still works without SW */ });

    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

// ================================================================== INIT

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  render();
  registerServiceWorker();
  setTimeout(checkAndFireNotifications, 1200);
});
