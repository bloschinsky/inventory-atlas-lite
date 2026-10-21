/*
  The item text fields that AI translation accepts and the bounds of one translation request, shared
  by the server, which enforces them, and the item form, which builds a request within them instead
  of splitting it into several chargeable ones.
*/
export const TRANSLATION_LIMITS = { fields: 20, text: 2000, shortText: 255, totalText: 10_000 };

/*
  The core text fields that can be translated, by their stable key, with the English label the model
  sees as context. `explicitOnly` fields are translated only when the user picks that field: they name
  places and people, so a translation of the whole item never selects them on its own.
*/
export const TRANSLATABLE_CORE_FIELDS = {
  name: { label: 'Name', maxLength: TRANSLATION_LIMITS.text },
  description: { label: 'Description', maxLength: TRANSLATION_LIMITS.text, multiline: true },
  condition_notes: { label: 'Condition notes', maxLength: TRANSLATION_LIMITS.text, multiline: true },
  location: { label: 'Location', maxLength: TRANSLATION_LIMITS.text, explicitOnly: true },
  location_detail: { label: 'Specific location', maxLength: TRANSLATION_LIMITS.shortText, explicitOnly: true },
  transferred_to: { label: 'Transferred to', maxLength: TRANSLATION_LIMITS.shortText, explicitOnly: true }
};
