import { useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  request,
  toForm,
  type InvoiceDetail,
  type InvoiceForm,
  type Workspace,
} from './api'

const selectClass = 'h-9 min-w-0 rounded-md border bg-background px-2 text-sm'
const titles: Record<string, string> = {
  overview: 'Overview',
  invoices: 'Invoice processing',
  receiving: 'Receiving',
  inventory: 'Inventory',
  suppliers: 'Suppliers',
  reports: 'Invoice report',
  sales: 'Daily sales',
  recipes: 'Menu & recipes',
  guide: 'Workflow guide',
}
const statusLabel = (s: string) =>
  ({
    needs_review: 'Needs review',
    approved: 'Approved',
    rejected: 'Rejected',
    duplicate: 'Duplicate',
  })[s] || s
const money = (n: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(n || 0)
  )
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className='grid min-w-0 gap-2 text-sm font-medium'>
      {title}
      {children}
    </label>
  )
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === 'rejected' || value === 'duplicate'
          ? 'destructive'
          : value === 'approved'
            ? 'secondary'
            : 'outline'
      }
    >
      {statusLabel(value)}
    </Badge>
  )
}
function Grid({ headings, rows }: { headings: string[]; rows: ReactNode[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((v, j) => (
                <TableCell key={j}>{v}</TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={headings.length}
              className='py-12 text-center text-muted-foreground'
            >
              No records yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export function ConnectedRestaurant({ section }: { section: string }) {
  const query = useQuery({
    queryKey: ['restaurant-workspace'],
    queryFn: () => request<Workspace>('/workspace'),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const data = query.data
  const [location, setLocation] = useState('all'),
    [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('')
  const [detail, setDetail] = useState<InvoiceDetail | null>(null),
    [form, setForm] = useState<InvoiceForm | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false)
  const [receivedOn, setReceivedOn] = useState(today),
    [confirmed, setConfirmed] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const supplierName = (id: string | null) =>
    data?.suppliers.find((s) => s.id === id)?.name || 'Not assigned'
  const locationName = (id: string) =>
    data?.locations.find((l) => l.id === id)?.name || id
  const ingredientName = (id: string) =>
    data?.ingredients.find((i) => i.id === id)?.name || id
  const scoped = (id: string) => location === 'all' || location === id
  const invoices = data?.invoices.filter((i) => scoped(i.location_id)) || []
  const selectDetail = (d: InvoiceDetail) => {
    setDetail(d)
    setForm(toForm(d))
    setDirty(false)
    setConfirmed(false)
    setReceivedOn(today())
  }
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setBusy(false)
    }
  }
  const open = (id: string) =>
    void run(async () =>
      selectDetail(await request<InvoiceDetail>(`/invoices/${id}`))
    )
  async function create(file?: File) {
    if (!data?.locations.length) return
    if (
      file &&
      (file.size > 10485760 ||
        !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
          file.type
        ))
    ) {
      setError('Choose a PDF, PNG, JPEG or WebP file up to 10 MB.')
      return
    }
    const location_id = location === 'all' ? data.locations[0].id : location
    await run(async () => {
      let payload: unknown = { location_id }
      if (file) {
        const body = new FormData()
        body.set('location_id', location_id)
        body.set('file', file)
        payload = body
      }
      selectDetail(await request<InvoiceDetail>('/invoices', 'POST', payload))
      await query.refetch()
    })
  }
  function change(patch: Partial<InvoiceForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f))
    setDirty(true)
  }
  async function action(
    kind: 'save' | 'approved' | 'rejected' | 'duplicate' | 'receive'
  ) {
    if (!detail || !form) return
    await run(async () => {
      const base = `/invoices/${detail.id}`
      const d =
        kind === 'save'
          ? await request<InvoiceDetail>(base, 'PUT', form)
          : kind === 'receive'
            ? await request<InvoiceDetail>(`${base}/receive`, 'POST', {
                received_on: receivedOn,
                confirmed,
              })
            : await request<InvoiceDetail>(`${base}/review`, 'POST', {
                revision: detail.revision,
                action: kind,
                note: form.review_note,
              })
      selectDetail(d)
      await query.refetch()
      toast.success(
        kind === 'receive'
          ? 'Delivery posted. Inventory updated.'
          : kind === 'save'
            ? 'Invoice saved to the database.'
            : `Invoice ${kind}.`
      )
    })
  }
  function exportReport() {
    const cell = (v: unknown) => {
      let s = String(v ?? '')
      if (/^[=+@\-]/.test(s)) s = "'" + s
      return '"' + s.replace(/"/g, '""') + '"'
    }
    const csv = [
      [
        'Invoice',
        'Supplier',
        'Location',
        'Date',
        'Total USD',
        'Status',
        'Receipt',
      ],
      ...invoices.map((i) => [
        i.invoice_number,
        supplierName(i.supplier_id),
        locationName(i.location_id),
        i.invoice_date,
        i.total_amount,
        i.status,
        i.receipt_id,
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(
        new Blob(['\uFEFF' + csv], { type: 'text/csv' })
      ),
      a = document.createElement('a')
    a.href = url
    a.download = 'invoice-report.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const invoiceTable = (
    <Grid
      headings={[
        'Invoice / document',
        'Supplier',
        'Location',
        'Total',
        'Status',
        'Delivery',
        '',
      ]}
      rows={invoices
        .filter(
          (i) =>
            (filter === 'all' || i.status === filter) &&
            `${i.invoice_number} ${i.original_file_name} ${supplierName(i.supplier_id)}`
              .toLowerCase()
              .includes(search.toLowerCase())
        )
        .map((i) => [
          <div>
            <div className='font-medium'>
              {i.invoice_number || 'Unnumbered invoice'}
            </div>
            <div className='max-w-52 truncate text-xs text-muted-foreground'>
              {i.original_file_name || 'Manual entry'}
            </div>
          </div>,
          supplierName(i.supplier_id),
          locationName(i.location_id),
          i.total_amount == null ? '—' : money(i.total_amount),
          <Status value={i.status} />,
          i.receipt_id ? 'Received' : 'Not received',
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => open(i.id)}
          >
            Review
          </Button>,
        ])}
    />
  )
  const locked = detail?.status !== 'needs_review'
  const computedTotal = form
    ? form.lines.reduce(
        (n, l) => n + Math.round(l.quantity * l.unit_price * 10000) / 10000,
        0
      ) +
      form.tax_amount +
      form.shipping_amount -
      form.discount_amount
    : 0
  return (
    <>
      <Header fixed>
        <span className='hidden font-medium sm:inline'>Example Kitchen</span>
        <div className='ms-auto flex items-center gap-2'>
          <Badge variant='outline'>
            {data?.mode === 'postgres'
              ? 'PostgreSQL connected'
              : 'Local database'}
          </Badge>
          <select
            className={selectClass}
            aria-label='Location'
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value='all'>All locations</option>
            {data?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <ThemeSwitch />
        </div>
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {titles[section] || 'Page not found'}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Basic manual invoice workflow · development workspace
            </p>
          </div>
          <Button
            variant='outline'
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
        </div>
        <div className='mb-6 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground'>
          Records persist in{' '}
          {data?.mode === 'postgres'
            ? 'the configured PostgreSQL database'
            : 'the local PostgreSQL-compatible database'}
          . Initial restaurant records are fictional. OCR and staff accounts are
          not connected.
        </div>
        {query.isPending && <p role='status'>Connecting to the database…</p>}
        {query.error && (
          <div
            role='alert'
            className='rounded-lg border border-destructive p-4 text-destructive'
          >
            Cannot connect to the backend. Run <code>start-dev.cmd</code> or{' '}
            <code>pnpm dev</code>, then refresh. This page does not fall back to
            demo data.
          </div>
        )}
        {error && !detail && (
          <p role='alert' className='mb-4 text-destructive'>
            {error}
          </p>
        )}
        {data && (
          <>
            {['overview', 'invoices'].includes(section) && (
              <>
                {section === 'overview' && (
                  <div className='mb-6 grid gap-4 sm:grid-cols-3'>
                    {[
                      [
                        'Awaiting review',
                        invoices.filter((i) => i.status === 'needs_review')
                          .length,
                      ],
                      [
                        'Approved invoices',
                        invoices.filter((i) => i.status === 'approved').length,
                      ],
                      [
                        'Approved value',
                        money(
                          invoices
                            .filter((i) => i.status === 'approved')
                            .reduce((n, i) => n + Number(i.total_amount), 0)
                        ),
                      ],
                    ].map(([label, value]) => (
                      <Card key={label}>
                        <CardHeader>
                          <CardTitle className='text-sm text-muted-foreground'>
                            {label}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className='text-3xl font-bold'>
                          {value}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <div className='mb-4 flex flex-wrap gap-2'>
                  <Button
                    disabled={busy}
                    onClick={() => upload.current?.click()}
                  >
                    <Upload />
                    Upload invoice
                  </Button>
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => void create()}
                  >
                    <Plus />
                    Manual invoice
                  </Button>
                  <input
                    ref={upload}
                    hidden
                    type='file'
                    accept='.pdf,.png,.jpg,.jpeg,.webp'
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void create(f)
                    }}
                  />
                </div>
                <p className='mb-4 text-sm text-muted-foreground'>
                  PDF or image up to 10 MB. Enter the details manually, save,
                  review, then confirm the actual delivery.
                </p>
                <div className='mb-4 flex flex-wrap gap-3'>
                  <Input
                    className='sm:max-w-sm'
                    aria-label='Search invoices'
                    placeholder='Search invoice number, supplier or file…'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className={selectClass}
                    aria-label='Invoice status'
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value='all'>All statuses</option>
                    {['needs_review', 'approved', 'rejected', 'duplicate'].map(
                      (s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <Card>
                  <CardContent>{invoiceTable}</CardContent>
                </Card>
              </>
            )}
            {section === 'receiving' && (
              <>
                <p className='mb-4 text-sm text-muted-foreground'>
                  Open an approved invoice to confirm a full delivery. Partial
                  deliveries and linking previously recorded receipts need a
                  later workflow.
                </p>
                <div className='mb-6 flex flex-wrap gap-2'>
                  {invoices
                    .filter((i) => i.status === 'approved' && !i.receipt_id)
                    .map((i) => (
                      <Button
                        key={i.id}
                        variant='outline'
                        onClick={() => open(i.id)}
                      >
                        Receive {i.invoice_number}
                      </Button>
                    ))}
                </div>
                <Card>
                  <CardContent>
                    <Grid
                      headings={[
                        'Receipt reference',
                        'Location',
                        'Supplier',
                        'Received on',
                        'Status',
                      ]}
                      rows={data.purchase_receipts
                        .filter((r) => scoped(r.location_id))
                        .map((r) => [
                          r.source_reference,
                          locationName(r.location_id),
                          supplierName(r.supplier_id),
                          String(r.received_on).slice(0, 10),
                          r.status,
                        ])}
                    />
                  </CardContent>
                </Card>
              </>
            )}
            {section === 'inventory' && (
              <div className='space-y-6'>
                <Card>
                  <CardHeader>
                    <CardTitle>On-hand ingredients</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Grid
                      headings={[
                        'Location',
                        'Ingredient',
                        'Quantity',
                        'Unit',
                        'Check',
                      ]}
                      rows={data.inventory_on_hand
                        .filter((r) => scoped(r.location_id))
                        .map((r) => [
                          r.location_name,
                          r.ingredient_name,
                          Number(r.quantity_on_hand).toLocaleString(),
                          r.base_unit,
                          r.needs_reconciliation
                            ? 'Needs reconciliation'
                            : 'OK',
                        ])}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Inventory movements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Grid
                      headings={[
                        'Date',
                        'Location',
                        'Ingredient',
                        'Movement',
                        'Quantity',
                      ]}
                      rows={data.inventory_movements
                        .filter((r) => scoped(r.location_id))
                        .sort((a, b) =>
                          String(b.business_date).localeCompare(
                            String(a.business_date)
                          )
                        )
                        .map((r) => [
                          String(r.business_date).slice(0, 10),
                          locationName(r.location_id),
                          ingredientName(r.ingredient_id),
                          r.movement_type,
                          Number(r.quantity_base).toLocaleString(),
                        ])}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
            {section === 'suppliers' && (
              <Card>
                <CardContent>
                  <Grid
                    headings={['Supplier', 'Contact', 'Available packs']}
                    rows={data.suppliers.map((s) => [
                      s.name,
                      s.contact_email || 'Not provided',
                      data.supplier_items
                        .filter((i) => i.supplier_id === s.id)
                        .map((i) => `${i.supplier_sku} (${i.pack_label})`)
                        .join(', '),
                    ])}
                  />
                </CardContent>
              </Card>
            )}
            {section === 'reports' && (
              <>
                <div className='mb-4 flex flex-wrap items-center gap-4'>
                  <Button onClick={exportReport}>
                    <Download />
                    Export invoice CSV
                  </Button>
                  <p className='text-sm text-muted-foreground'>
                    Selected location · all invoice statuses · USD. This is an
                    operational report, not a financial statement.
                  </p>
                </div>
                {invoiceTable}
              </>
            )}
            {section === 'sales' && (
              <>
                <p className='mb-4 text-muted-foreground'>
                  Existing database sales records are read-only in this
                  invoice-focused version.
                </p>
                <Grid
                  headings={['Date', 'Location', 'Reference', 'Status']}
                  rows={data.sales_batches
                    .filter((s) => scoped(s.location_id))
                    .map((s) => [
                      String(s.business_date).slice(0, 10),
                      locationName(s.location_id),
                      s.source_reference,
                      s.status,
                    ])}
                />
              </>
            )}
            {section === 'recipes' && (
              <>
                <p className='mb-4 text-muted-foreground'>
                  Existing database recipes are read-only in this version.
                </p>
                <Grid
                  headings={['Menu item', 'Ingredient', 'Quantity per serving']}
                  rows={data.recipe_items.map((r) => [
                    data.menu_items.find((m) => m.id === r.menu_item_id)?.name,
                    ingredientName(r.ingredient_id),
                    `${Number(r.quantity_base_per_serving)} ${data.ingredients.find((i) => i.id === r.ingredient_id)?.base_unit}`,
                  ])}
                />
              </>
            )}
            {section === 'guide' && (
              <Card>
                <CardHeader>
                  <CardTitle>From document to inventory</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4 text-sm'>
                  <p>
                    1. Upload a document or create a manual invoice. The server
                    stores the original document and a draft record.
                  </p>
                  <p>
                    2. Enter supplier, number, date, invoice total and lines.
                    Select a supplier pack for each inventory item. Tax,
                    shipping and discounts are entered separately in USD.
                  </p>
                  <p>
                    3. Save and compare the entered total with the calculated
                    total. Approve, reject or mark a duplicate. Approved
                    invoices are locked; approval alone does not change stock.
                  </p>
                  <p>
                    4. After the full delivery arrives, confirm it from the
                    approved invoice. The server creates one receipt and posts
                    inventory once.
                  </p>
                  <p>
                    Local operator labels are not authenticated identities.
                    Partial receiving, corrections, credit notes, OCR, staff
                    access and cloud deployment are pending review with Scott.
                  </p>
                  <p>
                    Template:{' '}
                    <a
                      className='underline'
                      href='https://github.com/satnaing/shadcn-admin'
                    >
                      satnaing/shadcn-admin (MIT)
                    </a>
                    . Restaurant workflow and backend were added in this
                    repository.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Main>
      <Dialog
        open={!!detail}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setDetail(null)
            setForm(null)
            setError('')
          }
        }}
      >
        <DialogContent
          className='max-h-[92vh] overflow-y-auto sm:max-w-5xl'
          onInteractOutside={(e) => {
            if (dirty || busy) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Review invoice {detail?.invoice_number || ''}
            </DialogTitle>
            <DialogDescription>
              Save the extracted details, review the document, then confirm
              delivery separately.
            </DialogDescription>
          </DialogHeader>
          {detail && form && (
            <>
              <div className='flex flex-wrap items-center gap-3'>
                <Status value={detail.status} />
                <span className='text-xs text-muted-foreground'>
                  Revision {detail.revision}
                  {dirty ? ' · Unsaved changes' : ' · Saved'}
                </span>
                {detail.original_file_name && (
                  <a
                    className='flex items-center gap-1 text-sm underline'
                    href={`/api/invoices/${detail.id}/document`}
                  >
                    <FileText className='size-4' />
                    Download original
                  </a>
                )}
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={busy}
                  onClick={() => open(detail.id)}
                >
                  {dirty ? 'Discard changes & reload' : 'Reload record'}
                </Button>
              </div>
              {error && (
                <p
                  role='alert'
                  className='rounded-md border border-destructive p-3 text-sm text-destructive'
                >
                  {error}
                </p>
              )}
              {!!detail.possible_duplicates.length && (
                <div className='rounded-md border border-amber-500 p-3 text-sm'>
                  <strong>Possible duplicate</strong>
                  <p>
                    Matching supplier invoice number or identical file:{' '}
                    {detail.possible_duplicates
                      .map(
                        (d) =>
                          `${d.invoice_number || d.original_file_name || d.id} (${statusLabel(d.status)})`
                      )
                      .join('; ')}
                    . Check before approval.
                  </p>
                </div>
              )}
              <fieldset
                disabled={busy || locked}
                className='space-y-4 disabled:opacity-80'
              >
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <Field title='Location'>
                    <select
                      className={selectClass}
                      value={form.location_id}
                      onChange={(e) => change({ location_id: e.target.value })}
                    >
                      {data?.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title='Supplier'>
                    <select
                      className={selectClass}
                      value={form.supplier_id || ''}
                      onChange={(e) =>
                        change({
                          supplier_id: e.target.value || null,
                          lines: form.lines.map((l) => ({
                            ...l,
                            supplier_item_id: null,
                          })),
                        })
                      }
                    >
                      <option value=''>Select supplier</option>
                      {data?.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title='Invoice number'>
                    <Input
                      value={form.invoice_number}
                      maxLength={200}
                      onChange={(e) =>
                        change({ invoice_number: e.target.value })
                      }
                    />
                  </Field>
                  <Field title='Invoice date'>
                    <Input
                      type='date'
                      value={form.invoice_date || ''}
                      onInput={(e) =>
                        change({ invoice_date: e.currentTarget.value || null })
                      }
                      onChange={(e) =>
                        change({ invoice_date: e.target.value || null })
                      }
                    />
                  </Field>
                  <Field title='Invoice total (USD)'>
                    <Input
                      type='number'
                      min='0'
                      step='0.0001'
                      value={form.total_amount ?? ''}
                      onChange={(e) =>
                        change({
                          total_amount:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <div className='flex items-center justify-between gap-3'>
                  <h3 className='font-semibold'>Invoice lines</h3>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={form.lines.length >= 100}
                    onClick={() =>
                      change({
                        lines: [
                          ...form.lines,
                          {
                            description: '',
                            supplier_item_id: null,
                            quantity: 1,
                            unit_price: 0,
                          },
                        ],
                      })
                    }
                  >
                    <Plus />
                    Add line
                  </Button>
                </div>
                <p className='text-xs text-muted-foreground'>
                  Quantity is the number of supplier packs. An unmapped line can
                  be reviewed, but this version requires every line to map to a
                  pack before receiving.
                </p>
                {form.lines.map((l, index) => (
                  <div
                    key={index}
                    className='grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6'
                  >
                    <Field title={`Line ${index + 1} description`}>
                      <Input
                        value={l.description}
                        onChange={(e) =>
                          change({
                            lines: form.lines.map((r, j) =>
                              j === index
                                ? { ...r, description: e.target.value }
                                : r
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field title={`Line ${index + 1} supplier pack`}>
                      <select
                        className={selectClass}
                        value={l.supplier_item_id || ''}
                        onChange={(e) => {
                          const item = data?.supplier_items.find(
                            (i) => i.id === e.target.value
                          )
                          change({
                            lines: form.lines.map((r, j) =>
                              j === index
                                ? {
                                    ...r,
                                    supplier_item_id: item?.id || null,
                                    description:
                                      r.description ||
                                      (item
                                        ? ingredientName(item.ingredient_id)
                                        : ''),
                                  }
                                : r
                            ),
                          })
                        }}
                      >
                        <option value=''>Unmapped</option>
                        {data?.supplier_items
                          .filter((i) => i.supplier_id === form.supplier_id)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {ingredientName(i.ingredient_id)} · {i.pack_label}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field title={`Line ${index + 1} quantity`}>
                      <Input
                        type='number'
                        min='0.000001'
                        step='0.000001'
                        value={l.quantity}
                        onChange={(e) =>
                          change({
                            lines: form.lines.map((r, j) =>
                              j === index
                                ? { ...r, quantity: Number(e.target.value) }
                                : r
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field title={`Line ${index + 1} unit price`}>
                      <Input
                        type='number'
                        min='0'
                        step='0.0001'
                        value={l.unit_price}
                        onChange={(e) =>
                          change({
                            lines: form.lines.map((r, j) =>
                              j === index
                                ? { ...r, unit_price: Number(e.target.value) }
                                : r
                            ),
                          })
                        }
                      />
                    </Field>
                    <div className='pb-2 text-sm'>
                      {money(l.quantity * l.unit_price)}
                    </div>
                    <Button
                      aria-label={`Remove line ${index + 1}`}
                      variant='ghost'
                      type='button'
                      onClick={() =>
                        change({
                          lines: form.lines.filter((_, j) => j !== index),
                        })
                      }
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                ))}
                <div className='grid gap-4 sm:grid-cols-3'>
                  {(
                    [
                      'tax_amount',
                      'shipping_amount',
                      'discount_amount',
                    ] as const
                  ).map((k) => (
                    <Field
                      key={k}
                      title={
                        {
                          tax_amount: 'Tax (USD)',
                          shipping_amount: 'Shipping (USD)',
                          discount_amount: 'Discount (USD)',
                        }[k]
                      }
                    >
                      <Input
                        type='number'
                        min='0'
                        step='0.0001'
                        value={form[k]}
                        onChange={(e) =>
                          change({ [k]: Number(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <div className='rounded-md bg-muted p-3 text-sm'>
                  Calculated total: <strong>{money(computedTotal)}</strong> ·
                  Difference from invoice:{' '}
                  <strong>
                    {(computedTotal - Number(form.total_amount || 0)).toFixed(
                      4
                    )}{' '}
                    USD
                  </strong>
                </div>
                <Field title='Review note / reason'>
                  <Textarea
                    value={form.review_note}
                    maxLength={2000}
                    onChange={(e) => change({ review_note: e.target.value })}
                  />
                </Field>
              </fieldset>
              {!locked && (
                <div className='flex flex-wrap gap-2'>
                  <Button disabled={busy} onClick={() => void action('save')}>
                    Save details
                  </Button>
                  <Button
                    disabled={busy || dirty}
                    variant='outline'
                    onClick={() => void action('approved')}
                  >
                    Approve invoice
                  </Button>
                  <Button
                    disabled={busy || dirty}
                    variant='outline'
                    onClick={() => void action('rejected')}
                  >
                    Reject
                  </Button>
                  <Button
                    disabled={busy || dirty}
                    variant='outline'
                    onClick={() => void action('duplicate')}
                  >
                    Mark duplicate
                  </Button>
                </div>
              )}
              {!locked && (
                <p className='text-xs text-muted-foreground'>
                  Save changes before reviewing. Rejection and duplicate marking
                  require a reason. Approval does not change inventory.
                </p>
              )}
              {detail.status === 'approved' && !detail.receipt_id && (
                <section className='space-y-3 rounded-lg border p-4'>
                  <h3 className='font-semibold'>Confirm full delivery</h3>
                  <p className='text-sm text-muted-foreground'>
                    Use this only when all listed goods have arrived and have
                    not been entered in Receiving already. Partial deliveries
                    and existing receipts need manual reconciliation.
                  </p>
                  <Field title='Received on (New York business date)'>
                    <Input
                      className='max-w-xs'
                      type='date'
                      value={receivedOn}
                      onInput={(e) => setReceivedOn(e.currentTarget.value)}
                      disabled={busy}
                      onChange={(e) => setReceivedOn(e.target.value)}
                    />
                  </Field>
                  <label className='flex items-start gap-2 text-sm'>
                    <input
                      className='mt-1'
                      type='checkbox'
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm all goods arrived and this delivery has not
                    already been recorded.
                  </label>
                  <Button
                    disabled={busy || !confirmed}
                    onClick={() => void action('receive')}
                  >
                    Confirm delivery & update inventory
                  </Button>
                </section>
              )}
              {detail.receipt_id && (
                <div className='rounded-lg border p-3 text-sm'>
                  Delivery posted once. Receipt:{' '}
                  <code className='break-all'>{detail.receipt_id}</code>.{' '}
                  <Link
                    className='underline'
                    to='/restaurant/$section'
                    params={{ section: 'inventory' }}
                    onClick={() => setDetail(null)}
                  >
                    View inventory
                  </Link>
                </div>
              )}
              {detail.reviewed_by && (
                <p className='text-xs text-muted-foreground'>
                  Reviewed by {detail.reviewed_by} ·{' '}
                  {detail.reviewed_at &&
                    new Date(detail.reviewed_at).toLocaleString()}
                </p>
              )}
              <details className='rounded-lg border p-3 text-sm'>
                <summary className='cursor-pointer font-medium'>
                  Review history ({detail.events.length})
                </summary>
                <ul className='mt-3 space-y-3'>
                  {detail.events.map((e) => (
                    <li key={e.id}>
                      <strong>{statusLabel(e.action)}</strong> ·{' '}
                      {new Date(e.created_at).toLocaleString()}
                      <p className='text-muted-foreground'>
                        {e.reviewer_label}: {e.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
