import midi from "midi";
import Speaker from "speaker";
import {
    SFListLoader,
    SoundBankLoader,
    SpessaSynthLogging,
    SpessaSynthProcessor
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
if (args.length < 1) {
    console.info("Usage: tsx index.ts <soundbank path>");
    process.exit();
}
// Initialize the synthesizer
const sampleRate = 44100;
console.info("Initializing synthesizer...");
const sfPath = args[0];
SpessaSynthLogging(true, true, true);
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false
});
synth.soundBankManager.addSoundBank(
    await SoundBankLoaderNode.fromFilePath(sfPath),
    "main"
);
await synth.processorInitialized;

// Initialize the MIDI inputs
const input = new midi.Input();
input.ignoreTypes(false, false, false);
console.info("Listening on port ");
console.info(input.getPortName(0));
input.openPort(0);
input.on("message", (_deltaTime, message) => {
    synth.processMessage(message);
});

const speaker = new Speaker({
    sampleRate: sampleRate,
    channels: 2,
    bitDepth: 32,
    // @ts-expect-error badly typed package (again)
    float: true
});

// Initialize the audio stream
const quantum = 64;
const blockSize = 4;
const left = new Float32Array(quantum * blockSize);
const right = new Float32Array(quantum * blockSize);

let startTime = performance.now();
setInterval(() => {
    const t = (performance.now() - startTime) / 1000;
    if (synth.currentSynthTime - t > 0.5) {
        return;
    }
    left.fill(0);
    right.fill(0);
    let write = 0;
    for (let i = 0; i < blockSize; i++) {
        synth.process(left, right, write, quantum);
        write += quantum;
    }

    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
    }

    const buffer = Buffer.alloc(interleaved.length * 4); // 4 bytes per float
    for (let i = 0; i < interleaved.length; i++) {
        buffer.writeFloatLE(interleaved[i], i * 4);
    }
    speaker.write(buffer);
});
