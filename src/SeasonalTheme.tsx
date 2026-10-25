import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bone, Candy, Castle, Flame, Ghost, MoonStar, ScrollText, Skull, WandSparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function isHalloweenSeason(date = new Date()) {
  return date.getMonth() === 9 || (date.getMonth() === 10 && date.getDate() === 1);
}

const HalloweenContext = createContext(false);
const seasonalIcons: Record<string, LucideIcon> = {
  dashboard: Castle, schedule: MoonStar, guides: ScrollText, levelup: Candy, admin: Skull,
  profile: Ghost, Teams: Ghost, HeartHandshake: Candy, ClipboardList: ScrollText,
  Building2: Castle, TrendingUp: WandSparkles, FileCheck2: ScrollText, Folder: Bone,
  Download: Flame, BookOpen: ScrollText,
};

export function SeasonalIcon({ name, fallback: Icon, size = 18, children }: { name: string; fallback: LucideIcon; size?: number; children?: ReactNode }) {
  const halloween = useContext(HalloweenContext);
  const HalloweenIcon = seasonalIcons[name] ?? Ghost;
  return halloween ? <HalloweenIcon size={size} className="halloween-nav-icon" aria-hidden="true" /> : children ?? <Icon size={size} />;
}

export function SeasonalTheme({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(isHalloweenSeason);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setActive(isHalloweenSeason()), 30_000);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(motion.matches);
    motion.addEventListener('change', update);
    return () => { window.clearInterval(timer); motion.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('halloween-theme', active);
    return () => document.documentElement.classList.remove('halloween-theme');
  }, [active]);
  useEffect(() => {
    if (active && !reducedMotion) void video.current?.play().catch(() => {});
  }, [active, reducedMotion]);
  const asset = `${import.meta.env.BASE_URL}resources/themes/halloween/`;
  return <HalloweenContext.Provider value={active}>
    {active && <div className="halloween-wallpaper" aria-hidden="true">
      {reducedMotion ? <img src={`${asset}mourning-manor.jpg`} alt="" /> : <video ref={video} autoPlay muted loop playsInline preload="metadata" poster={`${asset}mourning-manor.jpg`}><source src={`${asset}mourning-manor.mp4`} type="video/mp4" /></video>}
    </div>}
    {children}
  </HalloweenContext.Provider>;
}
