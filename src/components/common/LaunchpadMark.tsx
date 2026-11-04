import React from 'react';

export function LaunchpadMark({ size = 24 }: { size?: number }) {
  return <span aria-hidden="true" className="launchpad-dot-mark" style={{ width: size, height: size }}>
    {['teal', 'blue', 'coral', 'green', 'teal', 'blue', 'coral', 'green', 'teal'].map((color, index) =>
      <span key={index} data-color={color}
        className={`launchpad-mark-dot${index === 4 ? ' launchpad-mark-center' : ''}`} />)}
  </span>;
}
