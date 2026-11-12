(function () {
  'use strict';

  const D = window.WKM_DOM;
  if (!D) {
    console.error('[WKM] dom layer missing');
    return;
  }

  const state = {
    mode: 'list', // 'list' | 'chat'
    lastChat: null, // { identity, title }
    customListNav: false,
    customMessageNav: false
  };

  let operationToken = 0;
  let adaptiveToken = 0;

  // Flags can be set from the DevTools console in either the page context or the
  // extension context. localStorage is shared by both, so read it live.
  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function debugEnabled() {
    if (window.__WKM_DEBUG === true) return true;
    return readLocalStorage('wkm_debug') === '1';
  }

  function readFlag(name) {
    const stored = readLocalStorage('wkm_' + name);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return state[name];
  }

  function debugLog() {
    if (debugEnabled()) {
      console.log.apply(console, ['[WKM]'].concat([].slice.call(arguments)));
    }
  }

  function bumpOperation() {
    return ++operationToken;
  }

  function isCurrentOperation(id) {
    return id === operationToken;
  }

  function bumpAdaptive() {
    return ++adaptiveToken;
  }

  function getChatRows() {
    return D.getChatRows();
  }

  function getFocusedRow(rows) {
    const active = document.activeElement;
    if (!active) return null;
    for (const row of rows) {
      if (row === active || row.contains(active)) return row;
    }
    return null;
  }

  function getCurrentChatRow(rows) {
    rows = rows || getChatRows();
    if (!rows.length) return null;
    const focused = getFocusedRow(rows);
    if (focused) return focused;
    const selected = D.getSelectedChatRow(rows);
    if (selected) return selected;
    if (state.lastChat && state.lastChat.identity) {
      const byId = D.findChatRowByIdentity(rows, state.lastChat.identity);
      if (byId) return byId;
    }
    const title = D.getCurrentChatTitle();
    if (title) {
      const byTitle = D.findChatRowByTitle(rows, title);
      if (byTitle) return byTitle;
    }
    if (state.lastChat && state.lastChat.title) {
      const byTitle = D.findChatRowByTitle(rows, state.lastChat.title);
      if (byTitle) return byTitle;
    }
    return rows[0];
  }

  function focusChatRow(row) {
    if (!row) return false;
    const activator = D.getRowActivator(row) || row;
    const ok = D.focusElement(activator);
    if (ok) {
      D.clearActiveMarker();
      D.markActiveRow(row);
      try {
        row.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
      state.mode = 'list';
    }
    return ok;
  }

  function resolveRowForBack(rows) {
    const selected = D.getSelectedChatRow(rows);
    if (selected) return selected;
    if (state.lastChat && state.lastChat.identity) {
      const byId = D.findChatRowByIdentity(rows, state.lastChat.identity);
      if (byId) return byId;
    }
    const title = D.getCurrentChatTitle();
    if (title) {
      const byTitle = D.findChatRowByTitle(rows, title);
      if (byTitle) return byTitle;
    }
    if (state.lastChat && state.lastChat.title) {
      const byTitle = D.findChatRowByTitle(rows, state.lastChat.title);
      if (byTitle) return byTitle;
    }
    return rows[0];
  }

  function focusChatList() {
    const rows = getChatRows();
    if (!rows.length) {
      D.showToast('WhatsApp chat list not found');
      return false;
    }
    return focusChatRow(getCurrentChatRow(rows));
  }

  function backToList() {
    const rows = getChatRows();
    if (!rows.length) {
      D.showToast('WhatsApp chat list not found');
      return;
    }
    focusChatRow(resolveRowForBack(rows));
  }

  // WhatsApp Web auto-focuses the composer right after a chat opens, which can
  // steal focus back from the message we just focused. For a short window we
  // re-assert focus on that message — unless the user interacts on purpose
  // (any mousedown/keydown cancels the guard immediately).
  function guardFocusOnMessage(item, id) {
    let userActed = false;
    const onInteract = () => {
      userActed = true;
    };
    window.addEventListener('mousedown', onInteract, true);
    window.addEventListener('keydown', onInteract, true);
    const release = () => {
      window.removeEventListener('mousedown', onInteract, true);
      window.removeEventListener('keydown', onInteract, true);
    };
    const start = Date.now();
    const check = () => {
      if (userActed || !isCurrentOperation(id) || !item || !item.isConnected) {
        release();
        return;
      }
      if (Date.now() - start > 1500) {
        release();
        return;
      }
      const composer = D.getComposer();
      if (composer && document.activeElement === composer) {
        debugLog('composer stole focus; refocusing newest message');
        D.focusElement(item);
      }
      setTimeout(check, 150);
    };
    setTimeout(check, 150);
  }

  function focusNewestMessage() {
    const id = bumpOperation();
    const panel = D.getMessagePanel();
    if (!panel) {
      focusChatList();
      return;
    }
    D.scrollToBottom(panel);
    const tryFocus = attempt => {
      if (!isCurrentOperation(id)) return;
      const rows = D.getMessageRows(panel);
      let target = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        const item = D.getFocusableMessageItem(rows[i]);
        if (item && item !== rows[i]) {
          target = rows[i];
          break;
        }
      }
      if (!target && rows.length) target = rows[rows.length - 1];
      if (target) {
        const item = D.getFocusableMessageItem(target);
        if (D.focusElement(item || target)) {
          try {
            target.scrollIntoView({ block: 'end' });
          } catch (e) {}
          state.mode = 'chat';
          guardFocusOnMessage(item || target, id);
          return;
        }
      }
      if (attempt < 12) {
        setTimeout(() => tryFocus(attempt + 1), 100);
        return;
      }
      const composer = D.getComposer();
      if (composer) {
        D.focusElement(composer);
        state.mode = 'chat';
      } else {
        D.showToast('No messages found');
      }
    };
    tryFocus(0);
  }

  function openFocusedChat() {
    const rows = getChatRows();
    const row = getFocusedRow(rows) || getCurrentChatRow(rows);
    if (!row) {
      D.showToast('WhatsApp chat list not found');
      return;
    }
    state.lastChat = { identity: D.getChatRowIdentity(row), title: D.getChatRowTitle(row) };
    const rowTitle = state.lastChat.title;
    const previousTitle = D.getCurrentChatTitle();
    const panel = D.getMessagePanel();
    if (panel && rowTitle && previousTitle && rowTitle === previousTitle) {
      focusNewestMessage();
      return;
    }
    const activator = D.getRowActivator(row) || row;
    try {
      row.scrollIntoView({ block: 'nearest' });
    } catch (e) {}
    D.reliableClick(activator);
    const id = bumpOperation();
    waitAndFocusNewest(id, rowTitle, previousTitle, 3000, 0);
  }

  function waitAndFocusNewest(id, rowTitle, previousTitle, timeout, attempt) {
    const start = Date.now();
    const tick = () => {
      if (!isCurrentOperation(id)) return;
      const panel = D.getMessagePanel();
      const title = D.getCurrentChatTitle();
      const titleChanged = Boolean(previousTitle && title && title !== previousTitle);
      const titleMatches = Boolean(rowTitle && title && title === rowTitle);
      const firstChatOpened = Boolean(panel && !previousTitle);
      if (panel && (titleMatches || titleChanged || firstChatOpened)) {
        setTimeout(() => {
          if (isCurrentOperation(id)) focusNewestMessage();
        }, 120);
        return;
      }
      if (Date.now() - start > timeout) {
        if (panel) {
          focusNewestMessage();
          return;
        }
        if (attempt < 1) {
          const rows = getChatRows();
          const row = rowTitle ? D.findChatRowByTitle(rows, rowTitle) : null;
          if (row) {
            const activator = D.getRowActivator(row) || row;
            D.reliableClick(activator);
            waitAndFocusNewest(id, rowTitle, previousTitle, 1500, attempt + 1);
            return;
          }
        }
        D.showToast('Chat did not open');
        return;
      }
      setTimeout(tick, 60);
    };
    tick();
  }

  function moveChatRow(delta) {
    const rows = getChatRows();
    if (!rows.length) return;
    const row = getFocusedRow(rows) || getCurrentChatRow(rows);
    const idx = rows.indexOf(row);
    const next = (idx < 0 ? 0 : idx) + delta;
    if (next >= 0 && next < rows.length) {
      focusChatRow(rows[next]);
      return;
    }
    const root = D.getSideListRoot();
    const scroller = (row && D.getScrollAncestor(row)) || root;
    if (!scroller) return;
    scroller.scrollTop += delta > 0 ? 80 : -80;
    const id = bumpAdaptive();
    setTimeout(() => {
      if (id !== adaptiveToken) return;
      const rows2 = getChatRows();
      if (!rows2.length) return;
      const i2 = rows2.indexOf(row);
      const n2 = (i2 < 0 ? 0 : i2) + delta;
      if (n2 >= 0 && n2 < rows2.length) focusChatRow(rows2[n2]);
    }, 80);
  }

  function moveMessageRow(delta) {
    const rows = D.getMessageRows();
    if (!rows.length) return;
    const row = getFocusedRow(rows);
    const idx = row ? rows.indexOf(row) : -1;
    const next = (idx < 0 ? (delta > 0 ? rows.length - 1 : 0) : idx) + delta;
    if (next < 0 || next >= rows.length) return;
    const target = rows[next];
    const item = D.getFocusableMessageItem(target);
    if (D.focusElement(item || target)) {
      try {
        target.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
  }

  function findRowIndex(rows, row) {
    let i = rows.indexOf(row);
    if (i >= 0) return i;
    const identity = D.getChatRowIdentity(row);
    if (identity) {
      for (let k = 0; k < rows.length; k++) {
        if (D.getChatRowIdentity(rows[k]) === identity) return k;
      }
    }
    const title = D.getChatRowTitle(row);
    if (title) {
      for (let k = 0; k < rows.length; k++) {
        if (D.getChatRowTitle(rows[k]) === title) return k;
      }
    }
    return -1;
  }

  function messageIdentity(row) {
    if (!row) return '';
    if (row.getAttribute) {
      const id = row.getAttribute('data-id');
      if (id) return 'id:' + id;
      const inner = row.querySelector && row.querySelector('[data-id]');
      if (inner) return 'id:' + inner.getAttribute('data-id');
    }
    return 'text:' + ((row.textContent || '').trim().slice(0, 120));
  }

  function findMessageRowIndex(rows, row) {
    let i = rows.indexOf(row);
    if (i >= 0) return i;
    const identity = messageIdentity(row);
    if (identity) {
      for (let k = 0; k < rows.length; k++) {
        if (messageIdentity(rows[k]) === identity) return k;
      }
    }
    return -1;
  }

  function onKeydown(e) {
    if (e.defaultPrevented) return;
    if (e.isComposing || e.keyCode === 229) return;
    const key = e.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;

    const isCtrlOnly = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    // Plain arrows (no modifiers) drive chat-list and message navigation.
    const isPlain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (!isCtrlOnly && !isPlain) return;
    if (D.getActiveModal() || D.isMenuOpen()) return;

    // Ctrl+Left/Right are ours; plain Up/Down are only a safety net.
    if (isCtrlOnly && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    if (isPlain && key !== 'ArrowUp' && key !== 'ArrowDown') return;

    const target = e.target;
    debugLog('keydown', key, isCtrlOnly ? 'ctrl' : 'plain', 'mode', state.mode, 'target', target && target.tagName);

    if (isCtrlOnly && key === 'ArrowLeft') {
      const composer = D.getComposer();
      const isComposer = Boolean(composer && (target === composer || composer.contains(target)));
      if (D.isEditable(target) && !isComposer) return;
      const inList = D.isInChatList(target);
      const inMain = D.isInMain(target);
      if (inList && !inMain) return;
      if (e.repeat) return;
      if (inMain || state.mode === 'chat' || (!inList && D.getMessagePanel())) {
        e.preventDefault();
        e.stopImmediatePropagation();
        backToList();
      }
      return;
    }

    if (isCtrlOnly && key === 'ArrowRight') {
      const composer = D.getComposer();
      const isComposer = Boolean(composer && (target === composer || composer.contains(target)));
      // The composer counts as part of the chat: Ctrl+Right jumps to the newest
      // message from there. Other text fields (search, etc.) keep word movement.
      if (D.isEditable(target) && !isComposer) return;
      if (e.repeat) return;
      if (D.isInChatList(target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFocusedChat();
        return;
      }
      if (D.isInMain(target) || state.mode === 'chat') {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusNewestMessage();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (D.getMessagePanel()) {
        focusNewestMessage();
      } else {
        focusChatList();
      }
      return;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (!isPlain) return; // plain arrows only (Ctrl+Up/Down are left to the browser/WhatsApp)
      if (D.isEditable(target)) return;
      const delta = key === 'ArrowDown' ? 1 : -1;

      if (D.isInChatList(target)) {
        const rows = getChatRows();
        if (!rows.length) return;
        const focused = getFocusedRow(rows);
        if (!focused) {
          e.preventDefault();
          e.stopImmediatePropagation();
          focusChatRow(getCurrentChatRow(rows));
          return;
        }
        if (readFlag('customListNav')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          moveChatRow(delta);
          return;
        }
        const idx = rows.indexOf(focused);
        const nextIdx = (idx < 0 ? 0 : idx) + delta;
        if (nextIdx < 0 || nextIdx >= rows.length) return;
        const token = bumpAdaptive();
        const before = document.activeElement;
        setTimeout(() => {
          if (token !== adaptiveToken) return;
          if (document.activeElement !== before) return;
          const rows2 = getChatRows();
          const i2 = findRowIndex(rows2, focused);
          if (i2 < 0) return;
          const n2 = i2 + delta;
          if (n2 >= 0 && n2 < rows2.length) focusChatRow(rows2[n2]);
        }, 140);
        return;
      }

      if (D.isInMain(target) && !D.isEditable(target)) {
        const rows = D.getMessageRows();
        if (!rows.length) return;
        const focused = getFocusedRow(rows);
        if (!focused) return;
        if (readFlag('customMessageNav')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          moveMessageRow(delta);
          return;
        }
        const idx = rows.indexOf(focused);
        const nextIdx = (idx < 0 ? rows.length - 1 : idx) + delta;
        if (nextIdx < 0 || nextIdx >= rows.length) return;
        const token = bumpAdaptive();
        const before = document.activeElement;
        setTimeout(() => {
          if (token !== adaptiveToken) return;
          if (document.activeElement !== before) return;
          const rows2 = D.getMessageRows();
          const i2 = findMessageRowIndex(rows2, focused);
          if (i2 < 0) return;
          const n2 = i2 + delta;
          if (n2 >= 0 && n2 < rows2.length) {
            moveMessageRow(delta);
            return;
          }
          if (delta < 0) {
            const panel = D.getMessagePanel();
            const viewport = panel && D.getScrollableViewport(panel);
            if (viewport) {
              viewport.scrollTop -= 400;
              setTimeout(() => {
                if (token !== adaptiveToken) return;
                const rows3 = D.getMessageRows();
                if (rows3.length) moveMessageRow(-1);
              }, 150);
            }
          }
        }, 140);
      }
    }
  }

  function onFocusIn(e) {
    const t = e.target;
    if (D.isInChatList(t)) state.mode = 'list';
    else if (D.isInMain(t)) state.mode = 'chat';
    const marked = document.querySelector('[data-wkm-active="true"]');
    if (marked && !(t && t.nodeType === 1 && marked.contains(t))) D.clearActiveMarker();
  }

  function onClick(e) {
    const t = e.target;
    if (D.isInChatList(t)) state.mode = 'list';
    else if (D.isInMain(t)) state.mode = 'chat';
  }

  function init() {
    window.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('click', onClick, true);
    debugLog('init');
  }

  function inspect() {
    const rows = getChatRows();
    const panel = D.getMessagePanel();
    const msgRows = panel ? D.getMessageRows(panel) : [];
    const selectedRow = D.getSelectedChatRow(rows);
    const focusedRow = getFocusedRow(rows);
    return {
      mode: state.mode,
      lastChat: state.lastChat,
      listRoot: Boolean(D.getSideListRoot()),
      chatRowCount: rows.length,
      selectedChatTitle: selectedRow ? D.getChatRowTitle(selectedRow) : '',
      focusedRowTitle: focusedRow ? D.getChatRowTitle(focusedRow) : '',
      currentChatTitle: D.getCurrentChatTitle(),
      messagePanel: Boolean(panel),
      messageRowCount: msgRows.length,
      focusableMessageCount: msgRows.filter(r => D.getFocusableMessageItem(r) !== r).length,
      composer: Boolean(D.getComposer()),
      modalOpen: Boolean(D.getActiveModal()),
      menuOpen: D.isMenuOpen()
    };
  }

  window.WKM_NAV = { init, inspect, state };
})();
