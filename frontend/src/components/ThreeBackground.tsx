import React from 'react';

export const ThreeBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 opacity-40"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(255, 90, 10, 0.05) 0%, rgba(8, 11, 18, 0.95) 75%)',
      }}
    />
  );
};
