/**
 * Data table.
 *
 * Hand-rolled on top of semantic table elements rather than a grid library:
 * the app needs sticky headers, RTL column order, right-aligned tabular
 * numbers and a row-action menu, and a plain table with a scroll container
 * does all of that with less machinery.
 *
 * Compact: 40px rows, 36px header, 13px text.
 */

import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/utils";

const VIRTUALISE_ABOVE_ROWS = 150;
const OVERSCAN_ROWS = 12;
const NO_HIDDEN_COLUMNS: readonly string[] = [];

export interface Column<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly sortValue?: (row: T) => string | number | null | undefined;
  readonly align?: "start" | "end" | "center" | undefined;
  readonly className?: string | undefined;
  readonly headerClassName?: string | undefined;
  readonly defaultHidden?: boolean | undefined;
  readonly widthClass?: string | undefined;
}

export interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string | number;
  readonly onRowClick?: (row: T) => void | undefined;
  readonly sortId?: string | null | undefined;
  readonly sortDirection?: "asc" | "desc" | undefined;
  readonly onSortChange?: (id: string, direction: "asc" | "desc") => void | undefined;
  readonly emptyState?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly compact?: boolean | undefined;
  /**
   * Narrower cells: 12px of padding on each side instead of 16px.
   *
   * For a table that has to live in a narrow column - a ledger inside a
   * detail panel, say - the padding is what pushes the last column off the
   * edge. The row height is unchanged.
   */
  readonly dense?: boolean | undefined;
  /**
   * Lay the table out on the column widths rather than on its content.
   *
   * The default layout gives every column as much room as its widest cell
   * wants, which is right for a table that owns the page and wrong for one
   * inside a narrow panel: there the widths are already decided and the
   * content has to give way. A fixed layout makes the declared widths exact,
   * so a column never pushes the last one off the edge.
   */
  readonly fixed?: boolean | undefined;
  readonly caption?: string | undefined;
  readonly footer?: ReactNode | undefined;
  readonly hiddenColumnIds?: readonly string[] | undefined;
  readonly maxBodyHeight?: string | undefined;
  /**
   * Drop the table's own border and corners, for a table that sits inside a
   * card which already draws them. Doing it with a class override would be a
   * fight with the stylesheet's cascade; a flag is unambiguous.
   */
  readonly frameless?: boolean | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sortId,
  sortDirection,
  onSortChange,
  emptyState,
  className,
  compact = false,
  dense = false,
  fixed = false,
  caption,
  footer,
  hiddenColumnIds = NO_HIDDEN_COLUMNS,
  maxBodyHeight,
  frameless = false,
}: DataTableProps<T>): React.JSX.Element {
  const hidden = useMemo(() => new Set(hiddenColumnIds), [hiddenColumnIds]);
  const visible = useMemo(
    () => columns.filter((column) => !hidden.has(column.id) && !column.defaultHidden),
    [columns, hidden],
  );

  const headerHeight = "h-10";
  const cellPadding = dense ? "px-2 py-2" : compact ? "px-4 py-2" : "px-4 py-2.5";

  const shouldVirtualise = rows.length > VIRTUALISE_ABOVE_ROWS;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: OVERSCAN_ROWS,
  });

  const virtualItems = shouldVirtualise ? rowVirtualizer.getVirtualItems() : [];

  const renderHead = useCallback(
    () => (
      <thead className="sticky top-0 z-10">
        <tr className="bg-[var(--table-header-bg)]">
          {visible.map((column) => {
            const sortable = column.sortValue !== undefined && onSortChange !== undefined;
            const isSorted = sortId === column.id;

            return (
              <th
                key={column.id}
                scope="col"
                aria-sort={
                  isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
                }
                className={cn(
                  headerHeight,
                  cellPadding,
                  "border-b border-[var(--border)] text-start text-[12px] font-semibold uppercase tracking-wide text-[var(--text-3)]",
                  column.align === "end" && "text-end",
                  column.align === "center" && "text-center",
                  column.widthClass,
                  column.headerClassName,
                )}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onSortChange === undefined) return;
                      onSortChange(column.id, isSorted && sortDirection === "asc" ? "desc" : "asc");
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded transition-colors duration-fast",
                      "hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
                      isSorted ? "text-[var(--brand)]" : "",
                    )}
                  >
                    {column.header}
                    {isSorted ? (
                      sortDirection === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )
                    ) : (
                      <ChevronsUpDown
                        className="h-3 w-3 text-[var(--text-3)] opacity-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
    ),
    [visible, headerHeight, cellPadding, sortId, sortDirection, onSortChange],
  );

  const renderRow = useCallback(
    (row: T, rowIndex: number) => (
      <tr
        key={rowKey(row)}
        onClick={
          onRowClick === undefined
            ? undefined
            : () => {
                onRowClick(row);
              }
        }
        onKeyDown={
          onRowClick === undefined
            ? undefined
            : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              }
        }
        tabIndex={onRowClick === undefined ? undefined : 0}
        aria-rowindex={shouldVirtualise ? rowIndex + 3 : rowIndex + 1}
        ref={shouldVirtualise ? rowVirtualizer.measureElement : undefined}
        data-index={shouldVirtualise ? rowIndex : undefined}
        className={cn(
          "border-b border-[var(--border)] transition-colors duration-fast last:border-0",
          "hover:bg-[var(--table-row-hover)]",
          onRowClick !== undefined && "cursor-pointer",
        )}
      >
        {visible.map((column) => (
          <td
            key={column.id}
            className={cn(
              cellPadding,
              "align-middle text-[13.5px] text-[var(--text)]",
              column.align === "end" && "tabular text-end",
              column.align === "center" && "text-center",
              column.className,
            )}
          >
            {column.cell(row) ?? <span className="text-[var(--text-3)]">—</span>}
          </td>
        ))}
      </tr>
    ),
    [visible, cellPadding, rowKey, onRowClick, shouldVirtualise, rowVirtualizer.measureElement],
  );

  const renderBody = () => {
    if (rows.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={Math.max(1, visible.length)} className="p-0">
              {emptyState ?? <div className="p-8 text-center text-sm text-ink-muted">No rows.</div>}
            </td>
          </tr>
        </tbody>
      );
    }

    if (!shouldVirtualise) {
      return <tbody>{rows.map((row, index) => renderRow(row, index))}</tbody>;
    }

    const first = virtualItems[0];
    const last = virtualItems[virtualItems.length - 1];
    const padTop = first?.start ?? 0;
    const padBottom = rowVirtualizer.getTotalSize() - (last?.end ?? 0);

    return (
      <tbody>
        <tr aria-hidden="true" style={{ height: `${String(padTop)}px` }} />
        {virtualItems.map((item) => {
          const row = rows[item.index];
          return row === undefined ? null : renderRow(row, item.index);
        })}
        <tr aria-hidden="true" style={{ height: `${String(Math.max(0, padBottom))}px` }} />
      </tbody>
    );
  };

  return (
    <div
      ref={scrollRef}
      className={cn(
        "relative overflow-auto bg-[var(--surface)]",
        frameless ? "" : "rounded-xl border border-[var(--border)]",
        className,
      )}
      style={{
        maxHeight: maxBodyHeight ?? (shouldVirtualise ? "min(70vh, 44rem)" : undefined),
      }}
    >
      <table
        className="w-full border-collapse text-[13.5px]"
        style={fixed ? { tableLayout: "fixed" } : undefined}
        aria-rowcount={shouldVirtualise ? rows.length + 1 : undefined}
      >
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}

        {renderHead()}
        {renderBody()}

        {footer !== undefined && rows.length > 0 && (
          <tfoot className="sticky bottom-0 z-10 bg-[var(--surface-2)]">{footer}</tfoot>
        )}
      </table>
    </div>
  );
}
