import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../utils/indexed_array";
import { readBinaryStringIndexed } from "../utils/byte_functions/string";
import { SoundFont2 } from "./soundfont/read/soundfont";
import { DownloadableSounds } from "./downloadable_sounds/downloadable_sounds";
import { SFListLoader } from "./sflist/sflist";

export class SoundBankLoader {
    /**
     * Loads a sound bank from a file buffer.
     * @param buffer The binary file buffer to load.
     * @returns The loaded sound bank, a BasicSoundBank instance.
     */
    public static fromArrayBuffer(buffer: ArrayBuffer): BasicSoundBank {
        const check = buffer.slice(8, 12);
        const a = new IndexedByteArray(check);
        const id = readBinaryStringIndexed(a, 4).toLowerCase();

        if (id === "dls ") {
            return this.loadDLS(buffer);
        }

        // Check if it's an SFList file
        // SFList files start with '{' for JSON format or contain '|' for legacy format
        const textPreview = new TextDecoder().decode(
            buffer.slice(0, Math.min(100, buffer.byteLength))
        );
        const trimmed = textPreview.trim();

        if (trimmed.startsWith("{") || trimmed.includes("|")) {
            throw new Error(
                "SFList files detected. SFList files require a callback function to load referenced SoundFont banks. " +
                    "Please use SFListLoader.load() instead:\n" +
                    "  SFListLoader.load(buffer, basePath, (path) => SoundBankLoader.fromArrayBuffer(fileBuffer))\n" +
                    "See the SFListLoader documentation for more information."
            );
        }

        return new SoundFont2(buffer, false);
    }

    /**
     * Loads an SFList file and returns a merged sound bank.
     * @param buffer The SFList file buffer.
     * @param basePath The base path for resolving relative file paths.
     * @param loaderCallback Callback function to load referenced SoundFont banks.
     * @returns A merged sound bank containing all filtered and remapped presets.
     */
    public static loadSFList(
        buffer: ArrayBuffer,
        basePath: string,
        loaderCallback: (fullPath: string) => BasicSoundBank
    ): BasicSoundBank {
        return SFListLoader.load(buffer, basePath, loaderCallback);
    }

    private static loadDLS(buffer: ArrayBuffer) {
        const dls = DownloadableSounds.read(buffer);
        return dls.toSF();
    }
}
