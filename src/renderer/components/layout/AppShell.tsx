/**
 * App shell: sidebar + header + routed content.
 *
 * Owns the global keyboard shortcuts, because they have to work from anywhere
 * and belong to no particular screen, and the one piece of responsive state the
 * rail needs: below `lg` the sidebar becomes an overlay drawer opened from the
 * header rather than a column that squeezes the page, and a glass dock along
 * the bottom edge carries the modules that are used most.
 *
 * The rail floats: it is inset from the window edge by `--sidebar-gutter` on
 * every side, so the page shows past it. The header floats too, and it is
 * rendered *inside* the scroll container rather than beside it - that is what
 * makes it sticky, and what puts the real page content behind the glass.
 *
 * Nothing here blurs the page content. The header, the menus, the dialogs and
 * the dock are the only surfaces that pay for `backdrop-filter`, because they
 * are the only ones with moving content behind them; a panel in the page layout
 * is translucent over a smooth field, so a blur there would cost a backdrop
 * readback per panel and change nothing.
 */

import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { useApp } from "../../lib/app-context";
import { cn } from "../../lib/utils";

/** Page title per route prefix, announced by the top bar for screen readers. */
const TITLES: readonly { readonly match: string; readonly title: string }[] = [
  { match: "/sales", title: "Sales" },
  { match: "/purchases", title: "Purchases" },
  { match: "/products", title: "Products" },
  { match: "/customers", title: "Customers" },
  { match: "/suppliers", title: "Suppliers" },
  { match: "/expenses", title: "Expenses" },
  { match: "/reports", title: "Reports" },
  { match: "/profile", title: "Profile" },
  { match: "/settings", title: "Settings" },
];

function titleForPath(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = TITLES.find((entry) => pathname.startsWith(entry.match));
  return match?.title ?? "EyerStock";
}

/** Below this width the sidebar stops reserving space and becomes a drawer. */
const DRAWER_BREAKPOINT = 1024;

export function AppShell(): React.JSX.Element {
  const { can } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < DRAWER_BREAKPOINT,
  );

  // One listener for the whole app: the rail is a column on a wide window and a
  // drawer on a narrow one, and switching has to survive a resize or a rotate.
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${String(DRAWER_BREAKPOINT - 1)}px)`);

    const apply = (matches: boolean): void => {
      setIsNarrow(matches);
      if (!matches) setDrawerOpen(false);
    };

    const onChange = (event: MediaQueryListEvent | MediaQueryList): void => {
      apply(event.matches);
    };

    apply(media.matches);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  // A route change must dismiss the drawer, or the page it opened is hidden
  // behind the menu that was used to get there.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;

      const key = event.key.toLowerCase();

      // Ctrl+N / Ctrl+P open the sale / purchase dialog on the relevant list.
      // The dialogs are owned by the list pages, so navigate there and let the
      // page open its own dialog via a custom event.
      if (key === "n" && can("sales", "create")) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("eyerstock:new-sale"));
        if (location.pathname !== "/sales") {
          void navigate("/sales");
        }
        return;
      }

      if (key === "p" && can("purchases", "create")) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("eyerstock:new-purchase"));
        if (location.pathname !== "/purchases") {
          void navigate("/purchases");
        }
        return;
      }

      if (key === "s") {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [can, navigate, location.pathname]);

  const toggleSidebar = useCallback((): void => {
    setSidebarCollapsed((previous) => !previous);
  }, []);

  const toggleDrawer = useCallback((): void => {
    setDrawerOpen((previous) => !previous);
  }, []);

  return (
    // `overflow-clip` rather than `overflow-hidden`: both clip, but only the
    // latter also makes this element a scroll container, and a scroll container
    // anywhere above a sticky element becomes the box that sticky positions
    // against - which would stop the header sticking to the page.
    <div className="flex w-full overflow-clip app-shell">
      {isNarrow ? (
        <Sidebar
          collapsed={false}
          onToggle={toggleSidebar}
          mobileOpen={drawerOpen}
          onMobileClose={() => {
            setDrawerOpen(false);
          }}
        />
      ) : (
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          id="main-content"
          className={cn(
            "app-main flex-1 overflow-y-auto",
            // Room for the dock, so the last row of a table is never trapped
            // underneath it on a phone.
            isNarrow && "pb-[calc(var(--bottomnav-height)+1.5rem)]",
          )}
          style={
            isNarrow
              ? undefined
              : {
                  marginInlineStart: sidebarCollapsed
                    ? "var(--sidebar-width-collapsed)"
                    : "var(--sidebar-width)",
                  // The same tokens the rail uses, so the page edge and the rail
                  // edge arrive together. Two independently timed transitions on
                  // the same seam is what produces a visible drag between them.
                  transition: "margin-inline-start var(--dur-sidebar) var(--ease-sidebar)",
                }
          }
        >
          {/*
           * The header lives inside the scroll container, not beside it, so
           * that `sticky` has the page itself as its constraint and the content
           * passing under it is real content for the blur to pick up. It shares
           * the content column's width and padding, so the search field and the
           * cards below it line up on one edge.
           */}
          <div className="sticky top-0 z-30 mx-auto w-full max-w-[1440px] px-4 pb-2 pt-4 sm:px-6 lg:px-7 app-topbar">
            <Topbar
              title={titleForPath(location.pathname)}
              onOpenNav={isNarrow ? toggleDrawer : undefined}
            />
          </div>

          <div className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-7">
            <Outlet />
          </div>
        </main>
      </div>

      {isNarrow && <BottomNav onOpenMenu={toggleDrawer} />}
    </div>
  );
}
