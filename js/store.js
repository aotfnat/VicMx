// js/store.js
// All persistence lives in localStorage as one JSON blob. That's plenty for
// years of text-based maintenance records, keeps GearLog fully offline/static
// (no backend needed for GitHub Pages), and makes export/import trivial.

const STORAGE_KEY = "gearlog.v1";
const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = {
  mileageReminderDays: 14, // nudge to log mileage if it hasn't been updated in this many days
  dueSoonMiles: 500, // "due soon" window, in miles
  dueSoonDays: 14, // "due soon" window, in days

  // background push (all optional, all off until the user opts in)
  pushEnabled: false,
  pushWorkerUrl: "",
  vapidPublicKey: "",
  notificationDetail: "specific", // "specific" | "generic"
  deviceId: null,
};

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    vehicles: [],
    tasks: [],
    logs: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    return {
      ...freshState(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch (e) {
    console.error("GearLog: failed to load state, starting fresh.", e);
    return freshState();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------- Vehicles

export function listVehicles() {
  return [...state.vehicles].sort((a, b) => a.nickname.localeCompare(b.nickname));
}

export function getVehicle(id) {
  return state.vehicles.find((v) => v.id === id) || null;
}

export function addVehicle(data) {
  const now = new Date().toISOString();
  const vehicle = {
    id: uid("veh"),
    nickname: data.nickname || `${data.year || ""} ${data.make || ""} ${data.model || ""}`.trim() || "My Vehicle",
    year: data.year || "",
    make: data.make || "",
    model: data.model || "",
    trim: data.trim || "",
    vin: data.vin || "",
    vehicleClass: data.vehicleClass || "gas-standard",
    currentMileage: Number(data.currentMileage) || 0,
    mileageUpdatedAt: now,
    mileageHistory: [{ id: uid("mi"), date: now, mileage: Number(data.currentMileage) || 0 }],
    createdAt: now,
  };
  state.vehicles.push(vehicle);
  persist();
  return vehicle;
}

export function updateVehicle(id, patch) {
  const v = getVehicle(id);
  if (!v) return null;
  Object.assign(v, patch);
  persist();
  return v;
}

export function deleteVehicle(id) {
  state.vehicles = state.vehicles.filter((v) => v.id !== id);
  state.tasks = state.tasks.filter((t) => t.vehicleId !== id);
  state.logs = state.logs.filter((l) => l.vehicleId !== id);
  persist();
}

export function updateMileage(vehicleId, mileage, date) {
  const v = getVehicle(vehicleId);
  if (!v) return null;
  const m = Number(mileage);
  const d = date || new Date().toISOString();
  v.mileageHistory.push({ id: uid("mi"), date: d, mileage: m });
  v.mileageHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
  // current mileage is always the max ever logged (odometers don't go backwards)
  v.currentMileage = Math.max(v.currentMileage, m);
  v.mileageUpdatedAt = d;
  persist();
  return v;
}

// -------------------------------------------------------------------- Tasks

export function listTasks(vehicleId) {
  return state.tasks
    .filter((t) => t.vehicleId === vehicleId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTask(id) {
  return state.tasks.find((t) => t.id === id) || null;
}

export function addTask(vehicleId, data) {
  const vehicle = getVehicle(vehicleId);
  const now = new Date().toISOString();
  const task = {
    id: uid("task"),
    vehicleId,
    name: data.name,
    category: data.category || "General",
    intervalMiles: data.intervalMiles === "" || data.intervalMiles == null ? null : Number(data.intervalMiles),
    intervalMonths: data.intervalMonths === "" || data.intervalMonths == null ? null : Number(data.intervalMonths),
    notes: data.notes || "",
    isCustom: !!data.isCustom,
    active: true,
    createdAt: now,
    baselineMileage: vehicle ? vehicle.currentMileage : 0,
    lastDoneMileage: data.lastDoneMileage != null ? Number(data.lastDoneMileage) : null,
    lastDoneDate: data.lastDoneDate || null,
  };
  state.tasks.push(task);
  persist();
  return task;
}

export function seedTasksFromTemplate(vehicleId, templateTasks) {
  templateTasks.forEach((t) => addTask(vehicleId, { ...t, isCustom: false }));
}

export function updateTask(id, patch) {
  const t = getTask(id);
  if (!t) return null;
  Object.assign(t, patch);
  persist();
  return t;
}

export function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  state.logs = state.logs.filter((l) => l.taskId !== id);
  persist();
}

// --------------------------------------------------------------------- Logs

export function listLogs(vehicleId) {
  return state.logs
    .filter((l) => l.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function addLog(vehicleId, data) {
  const now = new Date().toISOString();
  const log = {
    id: uid("log"),
    vehicleId,
    taskId: data.taskId || null,
    type: data.taskId ? "scheduled" : "unscheduled",
    title: data.title,
    date: data.date || now,
    mileage: data.mileage != null ? Number(data.mileage) : null,
    cost: data.cost != null && data.cost !== "" ? Number(data.cost) : null,
    notes: data.notes || "",
    createdAt: now,
  };
  state.logs.push(log);

  // if this log completes a scheduled task, roll its "last done" forward
  if (log.taskId) {
    const task = getTask(log.taskId);
    if (task) {
      const taskLogs = state.logs.filter((l) => l.taskId === task.id);
      const latest = taskLogs.reduce((acc, l) => {
        if (!acc) return l;
        return new Date(l.date) > new Date(acc.date) ? l : acc;
      }, null);
      if (latest) {
        task.lastDoneDate = latest.date;
        task.lastDoneMileage = latest.mileage;
      }
    }
  }

  // logging maintenance is a good moment to also confirm current mileage
  if (log.mileage != null) {
    const v = getVehicle(vehicleId);
    if (v && log.mileage > v.currentMileage) {
      updateMileage(vehicleId, log.mileage, log.date);
    }
  }

  persist();
  return log;
}

export function deleteLog(id) {
  state.logs = state.logs.filter((l) => l.id !== id);
  persist();
}

// ---------------------------------------------------------------- Settings

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
  return getSettings();
}

// -------------------------------------------------------------- Reminders

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function computeTaskStatus(task) {
  const vehicle = getVehicle(task.vehicleId);
  if (!vehicle) return null;
  const settings = getSettings();

  const baselineMileage = task.lastDoneMileage != null ? task.lastDoneMileage : task.baselineMileage;
  const baselineDate = task.lastDoneDate || task.createdAt;

  const nextDueMileage = task.intervalMiles != null ? baselineMileage + task.intervalMiles : null;
  const nextDueDate = task.intervalMonths != null ? addMonths(baselineDate, task.intervalMonths) : null;

  const milesRemaining = nextDueMileage != null ? nextDueMileage - vehicle.currentMileage : null;
  const daysRemaining = nextDueDate != null ? Math.round((nextDueDate - new Date()) / 86400000) : null;

  let status = "asNeeded";
  if (milesRemaining != null || daysRemaining != null) {
    const overdue = (milesRemaining != null && milesRemaining < 0) || (daysRemaining != null && daysRemaining < 0);
    const dueSoon =
      !overdue &&
      ((milesRemaining != null && milesRemaining <= settings.dueSoonMiles) ||
        (daysRemaining != null && daysRemaining <= settings.dueSoonDays));
    status = overdue ? "overdue" : dueSoon ? "dueSoon" : "ok";
  }

  return {
    taskId: task.id,
    nextDueMileage,
    nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
    milesRemaining,
    daysRemaining,
    status,
  };
}

export function getReminders(vehicleId) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { mileageStale: false, daysSinceMileage: null, taskAlerts: [] };
  const settings = getSettings();

  const daysSinceMileage = Math.floor((new Date() - new Date(vehicle.mileageUpdatedAt)) / 86400000);
  const mileageStale = daysSinceMileage >= settings.mileageReminderDays;

  const tasks = listTasks(vehicleId).filter((t) => t.active);
  const taskAlerts = tasks
    .map((t) => ({ task: t, status: computeTaskStatus(t) }))
    .filter((r) => r.status && (r.status.status === "overdue" || r.status.status === "dueSoon"))
    .sort((a, b) => {
      const rank = { overdue: 0, dueSoon: 1 };
      return rank[a.status.status] - rank[b.status.status];
    });

  return { mileageStale, daysSinceMileage, taskAlerts };
}

export function getAllReminders() {
  return listVehicles().map((v) => ({ vehicle: v, reminders: getReminders(v.id) }));
}

export function getOrCreateDeviceId() {
  if (!state.settings.deviceId) {
    state.settings.deviceId = (crypto.randomUUID ? crypto.randomUUID() : uid("dev"));
    persist();
  }
  return state.settings.deviceId;
}

// Only date-based reminders can be scheduled ahead of time without the app
// being open: a mileage-stale nudge (based on days since last reading) and
// tasks with a months-based interval. Mileage-only intervals can't be
// predicted without knowing driving pace, so they stay in-app-only.
export function getScheduledPushJobs() {
  const settings = getSettings();
  const generic = settings.notificationDetail === "generic";
  const jobs = [];

  listVehicles().forEach((v) => {
    const label = generic ? "a vehicle" : v.nickname;

    // mileage-stale job: fires mileageReminderDays after the last reading
    const mileageSendAt = new Date(new Date(v.mileageUpdatedAt).getTime() + settings.mileageReminderDays * 86400000);
    jobs.push({
      id: `mileage-${v.id}`,
      sendAt: mileageSendAt.toISOString(),
      title: generic ? "Log mileage" : `${v.nickname}: log mileage`,
      body: generic ? "One of your vehicles is due for a mileage update." : `It's been a while since you logged ${label}'s mileage.`,
    });

    listTasks(v.id)
      .filter((t) => t.active && t.intervalMonths != null)
      .forEach((t) => {
        const status = computeTaskStatus(t);
        if (!status.nextDueDate) return;
        // fire right when the task enters the "due soon" window
        const dueSoonStart = new Date(new Date(status.nextDueDate).getTime() - settings.dueSoonDays * 86400000);
        jobs.push({
          id: `task-${t.id}`,
          sendAt: dueSoonStart.toISOString(),
          title: generic ? "Maintenance due soon" : `${v.nickname}: ${t.name}`,
          body: generic
            ? "One of your vehicles has upcoming maintenance."
            : `${t.name} is due ${status.nextDueMileage != null ? `around ${Math.round(status.nextDueMileage).toLocaleString()} mi or ` : ""}by ${new Date(status.nextDueDate).toLocaleDateString()}.`,
        });
      });
  });

  return jobs;
}

// ----------------------------------------------------------- Export/Import

export function exportData() {
  return JSON.stringify(
    { ...state, exportedAt: new Date().toISOString(), app: "GearLog", schemaVersion: SCHEMA_VERSION },
    null,
    2
  );
}

export function importData(json, mode = "replace") {
  const incoming = typeof json === "string" ? JSON.parse(json) : json;
  if (!incoming || !Array.isArray(incoming.vehicles)) {
    throw new Error("That file doesn't look like a GearLog backup.");
  }
  if (mode === "replace") {
    state = {
      schemaVersion: SCHEMA_VERSION,
      vehicles: incoming.vehicles || [],
      tasks: incoming.tasks || [],
      logs: incoming.logs || [],
      settings: { ...DEFAULT_SETTINGS, ...(incoming.settings || {}) },
    };
  } else {
    // merge: keep existing records, add incoming ones that don't already exist by id
    const existingVehicleIds = new Set(state.vehicles.map((v) => v.id));
    const existingTaskIds = new Set(state.tasks.map((t) => t.id));
    const existingLogIds = new Set(state.logs.map((l) => l.id));
    (incoming.vehicles || []).forEach((v) => { if (!existingVehicleIds.has(v.id)) state.vehicles.push(v); });
    (incoming.tasks || []).forEach((t) => { if (!existingTaskIds.has(t.id)) state.tasks.push(t); });
    (incoming.logs || []).forEach((l) => { if (!existingLogIds.has(l.id)) state.logs.push(l); });
  }
  persist();
  return state;
}

export function wipeAllData() {
  state = freshState();
  persist();
}
