<script lang="ts">
	import { resolve } from '$app/paths';
	import Heart from '@lucide/svelte/icons/heart';
	import Search from '@lucide/svelte/icons/search';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Meine Touren</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Tourensuche" />

<h1>Meine Touren</h1>

<div class="empty">
	<span class="empty-icon"><Heart size={44} strokeWidth={2} aria-hidden="true" /></span>
	<p><strong>Sie haben noch keine Tour gemerkt.</strong></p>
	<p class="muted">
		Gemerkte Touren bleiben nur auf diesem Gerät gespeichert. Sie brauchen dafür kein Konto.
	</p>
</div>

<Button variant="primary" icon={Search} href={resolve('/')}>Eine Tour finden</Button>

<style>
	.empty {
		margin: 1rem 0 1.5rem;
		padding: 1.5rem 1.25rem 0.5rem;
		border-radius: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		text-align: center;
	}

	.empty-icon {
		display: inline-grid;
		place-items: center;
		width: 5rem;
		height: 5rem;
		margin-bottom: 0.75rem;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
	}
</style>
