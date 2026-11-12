(function () {
  'use strict';

  const SEL = {
    side: '#side',
    paneSide: '#pane-side',
    main: '#main',
    chatList: [
      '#side [data-testid="chat-list"]',
      '#side [aria-label="Chat list"][role="grid"]',
      '#side [role="grid"]',
      '#pane-side'
    ].join(', '),
    chatRow: '[data-testid^="list-item-"], div[role="row"], [role="listitem"]',
    cellFrame: '[data-testid="cell-frame-container"], [data-testid="message-yourself-row"]',
    cellTitle: '[data-testid="cell-frame-title"]',
    messagePanel:
      '#main [data-testid="conversation-panel-messages"], #main [data-tab="8"], #main [role="application"]',
    messageRow: 'div[role="row"]',
    messageItem: '.focusable-list-item',
    messageWrapper: '[data-testid^="conv-msg-"]',
    composer: '#main footer div[contenteditable="true"]',
    chatTitle:
      '#main header [data-testid="conversation-info-header-chat-title"], #main header [data-testid="chat-title"], #main header span[title]',
    dialog: 'dialog:modal, [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
    menu: '[role="menu"], [data-animate-dropdown]',
    scrollToBottom:
      '#main [data-testid*="scroll-to-bottom" i], #main [aria-label*="scroll to bottom" i], #main [aria-label*="ir abajo" i]'
  };

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden || el.inert || el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isEditable(el) {
    return Boolean(
      el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    );
  }

  function getSideListRoot() {
    const nodes = document.querySelectorAll(SEL.chatList);
    for (const el of nodes) {
      if (isVisible(el)) return el;
    }
    return null;
  }

  function isInChatList(el) {
    const root = getSideListRoot();
    return Boolean(root && el && el.nodeType === 1 && (root === el || root.contains(el)));
  }

  function isInMain(el) {
    const main = document.querySelector(SEL.main);
    return Boolean(main && el && el.nodeType === 1 && (main === el || main.contains(el)));
  }

  function rowY(row) {
    const transform = row.style ? row.style.transform || '' : '';
    if (transform) {
      let m = transform.match(/translateY\((-?[\d.]+)px\)/);
      if (m) return parseFloat(m[1]);
      m = transform.match(/matrix\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',');
        if (parts.length >= 6) return parseFloat(parts[5]);
      }
    }
    return row.getBoundingClientRect().top;
  }

  function sortRowsByPosition(rows) {
    return rows
      .map((row, index) => ({ row, index, y: rowY(row) }))
      .sort((a, b) => a.y - b.y || a.index - b.index)
      .map(entry => entry.row);
  }

  function getChatRows(root) {
    const listRoot = root || getSideListRoot();
    if (!listRoot) return [];
    const all = Array.from(listRoot.querySelectorAll(SEL.chatRow));
    const rows = all.filter(row => {
      if (!isVisible(row)) return false;
      const parentRow = row.parentElement ? row.parentElement.closest(SEL.chatRow) : null;
      if (parentRow && parentRow !== row && listRoot.contains(parentRow)) return false;
      return Boolean(
        row.querySelector(SEL.cellFrame) ||
          row.matches('[role="listitem"]') ||
          row.querySelector('[role="gridcell"], [role="button"], [tabindex]')
      );
    });
    return sortRowsByPosition(rows);
  }

  function getRowActivator(row) {
    if (!row) return null;
    let gridcell = row.querySelector(':scope > [role="gridcell"]');
    if (!gridcell) gridcell = row.querySelector('[role="gridcell"]');
    if (!gridcell) {
      // listitem-style rows: look for any focusable descendant
      const candidate = row.querySelector('[tabindex]');
      return candidate || row.querySelector('[role="button"], button, a[href]') || row;
    }
    const candidate =
      gridcell.querySelector(':scope > [tabindex][aria-selected]') ||
      gridcell.querySelector(':scope > [tabindex]');
    if (candidate) {
      const tag = String(candidate.localName || '').toLowerCase();
      const role = String(candidate.getAttribute('role') || '').toLowerCase();
      const nativeTags = ['a', 'button', 'input', 'select', 'textarea', 'summary'];
      const interactiveRoles = [
        'button', 'checkbox', 'combobox', 'link', 'menuitem', 'option',
        'radio', 'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'treeitem'
      ];
      if (nativeTags.includes(tag) || interactiveRoles.includes(role)) return gridcell;
      return candidate;
    }
    if (gridcell.hasAttribute('tabindex') || gridcell.getAttribute('aria-selected') === 'true') return gridcell;
    return gridcell.querySelector('[role="button"], button, a[href]') || gridcell;
  }

  function getScrollAncestor(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 4) return node;
    }
    return null;
  }

  function getChatRowTitle(row) {
    if (!row || !row.querySelector) return '';
    const titleEl = row.querySelector(SEL.cellTitle);
    if (titleEl) {
      const titled = titleEl.querySelector('[title]');
      const value = cleanText(titled ? titled.getAttribute('title') : titleEl.innerText);
      if (value) return value;
    }
    const titled = row.querySelector('[title]');
    return titled ? cleanText(titled.getAttribute('title')) : '';
  }

  function getChatRowIdentity(row) {
    if (!row || !row.getAttribute) return '';
    for (const attr of ['data-chat-id', 'data-id']) {
      const value = row.getAttribute(attr);
      if (value) return attr + ':' + value;
    }
    return '';
  }

  function findChatRowByIdentity(rows, identity) {
    if (!identity) return null;
    for (const row of rows) {
      if (getChatRowIdentity(row) === identity) return row;
    }
    return null;
  }

  function findChatRowByTitle(rows, title) {
    if (!title) return null;
    for (const row of rows) {
      if (getChatRowTitle(row) === title) return row;
    }
    return null;
  }

  function getSelectedChatRow(rows) {
    rows = rows || getChatRows();
    for (const row of rows) {
      if (row.getAttribute && row.getAttribute('aria-selected') === 'true') return row;
      const gridcell = row.querySelector('[role="gridcell"]');
      if (gridcell && gridcell.getAttribute('aria-selected') === 'true') return row;
      const activator = getRowActivator(row);
      if (activator && activator !== row && activator.getAttribute && activator.getAttribute('aria-selected') === 'true') {
        return row;
      }
    }
    return null;
  }

  function getCurrentChatTitle() {
    const nodes = document.querySelectorAll(SEL.chatTitle);
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const value = cleanText(el.getAttribute('title') || el.textContent);
      if (value) return value;
    }
    return '';
  }

  function getMessagePanel() {
    const nodes = document.querySelectorAll(SEL.messagePanel);
    for (const el of nodes) {
      if (isVisible(el)) return el;
    }
    return null;
  }

  function getScrollableViewport(panel) {
    if (!panel) return null;
    const rows = getMessageRows(panel);
    const ref = rows.length ? rows[rows.length - 1] : panel;
    for (let el = ref; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 4) return el;
    }
    return panel;
  }

  function scrollToBottom(panel) {
    const p = panel || getMessagePanel();
    if (!p) return false;
    const buttons = document.querySelectorAll(SEL.scrollToBottom);
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const clickable = btn.closest('[role="button"], button') || btn;
      if (clickable.disabled || clickable.getAttribute('aria-disabled') === 'true') continue;
      reliableClick(clickable);
      return true;
    }
    const viewport = getScrollableViewport(p);
    if (!viewport) return false;
    const style = window.getComputedStyle(viewport);
    if (style.flexDirection === 'column-reverse') {
      viewport.scrollTop = 0;
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
    return true;
  }

  function getMessageRows(panel) {
    const p = panel || getMessagePanel();
    if (!p) return [];
    let rows = Array.from(p.querySelectorAll(SEL.messageRow)).filter(isVisible);
    rows = rows.filter(row => row.querySelector(SEL.messageItem) || row.querySelector(SEL.messageWrapper));
    if (rows.length === 0) {
      rows = Array.from(p.querySelectorAll(SEL.messageItem)).filter(isVisible);
    }
    return sortRowsByPosition(rows);
  }

  function getFocusableMessageItem(row) {
    if (!row) return null;
    if (row.matches && row.matches(SEL.messageItem)) return row;
    return row.querySelector(SEL.messageItem) || row.querySelector(SEL.messageWrapper + '[tabindex]') || row;
  }

  function focusElement(el) {
    if (!el) return false;
    if (!isVisible(el)) {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try {
        el.focus();
      } catch (e2) {}
    }
    return document.activeElement === el;
  }

  function reliableClick(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const base = { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y };
    try {
      el.dispatchEvent(
        new PointerEvent('pointerdown', Object.assign({}, base, { pointerId: 1, pointerType: 'mouse', isPrimary: true }))
      );
    } catch (e) {}
    el.dispatchEvent(new MouseEvent('mousedown', Object.assign({}, base, { buttons: 1 })));
    try {
      el.dispatchEvent(
        new PointerEvent('pointerup', Object.assign({}, base, { pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }))
      );
    } catch (e) {}
    el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 1 })));
    el.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { buttons: 0 })));
    if (typeof el.click === 'function') {
      try {
        el.click();
      } catch (e) {}
    }
    return true;
  }

  function getComposer() {
    const composer = document.querySelector(SEL.composer);
    return composer && isVisible(composer) ? composer : null;
  }

  function getActiveModal() {
    const dialogs = document.querySelectorAll(SEL.dialog);
    for (let i = dialogs.length - 1; i >= 0; i--) {
      if (isVisible(dialogs[i])) return dialogs[i];
    }
    return null;
  }

  function isMenuOpen() {
    const menus = document.querySelectorAll(SEL.menu);
    for (const menu of menus) {
      if (isVisible(menu)) return true;
    }
    return false;
  }

  function markActiveRow(row) {
    if (row && row.setAttribute) row.setAttribute('data-wkm-active', 'true');
  }

  function clearActiveMarker() {
    document.querySelectorAll('[data-wkm-active="true"]').forEach(el => el.removeAttribute('data-wkm-active'));
  }

  let toastEl = null;
  let toastTimer = null;

  function showToast(message) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'wkm-toast';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = String(message || '');
      toastEl.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (toastEl) toastEl.classList.remove('show');
      }, 1800);
    } catch (e) {}
  }

  window.WKM_DOM = {
    SEL,
    cleanText,
    isVisible,
    isEditable,
    getSideListRoot,
    isInChatList,
    isInMain,
    getChatRows,
    getRowActivator,
    getScrollAncestor,
    getChatRowTitle,
    getChatRowIdentity,
    findChatRowByIdentity,
    findChatRowByTitle,
    getSelectedChatRow,
    getCurrentChatTitle,
    getMessagePanel,
    getScrollableViewport,
    scrollToBottom,
    getMessageRows,
    getFocusableMessageItem,
    focusElement,
    reliableClick,
    getComposer,
    getActiveModal,
    isMenuOpen,
    markActiveRow,
    clearActiveMarker,
    showToast
  };
})();
