<script lang="ts" module>
	import type { LucideIcon } from '@lucide/svelte';

	export interface Choice {
		value: string;
		label: string;
		icon?: LucideIcon;
	}
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

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
	}

	let {
		legend,
		name,
		choices,
		value = $bindable(),
		multiple = false,
		hideLegend = false
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
	<div class="options" class:many={choices.length > 3}>
		{#each choices as choice (choice.value)}
			<label class="option" class:with-icon={choice.icon}>
				<input
					type={multiple ? 'checkbox' : 'radio'}
					{name}
					value={choice.value}
					checked={isChecked(choice.value)}
					onchange={(e) => toggle(choice.value, e.currentTarget.checked)}
				/>
				{#if choice.icon}
					<choice.icon class="icon" size={28} strokeWidth={2} aria-hidden="true" />
				{/if}
				<span>{choice.label}</span>
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

	.option:has(input:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}
</style>
