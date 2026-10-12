/** Aufgezeichnete Fahrt als Datei: herunterladen (Handy: Ordner „Downloads“) oder über das Teilen-Menü verschicken */
import { isNative, shareFile } from '$lib/native';
import { rideFileName, rideToGpx, type RideRecord } from './recorder';

const MIME = 'application/gpx+xml';

export function downloadRide(record: RideRecord): void {
	// Android-App: Dateien über das Teilen-Menü speichern bzw. verschicken (ein Download wie im Browser geht in der App nicht)
	if (isNative()) {
		void shareFile(rideFileName(record), rideToGpx(record), `Fahrt: ${record.title}`).catch(() => {});
		return;
	}
	const blob = new Blob([rideToGpx(record)], { type: MIME });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = rideFileName(record);
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function asFile(record: RideRecord): File {
	return new File([rideToGpx(record)], rideFileName(record), { type: MIME });
}

/** Das Handy kann die Datei über das Teilen-Menü verschicken (WhatsApp, E-Mail, Drive …) */
export function canShareRide(record: RideRecord): boolean {
	if (isNative()) return true;
	try {
		return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [asFile(record)] });
	} catch {
		return false;
	}
}

/** Teilen-Menü öffnen; false, wenn es nicht ging (die Person hat nur abgebrochen, zählt als erledigt) */
export async function shareRide(record: RideRecord): Promise<boolean> {
	if (isNative()) return shareFile(rideFileName(record), rideToGpx(record), `Fahrt: ${record.title}`).catch(() => false);
	try {
		await navigator.share({ files: [asFile(record)], title: `Fahrt: ${record.title}` });
		return true;
	} catch (error) {
		return error instanceof DOMException && error.name === 'AbortError';
	}
}
