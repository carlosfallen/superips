import { useState, useEffect } from 'react';
import { Plus, Search, Filter, CheckCircle2, Clock, AlertCircle, Trash2, Edit3, Calendar, CheckSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { useToast } from '../hooks/use-toast';

interface Task {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  category: string;
  dueDate: string;
  createdAt: string;
  assignedTo?: string;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const { toast } = useToast();

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as const,
    category: '',
    dueDate: '',
    assignedTo: ''
  });

  // Load tasks from localStorage on component mount
  useEffect(() => {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    } else {
      // Sample tasks for demonstration
      const sampleTasks: Task[] = [
        {
          id: 1,
          title: 'Verificar impressoras do setor financeiro',
          description: 'Realizar manutenção preventiva nas impressoras HP do setor financeiro',
          priority: 'high',
          status: 'pending',
          category: 'Manutenção',
          dueDate: '2024-01-20',
          createdAt: '2024-01-15',
          assignedTo: 'João Silva'
        },
        {
          id: 2,
          title: 'Atualizar sistema de monitoramento',
          description: 'Implementar novas funcionalidades no sistema de monitoramento de rede',
          priority: 'medium',
          status: 'in-progress',
          category: 'Desenvolvimento',
          dueDate: '2024-01-25',
          createdAt: '2024-01-10',
          assignedTo: 'Maria Santos'
        },
        {
          id: 3,
          title: 'Backup dos servidores',
          description: 'Realizar backup completo dos servidores principais',
          priority: 'high',
          status: 'completed',
          category: 'Backup',
          dueDate: '2024-01-18',
          createdAt: '2024-01-12',
          assignedTo: 'Carlos Tech'
        }
      ];
      setTasks(sampleTasks);
      localStorage.setItem('tasks', JSON.stringify(sampleTasks));
    }
  }, []);

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  const handleCreateTask = () => {
    if (!newTask.title.trim()) {
      toast({
        title: "Erro",
        description: "O título da tarefa é obrigatório",
        variant: "destructive"
      });
      return;
    }

    const task: Task = {
      id: Date.now(),
      ...newTask,
      status: 'pending',
      createdAt: new Date().toISOString().split('T')[0]
    };

    setTasks(prev => [task, ...prev]);
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      category: '',
      dueDate: '',
      assignedTo: ''
    });
    setIsCreateModalOpen(false);
    
    toast({
      title: "Sucesso",
      description: "Tarefa criada com sucesso!"
    });
  };

  const handleUpdateTask = (taskId: number, updates: Partial<Task>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
    
    toast({
      title: "Sucesso",
      description: "Tarefa atualizada com sucesso!"
    });
  };

  const handleDeleteTask = (taskId: number) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    
    toast({
      title: "Sucesso",
      description: "Tarefa excluída com sucesso!"
    });
  };

  const handleToggleStatus = (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    let newStatus: Task['status'];
    if (task.status === 'pending') newStatus = 'in-progress';
    else if (task.status === 'in-progress') newStatus = 'completed';
    else newStatus = 'pending';

    handleUpdateTask(taskId, { status: newStatus });
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in-progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in-progress':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Gerenciamento de Tarefas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Organize e acompanhe suas tarefas de TI
          </p>
        </div>
        
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Tarefa
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar tarefas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="in-progress">Em Progresso</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Prioridades</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredTasks.map((task) => (
          <Card key={task.id} className="group hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => handleToggleStatus(task.id)}
                  />
                  <CardTitle className={`text-lg ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                    {task.title}
                  </CardTitle>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTask(task)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <Badge variant={getPriorityColor(task.priority)}>
                  {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa'}
                </Badge>
                <Badge variant={getStatusColor(task.status)}>
                  {getStatusIcon(task.status)}
                  <span className="ml-1">
                    {task.status === 'pending' ? 'Pendente' : 
                     task.status === 'in-progress' ? 'Em Progresso' : 'Concluída'}
                  </span>
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                {task.description}
              </p>
              
              <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                {task.category && (
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3" />
                    <span>{task.category}</span>
                  </div>
                )}
                
                {task.dueDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    <span>Prazo: {new Date(task.dueDate).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
                
                {task.assignedTo && (
                  <div className="flex items-center gap-2">
                    <span>Responsável: {task.assignedTo}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Nenhuma tarefa encontrada
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm || filterStatus !== 'all' || filterPriority !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Comece criando sua primeira tarefa'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Nova Tarefa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Título *</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Digite o título da tarefa"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Descrição</label>
                <Textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva a tarefa"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Prioridade</label>
                  <Select value={newTask.priority} onValueChange={(value: any) => setNewTask(prev => ({ ...prev, priority: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Categoria</label>
                  <Input
                    value={newTask.category}
                    onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="Ex: Manutenção"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Prazo</label>
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Responsável</label>
                  <Input
                    value={newTask.assignedTo}
                    onChange={(e) => setNewTask(prev => ({ ...prev, assignedTo: e.target.value }))}
                    placeholder="Nome do responsável"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateTask}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600"
                >
                  Criar Tarefa
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}