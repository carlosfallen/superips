import { useState, useEffect } from 'react';
import { 
  User, Bell, Palette, Shield, Database, Download, 
  Upload, Save, RefreshCw, Monitor, Moon, Sun,
  Volume2, VolumeX, Smartphone, Mail, MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useTheme } from '../contexts/theme';
import { useToast } from '../hooks/use-toast';
import { useAuthStore } from '../store/auth';

interface NotificationSettings {
  deviceStatus: boolean;
  printerStatus: boolean;
  systemAlerts: boolean;
  taskReminders: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  soundEnabled: boolean;
}

interface UserSettings {
  name: string;
  email: string;
  department: string;
  refreshInterval: number;
  language: string;
  timezone: string;
}

export default function Settings() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { toast } = useToast();
  const { user } = useAuthStore();
  // estado local para import/export devices
const [devicesLoading, setDevicesLoading] = useState(false);

const downloadDevices = async () => {
  setDevicesLoading(true);
  try {
    const resp = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/devices/export`, {
      method: 'GET',
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    });
    if (!resp.ok) throw new Error('Falha ao exportar dispositivos');

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'devices.xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast({ title: 'Sucesso', description: 'Exportação concluída' });
  } catch (err) {
    console.error('Erro export devices:', err);
    toast({ title: 'Erro', description: 'Falha ao exportar dispositivos', variant: 'destructive' });
  } finally {
    setDevicesLoading(false);
  }
};

const handleImportDevices = async (ev: React.ChangeEvent<HTMLInputElement>) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  setDevicesLoading(true);
  try {
    const fd = new FormData();
    fd.append('file', file, file.name);

    const resp = await fetch(`${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}/api/devices/import`, {
      method: 'POST',
      body: fd
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Import failed:', txt);
      throw new Error('Falha na importação');
    }

    const json = await resp.json();
    console.log('Import result:', json);

    const summary = json.summary ?? json;
    toast({
      title: 'Importação concluída',
      description: `Inseridos: ${summary.inserted || 0} • Atualizados: ${summary.updated || 0} • Pulados: ${summary.skipped || 0}`
    });

    // opcional: recarregar a lista de dispositivos (se tiver um store ou rota)
    // await fetchDevices(); // adaptar conforme seu app
  } catch (err) {
    console.error('Erro ao importar devices:', err);
    toast({ title: 'Erro', description: 'Falha ao importar dispositivos', variant: 'destructive' });
  } finally {
    // limpa input
    (ev.target as HTMLInputElement).value = '';
    setDevicesLoading(false);
  }
};

  const [notifications, setNotifications] = useState<NotificationSettings>({
    deviceStatus: true,
    printerStatus: true,
    systemAlerts: true,
    taskReminders: true,
    emailNotifications: false,
    pushNotifications: true,
    soundEnabled: true
  });

  const [userSettings, setUserSettings] = useState<UserSettings>({
    name: user?.username || '',
    email: '',
    department: 'TI',
    refreshInterval: 30,
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo'
  });

  const [isSaving, setIsSaving] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedNotifications = localStorage.getItem('notificationSettings');
    const savedUserSettings = localStorage.getItem('userSettings');
    
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    }
    
    if (savedUserSettings) {
      setUserSettings(JSON.parse(savedUserSettings));
    }
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    
    try {
      // Save to localStorage
      localStorage.setItem('notificationSettings', JSON.stringify(notifications));
      localStorage.setItem('userSettings', JSON.stringify(userSettings));
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso!"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao salvar configurações",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = () => {
    const data = {
      notifications,
      userSettings,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'super-ips-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Sucesso",
      description: "Configurações exportadas com sucesso!"
    });
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        if (data.notifications) {
          setNotifications(data.notifications);
        }
        
        if (data.userSettings) {
          setUserSettings(data.userSettings);
        }
        
        toast({
          title: "Sucesso",
          description: "Configurações importadas com sucesso!"
        });
      } catch (error) {
        toast({
          title: "Erro",
          description: "Arquivo de configuração inválido",
          variant: "destructive"
        });
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleResetSettings = () => {
    setNotifications({
      deviceStatus: true,
      printerStatus: true,
      systemAlerts: true,
      taskReminders: true,
      emailNotifications: false,
      pushNotifications: true,
      soundEnabled: true
    });
    
    setUserSettings({
      name: user?.username || '',
      email: '',
      department: 'TI',
      refreshInterval: 30,
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo'
    });
    
    toast({
      title: "Sucesso",
      description: "Configurações restauradas para o padrão!"
    });
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Configurações
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Personalize sua experiência no sistema
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleResetSettings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Restaurar Padrão
          </Button>
          <Button 
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="bg-gradient-to-r from-indigo-600 to-purple-600"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Perfil do Usuário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nome</label>
              <Input
                value={userSettings.name}
                onChange={(e) => setUserSettings(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Seu nome completo"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Email</label>
              <Input
                type="email"
                value={userSettings.email}
                onChange={(e) => setUserSettings(prev => ({ ...prev, email: e.target.value }))}
                placeholder="seu.email@empresa.com"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Departamento</label>
              <Select 
                value={userSettings.department} 
                onValueChange={(value) => setUserSettings(prev => ({ ...prev, department: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TI">Tecnologia da Informação</SelectItem>
                  <SelectItem value="Financeiro">Financeiro</SelectItem>
                  <SelectItem value="RH">Recursos Humanos</SelectItem>
                  <SelectItem value="Vendas">Vendas</SelectItem>
                  <SelectItem value="Operações">Operações</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Aparência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDarkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <p className="font-medium">Modo Escuro</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Alternar entre tema claro e escuro
                  </p>
                </div>
              </div>
              <Switch checked={isDarkMode} onCheckedChange={toggleDarkMode} />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Idioma</label>
              <Select 
                value={userSettings.language} 
                onValueChange={(value) => setUserSettings(prev => ({ ...prev, language: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Fuso Horário</label>
              <Select 
                value={userSettings.timezone} 
                onValueChange={(value) => setUserSettings(prev => ({ ...prev, timezone: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                  <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5" />
                <div>
                  <p className="font-medium">Status de Dispositivos</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Notificar quando dispositivos ficarem offline
                  </p>
                </div>
              </div>
              <Switch 
                checked={notifications.deviceStatus} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, deviceStatus: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5" />
                <div>
                  <p className="font-medium">Status de Impressoras</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Notificar sobre problemas com impressoras
                  </p>
                </div>
              </div>
              <Switch 
                checked={notifications.printerStatus} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, printerStatus: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5" />
                <div>
                  <p className="font-medium">Alertas do Sistema</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Notificar sobre alertas críticos
                  </p>
                </div>
              </div>
              <Switch 
                checked={notifications.systemAlerts} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, systemAlerts: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5" />
                <div>
                  <p className="font-medium">Lembretes de Tarefas</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Notificar sobre prazos de tarefas
                  </p>
                </div>
              </div>
              <Switch 
                checked={notifications.taskReminders} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, taskReminders: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {notifications.soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                <div>
                  <p className="font-medium">Som das Notificações</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Reproduzir som ao receber notificações
                  </p>
                </div>
              </div>
              <Switch 
                checked={notifications.soundEnabled} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, soundEnabled: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Intervalo de Atualização (segundos)
              </label>
              <Select 
                value={userSettings.refreshInterval.toString()} 
                onValueChange={(value) => setUserSettings(prev => ({ ...prev, refreshInterval: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 segundos</SelectItem>
                  <SelectItem value="30">30 segundos</SelectItem>
                  <SelectItem value="60">1 minuto</SelectItem>
                  <SelectItem value="120">2 minutos</SelectItem>
                  <SelectItem value="300">5 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notificações por Email</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receber notificações por email
                </p>
              </div>
              <Switch 
                checked={notifications.emailNotifications} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailNotifications: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notificações Push</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receber notificações push no navegador
                </p>
              </div>
              <Switch 
                checked={notifications.pushNotifications} 
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, pushNotifications: checked }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Gerenciamento de Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Button variant="outline" onClick={handleExportData} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Exportar Configurações
            </Button>
            
            <div className="flex-1">
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="hidden"
                id="import-settings"
              />
              <Button 
                variant="outline" 
                onClick={() => document.getElementById('import-settings')?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar Configurações
              </Button>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            Exporte suas configurações para fazer backup ou importar em outro dispositivo.
          </p>
        </CardContent>
      </Card>
      {/* Devices Import/Export */}
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Database className="h-5 w-5" />
      Dispositivos (Export / Import)
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex flex-col md:flex-row gap-4">
      <Button variant="outline" onClick={downloadDevices} className="flex-1" disabled={devicesLoading}>
        <Download className="h-4 w-4 mr-2" />
        {devicesLoading ? 'Processando...' : 'Exportar Dispositivos (XLSX)'}
      </Button>

      <div className="flex-1">
        <input
          type="file"
          accept=".xlsx,.xls,.json"
          id="import-devices-file"
          onChange={handleImportDevices}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => document.getElementById('import-devices-file')?.click()}
          className="w-full"
          disabled={devicesLoading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {devicesLoading ? 'Processando...' : 'Importar Dispositivos'}
        </Button>
      </div>
    </div>

    <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
      Exporte a planilha de dispositivos ou importe uma planilha (XLSX) / JSON para inserir/atualizar dispositivos.
    </p>
  </CardContent>
</Card>

    </div>
  );
}