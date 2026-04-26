// Query connection status from background service worker
chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
  const dot = document.getElementById('dot');
  const status = document.getElementById('status');
  const hint = document.getElementById('hint');
  if (chrome.runtime.lastError || !resp) {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
    return;
  }
  if (resp.connected) {
    dot.className = 'dot connected';
    status.innerHTML = '<strong>Connected to daemon</strong>';
    hint.style.display = 'none';
  } else if (resp.reconnecting) {
    dot.className = 'dot connecting';
    status.innerHTML = '<strong>Reconnecting...</strong>';
    hint.style.display = 'none';
  } else {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
  }
});

const portInput = document.getElementById('portInput');
const saveBtn = document.getElementById('saveBtn');
const portError = document.getElementById('portError');

chrome.storage.local.get(['daemonPort'], (res) => {
  if (res.daemonPort) {
    portInput.value = res.daemonPort;
  }
});

saveBtn.addEventListener('click', () => {
  const port = parseInt(portInput.value, 10);
  if (isNaN(port) || port <= 1024 || port > 65535) {
    portError.style.display = 'block';
    return;
  }
  portError.style.display = 'none';
  saveBtn.textContent = 'Saving...';
  
  chrome.storage.local.set({ daemonPort: port }, () => {
    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = 'Save';
    }, 1500);
  });
});
