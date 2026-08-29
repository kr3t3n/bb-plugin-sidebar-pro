# Sidebar Pro

Fork of [SawyerHood/bb-plugin-t3sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
(MIT) with the controls T3 deliberately left out:

- **Status filter** — All / Needs you / Working / Unread / Idle / Draft
- **Provider filter** — All providers, or one agent provider id
- **Label filter** — All labels, or one [Labels Pro](../bb-plugin-labels-pro) label (hidden when Labels Pro is off)
- **Sort** — Newest/oldest created, recent attention, recently updated, title A–Z / Z–A
- **Density** — Toggle between spacious (three-line cards) and compact (one-line rows)
- **Unread filter** — Click the bell to filter unread threads (click again for All); badge shows attention count
- **Mark all read** — Check button next to the bell marks every attention thread read (clears blue dots and the bell badge)

Desktop OS notifications and the Dock / app-icon badge live in
[Notifications Pro](../bb-plugin-notifications-pro), not here.

Preferences persist in `localStorage` (`bb-plugin-sidebar-pro:list-preference:v1`),
including the selected label id.

### Labels Pro

When [Labels Pro](../bb-plugin-labels-pro) is installed and enabled, Sidebar Pro
calls its RPC (`listLabels`, `listAssignments`) and shows a label filter in the
list controls. If Labels Pro is missing or disabled, the filter is hidden and
the list is unchanged. The temporary consumer contract lives in
`src/labels-pro/contract.ts` until Labels Pro publishes `docs/rpc-contract.md`.

Install from a local path:

```sh
bb plugin install /Users/georgiyescom/Developer/bb-plugin-sidebar-pro --yes
```

Turn it on in **Settings → Appearance → Sidebar**. Stock T3 Sidebar can stay
installed; pick **Sidebar Pro** when you want the extra controls.

The plugin still replaces only the scrolling list. bb keeps New thread, search,
plugin nav, and footer. Project scope, snooze/settle shelves, and parent/child
header chips behave like upstream T3.
