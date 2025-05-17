import { HorizontalLevelBar } from "@/components/charts/HorizontalLevelBar";
import { HorizontalTemperatureBar } from "@/components/charts/HorizontalTemperatureBar";
import { ReadingsResponse, getHistoricalReadings } from "@/lib/thingspeakApi";
import { formatDateForQuery, formatNumber, formatTime } from "@/lib/utils";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Reading } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";
import { CompactDateRangePicker } from "@/components/ui/compact-date-range-picker";

// Função auxiliar para converter nível de água para percentual (0-100)
function convertLevelToPercent(value: number): number {
  // Se o valor já for percentual (>1), retornar como está
  if (value > 1) return value;
  // Se for decimal (0-1), multiplicar por 100
  return value * 100;
}

interface DashboardChartsProps {
  data?: ReadingsResponse;
  isLoading: boolean;
  is24HourScale?: boolean;
  chartStyle?: string;
  latestReading?: Reading; // Nova propriedade para receber a leitura mais recente
}

export function DashboardCharts({ 
  data, 
  isLoading, 
  is24HourScale = false,
  chartStyle = "classic",
  latestReading // Recebe a leitura mais recente em tempo real
}: DashboardChartsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date();
  
  // Referências para os valores anteriores
  const prevTempRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  
  // Estados para controlar a animação de piscar
  const [tempBlink, setTempBlink] = useState(false);
  const [levelBlink, setLevelBlink] = useState(false);
  
  // Efeito para detectar mudanças nos valores e acionar a animação de piscar
  useEffect(() => {
    if (latestReading) {
      // Verificar se a temperatura mudou
      if (prevTempRef.current !== null && prevTempRef.current !== latestReading.temperature) {
        setTempBlink(true);
        setTimeout(() => setTempBlink(false), 800); // Duração da animação
      }
      
      // Verificar se o nível mudou
      if (prevLevelRef.current !== null && prevLevelRef.current !== latestReading.level) {
        setLevelBlink(true);
        setTimeout(() => setLevelBlink(false), 800); // Duração da animação
      }
      
      // Atualizar os valores de referência
      prevTempRef.current = latestReading.temperature;
      prevLevelRef.current = latestReading.level;
    }
  }, [latestReading]);
  
  // Estados para escalas fixas conforme solicitado pelo usuário
  const [tempSetpoints, setTempSetpoints] = useState({ min: 0, max: 50, avg: 25 });
  const [levelSetpoints, setLevelSetpoints] = useState({ min: 0, max: 100, avg: 50 });
  
  // Estados para os seletores de data
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>({
    from: addDays(today, -1),
    to: today
  });
  
  const [levelDateRange, setLevelDateRange] = useState<DateRange | undefined>({
    from: addDays(today, -1),
    to: today
  });
  
  // Determinar se há dados suficientes e obter a data mais recente para o título
  const hasData = data && data.readings && data.readings.length > 0;
  // Usar a leitura mais recente se disponível, caso contrário, usar a do conjunto de dados históricos
  const lastUpdate = latestReading?.timestamp
    ? new Date(latestReading.timestamp)
    : hasData 
      ? new Date(data.readings[data.readings.length - 1].timestamp || Date.now())
      : new Date();

  // Removido o código para buscar configurações do emulador para valores de alerta
  // pois vamos usar escalas fixas conforme solicitado

  // Comentado para priorizar os valores do emulador
  // useEffect(() => {
  //   if (data?.setpoints) {
  //     if (data.setpoints.temp) {
  //       setTempSetpoints(data.setpoints.temp);
  //     }
  //     if (data.setpoints.level) {
  //       setLevelSetpoints(data.setpoints.level);
  //     }
  //   }
  // }, [data?.setpoints]);

  // Calcular o período mostrado para exibir como subtítulo
  const getTimeRangeLabel = useCallback(() => {
    if (!hasData || data?.readings.length < 2) return "Período: N/A";
    
    const firstReadingTime = data.readings[0].timestamp;
    const lastReadingTime = data.readings[data.readings.length - 1].timestamp;
    
    // Utilizando valores padrão para evitar erros com null
    const firstReading = new Date(firstReadingTime || Date.now());
    const lastReading = new Date(lastReadingTime || Date.now());
    
    return `Período: ${formatTime(firstReading)} - ${formatTime(lastReading)}`;
  }, [hasData, data?.readings]);
  
  // Calcular min/max/avg para temperatura e nível
  // Função para calcular desvio padrão
  const calculateStdDev = useCallback((values: number[]): number => {
    if (values.length <= 1) return 0;
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => {
      const diff = value - avg;
      return diff * diff;
    });
    
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }, []);

  const calcTempMinMax = useCallback(() => {
    // Usar leituras em tempo real ou históricas
    let allReadings = [];
    
    // Adicionar a leitura atual se existir
    if (latestReading && latestReading.temperature > 0) {
      allReadings.push(latestReading.temperature);
    }
    
    // Adicionar dados históricos se existirem
    if (hasData && data?.readings) {
      const validTemps = data.readings
        .map(reading => reading.temperature)
        .filter(temp => temp > 0);
      allReadings = [...allReadings, ...validTemps];
    }
    
    // Se não houver dados suficientes, gerar valores simulados baseados no valor atual
    if (allReadings.length < 2) {
      // Se tiver pelo menos a leitura atual, usá-la para todos os valores e calcular o desvio
      if (latestReading && latestReading.temperature > 0) {
        const temp = latestReading.temperature;
        
        // Gerar alguns valores próximos ao valor atual para permitir cálculo de desvio
        // Simulando uma pequena flutuação nos dados
        const simulatedData = [
          temp,
          temp * 0.98,  // -2%
          temp * 1.02,  // +2%
          temp * 0.99,  // -1%
          temp * 1.01   // +1%
        ];
        
        allReadings = simulatedData;
        const sum = allReadings.reduce((a, b) => a + b, 0);
        const avg = sum / allReadings.length;
        const stdDev = calculateStdDev(allReadings);
        
        return {
          min: Math.min(...allReadings),
          max: Math.max(...allReadings),
          avg: temp,  // Mantemos o valor original como média
          stdDev: stdDev
        };
      }
      return { min: 0, max: 0, avg: 0, stdDev: 0 };
    }
    
    const sum = allReadings.reduce((a, b) => a + b, 0);
    const avg = sum / allReadings.length;
    const stdDev = calculateStdDev(allReadings);
    
    return {
      min: Math.min(...allReadings),
      max: Math.max(...allReadings),
      avg: avg,
      stdDev: stdDev
    };
  }, [hasData, data?.readings, latestReading, calculateStdDev]);
  
  const calcLevelMinMax = useCallback(() => {
    // Usar leituras em tempo real ou históricas
    let allReadings = [];
    
    // Adicionar a leitura atual se existir
    if (latestReading && latestReading.level > 0) {
      allReadings.push(latestReading.level);
    }
    
    // Adicionar dados históricos se existirem
    if (hasData && data?.readings) {
      const validLevels = data.readings
        .map(reading => reading.level)
        .filter(level => level > 0);
      allReadings = [...allReadings, ...validLevels];
    }
    
    // Se não houver dados suficientes, gerar valores simulados baseados no valor atual
    if (allReadings.length < 2) {
      // Se tiver pelo menos a leitura atual, usá-la para todos os valores e calcular o desvio
      if (latestReading && latestReading.level > 0) {
        const level = latestReading.level;
        
        // Gerar alguns valores próximos ao valor atual para permitir cálculo de desvio
        // Simulando uma pequena flutuação nos dados
        const simulatedData = [
          level,
          level * 0.98,  // -2%
          level * 1.02,  // +2%
          level * 0.99,  // -1%
          level * 1.01   // +1%
        ];
        
        allReadings = simulatedData;
        const sum = allReadings.reduce((a, b) => a + b, 0);
        const avg = sum / allReadings.length;
        const stdDev = calculateStdDev(allReadings);
        
        return {
          min: Math.min(...allReadings),
          max: Math.max(...allReadings),
          avg: level,  // Mantemos o valor original como média
          stdDev: stdDev
        };
      }
      return { min: 0, max: 0, avg: 0, stdDev: 0 };
    }
    
    const sum = allReadings.reduce((a, b) => a + b, 0);
    const avg = sum / allReadings.length;
    const stdDev = calculateStdDev(allReadings);
    
    return {
      min: Math.min(...allReadings),
      max: Math.max(...allReadings),
      avg: avg,
      stdDev: stdDev
    };
  }, [hasData, data?.readings, latestReading, calculateStdDev]);
  
  // Calcula estatísticas dos dados
  const tempStats = calcTempMinMax();
  const levelStats = calcLevelMinMax();
  
  // Criar uma cópia das leituras históricas e adicionar a leitura em tempo real, se disponível
  const combinedReadings = useMemo(() => {
    if (!data?.readings || !latestReading) return data?.readings || [];
    
    // Se a última leitura já estiver incluída nas leituras históricas, não a adicione novamente
    const lastReading = data.readings[data.readings.length - 1];
    const latestTimestamp = latestReading.timestamp ? new Date(latestReading.timestamp).getTime() : 0;
    const lastTimestamp = lastReading?.timestamp ? new Date(lastReading.timestamp).getTime() : 0;
    
    if (latestTimestamp <= lastTimestamp) {
      return data.readings;
    }
    
    // Adicionar a leitura mais recente ao final das leituras históricas
    return [...data.readings, latestReading];
  }, [data?.readings, latestReading]);

  // Mutations para buscar dados históricos de temperatura
  const tempHistoricalMutation = useMutation({
    mutationFn: () => {
      if (!tempDateRange?.from) {
        toast({
          title: "Selecione um período",
          description: "Por favor, selecione uma data inicial para temperatura.",
          variant: "destructive",
        });
        throw new Error("Intervalo de datas incompleto");
      }
      
      const endDate = tempDateRange.to || new Date();
      const startDate = tempDateRange.from;
      
      const formattedStartDate = formatDateForQuery(startDate);
      const formattedEndDate = formatDateForQuery(endDate);
      
      console.log(`Buscando dados históricos de temperatura de ${formattedStartDate} até ${formattedEndDate}`);
      
      return getHistoricalReadings(formattedStartDate, formattedEndDate, 'daily');
    },
    onSuccess: (data) => {
      toast({
        title: "Dados de temperatura carregados",
        description: `${data.readings.length} registros de temperatura.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/historical-data/daily'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível buscar os dados históricos de temperatura.",
        variant: "destructive",
      });
      console.error("Erro em dados de temperatura:", error);
    }
  });
  
  // Mutations para buscar dados históricos de nível
  const levelHistoricalMutation = useMutation({
    mutationFn: () => {
      if (!levelDateRange?.from) {
        toast({
          title: "Selecione um período",
          description: "Por favor, selecione uma data inicial para nível de água.",
          variant: "destructive",
        });
        throw new Error("Intervalo de datas incompleto");
      }
      
      const endDate = levelDateRange.to || new Date();
      const startDate = levelDateRange.from;
      
      const formattedStartDate = formatDateForQuery(startDate);
      const formattedEndDate = formatDateForQuery(endDate);
      
      console.log(`Buscando dados históricos de nível de ${formattedStartDate} até ${formattedEndDate}`);
      
      return getHistoricalReadings(formattedStartDate, formattedEndDate, 'daily');
    },
    onSuccess: (data) => {
      toast({
        title: "Dados de nível carregados",
        description: `${data.readings.length} registros de nível da água.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/historical-data/daily'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível buscar os dados históricos de nível de água.",
        variant: "destructive",
      });
      console.error("Erro em dados de nível:", error);
    }
  });

  // Handlers para os botões
  const handleLoadTempData = () => {
    if (!tempDateRange?.from) {
      toast({
        title: "Selecione um período",
        description: "Selecione uma data inicial para os dados de temperatura.",
        variant: "destructive",
      });
      return;
    }
    
    tempHistoricalMutation.mutate();
  };
  
  const handleLoadLevelData = () => {
    if (!levelDateRange?.from) {
      toast({
        title: "Selecione um período",
        description: "Selecione uma data inicial para os dados de nível.",
        variant: "destructive",
      });
      return;
    }
    
    levelHistoricalMutation.mutate();
  };

  return (
    <div className="px-3 sm:px-4 md:px-6 mb-4 sm:mb-6 md:mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:gap-8">
        
        {/* Temperature Chart */}
        <div className="bg-[#0f172a] rounded-lg shadow border border-white/5 overflow-hidden">
          {/* Temperature Header with Calendar and Button */}
          <div className="px-3 py-2 border-b border-white/5 bg-[#0e1628]/80">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
              <div className="flex items-center justify-between w-full lg:w-auto">
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-thermometer-half text-blue-400"></i>
                  <span className="text-sm text-white font-medium">Temperatura</span>
                </div>
                <div className="flex items-center gap-1.5 lg:hidden">
                  <div className="flex items-center gap-0.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                    <span className="text-[10px] text-gray-400">Normal</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-xs ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                    <span className="text-[10px] text-gray-400">Alerta</span>
                  </div>
                </div>
              </div>
              
              {/* Indicador de tempo real com valor de temperatura */}
              <div className="flex items-center ml-auto">
                <span className="text-xs text-white italic">
                  Tempo real: <span className={`font-bold ${tempBlink ? 'blink-value' : ''}`}>{latestReading ? `${latestReading.temperature.toFixed(1)}°C` : '--°C'}</span>
                </span>
              </div>
              
              <div className="hidden lg:flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                  <span className="text-[10px] text-gray-400">Normal</span>
                </div>
                <div className="flex items-center gap-0.5 text-xs ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                  <span className="text-[10px] text-gray-400">Alerta</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Temperature Chart Content */}
          <div className="p-2">
            {/* Chart */}
            <div className="flex-1 bg-[#0e1628]/30 rounded border border-white/5 p-1 min-w-0 lg:min-w-[500px]">
              {isLoading || tempHistoricalMutation.isPending ? (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1">
                    <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                    <span>Carregando dados...</span>
                  </span>
                </div>
              ) : (combinedReadings && combinedReadings.length > 0) ? (
                <div className="space-y-4">
                  {/* Barra horizontal para temperatura - escala fixa 0-50°C */}
                  <HorizontalTemperatureBar 
                    value={latestReading?.temperature || tempStats.avg}
                    min={0}
                    max={50}
                    avg={25}
                    height={60}
                    showLimits={false}
                    showValue={true}
                    showAvg={false}
                  />
                  
                  {/* Removido gráfico de linha para manter apenas a barra horizontal */}
                </div>
              ) : (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1 text-blue-400">
                    <i className="fas fa-info-circle"></i>
                    <span>Sem dados disponíveis</span>
                  </span>
                </div>
              )}
            </div>
            
            {/* Container de estatísticas removido conforme solicitado */}
          </div>
        </div>
        
        {/* Water Level Chart */}
        <div className="bg-[#0f172a] rounded-lg shadow border border-white/5 overflow-hidden">
          {/* Water Level Header with Calendar and Button */}
          <div className="px-3 py-2 border-b border-white/5 bg-[#0e1628]/80">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
              <div className="flex items-center justify-between w-full lg:w-auto">
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-water text-blue-400"></i>
                  <span className="text-sm text-white font-medium">Nível da Água</span>
                </div>
                <div className="flex items-center gap-1.5 lg:hidden">
                  <div className="flex items-center gap-0.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                    <span className="text-[10px] text-gray-400">Normal</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-xs ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                    <span className="text-[10px] text-gray-400">Alerta</span>
                  </div>
                </div>
              </div>
              
              {/* Indicador de tempo real com valor de nível */}
              <div className="flex items-center ml-auto">
                <span className="text-xs text-white italic">
                  Tempo real: <span className={`font-bold ${levelBlink ? 'blink-value' : ''}`}>{latestReading ? `${convertLevelToPercent(latestReading.level).toFixed(1)}%` : '--%'}</span>
                </span>
              </div>
              
              <div className="hidden lg:flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                  <span className="text-[10px] text-gray-400">Normal</span>
                </div>
                <div className="flex items-center gap-0.5 text-xs ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                  <span className="text-[10px] text-gray-400">Alerta</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Water Level Chart Content */}
          <div className="p-2">
            {/* Chart */}
            <div className="flex-1 bg-[#0e1628]/30 rounded border border-white/5 p-1 min-w-0 lg:min-w-[500px]">
              {isLoading || levelHistoricalMutation.isPending ? (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1">
                    <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                    <span>Carregando dados...</span>
                  </span>
                </div>
              ) : (combinedReadings && combinedReadings.length > 0) ? (
                <div className="space-y-4">
                  {/* Barra horizontal para nível de água - escala fixa 0-100% */}
                  <HorizontalLevelBar 
                    value={latestReading ? convertLevelToPercent(latestReading.level) : levelStats.avg}
                    min={0}
                    max={100}
                    avg={50}
                    height={60}
                    showLimits={false}
                    showValue={true}
                    showAvg={false}
                  />
                  
                  {/* Removido gráfico de linha para manter apenas a barra horizontal */}
                </div>
              ) : (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1 text-blue-400">
                    <i className="fas fa-info-circle"></i>
                    <span>Sem dados disponíveis</span>
                  </span>
                </div>
              )}
            </div>
            
            {/* Container de estatísticas removido conforme solicitado */}
          </div>
        </div>
      </div>
    </div>
  );
}