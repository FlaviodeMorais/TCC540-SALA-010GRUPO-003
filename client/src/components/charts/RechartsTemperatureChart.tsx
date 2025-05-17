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
import { useEffect, useState, useMemo } from 'react';

// Constante para o valor de erro do sensor
const SENSOR_ERROR_VALUE = -127;

interface TemperatureChartProps {
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

export function RechartsTemperatureChart({ 
  readings, 
  setpoints, 
  title = 'Variação de Temperatura',
  isHistorical = false 
}: TemperatureChartProps) {
  
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
    // Se não for histórico (modo tempo real), limitar a quantidade de pontos exibidos
    const dataPoints = !isHistorical ? readings.slice(-15) : readings;
    
    return dataPoints.map(reading => {
      const date = reading.timestamp ? new Date(reading.timestamp) : new Date();
      return {
        name: isHistorical ? formatDateTime(date) : formatTime(date),
        temperatura: reading.temperature === SENSOR_ERROR_VALUE ? null : reading.temperature,
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
            if (entry.name === 'temperatura' && entry.value !== null) {
              return (
                <p key={index} className="text-[#6C5DD3] font-semibold">
                  {`Temperatura: ${entry.value}°C`}
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

  const getMinYAxis = () => {
    const minValue = Math.min(
      ...readings
        .filter(r => r.temperature !== SENSOR_ERROR_VALUE)
        .map(r => r.temperature),
      setpoints.min // Incluímos o setpoint mínimo para garantir que ele seja visível
    );
    return Math.max(0, Math.floor(minValue) - 3); // Aumentamos a margem para -3
  };

  const getMaxYAxis = () => {
    const maxValue = Math.max(
      ...readings
        .filter(r => r.temperature !== SENSOR_ERROR_VALUE)
        .map(r => r.temperature),
      setpoints.max // Incluímos o setpoint máximo para garantir que ele seja visível
    );
    return Math.ceil(maxValue) + 3; // Aumentamos a margem para +3
  };

  // Determinar o status da temperatura em relação aos setpoints
  const getTemperatureStatus = (temp: number | null) => {
    if (temp === null) return 'normal';
    if (temp < setpoints.min) return 'abaixo';
    if (temp > setpoints.max) return 'acima';
    return 'normal';
  };

  const temperatureStatus = latestReading ? getTemperatureStatus(latestReading.temperature) : 'normal';
  const temperatureValue = latestReading?.temperature || 0;

  // Classes dinâmicas com base no status para o modo tempo real
  const realTimeValueClasses = {
    abaixo: 'text-blue-400',
    normal: 'text-green-400',
    acima: 'text-red-400'
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
              <linearGradient id="colorTemperature" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6C5DD3" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6C5DD3" stopOpacity={0} />
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
              unit="°C"
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
                value: `Min: ${setpoints.min}°C`, 
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
                value: `Max: ${setpoints.max}°C`, 
                position: 'insideTopRight',
                fill: '#2ecc71',
                fontSize: 11
              }} 
            />
            
            <Area
              type="monotone"
              dataKey="temperatura"
              name="Temperatura"
              stroke="#6C5DD3"
              fillOpacity={1}
              fill="url(#colorTemperature)"
              strokeWidth={3}
              connectNulls={true}
              activeDot={{ r: 6, stroke: '#6C5DD3', strokeWidth: 1, fill: '#8677D9' }}
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
            <linearGradient id="colorTempRealtime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6C5DD3" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6C5DD3" stopOpacity={0} />
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
            dataKey="temperatura"
            name="Temperatura"
            stroke="#6C5DD3"
            fillOpacity={1}
            fill="url(#colorTempRealtime)"
            strokeWidth={2}
            connectNulls={true}
            activeDot={{ r: 4, stroke: '#6C5DD3', strokeWidth: 1, fill: '#8677D9' }}
            isAnimationActive={false} // Desativa animações para atualizações mais rápidas
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}