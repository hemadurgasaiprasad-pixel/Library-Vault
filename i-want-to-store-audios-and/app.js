const DB_NAME = "library-vault";
const DB_VERSION = 1;
const STORE_NAME = "items";

const state = {
  db: null,
  items: [],
  filter: "all",
  query: "",
  sort: "newest",
  urls: new Map()
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  libraryGrid: document.querySelector("#libraryGrid"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  clearSearch: document.querySelector("#clearSearch"),
  listTitle: document.querySelector("#listTitle"),
  totalCount: document.querySelector("#totalCount"),
  audioCount: document.querySelector("#audioCount"),
  pdfCount: document.querySelector("#pdfCount"),
  totalSize: document.querySelector("#totalSize"),
  storageFill: document.querySelector("#storageFill"),
  storageText: document.querySelector("#storageText"),
  detailsDialog: document.querySelector("#detailsDialog"),
  detailsContent: document.querySelector("#detailsContent"),
  toast: document.querySelector("#toast")
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true
      });
      store.createIndex("kind", "kind", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode = "readonly") {
  return state.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    const request = transaction().getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addItem(item) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").add(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateItem(item) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function fileKind(file) {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return null;
}

function objectUrl(item) {
  if (!state.urls.has(item.id)) {
    state.urls.set(item.id, URL.createObjectURL(item.blob));
  }
  return state.urls.get(item.id);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 2600);
}

async function refreshItems() {
  state.items = await getAllItems();
  render();
  updateStorageEstimate();
}

async function saveFiles(files) {
  const accepted = [...files].filter((file) => fileKind(file));
  const rejected = files.length - accepted.length;

  for (const file of accepted) {
    await addItem({
      name: file.name,
      kind: fileKind(file),
      type: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
      size: file.size,
      createdAt: Date.now(),
      notes: "",
      blob: file
    });
  }

  if (accepted.length) {
    toast(`${accepted.length} file${accepted.length === 1 ? "" : "s"} saved`);
  }
  if (rejected) {
    toast(`${rejected} unsupported file${rejected === 1 ? "" : "s"} skipped`);
  }

  await refreshItems();
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const matchesFilter = state.filter === "all" || item.kind === state.filter;
    const haystack = `${item.name} ${item.kind} ${item.type} ${item.notes || ""}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });

  return filtered.sort((a, b) => {
    if (state.sort === "oldest") return a.createdAt - b.createdAt;
    if (state.sort === "name") return a.name.localeCompare(b.name);
    if (state.sort === "size") return b.size - a.size;
    return b.createdAt - a.createdAt;
  });
}

function render() {
  const items = filteredItems();
  const audioCount = state.items.filter((item) => item.kind === "audio").length;
  const pdfCount = state.items.filter((item) => item.kind === "pdf").length;
  const totalSize = state.items.reduce((sum, item) => sum + item.size, 0);

  els.totalCount.textContent = state.items.length;
  els.audioCount.textContent = audioCount;
  els.pdfCount.textContent = pdfCount;
  els.totalSize.textContent = formatBytes(totalSize);
  els.listTitle.textContent = state.filter === "audio" ? "Audios" : state.filter === "pdf" ? "Books PDF" : "All files";

  els.libraryGrid.innerHTML = "";
  els.emptyState.classList.toggle("visible", items.length === 0);

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "file-card";
    card.innerHTML = `
      <div class="card-top">
        <div class="file-icon ${item.kind}" aria-hidden="true">${item.kind === "audio" ? "♪" : "PDF"}</div>
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <div class="meta">${item.kind.toUpperCase()} · ${formatBytes(item.size)} · ${formatDate(item.createdAt)}</div>
        </div>
      </div>
      <div class="card-actions">
        <button type="button" data-action="open" data-id="${item.id}">${item.kind === "audio" ? "Play" : "Read"}</button>
        <a href="${objectUrl(item)}" download="${escapeAttribute(item.name)}">Download</a>
        <button type="button" data-action="notes" data-id="${item.id}">Notes</button>
        <button class="danger" type="button" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    `;
    els.libraryGrid.append(card);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttribute(value) {
  return value.replace(/[&"]/g, (char) => ({
    "&": "&amp;",
    '"': "&quot;"
  }[char]));
}

async function updateStorageEstimate() {
  if (!navigator.storage?.estimate) {
    els.storageText.textContent = "Browser storage estimate is not available.";
    return;
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const percent = quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
  els.storageFill.style.width = `${percent}%`;
  els.storageText.textContent = `${formatBytes(usage)} used of about ${formatBytes(quota)} available`;
}

function showDetails(item, mode = "open") {
  const url = objectUrl(item);
  const viewer = item.kind === "audio"
    ? `<audio controls src="${url}"></audio>`
    : `<iframe class="pdf-preview" src="${url}" title="${escapeAttribute(item.name)}"></iframe>`;

  els.detailsContent.innerHTML = `
    <h3 class="details-title">${escapeHtml(item.name)}</h3>
    <p class="details-meta">${item.kind.toUpperCase()} · ${formatBytes(item.size)} · saved ${formatDate(item.createdAt)}</p>
    ${mode === "open" ? viewer : ""}
    <label class="notes-field">
      <span>Notes</span>
      <textarea id="notesInput" placeholder="Add author, chapter, topic, or listening notes...">${escapeHtml(item.notes || "")}</textarea>
    </label>
    <div class="card-actions" style="margin-top: 14px;">
      <button type="button" id="saveNotes">Save notes</button>
      <a href="${url}" download="${escapeAttribute(item.name)}">Download</a>
    </div>
  `;

  els.detailsDialog.showModal();
  document.querySelector("#saveNotes").addEventListener("click", async () => {
    item.notes = document.querySelector("#notesInput").value;
    await updateItem(item);
    toast("Notes saved");
    await refreshItems();
  });
}

function bindEvents() {
  els.fileInput.addEventListener("change", async (event) => {
    await saveFiles(event.target.files);
    event.target.value = "";
  });

  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });

  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("dragging");
  });

  els.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    await saveFiles(event.dataTransfer.files);
  });

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      render();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    render();
  });

  els.libraryGrid.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) return;

    const id = Number(target.dataset.id);
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;

    if (target.dataset.action === "delete") {
      const ok = window.confirm(`Delete "${item.name}" from this browser?`);
      if (!ok) return;
      if (state.urls.has(id)) {
        URL.revokeObjectURL(state.urls.get(id));
        state.urls.delete(id);
      }
      await deleteItem(id);
      toast("File deleted");
      await refreshItems();
      return;
    }

    showDetails(item, target.dataset.action === "notes" ? "notes" : "open");
  });
}

async function init() {
  if (!("indexedDB" in window)) {
    els.emptyState.classList.add("visible");
    els.emptyState.querySelector("h3").textContent = "Browser storage is not available";
    els.emptyState.querySelector("p").textContent = "Please use a modern browser that supports IndexedDB.";
    return;
  }

  state.db = await openDatabase();
  bindEvents();
  await refreshItems();
}

init().catch((error) => {
  console.error(error);
  toast("Something went wrong while starting the library");
});
