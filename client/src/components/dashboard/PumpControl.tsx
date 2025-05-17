import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { updatePumpStatus, getDeviceStatus, DeviceStatusResponse, updateOperationMode } from '@/lib/thingspeakApi';
import { Reading } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

// Constante para o valor de erro do sensor
const SENSOR_ERROR_VALUE = -127;

interface PumpControlProps {
  latestReading?: Reading;
  isLoading: boolean;
}

export function PumpControl({ latestReading, isLoading }: PumpControlProps) {
  const [isOn, setIsOn] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Desconectado');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  // Estado pendingSync removido pois não é usado na interface
  const [isAutomatic, setIsAutomatic] = useState<boolean>(true);
  // Estado para controlar operações muito frequentes (anti-oscilação)
  const [lastToggleTime, setLastToggleTime] = useState<number>(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true
  });

  const togglePumpMutation = useMutation({
    mutationFn: updatePumpStatus,
    onSuccess: (data) => {
      // Atualização imediata do estado local
      setIsOn(data.pumpStatus);
      setStatusText(data.pumpStatus ? 'Ligada' : 'Desligada');
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
    },
  });
  
  const toggleOperationModeMutation = useMutation({
    mutationFn: updateOperationMode,
    onSuccess: (data) => {
      // Atualização imediata do estado local
      setIsAutomatic(data.operationMode);
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
    },
  });

  // Atualizar com base no status do dispositivo (nova API)
  useEffect(() => {
    if (deviceStatusQuery.data && !togglePumpMutation.isPending && !toggleOperationModeMutation.isPending) {
      const statusData = deviceStatusQuery.data;
      
      // SEMPRE priorizar o estado em memória para feedback imediato
      if (statusData.memoryState) {
        setIsOn(statusData.memoryState.pumpStatus);
        setStatusText(statusData.memoryState.pumpStatus ? 'Ligada' : 'Desligada');
        setIsAutomatic(statusData.memoryState.operationMode);
        
        // Verificação de sincronização removida para interface mais limpa
      } else {
        // Fallback para o valor do banco se por algum motivo não temos estado em memória
        setIsOn(statusData.pumpStatus);
        setStatusText(statusData.pumpStatus ? 'Ligada' : 'Desligada');
        setIsAutomatic(statusData.operationMode);
      }
      
      // Atualizar timestamp - sempre usar o timestamp mais recente disponível
      const timestamp = statusData.memoryState?.timestamp || statusData.timestamp;
      if (timestamp) {
        const date = new Date(timestamp);
        setLastUpdate(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`);
      }
    }
  }, [deviceStatusQuery.data, togglePumpMutation.isPending, toggleOperationModeMutation.isPending]);
  
  // Manter compatibilidade com o componente original
  useEffect(() => {
    if (latestReading && !deviceStatusQuery.data && !togglePumpMutation.isPending) {
      setIsOn(latestReading.pump_status === 1);
      setStatusText(latestReading.pump_status === 1 ? 'Ligada' : 'Desligada');
      
      // Atualizar timestamp da última leitura
      if (latestReading.timestamp) {
        const date = new Date(latestReading.timestamp);
        setLastUpdate(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`);
      }
    }
  }, [latestReading, deviceStatusQuery.data, togglePumpMutation.isPending]);

  const handlePumpToggle = (newStatus: boolean) => {
    // Verificar se está em modo automático
    if (isAutomatic) {
      console.log('Ação ignorada: bomba em modo automático');
      // Quando em modo automático, o controle da bomba é feito pelo servidor 
      // baseado nos valores de pumpOnTimer e pumpOffTimer 
      // definidos no componente PumpFlowControl
      toast({
        title: "Modo automático ativo",
        description: "A bomba é controlada automaticamente pelos ciclos definidos",
        variant: "destructive",
      });
      return; // Não permitir controle manual quando em modo automático
    }
    
    // Verificar se já passou tempo suficiente desde a última atualização (3 segundos mínimo)
    const now = Date.now();
    const timeSinceLastToggle = now - lastToggleTime;
    const MIN_TOGGLE_INTERVAL = 3000; // 3 segundos para evitar oscilações
    
    if (timeSinceLastToggle < MIN_TOGGLE_INTERVAL) {
      console.log(`Ação ignorada: muito rápido (${timeSinceLastToggle}ms desde a última ação)`);
      return; // Ignorar comando muito frequente
    }
    
    // Atualizar timestamp do último toggle
    setLastToggleTime(now);
    
    // Atualização otimista imediata
    setIsOn(newStatus);
    setStatusText('Atualizando...');
    
    // Enviar para o servidor
    togglePumpMutation.mutate(newStatus);
  };

  // Classe CSS dinâmica para o card e os elementos visuais
  const pumpCardClass = isOn 
    ? 'control-card-active' 
    : 'control-card';
  
  const pumpIconBgClass = isOn 
    ? 'bg-gradient-to-r from-[#4caf50] to-[#2e7d32]' 
    : 'bg-gradient-to-r from-[#1e293b] to-[#111827]';
  
  const pumpIconClass = isOn 
    ? 'text-white glow-text' 
    : 'text-gray-400';
  
  const statusTextClass = isOn 
    ? 'text-green-400 glow-text' 
    : 'text-gray-400';
  
  const buttonClass = isOn 
    ? 'gradient-green' 
    : 'border-white/10';

  return (
    <div className={`${pumpCardClass} flex flex-col justify-between min-h-[200px] p-2 rounded-lg`}>
      <div className="flex flex-col mb-1">
        <div className="flex-1 min-w-0">
          <h4 className="text-white/90 text-sm font-medium tracking-wide uppercase truncate">Bomba d'água</h4>
          <div className={`text-sm font-light ${statusTextClass} mb-0.5 mt-0.5`}>
            {isLoading ? 'Carregando...' : statusText}
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-0.5">
            {lastUpdate && (
              <Badge variant="outline" className="text-[10px] text-white/60 border-white/10 h-4">
                <i className="fas fa-clock mr-0.5 text-[8px]"></i> {lastUpdate}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-white/40">
            Status: {togglePumpMutation.isPending ? 'Atualizando...' : 'Pronto'}
            {deviceStatusQuery.isLoading && !deviceStatusQuery.data && <span> (Conectando...)</span>}
          </div>
          
          {/* Switch para alternar entre os modos */}
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-[9px] ${!isAutomatic ? 'text-white/80 font-medium' : 'text-white/30'}`}>Manual</span>
            <div className="scale-[0.7] origin-left">
              <Switch
                checked={isAutomatic}
                onCheckedChange={(checked) => toggleOperationModeMutation.mutate(checked)}
                disabled={toggleOperationModeMutation.isPending}
              />
            </div>
            <span className={`text-[9px] ${isAutomatic ? 'text-white/80 font-medium' : 'text-white/30'}`}>Automático</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1 mt-1">
        <div>
          <Button
            variant={isOn ? "default" : "outline"}
            className={`w-full py-2 ${buttonClass} rounded-md shadow-md transition-all duration-300`}
            onClick={() => handlePumpToggle(!isOn)}
            disabled={togglePumpMutation.isPending || (latestReading?.temperature === SENSOR_ERROR_VALUE) || isAutomatic}
          >
            <i className={`fas ${isOn ? 'fa-toggle-off' : 'fa-toggle-on'} mr-1`}></i>
            <span className="text-xs">{isOn ? 'Desligar' : 'Ligar'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
