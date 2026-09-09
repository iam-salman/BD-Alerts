import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDownIcon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string | string[];
  onChange: (value: any) => void;
  label?: string;
  className?: string;
  position?: 'top' | 'bottom';
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  footer?: React.ReactNode;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ 
  options, 
  value, 
  onChange, 
  label, 
  className,
  position = 'bottom',
  multiple = false,
  searchable = false,
  placeholder = 'Select...',
  footer
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- FEATURE UPDATE: STABLE SORTING ---
  // Items no longer jump to the top when selected. They stay in alphabetical order.
  const processedOptions = useMemo(() => {
    let result = [...options];

    if (searchTerm) {
      result = result.filter(opt => 
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Industry Standard: Maintain stable alphabetical order
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [options, searchTerm]);

  const isSelected = (val: string) => {
    if (multiple && Array.isArray(value)) return value.includes(val);
    return value === val;
  };

  const handleSelect = (val: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(val)) {
        onChange(currentValues.filter(v => v !== val));
      } else {
        onChange([...currentValues, val]);
      }
    } else {
      onChange(val);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  // --- KEYBOARD NAVIGATION ---
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < processedOptions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && processedOptions[activeIndex]) {
          handleSelect(processedOptions[activeIndex].value);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setActiveIndex(-1);
      setSearchTerm('');
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayLabel = () => {
    if (multiple && Array.isArray(value)) {
      if (value.length === 0) return placeholder;
      if (value.length === options.length) return 'All Selected';
      return `${value.length} selected`;
    }
    const selectedOption = options.find(opt => opt.value === value);
    return selectedOption?.label || placeholder;
  };

  const hasValue = multiple 
    ? Array.isArray(value) && value.length > 0 
    : value !== '' && value !== undefined;

  return (
    <div className="space-y-2 relative w-full" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block ml-1">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-300 transition-all hover:dark:border-zinc-700 whitespace-nowrap ${className || ''}`}
      >
        <span className="truncate pr-2 whitespace-nowrap">{getDisplayLabel()}</span>
        <ChevronDownIcon className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute z-50 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
          {searchable && (
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-lg pl-9 pr-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500/30 whitespace-nowrap"
                />
              </div>
            </div>
          )}
          
          <div className="max-h-60 overflow-y-auto scrollbar-hide">
            {processedOptions.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs font-bold text-zinc-400 italic whitespace-nowrap">No options found</div>
            ) : (
              processedOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-xs font-bold transition-colors gap-3 whitespace-nowrap ${
                    isSelected(option.value)
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                      : index === activeIndex
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate pr-2 whitespace-nowrap">{option.label}</span>
                  {isSelected(option.value) && (
                    <CheckIcon className="w-3.5 h-3.5 flex-shrink-0 stroke-[3]" />
                  )}
                </button>
              ))
            )}
          </div>

          {footer && (
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {footer}
            </div>
          )}

          {multiple && hasValue && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="w-full py-3 border-t border-zinc-100 dark:border-zinc-800 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-red-500 transition-colors bg-zinc-50/50 dark:bg-zinc-900/50"
            >
              Clear Selections
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;