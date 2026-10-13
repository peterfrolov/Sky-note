/**
 * Fly Note - Client Application Engine
 * Ultra-fast, lightweight real-time note syncing
 */

(function () {
  'use strict';

  // State
  let currentNoteId = null;
  let notes = [];
  let socket = null;
  let serverInfo = { ip: window.location.hostname, port: window.location.port || '3000', cloudUrl: '' };
  let saveTimeout = null;
  let isReceivingRemoteUpdate = false;
  let deviceId = localStorage.getItem('flynote_device_id') || 'dev_' + Math.random().toString(36).substring(2, 9);
  let deviceName = localStorage.getItem('flynote_device_name') || (isMobile() ? 'Mobil' : 'PC');
  localStorage.setItem('flynote_device_id', deviceId);
  let draggedNoteId = null;
  let isReorderMode = false;
  let notePendingDeleteId = null;

  // DOM Elements
  const noteTitleInput = document.getElementById('noteTitle');
  const noteContentInput = document.getElementById('noteContent');
  const notesListEl = document.getElementById('notesList');
  const btnNewNote = document.getElementById('btnNewNote');
  const searchInput = document.getElementById('searchInput');
  const syncBadge = document.getElementById('syncBadge');
  const syncDot = document.getElementById('syncDot');
  const syncText = document.getElementById('syncText');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnConnectPhone = document.getElementById('btnConnectPhone');
  const phoneModal = document.getElementById('phoneModal');
  const qrCodeFrame = document.getElementById('qrCodeFrame');
  const phoneShareUrl = document.getElementById('phoneShareUrl');
  const btnCopyShareUrl = document.getElementById('btnCopyShareUrl');
  const btnToggleTheme = document.getElementById('btnToggleTheme');
  const themeIcon = document.getElementById('themeIcon');
  const btnExport = document.getElementById('btnExport');
  const exportModal = document.getElementById('exportModal');
  const btnExportMarkdown = document.getElementById('btnExportMarkdown');
  const btnExportTxt = document.getElementById('btnExportTxt');
  const btnPrintNote = document.getElementById('btnPrintNote');
  const btnSettings = document.getElementById('btnSettings');
  const settingsModal = document.getElementById('settingsModal');
  const customCloudUrlInput = document.getElementById('customCloudUrl');
  const deviceNameInput = document.getElementById('deviceName');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const statWords = document.getElementById('statWords');
  const statChars = document.getElementById('statChars');
  const activeDevicesInfo = document.getElementById('activeDevicesInfo');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  function init() {
    loadTheme();
    loadNotesFromStorage();
    setupUrlRouting();
    setupEventListeners();
    setupFormattingToolbar();
    fetchServerInfo();
    connectWebSocket();
    registerServiceWorker();
    updateStats();
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  // PWA Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // Theme Management
  function loadTheme() {
    const savedTheme = localStorage.getItem('flynote_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeIcon.textContent = savedTheme === 'light' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('flynote_theme', next);
    themeIcon.textContent = next === 'light' ? '☀️' : '🌙';
    showToast(next === 'light' ? 'Lyst tema aktiveret' : 'Mørkt tema aktiveret');
  }

  // Local Storage Notes Management
  function loadNotesFromStorage() {
    try {
      const stored = localStorage.getItem('flynote_notes') || localStorage.getItem('skynote_notes');
      if (stored) {
        notes = JSON.parse(stored);
      }
    } catch (e) {
      notes = [];
    }

    if (!notes || notes.length === 0) {
      // Create initial welcome note
      const defaultNote = {
        id: 'velkommen',
        title: 'Velkommen til Fly Note ✈️',
        content: `# Velkommen til Fly Note! ⚡\n\nDette er dit nye lynhurtige note-program med automatisk sky-synkronisering.\n\n### 📱 Sådan forbinder du din mobil:\n1. Tryk på knappen **"Forbind mobil"** øverst til højre.\n2. Scan QR-koden med mobilens kamera.\n3. Skriv på PC'en, og se teksten dukke op på mobilen med det samme – og omvendt!\n\n### ⚡ Funktioner:\n- [x] Lynhurtig indlæsning & fjerlet i baggrunden\n- [x] Realtids sky-synkronisering mellem PC og telefon\n- [x] Fungerer 100% offline (PWA app-understøttelse)\n- [ ] Opret din første egen note\n- [ ] Prøv tjeklisten ved at klikke af herover\n\nGod fornøjelse med Fly Note!`,
        updatedAt: Date.now()
      };
      notes = [defaultNote];
      saveNotesToStorage();
    }
  }

  function saveNotesToStorage() {
    try {
      localStorage.setItem('flynote_notes', JSON.stringify(notes));
    } catch (e) {}
  }

  // Routing with URL Hash (#note-id)
  function setupUrlRouting() {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && notes.some(n => n.id === hash)) {
      selectNote(hash, false);
    } else if (hash) {
      // URL has a note id not in local storage yet (e.g. shared link)
      const sharedNote = {
        id: hash,
        title: 'Delt note',
        content: '',
        updatedAt: Date.now()
      };
      notes.unshift(sharedNote);
      saveNotesToStorage();
      selectNote(hash, false);
    } else {
      selectNote(notes[0].id, false);
    }

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '').trim();
      if (newHash && newHash !== currentNoteId) {
        selectNote(newHash, false);
      }
    });
  }

  function selectNote(noteId, updateHash = true) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    currentNoteId = noteId;
    noteTitleInput.value = note.title || '';
    noteContentInput.value = note.content || '';

    if (updateHash) {
      window.location.hash = noteId;
    }

    document.title = (note.title || 'Uden titel') + ' — Fly Note';
    renderNotesList();
    updateStats();

    // Inform server of active note
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'join_note',
        noteId: currentNoteId,
        deviceId: deviceId,
        deviceName: deviceName
      }));
    }

    // Close mobile sidebar if open
    closeMobileSidebar();
  }

  function renderNotesList() {
    const query = (searchInput.value || '').toLowerCase().trim();
    const isSearching = !!query;
    const filtered = notes.filter(n => {
      if (!query) return true;
      return (n.title || '').toLowerCase().includes(query) || (n.content || '').toLowerCase().includes(query);
    });

    notesListEl.innerHTML = '';
    filtered.forEach((note, index) => {
      const card = document.createElement('div');
      card.className = 'note-card' + (note.id === currentNoteId ? ' active' : '');
      card.dataset.noteId = note.id;

      if (!isSearching) {
        card.setAttribute('draggable', 'true');
      }
      
      const firstLine = (note.content || '').split('\n').find(l => l.trim().length > 0) || 'Tom note...';
      const cleanPreview = firstLine.replace(/^#+\s*/, '').replace(/[-*]\s*(\[[ xX]\])?/, '').trim();
      const timeStr = formatRelativeTime(note.updatedAt || Date.now());

      card.innerHTML = `
        <div class="note-card-title">${escapeHtml(note.title || 'Uden titel')}</div>
        <div class="note-card-preview">${escapeHtml(cleanPreview)}</div>
        <div class="note-card-meta">
          <span>${timeStr}</span>
          <div class="note-card-actions">
            ${isReorderMode ? `
              <button class="note-btn-move btn-move-up" data-move="up" data-id="${note.id}" title="Flyt op" ${index === 0 ? 'disabled' : ''}>▲</button>
              <button class="note-btn-move btn-move-down" data-move="down" data-id="${note.id}" title="Flyt ned" ${index === filtered.length - 1 ? 'disabled' : ''}>▼</button>
            ` : ''}
            <button class="note-btn-action btn-delete" data-delete-id="${note.id}" title="Slet note">✕</button>
          </div>
        </div>
      `;

      // Click to select note or delete or move
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete')) {
          e.stopPropagation();
          deleteNote(note.id, e.shiftKey);
          return;
        }

        const moveBtn = e.target.closest('[data-move]');
        if (moveBtn) {
          e.stopPropagation();
          const dir = moveBtn.dataset.move;
          moveNoteDirection(note.id, dir);
          return;
        }

        selectNote(note.id);
      });

      // Drag and Drop (Desktop)
      if (!isSearching) {
        card.addEventListener('dragstart', (e) => {
          if (e.target.closest('button')) {
            e.preventDefault();
            return;
          }
          draggedNoteId = note.id;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', note.id);
          card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          document.querySelectorAll('.note-card').forEach(c => {
            c.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
          });
          draggedNoteId = null;
        });

        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          const sourceId = draggedNoteId || e.dataTransfer.getData('text/plain');
          if (!sourceId || sourceId === note.id) return;
          e.dataTransfer.dropEffect = 'move';

          const rect = card.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            card.classList.add('drag-over-top');
            card.classList.remove('drag-over-bottom');
          } else {
            card.classList.add('drag-over-bottom');
            card.classList.remove('drag-over-top');
          }
        });

        card.addEventListener('dragleave', (e) => {
          if (!card.contains(e.relatedTarget)) {
            card.classList.remove('drag-over-top', 'drag-over-bottom');
          }
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over-top', 'drag-over-bottom');
          const sourceId = draggedNoteId || e.dataTransfer.getData('text/plain');
          if (!sourceId || sourceId === note.id) return;

          const rect = card.getBoundingClientRect();
          const insertBefore = e.clientY < (rect.top + rect.height / 2);
          moveNoteToIndex(sourceId, note.id, insertBefore);
        });

        // Touch Drag for Mobile / Phone (Press and hold for 250ms then drag)
        let touchTimer = null;
        let isTouchDragging = false;
        let touchLastOver = null;

        card.addEventListener('touchstart', (e) => {
          if (e.target.closest('button')) return;
          touchTimer = setTimeout(() => {
            isTouchDragging = true;
            draggedNoteId = note.id;
            card.classList.add('dragging');
            if (navigator.vibrate) navigator.vibrate(30);
          }, 250);
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
          if (!isTouchDragging) {
            clearTimeout(touchTimer);
            return;
          }
          e.preventDefault();
          const touch = e.touches[0];
          const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetCard = targetEl ? targetEl.closest('.note-card') : null;

          document.querySelectorAll('.note-card').forEach(c => {
            if (c !== targetCard) c.classList.remove('drag-over-top', 'drag-over-bottom');
          });

          if (targetCard && targetCard !== card) {
            touchLastOver = targetCard;
            const rect = targetCard.getBoundingClientRect();
            if (touch.clientY < rect.top + rect.height / 2) {
              targetCard.classList.add('drag-over-top');
              targetCard.classList.remove('drag-over-bottom');
            } else {
              targetCard.classList.add('drag-over-bottom');
              targetCard.classList.remove('drag-over-top');
            }
          }
        }, { passive: false });

        card.addEventListener('touchend', () => {
          clearTimeout(touchTimer);
          if (isTouchDragging && touchLastOver && touchLastOver !== card) {
            const isTop = touchLastOver.classList.contains('drag-over-top');
            const targetId = touchLastOver.dataset.noteId;
            moveNoteToIndex(draggedNoteId, targetId, isTop);
          }
          isTouchDragging = false;
          touchLastOver = null;
          draggedNoteId = null;
          card.classList.remove('dragging');
          document.querySelectorAll('.note-card').forEach(c => {
            c.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
          });
        });
      }

      notesListEl.appendChild(card);
    });
  }

  function highlightCard(noteId) {
    setTimeout(() => {
      const el = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
      if (el) {
        el.classList.add('just-moved');
        setTimeout(() => el.classList.remove('just-moved'), 700);
      }
    }, 20);
  }

  function moveNoteToIndex(draggedId, targetId, insertBefore) {
    const fromIndex = notes.findIndex(n => n.id === draggedId);
    if (fromIndex === -1) return;

    const [movedNote] = notes.splice(fromIndex, 1);
    let targetIndex = notes.findIndex(n => n.id === targetId);
    if (targetIndex === -1) {
      notes.push(movedNote);
    } else {
      if (!insertBefore) {
        targetIndex += 1;
      }
      notes.splice(targetIndex, 0, movedNote);
    }

    saveNotesToStorage();
    renderNotesList();
    syncReorder();
    highlightCard(draggedId);
    showToast('Noter omrokeret');
  }

  function moveNoteDirection(noteId, direction) {
    const index = notes.findIndex(n => n.id === noteId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const [moved] = notes.splice(index, 1);
      notes.splice(index - 1, 0, moved);
    } else if (direction === 'down' && index < notes.length - 1) {
      const [moved] = notes.splice(index, 1);
      notes.splice(index + 1, 0, moved);
    } else {
      return;
    }

    saveNotesToStorage();
    renderNotesList();
    syncReorder();
    highlightCard(noteId);
    showToast(direction === 'up' ? 'Flyttet op' : 'Flyttet ned');
  }

  function syncReorder() {
    const noteIds = notes.map(n => n.id);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'notes_reorder',
        noteIds: noteIds
      }));
    } else {
      fetch('./api/notes/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds })
      }).catch(() => {});
    }
  }

  function createNewNote() {
    const newId = 'note_' + Math.random().toString(36).substring(2, 9);
    const newNote = {
      id: newId,
      title: 'Ny note',
      content: '',
      updatedAt: Date.now()
    };
    notes.unshift(newNote);
    saveNotesToStorage();
    selectNote(newId);
    renderNotesList();
    noteTitleInput.focus();
    showToast('Ny note oprettet');

    // Sync to server
    broadcastNoteUpdate(newNote);
  }

  function deleteNote(noteId, skipConfirm = false) {
    if (notes.length <= 1) {
      showToast('Du kan ikke slette den sidste note');
      return;
    }

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    if (skipConfirm) {
      executeDelete(noteId);
      return;
    }

    notePendingDeleteId = noteId;
    const deletePromptEl = document.getElementById('deleteModalPrompt');
    if (deletePromptEl) {
      deletePromptEl.innerHTML = `Er du sikker på, at du vil slette <b>"${escapeHtml(note.title || 'Uden titel')}"</b>?<br><span style="font-size:0.82rem; color:var(--text-muted); margin-top:6px; display:block;">Dette kan ikke fortrydes.</span>`;
    }
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
      openModal(deleteModal);
    } else {
      executeDelete(noteId);
    }
  }

  function executeDelete(noteId) {
    if (!noteId) return;

    notes = notes.filter(n => n.id !== noteId);
    saveNotesToStorage();

    if (currentNoteId === noteId) {
      selectNote(notes[0].id);
    } else {
      renderNotesList();
    }

    showToast('Note slettet');

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'delete_note',
        noteId: noteId
      }));
    } else {
      fetch('./api/notes/' + noteId, { method: 'DELETE' }).catch(() => {});
    }

    notePendingDeleteId = null;
  }

  // Handle Input & Debounced Auto-Saving
  function onNoteInput() {
    if (isReceivingRemoteUpdate) return;

    setSyncStatus('saving', 'Gemmer...');

    const activeNote = notes.find(n => n.id === currentNoteId);
    if (activeNote) {
      activeNote.title = noteTitleInput.value.trim() || 'Uden titel';
      activeNote.content = noteContentInput.value;
      activeNote.updatedAt = Date.now();
      saveNotesToStorage();
      renderNotesList();
      updateStats();
      document.title = activeNote.title + ' — Fly Note';
    }

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (activeNote) {
        broadcastNoteUpdate(activeNote);
      }
    }, 200);
  }

  function broadcastNoteUpdate(note) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'note_update',
        note: {
          id: note.id,
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt,
          deviceId: deviceId,
          deviceName: deviceName
        }
      }));
      setSyncStatus('online', 'Gemt i skyen');
    } else {
      // Fallback: send via REST API
      fetch('./api/notes/' + note.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt,
          deviceId: deviceId,
          deviceName: deviceName
        })
      }).then(() => {
        setSyncStatus('online', 'Gemt i skyen');
      }).catch(() => {
        setSyncStatus('offline', 'Offline (gemt lokalt)');
      });
    }
  }

  // WebSocket Cloud Synchronization Engine
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.host;

    // Check if custom cloud URL is configured
    const customUrl = localStorage.getItem('flynote_custom_cloud_url') || localStorage.getItem('skynote_custom_cloud_url');
    if (customUrl) {
      try {
        const parsed = new URL(customUrl);
        host = parsed.host;
      } catch (e) {}
    }

    const wsUrl = `${protocol}//${host}/ws`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setSyncStatus('online', 'Forbundet til skyen');
        if (currentNoteId) {
          socket.send(JSON.stringify({
            type: 'join_note',
            noteId: currentNoteId,
            deviceId: deviceId,
            deviceName: deviceName
          }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (e) {}
      };

      socket.onclose = () => {
        // Fall back to cloud sync polling when WebSocket is closed (e.g. on Vercel)
        startCloudSync();
        // Still retry WebSocket occasionally for local server runs
        setTimeout(connectWebSocket, 15000);
      };

      socket.onerror = () => {
        startCloudSync();
      };
    } catch (e) {
      startCloudSync();
    }
  }

  // Cloud Sync Polling Engine (Vercel Serverless & HTTP Fallback)
  let cloudSyncTimeout = null;
  let isCloudPolling = false;
  let lastSyncTime = 0;
  let cloudSyncStarted = false;

  function startCloudSync() {
    if (cloudSyncStarted) return;
    cloudSyncStarted = true;
    setSyncStatus('online', 'Sky-synkroniseret');

    async function poll() {
      if (isCloudPolling) {
        scheduleNext();
        return;
      }
      isCloudPolling = true;

      try {
        const res = await fetch(`./api/sync?since=${lastSyncTime}&deviceId=${encodeURIComponent(deviceId)}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.serverTime) lastSyncTime = data.serverTime;
          handleServerMessage({
            type: 'all_notes',
            notes: data.notes,
            deletedIds: data.deletedIds
          });
          if (syncDot && !syncDot.classList.contains('peer-active')) {
            setSyncStatus('online', 'Sky-synkroniseret');
          }
        }
      } catch (err) {
        // Network blip, will retry
      } finally {
        isCloudPolling = false;
        scheduleNext();
      }
    }

    function scheduleNext() {
      clearTimeout(cloudSyncTimeout);
      const delay = document.hidden ? 6000 : 1500;
      cloudSyncTimeout = setTimeout(poll, delay);
    }

    poll();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        poll();
      }
    });
  }

  function handleServerMessage(data) {
    if (data.type === 'note_update') {
      const incoming = data.note;
      if (!incoming) return;

      // Ignore update if it originated from this device
      if (incoming.deviceId === deviceId) return;

      const existingIndex = notes.findIndex(n => n.id === incoming.id);
      if (existingIndex !== -1) {
        notes[existingIndex] = { ...notes[existingIndex], ...incoming };
      } else {
        notes.unshift(incoming);
      }
      saveNotesToStorage();

      if (currentNoteId === incoming.id) {
        isReceivingRemoteUpdate = true;
        const selStart = noteContentInput.selectionStart;
        const selEnd = noteContentInput.selectionEnd;

        noteTitleInput.value = incoming.title || '';
        noteContentInput.value = incoming.content || '';

        // Preserve cursor position if possible
        try {
          noteContentInput.setSelectionRange(selStart, selEnd);
        } catch (e) {}

        isReceivingRemoteUpdate = false;
        updateStats();
      }

      renderNotesList();
      setSyncStatus('peer-active', `Synkroniseret (${incoming.deviceName || 'anden enhed'})`);
      setTimeout(() => setSyncStatus('online', 'Gemt i skyen'), 2500);
    } else if (data.type === 'presence') {
      const count = data.count || 1;
      if (count > 1) {
        activeDevicesInfo.innerHTML = `<span>🔵 <b>${count} enheder</b> i samme note</span>`;
      } else {
        activeDevicesInfo.innerHTML = `<span>☁️ Sky-synkronisering aktiv</span>`;
      }
    } else if (data.type === 'all_notes') {
      if (Array.isArray(data.notes)) {
        const serverNotes = data.notes;
        let listChanged = false;
        let activeNoteChanged = false;

        // If local has notes and server has only the default welcome note, push local notes to cloud
        if (notes.length > 1 && serverNotes.length === 1 && serverNotes[0].id === 'velkommen') {
          fetch('./api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notes })
          }).catch(() => {});
        }

        // Handle deleted notes
        if (Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
          const prevLen = notes.length;
          notes = notes.filter(n => !data.deletedIds.includes(n.id));
          if (notes.length !== prevLen) {
            listChanged = true;
            if (data.deletedIds.includes(currentNoteId)) {
              if (notes.length > 0) {
                selectNote(notes[0].id);
              }
            }
          }
        }

        // Smart merge server notes
        serverNotes.forEach(sNote => {
          const idx = notes.findIndex(n => n.id === sNote.id);
          if (idx === -1) {
            notes.push(sNote);
            listChanged = true;
          } else {
            const localNote = notes[idx];
            if ((sNote.updatedAt || 0) > (localNote.updatedAt || 0)) {
              if (currentNoteId === sNote.id) {
                const isTyping = document.activeElement === noteContentInput || document.activeElement === noteTitleInput;
                if (!isTyping) {
                  notes[idx] = sNote;
                  activeNoteChanged = true;
                  listChanged = true;
                } else if (sNote.content !== noteContentInput.value) {
                  const selStart = noteContentInput.selectionStart;
                  const selEnd = noteContentInput.selectionEnd;
                  notes[idx] = sNote;
                  isReceivingRemoteUpdate = true;
                  noteTitleInput.value = sNote.title || '';
                  noteContentInput.value = sNote.content || '';
                  try {
                    noteContentInput.setSelectionRange(selStart, selEnd);
                  } catch (e) {}
                  isReceivingRemoteUpdate = false;
                  updateStats();
                  listChanged = true;
                }
              } else {
                notes[idx] = sNote;
                listChanged = true;
              }
            }
          }
        });

        if (listChanged) {
          saveNotesToStorage();
          renderNotesList();
        }
        if (activeNoteChanged && currentNoteId) {
          const cur = notes.find(n => n.id === currentNoteId);
          if (cur) {
            noteTitleInput.value = cur.title || '';
            noteContentInput.value = cur.content || '';
            updateStats();
          }
        }
      }
    } else if (data.type === 'notes_reorder') {
      if (Array.isArray(data.noteIds)) {
        const orderMap = new Map(data.noteIds.map((id, index) => [id, index]));
        notes.sort((a, b) => {
          const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
          const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
          return orderA - orderB;
        });
        saveNotesToStorage();
        renderNotesList();
        setSyncStatus('peer-active', 'Rækkefølge opdateret');
        setTimeout(() => setSyncStatus('online', 'Gemt i skyen'), 2000);
      }
    } else if (data.type === 'delete_note') {
      if (data.noteId) {
        notes = notes.filter(n => n.id !== data.noteId);
        saveNotesToStorage();
        if (currentNoteId === data.noteId && notes.length > 0) {
          selectNote(notes[0].id);
        } else {
          renderNotesList();
        }
      }
    }
  }

  function setSyncStatus(state, message) {
    syncDot.className = 'sync-dot ' + (state || '');
    syncText.textContent = message || '';
  }

  // Fetch Server Info (for QR Code pairing & Cloud detection)
  function fetchServerInfo() {
    fetch('./api/info')
      .then(res => res.json())
      .then(info => {
        if (info && info.ip) {
          serverInfo = info;
          if (info.isCloud) {
            startCloudSync();
          }
        }
      })
      .catch(() => {
        startCloudSync();
      });
  }

  // QR Code & Mobile Pairing Modal
  function openPhoneModal() {
    try {
      let origin = window.location.origin;
      const isCloudEnv = Boolean(serverInfo && serverInfo.isCloud) || 
                         window.location.hostname.includes('vercel.app') || 
                         (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('192.168.'));

      if (!isCloudEnv && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        if (serverInfo.ip && serverInfo.ip !== 'localhost' && serverInfo.ip !== '127.0.0.1') {
          origin = `http://${serverInfo.ip}:${serverInfo.port || 3000}`;
        }
      }

      const noteId = currentNoteId || (notes[0] ? notes[0].id : 'velkommen');
      const shareUrl = `${origin}/#${noteId}`;
      if (phoneShareUrl) {
        phoneShareUrl.value = shareUrl;
      }

      const directEl = document.getElementById('directAddressCode');
      if (directEl) {
        if (isCloudEnv) {
          directEl.textContent = `${window.location.host}`;
        } else {
          const host = (serverInfo.ip && serverInfo.ip !== 'localhost' && serverInfo.ip !== '127.0.0.1')
            ? `${serverInfo.ip}:${serverInfo.port || 3000}`
            : window.location.host;
          directEl.textContent = `http://${host}`;
        }
      }

      const directNoteEl = document.getElementById('directAddressNote');
      if (directNoteEl) {
        if (isCloudEnv) {
          directNoteEl.innerHTML = `☁️ <b>Sky-synkroniseret</b> – virker overalt i verden på både 4G, 5G og alle Wi-Fi netværk!`;
        } else {
          directNoteEl.innerHTML = `Telefon og PC skal være på samme Wi-Fi (<b>${serverInfo.wifiName || 'VI HAR VIRUS_5G'}</b>)`;
        }
      }

      if (qrCodeFrame) {
        let svg = null;
        if (typeof window.generateQRCodeSVG === 'function') {
          try {
            svg = window.generateQRCodeSVG(shareUrl, 220);
          } catch (e) {
            console.warn('generateQRCodeSVG error:', e);
          }
        }
        if (!svg) {
          svg = generateBuiltinQR(shareUrl, 220);
        }
        qrCodeFrame.innerHTML = svg;
      }

      openModal(phoneModal);
    } catch (err) {
      console.error('Fejl i openPhoneModal:', err);
      if (phoneModal) openModal(phoneModal);
    }
  }

  function generateBuiltinQR(text, size) {
    if (typeof window.generateQRCodeSVG === 'function') {
      try {
        return window.generateQRCodeSVG(text, size);
      } catch (e) {}
    }
    return `<div style="text-align:center; padding:16px; font-size:0.9rem; color:var(--text-secondary);">
      <div style="font-size:2.5rem; margin-bottom:8px;">📱</div>
      <b>Åbn direkte på mobilen:</b><br>
      <a href="${text}" target="_blank" style="color:var(--accent); font-weight:600; word-break:break-all;">${text}</a>
    </div>`;
  }

  // Formatting Toolbar Operations
  function setupFormattingToolbar() {
    const toolbar = document.querySelector('.editor-toolbar');
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tool-btn');
      if (!btn) return;

      const tool = btn.dataset.tool;
      applyFormatting(tool);
    });
  }

  function applyFormatting(tool) {
    const textarea = noteContentInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    let replacement = '';
    let newCursorPos = start;

    switch (tool) {
      case 'h1':
        replacement = `# ${selection || 'Overskrift 1'}\n`;
        break;
      case 'h2':
        replacement = `## ${selection || 'Overskrift 2'}\n`;
        break;
      case 'bold':
        replacement = `**${selection || 'fed tekst'}**`;
        newCursorPos = selection ? start + replacement.length : start + 2;
        break;
      case 'italic':
        replacement = `*${selection || 'kursiv tekst'}*`;
        newCursorPos = selection ? start + replacement.length : start + 1;
        break;
      case 'strike':
        replacement = `~~${selection || 'overstreget'}~~`;
        break;
      case 'checklist':
        replacement = `- [ ] ${selection || 'Ny opgave'}\n`;
        break;
      case 'bullet':
        replacement = `- ${selection || 'Punkt'}\n`;
        break;
      case 'code':
        replacement = selection ? `\`\`\`\n${selection}\n\`\`\`\n` : `\`\`\`\nkode her\n\`\`\`\n`;
        break;
      case 'timestamp':
        const now = new Date();
        const dateStr = now.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        replacement = `[${dateStr}] `;
        break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    onNoteInput();
  }

  // Interactive Checklist Toggling in Textarea
  function setupChecklistClick() {
    noteContentInput.addEventListener('click', (e) => {
      const textarea = noteContentInput;
      const cursorPos = textarea.selectionStart;
      const text = textarea.value;
      
      const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1;
      let lineEnd = text.indexOf('\n', cursorPos);
      if (lineEnd === -1) lineEnd = text.length;

      const line = text.substring(lineStart, lineEnd);
      const matchUnchecked = line.match(/^(\s*[-*]\s*)\[ \]/);
      const matchChecked = line.match(/^(\s*[-*]\s*)\[[xX]\]/);

      if (cursorPos >= lineStart && cursorPos <= lineStart + 6) {
        let newLine = null;
        if (matchUnchecked) {
          newLine = line.replace(/\[ \]/, '[x]');
        } else if (matchChecked) {
          newLine = line.replace(/\[[xX]\]/, '[ ]');
        }

        if (newLine !== null) {
          textarea.value = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
          textarea.setSelectionRange(cursorPos, cursorPos);
          onNoteInput();
        }
      }
    });
  }

  // Keyboard Shortcuts
  function setupEventListeners() {
    noteTitleInput.addEventListener('input', onNoteInput);
    noteContentInput.addEventListener('input', onNoteInput);
    btnNewNote.addEventListener('click', createNewNote);
    
    const btnToggleReorder = document.getElementById('btnToggleReorder');
    if (btnToggleReorder) {
      btnToggleReorder.addEventListener('click', () => {
        isReorderMode = !isReorderMode;
        btnToggleReorder.classList.toggle('active', isReorderMode);
        sidebar.classList.toggle('reorder-mode', isReorderMode);
        renderNotesList();
        showToast(isReorderMode ? 'Tryk på pilene for at flytte noter' : 'Omrokering afsluttet');
      });
    }

    searchInput.addEventListener('input', renderNotesList);
    btnToggleTheme.addEventListener('click', toggleTheme);

    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarBackdrop.classList.toggle('active');
    });

    sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    btnConnectPhone.addEventListener('click', openPhoneModal);
    btnCopyShareUrl.addEventListener('click', () => {
      const url = phoneShareUrl ? phoneShareUrl.value : '';
      if (!url) return;

      const copySuccess = () => {
        btnCopyShareUrl.textContent = '✓ Kopieret!';
        showToast('Link kopieret til udklipsholder');
        setTimeout(() => {
          btnCopyShareUrl.textContent = 'Kopiér';
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(copySuccess).catch(() => {
          fallbackCopyText(url);
          copySuccess();
        });
      } else {
        fallbackCopyText(url);
        copySuccess();
      }
    });

    btnExport.addEventListener('click', () => openModal(exportModal));
    btnExportMarkdown.addEventListener('click', () => exportFile('md'));
    btnExportTxt.addEventListener('click', () => exportFile('txt'));
    btnPrintNote.addEventListener('click', () => {
      closeModal(exportModal);
      window.print();
    });

    btnSettings.addEventListener('click', () => {
      customCloudUrlInput.value = localStorage.getItem('flynote_custom_cloud_url') || '';
      deviceNameInput.value = deviceName;
      openModal(settingsModal);
    });

    btnSaveSettings.addEventListener('click', () => {
      const url = customCloudUrlInput.value.trim();
      const name = deviceNameInput.value.trim() || 'Min Enhed';
      localStorage.setItem('flynote_custom_cloud_url', url);
      localStorage.setItem('flynote_device_name', name);
      deviceName = name;
      closeModal(settingsModal);
      showToast('Indstillinger gemt');
      connectWebSocket();
    });

    // Close modal on click outside or close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) closeModal(modal);
      });
    });

    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', () => {
        const deleteModal = document.getElementById('deleteModal');
        if (deleteModal) closeModal(deleteModal);
        if (notePendingDeleteId) {
          executeDelete(notePendingDeleteId);
        }
      });
    }

    const btnCancelDelete = document.getElementById('btnCancelDelete');
    if (btnCancelDelete) {
      btnCancelDelete.addEventListener('click', () => {
        const deleteModal = document.getElementById('deleteModal');
        if (deleteModal) closeModal(deleteModal);
        notePendingDeleteId = null;
      });
    }

    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Global Hotkeys
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onNoteInput();
        showToast('Gemt i skyen');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewNote();
      }
    });

    setupChecklistClick();
  }

  function fallbackCopyText(text) {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'fixed';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(tempInput);
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
  }

  function exportFile(extension) {
    const activeNote = notes.find(n => n.id === currentNoteId);
    if (!activeNote) return;

    const title = activeNote.title || 'note';
    const content = `# ${title}\n\n${activeNote.content || ''}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(title)}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    closeModal(exportModal);
    showToast(`Note eksporteret som .${extension}`);
  }

  function updateStats() {
    const text = noteContentInput.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    statWords.textContent = `${words} ord`;
    statChars.textContent = `${chars} tegn`;
  }

  function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  function formatRelativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Lige nu';
    if (diff < 3600) return `${Math.floor(diff / 60)}m siden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}t siden`;
    return new Date(ts).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  }

  function slugify(text) {
    return text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // Initialize application after all definitions are ready
  init();

  // Expose global API on window
  window.FlyNote = {
    openPhoneModal,
    closeModal,
    openModal,
    selectNote,
    createNewNote,
    deleteNote,
    toggleTheme
  };
})();
