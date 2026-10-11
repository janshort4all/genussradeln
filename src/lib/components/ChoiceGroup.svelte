<script lang="ts" module>
	import type { LucideIcon } from '@lucide/svelte';
	import type { SceneKind } from './Scene.svelte';

	export interface Choice {
		value: string;
		label: string;
		icon?: LucideIcon;
		/** füllt eine ganze Zeile */
		wide?: boolean;
		/** zweite Zeile in normaler Schrift, z. B. „ca. 40 Min.“ */
		sub?: string;
		/** kleine gezeichnete Landschaft unter dem Text */
		art?: SceneKind;
		/** Landschaft als Hintergrund der ganzen Kachel, Symbol in weißer Scheibe, Text weiß darunter (wie im Entwurf) */
		photo?: boolean;
		/** höhere Kachel, passend zu den Bildkacheln daneben */
		tall?: boolean;
		/** Pfeil „>“ am rechten Rand (führt zu weiteren Angaben) */
		chevron?: boolean;
	}
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Scene from './Scene.svelte';

	/**
	 * Auswahlgruppe aus großen Kacheln, z. B. „1 Std. / 2 Std. / Halber Tag“.
	 * Technisch echte Radio-Buttons (eine Wahl) bzw. Checkboxen (`multiple`, mehrere Wahlen),
	 * damit Screenreader und Tastatur funktionieren.
	 */
	interface Props {
		legend: string;
		name: string;
		choices: Choice[];
		/** Einzelwahl: string; Mehrfachwahl (`multiple`): string[] */
		value?: string | string[];
		multiple?: boolean;
		/** Legende nur für Screenreader (wenn eine Überschrift schon darüber steht) */
		hideLegend?: boolean;
		/** feste Spaltenzahl (sonst so viele, wie nebeneinander passen) */
		columns?: number;
	}

	let {
		legend,
		name,
		choices,
		value = $bindable(),
		multiple = false,
		hideLegend = false,
		columns
	}: Props = $props();

	function isChecked(choice: string): boolean {
		return Array.isArray(value) ? value.includes(choice) : value === choice;
	}

	function toggle(choice: string, checked: boolean) {
		if (multiple) {
			const current = Array.isArray(value) ? value : [];
			value = checked ? [...current, choice] : current.filter((v) => v !== choice);
		} else if (checked) {
			value = choice;
		}
	}
</script>

<fieldset class="choice-group">
	<legend class:visually-hidden={hideLegend}>{legend}</legend>
	<div
		class="options"
		class:many={choices.length > 3}
		style:grid-template-columns={columns ? `repeat(${columns}, minmax(0, 1fr))` : undefined}
	>
		{#each choices as choice (choice.value)}
			<label
				class="option"
				class:with-icon={choice.icon}
				class:photo={choice.photo && choice.art}
				class:tall={choice.tall}
				class:wide={choice.wide}
				style:grid-column={choice.wide ? '1 / -1' : undefined}
			>
				<input
					type={multiple ? 'checkbox' : 'radio'}
					{name}
					value={choice.value}
					checked={isChecked(choice.value)}
					onchange={(e) => toggle(choice.value, e.currentTarget.checked)}
				/>
				{#if choice.photo && choice.art}
					<span class="scene full" aria-hidden="true"><Scene kind={choice.art} /></span>
					<span class="shade" aria-hidden="true"></span>
					{#if choice.icon}
						<span class="disc" aria-hidden="true"><choice.icon size={26} strokeWidth={2} /></span>
					{/if}
					<span class="label">{choice.label}</span>
				{:else}
					{#if choice.icon}
						<choice.icon class="icon" size={28} strokeWidth={2} aria-hidden="true" />
					{/if}
					<span class="label">{choice.label}</span>
					{#if choice.sub}<span class="sub">{choice.sub}</span>{/if}
					{#if choice.art}<span class="scene small" aria-hidden="true"><Scene kind={choice.art} /></span>{/if}
				{/if}
				{#if choice.chevron}<ChevronRight class="chevron" size={26} strokeWidth={2.5} aria-hidden="true" />{/if}
				<!-- Häkchen zusätzlich zur Farbe, damit die Auswahl nicht nur über Farbe erkennbar ist -->
				<span class="badge" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.choice-group {
		border: 0;
		margin: 0 0 1.75rem;
		padding: 0;
		min-width: 0;
	}

	legend {
		font-weight: 700;
		font-size: var(--text-large);
		margin-bottom: 0.625rem;
		padding: 0;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
		gap: 0.625rem;
	}

	.options.many {
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
	}

	.option {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 3.5rem;
		padding: 0.625rem 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		box-shadow: 0 1px 2px rgb(36 53 57 / 0.06);
		text-align: center;
		font-weight: 700;
		line-height: 1.25;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background-color 0.15s;
	}

	.option.with-icon {
		min-height: 5.25rem;
	}

	.option.tall {
		min-height: 8rem;
	}

	/* Zeile mit Pfeil rechts (z. B. „Länger als 50 km“): Symbol und Text nebeneinander */
	.option.wide {
		flex-direction: row;
		min-height: 3.5rem;
		gap: 0.75rem;
	}

	.option.wide :global(.chevron) {
		position: absolute;
		right: 1rem;
		color: var(--color-green);
	}

	/* Fahrzeit: immer genau eine Zeile (Jan, 14.10.2026: überall einheitlich) */
	.sub {
		font-size: var(--text-small);
		font-weight: 400;
		color: var(--color-text);
		white-space: nowrap;
	}

	/* Zeilenumbrüche in der Beschriftung (\n) gelten – so haben alle Kacheln einer Gruppe gleich viele Zeilen */
	.label {
		position: relative;
		white-space: pre-line;
	}

	/* Kacheln mit Landschaft: Text oben, Landschaft unten – alle Kacheln einer Reihe gleich aufgebaut */
	.option:has(.scene.small) {
		justify-content: flex-start;
		padding-inline: 0.375rem;
	}

	/* kleine Landschaft unter dem Text */
	.scene.small {
		display: block;
		margin-top: auto;
		width: 100%;
		height: 3.75rem;
		overflow: hidden;
		border-radius: 0.5rem;
	}

	/* Bildkachel: Landschaft füllt die Kachel, unten ein dunkler Verlauf für die weiße Schrift */
	.option.photo {
		justify-content: flex-end;
		min-height: 8rem;
		padding: 0.5rem;
		overflow: hidden;
		border-color: transparent;
		color: #fff;
	}

	.option.photo:has(input:checked) {
		border-color: var(--color-green);
		background: var(--color-surface);
		color: #fff;
	}

	.scene.full {
		position: absolute;
		inset: 0;
	}

	.shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(0deg, rgb(20 32 26 / 0.82) 0%, rgb(20 32 26 / 0.5) 38%, rgb(20 32 26 / 0) 70%);
	}

	.disc {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		margin-bottom: auto;
		border-radius: 50%;
		background: #fdfbf5;
		color: var(--color-green);
	}

	.option.photo .label {
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
	}

	.option :global(.icon) {
		color: var(--color-olive);
		flex: none;
	}

	.option:has(input:checked) :global(.icon) {
		color: var(--color-green);
	}

	/* Eingabefeld unsichtbar, aber fokussierbar – die ganze Kachel ist das Label */
	input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.option:hover {
		border-color: var(--color-green);
	}

	.option:has(input:checked) {
		border-color: var(--color-green);
		background: var(--color-green-light);
		color: var(--color-green);
	}

	.badge {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		display: none;
		place-items: center;
		width: 1.625rem;
		height: 1.625rem;
		border-radius: 50%;
		background: var(--color-green);
		color: var(--color-surface);
		box-shadow: 0 0 0 2px var(--color-bg);
	}

	.option:has(input:checked) .badge {
		display: grid;
	}

	/* Bildkachel schneidet am Rand ab – das Häkchen sitzt deshalb innen */
	.option.photo .badge {
		top: 0.375rem;
		right: 0.375rem;
		box-shadow: 0 0 0 2px #fff;
	}

	.option:has(input:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}
</style>
