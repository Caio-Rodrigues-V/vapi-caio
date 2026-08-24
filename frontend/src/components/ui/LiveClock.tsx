import React, { useEffect, useState } from 'react';

export const LiveClock: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="text-[#94A3B8] font-mono text-[11px] ml-1">
      [{now.toLocaleTimeString('pt-BR')}]
    </span>
  );
};
