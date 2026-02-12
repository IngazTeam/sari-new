import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

// Country data: flag, name (Arabic), dial code, max digits (local number without country code)
const COUNTRIES = [
    { code: 'SA', flag: '🇸🇦', name: 'السعودية', dial: '+966', digits: 9 },
    { code: 'AE', flag: '🇦🇪', name: 'الإمارات', dial: '+971', digits: 9 },
    { code: 'KW', flag: '🇰🇼', name: 'الكويت', dial: '+965', digits: 8 },
    { code: 'BH', flag: '🇧🇭', name: 'البحرين', dial: '+973', digits: 8 },
    { code: 'QA', flag: '🇶🇦', name: 'قطر', dial: '+974', digits: 8 },
    { code: 'OM', flag: '🇴🇲', name: 'عُمان', dial: '+968', digits: 8 },
    { code: 'EG', flag: '🇪🇬', name: 'مصر', dial: '+20', digits: 10 },
    { code: 'JO', flag: '🇯🇴', name: 'الأردن', dial: '+962', digits: 9 },
    { code: 'IQ', flag: '🇮🇶', name: 'العراق', dial: '+964', digits: 10 },
    { code: 'YE', flag: '🇾🇪', name: 'اليمن', dial: '+967', digits: 9 },
    { code: 'SD', flag: '🇸🇩', name: 'السودان', dial: '+249', digits: 9 },
    { code: 'LY', flag: '🇱🇾', name: 'ليبيا', dial: '+218', digits: 9 },
] as const;

type Country = (typeof COUNTRIES)[number];

interface PhoneInputProps {
    value: string;
    onChange: (fullNumber: string) => void;
    required?: boolean;
    disabled?: boolean;
    error?: boolean;
    className?: string;
    placeholder?: string;
}

/**
 * Parse a full phone number string to extract country + local number.
 * Supports formats: "966501234567", "+966501234567", "0501234567"
 */
function parsePhoneValue(value: string): { country: Country; localNumber: string } {
    const cleaned = value.replace(/[^0-9]/g, '');

    // Try matching against each country's dial code (longest match first)
    const sortedCountries = [...COUNTRIES].sort(
        (a, b) => b.dial.replace('+', '').length - a.dial.replace('+', '').length
    );

    for (const country of sortedCountries) {
        const dialDigits = country.dial.replace('+', '');
        if (cleaned.startsWith(dialDigits)) {
            return {
                country,
                localNumber: cleaned.slice(dialDigits.length),
            };
        }
    }

    // Default to Saudi Arabia
    // If starts with 0, strip the leading 0 (local format like 05xxxxxxxx)
    const defaultCountry = COUNTRIES[0]; // SA
    if (cleaned.startsWith('0')) {
        return { country: defaultCountry, localNumber: cleaned.slice(1) };
    }

    return { country: defaultCountry, localNumber: cleaned };
}

export function PhoneInput({
    value,
    onChange,
    required = false,
    disabled = false,
    error = false,
    className,
    placeholder,
}: PhoneInputProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Parse the initial/current value to get country and local number
    const parsed = parsePhoneValue(value || '');
    const [selectedCountry, setSelectedCountry] = React.useState<Country>(parsed.country);
    const [localNumber, setLocalNumber] = React.useState(parsed.localNumber);

    // Sync when external value changes (e.g. form reset)
    React.useEffect(() => {
        if (!value) {
            setLocalNumber('');
            return;
        }
        const p = parsePhoneValue(value);
        setSelectedCountry(p.country);
        setLocalNumber(p.localNumber);
    }, [value]);

    // Close dropdown on outside click
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow digits
        const digits = e.target.value.replace(/[^0-9]/g, '');
        // Strip leading zero if user types it
        const cleaned = digits.startsWith('0') ? digits.slice(1) : digits;
        // Enforce max digits
        const limited = cleaned.slice(0, selectedCountry.digits);
        setLocalNumber(limited);

        // Emit full international number (without +)
        const dialDigits = selectedCountry.dial.replace('+', '');
        onChange(limited ? `${dialDigits}${limited}` : '');
    };

    const handleCountrySelect = (country: Country) => {
        setSelectedCountry(country);
        setIsOpen(false);

        // Re-emit with new country code
        const dialDigits = country.dial.replace('+', '');
        // Also enforce new digit limit
        const limited = localNumber.slice(0, country.digits);
        setLocalNumber(limited);
        onChange(limited ? `${dialDigits}${limited}` : '');
    };

    const defaultPlaceholder = '5' + '0'.repeat(selectedCountry.digits - 1);

    return (
        <div className={cn('relative', className)} ref={dropdownRef}>
            <div
                className={cn(
                    'flex items-center border rounded-md bg-background transition-colors',
                    'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
                    error ? 'border-red-500' : 'border-input',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                {/* Country selector */}
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        'flex items-center gap-1 px-2 py-2 border-l border-input',
                        'hover:bg-accent transition-colors rounded-r-md shrink-0',
                        'focus:outline-none focus:bg-accent'
                    )}
                    aria-label="اختر الدولة"
                >
                    <span className="text-lg leading-none">{selectedCountry.flag}</span>
                    <span className="text-sm text-muted-foreground font-mono" dir="ltr">
                        {selectedCountry.dial}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>

                {/* Phone number input */}
                <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    value={localNumber}
                    onChange={handleLocalNumberChange}
                    placeholder={placeholder || defaultPlaceholder}
                    disabled={disabled}
                    required={required}
                    maxLength={selectedCountry.digits}
                    className={cn(
                        'flex-1 px-3 py-2 text-sm bg-transparent border-0',
                        'focus:outline-none placeholder:text-muted-foreground',
                        'disabled:cursor-not-allowed font-mono tracking-wider'
                    )}
                    aria-label="رقم الهاتف"
                />

                {/* Digit counter */}
                <span className="text-xs text-muted-foreground px-2 shrink-0 tabular-nums">
                    {localNumber.length}/{selectedCountry.digits}
                </span>
            </div>

            {/* Country dropdown */}
            {isOpen && (
                <div
                    className={cn(
                        'absolute top-full right-0 mt-1 z-50',
                        'w-64 max-h-64 overflow-y-auto',
                        'bg-popover border border-border rounded-lg shadow-lg',
                        'animate-in fade-in-0 zoom-in-95'
                    )}
                >
                    {COUNTRIES.map((country) => (
                        <button
                            key={country.code}
                            type="button"
                            onClick={() => handleCountrySelect(country)}
                            className={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 text-sm',
                                'hover:bg-accent transition-colors',
                                selectedCountry.code === country.code && 'bg-accent font-medium'
                            )}
                        >
                            <span className="text-lg">{country.flag}</span>
                            <span className="flex-1 text-right">{country.name}</span>
                            <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                                {country.dial}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
