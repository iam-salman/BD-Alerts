
import React from 'react';
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
  <div className="p-6 rounded-[2rem] border transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm hover:shadow-md dark:hover:bg-slate-800/80">
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
    <p className="text-sm font-semibold mb-1 text-gray-400 dark:text-slate-400">{title}</p>
    <h3 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">{value}</h3>
  </div>
);

const Dashboard: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const chartStroke = isDarkMode ? '#6366f1' : '#6366f1';
  const gridStroke = isDarkMode ? '#334155' : '#f0f0f0';
  const tickColor = isDarkMode ? '#94a3b8' : '#9ca3af';

  return (
    <div className="space-y-6 lg:space-y-8">
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total Batteries" value="1,284" icon={Battery50Icon} color="bg-indigo-500" trend="+12%" />
        <StatCard title="Ghost Assets" value="14" icon={CloudIcon} color="bg-red-500" />
        <StatCard title="Today's Swaps" value="842" icon={ArrowPathRoundedSquareIcon} color="bg-purple-500" trend="+4%" />
        <StatCard title="Avg Wait" value="4.2m" icon={ClockIcon} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Swapping Trend */}
        <div className="p-6 sm:p-8 rounded-[2.5rem] border transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h4 className="text-xl font-bold font-heading text-slate-900 dark:text-white">Throughput Analytics</h4>
              <p className="text-sm font-semibold text-gray-400 dark:text-slate-400">Real-time station activity</p>
            </div>
            <select className="rounded-xl px-4 py-2 text-sm font-bold focus:ring-0 cursor-pointer outline-none border border-transparent bg-gray-50 dark:bg-dark-bg text-slate-600 dark:text-slate-300 transition-colors">
              <option>Last 24 Hours</option>
              <option>Last 7 Days</option>
            </select>
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
                    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                    color: isDarkMode ? '#f8fafc' : '#1a1c1e',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Area type="monotone" dataKey="swaps" stroke={chartStroke} strokeWidth={3} fillOpacity={1} fill="url(#colorSwaps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="p-6 sm:p-8 rounded-[2.5rem] border flex flex-col transition-all bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xl font-bold font-heading text-slate-900 dark:text-white">Active Alerts</h4>
            <span className="text-xs font-bold cursor-pointer text-indigo-600 dark:text-indigo-400 hover:underline">View All</span>
          </div>
          <div className="space-y-4 flex-1">
            {[
              { id: '1', type: 'Geo-fence Breach', battery: 'BAT-0921', time: '2m ago', severity: 'high' },
              { id: '2', type: 'Charger Error', battery: 'STA-HUB-2', time: '15m ago', severity: 'medium' },
              { id: '3', type: 'Deep Discharge', battery: 'BAT-4421', time: '1h ago', severity: 'high' },
              { id: '4', type: 'Buffer Warning', battery: 'STA-SEC-4', time: '2h ago', severity: 'low' },
            ].map(alert => (
              <div key={alert.id} className="flex gap-4 p-4 rounded-2xl transition-all border border-transparent hover:bg-gray-50 dark:hover:bg-dark-bg hover:border-gray-100 dark:hover:border-dark-border">
                <div className={`p-2 rounded-xl h-fit ${alert.severity === 'high' ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-500 dark:text-orange-400'}`}>
                  <ExclamationCircleIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold font-heading leading-tight text-slate-900 dark:text-slate-100">{alert.type}</p>
                  <p className="text-xs font-semibold mb-1 text-gray-400 dark:text-slate-500">{alert.battery}</p>
                  <span className="text-[10px] font-bold uppercase text-gray-300 dark:text-slate-600">{alert.time}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-6 w-full py-3 rounded-xl font-bold font-button transition-colors bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            Acknowledge All
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
