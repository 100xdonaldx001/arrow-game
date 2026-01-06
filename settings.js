(() => {
  const STATUS_MESSAGES = {
    idle: 'Saved in this browser.',
    saved: 'Saved. Jump back into the game!'
  };

  const storageKey = 'snakeArrowVisualDifficulty';
  const validValues = new Set(['easy', 'medium', 'hard']);
  const options = Array.from(document.querySelectorAll('input[name="visualDifficulty"]'));
  const statusEl = document.getElementById('settingsStatus');

  function loadDifficulty() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && validValues.has(saved)) return saved;
    } catch {
      return 'easy';
    }
    return 'easy';
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
  }

  function saveDifficulty(value) {
    if (!validValues.has(value)) return;
    localStorage.setItem(storageKey, value);
    setStatus(STATUS_MESSAGES.saved);
  }

  function syncUI(value) {
    options.forEach((option) => {
      option.checked = option.value === value;
    });
  }

  const initial = loadDifficulty();
  syncUI(initial);
  setStatus(STATUS_MESSAGES.idle);

  options.forEach((option) => {
    option.addEventListener('change', () => {
      saveDifficulty(option.value);
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey && event.newValue && validValues.has(event.newValue)) {
      syncUI(event.newValue);
      setStatus(STATUS_MESSAGES.idle);
    }
  });
})();
