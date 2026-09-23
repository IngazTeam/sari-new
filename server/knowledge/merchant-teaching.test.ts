import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), signal: vi.fn() }));
vi.mock('./merchant-teaching', () => ({ saveMerchantTeaching: mocks.save }));
vi.mock('../db/learning', () => ({ captureSignal: mocks.signal }));
vi.mock('../ai/learning-engine', () => ({ sanitizeDNAText: (text: string) => text }));
import { handleTeachCommand } from '../ai/coaching-engine';
beforeEach(() => { vi.resetAllMocks(); mocks.save.mockResolvedValue({ sectionId: 9, approved: true }); mocks.signal.mockResolvedValue(1); });

it('teaching persists real merchant knowledge before acknowledging success', async () => {
  const response = await handleTeachCommand(8101, 'علم: إذا سأل العميل عن الضمان قل له الضمان سنتان');
  expect(mocks.save).toHaveBeenCalledWith({ merchantId: 8101, question: 'الضمان', answer: 'الضمان سنتان', origin: 'teach_command' });
  expect(response.response).toContain('تم حفظ المعلومة');
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.signal.mock.invocationCallOrder[0]);
});
it('never claims learning succeeded when the knowledge transaction fails', async () => {
  mocks.save.mockRejectedValueOnce(new Error('Database unavailable'));
  const response = await handleTeachCommand(8102, 'علم: الضمان سنتان للأجهزة الجديدة');
  expect(response.response).toContain('تعذر حفظ');
  expect(response.response).not.toContain('تم حفظ');
  expect(mocks.signal).not.toHaveBeenCalled();
});
it('keeps saved knowledge usable when optional analytics fail', async () => {
  mocks.signal.mockRejectedValueOnce(new Error('Analytics unavailable'));
  expect((await handleTeachCommand(8103, 'علم: الضمان سنتان للأجهزة الجديدة')).response).toContain('تم حفظ');
});
