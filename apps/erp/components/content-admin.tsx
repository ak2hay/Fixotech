"use client";

import { Badge, Button, Field, Page, PageHeader, Tabs, TextArea, TextInput, statusTone } from "@fixotec/ui";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { API_URL, api } from "../lib/api";

type Row = Record<string, unknown>;
const TABS = [
  ["products", "Products"],
  ["categories", "Categories"],
  ["posts", "News"],
  ["services", "Service areas"],
  ["pages", "Segments & sectors"],
] as const;
type Tab = (typeof TABS)[number][0];

const SEGMENTS = ["hvac", "plumbing", "electrical", "fire-fighting", "multiple-services"];
const PUBLIC_AUDIENCES = "PUBLIC,CUSTOMER,DISTRIBUTOR,CONSULTANT";

const mediaSrc = (key?: unknown) => (typeof key === "string" && key ? `${API_URL}/api/v1/public/${key}` : "");
const s = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const linesOf = (value: string) => value.split("\n").map((l) => l.trim()).filter(Boolean);

async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const result = await api<{ key: string }>("/cms/media", { method: "POST", body: form });
  return result.key;
}

export function ContentAdmin() {
  const [tab, setTab] = useState<Tab>("products");
  return (
    <Page>
      <PageHeader title="Website content" description="Edit what fixotec.com shows. Changes are live within five minutes, without a deploy. Prices and stock stay in the product master." />
      <Tabs items={TABS.map(([key, label]) => ({ key, label }))} value={tab} onChange={(key) => setTab(key as Tab)} />
      <div>
        {tab === "products" ? <ProductsTab /> : null}
        {tab === "categories" ? <CategoriesTab /> : null}
        {tab === "posts" ? <PostsTab /> : null}
        {tab === "services" ? <ServicesTab /> : null}
        {tab === "pages" ? <PagesTab /> : null}
      </div>
    </Page>
  );
}

function useNotice() {
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok = "Saved") => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "good", text: ok });
    } catch (err) {
      setNotice({ tone: "bad", text: (err as Error).message });
    }
  };
  const view = notice ? <p className={`text-sm ${notice.tone === "good" ? "text-emerald-700" : "text-danger"}`}>{notice.text}</p> : null;
  return { run, view };
}

function ImagePicker({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try { onChange(await uploadImage(file)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-canvas">
          {value ? <img src={mediaSrc(value)} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] text-subtle">none</span>}
        </span>
        <div className="grid gap-1">
          <label className="inline-flex h-8 cursor-pointer items-center border border-line bg-surface px-3 text-xs hover:border-line">
            {busy ? "Uploading…" : "Upload image"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={pick} disabled={busy} />
          </label>
          {value ? <button type="button" className="text-left text-xs text-muted hover:text-danger" onClick={() => onChange("")}>Remove</button> : null}
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      </div>
    </Field>
  );
}

// ---------------- products ----------------

function ProductsTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => api<Row[]>(`/cms/products${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-3 flex gap-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" className="flex-1" />
          <Button type="submit" variant="dark">Find</Button>
        </form>
        <ul className="max-h-[70vh] divide-y divide-line overflow-auto border border-line bg-surface">
          {rows.map((row) => (
            <li key={s(row.id)}>
              <button type="button" onClick={() => setSelected(s(row.id))} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-canvas ${selected === row.id ? "bg-canvas" : ""}`}>
                <span className="h-10 w-10 shrink-0 border border-line bg-canvas">{row.heroImageKey ? <img src={mediaSrc(row.heroImageKey)} alt="" className="h-full w-full object-contain" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s(row.name)}</span>
                  <span className="block truncate font-mono text-[11px] text-muted">{s(row.sku)} · {s((row.category as Row | null)?.name)}</span>
                </span>
                {row.published ? null : <Badge tone="warn">hidden</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? <ProductEditor key={selected} id={selected} onSaved={load} /> : <p className="border border-dashed border-line p-10 text-center text-sm text-muted">Select a product to edit its photos, website text and datasheets.</p>}
    </div>
  );
}

function ProductEditor({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [product, setProduct] = useState<Row | null>(null);
  const [categories, setCategories] = useState<Row[]>([]);
  const [form, setForm] = useState({ name: "", description: "", finish: "", categoryId: "", features: "", applications: "", metaTitle: "", metaDescription: "", published: true, heroImageKey: "", imageKeys: [] as string[], segments: [] as string[] });
  const { run, view } = useNotice();

  async function load() {
    const row = await api<Row>(`/cms/products/${id}`);
    setProduct(row);
    setForm({
      name: s(row.name),
      description: s(row.description),
      finish: s(row.finish),
      categoryId: s(row.categoryId),
      features: ((row.features as string[]) || []).join("\n"),
      applications: ((row.applications as string[]) || []).join("\n"),
      metaTitle: s(row.metaTitle),
      metaDescription: s(row.metaDescription),
      published: Boolean(row.published),
      heroImageKey: s(row.heroImageKey),
      imageKeys: (row.imageKeys as string[]) || [],
      segments: (row.segments as string[]) || [],
    });
  }
  useEffect(() => { load(); api<Row[]>("/cms/categories").then(setCategories); }, [id]);

  function save(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`/cms/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, categoryId: form.categoryId || null, heroImageKey: form.heroImageKey || form.imageKeys[0] || null, features: linesOf(form.features), applications: linesOf(form.applications) }),
      });
      onSaved();
    });
  }

  async function addGallery(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await run(async () => {
      const keys: string[] = [];
      for (const file of files) keys.push(await uploadImage(file));
      setForm((f) => ({ ...f, imageKeys: [...f.imageKeys, ...keys], heroImageKey: f.heroImageKey || keys[0] || "" }));
    }, "Uploaded. Save to publish the new photos.");
  }

  const move = (index: number, step: number) => setForm((f) => {
    const next = [...f.imageKeys];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + step)), 0, item);
    return { ...f, imageKeys: next };
  });

  if (!product) return <p className="text-sm">Loading…</p>;
  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-5 border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted">{s(product.sku)}</p>
            <h2 className="text-lg font-semibold">{form.name}</h2>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Published on website</label>
        </div>

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Photos</p>
          <div className="flex flex-wrap gap-3">
            {form.imageKeys.map((key, index) => (
              <div key={key} className={`w-32 border bg-surface p-1 ${form.heroImageKey === key ? "border-brass" : "border-line"}`}>
                <img src={mediaSrc(key)} alt="" className="h-28 w-full object-contain" />
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <button type="button" onClick={() => move(index, -1)} className="px-1 text-muted hover:text-fg" aria-label="Move left">◀</button>
                  <button type="button" onClick={() => setForm({ ...form, heroImageKey: key })} className={form.heroImageKey === key ? "font-semibold" : "text-muted hover:text-fg"}>{form.heroImageKey === key ? "Main" : "Set main"}</button>
                  <button type="button" onClick={() => setForm({ ...form, imageKeys: form.imageKeys.filter((k) => k !== key), heroImageKey: form.heroImageKey === key ? "" : form.heroImageKey })} className="px-1 text-muted hover:text-danger" aria-label="Remove">✕</button>
                  <button type="button" onClick={() => move(index, 1)} className="px-1 text-muted hover:text-fg" aria-label="Move right">▶</button>
                </div>
              </div>
            ))}
            <label className="flex h-[150px] w-32 cursor-pointer items-center justify-center border border-dashed border-line text-xs text-muted hover:border-line">
              + Add photos
              <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={addGallery} />
            </label>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="h-10 border border-line bg-surface px-2 text-sm">
              <option value="">—</option>
              {categories.map((c) => <option key={s(c.id)} value={s(c.id)}>{c.parent ? `${s((c.parent as Row).name)} › ` : ""}{s(c.name)}</option>)}
            </select>
          </Field>
          <Field label="Short description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Finish"><TextInput value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} /></Field>
          <Field label="Features (one per line)"><TextArea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className="min-h-32" /></Field>
          <Field label="Applications (one per line)"><TextArea value={form.applications} onChange={(e) => setForm({ ...form, applications: e.target.value })} className="min-h-32" /></Field>
          <Field label="SEO title"><TextInput value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} /></Field>
          <Field label="SEO description"><TextInput value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} /></Field>
        </div>
        <Field label="Segments">
          <div className="flex flex-wrap gap-3">
            {SEGMENTS.map((seg) => (
              <label key={seg} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.segments.includes(seg)} onChange={(e) => setForm({ ...form, segments: e.target.checked ? [...form.segments, seg] : form.segments.filter((x) => x !== seg) })} />{seg}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex items-center gap-4"><Button type="submit">Save product</Button>{view}</div>
      </form>
      <Datasheets productId={id} documents={(product.documents as Row[]) || []} onChange={load} />
    </div>
  );
}

function Datasheets({ productId, documents, onChange }: { productId: string; documents: Row[]; onChange: () => void }) {
  const { run, view } = useNotice();
  const [title, setTitle] = useState("");

  function upload(path: string, file: File, extra: Record<string, string> = {}) {
    const form = new FormData();
    form.append("file", file);
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    return api(path, { method: "POST", body: form });
  }

  async function addDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      await upload("/documents", file, { title: title || file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "), category: "DATASHEET", entityType: "product", entityId: productId, audiences: PUBLIC_AUDIENCES });
      setTitle("");
      onChange();
    }, "Uploaded as draft. Approve it to show it on the website.");
  }

  async function newVersion(documentId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => { await upload(`/documents/${documentId}/versions`, file); onChange(); }, "New revision uploaded as draft. Approve it to replace the public file.");
  }

  const approve = (documentId: string, version: number) => run(async () => {
    await api(`/documents/${documentId}/versions/${version}/status`, { method: "POST", body: JSON.stringify({ status: "APPROVED" }) });
    onChange();
  }, "Approved. The website now serves this revision.");

  return (
    <section className="rounded-lg border border-line bg-surface shadow-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg">Datasheets</h3>
          <p className="text-xs text-muted">The website shows the latest approved revision of each public document.</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Title (optional)"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="From file name" /></Field>
          <label className="inline-flex h-10 cursor-pointer items-center bg-ink px-4 text-sm text-ivory">Add datasheet<input type="file" accept="application/pdf" className="hidden" onChange={addDocument} /></label>
        </div>
      </div>
      {view}
      <table className="mt-3 w-full text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">Revisions</th><th className="px-3 py-2" /></tr></thead>
        <tbody>
          {documents.map((doc) => {
            const versions = (doc.versions as Row[]) || [];
            return (
              <tr key={s(doc.id)} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <p>{s(doc.title)}</p>
                  <p className="font-mono text-[11px] text-muted">{s(doc.category)} · {((doc.audiences as string[]) || []).join(", ")}</p>
                </td>
                <td className="px-3 py-2">
                  {versions.map((v) => (
                    <div key={s(v.id)} className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-xs">v{s(v.version)}</span>
                      <Badge tone={statusTone(s(v.status))}>{s(v.status)}</Badge>
                      <span className="truncate text-xs text-muted">{s(v.fileName)}</span>
                      {v.status !== "APPROVED" ? <button type="button" onClick={() => approve(s(doc.id), Number(v.version))} className="text-xs font-semibold text-emerald-700 hover:underline">Approve</button> : null}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 text-right">
                  <label className="cursor-pointer text-xs font-semibold text-muted hover:underline">Upload revision<input type="file" accept="application/pdf" className="hidden" onChange={(e) => newVersion(s(doc.id), e)} /></label>
                </td>
              </tr>
            );
          })}
          {!documents.length ? <tr><td colSpan={3} className="px-3 py-6 text-center text-muted">No datasheets linked to this product yet.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

// ---------------- categories ----------------

function CategoriesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const load = () => api<Row[]>("/cms/categories").then(setRows);
  useEffect(() => { load(); }, []);
  const roots = rows.filter((r) => !r.parentId);
  const ordered = roots.flatMap((r) => [r, ...rows.filter((c) => c.parentId === r.id)]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="overflow-auto border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Image</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Slug</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Products</th><th /></tr></thead>
          <tbody>
            {ordered.map((row) => (
              <tr key={s(row.id)} className="border-t border-line">
                <td className="px-3 py-1.5"><span className="block h-9 w-9 bg-canvas">{row.imageKey ? <img src={mediaSrc(row.imageKey)} alt="" className="h-full w-full object-contain" /> : null}</span></td>
                <td className={`px-3 py-1.5 ${row.parentId ? "pl-8 text-muted" : "font-semibold"}`}>{s(row.name)}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted">{s(row.slug)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{s(row.sortOrder)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{s((row._count as Row)?.products)}</td>
                <td className="px-3 py-1.5 text-right"><button type="button" className="text-brass" onClick={() => setEditing(row)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button variant="dark" onClick={() => setEditing({})}>New category</Button>
        {editing ? <CategoryForm key={s(editing.id) || "new"} row={editing} roots={roots} onSaved={() => { load(); }} /> : null}
      </div>
    </div>
  );
}

function CategoryForm({ row, roots, onSaved }: { row: Row; roots: Row[]; onSaved: () => void }) {
  const isNew = !row.id;
  const [form, setForm] = useState({ name: s(row.name), slug: s(row.slug), description: s(row.description), sortOrder: s(row.sortOrder || 0), parentId: s(row.parentId), imageKey: s(row.imageKey) });
  const { run, view } = useNotice();
  function save(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      const body = { ...form, parentId: form.parentId || null, imageKey: form.imageKey || null, description: form.description || null };
      await api(isNew ? "/cms/categories" : `/cms/categories/${row.id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body) });
      onSaved();
    });
  }
  return (
    <form onSubmit={save} className="mt-4 space-y-3 border border-line bg-surface p-4">
      <h3 className="text-lg">{isNew ? "New category" : `Edit ${s(row.name)}`}</h3>
      <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      {isNew ? <Field label="Slug (URL)"><TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="pipe-clamps" required /></Field> : null}
      <Field label="Parent">
        <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="h-10 border border-line bg-surface px-2 text-sm">
          <option value="">— top level —</option>
          {roots.filter((r) => r.id !== row.id).map((r) => <option key={s(r.id)} value={s(r.id)}>{s(r.name)}</option>)}
        </select>
      </Field>
      <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Sort order"><TextInput type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
      <ImagePicker label="Category image" value={form.imageKey} onChange={(imageKey) => setForm({ ...form, imageKey })} />
      <div className="flex items-center gap-3"><Button type="submit">Save</Button>{view}</div>
    </form>
  );
}

// ---------------- news ----------------

function PostsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => api<Row[]>("/cms/posts").then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <aside>
        <Button variant="dark" onClick={() => setSelected("new")} className="mb-3">New post</Button>
        <ul className="max-h-[70vh] divide-y divide-line overflow-auto border border-line bg-surface">
          {rows.map((row) => (
            <li key={s(row.id)}>
              <button type="button" onClick={() => setSelected(s(row.id))} className={`block w-full px-3 py-2 text-left text-sm hover:bg-canvas ${selected === row.id ? "bg-canvas" : ""}`}>
                <span className="block truncate">{s(row.title)}</span>
                <span className="flex items-center gap-2 text-[11px] text-muted">{s(row.publishedAt).slice(0, 10)} {row.published ? <Badge tone="good">live</Badge> : <Badge>hidden</Badge>}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? <PostEditor key={selected} id={selected} onSaved={(id) => { load(); setSelected(id); }} /> : <p className="border border-dashed border-line p-10 text-center text-sm text-muted">Select a post or create a new one.</p>}
    </div>
  );
}

function PostEditor({ id, onSaved }: { id: string; onSaved: (id: string) => void }) {
  const isNew = id === "new";
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", body: "", imageKey: "", publishedAt: new Date().toISOString().slice(0, 10), published: true });
  const { run, view } = useNotice();
  useEffect(() => {
    if (isNew) return;
    api<Row>(`/cms/posts/${id}`).then((row) => setForm({ title: s(row.title), slug: s(row.slug), excerpt: s(row.excerpt), body: s(row.body), imageKey: s(row.imageKey), publishedAt: s(row.publishedAt).slice(0, 10), published: Boolean(row.published) }));
  }, [id]);
  function save(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      const body = { ...form, imageKey: form.imageKey || null, excerpt: form.excerpt || null };
      const row = await api<Row>(isNew ? "/cms/posts" : `/cms/posts/${id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body) });
      onSaved(s(row.id));
    });
  }
  return (
    <form onSubmit={save} className="space-y-4 border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isNew ? "New post" : "Edit post"}</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Published</label>
      </div>
      <Field label="Title"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        {isNew ? <Field label="Slug (URL)"><TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="acrex-2027" required /></Field> : <Field label="URL"><TextInput value={`/news/${form.slug}`} readOnly /></Field>}
        <Field label="Publish date"><TextInput type="date" value={form.publishedAt} onChange={(e) => setForm({ ...form, publishedAt: e.target.value })} /></Field>
      </div>
      <Field label="Excerpt"><TextArea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></Field>
      <ImagePicker label="Cover image" value={form.imageKey} onChange={(imageKey) => setForm({ ...form, imageKey })} />
      <Field label="Body (HTML: <p>, <h2>, <ul>, <img>)"><TextArea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-72 font-mono text-xs" /></Field>
      <div className="flex items-center gap-3"><Button type="submit">Save post</Button>{view}</div>
    </form>
  );
}

// ---------------- service areas ----------------

function ServicesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => api<Row[]>("/cms/services").then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => <ServiceForm key={s(row.id)} row={row} onSaved={load} />)}
      <ServiceForm key={`new-${rows.length}`} row={{}} onSaved={load} />
    </div>
  );
}

function ServiceForm({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const isNew = !row.id;
  const [form, setForm] = useState({ title: s(row.title), slug: s(row.slug), summary: s(row.summary), iconKey: s(row.iconKey), sortOrder: s(row.sortOrder || 0), published: row.published === undefined ? true : Boolean(row.published) });
  const { run, view } = useNotice();
  function save(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(isNew ? "/cms/services" : `/cms/services/${row.id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify({ ...form, iconKey: form.iconKey || null }) });
      onSaved();
    });
  }
  return (
    <form onSubmit={save} className={`space-y-3 border bg-surface p-4 ${isNew ? "border-dashed border-line" : "border-line"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg">{isNew ? "New service area" : form.title}</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Live</label>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_100px]">
        <Field label="Title"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Order"><TextInput type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
      </div>
      {isNew ? <Field label="Slug"><TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="bim-services" required /></Field> : null}
      <Field label="Summary"><TextArea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
      <ImagePicker label="Icon" value={form.iconKey} onChange={(iconKey) => setForm({ ...form, iconKey })} />
      <div className="flex items-center gap-3"><Button type="submit">{isNew ? "Create" : "Save"}</Button>{view}</div>
    </form>
  );
}

// ---------------- segments & sectors ----------------

function PagesTab() {
  const [segments, setSegments] = useState<Row[]>([]);
  const [sectors, setSectors] = useState<Row[]>([]);
  const load = () => {
    api<Row[]>("/cms/solutions").then(setSegments);
    api<Row[]>("/cms/industries").then(setSectors);
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl">Segments</h2>
        <div className="grid gap-4 lg:grid-cols-2">{segments.map((row) => <PageForm key={s(row.id)} row={row} path="/cms/solutions" onSaved={load} />)}</div>
      </section>
      <section>
        <h2 className="mb-3 text-xl">Sectors</h2>
        <div className="grid gap-4 lg:grid-cols-2">{sectors.map((row) => <PageForm key={s(row.id)} row={row} path="/cms/industries" onSaved={load} hero />)}</div>
      </section>
    </div>
  );
}

function PageForm({ row, path, onSaved, hero }: { row: Row; path: string; onSaved: () => void; hero?: boolean }) {
  const [form, setForm] = useState({ name: s(row.name), summary: s(row.summary), body: s(row.body), imageKey: s(row.imageKey), heroImageKey: s(row.heroImageKey), published: Boolean(row.published) });
  const { run, view } = useNotice();
  function save(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`${path}/${row.id}`, { method: "PATCH", body: JSON.stringify({ ...form, imageKey: form.imageKey || null, heroImageKey: form.heroImageKey || null }) });
      onSaved();
    });
  }
  return (
    <form onSubmit={save} className="space-y-3 border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">{form.name} <span className="font-mono text-xs text-muted">/{s(row.slug)}</span></h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Live</label>
      </div>
      <Field label="Summary"><TextArea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
      <Field label="Body (## heading per application)"><TextArea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-40 font-mono text-xs" /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <ImagePicker label="Tile image" value={form.imageKey} onChange={(imageKey) => setForm({ ...form, imageKey })} />
        {hero ? <ImagePicker label="Hero photo" value={form.heroImageKey} onChange={(heroImageKey) => setForm({ ...form, heroImageKey })} /> : null}
      </div>
      <div className="flex items-center gap-3"><Button type="submit">Save</Button>{view}</div>
    </form>
  );
}
