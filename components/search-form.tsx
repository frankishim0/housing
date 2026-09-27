const propertyOptions = ['Apartment', 'House', 'Duplex', 'Studio', 'Terrace', 'Office'];

export function SearchForm({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/search" method="get" className={compact ? 'space-y-3' : 'rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60'}>
      <div className={compact ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-4' : 'grid gap-3 lg:grid-cols-6'}>
        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Location</span>
          <input
            name="location"
            defaultValue=""
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none ring-0 transition focus:border-emerald-500"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Type</span>
          <select
            name="type"
            defaultValue=""
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-emerald-500"
          >
            <option value="">Any type</option>
            {propertyOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Min price</span>
          <input
            type="number"
            name="minPrice"
            defaultValue=""
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-emerald-500"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Max price</span>
          <input
            type="number"
            name="maxPrice"
            defaultValue=""
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-emerald-500"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Bedrooms</span>
          <select name="bedrooms" defaultValue="" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-emerald-500">
            <option value="">Any</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-2 block">Rent or buy</span>
          <select name="listingType" defaultValue="" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-emerald-500">
            <option value="">Rent or buy</option>
            <option value="RENT">Rent</option>
            <option value="SALE">Buy</option>
          </select>
        </label>
      </div>

      <div className={compact ? 'flex justify-end' : 'mt-4 flex justify-end'}>
        <button type="submit" className="rounded-full bg-emerald-600 px-7 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
          Search homes
        </button>
      </div>
    </form>
  );
}
