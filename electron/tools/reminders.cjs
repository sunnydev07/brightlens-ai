const crypto = require('crypto');
const fs = require('fs');
const { app, Notification } = require('electron');
const path = require('path');

const timers = new Map();
let reminders = [];
let initialized = false;

function getStorePath() {
  return path.join(app.getPath('userData'), 'mini-jarvis-reminders.json');
}

async function persistReminders() {
  const storePath = getStorePath();
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  await fs.promises.writeFile(
    storePath,
    JSON.stringify(reminders, null, 2),
    'utf8',
  );
}

function scheduleTimer(reminder) {
  const remaining = new Date(reminder.dueAt).getTime() - Date.now();
  if (remaining <= 0) {
    void fireReminder(reminder.id);
    return;
  }

  const maximumDelay = 2 ** 31 - 1;
  const timer = setTimeout(() => {
    if (remaining > maximumDelay) {
      scheduleTimer(reminder);
      return;
    }
    void fireReminder(reminder.id);
  }, Math.min(remaining, maximumDelay));
  timer.unref?.();
  timers.set(reminder.id, timer);
}

async function fireReminder(id) {
  const reminder = reminders.find((entry) => entry.id === id);
  if (!reminder) {
    return;
  }

  timers.delete(id);
  reminders = reminders.filter((entry) => entry.id !== id);
  await persistReminders();

  if (Notification.isSupported()) {
    new Notification({
      title: 'Brightlens Reminder',
      body: reminder.message,
    }).show();
  } else {
    console.log(`[Brightlens reminder] ${reminder.message}`);
  }
}

async function initializeReminders() {
  if (initialized) {
    return;
  }

  initialized = true;
  try {
    const raw = await fs.promises.readFile(getStorePath(), 'utf8');
    const stored = JSON.parse(raw);
    reminders = Array.isArray(stored) ? stored : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load Mini-Jarvis reminders:', error);
    }
    reminders = [];
  }

  for (const reminder of reminders) {
    scheduleTimer(reminder);
  }
}

async function setReminder(message, delayMinutes) {
  await initializeReminders();
  const reminder = {
    id: crypto.randomUUID().slice(0, 8),
    message: String(message).trim(),
    createdAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + Number(delayMinutes) * 60000).toISOString(),
  };
  reminders.push(reminder);
  await persistReminders();
  scheduleTimer(reminder);
  return { ok: true, reminder };
}

async function listReminders() {
  await initializeReminders();
  return {
    ok: true,
    reminders: reminders
      .slice()
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
  };
}

async function cancelReminder(id) {
  await initializeReminders();
  const reminderId = String(id).trim();
  const reminder = reminders.find((entry) => entry.id === reminderId);
  if (!reminder) {
    return { ok: false, error: `Reminder not found: ${reminderId}` };
  }

  const timer = timers.get(reminderId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(reminderId);
  }
  reminders = reminders.filter((entry) => entry.id !== reminderId);
  await persistReminders();
  return { ok: true, reminder, message: 'Reminder cancelled.' };
}

module.exports = {
  cancelReminder,
  initializeReminders,
  listReminders,
  setReminder,
};
