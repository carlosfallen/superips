import { useEffect, useState } from 'react';
import { useDevicesStore } from '../store/devices';
import { 
  Activity, Power, Search, ChevronDown, ChevronUp, 
  ArrowRight, ArrowLeft, Edit2, X, Save, Loader2 
} from 'lucide-react';
import type { Device } from '../types';
import { apiService } from '../services/api';

interface EditModalProps {
  device: Device;
  onClose: () => void;
  onSave: (updatedDevice: Device) => Promise<void>;
}

const EditModal = ({ device, onClose, onSave }: EditModalProps) => {
  const [formData, setFormData] = useState<Device>({ ...device });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao salvar dispositivo');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-500/30 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Editar Dispositivo
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          {errorMessage && (
            <div className="mb-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded-2xl">
              {errorMessage}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                IP
              </label>
              <input
                type="text"
                name="ip"
                value={formData.ip}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                required
              >
                <option value="Computador">Computador</option>
                <option value="Impressora">Impressora</option>
                <option value="Roteador">Roteador</option>
                <option value="Balança">Balança</option>
                <option value="Busca Preço">Busca Preço</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Usuário
              </label>
              <input
                type="text"
                name="user"
                value={formData.user}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Setor
              </label>
              <input
                type="text"
                name="sector"
                value={formData.sector}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl shadow-sm dark:shadow-gray-500/30 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-2xl shadow-sm dark:shadow-gray-500/30 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 flex items-center"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function Devices() {
  const { devices, setDevices, updateDevice } = useDevicesStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Device; direction: 'asc' | 'desc' }>({
    key: 'ip',
    direction: 'asc'
  });
  const [currentNetwork, setCurrentNetwork] = useState<'10.0' | '10.2' | '10.4'>('10.0');
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState<number | null>(null);

  const getDevicesByNetwork = (network: '10.0' | '10.2' | '10.4'): Device[] => {
    return devices.filter(device => device.ip.startsWith(network));
  };

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const data = await apiService.getDevices();
        const convertedData = data.map(device => ({
          ...device,
          status: Number(device.status) as 0 | 1
        }));
        setDevices(Array.isArray(data) ? convertedData : []);
      } catch (error: any) {
        let errorMessage = 'Erro ao carregar dispositivos';
        
        if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
          errorMessage = 'Erro de rede - verifique se o servidor está rodando';
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        setError(errorMessage);
        console.error('Error fetching devices:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevices();
  }, [setDevices]);

  useEffect(() => {
    let list = getDevicesByNetwork(currentNetwork);

    list = list.filter(device =>
      Object.values(device).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    if (sortConfig) {
      const { key, direction } = sortConfig;

      const ipToNumber = (ip: string) =>
        ip.split('.').map(Number).reduce((acc, oct) => (acc << 8) + oct, 0);

      list.sort((a, b) => {
        if (key === 'ip') {
          const diff = ipToNumber(a.ip) - ipToNumber(b.ip);
          return direction === 'asc' ? diff : -diff;
        }
        if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
        if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredDevices(list);
  }, [devices, searchTerm, currentNetwork, sortConfig]);

  const handleSort = (key: keyof Device) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSaveDevice = async (updatedDevice: Device) => {
    try {
      const updatedData = await apiService.updateDevice(updatedDevice.id, updatedDevice);
      updateDevice(updatedData);
    } catch (error: any) {
      console.error('Error updating device:', error);
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Falha ao atualizar dispositivo');
      }
    }
  };

  const switchNetwork = (direction: 'next' | 'prev') => {
    const networks: ('10.0' | '10.2' | '10.4')[] = ['10.0', '10.2', '10.4'];
    const currentIndex = networks.indexOf(currentNetwork);
    
    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % networks.length;
      setCurrentNetwork(networks[nextIndex]);
    } else {
      const prevIndex = (currentIndex - 1 + networks.length) % networks.length;
      setCurrentNetwork(networks[prevIndex]);
    }
  };

  const StatusIndicator = ({ status }: { status: number }) => (
    <span className={`
      inline-flex items-center justify-center w-6 h-6 rounded-full
      ${status === 1 
        ? 'bg-green-700 text-white' 
        : 'bg-red-700 text-white'}
    `}>
      {status === 1 ? <Activity className="w-3 h-3" /> : <Power className="w-3 h-3" />}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
        <div className="text-red-800 dark:text-red-200">
          <h3 className="font-semibold mb-2">Erro ao carregar dispositivos</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Dispositivos
        </h1>
        <div className="mt-4 md:mt-0 flex items-center space-x-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Subrede: {currentNetwork}.x
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => switchNetwork('prev')}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => switchNetwork('next')}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar dispositivos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm dark:shadow-gray-500/30 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {filteredDevices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg dark:shadow-gray-500/30 p-8 text-center">
          <div className="text-gray-500 dark:text-gray-400">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum dispositivo encontrado</p>
            <p className="text-sm">Tente ajustar os filtros de busca</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-500/30 overflow-hidden">
          <div className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['IP', 'Nome', 'Tipo', 'Usuário', 'Setor', 'Status', 'Ações'].map((header) => (
                      <th
                        key={header}
                        onClick={() => header !== 'Ações' && handleSort(header.toLowerCase() as keyof Device)}
                        className={`px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                          header !== 'Ações' ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-300' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{header}</span>
                          {header !== 'Ações' && sortConfig?.key === header.toLowerCase() && (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredDevices.map((device) => (
                    <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        {device.ip}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        {device.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 capitalize">
                        {device.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 capitalize">
                        {device.user}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 capitalize">
                        {device.sector}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusIndicator status={device.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setEditingDevice(device)}
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 focus:outline-none"
                        >
                          <span className="flex items-center">
                            <Edit2 className="w-4 h-4 mr-1" />
                            Editar
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:hidden space-y-4 p-4">
            {filteredDevices.map((device) => (
              <div
                key={device.id}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden"
              >
                <div
                  className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
                  onClick={() => setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <StatusIndicator status={device.status} />
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{device.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">IP: {device.ip}</p>
                      </div>
                    </div>
                    <ChevronDown 
                      className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200 
                        ${expandedDeviceId === device.id ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>
 
                {expandedDeviceId === device.id && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 block text-xs uppercase tracking-wide mb-1">Tipo</span>
                          <span className="text-gray-900 dark:text-gray-100 capitalize">{device.type}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 block text-xs uppercase tracking-wide mb-1">Usuário</span>
                          <span className="text-gray-900 dark:text-gray-100">{device.user}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs uppercase tracking-wide mb-1">Setor</span>
                        <span className="text-gray-900 dark:text-gray-100">{device.sector}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDevice(device);
                        }}
                        className="mt-3 w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-transparent rounded-2xl hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800"
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Editar Dispositivo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editingDevice && (
        <EditModal
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onSave={handleSaveDevice}
        />
      )}
    </div>
  );
}