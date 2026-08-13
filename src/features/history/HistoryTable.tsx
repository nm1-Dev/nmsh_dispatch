import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useMemo } from "react";
import type { DispatchCall } from "../../types/dispatch";
import { formatAge } from "../../lib/utils";
import { useDispatchStore } from "../../stores/dispatch-store";

export function HistoryTable({ calls }: { calls: DispatchCall[] }) {
  const select = useDispatchStore((state) => state.selectCall);
  const columns = useMemo<ColumnDef<DispatchCall>[]>(
    () => [
      { accessorKey: "code", header: "Code" },
      { accessorKey: "title", header: "Incident" },
      { accessorKey: "priority", header: "Priority" },
      { accessorKey: "status", header: "Status" },
      {
        id: "age",
        header: "Closed",
        cell: ({ row }) =>
          formatAge(row.original.archivedAt || row.original.closedAt),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: calls,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="history-table-wrap">
      <table className="history-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} onClick={() => select(row.original.id)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!calls.length && (
        <div className="empty-state">
          No archived calls match the selected filters.
        </div>
      )}
    </div>
  );
}
