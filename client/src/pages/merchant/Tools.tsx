import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Search } from 'lucide-react';
import {
  merchantSections,
  navigableMerchantTools,
} from '@/components/merchant/navigation';

export default function MerchantTools() {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(
    () => new URLSearchParams(window.location.search).get('section') || 'all'
  );
  const tools = navigableMerchantTools.filter(
    tool =>
      (section === 'all' || tool.section === section) &&
      `${tool.title} ${tool.path}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  return (
    <div className="space-y-6">
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">كل أدواتك، بتنظيم أوضح</p>
          <h1>جميع الأدوات</h1>
          <p>اختر مهمة للوصول مباشرة إلى صفحتها، أو ابحث باسم الأداة.</p>
        </div>
      </header>
      <div className="mw-tools-toolbar">
        <div className="mw-search-field">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="tools-search">
            البحث في الأدوات
          </label>
          <input
            id="tools-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث باسم الأداة…"
          />
        </div>
        <label className="sr-only" htmlFor="tool-section">
          القسم
        </label>
        <select
          id="tool-section"
          value={section}
          onChange={e => setSection(e.target.value)}
        >
          <option value="all">كل الأقسام</option>
          {merchantSections.map(s => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {tools.length} أداة
      </p>
      <div className="mw-tools-grid">
        {tools.map(tool => {
          const group = merchantSections.find(s => s.id === tool.section)!;
          return (
            <Link key={tool.path} href={tool.path} className="mw-tool-card">
              <group.icon aria-hidden="true" />
              <span>
                <strong>{tool.title}</strong>
                <small>{group.title}</small>
              </span>
              <ArrowLeft aria-hidden="true" />
            </Link>
          );
        })}
      </div>
      {!tools.length && (
        <p className="rounded-xl border bg-card p-10 text-center">
          لا توجد أداة بهذا الاسم. جرّب بحثًا آخر أو اختر كل الأقسام.
        </p>
      )}
    </div>
  );
}
