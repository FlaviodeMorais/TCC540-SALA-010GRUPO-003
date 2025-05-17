import { useState, useEffect } from 'react';
import { formatFullDate, formatTime } from '@/lib/utils';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [currentDate, setCurrentDate] = useState<string>(formatFullDate(new Date()));
  const [currentTime, setCurrentTime] = useState<string>(formatTime(new Date()));

  useEffect(() => {
    // Update time every second
    const intervalId = setInterval(() => {
      const now = new Date();
      setCurrentDate(formatFullDate(now));
      setCurrentTime(formatTime(now));
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <header className="bg-[#0f172a] p-6 shadow-md m-6 rounded-lg flex flex-col md:flex-row justify-between items-start gap-4">
      <div className="flex flex-col flex-1">
        <div className="flex justify-between items-start w-full">
          <div>
            <h2 className="text-2xl font-semibold mb-1">Dashboard de Monitoramento</h2>
            <p className="text-sm text-gray-300">Projeto de um micro sistema de Automação</p>

          </div>
          <div className="bg-[#0f172a] p-2 rounded-md ml-4">
            <img 
              src="https://univesp.br/sites/527174b7b24a527adc000002/assets/590b74fa9caf4d3c61001001/Univesp_logo_png_rgb.png" 
              alt="UNIVESP Logo" 
              className="h-20 md:h-24 object-contain w-auto"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-gray-300 text-sm mt-4">
          <i className="far fa-calendar-alt text-blue-500"></i>
          <span id="current-date">{currentDate}</span>
          <span className="mx-2">|</span>
          <i className="far fa-clock text-blue-500"></i>
          <span id="current-time">{currentTime}</span>
        </div>
      </div>
      
      {/* Mobile menu button */}
      <button 
        className="lg:hidden p-2 rounded-md bg-blue-600/20 hover:bg-blue-600/30"
        onClick={onMenuClick}
      >
        <i className="fas fa-bars"></i>
      </button>
    </header>
  );
}
