import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Download,
  FileText,
  Package,
  Plus,
  ShoppingBasket,
  Truck,
  Upload,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  seed,
  quantity,
  formatQty,
  receiptTotal,
  postReceipt,
  postSales,
  approveInvoice,
  locations,
  suppliers,
  TODAY,
  type State,
  type Invoice,
  type Receipt,
  type Sale,
  type MenuItem,
} from './data'

const KEY = 'pantry-shadcn-admin-demo-v1'
const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    n
  )
const vendor = (id: string) => suppliers.find((s) => s.id === id)?.name || id
const location = (id: string) =>
  locations.find((l) => l.id === id)?.name || 'All locations'
const selectClass =
  'h-9 max-w-full rounded-md border bg-background px-3 text-sm'
const titles: Record<string, string> = {
  overview: 'Overview',
  invoices: 'Invoices',
  receiving: 'Receiving',
  inventory: 'Inventory',
  sales: 'Daily sales',
  recipes: 'Menu & recipes',
  suppliers: 'Suppliers',
  reports: 'Reports',
  guide: 'Demo guide',
}
const subtitles: Record<string, string> = {
  overview: 'Your kitchen operations, at a glance.',
  invoices: 'Review supplier paperwork and keep a clear purchase record.',
  receiving: 'Record what actually arrived at each restaurant.',
  inventory: 'See on-hand ingredients and trace each movement.',
  sales: 'Record daily servings and preview ingredient usage.',
  recipes: 'Shared recipes, with raw ingredient quantities per serving.',
  suppliers: 'Your restaurant supplier directory.',
  reports: 'Operational purchasing totals for the selected location.',
  guide: 'Explore the restaurant adaptation of shadcn-admin.',
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === 'Duplicate' || value === 'Reconcile'
          ? 'destructive'
          : value === 'Approved' || value === 'Posted' || value === 'Healthy'
            ? 'secondary'
            : 'outline'
      }
    >
      {value}
    </Badge>
  )
}
function Empty() {
  return (
    <div className='py-12 text-center text-sm text-muted-foreground'>
      No records match this view.
    </div>
  )
}
function exportRows(name: string, rows: (string | number)[][]) {
  const content = rows
    .map((r) =>
      r
        .map((v) => {
          let s = String(v)
          if (/^[=+@\-]/.test(s)) s = "'" + s
          return '"' + s.replace(/"/g, '""') + '"'
        })
        .join(',')
    )
    .join('\r\n')
  const u = URL.createObjectURL(
      new Blob(['\uFEFF' + content], { type: 'text/csv' })
    ),
    a = document.createElement('a')
  a.href = u
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(u), 1000)
}

export function Restaurant({ section }: { section: string }) {
  const [data, setData] = useState<State>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (
        s?.version === 1 &&
        [
          'ingredients',
          'receipts',
          'sales',
          'menu',
          'invoices',
          'movements',
        ].every((k) => Array.isArray(s[k]))
      )
        return s
    } catch {
      /* use seed */
    }
    return seed()
  })
  const [branch, setBranch] = useState('manhattan'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('All'),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState(''),
    [invoice, setInvoice] = useState<Invoice | null>(null),
    [recipe, setRecipe] = useState<MenuItem | null>(null),
    [previews, setPreviews] = useState<
      Record<string, { url: string; type: string }>
    >({}),
    [error, setError] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      toast.error(
        'Local storage is unavailable; changes last for this session.'
      )
    }
  }, [data])
  useEffect(() => {
    setSearch('')
    setFilter('All')
  }, [section])
  const scope = (l: string) => branch === 'all' || branch === l,
    match = (...s: string[]) =>
      s.join(' ').toLowerCase().includes(search.toLowerCase())
  const invoices = data.invoices.filter((i) => scope(i.location_id)),
    receipts = data.receipts.filter((r) => scope(r.location_id)),
    sales = data.sales.filter((s) => scope(s.location_id))
  const stock = locations
    .filter((l) => scope(l.id))
    .flatMap((l) =>
      data.ingredients.map((i) => ({
        ...i,
        location_id: l.id,
        stock: quantity(data, i.id, l.id),
      }))
    )
  const low = stock.filter((i) => i.stock < i.reorder_point),
    pending = invoices.filter((i) => i.status === 'Needs review'),
    purchase = receipts
      .filter((r) => r.status === 'posted')
      .reduce((n, r) => n + receiptTotal(r), 0),
    servings = sales
      .filter((s) => s.status === 'posted')
      .reduce((n, s) => n + s.lines.reduce((a, l) => a + l.servings, 0), 0)
  const open = (m: string, id = '') => {
      setSelected(id)
      setError('')
      setModal(m)
    },
    save = (next: State, message: string) => {
      setData(next)
      setModal('')
      toast.success(message)
    }
  function upload(f?: File) {
    if (!f) return
    if (
      f.size > 10485760 ||
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
        f.type
      )
    ) {
      toast.error('Choose a PDF or image under 10 MB.')
      return
    }
    const id = crypto.randomUUID(),
      i: Invoice = {
        id,
        location_id: branch === 'all' ? 'manhattan' : branch,
        supplier_id: 'food',
        number: '',
        date: TODAY,
        amount: 0,
        status: 'Needs review',
        file_name: f.name,
        note: 'Manual entry. No OCR connected.',
      }
    setPreviews((p) => ({
      ...p,
      [id]: { url: URL.createObjectURL(f), type: f.type },
    }))
    setData((d) => ({ ...d, invoices: [i, ...d.invoices] }))
    setInvoice(i)
    open('invoice', id)
    if (uploadRef.current) uploadRef.current.value = ''
  }
  function review(i: Invoice) {
    setInvoice({ ...i })
    open('invoice', i.id)
  }
  function Filters({
    options = ['All'],
    placeholder = 'Search records…',
  }: {
    options?: string[]
    placeholder?: string
  }) {
    return (
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {options.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          className='w-full sm:w-64'
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    )
  }
  function InvoiceTable({ rows }: { rows: Invoice[] }) {
    return (
      <>
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {['Invoice', 'Supplier', 'Date', 'Total', 'Status', ''].map(
                  (h, i) => (
                    <TableHead key={i}>{h}</TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className='flex items-center gap-3'>
                      <FileText className='size-4 text-muted-foreground' />
                      <div className='font-medium'>
                        {i.number || 'Untitled invoice'}
                        <p className='max-w-48 truncate text-xs font-normal text-muted-foreground'>
                          {i.file_name || location(i.location_id)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{vendor(i.supplier_id)}</TableCell>
                  <TableCell>{i.date}</TableCell>
                  <TableCell>{money(i.amount)}</TableCell>
                  <TableCell>
                    <Status value={i.status} />
                  </TableCell>
                  <TableCell>
                    <Button variant='ghost' size='sm' onClick={() => review(i)}>
                      {i.status === 'Approved' ? 'View' : 'Review'}
                      <ArrowUpRight className='size-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty />
        )}
      </>
    )
  }
  return (
    <>
      <Header fixed>
        <span className='font-medium'>Example Kitchen</span>
        <div className='ms-auto flex items-center gap-2'>
          <Badge variant='outline' className='hidden sm:inline-flex'>
            Frontend demo
          </Badge>
          <select
            className={selectClass}
            aria-label='Location'
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value='all'>All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <ThemeSwitch />
          <ConfigDrawer />
        </div>
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {titles[section] || 'Page not found'}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {subtitles[section]}
            </p>
          </div>
          <div className='flex gap-2'>
            {section === 'overview' && (
              <Button variant='outline' onClick={() => open('receipt')}>
                <Truck />
                Receive stock
              </Button>
            )}
            {['overview', 'invoices'].includes(section) && (
              <Button onClick={() => uploadRef.current?.click()}>
                <Upload />
                Upload invoice
              </Button>
            )}
            {section === 'receiving' && (
              <Button onClick={() => open('receipt')}>
                <Plus />
                New receipt
              </Button>
            )}
            {section === 'sales' && (
              <Button onClick={() => open('sale')}>
                <Plus />
                Record sales
              </Button>
            )}
            {section === 'inventory' && (
              <Button
                variant='outline'
                onClick={() =>
                  exportRows('inventory.csv', [
                    ['Ingredient', 'Location', 'Quantity', 'Unit'],
                    ...stock.map((i) => [
                      i.name,
                      location(i.location_id),
                      i.stock,
                      i.base_unit,
                    ]),
                  ])
                }
              >
                <Download />
                Export CSV
              </Button>
            )}
          </div>
        </div>
        <input
          ref={uploadRef}
          hidden
          type='file'
          accept='application/pdf,image/png,image/jpeg,image/webp'
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {section === 'overview' && (
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {[
                {
                  title: 'Invoices to review',
                  value: pending.length,
                  detail: 'Waiting for a manual review',
                  icon: FileText,
                },
                {
                  title: 'Ingredients below par',
                  value: low.length,
                  detail: 'Location-specific stock balances',
                  icon: Package,
                },
                {
                  title: 'Received purchases',
                  value: money(purchase),
                  detail: 'Posted receipts · sample period',
                  icon: Truck,
                },
                {
                  title: 'Servings recorded',
                  value: servings,
                  detail: 'Ingredient use reflected in inventory',
                  icon: ShoppingBasket,
                },
              ].map((s) => (
                <Card key={s.title}>
                  <CardHeader className='flex flex-row items-center justify-between pb-2'>
                    <CardTitle className='text-sm font-medium'>
                      {s.title}
                    </CardTitle>
                    <s.icon className='size-4 text-muted-foreground' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold'>{s.value}</div>
                    <p className='text-xs text-muted-foreground'>{s.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className='grid gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader>
                  <CardTitle>Purchasing activity</CardTitle>
                  <CardDescription>
                    Received costs · sample week, Nov 3–9
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width='100%' height={300}>
                    <BarChart
                      data={[3, 4, 5, 6, 7, 8, 9].map((d) => ({
                        name: `Nov ${d}`,
                        amount: receipts
                          .filter(
                            (r) =>
                              r.status === 'posted' &&
                              r.received_on ===
                                `2026-11-${String(d).padStart(2, '0')}`
                          )
                          .reduce((n, r) => n + receiptTotal(r), 0),
                      }))}
                    >
                      <CartesianGrid vertical={false} stroke='var(--border)' />
                      <XAxis
                        dataKey='name'
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(v) => money(Number(v))}
                        contentStyle={{
                          background: 'var(--background)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                        }}
                      />
                      <Bar
                        dataKey='amount'
                        fill='var(--primary)'
                        radius={[4, 4, 0, 0]}
                        maxBarSize={45}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>Needs attention</CardTitle>
                  <CardDescription>
                    Keep service running smoothly
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-5'>
                  {[
                    {
                      name: `${pending.length} invoices need review`,
                      detail: 'Check details against the original document.',
                      to: 'invoices',
                    },
                    {
                      name: `${low.length} ingredients below par`,
                      detail: 'Review quantities before the next service.',
                      to: 'inventory',
                    },
                    {
                      name: 'Record your daily sales',
                      detail: 'Preview ingredient usage from your recipes.',
                      to: 'sales',
                    },
                  ].map((t) => (
                    <Link
                      key={t.to}
                      to='/restaurant/$section'
                      params={{ section: t.to }}
                      className='flex items-center justify-between gap-3 border-b pb-5 last:border-0'
                    >
                      <div>
                        <p className='text-sm font-medium'>{t.name}</p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {t.detail}
                        </p>
                      </div>
                      <ArrowUpRight className='size-4' />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Recent invoices</CardTitle>
                <CardDescription>Review purchasing paperwork</CardDescription>
              </CardHeader>
              <CardContent>
                <InvoiceTable rows={invoices.slice(0, 5)} />
              </CardContent>
            </Card>
          </div>
        )}
        {section === 'invoices' && (
          <>
            <div
              className='mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed p-6'
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                upload(e.dataTransfer.files[0])
              }}
            >
              <div>
                <h2 className='font-medium'>Upload a supplier invoice</h2>
                <p className='text-sm text-muted-foreground'>
                  PDF or image, up to 10 MB. Preview locally and enter details
                  manually.
                </p>
              </div>
              <Button
                variant='outline'
                onClick={() => uploadRef.current?.click()}
              >
                Choose file
              </Button>
            </div>
            {Filters({
              options: ['All', 'Needs review', 'Approved', 'Duplicate'],
              placeholder: 'Search invoice or supplier…',
            })}
            <div className='rounded-md border'>
              <InvoiceTable
                rows={invoices.filter(
                  (i) =>
                    (filter === 'All' || filter === i.status) &&
                    match(i.number, vendor(i.supplier_id))
                )}
              />
            </div>
          </>
        )}
        {section === 'inventory' && (
          <>
            {Filters({
              options: ['All', 'Low stock', 'Healthy', 'Reconcile'],
              placeholder: 'Search ingredients…',
            })}
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Ingredient',
                      'Location',
                      'On hand',
                      'Par level',
                      'Status',
                      '',
                    ].map((h, i) => (
                      <TableHead key={i}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock
                    .filter(
                      (i) =>
                        match(i.name, i.category) &&
                        (filter === 'All' ||
                          (filter === 'Healthy'
                            ? i.stock >= i.reorder_point
                            : filter === 'Reconcile'
                              ? i.stock < 0
                              : i.stock < i.reorder_point))
                    )
                    .map((i) => (
                      <TableRow key={i.id + i.location_id}>
                        <TableCell className='font-medium'>
                          {i.name}
                          <p className='text-xs font-normal text-muted-foreground'>
                            {i.category}
                          </p>
                        </TableCell>
                        <TableCell>{location(i.location_id)}</TableCell>
                        <TableCell>{formatQty(i.stock, i.base_unit)}</TableCell>
                        <TableCell>
                          {formatQty(i.reorder_point, i.base_unit)}
                        </TableCell>
                        <TableCell>
                          <Status
                            value={
                              i.stock < 0
                                ? 'Reconcile'
                                : i.stock < i.reorder_point
                                  ? 'Low stock'
                                  : 'Healthy'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              open('stock', i.id + '|' + i.location_id)
                            }
                          >
                            View history
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {['receiving', 'sales'].includes(section) && (
          <>
            {Filters({
              options: ['All', 'Draft', 'Posted'],
              placeholder: 'Search reference…',
            })}
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Reference',
                      section === 'receiving' ? 'Supplier' : 'Menu items',
                      'Location',
                      'Date',
                      section === 'receiving' ? 'Cost' : 'Servings',
                      'Status',
                      '',
                    ].map((h, i) => (
                      <TableHead key={i}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(section === 'receiving' ? receipts : sales)
                    .filter(
                      (r) =>
                        match(r.source_reference) &&
                        (filter === 'All' || filter.toLowerCase() === r.status)
                    )
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className='font-medium'>
                          {r.source_reference}
                        </TableCell>
                        <TableCell>
                          {'supplier_id' in r
                            ? vendor(r.supplier_id)
                            : r.lines.length}
                        </TableCell>
                        <TableCell>{location(r.location_id)}</TableCell>
                        <TableCell>
                          {'received_on' in r ? r.received_on : r.business_date}
                        </TableCell>
                        <TableCell>
                          {'supplier_id' in r
                            ? money(receiptTotal(r))
                            : r.lines.reduce((n, l) => n + l.servings, 0)}
                        </TableCell>
                        <TableCell>
                          <Status
                            value={r.status === 'posted' ? 'Posted' : 'Draft'}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              open(
                                section === 'receiving' ? 'receipt' : 'sale',
                                r.id
                              )
                            }
                          >
                            {r.status === 'posted' ? 'View' : 'Review & post'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {section === 'recipes' && (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {data.menu.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle>{m.name}</CardTitle>
                  <CardDescription>{m.category} · one serving</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {m.recipe_items.map((r) => {
                    const i = data.ingredients.find(
                      (i) => i.id === r.ingredient_id
                    )!
                    return (
                      <div
                        key={i.id}
                        className='flex justify-between border-b pb-3 text-sm'
                      >
                        <span>{i.name}</span>
                        <span>
                          {formatQty(r.quantity_base_per_serving, i.base_unit)}
                        </span>
                      </div>
                    )
                  })}
                  <Button
                    className='mt-3 w-full'
                    variant='outline'
                    onClick={() => {
                      setRecipe(structuredClone(m))
                      open('recipe', m.id)
                    }}
                  >
                    Edit recipe
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {section === 'suppliers' && (
          <div className='grid gap-4 md:grid-cols-3'>
            {suppliers.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription>{s.category}</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <p className='text-sm'>{s.email}</p>
                  <p className='text-2xl font-bold'>
                    {money(
                      receipts
                        .filter(
                          (r) => r.supplier_id === s.id && r.status === 'posted'
                        )
                        .reduce((n, r) => n + receiptTotal(r), 0)
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Received purchases · fictional supplier
                  </p>
                  <Button
                    variant='outline'
                    onClick={() => open('supplier', s.id)}
                  >
                    View deliveries
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {section === 'reports' && (
          <Card>
            <CardHeader className='flex flex-wrap justify-between gap-3'>
              <div>
                <CardTitle>Purchases by supplier</CardTitle>
                <CardDescription>
                  Posted receiving costs · selected location · all sample dates
                </CardDescription>
              </div>
              <Button
                variant='outline'
                onClick={() =>
                  exportRows('purchases.csv', [
                    ['Reference', 'Supplier', 'Location', 'Status', 'Cost USD'],
                    ...receipts.map((r) => [
                      r.source_reference,
                      vendor(r.supplier_id),
                      location(r.location_id),
                      r.status,
                      receiptTotal(r),
                    ]),
                  ])
                }
              >
                <Download />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Deliveries posted</TableHead>
                    <TableHead>Received cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => {
                    const rows = receipts.filter(
                      (r) => r.supplier_id === s.id && r.status === 'posted'
                    )
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{rows.length}</TableCell>
                        <TableCell>
                          {money(rows.reduce((n, r) => n + receiptTotal(r), 0))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <p className='mt-4 text-sm text-muted-foreground'>
                Operational costs only. This is not a profit or accounting
                report.
              </p>
            </CardContent>
          </Card>
        )}
        {section === 'guide' && (
          <Card className='max-w-3xl'>
            <CardHeader>
              <CardTitle>Built on shadcn-admin</CardTitle>
              <CardDescription>
                Original template styling, restaurant-specific pages.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm'>
              <p>
                Start with a receipt, post it, then record servings sold.
                Inventory shows the changes. Invoice approval is a separate step
                and never receives goods.
              </p>
              <p>
                All data is fictional and stored only in this browser. Uploaded
                file previews last for the current page session. OCR, Supabase
                and POS are not connected.
              </p>
              <p>
                Sidebar, layout, mobile navigation, theme controls, tables,
                forms and dialogs reuse the original open-source frontend
                components.
              </p>
              <a
                className='underline'
                href='https://github.com/satnaing/shadcn-admin'
                target='_blank'
                rel='noreferrer'
              >
                View original repository ↗
              </a>
              <div>
                <Button variant='outline' onClick={() => open('reset')}>
                  Reset sample data
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <p className='mt-8 text-xs text-muted-foreground'>
          Example Kitchen · Fictional data · Frontend only · Based on
          shadcn-admin (MIT)
        </p>
      </Main>
      <Dialog
        open={!!modal}
        onOpenChange={(o) => {
          if (!o) setModal('')
        }}
      >
        <DialogContent
          className={
            'max-h-[90svh] overflow-y-auto ' +
            (modal === 'invoice' ? 'sm:max-w-4xl' : 'sm:max-w-2xl')
          }
        >
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    invoice: 'Review invoice',
                    receipt: 'Receive stock',
                    sale: 'Record daily sales',
                    recipe: 'Edit recipe',
                    stock: 'Inventory history',
                    supplier: 'Supplier deliveries',
                    reset: 'Reset sample data?',
                  } as Record<string, string>
                )[modal]
              }
            </DialogTitle>
            <DialogDescription>
              Example Kitchen · Demo data saved in this browser
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role='alert'
              className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'
            >
              {error}
            </p>
          )}
          {(modal === 'receipt' || modal === 'sale') && (
            <Transaction
              key={modal + selected}
              kind={modal}
              data={data}
              branch={branch === 'all' ? 'manhattan' : branch}
              id={selected}
              save={save}
              fail={setError}
            />
          )}
          {modal === 'invoice' && invoice && (
            <div className='grid gap-6 md:grid-cols-2'>
              <div className='flex min-h-80 items-center justify-center rounded-lg border bg-muted p-4'>
                {previews[invoice.id] ? (
                  previews[invoice.id].type === 'application/pdf' ? (
                    <iframe
                      title='Invoice PDF'
                      className='h-[460px] w-full'
                      src={previews[invoice.id].url}
                    />
                  ) : (
                    <img
                      alt='Uploaded invoice'
                      className='max-h-[500px] max-w-full object-contain'
                      src={previews[invoice.id].url}
                    />
                  )
                ) : (
                  <div className='w-full space-y-6 rounded border bg-background p-6'>
                    <FileText />
                    <Badge variant='outline'>
                      {invoice.file_name
                        ? 'Session preview unavailable'
                        : 'Sample document'}
                    </Badge>
                    <h3 className='text-xl font-semibold'>
                      {invoice.file_name ||
                        vendor(
                          data.invoices.find((i) => i.id === invoice.id)!
                            .supplier_id
                        )}
                    </h3>
                    <p>
                      {data.invoices.find((i) => i.id === invoice.id)!.number}
                    </p>
                    <p className='text-2xl font-semibold'>
                      {money(
                        data.invoices.find((i) => i.id === invoice.id)!.amount
                      )}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {invoice.file_name
                        ? 'Reupload the original if a new session needs its preview.'
                        : 'Illustrative sample, not a real invoice.'}
                    </p>
                  </div>
                )}
              </div>
              <form
                className='space-y-4'
                onSubmit={(e) => {
                  e.preventDefault()
                  try {
                    save(
                      approveInvoice(data, invoice),
                      'Invoice approved. Inventory is unchanged.'
                    )
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                <Status value={invoice.status} />
                <Field label='Supplier'>
                  <select
                    className={selectClass + ' w-full'}
                    disabled={invoice.status === 'Approved'}
                    value={invoice.supplier_id}
                    onChange={(e) =>
                      setInvoice({
                        ...invoice,
                        supplier_id: e.target.value,
                        receipt_id: undefined,
                      })
                    }
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label='Invoice number'>
                  <Input
                    required
                    disabled={invoice.status === 'Approved'}
                    value={invoice.number}
                    onChange={(e) =>
                      setInvoice({ ...invoice, number: e.target.value })
                    }
                  />
                </Field>
                <Field label='Invoice date'>
                  <Input
                    type='date'
                    required
                    disabled={invoice.status === 'Approved'}
                    value={invoice.date}
                    onChange={(e) =>
                      setInvoice({ ...invoice, date: e.target.value })
                    }
                  />
                </Field>
                <Field label='Total (USD)'>
                  <Input
                    required
                    type='number'
                    min='.01'
                    step='.01'
                    disabled={invoice.status === 'Approved'}
                    value={invoice.amount || ''}
                    onChange={(e) =>
                      setInvoice({ ...invoice, amount: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label='Review note'>
                  <Textarea
                    disabled={invoice.status === 'Approved'}
                    value={invoice.note}
                    onChange={(e) =>
                      setInvoice({ ...invoice, note: e.target.value })
                    }
                  />
                </Field>
                <p className='text-xs text-muted-foreground'>
                  Manual review only. Approval does not add inventory.
                </p>
                {invoice.status !== 'Approved' && (
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() =>
                        save(
                          {
                            ...data,
                            invoices: data.invoices.map((i) =>
                              i.id === invoice.id ? invoice : i
                            ),
                          },
                          'Draft saved'
                        )
                      }
                    >
                      Save draft
                    </Button>
                    <Button type='submit'>Approve invoice</Button>
                  </div>
                )}
              </form>
            </div>
          )}
          {modal === 'recipe' && recipe && (
            <form
              className='space-y-4'
              onSubmit={(e) => {
                e.preventDefault()
                if (
                  recipe.recipe_items.some(
                    (r) =>
                      r.quantity_base_per_serving <= 0 ||
                      !Number.isFinite(r.quantity_base_per_serving)
                  )
                ) {
                  setError('Quantities must be positive.')
                  return
                }
                save(
                  {
                    ...data,
                    menu: data.menu.map((m) =>
                      m.id === recipe.id ? recipe : m
                    ),
                  },
                  'Recipe saved for future sales.'
                )
              }}
            >
              <h3 className='font-medium'>{recipe.name}</h3>
              {recipe.recipe_items.map((r, k) => {
                const i = data.ingredients.find(
                  (i) => i.id === r.ingredient_id
                )!
                return (
                  <Field
                    label={`${i.name} (${i.base_unit} per serving)`}
                    key={i.id}
                  >
                    <Input
                      required
                      type='number'
                      min='.001'
                      step='any'
                      value={r.quantity_base_per_serving}
                      onChange={(e) =>
                        setRecipe({
                          ...recipe,
                          recipe_items: recipe.recipe_items.map((v, n) =>
                            n === k
                              ? {
                                  ...v,
                                  quantity_base_per_serving: Number(
                                    e.target.value
                                  ),
                                }
                              : v
                          ),
                        })
                      }
                    />
                  </Field>
                )
              })}
              <Button>Save recipe</Button>
            </form>
          )}
          {modal === 'stock' &&
            (() => {
              const [id, l] = selected.split('|'),
                i = data.ingredients.find((i) => i.id === id)!
              return (
                <>
                  <h3 className='text-lg font-semibold'>
                    {i.name} · {formatQty(quantity(data, id, l), i.base_unit)}
                  </h3>
                  <p className='text-sm text-muted-foreground'>{location(l)}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.movements
                        .filter(
                          (m) => m.ingredient_id === id && m.location_id === l
                        )
                        .map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>{m.business_date}</TableCell>
                            <TableCell>
                              {data.receipts.find((r) => r.id === m.source_id)
                                ?.source_reference ||
                                data.sales.find((s) => s.id === m.source_id)
                                  ?.source_reference}
                            </TableCell>
                            <TableCell>
                              {m.quantity_base > 0 ? '+' : ''}
                              {formatQty(m.quantity_base, i.base_unit)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </>
              )
            })()}
          {modal === 'supplier' && (
            <div className='space-y-3'>
              <h3 className='font-medium'>{vendor(selected)}</h3>
              {receipts
                .filter((r) => r.supplier_id === selected)
                .map((r) => (
                  <div
                    key={r.id}
                    className='flex items-center justify-between rounded-md border p-3 text-sm'
                  >
                    <span>
                      {r.source_reference} · {location(r.location_id)}
                    </span>
                    <Button
                      variant='ghost'
                      onClick={() => open('receipt', r.id)}
                    >
                      {money(receiptTotal(r))} ↗
                    </Button>
                  </div>
                ))}
            </div>
          )}
          {modal === 'reset' && (
            <>
              <p className='text-sm'>
                Replace this browser’s demo edits with the original sample? This
                does not affect any database.
              </p>
              <div className='flex justify-end gap-2'>
                <Button variant='outline' onClick={() => setModal('')}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    Object.values(previews).forEach((p) =>
                      URL.revokeObjectURL(p.url)
                    )
                    setPreviews({})
                    save(seed(), 'Sample data restored')
                  }}
                >
                  Reset demo
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Label className='grid gap-2 text-sm'>
      {label}
      {children}
    </Label>
  )
}
function Transaction({
  kind,
  data,
  branch,
  id,
  save,
  fail,
}: {
  kind: 'receipt' | 'sale'
  data: State
  branch: string
  id: string
  save: (s: State, msg: string) => void
  fail: (s: string) => void
}) {
  const old =
      kind === 'receipt'
        ? data.receipts.find((r) => r.id === id)
        : data.sales.find((s) => s.id === id),
    posted = old?.status === 'posted'
  const [loc, setLoc] = useState(old?.location_id || branch),
    [supplier, setSupplier] = useState((old as Receipt)?.supplier_id || 'food'),
    [ref, setRef] = useState(
      old?.source_reference ||
        `${kind === 'receipt' ? 'RCV' : 'SALES'}-${String(Date.now()).slice(-6)}`
    ),
    [date, setDate] = useState(
      (old as Receipt)?.received_on || (old as Sale)?.business_date || TODAY
    )
  const [lines, setLines] = useState<Receipt['lines']>(
      kind === 'receipt' && old
        ? (old as Receipt).lines
        : [
            {
              ingredient_id: 'rice',
              packs_received: 1,
              quantity_per_pack_base: 1000,
              unit_pack_cost: 3,
            },
          ]
    ),
    [servings, setServings] = useState<Record<string, number>>(() =>
      Object.fromEntries(
        data.menu.map((m) => [
          m.id,
          kind === 'sale' && old
            ? (old as Sale).lines.find((l) => l.menu_item_id === m.id)
                ?.servings || 0
            : 0,
        ])
      )
    )
  function submit(post: boolean) {
    try {
      if (!ref.trim() || !date)
        throw Error('Enter a source reference and date.')
      if (kind === 'receipt') {
        if (
          lines.some(
            (l) =>
              l.packs_received <= 0 ||
              l.quantity_per_pack_base <= 0 ||
              l.unit_pack_cost < 0
          )
        )
          throw Error('Enter positive quantities and valid costs.')
        if (
          data.receipts.some(
            (r) =>
              r.id !== id &&
              r.location_id === loc &&
              r.supplier_id === supplier &&
              r.source_reference.trim().toLowerCase() ===
                ref.trim().toLowerCase()
          )
        )
          throw Error('This receipt reference already exists.')
        const r: Receipt = {
            id: id || crypto.randomUUID(),
            location_id: loc,
            supplier_id: supplier,
            source_reference: ref.trim(),
            received_on: date,
            status: 'draft',
            lines,
          },
          next = {
            ...data,
            receipts: old
              ? data.receipts.map((v) => (v.id === id ? r : v))
              : [r, ...data.receipts],
          }
        save(
          post ? postReceipt(next, r.id) : next,
          post
            ? 'Receipt posted; inventory updated.'
            : 'Draft saved; stock unchanged.'
        )
      } else {
        const items = data.menu
          .filter((m) => servings[m.id] > 0)
          .map((m) => ({ menu_item_id: m.id, servings: servings[m.id] }))
        if (!items.length) throw Error('Enter servings for at least one dish.')
        if (
          data.sales.some(
            (s) =>
              s.id !== id &&
              s.location_id === loc &&
              s.source_reference.trim().toLowerCase() ===
                ref.trim().toLowerCase()
          )
        )
          throw Error('This sales reference already exists.')
        const s: Sale = {
            id: id || crypto.randomUUID(),
            location_id: loc,
            source_reference: ref.trim(),
            business_date: date,
            status: 'draft',
            lines: items,
          },
          next = {
            ...data,
            sales: old
              ? data.sales.map((v) => (v.id === id ? s : v))
              : [s, ...data.sales],
          }
        save(
          post ? postSales(next, s.id) : next,
          post
            ? 'Sales posted; ingredient usage recorded.'
            : 'Draft saved; stock unchanged.'
        )
      }
    } catch (e) {
      fail((e as Error).message)
    }
  }
  return (
    <form
      className='space-y-5'
      onSubmit={(e) => {
        e.preventDefault()
        submit(true)
      }}
    >
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='Location'>
          <select
            className={selectClass}
            value={loc}
            disabled={posted}
            onChange={(e) => setLoc(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={kind === 'receipt' ? 'Received on' : 'Business date'}>
          <Input
            required
            type='date'
            disabled={posted}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label='Source reference'>
          <Input
            required
            disabled={posted}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </Field>
        {kind === 'receipt' && (
          <Field label='Supplier'>
            <select
              className={selectClass}
              disabled={posted}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {posted && (
        <Badge variant='secondary'>Posted · quantities preserved</Badge>
      )}
      {kind === 'receipt' ? (
        <>
          {lines.map((l, k) => (
            <div key={k} className='space-y-3 rounded-lg border p-4'>
              <Field label='Ingredient'>
                <select
                  className={selectClass}
                  disabled={posted}
                  value={l.ingredient_id}
                  onChange={(e) =>
                    setLines(
                      lines.map((v, n) =>
                        n === k ? { ...v, ingredient_id: e.target.value } : v
                      )
                    )
                  }
                >
                  {data.ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className='grid grid-cols-3 gap-3'>
                {(
                  [
                    { key: 'packs_received', label: 'Packs', min: 0.001 },
                    {
                      key: 'quantity_per_pack_base',
                      label: `Per pack (${data.ingredients.find((i) => i.id === l.ingredient_id)?.base_unit})`,
                      min: 0.001,
                    },
                    { key: 'unit_pack_cost', label: 'Cost/pack ($)', min: 0 },
                  ] as const
                ).map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      required
                      type='number'
                      disabled={posted}
                      step='any'
                      min={f.min}
                      value={l[f.key]}
                      onChange={(e) =>
                        setLines(
                          lines.map((v, n) =>
                            n === k
                              ? { ...v, [f.key]: Number(e.target.value) }
                              : v
                          )
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
              {!posted && lines.length > 1 && (
                <Button
                  variant='ghost'
                  type='button'
                  size='sm'
                  onClick={() => setLines(lines.filter((_, n) => n !== k))}
                >
                  Remove line
                </Button>
              )}
            </div>
          ))}
          {!posted && (
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    ingredient_id: 'rice',
                    packs_received: 1,
                    quantity_per_pack_base: 1000,
                    unit_pack_cost: 0,
                  },
                ])
              }
            >
              <Plus />
              Add ingredient
            </Button>
          )}
        </>
      ) : (
        <>
          {data.menu.map((m) => (
            <Field key={m.id} label={m.name + ' servings'}>
              <Input
                type='number'
                min='0'
                step='1'
                disabled={posted}
                value={servings[m.id] || ''}
                placeholder='0'
                onChange={(e) =>
                  setServings({ ...servings, [m.id]: Number(e.target.value) })
                }
              />
            </Field>
          ))}
          <div className='space-y-2 rounded-lg bg-muted p-4 text-sm'>
            <h3 className='font-medium'>
              {posted ? 'Recorded usage' : 'Ingredient usage preview'}
            </h3>
            {data.ingredients.map((i) => {
              const amount = posted
                ? -data.movements
                    .filter(
                      (m) => m.source_id === id && m.ingredient_id === i.id
                    )
                    .reduce((n, m) => n + m.quantity_base, 0)
                : data.menu.reduce(
                    (n, m) =>
                      n +
                      (servings[m.id] || 0) *
                        (m.recipe_items.find((r) => r.ingredient_id === i.id)
                          ?.quantity_base_per_serving || 0),
                    0
                  )
              return amount > 0 ? (
                <div
                  key={i.id}
                  className='flex flex-wrap justify-between gap-2'
                >
                  <span>{i.name}</span>
                  <span>{formatQty(amount, i.base_unit)}</span>
                  {!posted && quantity(data, i.id, loc) < amount && (
                    <p className='w-full text-xs text-destructive'>
                      This will create negative stock.
                    </p>
                  )}
                </div>
              ) : null
            })}
          </div>
        </>
      )}
      {!posted && (
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='outline' onClick={() => submit(false)}>
            Save draft
          </Button>
          <Button type='submit'>
            {kind === 'receipt' ? 'Post receipt' : 'Post sales'}
          </Button>
        </div>
      )}
    </form>
  )
}
