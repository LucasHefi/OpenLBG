import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Aperture, Boxes, Check, ChevronDown, CircleUserRound, Clock3, Compass, Download,
  Grid2X2, Heart, Image as ImageIcon, Info, Library, ListFilter, LoaderCircle,
  MonitorUp, MoreHorizontal, MousePointer2, Pause, Play, Search, Settings,
  SlidersHorizontal, Sparkles, Trash2, Volume2, X,
} from 'lucide-react';
import AmbientParticles from './AmbientParticles';
import InteractiveField from './InteractiveFields';
import { SORT_OPTIONS, TYPE_FILTERS, VIEW_DEFINITIONS, WALLPAPERS } from './catalog';
import { usePersistentState } from './usePersistentState';

const DEFAULT_SETTINGS = {
  ambientParticles: true,
  autoplayPreviews: true,
  compactGrid: false,
  reduceMotion: false,
};


function Sidebar({ view, setView, installedCount }) {
  const nav = [
    ['discover', 'Objevovat', Compass],
    ['library', 'Knihovna', Library],
    ['installed', 'Nainstalované', MonitorUp],
  ];
  return (
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => setView('discover')} aria-label="OpenLBG – Objevovat">
        <span className="brand-mark"><Aperture size={21} /></span><span>OpenLBG</span>
      </button>
      <nav className="main-nav" aria-label="Hlavní navigace">
        <p className="nav-label">MARKETPLACE</p>
        {nav.map(([id, label, Icon]) => (
          <button type="button" className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => setView(id)} key={id}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'installed' && <span className="nav-count">{installedCount}</span>}
          </button>
        ))}
        <p className="nav-label collections">KOLEKCE</p>
        <button type="button" className={view === 'favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setView('favorites')}><span className="collection-dot pink" />Moje oblíbené</button>
        <button type="button" className={view === 'focus' ? 'nav-item active' : 'nav-item'} onClick={() => setView('focus')}><span className="collection-dot blue" />Klid a soustředění</button>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setView('settings')}><Settings size={18} />Nastavení</button>
        <div className="profile">
          <span className="avatar">JL</span>
          <span className="profile-copy"><strong>Jolanda</strong><small>Lokální účet</small></span>
          <MoreHorizontal size={18} />
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ view, setView }) {
  const entries = [
    ['discover', 'Objevovat', Compass],
    ['library', 'Knihovna', Library],
    ['installed', 'Instalace', MonitorUp],
    ['settings', 'Nastavení', Settings],
  ];
  return (
    <nav className="mobile-nav" aria-label="Mobilní navigace">
      {entries.map(([id, label, Icon]) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={18} /><span>{label}</span></button>)}
    </nav>
  );
}

function TypeBadge({ type }) {
  const Icon = type === 'Video' ? Play : type === 'Interaktivní' ? MousePointer2 : ImageIcon;
  return <span className={`type-badge ${type.toLowerCase()}`}><Icon size={12} fill={type === 'Video' ? 'currentColor' : 'none'} />{type}</span>;
}

const WallpaperCard = memo(function WallpaperCard({ item, favorite, installed, current, motionEnabled, onFavorite, onOpen }) {
  const [previewing, setPreviewing] = useState(false);
  const openPreview = () => {
    setPreviewing(false);
    onOpen(item);
  };
  return (
    <article className="wallpaper-card" onPointerEnter={() => setPreviewing(true)} onPointerLeave={() => setPreviewing(false)} onFocus={() => setPreviewing(true)} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setPreviewing(false)} onClick={openPreview} tabIndex="0" onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openPreview();
      }
    }}>
      <div className="card-visual">
        <img src={item.image} alt="" loading="lazy" decoding="async" style={{ objectPosition: item.position || 'center' }} />
        {item.type === 'Interaktivní' && motionEnabled && item.effect !== 'fluid' && <InteractiveField effect={item.effect} active={previewing} />}
        <div className="card-top"><TypeBadge type={item.type} /></div>
        {installed && <span className={current ? 'installed-badge current' : 'installed-badge'}><Check size={11} />{current ? 'Aktivní' : 'Nainstalováno'}</span>}
        <button type="button" className={`heart-button ${favorite ? 'selected' : ''}`} aria-label={favorite ? `Odebrat ${item.title} z oblíbených` : `Přidat ${item.title} do oblíbených`} onClick={(event) => { event.stopPropagation(); onFavorite(item.id); }}>
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="card-play" aria-label={`Otevřít náhled ${item.title}`} onClick={(event) => { event.stopPropagation(); openPreview(); }}><Play size={18} fill="currentColor" /></button>
      </div>
      <div className="card-info">
        <div><h3>{item.title}</h3><p>od {item.author}</p></div>
        <span className="price">Zdarma</span>
      </div>
    </article>
  );
});

function CatalogInsights({ items, activeFilter, onFilter }) {
  const [metric, setMetric] = useState('count');
  const stats = useMemo(() => {
    const grouped = new Map([
      ['Obrázek', { label: 'Obrázky', filter: 'Obrázky', count: 0, sizeMb: 0, color: '#d7ff63' }],
      ['Video', { label: 'Video', filter: 'Video', count: 0, sizeMb: 0, color: '#67d7ff' }],
      ['Interaktivní', { label: 'Interaktivní', filter: 'Interaktivní', count: 0, sizeMb: 0, color: '#cdb8ff' }],
    ]);
    items.forEach((item) => {
      const entry = grouped.get(item.type);
      if (entry) {
        entry.count += 1;
        entry.sizeMb += item.sizeMb;
      }
    });
    return [...grouped.values()];
  }, [items]);
  const maxValue = Math.max(...stats.map((entry) => metric === 'count' ? entry.count : entry.sizeMb), 1);
  const totalSize = items.reduce((sum, item) => sum + item.sizeMb, 0);
  const interactiveCount = items.filter((item) => item.type === 'Interaktivní').length;
  const featured = items.filter((item) => item.featured || item.type === 'Interaktivní').slice(0, 3);

  return (
    <section className="insights-panel" aria-labelledby="insights-title">
      <div className="insights-copy">
        <p className="section-kicker">RYCHLÝ PŘEHLED KATALOGU</p>
        <h2 id="insights-title">Vyberte si podle atmosféry</h2>
        <p>Porovnejte formáty na první pohled a otevřete si rovnou příslušnou část katalogu.</p>
        <div className="insight-stats" aria-label="Souhrn katalogu">
          <span><strong>{items.length}</strong> tapet</span>
          <span><strong>{interactiveCount}</strong> interaktivních</span>
          <span><strong>{totalSize.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} MB</strong> celkem</span>
        </div>
      </div>
      <div className="insights-chart">
        <div className="insights-chart-head">
          <span>Profil kolekce</span>
          <div className="metric-switch" role="group" aria-label="Metrika grafu">
            <button type="button" className={metric === 'count' ? 'active' : ''} onClick={() => setMetric('count')} aria-pressed={metric === 'count'}>Počet</button>
            <button type="button" className={metric === 'size' ? 'active' : ''} onClick={() => setMetric('size')} aria-pressed={metric === 'size'}>Velikost</button>
          </div>
        </div>
        <div className="insight-bars">
          {stats.map((entry) => {
            const value = metric === 'count' ? entry.count : entry.sizeMb;
            const displayValue = metric === 'count'
              ? `${entry.count} ${entry.count === 1 ? 'tapeta' : entry.count < 5 ? 'tapety' : 'tapet'}`
              : `${entry.sizeMb.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} MB`;
            return (
              <button
                type="button"
                key={entry.label}
                className={activeFilter === entry.filter ? 'insight-bar selected' : 'insight-bar'}
                style={{ '--bar-size': `${Math.max(8, (value / maxValue) * 100)}%`, '--bar-color': entry.color }}
                onClick={() => onFilter(entry.filter)}
                aria-pressed={activeFilter === entry.filter}
              >
                <span className="insight-bar-label"><span>{entry.label}</span><small>{displayValue}</small></span>
                <span className="insight-bar-track"><span className="insight-bar-fill" /></span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="insight-thumbs" aria-label="Ukázky vizuálů">
        {featured.map((item) => (
          <button type="button" key={item.id} className="insight-thumb" onClick={() => onFilter(item.type === 'Obrázek' ? 'Obrázky' : item.type)} aria-label={`Zobrazit ${item.type.toLowerCase()}: ${item.title}`}>
            <img src={item.image} alt="" loading="lazy" decoding="async" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PreviewModal({ item, onClose, onInstall, onRemove, onFavorite, onLibrary, favorite, inLibrary, installed, current, applying, removing, applyError, autoplay, motionEnabled }) {
  const [playing, setPlaying] = useState(autoplay);
  const [progress, setProgress] = useState(0);
  const closeRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!item) return undefined;
    setPlaying(autoplay);
    setProgress(0);
    closeRef.current?.focus();
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [autoplay, item, onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item?.video) return undefined;
    const syncProgress = () => setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
    video.addEventListener('timeupdate', syncProgress);
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
    return () => video.removeEventListener('timeupdate', syncProgress);
  }, [item, playing]);

  if (!item) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="preview-modal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="preview-title">
        <div className="preview-stage">
          {item.video ? <video ref={videoRef} src={item.video} poster={item.image} muted playsInline loop preload="metadata" autoPlay={playing} aria-label={`Video náhled tapety ${item.title}`} /> : <img src={item.image} alt={`Náhled tapety ${item.title}`} />}
          {item.type === 'Interaktivní' && motionEnabled && <InteractiveField effect={item.effect} active={playing} />}
          <div className="desktop-dots"><span /><span /><span /></div>
          <button type="button" ref={closeRef} className="modal-close" onClick={onClose} aria-label="Zavřít náhled"><X size={20} /></button>
          {item.type !== 'Obrázek' && (
            <div className="media-controls">
              <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pozastavit náhled' : 'Spustit náhled'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
              {item.video ? <input className="timeline-range" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => { const video = videoRef.current; if (video?.duration) video.currentTime = (Number(event.target.value) / 100) * video.duration; setProgress(Number(event.target.value)); }} aria-label="Pozice v náhledu" /> : <div className="timeline" aria-hidden="true"><span className={playing ? 'playing' : ''} /></div>}
              <Volume2 size={16} aria-label="Náhled je bez zvuku" />
            </div>
          )}
        </div>
        <div className="modal-info">
          <div className="modal-title"><div><TypeBadge type={item.type} /><h2 id="preview-title">{item.title}</h2><p>Vytvořil <strong>{item.author}</strong></p></div><button type="button" className={`ghost-icon ${favorite ? 'selected' : ''}`} onClick={() => onFavorite(item.id)} aria-label={favorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}><Heart size={19} fill={favorite ? 'currentColor' : 'none'} /></button></div>
          <div className="spec-row"><span><Boxes size={15} />{item.size}</span><span><MonitorUp size={15} />4K · 16:9</span><span><Clock3 size={15} />Nízká zátěž</span></div>
          <p className="description">{item.description} {item.type === 'Interaktivní' ? item.effect === 'diamond' ? 'Na GNOME 45–50 aktivuje automatickou živou sekvenci; jinde se použije poster frame.' : 'Na GNOME 45–50 aktivuje živý efekt reagující na kurzor; jinde se použije poster frame.' : item.type === 'Obrázek' ? 'Soubor se uloží lokálně a nastaví přímo v systému.' : 'Systém použije poster frame; živé video závisí na compositoru.'}</p>
          <button type="button" className={inLibrary ? 'library-button selected' : 'library-button'} onClick={() => onLibrary(item.id)}>{inLibrary ? <><Check size={16} />V knihovně</> : <><Library size={16} />Přidat do knihovny</>}</button>
          {applyError && <div className="apply-error" role="alert">{applyError}</div>}
          <button type="button" className={current ? 'install-button installed' : 'install-button'} onClick={() => onInstall(item)} disabled={applying || removing || current}>
            {applying ? <><LoaderCircle className="spin" size={18} />Nastavuji tapetu…</> : current ? <><Check size={18} />Aktivní tapeta</> : installed ? <><MonitorUp size={18} />Použít znovu</> : <><Download size={18} />Nainstalovat a použít</>}
          </button>
          {installed && !current && <button type="button" className="remove-button" onClick={() => onRemove(item)} disabled={removing || applying}>{removing ? <><LoaderCircle className="spin" size={16} />Odebírám…</> : <><Trash2 size={16} />Odinstalovat ze zařízení</>}</button>}
        </div>
      </section>
    </div>
  );
}

function SettingsView({ settings, setSettings }) {
  const entries = [
    ['ambientParticles', 'Částice na pozadí', 'Jemný živý efekt za rozhraním aplikace.'],
    ['autoplayPreviews', 'Automaticky spouštět náhledy', 'Interaktivní a video náhledy se po otevření rovnou spustí.'],
    ['reduceMotion', 'Omezit pohyb', 'Vypne živé náhledy a omezí přechody v rozhraní.'],
    ['compactGrid', 'Kompaktní mřížka', 'Na větší obrazovce zobrazí více tapet v jednom řádku.'],
  ];
  const update = (key, checked) => setSettings((current) => ({ ...current, [key]: checked }));
  return (
    <section className="settings-view">
      <div className="settings-intro"><span><SlidersHorizontal size={20} /></span><div><h2>Vzhled a chování</h2><p>Nastavení se ukládá pouze na tomto zařízení.</p></div></div>
      <div className="settings-card">
        {entries.map(([key, label, description]) => (
          <label className="setting-row" key={key}>
            <span><strong>{label}</strong><small>{description}</small></span>
            <input type="checkbox" checked={settings[key]} onChange={(event) => update(key, event.target.checked)} />
            <i aria-hidden="true" />
          </label>
        ))}
      </div>
      <div className="account-note"><Info size={18} /><div><strong>Lokální profil</strong><p>Oblíbené, knihovna a nastavení jsou uložené lokálně. Online přihlášení bude doplněno samostatně.</p></div></div>
    </section>
  );
}

function EmptyState({ view, hasQuery, onDiscover }) {
  const copy = hasQuery
    ? ['Nic jsme nenašli', 'Zkuste jiný název, autora nebo typ tapety.']
    : view === 'installed'
      ? ['Zatím tu nic není', 'Tapetu nainstalujete z jejího detailu v marketplace.']
      : view === 'favorites'
        ? ['Žádné oblíbené', 'Srdcem si uložte tapety, ke kterým se chcete vrátit.']
        : view === 'library'
          ? ['Knihovna je prázdná', 'Přidejte tapetu z detailu nebo ji nainstalujte.']
          : ['Kolekce je prázdná', 'Pro tuto kolekci zatím nejsou dostupné žádné tapety.'];
  return <div className="empty"><Grid2X2 size={28} /><h3>{copy[0]}</h3><p>{copy[1]}</p>{view !== 'discover' && <button type="button" onClick={onDiscover}>Přejít na Objevovat</button>}</div>;
}

export default function App() {
  const [filter, setFilter] = useState('Vše');
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistentState('openlbg:sort', 'popular', ['lumina:sort']);
  const [favoritesArray, setFavoritesArray] = usePersistentState('openlbg:favorites', [2], ['lumina:favorites']);
  const [libraryArray, setLibraryArray] = usePersistentState('openlbg:library', [], ['lumina:library']);
  const [settings, setSettings] = usePersistentState('openlbg:settings', DEFAULT_SETTINGS, ['lumina:settings']);
  const [selected, setSelected] = useState(null);
  const [installed, setInstalled] = useState(new Set());
  const [currentWallpaperId, setCurrentWallpaperId] = useState(null);
  const [view, setView] = useState('discover');
  const [toast, setToast] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [applyError, setApplyError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const toastTimer = useRef(null);
  const deferredQuery = useDeferredValue(query);

  const favorites = useMemo(() => new Set(favoritesArray), [favoritesArray]);
  const library = useMemo(() => new Set(libraryArray), [libraryArray]);
  const viewDefinition = VIEW_DEFINITIONS[view] || VIEW_DEFINITIONS.discover;
  const motionEnabled = !settings.reduceMotion;

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    document.documentElement.classList.toggle('compact-grid', settings.compactGrid);
  }, [settings.compactGrid, settings.reduceMotion]);

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    invoke('get_wallpaper_state')
      .then((state) => {
        setInstalled(new Set(state.installedIds || []));
        setCurrentWallpaperId(state.currentWallpaperId ?? null);
      })
      .catch(() => showToast('Stav instalací se nepodařilo načíst.'));
  }, [showToast]);

  const visibleItems = useMemo(() => {
    let scoped = WALLPAPERS;
    if (view === 'library') scoped = WALLPAPERS.filter((item) => library.has(item.id) || installed.has(item.id));
    if (view === 'installed') scoped = WALLPAPERS.filter((item) => installed.has(item.id));
    if (view === 'favorites') scoped = WALLPAPERS.filter((item) => favorites.has(item.id));
    if (view === 'focus') scoped = WALLPAPERS.filter((item) => item.tags.includes('soustředění') || item.tags.includes('klid'));

    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase('cs');
    const filtered = scoped.filter((item) => {
      const matchesFilter = filter === 'Vše' || item.type === filter || (filter === 'Obrázky' && item.type === 'Obrázek');
      return matchesFilter && (!normalizedQuery || item.searchText.includes(normalizedQuery));
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'newest') return b.addedAt.localeCompare(a.addedAt);
      if (sort === 'name') return a.title.localeCompare(b.title, 'cs');
      if (sort === 'smallest') return a.sizeMb - b.sizeMb;
      return b.downloads - a.downloads;
    });
  }, [favorites, filter, installed, library, deferredQuery, sort, view]);

  const changeView = useCallback((nextView) => {
    setView(nextView);
    setFilter('Vše');
    setQuery('');
    setProfileOpen(false);
    document.querySelector('.scroll-content')?.scrollTo({ top: 0, behavior: motionEnabled ? 'smooth' : 'auto' });
  }, [motionEnabled]);

  const toggleInArray = useCallback((setter, id) => setter((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]), []);
  const toggleFavorite = useCallback((id) => {
    const added = !favorites.has(id);
    toggleInArray(setFavoritesArray, id);
    showToast(added ? 'Přidáno do oblíbených' : 'Odebráno z oblíbených');
  }, [favorites, setFavoritesArray, showToast, toggleInArray]);
  const toggleLibrary = useCallback((id) => {
    const added = !library.has(id);
    toggleInArray(setLibraryArray, id);
    showToast(added ? 'Přidáno do knihovny' : 'Odebráno z knihovny');
  }, [library, setLibraryArray, showToast, toggleInArray]);

  const installItem = async (item) => {
    setApplyingId(item.id);
    setApplyError('');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('Systémové pozadí lze nastavit pouze v nainstalované desktopové aplikaci OpenLBG. Do knihovny jej ale můžete přidat i zde.');
      const result = await invoke('apply_wallpaper', { wallpaperId: item.id });
      setInstalled((current) => new Set(current).add(item.id));
      setCurrentWallpaperId(item.id);
      setLibraryArray((current) => current.includes(item.id) ? current : [...current, item.id]);
      showToast(result.message || `${item.title} je nastavená na ploše`);
    } catch (error) {
      setApplyError(typeof error === 'string' ? error : error.message || 'Tapetu se nepodařilo nastavit.');
    } finally {
      setApplyingId(null);
    }
  };

  const removeItem = async (item) => {
    setRemovingId(item.id);
    setApplyError('');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('Odinstalace je dostupná pouze v desktopové aplikaci OpenLBG.');
      await invoke('remove_wallpaper', { wallpaperId: item.id });
      setInstalled((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      showToast(`${item.title} byla odinstalována`);
    } catch (error) {
      setApplyError(typeof error === 'string' ? error : error.message || 'Tapetu se nepodařilo odinstalovat.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <>
      {settings.ambientParticles && <AmbientParticles />}
      <div className="app-shell">
        <Sidebar view={view} setView={changeView} installedCount={installed.size} />
        <main className="content">
          <header className="topbar">
            <div className="page-heading"><p>{viewDefinition.eyebrow}</p><h1>{viewDefinition.title}</h1></div>
            {view !== 'settings' && <label className="search"><Search size={18} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat tapety, tvůrce…" aria-label="Hledat tapety" />{query ? <button type="button" onClick={() => setQuery('')} aria-label="Vymazat hledání"><X size={15} /></button> : <kbd>Ctrl K</kbd>}</label>}
            <div className="profile-menu-wrap">
              <button type="button" className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-label="Místní profil Jolanda"><CircleUserRound size={19} /><span>Jolanda</span><ChevronDown size={15} /></button>
              {profileOpen && <div className="profile-popover"><strong>Jolanda</strong><small>Lokální účet</small><button type="button" onClick={() => changeView('settings')}><Settings size={15} />Nastavení</button><span><Info size={14} />Přihlášení se připravuje</span></div>}
            </div>
          </header>

          <div className="scroll-content">
            {view === 'settings' ? <SettingsView settings={settings} setSettings={setSettings} /> : <>
              {view === 'discover' && !query && filter === 'Vše' && (
                <section className="hero" onClick={() => setSelected(WALLPAPERS[0])} tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && setSelected(WALLPAPERS[0])}>
                  <img src={WALLPAPERS[0].image} alt="Zasněžené hory s polární září a osvětlenou chatou" fetchPriority="high" decoding="async" />
                  <div className="hero-scrim" />
                  <div className="hero-content">
                    <span className="eyebrow"><Sparkles size={14} /> VÝBĚR REDAKCE</span>
                    <h2>Klid, který se<br />pohybuje s vámi.</h2>
                    <p>Arctic Solitude přináší na plochu noční horskou krajinu a klid pro soustředěnou práci.</p>
                    <div className="hero-actions"><button type="button" className="primary-button" onClick={(event) => { event.stopPropagation(); setSelected(WALLPAPERS[0]); }}><Play size={16} fill="currentColor" />Prohlédnout</button><button type="button" aria-label="Přepnout oblíbenou tapetu Arctic Solitude" className={`round-button ${favorites.has(1) ? 'selected' : ''}`} onClick={(event) => { event.stopPropagation(); toggleFavorite(1); }}><Heart size={18} fill={favorites.has(1) ? 'currentColor' : 'none'} /></button></div>
                  </div>
                  <div className="hero-meta"><span>4K</span><span>•</span><span>Statické pozadí</span><span>•</span><span>8,2 tis. stažení</span></div>
                </section>
              )}
              {view === 'discover' && !query && filter === 'Vše' && <CatalogInsights items={WALLPAPERS} activeFilter={filter} onFilter={setFilter} />}

              <section className={view === 'discover' && !query && filter === 'Vše' ? 'market-section' : 'market-section no-hero'}>
                <div className="section-heading"><div><p>{view === 'discover' ? 'DOPORUČENO PRO VÁS' : viewDefinition.eyebrow}</p><h2>{view === 'discover' ? 'Najděte svou atmosféru' : viewDefinition.title}</h2></div><label className="sort-control"><ListFilter size={16} /><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Řazení tapet">{SORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><ChevronDown size={15} /></label></div>
                <div className="filter-row">
                  {TYPE_FILTERS.map((name) => <button type="button" key={name} className={filter === name ? 'filter active' : 'filter'} onClick={() => setFilter(name)}>{name}</button>)}
                  <span className="result-count">{visibleItems.length} {visibleItems.length === 1 ? 'tapeta' : visibleItems.length > 1 && visibleItems.length < 5 ? 'tapety' : 'tapet'}</span>
                </div>
                <div className="wallpaper-grid">
                  {visibleItems.map((item) => <WallpaperCard item={item} key={item.id} favorite={favorites.has(item.id)} installed={installed.has(item.id)} current={currentWallpaperId === item.id} motionEnabled={motionEnabled} onFavorite={toggleFavorite} onOpen={setSelected} />)}
                </div>
                {visibleItems.length === 0 && <EmptyState view={view} hasQuery={Boolean(query)} onDiscover={() => changeView('discover')} />}
              </section>
            </>}
          </div>
        </main>
        <MobileNav view={view} setView={changeView} />
        <PreviewModal
          item={selected}
          onClose={() => { setSelected(null); setApplyError(''); }}
          onInstall={installItem}
          onRemove={removeItem}
          onFavorite={toggleFavorite}
          onLibrary={toggleLibrary}
          favorite={selected ? favorites.has(selected.id) : false}
          inLibrary={selected ? library.has(selected.id) : false}
          installed={selected ? installed.has(selected.id) : false}
          current={selected ? currentWallpaperId === selected.id : false}
          applying={selected ? applyingId === selected.id : false}
          removing={selected ? removingId === selected.id : false}
          applyError={applyError}
          autoplay={settings.autoplayPreviews}
          motionEnabled={motionEnabled}
        />
        {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
      </div>
    </>
  );
}
