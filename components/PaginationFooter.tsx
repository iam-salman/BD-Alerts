import React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import CustomSelect from "./CustomSelect";

interface PaginationFooterProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
  dataLength: number;
}

const PaginationFooter: React.FC<PaginationFooterProps> = ({
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  dataLength,
}) => {
  const getPageNumbers = () => {
    const pages = [];
    // On mobile, show only 2-3 buttons to ensure a single line
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    if (totalPages <= (isMobile ? 3 : 5)) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (isMobile) {
        // Very compact mobile logic: Current, and either first or last
        if (currentPage === 1) pages.push(1, 2, totalPages);
        else if (currentPage === totalPages) pages.push(1, totalPages - 1, totalPages);
        else pages.push(1, currentPage, totalPages);
      } else {
        if (currentPage <= 2) pages.push(1, 2, '...', totalPages);
        else if (currentPage >= totalPages - 1) pages.push(1, '...', totalPages - 1, totalPages);
        else pages.push(1, '...', currentPage, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="px-4 py-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between sticky bottom-0 z-10 sm:px-6 sm:py-4">
      
      {/* 1. Rows Selection - Compact & Responsive */}
      <div className="flex items-center gap-4">
        <div className="w-[75px] sm:w-[130px]">
          <CustomSelect
            options={[
              { value: "10", label: typeof window !== 'undefined' && window.innerWidth > 640 ? "10 rows" : "10" },
              { value: "20", label: typeof window !== 'undefined' && window.innerWidth > 640 ? "20 rows" : "20" },
              { value: "50", label: typeof window !== 'undefined' && window.innerWidth > 640 ? "50 rows" : "50" },
              { value: "100", label: typeof window !== 'undefined' && window.innerWidth > 640 ? "100 rows" : "100" },
              { value: "1000", label: typeof window !== 'undefined' && window.innerWidth > 640 ? "1000 rows" : "1000" },
            ]}
            value={String(itemsPerPage)}
            onChange={(val) => onItemsPerPageChange(Number(val))}
            position="top"
            className="!py-2 !px-2 sm:!px-4 !bg-transparent !border-none sm:!border-zinc-800"
          />
        </div>

        {/* Displaying text: Only for tablet and up */}
        <div className="hidden md:block text-xs font-bold text-zinc-500 whitespace-nowrap">
          {Math.min((currentPage - 1) * itemsPerPage + 1, dataLength)}-{Math.min(currentPage * itemsPerPage, dataLength)} 
          <span className="text-zinc-400 font-medium ml-1">of {dataLength}</span>
        </div>
      </div>

      {/* 2. Navigation - Always stays on the right */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-2 rounded-xl text-zinc-400 hover:text-indigo-600 disabled:opacity-10 transition-all"
        >
          <ChevronLeftIcon className="w-4 h-4 stroke-[2.5]" />
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => (
            <button
              key={idx}
              disabled={page === '...'}
              onClick={() => typeof page === 'number' && onPageChange(page)}
              className={`min-w-[32px] h-8 sm:min-w-[40px] sm:h-10 rounded-xl text-[11px] sm:text-xs font-bold transition-all ${
                page === currentPage
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : page === '...'
                  ? 'text-zinc-300'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          disabled={currentPage === totalPages || totalPages === 0}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-2 rounded-xl text-zinc-400 hover:text-indigo-600 disabled:opacity-10 transition-all"
        >
          <ChevronRightIcon className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};

export default PaginationFooter;