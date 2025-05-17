import { useEffect, useState } from 'react';
import { formatDateTime, calculateUptimeDays } from '@/lib/utils';
import { Reading } from '@shared/schema';
import { getSystemUptime, getDeviceStatus, DeviceStatusResponse, forceDeviceSync } from '@/lib/thingspeakApi';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

// Constante para o valor de erro do sensor
const SENSOR_ERROR_VALUE = -127;

interface SystemStatusCardProps {
  latestReading?: Reading;
  isLoading: boolean;
}

export function SystemStatusCard({ latestReading, isLoading }: SystemStatusCardProps) {
  const [uptime, setUptime] = useState<string>('0 dias');
  const [lastReadingTime, setLastReadingTime] = useState<string>('-');
  const [connectionStatus, setConnectionStatus] = useState<'stable' | 'unstable' | 'disconnected'>('stable');
  const [isLoadingUptime, setIsLoadingUptime] = useState<boolean>(true);
  const [pendingSync, setPendingSync] = useState<boolean>(false);
  const { toast } = useToast();

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true
  });
  
  // Mutação para forçar a sincronização quando travado
  const syncMutation = useMutation({
    mutationFn: forceDeviceSync,
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Sincronização forçada",
          description: data.message || "Estado sincronizado com sucesso!",
          variant: "default"
        });
        
        // Forçar nova consulta do estado dos dispositivos
        deviceStatusQuery.refetch();
      } else {
        toast({
          title: "Erro de sincronização",
          description: data.message || "Não foi possível forçar a sincronização",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Erro de sincronização",
        description: "Não foi possível forçar a sincronização",
        variant: "destructive"
      });
    }
  });

  // Buscar o uptime do sistema a partir da primeira leitura
  useEffect(() => {
    async function fetchSystemUptime() {
      try {
        setIsLoadingUptime(true);
        const response = await getSystemUptime();
        
        if (response.success && response.firstReadingDate) {
          const firstReadingDate = new Date(response.firstReadingDate);
          const days = calculateUptimeDays(firstReadingDate);
          setUptime(`${days} dias`);
        } else {
          setUptime('N/D');
        }
      } catch (error) {
        console.error('Failed to fetch system uptime:', error);
        setUptime('N/D');
      } finally {
        setIsLoadingUptime(false);
      }
    }
    
    fetchSystemUptime();
  }, []);

  // Update last reading time when latestReading changes
  useEffect(() => {
    if (latestReading && latestReading.timestamp) {
      const timestampDate = latestReading.timestamp instanceof Date 
        ? latestReading.timestamp 
        : new Date(latestReading.timestamp);
        
      setLastReadingTime(formatDateTime(timestampDate));
      
      // Se a temperatura for o valor de erro do sensor, marcar a conexão como instável
      if (latestReading.temperature === SENSOR_ERROR_VALUE) {
        setConnectionStatus('unstable');
      } else {
        setConnectionStatus('stable');
      }
    } else if (!isLoading) {
      setConnectionStatus('disconnected');
    }
  }, [latestReading, isLoading]);

  // Verificar status de sincronização
  useEffect(() => {
    if (deviceStatusQuery.data) {
      const statusData = deviceStatusQuery.data;
      
      // Verificar se pendingSync já vem definido do servidor
      if (statusData.pendingSync !== undefined) {
        setPendingSync(statusData.pendingSync);
      }
      // Se tivermos acesso a memoryState, usamos ele como base para verificação
      else if (statusData.memoryState) {
        // Ler estados em memória
        const memoryPumpStatus = statusData.memoryState.pumpStatus;
        const memoryHeaterStatus = statusData.memoryState.heaterStatus;
        
        // Ler estados do banco/ThingSpeak
        // Se databaseState não tiver as propriedades, usamos o estado principal
        const dbPumpStatus = statusData.databaseState?.pumpStatus !== undefined 
          ? statusData.databaseState.pumpStatus 
          : statusData.pumpStatus;
        
        const dbHeaterStatus = statusData.databaseState?.heaterStatus !== undefined
          ? statusData.databaseState.heaterStatus
          : statusData.heaterStatus;
        
        // Comparar estados da memória e banco para detectar sincronização pendente
        const isPendingSync = memoryPumpStatus !== dbPumpStatus || memoryHeaterStatus !== dbHeaterStatus;
        
        setPendingSync(isPendingSync);
      } else {
        // Se não conseguimos determinar, assumimos que está sincronizado
        setPendingSync(false);
      }
    }
  }, [deviceStatusQuery.data]);

  // Classes CSS para o card e os elementos visuais (não muda com o status)
  const statusCardClass = 'control-card';
  
  // Classe para o texto baseada no estado
  const statusTextClass = connectionStatus === 'stable' 
    ? 'text-green-400' 
    : connectionStatus === 'unstable'
      ? 'text-yellow-400'
      : 'text-gray-400';

  // Mapeamento de cores para o status da conexão
  const getConnectionStatusClass = () => {
    switch (connectionStatus) {
      case 'stable':
        return 'bg-green-500/20 text-green-400';
      case 'unstable':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'disconnected':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  // Mapeamento de texto para o status da conexão
  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'stable':
        return 'Estável';
      case 'unstable':
        return 'Instável';
      case 'disconnected':
        return 'Desconectada';
      default:
        return 'Desconhecido';
    }
  };

  return (
    <div className={`${statusCardClass} flex flex-col justify-between min-h-[200px] p-2 rounded-lg`}>
      <div className="flex flex-col mb-1">
        <div className="flex-1 min-w-0">
          <h4 className="text-white/90 text-sm font-medium tracking-wide uppercase truncate">Status do Sistema</h4>
          <div className={`text-sm font-light ${statusTextClass} mb-0.5 mt-0.5 flex items-center gap-1`}>
            <span>{isLoading ? 'Carregando...' : 'Sistema Online'}</span>
            {!isLoading && (
              <span className={`inline-flex h-2 w-2 rounded-full animate-pulse ${connectionStatus === 'stable' ? 'bg-green-500' : connectionStatus === 'unstable' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-0.5">
            <span className="text-[10px] font-medium bg-white/5 px-1 py-0.5 rounded-md text-white/90 border border-white/10">
              <i className="fas fa-server mr-0.5 text-[8px]"></i> {isLoadingUptime ? 'Calculando...' : `Online há ${uptime}`}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1.5">
        {/* Status da Conexão */}
        <div className="flex flex-col p-1.5 bg-black/20 rounded-md">
          <span className="text-white/70 text-xs mb-0.5">Conexão ThingSpeak</span>
          <div className="flex items-center">
            <span className={cn(
              "px-1 py-0.5 text-xs rounded-full flex items-center gap-1",
              getConnectionStatusClass()
            )}>
              <i className="fas fa-circle text-[8px]"></i>
              {getConnectionStatusText()}
            </span>
          </div>
        </div>
        
        {/* Última Leitura */}
        <div className="flex flex-col p-1.5 bg-black/20 rounded-md">
          <span className="text-white/70 text-xs mb-0.5">Última atualização</span>
          <span className="text-white text-xs flex items-center gap-1">
            <i className="fas fa-clock text-white/30 text-[10px]"></i>
            {lastReadingTime}
          </span>
        </div>
      </div>
    </div>
  );
}