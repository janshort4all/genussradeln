<script lang="ts" module>
	export interface Choice {
		value: string;
		label: string;
	}
</script>

<script lang="ts">
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
			<label class="option">
				<input
					type={multiple ? 'checkbox' : 'radio'}
					{name}
					value={choice.value}
					checked={isChecked(choice.value)}
					onchange={(e) => toggle(choice.value, e.currentTarget.checked)}
				/>
				<span>{choice.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.choice-group {
		border: 0;
		margin: 0 0 1.5rem;
		padding: 0;
		min-width: 0;
	}

	legend {
		font-weight: 700;
		font-size: var(--text-large);
		margin-bottom: 0.5rem;
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
		align-items: center;
		justify-content: center;
		min-height: 3.5rem;
		padding: 0.625rem 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		text-align: center;
		font-weight: 700;
		cursor: pointer;
	}

	/* Eingabefeld unsichtbar, aber fokussierbar – die ganze Kachel ist das Label */
	input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.option:has(input:checked) {
		border-color: var(--color-green);
		background: var(--color-green-light);
		color: var(--color-green);
	}

	/* Häkchen zusätzlich zur Farbe, damit die Auswahl nicht nur über Farbe erkennbar ist */
	.option:has(input:checked) span::before {
		content: '✓ ';
	}

	.option:has(input:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}
</style>
