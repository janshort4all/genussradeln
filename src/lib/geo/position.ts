/** Eigenen Standort einmalig bestimmen (für den Startpunkt). Fehler in verständlichen Worten. */
import { currentLocation, isNative } from '$lib/native';
import type { LngLat } from './geo';

export class PositionError extends Error {}

const DENIED =
	'Die App darf Ihren Standort nicht verwenden. Bitte geben Sie eine Adresse ein – oder erlauben Sie den Standort in den Einstellungen des Handys.';
const FAILED = 'Ihr Standort ließ sich gerade nicht bestimmen. Bitte geben Sie eine Adresse ein.';

export function currentPosition(): Promise<LngLat> {
	if (isNative()) {
		return currentLocation().catch((error: { denied?: boolean }) => {
			throw new PositionError(error?.denied ? DENIED : FAILED);
		});
	}
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator)) {
			reject(new PositionError('Dieses Gerät kann den Standort nicht bestimmen. Bitte geben Sie eine Adresse ein.'));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => resolve([position.coords.longitude, position.coords.latitude]),
			(error) => {
				const message =
					error.code === error.PERMISSION_DENIED
						? 'Die App darf Ihren Standort nicht verwenden. Bitte geben Sie eine Adresse ein – oder erlauben Sie den Standort in den Einstellungen des Browsers.'
						: 'Ihr Standort ließ sich gerade nicht bestimmen. Bitte geben Sie eine Adresse ein.';
				reject(new PositionError(message));
			},
			// grobe Position reicht für den Start, dafür schnell und stromsparend
			{ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
		);
	});
}
