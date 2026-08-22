MimiGames.register({
  id: "notes",
  title: "Notes",
  emoji: "📝",
  category: "Apps",
  players: "1P",
  howTo: "Quick sticky notes, saved on this device. + New Note to add one, click a note to open and edit it, 🗑️ to delete. Everything saves automatically as you type.",
  init(root, ctx) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:16px;width:100%;max-width:640px;align-items:flex-start;flex-wrap:wrap";

    const listCol = document.createElement("div");
    listCol.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:220px;flex:1";

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "+ New Note";

    const listEl = document.createElement("div");
    listEl.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto";

    listCol.append(newBtn, listEl);

    const editorCol = document.createElement("div");
    editorCol.style.cssText = "display:flex;flex-direction:column;gap:8px;flex:2;min-width:260px";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Note title";
    titleInput.style.cssText = "padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);font:inherit;font-weight:700";

    const bodyInput = document.createElement("textarea");
    bodyInput.placeholder = "Write something…";
    bodyInput.rows = 12;
    bodyInput.style.cssText = "padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);font:inherit;resize:vertical;line-height:1.5";

    const editorActions = document.createElement("div");
    editorActions.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "🗑️ Delete";
    const savedHint = document.createElement("span");
    savedHint.className = "profile-note";
    savedHint.style.marginRight = "auto";
    editorActions.append(savedHint, deleteBtn);

    editorCol.append(titleInput, bodyInput, editorActions);
    wrap.append(listCol, editorCol);
    root.appendChild(wrap);

    // ============ state ============
    let notes = ctx.storage.get("notes", []);
    let activeId = notes[0]?.id || null;

    function saveNotes() {
      ctx.storage.set("notes", notes);
    }

    function snippetFor(note) {
      const text = (note.body || "").trim();
      return text ? text.slice(0, 60) : "(empty note)";
    }

    function renderList() {
      listEl.innerHTML = "";
      if (!notes.length) {
        const empty = document.createElement("p");
        empty.className = "profile-note";
        empty.textContent = "No notes yet.";
        listEl.appendChild(empty);
        return;
      }
      notes.forEach((note) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "btn" + (note.id === activeId ? " primary" : "");
        row.style.cssText = "text-align:left;display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:8px 12px";
        const titleEl = document.createElement("strong");
        titleEl.textContent = note.title || "Untitled";
        titleEl.style.fontSize = ".88rem";
        const snippetEl = document.createElement("span");
        snippetEl.textContent = snippetFor(note);
        snippetEl.style.cssText = "font-size:.72rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px";
        row.append(titleEl, snippetEl);
        row.onclick = () => { activeId = note.id; syncEditor(); renderList(); };
        listEl.appendChild(row);
      });
    }

    function syncEditor() {
      const note = notes.find((n) => n.id === activeId);
      const hasNote = Boolean(note);
      titleInput.disabled = !hasNote;
      bodyInput.disabled = !hasNote;
      deleteBtn.disabled = !hasNote;
      titleInput.value = note?.title || "";
      bodyInput.value = note?.body || "";
      savedHint.textContent = hasNote ? "" : "Select or create a note.";
    }

    function newNote() {
      const note = { id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`, title: "", body: "" };
      notes.unshift(note);
      activeId = note.id;
      saveNotes();
      renderList();
      syncEditor();
      titleInput.focus();
      ctx.playSound("pop");
    }

    let saveTimer = null;
    function scheduleSave() {
      const note = notes.find((n) => n.id === activeId);
      if (!note) return;
      note.title = titleInput.value;
      note.body = bodyInput.value;
      savedHint.textContent = "Saving…";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveNotes();
        renderList();
        savedHint.textContent = "Saved.";
      }, 400);
    }

    function deleteActive() {
      const index = notes.findIndex((n) => n.id === activeId);
      if (index === -1) return;
      notes.splice(index, 1);
      activeId = notes[0]?.id || null;
      saveNotes();
      renderList();
      syncEditor();
      ctx.playSound("click");
    }

    newBtn.onclick = newNote;
    deleteBtn.onclick = deleteActive;
    titleInput.addEventListener("input", scheduleSave);
    bodyInput.addEventListener("input", scheduleSave);

    renderList();
    syncEditor();
    ctx.setStatus("Notes stay on this device.");

    return () => {
      clearTimeout(saveTimer);
    };
  },
});
