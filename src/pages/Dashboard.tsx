import { useState, useEffect } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Activity, Server, Printer, Wifi, CheckCircle, XCircle, Menu } from 'lucide-react';
import { apiService } from '../services/api';
import { DeviceType } from '../types';

export type DeviceStatus = 1 | 0;

export interface Device {
  id: number;
  ip: string;
  name: string;
  type: DeviceType;
  user: string;
  sector: string;
  status: DeviceStatus;
  [key: string]: any;
}

interface Stats {
  devicesCount: number;
  onlineDevicesCount: number;
  printersCount: number;
  routersCount: number;
  balanceCount: number;
  databaseHealthy: boolean;
}

interface NetworkDataPoint {
  time: string;
  online: number;
  offline: number;
  total: number;
}

interface DeviceTypeChart {
  name: string;
  value: number;
  color: string;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<any>;
  color: string;
  subtitle?: string;
  isLoading: boolean;
}

interface TooltipEntry {
  name: string;
  value: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any;
  label?: string;
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
  }>;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    devicesCount: 0,
    onlineDevicesCount: 0,
    printersCount: 0,
    routersCount: 0,
    balanceCount: 0,
    databaseHealthy: false
  });

  const [networkData, setNetworkData] = useState<NetworkDataPoint[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceTypeChart[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    
const fetchData = async (): Promise<void> => {
  try {
    setLoading(true);

    // traga só devices; se precisar dos outros endpoints para outra tela, ok, mas aqui não use para contar
    const devices: Device[] = (await apiService.getDevices()) ?? [];

    // Se DeviceType já é union de todos tipos possíveis, não precisa hardcode
    const validTypes: readonly DeviceType[] = ["Computador", "Impressora", "Roteador", "Balança"];
    const validTypeSet = new Set(validTypes);

    // garante comparação robusta (trim/case)
    const normType = (t: unknown) => String(t ?? "").trim();

    const typedDevices = devices.filter((d) => validTypeSet.has(normType(d.type) as DeviceType));

    // status pode vir como number | string | boolean
    const isOnline = (s: unknown) => Number(s) === 1 || s === true || s === "true";

    const devicesCount = typedDevices.length;
    const onlineCount = typedDevices.filter((d) => isOnline(d.status)).length;

    const countBy = (t: DeviceType) =>
      typedDevices.filter((d) => normType(d.type) === t).length;

    const computadores = countBy("Computador");
    const printersCount = countBy("Impressora");
    const routersCount = countBy("Roteador");
    const balanceCount = countBy("Balança");

    setStats({
      devicesCount,              // agora é a soma das quatro categorias
      onlineDevicesCount: onlineCount,
      printersCount,
      routersCount,
      balanceCount,
      databaseHealthy: true,
    });

    // gráfico baseado na mesma base consolidada
    const networkPoints: NetworkDataPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const hour = i * 4;
      const safeRatio = devicesCount ? (onlineCount / devicesCount) * 100 : 0;
      const baseOnline = safeRatio + Math.random() * 10 - 5;
      const onlineVal = Math.round(Math.min(100, Math.max(0, baseOnline)));
      const offlineVal = Math.round(Math.min(100, Math.max(0, 100 - baseOnline)));
      networkPoints.push({
        time: `${hour.toString().padStart(2, "0")}:00`,
        online: onlineVal,
        offline: offlineVal,
        total: 100,
      });
    }
    setNetworkData(networkPoints);

    // Distribuição do pie chart — também a partir de typedDevices
    setDeviceTypes(
      [
        { name: "Computadores", value: computadores, color: "#3B82F6" },
        { name: "Impressoras", value: printersCount, color: "#10B981" },
        { name: "Roteadores", value: routersCount, color: "#F59E0B" },
        { name: "Balança", value: balanceCount, color: "#8B5CF6" },
      ].filter((i) => i.value > 0)
    );
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    setStats((prev) => ({ ...prev, databaseHealthy: false }));
  } finally {
    setLoading(false);
  }
};


    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, subtitle, isLoading }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</p>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
              {subtitle && <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>}
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 dark:text-white transition-all duration-500 transform">
                {value}
              </p>
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>
        <div className={`p-3 rounded-full ${color} transform transition-transform duration-300 hover:scale-110`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{`Horário: ${label}`}</p>
          {payload.map((entry: TooltipEntry, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip: React.FC<PieTooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {data.name}: {data.value} dispositivos
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Dashboard
          </h1>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            stats.databaseHealthy
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shadow-lg'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 shadow-lg'
          }`}>
            {stats.databaseHealthy ? (
              <CheckCircle className="w-4 h-4 mr-2 animate-pulse" />
            ) : (
              <XCircle className="w-4 h-4 mr-2 animate-bounce" />
            )}
            {stats.databaseHealthy ? 'Sistema Online' : 'Sistema Offline'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total de Dispositivos"
          value={stats.devicesCount}
          icon={Server}
          color="bg-gradient-to-r from-blue-500 to-blue-600"
          subtitle={`${stats.onlineDevicesCount} online`}
          isLoading={loading}
        />
        <StatCard
          title="Impressoras"
          value={stats.printersCount}
          icon={Printer}
          color="bg-gradient-to-r from-green-500 to-green-600"
          subtitle="Gerenciadas"
          isLoading={loading}
        />
        <StatCard
          title="Roteadores"
          value={stats.routersCount}
          icon={Wifi}
          color="bg-gradient-to-r from-yellow-500 to-yellow-600"
          subtitle="Pontos de acesso"
          isLoading={loading}
        />
        <StatCard
          title="Balanças"
          value={stats.balanceCount}
          icon={Activity}
          color="bg-gradient-to-r from-purple-500 to-purple-600"
          subtitle="Terminais"
          isLoading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Status da Rede - Últimas 24h
            </h3>
            <div className="flex items-center space-x-4 mt-2 sm:mt-0">
              <div className="flex items-center text-sm">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                <span className="text-gray-600 dark:text-gray-400">Online</span>
              </div>
              <div className="flex items-center text-sm">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                <span className="text-gray-600 dark:text-gray-400">Offline</span>
              </div>
            </div>
          </div>
          <div className="h-64 md:h-80">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={networkData}>
                  <defs>
                    <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#6B7280" tick={{ fill: '#6B7280' }} />
                  <YAxis stroke="#6B7280" tick={{ fill: '#6B7280' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="online" stackId="1" stroke="#10B981" fill="url(#colorOnline)" strokeWidth={2} />
                  <Area type="monotone" dataKey="offline" stackId="1" stroke="#EF4444" fill="url(#colorOffline)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Distribuição de Dispositivos
          </h3>
          <div className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceTypes} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" animationBegin={0} animationDuration={800}>
                    {deviceTypes.map((entry: DeviceTypeChart, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-gray-300 rounded-full mr-3"></div>
                      <div className="h-4 bg-gray-300 rounded w-20"></div>
                    </div>
                    <div className="h-4 bg-gray-300 rounded w-8"></div>
                  </div>
                ))}
              </div>
            ) : (
              deviceTypes.map((type: DeviceTypeChart, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: type.color }} />
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{type.name}</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-400 font-bold">{type.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
