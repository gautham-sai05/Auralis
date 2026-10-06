const input = document.getElementById('q');

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.searchPalette.cancel();
  } else if (e.key === 'Enter' && input.value.trim()) {
    window.searchPalette.submit(input.value.trim());
  }
});

window.addEventListener('blur', () => window.searchPalette.cancel());
