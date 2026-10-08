// Loaded before the test module: if the page fails to load (syntax error, missing export), report
// the error to the one-command runner instead of letting it wait for a timeout.
window.addEventListener('error', (e) => {
  if (!new URLSearchParams(location.search).has('headless')) return;
  const detail = `${e.message || 'script error'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`;
  fetch('/__results', { method: 'POST', body: JSON.stringify({ results: [{ section: 'Load', name: 'test page loads', ok: false, detail }] }) });
});
