import React from 'react';

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    label?: string; // aria-label
    className?: string;
    minTouchTarget?: boolean; // Ensure 44px min height/width
}

export default function AccessibleButton({
    children,
    label,
    className = '',
    minTouchTarget = true,
    onClick,
    ...props
}: AccessibleButtonProps) {
    // Base classes for accessibility and touch targets
    const baseClasses = `
    relative
    inline-flex items-center justify-center
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${minTouchTarget ? 'min-h-[44px] min-w-[44px]' : ''}
  `;

    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={`${baseClasses} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
