// Process arguments
import {
    BasicSoundBank,
    type SF2VersionTag,
    SFListLoader,
    SoundBankLoader
} from "../src";
import * as fs from "fs/promises";
import path from "path";

class SoundBankLoaderNode {
    /**
     * Loads a sound bank or SFList from a file path.
     * Automatically detects the file type and handles SFList files with proper path resolution.
     * @param filePath The path to the sound bank file (.sf2, .dls, or .sflist).
     * @returns The loaded sound bank.
     * @throws Error if the file cannot be read or loaded.
     */
    public static async fromFilePath(
        filePath: string
    ): Promise<BasicSoundBank> {
        // Read the file
        const fileBuffer = await fs.readFile(filePath);
        const buffer = fileBuffer.buffer;

        // Check if it's an SFList file by examining the file extension and content
        const ext = path.extname(filePath).toLowerCase();
        const textPreview = new TextDecoder().decode(
            buffer.slice(0, Math.min(100, buffer.byteLength))
        );
        const trimmed = textPreview.trim();

        if (
            ext === ".sflist" ||
            trimmed.startsWith("{") ||
            trimmed.includes("|")
        ) {
            // It's an SFList file
            const basePath = path.dirname(filePath);
            return SFListLoader.loadAsync(
                buffer,
                basePath,
                async (loadPath: string) => {
                    // Load referenced SoundFont files
                    const refFileBuffer = await fs.readFile(loadPath);
                    return SoundBankLoader.fromArrayBuffer(
                        refFileBuffer.buffer
                    );
                }
            );
        }

        // It's a regular sound bank file
        return SoundBankLoader.fromArrayBuffer(buffer);
    }
}

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <sf2/dls/sflist input path>");
    process.exit();
}

const filePath = args[0];
await BasicSoundBank.isSF3DecoderReady;
const bank = await SoundBankLoaderNode.fromFilePath(filePath);
console.info("Loaded bank:", bank.soundBankInfo.name);

console.group("Bank information");
Object.entries(bank.soundBankInfo).forEach(([key, value]) => {
    if (typeof value === "object" && "major" in value && "minor" in value) {
        console.info(
            `${key}: ${(value as SF2VersionTag).major}.${(value as SF2VersionTag).minor}`
        );
    } else {
        console.info(`${key}: ${(value as string)?.toString()?.trim()}`);
    }
});

console.info(`\nPreset count: ${bank.presets.length}`);
console.info(`Instrument count: ${bank.instruments.length}`);
console.info(`Sample count: ${bank.samples.length}`);
console.groupEnd();

console.group("Preset data:");
bank.presets.forEach((preset) => {
    console.group(`\n--- ${preset.toString()} ---`);

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", preset.globalZone.keyRange);
    console.info("Velocity range:", preset.globalZone.velRange);

    preset.zones.forEach((zone) => {
        console.info(`\n--- ${zone?.instrument?.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Instrument data:");
bank.instruments.forEach((inst) => {
    console.group(`\n--- ${inst.name} ---`);
    console.info(
        "Linked presets:",
        inst.linkedTo.map((p) => p.name).join(", ")
    );

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", inst.globalZone.keyRange);
    console.info("Velocity range:", inst.globalZone.velRange);

    inst.zones.forEach((zone) => {
        console.info(`\n--- ${zone.sample.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Sample data:");
bank.samples.forEach((sample) => {
    console.group(`\n--- ${sample.name} ---`);

    console.info("MIDI Key:", sample.originalKey);
    console.info("Cent correction:", sample.pitchCorrection);
    console.info("Compressed:", sample.isCompressed);
    console.info(
        "Sample link",
        sample.linkedSample ? sample.linkedSample.name : "unlinked"
    );
    console.info(
        "Linked instruments:",
        sample.linkedTo.map((i) => i.name).join(", ")
    );
    console.groupEnd();
});
console.groupEnd();
