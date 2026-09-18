// bb-plugin-sidebar-pro — fork of SawyerHood/bb-plugin-t3sidebar with filters,
// sorting, and a compact/spacious density toggle.
//
// Base idea (from T3): the list does not thrash on activity. Status lives in
// each card. Sidebar Pro adds controls so you can still filter, re-sort, and
// densify when you want to.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadInbox } from "./src/ThreadInbox";
import { ParentChip } from "./src/ParentChip";
import { SubagentsChip } from "./src/SubagentsChip";
import { mountSearchSlot } from "./src/search-slot";
import { mountUsageSlot } from "./src/usage-slot";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "new-thread-search-slot",
    mount({ signal }) {
      mountSearchSlot(signal);
    },
  });

  app.contentScripts.register({
    id: "provider-limit-slot",
    mount({ signal, pluginId }) {
      mountUsageSlot(signal, pluginId);
    },
  });

  app.slots.experimental_threadList({
    id: "inbox",
    title: "Sidebar Pro",
    description:
      "Inbox cards with filters, sorting, and compact/spacious density.",
    component: ThreadInbox,
  });

  // Registered first, so it renders on the left of the children chip: the
  // header then reads up (parent) then down (children).
  app.slots.experimental_threadHeaderAction({
    id: "parent",
    title: "Parent thread",
    component: ParentChip,
  });

  app.slots.experimental_threadHeaderAction({
    id: "children",
    title: "Child threads",
    component: SubagentsChip,
  });
});
