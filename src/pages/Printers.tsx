import { useEffect, useState } from 'react';
import type { Printer } from '../types';
import { Activity, Power, Printer as PrinterIcon, CheckCircle2, Clock, RefreshCcw } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { Switch } from '../components/ui/switch';

export default function Printers() {
  const { user } = useAuthStore();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingPrinters, setUpdatingPrinters] = useState<Set<number>>(new Set());

  const fetchPrinters = async () => {
    try {
      if (!user?.token) {
        throw new Error('Authentication token is missing');
      }

      const response = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/printers`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch printers');
      }

      const data: Printer[] = await response.json();
      setPrinters(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Fetch printers error:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrinters();
  }, [user]);

  const handlePrinterOnlineChange = async (printerId: number, currentOnline: number) => {
    if (updatingPrinters.has(printerId)) return;
  
    setUpdatingPrinters(prev => new Set(prev).add(printerId));
  
    try {
      if (!user?.token) {
        throw new Error('Authentication token is missing');
      }
  
      const response = await fetch(`http://localhost:5173/api/printers/${printerId}/online`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ online: currentOnline }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to update printer status');
      }
  
      setPrinters(prevPrinters =>
        prevPrinters.map(printer =>
          printer.id === printerId ? { ...printer, online: currentOnline } : printer
        )
      );
  
    } catch (error) {
      console.error('Error updating printer online status:', error);
    } finally {
      setUpdatingPrinters(prev => {
        const next = new Set(prev);
        next.delete(printerId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-600 dark:text-red-400">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Impressoras</h1>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-100 dark:bg-green-800 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Concluídas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-100 dark:bg-gray-700 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Pendentes</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {printers.map((printer) => (
          <div
            key={printer.id}
            className={`
              relative overflow-hidden rounded-2xl transition-all duration-200 shadow-xl dark:shadow-gray-500/30
              ${printer.online === 1 
                ? 'bg-green-50 dark:bg-green-800/20 border-2 border-green-200 dark:border-green-800' 
                : 'bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700'}
            `}
          >
            {updatingPrinters.has(printer.id) && (
              <div className="absolute inset-0 bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <RefreshCcw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PrinterIcon className={`w-5 h-5 ${printer.online === 1 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} />
                  <h3 className="text-lg font-medium">{printer.sector}</h3>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    printer.status === 1
                      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                      : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                  }`}
                >
                  {printer.status === 1 ? (
                    <Activity className="w-3 h-3 mr-1" />
                  ) : (
                    <Power className="w-3 h-3 mr-1" />
                  )}
                  {printer.status === 1 ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-3 py-2 bg-white/50 dark:bg-black/20 rounded-2xl">
                  <span className="text-sm text-gray-600 dark:text-gray-400">IP Address</span>
                  <span className="text-sm font-medium">{printer.ip}</span>
                </div>

                <div className="flex items-center justify-between px-3 py-2 bg-white/50 dark:bg-black/20 rounded-2xl">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Model</span>
                  <span className="text-sm font-medium">{printer.model}</span>
                </div>

                <div className="flex items-center justify-between px-3 py-2 bg-white/50 dark:bg-black/20 rounded-2xl">
                  <span className="text-sm text-gray-600 dark:text-gray-400">N.PAT</span>
                  <span className="text-sm font-medium">{printer.npat}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  {printer.online === 1 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">Concluído</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Pendente</span>
                    </>
                  )}
                </div>
                <Switch
                  checked={printer.online === 1}
                  onCheckedChange={(checked) => handlePrinterOnlineChange(printer.id, checked ? 1 : 0)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}