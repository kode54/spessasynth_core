import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { BasicPreset } from "../basic_soundbank/basic_preset";
import type {
    SFListJSON,
    SFListLoaderCallback,
    SFListLoaderCallbackAsync
} from "./types";
import {
    SFListParseError,
    SFListValidationError,
    SFListProcessingError
} from "./errors";
import { parseLegacySFList } from "./parser";
import { filterBankByRules, mergeFilteredBanks, applyGain } from "./processor";

/**
 * Loader for SFList (SoundFont List) files.
 * SFList files are manifest files that reference one or more SoundFont banks
 * with rules to filter and remap presets.
 */
export class SFListLoader {
    /**
     * Loads an SFList file and returns a merged sound bank.
     * @param buffer - The SFList file buffer.
     * @param basePath - The base path for resolving relative file paths.
     * @param loaderCallback - Callback function to load referenced SoundFont banks.
     * @returns A merged sound bank containing all filtered and remapped presets.
     * @throws SFListError if parsing, validation, or processing fails.
     */
    public static load(
        buffer: ArrayBuffer,
        basePath: string,
        loaderCallback: SFListLoaderCallback
    ): BasicSoundBank {
        // Decode buffer to text
        const text = new TextDecoder().decode(buffer);

        // Detect format (JSON vs legacy)
        const trimmed = text.trim();
        const sflist: SFListJSON =
            trimmed.startsWith("{") || trimmed.startsWith("[")
                ? this.parseJSON(text)
                : this.parseLegacy(text);

        // Validate and process the SFList
        return this.process(sflist, basePath, loaderCallback);
    }

    public static async loadAsync(
        buffer: ArrayBuffer,
        basePath: string,
        loaderCallback: SFListLoaderCallbackAsync
    ): Promise<BasicSoundBank> {
        // Decode buffer to text
        const text = new TextDecoder().decode(buffer);

        // Detect format (JSON vs legacy)
        const trimmed = text.trim();
        const sflist: SFListJSON =
            trimmed.startsWith("{") || trimmed.startsWith("[")
                ? this.parseJSON(text)
                : this.parseLegacy(text);

        // Validate and process the SFList
        return this.processAsync(sflist, basePath, loaderCallback);
    }

    /**
     * Parses JSON format SFList.
     * @param text - The JSON text to parse.
     * @returns Parsed SFList structure.
     * @throws SFListParseError if JSON parsing fails.
     * @throws SFListValidationError if validation fails.
     */
    private static parseJSON(text: string): SFListJSON {
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch (error) {
            throw new SFListParseError(
                `Invalid JSON: ${(error as Error).message}`
            );
        }

        // Validate structure
        if (typeof json !== "object" || json === null) {
            throw new SFListValidationError("Root must be an object");
        }

        const jsonObj = json as Record<string, unknown>;

        if (!("soundFonts" in jsonObj)) {
            throw new SFListValidationError("Missing 'soundFonts' property");
        }

        if (!Array.isArray(jsonObj.soundFonts)) {
            throw new SFListValidationError("'soundFonts' must be an array");
        }

        // Validate each soundFont entry
        for (const [index, sf] of jsonObj.soundFonts.entries()) {
            this.validateSoundFontEntry(sf, index);
        }

        return json as SFListJSON;
    }

    /**
     * Validates a single soundFont entry.
     * @param sf - The soundFont entry to validate.
     * @param index - The index of the entry (for error reporting).
     * @throws SFListValidationError if validation fails.
     */
    private static validateSoundFontEntry(sf: unknown, index: number): void {
        const path = `soundFonts[${index}]`;

        if (typeof sf !== "object" || sf === null) {
            throw new SFListValidationError(`${path} must be an object`);
        }

        const sfObj = sf as Record<string, unknown>;

        if (!("fileName" in sfObj)) {
            throw new SFListValidationError(
                `${path} missing required 'fileName' property`
            );
        }

        if (typeof sfObj.fileName !== "string") {
            throw new SFListValidationError(
                `${path}.fileName must be a string`
            );
        }

        if ("gain" in sfObj) {
            if (typeof sfObj.gain !== "number") {
                throw new SFListValidationError(
                    `${path}.gain must be a number`
                );
            }
        } else {
            // No gain specified
        }

        if ("channels" in sfObj) {
            if (!Array.isArray(sfObj.channels)) {
                throw new SFListValidationError(
                    `${path}.channels must be an array`
                );
            }
            for (const [chIndex, ch] of sfObj.channels.entries()) {
                if (typeof ch !== "number" || !Number.isInteger(ch)) {
                    throw new SFListValidationError(
                        `${path}.channels[${chIndex}] must be an integer`
                    );
                }
                if (ch < 1 || ch > 64) {
                    throw new SFListValidationError(
                        `${path}.channels[${chIndex}] must be between 1 and 64`
                    );
                }
            }
        }

        if ("patchMappings" in sfObj) {
            if (!Array.isArray(sfObj.patchMappings)) {
                throw new SFListValidationError(
                    `${path}.patchMappings must be an array`
                );
            }
            for (const [
                mappingIndex,
                mapping
            ] of sfObj.patchMappings.entries()) {
                this.validatePatchMapping(
                    mapping,
                    `${path}.patchMappings[${mappingIndex}]`
                );
            }
        }
    }

    /**
     * Validates a patch mapping entry.
     * @param mapping - The patch mapping to validate.
     * @param path - The path for error reporting.
     * @throws SFListValidationError if validation fails.
     */
    private static validatePatchMapping(mapping: unknown, path: string): void {
        if (typeof mapping !== "object" || mapping === null) {
            throw new SFListValidationError(`${path} must be an object`);
        }

        const mappingObj = mapping as Record<string, unknown>;

        if (!("destination" in mappingObj)) {
            throw new SFListValidationError(
                `${path} missing required 'destination' property`
            );
        }

        this.validatePatchMappingSide(
            mappingObj.destination,
            `${path}.destination`
        );

        if ("source" in mappingObj) {
            this.validatePatchMappingSide(mappingObj.source, `${path}.source`);
        }
    }

    /**
     * Validates one side of a patch mapping (source or destination).
     * @param side - The patch mapping side to validate.
     * @param path - The path for error reporting.
     * @throws SFListValidationError if validation fails.
     */
    private static validatePatchMappingSide(side: unknown, path: string): void {
        if (typeof side !== "object" || side === null) {
            throw new SFListValidationError(`${path} must be an object`);
        }

        const sideObj = side as Record<string, unknown>;

        if ("bank" in sideObj) {
            if (
                typeof sideObj.bank !== "number" ||
                !Number.isInteger(sideObj.bank)
            ) {
                throw new SFListValidationError(
                    `${path}.bank must be an integer`
                );
            }
            if (sideObj.bank < 0 || sideObj.bank > 65_535) {
                throw new SFListValidationError(
                    `${path}.bank must be between 0 and 65_535`
                );
            }
        }

        if ("program" in sideObj) {
            if (
                typeof sideObj.program !== "number" ||
                !Number.isInteger(sideObj.program)
            ) {
                throw new SFListValidationError(
                    `${path}.program must be an integer`
                );
            }
            if (sideObj.program < 0 || sideObj.program > 127) {
                throw new SFListValidationError(
                    `${path}.program must be between 0 and 127`
                );
            }
        }
    }

    /**
     * Parses legacy format SFList.
     * @param text - The legacy text to parse.
     * @returns Parsed SFList structure.
     * @throws SFListParseError if parsing fails.
     */
    private static parseLegacy(text: string): SFListJSON {
        return parseLegacySFList(text);
    }

    /**
     * Processes the SFList and returns a merged sound bank.
     * @param sflist - The parsed SFList structure.
     * @param basePath - The base path for resolving relative file paths.
     * @param loaderCallback - Callback function to load referenced SoundFont banks.
     * @returns A merged sound bank.
     * @throws SFListProcessingError if processing fails.
     */
    private static process(
        sflist: SFListJSON,
        basePath: string,
        loaderCallback: SFListLoaderCallback
    ): BasicSoundBank {
        const allBanks: BasicSoundBank[] = [];
        const allFilteredPresets: BasicPreset[] = [];

        for (const sf of sflist.soundFonts) {
            try {
                // Resolve path
                const fullPath = this.resolvePath(sf.fileName, basePath);

                // Load bank via callback
                const sourceBank = loaderCallback(fullPath);
                allBanks.push(sourceBank);

                // Apply gain if specified
                if (sf.gain !== undefined && sf.gain !== 0) {
                    applyGain(sourceBank, sf.gain);
                }

                // Create a temporary bank for filtering
                const tempBank = new BasicSoundBank();

                // Filter and remap presets
                const filteredPresets = filterBankByRules(
                    sourceBank,
                    sf.channels,
                    sf.patchMappings,
                    tempBank
                );

                allFilteredPresets.push(...filteredPresets);
            } catch (error) {
                throw new SFListProcessingError(
                    `Failed to process SoundFont entry: ${(error as Error).message}`,
                    sf.fileName,
                    error as Error
                );
            }
        }

        // Merge all filtered presets into a single bank
        return mergeFilteredBanks(allFilteredPresets, allBanks);
    }

    private static async processAsync(
        sflist: SFListJSON,
        basePath: string,
        loaderCallback: SFListLoaderCallbackAsync
    ): Promise<BasicSoundBank> {
        const allBanks: BasicSoundBank[] = [];
        const allFilteredPresets: BasicPreset[] = [];

        for (const sf of sflist.soundFonts) {
            try {
                // Resolve path
                const fullPath = this.resolvePath(sf.fileName, basePath);

                // Load bank via callback
                const sourceBank = await loaderCallback(fullPath);
                allBanks.push(sourceBank);

                // Apply gain if specified
                if (sf.gain !== undefined && sf.gain !== 0) {
                    applyGain(sourceBank, sf.gain);
                }

                // Create a temporary bank for filtering
                const tempBank = new BasicSoundBank();

                // Filter and remap presets
                const filteredPresets = filterBankByRules(
                    sourceBank,
                    sf.channels,
                    sf.patchMappings,
                    tempBank
                );

                allFilteredPresets.push(...filteredPresets);
            } catch (error) {
                throw new SFListProcessingError(
                    `Failed to process SoundFont entry: ${(error as Error).message}`,
                    sf.fileName,
                    error as Error
                );
            }
        }

        // Merge all filtered presets into a single bank
        return mergeFilteredBanks(allFilteredPresets, allBanks);
    }

    /**
     * Resolves a file path relative to a base path.
     * @param path - The path to resolve (can be absolute or relative).
     * @param basePath - The base path for relative paths.
     * @returns The resolved full path.
     */
    private static resolvePath(path: string, basePath: string): string {
        // Check if path is absolute
        // POSIX: starts with '/'
        // Windows: starts with drive letter (e.g., 'C:') or UNC path (e.g., '\\')
        const isAbsolute =
            path.startsWith("/") ||
            path.startsWith("\\") ||
            /^[a-zA-Z]:/.test(path);

        if (isAbsolute) {
            return path;
        }

        // Resolve relative to base path
        const baseEnd =
            basePath.endsWith("/") || basePath.endsWith("\\")
                ? basePath
                : basePath + "/";

        // Normalize path separators
        const normalizedPath = path.replaceAll("\\", "/");
        const normalizedBase = baseEnd.replaceAll("\\", "/");

        // Remove leading './' if present
        let cleanPath = normalizedPath;
        if (cleanPath.startsWith("./")) {
            cleanPath = cleanPath.slice(2);
        }

        const combined = normalizedBase + cleanPath;

        // Handle '..' in path
        const parts = combined.split("/");
        const resolvedParts: string[] = [];

        for (const part of parts) {
            if (part === "..") {
                resolvedParts.pop();
            } else if (part !== "." && part !== "") {
                resolvedParts.push(part);
            }
        }

        const pathPrefix = combined.startsWith("/") ? "/" : "";

        return pathPrefix + resolvedParts.join("/");
    }
}
