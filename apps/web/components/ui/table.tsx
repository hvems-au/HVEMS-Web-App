"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Data table. On larger screens a normal table; on phones each row becomes a
 * card (CSS in globals.css, `.stack-table`): the first cell is the card title
 * and every other cell is labelled with its column heading. Labels are copied
 * from the <th> texts after render, so pages don't repeat them.
 */
export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const ref = React.useRef<HTMLTableElement>(null);
  React.useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const heads = Array.from(table.querySelectorAll("thead th")).map((th) => (th.textContent ?? "").trim());
      table.querySelectorAll("tbody tr").forEach((tr) => {
        Array.from(tr.children).forEach((cell, i) => {
          const text = heads[i] ?? "";
          if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
        });
      });
    };
    label();
    // Rows can change after a filter or refresh: keep labels in step.
    const observer = new MutationObserver(label);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="w-full overflow-x-auto sm:overscroll-x-contain">
      <table ref={ref} className={cn("stack-table w-full border-collapse text-left text-[13.5px]", className)} {...props}>
        {children}
      </table>
    </div>
  );
}
