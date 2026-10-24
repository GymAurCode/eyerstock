/**
 * Sidebar navigation - the rail that holds the app together.
 *
 * A floating pane of glass: inset from the window edge by a gutter on every
 * side, generously rounded, blurred, and casting a soft shadow onto the page.
 * It is the same material as the cards beside it in the light theme and in the
 * dark theme - only the values differ - so navigation reads as an object
 * resting on the page rather than as a differently coloured column of it.
 *
 * The active item is a lit glass pill that is slightly raised above its
 * neighbours; every other item is a muted label that lifts on hover. Nothing
 * here is filled with a colour.
 *
 * Module order follows the workflow a shop actually works in - see what is
 * happening, then the catalogue, then the two ledgers, then the people, then
 * the money and the settings. Nothing is hidden because it is uncommon: the
 * nav is filtered by permission, not by taste.
 */

import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Landmark,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PermissionModule } from "../../../shared/permissions";
import type { PermissionAction } from "../../../shared/permissions";
import { useApp, useTheme } from "../../lib/app-context";
import { APP_VERSION } from "../../lib/app-version";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/Avatar";
import logoUrl from "@assets/Logo.png";

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly module: PermissionModule;
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { path: "/products", label: "Products", icon: Package, module: "products" },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart, module: "purchases" },
  { path: "/sales", label: "Sales", icon: Receipt, module: "sales" },
  { path: "/suppliers", label: "Suppliers", icon: Truck, module: "parties" },
  { path: "/customers", label: "Customers", icon: Users, module: "parties" },
  { path: "/expenses", label: "Expenses", icon: Wallet, module: "finance" },
  { path: "/finance", label: "Finance", icon: Landmark, module: "finance" },
  { path: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
  { path: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

/**
 * The four modules that get a tile on the mobile dock, in the order a shop
 * moves through them. Everything else stays behind the menu button, so the
 * dock is reachable with one thumb instead of a scrolling rail.
 */
export const DOCK_PATHS: readonly string[] = ["/", "/products", "/sales", "/purchases"];

/** The nav items this user is allowed to see, in rail order. */
export function visibleNavItems(
  can: (module: PermissionModule, action: PermissionAction) => boolean,
): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => can(item.module, "view"));
}

export interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** Drawer mode for narrow windows: overlays the page and can be dismissed. */
  readonly mobileOpen?: boolean | undefined;
  readonly onMobileClose?: (() => void) | undefined;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps): React.JSX.Element {
  const { can, licenseStatus, user, signOut } = useApp();
  const { resolvedTheme } = useTheme();

  // The rail and the page behind it must not scroll apart on a narrow window.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const online = licenseStatus === null;

  return (
    <>
      {/* Scrim behind the drawer. The rail is always visible on desktop, where
          `mobileOpen` never becomes true. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-[var(--surface-overlay)] lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 shrink-0 p-[var(--sidebar-gutter)]",
          // Width is the only thing that changes on collapse, and it reads the
          // same token the page margin does, so the rail and the content beside
          // it move as one object.
          //
          // `transform` is deliberately not in this list: it belongs to the
          // mobile drawer slide, and a transition list containing both means the
          // desktop collapse and the narrow-window drawer share one duration and
          // one interrupt rule for unrelated movement.
          "transition-[width] duration-sidebar ease-sidebar lg:z-40",
          "max-lg:transition-transform max-lg:duration-normal",
          collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]",
          mobileOpen
            ? "translate-x-0 rtl:translate-x-0"
            : "max-lg:-translate-x-full rtl:max-lg:translate-x-full",
          // Named so the print stylesheet can take the rail out of the page.
          "app-sidebar",
        )}
        aria-label="Main navigation"
      >
        <div className="glass-sidebar flex h-full flex-col overflow-hidden rounded-[var(--radius-sidebar)]">
          {/* Brand.

              The mark keeps one size in both states. It used to shrink from 36px
              to 32px on collapse, which moved it while the rail was still moving.

              Its start padding is animated rather than snapped between "left
              aligned" and "centred", so the mark glides to the middle of the
              collapsed rail instead of jumping there. The target is derived from
              the rail's own width: (collapsed panel width - the 1px panel border
              - the 36px mark) / 2. */}
          <div
            className={cn(
              "flex h-[68px] shrink-0 items-center gap-2.5 pe-4",
              "transition-[padding-inline-start] duration-sidebar ease-sidebar",
              collapsed
                ? "ps-[calc((var(--sidebar-panel-width-collapsed)-2.25rem)/2-1px)]"
                : "ps-4",
            )}
          >
            <BrandMark className="h-9 w-9 shrink-0" />
            {/* Kept mounted rather than unmounted on collapse: a node that
                appears and disappears at the instant of the toggle is what reads
                as a flash. */}
            <div
              className={cn(
                "min-w-0 flex-1 overflow-hidden",
                "transition-[opacity,transform] duration-sidebar ease-sidebar",
                collapsed
                  ? "-translate-x-1.5 opacity-0 rtl:translate-x-1.5"
                  : "translate-x-0 opacity-100",
              )}
            >
              <p className="truncate text-[15px] font-semibold leading-tight text-[var(--sidebar-active-fg)]">
                EyerStock
              </p>
              <p className="truncate text-[11px] leading-tight text-[var(--sidebar-text-muted)]">
                Inventory Management
              </p>
            </div>
            {mobileOpen && !collapsed && (
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close menu"
                className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sidebar-text)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-active-fg)] lg:hidden"
              >
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Navigation.

              The nav's own horizontal padding is what centres the icons once the
              rail is collapsed, and it is animated so every item slides to its
              new place together instead of snapping on its own. The collapsed
              value is (collapsed panel width - 46px) / 2, where 46px is the
              chrome a row carries when it holds nothing but its icon: the 1px
              panel border, the 1px row border, 12px of row padding on each side,
              and the 18px icon itself. */}
          <nav
            className={cn(
              "flex-1 space-y-1 overflow-y-auto py-2",
              "transition-[padding-inline-start,padding-inline-end] duration-sidebar ease-sidebar",
              collapsed ? "px-[calc((var(--sidebar-panel-width-collapsed)-46px)/2)]" : "px-3",
            )}
            aria-label="Main"
          >
            {NAV_ITEMS.map((item) => {
              if (!can(item.module, "view")) return null;
              return <SidebarLink key={item.path} item={item} collapsed={collapsed} />;
            })}
          </nav>

          {/* Profile, status and the collapse control. */}
          <div className="shrink-0 space-y-2 p-3">
            {!collapsed && user !== null && (
              <div className="flex items-center gap-2.5 rounded-[18px] border border-[var(--glass-border)] bg-[var(--sidebar-panel)] py-2 ps-2.5 pe-1.5 shadow-[inset_0_1px_0_var(--sidebar-edge-top)]">
                <Avatar name={user.displayName} size="sm" src={user.avatarDataUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium leading-tight text-[var(--sidebar-active-fg)]">
                    {user.displayName}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-[var(--sidebar-text-muted)]">
                    {user.roleName ?? "User"}
                  </p>
                </div>
                {/* Signing out is the one thing a user does deliberately, so it
                    is a control in its own right rather than an item three menus
                    deep. The user guide has always pointed at the bottom of this
                    menu. */}
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  aria-label="Sign out"
                  title="Sign out"
                  className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--sidebar-text)] transition-colors duration-fast hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {collapsed && (
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                aria-label="Sign out"
                title="Sign out"
                className="pressable flex h-9 w-full items-center justify-center rounded-xl text-[var(--sidebar-text)] transition-colors duration-fast hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                <LogOut className="h-[17px] w-[17px]" aria-hidden="true" />
              </button>
            )}

            {!collapsed && (
              <div className="flex items-center gap-2 px-1.5">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    online ? "bg-[var(--success)]" : "bg-[var(--warning)]",
                  )}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--sidebar-text)]">
                  {online ? "System Online" : "Licence expiring"}
                </p>
                <p className="tabular shrink-0 text-[11px] text-[var(--sidebar-text-muted)]">
                  v{APP_VERSION}
                  {import.meta.env.DEV ? " · DEV" : ""}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "hidden h-9 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium",
                "text-[var(--sidebar-text)] transition-colors duration-fast lg:flex",
                "hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-active-fg)]",
                collapsed && "justify-center px-0",
              )}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            >
              {collapsed ? (
                <ChevronRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              ) : (
                <>
                  <ChevronLeft className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span>Collapse</span>
                </>
              )}
            </button>

            {/* Vendor credit.

                It lives here, in the rail's own non-scrolling footer, rather
                than in the page: the page scrolls, so a credit placed there would
                scroll out of view and would have to be repeated on every screen.

                Collapsed there is no room for two words, so the whole line
                collapses to nothing instead of wrapping or clipping mid-word. It
                stays mounted for the same reason the nav labels do, so the
                footer does not jump as the rail changes. */}
            <div
              className={cn(
                // `mx-auto` as well as `text-center`: a block with a max-width
                // is left-aligned in its parent by default, so the two lines
                // would sit 13px left of the rail's centre however their text
                // was aligned inside them.
                "mx-auto w-full overflow-hidden text-center",
                "transition-[max-width,opacity] duration-sidebar ease-sidebar",
                collapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100",
              )}
              aria-hidden={collapsed}
            >
              <p className="text-[10.5px] leading-tight text-[var(--sidebar-text-muted)]">
                Powered by
              </p>
              <p className="text-[11.5px] font-semibold leading-tight text-[var(--sidebar-text)]">
                Eyercall
              </p>
            </div>
          </div>
        </div>

        <span className="sr-only">{resolvedTheme}</span>
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  collapsed,
}: {
  readonly item: NavItem;
  readonly collapsed: boolean;
}): React.JSX.Element {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "pressable relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium",
          // The row's own box does not change shape on collapse: only the label
          // inside it shrinks. Animating the row's padding or alignment instead
          // would move the icon at the instant of the toggle, which is the jump
          // this is here to prevent.
          "transition-[background-color,box-shadow,border-color,transform] duration-normal",
          isActive
            ? "border border-[var(--sidebar-border)] bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)] " +
                "shadow-[inset_0_1px_0_var(--glass-edge-top),var(--sidebar-active-shadow)]"
            : "border border-transparent text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-active-fg)]",
        )
      }
      title={collapsed ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          {/* In the collapsed rail the label is gone, so a lit edge is the only
              thing left that can answer "where am I". Expanded, the raised pill
              already says it. */}
          {isActive && collapsed && (
            <span
              className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-[var(--sidebar-active-indicator)]"
              aria-hidden="true"
            />
          )}
          <Icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              isActive ? "text-[var(--sidebar-active-indicator)]" : "",
            )}
            aria-hidden="true"
          />
          {/* Always mounted. `truncate` keeps it on one line, and shrinking it
              to zero width - rather than unmounting it - is what keeps the row
              from flashing on every toggle. The text stays in the accessibility
              tree either way, which is why the collapsed rail can rely on the
              tooltip alone. */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              "transition-[opacity,transform] duration-sidebar ease-sidebar",
              collapsed
                ? "-translate-x-1 opacity-0 rtl:translate-x-1"
                : "translate-x-0 opacity-100",
            )}
          >
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

/**
 * The application logo mark.
 */
export function BrandMark({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <span
      className={cn("flex h-8 w-8 shrink-0 items-center justify-center", className)}
      aria-hidden="true"
    >
      <img src={logoUrl} alt="" className="h-full w-full object-contain" />
    </span>
  );
}
