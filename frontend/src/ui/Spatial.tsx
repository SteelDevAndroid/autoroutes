import type { ComponentPropsWithRef } from 'react';

export interface SurfaceOptions {
  readonly material?: 'base' | 'thin' | 'regular' | 'thick' | undefined;
  readonly depth?: 'flat' | 'raised' | 'floating' | undefined;
}

function surfaceClass({ material = 'regular', depth = 'raised', className = '' }: SurfaceOptions & { className?: string | undefined }) {
  return `glass-surface material-${material} depth-${depth} ${className}`;
}

export function GlassSurface({ material, depth, className, ...props }: ComponentPropsWithRef<'div'> & SurfaceOptions) {
  return <div {...props} className={surfaceClass({ material, depth, className })} />;
}
export function GlassCard({ material = 'base', depth = 'flat', className, ...props }: ComponentPropsWithRef<'section'> & SurfaceOptions) {
  return <section {...props} className={surfaceClass({ material, depth, className: `glass-card ${className ?? ''}` })} />;
}
export function GlassPanel({ material = 'regular', depth = 'raised', className, ...props }: ComponentPropsWithRef<'section'> & SurfaceOptions) {
  return <section {...props} className={surfaceClass({ material, depth, className: `glass-panel ${className ?? ''}` })} />;
}
export function GlassSidebar({ material = 'regular', depth = 'raised', className, ...props }: ComponentPropsWithRef<'aside'> & SurfaceOptions) {
  return <aside {...props} className={surfaceClass({ material, depth, className })} />;
}
export function GlassHeader({ material = 'thin', depth = 'raised', className, ...props }: ComponentPropsWithRef<'header'> & SurfaceOptions) {
  return <header {...props} className={surfaceClass({ material, depth, className })} />;
}
export function GlassPopover({ material = 'thick', depth = 'raised', className, ...props }: ComponentPropsWithRef<'div'> & SurfaceOptions) {
  return <div {...props} className={surfaceClass({ material, depth, className: `glass-popover ${className ?? ''}` })} />;
}
/** Native dialog retains modal focus management, Escape and inert background. */
export function GlassModal({ material = 'thick', depth = 'floating', className, ...props }: ComponentPropsWithRef<'dialog'> & SurfaceOptions) {
  return <dialog {...props} className={surfaceClass({ material, depth, className: `glass-modal ${className ?? ''}` })} />;
}
export function FloatingToolbar({ material = 'thin', depth = 'raised', className, ...props }: ComponentPropsWithRef<'section'> & SurfaceOptions) {
  return <section {...props} className={surfaceClass({ material, depth, className: `floating-toolbar ${className ?? ''}` })} />;
}
export function SpatialButton({ className = '', type = 'button', ...props }: ComponentPropsWithRef<'button'>) {
  return <button {...props} type={type} className={`icon-button spatial-button ${className}`} />;
}
export function SpatialInput({ className = '', ...props }: ComponentPropsWithRef<'input'>) {
  return <input {...props} className={`spatial-input ${className}`} />;
}
