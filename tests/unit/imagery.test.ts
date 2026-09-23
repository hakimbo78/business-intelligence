import { describe, it, expect } from 'vitest';
import {
  bearing,
  describeImagery,
  formatCaptureDate,
  imageryAgeYears,
  imageryCacheKey,
} from '@/lib/imagery.js';

describe('Capture date', () => {
  it('should read Google’s format into Indonesian', () => {
    expect(formatCaptureDate('2023-05')).toBe('Mei 2023');
  });

  it('should cope with a year on its own', () => {
    expect(formatCaptureDate('2019')).toBe('2019');
  });

  it('should say nothing when Google says nothing', () => {
    expect(formatCaptureDate(null)).toBeNull();
    expect(formatCaptureDate(undefined)).toBeNull();
  });

  it('should measure how old the photograph is', () => {
    const now = new Date('2026-09-23');
    expect(imageryAgeYears('2023-05', now)).toBe(3);
    expect(imageryAgeYears('2026-01', now)).toBe(0);
    expect(imageryAgeYears(null, now)).toBeNull();
  });
});

describe('Camera heading', () => {
  it('should point north at a place due north', () => {
    const heading = bearing({ latitude: -6.26, longitude: 106.81 }, { latitude: -6.25, longitude: 106.81 });
    expect(Math.round(heading)).toBe(0);
  });

  it('should point east at a place due east', () => {
    const heading = bearing({ latitude: -6.26, longitude: 106.81 }, { latitude: -6.26, longitude: 106.82 });
    expect(Math.round(heading)).toBe(90);
  });
});

const shot = { dataUri: 'data:image/png;base64,AAA', captureDate: '2026-05', offsetMeters: 8 };

describe('What the photograph is allowed to claim', () => {
  it('should always state when the photograph was taken', () => {
    const notes = describeImagery({ streetView: shot, map: null, now: new Date('2026-09-23') });
    expect(notes.join(' ')).toContain('Mei 2026');
    expect(notes.join(' ')).toContain('bisa sudah berbeda');
  });

  it('should say the age is unknown rather than imply the photograph is current', () => {
    const notes = describeImagery({ streetView: { ...shot, captureDate: null }, map: null });
    expect(notes.join(' ')).toContain('tidak menyebutkan kapan');
  });

  it('should call out a photograph old enough to mislead', () => {
    const notes = describeImagery({
      streetView: { ...shot, captureDate: '2019-03' },
      map: null,
      now: new Date('2026-09-23'),
    });
    expect(notes.join(' ')).toContain('7 tahun');
  });

  it('should warn when the camera stood far from the address', () => {
    const notes = describeImagery({ streetView: { ...shot, offsetMeters: 75 }, map: null });
    expect(notes.join(' ')).toContain('BUKAN properti yang dinilai');
  });

  it('should not warn when the camera stood at the address', () => {
    const notes = describeImagery({ streetView: shot, map: null });
    expect(notes.join(' ')).not.toContain('BUKAN properti yang dinilai');
  });

  it('should treat missing imagery as a weak hint, not as proof of an alley', () => {
    const notes = describeImagery({ streetView: null, map: null });
    const text = notes.join(' ');

    expect(text).toContain('tidak memiliki foto');
    // The tempting inference, explicitly declawed.
    expect(text).toContain('bukan bukti');
  });

  it('should say the map shows only competitors listed on Google', () => {
    const notes = describeImagery({
      streetView: null,
      map: { dataUri: 'data:image/png;base64,AAA', markedCompetitors: 6 },
    });
    expect(notes.join(' ')).toContain('6 pesaing');
    expect(notes.join(' ')).toContain('tidak terdaftar di Google Maps tidak muncul');
  });

  it('should never let an image stand in for a site visit', () => {
    const notes = describeImagery({ streetView: shot, map: null });
    expect(notes.join(' ')).toContain('bukan pengganti kunjungan');
  });
});

describe('Cache key', () => {
  it('should share an entry between two requests for the same premises', () => {
    const a = imageryCacheKey({ latitude: -6.2612345, longitude: 106.8161234 }, 'sv');
    const b = imageryCacheKey({ latitude: -6.2612348, longitude: 106.8161231 }, 'sv');
    expect(a).toBe(b);
  });

  it('should not share an entry between neighbouring shops', () => {
    const a = imageryCacheKey({ latitude: -6.2612, longitude: 106.8161 }, 'sv');
    const b = imageryCacheKey({ latitude: -6.2625, longitude: 106.8161 }, 'sv');
    expect(a).not.toBe(b);
  });
});
