'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/international';

type Product = {
  id: string; name: string; description: string; type: string; billingInterval: string;
  price: string; currencyCode: string; durationDays: number | null; listingLimit: number | null; features: string[];
};

export function MonetizationOffers({ properties }: { properties: Array<{ id: string; title: string }> }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/monetization/orders', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load plans.');
        setProducts(result.data as Product[]);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load plans.');
      });
    return () => controller.abort();
  }, []);

  async function createOrder(product: Product) {
    setPending(product.id);
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/monetization/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, ...(product.type === 'FEATURED_LISTING' ? { propertyId: selectedProperties[product.id] } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to create this order.');
      if (result.data.status === 'PENDING') {
        await startCheckout(product, result.data.id);
      } else {
        setStatus(`Order ${result.data.id} is ${result.data.status}.`);
      }
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'Unable to create this order.');
    } finally {
      setPending(null);
    }
  }

  async function startCheckout(product: Product, orderId: string) {
    setCheckoutPending(product.id);
    try {
      const response = await fetch('/api/monetization/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType: product.type, orderId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to start test checkout.');
      window.location.assign(result.data.authorizationUrl as string);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start test checkout.');
    } finally {
      setCheckoutPending(null);
    }
  }

  const offers = products;
  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold text-slate-900">Plans and promotion offers</h2>
      <p className="mt-1 text-sm text-slate-500">Paystack test mode only. Plans and promotions activate only after payment verification; no live charges, automatic subscription renewals, or payouts are enabled.</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {status && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{status}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {offers.map((product) => <article key={product.id} className="rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{product.type.replaceAll('_', ' ')} · {product.billingInterval.toLowerCase()}</p>
          <h3 className="mt-2 font-bold text-slate-900">{product.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{product.description}</p>
          <p className="mt-3 text-xl font-bold text-slate-900">{formatCurrency(Number(product.price), product.currencyCode)}{product.billingInterval === 'MONTHLY' ? ' / month' : product.billingInterval === 'ANNUAL' ? ' / year' : ''}</p>
          {product.durationDays && <p className="mt-1 text-xs text-slate-500">Promotion duration: {product.durationDays} days</p>}
          {product.listingLimit && <p className="mt-1 text-xs text-slate-500">Listing limit: {product.listingLimit}</p>}
          {product.features.length > 0 && <ul className="mt-3 list-inside list-disc text-sm text-slate-600">{product.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>}
          {product.type === 'FEATURED_LISTING' && <select required value={selectedProperties[product.id] ?? ''} onChange={(event) => setSelectedProperties({ ...selectedProperties, [product.id]: event.target.value })} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Choose a published property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
          </select>}
          {product.type === 'QUALIFIED_LEAD' ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Lead orders will be available after consent and qualification workflows are configured.</p> : <button type="button" disabled={pending === product.id || (product.type === 'FEATURED_LISTING' && !selectedProperties[product.id])} onClick={() => void createOrder(product)} className="mt-4 w-full rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {pending === product.id || checkoutPending === product.id ? 'Opening Paystack test payment…' : product.type === 'SUBSCRIPTION' ? 'Choose plan' : 'Request promotion'}
          </button>}
        </article>)}
        {offers.length === 0 && <p className="text-sm text-slate-500">No active subscription or promotion offers have been configured.</p>}
      </div>
    </section>
  );
}
