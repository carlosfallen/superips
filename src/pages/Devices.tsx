import { useEffect, useState } from 'react';
import { useDevicesStore } from '../store/devices';
import { 
  Activity, Power, Search, ChevronDown, ChevronUp, 
  ArrowRight, ArrowLeft, Edit2, X, Save, Loader2 
} from 'lucide-react';
import type { Device } from '../types';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth';

const socket = io(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}`);

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
  const { user } = useAuthStore();
  const { devices, setDevices, updateDeviceStatus, updateDevice } = useDevicesStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Device; direction: 'asc' | 'desc' } | null>(null);
  const [showDevices4, setShowDevices4] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        if (!user?.token) {
          throw new Error('Authentication token is missing');
        }
        
        const endpoint = showDevices4 ? 'vlan' : 'devices';
        const response = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch devices');
        }

        const data: Device[] = await response.json();
        setDevices(Array.isArray(data) ? data : []);
      } catch (error) {
        let errorMessage = 'Failed to fetch devices';
        if (error instanceof TypeError) {
          errorMessage = 'Network error - check server connection';
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevices();

    const eventName = showDevices4 ? 'device4StatusUpdate' : 'deviceStatusUpdate';
    socket.on(eventName, ({ id, status }) => {
      updateDeviceStatus(id, status);
    });

    return () => {
      socket.off(eventName);
    };
  }, [setDevices, updateDeviceStatus, user, showDevices4]);

  useEffect(() => {
    const filtered = devices.filter(device => 
      Object.values(device).some(value => 
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
    ));
    setFilteredDevices(filtered);
  }, [devices, searchTerm]);

  const handleSort = (key: keyof Device) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    
    const sorted = [...filteredDevices].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setFilteredDevices(sorted);
  };

  const handleSaveDevice = async (updatedDevice: Device) => {
    try {
      if (!user?.token) {
        throw new Error('Authentication token is missing');
      }
      
      const endpoint = showDevices4 ? 'vlan' : 'devices';
      const response = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/${endpoint}/${updatedDevice.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedDevice)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update device');
      }

      const updatedData = await response.json();
      updateDevice(updatedData);
      
    } catch (error) {
      console.error('Error updating device:', error);
      throw error;
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

  const DesktopView = () => (
    <div className="hidden md:block transition-opacity duration-300 ease-in-out">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-500/30 overflow-hidden">
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
    </div>
  );

  const MobileView = () => {
    const [expandedDeviceId, setExpandedDeviceId] = useState<number | null>(null);

    return (
      <div className="md:hidden space-y-4 rounded-2xl transition-opacity duration-300 ease-in-out">
        {filteredDevices.map((device) => (
          <div
            key={device.id}
            className="bg-white dark:bg-gray-800 shadow-lg dark:shadow-gray-900/30 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-2xl"
          >
            <div
              className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
              onClick={() => setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <StatusIndicator status={device.status} />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{device.name}</h3>
                </div>
                <ChevronDown 
                  className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200 
                    ${expandedDeviceId === device.id ? 'rotate-180' : ''}`}
                />
              </div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                <p>IP: {device.ip}</p>
              </div>
            </div>

            {expandedDeviceId === device.id && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="space-y-2 text-sm">
                  <p className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Tipo:</span>
                    <span className="text-gray-900 dark:text-gray-100 capitalize">{device.type}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Usuário:</span>
                    <span className="text-gray-900 dark:text-gray-100">{device.user}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Setor:</span>
                    <span className="text-gray-900 dark:text-gray-100">{device.sector}</span>
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDevice(device);
                    }}
                    className="mt-3 w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-transparent rounded-md hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800"
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
    );
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600">
        Error: {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {showDevices4 ? 'Faixa de rede 10.4.11' : 'Faixa de rede 10.0.11'}
        </h1>
        
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 md:flex-none">
            <input
              type="text"
              placeholder="Buscar dispositivos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-2xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          
          <button 
            onClick={() => setShowDevices4(!showDevices4)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            {showDevices4 ? (
              <>
                <span className="hidden md:inline">10.0</span>
                <ArrowLeft className="w-5 h-5" />
              </>
            ) : (
              <>
                <span className="hidden md:inline">10.4</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      <DesktopView />
      <MobileView />

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