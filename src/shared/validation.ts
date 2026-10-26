/**
 * Zod validation schemas for every IPC payload.
 *
 * The renderer is treated as untrusted: it can be driven by a bug, a scanner,
 * or a crafted request. Every value crossing the bridge is parsed here before
 * any SQL runs, so a malformed payload produces a typed `ApiError` naming the
 * field rather than a SQLite constraint error.
 */

import { z } from "zod";
import { THEME_IDS } from "./themes";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That date does not exist.");

const nullableText = (max: number) => z.string().max(max).nullable().optional();

const quantityMilli = z
  .number()
  .int("Quantities are stored in thousandths: 1 unit = 1000.")
  .min(-1_000_000_000)
  .max(1_000_000_000);

const id = z.number().int().positive();

const documentKind = z.enum(["invoice", "purchaseInvoice", "stockAdjustment"]);

const vatTreatment = z.enum(["standard", "zero", "exempt", "outsideScope"]);

const partyKind = z.enum(["customer", "supplier", "both"]);

const limit = z.number().int().min(1).max(5000).optional();

/* -------------------------------------------------------------------------- */
/* auth                                                                       */
/* -------------------------------------------------------------------------- */

export const setupStatusSchema = z.object({});

export const setupSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  companyTrn: z.string().trim().max(32).default(""),
  companyAddress: z.string().trim().max(240).default(""),
  companyPhone: z.string().trim().max(40).default(""),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  adminUsername: z.string().trim().min(3).max(60),
  adminDisplayName: z.string().trim().min(1).max(120),
  adminPassword: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const profileGetSchema = z.object({});

/**
 * The signed-in user's own details.
 *
 * `avatarPath` is a bare file name, not a path: the main process checks it
 * against the names the avatar store generates, so a crafted value cannot reach
 * a file outside the avatars folder. Leaving it out means "keep the stored
 * picture"; passing "" means "go back to initials".
 */
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Enter a valid email address.",
    }),
  phone: z.string().trim().max(40),
  avatarPath: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || /^\d+\.(png|jpe?g|webp)$/i.test(value), {
      message: "That profile picture could not be used.",
    })
    .optional(),
});

export const hasPermissionSchema = z.object({
  module: z.string().min(1).max(40),
  action: z.string().min(1).max(20),
});

export const licenseCheckSchema = z.object({});

export const licenseActivateSchema = z.object({
  key: z.string().min(1).max(4096),
});

export const licenseStatusSchema = z.object({});

/* -------------------------------------------------------------------------- */
/* parties                                                                    */
/* -------------------------------------------------------------------------- */

export const partyListSchema = z.object({
  kind: partyKind.optional(),
  onlyActive: z.boolean().optional(),
  search: z.string().max(120).optional(),
  limit,
});

export const partyGetSchema = z.object({ id });
export const partyDeleteSchema = z.object({ id });

export const partySaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  kind: partyKind,
  phone: nullableText(40),
  email: nullableText(160),
  trn: nullableText(32),
  addressLine: nullableText(240),
  isActive: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* products                                                                   */
/* -------------------------------------------------------------------------- */

export const productListSchema = z.object({
  search: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  onlyActive: z.boolean().optional(),
  onlyLowStock: z.boolean().optional(),
  limit,
});

export const productGetSchema = z.object({ id });
export const productDeleteSchema = z.object({ id });

export const productSaveSchema = z.object({
  id: id.optional(),
  sku: z.string().trim().max(40).optional(),
  barcode: nullableText(60),
  name: z.string().trim().min(1).max(200),
  description: nullableText(500),
  category: nullableText(60),
  unit: z.string().trim().max(20).optional(),
  reorderLevelMilli: quantityMilli.default(0),
  salePriceFils: z.number().int().min(0).max(1_000_000_000).default(0),
  vatTreatment: vatTreatment.optional(),
  isActive: z.boolean().optional(),
  openingQuantityMilli: quantityMilli.default(0),
});

export const openStockSchema = z.object({
  productId: id,
  quantityMilli,
  unitCostFils: z.number().int().min(0).max(1_000_000_000),
  notes: z.string().max(240).optional(),
});

export const stockMovementListSchema = z.object({
  productId: id.optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  kind: z.enum(["receipt", "issue", "reversal", "adjustmentIn", "adjustmentOut"]).optional(),
  limit,
});

/* -------------------------------------------------------------------------- */
/* documents                                                                  */
/* -------------------------------------------------------------------------- */

export const documentListSchema = z.object({
  kind: documentKind.optional(),
  partyId: id.optional(),
  status: z.enum(["draft", "issued", "partPaid", "paid", "cancelled"]).optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  search: z.string().max(120).optional(),
  limit,
});

export const documentGetSchema = z.object({ id });

export const documentSaveSchema = z.object({
  id: id.optional(),
  kind: documentKind,
  partyId: id.nullable(),
  issueDate: isoDate,
  dueDate: isoDate.nullable().optional(),
  status: z.enum(["draft", "issued"]),
  notes: nullableText(1000),
  paidAmountFils: z.number().int().min(0).max(1_000_000_000).default(0),
  discountFils: z.number().int().min(0).max(1_000_000_000).default(0),
  lines: z
    .array(
      z.object({
        productId: id.nullable(),
        description: z.string().trim().min(1).max(240),
        quantityMilli,
        unitPriceFils: z.number().int().min(0).max(1_000_000_000),
        vatTreatment: vatTreatment.default("standard"),
        unitCostFils: z.number().int().min(0).max(1_000_000_000).optional(),
      }),
    )
    .min(1, "A document needs at least one line."),
});

export const documentCancelSchema = z.object({
  id,
  reason: z.string().trim().min(1).max(240),
});

export const documentDeleteSchema = z.object({ id });

export const numberPreviewSchema = z.object({
  kind: z.enum(["invoice", "purchaseInvoice"]),
});

/* -------------------------------------------------------------------------- */
/* payments                                                                   */
/* -------------------------------------------------------------------------- */

export const paymentListSchema = z.object({
  direction: z.enum(["inbound", "outbound"]).optional(),
  partyId: id.optional(),
  documentId: id.optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  limit,
});

export const paymentSaveSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  partyId: id,
  paymentDate: isoDate,
  method: z.enum(["cash", "bank", "card"]).default("cash"),
  amountFils: z.number().int().positive().max(1_000_000_000),
  reference: nullableText(120),
  notes: nullableText(500),
  allocations: z
    .array(z.object({ documentId: id, amountFils: z.number().int().positive() }))
    .optional(),
});

export const paymentDeleteSchema = z.object({ id });

/* -------------------------------------------------------------------------- */
/* expenses                                                                   */
/* -------------------------------------------------------------------------- */

export const expenseListSchema = z.object({
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  category: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
  limit,
});

export const expenseSaveSchema = z.object({
  id: id.optional(),
  expenseDate: isoDate,
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(240),
  amountFils: z.number().int().positive().max(1_000_000_000),
  vatFils: z.number().int().min(0).max(1_000_000_000).default(0),
  paymentMethod: z.enum(["cash", "bank", "card"]).default("cash"),
  reference: nullableText(120),
  notes: nullableText(500),
  /** The Chart of Accounts account to charge the expense to. */
  accountCode: z.string().trim().max(20).nullable().optional(),
  /** How much was paid now. The rest is a liability until it is settled. */
  paidFils: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const expenseDeleteSchema = z.object({ id });

/* -------------------------------------------------------------------------- */
/* partners                                                                   */
/* -------------------------------------------------------------------------- */

export const partnerListSchema = z.object({});

export const partnerTransactionsSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
});

export const partnerSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  sharePercent: z.number().min(0).max(100),
  isActive: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* users                                                                      */
/* -------------------------------------------------------------------------- */

export const userListSchema = z.object({});

export const userSaveSchema = z.object({
  id: id.optional(),
  username: z.string().trim().min(3).max(60),
  displayName: z.string().trim().min(1).max(120),
  roleId: id.nullable(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  mustChangePassword: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  id,
  newPassword: z.string().min(8).max(200),
  mustChangePassword: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* settings                                                                   */
/* -------------------------------------------------------------------------- */

export const settingsGetSchema = z.object({});

export const settingsUpdateSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]).optional(),
    /**
     * The colour pack, validated against the shipped catalogue.
     *
     * This schema is `.strict()`, so a field it does not list is rejected
     * outright. That is deliberate: an unknown pack is a client bug, and
     * silently storing it would leave the window on whatever colours the
     * stylesheet fell back to.
     */
    themePalette: z.enum(THEME_IDS).optional(),
    companyName: z.string().trim().max(120).optional(),
    companyTrn: z.string().trim().max(32).optional(),
    companyAddress: z.string().trim().max(240).optional(),
    companyPhone: z.string().trim().max(40).optional(),
    companyEmail: z.string().trim().max(160).optional(),
    companyLogoPath: z.string().trim().max(1024).optional(),
    invoiceFooter: z.string().trim().max(500).optional(),
    vendorName: z.string().trim().max(80).optional(),
    invoiceTerms: z.string().trim().max(800).optional(),
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    /**
     * The application trades in Pakistani Rupees only. The field is still
     * accepted so a client that sends it is not rejected outright, but only
     * "PKR" passes: any other currency is a mistake, and silently keeping the
     * old one would hide it.
     */
    currency: z.literal("PKR").optional(),
    backupDirectory: z.string().trim().max(1024).optional(),
    backupKeepCount: z.number().int().min(1).max(3650).optional(),
    dailyBackupEnabled: z.boolean().optional(),
    dailyBackupHour: z.number().int().min(0).max(23).optional(),
    donationRatePercent: z.number().min(0).max(50).optional(),
    vatRatePercent: z.number().min(0).max(100).optional(),
    allowNegativeStock: z.boolean().optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* reports and dashboard                                                      */
/* -------------------------------------------------------------------------- */

export const dashboardSchema = z.object({
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  previousFromDate: isoDate.optional(),
  previousToDate: isoDate.optional(),
  includeInventory: z.boolean().optional(),
});

export const pnlSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const partnerSplitSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const stockValuationSchema = z.object({});

export const documentRegisterSchema = z.object({
  kind: z.enum(["invoice", "purchaseInvoice"]),
  fromDate: isoDate,
  toDate: isoDate,
  status: z.enum(["draft", "issued", "partPaid", "paid", "cancelled"]).optional(),
  partyId: z.number().int().positive().optional(),
  search: z.string().max(120).optional(),
});

export const exportSchema = z.object({
  dataset: z.enum(["profitAndLoss", "partnerSplit", "sales", "stock"]),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
});

/* -------------------------------------------------------------------------- */
/* finance                                                                     */
/* -------------------------------------------------------------------------- */

const accountType = z.enum(["asset", "liability", "equity", "income", "expense"]);

const accountSubtype = z.enum([
  "currentAsset",
  "fixedAsset",
  "contraAsset",
  "currentLiability",
  "longTermLiability",
  "equity",
  "operatingIncome",
  "otherIncome",
  "cogs",
  "operatingExpense",
  "otherExpense",
]);



export const financeOverviewSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  asOfDate: isoDate,
  previousFromDate: isoDate,
  previousToDate: isoDate,
  granularity: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
});

export const financeChartSchema = z.object({});

export const financeAccountSaveSchema = z.object({
  id: id.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  type: accountType,
  subtype: accountSubtype.nullable().optional(),
  parentId: id.nullable().optional(),
  normalBalance: z.enum(["debit", "credit"]).optional(),
  description: nullableText(500),
  isActive: z.boolean().optional(),
});

export const financeAccountIdSchema = z.object({ id });

export const financeAccountActiveSchema = z.object({ id, isActive: z.boolean() });

export const financeGeneralLedgerSchema = z.object({
  code: z.string().trim().min(1).max(20),
  fromDate: isoDate,
  toDate: isoDate,
});

export const financeJournalListSchema = z.object({
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  source: z
    .enum([
      "purchase",
      "sale",
      "payment",
      "expense",
      "manual",
      "transfer",
      "opening",
      "reversal",
      "adjustment",
    ])
    .optional(),
  status: z.enum(["draft", "posted", "reversed"]).optional(),
  search: z.string().max(120).optional(),
  accountCode: z.string().max(20).optional(),
  limit,
});

export const financeJournalGetSchema = z.object({ id });

export const financeJournalSaveSchema = z.object({
  id: id.optional(),
  entryDate: isoDate,
  description: z.string().trim().min(1).max(500),
  reference: nullableText(120),
  postNow: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string().trim().min(1).max(20),
        debitFils: z.number().int().min(0).max(1_000_000_000_000),
        creditFils: z.number().int().min(0).max(1_000_000_000_000),
        description: nullableText(240),
      }),
    )
    .min(2, "A journal entry needs at least two lines."),
});

export const financeJournalReverseSchema = z.object({
  id,
  reason: z.string().trim().min(1).max(240),
});

export const financeTrialBalanceSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const financeBalanceSheetSchema = z.object({ asOfDate: isoDate });

export const financePnlSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const financeCashFlowSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const financeAgingSchema = z.object({
  asOfDate: isoDate,
  side: z.enum(["receivable", "payable"]),
});

export const financePartyStatementSchema = z.object({
  partyId: id,
  kind: z.enum(["customer", "supplier"]),
  fromDate: isoDate,
  toDate: isoDate,
});

export const financePartyBalancesSchema = z.object({
  kind: z.enum(["customer", "supplier"]),
  asOfDate: isoDate,
});

export const financeCashBookSchema = z.object({
  accountCode: z.string().trim().min(1).max(20),
  fromDate: isoDate,
  toDate: isoDate,
});

export const financePeriodComparisonSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  previousFromDate: isoDate,
  previousToDate: isoDate,
});

export const financeExportSchema = z.object({
  dataset: z.enum([
    "chartOfAccounts",
    "trialBalance",
    "balanceSheet",
    "profitAndLoss",
    "cashFlow",
    "generalLedger",
    "journalRegister",
    "receivableAging",
    "payableAging",
    "cashBook",
    "expenseBreakdown",
    "customerStatement",
    "supplierStatement",
    "periodComparison",
  ]),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  accountCode: z.string().max(20).optional(),
  partyId: id.optional(),
  partyKind: z.enum(["customer", "supplier"]).optional(),
});

export const financeTransferSchema = z.object({
  transferDate: isoDate,
  fromAccountCode: z.string().trim().min(1).max(20),
  toAccountCode: z.string().trim().min(1).max(20),
  amountFils: z.number().int().positive().max(1_000_000_000_000),
  reference: nullableText(120),
});

export const financeRecordPaymentSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  partyId: id,
  paymentDate: isoDate,
  method: z.enum(["cash", "bank", "card"]).default("cash"),
  amountFils: z.number().int().positive().max(1_000_000_000_000),
  reference: nullableText(120),
  notes: nullableText(500),
  allocations: z
    .array(z.object({ documentId: id, amountFils: z.number().int().positive() }))
    .optional(),
  postingKind: z
    .enum([
      "auto",
      "customerAdvance",
      "supplierAdvance",
      "expense",
      "ownerDrawing",
      "ownerContribution",
      "fixedAsset",
      "otherIncome",
      "otherExpense",
    ])
    .optional(),
  cashAccountCode: z.string().max(20).optional(),
  expenseAccountCode: z.string().max(20).optional(),
});

export const financePeriodSaveSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  startDate: isoDate,
  endDate: isoDate,
});

export const financePeriodIdSchema = z.object({ id });

export const financeOpeningBalancesSchema = z.object({
  entryDate: isoDate,
  balances: z
    .array(
      z.object({
        accountCode: z.string().trim().min(1).max(20),
        debitFils: z.number().int().min(0).max(1_000_000_000_000),
        creditFils: z.number().int().min(0).max(1_000_000_000_000),
      }),
    )
    .min(1),
});

export const financeMigrationAuditSchema = z.object({});

export const financeBackfillSchema = z.object({ confirm: z.boolean() });

/* -------------------------------------------------------------------------- */
/* non-RPC channels                                                           */
/* -------------------------------------------------------------------------- */
export const backupVerifySchema = z.string().min(1).max(1024);

export const backupRestoreSchema = z.object({
  path: z.string().min(1).max(1024),
  confirmation: z.string().min(1).max(40),
});

export const printHtmlSchema = z.object({
  html: z.string().min(1).max(8_000_000),
  options: z.object({
    silent: z.boolean(),
    paperSize: z.enum(["A4", "A5", "Letter"]),
    landscape: z.boolean(),
    copies: z.number().int().min(1).max(50),
    footerLabel: z.string().max(160).optional(),
  }),
});

export const savePdfSchema = z.object({
  html: z.string().min(1).max(8_000_000),
  suggestedName: z.string().min(1).max(160),
  footerLabel: z.string().max(160).optional(),
});

export const openExternalSchema = z.object({ url: z.string().min(1).max(2048) });
