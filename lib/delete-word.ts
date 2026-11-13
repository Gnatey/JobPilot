/**
 * Le mot qu'il faut taper pour confirmer la suppression du compte, dans chaque langue de l'appli
 * (« SUPPRIMER », « DELETE », « SİL »). Le serveur accepte les trois : la personne tape le mot qu'elle voit à l'écran.
 * Casse, accents et points sur le i sont ignorés (« SİL », « sil » et « SIL » se valent : sur un clavier turc, le « İ » majuscule est pénible à taper).
 */
const WORDS = ["supprimer", "delete", "sil"];

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export const isDeleteWord = (s: unknown): boolean => typeof s === "string" && WORDS.includes(norm(s));
