/**
 * Zuordnung fachlicher Begriffe → Icon und Farbe, damit überall dieselben Symbole erscheinen.
 * Icons: Lucide (ISC-Lizenz), einzeln importiert → nur genutzte Icons landen im Build.
 * Farben: nur Logo-Farben bzw. deren Abstufungen (siehe app.css).
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
	/** Symbol- und Textfarbe (Kontrast ≥ 4,5 : 1 auf `background`) */
	color: string;
	background: string;
}

const terracotta = { color: '#8E4425', background: '#F6E1D5' };
const sun = { color: '#283C30', background: '#FBECCC' };
const water = { color: '#32596F', background: '#DFE8EC' };
const green = { color: '#283C30', background: '#E8EBD6' };
const khaki = { color: '#243539', background: '#EFE6CF' };

export const stopIcons: Record<StopKind, IconStyle> = {
	cafe: { icon: Coffee, ...terracotta },
	biergarten: { icon: Beer, ...sun },
	toilette: { icon: Toilet, ...water },
	aussicht: { icon: Binoculars, ...green },
	bank: { icon: Armchair, ...khaki },
	laden: { icon: PlugZap, ...sun }
};

export const landscapeIcons: Record<LandscapeTag, IconStyle> = {
	wasser: { icon: WavesHorizontal, ...water },
	wald: { icon: Trees, ...green },
	gruen: { icon: Sprout, ...green },
	aussicht: { icon: Binoculars, ...khaki }
};
