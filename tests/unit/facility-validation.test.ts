import { describe, it, expect } from 'vitest';
import { checkFacilityName, chooseFacility } from '@/lib/facility-validation.js';

/**
 * Every case below is a real answer a map source gave for a Depok premises.
 */

describe('Reading a name against its category', () => {
  it('should reject the wrong places both sources actually returned', () => {
    expect(checkFacilityName('hospital', 'RUMAH MELAHIRKAN MEDICAL HACKING DEPOK').confidence).toBe('REJECTED');
    expect(checkFacilityName('hospital', 'Xing Pet Care and Clinic').confidence).toBe('REJECTED');
    expect(checkFacilityName('transit', 'Jl. Raya St Depok Lama').confidence).toBe('REJECTED');
    expect(checkFacilityName('mall', 'Cantik cellular depok').confidence).toBe('REJECTED');
    expect(checkFacilityName('market', 'Biskuit Bayi').confidence).toBe('REJECTED');
    expect(checkFacilityName('school', 'Learn Indonesian Online').confidence).toBe('REJECTED');
    expect(checkFacilityName('university', 'Yayasan Pendidikan Islam Raudlatul Ikhwan').confidence).toBe('REJECTED');
  });

  it('should confirm the right ones', () => {
    expect(checkFacilityName('hospital', 'Hermina Hospital Depok').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('hospital', 'Klinik Depok Medika').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('transit', 'Stasiun Depok Baru').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('market', 'TIP TOP Depok').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('school', 'SDN Cipayung I').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('university', 'Universitas BSI Kampus Margonda B').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('worship', "Masjid Raudlatul Mu'minin").confidence).toBe('CONFIRMED');
  });

  it('should let a veterinary clinic lose to the word clinic', () => {
    // "Klinik Hewan" matches both rules; the rejection has to win.
    expect(checkFacilityName('hospital', 'Klinik Hewan Sejahtera').confidence).toBe('REJECTED');
  });

  it('should say unverified rather than guess on an unreadable name', () => {
    const check = checkFacilityName('mall', 'Kull Cell');
    expect(check.confidence).toBe('REJECTED');

    expect(checkFacilityName('office', 'Menara Bidakara').confidence).toBe('CONFIRMED');
    expect(checkFacilityName('school', 'Quantum Brain Depok Fullday').confidence).toBe('UNVERIFIED');
  });

  it('should treat a missing name as unverified, not as a rejection', () => {
    expect(checkFacilityName('school', null).confidence).toBe('UNVERIFIED');
    expect(checkFacilityName('school', '   ').confidence).toBe('UNVERIFIED');
  });
});

describe('Choosing which candidate to report', () => {
  it('should skip the wrong nearest one and take the real thing behind it', () => {
    const chosen = chooseFacility('hospital', [
      { name: 'RUMAH MELAHIRKAN MEDICAL HACKING DEPOK', distanceMeters: 356 },
      { name: 'Hermina Hospital Depok', distanceMeters: 611 },
    ]);

    expect(chosen.name).toBe('Hermina Hospital Depok');
    expect(chosen.distanceMeters).toBe(611);
    expect(chosen.confidence).toBe('CONFIRMED');
    expect(chosen.rejected).toBe(1);
  });

  it('should prefer a confirmed match over a nearer unreadable one', () => {
    const chosen = chooseFacility('market', [
      { name: 'Naga mart cell', distanceMeters: 100 },
      { name: 'Pasar Kemiri Muka', distanceMeters: 900 },
    ]);

    // A confirmed market 900 m away is worth more than a maybe at 100 m.
    expect(chosen.name).toBe('Pasar Kemiri Muka');
  });

  it('should fall back to an unverified name when nothing is confirmed', () => {
    const chosen = chooseFacility('school', [
      { name: 'Quantum Brain Depok Fullday', distanceMeters: 241 },
    ]);

    expect(chosen.name).toBe('Quantum Brain Depok Fullday');
    expect(chosen.confidence).toBe('UNVERIFIED');
  });

  it('should report nothing when every candidate is ruled out', () => {
    const chosen = chooseFacility('mall', [
      { name: 'Kull Cell', distanceMeters: 622 },
      { name: 'Cantik cellular depok', distanceMeters: 976 },
    ]);

    // Better an empty row than a phone kiosk presented as a shopping centre.
    expect(chosen.name).toBeNull();
    expect(chosen.distanceMeters).toBeNull();
    expect(chosen.confidence).toBe('REJECTED');
    expect(chosen.rejected).toBe(2);
  });

  it('should report nothing when the provider found nothing', () => {
    expect(chooseFacility('mall', []).name).toBeNull();
  });
});
