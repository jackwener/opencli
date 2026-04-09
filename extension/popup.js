function renderStatus(resp) {
  const dot = document.getElementById('dot');
  const status = document.getElementById('status');
  const hint = document.getElementById('hint');
  const hostInput = document.getElementById('daemon-host');
  const portInput = document.getElementById('daemon-port');
  if (!resp) {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
    return;
  }
  hostInput.value = resp.host || '127.0.0.1';
  portInput.value = String(resp.port || 19825);
  if (resp.connected) {
    dot.className = 'dot connected';
    status.innerHTML = `<strong>Connected to ${resp.host}:${resp.port}</strong>`;
    hint.style.display = 'none';
  } else if (resp.reconnecting) {
    dot.className = 'dot connecting';
    status.innerHTML = `<strong>Reconnecting to ${resp.host}:${resp.port}...</strong>`;
    hint.style.display = 'none';
  } else {
    dot.className = 'dot disconnected';
    status.innerHTML = `<strong>No daemon connected (${resp.host}:${resp.port})</strong>`;
    hint.style.display = 'block';
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      renderStatus(null);
      return;
    }
    renderStatus(resp);
  });
}

refreshStatus();

document.getElementById('save').addEventListener('click', () => {
  const host = document.getElementById('daemon-host').value.trim();
  const port = document.getElementById('daemon-port').value.trim();
  const saveStatus = document.getElementById('save-status');
  const saveButton = document.getElementById('save');
  saveStatus.textContent = 'Saving...';
  saveButton.disabled = true;
  chrome.runtime.sendMessage({ type: 'setDaemonConfig', host, port }, (resp) => {
    saveButton.disabled = false;
    if (chrome.runtime.lastError || !resp?.ok) {
      saveStatus.textContent = resp?.error || 'Save failed';
      return;
    }
    saveStatus.textContent = 'Saved';
    renderStatus(resp);
    setTimeout(() => {
      refreshStatus();
    }, 300);
  });
});
