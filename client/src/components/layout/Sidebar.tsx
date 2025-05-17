import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useQuery } from "@tanstack/react-query";
import { getLatestReadings, getDeviceStatus } from "@/lib/thingspeakApi";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSystemContext } from '@/contexts/SystemContext';

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

export function Sidebar() {
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
  });

  // Consulta para o status atual dos dispositivos (incluindo o estado em memória)
  const deviceStatusQuery = useQuery({
    queryKey: ['/api/device/status'],
    queryFn: getDeviceStatus,
    refetchInterval: 2000,  // Atualiza a cada 2 segundos
    refetchIntervalInBackground: true
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

  return (
    <aside 
      className="w-64 bg-[#0f172a] border-r border-white/5 hidden lg:flex lg:flex-col transition-all duration-300 overflow-y-auto"
      style={{
        boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.1) transparent'
      }}
    >
      <div className="p-4 xl:p-6 flex-1 flex flex-col">
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
            <i className="fas fa-water text-2xl text-blue-500"></i>
            <h1 className="text-xl font-semibold">{systemName}</h1>
          </div>
          
          {/* Itens de navegação reposicionados para o topo */}
          <nav className="flex flex-col gap-1 mb-5">
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
                  >
                    <i className={item.icon}></i>
                    <span>{item.label}</span>
                  </div>
                </Link>
              </div>
            ))}
          </nav>
          
          {/* Detalhes do Sistema e Status dos Equipamentos foram removidos */}
        </div>
        
        {/* Status do Sistema - Removido e movido para EquipmentControls */}
        
        {/* Espaçador para empurrar o conteúdo para cima */}
        <div className="flex-grow"></div>
      </div>
    </aside>
  );
}
