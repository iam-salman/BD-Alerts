import React, { useState, useEffect } from 'react';
import { 
  Battery50Icon, 
  CloudIcon, 
  ArrowPathRoundedSquareIcon, 
  ExclamationCircleIcon, 
  ClockIcon, 
  ArrowUpRightIcon, 
  BoltIcon 
} from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: '06:00', swaps: 45 },
  { name: '08:00', swaps: 82 },
  { name: '10:00', swaps: 64 },
  { name: '12:00', swaps: 110 },
  { name: '14:00', swaps: 95 },
  { name: '16:00', swaps: 130 },
  { name: '18:00', swaps: 85 },
  { name: '20:00', swaps: 50 },
];

const StatCard = ({ title, value, icon: Icon, color, trend }: any) => (
  <div className="p-6 rounded-[2rem] border transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm hover:shadow-md dark:hover:bg-zinc-800/80">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${color} shadow-sm`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {trend && (
        <span className="flex items-center text-[10px] font-bold px-2 py-1 rounded-full uppercase text-green-500 bg-green-50 dark:bg-green-900/20 dark:text-green-400">
          <ArrowUpRightIcon className="w-3 h-3 mr-1" />
          {trend}
        </span>
      )}
    </div>
    <p className="text-sm font-semibold mb-1 text-gray-400 dark:text-zinc-400">{title}</p>
    <h3 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white">{value}</h3>
  </div>
);

const DashboardSkeleton = () => (
  <div className="space-y-6 lg:space-y-8 animate-pulse">
    {/* Banner Skeleton */}
    <div className="h-64 rounded-[2.5rem] bg-zinc-200 dark:bg-zinc-800 w-full"></div>
    
    {/* Stats Grid Skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 h-40">
          <div className="flex justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-200 dark:bg-zinc-800"></div>
            <div className="w-12 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
          </div>
          <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded mb-2"></div>
          <div className="h-8 w-16 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      ))}
    </div>

    {/* Charts Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
      <div className="lg:col-span-2 h-96 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800"></div>
      <div className="h-96 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800"></div>
    </div>
  </div>
);

const Dashboard: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const [loading, setLoading] = useState(true);
  const chartStroke = isDarkMode ? '#6366f1' : '#6366f1';
  const gridStroke = isDarkMode ? '#27272a' : '#f0f0f0';
  const tickColor = isDarkMode ? '#71717a' : '#9ca3af';

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] p-6 sm:p-10 transition-all bg-indigo-600 dark:bg-indigo-700 text-white shadow-xl shadow-indigo-100 dark:shadow-none">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold font-heading mb-4">BD Ops: High Performance Energy.</h2>
          <p className="text-lg mb-6 leading-relaxed text-indigo-100">
            System status is healthy. 12 batteries require scheduled maintenance to maintain peak efficiency.
          </p>
          <button className="px-8 py-3 rounded-2xl font-bold font-button transition-colors bg-white text-indigo-600 hover:bg-indigo-50">
            Run Optimizer
          </button>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 hidden sm:block">
           <BoltIcon className="w-[300px] h-[300px]" strokeWidth={1} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total Batteries" value="1,284" icon={Battery50Icon} color="bg-indigo-500" trend="+12%" />
        <StatCard title="Ghost Assets" value="14" icon={CloudIcon} color="bg-red-500" />
        <StatCard title="Today's Swaps" value="842" icon={ArrowPathRoundedSquareIcon} color="bg-purple-500" trend="+4%" />
        <StatCard title="Avg Wait" value="4.2m" icon={ClockIcon} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 p-6 sm:p-8 rounded-[2.5rem] border transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h4 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">Throughput Analytics</h4>
              <p className="text-sm font-semibold text-gray-400 dark:text-zinc-400">Real-time station activity</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorSwaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: tickColor, fontWeight: 600}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: tickColor, fontWeight: 600}} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
                    color: isDarkMode ? '#fafafa' : '#1a1c1e',
                  }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Area type="monotone" dataKey="swaps" stroke={chartStroke} strokeWidth={3} fillOpacity={1} fill="url(#colorSwaps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 sm:p-8 rounded-[2.5rem] border flex flex-col transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">Active Alerts</h4>
          </div>
          <div className="space-y-4 flex-1">
            {[
              { id: '1', type: 'Geo-fence Breach', battery: 'BAT-0921', time: '2m ago', severity: 'high' },
              { id: '2', type: 'Charger Error', battery: 'STA-HUB-2', time: '15m ago', severity: 'medium' },
            ].map(alert => (
              <div key={alert.id} className="flex gap-4 p-4 rounded-2xl border border-transparent hover:bg-gray-50 dark:hover:bg-dark-bg hover:border-gray-100 dark:hover:border-dark-border">
                <div className={`p-2 rounded-xl h-fit ${alert.severity === 'high' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
                  <ExclamationCircleIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold font-heading text-zinc-900 dark:text-zinc-100">{alert.type}</p>
                  <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500">{alert.battery}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;