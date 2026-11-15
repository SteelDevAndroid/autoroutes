import { expect, it } from 'vitest';
import { clearMapFrame, mapPadding } from './mapViewport';

it('keeps the desktop framing to the left of a station panel', () => {
  const frame = clearMapFrame(960, 730, [
    { left: 580, top: 20, right: 940, bottom: 640 },
    { left: 18, top: 12, right: 348, bottom: 118 },
  ]);
  expect(frame.right).toBeLessThan(580);
  expect(frame.top).toBeGreaterThan(118);
  expect(frame.bottom).toBe(730);
});

it('keeps the mobile map above the sheet while using the full screen width', () => {
  const frame = clearMapFrame(390, 592, [{ left: 0, top: 231, right: 390, bottom: 592 }]);
  expect(mapPadding(frame, 390, 592)).toEqual({ top: 0, left: 0, right: 0, bottom: 373 });
});
