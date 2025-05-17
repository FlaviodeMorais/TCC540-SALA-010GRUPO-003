import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { 
  getDeviceStatus, 
  DeviceStatusResponse
} from '@/lib/thingspeakApi';
import {
  updatePumpOnTimer,
  updatePumpOffTimer,
  getPumpCycleState,
  PumpCycleState
} from '@/lib/thingspeakApiFunctions';
import { Reading } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface PumpFlowControlProps {
  latestReading?: Reading;
  isLoading: boolean;
}

export function PumpFlowControl({ latestReading, isLoading }: PumpFlowControlProps) {
  const { toast } = useToast();
  const [pumpOnTimer, setPumpOnTimer] = useState<number>(30);  // Valor padrão para evitar undefined
  const [pumpOffTimer, setPumpOffTimer] = useState<number>(30); // Valor padrão para evitar undefined
  const [lastUpdate, setLastUpdate] = useState<string>('');
  
  // Estados para as barras de progresso
  const [pumpOnCycleProgress, setPumpOnCycleProgress] = useState<number>(0);
  const [pumpOffCycleProgress, setPumpOffCycleProgress] = useState<number>(0);
  const [isPumpActive, setIsPumpActive] = useState<boolean>(false);
  const [currentCycleTime, setCurrentCycleTime] = useState<number>(0);
  const [cycleIsActive, setCycleIsActive] = useState<boolean>(false);
  
  // Estado para rastrear se o modo automático está ativado
  const [isAutomaticMode, setIsAutomaticMode] = useState<boolean>(false);
  
  // Estado para controlar se os valores foram recebidos do servidor
  const [valuesReceived, setValuesReceived] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true
  });
  
  // Consulta para o estado do ciclo da bomba em modo automático
  const pumpCycleQuery = useQuery({
    queryKey: ['/api/automation/pump-cycle'],
    queryFn: getPumpCycleState,
    refetchInterval: 1000,  // Atualiza a cada 1 segundo para maior precisão
    refetchIntervalInBackground: true,
    enabled: isAutomaticMode, // Só consulta quando o modo automático está ativado
    retry: 0 // Não tentar novamente em caso de falha
  });

  // Mutation para atualizar o timer de bomba ligada
  const updatePumpOnTimerMutation = useMutation({
    mutationFn: updatePumpOnTimer,
    onSuccess: (data: { success: boolean; pumpOnTimer: number }) => {
      // Atualização imediata do estado local
      setPumpOnTimer(data.pumpOnTimer);
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/pump-cycle'] });

      toast({
        title: "Timer de bomba ligada atualizado",
        description: `Definido para ${data.pumpOnTimer} segundos`,
      });
    },
  });

  // Mutation para atualizar o timer de bomba desligada
  const updatePumpOffTimerMutation = useMutation({
    mutationFn: updatePumpOffTimer,
    onSuccess: (data: { success: boolean; pumpOffTimer: number }) => {
      // Atualização imediata do estado local
      setPumpOffTimer(data.pumpOffTimer);
      
      // Registrar hora da atualização
      const now = new Date();
      setLastUpdate(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      
      // Invalidar ambos os caches
      queryClient.invalidateQueries({ queryKey: ['/api/readings/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/pump-cycle'] });

      toast({
        title: "Timer de bomba desligada atualizado",
        description: `Definido para ${data.pumpOffTimer} segundos`,
      });
    },
  });

  // Atualizar com base no status do dispositivo - apenas na primeira carga
  useEffect(() => {
    if (deviceStatusQuery.data && !valuesReceived) {
      const statusData = deviceStatusQuery.data as DeviceStatusResponse;
      
      // Apenas inicializar os valores da primeira vez, não sobrescrever inputs do usuário
      if (statusData.memoryState) {
        if (statusData.memoryState.pumpOnTimer !== undefined) {
          setPumpOnTimer(statusData.memoryState.pumpOnTimer);
          setValuesReceived(true);
        }
        
        if (statusData.memoryState.pumpOffTimer !== undefined) {
          setPumpOffTimer(statusData.memoryState.pumpOffTimer);
          setValuesReceived(true);
        }
        
        setIsPumpActive(statusData.memoryState.pumpStatus || false);
      }
    }
  }, [deviceStatusQuery.data, valuesReceived]);

  // Efeito para obter o modo automático do dispositivo
  useEffect(() => {
    if (deviceStatusQuery.data) {
      const statusData = deviceStatusQuery.data as DeviceStatusResponse;
      // Verificar se o modo de operação é automático (true) ou manual (false)
      const isAuto = statusData.memoryState?.operationMode || false;
      setIsAutomaticMode(isAuto);
      
      // Se mudar para manual, resetar contadores
      if (!isAuto) {
        setCurrentCycleTime(0);
        setPumpOnCycleProgress(0);
        setPumpOffCycleProgress(0);
      }
    }
  }, [deviceStatusQuery.data]);

  // Efeito para atualizar o estado do ciclo da bomba a partir dos dados da API
  useEffect(() => {
    if (isAutomaticMode && pumpCycleQuery.data && pumpCycleQuery.data.success) {
      const cycleData = pumpCycleQuery.data;
      
      // Sempre atualizar o status da bomba com base nos dados do ciclo
      setIsPumpActive(cycleData.pumpStatus);
      
      // Atualizar o estado da variável cycleIsActive
      setCycleIsActive(cycleData.active);
      
      // Se o ciclo estiver ativo, atualizar os dados de progresso
      if (cycleData.active) {
        // Tempo total do ciclo (baseado no status da bomba)
        const totalCycleTime = cycleData.currentTimerTotal;
        
        // Calcular o tempo atual do ciclo com base no tempo restante
        const elapsedTime = totalCycleTime - cycleData.timeRemaining;
        setCurrentCycleTime(elapsedTime);
        
        // Calcular o progresso percentual com base nos dados precisos do servidor
        if (cycleData.pumpStatus) {
          // Bomba ligada - atualizar a barra de progresso ON
          // Usamos proporção inversa para que a barra "encha" ao invés de "esvaziar"
          const progressValue = Math.min(100, (elapsedTime / totalCycleTime) * 100);
          console.log(`Bomba ligada - Progresso: ${progressValue.toFixed(1)}% (${elapsedTime}s/${totalCycleTime}s)`);
          setPumpOnCycleProgress(progressValue);
          setPumpOffCycleProgress(0);
        } else {
          // Bomba desligada - atualizar a barra de progresso OFF
          // Usamos proporção inversa para que a barra "encha" ao invés de "esvaziar"
          const progressValue = Math.min(100, (elapsedTime / totalCycleTime) * 100);
          console.log(`Bomba desligada - Progresso: ${progressValue.toFixed(1)}% (${elapsedTime}s/${totalCycleTime}s)`);
          setPumpOffCycleProgress(progressValue);
          setPumpOnCycleProgress(0);
        }
      } else {
        // Mesmo sem ciclo ativo, garantir que o status visual da bomba está correto
        if (cycleData.pumpStatus) {
          setPumpOnCycleProgress(100);
          setPumpOffCycleProgress(0);
        } else {
          setPumpOffCycleProgress(100);
          setPumpOnCycleProgress(0);
        }
      }
    } else {
      // Em modo manual, sempre mostramos as barras completamente preenchidas
      // dependendo do estado atual da bomba (ligada ou desligada)
      if (isPumpActive) {
        // Bomba ligada - a barra ON fica 100% preenchida com verde
        setPumpOnCycleProgress(100);
        setPumpOffCycleProgress(0);
      } else {
        // Bomba desligada - a barra OFF fica 100% preenchida com verde
        setPumpOffCycleProgress(100);
        setPumpOnCycleProgress(0);
      }
      
      return () => {}; // Nenhum intervalo para limpar
    }
  }, [isAutomaticMode, pumpCycleQuery.data, isPumpActive]);

  // Efeito para atualizar o status visual da bomba com base nos dados recebidos do ThingSpeak
  useEffect(() => {
    if (deviceStatusQuery.data) {
      const statusData = deviceStatusQuery.data;
      let newPumpStatus: boolean;
      
      // Verificar o status da bomba dos dados do servidor
      if (statusData.memoryState && statusData.memoryState.pumpStatus !== undefined) {
        newPumpStatus = statusData.memoryState.pumpStatus;
      } else if (statusData.pumpStatus !== undefined) {
        newPumpStatus = statusData.pumpStatus;
      } else {
        return; // Não temos dados suficientes
      }
      
      // Se o status da bomba mudou, reiniciar o progresso da barra
      if (newPumpStatus !== isPumpActive) {
        // Quando a bomba liga, zeramos o progresso da barra ON para começar a encher
        // Quando a bomba desliga, zeramos o progresso da barra OFF para começar a encher
        if (newPumpStatus) {
          setPumpOnCycleProgress(0);
        } else {
          setPumpOffCycleProgress(0);
        }
      }
      
      // Atualizar o estado atual da bomba
      setIsPumpActive(newPumpStatus);
    }
  }, [deviceStatusQuery.data, isPumpActive]);

  const handlePumpOnTimerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Se o usuário limpar completamente o campo, preserve-o vazio
    if (inputValue === '') {
      setPumpOnTimer('' as unknown as number);
      return;
    }
    
    // Garantir que apenas números positivos são aceitos
    if (/^\d+$/.test(inputValue)) {
      const value = parseInt(inputValue, 10);
      if (value >= 0) {
        // Definir explicitamente que os valores foram recebidos para evitar sobrescrita
        setValuesReceived(true);
        setPumpOnTimer(value);
        console.log('Timer de bomba ligada definido para:', value);
      }
    }
  };

  const handlePumpOffTimerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Se o usuário limpar completamente o campo, preserve-o vazio
    if (inputValue === '') {
      setPumpOffTimer('' as unknown as number);
      return;
    }
    
    // Garantir que apenas números positivos são aceitos
    if (/^\d+$/.test(inputValue)) {
      const value = parseInt(inputValue, 10);
      if (value >= 0) {
        // Definir explicitamente que os valores foram recebidos para evitar sobrescrita
        setValuesReceived(true);
        setPumpOffTimer(value);
        console.log('Timer de bomba desligada definido para:', value);
      }
    }
  };

  const handlePumpOnTimerSubmit = () => {
    updatePumpOnTimerMutation.mutate(pumpOnTimer);
  };

  const handlePumpOffTimerSubmit = () => {
    updatePumpOffTimerMutation.mutate(pumpOffTimer);
  };

  // Obter o tempo restante do ciclo atual do serviço de automação
  // Função para forçar o início do ciclo automático
  const forceCycleStart = async () => {
    if (!isAutomaticMode) return;
    
    try {
      console.log('🔄 Forçando início do ciclo automático...');
      const response = await fetch('/api/automation/force-cycle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Ciclo automático iniciado com sucesso:', data);
        toast({
          title: "Ciclo automático iniciado",
          description: "O ciclo da bomba foi iniciado manualmente",
        });
        // Atualizar dados do ciclo
        pumpCycleQuery.refetch();
      }
    } catch (error) {
      console.error('Erro ao iniciar ciclo automático:', error);
      toast({
        title: "Erro ao iniciar ciclo",
        description: "Não foi possível iniciar o ciclo automático",
        variant: "destructive"
      });
    }
  };

  const getRemainingTime = (): string => {
    if (!isAutomaticMode || !pumpCycleQuery.data || !pumpCycleQuery.data.success || !pumpCycleQuery.data.active) {
      return `${isPumpActive ? pumpOnTimer : pumpOffTimer}s`;
    }
    
    const cycleData = pumpCycleQuery.data;
    const remaining = cycleData.timeRemaining;
    
    // Apenas o valor restante em segundos
    return `${remaining}s`;
  };

  // Definir classes de status para indicadores visuais
  const pumpStatusText = isPumpActive ? "Bomba Ligada" : "Bomba Desligada";
  const pumpStatusClass = isPumpActive 
    ? "text-green-400 animate-pulse" // Pulse animation quando ligada
    : "text-gray-400";
  
  const timerStatusText = isAutomaticMode ? "Ciclos ATIVOS" : "Ciclos INATIVOS";
  const timerStatusClass = isAutomaticMode ? "text-blue-400" : "text-amber-400/70";
  
  // Animação suave para transição
  useEffect(() => {
    // Essa mudança de estado fará a animação CSS funcionar
    // quando isPumpActive mudar
  }, [isPumpActive]);
  
  // Indicador de estado da bomba - ícone e cor de fundo
  const pumpIconBgClass = isPumpActive
    ? "bg-gradient-to-r from-[#4caf50] to-[#2e7d32] transition-all duration-500" // Verde quando ligado
    : "bg-gradient-to-r from-[#1e293b] to-[#111827] transition-all duration-500"; // Cinza escuro quando desligado
    
  return (
    <div className="control-card flex flex-col justify-between min-h-[200px] p-2 rounded-lg">
      <div className="flex flex-col">
        <h4 className="text-white/90 text-sm font-medium tracking-wide uppercase truncate">Controle de Ciclos</h4>
        <div className={`text-sm font-light ${pumpStatusClass} mb-0.5 mt-0.5 flex items-center`}>
          {isLoading ? 'Carregando...' : pumpStatusText}
          {isAutomaticMode && (
            <Badge variant="outline" className="ml-1 text-[10px] text-blue-400 border-blue-400/30 bg-blue-400/5 h-4">
              Auto
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 mb-0.5">
          {lastUpdate && (
            <Badge variant="outline" className="text-[10px] text-white/60 border-white/10 h-4">
              <i className="fas fa-clock mr-0.5 text-[8px]"></i> {lastUpdate}
            </Badge>
          )}
        </div>
      </div>
      
      <div className="flex flex-col gap-2 sm:gap-3 mt-2 sm:mt-3">
        {/* Ciclo da Bomba Ligada (Field7) */}
        <div className="mb-1 sm:mb-2">
          <div className="flex items-center justify-between gap-1 mb-0.5 sm:mb-1">
            <div className="flex items-center gap-1">
              <Input
                id="pump-on-timer"
                type="number"
                value={valuesReceived ? pumpOnTimer : ''}
                onChange={handlePumpOnTimerChange}
                className="bg-white/5 border-white/10 text-white h-6 sm:h-7 w-12 sm:w-16 text-xs sm:text-sm px-1"
                placeholder="Valor..."
              />
              <Button 
                size="sm" 
                onClick={handlePumpOnTimerSubmit}
                disabled={updatePumpOnTimerMutation.isPending}
                className="h-6 sm:h-7 w-6 sm:w-7 p-0 flex items-center justify-center"
                title="Salvar"
              >
                <i className="fas fa-save text-[10px] sm:text-xs"></i>
              </Button>
              <Label htmlFor="pump-on-timer" className="text-[10px] xs:text-xs text-white/70 whitespace-nowrap ml-1 sm:ml-2">Bomba Ligada (s)</Label>
            </div>
            <div className="flex items-center">
              <span className="text-[10px] xs:text-xs text-white/70 font-medium whitespace-nowrap">
                {isAutomaticMode && isPumpActive ? getRemainingTime() : `${pumpOnTimer}s`}
              </span>
            </div>
          </div>
          <Progress 
            value={isAutomaticMode && pumpCycleQuery.data?.active && isPumpActive 
              ? pumpOnCycleProgress  // Modo automático com ciclo ativo e bomba ligada - usar progresso calculado
              : (isPumpActive ? 100 : 0)  // Outros casos - 100% se ativo, 0% se inativo
            }
            className="h-1.5 sm:h-2 bg-white/20 transition-all duration-500"
            indicatorColor="bg-gray-400"
          />
        </div>
        
        {/* Ciclo da Bomba Desligada (Field8) */}
        <div className="mb-1 sm:mb-2">
          <div className="flex items-center justify-between gap-1 mb-0.5 sm:mb-1">
            <div className="flex items-center gap-1">
              <Input
                id="pump-off-timer"
                type="number"
                value={valuesReceived ? pumpOffTimer : ''}
                onChange={handlePumpOffTimerChange}
                className="bg-white/5 border-white/10 text-white h-6 sm:h-7 w-12 sm:w-16 text-xs sm:text-sm px-1"
                placeholder="Valor..."
              />
              <Button 
                size="sm" 
                onClick={handlePumpOffTimerSubmit}
                disabled={updatePumpOffTimerMutation.isPending}
                className="h-6 sm:h-7 w-6 sm:w-7 p-0 flex items-center justify-center"
                title="Salvar"
              >
                <i className="fas fa-save text-[10px] sm:text-xs"></i>
              </Button>
              <Label htmlFor="pump-off-timer" className="text-[10px] xs:text-xs text-white/70 whitespace-nowrap ml-1 sm:ml-2">Bomba Desligada (s)</Label>
            </div>
            <div className="flex items-center">
              <span className="text-[10px] xs:text-xs text-white/70 font-medium whitespace-nowrap">
                {isAutomaticMode && !isPumpActive ? getRemainingTime() : `${pumpOffTimer}s`}
              </span>
            </div>
          </div>
          <Progress 
            value={isAutomaticMode && pumpCycleQuery.data?.active && !isPumpActive 
              ? pumpOffCycleProgress // Modo automático com ciclo ativo e bomba desligada - usar progresso calculado
              : (!isPumpActive ? 100 : 0) // Outros casos - 100% se inativo, 0% se ativo 
            }
            className="h-1.5 sm:h-2 bg-white/20 transition-all duration-500"
            indicatorColor="bg-gray-400"
          />
        </div>

        {/* Botão de Iniciar Ciclo Automático removido conforme solicitado */}
      </div>
    </div>
  );
}