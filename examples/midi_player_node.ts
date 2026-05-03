import {
    BasicMIDI,
    SFListLoader,
    SoundBankLoader,
    SpessaSynthLogging,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../src";
import * as fs from "fs/promises";
import path from "path";
import { Readable } from "node:stream";
import Speaker from "speaker";

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
if (args.length < 2) {
    console.info("Usage: tsx index.ts <soundbank path> <midi path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];

const soundBank = await SoundBankLoaderNode.fromFilePath(sfPath);
const mid = await fs.readFile(args[1]);

const sampleRate = 44100;
SpessaSynthLogging(true, true, true);
console.info("Initializing synthesizer...");
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false
});
synth.soundBankManager.addSoundBank(soundBank, "main");
await synth.processorInitialized;

console.info("Parsing MIDI file...");
const midi = BasicMIDI.fromArrayBuffer(mid.buffer as ArrayBuffer);
console.info(`Now playing: ${midi.getName()}`);
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();
seq.loopCount = Infinity;

const bufSize = 128;

const audioStream = new Readable({
    read() {
        const left = new Float32Array(bufSize);
        const right = new Float32Array(bufSize);
        seq.processTick();
        synth.process(left, right);

        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }

        const buffer = Buffer.alloc(interleaved.length * 4); // 4 bytes per float
        for (let i = 0; i < interleaved.length; i++) {
            buffer.writeFloatLE(interleaved[i], i * 4);
        }
        this.push(buffer);
    }
});

const speaker = new Speaker({
    sampleRate: 44100,
    channels: 2,
    bitDepth: 32,
    // @ts-expect-error badly typed package (again)
    float: true
});
audioStream.pipe(speaker);
