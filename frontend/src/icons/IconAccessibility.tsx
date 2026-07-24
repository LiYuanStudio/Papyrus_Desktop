import React from 'react';

interface IconAccessibilityProps {
  style?: React.CSSProperties;
  className?: string;
}

const IconAccessibility: React.FC<IconAccessibilityProps> = ({ style, className }) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 48 48"
    fill="currentColor"
    style={style}
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M24 2c12.15 0 22 9.85 22 22s-9.85 22-22 22S2 36.15 2 24 11.85 2 24 2zm0 4C14.059 6 6 14.059 6 24s8.059 18 18 18 18-8.059 18-18S33.941 6 24 6zm8 11v6h-4v-6h4zm-12 0v6h-4v-6h4zm10.23 11h2.918a.711.711 0 01.636 1.032l-.052.1A10.998 10.998 0 0124 35c-4.154 0-7.77-2.303-9.642-5.702l-.144-.27A.705.705 0 0114.84 28h2.93a1 1 0 01.776.37c.24.295.438.519.597.671A6.977 6.977 0 0024 31c1.899 0 3.62-.756 4.882-1.983.152-.148.342-.363.57-.646A1 1 0 0130.23 28z"
      fill="currentColor"
    />
  </svg>
);

export default IconAccessibility;
