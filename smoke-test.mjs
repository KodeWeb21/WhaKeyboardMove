// Minimal smoke test: loads the three content scripts in a jsdom window that
// fakes a WhatsApp-like chat list + conversation panel and checks the basics.
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = `<!doctype html><html><body>
  <div id="app">
    <div id="side">
      <div role="grid" aria-label="Chat list" data-testid="chat-list">
        <div role="row" data-testid="list-item-0" aria-selected="true">
          <div role="gridcell" tabindex="0" aria-selected="true">
            <div data-testid="cell-frame-container">
              <div data-testid="cell-frame-title"><span title="Alice">Alice</span></div>
            </div>
          </div>
        </div>
        <div role="row" data-testid="list-item-1">
          <div role="gridcell" tabindex="0">
            <div data-testid="cell-frame-container">
              <div data-testid="cell-frame-title"><span title="Bob">Bob</span></div>
            </div>
          </div>
        </div>
        <div role="row" data-testid="list-item-2">
          <div role="gridcell" tabindex="0">
            <div data-testid="cell-frame-container">
              <div data-testid="cell-frame-title"><span title="Team">Team</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="main">
      <header><span data-testid="conversation-info-header-chat-title" title="Alice">Alice</span></header>
      <div data-testid="conversation-panel-messages">
        <div role="row"><div class="focusable-list-item" tabindex="0" data-id="m1">hello</div></div>
        <div role="row"><div class="focusable-list-item" tabindex="0" data-id="m2">world</div></div>
      </div>
      <footer><div contenteditable="true" role="textbox"></div></footer>
    </div>
  </div>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://web.whatsapp.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

// jsdom reports all rects as 0 -> make everything "visible"
window.Element.prototype.getBoundingClientRect = function () {
  return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, x: 0, y: 0 };
};
window.HTMLElement.prototype.scrollIntoView = function () {};

const ctx = dom.getInternalVMContext();
const load = f => vm.runInContext(readFileSync(new URL(`./extension/src/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
load('dom.js');
load('navigation.js');
load('content.js');

const results = [];
const check = (name, cond) => {
  results.push([name, Boolean(cond)]);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
};

const D = window.WKM_DOM;
const N = window.WKM_NAV;

check('WKM_DOM exported', D);
check('WKM_NAV exported', N);
check('side list root found', D.getSideListRoot());
check('chat rows = 3', D.getChatRows().length === 3);
check('row titles', D.getChatRows().map(D.getChatRowTitle).join(',') === 'Alice,Bob,Team');
check('selected row is Alice', D.getChatRowTitle(D.getSelectedChatRow()) === 'Alice');
check('message rows = 2', D.getMessageRows().length === 2);
check('focusable message item', D.getFocusableMessageItem(D.getMessageRows()[1]).getAttribute('data-id') === 'm2');
check('composer found', D.getComposer());
check('isEditable on composer', D.isEditable(D.getComposer()));
check('isInChatList(row)', D.isInChatList(window.document.querySelector('[data-testid="list-item-1"]')));
check('isInMain(panel)', D.isInMain(window.document.querySelector('[data-testid="conversation-panel-messages"]')));
check('current chat title', D.getCurrentChatTitle() === 'Alice');
check('no modal', !D.getActiveModal());
check('no menu', !D.isMenuOpen());

// focus first row and move down via the adaptive path (native nav won't move in jsdom)
const row0 = D.getChatRows()[0];
D.focusElement(D.getRowActivator(row0));
check('focus row activator', window.document.activeElement === D.getRowActivator(row0));

// Ctrl+Right: open focused chat (same title as open chat -> focusNewestMessage path)
const ev = new window.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
window.document.activeElement.dispatchEvent(ev);
await new Promise(r => setTimeout(r, 400));
check('Ctrl+Right focused newest message', window.document.activeElement.getAttribute('data-id') === 'm2');

// WhatsApp-style focus steal: put focus back in the composer right after the
// extension focused the newest message. The guard must re-assert the message.
const composer = D.getComposer();
composer.focus();
await new Promise(r => setTimeout(r, 300));
check('guard refocuses message after composer steal', window.document.activeElement.getAttribute('data-id') === 'm2');

// Ctrl+Right from the composer: previously ignored (editable guard), must now
// jump to the newest message.
composer.focus();
const evC = new window.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
composer.dispatchEvent(evC);
await new Promise(r => setTimeout(r, 300));
check('Ctrl+Right from composer jumps to newest message', window.document.activeElement.getAttribute('data-id') === 'm2');

// Ctrl+Left: back to list
const ev2 = new window.KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true, cancelable: true });
window.document.activeElement.dispatchEvent(ev2);
check('Ctrl+Left back to list row', window.document.activeElement === D.getRowActivator(D.getSelectedChatRow()));

// plain ArrowDown adaptive fallback (native doesn't move focus in jsdom)
const ev3 = new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
window.document.activeElement.dispatchEvent(ev3);
await new Promise(r => setTimeout(r, 250));
const titles = D.getChatRows().map(D.getChatRowTitle);
const focusedTitle = titles.find(t => {
  const row = D.findChatRowByTitle(D.getChatRows(), t);
  return row && row.contains(window.document.activeElement);
});
check('plain ArrowDown moved to Bob', focusedTitle === 'Bob');

// inspect works
const info = N.inspect();
check('inspect mode list', info.mode === 'list');

const fails = results.filter(r => !r[1]).length;
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
