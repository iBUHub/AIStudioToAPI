/**
 * File: src/utils/AudioUtils.js
 * Description: Helpers for decoding Gemini audio responses and packaging raw PCM as WAV
 */

const DEFAULT_PCM_BITS_PER_SAMPLE = 16;
const DEFAULT_PCM_CHANNELS = 1;
const DEFAULT_PCM_SAMPLE_RATE = 24000;

function extractGeminiInlineAudio(googleResponse) {
    const candidates = googleResponse?.candidates;
    if (!Array.isArray(candidates)) {
        throw new Error("Gemini response did not contain an audio candidate.");
    }

    let foundInlineData = false;
    for (const candidate of candidates) {
        const parts = candidate?.content?.parts;
        if (!Array.isArray(parts)) continue;

        for (const part of parts) {
            const inlineData = part?.inlineData;
            if (!inlineData || typeof inlineData !== "object") continue;
            foundInlineData = true;

            if (
                typeof inlineData.mimeType === "string" &&
                inlineData.mimeType.toLowerCase().startsWith("audio/") &&
                typeof inlineData.data === "string" &&
                inlineData.data.length > 0
            ) {
                return {
                    data: inlineData.data,
                    mimeType: inlineData.mimeType,
                };
            }
        }
    }

    if (foundInlineData) {
        throw new Error("Gemini response contained malformed inline audio data.");
    }
    throw new Error("Gemini response did not contain inline audio data.");
}

function decodeBase64Audio(data) {
    const compactData = data.replace(/\s/g, "");
    if (
        compactData.length === 0 ||
        compactData.length % 4 === 1 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(compactData) ||
        (compactData.includes("=") && compactData.length % 4 !== 0) ||
        (compactData.includes("=") && compactData.indexOf("=") < compactData.length - 2)
    ) {
        throw new Error("Gemini response contained invalid base64 audio data.");
    }

    const audioBuffer = Buffer.from(compactData, "base64");
    const canonicalInput = compactData.replace(/=+$/, "");
    const canonicalDecoded = audioBuffer.toString("base64").replace(/=+$/, "");
    if (audioBuffer.length === 0 || canonicalInput !== canonicalDecoded) {
        throw new Error("Gemini response contained invalid base64 audio data.");
    }

    return audioBuffer;
}

function parseMimeParameters(parameterParts) {
    const parameters = new Map();
    for (const part of parameterParts) {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) continue;
        const key = part.slice(0, separatorIndex).trim().toLowerCase();
        const value = part
            .slice(separatorIndex + 1)
            .trim()
            .replace(/^"|"$/g, "");
        if (key) parameters.set(key, value);
    }
    return parameters;
}

function parsePcmMimeType(mimeType) {
    if (typeof mimeType !== "string" || /[\r\n]/.test(mimeType)) {
        throw new Error("Gemini response contained an invalid audio MIME type.");
    }

    const [rawMediaType, ...parameterParts] = mimeType.split(";");
    const mediaType = rawMediaType.trim().toLowerCase();
    const subtypeMatch = mediaType.match(/^audio\/l(\d+)$/);
    const supportedPcmMediaTypes = new Set(["audio/pcm", "audio/raw", "audio/x-pcm", "audio/x-raw"]);
    if (!subtypeMatch && !supportedPcmMediaTypes.has(mediaType)) {
        throw new Error(`Unsupported Gemini audio MIME type: ${rawMediaType.trim() || "unknown"}.`);
    }

    const parameters = parseMimeParameters(parameterParts);
    const codec = parameters.get("codec");
    if (codec && !["lpcm", "pcm"].includes(codec.toLowerCase())) {
        throw new Error(`Unsupported Gemini audio codec: ${codec}.`);
    }

    const bitsPerSampleValue = subtypeMatch?.[1] || parameters.get("bits") || DEFAULT_PCM_BITS_PER_SAMPLE;
    const channelsValue = parameters.get("channels") || DEFAULT_PCM_CHANNELS;
    const sampleRateValue = parameters.get("rate") || DEFAULT_PCM_SAMPLE_RATE;
    const bitsPerSample = Number(bitsPerSampleValue);
    const channels = Number(channelsValue);
    const sampleRate = Number(sampleRateValue);

    if (!Number.isInteger(bitsPerSample) || bitsPerSample <= 0 || bitsPerSample > 32 || bitsPerSample % 8 !== 0) {
        throw new Error("Gemini response contained an invalid PCM bit depth.");
    }
    if (!Number.isInteger(channels) || channels <= 0 || channels > 65535) {
        throw new Error("Gemini response contained an invalid PCM channel count.");
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0 || sampleRate > 0xffffffff) {
        throw new Error("Gemini response contained an invalid PCM sample rate.");
    }

    return {
        bitsPerSample,
        channels,
        contentType: `audio/L${bitsPerSample};codec=pcm;rate=${sampleRate}${
            channels === DEFAULT_PCM_CHANNELS ? "" : `;channels=${channels}`
        }`,
        sampleRate,
    };
}

function wrapPcmInWav(pcmBuffer, metadata) {
    const { bitsPerSample, channels, sampleRate } = metadata;
    const blockAlign = (channels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    if (blockAlign > 0xffff || byteRate > 0xffffffff || pcmBuffer.length > 0xffffffff - 44) {
        throw new Error("Gemini PCM audio metadata exceeds WAV format limits.");
    }
    if (pcmBuffer.length % blockAlign !== 0) {
        throw new Error("Gemini PCM audio length is not aligned to its sample format.");
    }

    const paddingLength = pcmBuffer.length % 2;
    const wavBuffer = Buffer.alloc(44 + pcmBuffer.length + paddingLength);

    wavBuffer.write("RIFF", 0, "ascii");
    wavBuffer.writeUInt32LE(wavBuffer.length - 8, 4);
    wavBuffer.write("WAVE", 8, "ascii");
    wavBuffer.write("fmt ", 12, "ascii");
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(channels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(byteRate, 28);
    wavBuffer.writeUInt16LE(blockAlign, 32);
    wavBuffer.writeUInt16LE(bitsPerSample, 34);
    wavBuffer.write("data", 36, "ascii");
    wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
    pcmBuffer.copy(wavBuffer, 44);

    return wavBuffer;
}

function isWavMimeType(mimeType) {
    const mediaType = String(mimeType).split(";", 1)[0].trim().toLowerCase();
    return mediaType === "audio/wav" || mediaType === "audio/wave" || mediaType === "audio/x-wav";
}

function convertGeminiAudioResponse(googleResponse, responseFormat) {
    const inlineAudio = extractGeminiInlineAudio(googleResponse);
    const audioBuffer = decodeBase64Audio(inlineAudio.data);

    if (responseFormat === "wav" && isWavMimeType(inlineAudio.mimeType)) {
        if (
            audioBuffer.length < 12 ||
            audioBuffer.toString("ascii", 0, 4) !== "RIFF" ||
            audioBuffer.toString("ascii", 8, 12) !== "WAVE"
        ) {
            throw new Error("Gemini response contained malformed WAV audio data.");
        }
        return { audioBuffer, contentType: "audio/wav" };
    }

    const pcmMetadata = parsePcmMimeType(inlineAudio.mimeType);
    if (responseFormat === "pcm") {
        return {
            audioBuffer,
            contentType: pcmMetadata.contentType,
        };
    }

    if (responseFormat === "wav") {
        return {
            audioBuffer: wrapPcmInWav(audioBuffer, pcmMetadata),
            contentType: "audio/wav",
        };
    }

    throw new Error(`Unsupported audio response format: ${responseFormat}.`);
}

module.exports = {
    convertGeminiAudioResponse,
    decodeBase64Audio,
    extractGeminiInlineAudio,
    parsePcmMimeType,
    wrapPcmInWav,
};
