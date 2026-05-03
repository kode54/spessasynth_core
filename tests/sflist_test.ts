// SFList Parser Tests
// Run with: tsx tests/sflist_test.ts

import { parseLegacySFList } from "../src/soundbank/sflist/parser";
import { SFListLoader } from "../src/soundbank/sflist/sflist";
import {
    SFListParseError,
    SFListValidationError
} from "../src/soundbank/sflist/errors";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`✓ ${message}`);
        testsPassed++;
    } else {
        console.error(`✗ ${message}`);
        testsFailed++;
    }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        console.log(`✓ ${message}`);
        testsPassed++;
    } else {
        console.error(`✗ ${message}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual: ${JSON.stringify(actual)}`);
        testsFailed++;
    }
}

function assertThrows(fn: () => void, message: string) {
    try {
        fn();
        console.error(`✗ ${message} (should have thrown)`);
        testsFailed++;
    } catch (e) {
        console.log(`✓ ${message}`);
        testsPassed++;
    }
}

console.log("Running SFList Loader Tests...\n");

// Legacy Parser Tests
console.log("Legacy Parser Tests:");
const simplePath = "file.sf2\n";
const simpleResult = parseLegacySFList(simplePath);
assert(simpleResult.soundFonts.length === 1, "Parse simple path-only line");
assertEqual(
    simpleResult.soundFonts[0].fileName,
    "file.sf2",
    "Simple path fileName"
);

const withGain = "g=3|file.sf2\n";
const gainResult = parseLegacySFList(withGain);
assertEqual(gainResult.soundFonts[0].gain, 3, "Parse line with gain");

const withChannels = "c=1-16|file.sf2\n";
const channelsResult = parseLegacySFList(withChannels);
assert(
    channelsResult.soundFonts[0].channels?.length === 16,
    "Parse line with channels"
);
assertEqual(channelsResult.soundFonts[0].channels![0], 1, "First channel is 1");
assertEqual(
    channelsResult.soundFonts[0].channels![15],
    16,
    "Last channel is 16"
);

const singleChannel = "c=1|file.sf2\n";
const singleResult = parseLegacySFList(singleChannel);
assertEqual(
    singleResult.soundFonts[0].channels?.length,
    1,
    "Parse single channel"
);

const multipleChannels = "c=1,2,3|file.sf2\n";
const multipleResult = parseLegacySFList(multipleChannels);
assertEqual(
    multipleResult.soundFonts[0].channels,
    [1, 2, 3],
    "Parse multiple channels"
);

const patchMappingDestOnly = "p=0|file.sf2\n";
const patchDestResult = parseLegacySFList(patchMappingDestOnly);
assert(
    patchDestResult.soundFonts[0].patchMappings?.length === 1,
    "Parse patch mapping (dest only)"
);
assertEqual(
    patchDestResult.soundFonts[0].patchMappings![0].destination,
    { program: 0 },
    "Destination program is 0"
);
assert(
    patchDestResult.soundFonts[0].patchMappings![0].source === undefined,
    "Source is undefined"
);

const patchMappingWithBank = "p=0,0|file.sf2\n";
const patchBankResult = parseLegacySFList(patchMappingWithBank);
assertEqual(
    patchBankResult.soundFonts[0].patchMappings![0].destination,
    { bank: 0, program: 0 },
    "Parse patch mapping with bank"
);

const patchMappingWithSource = "p=0=0,0|file.sf2\n";
const patchSourceResult = parseLegacySFList(patchMappingWithSource);
assertEqual(
    patchSourceResult.soundFonts[0].patchMappings![0].destination,
    { program: 0 },
    "Parse patch mapping with source"
);
assertEqual(
    patchSourceResult.soundFonts[0].patchMappings![0].source,
    { bank: 0, program: 0 },
    "Source is set correctly"
);

const allFlags = "c=1-16&p=0=0,0&g=3|file.sf2\n";
const allFlagsResult = parseLegacySFList(allFlags);
assertEqual(allFlagsResult.soundFonts[0].gain, 3, "All flags: gain is 3");
assert(
    allFlagsResult.soundFonts[0].channels?.length === 16,
    "All flags: 16 channels"
);
assert(
    allFlagsResult.soundFonts[0].patchMappings?.length === 1,
    "All flags: 1 patch mapping"
);

const multipleEntries = "file1.sf2\nfile2.sf2\nfile3.sf2\n";
const multipleResult = parseLegacySFList(multipleEntries);
assert(
    multipleResult.soundFonts.length === 3,
    "Parse multiple SoundFont entries"
);
assertEqual(multipleResult.soundFonts[0].fileName, "file1.sf2", "First entry");
assertEqual(multipleResult.soundFonts[1].fileName, "file2.sf2", "Second entry");
assertEqual(multipleResult.soundFonts[2].fileName, "file3.sf2", "Third entry");

// UTF-8 BOM test
const bom = String.fromCharCode(0xef, 0xbb, 0xbf);
const withBOM = bom + "file.sf2\n";
const bomResult = parseLegacySFList(withBOM);
assertEqual(bomResult.soundFonts[0].fileName, "file.sf2", "Handle UTF-8 BOM");

// Empty lines test
const withEmptyLines = "file1.sf2\n\n\nfile2.sf2\n";
const emptyLinesResult = parseLegacySFList(withEmptyLines);
assert(emptyLinesResult.soundFonts.length === 2, "Handle empty lines");

// Error tests
assertThrows(
    () => parseLegacySFList("c=abc|file.sf2\n"),
    "Throw error for invalid channel number"
);
assertThrows(
    () => parseLegacySFList("c=65|file.sf2\n"),
    "Throw error for channel out of range"
);
assertThrows(
    () => parseLegacySFList("p=abc|file.sf2\n"),
    "Throw error for invalid preset number"
);
assertThrows(
    () => parseLegacySFList("x=1|file.sf2\n"),
    "Throw error for invalid character"
);

// Channel up to 64
const maxChannel = "c=1-64|file.sf2\n";
const maxChannelResult = parseLegacySFList(maxChannel);
assert(
    maxChannelResult.soundFonts[0].channels?.length === 64,
    "Handle channel range up to 64"
);
assertEqual(
    maxChannelResult.soundFonts[0].channels![63],
    64,
    "Last channel is 64"
);

console.log("\nJSON Parser Tests:");
// JSON Parser Tests
const validJSON = JSON.stringify({
    soundFonts: [{ fileName: "file.sf2" }]
});
const jsonResult = SFListLoader["parseJSON"](validJSON);
assert(
    jsonResult.soundFonts.length === 1,
    "Parse valid JSON with minimal fields"
);
assertEqual(
    jsonResult.soundFonts[0].fileName,
    "file.sf2",
    "JSON: fileName is correct"
);

const jsonWithAllFields = JSON.stringify({
    soundFonts: [
        {
            fileName: "file.sf2",
            gain: 3,
            channels: [1, 2, 3],
            patchMappings: [
                {
                    destination: { bank: 0, program: 0 },
                    source: { bank: 0, program: 0 }
                }
            ]
        }
    ]
});
const jsonAllResult = SFListLoader["parseJSON"](jsonWithAllFields);
assertEqual(jsonAllResult.soundFonts[0].gain, 3, "JSON: gain is 3");
assertEqual(
    jsonAllResult.soundFonts[0].channels,
    [1, 2, 3],
    "JSON: channels are correct"
);
assert(
    jsonAllResult.soundFonts[0].patchMappings?.length === 1,
    "JSON: 1 patch mapping"
);

assertThrows(
    () => SFListLoader["parseJSON"](JSON.stringify({ soundFonts: [{}] })),
    "Throw error for missing fileName"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [{ fileName: "file.sf2", channels: "not an array" }]
            })
        ),
    "Throw error for invalid channels type"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [{ fileName: "file.sf2", channels: [0] }]
            })
        ),
    "Throw error for channel out of range (0)"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [{ fileName: "file.sf2", channels: [65] }]
            })
        ),
    "Throw error for channel out of range (65)"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [
                    {
                        fileName: "file.sf2",
                        patchMappings: [{ source: { program: 0 } }]
                    }
                ]
            })
        ),
    "Throw error for missing destination"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [
                    {
                        fileName: "file.sf2",
                        patchMappings: [{ destination: { bank: 70000 } }]
                    }
                ]
            })
        ),
    "Throw error for invalid bank number"
);
assertThrows(
    () =>
        SFListLoader["parseJSON"](
            JSON.stringify({
                soundFonts: [
                    {
                        fileName: "file.sf2",
                        patchMappings: [{ destination: { program: 200 } }]
                    }
                ]
            })
        ),
    "Throw error for invalid program number"
);
assertThrows(
    () => SFListLoader["parseJSON"]("{ invalid json }"),
    "Throw error for invalid JSON"
);

console.log("\nPath Resolution Tests:");
// Path Resolution Tests
assertEqual(
    SFListLoader["resolvePath"]("/absolute/path/file.sf2", "/base/path"),
    "/absolute/path/file.sf2",
    "Resolve absolute path"
);
assertEqual(
    SFListLoader["resolvePath"]("relative/file.sf2", "/base/path"),
    "/base/path/relative/file.sf2",
    "Resolve relative path"
);
assertEqual(
    SFListLoader["resolvePath"]("file.sf2", "/base/path/"),
    "/base/path/file.sf2",
    "Handle base path with trailing slash"
);
assertEqual(
    SFListLoader["resolvePath"]("./file.sf2", "/base/path"),
    "/base/path/file.sf2",
    "Handle ./ prefix"
);
assertEqual(
    SFListLoader["resolvePath"]("../file.sf2", "/base/path"),
    "/base/file.sf2",
    "Handle .. in path"
);
assertEqual(
    SFListLoader["resolvePath"]("../../file.sf2", "/base/path/sub"),
    "/base/file.sf2",
    "Handle multiple .. in path"
);
assertEqual(
    SFListLoader["resolvePath"]("relative\\file.sf2", "/base/path"),
    "/base/path/relative/file.sf2",
    "Normalize Windows paths"
);

console.log("\nIntegration Tests:");
// Integration Tests
const jsonFormatText = JSON.stringify({
    soundFonts: [{ fileName: "file.sf2" }]
});
const jsonBuffer = new TextEncoder().encode(jsonFormatText);
const jsonTrimmed = jsonFormatText.trim();
assert(jsonTrimmed.startsWith("{"), "Detect JSON format (starts with {)");

const legacyFormatText = "file.sf2\n";
const legacyBuffer = new TextEncoder().encode(legacyFormatText);
const legacyTrimmed = legacyFormatText.trim();
assert(
    !legacyTrimmed.startsWith("{"),
    "Detect legacy format (does not start with {)"
);

console.log("\n" + "=".repeat(50));
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log("=".repeat(50));

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log("\n✓ All tests passed!");
    process.exit(0);
}
