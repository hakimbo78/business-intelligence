import React, { useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../auth/AuthContext';

/**
 * Shown next to the investment field. Mirrors INITIAL_INVESTMENT_DEFINITION_ID
 * in src/lib/financial-inputs.ts — the client must be asked for exactly what
 * the payback calculation consumes.
 */
const INVESTMENT_HELP =
  'Seluruh uang yang keluar sebelum bisnis buka: deposit/uang jaminan sewa, renovasi & interior, ' +
  'peralatan & mesin, furniture, papan nama, perizinan, dan stok awal. ' +
  'TIDAK termasuk sewa bulanan, gaji, dan listrik/air — ketiganya dihitung terpisah sebagai biaya operasional.';

export const NewOrder: React.FC = () => {
  const [modelType, setModelType] = useState<'validation' | 'scouting'>('validation');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    clientName: '',
    businessCategory: '',
    estimatedInitialInvestment: '',
    averageTransaction: '',
    dailyCustomers: '',
    grossMargin: '',
    operatingDays: '',
    operatingCostMonthly: '',
    address: '',
    targetArea: '',
    latitude: '',
    longitude: '',
    propertySize: '',
    monthlyRent: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const location = modelType === 'validation' ? formData.address : formData.targetArea;

      // The order type decides the pipeline: validation assesses the premises
      // the client supplies, scouting searches for micro-areas itself.
      const projectType = modelType === 'validation' ? 'VALIDATION' : 'AREA_SCOUTING';

      // 1. Create the order from the structured form.
      //
      // Deliberately NOT /intake: that endpoint runs an LLM to parse free text,
      // which would spend money before the client has paid — and would only be
      // re-deriving fields this form already collected exactly.
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({
          name: `${formData.businessCategory} — ${location}`,
          projectType,
          businessProfile: {
            businessName: formData.clientName,
            businessCategory: formData.businessCategory,
            currentAverageTransaction: Number(formData.averageTransaction),
            estimatedDailyCustomers: Number(formData.dailyCustomers),
            // Supplied rather than assumed: both move the payback period a lot.
            grossMargin: Number(formData.grossMargin) / 100,
            operatingDays: Number(formData.operatingDays),
            ...(formData.operatingCostMonthly
              ? { operatingCostMonthly: Number(formData.operatingCostMonthly) }
              : {}),
          },
          locationSearch: {
            targetCity: location,
            estimatedInitialInvestment: Number(formData.estimatedInitialInvestment),
          },
        })
      });

      if (!createRes.ok) {
        const payload = await createRes.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to create order');
      }
      const project = await createRes.json();

      // 2. For a validation order, attach the premises the client named. This
      // is what the report will be about — without it the pipeline has nothing
      // to assess. The rent is also recorded as an observation for the area.
      if (modelType === 'validation') {
        const premisesRes = await fetch(`/api/projects/${project.id}/premises`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
          body: JSON.stringify({
            source: 'CUSTOMER_SUBMITTED',
            address: formData.address,
            ...(formData.latitude ? { latitude: Number(formData.latitude) } : {}),
            ...(formData.longitude ? { longitude: Number(formData.longitude) } : {}),
            ...(formData.propertySize ? { sizeSqm: Number(formData.propertySize) } : {}),
            ...(formData.monthlyRent ? { monthlyRent: Number(formData.monthlyRent) } : {}),
          })
        });

        if (!premisesRes.ok) {
          const payload = await premisesRes.json().catch(() => ({}));
          throw new Error(payload.error ?? 'Failed to attach the property');
        }
      }

      // 3. Send the figures the customer typed as structured values rather than
      // relying on the model to re-extract them from prose. These drive the
      // payback calculation, so they must arrive exactly as entered.
      const inputsRes = await fetch(`/api/projects/${project.id}/financial-inputs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({
          estimatedInitialInvestment: Number(formData.estimatedInitialInvestment),
          currentAverageTransaction: Number(formData.averageTransaction),
          estimatedDailyCustomers: Number(formData.dailyCustomers),
        })
      });

      if (!inputsRes.ok) {
        const payload = await inputsRes.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to save financial inputs');
      }

      const readiness = await inputsRes.json();
      if (!readiness.readyForAnalysis) {
        const fields = (readiness.missingFinancialInputs ?? [])
          .map((m: { field: string }) => m.field)
          .join(', ');
        throw new Error(`Still missing required input(s): ${fields}`);
      }

      // 4. Analysis starts only after the transfer is verified, so the client
      // goes to the payment step rather than straight into the pipeline.
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1>New Analysis Order</h1>
        <p className="text-muted mt-2">Select your business model and input parameters.</p>
      </div>

      <div className="flex gap-4 mb-8">
        <Card
          className={`cursor-pointer border-2 hover-glow ${modelType === 'validation' ? 'border-primary' : 'border-transparent'}`}
        >
          <div onClick={() => setModelType('validation')} className="p-2">
            <h3 className="mb-2">📍 Location Validation</h3>
            <p className="text-sm text-muted">I have a specific property candidate to analyze.</p>
            <p className="text-xs text-muted mt-2">Assesses the premises you supply — go / no-go, with risks.</p>
          </div>
        </Card>

        <Card
          className={`cursor-pointer border-2 hover-glow ${modelType === 'scouting' ? 'border-primary' : 'border-transparent'}`}
        >
          <div onClick={() => setModelType('scouting')} className="p-2">
            <h3 className="mb-2">🗺️ Area Scouting</h3>
            <p className="text-sm text-muted">I want recommendations within a general area.</p>
            <p className="text-xs text-muted mt-2">Recommends micro-areas (streets, clusters) to search in — not specific premises.</p>
          </div>
        </Card>
      </div>

      <Card title="Order Details">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input name="clientName" label="Client Name" placeholder="e.g. John Doe" onChange={handleChange} required />
            <Input name="businessCategory" label="Business Category" placeholder="e.g. Coffee Shop" onChange={handleChange} required />
          </div>

          <div>
            <Input
              name="estimatedInitialInvestment"
              label="Total Investasi Awal / Total Initial Investment (Rp)"
              type="number"
              min="1"
              placeholder="e.g. 350000000"
              onChange={handleChange}
              required
            />
            <p className="text-xs text-muted mt-2">{INVESTMENT_HELP}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              name="averageTransaction"
              label="Average Transaction Value (Rp)"
              type="number"
              min="1"
              placeholder="e.g. 35000"
              onChange={handleChange}
              required
            />
            <Input
              name="dailyCustomers"
              label="Estimated Customers / Day"
              type="number"
              min="1"
              placeholder="e.g. 100"
              onChange={handleChange}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                name="grossMargin"
                label="Margin Kotor (%)"
                type="number"
                min="1"
                max="100"
                placeholder="mis. 65"
                onChange={handleChange}
                required
              />
              <p className="text-xs text-muted mt-2">
                Persentase dari penjualan yang tersisa setelah biaya barang/bahan.
                Restoran umumnya 60–70%, laundry 50–70%, ritel 20–40%.
              </p>
            </div>
            <div>
              <Input
                name="operatingDays"
                label="Hari Buka per Bulan"
                type="number"
                min="1"
                max="31"
                placeholder="mis. 30"
                onChange={handleChange}
                required
              />
              <p className="text-xs text-muted mt-2">
                Berapa hari usaha ini buka dalam sebulan.
              </p>
            </div>
          </div>

          <div>
            <Input
              name="operatingCostMonthly"
              label="Biaya Operasional Bulanan di luar Sewa (Rp) — opsional"
              type="number"
              min="1"
              placeholder="mis. 20000000"
              onChange={handleChange}
            />
            <p className="text-xs text-muted mt-2">
              Gaji karyawan, listrik, air, gas, bahan habis pakai, pemasaran.
              <strong> Jika dikosongkan, laba operasional di laporan hanya dikurangi sewa
              dan akan tampak lebih besar dari kenyataan.</strong>
            </p>
          </div>

          {modelType === 'validation' && (
            <div className="mt-4 p-4 border border-border-subtle rounded-md bg-[rgba(0,0,0,0.2)]">
              <h4 className="mb-4">Property Candidate Details</h4>
              <Input name="address" label="Property Address" placeholder="e.g. Jl. Kemang Raya No. 1" onChange={handleChange} required />

              <div className="grid grid-cols-2 gap-4">
                <Input name="latitude" label="Latitude (Optional)" placeholder="-6.261" onChange={handleChange} />
                <Input name="longitude" label="Longitude (Optional)" placeholder="106.816" onChange={handleChange} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input name="propertySize" label="Size (m2)" type="number" min="1" onChange={handleChange} required />
                <Input
                  name="monthlyRent"
                  label="Monthly Rent (Rp)"
                  type="number"
                  min="1"
                  onChange={handleChange}
                  required
                />
              </div>
              <p className="text-xs text-muted mt-2">
                Masukkan sewa per <strong>bulan</strong>. Jika sewa dibayar per tahun, bagi 12 terlebih dahulu.
              </p>
            </div>
          )}

          {modelType === 'scouting' && (
            <div className="mt-4 p-4 border border-border-subtle rounded-md bg-[rgba(0,0,0,0.2)]">
              <h4 className="mb-4">Target Area</h4>
              <Input
                name="targetArea"
                label="District / City"
                placeholder="e.g. Kemang, Jakarta Selatan"
                onChange={handleChange}
                required
              />
              <p className="text-xs text-muted mt-2">
                We recommend micro-areas to search in. You find the available premises there.
              </p>
            </div>
          )}

          {error && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="mt-8 flex justify-end">
            <Button type="submit" isLoading={loading}>Start Analysis</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
