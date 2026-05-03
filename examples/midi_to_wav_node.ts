import {
    audioToWav,
    BasicMIDI,
    SFListLoader,
    SoundBankLoader,
    SpessaSynthLogging,
    SpessaSynthProcessor,
    SpessaSynthSequencer
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

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <soundbank path> <midi path> <wav output path>"
    );
}
// Read MIDI and sound bank
const soundBank = await SoundBankLoaderNode.fromFilePath(args[0]);
const mid = await fs.readFile(args[1]);
// Parse the MIDI and sound bank
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

// Initialize the synthesizer
const sampleRate = 48000;
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false
});
synth.soundBankManager.addSoundBank(soundBank, "main");
await synth.processorInitialized;
// Enable verbose information during render
SpessaSynthLogging(true, true, true);
// Enable uncapped voice count
synth.setMasterParameter("autoAllocateVoices", true);

// Initialize the sequencer
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();

// Prepare the output buffers
const sampleCount = Math.ceil(sampleRate * (midi.duration + 2));
const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const start = performance.now();
let filledSamples = 0;
// Note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const BUFFER_SIZE = 128;
let i = 0;
const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
while (filledSamples < sampleCount) {
    // Process sequencer
    seq.processTick();
    // Render
    const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.process(outLeft, outRight, filledSamples, bufferSize);
    filledSamples += bufferSize;
    i++;
    // Log progress
    if (i % 100 === 0) {
        console.info(
            "Rendered",
            Math.floor(seq.currentTime * 100) / 100,
            "/",
            durationRounded
        );
    }
}
const rendered = Math.floor(performance.now() - start);
console.info(
    "Rendered in",
    rendered,
    `ms (${Math.floor(((midi.duration * 1000) / rendered) * 100) / 100}x)`
);
const wave = audioToWav([outLeft, outRight], sampleRate);
await fs.writeFile(args[2], new Uint8Array(wave));
console.info(`File written to ${args[2]}`);
