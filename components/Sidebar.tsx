
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAVIGATION } from '../constants';
import { UserRole } from '../types';
import { ArrowLeftOnRectangleIcon, BoltIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface SidebarProps {
  role: UserRole;
  activeTab: string;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  hiddenTabs?: string[];
  allowedPages?: string[];
}

const Sidebar: React.FC<SidebarProps> = ({ role, activeTab, isOpen, onClose, onLogout, hiddenTabs = [], allowedPages }) => {
  const location = useLocation();
  const filteredNav = NAVIGATION.filter(item => {
    if (hiddenTabs.includes(item.id)) return false;
    if (allowedPages && allowedPages.length > 0) {
      const baseId = item.id.split('/')[0];
      return allowedPages.includes(item.id) || allowedPages.includes(baseId);
    }
    return item.roles.includes(role);
  });
  const categories = Array.from(new Set(filteredNav.map(item => item.category)));

  const handleLogout = async () => {
    try {
      await onLogout();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 h-full bg-white dark:bg-dark-surface border-r border-gray-100 dark:border-dark-border flex flex-col p-6 
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 dark:shadow-none">
              < BoltIcon className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight font-heading text-zinc-900 dark:text-white">BD <span className="text-indigo-600">Ops</span></span>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:text-zinc-500">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-8 overflow-y-auto pr-2 scrollbar-hide">
          {categories.map(category => (
            <div key={category}>
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest px-3 mb-4">{category}</p>
              <div className="space-y-1">
                {filteredNav
                  .filter(item => item.category === category)
                  .map(item => {
                    const basePath = item.id.split('/')[0];
                    const isActive = location.pathname.startsWith(`/${basePath}`);

                    return (
                      <NavLink
                        key={item.id}
                        to={`/${item.id}`}
                        onClick={() => {
                          if (window.innerWidth < 1024) onClose();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                          isActive 
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 shadow-sm' 
                            : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-dark-bg hover:text-gray-900 dark:hover:text-zinc-100'
                        }`}
                      >
                        <span className={`${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300'}`}>
                          {item.icon}
                        </span>
                        <span className="text-sm font-semibold">{item.label}</span>
                      </NavLink>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-dark-border">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors font-button"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
            <span className="text-sm font-bold">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;