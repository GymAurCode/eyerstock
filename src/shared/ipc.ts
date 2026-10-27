/**
 * IPC contract shared by the main process and the renderer.
 *
 * Every channel is a typed request/response pair. The renderer never touches
 * the database or Node APIs directly; it calls these, and the main process
 * validates every payload before acting on it.
 */

import type { ThemeId } from "./themes";

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly electronVersion: string;
  readonly chromeVersion: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly schemaVersion: number;
  readonly locale: string;
  readonly isPackaged: boolean;
}

export interface MigrationStatus {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly { readonly version: number; readonly name: string }[];
  readonly safetyBackupPath: string | null;
}

export interface BackupSummary {
  readonly lastRunAtIso: string | null;
  readonly destination: string | null;
  readonly keepCount: number;
  readonly fileCount: number;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  /** Present for validation failures so the UI can highlight the field. */
  readonly field?: string | undefined;
}

/**
 * Where an update check has got to.
 *
 * One word per state, so the renderer never has to infer what is happening
 * from a combination of flags, and so the same word can be shown, logged and
 * asserted on.
 */
export type UpdateState =
  /** Nothing has been asked for yet. */
  | "idle"
  /** Asking the release server. */
  | "checking"
  /** A newer version exists. */
  | "available"
  /** This build is the newest one. */
  | "upToDate"
  /** The installer is on its way. */
  | "downloading"
  /** The installer is here, waiting to be installed. */
  | "downloaded"
  /** The check or the download failed. */
  | "error";

/**
 * The state of the updater, as the renderer sees it.
 *
 * The updater lives in the main process - it is the only place that may write
 * to the install directory - so this is a copy of its state, pushed across the
 * bridge whenever it changes.
 */
export interface UpdateStatus {
  /**
   * False when this build cannot check for updates at all.
   *
   * A development build has no release manifest to read and no release to
   * compare itself against, so the updater is unavailable rather than broken.
   */
  readonly supported: boolean;
  readonly state: UpdateState;
  readonly currentVersion: string;
  /** The version on offer, once one has been found. */
  readonly latestVersion: string | null;
  /** How much of the download has arrived, 0-100. Null unless downloading. */
  readonly progressPercent: number | null;
  /** Why it failed, in words the reader can act on. */
  readonly message: string | null;
  /** The release page, so the notes can be read before installing. */
  readonly releaseUrl: string | null;
  /** When the last check finished. */
  readonly checkedAtIso: string | null;
}

export type ApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiError };

/** Channel names. Kept in one place so main and preload cannot drift apart. */
export const IPC = {
  appInfo: "app:info",
  dbMigrateStatus: "db:migrateStatus",
  backupRunNow: "backup:runNow",
  backupChooseFolder: "backup:chooseFolder",
  backupList: "backup:list",
  backupVerify: "backup:verify",
  backupRestore: "backup:restore",
  diagnosticsExport: "diagnostics:export",
  /**
   * Single validated entry point for every domain operation.
   *
   * A per-method channel would mean one registration and one preload function
   * per method. One channel with a method name and a Zod-validated payload
   * gives the same safety with one registration point.
   */
  rpc: "api:invoke",
  /**
   * Native file/folder picker.
   *
   * The renderer has no filesystem access, so any "choose a file" affordance -
   * the company logo, a backup to restore, where an export goes - has to come
   * through the main process. One channel with an explicit allow-list of
   * purpose values is used instead of a generic path field, so the renderer
   * cannot ask main to reveal an arbitrary location on disk.
   */
  pickFile: "dialog:pickFile",
  pickImage: "dialog:pickImage",
  printDocument: "print:document",
  savePdf: "print:savePdf",
  openExternal: "shell:openExternal",
  /**
   * Application updates.
   *
   * Three requests and one push. The requests are what the user asked for -
   * check, download, install - and the push is the updater's own state
   * changing on its own, so a download that finishes in the background reaches
   * the screen that is waiting for it.
   */
  updateCheck: "update:check",
  updateDownload: "update:download",
  updateInstall: "update:install",
  /**
   * The updater's state as it is right now.
   *
   * Separate from the check, because a screen that opens after a background
   * check has already finished needs the answer, not another request to the
   * release server.
   */
  updateCurrent: "update:current",
  /** Main to renderer: the update state changed. */
  updateStatus: "update:status",
} as const;

/** What the picker is being used for. Main maps each to its own file filters. */
export type FilePickPurpose = "restoreBackup" | "exportDestination" | "companyLogo";

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export interface BackupFileInfo {
  readonly path: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly modifiedAtIso: string;
}

export interface RestoreVerificationInfo {
  readonly ok: boolean;
  readonly message: string;
  readonly schemaVersion: number;
}

export interface RpcRequest {
  readonly method: string;
  readonly payload: unknown;
  /** CSRF-style nonce: main rejects requests that do not come from this app. */
  readonly token: string;
}

/* ------------------------------------------------------------------------- */
/* RPC method map                                                            */
/* ------------------------------------------------------------------------- */

import type * as T from "./types";

/**
 * Method map: method name -> request/response types.
 *
 * `Api.invoke` is generic over this map, so calling a method with the wrong
 * payload shape is a compile error in the renderer.
 */
export interface RpcMethods {
  /* session */
  "auth.setupStatus": { request: Record<string, never>; response: SetupStatus };
  "auth.setup": { request: T.SetupRequest; response: SetupStatus };
  "auth.login": { request: T.LoginRequest; response: T.LoginResponse };
  "auth.logout": { request: Record<string, never>; response: { readonly ok: true } };
  "auth.currentUser": { request: Record<string, never>; response: T.SessionUser | null };
  "auth.changePassword": {
    request: { readonly currentPassword: string; readonly newPassword: string };
    response: { readonly ok: true };
  };

  /**
   * Anonymous recovery for a forgotten password.
   *
   * There is no session yet; the main process checks the EyerCall recovery code
   * and then applies the normal password policy. Recovery codes never cross the
   * bridge in either direction.
   */
  "auth.recoverPassword": {
    request: T.RecoverPasswordRequest;
    response: { readonly ok: true };
  };
  "auth.saveDevSession": { request: Record<string, never>; response: { readonly ok: true } };
  "auth.loadDevSession": { request: Record<string, never>; response: T.SessionUser | null };
  "auth.clearDevSession": { request: Record<string, never>; response: { readonly ok: true } };

  /*
   * Registration management from the login screen.
   *
   * These are anonymous in the IPC sense because there is no session yet; each
   * one that reads or writes registration details verifies an existing
   * administrator password in the main process and re-checks the licence and
   * device binding. No method accepts or returns a machine id.
   */
  "registration.status": { request: Record<string, never>; response: T.RegistrationStatus };
  "registration.details": {
    request: T.RegistrationAuthorisation;
    response: T.RegistrationDetails;
  };
  "registration.update": {
    request: T.RegistrationUpdateRequest;
    response: T.RegistrationDetails;
  };
  "registration.createAccount": {
    request: T.RegistrationCreateAccountRequest;
    response: T.UserDto;
  };

  /* own profile - always the signed-in user, never an id from the renderer */
  "profile.get": { request: Record<string, never>; response: T.ProfileDto };
  "profile.update": { request: T.UpdateProfileRequest; response: T.ProfileDto };
  /** Shows the picture picker and stores the chosen file. Returns its name. */
  "profile.chooseAvatar": { request: Record<string, never>; response: { readonly name: string } };

  /* license */
  "license.check": { request: Record<string, never>; response: LicenseCheckResponse };
  "license.activate": { request: { readonly key: string }; response: LicenseActivateResponse };
  "license.status": { request: Record<string, never>; response: LicenseStatusResponse };

  /* dashboard */
  "dashboard.summary": {
    request: {
      readonly fromDate?: string;
      readonly toDate?: string;
      readonly previousFromDate?: string;
      readonly previousToDate?: string;
      readonly includeInventory?: boolean;
    };
    response: T.DashboardDto;
  };

  /* reports */
  "reports.profitAndLoss": {
    request: { readonly fromDate: string; readonly toDate: string };
    response: T.ProfitAndLossDto;
  };
  "reports.partnerSplit": {
    request: { readonly fromDate: string; readonly toDate: string };
    response: T.PartnerSplitDto;
  };
  "reports.stockValuation": {
    request: Record<string, never>;
    response: { readonly rows: T.StockValuationRow[] };
  };
  /**
   * The invoice register behind the sales and purchase reports.
   *
   * A report needs the money on every invoice, not the invoices themselves:
   * the full document carries its lines, and reading those for every invoice
   * in a year turns one query per row into thousands of them.
   */
  "reports.documentRegister": {
    request: T.DocumentRegisterRequest;
    response: readonly T.DocumentRegisterRow[];
  };
  "reports.export": {
    request: {
      readonly dataset: "profitAndLoss" | "partnerSplit" | "sales" | "stock";
      readonly fromDate?: string | undefined;
      readonly toDate?: string | undefined;
    };
    response: { readonly path: string };
  };

  /* parties */
  "parties.list": { request: T.PartyListRequest; response: T.PartyDto[] };
  "parties.get": { request: { readonly id: number }; response: T.PartyDto };
  "parties.save": {
    request: {
      readonly id?: number | undefined;
      readonly name: string;
      readonly kind: "customer" | "supplier" | "both";
      readonly phone?: string | null | undefined;
      readonly email?: string | null | undefined;
      readonly trn?: string | null | undefined;
      readonly addressLine?: string | null | undefined;
      readonly isActive?: boolean | undefined;
    };
    response: T.PartyDto;
  };
  /**
   * Remove a customer or supplier.
   *
   * Refused when the record has invoices or payments against it: those must
   * keep pointing at a real party. The error explains how to deactivate the
   * record instead.
   */
  "parties.delete": { request: { readonly id: number }; response: { readonly ok: true } };

  /* products */
  "products.list": { request: T.ProductListRequest; response: T.ProductDto[] };
  "products.get": { request: { readonly id: number }; response: T.ProductDto };
  "products.save": {
    request: {
      readonly id?: number | undefined;
      readonly sku?: string | undefined;
      readonly barcode?: string | null | undefined;
      readonly name: string;
      readonly description?: string | null | undefined;
      readonly category?: string | null | undefined;
      readonly unit?: string | undefined;
      readonly reorderLevelMilli?: number | undefined;
      readonly salePriceFils?: number | undefined;
      readonly vatTreatment?: T.VatTreatment | undefined;
      readonly isActive?: boolean | undefined;
      /** Opening stock quantity in milli-units. Creates an "opening" movement. */
      readonly openingQuantityMilli?: number | undefined;
    };
    response: T.ProductDto;
  };
  "products.openStock": {
    request: {
      readonly productId: number;
      readonly quantityMilli: number;
      readonly unitCostFils: number;
      readonly notes?: string | undefined;
    };
    response: T.ProductDto;
  };
  "products.movements": { request: T.StockMovementRequest; response: T.StockMovementDto[] };
  /**
   * Remove a product.
   *
   * Refused when the item has stock history or invoice lines behind it: those
   * must keep pointing at a real item. The error explains how to deactivate it
   * instead.
   */
  "products.delete": { request: { readonly id: number }; response: { readonly ok: true } };

  /* documents: invoices and purchases only */
  "documents.list": { request: T.DocumentListRequest; response: T.DocumentDto[] };
  "documents.get": { request: { readonly id: number }; response: T.DocumentDto };
  "documents.save": {
    request: T.SaveDocumentRequest & { readonly discountFils?: number | undefined };
    response: T.DocumentDto;
  };
  "documents.cancel": {
    request: { readonly id: number; readonly reason: string };
    response: T.DocumentDto;
  };
  "documents.delete": { request: { readonly id: number }; response: { readonly ok: true } };
  "documents.numberPreview": {
    request: { readonly kind: "invoice" | "purchaseInvoice" };
    response: { readonly number: string };
  };

  /* payments: the paid amount on a document, or a later receive-payment */
  "payments.list": { request: T.PaymentListRequest; response: T.PaymentDto[] };
  "payments.save": { request: T.SavePaymentRequest; response: T.PaymentDto };
  "payments.delete": { request: { readonly id: number }; response: { readonly ok: true } };

  /* expenses */
  "expenses.list": { request: T.ExpenseListRequest; response: T.ExpenseDto[] };
  "expenses.save": { request: T.SaveExpenseRequest; response: T.ExpenseDto };
  "expenses.delete": { request: { readonly id: number }; response: { readonly ok: true } };

  /* partners */
  "partners.list": { request: Record<string, never>; response: T.PartnerDto[] };
  "partners.save": {
    request: {
      readonly id?: number;
      readonly name: string;
      readonly sharePercent: number;
      readonly isActive?: boolean;
    };
    response: T.PartnerDto;
  };
  "partners.transactions": {
    request: { readonly limit?: number };
    response: T.PartnerTransactionDto[];
  };

  /* users: two fixed roles, no role editor */
  "users.list": { request: Record<string, never>; response: T.UserDto[] };
  "users.save": { request: T.SaveUserRequest; response: T.UserDto };
  "users.resetPassword": {
    request: {
      readonly id: number;
      readonly newPassword: string;
      readonly mustChangePassword?: boolean;
    };
    response: T.UserDto;
  };

  /* settings */
  "settings.get": { request: Record<string, never>; response: AppSettingsSnapshot };
  "settings.update": { request: Partial<AppSettingsSnapshot>; response: AppSettingsSnapshot };

  /* ---------------------------------------------------------------- finance -- */

  /** The finance dashboard: balances, period figures, series and reconciliations. */
  "finance.overview": {
    request: {
      readonly fromDate: string;
      readonly toDate: string;
      readonly asOfDate: string;
      readonly previousFromDate: string;
      readonly previousToDate: string;
      readonly granularity?: "day" | "week" | "month" | "quarter" | "year" | undefined;
    };
    response: T.FinanceOverviewDto;
  };

  /* chart of accounts */
  "finance.chart": { request: Record<string, never>; response: T.AccountDto[] };
  "finance.chart.save": { request: T.SaveAccountRequest; response: T.AccountDto };
  "finance.chart.setActive": {
    request: { readonly id: number; readonly isActive: boolean };
    response: T.AccountDto;
  };
  "finance.chart.delete": { request: { readonly id: number }; response: { readonly ok: true } };
  "finance.chart.export": { request: Record<string, never>; response: { readonly path: string } };

  /* ledger and journal */
  "finance.generalLedger": {
    request: { readonly code: string; readonly fromDate: string; readonly toDate: string };
    response: T.GeneralLedgerDto;
  };
  "finance.journal.list": {
    request: {
      readonly fromDate?: string | undefined;
      readonly toDate?: string | undefined;
      readonly source?: T.JournalSource | undefined;
      readonly status?: T.JournalStatus | undefined;
      readonly search?: string | undefined;
      readonly accountCode?: string | undefined;
      readonly limit?: number | undefined;
    };
    response: T.JournalEntryRowDto[];
  };
  "finance.journal.get": { request: { readonly id: number }; response: T.JournalEntryDetailDto };
  "finance.journal.save": { request: T.SaveJournalEntryRequest; response: T.JournalEntryDetailDto };
  "finance.journal.post": { request: { readonly id: number }; response: T.JournalEntryDetailDto };
  "finance.journal.reverse": {
    request: { readonly id: number; readonly reason: string };
    response: T.JournalEntryDetailDto;
  };
  "finance.journal.deleteDraft": {
    request: { readonly id: number };
    response: { readonly ok: true };
  };

  /* reports */
  "finance.trialBalance": {
    request: { readonly fromDate: string; readonly toDate: string };
    response: T.TrialBalanceDto;
  };
  "finance.balanceSheet": { request: { readonly asOfDate: string }; response: T.BalanceSheetDto };
  "finance.profitAndLoss": {
    request: { readonly fromDate: string; readonly toDate: string };
    response: T.ProfitLossDto;
  };
  "finance.cashFlow": {
    request: { readonly fromDate: string; readonly toDate: string };
    response: T.CashFlowDto;
  };
  "finance.aging": {
    request: { readonly asOfDate: string; readonly side: "receivable" | "payable" };
    response: T.AgingDto;
  };
  "finance.partyStatement": {
    request: {
      readonly partyId: number;
      readonly kind: T.PartyLedgerKind;
      readonly fromDate: string;
      readonly toDate: string;
    };
    response: T.PartyStatementDto;
  };
  "finance.partyBalances": {
    request: { readonly kind: T.PartyLedgerKind; readonly asOfDate: string };
    response: T.PartyBalanceDto[];
  };
  "finance.cashBook": {
    request: { readonly accountCode: string; readonly fromDate: string; readonly toDate: string };
    response: T.CashBookDto;
  };
  "finance.periodComparison": {
    request: {
      readonly fromDate: string;
      readonly toDate: string;
      readonly previousFromDate: string;
      readonly previousToDate: string;
    };
    response: T.PeriodComparisonDto;
  };
  "finance.export": {
    request: {
      readonly dataset: T.ExportDataset;
      readonly fromDate?: string | undefined;
      readonly toDate?: string | undefined;
      readonly accountCode?: string | undefined;
      readonly partyId?: number | undefined;
      readonly partyKind?: T.PartyLedgerKind | undefined;
    };
    response: { readonly path: string };
  };

  /* money in / money out */
  "finance.transfer": {
    request: {
      readonly transferDate: string;
      readonly fromAccountCode: string;
      readonly toAccountCode: string;
      readonly amountFils: number;
      readonly reference?: string | null | undefined;
    };
    response: { readonly ok: true };
  };
  "finance.recordPayment": {
    request: {
      readonly direction: "inbound" | "outbound";
      readonly partyId: number;
      readonly paymentDate: string;
      readonly method: T.PaymentMethod;
      readonly amountFils: number;
      readonly reference?: string | null | undefined;
      readonly notes?: string | null | undefined;
      readonly allocations?: readonly {
        readonly documentId: number;
        readonly amountFils: number;
      }[];
      /** What the money settles when it is not an invoice payment. */
      readonly postingKind?: T.PaymentPostingKind | undefined;
      /** Which cash or bank ledger the money lands in. */
      readonly cashAccountCode?: string | undefined;
      /** The account an expense-type payment is charged to. */
      readonly expenseAccountCode?: string | undefined;
    };
    response: T.PaymentDto;
  };

  /* settings and periods */
  "finance.periods.list": { request: Record<string, never>; response: T.AccountingPeriodDto[] };
  "finance.periods.save": {
    request: T.SaveAccountingPeriodRequest;
    response: T.AccountingPeriodDto;
  };
  "finance.periods.close": { request: { readonly id: number }; response: T.AccountingPeriodDto };
  "finance.periods.reopen": { request: { readonly id: number }; response: T.AccountingPeriodDto };
  "finance.openingBalances": {
    request: T.OpeningBalanceRequest;
    response: { readonly ok: true };
  };
  "finance.migrationAudit": { request: Record<string, never>; response: T.MigrationAuditDto };
  "finance.backfill": {
    request: { readonly confirm: boolean };
    response: { readonly posted: number; readonly skipped: number };
  };
}

export interface SetupStatus {
  readonly isComplete: boolean;
  readonly companyName: string;
  readonly machineId: string;
  readonly appVersion: string;
}

export interface LicenseCheckResponse {
  readonly ok: boolean;
  readonly machineId: string;
  readonly clientName: string;
  readonly expiresAt: string | null;
  readonly daysUntilExpiry: number | null;
  readonly isExpiringSoon: boolean;
}

export interface LicenseActivateResponse {
  readonly ok: boolean;
  readonly machineId: string;
  readonly clientName: string;
  readonly expiresAt: string | null;
  readonly daysUntilExpiry: number | null;
  readonly isExpiringSoon: boolean;
}

export interface LicenseStatusResponse {
  readonly clientName: string;
  readonly expiresAt: string | null;
  readonly daysUntilExpiry: number | null;
  readonly isExpiringSoon: boolean;
  readonly machineId: string;
}

/**
 * The one currency the application supports.
 *
 * EyerStock trades in Pakistani Rupees only. The amounts are stored as plain
 * integers with no currency attached, so there is nothing to convert: the
 * figures a shop recorded are the figures it recorded.
 */
export type Currency = "PKR";

/**
 * The theme the user picked.
 *
 * `system` defers to the OS appearance and is resolved in the renderer; the
 * main process only ever stores the preference, never the resolved value.
 */
export type ThemePreference = "light" | "dark" | "system";

export interface AppSettingsSnapshot {
  readonly theme: ThemePreference;
  /**
   * The colour pack, independent of the light/dark preference above.
   *
   * The two are separate choices: `theme` says how bright the screen is and
   * `themePalette` says which family of colours it uses. Keeping them apart is
   * what lets a shop run "Midnight Navy in dark" without the stored value
   * having to enumerate thirty combinations.
   */
  readonly themePalette: ThemeId;
  /**
   * Whether the first-login theme chooser has been completed.
   *
   * The flag is installation-wide because the palette itself is: there is one
   * theme stored for the whole database, not one per account. A fresh install
   * starts at `false` and the chooser marks it `true` once the user picks a
   * theme or chooses to keep the current one.
   */
  readonly themeOnboardingComplete: boolean;
  readonly companyName: string;
  readonly companyTrn: string;
  readonly companyAddress: string;
  readonly companyPhone: string;
  readonly companyEmail: string;
  readonly companyLogoPath: string;
  /**
   * The logo inlined as a `data:` URL, or null.
   *
   * Derived from `companyLogoPath` on every settings read and never persisted:
   * printed documents render in a sandboxed window with no filesystem access,
   * so the bytes have to travel with them. Callers treat it as read-only.
   */
  readonly companyLogoDataUrl: string | null;
  readonly invoiceFooter: string;
  readonly invoiceTerms: string;
  /** The organisation that built this software, shown on printed documents. */
  readonly vendorName: string;
  readonly fiscalYearStartMonth: number;
  /**
   * The currency every amount in the application is in.
   *
   * It is always PKR. The value is still reported so a report can name the
   * currency it was produced in.
   */
  readonly currency: Currency;
  readonly backupDirectory: string;
  readonly backupKeepCount: number;
  readonly dailyBackupEnabled: boolean;
  readonly dailyBackupHour: number;
  /** Share of net profit set aside as a donation before the partner split. */
  readonly donationRatePercent: number;
  /** VAT rate in percent applied to standard-rated lines. Defaults to 5. */
  readonly vatRatePercent: number;
  /** When true, a sale may take stock below zero. Defaults to false. */
  readonly allowNegativeStock: boolean;
}

export type RpcMethod = keyof RpcMethods;
export type RpcRequestOf<M extends RpcMethod> = RpcMethods[M]["request"];
export type RpcResponseOf<M extends RpcMethod> = RpcMethods[M]["response"];

/** The surface exposed on `window.api` by the preload script. */
export interface MinhaApi {
  getAppInfo(): Promise<ApiResult<AppInfo>>;
  getMigrationStatus(): Promise<ApiResult<MigrationStatus>>;
  runBackupNow(): Promise<ApiResult<BackupSummary>>;
  chooseBackupFolder(): Promise<ApiResult<BackupSummary>>;
  listBackups(): Promise<ApiResult<readonly BackupFileInfo[]>>;
  verifyBackup(path: string): Promise<ApiResult<RestoreVerificationInfo>>;
  restoreBackup(path: string, confirmation: string): Promise<ApiResult<MigrationStatus>>;
  exportDiagnostics(): Promise<ApiResult<string>>;
  /** Opens a native picker. Resolves to `null` when the user cancels. */
  pickFile(purpose: FilePickPurpose): Promise<ApiResult<string | null>>;
  pickImage(purpose: FilePickPurpose): Promise<ApiResult<string | null>>;
  invoke<M extends RpcMethod>(
    method: M,
    payload: RpcRequestOf<M>,
  ): Promise<ApiResult<RpcResponseOf<M>>>;
  printHtml(html: string, options: PrintOptions): Promise<ApiResult<string>>;
  saveHtmlAsPdf(
    html: string,
    suggestedName: string,
    options?: PdfOptions,
  ): Promise<ApiResult<string>>;
  openExternal(url: string): Promise<ApiResult<{ readonly opened: boolean }>>;

  /* updates */

  /** The updater's state as it is right now, without asking the server. */
  currentUpdate(): Promise<ApiResult<UpdateStatus>>;
  /** Ask the release server whether a newer version exists. */
  checkForUpdate(): Promise<ApiResult<UpdateStatus>>;
  /** Download the installer for the version that was found. */
  downloadUpdate(): Promise<ApiResult<UpdateStatus>>;
  /** Close the app and install the downloaded update. */
  installUpdate(): Promise<ApiResult<UpdateStatus>>;
  /**
   * Listen for update state changes.
   *
   * Returns a function that stops listening, so a screen that unmounts does
   * not leave a listener behind holding the renderer alive.
   */
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
}

export interface PrintOptions {
  readonly silent: boolean;
  readonly paperSize: "A4" | "A5" | "Letter";
  readonly landscape: boolean;
  readonly copies: number;
  /**
   * The document's name, shown beside the page number.
   *
   * Chromium has no CSS page counter, so the running title and the page number
   * come from Chromium's own page footer.
   */
  readonly footerLabel?: string | undefined;
}

/**
 * Options for the PDF export.
 *
 * Chromium has no CSS page counter, so the page number on an exported PDF
 * comes from its own footer template. `footerLabel` is the document's name,
 * shown beside it.
 */
export interface PdfOptions {
  readonly footerLabel?: string | undefined;
}
