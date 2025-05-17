import { TemperatureCard } from './TemperatureCard';
import { WaterLevelSlider } from './WaterLevelSlider';
import { Reading } from '@shared/schema';

interface MonitorCardsProps {
  latestReading?: Reading;
  isLoading: boolean;
  setpoints?: {
    temp?: {
      min: number;
      max: number;
    };
    level?: {
      min: number;
      max: number;
    };
  };
}

export function MonitorCards({ 
  latestReading, 
  isLoading,
  setpoints
}: MonitorCardsProps) {
  // Define valores padrão para os limites se não fornecidos
  const minTemp = setpoints?.temp?.min ?? 24;
  const maxTemp = setpoints?.temp?.max ?? 28;
  const minLevel = setpoints?.level?.min ?? 60; 
  const maxLevel = setpoints?.level?.max ?? 80;

  return (
    <div className="mb-4 sm:mb-6 md:mb-8 px-3 sm:px-4 md:px-6">
      <div className="flex items-center mb-3 sm:mb-4 md:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-[#4191ff] to-[#3163ad] flex items-center justify-center text-base sm:text-lg glow-effect">
            <i className="fas fa-chart-bar text-white"></i>
          </div>
          <h2 id="monitoring-heading" className="text-lg sm:text-xl md:text-2xl font-light text-white">Sensores em Tempo Real</h2>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:gap-6">
        {/* Card de Temperatura */}
        <TemperatureCard 
          latestReading={latestReading} 
          isLoading={isLoading}
          minTemp={minTemp}
          maxTemp={maxTemp}
        />
        
        {/* Slider de Nível da Água - ocupa uma coluna inteira */}
        <div className="bg-[#0f172a] rounded-lg p-5 shadow border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#0369a1] flex items-center justify-center text-xl glow-effect">
              <i className="fas fa-water text-white"></i>
            </div>
            <div className="flex-1">
              <h4 className="text-white/70 text-sm font-light">Nível da Água</h4>
              <div className="text-sm font-light text-green-400">
                {isLoading ? 'Carregando...' : 'Monitorando'}
              </div>
            </div>
          </div>
          
          <WaterLevelSlider 
            level={latestReading?.level ?? 0} 
            minLevel={minLevel}
            maxLevel={maxLevel}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}