import React from "react";
import { formatNumber } from "@/lib/utils";

interface HorizontalTemperatureBarProps {
  value: number;
  min: number;
  max: number;
  avg?: number;  // Valor médio como guia visual
  height?: number;
  title?: string;
  showLimits?: boolean;
  showValue?: boolean;
  showAvg?: boolean; // Mostrar ou não o indicador do valor médio
}

export function HorizontalTemperatureBar({
  value,
  min,
  max,
  avg,
  height = 70,
  title,
  showLimits = true,
  showValue = true,
  showAvg = true,
}: HorizontalTemperatureBarProps) {
  // Garantir que o valor está no intervalo [min, max]
  const clampedValue = Math.min(Math.max(value, min), max);
  
  // Calcular a porcentagem da posição do valor na barra
  const percentage = ((clampedValue - min) / (max - min)) * 100;
  
  return (
    <div className="w-full relative" style={{ height: `${height}px`, paddingBottom: '30px' }}>
      {title && (
        <div className="text-sm font-medium mb-1 text-center text-white">{title}</div>
      )}
      
      {/* Barra principal */}
      <div className="relative w-full h-7 bg-slate-800/60 rounded-md overflow-hidden border border-slate-700/80 shadow-inner">
        {/* Barra de progresso com gradiente */}
        <div
          className="absolute h-full bg-gradient-to-r from-blue-500 via-blue-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
        
        {/* Indicador de valor */}
        <div 
          className="absolute top-0 bottom-0 w-1.5 bg-white/90 rounded-full shadow-lg transform -translate-x-1/2 transition-all duration-300"
          style={{ left: `${percentage}%` }}
        ></div>
      </div>

      {/* Escala de valores fora da barra - abaixo */}
      <div className="relative w-full mt-2 px-1 flex justify-between items-center">
        {[0, 10, 20, 30, 40, 50].map((mark) => (
          <div key={mark} className="flex flex-col items-center">
            <div className="h-1.5 w-[1px] bg-white/50 mb-1"></div>
            <span className="text-[10px] text-white font-medium">{mark}°C</span>
          </div>
        ))}
      </div>
    </div>
  );
}