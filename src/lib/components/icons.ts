/**
 * Zuordnung fachlicher Begriffe → Icon und Farbe, damit überall dieselben Symbole erscheinen.
 * Icons: Lucide (ISC-Lizenz), einzeln importiert → nur genutzte Icons landen im Build.
 */
import type { LucideIcon } from '@lucide/svelte';
import Armchair from '@lucide/svelte/icons/armchair';
import Beer from '@lucide/svelte/icons/beer';
import Binoculars from '@lucide/svelte/icons/binoculars';
import Coffee from '@lucide/svelte/icons/coffee';
import PlugZap from '@lucide/svelte/icons/plug-zap';
import Sprout from '@lucide/svelte/icons/sprout';
import Toilet from '@lucide/svelte/icons/toilet';
import Trees from '@lucide/svelte/icons/trees';
import WavesHorizontal from '@lucide/svelte/icons/waves-horizontal';
import type { LandscapeTag, StopKind } from '$lib/tour/sample';

interface IconStyle {
	icon: LucideIcon;
	/** Symbolfarbe (Kontrast ≥ 4,5 : 1 auf `background`) */
	color: string;
	background: string;
}

export const stopIcons: Record<StopKind, IconStyle> = {
	cafe: { icon: Coffee, color: '#6E4219', background: '#F3E6D6' },
	biergarten: { icon: Beer, color: '#7A4F00', background: '#F8ECCB' },
	toilette: { icon: Toilet, color: '#1F5A7A', background: '#DDEBF2' },
	aussicht: { icon: Binoculars, color: '#1F5E3B', background: '#E3EEDF' },
	bank: { icon: Armchair, color: '#4A4D45', background: '#ECE9DF' },
	laden: { icon: PlugZap, color: '#A3330A', background: '#F9E3D8' }
};

export const landscapeIcons: Record<LandscapeTag, IconStyle> = {
	wasser: { icon: WavesHorizontal, color: '#1F5A7A', background: '#DDEBF2' },
	wald: { icon: Trees, color: '#1F5E3B', background: '#E3EEDF' },
	gruen: { icon: Sprout, color: '#1F5E3B', background: '#E3EEDF' },
	aussicht: { icon: Binoculars, color: '#4A4D45', background: '#ECE9DF' }
};
