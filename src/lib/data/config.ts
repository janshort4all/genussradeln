/** Wo die Kartenkacheln liegen: Umgebungsvariable VITE_TILES_URL (online: der eigene Server), sonst im Ordner static/tiles der App */
import { asset } from '$app/paths';

export const tilesUrl = (): string => import.meta.env.VITE_TILES_URL ?? asset('/tiles');
