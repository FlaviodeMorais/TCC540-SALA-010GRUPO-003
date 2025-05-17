// Primeiro bloco - para a seção de Temperatura
{/* Indicador de tempo real com valor de temperatura */}
<div className="flex items-center ml-auto">
  <span className="text-xs text-blue-400 italic">
    Tempo real: <span className="font-bold">{latestReading ? `${latestReading.temperature.toFixed(1)}°C` : '--°C'}</span>
  </span>
</div>

// Segundo bloco - para a seção de Nível da Água
{/* Indicador de tempo real com valor de nível */}
<div className="flex items-center ml-auto">
  <span className="text-xs text-blue-400 italic">
    Tempo real: <span className="font-bold">{latestReading ? `${convertLevelToPercent(latestReading.level).toFixed(1)}%` : '--%'}</span>
  </span>
</div>