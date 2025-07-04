import { useState } from 'react';
import { useAuthStore } from '../store/auth';

export default function ExportDevicesPage() {
    const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadExcel = async () => {
    setLoading(true);
    setError(null);

    try {
        if (!user?.token) {
          throw new Error('Authentication token is missing');
        }

        const response = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/devices/export`, {
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch devices');
        }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'devices.xlsx'; // Nome do arquivo a ser baixado
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setError('Falha ao baixar a planilha.');
      console.error('Erro ao baixar o arquivo:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center">
      <div className="shadow-lg rounded-2xl p-6 text-center dark:bg-gray-800">
        <h1 className="text-2xl font-semibold mb-4">
          Exportação de Dispositivos
        </h1>
        {loading ? (
          <p className="text-blue-500">Gerando planilha...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <p className="text-green-600">Download concluído!</p>
        )}
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          onClick={downloadExcel}
          disabled={loading}
        >
          {loading ? 'Baixando...' : 'Baixar planilha'}
        </button>
      </div>
    </div>
  );
}
