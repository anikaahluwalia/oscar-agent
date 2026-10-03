// Where Oscar runs. Only localhost: the extension has no permission to reach anywhere else.
const DEFAULTS = { api: "http://localhost:8000", app: "http://localhost:3000" };
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;

const api = document.getElementById("api");
const app = document.getElementById("app");
const said = document.getElementById("said");

chrome.storage.sync.get(DEFAULTS, (saved) => {
  api.value = saved.api;
  app.value = saved.app;
});

document.getElementById("save").addEventListener("click", () => {
  if (!LOCAL.test(api.value) || !LOCAL.test(app.value)) {
    said.textContent = "Use a localhost address, like http://localhost:8000.";
    return;
  }
  chrome.storage.sync.set({ api: api.value, app: app.value }, () => (said.textContent = "Saved."));
});
