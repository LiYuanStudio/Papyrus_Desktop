import React from 'react';

interface InfinigenceProps {
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
}

const Infinigence: React.FC<InfinigenceProps> = ({ size = 20, style, className, ...rest }) => (
  <svg height={size} width={size} style={{ flex: "none", lineHeight: 1, ...style }} {...rest} fill="currentColor" fillRule="evenodd"   viewBox="0 0 24 24"  xmlns="http://www.w3.org/2000/svg"><title>Infinigence</title><path d="M14.186 19.885V4.226H5v4.137h4.226v11.522H5V24h13.412v-4.115h-4.226z"></path><path d="M18.412 0h-4.226v4.226h4.226V0z"></path></svg>
);

export default Infinigence;
