# WhatsApp Keyboard Navigator

A Microsoft Edge (Chromium) extension that lets you move around **WhatsApp Web** using only the keyboard.

## Install (Load unpacked)

1. Open `edge://extensions` in Microsoft Edge.
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked**.
4. Select the `extension` folder inside this project.
5. Open or reload [web.whatsapp.com](https://web.whatsapp.com) and log in.

## Keys

| Key | Where | What it does |
| --- | --- | --- |
| `Ctrl + Right` | Chat list | Opens the highlighted chat/group/channel and focuses the newest message |
| `Ctrl + Right` | Message area | Jumps focus to the newest message |
| `Ctrl + Right` | Message box (composer) | Jumps focus to the newest message (leaves the composer) |
| `Ctrl + Left` | Message area | Returns to the chat list with the same chat highlighted |
| `Ctrl + Left` | Message box (composer) | Returns to the chat list with the same chat highlighted |
| `Arrow Up` / `Arrow Down` | Chat list | Moves between chats (WhatsApp's native selection) |
| `Arrow Up` / `Arrow Down` | Messages | Moves between messages (WhatsApp's native navigation) |

Notes:

- `Alt + Left` / `Alt + Right` were intentionally avoided because Edge reserves them for Back/Forward. Those browser shortcuts keep working.
- Inside the WhatsApp **message box**, `Ctrl + Left` leaves the chat and `Ctrl + Right` jumps to the newest message, so word movement is not available there. Inside the chat **search box** or other text fields, `Ctrl + Left/Right` are not intercepted, so normal word movement keeps working.
- When a chat opens, WhatsApp Web moves focus into the message box. The extension detects this and re-asserts focus on the newest message for a short moment. If you click or type in the message box on purpose, it immediately steps aside.

## How it works

- The extension only runs as a content script on `web.whatsapp.com`. No background service worker, no `tabs` permission, no network access, nothing is stored or sent anywhere.
- `Ctrl + Right` clicks the focused/selected chat row, waits for the conversation panel to load, scrolls to the bottom, and puts focus on the newest message.
- `Ctrl + Left` finds the row WhatsApp marks as selected (`aria-selected="true"`) or the remembered chat, focuses it, and scrolls it into view.
- Arrow navigation inside the list and the messages is WhatsApp's own behavior. The extension only sets the initial focus. As a safety net, if a keypress does not move focus within ~140 ms while an adjacent row exists, the extension moves focus itself.
- Chat lists and message lists are virtualized; everything is re-read from the DOM at the moment of each keypress, so no stale references are kept.

## Troubleshooting

If something stops working after a WhatsApp Web update:

1. Open the browser console (F12) on WhatsApp Web.
2. Enable debug logging (works from any console context):
   ```js
   localStorage.setItem('wkm_debug', '1')
   ```
3. Reload the page so the flag applies from startup, then reproduce the problem and watch for `[WKM]` logs.
4. For a detailed state dump, run the diagnostic from the console with the **context dropdown** (top-left of the console, next to the filter box) set to the extension's context instead of `top`:
   ```js
   __WKM_INSPECT()
   ```
   It reports the detected list root, chat row count, selected chat title, message row count, focusable message count, and the current mode (`list` / `chat`).

Manual overrides (rarely needed — the extension already self-detects when WhatsApp's native arrow navigation does not move focus):

```js
localStorage.setItem('wkm_customListNav', '1')    // always move chat selection manually
localStorage.setItem('wkm_customMessageNav', '1') // always move message focus manually
localStorage.removeItem('wkm_customListNav')      // turn an override off again
```

## Known limitations

- WhatsApp changes its DOM periodically; the selectors live in `extension/src/dom.js` and include fallbacks, but they may need maintenance over time.
- Channels and Communities are supported on a best-effort basis; their side lists differ slightly from the regular chat list.
- If a modal dialog or context menu is open, the extension stays out of the way.
