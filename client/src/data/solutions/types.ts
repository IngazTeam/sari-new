import { LucideIcon } from 'lucide-react';

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  isAction?: boolean; // For messages like "ساري أرسل رابط دفع"
}

export interface ChatScenario {
  id: string;
  title: string;
  description: string;
  messages: ChatMessage[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ObjectionItem {
  objection: string;
  response: string;
  icon: LucideIcon;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface SolutionService {
  id: string;
  slug: string;
  title: string;
  metaDescription: string;
  heroTitle: string;
  heroDescription: string;
  heroBadge?: string;
  
  // The operational problem this service solves
  problemTitle: string;
  problemDescription: string;
  
  // How Sari works for this service
  howItWorks: FeatureItem[];
  
  // Interactive Chat Scenarios
  chatScenarios: ChatScenario[];
  
  // Common Objections
  objections: ObjectionItem[];
  
  // FAQs
  faqs: FAQItem[];
  
  // Call to Action
  ctaTitle?: string;
  ctaDescription?: string;
}

export interface SectorData {
  id: string;
  slug: string; // e.g., 'clinics'
  title: string;
  description: string;
  icon: LucideIcon;
  themeColor: string; // Tailwind color class, e.g., 'emerald-500'
  services: SolutionService[];
}
