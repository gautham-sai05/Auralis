const startAtLogin = document.getElementById('startAtLogin');
const minimizeToTray = document.getElementById('minimizeToTray');
const notificationsEnabled = document.getElementById('notificationsEnabled');
const hardwareAcceleration = document.getElementById('hardwareAcceleration');
const equalizerPreset = document.getElementById('equalizerPreset');
const restartNotice = document.getElementById('restartNotice');
const status = document.getElementById('status');

function setStatus(text) {
  status.textContent = text;
  setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, 3000);
}

window.prefs.getState().then((state) => {
  startAtLogin.checked = Boolean(state.openAtLogin);
  minimizeToTray.checked = Boolean(state.settings.minimizeToTray);
  notificationsEnabled.checked = Boolean(state.settings.notificationsEnabled);
  hardwareAcceleration.checked = Boolean(state.settings.hardwareAcceleration);
  equalizerPreset.value = state.settings.equalizerPreset;
});

startAtLogin.addEventListener('change', () => window.prefs.setLoginItem(startAtLogin.checked));
minimizeToTray.addEventListener('change', () => window.prefs.setSetting('minimizeToTray', minimizeToTray.checked));
notificationsEnabled.addEventListener('change', () =>
  window.prefs.setSetting('notificationsEnabled', notificationsEnabled.checked),
);
hardwareAcceleration.addEventListener('change', () => {
  window.prefs.setSetting('hardwareAcceleration', hardwareAcceleration.checked);
  restartNotice.style.display = 'block';
});
equalizerPreset.addEventListener('change', () => window.prefs.setSetting('equalizerPreset', equalizerPreset.value));

document.getElementById('restartBtn').addEventListener('click', () => window.prefs.relaunch());
document.getElementById('exportBtn').addEventListener('click', () => {
  window.prefs.exportSettings().then((path) => setStatus(path ? `Exported to ${path}` : ''));
});
document.getElementById('importBtn').addEventListener('click', () => {
  window.prefs.importSettings().then((path) => setStatus(path ? `Imported from ${path} — some changes may need a restart` : ''));
});
