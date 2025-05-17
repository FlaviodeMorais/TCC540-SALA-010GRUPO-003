import React, { useState } from 'react';
import { addDays, differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getHistoricalReadings, 
  HistoricalReadingsResponse 
} from '@/lib/thingspeakApi';
import { RechartsTemperatureChart } from '@/components/charts/RechartsTemperatureChart';
import { RechartsWaterLevelChart } from '@/components/charts/RechartsWaterLevelChart';
import { formatNumber, formatDateForQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { CompactDateRangePicker } from '@/components/ui/compact-date-range-picker';

export function HistoricalData() {
  const today = new Date();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Estados separados para cada tipo de dado
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>({
    from: addDays(today, -7),
    to: today
  });
  
  const [levelDateRange, setLevelDateRange] = useState<DateRange | undefined>({
    from: addDays(today, -7),
    to: today
  });
  
  // Funções para calcular dias nos dois intervalos
  const calculateDaysBetween = (range?: DateRange): number => {
    if (!range?.from || !range?.to) return 7; // Padrão de 7 dias
    return differenceInDays(range.to, range.from) + 1; // +1 para incluir o dia atual
  };
  
  const tempDays = calculateDaysBetween(tempDateRange);
  const levelDays = calculateDaysBetween(levelDateRange);
  
  // Determinar o tipo de período
  const determinePeriodType = (days: number): 'daily' | 'monthly' => {
    return days > 60 ? 'monthly' : 'daily';
  };
  
  // Query para dados de temperatura
  const { 
    data: tempData, 
    isLoading: isTempLoading 
  } = useQuery<HistoricalReadingsResponse>({
    queryKey: ['/api/historical-data/temperature', tempDateRange],
    queryFn: () => {
      if (!tempDateRange?.from || !tempDateRange?.to) {
        const defaultEndDate = new Date();
        const defaultStartDate = addDays(defaultEndDate, -7);
        return getHistoricalReadings(
          formatDateForQuery(defaultStartDate),
          formatDateForQuery(defaultEndDate),
          'daily'
        );
      }
      
      const adjustedEndDate = new Date(tempDateRange.to);
      adjustedEndDate.setHours(23, 59, 59, 999);
      
      const periodType = determinePeriodType(tempDays);
      
      return getHistoricalReadings(
        formatDateForQuery(tempDateRange.from), 
        formatDateForQuery(adjustedEndDate),
        periodType
      );
    },
    retry: false,
    staleTime: 240000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
  
  // Query para dados de nível de água
  const { 
    data: levelData, 
    isLoading: isLevelLoading 
  } = useQuery<HistoricalReadingsResponse>({
    queryKey: ['/api/historical-data/level', levelDateRange],
    queryFn: () => {
      if (!levelDateRange?.from || !levelDateRange?.to) {
        const defaultEndDate = new Date();
        const defaultStartDate = addDays(defaultEndDate, -7);
        return getHistoricalReadings(
          formatDateForQuery(defaultStartDate),
          formatDateForQuery(defaultEndDate),
          'daily'
        );
      }
      
      const adjustedEndDate = new Date(levelDateRange.to);
      adjustedEndDate.setHours(23, 59, 59, 999);
      
      const periodType = determinePeriodType(levelDays);
      
      return getHistoricalReadings(
        formatDateForQuery(levelDateRange.from), 
        formatDateForQuery(adjustedEndDate),
        periodType
      );
    },
    retry: false,
    staleTime: 240000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
  
  // Processamento dos dados
  const processedTempData = (() => {
    try {
      if (tempData?.readings && tempData.setpoints && tempData.stats) {
        return {
          ...tempData,
          readings: tempData.readings.slice(0, 100)
        };
      }
      return undefined;
    } catch (error) {
      console.error("Erro ao processar dados de temperatura:", error);
      return undefined;
    }
  })();
  
  const processedLevelData = (() => {
    try {
      if (levelData?.readings && levelData.setpoints && levelData.stats) {
        return {
          ...levelData,
          readings: levelData.readings.slice(0, 100)
        };
      }
      return undefined;
    } catch (error) {
      console.error("Erro ao processar dados de nível:", error);
      return undefined;
    }
  })();
  
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
      
      const periodType = determinePeriodType(tempDays);
      
      console.log(`Buscando dados históricos agregados (${periodType}) de ${formattedStartDate} até ${formattedEndDate}`);
      
      return getHistoricalReadings(formattedStartDate, formattedEndDate, periodType);
    },
    onSuccess: (data) => {
      const periodType = tempDays > 60 ? 'mensais' : 'diários';
      toast({
        title: "Dados de temperatura carregados",
        description: `${data.readings.length} registros ${periodType} de temperatura.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/historical-data/temperature'] });
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
      
      const periodType = determinePeriodType(levelDays);
      
      console.log(`Buscando dados históricos agregados (${periodType}) de ${formattedStartDate} até ${formattedEndDate}`);
      
      return getHistoricalReadings(formattedStartDate, formattedEndDate, periodType);
    },
    onSuccess: (data) => {
      const periodType = levelDays > 60 ? 'mensais' : 'diários';
      toast({
        title: "Dados de nível carregados",
        description: `${data.readings.length} registros ${periodType} de nível da água.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/historical-data/level'] });
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
    <div className="mb-8 px-6">
      <div className="flex items-center gap-2 mb-4">
        <i className="fas fa-chart-line text-blue-400"></i>
        <h2 className="text-xl font-light text-white">Análise Histórica</h2>
      </div>
      
      {/* Two Card Layout - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Temperature Analysis Card */}
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
                  <span className="text-[10px] px-1.5 py-0.5 ml-1 rounded-sm bg-blue-900/20 text-blue-100 border border-blue-900/30">
                    {tempDays}d
                  </span>
                </div>
              </div>
              
              {/* Date Range Picker and Update Button */}
              <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
                <CompactDateRangePicker
                  dateRange={tempDateRange}
                  setDateRange={setTempDateRange}
                  shortFormat={true}
                  className="bg-transparent flex-1 lg:flex-none lg:w-[130px]"
                  calendarClassName="border border-blue-900/30 rounded-sm bg-blue-950/50"
                />
                
                <Button 
                  onClick={handleLoadTempData}
                  disabled={isTempLoading || tempHistoricalMutation.isPending || !tempDateRange?.from}
                  className="h-8 text-[10px] bg-blue-600/50 hover:bg-blue-600/80 border-0 rounded-sm px-2 w-[80px]"
                  size="sm"
                  variant="ghost"
                >
                  {tempHistoricalMutation.isPending ? (
                    <span className="flex items-center justify-center gap-1">
                      <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                      <span>...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <i className="fas fa-sync-alt text-[10px]"></i>
                      <span>Atualizar</span>
                    </span>
                  )}
                </Button>
                
                <div className="hidden lg:flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                    <span className="text-[10px] text-gray-400">Normal</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-xs ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                    <span className="text-[10px] text-gray-400">Alerta</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 ml-1 rounded-sm bg-blue-900/20 text-blue-100 border border-blue-900/30">
                    {tempDays}d
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Temperature Content */}
          <div className="p-2">
            {/* Chart - Expanded Width */}
            <div className="flex-1 bg-[#0e1628]/30 rounded border border-white/5 p-1 min-w-0 lg:min-w-[500px]">
                {isTempLoading || tempHistoricalMutation.isPending ? (
                  <div className="h-[170px] flex items-center justify-center">
                    <span className="text-xs flex items-center gap-1">
                      <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                      <span>Carregando dados...</span>
                    </span>
                  </div>
                ) : processedTempData && processedTempData.readings ? (
                  <RechartsTemperatureChart 
                    readings={processedTempData.readings} 
                    setpoints={processedTempData.setpoints.temp}
                    title=""
                    isHistorical={true}
                  />
                ) : (
                  <div className="h-[170px] flex items-center justify-center">
                    <span className="text-xs flex items-center gap-1 text-blue-400">
                      <i className="fas fa-info-circle"></i>
                      <span>Sem dados disponíveis</span>
                    </span>
                  </div>
                )}
              </div>
            
            {/* Stats - Horizontal (on bottom) */}
            {processedTempData && processedTempData.stats && (
              <div className="flex text-center bg-[#0e1628]/10 rounded border border-white/5">
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-blue-300/70">Média</div>
                  <div className={`text-xs font-medium ${processedTempData.stats.temperature.avg < 10 ? 'text-blue-400' : processedTempData.stats.temperature.avg > 30 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatNumber(processedTempData.stats.temperature.avg)}°C
                  </div>
                </div>
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-blue-300/70">Mín</div>
                  <div className="text-xs font-medium text-blue-400">
                    {formatNumber(processedTempData.stats.temperature.min)}°C
                  </div>
                </div>
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-blue-300/70">Máx</div>
                  <div className="text-xs font-medium text-red-400">
                    {formatNumber(processedTempData.stats.temperature.max)}°C
                  </div>
                </div>
                <div className="flex-1 p-1">
                  <div className="text-[8px] uppercase text-blue-300/70">Desvio</div>
                  <div className="text-xs font-medium text-purple-400">
                    ±{formatNumber(processedTempData.stats.temperature.stdDev)}°C
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Water Level Analysis Card */}
        <div className="bg-[#0f172a] rounded-lg shadow border border-white/5 overflow-hidden">
          {/* Water Level Header with Calendar and Button */}
          <div className="px-3 py-2 border-b border-white/5 bg-[#0e1628]/80">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
              <div className="flex items-center justify-between w-full lg:w-auto">
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-water text-cyan-400"></i>
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
                  <span className="text-[10px] px-1.5 py-0.5 ml-1 rounded-sm bg-blue-900/20 text-blue-100 border border-blue-900/30">
                    {levelDays}d
                  </span>
                </div>
              </div>
              
              {/* Date Range Picker and Update Button */}
              <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
                <CompactDateRangePicker
                  dateRange={levelDateRange}
                  setDateRange={setLevelDateRange}
                  shortFormat={true}
                  className="bg-transparent flex-1 lg:flex-none lg:w-[130px]"
                  calendarClassName="border border-cyan-900/30 rounded-sm bg-cyan-950/50"
                />
                
                <Button 
                  onClick={handleLoadLevelData}
                  disabled={isLevelLoading || levelHistoricalMutation.isPending || !levelDateRange?.from}
                  className="h-8 text-[10px] bg-cyan-600/50 hover:bg-cyan-600/80 border-0 rounded-sm px-2 w-[80px]"
                  size="sm"
                  variant="ghost"
                >
                  {levelHistoricalMutation.isPending ? (
                    <span className="flex items-center justify-center gap-1">
                      <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                      <span>...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <i className="fas fa-sync-alt text-[10px]"></i>
                      <span>Atualizar</span>
                    </span>
                  )}
                </Button>
                
                <div className="hidden lg:flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50]"></span>
                    <span className="text-[10px] text-gray-400">Normal</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-xs ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef5350]"></span>
                    <span className="text-[10px] text-gray-400">Alerta</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 ml-1 rounded-sm bg-blue-900/20 text-blue-100 border border-blue-900/30">
                    {levelDays}d
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Water Level Content */}
          <div className="p-2">
            {/* Chart - Expanded Width */}
            <div className="flex-1 bg-[#0e1628]/30 rounded border border-white/5 p-1 min-w-0 lg:min-w-[500px]">
              {isLevelLoading || levelHistoricalMutation.isPending ? (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1">
                    <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                    <span>Carregando dados...</span>
                  </span>
                </div>
              ) : processedLevelData && processedLevelData.readings ? (
                <RechartsWaterLevelChart 
                  readings={processedLevelData.readings} 
                  setpoints={processedLevelData.setpoints.level}
                  title=""
                  isHistorical={true}
                />
              ) : (
                <div className="h-[170px] flex items-center justify-center">
                  <span className="text-xs flex items-center gap-1 text-cyan-400">
                    <i className="fas fa-info-circle"></i>
                    <span>Sem dados disponíveis</span>
                  </span>
                </div>
              )}
            </div>
            
            {/* Stats - Horizontal (on bottom) */}
            {processedLevelData && processedLevelData.stats && (
              <div className="flex text-center bg-[#0e1628]/10 rounded border border-white/5">
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-cyan-300/70">Média</div>
                  <div className={`text-xs font-medium ${processedLevelData.stats.level.avg < 40 ? 'text-yellow-400' : processedLevelData.stats.level.avg > 90 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatNumber(processedLevelData.stats.level.avg)}%
                  </div>
                </div>
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-cyan-300/70">Mín</div>
                  <div className="text-xs font-medium text-yellow-400">
                    {formatNumber(processedLevelData.stats.level.min)}%
                  </div>
                </div>
                <div className="flex-1 p-1 border-r border-white/5">
                  <div className="text-[8px] uppercase text-cyan-300/70">Máx</div>
                  <div className="text-xs font-medium text-red-400">
                    {formatNumber(processedLevelData.stats.level.max)}%
                  </div>
                </div>
                <div className="flex-1 p-1">
                  <div className="text-[8px] uppercase text-cyan-300/70">Desvio</div>
                  <div className="text-xs font-medium text-purple-400">
                    ±{formatNumber(processedLevelData.stats.level.stdDev)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}