import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { updateHeaterStatus, getDeviceStatus, DeviceStatusResponse } from '@/lib/thingspeakApi';
import { updateTargetTemperature } from '@/lib/thingspeakApiFunctions';
import { Reading } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumber } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Constante para o valor de erro do sensor
const SENSOR_ERROR_VALUE = -127;

interface HeaterControlProps {
  latestReading?: Reading;
  isLoading: boolean;
  minTemp?: number;
  maxTemp?: number;
}

export function HeaterControl({ 
  latestReading, 
  isLoading,
  minTemp = 24,
  maxTemp = 28
}: HeaterControlProps) {
  const { toast } = useToast();
  const [isOn, setIsOn] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Desconectado');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [pendingSync, setPendingSync] = useState<boolean>(false);
  const [targetTemp, setTargetTemp] = useState<number>(25); // Valor padrão ajustado para 25°C
  // Estado para controlar operações muito frequentes (anti-oscilação)
  const [lastToggleTime, setLastToggleTime] = useState<number>(0);
  const queryClient = useQueryClient();

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true
  });

  const toggleHeaterMutation = useMutation({
    mutationFn: updateHeaterStatus,
    onSuccess: (data) => {
      // Atualização imediata do estado local
      setIsOn(data.heaterStatus);
      setStatusText(data.heaterStatus ? 'Ligado' : 'Desligado');
      setPendingSync(true); // Indica que há uma sincronização pendente
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
    },
  });
  
  // Mutation para atualizar a temperatura alvo
  const updateTargetTempMutation = useMutation({
    mutationFn: updateTargetTemperature,
    onSuccess: (data: { success: boolean; targetTemp: number }) => {
      // Atualização imediata do estado local
      setTargetTemp(data.targetTemp);
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });

      toast({
        title: "Temperatura alvo atualizada",
        description: `Definida para ${data.targetTemp % 1 === 0 ? data.targetTemp.toFixed(0) : data.targetTemp.toFixed(1)}°C`,
      });
    },
  });

  // Atualizar com base no status do dispositivo (nova API)
  useEffect(() => {
    if (deviceStatusQuery.data && !toggleHeaterMutation.isPending) {
      const statusData = deviceStatusQuery.data;
      
      // SEMPRE priorizar o estado em memória para feedback imediato
      if (statusData.memoryState) {
        setIsOn(statusData.memoryState.heaterStatus);
        setStatusText(statusData.memoryState.heaterStatus ? 'Ligado' : 'Desligado');
        
        // Atualizar a temperatura alvo a partir do backend (valor padrão 25°C)
        if (statusData.memoryState.targetTemp !== undefined) {
          // Usar console.log para depuração
          console.log('Temperatura alvo atualizada do servidor:', statusData.memoryState.targetTemp);
          setTargetTemp(statusData.memoryState.targetTemp);
        }
        
        // Verificar se há sincronização pendente comparando os estados
        const memoryState = statusData.memoryState.heaterStatus;
        const dbState = statusData.heaterStatus;
        
        // Se os estados são diferentes, então há uma sincronização pendente
        setPendingSync(memoryState !== dbState);
      } else {
        // Fallback para o valor do banco se por algum motivo não temos estado em memória
        setIsOn(statusData.heaterStatus);
        setStatusText(statusData.heaterStatus ? 'Ligado' : 'Desligado');
        setPendingSync(false);
      }
      
      // Atualizar timestamp - sempre usar o timestamp mais recente disponível
      const timestamp = statusData.memoryState?.timestamp || statusData.timestamp;
      if (timestamp) {
        const date = new Date(timestamp);
        setLastUpdate(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`);
      }
    }
  }, [deviceStatusQuery.data, toggleHeaterMutation.isPending]);
  
  // Manter compatibilidade com o componente original
  useEffect(() => {
    if (latestReading && !deviceStatusQuery.data && !toggleHeaterMutation.isPending) {
      setIsOn(latestReading.heater_status === 1);
      setStatusText(latestReading.heater_status === 1 ? 'Ligado' : 'Desligado');
      
      // Atualizar timestamp da última leitura
      if (latestReading.timestamp) {
        const date = new Date(latestReading.timestamp);
        setLastUpdate(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`);
      }
    }
  }, [latestReading, deviceStatusQuery.data, toggleHeaterMutation.isPending]);

  const handleHeaterToggle = (newStatus: boolean) => {
    // Verificar se já passou tempo suficiente desde a última atualização (3 segundos mínimo)
    const now = Date.now();
    const timeSinceLastToggle = now - lastToggleTime;
    const MIN_TOGGLE_INTERVAL = 3000; // 3 segundos para evitar oscilações
    
    if (timeSinceLastToggle < MIN_TOGGLE_INTERVAL) {
      console.log(`Ação ignorada: muito rápido (${timeSinceLastToggle}ms desde a última ação)`);
      return; // Ignorar comando muito frequente
    }
    
    // O aquecedor pode ser alterado independentemente do modo de operação
    // Nenhuma verificação ou bloqueio é necessário
    
    // Atualizar timestamp do último toggle
    setLastToggleTime(now);
    
    // Atualização otimista imediata
    setIsOn(newStatus);
    setStatusText('Atualizando...');
    
    // Enviar para o servidor
    toggleHeaterMutation.mutate(newStatus);
  };
  
  const handleTargetTempChange = (value: number[]) => {
    const newValue = value[0];
    if (newValue !== targetTemp) {
      setTargetTemp(newValue);
    }
  };

  const handleTargetTempCommit = () => {
    console.log(`Enviando nova temperatura alvo: ${targetTemp}°C`);
    updateTargetTempMutation.mutate(targetTemp);
  };

  // Removido check de modo automático - o aquecedor deve funcionar independentemente do modo
  
  // Classe CSS dinâmica para o card e os elementos visuais baseada no estado atual
  const heaterCardClass = isOn 
    ? 'control-card-active' 
    : 'control-card';
  
  const heaterIconBgClass = isOn 
    ? 'bg-gradient-to-r from-[#ef5350] to-[#d32f2f]' 
    : 'bg-gradient-to-r from-[#1e293b] to-[#111827]';
  
  const heaterIconClass = isOn 
    ? 'text-white glow-text' 
    : 'text-gray-400';
  
  const statusTextClass = isOn 
    ? 'text-orange-400 glow-text' 
    : 'text-gray-400';
  
  const buttonClass = isOn 
    ? 'gradient-orange' 
    : 'border-white/10';

  // Removendo o indicador de sincronização para UI mais limpa
  const syncIndicator = null;

  return (
    <div className={`${heaterCardClass} flex flex-col justify-between min-h-[200px] p-2 rounded-lg`}>
      <div className="flex flex-col mb-1">
        <div className="flex-1 min-w-0">
          <h4 className="text-white/90 text-sm font-medium tracking-wide uppercase truncate">Aquecedor</h4>
          <div className={`text-sm font-light ${statusTextClass} mb-0.5 mt-0.5`}>
            {isLoading ? 'Carregando...' : statusText}
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-0.5">
            <span className="text-[10px] font-medium bg-white/5 px-1 py-0.5 rounded-md text-white/90 border border-white/10">
              <i className="fas fa-hand-paper mr-0.5 text-[8px]"></i> Controle Manual
            </span>

            {lastUpdate && (
              <Badge variant="outline" className="text-[10px] text-white/60 border-white/10 h-4">
                <i className="fas fa-clock mr-0.5 text-[8px]"></i> {lastUpdate}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-white/40">
            Status: {toggleHeaterMutation.isPending ? 'Atualizando...' : 'Pronto'}
            {deviceStatusQuery.isLoading && !deviceStatusQuery.data && <span> (Conectando...)</span>}
            {syncIndicator}
          </div>
          
          {/* Temperatura Alvo (Field6) */}
          <div className="mt-1">
            <div className="flex justify-between items-center mb-0.5">
              <Label htmlFor="target-temp" className="text-[10px] text-white/70">Temperatura Alvo (°C)</Label>
              <span className="text-[10px] text-orange-400">{targetTemp % 1 === 0 ? targetTemp.toFixed(0) : targetTemp.toFixed(1)}°C</span>
            </div>
            <div className="flex items-center gap-1">
              <Slider
                id="target-temp"
                defaultValue={[targetTemp]}
                min={20}
                max={35}
                step={0.5}
                value={[targetTemp]}
                onValueChange={handleTargetTempChange}
                onValueCommit={handleTargetTempCommit}
                disabled={updateTargetTempMutation.isPending}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1 mt-1">
        <div>
          <Button
            variant={isOn ? "default" : "outline"}
            className={`w-full py-2 ${buttonClass} rounded-md shadow-md transition-all duration-300`}
            onClick={() => handleHeaterToggle(!isOn)}
            disabled={toggleHeaterMutation.isPending || (latestReading?.temperature === SENSOR_ERROR_VALUE)}
            title={isOn ? "Desligar aquecedor" : "Ligar aquecedor"}
          >
            <i className={`fas ${isOn ? 'fa-toggle-off' : 'fa-toggle-on'} mr-1`}></i>
            <span className="text-xs">{isOn ? 'Desligar' : 'Ligar'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
