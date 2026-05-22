"use client";

import { useId } from "react";

type OwlMarkProps = {
  size?: number;
  className?: string;
};

export default function OwlMark({ size = 36, className }: OwlMarkProps) {
  const reactId = useId();
  const gradId = `owlmark-grad-${reactId}`;
  const maskId = `owlmark-mask-${reactId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF6BB8" />
          <stop offset="50%" stopColor="#FF4936" />
          <stop offset="100%" stopColor="#E89512" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="120" height="120" fill="white" />
          <circle cx="70" cy="56" r="20" fill="black" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="52" fill={`url(#${gradId})`} stroke="#1A0F08" strokeWidth="5" />
      <circle cx="60" cy="60" r="38" fill="#1A0F08" />
      <circle cx="58" cy="60" r="26" fill="#FFF5E4" mask={`url(#${maskId})`} />
      <g transform="translate(80 60)">
        <path
          d="M 0,-11 Q 1.65,-1.65 11,0 Q 1.65,1.65 0,11 Q -1.65,1.65 -11,0 Q -1.65,-1.65 0,-11 Z"
          fill="#FFF5E4"
        />
      </g>
    </svg>
  );
}
