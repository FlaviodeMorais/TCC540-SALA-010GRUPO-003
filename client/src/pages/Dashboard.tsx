import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLatestReadings, getHistoricalReadings } from "@/lib/thingspeakApi";
import { EquipmentControls } from "@/components/dashboard/EquipmentControls";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { HistoricalData } from "@/components/historical/HistoricalData";
import { formatDateForQuery } from "@/lib/utils";

export default function Dashboard() {
  // Calcular o período para mostrar exatamente as últimas 24 horas
  const getLastDay = useCallback(() => {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1); // Exatamente 24 horas atrás
    
    return {
      startDate: formatDateForQuery(startDate),
      endDate: formatDateForQuery(endDate)
    };
  }, []);

  // Buscar a leitura mais recente para exibição em tempo real
  const { data: latestData, isLoading: isLatestLoading } = useQuery({
    queryKey: ['/api/readings/latest'],
    queryFn: () => getLatestReadings(10), // Pegamos apenas as 10 leituras mais recentes
    refetchInterval: 5000, // Atualizar a cada 5 segundos para dados em tempo real
    staleTime: 2000, // Dados são considerados atualizados por apenas 2 segundos
    refetchOnWindowFocus: true,
  });

  // Buscar leituras das últimas 24 horas para os gráficos históricos
  const { data: historicalData, isLoading: isHistoricalLoading } = useQuery({
    queryKey: ['/api/historical-data/daily'],
    queryFn: () => {
      const { startDate, endDate } = getLastDay();
      // Usar dados diários para as últimas 24 horas com melhor performance
      return getHistoricalReadings(startDate, endDate, 'daily');
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos 
    staleTime: 15000, // Dados são considerados atualizados por 15 segundos
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Usar a leitura mais recente para controles e exibições em tempo real
  const latestReading = latestData?.readings?.length ? latestData.readings[latestData.readings.length - 1] : undefined;

  // Usar os indicadores de carregamento corretos
  const isLoading = isLatestLoading || isHistoricalLoading;

  return (
    <div className="py-4 sm:py-6 md:py-8 relative max-w-full overflow-x-hidden">
      {/* Área para conteúdo principal */}
      
      {/* Barra de status animada */}
      <div className="fixed top-0 left-0 w-full h-1 z-50 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-900 via-blue-600 to-blue-900"
          style={{
            width: '100%',
            backgroundSize: '200% 100%',
            animation: 'gradientShift 3s infinite linear',
          }}
        />
      </div>
    
      {/* Equipment Controls Section - usar dados em tempo real */}
      <section className="mb-8" aria-labelledby="equipment-heading">
        <EquipmentControls 
          latestReading={latestReading} 
          isLoading={isLatestLoading}
          setpoints={latestData?.setpoints || historicalData?.setpoints}
        />
      </section>
      
      {/* Charts Section - cabeçalho */}
      <section className="mb-2" aria-labelledby="dashboard-heading">
        <div className="px-4 sm:px-6 mb-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-[#4191ff] to-[#3163ad] flex items-center justify-center text-base sm:text-lg glow-effect">
              <i className="fas fa-chart-line text-white"></i>
            </div>
            <h2 id="dashboard-heading" className="text-lg sm:text-xl md:text-2xl font-light text-white">Dashboard de Monitoramento</h2>
          </div>
        </div>
      </section>
      
      {/* Charts Section - usar híbrido: dados históricos com a última leitura em tempo real */}
      <section className="mb-8" aria-labelledby="charts-area">
        <DashboardCharts 
          data={historicalData} 
          isLoading={isHistoricalLoading}
          is24HourScale={true}
          latestReading={latestReading} // Passar a leitura mais recente para atualização em tempo real
        />
      </section>
      
      {/* Historical Data Section */}
      <section aria-labelledby="historical-data">
        <HistoricalData />
      </section>
    </div>
  );
}
