/**
 * Root component: routing, auth gating and the global error boundary.
 *
 * Four gates, in order:
 *  0. no preload bridge -> recovery screen: the window is not inside the
 *     Electron shell, so no API call can ever work;
 *  1. not ready yet -> splash, so no screen renders before settings are known;
 *  2. setup not complete -> setup wizard;
 *  3. not signed in -> login.
 *
 * After that the shell takes over and every route is permission-checked, so a
 * Staff account cannot reach a screen it has no rights to - the main process
 * re-checks every request as well.
 */

import { Component, useMemo } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { PermissionModule } from "../shared/permissions";
import { AppProvider, useApp } from "./lib/app-context";
import { UpdateProvider } from "./lib/updates";
import { AppShell } from "./components/layout/AppShell";
import { UpdateNotifier } from "./components/updates/UpdateNotifier";
import { Button } from "./components/ui/Button";
import { Spinner, TooltipProvider } from "./components/ui/Feedback";
import { bridge } from "./lib/api";
import { BrandMark } from "./components/layout/Sidebar";
import { LoginPage, SetupPage } from "./pages/auth/LoginPage";
import { ActivatePage } from "./pages/auth/ActivatePage";
import { DashboardPage } from "./pages/Dashboard";
import { SalesListPage } from "./pages/sales/SalesListPage";
import { DocumentListPage } from "./pages/sales/DocumentListPage";
import { ProductsPage } from "./pages/inventory/ProductsPage";
import { PartiesPage } from "./pages/parties/PartiesPage";
import { ExpensesPage } from "./pages/finance/ExpensesPage";
import { FinanceOverviewPage } from "./pages/finance/FinanceOverviewPage";
import { ChartOfAccountsPage } from "./pages/finance/ChartOfAccountsPage";
import { AccountLedgerPage } from "./pages/finance/AccountLedgerPage";
import { JournalEntriesPage } from "./pages/finance/JournalEntriesPage";
import { FinancePaymentsPage } from "./pages/finance/FinancePaymentsPage";
import { PayablesPage, ReceivablesPage } from "./pages/finance/PartyBalancesPage";
import { CashAndBankPage } from "./pages/finance/CashAndBankPage";
import { FinancialReportsPage } from "./pages/finance/FinancialReportsPage";
import { FinanceSettingsPage } from "./pages/finance/FinanceSettingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/admin/SettingsPage";

/* -------------------------------------------------------------------------- */
/* error boundary                                                             */
/* -------------------------------------------------------------------------- */

interface BoundaryState {
  readonly error: Error | null;
}

/**
 * Catches render-time failures in the renderer.
 *
 * A blank white window tells a shopkeeper nothing; this shows what went wrong
 * and offers a reload.
 */
class ErrorBoundary extends Component<{ readonly children: ReactNode }, BoundaryState> {
  public override state: BoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The bridge can be missing when the main process failed to start, and
    // that is exactly the case where the boundary is the first thing to run.
    // Asking for it unguarded would replace the real error with "cannot read
    // property of undefined" and hide the cause.
    try {
      bridge()
        .exportDiagnostics()
        .then(() => {
          // Diagnostics written; the shopkeeper can attach the file.
        })
        .catch(() => {
          // Diagnostics are best-effort.
        });
    } catch {
      // No bridge: there is nothing to export to.
    }

    window.console.error("Renderer error", error, info.componentStack);
  }

  public override render(): ReactNode {
    const { error } = this.state;

    if (error === null) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center bg-page px-6">
        <div className="card max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Your data has not been changed. A diagnostics file was written to your Desktop — send it
            with your support request.
          </p>

          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-sunken p-3 text-start text-xs text-ink-secondary">
            {error.message}
          </pre>

          <Button
            variant="primary"
            className="mt-4 w-full"
            iconLeft={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              window.location.reload();
            }}
          >
            Restart the screen
          </Button>
        </div>
      </div>
    );
  }
}

/* -------------------------------------------------------------------------- */
/* guards                                                                     */
/* -------------------------------------------------------------------------- */

function Splash(): React.JSX.Element {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-page">
      <BrandMark className="h-12 w-12" />
      <Spinner />
    </div>
  );
}

/**
 * Recovery screen for a missing preload bridge.
 *
 * `window.api` is injected by the preload script, so it is absent exactly when
 * the window is not running inside the Electron shell - the page was opened in
 * a browser, or the main process died before the window was built. Without
 * this gate every screen would fail the same way, each reporting the useless
 * "Cannot read properties of undefined (reading 'invoke')" with no hint at the
 * actual cause.
 */
function BridgeUnavailable(): React.JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center bg-page px-6">
      <div className="card max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="text-lg font-semibold text-ink">EyerStock did not start correctly</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          This window is not connected to the application&apos;s main process, so nothing can be
          loaded or saved. Your files are safe — no data was changed.
        </p>

        <ul className="mt-4 space-y-2 text-start text-sm text-ink-secondary">
          <li>
            • Close this window and start EyerStock again from its desktop or Start menu shortcut.
          </li>
          <li>• Open the app itself, not a web browser — it cannot run from a browser.</li>
          <li>
            • If it keeps happening, send the log file from the app&apos;s data folder to your
            supplier.
          </li>
        </ul>

        <Button
          variant="primary"
          className="mt-5 w-full"
          iconLeft={<RotateCcw className="h-4 w-4" />}
          onClick={() => {
            window.location.reload();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * Route guard: a screen the role may not open shows why, rather than a
 * redirect that leaves the user wondering what the menu item did.
 */
function Guard({
  module,
  children,
}: {
  readonly module: PermissionModule;
  readonly children: ReactNode;
}): React.JSX.Element {
  const { can } = useApp();

  if (!can(module, "view")) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warning" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">You do not have access to this screen.</p>
        <p className="mt-1 text-sm text-ink-secondary">Ask an administrator to change your role.</p>
      </div>
    );
  }

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */
/* routes                                                                     */
/* -------------------------------------------------------------------------- */

function AppRoutes(): React.JSX.Element {
  const { ready, bridgeMissing, licenseChecking, licenseRequired, setupRequired, user } = useApp();

  if (bridgeMissing) return <BridgeUnavailable />;
  if (!ready) return <Splash />;
  if (licenseChecking) return <Splash />;
  if (licenseRequired) return <ActivatePage />;
  if (setupRequired) return <SetupPage />;
  if (user === null) return <LoginPage />;

  // If setup is complete but user is null, show login (not setup)
  // This is the normal path after setup completion

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />

        {/* sales */}
        <Route
          path="sales"
          element={
            <Guard module="sales">
              <SalesListPage />
            </Guard>
          }
        />

        {/* purchases */}
        <Route
          path="purchases"
          element={
            <Guard module="purchases">
              <DocumentListPage kind="purchaseInvoice" />
            </Guard>
          }
        />

        {/* products */}
        <Route
          path="products"
          element={
            <Guard module="products">
              <ProductsPage />
            </Guard>
          }
        />

        {/* parties */}
        <Route
          path="customers"
          element={
            <Guard module="parties">
              <PartiesPage kind="customer" />
            </Guard>
          }
        />
        <Route
          path="suppliers"
          element={
            <Guard module="parties">
              <PartiesPage kind="supplier" />
            </Guard>
          }
        />

        {/* expenses */}
        <Route
          path="expenses"
          element={
            <Guard module="finance">
              <ExpensesPage />
            </Guard>
          }
        />

        {/* finance: one sidebar entry, ten screens behind it */}
        <Route
          path="finance"
          element={
            <Guard module="finance">
              <FinanceOverviewPage />
            </Guard>
          }
        />
        <Route
          path="finance/chart"
          element={
            <Guard module="finance">
              <ChartOfAccountsPage />
            </Guard>
          }
        />
        <Route
          path="finance/ledger"
          element={
            <Guard module="finance">
              <AccountLedgerPage />
            </Guard>
          }
        />
        <Route
          path="finance/journal"
          element={
            <Guard module="finance">
              <JournalEntriesPage />
            </Guard>
          }
        />
        <Route
          path="finance/payments"
          element={
            <Guard module="finance">
              <FinancePaymentsPage />
            </Guard>
          }
        />
        <Route
          path="finance/receivables"
          element={
            <Guard module="finance">
              <ReceivablesPage />
            </Guard>
          }
        />
        <Route
          path="finance/payables"
          element={
            <Guard module="finance">
              <PayablesPage />
            </Guard>
          }
        />
        <Route
          path="finance/cash"
          element={
            <Guard module="finance">
              <CashAndBankPage />
            </Guard>
          }
        />
        <Route
          path="finance/reports"
          element={
            <Guard module="finance">
              <FinancialReportsPage />
            </Guard>
          }
        />
        <Route
          path="finance/settings"
          element={
            <Guard module="finance">
              <FinanceSettingsPage />
            </Guard>
          }
        />

        {/* reports */}
        <Route
          path="reports"
          element={
            <Guard module="reports">
              <ReportsPage />
            </Guard>
          }
        />

        {/* profile - no Guard: every signed-in user has one, staff included */}
        <Route path="profile" element={<ProfilePage />} />

        {/* settings */}
        <Route
          path="settings"
          element={
            <Guard module="settings">
              <SettingsPage />
            </Guard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App(): React.JSX.Element {
  const content = useMemo(
    () => (
      <ErrorBoundary>
        {/* Radix tooltips are mounted at the app root rather than per screen:
            a screen that forgot to add one would silently render dead help
            text. */}
        <TooltipProvider>
          <AppProvider>
            {/*
              The update provider wraps the whole app, not the shell: the
              check runs in the main process and the notification has to be
              able to appear on the login screen too, because that is where
              the application often sits when it is left switched on.
            */}
            <UpdateProvider>
              <AppRoutes />
              <UpdateNotifier />
            </UpdateProvider>
          </AppProvider>
        </TooltipProvider>
      </ErrorBoundary>
    ),
    [],
  );

  return (
    <>
      {/*
        HashRouter, not BrowserRouter: a packaged build is loaded from disk over
        file://, where there is no web server to rewrite paths. BrowserRouter
        reads the document's own path as the route, so every screen resolved to
        `/C:/.../index.html`, matched no route, and the shell rendered with an
        empty <main>. It looked fine in development, where the dev server makes
        the URL look like a normal site.
      */}
      <HashRouter>{content}</HashRouter>
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ duration: 6000 }} />
    </>
  );
}
