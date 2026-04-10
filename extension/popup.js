// Query connection status from background service worker
chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
  const dot = document.getElementById('dot');
  const status = document.getElementById('status');
  const hint = document.getElementById('hint');
  const stateButton = document.getElementById('stateButton');
  
  if (chrome.runtime.lastError || !resp) {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
    stateButton.disabled = true;
    return;
  }
  if (resp.connected) {
    dot.className = 'dot connected';
    status.innerHTML = '<strong>Connected to daemon</strong>';
    hint.style.display = 'none';
    stateButton.disabled = false;
  } else if (resp.reconnecting) {
    dot.className = 'dot connecting';
    status.innerHTML = '<strong>Reconnecting...</strong>';
    hint.style.display = 'none';
    stateButton.disabled = true;
  } else {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
    stateButton.disabled = true;
  }
});

// Add event listener for state button
document.getElementById('stateButton').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  const stateButton = document.getElementById('stateButton');
  
  // Show loading state
  stateButton.disabled = true;
  stateButton.textContent = 'Loading...';
  resultDiv.style.display = 'block';
  resultDiv.textContent = 'Getting page state...';
  
  try {
    // Send message to background script to get page state
    chrome.runtime.sendMessage({ type: 'getPageState' }, (response) => {
      if (chrome.runtime.lastError) {
        resultDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
        stateButton.disabled = false;
        stateButton.textContent = 'Get Page State';
        return;
      }
      
      if (response && response.ok) {
        // Format the result
        if (typeof response.data === 'string') {
          resultDiv.textContent = response.data;
        } else {
          resultDiv.textContent = JSON.stringify(response.data, null, 2);
        }
      } else {
        resultDiv.textContent = `Error: ${response?.error || 'Failed to get page state'}`;
      }
      
      // Reset button state
      stateButton.disabled = false;
      stateButton.textContent = 'Get Page State';
    });
  } catch (error) {
    resultDiv.textContent = `Error: ${error.message}`;
    stateButton.disabled = false;
    stateButton.textContent = 'Get Page State';
  }
});
