import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Activity, Server, Printer, Wifi, CheckCircle, XCircle, AlertTriangle, Users, Clock, Zap, HardDrive } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    devicesCount: 0,
    onlineDevicesCount: 0,
    printersCount: 0,
    routersCount: 0,
    boxesCount: 0,
    tasksCount: 0,
    uptimeString: '0d 0h 0m 0s',
    requestCount: 0,
    activeConnections: 0,
    databaseHealthy: true
  });

  const [networkData, setNetworkData] = useState([
    { time: '00:00', online: 85, offline: 15, total: 100 },
    { time: '04:00', online: 78, offline: 22, total: 100 },
    { time: '08:00', online: 92, offline: 8, total: 100 },
    { time: '12:00', online: 88, offline: 12, total: 100 },
    { time: '16:00', online: 95, offline: 5, total: 100 },
    { time: '20:00', online: 87, offline: 13, total: 100 }
  ]);

  const deviceTypes = [
    { name: 'Computadores', value: 45, color: '#3B82F6' },
    { name: 'Impressoras', value: 12, color: '#10B981' },
    { name: 'Roteadores', value: 8, color: '#F59E0B' },
    { name: 'Caixas', value: 15, color: '#8B5CF6' },
    { name: 'Outros', value: 20, color: '#EF4444' }
  ];

  const serverMetrics = [
    { name: 'CPU', value: 68, color: '#3B82F6' },
    { name: 'RAM', value: 45, color: '#10B981' },
    { name: 'Disk', value: 72, color: '#F59E0B' },
    { name: 'Network', value: 35, color: '#8B5CF6' }
  ];

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/server-status');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center">
          <span className={`text-xs px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-xs text-gray-500 ml-2">vs último período</span>
        </div>
      )}
    </div>
  );

  const MetricBar = ({ name, value, color }) => (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-300">{name}</span>
        <span className="text-gray-600 dark:text-gray-400">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className="h-2 rounded-full transition-all duration-500" 
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                SuperIPS Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Monitoramento em tempo real da infraestrutura de rede
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2">
              <div className={`flex items-center px-3 py-2 rounded-full text-sm ${
                stats.databaseHealthy 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {stats.databaseHealthy ? <CheckCircle className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                {stats.databaseHealthy ? 'Sistema Online' : 'Sistema Offline'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Uptime: {stats.uptimeString}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total de Dispositivos"
            value={stats.devicesCount}
            icon={Server}
            color="bg-blue-500"
            subtitle={`${stats.onlineDevicesCount} online`}
            trend={5.2}
          />
          <StatCard
            title="Impressoras"
            value={stats.printersCount}
            icon={Printer}
            color="bg-green-500"
            subtitle="Gerenciadas"
            trend={2.1}
          />
          <StatCard
            title="Roteadores"
            value={stats.routersCount}
            icon={Wifi}
            color="bg-yellow-500"
            subtitle="Pontos de acesso"
            trend={-1.2}
          />
          <StatCard
            title="Tarefas Ativas"
            value={stats.tasksCount}
            icon={Clock}
            color="bg-purple-500"
            subtitle="Em andamento"
            trend={8.5}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Status da Rede - Últimas 24h
              </h3>
              <div className="flex items-center space-x-4 mt-2 sm:mt-0">
                <div className="flex items-center text-sm">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  Online
                </div>
                <div className="flex items-center text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                  Offline
                </div>
              </div>
            </div>
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={networkData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="online" 
                    stackId="1"
                    stroke="#10B981" 
                    fill="#10B981" 
                    fillOpacity={0.8}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="offline" 
                    stackId="1"
                    stroke="#EF4444" 
                    fill="#EF4444" 
                    fillOpacity={0.8}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Distribuição de Dispositivos
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceTypes}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {deviceTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {deviceTypes.map((type, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="text-gray-700 dark:text-gray-300">{type.name}</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-400">{type.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Métricas do Servidor
            </h3>
            <div className="space-y-6">
              {serverMetrics.map((metric, index) => (
                <MetricBar key={index} {...metric} />
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Atividade do Sistema
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <Activity className="w-5 h-5 text-blue-500 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Requisições</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total processadas</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.requestCount.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <Users className="w-5 h-5 text-green-500 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Conexões Ativas</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">WebSocket</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.activeConnections}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <HardDrive className="w-5 h-5 text-purple-500 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Banco de Dados</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PostgreSQL</p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  stats.databaseHealthy 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {stats.databaseHealthy ? 'Saudável' : 'Problema'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Alertas e Notificações
          </h3>
          <div className="space-y-3">
            <div className="flex items-start p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Alta utilização de CPU detectada
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Servidor principal atingiu 85% de uso - há 2 minutos
                </p>
              </div>
            </div>

            <div className="flex items-start p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Backup concluído com sucesso
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Backup automático finalizado - há 15 minutos
                </p>
              </div>
            </div>

            <div className="flex items-start p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Activity className="w-5 h-5 text-blue-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Novo dispositivo detectado na rede
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  IP 10.0.11.145 adicionado automaticamente - há 32 minutos
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;