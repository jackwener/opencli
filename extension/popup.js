const dot = document.getElementById('dot');
const status = document.getElementById('status');
const hint = document.getElementById('hint');
const chip = document.getElementById('profile-chip');
const chipLabel = document.getElementById('profile-label');
const chipActions = chip.querySelector('.profile-chip__actions');
const copyBtn = document.getElementById('copy-btn');
const renameBtn = document.getElementById('rename-btn');
const toast = document.getElementById('toast');

let currentLabel = null;

chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
  if (chrome.runtime.lastError || !resp) {
    applyStatus({ connected: false, reconnecting: false });
    return;
  }
  applyStatus(resp);
});

function applyStatus(resp) {
  if (resp.connected) {
    dot.className = 'dot connected';
    status.textContent = 'Connected to daemon';
    hint.style.display = 'none';
  } else if (resp.reconnecting) {
    dot.className = 'dot connecting';
    status.textContent = 'Reconnecting…';
    hint.style.display = 'none';
  } else {
    dot.className = 'dot disconnected';
    status.textContent = 'No daemon connected';
    hint.style.display = 'block';
  }
  showLabel(resp.profileLabel);
}

function showLabel(label) {
  currentLabel = label || null;
  if (!currentLabel) { chip.style.display = 'none'; return; }
  chipLabel.textContent = currentLabel;
  chip.style.display = 'inline-flex';
}

chipLabel.addEventListener('click', () => copyToClipboard(currentLabel));
copyBtn.addEventListener('click', () => copyToClipboard(currentLabel));
renameBtn.addEventListener('click', enterRenameMode);

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashToast('Copied');
  } catch {
    flashToast('Copy failed');
  }
}

function enterRenameMode() {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'profile-chip__input';
  input.value = currentLabel ?? '';
  input.maxLength = 60;
  input.placeholder = 'Profile label';
  chipLabel.replaceWith(input);
  chipActions.style.display = 'none';
  input.focus();
  input.select();

  // Always restore the DOM on exit, whether committed or cancelled.
  const exitEditMode = () => {
    if (input.isConnected) input.replaceWith(chipLabel);
    chipActions.style.display = '';
  };

  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    const raw = input.value.trim();
    saveLabel(raw || null, exitEditMode);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    exitEditMode();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function saveLabel(newLabel, onDone) {
  chrome.runtime.sendMessage(
    { type: 'renameProfile', label: newLabel },
    (resp) => {
      onDone?.();
      if (chrome.runtime.lastError || !resp?.ok) {
        flashToast('Rename failed');
        return;
      }
      showLabel(resp.profileLabel);
      flashToast(newLabel ? 'Renamed' : 'Reset to default');
    },
  );
}

let toastTimer = null;
function flashToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1100);
}
