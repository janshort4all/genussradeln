<script lang="ts">
	import { resolve } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Meine Touren</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Tourensuche" />

<h1>Meine Touren</h1>
<p>Sie haben noch keine Tour gemerkt.</p>
<p class="muted">
	Gemerkte Touren bleiben nur auf diesem Gerät gespeichert. Sie brauchen dafür kein Konto.
</p>

<Button variant="primary" href={resolve('/')}>Eine Tour finden</Button>
