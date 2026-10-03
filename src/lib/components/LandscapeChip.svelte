<script lang="ts">
	import { landscapeIcons } from './icons';
	import { tagLabel, type LandscapeTag } from '$lib/tour/sample';

	/** Kleines Schild „Am Wasser“, „Viel Wald“ … mit Symbol. */
	let { tag }: { tag: LandscapeTag } = $props();

	const style = $derived(landscapeIcons[tag]);
</script>

<span class="chip" style:color={style.color} style:background={style.background}>
	<style.icon size={20} strokeWidth={2.25} aria-hidden="true" />
	{tagLabel[tag]}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.75rem 0.25rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-small);
		font-weight: 700;
		line-height: 1.4;
	}
</style>
