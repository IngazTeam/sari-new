/**
 * Modern SVG Agent Avatars — replaces emoji avatars
 */

const avatarStyles = {
  support: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g1)" />
      <circle cx="40" cy="30" r="12" fill="white" fillOpacity="0.9" />
      <path d="M20 62c0-11 9-20 20-20s20 9 20 20" fill="white" fillOpacity="0.9" />
      <path d="M28 26c0-2 1-4 3-4h18c2 0 3 2 3 4" stroke="white" strokeOpacity="0.6" strokeWidth="2" fill="none" />
      <circle cx="52" cy="38" r="6" fill="white" fillOpacity="0.7" />
      <path d="M52 35v6M49 38h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs><linearGradient id="g1" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient></defs>
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g2)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M35 44l5 8 5-8" stroke="white" strokeOpacity="0.6" strokeWidth="2" fill="none" />
      <defs><linearGradient id="g2" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#059669" /><stop offset="1" stopColor="#047857" /></linearGradient></defs>
    </svg>
  ),
  reception: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g3)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M32 24c2-4 6-6 8-6s6 2 8 6" stroke="white" strokeOpacity="0.5" strokeWidth="2" fill="none" />
      <defs><linearGradient id="g3" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#f59e0b" /><stop offset="1" stopColor="#d97706" /></linearGradient></defs>
    </svg>
  ),
  manager: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g4)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M33 18l7-6 7 6" stroke="white" strokeOpacity="0.7" strokeWidth="2" fill="white" fillOpacity="0.3" />
      <defs><linearGradient id="g4" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></linearGradient></defs>
    </svg>
  ),
  tech: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g5)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <rect x="30" y="25" width="20" height="8" rx="2" fill="white" fillOpacity="0.3" />
      <defs><linearGradient id="g5" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#0ea5e9" /><stop offset="1" stopColor="#0284c7" /></linearGradient></defs>
    </svg>
  ),
  marketing: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g6)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M50 20l6 4-6 4V20z" fill="white" fillOpacity="0.6" />
      <defs><linearGradient id="g6" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#ec4899" /><stop offset="1" stopColor="#be185d" /></linearGradient></defs>
    </svg>
  ),
  consultant: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g7)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <circle cx="40" cy="56" r="4" fill="white" fillOpacity="0.4" />
      <defs><linearGradient id="g7" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#14b8a6" /><stop offset="1" stopColor="#0d9488" /></linearGradient></defs>
    </svg>
  ),
  creative: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g8)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M48 16l4 2-2 4" stroke="white" strokeOpacity="0.6" strokeWidth="2" fill="none" />
      <defs><linearGradient id="g8" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#f97316" /><stop offset="1" stopColor="#ea580c" /></linearGradient></defs>
    </svg>
  ),
  analyst: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g9)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M30 58h4v-6h4v-4h4v-8h4v8h4v4h4v6" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
      <defs><linearGradient id="g9" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#4338ca" /></linearGradient></defs>
    </svg>
  ),
  hr: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g10)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <path d="M36 52h8M40 48v8" stroke="white" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
      <defs><linearGradient id="g10" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#a855f7" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
    </svg>
  ),
  finance: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g11)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <text x="40" y="60" textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="12" fontWeight="bold">$</text>
      <defs><linearGradient id="g11" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#10b981" /><stop offset="1" stopColor="#059669" /></linearGradient></defs>
    </svg>
  ),
  default: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="40" cy="40" r="38" fill="url(#g12)" />
      <circle cx="40" cy="28" r="11" fill="white" fillOpacity="0.9" />
      <path d="M22 64c0-10 8-18 18-18s18 8 18 18" fill="white" fillOpacity="0.9" />
      <defs><linearGradient id="g12" x1="0" y1="0" x2="80" y2="80"><stop stopColor="#64748b" /><stop offset="1" stopColor="#475569" /></linearGradient></defs>
    </svg>
  ),
};

export const AVATAR_OPTIONS = Object.keys(avatarStyles) as AvatarKey[];
export type AvatarKey = keyof typeof avatarStyles;

export function AgentAvatar({ avatar, size = 'md' }: { avatar: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-14 h-14';
  const key = (avatar in avatarStyles ? avatar : 'default') as AvatarKey;
  return (
    <div className={`${sizeClass} rounded-2xl overflow-hidden shadow-lg ring-2 ring-white dark:ring-gray-800`}>
      {avatarStyles[key]}
    </div>
  );
}

export const AVATAR_LABELS: Record<AvatarKey, string> = {
  support: 'دعم فني',
  sales: 'مبيعات',
  reception: 'استقبال',
  manager: 'مدير',
  tech: 'تقني',
  marketing: 'تسويق',
  consultant: 'استشاري',
  creative: 'إبداعي',
  analyst: 'محلل',
  hr: 'موارد بشرية',
  finance: 'مالي',
  default: 'عام',
};
