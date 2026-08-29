import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { t3sidebarRpcContract } from "./server";
import type { ThreadLinkOrigins } from "./thread-link";

const DEFAULT_ORIGINS: ThreadLinkOrigins = {
  localOrigin: "http://127.0.0.1:38886",
  cloudOrigin: null,
};

type LinkOriginsApi = ThreadLinkOrigins & {
  /** Fresh fetch — use on copy so a cold/failed prefetch cannot grey out cloud. */
  refresh: () => Promise<ThreadLinkOrigins>;
};

const LinkOriginsContext = createContext<LinkOriginsApi>({
  ...DEFAULT_ORIGINS,
  refresh: async () => DEFAULT_ORIGINS,
});

/**
 * Prefetch local + Connect origins while the inbox is mounted so the row
 * menus do not open against a null cloud origin.
 */
export function LinkOriginsProvider({ children }: { children: ReactNode }) {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [origins, setOrigins] = useState<ThreadLinkOrigins>(DEFAULT_ORIGINS);
  const originsRef = useRef(origins);
  originsRef.current = origins;

  const refresh = useCallback(async () => {
    try {
      const result = await rpc.call("linkOrigins", {});
      const next = {
        localOrigin: result.localOrigin,
        cloudOrigin: result.cloudOrigin,
      };
      setOrigins(next);
      return next;
    } catch {
      return originsRef.current;
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<LinkOriginsApi>(
    () => ({ ...origins, refresh }),
    [origins, refresh],
  );

  return (
    <LinkOriginsContext.Provider value={value}>
      {children}
    </LinkOriginsContext.Provider>
  );
}

export function useLinkOrigins(): LinkOriginsApi {
  return useContext(LinkOriginsContext);
}
