import * as React from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

// Country data: flag, translated name key, dial code, and local-number length.
const COUNTRIES = [
    { code: 'SA', flag: '🇸🇦', nameKey: 'countrySA', dial: '+966', digits: 9 },
    { code: 'AE', flag: '🇦🇪', nameKey: 'countryAE', dial: '+971', digits: 9 },
    { code: 'KW', flag: '🇰🇼', nameKey: 'countryKW', dial: '+965', digits: 8 },
    { code: 'BH', flag: '🇧🇭', nameKey: 'countryBH', dial: '+973', digits: 8 },
    { code: 'QA', flag: '🇶🇦', nameKey: 'countryQA', dial: '+974', digits: 8 },
    { code: 'OM', flag: '🇴🇲', nameKey: 'countryOM', dial: '+968', digits: 8 },
    { code: 'EG', flag: '🇪🇬', nameKey: 'countryEG', dial: '+20', digits: 10 },
    { code: 'JO', flag: '🇯🇴', nameKey: 'countryJO', dial: '+962', digits: 9 },
    { code: 'IQ', flag: '🇮🇶', nameKey: 'countryIQ', dial: '+964', digits: 10 },
    { code: 'YE', flag: '🇾🇪', nameKey: 'countryYE', dial: '+967', digits: 9 },
    { code: 'SD', flag: '🇸🇩', nameKey: 'countrySD', dial: '+249', digits: 9 },
    { code: 'LY', flag: '🇱🇾', nameKey: 'countryLY', dial: '+218', digits: 9 },
] as const;

type Country = (typeof COUNTRIES)[number];

interface PhoneInputProps {
    id?: string;
    name?: string;
    value: string;
    onChange: (fullNumber: string) => void;
    autoComplete?: string;
    ariaDescribedBy?: string;
    ariaInvalid?: boolean;
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
    id,
    name,
    value,
    onChange,
    autoComplete,
    ariaDescribedBy,
    ariaInvalid = false,
    required = false,
    disabled = false,
    error = false,
    className,
    placeholder,
}: PhoneInputProps) {
    const { t } = useTranslation();

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

        // Re-emit with new country code
        const dialDigits = country.dial.replace('+', '');
        // Also enforce new digit limit
        const limited = localNumber.slice(0, country.digits);
        setLocalNumber(limited);
        onChange(limited ? `${dialDigits}${limited}` : '');
    };

    const defaultPlaceholder = '5' + '0'.repeat(selectedCountry.digits - 1);

    return (
        <div className={cn('relative', className)}>
            <div
                className={cn(
                    'flex items-center border rounded-md bg-background transition-colors',
                    'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
                    error ? 'border-red-500' : 'border-input',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <select
                    disabled={disabled}
                    value={selectedCountry.code}
                    autoComplete="tel-country-code"
                    onChange={(event) => {
                        const country = COUNTRIES.find((item) => item.code === event.target.value);
                        if (country) handleCountrySelect(country);
                    }}
                    className={cn(
                        'max-w-36 bg-transparent px-2 py-2 border-0 border-e border-input text-sm',
                        'hover:bg-accent transition-colors shrink-0',
                        'focus:outline-none focus:bg-accent disabled:cursor-not-allowed'
                    )}
                    aria-label={t('authUx.signup.countrySelector')}
                >
                    {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                            {country.flag} {t(`authUx.signup.${country.nameKey}`)} ({country.dial})
                        </option>
                    ))}
                </select>

                {/* Phone number input */}
                <input
                    id={id}
                    name={name}
                    type="tel"
                    inputMode="numeric"
                    autoComplete={autoComplete}
                    dir="ltr"
                    value={localNumber}
                    onChange={handleLocalNumberChange}
                    placeholder={placeholder || defaultPlaceholder}
                    disabled={disabled}
                    required={required}
                    minLength={selectedCountry.digits}
                    maxLength={selectedCountry.digits}
                    className={cn(
                        'flex-1 px-3 py-2 text-sm bg-transparent border-0',
                        'focus:outline-none placeholder:text-muted-foreground',
                        'disabled:cursor-not-allowed font-mono tracking-wider'
                    )}
                    aria-label={id ? undefined : t('authUx.signup.phoneInputLabel')}
                    aria-describedby={ariaDescribedBy}
                    aria-invalid={ariaInvalid}
                />

                {/* Digit counter */}
                <span className="text-xs text-muted-foreground px-2 shrink-0 tabular-nums" aria-hidden="true">
                    {localNumber.length}/{selectedCountry.digits}
                </span>
            </div>

        </div>
    );
}
