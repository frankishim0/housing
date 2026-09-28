'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/international';
import { AdminDisputeForm } from '@/components/admin-dispute-form';

type Rule = {
  id: string; name: string; transactionType: string | null; countryCode: string | null; propertyTypeCode: string | null; currencyCode: string | null;
  percentageRate: string; fixedFee: string; processingFeeRate: string; processingFeeFixed: string; payer: string; active: boolean;
};
type Product = {
  id: string; code: string; name: string; description: string; type: string; billingInterval: string; price: string; currencyCode: string;
  durationDays: number | null; listingLimit: number | null; features: string[]; active: boolean;
};
type CurrencySummary = { currencyCode: string; _sum: Record<string, string | null> };
type DashboardData = {
  commissionRules: Rule[];
  products: Product[];
  transactionsByCountryCurrency: Array<{ countryCode: string | null; currencyCode: string; _sum: Record<string, string | null> }>;
  payouts: Array<{ currencyCode: string; status: string; _sum: { amount: string | null }; _count: { _all: number } }>;
  refunds: CurrencySummary[];
  revenue: { subscriptions: CurrencySummary[]; featuredListings: CurrencySummary[]; leads: CurrencySummary[] };
  transactionTrends: Array<{ month: string; currencyCode: string; gross: string; commission: string }>;
  recentTransactions: Array<{ id: string; reference: string; status: string; transactionType: string; amount: string; currencyCode: string; platformCommission: string; totalBuyerDue: string; finalPayout: string; buyer: { name: string }; seller: { name: string }; property: { title: string } | null; refunds: Array<{ id: string; status: string; amount: string }>; disputes: Array<{ id: string; status: string; resolution: string | null }> }>;
  auditLogs: Array<{ id: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string; actor: { name: string } | null }>;
};

type RuleForm = {
  name: string; transactionType: string; countryCode: string; propertyTypeCode: string; currencyCode: string;
  percentageRate: string; fixedFee: string; processingFeeRate: string; processingFeeFixed: string; payer: string; active: boolean; reason: string;
};
type ProductForm = {
  code: string; name: string; description: string; type: string; billingInterval: string; price: string; currencyCode: string;
  durationDays: string; listingLimit: string; features: string; active: boolean; reason: string;
};

const emptyRule: RuleForm = { name: '', transactionType: '', countryCode: '', propertyTypeCode: '', currencyCode: '', percentageRate: '0', fixedFee: '0', processingFeeRate: '0', processingFeeFixed: '0', payer: 'SELLER', active: true, reason: '' };
const emptyProduct: ProductForm = { code: '', name: '', description: '', type: 'SUBSCRIPTION', billingInterval: 'MONTHLY', price: '0', currencyCode: 'USD', durationDays: '', listingLimit: '', features: '', active: true, reason: '' };
const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';

function amount(value: string | null | undefined) {
  return Number(value ?? 0);
}

function money(value: number, currencyCode: string) {
  return formatCurrency(value, currencyCode);
}

export function AdminMonetizationPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [rule, setRule] = useState<RuleForm>(emptyRule);
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/monetization');
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load financial settings.');
      setData(result.data as DashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load financial settings.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/monetization', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load financial settings.');
        setData(result.data as DashboardData);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load financial settings.');
      });
    return () => controller.abort();
  }, []);

  function selectRule(id: string) {
    setSelectedRuleId(id);
    const selected = data?.commissionRules.find((item) => item.id === id);
    setRule(selected ? {
      name: selected.name, transactionType: selected.transactionType ?? '', countryCode: selected.countryCode ?? '',
      propertyTypeCode: selected.propertyTypeCode ?? '', currencyCode: selected.currencyCode ?? '',
      percentageRate: selected.percentageRate, fixedFee: selected.fixedFee, processingFeeRate: selected.processingFeeRate,
      processingFeeFixed: selected.processingFeeFixed, payer: selected.payer, active: selected.active, reason: '',
    } : { ...emptyRule });
  }

  function selectProduct(id: string) {
    setSelectedProductId(id);
    const selected = data?.products.find((item) => item.id === id);
    setProduct(selected ? {
      code: selected.code, name: selected.name, description: selected.description, type: selected.type,
      billingInterval: selected.billingInterval, price: selected.price, currencyCode: selected.currencyCode,
      durationDays: selected.durationDays?.toString() ?? '', listingLimit: selected.listingLimit?.toString() ?? '',
      features: selected.features.join(', '), active: selected.active, reason: '',
    } : { ...emptyProduct });
  }

  async function save(event: FormEvent, kind: 'commissionRule' | 'product') {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');
    try {
      const selectedId = kind === 'commissionRule' ? selectedRuleId : selectedProductId;
      const payload = kind === 'commissionRule'
        ? {
            kind, ...(selectedId ? { id: selectedId } : {}), reason: rule.reason,
            data: {
              name: rule.name, transactionType: rule.transactionType || null, countryCode: rule.countryCode || null,
              propertyTypeCode: rule.propertyTypeCode || null, currencyCode: rule.currencyCode || null,
              percentageRate: Number(rule.percentageRate), fixedFee: Number(rule.fixedFee),
              processingFeeRate: Number(rule.processingFeeRate), processingFeeFixed: Number(rule.processingFeeFixed),
              payer: rule.payer, active: rule.active,
            },
          }
        : {
            kind, ...(selectedId ? { id: selectedId } : {}), reason: product.reason,
            data: {
              code: product.code.toUpperCase(), name: product.name, description: product.description, type: product.type,
              billingInterval: product.billingInterval, price: Number(product.price), currencyCode: product.currencyCode.toUpperCase(),
              durationDays: product.durationDays ? Number(product.durationDays) : null,
              listingLimit: product.listingLimit ? Number(product.listingLimit) : null,
              features: product.features.split(',').map((item) => item.trim()).filter(Boolean), active: product.active,
            },
          };
      const response = await fetch('/api/admin/monetization', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to save financial settings.');
      setFeedback(kind === 'commissionRule' ? 'Commission rule saved and audit logged.' : 'Monetization product saved and audit logged.');
      if (kind === 'commissionRule') { setSelectedRuleId(''); setRule({ ...emptyRule }); }
      else { setSelectedProductId(''); setProduct({ ...emptyProduct }); }
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save financial settings.');
    } finally {
      setBusy(false);
    }
  }

  const currencies = new Map<string, { gross: number; commission: number; subscriptions: number; featured: number; leads: number; refunds: number }>();
  function currencyRow(code: string) {
    let row = currencies.get(code);
    if (!row) { row = { gross: 0, commission: 0, subscriptions: 0, featured: 0, leads: 0, refunds: 0 }; currencies.set(code, row); }
    return row;
  }
  for (const item of data?.transactionsByCountryCurrency ?? []) {
    const row = currencyRow(item.currencyCode);
    row.gross += amount(item._sum.amount);
    row.commission += amount(item._sum.platformCommission);
  }
  for (const item of data?.revenue.subscriptions ?? []) currencyRow(item.currencyCode).subscriptions += amount(item._sum.priceAtPurchase);
  for (const item of data?.revenue.featuredListings ?? []) currencyRow(item.currencyCode).featured += amount(item._sum.priceAtPurchase);
  for (const item of data?.revenue.leads ?? []) currencyRow(item.currencyCode).leads += amount(item._sum.priceAtPurchase);
  for (const item of data?.refunds ?? []) currencyRow(item.currencyCode).refunds += amount(item._sum.amount);

  return (
    <section className="mt-10 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Marketplace revenue</h2>
        <p className="mt-1 text-sm text-slate-500">Amounts remain grouped by original currency. Quotes are not revenue; only provider-confirmed or audited paid records appear here.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {feedback && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p>}
        {!data && !error && <p className="mt-4 text-sm text-slate-500">Loading financial records…</p>}
        {data && <>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{['Currency', 'Gross transaction value', 'Commission', 'Subscriptions', 'Featured listings', 'Paid leads', 'Refunds', 'Net platform revenue'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody>{[...currencies.entries()].map(([code, row]) => <tr key={code} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{code}</td><td className="px-4 py-3">{money(row.gross, code)}</td><td className="px-4 py-3">{money(row.commission, code)}</td><td className="px-4 py-3">{money(row.subscriptions, code)}</td><td className="px-4 py-3">{money(row.featured, code)}</td><td className="px-4 py-3">{money(row.leads, code)}</td><td className="px-4 py-3">{money(row.refunds, code)}</td><td className="px-4 py-3 font-semibold">{money(row.commission + row.subscriptions + row.featured + row.leads - row.refunds, code)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900">Transactions by country and currency</h3>
              <div className="mt-3 space-y-2 text-sm">{data.transactionsByCountryCurrency.length === 0 ? <p className="text-slate-500">No completed financial transactions.</p> : data.transactionsByCountryCurrency.map((item) => <p key={`${item.countryCode}-${item.currencyCode}`} className="flex justify-between gap-4 border-b border-slate-100 py-2"><span>{item.countryCode ?? 'Country not recorded'} · {item.currencyCode}</span><span>{money(amount(item._sum.amount), item.currencyCode)} gross · {money(amount(item._sum.platformCommission), item.currencyCode)} commission</span></p>)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900">Payouts and revenue trends</h3>
              <div className="mt-3 space-y-2 text-sm">{data.payouts.length === 0 ? <p className="text-slate-500">No payout records.</p> : data.payouts.map((item) => <p key={`${item.currencyCode}-${item.status}`} className="flex justify-between"><span>{item.status} · {item.currencyCode} ({item._count._all})</span><span>{money(amount(item._sum.amount), item.currencyCode)}</span></p>)}</div>
              <h4 className="mt-5 font-semibold text-slate-800">Monthly confirmed transactions</h4>
              <div className="mt-2 space-y-1 text-sm">{data.transactionTrends.length === 0 ? <p className="text-slate-500">No completed transaction trend data.</p> : data.transactionTrends.map((item) => <p key={`${item.month}-${item.currencyCode}`} className="flex justify-between"><span>{new Date(item.month).toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' })} · {item.currencyCode}</span><span>{amount(item.gross).toFixed(2)} gross · {amount(item.commission).toFixed(2)} commission</span></p>)}</div>
            </div>
          </div>
        </>}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={(event) => void save(event, 'commissionRule')} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold text-slate-900">Commission rules</h3>
          <select value={selectedRuleId} onChange={(event) => selectRule(event.target.value)} className={fieldClass}><option value="">Create a commission rule</option>{data?.commissionRules.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inactive)'}</option>)}</select>
          <input required placeholder="Rule name" value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} className={fieldClass} />
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={rule.transactionType} onChange={(event) => setRule({ ...rule, transactionType: event.target.value })} className={fieldClass}><option value="">All transaction types</option>{['SALE', 'RENT', 'LEASE', 'SHORT_TERM_RENT', 'BOOKING_FEE', 'DEPOSIT', 'VIEWING_FEE', 'PLATFORM_FEE'].map((value) => <option key={value}>{value}</option>)}</select>
            <select value={rule.payer} onChange={(event) => setRule({ ...rule, payer: event.target.value })} className={fieldClass}><option>SELLER</option><option>BUYER</option><option>SHARED</option></select>
            <input placeholder="Country code (e.g. NG)" value={rule.countryCode} onChange={(event) => setRule({ ...rule, countryCode: event.target.value.toUpperCase() })} className={fieldClass} maxLength={2} />
            <input placeholder="Property type code (optional)" value={rule.propertyTypeCode} onChange={(event) => setRule({ ...rule, propertyTypeCode: event.target.value })} className={fieldClass} />
            <input placeholder="Currency code (e.g. USD)" value={rule.currencyCode} onChange={(event) => setRule({ ...rule, currencyCode: event.target.value.toUpperCase() })} className={fieldClass} maxLength={3} />
            <input required type="number" min="0" max="100" step="0.0001" aria-label="Commission percentage" value={rule.percentageRate} onChange={(event) => setRule({ ...rule, percentageRate: event.target.value })} className={fieldClass} placeholder="Commission %" />
            <input required type="number" min="0" step="0.0001" aria-label="Commission fixed fee" value={rule.fixedFee} onChange={(event) => setRule({ ...rule, fixedFee: event.target.value })} className={fieldClass} placeholder="Commission fixed fee" />
            <input required type="number" min="0" max="100" step="0.0001" aria-label="Processing fee percentage" value={rule.processingFeeRate} onChange={(event) => setRule({ ...rule, processingFeeRate: event.target.value })} className={fieldClass} placeholder="Processing fee %" />
            <input required type="number" min="0" step="0.0001" aria-label="Processing fixed fee" value={rule.processingFeeFixed} onChange={(event) => setRule({ ...rule, processingFeeFixed: event.target.value })} className={fieldClass} placeholder="Processing fixed fee" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.active} onChange={(event) => setRule({ ...rule, active: event.target.checked })} />Rule active</label>
          <textarea required minLength={10} value={rule.reason} onChange={(event) => setRule({ ...rule, reason: event.target.value })} className={fieldClass} placeholder="Reason for this financial change (saved to audit log)" />
          <button disabled={busy} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : selectedRuleId ? 'Update commission rule' : 'Create commission rule'}</button>
          <p className="text-xs text-slate-500">Overlapping rules resolve by most specific match, then most recently updated. A transaction quote snapshots the chosen rates.</p>
        </form>

        <form onSubmit={(event) => void save(event, 'product')} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold text-slate-900">Plans, promotions and lead products</h3>
          <select value={selectedProductId} onChange={(event) => selectProduct(event.target.value)} className={fieldClass}><option value="">Create a product</option>{data?.products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Product code (e.g. PRO_MONTHLY)" value={product.code} onChange={(event) => setProduct({ ...product, code: event.target.value.toUpperCase() })} className={fieldClass} />
            <input required placeholder="Product name" value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} className={fieldClass} />
            <select value={product.type} onChange={(event) => setProduct({ ...product, type: event.target.value })} className={fieldClass}><option>SUBSCRIPTION</option><option>FEATURED_LISTING</option><option>QUALIFIED_LEAD</option></select>
            <select value={product.billingInterval} onChange={(event) => setProduct({ ...product, billingInterval: event.target.value })} className={fieldClass}><option>MONTHLY</option><option>ANNUAL</option><option>ONE_TIME</option></select>
            <input required type="number" min="0" step="0.0001" aria-label="Product price" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} className={fieldClass} placeholder="Price" />
            <input required value={product.currencyCode} onChange={(event) => setProduct({ ...product, currencyCode: event.target.value.toUpperCase() })} className={fieldClass} placeholder="Currency code" maxLength={3} />
            <input type="number" min="1" value={product.durationDays} onChange={(event) => setProduct({ ...product, durationDays: event.target.value })} className={fieldClass} placeholder="Promotion duration in days" />
            <input type="number" min="1" value={product.listingLimit} onChange={(event) => setProduct({ ...product, listingLimit: event.target.value })} className={fieldClass} placeholder="Listing limit" />
          </div>
          <textarea required value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} className={fieldClass} placeholder="Product description" />
          <input value={product.features} onChange={(event) => setProduct({ ...product, features: event.target.value })} className={fieldClass} placeholder="Features separated by commas" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={product.active} onChange={(event) => setProduct({ ...product, active: event.target.checked })} />Product active</label>
          <textarea required minLength={10} value={product.reason} onChange={(event) => setProduct({ ...product, reason: event.target.value })} className={fieldClass} placeholder="Reason for this financial change (saved to audit log)" />
          <button disabled={busy} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : selectedProductId ? 'Update product' : 'Create product'}</button>
        </form>
      </div>

      {data && <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold text-slate-900">Recent financial transactions</h3>
          <div className="mt-4 space-y-3">{data.recentTransactions.length === 0 ? <p className="text-sm text-slate-500">No transaction quotes or completed transactions yet.</p> : data.recentTransactions.map((item) => <article key={item.id} className="rounded-2xl border border-slate-100 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong>{item.reference} · {item.status}</strong><span>{item.transactionType} · {item.currencyCode} {amount(item.amount).toFixed(2)}</span></div>
            <p className="mt-1 text-slate-600">{item.property?.title ?? 'Property unavailable'} · {item.buyer.name} → {item.seller.name}</p>
            <p className="mt-1 text-slate-600">Commission {money(amount(item.platformCommission), item.currencyCode)} · buyer due {money(amount(item.totalBuyerDue), item.currencyCode)} · payout {money(amount(item.finalPayout), item.currencyCode)}</p>
            {(item.refunds.length > 0 || item.disputes.length > 0) && <p className="mt-1 text-amber-800">Refund records: {item.refunds.map((refund) => `${refund.status} ${refund.amount}`).join(', ') || 'none'} · disputes: {item.disputes.map((dispute) => dispute.status).join(', ') || 'none'}</p>}
            {item.status === 'PAID' && <p className="mt-3 text-xs text-slate-500">Refunds are disabled until the test-mode payment flow has completed verification.</p>}
            {item.disputes.map((dispute) => <AdminDisputeForm key={dispute.id} disputeId={dispute.id} status={dispute.status} resolution={dispute.resolution} />)}
          </article>)}</div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold text-slate-900">Financial audit trail</h3>
          <div className="mt-4 space-y-3">{data.auditLogs.length === 0 ? <p className="text-sm text-slate-500">Commission and product changes will be recorded here.</p> : data.auditLogs.map((item) => <article key={item.id} className="border-b border-slate-100 pb-3 text-sm">
            <p className="font-semibold text-slate-900">{item.action} · {item.entityType} · {item.actor?.name ?? 'Former admin'}</p>
            <p className="text-slate-600">{item.reason}</p>
            <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
          </article>)}</div>
        </section>
      </div>}
    </section>
  );
}
