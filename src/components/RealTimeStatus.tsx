import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Wifi, WifiOff, Activity, Clock } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';

interface RealTimeStatusProps {
  deviceId: number;
  initialStatus: number;
  deviceName: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const RealTimeStatus = ({ 
  deviceId, 
  initialStatus, 
  deviceName, 
  showLabel = true,
  size = 'md' 
}: RealTimeStatusProps) => {
  const [status, setStatus] = useState(initialStatus);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { isConnected } = useSocket();

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const getStatusIcon = () => {
    const iconSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
    
    if (status === 1) {
      return <Activity className={`${iconSize} text-green-500`} />;
    } else {
      return <WifiOff className={`${iconSize} text-red-500`} />;
    }
  };

  const getStatusVariant = () => {
    return status === 1 ? 'success' : 'destructive';
  };

  const getStatusText = () => {
    return status === 1 ? 'Online' : 'Offline';
  };

  const formatLastUpdate = () => {
    if (!lastUpdate) return '';
    
    const now = new Date();
    const diff = now.getTime() - lastUpdate.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atrás`;
    
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant={getStatusVariant()} 
        className={`flex items-center gap-1 ${
          size === 'sm' ? 'text-xs px-1.5 py-0.5' : 
          size === 'lg' ? 'text-sm px-3 py-1' : 
          'text-xs px-2 py-0.5'
        }`}
      >
        {getStatusIcon()}
        {showLabel && <span>{getStatusText()}</span>}
      </Badge>
      
      {lastUpdate && (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>{formatLastUpdate()}</span>
        </div>
      )}
      
      {!isConnected() && (
        <Badge variant="outline" className="text-xs">
          <WifiOff className="w-3 h-3 mr-1" />
          Desconectado
        </Badge>
      )}
    </div>
  );
};

export default RealTimeStatus;