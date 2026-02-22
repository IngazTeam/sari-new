import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ThemeSwitcherProps {
  variant?: 'default' | 'compact' | 'toggle';
  className?: string;
}

export function ThemeSwitcher({ variant = 'default', className }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme, switchable } = useTheme();

  if (!switchable || !toggleTheme) {
    return null;
  }

  // Toggle variant - simple button that toggles between light and dark
  if (variant === 'toggle') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className={cn("relative", className)}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">{t('compThemeSwitcherPage.text0')}</span>
      </Button>
    );
  }

  // Compact variant - icon only with dropdown
  if (variant === 'compact') {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className}>
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">{t('compThemeSwitcherPage.text1')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => theme !== 'light' && toggleTheme()}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Sun className="h-4 w-4" />
              فاتح
            </span>
            {theme === 'light' && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => theme !== 'dark' && toggleTheme()}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Moon className="h-4 w-4" />
              داكن
            </span>
            {theme === 'dark' && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default variant - button with text
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          {theme === 'light' ? (
            <>
              <Sun className="h-4 w-4" />
              <span className="hidden sm:inline">{t('compThemeSwitcherPage.text2')}</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span className="hidden sm:inline">{t('compThemeSwitcherPage.text3')}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={() => theme !== 'light' && toggleTheme()}
          className={cn(
            "flex items-center justify-between cursor-pointer",
            theme === 'light' && "bg-primary/10"
          )}
        >
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            فاتح
          </span>
          {theme === 'light' && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => theme !== 'dark' && toggleTheme()}
          className={cn(
            "flex items-center justify-between cursor-pointer",
            theme === 'dark' && "bg-primary/10"
          )}
        >
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            داكن
          </span>
          {theme === 'dark' && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// مكون بسيط للتبديل السريع
export function ThemeToggle({ className }: { className?: string }) {
  return <ThemeSwitcher variant="toggle" className={className} />;
}

export default ThemeSwitcher;
