/**
 * Android-App (Capacitor-Rahmen um die Online-App, siehe CLAUDE.md „Android-App“): Funktionen, die im Browser anders
 * oder gar nicht gehen – Standort auch bei ausgeschaltetem Bildschirm, Sprachansagen, Bildschirm wachhalten,
 * Dateien speichern/verschicken, geteilte Links öffnen. Im normalen Browser ist `isNative()` falsch und die Web-App
 * nimmt wie bisher die Browser-Wege. Die Plugins werden erst bei Gebrauch geladen.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

export function isNative(): boolean {
	try {
		return typeof window !== 'undefined' && Capacitor.isNativePlatform();
	} catch {
		return false;
	}
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface NativeFix {
	lngLat: [number, number];
	accuracy: number;
	time: number;
	speed: number | null;
	heading: number | null;
}

/**
 * Standort fortlaufend verfolgen, auch wenn der Bildschirm ausgeht oder eine andere App vorn ist
 * (Android zeigt dafür eine Benachrichtigung „Die Navigation läuft“). Gibt eine Funktion zum Beenden zurück.
 */
export function watchLocation(onFix: (fix: NativeFix) => void, onProblem: (denied: boolean) => void): () => void {
	let id: string | undefined;
	let stopped = false;
	BackgroundGeolocation.addWatcher(
		{
			backgroundTitle: 'Genuss-Radeln',
			backgroundMessage: 'Die Navigation läuft.',
			requestPermissions: true,
			stale: false,
			distanceFilter: 0
		},
		(location, error) => {
			if (error) {
				onProblem(error.code === 'NOT_AUTHORIZED');
				return;
			}
			if (!location) return;
			onFix({
				lngLat: [location.longitude, location.latitude],
				accuracy: location.accuracy,
				time: location.time ?? Date.now(),
				speed: location.speed,
				heading: location.bearing
			});
		}
	)
		.then((watcherId) => {
			if (stopped) void BackgroundGeolocation.removeWatcher({ id: watcherId });
			else id = watcherId;
		})
		.catch(() => onProblem(false));
	return () => {
		stopped = true;
		if (id) void BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
		id = undefined;
	};
}

/** Einmalige Position (Startpunkt). Wirft einen Fehler mit `denied`, wenn die Person den Standort nicht erlaubt. */
export async function currentLocation(): Promise<[number, number]> {
	const { Geolocation } = await import('@capacitor/geolocation');
	let status = await Geolocation.checkPermissions();
	if (status.location !== 'granted' && status.coarseLocation !== 'granted') status = await Geolocation.requestPermissions();
	if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
		throw Object.assign(new Error('denied'), { denied: true });
	}
	const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60 * 1000 });
	return [position.coords.longitude, position.coords.latitude];
}

/** Deutsche Sprachansage über die Sprachausgabe von Android (die jeweils neue Ansage ersetzt die laufende) */
export async function speak(text: string, rate: number): Promise<void> {
	const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
	await TextToSpeech.speak({ text, lang: 'de-DE', rate });
}

export async function stopSpeaking(): Promise<void> {
	const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
	await TextToSpeech.stop();
}

/** Bildschirm anlassen; Gibt eine Freigabe-Funktion zurück oder `undefined`, wenn es nicht ging */
export async function keepAwake(): Promise<(() => void) | undefined> {
	const { KeepAwake } = await import('@capacitor-community/keep-awake');
	const { isSupported } = await KeepAwake.isSupported();
	if (!isSupported) return undefined;
	await KeepAwake.keepAwake();
	return () => void KeepAwake.allowSleep().catch(() => {});
}

/**
 * Datei über das Teilen-Menü von Android weitergeben (Speichern in „Dateien“/Drive, WhatsApp, E-Mail …).
 * Gibt true zurück, wenn das Menü kam (auch wenn die Person es ohne Auswahl schloss).
 */
export async function shareFile(fileName: string, content: string, title: string): Promise<boolean> {
	const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
	const saved = await Filesystem.writeFile({ path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
	try {
		await Share.share({ title, dialogTitle: title, files: [saved.uri] });
		return true;
	} catch (error) {
		// „Teilen abgebrochen“ ist kein Fehler
		return /cancel/i.test(String((error as Error)?.message));
	}
}

/** Link (mit Text) über das Teilen-Menü von Android verschicken */
export async function shareLink(title: string, text: string, url: string): Promise<boolean> {
	const { Share } = await import('@capacitor/share');
	try {
		await Share.share({ title, text, url, dialogTitle: title });
		return true;
	} catch (error) {
		return /cancel/i.test(String((error as Error)?.message));
	}
}

/**
 * Links zur App (z. B. geteilte Touren aus WhatsApp) in der App öffnen: `open` bekommt Pfad samt Suchteil und #-Teil.
 * Gibt eine Funktion zum Abmelden zurück.
 */
export function listenForLinks(open: (path: string) => void): () => void {
	let remove: (() => void) | undefined;
	let gone = false;
	void import('@capacitor/app').then(async ({ App }) => {
		const toPath = (url: string) => {
			try {
				const u = new URL(url);
				if (u.origin !== location.origin) return undefined;
				return u.pathname + u.search + u.hash;
			} catch {
				return undefined;
			}
		};
		const handle = await App.addListener('appUrlOpen', ({ url }) => {
			const path = toPath(url);
			if (path) open(path);
		});
		if (gone) void handle.remove();
		else remove = () => void handle.remove();
		// Kaltstart über einen Link
		const launch = await App.getLaunchUrl();
		const path = launch?.url ? toPath(launch.url) : undefined;
		if (path && path !== location.pathname + location.search + location.hash) open(path);
	});
	return () => {
		gone = true;
		remove?.();
	};
}
