"use client";

import * as React from "react";

import { cn } from "@/components/ui/utils";

type DataTableColumn<T> = {
  id: string;
  label: React.ReactNode;
  headerClassName?: string;
  cellClassName?: string | ((row: T) => string);
  widthClassName?: string;
};

type DataTableBaseProps<T> = {
  columns: DataTableColumn<T>[];
  stickyFirstColumn?: boolean;
  wrapperClassName?: string;
  tableClassName?: string;
  headClassName?: string;
  rowClassName?: string | ((row: T, index: number) => string);
  bodyCellClassName?: string;
};

type DataTableCellsModeProps<T> = DataTableBaseProps<T> & {
  mode?: "cells";
  rows: T[];
  getRowId: (row: T, index: number) => string;
  renderCell: (
    row: T,
    column: DataTableColumn<T>,
    index: number,
  ) => React.ReactNode;
  emptyState?: React.ReactNode;
  customBody?: never;
};

type DataTableCustomModeProps<T> = DataTableBaseProps<T> & {
  mode: "custom";
  customBody: React.ReactNode;
  rows?: never;
  getRowId?: never;
  renderCell?: never;
  emptyState?: never;
  rowClassName?: never;
  bodyCellClassName?: never;
};

type DataTableProps<T> = DataTableCellsModeProps<T> | DataTableCustomModeProps<T>;

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    stickyFirstColumn = false,
    wrapperClassName,
    tableClassName,
    headClassName,
  } = props;

  return (
    <div
      className={cn(
        "overflow-x-auto overflow-y-hidden rounded-lg border border-border",
        wrapperClassName,
      )}
    >
      <table
        className={cn(
          "w-full text-sm",
          tableClassName,
        )}
      >
        <thead className={cn("bg-muted text-muted-foreground", headClassName)}>
          <tr>
            {columns.map((column, columnIndex) => (
              <th
                key={column.id}
                className={cn(
                  "px-4 py-2 text-left font-medium whitespace-nowrap",
                  column.widthClassName,
                  stickyFirstColumn && columnIndex === 0
                    ? "sticky left-0 z-20 bg-muted"
                    : "",
                  column.headerClassName,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.mode === "custom" ? (
            props.customBody
          ) : props.rows.length === 0 ? (
            <tr>
              <td
                colSpan={Math.max(1, columns.length)}
                className="px-4 py-6 text-center text-muted-foreground"
              >
                {props.emptyState ?? "No records found."}
              </td>
            </tr>
          ) : (
            props.rows.map((row, rowIndex) => (
              <tr
                key={props.getRowId(row, rowIndex)}
                className={cn(
                  "border-t border-border",
                  typeof props.rowClassName === "function"
                    ? props.rowClassName(row, rowIndex)
                    : props.rowClassName,
                )}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={`${props.getRowId(row, rowIndex)}-${column.id}`}
                    className={cn(
                      "px-4 py-2 align-top whitespace-nowrap",
                      props.bodyCellClassName,
                      column.widthClassName,
                      stickyFirstColumn && columnIndex === 0
                        ? "sticky left-0 z-10 bg-background"
                        : "",
                      typeof column.cellClassName === "function"
                        ? column.cellClassName(row)
                        : column.cellClassName,
                    )}
                  >
                    {props.renderCell(row, column, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type { DataTableColumn };
