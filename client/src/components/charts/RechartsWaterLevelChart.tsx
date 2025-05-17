import { formatTime, formatDateTime, formatNumber } from '@/lib/utils';
import { Reading } from '@shared/schema';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { useMemo } from 'react';

interface WaterLevelChartProps {
  readings: Reading[];
  setpoints: {
    min: number;
    max: number;
  };
  title?: string;
  isHistorical?: boolean;
  height?: number;
  compact?: boolean;
  disableAnimation?: boolean;
}

export function RechartsWaterLevelChart({ 
  readings, 
  setpoints, 
  title = 'Nível da Água',
  isHistorical = false 
}: WaterLevelChartProps) {
  
  // Garantir que temos leituras e setpoints válidos
  if (!readings || readings.length === 0 || !setpoints) {
    return (
      <div className={`${isHistorical ? 'h-[300px]' : 'h-[170px]'} flex items-center justify-center`}>
        <span className="text-lg text-gray-400">Dados insuficientes para exibir o gráfico</span>
      </div>
    );
  }

  // Obter a leitura mais recente para exibição em tempo real
  const latestReading = useMemo(() => {
    if (readings.length === 0) return null;
    return readings[readings.length - 1];
  }, [readings]);
  
  // Limitar os dados para exibição em tempo real (mostrar apenas as últimas 10-15 leituras)
  const chartData = useMemo(() => {
    // Se for modo tempo real, limitar a quantidade de pontos exibidos
    const dataPoints = !isHistorical ? readings.slice(-15) : readings;
    
    return dataPoints.map(reading => {
      const date = new Date(reading.timestamp);
      // Multiplicar por 100 se o valor estiver entre 0 e 1
      const levelValue = reading.level <= 1 ? reading.level * 100 : reading.level;
      return {
        name: isHistorical ? formatDateTime(date) : formatTime(date),
        nivel: levelValue,
        min: setpoints.min,
        max: setpoints.max,
        timestamp: reading.timestamp
      };
    });
  }, [readings, isHistorical, setpoints]);

  // Personalização do tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip bg-[#132f4c] p-3 rounded shadow-lg border border-[#2c4564]">
          <p className="text-sm text-gray-300 mb-1">{`${label}`}</p>
          {payload.map((entry: any, index: number) => {
            if (entry.name === 'nivel') {
              return (
                <p key={index} className="text-[#00B5D8] font-semibold">
                  {`Nível: ${entry.value}%`}
                </p>
              );
            }
            return null;
          })}
        </div>
      );
    }
    return null;
  };

  // Função para calcular o domínio mínimo do eixo Y
  const getMinYAxis = () => {
    // Para o nível da água, garantimos que o setpoint mínimo seja visível
    // No entanto, não descemos abaixo de 0, pois o nível nunca é negativo
    return Math.max(0, Math.floor(setpoints.min) - 10);
  };

  // Função para calcular o domínio máximo do eixo Y
  const getMaxYAxis = () => {
    // Para o nível da água, garantimos que o setpoint máximo seja visível
    // Mas limitamos a 100%, pois o nível não passa disso
    return Math.min(100, Math.ceil(setpoints.max) + 10);
  };

  // Determinar o status do nível da água em relação aos setpoints
  const getWaterLevelStatus = (level: number | null) => {
    if (level === null) return 'normal';
    if (level < setpoints.min) return 'abaixo';
    if (level > setpoints.max) return 'acima';
    return 'normal';
  };

  const waterLevelStatus = latestReading ? getWaterLevelStatus(latestReading.level) : 'normal';
  const waterLevelValue = latestReading?.level || 0;

  // Classes dinâmicas com base no status para o modo tempo real
  const realTimeValueClasses = {
    abaixo: 'text-red-400',
    normal: 'text-green-400',
    acima: 'text-yellow-400'
  };

  // No modo histórico, mantenha o gráfico original de tamanho completo
  if (isHistorical) {
    return (
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{
              top: 10,
              right: 10,
              left: 0,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00B5D8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00B5D8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis 
              dataKey="name" 
              stroke="#8a94a7" 
              fontSize={11}
              tickMargin={10}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
            />
            <YAxis 
              stroke="#8a94a7" 
              fontSize={11}
              tickMargin={10}
              domain={[getMinYAxis(), getMaxYAxis()]}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              unit="%"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            
            {/* Linhas de referência para os limites */}
            <ReferenceLine 
              y={setpoints.min} 
              stroke="#e74c3c" 
              strokeWidth={2}
              strokeDasharray="5 5" 
              label={{ 
                value: `Min: ${setpoints.min}%`, 
                position: 'insideBottomRight',
                fill: '#e74c3c',
                fontSize: 11
              }} 
            />
            <ReferenceLine 
              y={setpoints.max} 
              stroke="#2ecc71" 
              strokeWidth={2}
              strokeDasharray="5 5" 
              label={{ 
                value: `Max: ${setpoints.max}%`, 
                position: 'insideTopRight',
                fill: '#2ecc71',
                fontSize: 11
              }} 
            />
            
            <Area
              type="monotone"
              dataKey="nivel"
              name="Nível da Água"
              stroke="#00B5D8"
              fillOpacity={1}
              fill="url(#colorLevel)"
              strokeWidth={3}
              connectNulls={true}
              activeDot={{ r: 6, stroke: '#00B5D8', strokeWidth: 1, fill: '#44C7E4' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }
  
  // Layout otimizado para tempo real - mais compacto com destaque para o valor atual
  return (
    <div className="h-[170px] w-full flex flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{
            top: 5,
            right: 5,
            left: 0,
            bottom: 5,
          }}
        >
          <defs>
            <linearGradient id="colorLevelRealtime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00B5D8" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#00B5D8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
          <XAxis 
            dataKey="name" 
            stroke="#8a94a7" 
            fontSize={9}
            tickMargin={5}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
            tick={{ fontSize: 8 }}
            interval="preserveEnd"
            tickCount={5}
          />
          <YAxis 
            stroke="#8a94a7" 
            fontSize={9}
            tickMargin={5}
            domain={[getMinYAxis(), getMaxYAxis()]}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
            tick={{ fontSize: 8 }}
            tickCount={4}
            unit="%"
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Linhas de referência mais discretas */}
          <ReferenceLine 
            y={setpoints.min} 
            stroke="#e74c3c" 
            strokeWidth={1}
            strokeDasharray="3 3" 
          />
          <ReferenceLine 
            y={setpoints.max} 
            stroke="#2ecc71" 
            strokeWidth={1}
            strokeDasharray="3 3" 
          />
          
          <Area
            type="monotone"
            dataKey="nivel"
            name="Nível da Água"
            stroke="#00B5D8"
            fillOpacity={1}
            fill="url(#colorLevelRealtime)"
            strokeWidth={2}
            connectNulls={true}
            activeDot={{ r: 4, stroke: '#00B5D8', strokeWidth: 1, fill: '#44C7E4' }}
            isAnimationActive={false} // Desativa animações para atualizações mais rápidas
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}