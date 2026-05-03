import type { SFListJSON, SFListSoundFont } from "./types";
import { SFListParseError } from "./errors";

/**
 * Parses an integer from a string.
 * @param str - The string to parse.
 * @param end - Output parameter for the end position.
 * @returns The parsed integer.
 */
function parseInt(str: string, end: { value: number }): number {
    let result = 0;
    let i = end.value;
    while (i < str.length && /\d/.test(str[i])) {
        result = result * 10 + (str.charCodeAt(i) - 48);
        i++;
    }
    end.value = i;
    return result;
}

/**
 * Parses a floating-point number from a string.
 * @param str - The string to parse.
 * @param end - Output parameter for the end position.
 * @returns The parsed float.
 */
function parseFloat(str: string, end: { value: number }): number {
    let sign = 1;
    let i = end.value;
    const start = i;

    if (i < str.length && str[i] === "-") {
        sign = -1;
        i++;
    }

    const whole = parseInt(str, end);

    if (
        i === end.value ||
        (str[i] !== "." && i < str.length && str[i] !== "&" && str[i] !== "|")
    ) {
        end.value = start;
        return 0;
    }

    i = end.value;
    if (i < str.length && str[i] === ".") {
        i++;
        end.value = i;
        const decimal = parseInt(str, end);
        if (i === end.value) {
            end.value = start;
            return 0;
        }
        const decimalPlaces = end.value - i;
        return (whole + decimal / Math.pow(10, decimalPlaces)) * sign;
    }

    end.value = start;
    return 0;
}

/**
 * Parses a channel specification (e.g., "1", "1-16", "1,2,3").
 * @param str - The string to parse.
 * @param start - Starting position.
 * @param end - Output parameter for the end position.
 * @param line - Current line number for error reporting.
 * @returns Array of channel numbers (1-48).
 * @throws SFListParseError if parsing fails.
 */
function parseChannels(
    str: string,
    start: number,
    end: { value: number },
    line: number
): number[] {
    const channels: number[] = [];
    let i = start;

    while (i < str.length && str[i] !== "&" && str[i] !== "|") {
        const channelLow = parseInt(str, end);
        i = end.value;

        if (
            i === start ||
            (str[i] !== "-" &&
                str[i] !== "&" &&
                str[i] !== "|" &&
                str[i] !== ",")
        ) {
            throw new SFListParseError("Invalid channel number", line, i + 1);
        }

        let channelHigh = channelLow;
        if (str[i] === "-") {
            i++;
            end.value = i;
            channelHigh = parseInt(str, end);
            i = end.value;

            if (
                i === start ||
                (str[i] !== "&" && str[i] !== "|" && str[i] !== ",")
            ) {
                throw new SFListParseError(
                    "Invalid channel range end value",
                    line,
                    i + 1
                );
            }
        }

        if (str[i] === ",") {
            i++;
            end.value = i;
        }

        for (let c = channelLow; c <= channelHigh; c++) {
            if (c < 1 || c > 64) {
                throw new SFListParseError(
                    `Channel ${c} is out of range (1-64)`,
                    line,
                    i + 1
                );
            }
            if (!channels.includes(c)) {
                channels.push(c);
            }
            continue;
        }
    }

    return channels;
}

/**
 * Parses a patch mapping specification (e.g., "0", "0=0,0").
 * @param str - The string to parse.
 * @param start - Starting position.
 * @param end - Output parameter for the end position.
 * @param line - Current line number for error reporting.
 * @returns Patch mapping object with source and destination.
 * @throws SFListParseError if parsing fails.
 */
function parsePatchMapping(
    str: string,
    start: number,
    end: { value: number },
    line: number
): {
    destination: { bank?: number; program?: number };
    source?: { bank?: number; program?: number };
} {
    let sourceBank: number | undefined = undefined;
    let sourceProgram: number | undefined = undefined;
    let destBank: number | undefined = undefined;
    let destProgram: number;

    // Parse destination program (required)
    const val = parseInt(str, end);
    let i = end.value;

    if (
        i === start ||
        (str[i] !== "=" && str[i] !== "," && str[i] !== "|" && str[i] !== "&")
    ) {
        throw new SFListParseError("Invalid preset number", line, i + 1);
    }

    destProgram = val;

    // Check for destination bank
    if (str[i] === ",") {
        destBank = val;
        end.value = i + 1;
        const newProgram = parseInt(str, end);
        i = end.value;

        if (
            i === start ||
            (str[i] !== "=" && str[i] !== "|" && str[i] !== "&")
        ) {
            throw new SFListParseError("Invalid preset number", line, i + 1);
        }

        destProgram = newProgram;
    }

    // Check for source specification
    if (str[i] === "=") {
        end.value = i + 1;
        const sourceVal = parseInt(str, end);
        i = end.value;

        if (
            i === start ||
            (str[i] !== "," && str[i] !== "|" && str[i] !== "&")
        ) {
            throw new SFListParseError("Invalid preset number", line, i + 1);
        }

        sourceProgram = sourceVal;

        // Check for source bank
        if (str[i] === ",") {
            sourceBank = sourceVal;
            end.value = i + 1;
            const newSourceProgram = parseInt(str, end);
            i = end.value;

            if (i === start || (str[i] !== "|" && str[i] !== "&")) {
                throw new SFListParseError(
                    "Invalid preset number",
                    line,
                    i + 1
                );
            }

            sourceProgram = newSourceProgram;
        }
    }

    const result: {
        destination: { bank?: number; program?: number };
        source?: { bank?: number; program?: number };
    } = {
        destination: { program: destProgram }
    };

    if (destBank !== undefined) {
        result.destination.bank = destBank;
    }

    if (sourceProgram !== undefined) {
        result.source = { program: sourceProgram };
        if (sourceBank !== undefined) {
            result.source.bank = sourceBank;
        }
    }

    return result;
}

/**
 * Parses legacy SFList format to JSON structure.
 * @param text - The legacy SFList text.
 * @returns Parsed SFList JSON structure.
 * @throws SFListParseError if parsing fails.
 */
export function parseLegacySFList(text: string): SFListJSON {
    const soundFonts: SFListSoundFont[] = [];
    let lineNum = 0;
    let i = 0;
    const len = text.length;

    // Handle UTF-8 BOM
    if (
        len >= 3 &&
        text.charCodeAt(0) === 0xef &&
        text.charCodeAt(1) === 0xbb &&
        text.charCodeAt(2) === 0xbf
    ) {
        i += 3;
    }

    while (i < len) {
        const lineStart = i;
        lineNum++;

        // Find end of line
        let lineEnd = i;
        while (
            lineEnd < len &&
            text[lineEnd] !== "\r" &&
            text[lineEnd] !== "\n"
        ) {
            lineEnd++;
        }

        let pipeIndex = -1;
        for (let j = i; j < lineEnd; j++) {
            if (text[j] === "|") {
                pipeIndex = j;
                break;
            }
        }

        const pathStart = pipeIndex >= 0 ? pipeIndex + 1 : i;
        const pathEnd = lineEnd;

        let channels: number[] | undefined = undefined;
        let patchMappings: SFListSoundFont["patchMappings"] = undefined;
        let gain: number | undefined = undefined;

        if (pipeIndex >= 0) {
            const flagEnd = pipeIndex;
            let ptr = i;

            while (ptr < flagEnd) {
                // Skip ampersands
                if (text[ptr] === "&") {
                    ptr++;
                    continue;
                }

                let fieldEnd = ptr;
                while (fieldEnd < flagEnd && text[fieldEnd] !== "&") {
                    fieldEnd++;
                }

                const flagChar = text[ptr];
                ptr++;

                const endPos = { value: ptr };

                switch (flagChar) {
                    case "c": {
                        const thisChannels = parseChannels(
                            text,
                            ptr,
                            endPos,
                            lineNum
                        );
                        if (channels === undefined) {
                            channels = thisChannels;
                        } else {
                            // Merge channels (deduplicate and sort)
                            for (const ch of thisChannels) {
                                if (!channels.includes(ch)) {
                                    channels.push(ch);
                                }
                            }
                            channels.sort((a, b) => a - b);
                        }
                        break;
                    }

                    case "p": {
                        const mapping = parsePatchMapping(
                            text,
                            ptr,
                            endPos,
                            lineNum
                        );
                        patchMappings ??= [];
                        patchMappings.push(mapping);
                        break;
                    }

                    case "g": {
                        const val = parseFloat(text, endPos);
                        if (endPos.value <= ptr) {
                            throw new SFListParseError(
                                "Invalid gain value",
                                lineNum,
                                ptr - lineStart + 1
                            );
                        }
                        gain = val;
                        break;
                    }

                    default: {
                        throw new SFListParseError(
                            `Invalid character in preset '${flagChar}'`,
                            lineNum,
                            ptr - lineStart
                        );
                    }
                }

                ptr = endPos.value;
            }
        }

        const path = text.slice(pathStart, pathEnd).trim();
        if (path.length === 0) {
            // Empty line, skip
            i = lineEnd;
            while (i < len && (text[i] === "\n" || text[i] === "\r")) {
                i++;
            }
            continue;
        }

        const soundFont: SFListSoundFont = {
            fileName: path
        };

        if (gain !== undefined && gain !== 0) {
            soundFont.gain = gain;
        }

        if (channels !== undefined && channels.length > 0) {
            soundFont.channels = channels;
        }

        if (patchMappings !== undefined && patchMappings.length > 0) {
            soundFont.patchMappings = patchMappings;
        }

        soundFonts.push(soundFont);

        i = lineEnd;
        while (i < len && (text[i] === "\n" || text[i] === "\r")) {
            i++;
        }
    }

    return { soundFonts };
}
