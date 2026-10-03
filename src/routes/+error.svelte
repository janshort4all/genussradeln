<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Seite nicht gefunden</title>
</svelte:head>

<h1>Hier geht es nicht weiter</h1>
<p>
	{page.status === 404
		? 'Diese Seite gibt es nicht (mehr).'
		: 'Da ist etwas schiefgelaufen. Bitte versuchen Sie es noch einmal.'}
</p>

<Button variant="primary" href={resolve('/')}>Zur Startseite</Button>
