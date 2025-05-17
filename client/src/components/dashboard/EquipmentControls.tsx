import { PumpControl } from './PumpControl';
import { HeaterControl } from './HeaterControl';
import { PumpFlowControl } from './PumpFlowControl';
import { SystemStatusCard } from './SystemStatusCard';
import { Reading } from '@shared/schema';

interface EquipmentControlsProps {
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

export function EquipmentControls({ 
  latestReading, 
  isLoading,
  setpoints
}: EquipmentControlsProps) {

  return (
    <div className="mb-4 sm:mb-6 md:mb-8 px-3 sm:px-4 md:px-6">
      <div className="flex items-center mb-3 sm:mb-4 md:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] flex items-center justify-center text-base sm:text-lg glow-effect">
            <i className="fas fa-sliders-h text-white"></i>
          </div>
          <h2 id="equipment-heading" className="text-lg sm:text-xl md:text-2xl font-light text-white">Controle de Equipamentos</h2>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 lg:gap-6">
        <HeaterControl 
          latestReading={latestReading} 
          isLoading={isLoading}
          minTemp={setpoints?.temp?.min}
          maxTemp={setpoints?.temp?.max}
        />
        
        <PumpControl 
          latestReading={latestReading} 
          isLoading={isLoading} 
        />
        
        <PumpFlowControl
          latestReading={latestReading}
          isLoading={isLoading}
        />

        <SystemStatusCard
          latestReading={latestReading}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
