import { ReactNode } from 'react';

/**
 * RTL-safe chart wrapper
 * Wraps Recharts components with dir="ltr" to prevent RTL layout issues
 * and provides consistent chart styling
 */
export function ChartWrapper({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div dir="ltr" className={className}>
      {children}
    </div>
  );
}

/**
 * Common tooltip styles for consistent chart tooltips across the dashboard
 */
export const chartTooltipStyle = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
};

/**
 * Common chart colors palette
 */
export const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
  gray: '#6b7280',
};

export const CHART_COLORS_ARRAY = [
  CHART_COLORS.success,
  CHART_COLORS.primary,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
];
