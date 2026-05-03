import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank";

/**
 * Represents the JSON structure of an SFList file.
 */
export interface SFListJSON {
    soundFonts: SFListSoundFont[];
}

/**
 * Represents a single SoundFont entry in an SFList file.
 */
export interface SFListSoundFont {
    /**
     * The path to the SoundFont file (relative or absolute).
     */
    fileName: string;

    /**
     * Optional gain adjustment in decibels.
     */
    gain?: number;

    /**
     * Optional array of MIDI channels (1-48) to restrict this SoundFont to.
     */
    channels?: number[];

    /**
     * Optional array of preset mapping rules.
     */
    patchMappings?: SFListPatchMapping[];
}

/**
 * Represents a preset mapping rule for filtering and remapping presets.
 */
export interface SFListPatchMapping {
    /**
     * The destination (output) bank/program mapping.
     */
    destination: SFListPatchMappingSide;

    /**
     * Optional source (input) bank/program to filter from.
     * If not specified, all presets from the SoundFont are used.
     */
    source?: SFListPatchMappingSide;
}

/**
 * Represents one side of a patch mapping (source or destination).
 */
export interface SFListPatchMappingSide {
    /**
     * Optional bank number (0-65535).
     * In SoundFont format, this combines MSB and LSB: (MSB) | (LSB << 8).
     */
    bank?: number;

    /**
     * Optional program number (0-127).
     */
    program?: number;
}

/**
 * Callback function type for loading SoundFont banks referenced in an SFList.
 * @param fullPath - The full path to the SoundFont file.
 * @returns The loaded SoundFont bank.
 */
export type SFListLoaderCallback = (fullPath: string) => BasicSoundBank;

export type SFListLoaderCallbackAsync = (
    fullPath: string
) => Promise<BasicSoundBank>;
