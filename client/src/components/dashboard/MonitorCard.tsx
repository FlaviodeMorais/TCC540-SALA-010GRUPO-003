import React from 'react';
import { Reading } from '@shared/schema';
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureSlider } from './TemperatureSlider';
import { WaterLevelSlider } from './WaterLevelSlider';

interface MonitorCardProps {
  latestReading?: Reading;
  isLoading: boolean;
  chartStyle?: string;
  setpoints?: {
    temp: {
      min: number;
      max: number;
    };
    level: {
      min: number;
      max: number;
    };
  };
}

export function MonitorCard({ 
  latestReading, 
  isLoading, 
  chartStyle = "classic", 
  setpoints 
}: MonitorCardProps) {
  // Valores dos sensores
  const temperature = latestReading?.temperature || 0;
  const levelPercentage = latestReading?.level || 0;
  
  // Setpoints com valores padrão
  const tempMinSetpoint = setpoints?.temp?.min || 24;
  const tempMaxSetpoint = setpoints?.temp?.max || 28;
  const levelMinSetpoint = setpoints?.level?.min || 60;
  const levelMaxSetpoint = setpoints?.level?.max || 85;

  return (
    <div className="monitor-card p-3 mb-4">      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[180px] w-full bg-gray-800 rounded-lg" />
          <Skeleton className="h-[180px] w-full bg-gray-800 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-1">
          <TemperatureSlider 
            temperature={temperature} 
            minTemp={tempMinSetpoint} 
            maxTemp={tempMaxSetpoint} 
          />
          <WaterLevelSlider 
            level={levelPercentage} 
            minLevel={levelMinSetpoint} 
            maxLevel={levelMaxSetpoint} 
          />
        </div>
      )}
    </div>
  );
}