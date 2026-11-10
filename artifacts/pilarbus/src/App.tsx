import { useEffect, useMemo, useState, useRef, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { esES } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, ArrowDownRight, ArrowRight, BusFront, Check, CheckCircle2, ChevronDown, CircleDot, Clock3, ExternalLink, FileText, LocateFixed, MessageSquareText, Minus, Plus, RotateCcw, Send, ShieldCheck, Signpost, Trash2, UserRound } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetComplaintSummaryQueryKey, getListComplaintsQueryKey, useCreateComplaint, useDeleteComplaint, useGetComplaintSummary, useHealthCheck, useListComplaints, useUpdateComplaint } from '@workspace/api-client-react';
import type { Complaint, ComplaintCategory, ComplaintInput, ComplaintUpdate } from '@workspace/api-client-react';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const categories: { value: ComplaintCategory; label: string }[] = [
  { value: 'service', label: 'Servicio' }, { value: 'delay', label: 'Demora' }, { value: 'vehicle', label: 'Unidad' },
  { value: 'stop', label: 'Parada' }, { value: 'accessibility', label: 'Accesibilidad' }, { value: 'other', label: 'Otro' },
];
const categoryLabel = (category: ComplaintCategory) => categories.find((item) => item.value === category)?.label ?? 'Otro';

type RouteFeature = { type: string; properties: { name?: string; route?: string; kind?: string; description?: string }; geometry: { type: string; coordinates: number[][] | number[] } };
type RouteCollection = { type: string; features: RouteFeature[] };
const featurePoints = (feature: RouteFeature): number[][] => {
  const coordinates = feature.geometry.coordinates;
  return Array.isArray(coordinates[0]) ? coordinates as number[][] : [coordinates as number[]];
};

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <a href={basePath || '/'} className="inline-flex items-center gap-3" aria-label="PilarBus, inicio">
    <span className="grid size-10 place-items-center rounded-[14px] bg-[#1d594e] text-[#f4f0e4] shadow-[0_5px_12px_rgba(29,89,78,.18)]"><BusFront size={21} strokeWidth={1.8} /></span>
    {!compact && <span className="leading-none"><span className="display block text-[20px] font-extrabold tracking-[-.055em]">Pilar<span className="text-[#b75a37]">Bus</span></span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.16em] text-[#74837c]">Moverse mejor</span></span>}
  </a>;
}

function SiteHeader({ admin = false }: { admin?: boolean }) {
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  return <header className="relative z-10 border-b border-[#dfded3] bg-[#f7f5ed]/95">
    <div className="mx-auto flex max-w-[1360px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
      <Brand />
      <nav className="flex items-center gap-2 sm:gap-5">
        {admin ? <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="inline-flex items-center gap-2 rounded-full border border-[#d8d9cf] px-4 py-2 text-[13px] font-semibold text-[#40544e] transition hover:bg-[#eeede5]" data-testid="button-signout"><UserRound size={16} /> <span className="hidden sm:inline">Cerrar sesión</span><span className="sm:hidden">Salir</span></button> : <>
          <a href="#rutas" className="hidden text-[13px] font-semibold text-[#485d55] transition hover:text-[#1d594e] sm:block">Rutas oficiales</a>
          <a href="#reclamo" className="rounded-full bg-[#1d594e] px-4 py-2.5 text-[13px] font-bold text-[#f8f5ec] transition hover:bg-[#16483f] sm:px-5" data-testid="link-report-header">Hacer un reclamo <ArrowRight className="ml-1 inline" size={14} /></a>
          <a href="/admin" onClick={(e) => { e.preventDefault(); setLocation('/admin'); }} className="hidden rounded-full border border-[#d8d9cf] px-4 py-2.5 text-[13px] font-semibold text-[#40544e] transition hover:bg-[#eeede5] md:block" data-testid="link-admin">Municipio</a>
        </>}
      </nav>
    </div>
  </header>;
}

function RouteMap() {
  const [collection, setCollection] = useState<RouteCollection | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/routes.geojson`).then((response) => {
      if (!response.ok) throw new Error('No se pudo cargar la cartografía');
      return response.json() as Promise<RouteCollection>;
    }).then((data) => { if (!cancelled) { setCollection(data); setActive(data.features.map((feature) => feature.properties.route ?? feature.properties.name ?? '')); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [retryCount]);
  const routeList = useMemo(() => {
    const found = new Map<string, string>();
    collection?.features.filter((feature) => feature.properties.kind === 'route').forEach((feature) => {
      const id = feature.properties.route ?? feature.properties.name ?? '';
      if (id) found.set(id, feature.properties.name ?? id);
    });
    return [...found.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
  }, [collection]);
  const palette = ['#b75a37', '#277465', '#647b9b', '#c38a3e', '#7c6388', '#a74744', '#4b8c91', '#627249', '#d07a4b'];
  const toggle = (route: string) => setActive((current) => current.includes(route) ? current.filter((item) => item !== route) : [...current, route]);
  const visibleFeatures = useMemo(() => collection?.features.filter((feature) => active.includes(feature.properties.route ?? feature.properties.name ?? '')) ?? [], [collection, active]);
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points = collection?.features.flatMap((feature) => featurePoints(feature).map(([lng, lat]) => [lat, lng] as [number, number])) ?? [];
    return points.length ? points : null;
  }, [collection]);
  const routeCollection = useMemo(() => ({ type: 'FeatureCollection', features: visibleFeatures }) as never, [visibleFeatures]);
  const getColor = (feature?: { properties?: Record<string, unknown> | null } | null) => {
    const id = String(feature?.properties?.route ?? feature?.properties?.name ?? '');
    const index = routeList.findIndex(([route]) => route === id);
    return palette[(index < 0 ? 0 : index) % palette.length];
  };
  return <section id="rutas" className="scroll-mt-8">
    <div className="mb-5 flex items-end justify-between gap-3">
      <div><p className="mono mb-2 text-[10px] font-medium uppercase tracking-[.16em] text-[#9b654d]">Información oficial</p><h2 className="display text-[25px] font-extrabold tracking-[-.045em] text-[#1c3934] sm:text-[30px]">Rutas de colectivo</h2></div>
      <span className="hidden items-center gap-1.5 rounded-full border border-[#d8ded5] bg-[#eef2eb] px-3 py-1.5 text-[11px] font-semibold text-[#446458] sm:flex"><CircleDot size={12} /> Recorridos publicados</span>
    </div>
    <div className="overflow-hidden rounded-[26px] border border-[#d9ddd3] bg-[#e9eee6] shadow-[0_12px_35px_rgba(31,62,53,.07)]">
      <div className="relative h-[360px] sm:h-[430px]">
        <MapContainer center={[-34.45, -58.92]} zoom={11} scrollWheelZoom className="h-full w-full" zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {collection && visibleFeatures.length > 0 && <GeoJSON data={routeCollection} style={(feature) => ({ color: getColor(feature), weight: 4, opacity: 0.92, lineCap: 'round', lineJoin: 'round' })} pointToLayer={(feature, latlng) => L.circleMarker(latlng, { radius: feature.properties?.kind === 'stop' ? 4 : 6, color: '#f7f5ed', weight: 2, fillColor: getColor(feature), fillOpacity: 1 })} onEachFeature={(feature, layer) => { const title = feature.properties?.name; const note = feature.properties?.description; if (title) layer.bindPopup(`<strong>${title}</strong>${note ? `<br/><span>${note.replace(/<[^>]+>/g, ' ')}</span>` : ''}`); }} />}
          {collection && <FitMap bounds={bounds} />}
          <MapControls />
        </MapContainer>
        {!collection && !error && <div className="absolute inset-0 z-[500] grid place-items-center bg-[#e9eee6]/80"><div className="rounded-full bg-[#f7f5ed]/90 px-4 py-2 text-sm text-[#52645c]">Cargando recorridos oficiales…</div></div>}
        {error && <div className="absolute inset-0 z-[500] grid place-items-center bg-[#e9eee6]/90 p-6"><div className="max-w-sm rounded-2xl bg-[#f7f5ed] p-5 text-center shadow-xl"><AlertCircle className="mx-auto mb-2 text-[#b34f42]" /><p className="font-bold">No pudimos cargar el mapa</p><p className="mt-1 text-sm text-[#63726b]">Volvé a intentar en unos instantes.</p><button className="mt-3 text-sm font-bold text-[#1d594e]" onClick={() => { setError(false); setCollection(null); setRetryCount((count) => count + 1); }} data-testid="button-retry-map">Reintentar</button></div></div>}
        <div className="pointer-events-none absolute left-3 top-3 z-[400] flex items-center gap-2 rounded-full border border-white/70 bg-[#f7f5ed]/90 px-3 py-2 text-[11px] font-bold text-[#38594e] shadow-sm backdrop-blur sm:left-5 sm:top-5"><span className="size-2 rounded-full bg-[#4a9878]" /> Pilar, Buenos Aires</div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-[#f8f6ef]/90 px-2.5 py-1.5 text-[10px] font-medium text-[#62756c] backdrop-blur sm:bottom-4 sm:left-4">Cartografía oficial · Recorridos estáticos</div>
      </div>
      <div className="border-t border-[#d5ddd3] bg-[#f6f5ec] p-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[12px] font-bold text-[#27463e]">Filtrar por recorrido</p><p className="mt-0.5 text-[11px] text-[#75827b]">Elegí qué líneas querés ver en el mapa.</p></div>
          <div className="flex gap-2">
            <button onClick={() => setActive(routeList.map(([id]) => id))} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-[#346256] hover:bg-[#e9eee5]" data-testid="button-select-all-routes">Ver todas</button>
            <button onClick={() => setActive([])} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-[#75827b] hover:bg-[#e9eee5]" data-testid="button-clear-routes">Limpiar</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {routeList.length ? routeList.map(([id, name], index) => <button key={id} onClick={() => toggle(id)} title={name} aria-pressed={active.includes(id)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${active.includes(id) ? 'border-[#c6d4ca] bg-[#e9f0e8] text-[#315c4d]' : 'border-[#e0e1d9] bg-[#f6f5ef] text-[#829087]'}`} data-testid={`button-route-filter-${id}`}><span className="size-2 rounded-full" style={{ backgroundColor: palette[index % palette.length], opacity: active.includes(id) ? 1 : .4 }} />{id}</button>) : <div className="h-5 w-56 animate-pulse rounded-full bg-[#e2e5dc]" />}
        </div>
      </div>
    </div>
    <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#ead9c5] bg-[#f5eee1] px-4 py-3.5 text-[12px] leading-relaxed text-[#6e6657]"><LocateFixed size={16} className="mt-0.5 shrink-0 text-[#a26d39]" /><p><strong className="text-[#5a5142]">Seguimiento en vivo:</strong> la ubicación de las unidades se habilitará cuando conectemos la fuente GPS de la flota. Por ahora, el mapa muestra únicamente los recorridos oficiales.</p></div>
  </section>;
}

function FitMap({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [26, 26], maxZoom: 13, animate: false });
  }, [bounds, map]);
  return null;
}

function MapControls() {
  const map = useMap();
  return <div className="leaflet-top leaflet-right pointer-events-auto !top-[64px] !right-3 !z-[450] flex flex-col gap-2 sm:!right-5"><button onClick={() => map.zoomIn()} aria-label="Acercar mapa" className="grid size-10 place-items-center rounded-xl border border-[#d7ddd4] bg-[#f8f6ef] text-[#34554c] shadow-sm transition hover:bg-white" data-testid="button-map-zoom-in"><Plus size={17} /></button><button onClick={() => map.zoomOut()} aria-label="Alejar mapa" className="grid size-10 place-items-center rounded-xl border border-[#d7ddd4] bg-[#f8f6ef] text-[#34554c] shadow-sm transition hover:bg-white" data-testid="button-map-zoom-out"><Minus size={17} /></button></div>;
}

function ComplaintForm() {
  const createComplaint = useCreateComplaint();
  const queryClient = useQueryClient();
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('service');
  const [routeName, setRouteName] = useState('');
  const [message, setMessage] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const valid = message.trim().length >= 4;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || createComplaint.isPending) return;
    const payload: ComplaintInput = { category, message: message.trim(), ...(routeName ? { routeName } : {}), ...(contactName.trim() ? { contactName: contactName.trim() } : {}), ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}) };
    createComplaint.mutate({ data: payload }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetComplaintSummaryQueryKey() });
        setSent(true); setErrorMessage('');
      },
      onError: () => setErrorMessage('No pudimos enviar el reclamo. Revisá tu conexión e intentá de nuevo.'),
    });
  };
  if (sent) return <div className="rounded-[26px] border border-[#c6dbcf] bg-[#edf5ed] p-6 sm:p-8" data-testid="status-complaint-sent"><div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#d4e8da] text-[#2b7259]"><CheckCircle2 size={24} /></div><p className="mono text-[10px] uppercase tracking-[.17em] text-[#638370]">Recibimos tu mensaje</p><h3 className="display mt-2 text-[24px] font-extrabold tracking-[-.04em] text-[#244c3e]">Gracias por avisarnos.</h3><p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[#547064]">El equipo municipal ya puede revisar tu reclamo. Tu aporte ayuda a mejorar el viaje de todos.</p><button onClick={() => { setSent(false); setCategory('service'); setRouteName(''); setMessage(''); setContactName(''); setContactEmail(''); }} className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#bad2c2] px-4 py-2.5 text-[12px] font-bold text-[#376b55] hover:bg-white" data-testid="button-send-another">Enviar otro reclamo <ArrowRight size={14} /></button></div>;
  return <section id="reclamo" className="scroll-mt-8 rounded-[26px] border border-[#ddd8ca] bg-[#f8f6ee] p-5 shadow-[0_12px_35px_rgba(31,62,53,.05)] sm:p-7">
    <div className="mb-6 flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f0e5d4] text-[#a75e39]"><MessageSquareText size={20} /></div><div><p className="mono text-[10px] font-medium uppercase tracking-[.16em] text-[#9b654d]">Tu voz cuenta</p><h2 className="display mt-1 text-[24px] font-extrabold tracking-[-.045em] text-[#1c3934]">Contanos qué pasó</h2><p className="mt-1 text-[12px] text-[#758079]">Leemos cada reclamo para mejorar el transporte.</p></div></div>
    {errorMessage && <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#f8e9e4] p-3 text-[12px] text-[#914b40]" role="alert" data-testid="status-complaint-error"><AlertCircle size={15} className="mt-0.5 shrink-0" />{errorMessage}</div>}
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="complaint-category" className="mb-1.5 block text-[12px] font-bold text-[#40574d]">¿Sobre qué es tu reclamo?</label><div className="relative"><select id="complaint-category" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)} className="w-full appearance-none rounded-xl border border-[#d9d8ce] bg-[#fcfbf6] px-3.5 py-3 text-[13px] text-[#304d43] outline-none transition focus:border-[#5c927f] focus:ring-2 focus:ring-[#b8d2c6]/60" data-testid="select-complaint-category">{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#728078]" /></div></div>
      <div><label htmlFor="complaint-route" className="mb-1.5 block text-[12px] font-bold text-[#40574d]">Línea o recorrido <span className="font-normal text-[#89938d]">· opcional</span></label><input id="complaint-route" value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Ej. 176" maxLength={80} className="w-full rounded-xl border border-[#d9d8ce] bg-[#fcfbf6] px-3.5 py-3 text-[13px] text-[#304d43] outline-none placeholder:text-[#a4aaa3] focus:border-[#5c927f] focus:ring-2 focus:ring-[#b8d2c6]/60" data-testid="input-complaint-route" /></div>
      <div><label htmlFor="complaint-message" className="mb-1.5 block text-[12px] font-bold text-[#40574d]">Descripción</label><textarea id="complaint-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contanos el lugar, horario y qué ocurrió…" minLength={4} maxLength={3000} rows={4} required className="w-full resize-y rounded-xl border border-[#d9d8ce] bg-[#fcfbf6] px-3.5 py-3 text-[13px] leading-relaxed text-[#304d43] outline-none placeholder:text-[#a4aaa3] focus:border-[#5c927f] focus:ring-2 focus:ring-[#b8d2c6]/60" data-testid="textarea-complaint-message" /><div className="mt-1 flex justify-between text-[10px] text-[#929c95]"><span>Mínimo 4 caracteres</span><span>{message.length}/3000</span></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="complaint-name" className="mb-1.5 block text-[12px] font-bold text-[#40574d]">Nombre <span className="font-normal text-[#89938d]">· opcional</span></label><input id="complaint-name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} placeholder="Cómo te llamás" className="w-full rounded-xl border border-[#d9d8ce] bg-[#fcfbf6] px-3.5 py-3 text-[13px] outline-none placeholder:text-[#a4aaa3] focus:border-[#5c927f]" data-testid="input-complaint-name" /></div><div><label htmlFor="complaint-email" className="mb-1.5 block text-[12px] font-bold text-[#40574d]">Correo <span className="font-normal text-[#89938d]">· opcional</span></label><input id="complaint-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="nombre@correo.com" className="w-full rounded-xl border border-[#d9d8ce] bg-[#fcfbf6] px-3.5 py-3 text-[13px] outline-none placeholder:text-[#a4aaa3] focus:border-[#5c927f]" data-testid="input-complaint-email" /></div></div>
      <p className="text-[10px] leading-relaxed text-[#858f88]">Dejar tus datos es opcional. Se usarán únicamente si necesitamos contactarte por este reclamo.</p>
      <button type="submit" disabled={!valid || createComplaint.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d594e] px-5 py-3.5 text-[13px] font-bold text-[#faf8ee] transition hover:bg-[#17483f] disabled:cursor-not-allowed disabled:opacity-55" data-testid="button-submit-complaint">{createComplaint.isPending ? 'Enviando…' : <>Enviar reclamo <Send size={15} /></>}</button>
    </form>
  </section>;
}

function HomePage() {
  const health = useHealthCheck();
  return <div className="min-h-[100dvh] bg-[#f7f5ed]">
    <SiteHeader />
    <main className="mx-auto max-w-[1360px] px-5 pb-16 pt-8 sm:px-8 sm:pt-11 lg:px-12">
      <section className="relative mb-10 overflow-hidden rounded-[30px] bg-[#1d594e] px-6 py-8 text-[#f7f4e8] sm:px-10 sm:py-10 lg:mb-12 lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute -right-10 -top-24 h-[330px] w-[330px] rounded-full border border-[#8ab3a1]/20" /><div className="pointer-events-none absolute -right-2 -top-16 h-[250px] w-[250px] rounded-full border border-[#8ab3a1]/20" /><div className="pointer-events-none absolute -right-20 bottom-[-200px] h-[330px] w-[330px] rounded-full bg-[#b75a37]/25" />
        <div className="relative max-w-[790px] fade-up"><p className="mono mb-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[.17em] text-[#bdd2c4]"><span className="size-1.5 rounded-full bg-[#d18b60]" /> PILAR · TRANSPORTE PÚBLICO</p><h1 className="display max-w-[740px] text-[38px] font-extrabold leading-[1.04] tracking-[-.06em] sm:text-[54px] lg:text-[64px]">Cada viaje importa.<br /><span className="text-[#d8a176]">Cada voz también.</span></h1><p className="mt-5 max-w-[520px] text-[14px] leading-relaxed text-[#d5e2d8] sm:text-[15px]">Consultá los recorridos oficiales de Pilar y contanos cómo podemos mejorar tu viaje.</p><div className="mt-7 flex flex-wrap items-center gap-4"><a href="#rutas" className="inline-flex items-center gap-2 rounded-full bg-[#f2eee1] px-5 py-3 text-[13px] font-bold text-[#205247] transition hover:bg-white" data-testid="link-view-routes">Ver recorridos <ArrowDownRight size={15} /></a><div className="flex items-center gap-2 text-[11px] text-[#c2d3c8]"><span className={`size-2 rounded-full ${health.isError ? 'bg-[#d18b60]' : 'bg-[#8abc9a]'}`} />{health.isError ? 'Servicio en mantenimiento' : 'Información municipal'}</div></div></div>
        <div className="relative mt-9 flex items-center gap-4 border-t border-[#5f897d]/50 pt-5 text-[10px] font-medium tracking-wide text-[#bfd2c5] sm:mt-10"><span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Municipio de Pilar</span><span className="size-1 rounded-full bg-[#90aa9d]" /><span>Universidad Nacional de Pilar</span></div>
      </section>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(350px,.85fr)] lg:gap-10">
        <div className="fade-up"><RouteMap /></div>
        <div className="fade-up-delay"><ComplaintForm /><div className="mt-4 flex items-start gap-3 rounded-2xl px-1 py-2 text-[11px] leading-relaxed text-[#7b8780]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#71907d]" /><p>Los reclamos llegan al equipo municipal para su seguimiento. <a href={`${basePath}/admin`} className="font-bold text-[#477064] hover:underline">Acceso municipal</a></p></div></div>
      </div>
      <footer className="mt-14 flex flex-col justify-between gap-3 border-t border-[#deddd3] pt-5 text-[10px] text-[#8a938c] sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Brand compact /><span className="ml-1">PilarBus · Transporte público de Pilar</span></div><p>Una iniciativa del Municipio y la Universidad Nacional de Pilar.</p></footer>
    </main>
  </div>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (previousUser.current !== undefined && previousUser.current !== id) client.clear();
      previousUser.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

function AdminDashboard() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const list = useListComplaints(filter === 'all' ? { status: 'all' } : { status: filter }, { query: { queryKey: getListComplaintsQueryKey(filter === 'all' ? { status: 'all' } : { status: filter }) } });
  const summary = useGetComplaintSummary();
  const update = useUpdateComplaint();
  const remove = useDeleteComplaint();
  const [actionError, setActionError] = useState('');
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetComplaintSummaryQueryKey() });
  };
  const toggleStatus = (complaint: Complaint) => {
    const data: ComplaintUpdate = { status: complaint.status === 'open' ? 'resolved' : 'open', adminNote: notes[complaint.id] ?? complaint.adminNote ?? null };
    setActionError('');
    update.mutate({ id: complaint.id, data }, { onSuccess: invalidate, onError: () => setActionError('No se pudo actualizar el reclamo. Probá nuevamente.') });
  };
  const deleteResolved = (complaint: Complaint) => {
    if (complaint.status !== 'resolved') return;
    if (!window.confirm('¿Eliminar este reclamo resuelto? Esta acción no se puede deshacer.')) return;
    setActionError('');
    remove.mutate({ id: complaint.id }, { onSuccess: invalidate, onError: () => setActionError('No se pudo eliminar el reclamo. Probá nuevamente.') });
  };
  const pending = update.isPending || remove.isPending;
  const data = list.data ?? [];
  const listError = list.error as { status?: number; statusCode?: number; response?: { status?: number } } | null;
  const accessDenied = listError?.status === 403 || listError?.statusCode === 403 || listError?.response?.status === 403;
  return <div className="min-h-[100dvh] bg-[#f7f5ed]">
    <SiteHeader admin />
    <main className="mx-auto max-w-[1240px] px-5 pb-16 pt-8 sm:px-8 sm:pt-11 lg:px-12">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mono mb-2 text-[10px] font-medium uppercase tracking-[.17em] text-[#a26649]">Gestión municipal · PilarBus</p><h1 className="display text-[34px] font-extrabold tracking-[-.055em] text-[#1c3934] sm:text-[42px]">Reclamos de vecinos</h1><p className="mt-2 max-w-xl text-[13px] text-[#76827b]">Revisá los reportes, dejá una nota de seguimiento y actualizá su estado.</p></div><div className="inline-flex items-center gap-2 self-start rounded-full border border-[#dcdcd1] bg-[#f1efe6] px-3 py-2 text-[11px] text-[#66756d] sm:self-auto"><ShieldCheck size={15} className="text-[#39705c]" /> Panel privado del Municipio</div></div>
      {list.isError && accessDenied && <div className="mb-5 rounded-xl border border-[#e7d4cc] bg-[#f8e9e4] px-4 py-3 text-[12px] font-semibold text-[#924a3d]" role="alert" data-testid="status-access-denied">Acceso denegado: esta cuenta no está autorizada para administrar reclamos.</div>}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{ label: 'Total recibidos', value: summary.data?.total, icon: FileText, tint: 'bg-[#e8eee5] text-[#4c725e]' }, { label: 'Pendientes', value: summary.data?.open, icon: Clock3, tint: 'bg-[#f4e8d8] text-[#a66d39]' }, { label: 'Resueltos', value: summary.data?.resolved, icon: CheckCircle2, tint: 'bg-[#e3eee8] text-[#42745c]' }].map((stat) => <div key={stat.label} className="flex items-center gap-4 rounded-[20px] border border-[#deddd2] bg-[#fbf9f2] p-4 sm:p-5" data-testid={`summary-${stat.label.toLowerCase().replaceAll(' ', '-')}`}><span className={`grid size-10 place-items-center rounded-xl ${stat.tint}`}><stat.icon size={18} /></span><div><p className="text-[11px] font-semibold text-[#849089]">{stat.label}</p>{summary.isLoading ? <div className="mt-1 h-7 w-12 animate-pulse rounded-md bg-[#e8e8df]" /> : <p className="display mt-0.5 text-[25px] font-extrabold leading-none text-[#24463c]">{stat.value ?? '—'}</p>}</div></div>)}
      </div>
      <section className="overflow-hidden rounded-[24px] border border-[#deddd2] bg-[#fbf9f2]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#e5e3d9] p-4 sm:flex-row sm:items-center sm:px-6 sm:py-5"><div><h2 className="display text-[19px] font-extrabold tracking-[-.03em] text-[#25453b]">Bandeja de reclamos</h2><p className="mt-1 text-[11px] text-[#89928c]">{list.isLoading ? 'Buscando reclamos…' : `${data.length} ${data.length === 1 ? 'reclamo' : 'reclamos'} en esta vista`}{summary.data?.lastUpdatedAt ? ` · Actualizado ${formatDate(summary.data.lastUpdatedAt)}` : ''}</p></div><div className="flex items-center gap-1 rounded-xl bg-[#efeee6] p-1" role="group" aria-label="Filtrar reclamos">{(['all', 'open', 'resolved'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${filter === item ? 'bg-[#fbf9f2] text-[#285b4d] shadow-sm' : 'text-[#7c8981] hover:text-[#40564d]'}`} data-testid={`button-filter-${item}`}>{item === 'all' ? 'Todos' : item === 'open' ? 'Pendientes' : 'Resueltos'}</button>)}</div></div>
        {actionError && <div role="alert" className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-[#f8e9e4] p-3 text-[12px] text-[#914b40] sm:mx-6" data-testid="status-admin-error"><AlertCircle size={15} />{actionError}</div>}
        {list.isLoading ? <div className="space-y-3 p-4 sm:p-6">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-[#efeee6]" />)}</div> :
          list.isError ? <div className="p-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f5e8df] text-[#ae5a41]"><AlertCircle size={20} /></div><h3 className="mt-4 font-bold text-[#38554a]">{accessDenied ? 'Acceso denegado' : 'No pudimos cargar los reclamos'}</h3><p className="mt-1 text-[12px] text-[#839088]">{accessDenied ? 'Esta cuenta no está autorizada para administrar reclamos.' : 'Es posible que haya un problema temporal de conexión.'}</p><button onClick={() => { void list.refetch(); void summary.refetch(); }} className="mt-4 rounded-full border border-[#ced7cc] px-4 py-2 text-[12px] font-bold text-[#3b6858] hover:bg-[#f0f2e9]" data-testid="button-retry-admin">Intentar de nuevo</button></div> :
          data.length === 0 ? <div className="px-6 py-14 text-center" data-testid="empty-complaints"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eeeee5] text-[#72837a]"><MessageSquareText size={20} /></div><h3 className="display mt-4 text-[18px] font-bold text-[#3e584e]">{filter === 'all' ? 'Todavía no hay reclamos' : filter === 'open' ? 'No hay reclamos pendientes' : 'No hay reclamos resueltos'}</h3><p className="mt-1 text-[12px] text-[#89938d]">Los reclamos enviados por vecinos aparecerán acá.</p></div> :
          <div className="divide-y divide-[#e9e7de]">{data.map((complaint) => <article key={complaint.id} className="p-4 transition hover:bg-[#f8f7ef] sm:px-6 sm:py-5" data-testid={`card-complaint-${complaint.id}`}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${complaint.status === 'open' ? 'bg-[#f5ead9] text-[#9a6635]' : 'bg-[#e3eee7] text-[#3f7458]'}`} data-testid={`status-complaint-${complaint.id}`}>{complaint.status === 'open' ? <Clock3 size={11} /> : <Check size={11} />}{complaint.status === 'open' ? 'Pendiente' : 'Resuelto'}</span>
                  <span className="rounded-full border border-[#e3e1d8] px-2.5 py-1 text-[10px] font-semibold text-[#66786f]">{categoryLabel(complaint.category)}</span>
                  {complaint.routeName && <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe2d8] bg-[#f0f3ec] px-2.5 py-1 text-[10px] font-bold text-[#507264]"><Signpost size={11} /> Línea {complaint.routeName}</span>}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[#344e44]">{complaint.message}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#87928a]"><span className="inline-flex items-center gap-1"><Clock3 size={11} />{formatDate(complaint.createdAt)}</span>{complaint.contactName && <span className="inline-flex items-center gap-1"><UserRound size={11} />{complaint.contactName}</span>}{complaint.contactEmail && <a href={`mailto:${complaint.contactEmail}`} className="inline-flex items-center gap-1 text-[#477466] hover:underline"><ExternalLink size={10} />{complaint.contactEmail}</a>}</div>
              </div>
              <div className="flex shrink-0 gap-2 sm:pl-4">
                <button onClick={() => toggleStatus(complaint)} disabled={pending} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition disabled:opacity-50 ${complaint.status === 'open' ? 'bg-[#1d594e] text-white hover:bg-[#17483f]' : 'border border-[#cbd9cd] bg-[#eff3eb] text-[#47705b] hover:bg-[#e5eee5]'}`} data-testid={`button-${complaint.status === 'open' ? 'resolve' : 'reopen'}-${complaint.id}`}>{complaint.status === 'open' ? <><Check size={13} /> Resolver</> : <><RotateCcw size={13} /> Reabrir</>}</button>
                {complaint.status === 'resolved' && <button onClick={() => deleteResolved(complaint)} disabled={pending} className="grid size-9 place-items-center rounded-full border border-[#e4d7d1] text-[#a45a49] transition hover:bg-[#f8e9e4] disabled:opacity-50" aria-label={`Eliminar reclamo ${complaint.id}`} title="Eliminar reclamo resuelto" data-testid={`button-delete-${complaint.id}`}><Trash2 size={14} /></button>}
              </div>
            </div>
            <div className="mt-4 border-l-2 border-[#d6dfd5] pl-3"><label htmlFor={`admin-note-${complaint.id}`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#87938a]">Nota interna</label><div className="flex flex-col gap-2 sm:flex-row"><textarea id={`admin-note-${complaint.id}`} value={notes[complaint.id] ?? complaint.adminNote ?? ''} onChange={(event) => setNotes((previous) => ({ ...previous, [complaint.id]: event.target.value }))} maxLength={2000} rows={2} placeholder="Agregar contexto o seguimiento interno…" className="min-h-12 flex-1 resize-y rounded-xl border border-[#e0dfd5] bg-[#f7f6ef] px-3 py-2.5 text-[11px] leading-relaxed text-[#425a4f] outline-none placeholder:text-[#a0a9a2] focus:border-[#a2c0ad]" data-testid={`textarea-admin-note-${complaint.id}`} /><button onClick={() => update.mutate({ id: complaint.id, data: { status: complaint.status, adminNote: notes[complaint.id] ?? complaint.adminNote ?? null } }, { onSuccess: invalidate, onError: () => setActionError('No se pudo guardar la nota. Probá nuevamente.') })} disabled={pending || (notes[complaint.id] ?? complaint.adminNote ?? '') === (complaint.adminNote ?? '')} className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-[#d2dcd1] px-3.5 py-2.5 text-[10px] font-bold text-[#4c705d] transition hover:bg-[#edf2e9] disabled:cursor-not-allowed disabled:opacity-45 sm:self-center" data-testid={`button-save-note-${complaint.id}`}>Guardar nota <ArrowRight size={12} /></button></div></div>
          </article>)}</div>}
      </section>
      <p className="mt-4 flex items-center gap-2 px-1 text-[10px] text-[#929b94]"><ShieldCheck size={13} /> Las notas son internas y no se muestran en el mapa público.</p>
    </main>
  </div>;
}

function AdminRoute() {
  return <><Show when="signed-in"><AdminDashboard /></Show><Show when="signed-out"><div className="min-h-[100dvh] bg-[#f7f5ed]"><SiteHeader /><main className="mx-auto grid max-w-3xl place-items-center px-5 py-24 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[#e6eee5] text-[#366954]"><ShieldCheck /></div><h1 className="display mt-5 text-3xl font-extrabold tracking-[-.05em] text-[#1c3934]">Acceso municipal</h1><p className="mt-2 max-w-md text-sm leading-relaxed text-[#718078]">Este panel está reservado al equipo autorizado del Municipio de Pilar.</p><a href={`${basePath}/sign-in`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1d594e] px-5 py-3 text-sm font-bold text-white hover:bg-[#17483f]">Iniciar sesión <ArrowRight size={15} /></a></main></div></Show></>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#1d594e', colorForeground: '#203b34', colorMutedForeground: '#718078', colorDanger: '#a53d37',
    colorBackground: '#fbf9f2', colorInput: '#f7f5ed', colorInputForeground: '#29483e', colorNeutral: '#d9ddd3',
    fontFamily: 'DM Sans, sans-serif', borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: {
      width: 'min(440px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      backgroundColor: '#fbf9f2',
      borderRadius: '24px',
      border: '1px solid #deddd2',
      boxShadow: '0 18px 54px rgba(31,62,53,.10)',
      overflow: 'hidden',
    },
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203b34] font-extrabold tracking-tight',
    headerSubtitle: 'text-[#718078]',
    socialButtonsBlockButtonText: 'text-[#304d43] font-semibold',
    formFieldLabel: 'text-[#40574d] font-semibold',
    footerActionLink: 'text-[#1d594e] font-bold',
    footerActionText: 'text-[#718078]',
    dividerText: 'text-[#89938d]',
    identityPreviewEditButton: 'text-[#1d594e]',
    formFieldSuccessText: 'text-[#357354]',
    alertText: 'text-[#954a3f]',
    logoBox: 'mb-2',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#d9ddd3] bg-[#f7f5ed] hover:bg-[#eef1e9]',
    formButtonPrimary: 'bg-[#1d594e] hover:bg-[#17483f] text-white shadow-none',
    formFieldInput: 'border-[#d9ddd3] bg-[#f7f5ed] text-[#29483e]',
    footerAction: 'text-[#718078]',
    dividerLine: 'bg-[#deddd2]',
    alert: 'bg-[#f8e9e4] border-[#edd2c9]',
    otpCodeFieldInput: 'border-[#d9ddd3] bg-[#f7f5ed] text-[#29483e]',
    formFieldRow: 'mb-4',
    main: 'gap-5',
  },
};

function SignInPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f2f0e7] px-4 py-10"><div className="w-full max-w-[440px]"><div className="mb-7 flex justify-center"><Brand /></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}
function SignUpPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f2f0e7] px-4 py-10"><div className="w-full max-w-[440px]"><div className="mb-7 flex justify-center"><Brand /></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

function RouterContents() {
  const [location, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{
    ...esES,
    signIn: { ...(esES.signIn ?? {}), start: { ...(esES.signIn?.start ?? {}), title: 'Ingresá al panel municipal', subtitle: 'Usá tu cuenta autorizada para continuar.' } },
    signUp: { ...(esES.signUp ?? {}), start: { ...(esES.signUp?.start ?? {}), title: 'Crear cuenta', subtitle: 'Registrate para continuar.' } },
  }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <ClerkCacheInvalidator />
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f5ed] px-6 text-center"><div className="max-w-md"><Brand /><h1 className="display mt-7 text-2xl font-extrabold text-[#1c3934]">Falta configurar el acceso</h1><p className="mt-2 text-sm leading-relaxed text-[#718078]">PilarBus necesita la clave pública de Clerk para habilitar el panel municipal y el inicio de sesión.</p></div></div>;
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><RouterContents /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
