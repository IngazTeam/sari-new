import { describe, expect, it } from 'vitest';
import { lexicalRelevance, relevantPassages, sectionContentHash } from './retrieval';
import { bufferToEmbedding, embeddingToBuffer } from '../ai/rag-engine';

describe('knowledge retrieval fallback and source versions', () => {
  it('normalizes Arabic diacritics, hamza and definite articles without returning arbitrary content', () => {
    expect(lexicalRelevance('ما شُرُوط الإسترجاع؟', 'شروط الاسترجاع', 'الاسترجاع خلال المدة الموضحة')).toBeGreaterThan(0.8);
    expect(lexicalRelevance('ما شروط الاسترجاع؟', 'ساعات العمل', 'نفتح صباحا')).toBe(0);
    expect(lexicalRelevance('مرحبا', '', 'التوصيل خلال يومين')).toBe(0);
  });
  it('retrieves the late relevant passage rather than the first page of a long document', () => {
    const document = 'مقدمة تعريفية بالنشاط\n'.repeat(500) + '\nشروط الضمان: الضمان سنتان للأجزاء الأصلية فقط.\n' + 'معلومات عامة\n'.repeat(400);
    const result = relevantPassages(document, 'كم مدة الضمان؟');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].text).toContain('الضمان سنتان');
    expect(result[0].start).toBeGreaterThan(5000);
    expect(document.slice(result[0].start, result[0].end)).toBe(result[0].text);
    expect(relevantPassages(document, 'دورات الغوص')).toEqual([]);
  });
  it('changes the source digest for a title, summary or content edit', () => {
    const section = { title: 'Warranty', summary: null, content: 'Two years' };
    for (const edit of [{ title: 'New warranty' }, { summary: 'Warranty policy' }, { content: 'One year' }]) {
      expect(sectionContentHash({ ...section, ...edit })).not.toBe(sectionContentHash(section));
    }
  });
  it('decodes an unaligned database blob and rejects incomplete floats', () => {
    const vector = new Float32Array([0.3, 0.5, -1]);
    const raw = Buffer.concat([Buffer.alloc(1), embeddingToBuffer(vector)]).subarray(1);
    expect(Array.from(bufferToEmbedding(raw))).toEqual(Array.from(vector));
    expect(bufferToEmbedding(Buffer.alloc(3))).toHaveLength(0);
    expect(Array.from(bufferToEmbedding(embeddingToBuffer(vector.subarray(1))))).toEqual(Array.from(vector.subarray(1)));
  });
});
