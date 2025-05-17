import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useQuery } from "@tanstack/react-query";
import { getLatestReadings, getDeviceStatus } from "@/lib/thingspeakApi";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSystemContext } from '@/contexts/SystemContext';

// Compartilhado com o Sidebar.tsx
const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: 'fas fa-tachometer-alt'
  },
  // Removido a página de Fonte de Dados
  {
    href: '/settings',
    label: 'Configurações',
    icon: 'fas fa-cogs'
  }
];

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [previousTemp, setPreviousTemp] = useState<number | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [pumpStatus, setPumpStatus] = useState<boolean>(false);
  const [heaterStatus, setHeaterStatus] = useState<boolean>(false);
  
  // Obter o nome do sistema do contexto
  const { systemName } = useSystemContext();
  
  // Buscar dados para o status do sistema e valores monitorados
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['/api/readings/latest/sidebar'],
    queryFn: () => getLatestReadings(1),
    refetchInterval: 300000, // Atualizar a cada 5 minutos (300,000ms)
    refetchOnWindowFocus: true,
    staleTime: 240000, // Considerar os dados obsoletos após 4 minutos
    enabled: isOpen, // Só executa a query quando o menu estiver aberto
  });

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true,
    enabled: isOpen // Só executa a query quando o menu estiver aberto
  });

  // Pegar a leitura mais recente
  const latestReading = data?.readings.length ? data.readings[data.readings.length - 1] : undefined;
  
  // Obter status dos dispositivos do estado em memória (mais atualizado)
  useEffect(() => {
    if (deviceStatusQuery.data) {
      const statusData = deviceStatusQuery.data;
      
      // Priorizar o estado em memória para feedback imediato
      if (statusData.memoryState) {
        setPumpStatus(statusData.memoryState.pumpStatus);
        setHeaterStatus(statusData.memoryState.heaterStatus);
      } else {
        // Fallback para o valor do banco
        setPumpStatus(statusData.pumpStatus);
        setHeaterStatus(statusData.heaterStatus);
      }
    }
  }, [deviceStatusQuery.data]);
  
  // Efeito para mostrar animação de atualização quando os dados mudam
  useEffect(() => {
    if (!latestReading) return;
    
    // Verificar se os valores mudaram
    const currentTemp = latestReading.temperature;
    const currentLevel = latestReading.level;
    
    const tempChanged = previousTemp !== null && previousTemp !== currentTemp;
    const levelChanged = previousLevel !== null && previousLevel !== currentLevel;
    
    // Se algum valor mudou, mostrar animação de atualização
    if (tempChanged || levelChanged) {
      setIsUpdating(true);
      
      // Remover a animação após 1 segundo
      const timer = setTimeout(() => {
        setIsUpdating(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
    
    // Atualizar valores anteriores
    setPreviousTemp(currentTemp);
    setPreviousLevel(currentLevel);
  }, [dataUpdatedAt, latestReading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden touch-none">
      <div 
        className="bg-[#0f172a] w-[85%] max-w-[300px] h-full overflow-y-auto animate-slide-in-left"
        style={{
          boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent'
        }}
      >
        <div className="p-4 flex-1 flex flex-col h-full">
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
              <i className="fas fa-water text-2xl text-blue-500"></i>
              <h1 className="text-xl font-semibold">{systemName}</h1>
              <button 
                onClick={onClose} 
                className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-300 hover:text-white hover:bg-white/10"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Valores monitorados integrados ao card Aquaponia */}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full bg-white/5" />
                <Skeleton className="h-10 w-full bg-white/5" />
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Field 1: Temperatura */}
                <div className="flex items-center gap-2 bg-[#111827]/40 p-2 rounded-lg hover:bg-[#111827]/60 transition-colors">
                  <div className={cn("text-blue-500 text-lg", isUpdating && "animate-pulse")}>
                    <i className="fas fa-thermometer-half"></i>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-lg font-semibold text-white transition-all duration-300", 
                        isUpdating && previousTemp !== latestReading?.temperature && "text-blue-300 animate-pulse font-bold")}>
                        {formatNumber(latestReading?.temperature || 0)} °C
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Temperatura</span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full", 
                        latestReading?.temperature && latestReading.temperature > 0 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-red-500/20 text-red-400"
                      )}>
                        {latestReading?.temperature && latestReading.temperature > 0 ? "online" : "offline"}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Field 2: Nível d'água */}
                <div className="flex items-center gap-2 bg-[#111827]/40 p-2 rounded-lg hover:bg-[#111827]/60 transition-colors">
                  <div className={cn("text-blue-400 text-lg", isUpdating && "animate-pulse")}>
                    <i className="fas fa-tint"></i>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-lg font-semibold text-white transition-all duration-300", 
                        isUpdating && previousLevel !== latestReading?.level && "text-blue-300 animate-pulse font-bold")}>
                        {formatNumber(latestReading?.level || 0)} %
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Nível d'água</span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full", 
                        latestReading?.level && latestReading.level > 0 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-red-500/20 text-red-400"
                      )}>
                        {latestReading?.level && latestReading.level > 0 ? "online" : "offline"}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Grid para Bomba e Aquecedor */}
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {/* Bomba */}
                  <div className={cn(
                    "flex flex-col justify-center items-center p-2 rounded-lg transition-colors",
                    pumpStatus ? "bg-blue-900/50 text-blue-100" : "bg-[#111827]/60 text-gray-300"
                  )}>
                    <div className="text-lg mb-1">
                      <i className="fas fa-plug"></i>
                    </div>
                    <p className="text-xs mb-1">Bomba</p>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full", 
                      pumpStatus 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-gray-500/20 text-gray-400"
                    )}>
                      {pumpStatus ? "Ligada" : "Desligada"}
                    </span>
                  </div>
                  
                  {/* Aquecedor */}
                  <div className={cn(
                    "flex flex-col justify-center items-center p-2 rounded-lg transition-colors",
                    heaterStatus ? "bg-orange-900/50 text-orange-100" : "bg-[#111827]/60 text-gray-300"
                  )}>
                    <div className="text-lg mb-1">
                      <i className="fas fa-fire"></i>
                    </div>
                    <p className="text-xs mb-1">Aquecedor</p>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full", 
                      heaterStatus 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-gray-500/20 text-gray-400"
                    )}>
                      {heaterStatus ? "Ligado" : "Desligado"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <nav className="flex flex-col gap-1 mt-auto">
            {navItems.map((item) => (
              <div key={item.href} className="w-full">
                <Link href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors", 
                      location === item.href 
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-white/5"
                    )}
                    onClick={onClose}
                  >
                    <i className={item.icon}></i>
                    <span>{item.label}</span>
                  </div>
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </div>
      {/* Área para fechar o menu ao tocar fora */}
      <div className="absolute inset-0 -z-10" onClick={onClose}></div>
    </div>
  );
}