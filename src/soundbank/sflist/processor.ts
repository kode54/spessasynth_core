import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { BasicPreset } from "../basic_soundbank/basic_preset";
import type { BasicSample } from "../basic_soundbank/basic_sample";
import type { BasicInstrument } from "../basic_soundbank/basic_instrument";
import { Generator } from "../basic_soundbank/generator";
import { Modulator } from "../basic_soundbank/modulator";
import type { SFListPatchMapping } from "./types";

/**
 * Applies a gain value to a sound bank.
 * @param bank - The sound bank to apply gain to.
 * @param gainDb - The gain in decibels.
 */
export function applyGain(bank: BasicSoundBank, gainDb: number): void {
    // Gain is applied as a multiplier: 10^(gain/20)
    // This affects the overall volume of the bank
    // Note: In SF2 format, gain is typically applied at the preset or instrument level
    // For now, we'll store this information for later use
    // Apply gain to all presets' initialAttenuation generator
    // The initialAttenuation is in centibels, so we need to convert from dB
    // 1 dB = 10 centibels
    const attenuationOffset = -gainDb * 10;

    for (const preset of bank.presets) {
        // Apply to global zone
        applyGainToGenerators(preset.globalZone.generators, attenuationOffset);

        // Apply to all preset zones
        for (const zone of preset.zones) {
            applyGainToGenerators(zone.generators, attenuationOffset);
        }
    }
}

/**
 * Applies gain offset to generator array.
 * @param generators - The generators to modify.
 * @param offset - The attenuation offset in centibels.
 */
function applyGainToGenerators(generators: Generator[], offset: number): void {
    const initialAttenuationGen = generators.find(
        (g) => g.generatorType === 48
    ); // 48 is initialAttenuation

    if (initialAttenuationGen) {
        initialAttenuationGen.generatorValue = Math.max(
            0,
            initialAttenuationGen.generatorValue + offset
        );
    }
}

/**
 * Gets the combined bank number from MSB and LSB.
 * @param bankMSB - Bank MSB (0-127).
 * @param bankLSB - Bank LSB (0-127).
 * @returns Combined bank number (MSB | (LSB << 8)).
 */
function getCombinedBank(
    bankMSB: number,
    bankLSB: number,
    isGMGSDrum: boolean
): number {
    return bankMSB | (bankLSB << 8) | (isGMGSDrum ? 0x80 : 0);
}

/**
 * Splits a combined bank number into MSB and LSB.
 * @param combined - Combined bank number.
 * @returns Object with bankMSB and bankLSB.
 */
function splitCombinedBank(combined: number): {
    bankMSB: number;
    bankLSB: number;
} {
    return {
        bankMSB: combined & 0xff,
        bankLSB: (combined >> 8) & 0xff
    };
}

/**
 * Checks if a preset matches the source criteria.
 * @param preset - The preset to check.
 * @param sourceBank - Source bank number (undefined = match all).
 * @param sourceProgram - Source program number (undefined = match all).
 * @returns True if the preset matches.
 */
function presetMatchesSource(
    preset: BasicPreset,
    sourceBank: number | undefined,
    sourceProgram: number | undefined
): boolean {
    const combinedBank = getCombinedBank(
        preset.bankMSB,
        preset.bankLSB,
        preset.isGMGSDrum
    );

    if (sourceBank !== undefined && combinedBank !== sourceBank) {
        return false;
    }

    if (sourceProgram !== undefined && preset.program !== sourceProgram) {
        return false;
    }

    return true;
}

/**
 * Clones a preset with new bank and program values.
 * @param preset - The preset to clone.
 * @param newBankMSB - New bank MSB.
 * @param newBankLSB - New bank LSB.
 * @param newProgram - New program number.
 * @param parentBank - The parent sound bank for the new preset.
 * @returns A new preset with updated values.
 */
function clonePreset(
    preset: BasicPreset,
    newBankMSB: number,
    newBankLSB: number,
    newProgram: number,
    parentBank: BasicSoundBank
): BasicPreset {
    const newPreset = new BasicPreset(parentBank);
    newPreset.name = preset.name;
    newPreset.bankMSB = newBankMSB;
    newPreset.bankLSB = newBankLSB;
    newPreset.isGMGSDrum = preset.isGMGSDrum;
    newPreset.program = newProgram;
    newPreset.library = preset.library;
    newPreset.genre = preset.genre;
    newPreset.morphology = preset.morphology;

    // Clone global zone
    newPreset.globalZone.copyFrom(preset.globalZone);

    // Clone zones
    for (const zone of preset.zones) {
        const copiedZone = newPreset.createZone(
            parentBank.cloneInstrument(zone.instrument)
        );
        copiedZone.copyFrom(zone);
    }

    return newPreset;
}

/**
 * Tracks all samples and instruments used by a preset.
 * @param preset - The preset to analyze.
 * @param usedSamples - Set to add used samples to.
 * @param usedInstruments - Set to add used instruments to.
 */
function trackUsedElements(
    preset: BasicPreset,
    usedSamples: Set<BasicSample>,
    usedInstruments: Set<BasicInstrument>
): void {
    for (const zone of preset.zones) {
        if (zone.instrument) {
            usedInstruments.add(zone.instrument);

            for (const instZone of zone.instrument.zones) {
                if (instZone.sample) {
                    usedSamples.add(instZone.sample);
                }
            }
        }
    }
}

/**
 * Applies a patch mapping to a bank and returns filtered presets.
 * @param bank - The source sound bank.
 * @param mapping - The patch mapping to apply.
 * @param outputBank - The output sound bank to add presets to.
 * @returns Array of filtered presets.
 */
export function applyPatchMapping(
    bank: BasicSoundBank,
    mapping: SFListPatchMapping,
    outputBank: BasicSoundBank
): BasicPreset[] {
    const filteredPresets: BasicPreset[] = [];

    const destBank = mapping.destination.bank ?? 0;
    const destProgram = mapping.destination.program ?? 0;
    const sourceBank = mapping.source?.bank;
    const sourceProgram = mapping.source?.program;

    const destBankSplit = splitCombinedBank(destBank);

    for (const preset of bank.presets) {
        if (presetMatchesSource(preset, sourceBank, sourceProgram)) {
            // Calculate new bank/program values
            let newBankMSB = destBankSplit.bankMSB;
            let newBankLSB = destBankSplit.bankLSB;
            let newProgram = destProgram;

            // If source bank/program not specified, offset missing values
            if (sourceBank === undefined) {
                newBankMSB = preset.bankMSB + destBankSplit.bankMSB;
                newBankLSB = preset.bankLSB + destBankSplit.bankLSB;
            }
            if (sourceProgram === undefined) {
                newProgram = preset.program + destProgram;
            }

            // Clone preset with new values
            const newPreset = clonePreset(
                preset,
                newBankMSB,
                newBankLSB,
                newProgram,
                outputBank
            );
            filteredPresets.push(newPreset);
        }
    }

    return filteredPresets;
}

/**
 * Filters a bank based on channels and patch mappings.
 * @param bank - The source sound bank.
 * @param channels - Optional channel restrictions.
 * @param patchMappings - Optional patch mapping rules.
 * @param outputBank - The output sound bank to add presets to.
 * @returns Array of filtered presets.
 */
export function filterBankByRules(
    bank: BasicSoundBank,
    channels: number[] | undefined,
    patchMappings: SFListPatchMapping[] | undefined,
    outputBank: BasicSoundBank
): BasicPreset[] {
    let filteredPresets: BasicPreset[] = [];

    if (patchMappings === undefined || patchMappings.length === 0) {
        // No patch mappings, include all presets
        for (const preset of bank.presets) {
            const newPreset = clonePreset(
                preset,
                preset.bankMSB,
                preset.bankLSB,
                preset.program,
                outputBank
            );
            filteredPresets.push(newPreset);
        }
    } else {
        // Apply each patch mapping
        for (const mapping of patchMappings) {
            const mappedPresets = applyPatchMapping(bank, mapping, outputBank);
            filteredPresets = filteredPresets.concat(mappedPresets);
        }
    }

    // Note: Channel filtering is not implemented in the core sound bank system
    // Channels are typically handled at the sequencer/synthesizer level
    // If channels are specified, we could add metadata to presets for later filtering
    if (channels !== undefined && channels.length > 0) {
        // For now, we'll just log a warning
        console.warn(
            `Channel filtering is not implemented at the sound bank level. Channels: ${channels.join(", ")}`
        );
    }

    return filteredPresets;
}

/**
 * Merges multiple filtered banks into a single bank.
 * @param filteredPresets - Array of filtered presets from all banks.
 * @param allBanks - Array of all source banks.
 * @returns A merged sound bank.
 */
export function mergeFilteredBanks(
    filteredPresets: BasicPreset[],
    allBanks: BasicSoundBank[]
): BasicSoundBank {
    const outputBank = new BasicSoundBank();
    const usedSamples = new Set<BasicSample>();
    const usedInstruments = new Set<BasicInstrument>();

    // Add all filtered presets
    outputBank.presets = filteredPresets;

    // Track used samples and instruments
    for (const preset of filteredPresets) {
        trackUsedElements(preset, usedSamples, usedInstruments);
    }

    // Add used samples and instruments
    outputBank.samples = Array.from(usedSamples);
    outputBank.instruments = Array.from(usedInstruments);

    // Merge default modulators from all banks
    const mergedModulators = new Set<Modulator>();
    for (const bank of allBanks) {
        for (const mod of bank.defaultModulators) {
            // Use a simple string representation for deduplication
            const key = mod.toString();
            if (
                !Array.from(mergedModulators).some((m) => m.toString() === key)
            ) {
                mergedModulators.add(Modulator.copyFrom(mod));
            }
        }
    }
    outputBank.defaultModulators = Array.from(mergedModulators);

    // Use info from first bank (or create default)
    if (allBanks.length > 0) {
        outputBank.soundBankInfo = { ...allBanks[0].soundBankInfo };
        outputBank.soundBankInfo.name = "SFList Merged Bank";
    }

    return outputBank;
}
