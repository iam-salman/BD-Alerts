
import React from 'react';
import { EllipsisVerticalIcon, ChevronRightIcon, StarIcon } from '@heroicons/react/24/solid';
import { User } from "firebase/auth";

const RightPanel: React.FC<{ isDarkMode: boolean, user: User }> = ({ isDarkMode, user }) => {
  const userName = user.displayName || user.email?.split('@')[0] || 'Operator';

  return (
    <div className="w-80 h-full border-l flex flex-col p-8 overflow-y-auto transition-all bg-white dark:bg-dark-surface border-gray-50 dark:border-dark-border">
      <div className="flex justify-between items-center mb-8">
        <h4 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">Profile & Performance</h4>
        <button className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors">
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col items-center mb-10">
        <div className="relative mb-6">
          <div className="w-32 h-32 rounded-full border-4 p-1 border-indigo-100 dark:border-indigo-900/30 transition-all">
            <div className="w-full h-full rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-2xl font-bold text-gray-500">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span>{user.email?.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>
          <div className="absolute -bottom-2 right-4 text-white text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-white dark:border-dark-surface bg-indigo-600 shadow-md">
            Lvl 1
          </div>
        </div>
        <h5 className="text-xl font-bold font-heading mb-1 text-center leading-tight text-zinc-900 dark:text-white capitalize">{userName} 🔥</h5>
        <p className="text-sm font-semibold text-center leading-relaxed px-4 text-gray-400 dark:text-zinc-500">
          Optimization target: 98% efficiency
        </p>
      </div>

      <div className="p-6 rounded-3xl mb-10 transition-all bg-gray-50 dark:bg-dark-bg border border-transparent dark:border-dark-border">
        <div className="flex justify-between items-end mb-4">
          {[0.5, 0.75, 0.25, 1, 0.6].map((h, i) => (
            <div key={i} className="w-4 rounded-full relative bg-indigo-100 dark:bg-indigo-950/40" style={{ height: '100px' }}>
              <div 
                className="absolute bottom-0 w-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all" 
                style={{ height: `${h * 100}%` }}
              ></div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-gray-400 dark:text-zinc-600">
          <span>Wk 1</span>
          <span>Wk 2</span>
          <span>Wk 3</span>
        </div>
      </div>

      <div className="flex-1">
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-lg font-bold font-heading text-zinc-900 dark:text-white">Top Hubs</h4>
          <button className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors">
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          {[
            { name: 'HUB Alpha', role: 'Main Terminal', rating: 4.8 },
            { name: 'HUB Beta', role: 'South Sector', rating: 4.5 },
            { name: 'HUB Gamma', role: 'West Sector', rating: 4.2 },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 dark:bg-dark-bg transition-all group-hover:ring-4 ring-indigo-50 dark:ring-indigo-900/20">
                <img src={`https://picsum.photos/seed/${item.name}/100/100`} alt={item.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex-1">
                <h6 className="text-sm font-bold font-heading leading-tight text-zinc-900 dark:text-white">{item.name}</h6>
                <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500">{item.role}</p>
              </div>
              <div className="flex items-center gap-1">
                <StarIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">{item.rating}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <button className="mt-8 w-full py-4 rounded-2xl font-bold font-button transition-all bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white shadow-sm">
        Full Analytics
      </button>
    </div>
  );
};

export default RightPanel;