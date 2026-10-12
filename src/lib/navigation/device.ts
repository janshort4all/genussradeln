/**
 * Browser-Funktionen für die Navigation: Sprachansage mit Signalton, Bildschirm wachhalten, Vollbild,
 * Standort verfolgen – und eine Probefahrt ohne GPS (zum Ausprobieren am PC).
 */
import { offset, type LngLat } from '$lib/geo/geo';
import { isNative, keepAwake, speak, stopSpeaking, watchLocation } from '$lib/native';
import type { Fix } from './guidance';
import type { RouteTrack } from './track';

/** Deutsche Sprachansagen (Web Speech API, in der Android-App die Sprachausgabe von Android) mit kurzem Signalton davor */
export class Voice {
	private audio?: AudioContext;
	private voice?: SpeechSynthesisVoice;
	muted = false;

	/** Muss beim Antippen von „Navigation starten“ laufen – Browser erlauben Ton nur nach einer Berührung */
	unlock() {
		try {
			const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.audio ??= new Context();
			void this.audio.resume();
		} catch {
			// ohne Signalton geht es auch
		}
		if (!isNative() && 'speechSynthesis' in window) {
			const pick = () => {
				const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
				this.voice = voices.find((v) => v.localService) ?? voices[0];
			};
			pick();
			speechSynthesis.addEventListener('voiceschanged', pick);
			// leere Ansage schaltet die Sprachausgabe frei
			speechSynthesis.speak(new SpeechSynthesisUtterance(''));
		}
	}

	get canSpeak(): boolean {
		return isNative() || (typeof window !== 'undefined' && 'speechSynthesis' in window);
	}

	private cancelSpeech() {
		if (isNative()) void stopSpeaking().catch(() => {});
		else if (this.canSpeak) speechSynthesis.cancel();
	}

	beep() {
		if (!this.audio || this.muted) return;
		const now = this.audio.currentTime;
		const osc = this.audio.createOscillator();
		const gain = this.audio.createGain();
		osc.frequency.value = 880;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
		osc.connect(gain).connect(this.audio.destination);
		osc.start(now);
		osc.stop(now + 0.3);
	}

	/**
	 * Die neueste Ansage gewinnt: Eine noch wartende oder laufende ältere wird abgebrochen –
	 * sonst käme z. B. „In 150 Metern links“ erst, wenn man schon abgebogen ist.
	 */
	say(text: string, beep = false, force = false) {
		// `force`: „Nochmal“ spricht auch bei ausgeschaltetem Ton (die Person hat ja gerade danach gefragt)
		if (this.muted && !force) return;
		this.cancelSpeech();
		clearTimeout(this.pending);
		if (beep && !this.muted) this.beep();
		if (!this.canSpeak) return;
		if (isNative()) {
			this.pending = setTimeout(() => void speak(text, 0.95).catch(() => {}), beep ? 300 : 0);
			return;
		}
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = 'de-DE';
		utterance.rate = 0.95;
		if (this.voice) utterance.voice = this.voice;
		// nach dem Signalton kurz warten
		this.pending = setTimeout(() => speechSynthesis.speak(utterance), beep ? 300 : 0);
	}

	private pending: ReturnType<typeof setTimeout> | undefined;

	stop() {
		this.cancelSpeech();
	}
}

/** Bildschirm wachhalten: Freigabe-Funktion; `active` sagt, ob der Browser es überhaupt erlaubt hat */
export type ScreenLock = (() => void) & { active: boolean };

/**
 * Bildschirm während der Fahrt anlassen (Screen Wake Lock). Gibt eine Funktion zum Freigeben zurück. Klappt es nicht
 * (alter Browser, Stromsparmodus), ist `active` falsch – die Seite weist dann darauf hin.
 */
export async function keepScreenOn(): Promise<ScreenLock> {
	if (isNative()) {
		try {
			const release = await keepAwake();
			if (release) return Object.assign(release, { active: true });
		} catch {
			// dann der Weg über den Browser
		}
	}
	let lock: WakeLockSentinel | undefined;
	try {
		lock = await navigator.wakeLock?.request('screen');
	} catch {
		// nicht erlaubt, z. B. im Stromsparmodus
	}
	return Object.assign(() => void lock?.release().catch(() => {}), { active: !!lock });
}

export async function enterFullscreen() {
	// in der Android-App gibt es keine Browserleiste, die weg müsste
	if (isNative()) return;
	try {
		if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
	} catch {
		// Vollbild nicht erlaubt (z. B. iPhone) – dann eben mit Browserleiste
	}
}

export async function exitFullscreen() {
	try {
		if (document.fullscreenElement) await document.exitFullscreen();
	} catch {
		// nichts zu tun
	}
}

export type PositionProblem = 'denied' | 'unavailable' | 'unsupported';

/**
 * Standort verfolgen. Meldungen kommen höchstens etwa einmal pro Sekunde, im Stand seltener (spart Strom
 * beim Rechnen und Zeichnen). Gibt eine Funktion zum Beenden zurück.
 */
export function followPosition(onFix: (fix: Fix) => void, onProblem: (problem: PositionProblem) => void): () => void {
	if (isNative()) {
		// Android-App: Standort über einen Dienst, der auch bei ausgeschaltetem Bildschirm weiterläuft
		let lastFix = 0;
		return watchLocation(
			(fix) => {
				const now = Date.now();
				const standing = fix.speed !== null && fix.speed < 1;
				if (now - lastFix < (standing ? 3000 : 800)) return;
				lastFix = now;
				onFix(fix);
			},
			(denied) => onProblem(denied ? 'denied' : 'unavailable')
		);
	}
	if (!('geolocation' in navigator)) {
		onProblem('unsupported');
		return () => {};
	}
	let last = 0;
	const id = navigator.geolocation.watchPosition(
		(pos) => {
			const now = Date.now();
			const standing = pos.coords.speed !== null && pos.coords.speed < 1;
			// 800 statt 1000 ms: Meldungen kommen etwa im Sekundentakt – mit knapp 1000 ms Abstand würde sonst jede zweite verworfen
			if (now - last < (standing ? 3000 : 800)) return;
			last = now;
			onFix({
				lngLat: [pos.coords.longitude, pos.coords.latitude],
				accuracy: pos.coords.accuracy,
				time: pos.timestamp,
				speed: pos.coords.speed,
				heading: pos.coords.heading
			});
		},
		(error) => onProblem(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
		{ enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 }
	);
	return () => navigator.geolocation.clearWatch(id);
}

/**
 * Probefahrt ohne GPS: fährt die Strecke ab (Standard: 18 km/h, `speedUp`-fach beschleunigt),
 * mit leichtem Wackeln wie bei echtem GPS. Ein Abstecher neben die Strecke zeigt den „Strecke verlassen“-Hinweis.
 */
export function simulateRide(track: RouteTrack, onFix: (fix: Fix) => void, speedUp = 2.5): () => void {
	const metersPerTick = (18 / 3.6) * speedUp;
	let along = 0;
	let tick = 0;
	const timer = setInterval(() => {
		tick++;
		along = Math.min(track.total, along + metersPerTick);
		let p: LngLat = track.pointAt(along);
		// kurz nach dem Start einmal 80 m neben die Strecke „verfahren“
		if (tick >= 25 && tick <= 30) p = offset(p, track.bearingAt(along) + 90, 80);
		const jitter = offset(p, Math.random() * 360, Math.random() * 4);
		onFix({ lngLat: jitter, accuracy: 6, time: Date.now() });
		if (along >= track.total) clearInterval(timer);
	}, 1000);
	return () => clearInterval(timer);
}

/**
 * Die eine Stimme der App. „Tour starten“ auf der Tour-Seite schaltet sie frei (der Browser erlaubt Ton nur nach einer Berührung)
 * und die Navigation benutzt dieselbe weiter – so geht es mit einem Tap direkt los.
 */
export const voice = new Voice();
