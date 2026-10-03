/**
 * Zusätzliche GraphHopper-Regeln, die die App pro Anfrage an das Profil „genuss“ anhängt.
 * Das Profil selbst steht in routing/custom_models/genuss.json.
 */

/** „gemütlich“: Steigungen deutlich meiden */
export const GEMUETLICH_MODEL = {
	priority: [
		{ if: 'average_slope >= 8 || average_slope <= -8', multiply_by: '0.3' },
		{ else_if: 'average_slope >= 5 || average_slope <= -5', multiply_by: '0.6' }
	]
};
