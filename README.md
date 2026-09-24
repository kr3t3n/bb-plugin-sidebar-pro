# Sidebar Pro

Fork of [SawyerHood/bb-plugin-t3sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
(MIT) with the controls T3 deliberately left out:

- **Status filter** — All / Needs you / Working / Unread / Idle / Draft
- **Provider filter** — All providers, or one agent provider id
- **Label filter** — multi-select Only / Hide against
  [Labels Pro](https://github.com/kr3t3n/bb-plugin-labels-pro) (hidden when
  Labels Pro is off)
- **Sort** — Newest/oldest created, recent attention, recently updated, title A–Z / Z–A
- **Density** — Toggle between spacious (three-line cards) and compact (one-line rows)
- **Unread filter** — Click the bell to filter unread threads (click again for All); badge shows attention count
- **Archived threads** — Archive icon next to the bell swaps the sidebar list to archived threads (click again for the live inbox). Status, provider, and Labels Pro filters (e.g. Hide · automation) apply the same way. Right-click → Unarchive restores one.
- **Mark all read** — Check button next to the bell marks every attention thread read (clears blue dots and the bell badge); respects the active label filter
- **Provider limits** — Codex, Anthropic, and Cursor icons in the sidebar top row, between the sidebar toggle and the back/forward arrows. Each icon is followed by the percent still left. Anthropic shows one percent per window (session, weekly, Fable). Hover a figure for the reset time.

Desktop OS notifications and the Dock / app-icon badge live in
[Notifications Pro](https://github.com/kr3t3n/bb-plugin-notifications-pro), not here.

Preferences persist in `localStorage` (`bb-plugin-sidebar-pro:list-preference:v1`),
including selected Labels Pro label ids and only/hide mode.

### Labels Pro (optional)

**Contract:** plugin id `labels-pro`, realtime channel `labels`, methods
`listLabels` + `listThreadsByLabel` (full table in Labels Pro
[docs/rpc-contract.md](https://github.com/kr3t3n/bb-plugin-labels-pro/blob/main/docs/rpc-contract.md)).
Helpers: `src/labels-pro/`.

When Labels Pro is installed and enabled, Sidebar Pro shows the label filter
and compact chips on rows. Mark-all-read respects the active label filter.

**Graceful fallback:** Labels Pro is **not** required in `engines`. If it is
missing, disabled, or RPC returns 404/unavailable, the filter and chips stay
hidden and the inbox behaves like a plain T3-style list. Older Sidebar Pro
builds that never called Labels Pro are unchanged when Labels Pro is absent.

Also see thread-header label editing in Labels Pro itself (not this plugin).

### Notifications Pro

Pair with [Notifications Pro](https://github.com/kr3t3n/bb-plugin-notifications-pro)
for OS toasts, Dock badge, and mute-by-label. Sidebar Pro only owns the inbox
list; mute state lives in Notifications Pro settings.

## Install

Requires `bb >= 0.37` and `bbPluginSdk >= 0.4.3`. Labels Pro is optional
(`bb >= 0.40` / `bbPluginSdk >= 0.4.21` when you want label filter/chips).

```sh
bb plugin install /home/bb/plugins/bb-plugin-sidebar-pro --yes
bb plugin reload sidebar-pro
```

From bb 0.43 the sidebar stays on the built-in thread list until something
selects Sidebar Pro. On startup this plugin sets
`sidebar.threadListProvider` to `sidebar-pro/inbox` when the saved value is
still that built-in default (`thread-list/thread-list`, or the older
`__automatic__` / `__builtin__` values). A list from another plugin stays
selected.

You can also select it by hand:

```sh
bb settings ui set sidebar.threadListProvider sidebar-pro/inbox
```

The same choice is in **Settings → Appearance → Sidebar**. Stock T3 Sidebar
can stay installed.

The plugin still replaces only the scrolling list. bb keeps New thread, plugin
nav, and footer. Thread search is a Sidebar Pro control docked to the right of
New thread. Project scope, snooze/settle shelves, and parent/child header chips
behave like upstream T3.

## Manual test (with Labels + Notifications Pro)

See the shared checklist in the
[Labels Pro README](https://github.com/kr3t3n/bb-plugin-labels-pro#manual-test-checklist-pro-stack):
auto-tag → filter/hide → mark filtered read → muted notifications → header edit.
