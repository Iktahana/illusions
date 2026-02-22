"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";

interface InfoTooltipProps {
  content: string;
  className?: string;
  children: ReactNode;
}

/** Tooltip component for information icons */
export default function InfoTooltip({ content, className, children }: InfoTooltipProps): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'top' as 'top' | 'bottom' });
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        placement: 'top',
      });
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible || !tooltipRef.current || !ref.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const iconRect = ref.current.getBoundingClientRect();
    const margin = 8;

    let left = iconRect.left + iconRect.width / 2;
    const minLeft = margin + tooltipRect.width / 2;
    const maxLeft = window.innerWidth - margin - tooltipRect.width / 2;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    let top = iconRect.top - 8;
    let placement: 'top' | 'bottom' = 'top';
    if (top - tooltipRect.height < margin) {
      top = iconRect.bottom + 8;
      placement = 'bottom';
    }

    setTooltipPos({ top, left, placement });
  }, [isVisible]);
  
  return (
    <span 
      ref={ref}
      className={clsx("info-tooltip-wrapper cursor-help", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <span 
          ref={tooltipRef}
          className="info-tooltip-content"
          style={{
            position: 'fixed',
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform: tooltipPos.placement === 'top'
              ? 'translateX(-50%) translateY(-100%)'
              : 'translateX(-50%) translateY(0)'
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
