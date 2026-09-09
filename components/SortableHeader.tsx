import React from "react";
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: { key: string; direction: "asc" | "desc" | "none" } | null;
  onSort: (key: string) => void;
  className?: string; // Should include "text-left", "text-center", or "text-right"
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSort,
  onSort,
  className = "",
}) => {
  const isActive = currentSort?.key === sortKey;
  
  // 1. Determine alignment for the flex container
  const isCentered = className.includes("text-center");
  const isRightAligned = className.includes("text-right");

  const alignmentClass = isCentered 
    ? "justify-center" 
    : isRightAligned 
      ? "justify-end" 
      : "justify-start";

  return (
    <th
      className={`
        px-6 py-4 
        cursor-pointer group select-none transition-colors
        whitespace-nowrap min-w-max
        ${isActive 
          ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10" 
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
        } 
        ${className}
      `}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1.5 ${alignmentClass}`}>
        {/* 2. The Header Text */}
        <span className="text-[11px] font-black uppercase tracking-[0.15em] leading-none">
          {label}
        </span>
        
        {/* 3. The Icon Wrapper - Fixed width prevents text jumping */}
        <div className={`
          flex-shrink-0 flex items-center justify-center w-3.5 h-3.5
          transition-opacity duration-200
          ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40"}
        `}>
          {isActive ? (
            currentSort.direction === "asc" ? (
              <ChevronUpIcon className="w-full h-full stroke-[3]" />
            ) : (
              <ChevronDownIcon className="w-full h-full stroke-[3]" />
            )
          ) : (
            <ChevronUpDownIcon className="w-full h-full stroke-[2]" />
          )}
        </div>
      </div>
    </th>
  );
};

export default SortableHeader;